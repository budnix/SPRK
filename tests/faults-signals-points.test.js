import { test } from 'node:test';
import assert from 'node:assert/strict';
import szkolna from '../src/stations/szkolna.js';
import kalinowo from '../src/stations/kalinowo.js';
import { Interlocking } from '../src/model/Interlocking.js';
import { EMERGENCY_BRAKE } from '../src/model/Train.js';
import { autoDispatch, allArrived, play, routeView, routeViews } from './helpers.js';
import { faultSim, runWithFault, at, target, entryActive, exitActive, entryRoutes, stuck, Clock } from './fault-harness.js';
import { unjustified, leftovers } from '../src/model/check/outcome.js';

/*
 * Usterki semafora (signal-fail) i napędu zwrotnicy (point-control) w wybranej chwili jazdy pociągu
 * (podstawa: `tests/fault-harness.js`). Pięć stanowisk na Szkolnej, MOR-3 na Kalinowie, oba kierunki jazdy.
 *
 *  - semafor wjazdowy: pociąg zgłoszony, przebieg nastawiony, pociąg stoi przed semaforem (tor planowy zajęty), semafor
 *    gaśnie tuż przed pociągiem (bliżej niż droga hamowania nagłego),
 *  - semafor wyjazdowy (tor 1 i 2): pociąg stoi przy peronie, przebieg wyjazdowy nastawiony; pociąg przelotowy – semafor
 *    gaśnie tuż przed nim,
 *  - usterka krótka (naprawa, zanim pociąg potrzebuje semafora; przebieg nastawia się w czasie usterki, gdy chwila na to
 *    pozwala), średnia (pociąg
 *    czeka przed semaforem z usterką przy nastawionym przebiegu, po naprawie jedzie na sygnale zezwalającym) i długa
 *    (pociąg jedzie na Sz albo na rozkaz „S”); drugi pociąg po naprawie mija ten sam semafor na sygnale zezwalającym,
 *  - zwrotnica przebiegu wjazdowego i wyjazdowego przestawiana w czasie usterki (przebieg utwierdza się dopiero po naprawie),
 *    zwrotnica poza drogą pociągu i zwrotnica w drodze bez przestawiania (bez wpływu na ruch).
 *
 * Ruch prowadzi automat. Automat nie podaje Sz ani rozkazu przy semaforze z usterką (czeka na naprawę), więc przy długich
 * usterkach robi to „dyżurny” testu: pociąg stoi przed semaforem z usterką, przebieg jest nastawiony – przy wjeździe ze
 * szlaku najpierw dKo (Ko zadziała po wjeździe bez sygnału zezwalającego), potem Sz albo rozkaz „S”. Gdy semafor wjazdowy
 * gaśnie tuż przed pociągiem, „dyżurny” testu naciska dKo zaraz po alarmie (automat – dopiero po przybyciu pociągu).
 */

const SZKOLNA = ['E', 'komputerowe', 'izh111', 'mech', 'ebilock'];
const PANELS = [...SZKOLNA.map((srk) => ({ st: szkolna, srk })), { st: kalinowo, srk: 'mor3' }];
const DIRS = [['W', 'E'], ['E', 'W']];
const LENGTH = { szkolna: 130, kalinowo: 110 };
const os = (st, nr, from, to, arr, dep, track) => ({ nr, kind: 'os', name: 'Osobowy', from, to, arr, dep, track, stop: true, length: LENGTH[st.id], vmax: 100, dwell: 60 });
const tow = (nr, from, to, arr, track) => ({ nr, kind: 'tow', name: 'Towarowy', from, to, arr, track, stop: false, length: 380, vmax: 70 });
/**
 * Usterka krótka – naprawa, zanim pociąg potrzebuje semafora; średnia – pociąg czeka przed semaforem z usterką (przebieg
 * nastawiony) i po naprawie jedzie na sygnale zezwalającym; długa – pociąg jedzie na Sz albo na rozkaz „S”. Czas usterki
 * krótkiej i średniej zależy od chwili (`short`, `mid` w chwili), długa – 10 min.
 */
const VARIANTS = [{ name: 'krótka', dur: 'short' }, { name: 'średnia, naprawa w czasie postoju', dur: 'mid' }, { name: 'długa, Sz', dur: 'long', how: 'Sz' }, { name: 'długa, rozkaz „S”', dur: 'long', how: 'S' }];
const durationOf = (m, v) => (v.dur === 'long' ? 10 : m[v.dur]);

const entryOf = (sim, nr) => sim.traffic.timetable().find((e) => e.nr === nr);
const trackOf = (sim, sid) => String(sim.ilk.sections.get(sid)?.track);
/** Odległość czoła pociągu od semafora `sig` (m) albo undefined. */
const distTo = (tr, sig) => tr.constraintsAhead(1500, true).find((c) => c.signal === sig && (c.kind === 'signal' || c.kind === 'passed-signal'))?.dist;
/** Pociąg nie zatrzyma się przed semaforem nawet hamowaniem nagłym (z zapasem 40 m). */
const tooClose = (tr, sig) => { const d = distTo(tr, sig); return d != null && d > 5 && d < (tr.v * tr.v) / (2 * EMERGENCY_BRAKE) - 40; };
/** Przebiegi pociągu `nr` na tor planowy: wjazdowe (od semafora wjazdowego) i wyjazdowe (z toru planowego na szlak). */
const plannedEntry = (sim, nr) => entryRoutes(sim, nr).filter((r) => trackOf(sim, r.sections.at(-1)) === String(entryOf(sim, nr).track));
const plannedExit = (sim, nr) => { const e = entryOf(sim, nr); return sim.ilk.routeList().filter((r) => r.kind === 'train' && r.exit === e.to && trackOf(sim, r.approach) === String(e.track)); };
const scores = (sim, code) => sim.score.items.filter((i) => i.code === code).map((i) => i.points);

/** Chwile jazdy uzupełniające `at` z fault-harness. */
const moment = {
  ...at,
  /** pociąg stoi przed semaforem wjazdowym (tor planowy zajęty – automat czeka) */
  beforeEntry: (nr) => (sim) => { const tr = entryOf(sim, nr)?.train; return !!tr && tr.entryPending && tr.v === 0 && tr.stoppedAt?.kind === 'signal'; },
  /** przebieg wjazdowy nastawiony, pociąg bliżej semafora niż droga hamowania nagłego */
  entryTooClose: (nr) => (sim) => at.entrySet(nr)(sim) && tooClose(entryOf(sim, nr).train, entryActive(sim, nr).route.start),
  /** przebieg wyjazdowy nastawiony, pociąg bliżej semafora wyjazdowego niż droga hamowania nagłego */
  exitTooClose: (nr) => (sim) => at.exitSet(nr)(sim) && tooClose(entryOf(sim, nr).train, exitActive(sim, nr).route.start),
};
/** Cele usterek uzupełniające `target` z fault-harness. */
const on = {
  ...target,
  /** najbliższy semafor przed czołem pociągu (pociąg przy peronie – semafor wyjazdowy, także bez przebiegu) */
  signalAhead: (nr) => (sim) => entryOf(sim, nr)?.train?.nextSignal(),
  /** pierwsza zwrotnica przebiegu na tor planowy / z toru planowego, którą trzeba przestawić (usterka napędu objawia się
   *  dopiero po przestawieniu) */
  entryPointToMove: (nr) => (sim) => toMove(sim, plannedEntry(sim, nr)),
  exitPointToMove: (nr) => (sim) => toMove(sim, plannedExit(sim, nr)),
  /** pierwsza zwrotnica przebiegu wjazdowego na tor planowy – już w położeniu przebiegu */
  entryPointInPlace: (nr) => (sim) => plannedEntry(sim, nr).flatMap((r) => r.points).find((q) => sim.ilk.points.get(q.id).position === q.position)?.id,
};
const toMove = (sim, routes) => routes.flatMap((r) => r.points).find((q) => sim.ilk.points.get(q.id).position !== q.position)?.id;

/**
 * Semafor z usterką, przed którym pociąg z wpisu `e` czeka gotowy do jazdy (przed semaforem wjazdowym albo przy peronie po
 * postoju i o czasie odjazdu), przy nastawionym przebiegu za semaforem – albo null. Wspólne dla „dyżurnego” testu
 * (tu daje Sz / rozkaz) i obserwacji (czy przypadek naprawdę trafił w postój przed semaforem z usterką).
 */
function failedAhead(sim, e) {
  const tr = e.train;
  if (!tr || tr.finished || tr.v > 0 || !tr.entered) return null;
  if (!tr.entryPending && (sim.clock.time < (e.depTime ?? 0) || (tr.dwellUntil ?? 0) > sim.clock.time)) return null;
  const sig = sim.ilk.signals.get(tr.nextSignal());
  if (!sig?.failed || !sig.route) return null;
  const act = routeView(sim.ilk, sig.route);
  return act && !act.entered ? sig : null;
}

/**
 * Dyżurny: automat, a przy długiej usterce semafora (`how` = 'Sz' albo 'S') – pociąg czeka przed semaforem z usterką
 * (`failedAhead`): dKo przy wjeździe ze szlaku z blokadą Eap, potem Sz albo rozkaz „S” (wynik sprawdzają asercje: sposób
 * minięcia semafora i punkty). `before(sim)` – inne czynności dyżurnego przed automatem.
 */
function dispatcher(how = null, before = null) {
  return (sim) => {
    before?.(sim);
    autoDispatch(sim);
    if (!how) return;
    for (const e of sim.traffic.timetable()) {
      const sig = failedAhead(sim, e);
      const tr = e.train;
      if (!sig || sig.substitute || tr.hasOrderFor(sig.id)) continue;
      const b = e.from && tr.entryPending ? sim.blocks.get(e.from) : null;
      if (b && !b.auto && !b.koPrepared) sim.execute({ type: 'block', exit: e.from, btn: 'dKo' });
      if (how === 'Sz') sim.execute({ type: 'substitute', signal: sig.id }); else sim.traffic.issueOrder({ nr: e.nr, signal: sig.id });
    }
  };
}

/**
 * Wbl zawczasu dla pociągu przelotowego `nr`, który jedzie do stacji. Automat żąda pozwolenia dla przelotu dopiero po
 * wjeździe pociągu (przelot nie ma planowego odjazdu), a sąsiad odpowiada po 8–28 s – pociąg hamowałby przed semaforem
 * wyjazdowym i chwila „tuż przed pociągiem” by nie nastąpiła.
 */
const earlyWbl = (nr) => (sim) => {
  const e = entryOf(sim, nr), b = sim.blocks.get(e.to);
  if (e.train && !e.train.entered && !b.fault && !b.direction && !b.request && !b.occupied) sim.execute({ type: 'block', exit: e.to, btn: 'Wbl' });
};

/**
 * dKo zaraz po alarmie usterki semafora wjazdowego, gdy pociąg jedzie do niego przy nastawionym przebiegu: pociąg wjedzie
 * bez stwierdzenia przejazdu (spad, Sz albo rozkaz), więc blok końcowy przygotowuje się przed wjazdem. Automat naciska
 * dKo dopiero po przybyciu pociągu (`koPending`) – wtedy jest ono spóźnione.
 */
const earlyDko = (sim) => {
  for (const e of sim.traffic.timetable()) {
    const b = e.from && sim.blocks.get(e.from), a = entryActive(sim, e.nr);
    if (!e.train?.entryPending || !b || b.auto || b.fault || b.koPrepared || !a) continue;
    if (sim.ilk.signals.get(a.route.start).failed) sim.execute({ type: 'block', exit: e.from, btn: 'dKo' });
  }
};

/**
 * Obserwacja zmiany w każdym takcie:
 *  - `passes` – minięcia semaforów: jak pociąg minął semafor („sygnał” – sygnał zezwalający, „Sz”, „rozkaz”, „spad” –
 *    przejechał „Stój”, bo semafor zgasł bliżej niż droga hamowania, „Stój …” – bez zezwolenia). Obraz to ostatni sygnał
 *    semafora sprzed ruchu pociągu: z poprzedniego taktu i z tego taktu przed przejazdem (naprawa w tym samym takcie),
 *  - `noControl` – sygnał zezwalający (poza Sz) albo utwierdzony przebieg przy zwrotnicy bez kontroli położenia,
 *  - `setAt` – pierwsza chwila nastawionego przebiegu wjazdowego / wyjazdowego pociągu `nr`,
 *  - `routeWhileFailed` – semafory, które miały nastawiony przebieg w czasie usterki,
 *  - `waited` – „numer semafor”: pociąg czekał gotowy do jazdy przed semaforem z usterką przy nastawionym przebiegu
 *    (`failedAhead`).
 */
function observer(sim, nr) {
  const prev = new Map(), passes = [], spads = [], noControl = [], setAt = { entry: null, exit: null };
  const routeWhileFailed = new Set(), waited = new Set();
  let seen = new Map();
  sim.bus.on('alarm', (a) => { if (a.type === 'spad') spads.push(`${a.nr} ${a.signal}`); });
  sim.bus.on('signal', (s) => seen.get(s.id)?.push(s.aspect));
  const each = (s) => {
    const t = Clock.format(s.clock.time, true);
    for (const tr of s.traffic.trains) {
      if (tr.finished || tr.mode !== 'train') { prev.delete(tr.nr); continue; }
      const next = tr.nextSignal();
      const p = prev.get(tr.nr);
      if (p && p.sig !== next) {
        const aspect = [p.aspect, ...(seen.get(p.sig) ?? [])].findLast((a) => Interlocking.isTrainProceed(a)) ?? p.aspect;
        const how = spads.includes(`${tr.nr} ${p.sig}`) ? 'spad' : p.order ? 'rozkaz' : aspect === 'Sz' ? 'Sz' : Interlocking.isTrainProceed(aspect) ? 'sygnał' : `Stój (${aspect})`;
        passes.push({ nr: tr.nr, sig: p.sig, how });
      }
      const sig = next && s.ilk.signals.get(next);
      if (sig) prev.set(tr.nr, { sig: next, aspect: sig.aspect, order: tr.hasOrderFor(next) }); else prev.delete(tr.nr);
    }
    seen = new Map([...prev.values()].map((p) => [p.sig, []]));
    for (const a of routeViews(s.ilk)) {
      if (a.entered || a.route.kind !== 'train') continue;
      const sig = s.ilk.signals.get(a.route.start);
      const proceed = Interlocking.isProceed(sig.aspect) && sig.aspect !== 'Sz';
      for (const pid of a.points) {
        const p = s.ilk.points.get(pid);
        if (p.moving || p.control) continue;
        noControl.push(`${t} przebieg ${a.id} utwierdzony przy zwrotnicy ${pid} bez kontroli${proceed ? `, ${sig.id}: ${sig.aspect}` : ''}`);
      }
    }
    if (nr != null) {
      setAt.entry ??= entryActive(s, nr) ? s.clock.time : null;
      setAt.exit ??= exitActive(s, nr) ? s.clock.time : null;
    }
    for (const sig of s.ilk.signals.values()) if (sig.failed && sig.route) routeWhileFailed.add(sig.id);
    for (const e of s.traffic.timetable()) { const sig = failedAhead(s, e); if (sig) waited.add(`${e.nr} ${sig.id}`); }
    if (noControl.length > 5) noControl.length = 5;
  };
  return { each, passes, noControl, setAt, routeWhileFailed, waited };
}

/**
 * Jedna zmiana z usterką. Chwilę sprawdza się także tuż przed ruchem automatu: automat potrafi odpowiedzieć w tym samym
 * takcie (nastawnia mechaniczna zamyka przebieg od razu po Poz – chwila „zgłoszony” inaczej by przepadła).
 */
function shift({ st, srk, timetable, when, fault, how = null, nr = null, dispatch = null }) {
  const sim = faultSim(st, { srk, timetable });
  const obs = observer(sim, nr);
  const d = dispatch ?? dispatcher(how);
  let hit = false;
  const r = runWithFault(sim, {
    when: (s) => hit || when(s), fault, each: obs.each, until: '09:00',
    dispatch: (s) => { hit ||= when(s); d(s); },
  });
  return { ...r, obs };
}

/** Wspólne asercje przypadku (komunikat: stacja, stanowisko, pociąg, chwila, usterka). */
function check(r, msg) {
  assert.equal(r.fired, true, `${msg}: chwila nie nastąpiła (usterka nie wystąpiła)`);
  assert.deepEqual(r.violations, [], `${msg}: niezmienniki`);
  assert.deepEqual(r.events, [], `${msg}: spad / rozprucie`);
  assert.deepEqual(stuck(r.sim), [], `${msg}: pociągi, które nie dojechały`);
  assert.deepEqual(unjustified(r.sim), [], `${msg}: kary za czynności wymuszone usterką`);
  assert.deepEqual(leftovers(r.sim), [], `${msg}: stan po naprawie`);
  assert.deepEqual(r.obs.noControl, [], `${msg}: przebieg / sygnał przy zwrotnicy bez kontroli`);
}
const label = (st, srk, nr, from, to, track, when, r) => `${st.name} ${srk}, pociąg ${nr} ${from}→${to} tor ${track}, ${when}, ${r.fault?.type} ${r.fault?.target} ${Math.round((r.fault?.duration ?? 0) / 6) / 10} min`;
/** Minięcia semafora `sig` jako „numer: sposób”. */
const passesOf = (r, sig) => r.obs.passes.filter((p) => p.sig === sig).map((p) => `${p.nr}: ${p.how}`);

/* ---------------- usterka semafora wjazdowego ---------------- */

/**
 * Sprawdzenie, że przypadek trafił w zamierzoną sytuację: przy usterce krótkiej pociąg nie czekał przed semaforem
 * z usterką (a przebieg był nastawiony w czasie usterki, gdy chwila na to pozwala – `routeInFault`), przy średniej
 * i długiej – czekał przed nim przy nastawionym przebiegu.
 */
function checkHit(r, m, v, msg) {
  const sig = r.fault.target;
  assert.equal(r.obs.waited.has(`2 ${sig}`), v.dur !== 'short', `${msg}: pociąg 2 czekał przed ${sig} z usterką przy nastawionym przebiegu`);
  if (v.dur === 'short') assert.equal(r.obs.routeWhileFailed.has(sig), m.routeInFault, `${msg}: przebieg z ${sig} nastawiony w czasie usterki`);
}

// Chwila „zgłoszony” następuje o 07:00, gdy sąsiad prosi o pozwolenie; przebieg wjazdowy automat nastawia ok. 07:01:30–07:02,
// pociąg dojeżdża do semafora ok. 07:05. „Stoi przed semaforem”: od ok. 07:09 do zwolnienia toru 1 (ok. 07:16:30).
const ENTRY_MOMENTS = [
  { name: 'pociąg zgłoszony', when: moment.announced, short: 3, mid: 7, routeInFault: true },
  { name: 'przebieg wjazdowy nastawiony', when: moment.entrySet, short: 1, mid: 5, routeInFault: true },
  { name: 'pociąg stoi przed semaforem', when: moment.beforeEntry, short: 3, mid: 10, routeInFault: false },
];

test('usterka semafora wjazdowego: pociąg mija go na sygnale zezwalającym dopiero po naprawie, wcześniej tylko na Sz albo na rozkaz „S” (0 pkt); po naprawie następny pociąg jedzie na sygnale zezwalającym', () => {
  for (const { st, srk } of PANELS) for (const [from, to] of DIRS) for (const m of ENTRY_MOMENTS) for (const v of VARIANTS) {
    // „stoi przed semaforem”: pociąg 1 zajmuje tor 1 do 07:16, pociąg 2 czeka przed semaforem wjazdowym
    const waiting = m.when === moment.beforeEntry;
    const timetable = [...(waiting ? [os(st, 1, from, to, '07:04', '07:16', '1')] : []),
      os(st, 2, from, to, waiting ? '07:10' : '07:06', waiting ? '07:20' : '07:08', '1'), os(st, 3, from, to, waiting ? '07:36' : '07:26', waiting ? '07:38' : '07:28', '1')];
    const r = shift({ st, srk, timetable, when: m.when(2), fault: { type: 'signal-fail', target: on.entrySignal(2), duration: durationOf(m, v) }, how: v.how });
    const msg = label(st, srk, 2, from, to, '1', `${m.name}, usterka ${v.name}`, r);
    check(r, msg);
    checkHit(r, m, v, msg);
    const sig = r.fault.target;
    const expected = !v.how ? 'sygnał' : v.how === 'Sz' ? 'Sz' : 'rozkaz';
    assert.deepEqual(passesOf(r, sig), [...(waiting ? ['1: sygnał'] : []), `2: ${expected}`, '3: sygnał'], `${msg}: minięcia ${sig}`);
    assert.deepEqual(scores(r.sim, 'Sz'), v.how === 'Sz' ? [0] : [], `${msg}: Sz`);
    assert.deepEqual(scores(r.sim, 'order'), v.how === 'S' ? [0] : [], `${msg}: rozkaz „S”`);
    // wjazd bez sygnału zezwalającego: dKo przed wjazdem (0 pkt), potem Ko automatu; po naprawie – Ko bez dKo
    assert.deepEqual(scores(r.sim, 'dKo'), v.how ? [0] : [], `${msg}: dKo`);
  }
});

/* ---------------- usterka semafora wyjazdowego ---------------- */

// Pociąg 2 stoi przy peronie od ok. 07:05:20–07:05:50, przebieg wyjazdowy automat nastawia o 07:08, odjazd o 07:10.
const EXIT_MOMENTS = [
  { name: 'pociąg stoi przy peronie', when: moment.standing, target: on.signalAhead, short: 3.5, mid: 7, routeInFault: true },
  { name: 'przebieg wyjazdowy nastawiony', when: moment.exitSet, target: on.exitSignal, short: 1, mid: 4, routeInFault: true },
];

test('usterka semafora wyjazdowego (tor 1 i 2): pociąg odjeżdża na sygnale zezwalającym dopiero po naprawie, wcześniej tylko na Sz albo na rozkaz „S” (0 pkt, dPo 0 pkt); po naprawie następny na sygnale zezwalającym', () => {
  for (const { st, srk } of PANELS) for (const [from, to] of DIRS) for (const track of ['1', '2']) for (const m of EXIT_MOMENTS) for (const v of VARIANTS) {
    const timetable = [os(st, 2, from, to, '07:06', '07:10', track), os(st, 3, from, to, '07:26', '07:28', track)];
    const r = shift({ st, srk, timetable, when: m.when(2), fault: { type: 'signal-fail', target: m.target(2), duration: durationOf(m, v) }, how: v.how });
    const msg = label(st, srk, 2, from, to, track, `${m.name}, usterka ${v.name}`, r);
    check(r, msg);
    checkHit(r, m, v, msg);
    const sig = r.fault.target;
    const expected = !v.how ? 'sygnał' : v.how === 'Sz' ? 'Sz' : 'rozkaz';
    assert.deepEqual(passesOf(r, sig), [`2: ${expected}`, '3: sygnał'], `${msg}: minięcia ${sig}`);
    assert.deepEqual(scores(r.sim, 'Sz'), v.how === 'Sz' ? [0] : [], `${msg}: Sz`);
    assert.deepEqual(scores(r.sim, 'order'), v.how === 'S' ? [0] : [], `${msg}: rozkaz „S”`);
    // wyjazd bez sygnału zezwalającego – blok początkowy doraźnie (dPo, 0 pkt); po naprawie blok zablokuje się sam
    assert.deepEqual(scores(r.sim, 'dPo'), v.how ? [0] : [], `${msg}: dPo`);
  }
});

test('semafor wyjazdowy gaśnie tuż przed pociągiem przelotowym: przejazd „Stój” bez kary, dalej na rozkaz „S” (0 pkt), dPo 0 pkt', () => {
  for (const { st, srk } of PANELS) for (const [from, to] of DIRS) {
    const timetable = [tow(2, from, to, '07:08', '1'), os(st, 3, from, to, '07:26', '07:28', '1')];
    const r = shift({ st, srk, timetable, when: moment.exitTooClose(2), fault: { type: 'signal-fail', target: on.exitSignal(2), duration: 10 }, dispatch: dispatcher(null, earlyWbl(2)) });
    const msg = label(st, srk, 2, from, to, '1', 'semafor gaśnie tuż przed pociągiem', r);
    check(r, msg);
    assert.deepEqual(passesOf(r, r.fault.target), ['2: spad', '3: sygnał'], `${msg}: minięcia ${r.fault.target}`);
    assert.deepEqual(scores(r.sim, 'spad'), [], `${msg}: spad z usterki semafora bez kary`);
    assert.deepEqual(scores(r.sim, 'order'), [0], `${msg}: rozkaz „S” zza semafora`);
    assert.deepEqual(scores(r.sim, 'dPo'), [0], `${msg}: dPo`);
  }
});

// Semafor wjazdowy gaśnie bliżej niż droga hamowania: pociąg przejeżdża „Stój” (bez kary – usterka), staje za semaforem
// i jedzie dalej na rozkaz „S” (0 pkt). Blokada Eap nie stwierdzi przejazdu, więc dyżurny przygotowuje blok końcowy dKo
// zaraz po alarmie usterki, przed wjazdem pociągu (0 pkt), a po przybyciu Ko działa. dKo naciśnięte dopiero po wjeździe
// (tak robi automat) kosztuje −10 – czy słusznie przy przejeździe „Stój” z usterki, to pytanie do właściciela reguły
// (docs/sources/sygnaly-i-blokada.md opisuje dKo dla wjazdu na Sz / rozkaz), więc tu się tego nie sprawdza.
test('semafor wjazdowy gaśnie tuż przed pociągiem: przejazd „Stój” bez kary, dKo przed wjazdem i rozkaz „S” zza semafora bez kary', () => {
  for (const { st, srk } of PANELS) for (const [from, to] of DIRS) {
    const timetable = [os(st, 2, from, to, '07:06', '07:08', '1'), os(st, 3, from, to, '07:26', '07:28', '1')];
    const r = shift({ st, srk, timetable, when: moment.entryTooClose(2), fault: { type: 'signal-fail', target: on.entrySignal(2), duration: 10 }, dispatch: dispatcher(null, earlyDko) });
    const msg = label(st, srk, 2, from, to, '1', 'semafor gaśnie tuż przed pociągiem, dKo po alarmie', r);
    check(r, msg);
    assert.deepEqual(passesOf(r, r.fault.target), ['2: spad', '3: sygnał'], `${msg}: minięcia ${r.fault.target}`);
    assert.deepEqual(scores(r.sim, 'spad'), [], `${msg}: spad z usterki semafora bez kary`);
    assert.deepEqual(scores(r.sim, 'order'), [0], `${msg}: rozkaz „S” zza semafora`);
    // 0 pkt tylko przed wjazdem (po wjeździe −10, przy stwierdzonym przejeździe −15)
    assert.deepEqual(scores(r.sim, 'dKo'), [0], `${msg}: dKo przed wjazdem`);
  }
});

// Rozkaz „S” na dalszą jazdę zza semafora miniętego na „Stój” jest uzasadniony, gdy usterka trwa w chwili rozkazu
// (`faultOnPath`) albo przebieg zgasł z usterki drogi (`faultDrop`). Usterka semafora naprawiona, zanim dyżurny wypisał
// rozkaz, nie zostawia śladu – rozkaz wymuszony przez przejazd „Stój” z usterki kosztuje −10.
test('semafor gaśnie tuż przed pociągiem i zostaje naprawiony przed rozkazem: rozkaz „S” zza semafora bez kary', () => {
  for (const { st, srk } of PANELS) for (const [from, to] of DIRS) {
    const timetable = [tow(2, from, to, '07:08', '1'), os(st, 3, from, to, '07:26', '07:28', '1')];
    // dyżurny wypisuje rozkaz (automat) dopiero po naprawie semafora
    const writing = (sim) => sim.traffic.trains.some((tr) => tr.stoppedAt?.kind === 'spad' && sim.ilk.signals.get(tr.stoppedAt.signal)?.failed);
    const dispatch = (sim) => { earlyWbl(2)(sim); if (!writing(sim)) autoDispatch(sim); };
    const r = shift({ st, srk, timetable, when: moment.exitTooClose(2), fault: { type: 'signal-fail', target: on.exitSignal(2), duration: 1 }, dispatch });
    const msg = label(st, srk, 2, from, to, '1', 'semafor gaśnie tuż przed pociągiem, rozkaz po naprawie', r);
    check(r, msg);
    assert.deepEqual(passesOf(r, r.fault.target), ['2: spad', '3: sygnał'], `${msg}: minięcia ${r.fault.target}`);
    assert.deepEqual(scores(r.sim, 'order'), [0], `${msg}: rozkaz „S” zza semafora`);
  }
});

/* ---------------- usterka napędu zwrotnicy ---------------- */

// nastawnia mechaniczna – osobno (test niżej): drążek nie zamyka przebiegu przy zwrotnicy bez kontroli
const POINT_PANELS = PANELS.filter((p) => p.srk !== 'mech');

function pointCase(st, srk, from, to, kind, duration) {
  const entry = kind === 'wjazd';
  const timetable = [os(st, 2, from, to, '07:06', entry ? '07:08' : '07:10', '2')];
  const r = shift({ st, srk, timetable, nr: 2, when: entry ? moment.announced(2) : moment.standing(2), fault: { type: 'point-control', target: entry ? on.entryPointToMove(2) : on.exitPointToMove(2), duration } });
  const msg = label(st, srk, 2, from, to, '2', `zwrotnica przebiegu ${entry ? 'wjazdowego (pociąg zgłoszony)' : 'wyjazdowego (pociąg przy peronie)'}`, r);
  // napęd wraca po czasie usterki liczonym od `since` (Faults: `faultUntil`; osobny test niżej)
  return { r, msg, end: r.fault ? r.fault.at + r.fault.duration : null, set: entry ? r.obs.setAt.entry : r.obs.setAt.exit };
}
/** Przebieg przez zwrotnicę z usterką utwierdza się po naprawie; pociąg na torze planowym mija semafory na sygnale zezwalającym. */
function checkPoint({ r, msg, end, set }) {
  check(r, msg);
  assert.ok(set != null && set >= end, `${msg}: przebieg utwierdzony o ${Clock.format(set ?? 0, true)}, usterka do ${Clock.format(end ?? 0, true)}`);
  assert.equal(String(entryOf(r.sim, 2).actualTrack), '2', `${msg}: tor przyjazdu`);
  // automat: nie zabezpiecza zwrotnicy na miejscu i nie daje Sz / rozkazu – pociąg czeka na naprawę i jedzie na sygnale
  // (jazda przez zabezpieczoną zwrotnicę bez kontroli na Sz / rozkaz „S” – tests/point-secured.test.js)
  assert.deepEqual(r.obs.passes.filter((p) => p.nr === 2).map((p) => p.how), ['sygnał', 'sygnał'], `${msg}: minięcia semaforów`);
  assert.deepEqual([...scores(r.sim, 'Sz'), ...scores(r.sim, 'order')], [], `${msg}: Sz / rozkaz`);
}

test('usterka napędu zwrotnicy przebiegu wjazdowego i wyjazdowego: przebieg utwierdza się dopiero po naprawie, nigdy przy zwrotnicy bez kontroli', () => {
  for (const { st, srk } of POINT_PANELS) for (const [from, to] of DIRS) for (const kind of ['wjazd', 'wyjazd']) for (const duration of [3, 12]) {
    checkPoint(pointCase(st, srk, from, to, kind, duration));
  }
});

// Nastawnia mechaniczna: przebieg zamyka drążek, gdy dźwignie zwrotnic stoją w położeniu przebiegu (`routeProblems`
// sprawdza przy `manualPoints` tylko położenie), a sygnał podaje dźwignia (`#computeAspect` przy `manualSignal` nie sprawdza
// kontroli). Po przestawieniu zwrotnicy w czasie usterki semafor wskazuje Sr2 / Sr3, a pociąg i tak staje przed zwrotnicą
// bez kontroli (Train: przejazd tylko po zabezpieczeniu). Zwrotnica bez kontroli – jazda tylko na Sz albo rozkaz „S”
// (docs/sources/sygnaly-i-blokada.md, „Zwrotnica bez kontroli położenia”; Ie-4 §30 ust. 1).
test('nastawnia mechaniczna: usterka napędu zwrotnicy – drążek nie zamyka przebiegu, sygnał zezwalający dopiero po naprawie', () => {
  for (const [from, to] of DIRS) for (const kind of ['wjazd', 'wyjazd']) {
    checkPoint(pointCase(szkolna, 'mech', from, to, kind, 12));
  }
});

// Usterka zaczyna się przy pierwszym takcie po `at` (`since`) i trwa `duration` od tej chwili, ale napęd zwrotnicy
// „naprawia się” o `at` + `duration` (Faults #apply: `faultUntil = f.at + f.duration`). Usterka ze scenariusza z `at` przed
// początkiem zmiany (albo dopisana w trakcie – o takt) trwa dłużej niż brak kontroli: zwrotnica przestawiona w czasie
// aktywnej usterki odzyskuje kontrolę.
test('usterka napędu zwrotnicy trwa od `since`: zwrotnica przestawiona w czasie aktywnej usterki nie ma kontroli', () => {
  const sim = faultSim(szkolna, { srk: 'E', timetable: [], faults: [{ type: 'point-control', target: 'Zw1', at: '06:50', duration: 15 }] });
  const f = sim.faults.list[0], zw1 = sim.ilk.points.get('Zw1');
  const until = (t) => { while (sim.clock.time < Clock.parse(t)) sim.step(0.5); };
  until('07:08');
  assert.equal(f.active, true, 'usterka trwa do 07:15');
  assert.equal(sim.execute({ type: 'point', id: 'Zw1', position: '-' }).ok, true);
  until('07:09');
  assert.equal(f.active, true, 'usterka trwa do 07:15');
  assert.equal(zw1.control, false, `Zw1 przestawiona o 07:08 przy usterce do 07:15 (faultUntil ${Clock.format(zw1.faultUntil, true)})`);
});

/** Zmiana bez usterki – do porównania (automat co 2 s, jak `runWithFault`). */
function baseline(st, srk, timetable) {
  const sim = faultSim(st, { srk, timetable });
  play(sim).until('09:00', { stop: allArrived });
  return sim;
}
const journal = (sim) => sim.traffic.timetable().map((e) => `${e.nr}: tor ${e.actualTrack}, przyjazd ${Clock.format(e.actualArr ?? 0, true)}, odjazd ${Clock.format(e.actualDep ?? 0, true)}`);

test('usterka napędu zwrotnicy poza drogą pociągu albo w drodze bez przestawiania: ruch bez zmian', () => {
  const cases = [
    ...SZKOLNA.map((srk) => ({ st: szkolna, srk, where: 'poza drogą pociągu', target: () => 'Zw3' })),
    ...PANELS.map(({ st, srk }) => ({ st, srk, where: 'w drodze, bez przestawiania', target: on.entryPointInPlace(2) })),
  ];
  for (const { st, srk, where, target: tgt } of cases) for (const [from, to] of DIRS) {
    const timetable = [os(st, 2, from, to, '07:06', '07:08', '1')];
    const r = shift({ st, srk, timetable, when: moment.announced(2), fault: { type: 'point-control', target: tgt, duration: 30 } });
    const msg = label(st, srk, 2, from, to, '1', `zwrotnica ${where}`, r);
    check(r, msg);
    assert.equal(r.sim.ilk.points.get(r.fault.target).control, true, `${msg}: zwrotnica nieprzestawiana ma kontrolę`);
    assert.deepEqual(r.obs.passes.filter((p) => p.nr === 2).map((p) => p.how), ['sygnał', 'sygnał'], `${msg}: minięcia semaforów`);
    assert.deepEqual(journal(r.sim), journal(baseline(st, srk, timetable)), `${msg}: przyjazd i odjazd jak bez usterki`);
  }
});

/* ---------------- powtarzalność ---------------- */

// Chwila usterki zależy od stanu zmiany, więc przypadki są powtarzalne tylko przy powtarzalnej zmianie. Sąsiad odpowiada
// na Wbl, potwierdza przyjazd itd. po czasie losowanym z generatora zmiany (każdy szlak ma własny ciąg z ziarna) –
// wcześniej z `Math.random()`, więc ta sama zmiana dawała za każdym razem inną chwilę nastawienia wyjazdu.
test('ta sama zmiana z tym samym ziarnem: ta sama chwila usterki i ten sam przebieg ruchu', () => {
  const runs = new Set();
  for (let i = 0; i < 8; i++) {
    const r = shift({ st: szkolna, srk: 'E', timetable: [tow(2, 'E', 'W', '07:08', '1')], when: moment.exitSet(2), fault: { type: 'signal-fail', target: on.exitSignal(2), duration: 1 } });
    runs.add(`usterka ${Clock.format(r.fault.since, true)}; ${journal(r.sim).join('; ')}`);
  }
  assert.equal(runs.size, 1, [...runs].join('\n'));
});
