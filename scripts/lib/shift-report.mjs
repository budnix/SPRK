import { performance } from 'node:perf_hooks';
import { Clock } from '../../src/core/Clock.js';
import { Interlocking } from '../../src/model/Interlocking.js';
import { DUTY_ID } from '../../src/model/duty.js';
import { simulationOptions } from '../../src/model/shift/choice.js';
import { shuntReach } from '../../src/model/scenarioCheck.js';
import { STATIONS } from '../../src/stations/index.js';
import { playShift } from '../../src/model/check/play.js';
import { unjustified, leftovers } from '../../src/model/check/outcome.js';
import { isHandled, isFinished } from '../../src/model/timetable/phase.js';
import { verdict, LINE_CODES } from './verdict.mjs';
import { FAULTS } from '../../src/model/faults/types.js';

/**
 * Raport zmiany zagranej automatem dyżurnego (`checkShift`): pętla zmiany wspólna z przeglądem silnika
 * (`src/model/check/play.js`), co takt automatu próbka przyczyn postoju pociągów (`Traffic.waitReason`), przy postoju
 * ponad 2 min – przeszkody przebiegu (`Interlocking.routeProblems`) z przypisaniem do pociągu albo usterki; migawka
 * pociągów nieobsłużonych na koniec zmiany; po zapasie – zator, naruszenia zależności, spad / rozprucie, kary wymuszone
 * usterką, stan urządzeń; na końcu werdykt (`verdict.mjs`). Bez wątków i wyjścia – testuje go
 * tests/scenario-check.test.js, używają go automat sprawdzający, testy przebiegów scenariuszy i testy służby.
 */

const SAMPLE = 2;
const EPISODE = 2 * 60;
const BLOCK_CODES = new Set(['phone-ask', 'phone-sz', 'pwl', 'no-permission', 'po-blocked', 'line-occupied', 'line-inbound', 'sbl-direction']);
const EVENT_CODES = new Set(['spad', 'rozprucie', 'track-defect']);
const ROUTE_CODES = new Set(['no-route', 'signal-stop', 'route-setting']);
const OWN_POSITION_CODES = new Set(['point-position', 'derailer-position']);

export const same = (a, b) => String(a) === String(b);

/** Służba `duty` (`{ start, minutes, srk? }`) dla ziarna `seed` – tak samo jak w grze (`src/model/shift/choice.js`). */
export const dutyScenario = (station, duty, seed) =>
  simulationOptions(station, { scenario: DUTY_ID, duty: { start: duty.start, minutes: duty.minutes, month: duty.month ?? null, day: duty.day ?? null }, seed, srk: duty.srk ?? null }).scenario;
const faultRef = (f) => ({ type: f.type, target: f.target, scripted: !!f.scripted });

// opóźnienie wniesione bez winy dyżurnego i planowa obsługa przesunięta o nie – reguły oceny (`Traffic`)
const inboundLag = (sim, e) => sim.traffic.inboundLag(e);
const unitLag = (sim, e) => sim.traffic.unitLag(e);
const expectedDone = (sim, e) => sim.traffic.expectedDone(e);

/** Gdzie jest pociąg (dane, bez tekstu). */
function whereOf(sim, e) {
  const tr = e.train;
  if (!tr) return e.from && !e.dispatched ? { at: 'neighbour', exit: e.from, neighbour: sim.blocks.get(e.from)?.neighbour ?? e.from } : { at: 'none' };
  if (tr.finished) return { at: 'gone' };
  if (!tr.entered) return { at: 'line', exit: e.from ?? null };
  const sections = [...tr.occupiedSections()];
  const track = sections.map((s) => sim.ilk.sections.get(s)?.track).find((k) => k != null);
  const next = tr.nextSignal() ?? null;
  const aspect = next ? sim.ilk.signals.get(next)?.aspect : null;
  return {
    at: 'station', track: track != null ? String(track) : null, sections: sections.slice(0, 4), nextSignal: next, mode: tr.mode,
    moving: tr.v > 0, state: tr.state, proceed: !!aspect && Interlocking.isProceed(aspect), stoppedSince: tr.stoppedSince ?? null,
  };
}

/**
 * Obserwator zmiany: próbki co takt automatu (przyczyny postoju, czas obsłużenia, odjazd pociągu stojącego od początku
 * zmiany, które usterki dotknęły których pociągów), diagnozy długich postojów, kto zajmował tor planowy pociągu
 * przyjętego na inny tor, migawka w chwili końca zmiany. Tylko odczyt stanu symulacji.
 */
class ShiftProbe {
  constructor(sim) {
    this.sim = sim;
    this.log = [];
    sim.bus.on('log', (m) => this.log.push({ time: m.time, msg: m.msg, nr: m.nr ?? null }));
    // przyjęcie na inny tor: kto w tej chwili zajmuje tor planowy (pociąg, przebieg, zamknięcie)
    this.wrongAt = new Map();
    sim.bus.on('score', (ev) => { if (ev.code === 'wrong-track' && ev.nr != null) this.wrongAt.set(String(ev.nr), this.trackHolder(ev.nr)); });
    this.trainRoutes = sim.ilk.routeList().filter((r) => r.kind === 'train');
    this.per = new Map();
    this.exposure = new Map(); // usterka (wpis sim.faults.list) → numery pociągów, których dotknęła
    this.end = null;
  }

  #of(e) {
    const k = String(e.nr);
    let x = this.per.get(k);
    if (!x) { x = { waits: new Map(), cur: null, faultSec: 0, doneAt: null, movedAt: null, episodes: [] }; this.per.set(k, x); }
    return x;
  }

  #touch(f, nr) {
    let s = this.exposure.get(f);
    if (!s) this.exposure.set(f, (s = new Set()));
    s.add(String(nr));
  }

  touched(nr) {
    return [...this.exposure].filter(([, s]) => s.has(String(nr))).map(([f]) => faultRef(f));
  }

  #occupancy() {
    const occ = new Map();
    for (const tr of this.sim.traffic.trains) if (!tr.finished) for (const s of tr.occupiedSections()) if (!occ.has(s)) occ.set(s, tr.nr);
    return occ;
  }

  /** Kto zajmuje tor planowy pociągu `nr`: pociąg na jego odcinku, przebieg na niego (i jego pociąg), zamknięcie. */
  trackHolder(nr) {
    const sim = this.sim, ilk = sim.ilk;
    const e = sim.traffic.timetable().find((x) => same(x.nr, nr));
    if (!e || e.track == null) return null;
    const secs = new Set([...ilk.sections.values()].filter((s) => same(s.track, e.track)).map((s) => s.id));
    const occ = this.#occupancy();
    for (const [s, n] of occ) if (secs.has(s) && !same(n, nr)) return { train: n };
    for (const set of ilk.routesSet()) {
      if (set.state === 'setting' || !set.route.sections.some((s) => secs.has(s))) continue;
      const n = this.#trainOfRoute(set.id, occ);
      if (n != null && same(n, nr)) continue;
      return { route: set.id, ...(n != null ? { train: n } : {}) };
    }
    if ([...secs].some((s) => ilk.sections.get(s)?.closed)) return { closed: true };
    return null;
  }

  /**
   * Dlaczego pociąg stoi (dane) albo null. Jak `Traffic.waitReason`, a ponadto: pociąg jeszcze u sąsiada po planowym
   * wyprawieniu (`neighbour-wait`) i pociąg ze składu, którego skład nie przyszedł (`unit-wait`). Nie liczy się
   * pociąg obsłużony ani postój do planowego odjazdu (także pociągu stojącego od początku zmiany – silnik widzi go
   * jako zatrzymanego).
   */
  reason(e, t) {
    const sim = this.sim;
    if (isHandled(e)) return null;
    if (e.depTime != null && t < e.depTime && (e.actualArr != null || !e.from)) return null;
    const r = sim.traffic.waitReason(e, t);
    if (r) return { code: r.code, signal: r.signal ?? null, neighbour: r.neighbour ?? null };
    if (e.from && !e.dispatched && t > e.neighbourDep + 60) return { code: 'neighbour-wait', signal: null, neighbour: sim.blocks.get(e.from)?.neighbour ?? e.from, exit: e.from, requested: !!e.requested };
    // skład nie przyszedł: liczy się dopiero po odjeździe przesuniętym o opóźnienie składu od sąsiada (expectedDone)
    if (e.unit != null && !e.train && t > (expectedDone(sim, e) ?? Infinity)) return { code: 'unit-wait', signal: null, unit: e.unit };
    return null;
  }

  /** Przebiegi pociągowe od sygnalizatora, na które czeka pociąg: na jego tor planowy albo szlak (inaczej wszystkie). */
  routesFor(e, signal) {
    const ilk = this.sim.ilk;
    const cands = this.trainRoutes.filter((x) => x.start === signal);
    const want = cands.filter((x) => (e.to && x.exit === e.to) || (e.track != null && same(ilk.sections.get(x.sections.at(-1))?.track, e.track)));
    return want.length ? want : cands;
  }

  /** Czynne usterki, przez które pociąg stoi z przyczyną `r`. */
  #faultsOn(e, r, active) {
    const out = [];
    let routes = null;
    for (const f of active) {
      switch (FAULTS[f.type]?.target) {
        case 'signal':
          if (r.signal === f.target) out.push(f);
          break;
        case 'block':
          if ((f.target === e.to && BLOCK_CODES.has(r.code)) || (f.target === e.from && r.code === 'neighbour-wait')) out.push(f);
          break;
        default:
          if (!ROUTE_CODES.has(r.code)) break;
          routes ??= this.routesFor(e, r.signal);
          if (routes.some((rt) => (FAULTS[f.type]?.target === 'point' ? [...rt.points, ...rt.flank].some((p) => p.id === f.target) : rt.sections.includes(f.target) || (rt.overlap || []).includes(f.target)))) out.push(f);
      }
    }
    return out;
  }

  /** Czy usterka dotyka pociągu, choć ten nie stoi: jedzie przez jej element, do jej semafora albo przez jej szlak. */
  #present(f, e, t) {
    const tr = e.train;
    const live = !!tr && !tr.finished;
    switch (FAULTS[f.type]?.target) {
      case 'signal': return live && tr.nextSignal() === f.target;
      case 'block':
        if (e.from === f.target && e.requested && !tr?.entered) return true;
        return live && e.to === f.target && (e.phase === 'departed' || (tr.entered && e.actualDep == null && t >= (e.depTime ?? e.arrTime ?? 0) - 120));
      case 'point': { const p = this.sim.ilk.points.get(f.target); return live && !!p && tr.occupiedSections().has(p.section); }
      default: return live && tr.occupiedSections().has(f.target);
    }
  }

  /** Próbka stanu – wołana co takt automatu. */
  sample() {
    const sim = this.sim, t = sim.clock.time;
    const active = sim.faults.list.filter((f) => f.active);
    for (const e of sim.traffic.timetable()) {
      const x = this.#of(e);
      if (x.doneAt == null && isHandled(e)) x.doneAt = t;
      const tr = e.train;
      // pociąg stojący od początku zmiany rusza bez zdarzenia „odjazd” (actualDep zostaje puste) – odjazd z obserwacji
      if (x.movedAt == null && e.startOn && !e.from && e.actualDep == null && tr && !tr.finished && tr.mode === 'train' && tr.v > 0) x.movedAt = t;
      for (const f of active) if (this.#present(f, e, t)) this.#touch(f, e.nr);
      const r = this.reason(e, t);
      if (!r) { x.cur = null; continue; }
      const faults = this.#faultsOn(e, r, active);
      for (const f of faults) this.#touch(f, e.nr);
      if (faults.length) x.faultSec += SAMPLE;
      const key = `${r.code}@${r.signal ?? r.exit ?? ''}`;
      const w = x.waits.get(key) ?? { code: r.code, signal: r.signal, neighbour: r.neighbour ?? null, sec: 0, faultSec: 0, from: t, to: t };
      w.sec += SAMPLE; w.to = t;
      if (faults.length) w.faultSec += SAMPLE;
      x.waits.set(key, w);
      if (!x.cur || x.cur.key !== key) x.cur = { key, since: t, diag: false };
      else if (!x.cur.diag && t - x.cur.since >= EPISODE) {
        x.cur.diag = true;
        x.episodes.push({ ...r, since: x.cur.since, at: t, faults: faults.map(faultRef), blockers: this.blockers(e, r) });
      }
    }
  }

  /**
   * Przeszkody przebiegów, na które czeka pociąg (`no-route` / `signal-stop`): kod, element (odcinek, zwrotnica,
   * szlak), a jeśli da się ustalić – pociąg, który ją powoduje (zajmuje odcinek albo ma na nim przebieg nastawiony lub
   * nastawiany, `by` – ten przebieg), albo usterka. `own` – położenie zwrotnicy / wykolejnicy własnego przebiegu
   * (nastawnia mechaniczna), które dyżurny ustawia sam – nie przeszkoda z zewnątrz.
   */
  blockers(e, r) {
    if (!ROUTE_CODES.has(r.code)) return [];
    const sim = this.sim, ilk = sim.ilk, t = sim.clock.time;
    if (r.code === 'route-setting') {
      // przebieg w nastawianiu: czeka na zwrotnice (przestawianie, brak kontroli – np. usterka napędu)
      const from = ilk.routeFrom(r.signal), pend = from?.state === 'setting' ? from : null;
      return (pend ? [...pend.route.points, ...pend.route.flank] : []).map((q) => ({ q, p: ilk.points.get(q.id) }))
        .filter(({ q, p }) => p && (p.moving || !p.control || p.position !== q.position))
        .map(({ q, p }) => ({ route: pend.route.id, code: 'point', point: q.id, msg: `Zwrotnica ${q.id} ${p.moving ? 'w trakcie przestawiania' : 'bez kontroli położenia'}`, ...(p.faultUntil > t ? { fault: 'point-control' } : {}), ...(p.moving && !(p.faultUntil > t) ? { own: true } : {}) }));
    }
    const occ = this.#occupancy();
    const out = [];
    const seen = new Set();
    for (const route of this.routesFor(e, r.signal).slice(0, 3)) {
      for (const p of ilk.routeProblems(route)) {
        if (p.code === 'signal-busy' || p.code === 'setting') continue;
        const b = { route: route.id, code: p.code, msg: p.msg };
        if (OWN_POSITION_CODES.has(p.code)) b.own = true;
        if (p.section) b.section = p.section;
        if (p.point) b.point = p.point;
        if (p.route) { b.by = p.route; const nr = this.#trainOfRoute(p.route, occ); if (nr != null) b.train = nr; }
        if (p.section && (p.code === 'section-occupied' || p.code === 'overlap') && b.train == null) {
          if (occ.has(p.section)) b.train = occ.get(p.section);
          else { const s = ilk.sections.get(p.section); const f = s?.axleFault ? 'axle-counter' : s?.forced ? 'false-occupancy' : s?.defect ? 'track-defect' : null; if (f) b.fault = f; }
        }
        if (p.point && ilk.points.get(p.point)?.faultUntil > t) b.fault = 'point-control';
        if (p.code === 'block') { b.exit = p.exit; b.gate = p.gate; }
        if (b.train != null && same(b.train, e.nr)) { delete b.train; if (b.by) b.own = true; }
        const key = `${b.code}|${b.section ?? b.point ?? b.exit ?? ''}|${b.train ?? ''}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(b);
        if (out.length >= 6) return out;
      }
    }
    return out;
  }

  /** Pociąg przebiegu `routeId` (czynnego albo w nastawianiu): zajmuje jego odcinek albo stoi przed jego semaforem. */
  #trainOfRoute(routeId, occ) {
    const ilk = this.sim.ilk;
    const set = ilk.routeInfo(routeId);
    if (set && set.state !== 'setting') for (const s of set.route.sections) if (occ.has(s)) return occ.get(s);
    const route = set?.route ?? ilk.routes.get(routeId);
    if (!route) return null;
    return this.sim.traffic.timetable().find((o) => o.train && !o.train.finished && o.train.nextSignal() === route.start)?.nr ?? null;
  }

  /** Pociąg nieobsłużony: gdzie stoi, od kiedy, dlaczego, co blokuje, kto jest na szlaku, ostatnie wpisy dziennika. */
  standing(e, t) {
    const sim = this.sim;
    const r = this.reason(e, t);
    const x = this.#of(e);
    const now = r ? this.blockers(e, r) : [];
    const lineExit = r && LINE_CODES.has(r.code) ? (r.code === 'neighbour-wait' ? e.from : e.to) : null;
    return {
      nr: e.nr, phase: e.phase, status: String(e.status), expectedDone: expectedDone(sim, e),
      where: whereOf(sim, e), since: x.cur?.since ?? e.train?.stoppedSince ?? null,
      reason: r,
      lineTrain: lineExit ? sim.blocks.get(lineExit)?.lineTrain ?? null : null,
      faults: this.touched(e.nr), // usterki, które dotknęły pociągu w czasie zmiany
      faultsNow: r ? this.#faultsOn(e, r, sim.faults.list.filter((f) => f.active)).map(faultRef) : [], // przez które stoi teraz
      // przeszkody teraz, a gdy już ich nie ma (np. zamknięcie toru właśnie minęło) – z diagnozy tego postoju
      blockers: now.length || !r ? now : x.episodes.findLast((ep) => ep.code === r.code && ep.signal === r.signal)?.blockers ?? [],
      log: this.log.filter((m) => m.nr != null && same(m.nr, e.nr)).slice(-5).map((m) => ({ time: m.time, msg: m.msg })),
    };
  }

  /** Migawka w chwili końca zmiany (`shift-end`): ocena i pociągi nieobsłużone. */
  snapshotEnd() {
    const sim = this.sim, t = sim.clock.time;
    const rep = sim.report();
    this.end = {
      score: rep.total, grade: rep.grade, onTime: rep.onTime, delayed: rep.delayed, delayMinutes: rep.delayMinutes,
      byCode: rep.byCode.map(({ code, n, points }) => ({ code, n, points })),
      unfinished: sim.traffic.timetable().filter((e) => !isHandled(e)).map((e) => this.standing(e, t)),
    };
  }
}

/** Przedział planowego postoju pociągu na torze (s): od przyjazdu do odjazdu; kończący bieg – do odjazdu następcy / końca. */
function plannedStay(tt, e, end) {
  const a = e.arrTime ?? e.depTime ?? null;
  let b = e.depTime ?? e.arrTime ?? null;
  if (!e.to) b = tt.find((x) => x.unit != null && same(x.unit, e.nr))?.depTime ?? end ?? b;
  return a == null || b == null ? null : [a, b];
}

/**
 * Jedna zmiana z automatem i raport (zwykły obiekt – przechodzi między wątkami i do JSON). `station` – obiekt stacji
 * (np. nowa, jeszcze spoza `src/stations/index.js`) zamiast `stationId`; `scenario` – obiekt scenariusza (wariant spoza
 * stacji) zamiast `scenarioId`; `forceLevel` – poziom zamiast `disruptions` scenariusza (sonda usterek: scenariusz
 * z wymuszonym poziomem grany bez zakłóceń, żeby ocenić wpływ usterek). Czasy w sekundach od północy.
 *
 * Raport: dane zmiany (stacja, scenariusz, poziom zamówiony, użyty i poziom scenariusza `baseLevel`, srk, start, koniec
 * zmiany, chwila i powód końca, koniec przebiegu `until`), ocena w chwili końca zmiany i po zapasie, punktualność,
 * pociągi (plan i rzeczywistość przyjazdu / odjazdu, tor, opóźnienie wniesione – od sąsiada i składu – i na stacji,
 * postoje z przyczyną i diagnozą, chwila obsłużenia), pociągi nieobsłużone na koniec zmiany (`unfinished`) i po zapasie
 * (`jam`), zadania, usterki z pociągami, których dotknęły, pociągi nadzwyczajne, naruszenia, spad / rozprucie / jazda po
 * pękniętej szynie, kary wymuszone usterką, stan urządzeń po zmianie, niewykonane obowiązki blokady, inny tor (kto
 * zajmował planowy, czy plan sam go dzieli) – oraz werdykt (`verdict`).
 */
export function checkShift({ station = null, stationId = null, scenarioId = null, scenario = null, seed = 1, level = 'none', extra = 120, settle = true, forceLevel = null, duty = null }) {
  const st = station ?? STATIONS.find((s) => s.id === stationId);
  if (!st) throw new Error(`Nieznana stacja: ${stationId}`);
  // służba o wybranej porze (`duty`: { start, minutes, srk? }) – rozkład budowany dla ziarna tej zmiany, jak w grze;
  // `scenarioId` – identyfikator w raporcie (służba każdego ziarna i stanowiska to osobny scenariusz)
  const built = duty ? dutyScenario(st, duty, seed) : null;
  const sc0 = scenario ?? (built ? { ...built, id: scenarioId ?? built.id } : (st.scenarios || []).find((s) => s.id === scenarioId));
  if (!sc0) throw new Error(`Nieznany scenariusz: ${st.id}:${scenarioId}`);
  const sc = forceLevel ? { ...sc0, disruptions: forceLevel } : sc0;
  const t0 = performance.now();
  let probe = null;
  const { sim, violations, endTime } = playShift({
    station: st, scenario: sc, seed, level, extra, settle,
    onCreate: (s) => { probe = new ShiftProbe(s); },
    onTick: (s, { opTick }) => {
      if (opTick) probe.sample();
      if (s.ended && !probe.end) probe.snapshotEnd();
    },
  });
  if (!probe.end) probe.snapshotEnd(); // zmiana się nie skończyła (np. bez endTime) – stan na koniec przebiegu
  const tt = sim.traffic.timetable();
  const items = sim.score.items;
  const trains = tt.map((e) => {
    const x = probe.per.get(String(e.nr)) ?? { waits: new Map(), episodes: [] };
    const mine = items.filter((i) => i.nr != null && same(i.nr, e.nr));
    const actualDep = e.actualDep ?? x.movedAt ?? null;
    const depObserved = e.actualDep == null && x.movedAt != null;
    const waits = [...x.waits.values()].filter((w) => w.sec >= 60).sort((a, b) => b.sec - a.sec)
      .map((w) => ({ code: w.code, signal: w.signal, neighbour: w.neighbour, min: Math.round(w.sec / 60), faultMin: Math.round(w.faultSec / 60), from: w.from, to: w.to }));
    return {
      nr: e.nr, label: e.label ?? String(e.nr), from: e.from ?? null, to: e.to ?? null, arr: e.arr ?? null, dep: e.dep ?? null,
      arrTime: e.arrTime ?? null, depTime: e.depTime ?? null,
      track: e.track != null ? String(e.track) : null, actualTrack: e.actualTrack != null ? String(e.actualTrack) : null,
      actualArr: e.actualArr ?? null, actualDep, depObserved,
      // odjazd pociągu stojącego od początku zmiany po planie (silnik nie liczy go zdarzeniem „odjazd”, więc bez kary)
      obsLateMin: depObserved && e.depTime != null ? Math.max(0, Math.round((actualDep - e.depTime) / 60)) : 0,
      delayIn: e.delayIn || 0, delay: e.delay || 0, extra: !!e.extra, unit: e.unit ?? null,
      // opóźnienie wniesione bez winy dyżurnego: od sąsiada, ze składu (od sąsiada, usterki na drodze zadań)
      lagMin: Math.round(inboundLag(sim, e) / 60), unitLagMin: e.unit != null ? Math.round(unitLag(sim, e) / 60) : 0,
      phase: e.phase, status: String(e.status), done: isFinished(e), doneAt: x.doneAt ?? null,
      stationMin: mine.filter((i) => i.code === 'late-depart' || i.code === 'late-pass').reduce((a, i) => a - i.points, 0),
      lineMin: waits.filter((w) => LINE_CODES.has(w.code)).reduce((a, w) => a + w.min, 0),
      held: mine.some((i) => i.code === 'held'), wrongTrack: mine.some((i) => i.code === 'wrong-track'),
      faultMin: Math.round((x.faultSec || 0) / 60), faults: probe.touched(e.nr),
      waits,
      episodes: x.episodes,
    };
  });
  const jam = tt.filter((e) => !isFinished(e)).map((e) => {
    const j = probe.standing(e, sim.clock.time);
    // skład w manewrach z otwartym zadaniem: czy statyczny graf przebiegów manewrowych uznaje tor docelowy za osiągalny
    const task = (sim.traffic.tasks || []).find((k) => same(k.unit, e.nr) && !k.done && !k.failed) ?? (sim.traffic.tasks || []).find((k) => same(k.unit, e.nr) && !k.done);
    if (task && j.where.at === 'station' && j.where.track) j.task = { id: task.id, toTrack: String(task.toTrack), reachable: shuntReach(sim.ilk, j.where.track).has(String(task.toTrack)) };
    return j;
  });
  const pick = (codes) => items.filter((i) => codes.has(i.code)).map((i) => ({ code: i.code, time: i.time, points: i.points, msg: i.msg, nr: i.nr ?? null, ...(i.section ? { section: i.section } : {}) }));
  const end = Number.isFinite(sim.endTime) ? sim.endTime : null;
  const report = {
    station: st.id, stationName: st.name, scenario: sc0.id, scenarioName: sc0.name ?? sc0.id,
    seed, level, effectiveLevel: sim.levelId, baseLevel: sc0.disruptions ?? 'none', faultProbe: !!forceLevel,
    srk: sim.srk.short || sim.srk.name || sim.srk.id,
    startTime: sim.startTime, endTime, hasEndTime: end != null, autoEnd: sim.autoEnd,
    endedAt: sim.endedAt, endReason: sim.endReason, until: sim.clock.time,
    score: { atEnd: probe.end.score, grade: probe.end.grade, final: sim.score.total },
    punctuality: { onTime: probe.end.onTime, delayed: probe.end.delayed, delayMinutes: probe.end.delayMinutes },
    byCode: probe.end.byCode,
    trains,
    unfinished: probe.end.unfinished,
    jam,
    tasks: (sim.traffic.tasks || []).map((k) => ({
      id: k.id, unit: k.unit, toTrack: String(k.toTrack), text: k.text ?? '', deadline: k.deadlineTime,
      shiftMin: Math.round((k.shift || 0) / 60), faultShiftMin: Math.round((k.faultShift || 0) / 60),
      done: !!k.done, doneAt: k.doneAt ?? null, failed: !!k.failed, late: !!k.done && k.doneAt > k.deadlineTime,
    })),
    faults: sim.faults.list.map((f) => ({
      type: f.type, target: f.target, scripted: !!f.scripted, at: f.at, since: f.since ?? null, min: Math.round(f.duration / 60),
      done: !!f.done, active: !!f.active, trains: [...(probe.exposure.get(f) || [])],
    })),
    // godzina do pokazania (definicja pociągu po północy ma zapis „24:35”)
    extraTrains: sim.extraTrainsPlanned.map((x) => ({ nr: x.def.nr, arr: x.def.arr ? Clock.format(Clock.parse(x.def.arr)) : null, at: x.at, added: x.done })),
    violations,
    events: pick(EVENT_CODES),
    forced: unjustified(sim),
    leftovers: jam.length ? [] : leftovers(sim), // pociąg w zatorze sam trzyma przebiegi i blokady
    duties: pick(new Set(['no-dpo', 'no-depart-report'])),
    wrongTrack: pick(new Set(['wrong-track'])).map((w) => {
      const e = tt.find((x) => w.nr != null && same(x.nr, w.nr));
      const stay = e ? plannedStay(tt, e, end) : null;
      // plan sam kładzie na tor planowy inny pociąg w tym samym czasie
      const planClash = !e || !stay ? [] : tt.filter((o) => o !== e && o.track != null && same(o.track, e.track) && (o.stop || !o.to || o.startOn))
        .filter((o) => { const s = plannedStay(tt, o, end); return s && Math.min(s[1], stay[1]) > Math.max(s[0], stay[0]); }).map((o) => o.nr);
      return { ...w, holder: probe.wrongAt.get(String(w.nr)) ?? null, planClash };
    }),
  };
  // wszystko obsłużone (pociągi i wykonane zadania) – samouczek kończy się dopiero o endTime, więc zapas liczy się od tej chwili
  report.allDoneAt = trains.every((t) => t.doneAt != null) ? Math.max(report.startTime, ...trains.map((t) => t.doneAt), ...report.tasks.filter((k) => k.done).map((k) => k.doneAt)) : null;
  Object.assign(report, verdict(report));
  report.ms = Math.round(performance.now() - t0);
  return report;
}
