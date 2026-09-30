import { test } from 'node:test';
import assert from 'node:assert/strict';
import sopot from '../src/stations/sopot.js';
import chylonia from '../src/stations/gdynia-chylonia.js';
import rumia from '../src/stations/rumia.js';
import jodlowa from '../src/stations/jodlowa.js';
import brzezina from '../src/stations/brzezina.js';
import { Interlocking } from '../src/model/Interlocking.js';
import { faultSim, runWithFault, at, entryActive, entryRoutes, stuck, unjustified, leftovers, Clock } from './fault-harness.js';
import { autoDispatch } from './helpers.js';

/*
 * Usterki w wybranej chwili jazdy na stacjach spoza pozostałych `tests/faults-*.test.js` (tam: Szkolna, Kalinowo):
 *  - przebiegi wieloetapowe: Sopot A → H → O (semafor pośredni H z usterką i zajętość bez pociągu w drugim stopniu, gdy
 *    pociąg jest w pierwszym; semafor wyjazdowy O przy postoju), wyjazd dwustopniowy Chylonia G502 → A502 i Sopot L → C
 *    (semafor drugiego stopnia przy postoju i w pierwszym stopniu); po przejeździe bez wiszących przebiegów i utwierdzeń,
 *  - Rumia (E, komputerowe), Jodłowa (E, komputerowe), Brzezina (EBILock 950) – blokada Eap jednokierunkowa i SBL: usterka
 *    semafora wjazdowego i wyjazdowego, tor docelowy zajęty bez pociągu, napęd zwrotnicy przebiegu; wjazd z toru Eap na
 *    Sz / rozkaz „S” z dKo przed wjazdem (0 pkt), wyjazd na tor Eap bez sygnału z dPo (0 pkt),
 *  - SBL bez łączności (Brzezina): dwa pociągi po sobie na jednym torze w obie strony,
 *  - Sopot: jazda po torze lewym GD1 jako odpowiedź na usterkę toru 2 (Zk albo „droga wolna” telefonicznie).
 * Usterka krótka kończy się po minucie postoju pociągu przed semaforem (pociąg jedzie dalej na sygnale zezwalającym),
 * długa – pociąg jedzie na Sz albo rozkaz „S”. Podstawa: `tests/fault-harness.js`; jego chwile i cele zakładają jeden
 * stopień przebiegu, więc chwile, cele i obserwacja są tu własne.
 *
 * Ruch prowadzi automat. Czynności, których automat nie wykonuje (Sz i rozkaz „S” przy semaforze z usterką, także
 * pośrednim, Zz zwrotnic drogi, dKo przed wjazdem na Sz, Zk i przebieg złożony na tor lewy, zapytanie o drogę), wykonuje
 * „dyżurny” testu przez `sim.execute`, `sim.traffic.issueOrder` i blokadę liniową.
 */

const entryOf = (sim, nr) => sim.traffic.timetable().find((e) => e.nr === nr);
const now = (sim) => Clock.format(sim.clock.time, true);
const scores = (sim, code) => sim.score.items.filter((i) => i.code === code).map((i) => i.points);
/** Odległość czoła pociągu od semafora `sig` (m) albo undefined. */
const distTo = (tr, sig) => tr.constraintsAhead(1500, true).find((c) => c.signal === sig && (c.kind === 'signal' || c.kind === 'passed-signal'))?.dist;
/** Pociąg zatrzyma się przed semaforem `sig` hamowaniem służbowym (z zapasem 30 m) – usterka nie kończy się przejazdem „Stój”. */
const canStop = (tr, sig) => { const d = distTo(tr, sig); return d != null && d > (tr.v * tr.v) / (2 * tr.brake) + 30; };

/**
 * Pociąg gotowy do jazdy stoi przed semaforem: zatrzymany przed nim (wjazd, semafor pośredni, po odjeździe przed
 * następnym semaforem) albo przy peronie po postoju i o czasie odjazdu.
 */
function ready(sim, e) {
  const tr = e.train;
  if (!tr || tr.finished || tr.v > 0 || !tr.nextSignal()) return false;
  if (tr.stoppedAt?.kind === 'signal') return tr.stoppedAt.signal === tr.nextSignal();
  return e.actualArr != null && e.actualDep == null && sim.clock.time >= (e.depTime ?? 0) && (tr.dwellUntil ?? 0) <= sim.clock.time;
}
/**
 * Usterka na drodze za semaforem `id` (po bieżących położeniach zwrotnic): semafor bez sygnału zezwalającego, odcinek
 * zajęty z usterki, zwrotnica z usterką napędu, blokada szlaku bez łączności. Jak `Interlocking.faultOnPath`, ale bez
 * zwrotnicy chwilowo bez kontroli, bo w ruchu (przestawianie do przebiegu to nie usterka).
 */
function faultAhead(sim, id) {
  const ilk = sim.ilk, path = ilk.pathBeyond(id);
  if (ilk.signals.get(id)?.failed || (path.exit && sim.blocks.get(path.exit)?.fault)) return true;
  if (path.sections.some((sid) => Interlocking.faultOccupied(ilk.sections.get(sid)))) return true;
  return path.points.some((q) => ilk.points.get(q.id).faultUntil > sim.clock.time);
}
/** Semafor przed gotowym pociągiem nie może dać sygnału zezwalającego z powodu usterki na jego drodze (albo samego semafora). */
function blockedAhead(sim, e) {
  if (!ready(sim, e)) return null;
  const id = e.train.nextSignal(), sig = sim.ilk.signals.get(id);
  return sig && !Interlocking.isTrainProceed(sig.aspect) && faultAhead(sim, id) ? sig : null;
}

/**
 * Obserwacja w każdym takcie: `passes` – minięcia semaforów „numer semafor: sposób” (sygnał, Sz, rozkaz, spad – przejazd
 * „Stój” zgaszonego tuż przed pociągiem, Stój … – bez zezwolenia); obraz to ostatni sygnał semafora sprzed przejazdu (też
 * z tego taktu – naprawa w tym samym takcie). `waited` – „numer semafor”: pociąg gotowy do jazdy czekał przed semaforem,
 * za którym usterka nie pozwala dać sygnału zezwalającego (`blockedAhead`). `noControl` – przebieg pociągowy utwierdzony
 * przy zwrotnicy bez kontroli położenia.
 */
function observer(sim) {
  const prev = new Map(), passes = [], spads = [], waited = new Set(), noControl = [];
  let seen = new Map();
  sim.bus.on('alarm', (a) => { if (a.type === 'spad') spads.push(`${a.nr} ${a.signal}`); });
  sim.bus.on('signal', (s) => seen.get(s.id)?.push(s.aspect));
  // także tuż przed dyżurnym testu – Sz podany w tym samym takcie, w którym pociąg stanął, zmienia obraz przed obserwacją
  const look = (s) => { for (const e of s.traffic.timetable()) { const sig = blockedAhead(s, e); if (sig) waited.add(`${e.nr} ${sig.id}`); } };
  const each = (s) => {
    for (const tr of s.traffic.trains) {
      if (tr.finished || tr.mode !== 'train') { prev.delete(tr.nr); continue; }
      const next = tr.nextSignal(), p = prev.get(tr.nr);
      if (p && p.sig !== next) {
        const aspect = [p.aspect, ...(seen.get(p.sig) ?? [])].findLast((a) => Interlocking.isTrainProceed(a)) ?? p.aspect;
        const how = spads.includes(`${tr.nr} ${p.sig}`) ? 'spad' : p.order ? 'rozkaz' : aspect === 'Sz' ? 'Sz' : Interlocking.isTrainProceed(aspect) ? 'sygnał' : `Stój (${aspect})`;
        passes.push(`${tr.nr} ${p.sig}: ${how}`);
      }
      const sig = next && s.ilk.signals.get(next);
      if (sig) prev.set(tr.nr, { sig: next, aspect: sig.aspect, order: tr.hasOrderFor(next) }); else prev.delete(tr.nr);
    }
    seen = new Map([...prev.values()].map((p) => [p.sig, []]));
    look(s);
    for (const a of s.ilk.active.values()) {
      if (a.trainEntered || a.route.kind !== 'train' || noControl.length >= 5) continue;
      for (const pid of a.lockedPoints) { const p = s.ilk.points.get(pid); if (!p.moving && !p.control) noControl.push(`${now(s)} przebieg ${a.id} utwierdzony przy zwrotnicy ${pid} bez kontroli`); }
    }
  };
  return { each, look, passes, waited, noControl };
}
/** Minięcia semafora `sig` jako „numer: sposób”. */
const passesOf = (r, sig) => r.obs.passes.filter((p) => p.split(': ')[0].endsWith(` ${sig}`)).map((p) => p.replace(` ${sig}:`, ':'));

/**
 * Dyżurny testu: automat, a gdy `how` ('Sz' | 'S') – przy pociągu gotowym do jazdy przed semaforem, któremu usterka nie
 * pozwala dać sygnału zezwalającego (`blockedAhead`), Sz albo rozkaz „S”. Droga za semaforem: nastawiony przebieg (zwrotnice
 * utwierdzone); bez przebiegu – zwrotnice drogi na tor planowy ustawione i zamknięte (Zz), zdjęte po przejeździe. Przy
 * wjeździe z toru Eap bez stwierdzenia przejazdu – najpierw dKo. `hold` – przebieg, którego semafor zgasł z usterki przed
 * pociągiem, dyżurny trzyma utwierdzony do przejazdu pociągu na Sz / rozkaz (automat wtedy nie działa).
 */
function attendant(how = null, { hold = false } = {}) {
  const locked = []; // { id, nr, sig } – Zz dyżurnego testu
  const fn = (sim) => {
    for (let i = locked.length - 1; i >= 0; i--) {
      const z = locked[i], tr = entryOf(sim, z.nr)?.train, p = sim.ilk.points.get(z.id);
      const passed = !tr || tr.finished || tr.nextSignal() !== z.sig;
      // zdjęcie Zz udaje się dopiero, gdy pociąg minie zwrotnicę (droga pociągu na Sz / rozkaz jest trzymana) – ponawiane
      if (passed && !sim.ilk.sections.get(p.section).physical && sim.execute({ type: 'lock', id: z.id }).ok) locked.splice(i, 1);
    }
    if (how) for (const e of sim.traffic.timetable()) {
      const sig = blockedAhead(sim, e), tr = e.train;
      if (!sig || sig.substitute || tr.hasOrderFor(sig.id)) continue;
      const act = sig.route && sim.ilk.active.get(sig.route);
      if ((!act || act.trainEntered) && !secure(sim, e, sig.id, locked)) continue;
      const b = e.from && tr.entryPending ? sim.blocks.get(e.from) : null;
      if (b && !b.auto && !b.fault && !b.koPrepared) sim.execute({ type: 'block', exit: e.from, btn: 'dKo' });
      fn.given.push({ nr: e.nr, sig: sig.id, how, at: now(sim), res: how === 'Sz' ? sim.execute({ type: 'substitute', signal: sig.id }) : sim.traffic.issueOrder({ nr: e.nr, signal: sig.id }) });
    }
    // automat: przebieg zgaszony z usterki przed pociągiem zwalnia (Pz) i zapamiętuje jako stopień wjazdu do nastawienia od
    // nowa; gdy pociąg minie semafor na Sz / rozkaz, ten stopień zostaje i blokuje dalszą obsługę pociągu (także wyjazd)
    if (hold && [...sim.ilk.active.values()].some((a) => a.faultDrop && a.signalOff && !a.trainEntered && sim.traffic.trains.some((tr) => !tr.finished && tr.nextSignal() === a.route.start))) return;
    autoDispatch(sim);
  };
  fn.given = [];
  return fn;
}
/** Zwrotnice drogi od semafora `sigId` na tor planowy (wjazd) albo na szlak (wyjazd) ustawione i zamknięte (Zz) – gotowe? */
function secure(sim, e, sigId, locked) {
  const track = (r) => String(sim.ilk.sections.get(r.sections.at(-1))?.track);
  const toExit = (r) => r.exit === e.to || (r.end.type === 'signal' && sim.ilk.routeList().some((x) => x.start === r.end.id && x.exit === e.to));
  const r = sim.ilk.routeList().find((x) => x.kind === 'train' && x.start === sigId && (e.actualArr == null ? track(x) === String(e.track) : toExit(x)));
  if (!r) return false;
  let ok = true;
  for (const q of [...r.points, ...r.flank]) {
    const p = sim.ilk.points.get(q.id);
    if (p.position === q.position && p.control && !p.moving) continue;
    ok = false;
    if (!p.moving && !p.individualLock) sim.execute({ type: 'point', id: q.id, position: q.position });
  }
  if (!ok) return false;
  for (const q of [...r.points, ...r.flank]) {
    if (sim.ilk.points.get(q.id).individualLock || sim.ilk.pointLockedByRoute(q.id)) continue;
    if (sim.execute({ type: 'lock', id: q.id }).ok) locked.push({ id: q.id, nr: e.nr, sig: sigId });
  }
  return true;
}

/**
 * Stan po naprawie poza `leftovers`: przebiegi w nastawianiu, odcinki utwierdzone (także jako droga ochronna czy stopień
 * przebiegu złożonego), semafory z przebiegiem, Sz albo usterką, zamknięcia Zz, zwrotnice bez kontroli.
 */
function hanging(sim) {
  const out = [];
  for (const p of sim.ilk.pending) out.push(`przebieg ${p.route.id} w nastawianiu`);
  for (const s of sim.ilk.sections.values()) if (s.route) out.push(`odcinek ${s.id} utwierdzony w ${s.route}`);
  for (const s of sim.ilk.signals.values()) if (s.substitute || s.route || s.failed) out.push(`semafor ${s.id}: ${JSON.stringify({ Sz: !!s.substitute, route: s.route ?? null, failed: !!s.failed })}`);
  for (const p of sim.ilk.points.values()) if (p.individualLock || p.secured || !p.control || p.moving) out.push(`zwrotnica ${p.id}: ${JSON.stringify({ Zz: !!p.individualLock, control: p.control, moving: !!p.moving })}`);
  return out;
}

/**
 * Jedna zmiana z usterką w chwili `when` (sprawdzanej także tuż przed ruchem automatu). `held` – stan, który trwa jeszcze
 * w takcie, w którym usterka zaczyna działać (domyślnie `when`; chwila „sygnał zezwalający” mija przez samą usterkę).
 * `start` – początek zmiany (tuż przed zgłoszeniem pierwszego pociągu), `until` – twardy koniec, `faults` – usterki
 * scenariusza, `repair` – numer pociągu: usterka krótka (`repairAfterWait`). `setup(sim)` – kontekst przypadku (np. nasłuch
 * zdarzeń), `watch(sim, ctx)` – obserwacja przypadku w każdym takcie.
 */
function run({ st, srk, timetable, start, until, when, held = when, fault, dispatch = attendant(), setup = null, watch = null, faults = [], repair = null }) {
  const sim = faultSim(st, { srk, timetable, startTime: start, faults });
  const obs = observer(sim), ctx = setup?.(sim) ?? {};
  const fix = repair != null ? repairAfterWait(repair, fault.type) : null;
  // usterka dodana w chwili `when` działa od następnego taktu – wtedy sprawdza się, że chwila nadal trwa (`onset`)
  const add = sim.faults.add.bind(sim.faults);
  let hit = false, added = null, onset = null;
  sim.faults.add = (f) => (added = add(f));
  const r = runWithFault(sim, {
    when: (s) => hit || when(s), fault, until,
    dispatch: (s) => { hit ||= when(s); obs.look(s); dispatch(s); },
    each: (s) => { if (!onset && added?.active) onset = { at: now(s), held: !!held(s) }; obs.each(s); fix?.(s); watch?.(s, ctx); },
  });
  return { ...r, obs, ctx, dispatch, onset, repaired: fix?.done ?? null };
}

/**
 * Usterka krótka: naprawa (automatyk), gdy pociąg `nr` gotowy do jazdy czekał `after` s przed semaforem, któremu usterka nie
 * pozwala dać sygnału zezwalającego. `Faults` nie ma „usuń usterkę” – skraca się czas trwania (liczony od `since`).
 */
function repairAfterWait(nr, type, after = 60) {
  let since = null;
  const fn = (sim) => {
    const f = !fn.done && sim.faults.list.find((x) => x.active && x.type === type);
    if (!f || !blockedAhead(sim, entryOf(sim, nr))) { since = null; return; }
    since ??= sim.clock.time;
    if (sim.clock.time - since >= after) { f.duration = sim.clock.time - f.since; fn.done = true; }
  };
  fn.done = false;
  return fn;
}

/** Wspólne asercje przypadku: chwila nastąpiła, niezmienniki, bez spadu i rozprucia, pociągi dojechały, bez kar, stan czysty. */
function check(r, msg) {
  assert.equal(r.fired, true, `${msg}: chwila nie nastąpiła (usterka nie wystąpiła)`);
  assert.equal(r.onset?.held, true, `${msg}: usterka czynna o ${r.onset?.at} – chwila już minęła`);
  assert.deepEqual(r.violations, [], `${msg}: niezmienniki`);
  assert.deepEqual(r.events, [], `${msg}: spad / rozprucie`);
  assert.deepEqual(stuck(r.sim), [], `${msg}: pociągi, które nie dojechały`);
  assert.deepEqual(unjustified(r.sim), [], `${msg}: kary za czynności wymuszone usterką`);
  assert.deepEqual(leftovers(r.sim), [], `${msg}: stan po naprawie`);
  assert.deepEqual(hanging(r.sim), [], `${msg}: przebiegi, zamknięcia i sygnały po naprawie`);
  assert.deepEqual(r.obs.noControl, [], `${msg}: przebieg przy zwrotnicy bez kontroli`);
  if (r.repaired != null) assert.equal(r.repaired, true, `${msg}: pociąg nie czekał przed semaforem z usterką (naprawa po postoju)`);
}
/** Opis przypadku do komunikatów asercji. */
const label = (st, srk, nr, moment, r) => `${st.name} ${srk}, pociąg ${nr}, ${moment}, ${r.fault?.type} ${r.fault?.target} ${Math.round((r.fault?.duration ?? 0) / 6) / 10} min`;

/** Wszystkie przypadki listy (każdy do końca – także po pierwszym błędzie); zwraca ich liczbę. */
function runAll(list) {
  const bad = [];
  for (const c of list) {
    try { c(); } catch (err) { bad.push(`${err.message.split('\n')[0]}${Array.isArray(err.actual) && err.actual.length ? ` – ${err.actual.slice(0, 3).join('; ')}` : ''}`); }
  }
  assert.deepEqual(bad, [], `${bad.length} z ${list.length} przypadków`);
  return list.length;
}

/**
 * Nastawienia przebiegów: `sets` – id przy każdym utwierdzeniu (przebieg nastawiony od nowa widać jako drugi wpis), `times` –
 * z chwilą i numerem pociągu, dla którego go nastawiono.
 */
const routeSets = (sim) => {
  const c = { sets: [], times: [] };
  sim.bus.on('route', (x) => {
    if (x.state !== 'set') return;
    // pociąg, dla którego przebieg nastawiono: ten, który ma przed sobą jego semafor (przebieg wjazdowy – także na szlaku)
    const r = sim.ilk.routes.get(x.id);
    const e = sim.traffic.timetable().find((y) => y.train && !y.train.finished && (y.train.nextSignal() === r.start || (y.train.entryPending && entryRoutes(sim, y.nr).includes(r))));
    c.sets.push(x.id); c.times.push({ id: x.id, t: sim.clock.time, nr: e?.nr ?? null });
  });
  return c;
};

/**
 * Usterka krótka – pociąg czeka przed semaforem, naprawa po minucie postoju, dalej na sygnale zezwalającym; długa (10 min) –
 * Sz albo rozkaz „S”. `variant(v, nr, type, target, opcje dyżurnego)` – część opcji `run` zależna od wariantu.
 */
const VARIANTS = [{ name: 'krótka, pociąg czeka', how: null }, { name: 'długa, Sz', how: 'Sz' }, { name: 'długa, rozkaz „S”', how: 'S' }];
const variant = (v, nr, type, target, extra = {}) => ({ fault: { type, target, duration: v.how ? 10 : 30 }, repair: v.how ? null : nr, dispatch: attendant(v.how, extra) });
const expectedPass = (how) => (!how ? 'sygnał' : how === 'Sz' ? 'Sz' : 'rozkaz');

/* ------------------------------------------------------------------ */
/* Sopot – przebieg wjazdowy wieloetapowy A → H → O (komputerowe, SBL)  */
/* ------------------------------------------------------------------ */

const osSopot = (nr, from, to, arr, dep, track) => ({ nr, kind: 'os', name: 'Regio', from, to, arr, dep, track, stop: true, length: 160, vmax: 120, dwell: 40 });
// 55104 od Gdańska Oliwy torem 1 na tor 2: A-H (tor 2a), H-O (tor 2), wyjazd O-OR1; 55106 – ten sam przejazd po naprawie
const SOPOT_TT = [osSopot(55104, 'GD1', 'OR1', '07:04', '07:06', '2'), osSopot(55106, 'GD1', 'OR1', '07:30', '07:32', '2')];
const SOPOT = { st: sopot, srk: 'komputerowe', timetable: SOPOT_TT, start: '06:55', until: '08:10' };
/** Pociąg `nr` w przebiegu `routeId` (minął jego semafor), przed semaforem `sig` i zdąży się przed nim zatrzymać. */
const inStage = (nr, routeId, sig) => (sim) => {
  const tr = entryOf(sim, nr)?.train, act = sim.ilk.active.get(routeId);
  return !!tr && !!act?.trainEntered && tr.nextSignal() === sig && canStop(tr, sig);
};
/** Pociąg `nr` stoi przy peronie (po przyjeździe, przed odjazdem). */
const standing = (nr) => (sim) => { const e = entryOf(sim, nr); return !!e?.train && e.actualArr != null && e.actualDep == null && e.train.v === 0; };

test('Sopot, semafor pośredni H z usterką, gdy pociąg jest w pierwszym stopniu przebiegu (A-H): krótka – czeka i jedzie na sygnale, długa – Sz / rozkaz „S” (0 pkt); następny pociąg na sygnale', () => {
  const n = runAll(VARIANTS.map((v) => () => {
    const r = run({ ...SOPOT, when: inStage(55104, 'A-H', 'H'), ...variant(v, 55104, 'signal-fail', 'H') });
    const msg = label(sopot, 'komputerowe', 55104, `w przebiegu A-H przed H, usterka ${v.name}`, r);
    check(r, msg);
    assert.ok(r.obs.waited.has('55104 H'), `${msg}: 55104 czekał przed H z usterką`);
    assert.deepEqual(passesOf(r, 'H'), [`55104: ${expectedPass(v.how)}`, '55106: sygnał'], `${msg}: minięcia H`);
    assert.deepEqual(passesOf(r, 'A'), ['55104: sygnał', '55106: sygnał'], `${msg}: minięcia A`);
    assert.deepEqual([scores(r.sim, 'Sz'), scores(r.sim, 'order')], [v.how === 'Sz' ? [0] : [], v.how === 'S' ? [0] : []], `${msg}: Sz / rozkaz`);
    assert.equal(String(entryOf(r.sim, 55104).actualTrack), '2', `${msg}: tor przyjazdu`);
  }));
  assert.equal(n, 3);
});

test('Sopot, zajętość bez pociągu w drugim stopniu (H-O), gdy pociąg jest w pierwszym (A-H): H na „Stój”, krótka – czeka i po naprawie H-O od nowa, długa – Sz / rozkaz „S” (0 pkt), doraźne zwolnienie bez kary', () => {
  const list = [];
  for (const target of ['E2a', 'T2']) for (const v of VARIANTS) {
    if (target === 'T2' && !v.how) continue; // krótka: odcinek drogi za semaforem H wystarcza
    list.push(() => {
      const r = run({ ...SOPOT, when: inStage(55104, 'A-H', 'H'), ...variant(v, 55104, 'false-occupancy', target, { hold: !!v.how }), setup: routeSets });
      const msg = label(sopot, 'komputerowe', 55104, `w przebiegu A-H przed H, usterka ${v.name}`, r);
      check(r, msg);
      assert.ok(r.obs.waited.has('55104 H'), `${msg}: 55104 czekał przed H przy zajętości z usterki`);
      assert.deepEqual(passesOf(r, 'H'), [`55104: ${expectedPass(v.how)}`, '55106: sygnał'], `${msg}: minięcia H`);
      assert.deepEqual([scores(r.sim, 'Sz'), scores(r.sim, 'order')], [v.how === 'Sz' ? [0] : [], v.how === 'S' ? [0] : []], `${msg}: Sz / rozkaz`);
      // przebieg H-O: pierwszy raz dla 55104, zgaszony z usterki; bez Sz / rozkazu nastawiony od nowa po naprawie; potem 55106
      // (to zachowanie automatu – zwalnia zgaszony przebieg i nastawia go od nowa – nie reguła urządzeń)
      assert.deepEqual(r.ctx.sets.filter((id) => id === 'H-O').length, v.how ? 2 : 3, `${msg}: nastawienia H-O (${r.ctx.sets.join(', ')})`);
      assert.equal(String(entryOf(r.sim, 55104).actualTrack), '2', `${msg}: tor przyjazdu`);
      // pociąg przejechał E2a przy trwającej usterce – przebieg H-O sam się nie rozwiąże, doraźne zwolnienie uzasadnione
      assert.deepEqual(scores(r.sim, 'dPz'), v.how && target === 'E2a' ? [0] : [], `${msg}: doraźne zwolnienie`);
    });
  }
  assert.equal(runAll(list), 5);
});

test('Sopot, semafor wyjazdowy O z usterką, pociąg stoi przy peronie toru 2 (po przebiegu wieloetapowym): krótka – odjazd na sygnale po naprawie, długa – Sz / rozkaz „S” (0 pkt, SBL bez dPo)', () => {
  const n = runAll(VARIANTS.map((v) => () => {
    const r = run({ ...SOPOT, when: standing(55104), ...variant(v, 55104, 'signal-fail', 'O') });
    const msg = label(sopot, 'komputerowe', 55104, `pociąg przy peronie, usterka ${v.name}`, r);
    check(r, msg);
    assert.ok(r.obs.waited.has('55104 O'), `${msg}: 55104 czekał przed O z usterką`);
    assert.deepEqual(passesOf(r, 'O'), [`55104: ${expectedPass(v.how)}`, '55106: sygnał'], `${msg}: minięcia O`);
    assert.deepEqual([scores(r.sim, 'Sz'), scores(r.sim, 'order'), scores(r.sim, 'dPo')], [v.how === 'Sz' ? [0] : [], v.how === 'S' ? [0] : [], []], `${msg}: Sz / rozkaz / dPo`);
  }));
  assert.equal(n, 3);
});

/* ------------------------------------------------------------------ */
/* Chylonia – wyjazd dwustopniowy G502 → A502 → szlak (komputerowe, SBL) */
/* ------------------------------------------------------------------ */

const skmChylonia = (nr, arr, dep) => ({ nr, kind: 'os', name: 'SKM', from: 'GS1', to: 'RS1', arr, dep, track: '502', stop: true, length: 130, dwell: 30 });
// 93109 od Gdyni Głównej na tor 502, wyjazd do Cisowej: G502-A502, A502-RS1; 93111 – ten sam przejazd po naprawie
const CHYLONIA = { st: chylonia, srk: 'komputerowe', timetable: [skmChylonia(93109, '07:02', '07:03'), skmChylonia(93111, '07:26', '07:27')], start: '06:54', until: '08:00' };

// Sopot w drugą stronę: 55201 od Orłowa na tor 1, wyjazd do Gdańska Oliwy L-C (tor 1a), C-GD2; 55203 – po naprawie
const SOPOT_WEST = { st: sopot, srk: 'komputerowe', timetable: [osSopot(55201, 'OR2', 'GD2', '07:04', '07:06', '1'), osSopot(55203, 'OR2', 'GD2', '07:30', '07:32', '1')], start: '06:55', until: '08:10' };

test('Wyjazd dwustopniowy (Chylonia G502 → A502 → Cisowa, Sopot L → C → Gdańsk Oliwa): semafor drugiego stopnia z usterką, pociąg przy peronie i w pierwszym stopniu – krótka: czeka, długa: Sz / rozkaz „S” (0 pkt); następny pociąg na sygnale', () => {
  const list = [];
  const plans = [
    { st: chylonia, base: CHYLONIA, nr: 93109, next: 93111, first: 'G502', sig: 'A502', stage: 'G502-A502', exit: 'RS1', track: '502' },
    { st: sopot, base: SOPOT_WEST, nr: 55201, next: 55203, first: 'L', sig: 'C', stage: 'L-C', exit: 'GD2', track: '1' },
  ];
  for (const p of plans) for (const [moment, when] of [[`pociąg przy peronie toru ${p.track}`, standing(p.nr)], [`pociąg w przebiegu ${p.stage}`, inStage(p.nr, p.stage, p.sig)]]) for (const v of VARIANTS) {
    list.push(() => {
      const r = run({ ...p.base, when, ...variant(v, p.nr, 'signal-fail', p.sig) });
      const msg = label(p.st, 'komputerowe', p.nr, `${moment}, usterka ${v.name}`, r);
      check(r, msg);
      assert.ok(r.obs.waited.has(`${p.nr} ${p.sig}`), `${msg}: ${p.nr} czekał przed ${p.sig} z usterką`);
      assert.deepEqual(passesOf(r, p.first), [`${p.nr}: sygnał`, `${p.next}: sygnał`], `${msg}: minięcia ${p.first}`);
      assert.deepEqual(passesOf(r, p.sig), [`${p.nr}: ${expectedPass(v.how)}`, `${p.next}: sygnał`], `${msg}: minięcia ${p.sig}`);
      assert.deepEqual([scores(r.sim, 'Sz'), scores(r.sim, 'order'), scores(r.sim, 'dPo')], [v.how === 'Sz' ? [0] : [], v.how === 'S' ? [0] : [], []], `${msg}: Sz / rozkaz / dPo`);
      assert.equal(entryOf(r.sim, p.nr).actualExit, p.exit, `${msg}: szlak odjazdu`);
    });
  }
  assert.equal(runAll(list), 12);
});

/* ------------------------------------------------------------------ */
/* Rumia, Jodłowa, Brzezina – blokada Eap jednokierunkowa i SBL         */
/* ------------------------------------------------------------------ */

/** Rodzaj blokady szlaku `exitId`: 'sbl', 'eap1' (Eap jednokierunkowa, tor linii dwutorowej) albo 'eap2'. */
const kindOf = (st, exitId) => (st.exits[exitId].block === 'sbl' ? 'sbl' : st.exits[exitId].direction ? 'eap1' : 'eap2');
const osLine = (nr, from, to, arr, dep, track, extra = {}) => ({ nr, kind: 'os', name: 'Osobowy', from, to, arr, dep, track, stop: true, length: 130, vmax: 100, dwell: 45, ...extra });
const towLine = (nr, from, to, arr, dep, track, length) => ({ nr, kind: 'tow', name: 'Towarowy', from, to, arr, dep, track, stop: true, length, vmax: 70, dwell: 60 });
const skmRumia = (nr, from, to) => ({ nr, kind: 'os', name: 'SKM', from, to, arr: '07:10', dep: '07:11', track: '5', stop: true, length: 130, dwell: 30 });

/**
 * Pociągi wzorcowe (z rozkładów stacji). `start` – początek zmiany tuż przed zgłoszeniem pociągu. `points` – strony
 * (wjazd / wyjazd), na których zwrotnicę drogi pociągu trzeba przestawić (usterka napędu objawia się dopiero przy
 * przestawianiu); `pre` – pociąg wcześniej na innym torze, po którym zwrotnice stoją w innym położeniu, `preStart` – start z nim.
 *  - Rumia: SKM od Cisowej (SBL) na tor 5 i do Redy torem 1 (Eap jednokierunkowa; wjazd A2-O bez przestawiania zwrotnic);
 *    SKM od Redy (Eap) na tor 5 i do Cisowej dwustopniowo C → G311 (SBL),
 *  - Jodłowa: Eap jednokierunkowa w obie strony (3301 K2 → Z2 tor 2 po towarowym 42801 na torze 3; 3302 Z1 → K1 tor 1 –
 *    wjazd B-D1 bez zwrotnic, wyjazd D1-K1 przez zwrotnicę 1 w położeniu zasadniczym),
 *  - Brzezina: SBL (9101 T2 → K2 tor 2 po towarowym 49101 na torze 4).
 */
const LINE = [
  { st: rumia, srks: ['E', 'komputerowe'], def: skmRumia(93209, 'GS1', 'RD1'), start: '07:02', points: ['wyjazd'] },
  { st: rumia, srks: ['E', 'komputerowe'], def: skmRumia(93210, 'RD2', 'GS2'), start: '07:00:30', points: ['wjazd', 'wyjazd'] },
  { st: jodlowa, srks: ['E', 'komputerowe'], def: osLine(3301, 'K2', 'Z2', '07:12', '07:13', '2'), start: '07:02', points: ['wjazd', 'wyjazd'], pre: towLine(42801, 'K2', 'Z2', '07:00', '07:02', '3', 380), preStart: '06:48' },
  { st: jodlowa, srks: ['E', 'komputerowe'], def: osLine(3302, 'Z1', 'K1', '07:12', '07:13', '1'), start: '07:02', points: [] },
  { st: brzezina, srks: ['ebilock'], def: osLine(9101, 'T2', 'K2', '07:12', '07:13', '2', { length: 120, vmax: 120, dwell: 60 }), start: '07:03', points: ['wjazd', 'wyjazd'], pre: towLine(49101, 'T2', 'K2', '07:00', '07:02', '4', 450), preStart: '06:48' },
];
const plus = (hhmm, min) => Clock.format(Clock.parse(hhmm) + min * 60, true);
const trackOf = (sim, sid) => String(sim.ilk.sections.get(sid)?.track);
/** Przebieg wjazdowy na tor planowy i przebiegi wyjazdowe (pierwszy stopień) z toru planowego pociągu `nr`. */
const plannedEntry = (sim, nr) => entryRoutes(sim, nr).find((r) => trackOf(sim, r.sections.at(-1)) === String(entryOf(sim, nr).track));
const plannedExit = (sim, nr) => { const e = entryOf(sim, nr); return sim.ilk.routeList().filter((r) => r.kind === 'train' && trackOf(sim, r.approach) === String(e.track) && (r.exit === e.to || (r.end.type === 'signal' && sim.ilk.routeList().some((x) => x.start === r.end.id && x.exit === e.to)))); };
/**
 * Pierwsza zwrotnica przebiegu, którą trzeba przestawić, nieutwierdzona i nie w ruchu – albo null. `moving` – także
 * zwrotnica, którą automat właśnie przestawia do nastawianego przebiegu (usterka zacznie się przed końcem przestawiania).
 */
const toMove = (sim, routes, moving = false) => routes.flatMap((r) => r.points).find((q) => {
  const p = sim.ilk.points.get(q.id);
  return p.position !== q.position && (moving ? ![...sim.ilk.active.values()].some((a) => a.lockedPoints.has(q.id)) : !p.moving && !sim.ilk.pointLockedByRoute(q.id));
})?.id ?? null;

/** Przypadki jednego pociągu na jednym stanowisku: usterka semafora wjazdowego i wyjazdowego, tor docelowy zajęty, napęd zwrotnicy. */
function lineCases({ st, srk, def, start, points, pre, preStart }) {
  const nr = def.nr, until = plus(start, 40), base = { st, srk, timetable: [def], start, until };
  const inKind = kindOf(st, def.from), outKind = kindOf(st, def.to);
  const where = `tor ${def.track} ${def.from} (${inKind}) → ${def.to} (${outKind})`;
  const list = [];
  // przebieg wjazdowy nastawiony: usterka gasi semafor albo rozwiązuje przebieg – w takcie usterki pociąg jest jeszcze przed semaforem
  const beforeEntry = (sim) => !!entryOf(sim, nr).train?.entryPending;
  const signalCase = (moment, when, type, tgt, side) => VARIANTS.map((v) => () => {
    const r = run({ ...base, when, held: side === 'wjazd' ? beforeEntry : when, ...variant(v, nr, type, tgt) });
    const msg = label(st, srk, nr, `${where}, ${moment}, usterka ${v.name}`, r);
    check(r, msg);
    const sig = type === 'signal-fail' ? r.fault.target : entryRoutes(r.sim, nr)[0].start;
    assert.ok(r.obs.waited.has(`${nr} ${sig}`), `${msg}: ${nr} czekał przed ${sig} (${[...r.obs.waited].join(', ')})`);
    assert.deepEqual(passesOf(r, sig), [`${nr}: ${expectedPass(v.how)}`], `${msg}: minięcia ${sig}`);
    assert.deepEqual([scores(r.sim, 'Sz'), scores(r.sim, 'order')], [v.how === 'Sz' ? [0] : [], v.how === 'S' ? [0] : []], `${msg}: Sz / rozkaz`);
    // wjazd z toru Eap bez stwierdzenia przejazdu: dKo przed Sz / rozkazem (0 pkt); wyjazd na tor Eap bez sygnału: dPo (0 pkt)
    assert.deepEqual(scores(r.sim, 'dKo'), v.how && side === 'wjazd' && inKind !== 'sbl' ? [0] : [], `${msg}: dKo`);
    assert.deepEqual(scores(r.sim, 'dPo'), v.how && side === 'wyjazd' && outKind !== 'sbl' ? [0] : [], `${msg}: dPo`);
    assert.equal(String(entryOf(r.sim, nr).actualTrack), String(def.track), `${msg}: tor przyjazdu`);
  });
  list.push(...signalCase('przebieg wjazdowy nastawiony', at.entrySet(nr), 'signal-fail', (sim) => entryActive(sim, nr)?.route.start, 'wjazd'));
  list.push(...signalCase('pociąg przy peronie', standing(nr), 'signal-fail', (sim) => entryOf(sim, nr).train.nextSignal(), 'wyjazd'));
  list.push(...signalCase('przebieg wjazdowy nastawiony, tor docelowy', at.entrySet(nr), 'false-occupancy', (sim) => entryActive(sim, nr)?.route.sections.at(-1), 'wjazd'));
  for (const side of points) list.push(() => {
    const entry = side === 'wjazd';
    const routes = (sim) => (entry ? [plannedEntry(sim, nr)] : plannedExit(sim, nr));
    const when = entry ? (sim) => { const e = entryOf(sim, nr); return e.requested && !entryActive(sim, nr) && !e.train?.entered && !!toMove(sim, routes(sim)); } : standing(nr);
    const r = run({ ...base, timetable: pre ? [pre, def] : [def], start: pre ? preStart : start, when, held: entry ? (sim) => !entryOf(sim, nr).train?.entered : when, fault: { type: 'point-control', target: (sim) => toMove(sim, routes(sim), true), duration: 30 }, repair: nr, setup: routeSets });
    const msg = label(st, srk, nr, `${where}${pre ? ` (po ${pre.nr} na torze ${pre.track})` : ''}, zwrotnica przebiegu ${entry ? 'wjazdowego (pociąg zgłoszony)' : 'wyjazdowego (pociąg przy peronie)'}`, r);
    check(r, msg);
    const end = r.fault.since + r.fault.duration, pid = r.fault.target;
    const sets = r.ctx.times.filter((x) => r.sim.ilk.routes.get(x.id).points.some((q) => q.id === pid) && x.nr === nr);
    assert.ok(sets.length && sets.every((x) => x.t >= end), `${msg}: przebieg przez ${pid} utwierdzony dopiero po naprawie (${sets.map((x) => `${x.id} ${Clock.format(x.t, true)}`).join(', ')}; naprawa ${Clock.format(end, true)})`);
    const sig = entry ? plannedEntry(r.sim, nr).start : plannedExit(r.sim, nr)[0].start;
    assert.ok(r.obs.waited.has(`${nr} ${sig}`), `${msg}: ${nr} czekał przed ${sig} przy zwrotnicy bez kontroli (${[...r.obs.waited].join(', ')})`);
    assert.deepEqual(r.obs.passes.filter((x) => x.startsWith(`${nr} `)).map((x) => x.split(': ')[1]).filter((x) => x !== 'sygnał'), [], `${msg}: minięcia semaforów na sygnale zezwalającym`);
    assert.deepEqual([...scores(r.sim, 'Sz'), ...scores(r.sim, 'order')], [], `${msg}: Sz / rozkaz`);
    assert.equal(String(entryOf(r.sim, nr).actualTrack), String(def.track), `${msg}: tor przyjazdu`);
  });
  return list;
}

for (const station of [rumia, jodlowa, brzezina]) {
  const defs = LINE.filter((x) => x.st === station);
  const desc = { rumia: 'Rumia (E, komputerowe): Eap jednokierunkowa od Redy, SBL od Cisowej', jodlowa: 'Jodłowa (E, komputerowe): Eap jednokierunkowa', brzezina: 'Brzezina (EBILock 950): SBL' }[station.id];
  test(`${desc} – usterka semafora wjazdowego i wyjazdowego, tor docelowy zajęty bez pociągu (krótka – pociąg czeka, długa – Sz / rozkaz „S” z dKo / dPo, 0 pkt), napęd zwrotnicy przebiegu`, () => {
    const list = defs.flatMap((d) => d.srks.flatMap((srk) => lineCases({ ...d, srk })));
    assert.equal(runAll(list), defs.reduce((n, d) => n + d.srks.length * (9 + d.points.length), 0));
  });
}

/* ------------------------------------------------------------------ */
/* SBL bez łączności – dwa pociągi po sobie na jednym torze (Brzezina) */
/* ------------------------------------------------------------------ */

const osBrzezina = (nr, arr, dep, track) => osLine(nr, 'T2', 'K2', arr, dep, track, { length: 120, vmax: 120, dwell: 60 });
/** Telefonogramy przyjęte przez sąsiada („formuła numer”) – `sim.comms.send` z zapisem. */
const phoneLog = (sim) => {
  const c = { sent: [], at: {} };
  const send = sim.comms.send.bind(sim.comms);
  sim.comms.send = (id, p, o) => { const res = send(id, p, o); if (res.ok) { c.sent.push(`${id} ${p.nr}`); c.at[`${id} ${p.nr}`] ??= sim.clock.time; } return res; };
  return c;
};
/** Kary za pominięte czynności zapowiadania (brak dPo, brak zawiadomienia o odjeździe). */
const missed = (sim) => sim.score.items.filter((i) => ['no-dpo', 'no-depart-report'].includes(i.code)).map((i) => `${i.code} ${i.points}: ${i.msg}`);

test('SBL bez łączności (Brzezina): dwa pociągi po sobie na tym samym torze – drugi wjeżdża na szlak dopiero po telefonicznym potwierdzeniu przyjazdu pierwszego, nigdy dwa pociągi na torze szlakowym', () => {
  const cases = [
    // przyjazd: 9101 i 9105 od Topolna torem T2; sąsiad chce wyprawić 9105, gdy 9101 jeszcze jedzie
    { exit: 'T2', side: 'przyjazd', first: 9101, second: 9105, timetable: [osBrzezina(9101, '07:12', '07:13', '2'), osBrzezina(9105, '07:14', '07:15', '4')],
      confirmed: (sim, c) => c.at['arrived 9101'], onLine: (sim) => entryOf(sim, 9105).dispatched },
    // odjazd: 9101 i 9105 do Klonowa torem K2; 9105 gotowy do odjazdu, gdy 9101 jeszcze jest na szlaku
    { exit: 'K2', side: 'odjazd', first: 9101, second: 9105, timetable: [osBrzezina(9101, '07:10', '07:12', '2'), osBrzezina(9105, '07:11', '07:13', '4')],
      confirmed: (sim) => (String(sim.blocks.get('K2').phone.arrivalConfirmed) === '9101' ? sim.clock.time : null), onLine: (sim) => !!entryOf(sim, 9105).train?.onLine('K2') },
  ];
  const n = runAll(cases.map((c) => () => {
    const r = run({ st: brzezina, srk: 'ebilock', timetable: c.timetable, start: '07:01', until: '08:15', when: () => true, fault: { type: 'block-fail', target: c.exit, duration: 40 },
      setup: phoneLog, watch: (sim, ctx) => { ctx.confirmedAt ??= c.confirmed(sim, ctx) ?? null; if (ctx.secondAt == null && c.onLine(sim)) ctx.secondAt = sim.clock.time; } });
    const msg = `Brzezina ebilock, ${c.side} ${c.first} i ${c.second} torem ${c.exit}, block-fail ${c.exit} 40 min`;
    check(r, msg);
    assert.deepEqual(missed(r.sim), [], `${msg}: pominięte czynności zapowiadania`);
    assert.equal(r.sim.blocks.get(c.exit).counters.dKo + r.sim.blocks.get(c.exit).counters.dPo, 0, `${msg}: dKo / dPo na SBL`);
    const [conf, second] = [r.ctx.confirmedAt, r.ctx.secondAt];
    assert.ok(conf != null && second != null && second >= conf, `${msg}: ${c.second} na szlaku o ${Clock.format(second ?? 0, true)}, przyjazd ${c.first} potwierdzony o ${Clock.format(conf ?? 0, true)}`);
    // sąsiad / automat chciał wyprawić drugi pociąg wcześniej – reguła naprawdę go zatrzymała
    const e2 = entryOf(r.sim, c.second), planned = c.side === 'przyjazd' ? e2.neighbourDep : e2.depTime;
    assert.ok(planned < conf, `${msg}: ${c.second} planowo o ${Clock.format(planned, true)}, przed potwierdzeniem przyjazdu ${c.first}`);
    if (c.side === 'przyjazd') assert.ok(r.ctx.sent.includes('arrived 9101') && r.ctx.sent.includes('arrived 9105'), `${msg}: przyjazdy zawiadomione (${r.ctx.sent.join(', ')})`);
    else assert.ok(r.ctx.sent.includes('departed 9101') && r.ctx.sent.includes('departed 9105'), `${msg}: odjazdy zawiadomione (${r.ctx.sent.join(', ')})`);
  }));
  assert.equal(n, 2);
});

/* ------------------------------------------------------------------ */
/* Sopot – jazda po torze lewym jako odpowiedź na usterkę               */
/* ------------------------------------------------------------------ */

// 9001 od Orłowa na tor 1, planowo do Gdańska Oliwy torem 2 (GD2): L-C, C-GD2; 55104 od Gdańska Oliwy torem 1 (GD1)
const LEFT_TT = [osSopot(9001, 'OR2', 'GD2', '07:02', '07:06', '1'), osSopot(55104, 'GD1', 'OR1', '07:12', '07:13', '2')];

/**
 * Dyżurny testu: gdy pociąg `nr` stoi przy peronie, a `why(sim)` (usterka toru właściwego) trwa, wyprawia go torem lewym
 * GD1 – przy sprawnej blokadzie zgoda sąsiada na zmianę kierunku (Zk), przy blokadzie bez łączności zapytanie o drogę
 * („Czy droga dla pociągu nr … jest wolna?”: `ask(sim, nr)`) – i przebieg złożony L → C → szlak GD1. Potem automat.
 */
function leftTrack(nr, why, ask = (sim) => sim.blocks.get('GD1').phoneAskNeighbour(nr)) {
  const st = { zk: null, asked: null, route: null };
  const fn = (sim) => {
    const e = entryOf(sim, nr), tr = e?.train, b = sim.blocks.get('GD1');
    if (!st.route && tr && e.actualArr != null && e.actualDep == null && tr.v === 0 && why(sim)) {
      if (b.fault) st.asked ??= ask(sim, nr);
      else if (b.direction !== 'out' && b.request !== 'ours') st.zk = sim.execute({ type: 'block', exit: 'GD1', btn: 'Zk' });
      if (b.fault ? String(b.phone.permissionFor) === String(nr) : b.direction === 'out') {
        st.route = sim.execute({ type: 'route', start: tr.nextSignal(), end: sim.ilk.routes.get('C-GD1').endButton, kind: 'train', compound: true });
      }
    }
    autoDispatch(sim);
  };
  fn.state = st;
  return fn;
}
/**
 * Szlaki w każdym takcie: GD1 zajęty, gdy jest na nim 9001; GD2 nigdy zajęty. `arrived` – 9001 u sąsiada, `dispatched` –
 * sąsiad wyprawił 55104 torem GD1.
 */
const lineSides = () => ({ onGD1: 0, bad: [], arrived: null, dispatched: null });
function watchLines(sim, c) {
  const tr = entryOf(sim, 9001)?.train, gd1 = sim.blocks.get('GD1'), gd2 = sim.blocks.get('GD2');
  if (c.arrived == null && entryOf(sim, 9001).status === 'na następnym posterunku') c.arrived = sim.clock.time;
  if (c.dispatched == null && entryOf(sim, 55104).dispatched) c.dispatched = sim.clock.time;
  if (tr && sim.traffic.trains.includes(tr) && tr.onLine('GD1')) { c.onGD1++; if (!gd1.occupied && c.bad.length < 3) c.bad.push(`${now(sim)} 9001 na GD1, blokada wolna`); }
  if ((gd2.occupied || sim.traffic.trains.some((t) => t.onLine('GD2'))) && c.bad.length < 3) c.bad.push(`${now(sim)} GD2 zajęty`);
}
const LEFT_CASES = [
  { name: 'zajętość bez pociągu W1a (tor 2 do Gdańska) – Zk na sprawnym GD1', fault: { type: 'false-occupancy', target: 'W1a', duration: 30 }, faults: [] },
  { name: 'blokada GD2 bez łączności – Zk na sprawnym GD1', fault: { type: 'block-fail', target: 'GD2', duration: 30 }, faults: [] },
  { name: 'zajętość bez pociągu W1a, blokada GD1 bez łączności – „droga wolna” telefonicznie', fault: { type: 'false-occupancy', target: 'W1a', duration: 30 }, faults: [{ type: 'block-fail', target: 'GD1', at: '06:55', duration: 30 }] },
];
function leftCase(c, ask) {
  const d = leftTrack(9001, (sim) => sim.faults.list.some((f) => f.active && f.target === c.fault.target), ask);
  const r = run({ st: sopot, srk: 'komputerowe', timetable: c.timetable ?? LEFT_TT, start: '06:53', until: '08:00', faults: c.faults, when: standing(9001), fault: c.fault, dispatch: d, setup: lineSides, watch: watchLines });
  const msg = `Sopot komputerowe, 9001 OR2 → GD2 z toru 1 torem lewym GD1, pociąg przy peronie, ${c.name}`;
  return { r, d, msg };
}
/** Bezpieczeństwo jazdy po torze lewym: niezmienniki, przebieg na GD1, zajętość szlaków, szlak odjazdu, bez kary za tor. */
function checkLeftSafety({ r, d, msg }) {
  assert.equal(r.fired, true, `${msg}: chwila nie nastąpiła (usterka nie wystąpiła)`);
  assert.equal(r.onset?.held, true, `${msg}: usterka czynna o ${r.onset?.at} – chwila już minęła`);
  assert.deepEqual(r.violations, [], `${msg}: niezmienniki`);
  assert.deepEqual(r.events, [], `${msg}: spad / rozprucie`);
  assert.deepEqual(unjustified(r.sim), [], `${msg}: kary za czynności wymuszone usterką`);
  assert.equal(d.state.route?.ok, true, `${msg}: przebieg złożony na GD1 (${d.state.route?.reason ?? 'nie nastawiany'})`);
  assert.ok(r.ctx.onGD1 > 0, `${msg}: 9001 jechał torem GD1`);
  assert.deepEqual(r.ctx.bad, [], `${msg}: zajętość szlaków`);
  assert.equal(entryOf(r.sim, 9001).actualExit, 'GD1', `${msg}: szlak odjazdu`);
  assert.deepEqual(scores(r.sim, 'wrong-track'), [], `${msg}: kara za tor`);
  // sąsiad chciał wyprawić 55104 torem 1, gdy jechał nim 9001 – wyprawił go dopiero po przyjeździe 9001
  const [arrived, dispatched, planned] = [r.ctx.arrived, r.ctx.dispatched, entryOf(r.sim, 55104).neighbourDep];
  assert.ok(arrived != null && dispatched != null && planned < arrived && dispatched >= arrived, `${msg}: 55104 planowo z Gdańska Oliwy o ${Clock.format(planned, true)}, wyprawiony o ${Clock.format(dispatched ?? 0, true)}, 9001 u sąsiada o ${Clock.format(arrived ?? 0, true)}`);
}
/** Po naprawie: wszystkie pociągi dojechały, stan czysty, blokady GD1 / GD2 w stanie zasadniczym (kierunek, odstęp wolny). */
function checkLeft(x) {
  checkLeftSafety(x);
  const { r, msg } = x;
  check(r, msg);
  for (const id of ['GD1', 'GD2']) { const b = r.sim.blocks.get(id); assert.deepEqual([b.direction, b.poBlocked, b.permission], [b.fixed, false, false], `${msg}: blokada ${id} w stanie zasadniczym (kierunek, odstęp zajęty, pozwolenie)`); }
}

test('Sopot, jazda po torze lewym jako odpowiedź na usterkę toru 2 do Gdańska: 9001 torem GD1 po Zk, GD2 wolny, bez kary za tor, jeden pociąg na szlaku', () => {
  assert.equal(runAll(LEFT_CASES.slice(0, 2).map((c) => () => checkLeft(leftCase(c)))), 2);
});

// Stan blokady GD1 po naprawie i następny pociąg od Gdańska – osobny test niżej
test('Sopot, tor lewy przy blokadzie GD1 bez łączności: po „droga wolna” 9001 torem GD1, GD2 wolny, bez kary za tor, jeden pociąg na szlaku', () => {
  checkLeftSafety(leftCase(LEFT_CASES[2]));
});

// wcześniej po naprawie odstęp zostawał zajęty (poBlocked): Block.setFault(false) sprawdzał przyjazd naszego pociągu po
// phone.arrivalConfirmed, które nadpisał telefonogram o przyjeździe pociągu sąsiada – sąsiad nie wyprawiał już nic torem 1
test('Sopot, tor lewy przy blokadzie GD1 bez łączności: po naprawie odstęp GD1 wolny, następny pociąg od Gdańska', () => {
  checkLeft(leftCase({ ...LEFT_CASES[2], timetable: [...LEFT_TT, osSopot(55106, 'GD1', 'OR1', '07:40', '07:41', '2')] }));
});

// wcześniej Comms „ask-free” szukał pociągu po e.to === exit – dla jazdy po torze lewym odmawiał i dawał −5 comms-wrong
test('Sopot, tor lewy przy blokadzie GD1 bez łączności: zapytanie o drogę telefonogramem (Łączność) dla pociągu, który planowo jedzie torem GD2', () => {
  const x = leftCase(LEFT_CASES[2], (sim, nr) => sim.comms.send('ask-free', { exit: 'GD1', nr }));
  assert.equal(x.d.state.asked?.ok, true, `${x.msg}: zapytanie „Czy droga dla pociągu nr 9001 jest wolna?” do Gdańska Oliwy torem 1 (${x.d.state.asked?.reason})`);
  checkLeftSafety(x);
  assert.deepEqual(scores(x.r.sim, 'comms-wrong'), [], `${x.msg}: kara za telefonogram`);
});
