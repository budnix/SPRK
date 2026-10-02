#!/usr/bin/env node
/**
 * Automat sprawdzający scenariusze: gra każdą zmianę dyżurnym automatycznym w przyspieszonym cyklu (bez widoku) od
 * startu do końca zmiany plus zapas i mówi, czy scenariusz jest w porządku – do szybkiego dodawania wariantów (inna
 * długość, inny start, podzbiór pociągów, usterki) istniejących i nowych stacji.
 *
 *   npm run check -- tczew                       # wszystkie scenariusze stacji: poziomy none/low/high, ziarna 1–3
 *   npm run check -- tczew:zmiana --seeds 1 --level low --verbose
 *   npm run check                                # wszystkie stacje
 *
 * Dla każdego scenariusza:
 *  1. definicja – `validateStation` (raz na stację) i `checkScenario` (src/model/scenarioCheck.js): błędy widoczne bez
 *     grania (okno zmiany, pociągi nie do obsłużenia, kierunek jazdy, zadania, usterki, zamknięcia, rozkład za gęsty),
 *  2. przebiegi – pętla zmiany wspólna z przeglądem silnika (`playShift`, scripts/shift.mjs): co takt automatu próbka
 *     przyczyn postoju pociągów (`Traffic.waitReason`), przy postoju ponad 5 min – przeszkody przebiegu
 *     (`Interlocking.routeProblems`) z przypisaniem do pociągu albo usterki; migawka pociągów nieobsłużonych w chwili
 *     końca zmiany; po zapasie – zator, naruszenia zależności, spad / rozprucie, kary wymuszone usterką, stan urządzeń,
 *  3. werdykt zmiany (`verdict`): BŁĘDY / UWAGI / OK (+ informacje bez wpływu na ocenę) wg reguł z docs/ARCHITECTURE.md
 *     („Automat sprawdzający scenariusze”),
 *  4. ocena scenariusza: definicja, przebiegi na poziomie scenariusza (bez zakłóceń albo wymuszonym `disruptions`)
 *     i błędy z każdego poziomu; uwagi z poziomów wybieranych przez gracza – osobno, jako odporność.
 *
 * Kod wyjścia: 1 – scenariusz z oceną BŁĘDY (z `--strict` także UWAGI); 0 – inaczej; 2 – błędne opcje, nieznana
 * stacja / scenariusz. Funkcje `parseArgs`, `listChecks`, `checkShift`, `verdict`, `scenarioStatus` są czyste (bez
 * wątków i wyjścia) – testuje je `tests/scenario-check.test.js`.
 */
import { writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { Clock } from '../src/core/Clock.js';
import { DISRUPTION_LEVELS } from '../src/core/Random.js';
import { Traffic } from '../src/model/Traffic.js';
import { Interlocking } from '../src/model/Interlocking.js';
import { validateStation } from '../src/model/validate.js';
import { EXTRA_TRAIN } from '../src/model/Simulation.js';
import { checkScenario, hasErrors, LATE_SLACK, TASK_GRACE, levelSlackMin, shuntReach } from '../src/model/scenarioCheck.js';
import { STATIONS } from '../src/stations/index.js';
import { MISSIONS } from '../src/tutorial/missions.js';
import pl from '../src/i18n/pl.js';
import { unjustified, leftovers } from '../tests/fault-harness.js';
import { playShift, trainDone, defaultWorkers, parseCli, runJobs, serveJobs, executedDirectly } from './shift.mjs';

const WORKER_ROLE = 'sprk-check-worker';
/** Poziomy zakłóceń w kolejności wydruku; `--level all` = wszystkie trzy (w przeglądzie silnika `all` = high i low). */
export const LEVELS = ['none', 'low', 'high'];
/** Próbka co takt automatu (s). */
const SAMPLE = 2;
/** Postój dłuższy niż tyle (s) dostaje diagnozę przeszkód (raz na postój): kara za przetrzymanie na stacji jest od 2 min. */
const EPISODE = 2 * 60;
/** Zapas do końca zmiany (min), od którego nie ma uwagi – mniej więcej jeden postój „przetrzymany”. */
const MARGIN_MIN = 5;
/** Opóźnienie z winy stacji / postój (min), od którego jest uwaga przy zakłóceniach (na poziomie none – każda kara). */
const NOTABLE_MIN = 5;
/** Opóźnienie na stacji (min) bez zakłóceń, od którego jest błąd – plan albo automat psuje zmianę. */
const PLAN_DELAY_ERROR_MIN = 15;
/** Kody postoju, za którymi stoi szlak (przepustowość, kolejka u sąsiada), nie układ stacji. */
const LINE_CODES = new Set(['line-occupied', 'no-permission', 'po-blocked', 'line-inbound', 'sbl-direction', 'neighbour-wait']);
/** Kody odmowy blokady szlaku (`LineBlock.gate`). */
const BLOCK_CODES = new Set(['phone-ask', 'phone-sz', 'pwl', 'no-permission', 'po-blocked', 'line-occupied', 'line-inbound', 'sbl-direction']);
const EVENT_CODES = new Set(['spad', 'rozprucie', 'track-defect']);
/** Postój przed sygnalizatorem bez przebiegu albo z przebiegiem, który nie daje sygnału – przeszkody przebiegu. */
const ROUTE_CODES = new Set(['no-route', 'signal-stop', 'route-setting']);
/** Przeszkody, które usuwa sam dyżurny (położenie zwrotnicy / wykolejnicy własnego przebiegu na nastawni mechanicznej). */
const OWN_POSITION_CODES = new Set(['point-position', 'derailer-position']);
/** Usterki, których automat nie usuwa (licznik osi – brak zerowania, nawierzchnia – brak zamknięcia toru). */
const AUTOMAT_CANNOT = new Set(['axle-counter', 'track-defect']);
const FAULT_NAMES = {
  'signal-fail': 'semafora', 'route-block': 'bloku przebiegowego', 'point-control': 'napędu zwrotnicy',
  'false-occupancy': 'kontroli zajętości', 'axle-counter': 'licznika osi', 'track-defect': 'nawierzchni (pęknięta szyna)', 'block-fail': 'blokady liniowej',
};
const WORKAROUND = 'gracz użyłby sygnału zastępczego / rozkazu „S”, zerowania licznika albo innego toru';

export const USAGE = `Użycie: npm run check -- [stacja[:scenariusz] …] [opcje]

  bez stacji                  wszystkie stacje; „stacja” – wszystkie jej scenariusze (bez samouczków)
  --level none|low|high|all   poziom zakłóceń (domyślnie all = none, low i high – inaczej niż w survey);
                              scenariusz z własnym poziomem (np. szczyt = high) idzie tylko na nim
  --seeds 1-3 | 1,2           ziarna losowania (domyślnie 1-3)
  --extra <min>               zapas po końcu zmiany na dojazd opóźnionych pociągów (domyślnie 120); przebieg kończy się
                              wcześniej, gdy po końcu zmiany wszystko jest obsłużone
  --tutorial                  także samouczki (scenariusz wskazany wprost – zawsze)
  --strict                    kod wyjścia 1 także przy uwagach w definicji i na poziomie scenariusza (powtarzalnych)
  --verbose                   wszystkie uwagi, tabela pociągów, zadania i usterki każdej zmiany, dziennik nieobsłużonych
  --workers <n>               liczba wątków (domyślnie rdzenie - 1)
  --json <plik>               pełne raporty do pliku JSON
  --help                      ta pomoc

Ocena scenariusza: definicja + przebiegi na poziomie scenariusza (none albo wymuszony disruptions) + błędy z każdego
poziomu. Uwagi z poziomów wybieranych przez gracza (low, high) – wiersz „odporność”; informacje (info) – bez wpływu.`;

// ————————————————————————————————————— przebieg zmiany —————————————————————————————————————

const same = (a, b) => String(a) === String(b);
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
    for (const act of ilk.active.values()) {
      if (!act.route.sections.some((s) => secs.has(s))) continue;
      const n = this.#trainOfRoute(act.id, occ);
      if (n != null && same(n, nr)) continue;
      return { route: act.id, ...(n != null ? { train: n } : {}) };
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
    if (Traffic.isDone(e)) return null;
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
      switch (f.type) {
        case 'signal-fail': case 'route-block':
          if (r.signal === f.target) out.push(f);
          break;
        case 'block-fail':
          if ((f.target === e.to && BLOCK_CODES.has(r.code)) || (f.target === e.from && r.code === 'neighbour-wait')) out.push(f);
          break;
        default:
          if (!ROUTE_CODES.has(r.code)) break;
          routes ??= this.routesFor(e, r.signal);
          if (routes.some((rt) => (f.type === 'point-control' ? [...rt.points, ...rt.flank].some((p) => p.id === f.target) : rt.sections.includes(f.target) || (rt.overlap || []).includes(f.target)))) out.push(f);
      }
    }
    return out;
  }

  /** Czy usterka dotyka pociągu, choć ten nie stoi: jedzie przez jej element, do jej semafora albo przez jej szlak. */
  #present(f, e, t) {
    const tr = e.train;
    const live = !!tr && !tr.finished;
    switch (f.type) {
      case 'signal-fail': case 'route-block': return live && tr.nextSignal() === f.target;
      case 'block-fail':
        if (e.from === f.target && e.requested && !tr?.entered) return true;
        return live && e.to === f.target && (e.status === 'odjechał' || (tr.entered && e.actualDep == null && t >= (e.depTime ?? e.arrTime ?? 0) - 120));
      case 'point-control': { const p = this.sim.ilk.points.get(f.target); return live && !!p && tr.occupiedSections().has(p.section); }
      default: return live && tr.occupiedSections().has(f.target);
    }
  }

  /** Próbka stanu – wołana co takt automatu. */
  sample() {
    const sim = this.sim, t = sim.clock.time;
    const active = sim.faults.list.filter((f) => f.active);
    for (const e of sim.traffic.timetable()) {
      const x = this.#of(e);
      if (x.doneAt == null && Traffic.isDone(e)) x.doneAt = t;
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
      const pend = ilk.pending.find((p) => p.route.start === r.signal);
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
    const act = ilk.active.get(routeId);
    if (act) for (const s of act.lockedSections) if (occ.has(s)) return occ.get(s);
    const route = act?.route ?? ilk.pending.find((p) => p.route.id === routeId)?.route ?? ilk.routes.get(routeId);
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
      nr: e.nr, status: String(e.status), expectedDone: expectedDone(sim, e),
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
      unfinished: sim.traffic.timetable().filter((e) => !Traffic.isDone(e)).map((e) => this.standing(e, t)),
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
export function checkShift({ station = null, stationId = null, scenarioId = null, scenario = null, seed = 1, level = 'none', extra = 120, settle = true, forceLevel = null }) {
  const st = station ?? STATIONS.find((s) => s.id === stationId);
  if (!st) throw new Error(`Nieznana stacja: ${stationId}`);
  const sc0 = scenario ?? (st.scenarios || []).find((s) => s.id === scenarioId);
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
      status: String(e.status), done: trainDone(e), doneAt: x.doneAt ?? null,
      stationMin: mine.filter((i) => i.code === 'late-depart' || i.code === 'late-pass').reduce((a, i) => a - i.points, 0),
      lineMin: waits.filter((w) => LINE_CODES.has(w.code)).reduce((a, w) => a + w.min, 0),
      held: mine.some((i) => i.code === 'held'), wrongTrack: mine.some((i) => i.code === 'wrong-track'),
      faultMin: Math.round((x.faultSec || 0) / 60), faults: probe.touched(e.nr),
      waits,
      episodes: x.episodes,
    };
  });
  const jam = tt.filter((e) => !trainDone(e)).map((e) => {
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
    extraTrains: sim.extraTrainsPlanned.map((x) => ({ nr: x.def.nr, arr: x.def.arr ?? null, at: x.at, added: x.done })),
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

// ————————————————————————————————————— werdykt —————————————————————————————————————

const hm = (s) => (s == null || !Number.isFinite(s) ? '—' : Clock.format(s));
const hms = (s) => (s == null || !Number.isFinite(s) ? '—' : Clock.format(s, true));
/** Minuty i sekundy (m:ss) – zapas bez zaokrąglania w górę. */
const mmss = (s) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.floor(Math.max(0, s) % 60)).padStart(2, '0')}`;

/** Liczebnik: `plural(1, 'uwaga', 'uwagi', 'uwag')` → „1 uwaga”, 2 → „2 uwagi”, 5 → „5 uwag”. */
export function plural(n, one, few, many) {
  const a = Math.abs(n) % 100, b = a % 10;
  return `${n} ${n === 1 ? one : b >= 2 && b <= 4 && (a < 12 || a > 14) ? few : many}`;
}

/** Nazwa pociągu z rozkładu; dopiski (nadzwyczajny, obsługa …) w jednym nawiasie. */
function trainName(r, nr, notes = []) {
  const tr = r.trains.find((x) => same(x.nr, nr));
  const all = [...(tr?.extra ? ['nadzwyczajny'] : []), ...notes].filter(Boolean);
  return `${tr ? tr.label : `poc. ${nr}`}${all.length ? ` (${all.join(', ')})` : ''}`;
}

const fill = (tpl, r) => tpl.replace(/\{(\w+)\}/g, (_, k) => r[k] ?? '?');

/** Przyczyna postoju słowami (teksty zakładki „Pociągi”) z kodem. */
export function reasonText(r, where = null) {
  if (!r) {
    if (where?.moving) return 'w ruchu';
    if (where?.proceed) return `sygnał zezwalający na ${where.nextSignal} – rusza`;
    if (where?.state === 'dwell') return 'postój handlowy przy peronie';
    if (where?.at === 'line') return 'jedzie po szlaku do stacji';
    return 'bez przyczyny postoju w danych';
  }
  if (r.code === 'neighbour-wait') {
    const why = r.requested === true ? 'zgłoszony, bez pozwolenia albo szlak zajęty' : r.requested === false ? 'jeszcze niezgłoszony – szlak zajęty albo wcześniejszy pociąg w kolejce' : 'szlak zajęty, brak pozwolenia albo wcześniejszy pociąg w kolejce';
    return `czeka u sąsiada (${r.neighbour}) na wyprawienie – ${why} (neighbour-wait)`;
  }
  if (r.code === 'unit-wait') return `skład pociągu ${r.unit} nie przekazany – manewry albo zadanie w toku (unit-wait)`;
  const tpl = pl[`sp.wait.${r.code}`];
  return `${tpl ? fill(tpl, r) : r.code} (${r.code}${r.signal ? `@${r.signal}` : ''})`;
}

/** Przeszkoda przebiegu słowami: komunikat zależności + kto ją powoduje. */
export function blockerText(b) {
  const who = b.train != null ? ` – poc. ${b.train}` : b.fault ? ` – usterka ${FAULT_NAMES[b.fault] ?? b.fault}` : b.own ? ' – położenie ustawia dyżurny' : '';
  return `${b.route}: ${b.msg}${who}`;
}

function whereText(w, since) {
  if (!w) return '';
  const from = since != null ? ` od ${hms(since)}` : '';
  switch (w.at) {
    case 'neighbour': return `u sąsiada (${w.neighbour})${from}`;
    case 'line': return `na szlaku od ${w.exit}${from}`;
    case 'gone': return 'poza stacją';
    case 'station': return `${w.track ? `tor ${w.track}` : 'głowica'} (${w.sections.join(', ')})${w.nextSignal ? `, przed ${w.nextSignal}` : ''}${w.moving ? ', w ruchu' : `, stoi${from}`}${w.mode === 'shunt' ? ' (manewry)' : ''}`;
    default: return 'bez składu';
  }
}

/** Miejsce i przyczyna postoju pociągu nieobsłużonego – bez powtórzenia „w ruchu” (mówi je już miejsce). */
function standText(r, u) {
  const where = whereText(u.where, u.since);
  const why = !u.reason && u.where?.moving ? '' : reasonText(u.reason, u.where);
  const line = u.lineTrain != null ? `; szlak zajmuje ${trainName(r, u.lineTrain)}` : '';
  return [where, why].filter(Boolean).join('; ') + line;
}

/**
 * Pociąg opóźniony z zewnątrz (blokujący inny pociąg – kaskada): nadzwyczajny, z opóźnieniem od sąsiada albo ze
 * składu, który przyszedł z opóźnieniem, albo czekający co najmniej 2 min na szlak (przepustowość, nie układ stacji).
 * Opóźnienie przez konflikt z innym pociągiem na stacji to nie jest opóźnienie z zewnątrz.
 */
const isLate = (r, nr) => {
  const tr = r.trains.find((x) => same(x.nr, nr));
  return !!tr && (tr.extra || tr.delayIn > 0 || tr.unitLagMin > 0 || tr.waits.some((w) => LINE_CODES.has(w.code) && w.min >= 2));
};

/**
 * Zapas do końca zmiany (s) przy zmianie zakończonej obsłużeniem wszystkiego, inaczej null. Samouczek kończy się
 * dopiero o `endTime` – zapas od chwili, gdy wszystko było obsłużone.
 */
function marginOf(r) {
  if (!r.hasEndTime || r.endReason !== 'all-done') return null;
  const done = r.autoEnd === false ? r.allDoneAt ?? r.endedAt : r.endedAt;
  return done == null ? null : r.endTime - done;
}

/** Przeszkody z zewnątrz (bez położenia zwrotnic własnego przebiegu). */
const external = (bs) => (bs || []).filter((b) => !b.own);

/**
 * Postoje pociągu z winy stacji (min): bez postojów przez szlak (`LINE_CODES`), bez minut przy usterce, bez postojów,
 * w których diagnozie blokuje pociąg opóźniony z zewnątrz (kaskada) albo cudzy przebieg bez ustalonego pociągu.
 */
function ownWaits(r, tr) {
  let min = 0;
  for (const w of tr?.waits || []) {
    if (LINE_CODES.has(w.code)) continue;
    const ep = tr.episodes.find((x) => x.code === w.code && x.signal === w.signal);
    if (external(ep?.blockers).some((b) => (b.train != null && isLate(r, b.train)) || (b.by && b.train == null))) continue;
    min += Math.max(0, w.min - w.faultMin);
  }
  return { min };
}

/** Usterki słowami: „usterka semafora A”, losowa poziomu – „losowa usterka semafora A (poziom high)”. */
const faultsText = (fs, level) => fs.map((f) => `${f.scripted === false ? 'losowa usterka' : 'usterka'} ${FAULT_NAMES[f.type] ?? f.type} ${f.target}${f.scripted === false ? ` (poziom ${level})` : ''}`).join(', ');

/** Kto zajmował tor planowy pociągu przyjętego na inny tor. */
function holderText(r, w) {
  const h = w.holder;
  const parts = [];
  if (h?.train != null) parts.push(`tor planowy zajmował ${trainName(r, h.train)}${h.route ? ` (przebieg ${h.route})` : ''}`);
  else if (h?.route) parts.push(`na torze planowym przebieg ${h.route}`);
  else if (h?.closed) parts.push('tor planowy zamknięty');
  parts.push(w.planClash?.length ? `plan kładzie na ten tor w tym czasie także ${w.planClash.map((n) => trainName(r, n)).join(', ')}` : 'plan nie dzieli toru – tor zajęty przez opóźnienie albo decyzję automatu');
  return parts.join('; ');
}

/**
 * Werdykt zmiany z raportu `checkShift` (czysta funkcja): `{ status: 'ok' | 'warn' | 'error', findings }`, gdzie
 * `findings` – `{ level: 'error' | 'warning' | 'info', code, msg, train?, brief? }` (`info` nie zmienia statusu).
 * Poziom scenariusza (`baseLevel`: none albo wymuszony `disruptions`) jest jego zamysłem – tam uwagi są uwagami; na
 * poziomie wybieranym przez gracza część z nich to informacja o odporności (pociągi za końcem zmiany przez opóźnienie
 * od sąsiada). Pełna lista reguł: docs/ARCHITECTURE.md („Automat sprawdzający scenariusze”).
 */
export function verdict(r) {
  const findings = [];
  const add = (level, code, msg, train, brief) => findings.push({ level, code, msg, ...(train != null ? { train } : {}), ...(brief ? { brief } : {}) });
  const error = (code, msg, train, brief) => add('error', code, msg, train, brief);
  const warn = (code, msg, train, brief) => add('warning', code, msg, train, brief);
  const info = (code, msg, train, brief) => add('info', code, msg, train, brief);
  const base = r.effectiveLevel === (r.baseLevel ?? 'none');
  const none = r.effectiveLevel === 'none';
  // zależne od poziomu: na poziomie scenariusza uwaga, na poziomie gracza – informacja o odporności
  const note = base ? warn : info;
  const T = (nr, notes) => trainName(r, nr, notes);
  if (r.error) {
    error('exception', `Przebieg przerwany wyjątkiem: ${String(r.error).split('\n').filter((l) => !/^\s+at /.test(l)).join('; ')}`);
    return { status: 'error', findings };
  }
  if (!r.trains.some((t) => !t.extra)) error('no-traffic', 'Zmiana bez ani jednego pociągu rozkładu – scenariusz niczego nie sprawdza');
  // bezpieczeństwo
  if (r.violations?.count) error('violation', `Naruszenia zależności: ${r.violations.count} (${r.violations.first.map((v) => `${v.time} ${v.msg}`).join('; ')}${r.violations.count > r.violations.first.length ? '; …' : ''})`);
  // jazda po pękniętej szynie z usterki ze scenariusza na tym odcinku: automat nie zamyka toru (ITS) – ograniczenie
  // automatu, nie scenariusza; bez takiej usterki (track-defect bywa tylko w scenariuszu) – zabezpieczenie: błąd
  const automatDefect = (ev) => r.faults.some((f) => f.scripted && f.type === 'track-defect' && (ev.section == null || f.target === ev.section));
  for (const ev of r.events) {
    if (ev.code === 'track-defect' && automatDefect(ev)) info('automat-limit', `${hms(ev.time)} ${ev.msg} – automat nie zamyka toru z usterką nawierzchni; gracz zamknąłby tor (ITS) i poprowadził ruch innym`, ev.nr ?? undefined, ev.nr != null ? `${T(ev.nr)} po pękniętej szynie${ev.section ? ` ${ev.section}` : ''}` : 'jazda po pękniętej szynie');
    else error(ev.code, `${hms(ev.time)} ${ev.msg}`, ev.nr ?? undefined);
  }
  // zator po zapasie
  for (const j of r.jam) {
    const hint = j.task ? `; zadanie „${j.task.id}” na tor ${j.task.toTrack}${j.task.reachable ? ' – graf przebiegów manewrowych uznaje tor za osiągalny, możliwe ograniczenie automatu (automat-limit?)' : ' – toru nie da się osiągnąć przebiegami manewrowymi'}` : '';
    error('jam', `${T(j.nr)} nie dojechał do ${hms(r.until)} (koniec zmiany + zapas) – ${j.status}; ${standText(r, j)}${hint}`, j.nr);
  }
  // pociągi nieobsłużone w chwili końca zmiany
  const jammed = new Set(r.jam.map((j) => String(j.nr)));
  const lateIn = [], tight = [], extras = [];
  for (const u of r.unfinished) {
    const tr = r.trains.find((x) => same(x.nr, u.nr));
    if (tr?.extra) { extras.push(u); continue; }
    // nie zdąży wg planu i opóźnienia wniesionego (od sąsiada, ze składu): bez opóźnienia – plan za ciasny (błąd, jak
    // tt-after-end w definicji), z opóźnieniem – kara „nieobsłużony” bez winy dyżurnego
    if (u.expectedDone == null || u.expectedDone > r.endTime - LATE_SLACK) { ((tr?.lagMin ?? 0) > 0 ? lateIn : tight).push(u); continue; }
    if (jammed.has(String(u.nr))) continue; // zator – już błąd
    const own = ownWaits(r, tr);
    // stoi teraz przez usterkę albo przez usterki stał co najmniej 5 min, a z winy stacji mniej niż 5 min
    if (u.faultsNow?.length || (own.min < NOTABLE_MIN && (tr?.faultMin ?? 0) >= NOTABLE_MIN)) {
      const fs = u.faultsNow?.length ? u.faultsNow : u.faults;
      const cannot = fs.length && fs.every((f) => AUTOMAT_CANNOT.has(f.type));
      info(cannot ? 'automat-limit' : 'fault-wait', `${T(u.nr)} nieobsłużony na koniec zmiany – ${faultsText(fs, r.effectiveLevel)} na jego drodze; ${cannot ? 'automat jej nie usuwa' : 'automat czeka na naprawę'} (${WORKAROUND})`, u.nr, `${T(u.nr)} nieobsłużony – ${faultsText(fs, r.effectiveLevel)}`);
      continue;
    }
    const by = external(u.blockers).filter((b) => b.train != null);
    const why = `${standText(r, u)}${by.length ? `; blokuje ${[...new Set(by.map((b) => T(b.train)))].join(', ')}` : ''}${tr?.waits.length ? `; postoje: ${tr.waits.slice(0, 3).map((w) => `${w.code}${w.signal ? `@${w.signal}` : ''} ${w.min} min`).join(', ')}` : ''}`;
    const plan = `plan: ${tr?.arr ? `przyjazd ${tr.arr}, ` : ''}${tr?.dep ? `odjazd ${tr.dep}` : `przyjazd ${tr?.arr ?? '—'}`}, koniec ${hm(r.endTime)}`;
    if (none) error('unfinished-plan', `${T(u.nr)} nieobsłużony na koniec zmiany bez zakłóceń (poziom none) – przyczyną jest plan albo automat; ${plan}; ${why}`, u.nr);
    else if (own.min >= NOTABLE_MIN) error('unfinished', `${T(u.nr)} nieobsłużony na koniec zmiany ${hm(r.endTime)}, choć wg planu i opóźnienia od sąsiada zdążyłby (${hm(u.expectedDone)}); postój z winy stacji ${own.min} min – ${why}`, u.nr);
    else note('cascade', `${T(u.nr)} nieobsłużony na koniec zmiany ${hm(r.endTime)} (wg planu ${hm(u.expectedDone)}) przez opóźnienie innego pociągu z zewnątrz, szlak albo czas przejazdu – ${why}`, u.nr, `${T(u.nr)} nieobsłużony`);
  }
  for (const u of tight) {
    const tr = r.trains.find((x) => same(x.nr, u.nr));
    error('plan-tight', `${T(u.nr)} nieobsłużony na koniec zmiany: plan – ${tr?.dep ? `odjazd ${tr.dep}` : `przyjazd ${tr?.arr ?? '—'}`}, koniec ${hm(r.endTime)}; mniej niż ${LATE_SLACK / 60} min na wyjazd ze stacji (bez opóźnienia od sąsiada) – wydłuż endTime albo usuń pociąg`, u.nr);
  }
  if (lateIn.length) {
    const list = lateIn.map((u) => {
      const tr = r.trains.find((x) => same(x.nr, u.nr));
      const src = tr?.unit != null && tr.unitLagMin > 0 ? `skład z ${T(tr.unit)}, +${tr.unitLagMin} min` : `+${tr?.delayIn ?? 0} min od sąsiada`;
      return T(u.nr, [src, `obsługa ok. ${hm(u.expectedDone)}`]);
    });
    const lv = r.effectiveLevel;
    const slack = DISRUPTION_LEVELS[lv]?.delayMax ? ` Przy poziomie ${lv} zapas planu ${levelSlackMin(lv)} min (uwaga sc-slack definicji).` : '';
    const short = lateIn.map((u) => { const tr = r.trains.find((x) => same(x.nr, u.nr)); return `${T(u.nr)} +${tr?.lagMin ?? 0} min`; });
    note('late-inbound', `${plural(lateIn.length, 'pociąg', 'pociągi', 'pociągów')} nie zdąży przed końcem zmiany ${hm(r.endTime)} przez opóźnienie wniesione (potrzeba co najmniej ${LATE_SLACK / 60} min na wyjazd ze stacji): ${list.join(', ')} – bez kary (opóźnienie z zewnątrz), ale zmiana kończy się bez ich obsługi.${slack}`, undefined, `${lateIn.length} poc.: ${short.join(', ')}`);
  }
  if (extras.length) {
    info('extra-after-end', `Pociągi nadzwyczajne bez obsługi do końca zmiany ${hm(r.endTime)}: ${extras.map((u) => T(u.nr, [`obsługa ok. ${hm(u.expectedDone)}`])).join(', ')} – planowane tak, żeby mieściły się w zmianie (ostatnie zdarzenie co najmniej ${EXTRA_TRAIN.endSlack / 60} min przed końcem); nie zdążyły przez opóźnienie w ruchu`, undefined, `${extras.length} poc.: ${extras.map((u) => `${T(u.nr)} ok. ${hm(u.expectedDone)}`).join(', ')}`);
  }
  // czynności wymuszone usterką i stan po zmianie
  for (const f of r.forced) error('forced', `Kara za czynność, której nie wymusiła usterka: ${f}`);
  for (const l of r.leftovers) error('leftovers', `Stan urządzeń po zmianie: ${l}`);
  // zadania manewrowe: po końcu zmiany gra już nie karze – przepadłe / otwarte po endTime to uwaga (jak task-after-end
  // w definicji), nie błąd
  for (const k of r.tasks) {
    const exposed = k.faultShiftMin > 0 || r.faults.some((f) => f.trains.includes(String(k.unit)));
    const afterEnd = r.hasEndTime && k.deadline + TASK_GRACE > r.endTime;
    if (k.failed && afterEnd) note('task-after-end', `Zadanie „${k.id}” (skład ${k.unit} na tor ${k.toTrack}) przepadło po końcu zmiany – termin ${hm(k.deadline)} + 10 min po ${hm(r.endTime)}, bez kary w grze`, k.unit);
    else if (k.failed) (exposed ? note : error)(exposed ? 'task-failed-fault' : 'task-failed', `Zadanie „${k.id}” (skład ${k.unit} na tor ${k.toTrack}) przepadło – termin ${hm(k.deadline)}${exposed ? ', na drodze usterka' : ''}`, k.unit);
    else if (k.late) note('task-late', `Zadanie „${k.id}” wykonane po terminie ${hm(k.deadline)} (${hms(k.doneAt)}) – bez punktów`, k.unit);
    else if (!k.done) note(afterEnd ? 'task-after-end' : 'task-open', `Zadanie „${k.id}” ani wykonane, ani przepadłe do ${hms(r.until)} – termin ${hm(k.deadline)}${afterEnd ? ` + 10 min po końcu zmiany ${hm(r.endTime)}, bez kary w grze` : ' za blisko końca zmiany'}`, k.unit);
  }
  // usterki ze scenariusza bez wpływu na ruch: bez zakłóceń (powtarzalnie) – błąd; przy zakłóceniach – informacja
  for (const f of r.faults) {
    if (!f.scripted || f.trains.length) continue;
    const msg = `Usterka ${FAULT_NAMES[f.type] ?? f.type} ${f.target} (${hm(f.at)}, ${f.min} min) nie dotknęła żadnego pociągu${f.since == null ? ' – nie wystąpiła' : ''} – scenariusz jej nie sprawdza; przesuń ją na czas ruchu`;
    (none ? error : base ? warn : info)('fault-no-effect', msg, undefined, `${FAULT_NAMES[f.type] ?? f.type} ${f.target}`);
  }
  // zapas do końca zmiany
  const margin = marginOf(r);
  if (margin != null && margin < MARGIN_MIN * 60) {
    note('margin', `Zapas do końca zmiany ${mmss(margin)} (< ${MARGIN_MIN} min) – wszystko obsłużone o ${hms(r.endTime - margin)}, koniec ${hm(r.endTime)}; mały postój da kary „nieobsłużony”`);
  }
  // pociągi obsłużone: opóźnienie na stacji (kara late-depart / late-pass), przetrzymanie, długi postój – bez zakłóceń
  // każda kara (powtarzalna, z planu albo automatu), przy zakłóceniach od 5 min
  const unfinished = new Set(r.unfinished.map((u) => String(u.nr)));
  for (const tr of r.trains) {
    if (unfinished.has(String(tr.nr))) continue;
    if (tr.depObserved && tr.depTime != null && tr.actualDep < tr.depTime - 30) {
      info('early-depart', `${T(tr.nr)}: stoi od początku zmiany i ruszył ${hms(tr.actualDep)}, przed planowym odjazdem ${tr.dep} – silnik nie trzyma takiego pociągu do odjazdu, a automat podaje wyjazd od razu`, tr.nr, `${T(tr.nr)} ${hm(tr.actualDep)} zamiast ${tr.dep}`);
    }
    const own = Math.max(0, tr.stationMin - tr.faultMin);
    const obs = tr.obsLateMin >= 2 ? tr.obsLateMin : 0;
    const top = tr.waits.map((w) => ({ ...w, own: w.min - w.faultMin })).filter((w) => w.own >= 1).sort((a, b) => b.own - a.own)[0];
    if (tr.faultMin >= NOTABLE_MIN) info('fault-wait', `${T(tr.nr)}: automat czekał ${tr.faultMin} min na naprawę – ${faultsText(tr.faults, r.effectiveLevel)} (${WORKAROUND})`, tr.nr, `${T(tr.nr)} ${tr.faultMin} min – ${faultsText(tr.faults, r.effectiveLevel)}`);
    // kara „przetrzymany” (ponad 4 min przed semaforem) z postoju przy usterce – nie wina stacji
    const held = tr.held && tr.faultMin < 4;
    const notable = none ? 1 : NOTABLE_MIN;
    if (!(own >= notable || obs >= notable || held || (top && top.own >= NOTABLE_MIN))) continue;
    const ep = top && tr.episodes.find((x) => x.code === top.code && x.signal === top.signal && x.blockers.length);
    const ext = external(ep?.blockers);
    const conflict = ext.filter((b) => b.train != null || b.by);
    // bez przeszkody z zewnątrz, a pociągu dotknęła usterka (np. łączność blokady) – skutek usterki, nie planu
    const code = top && LINE_CODES.has(top.code) ? 'line-capacity' : conflict.length ? 'track-conflict' : ext.length ? 'station-delay' : tr.faults.length ? 'fault-wait' : 'automat-delay';
    const parts = [];
    if (own) parts.push(`kara za opóźnienie na stacji ${own} min${tr.lineMin ? ` (w tym czekanie na szlak ${tr.lineMin} min)` : ''}`);
    if (obs) parts.push(`odjazd ok. ${obs} min po planie (pociąg stojący od początku zmiany – silnik nie liczy mu kary)`);
    if (held) parts.push('przetrzymany przed semaforem ponad 4 min');
    if (top) parts.push(`czekał ${top.own} min (${hms(top.from)}–${hms(top.to)}): ${reasonText(top)}`);
    if (ep?.blockers.length) parts.push(`przeszkody: ${ep.blockers.slice(0, 3).map(blockerText).join('; ')}`);
    if (code === 'automat-delay') parts.push(top ? 'bez przeszkody z zewnątrz w danych – zwłoka automatu' : 'bez postoju w danych – przyczyna nieznana (jazda na sygnale ograniczającym?)');
    if (code === 'fault-wait') parts.push(`pociąg dotknęła ${faultsText(tr.faults, r.effectiveLevel)} – opóźnienie przy jej obsłudze`);
    const first = conflict.find((b) => b.train != null);
    const brief = `${T(tr.nr)} ${[own ? `−${own} min` : '', obs ? `+${obs} min` : '', top ? `${top.code}${top.signal ? `@${top.signal}` : ''} ${top.own} min` : '', first ? `z ${T(first.train)}` : conflict[0]?.by ? `z przebiegiem ${conflict[0].by}` : '', held ? 'przetrzymany' : ''].filter(Boolean).join(', ')}`;
    // bez zakłóceń kwadrans opóźnienia to wada planu (albo automatu) – błąd
    const lvl = code === 'fault-wait' ? info : none && own + obs >= PLAN_DELAY_ERROR_MIN ? error : code === 'automat-delay' && !base ? info : warn;
    lvl(code, `${T(tr.nr)}: ${parts.join('; ')}`, tr.nr, brief);
  }
  for (const w of r.wrongTrack) warn('wrong-track', `${hms(w.time)} ${w.msg} – ${holderText(r, w)}`, w.nr ?? undefined, w.nr != null ? T(w.nr, [w.holder?.train != null ? `tor zajmował ${trainName(r, w.holder.train)}` : '', w.planClash?.length ? 'tak w planie' : '']) : null);
  for (const d of r.duties) warn('block-duty', `${hms(d.time)} ${d.msg}`, d.nr ?? undefined);
  // sonda usterek (poziom scenariusza zastąpiony przez none): liczy się tylko wpływ usterek i bezpieczeństwo
  const kept = r.faultProbe ? findings.filter((f) => f.code === 'fault-no-effect' || f.level === 'error' && ['violation', 'spad', 'rozprucie', 'exception', 'jam'].includes(f.code)) : findings;
  const status = kept.some((f) => f.level === 'error') ? 'error' : kept.some((f) => f.level === 'warning') ? 'warn' : 'ok';
  return { status, findings: kept };
}

/**
 * Ocena scenariusza (czysta funkcja) z definicji (`checkScenario`) i zmian (`checkShift`): BŁĘDY – błąd definicji
 * albo zmiana z błędem na dowolnym poziomie; UWAGI – uwaga w definicji albo w zmianie na poziomie scenariusza: bez
 * zakłóceń (none – powtarzalna) każda, przy poziomie wymuszonym (`disruptions`, np. szczyt = high) – rodzaj uwagi
 * powtarzający się we wszystkich ziarnach (`repeated`); inaczej OK. Uwagi z poziomów wybieranych przez gracza to
 * odporność (`robustness`: poziom → { shifts, warned, codes }), bez wpływu na ocenę.
 */
export function scenarioStatus(staticFindings, shifts) {
  const isBase = (s) => !s.faultProbe && s.effectiveLevel === (s.baseLevel ?? 'none');
  const warnCodes = (s) => new Set(s.findings.filter((f) => f.level === 'warning').map((f) => f.code));
  const base = shifts.filter((s) => isBase(s) && !s.error);
  let repeated = [];
  if (base.some((s) => s.effectiveLevel === 'none')) repeated = [...new Set(base.flatMap((s) => [...warnCodes(s)]))];
  else if (base.length) {
    const sets = base.map(warnCodes);
    repeated = [...sets[0]].filter((c) => sets.every((x) => x.has(c)));
  }
  let status = hasErrors(staticFindings) || shifts.some((s) => s.status === 'error') ? 'error' : 'ok';
  if (status === 'ok' && (staticFindings.some((f) => f.level === 'warning') || repeated.length)) status = 'warn';
  const robustness = {};
  for (const s of shifts) {
    if (isBase(s) || s.faultProbe || s.error) continue;
    const x = (robustness[s.effectiveLevel] ??= { shifts: 0, warned: 0, codes: {} });
    x.shifts++;
    const ws = warnCodes(s);
    if (ws.size) x.warned++;
    for (const c of ws) x.codes[c] = (x.codes[c] || 0) + 1;
  }
  return { status, repeated, robustness };
}

/**
 * Uwagi powtarzalne scenariusza jako klucze „kod” albo „kod:pociąg” (posortowane, bez powtórzeń): uwagi definicji
 * i uwagi przebiegu na poziomie scenariusza, gdy ten jest bez zakłóceń (none – praktycznie powtarzalny). Do listy
 * przyjętych uwag w `npm test` (tests/scenario-accepted.js).
 */
export function deterministicWarnings(staticFindings, shift = null) {
  const keys = staticFindings.filter((f) => f.level === 'warning').map((f) => (f.train != null ? `${f.code}:${f.train}` : f.code));
  if (shift && !shift.faultProbe && shift.effectiveLevel === 'none' && (shift.baseLevel ?? 'none') === 'none') {
    for (const f of shift.findings) if (f.level === 'warning') keys.push(f.train != null ? `${f.code}:${f.train}` : f.code);
  }
  return [...new Set(keys)].sort();
}

// ————————————————————————————————————— lista sprawdzeń —————————————————————————————————————

/**
 * Opcje wiersza poleceń (`argv` bez `node` i nazwy skryptu); `--opcja wartość` i `--opcja=wartość`, cele bez `--`.
 * Zwraca `{ targets, levels, seeds, extra, tutorial, verbose, strict, workers, json, help }`; przy błędzie wyjątek.
 */
export function parseArgs(argv = []) {
  const opts = { targets: [], levels: [...LEVELS], seeds: [1, 2, 3], extra: 120, tutorial: false, verbose: false, strict: false, workers: defaultWorkers(), json: null, help: false };
  return parseCli(argv, opts, {
    levels: { all: LEVELS, allowed: LEVELS },
    positional: (raw) => opts.targets.push(raw),
    custom: (name, { flag }) => {
      if (name === '--verbose' || name === '-v') { opts.verbose = flag(); return true; }
      if (name === '--strict') { opts.strict = flag(); return true; }
      return false;
    },
  });
}

/**
 * Scenariusze i zmiany do sprawdzenia. Cele: „stacja” (wszystkie scenariusze, samouczki tylko z `tutorial`),
 * „stacja:scenariusz” (ten jeden, także samouczek); bez celów – wszystkie stacje. Nieznana stacja / scenariusz –
 * wyjątek. Scenariusz z własnym poziomem zakłóceń idzie raz na ziarno, na swoim poziomie. Scenariusz z usterkami bez
 * przebiegu na poziomie none (wymuszony inny poziom albo `levels` bez none) dostaje sondę usterek: jeden przebieg
 * z poziomem zastąpionym przez none (`forceLevel`), tylko do oceny wpływu usterek.
 * Zwraca `{ scenarios: [{ station, scenario }], jobs: [{ stationId, scenarioId, seed, level, extra, stationIndex, forceLevel? }] }`.
 */
export function listChecks({ targets = [], levels = [...LEVELS], seeds = [1, 2, 3], extra = 120, tutorial = false } = {}) {
  const scenarios = [];
  const seen = new Set();
  const push = (station, scenario) => { const k = `${station.id}:${scenario.id}`; if (!seen.has(k)) { seen.add(k); scenarios.push({ station, scenario }); } };
  const all = (station) => { for (const sc of station.scenarios || []) if (tutorial || !sc.tutorial) push(station, sc); };
  if (!targets.length) STATIONS.forEach(all);
  for (const t of targets) {
    const [sid, scid] = String(t).split(':');
    const station = STATIONS.find((s) => s.id === sid);
    if (!station) throw new Error(`Nieznana stacja: „${sid}” (stacje: ${STATIONS.map((s) => s.id).join(', ')})`);
    if (scid == null || scid === '') { all(station); continue; }
    const sc = (station.scenarios || []).find((s) => s.id === scid);
    if (!sc) throw new Error(`Nieznany scenariusz: „${sid}:${scid}” (scenariusze stacji: ${(station.scenarios || []).map((s) => s.id).join(', ')})`);
    push(station, sc);
  }
  const jobs = [];
  for (const { station, scenario } of scenarios) {
    const stationIndex = STATIONS.indexOf(station);
    const lv = scenario.disruptions ? [scenario.disruptions] : LEVELS.filter((l) => levels.includes(l));
    for (const level of lv) for (const seed of seeds) jobs.push({ stationId: station.id, scenarioId: scenario.id, seed, level, extra, stationIndex });
    if (scenario.faults?.length && !lv.includes('none') && seeds.length) jobs.push({ stationId: station.id, scenarioId: scenario.id, seed: seeds[0], level: 'none', extra, stationIndex, forceLevel: 'none' });
  }
  return { scenarios, jobs };
}

function runCheckSafe(job) {
  try {
    return checkShift(job);
  } catch (e) {
    const r = { station: job.stationId, scenario: job.scenarioId, seed: job.seed, level: job.level, effectiveLevel: job.forceLevel ?? job.level, faultProbe: !!job.forceLevel, error: String(e?.stack || e) };
    return { ...r, ...verdict(r) };
  }
}

/** Sprawdzenie listy zmian: w jednym wątku albo w `workers` wątkach (najpierw duże stacje); wyniki w kolejności `jobs`. */
export function runAll(jobs, workers, onProgress) {
  return runJobs(jobs, { workers, url: new URL(import.meta.url), role: WORKER_ROLE, run: runCheckSafe, onProgress });
}

// ————————————————————————————————————— wydruk —————————————————————————————————————

const STATUS = { ok: 'OK', warn: 'UWAGI', error: 'BŁĘDY' };
const tag = (f) => (f.level === 'error' ? 'BŁĄD ' : f.level === 'warning' ? 'uwaga' : 'info ');

function endText(r) {
  if (r.error) return 'przebieg przerwany';
  const margin = marginOf(r);
  const m = margin != null ? `, zapas ${Math.floor(margin / 60)} min` : '';
  if (r.endReason === 'all-done' && !r.autoEnd) return `koniec ${hm(r.endTime)} (samouczek) – wszystko obsłużone o ${hms(r.allDoneAt)}${m}`;
  if (r.endReason === 'all-done') return `koniec ${hms(r.endedAt)} – wszystko obsłużone${m}`;
  if (r.endReason === 'time') return `koniec ${hm(r.endTime)} o czasie – ${r.unfinished.length ? `${plural(r.unfinished.length, 'pociąg nieobsłużony', 'pociągi nieobsłużone', 'pociągów nieobsłużonych')}` : 'wszystko obsłużone'}`;
  return `zmiana bez końca do ${hms(r.until)} (brak endTime)`;
}

/** Wiersze jednej zmiany. */
export function formatShift(r, { verbose = false } = {}) {
  const lv = r.faultProbe ? `${r.effectiveLevel}†` : r.effectiveLevel && r.effectiveLevel !== r.level ? `${r.effectiveLevel}*` : r.level;
  const out = [`    ${String(lv).padEnd(5)} ziarno ${String(r.seed).padEnd(2)} ${STATUS[r.status].padEnd(5)}  ${endText(r)}${r.error ? '' : `; wynik ${r.score.atEnd} (${r.score.grade}), punktualnie ${r.punctuality.onTime}, opóźnione ${r.punctuality.delayed}`}${r.faultProbe ? ' – sonda usterek (poziom scenariusza zastąpiony przez none)' : ''}`];
  const byNr = (list, nr) => list?.find((x) => same(x.nr, nr));
  // uwagi i informacje o pojedynczych pociągach bez --verbose – jeden wiersz na kod
  const grouped = new Map();
  for (const f of r.findings) {
    if (!verbose && f.level !== 'error' && f.brief) { const k = `${tag(f)}|${f.code}`; if (!grouped.has(k)) grouped.set(k, []); grouped.get(k).push(f); continue; }
    out.push(`        ${tag(f)}  ${f.code.padEnd(14)} ${f.msg}`);
    // szczegóły pociągu nieobsłużonego / w zatorze: przeszkody i dziennik (przy błędzie zawsze, inaczej z --verbose)
    const u = f.train != null && (f.code === 'jam' ? byNr(r.jam, f.train) : ['unfinished', 'unfinished-plan', 'cascade', 'fault-wait', 'automat-limit'].includes(f.code) ? byNr(r.unfinished, f.train) : null);
    if (u && (verbose || f.level === 'error')) {
      for (const b of u.blockers.slice(0, 4)) out.push(`                         przeszkoda: ${blockerText(b)}`);
      for (const l of u.log) out.push(`                         ${hms(l.time)} ${l.msg}`);
    }
  }
  for (const [k, list] of grouped) {
    const [t, code] = k.split('|');
    const more = list.some((f) => /przeszkody:/.test(f.msg)) ? ' (--verbose: przeszkody)' : '';
    out.push(`        ${t}  ${code.padEnd(14)} ${list.every((f) => f.train != null) ? `${list.length} poc.: ` : ''}${list.map((f) => f.brief).join('; ')}${more}`);
  }
  if (verbose && !r.error) out.push(...formatDetails(r));
  return out;
}

/** Tabela pociągów, zadania, usterki (--verbose). */
function formatDetails(r) {
  const out = ['        pociągi (plan przyjazd/odjazd tor → rzeczywiście; wniesione / kara na stacji; postoje):'];
  for (const t of r.trains) {
    const plan = `${t.arr ?? '—'}/${t.dep ?? '—'} t${t.track ?? '?'}`;
    const real = `${hm(t.actualArr)}/${hm(t.actualDep)}${t.depObserved ? '*' : ''} t${t.actualTrack ?? '?'}`;
    const waits = t.waits.slice(0, 2).map((w) => `${w.code}${w.signal ? `@${w.signal}` : ''} ${w.min} min`).join(', ');
    out.push(`          ${t.label.padEnd(14)} ${`${t.from ?? '·'}→${t.to ?? '·'}`.padEnd(9)} ${plan.padEnd(17)} → ${real.padEnd(19)} +${t.lagMin ?? t.delayIn}/${t.stationMin} min  ${t.status}${waits ? `  [${waits}]` : ''}`);
  }
  for (const k of r.tasks) out.push(`        zadanie ${k.id}: skład ${k.unit} na tor ${k.toTrack}, termin ${hm(k.deadline)}${k.shiftMin ? ` (przesunięty o ${k.shiftMin} min)` : ''} – ${k.done ? `wykonane ${hms(k.doneAt)}${k.late ? ' po terminie' : ''}` : k.failed ? 'przepadło' : 'w toku'}`);
  for (const f of r.faults) out.push(`        usterka ${f.scripted ? 'ze scenariusza' : 'losowa'} ${f.type} ${f.target}: ${hms(f.since ?? f.at)}, ${f.min} min${f.since == null ? ' (nie wystąpiła)' : ''} – pociągi: ${f.trains.join(', ') || 'żaden'}`);
  for (const x of r.extraTrains) out.push(`        pociąg nadzwyczajny ${x.nr}: przyjazd ${x.arr ?? '—'}${x.added ? '' : ' (nie dodany)'}`);
  return out;
}

/** Wiersze definicji scenariusza (`checkScenario`): błędy zawsze, uwagi – do 6, informacje – do 3 bez `verbose`. */
export function formatStatic(findings, { verbose = false } = {}) {
  const errors = findings.filter((f) => f.level === 'error');
  const warns = findings.filter((f) => f.level === 'warning');
  const infos = findings.filter((f) => f.level === 'info');
  const counts = [errors.length ? plural(errors.length, 'błąd', 'błędy', 'błędów') : 'bez błędów', warns.length ? plural(warns.length, 'uwaga', 'uwagi', 'uwag') : '', infos.length ? plural(infos.length, 'informacja', 'informacje', 'informacji') : ''];
  const out = [`  Definicja: ${counts.filter(Boolean).join(', ')}`];
  const shownW = verbose ? warns : warns.slice(0, 6);
  const shownI = verbose ? infos : infos.slice(0, 3);
  for (const f of [...errors, ...shownW, ...shownI]) out.push(`    ${tag(f)}  ${f.code.padEnd(18)} ${f.msg}`);
  const hidden = warns.length - shownW.length + infos.length - shownI.length;
  if (hidden) out.push(`    … i ${hidden} więcej (--verbose)`);
  return out;
}

/** Wiersz odporności scenariusza (uwagi z poziomów wybieranych przez gracza). */
function robustnessText(rob) {
  const parts = LEVELS.filter((l) => rob[l]).map((l) => {
    const x = rob[l];
    const codes = Object.entries(x.codes).sort((a, b) => b[1] - a[1]).map(([c, n]) => `${c} ${n}`).join(', ');
    return `${l} – ${x.warned}/${plural(x.shifts, 'zmiana', 'zmiany', 'zmian')} z uwagami${codes ? ` (${codes})` : ''}`;
  });
  return parts.length ? `  Odporność (poziomy gracza, bez wpływu na ocenę): ${parts.join('; ')}` : null;
}

function tally(list) {
  const m = new Map();
  for (const x of list) m.set(x, (m.get(x) || 0) + 1);
  return [...m].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(', ');
}

/** Wiersz poleceń; zwraca kod wyjścia. */
export async function main(argv) {
  let opts, plan;
  try { opts = parseArgs(argv); } catch (e) { console.error(e.message); console.error(USAGE); return 2; }
  if (opts.help) { console.log(USAGE); return 0; }
  try { plan = listChecks(opts); } catch (e) { console.error(e.message); return 2; }
  if (!plan.jobs.length) { console.error('Brak scenariuszy do sprawdzenia.'); return 2; }
  const missions = Object.keys(MISSIONS);
  // stacja: raz, z pełną treścią błędów; przy błędach jej zmiany nie są grane (symulacja by nie wystartowała)
  const invalid = new Set();
  for (const station of new Set(plan.scenarios.map((s) => s.station))) {
    const v = validateStation(station);
    if (v.errors.length) {
      invalid.add(station.id);
      console.log(`Stacja ${station.id}: definicja niepoprawna (${plural(v.errors.length, 'błąd', 'błędy', 'błędów')}) – przebiegi pominięte:`);
      for (const e of v.errors) console.log(`    BŁĄD   ${e}`);
    }
    if (v.warnings.length) {
      console.log(`Stacja ${station.id}: ${plural(v.warnings.length, 'uwaga', 'uwagi', 'uwag')} walidacji:`);
      for (const w of v.warnings) console.log(`    uwaga  ${w}`);
    }
  }
  const jobs = plan.jobs.filter((j) => !invalid.has(j.stationId));
  const statics = plan.scenarios.map(({ station, scenario }) => checkScenario(station, scenario.id, { missions, levels: opts.levels }));
  const workers = Math.max(1, Math.min(opts.workers, jobs.length));
  console.log(`Sprawdzanie scenariuszy: ${plural(plan.scenarios.length, 'scenariusz', 'scenariusze', 'scenariuszy')}, ${plural(jobs.length, 'zmiana', 'zmiany', 'zmian')} (poziomy ${opts.levels.join(', ')}; ziarna ${opts.seeds.join(', ')}; zapas ${opts.extra} min), wątki: ${workers}`);
  const tty = process.stderr.isTTY;
  const progress = tty ? (d, all) => process.stderr.write(`\r  ${d}/${all}`) : null;
  const t0 = performance.now();
  const results = jobs.length ? await runAll(jobs, workers, progress) : [];
  const seconds = (performance.now() - t0) / 1000;
  if (tty) process.stderr.write('\r\x1b[K');
  const scenarioStatuses = [];
  const out = [];
  let detWarnings = 0;
  plan.scenarios.forEach(({ station, scenario }, i) => {
    const shifts = results.filter((r) => r.station === station.id && r.scenario === scenario.id)
      .sort((a, b) => (a.faultProbe ? 1 : 0) - (b.faultProbe ? 1 : 0) || LEVELS.indexOf(a.effectiveLevel) - LEVELS.indexOf(b.effectiveLevel) || a.seed - b.seed);
    const st = statics[i];
    const { status, repeated, robustness } = scenarioStatus(st, shifts);
    scenarioStatuses.push(status);
    const baseShift = shifts.find((s) => !s.faultProbe && !s.error && s.effectiveLevel === s.baseLevel);
    detWarnings += deterministicWarnings(st, baseShift).length;
    const first = shifts.find((s) => !s.error);
    const window = `${hm(first?.startTime)}–${first?.hasEndTime ? hm(first.endTime) : '?'}`;
    const rob = Object.values(robustness);
    const robNote = rob.length ? ` (uwagi przy zakłóceniach: ${rob.reduce((a, x) => a + x.warned, 0)}/${plural(rob.reduce((a, x) => a + x.shifts, 0), 'zmiana', 'zmiany', 'zmian')})` : '';
    console.log(`\n━━ ${station.id}:${scenario.id}  ${STATUS[status]}${robNote}  „${scenario.name ?? scenario.id}” – ${window}${first ? `, ${plural(first.trains.filter((t) => !t.extra).length, 'pociąg', 'pociągi', 'pociągów')}, srk ${first.srk}` : ''}`);
    for (const l of formatStatic(st, opts)) console.log(l);
    if (invalid.has(station.id)) console.log('  Przebiegi: pominięte – definicja stacji niepoprawna');
    else console.log('  Przebiegi:');
    for (const r of shifts) for (const l of formatShift(r, opts)) console.log(l);
    const forcedBase = shifts.filter((x) => !x.faultProbe && x.effectiveLevel === x.baseLevel && x.baseLevel !== 'none');
    if (forcedBase.length > 1) console.log(`  Poziom scenariusza ${forcedBase[0].baseLevel}: ${repeated.length ? `we wszystkich ziarnach powtarza się ${repeated.join(', ')}` : 'żaden rodzaj uwagi nie powtarza się we wszystkich ziarnach'}`);
    const rt = robustnessText(robustness);
    if (rt) console.log(rt);
    out.push({ station: station.id, scenario: scenario.id, status, repeated, robustness, static: st, shifts });
  });
  const shiftStatus = results.map((r) => r.status);
  const count = (list, s) => list.filter((x) => x === s).length;
  const isBase = (r) => !r.faultProbe && r.effectiveLevel === r.baseLevel;
  console.log('\nPODSUMOWANIE');
  console.log(`  scenariusze: ${plan.scenarios.length} (OK ${count(scenarioStatuses, 'ok')}, UWAGI ${count(scenarioStatuses, 'warn')}, BŁĘDY ${count(scenarioStatuses, 'error')}); błędy definicji: ${statics.reduce((a, s) => a + s.filter((f) => f.level === 'error').length, 0)}; uwagi powtarzalne (definicja i przebieg bez zakłóceń): ${detWarnings}`);
  console.log(`  zmiany: ${results.length} (OK ${count(shiftStatus, 'ok')}, UWAGI ${count(shiftStatus, 'warn')}, BŁĘDY ${count(shiftStatus, 'error')})`);
  const codes = (list, level) => tally(list.flatMap((r) => [...new Set(r.findings.filter((f) => f.level === level).map((f) => f.code))]));
  if (codes(results, 'error')) console.log(`  błędy w zmianach (liczba zmian): ${codes(results, 'error')}`);
  if (codes(results.filter(isBase), 'warning')) console.log(`  uwagi na poziomie scenariusza (liczba zmian): ${codes(results.filter(isBase), 'warning')}`);
  if (codes(results.filter((r) => !isBase(r)), 'warning')) console.log(`  odporność – uwagi przy zakłóceniach gracza (liczba zmian): ${codes(results.filter((r) => !isBase(r)), 'warning')}`);
  if (codes(results, 'info')) console.log(`  informacje (liczba zmian): ${codes(results, 'info')}`);
  console.log('  Automat wydaje polecenia zależnościom wprost – sprawdza rozkład i zależności, nie obsługę pulpitu.');
  console.log(`  Czas: ${seconds.toFixed(1)} s`);
  if (opts.json) {
    writeFileSync(opts.json, JSON.stringify({ tool: 'scripts/check-scenario.mjs', created: new Date().toISOString(), options: { targets: opts.targets, levels: opts.levels, seeds: opts.seeds, extra: opts.extra, tutorial: opts.tutorial, strict: opts.strict }, scenarios: out }, null, 1) + '\n');
    console.log(`  Zapisano: ${opts.json}`);
  }
  return scenarioStatuses.includes('error') || (opts.strict && scenarioStatuses.includes('warn')) ? 1 : 0;
}

// Wątek: zmiany z kolejki wątku głównego, jedna po drugiej.
serveJobs(WORKER_ROLE, runCheckSafe);

if (executedDirectly(import.meta.url)) {
  main(process.argv.slice(2)).then((code) => { process.exitCode = code; }, (e) => { console.error(e?.stack || e); process.exitCode = 1; });
}
