import { test } from 'node:test';
import assert from 'node:assert/strict';
import szkolna from '../src/stations/szkolna.js';
import kalinowo from '../src/stations/kalinowo.js';
import { Interlocking } from '../src/model/Interlocking.js';
import { autoDispatch } from './helpers.js';
import { faultSim, runWithFault, at, target, entryActive, entryRoutes, stuck, Clock } from './fault-harness.js';
import { unjustified, leftovers } from '../src/model/check/outcome.js';

/*
 * Dwie różne usterki naraz na drodze jednego pociągu (podstawa: `tests/fault-harness.js`). Szkolna – pięć stanowisk
 * (cztery, gdzie nastawnia mechaniczna nie ma czynności z przypadku), Kalinowo – MOR-3; oba kierunki, tor 1 i 2 (przy
 * usterce napędu – tor 2, na który zwrotnicę trzeba przestawić); każda usterka w kilku chwilach jazdy (obie naraz albo
 * jedna wcześniej); pociąg jedzie na Sz albo na rozkaz „S”:
 *  (a) usterka semafora wyjazdowego i blokady tego wyjazdu: pociąg odjeżdża na Sz albo na rozkaz „S” dopiero po
 *      telefonicznym „droga wolna” (wcześniej jedno i drugie odrzucone), dPo 0 pkt, zawiadomienie o odjeździe wysłane,
 *  (b) usterka semafora wjazdowego i blokady szlaku wjazdu: wjazd na Sz albo rozkaz „S”, dKo przy zapowiadaniu odrzucone,
 *      przyjazd potwierdzony telefonogramem (nie Ko),
 *  (c) usterka napędu zwrotnicy i fałszywa zajętość toru docelowego tego samego przebiegu: Sz albo rozkaz „S” dopiero po
 *      zabezpieczeniu zwrotnicy na miejscu (rozkaz wcześniej odrzucony), pociąg mija zwrotnicę zabezpieczoną,
 *  (d) usterka semafora wjazdowego i fałszywa zajętość toru docelowego: wjazd na Sz albo rozkaz „S” przez zwrotnice
 *      zamknięte (Zz), dKo przed wjazdem,
 *  (e) koniec zmiany z otwartym obowiązkiem telefonicznym: blokada bez łączności przez całą zmianę, dyżurny nie zawiadamia
 *      sąsiada o odjeździe – zmiana nie kończy się „wszystko wykonane”, zanim pociąg dojedzie, a raport ma karę
 *      `no-depart-report`; z zawiadomieniem – bez kary; kara doliczona przy końcu zmiany o czasie nie wraca, gdy pociąg
 *      dojedzie do sąsiada po końcu zmiany.
 * W każdym przypadku: usterki czynne w zamierzonej chwili (przy mijaniu semafora / zwrotnicy), niezmienniki w każdym takcie,
 * bez minięcia „Stój” i rozprucia, pociąg dojechał, bez kar za czynności wymuszone usterką, stan po naprawie czysty.
 * Czynności, których automat nie wykonuje (rozkaz „S” zamiast Sz, Sz przy fałszywej zajętości, zabezpieczenie zwrotnicy,
 * Zz, dKo), wykonuje „dyżurny” testu przez `sim.execute` / `sim.traffic.issueOrder`, przed automatem w tym samym takcie.
 */

const SZKOLNA = ['E', 'komputerowe', 'izh111', 'mech', 'ebilock'];
const PANELS = [...SZKOLNA.map((srk) => ({ st: szkolna, srk })), { st: kalinowo, srk: 'mor3' }];
// nastawnia mechaniczna nie ma zamknięć Zz ani ciągłej kontroli sygnału – jazda na Sz przy fałszywej zajętości tylko
// na stanowiskach z nią (jak w tests/faults-track.test.js)
const LIVE = PANELS.filter((p) => p.srk !== 'mech');
/** Kierunki jazdy: [skąd, dokąd]. */
const DIRS = [['W', 'E'], ['E', 'W']];
/** Kierunek jazdy i tor: oba kierunki na tor 1 i na tor 2. */
const WAYS = DIRS.flatMap(([from, to]) => ['1', '2'].map((track) => [from, to, track]));
const HOW = ['Sz', 'S'];
const NR = 2;
const LENGTH = { szkolna: 130, kalinowo: 110 };
const os = (st, from, to, track, arr, dep) => ({ nr: NR, kind: 'os', name: 'Osobowy', from, to, arr, dep, track, stop: true, length: LENGTH[st.id], vmax: 100, dwell: 60 });

const entryOf = (sim, nr) => sim.traffic.timetable().find((e) => e.nr === nr);
const trackOf = (sim, sid) => String(sim.ilk.sections.get(sid)?.track);
const scores = (sim, code) => sim.score.items.filter((i) => i.code === code).map((i) => i.points);
const now = (sim) => Clock.format(sim.clock.time, true);
/** Czynne usterki jako „rodzaj cel”, posortowane. */
const activeFaults = (sim) => sim.faults.list.filter((f) => f.active).map((f) => `${f.type} ${f.target}`).sort();
/** Przebieg wjazdowy pociągu na tor planowy. */
const plannedEntry = (sim, nr) => entryRoutes(sim, nr).find((r) => trackOf(sim, r.sections.at(-1)) === String(entryOf(sim, nr).track));
/** Przebieg wyjazdowy z toru planowego na szlak pociągu. */
const plannedExit = (sim, nr) => { const e = entryOf(sim, nr); return sim.ilk.routeList().find((r) => r.kind === 'train' && r.exit === e.to && trackOf(sim, r.approach) === String(e.track)); };

/**
 * Cele usterek (uzupełnienie `target` z fault-harness). Semafory i tor docelowy – z przebiegu planowego (na tor z rozkładu),
 * nie z nastawionego: cel jest ten sam, zanim przebieg się nastawi.
 */
const on = {
  ...target,
  /** semafor wyjazdowy z toru planowego (przebieg jeszcze nienastawiony) */
  exitSignal: (nr) => (sim) => plannedExit(sim, nr)?.start,
  /** semafor wjazdowy przebiegu na tor planowy */
  entrySignal: (nr) => (sim) => plannedEntry(sim, nr)?.start,
  /** tor docelowy przebiegu wjazdowego na tor planowy (ostatni odcinek) */
  dest: (nr) => (sim) => plannedEntry(sim, nr)?.sections.at(-1),
  /** pierwsza zwrotnica przebiegu wjazdowego na tor planowy, którą trzeba przestawić */
  entryPointToMove: (nr) => (sim) => { const r = plannedEntry(sim, nr); return [...r.points].find((q) => sim.ilk.points.get(q.id).position !== q.position)?.id; },
};

/** Chwile jazdy (uzupełnienie `at` z fault-harness). */
const moment = {
  ...at,
  /** od początku zmiany */
  start: () => () => true,
  /** semafor wyjazdowy zezwala, pociąg stoi przy peronie, 10 s przed odjazdem */
  beforeDep: (nr) => (sim) => { const e = entryOf(sim, nr), tr = e?.train; return at.exitSet(nr)(sim) && tr.v === 0 && sim.clock.time >= e.depTime - 10 && Interlocking.isTrainProceed(sim.ilk.signals.get(tr.nextSignal())?.aspect); },
  /** przebieg wjazdowy nastawiony (także przy semaforze bez sygnału zezwalającego), pociąg jeszcze nie wjechał */
  entryLocked: (nr) => (sim) => { const a = entryActive(sim, nr); return !!a && !a.trainEntered; },
  /** pociąg stoi przed semaforem wjazdowym */
  beforeEntry: (nr) => (sim) => { const tr = entryOf(sim, nr)?.train; return !!tr && tr.entryPending && tr.v === 0 && tr.stoppedAt?.kind === 'signal'; },
};

/**
 * Obserwacja w każdym takcie: `passes` – minięcia semaforów przez pociągi: jak („sygnał”, „Sz”, „rozkaz”, „spad”, „Stój …”)
 * i przy jakich czynnych usterkach. Obraz to ostatni sygnał semafora sprzed ruchu pociągu (z poprzedniego taktu i z tego
 * taktu przed przejazdem) – jak w tests/faults-signals-points.test.js.
 */
function observer(sim) {
  const prev = new Map(), passes = [], spads = new Set();
  let seen = new Map();
  sim.bus.on('alarm', (a) => { if (a.type === 'spad') spads.add(`${a.nr} ${a.signal}`); });
  sim.bus.on('signal', (s) => seen.get(s.id)?.push(s.aspect));
  const each = (s) => {
    for (const tr of s.traffic.trains) {
      if (tr.finished || tr.mode !== 'train') { prev.delete(tr.nr); continue; }
      const next = tr.nextSignal(), p = prev.get(tr.nr);
      if (p && p.sig !== next) {
        const aspect = [p.aspect, ...(seen.get(p.sig) ?? [])].findLast((a) => Interlocking.isTrainProceed(a)) ?? p.aspect;
        const how = spads.has(`${tr.nr} ${p.sig}`) ? 'spad' : p.order ? 'rozkaz' : aspect === 'Sz' ? 'Sz' : Interlocking.isTrainProceed(aspect) ? 'sygnał' : `Stój (${aspect})`;
        passes.push({ sig: p.sig, how, faults: activeFaults(s) });
      }
      const sig = next && s.ilk.signals.get(next);
      if (sig) prev.set(tr.nr, { sig: next, aspect: sig.aspect, order: tr.hasOrderFor(next) }); else prev.delete(tr.nr);
    }
    seen = new Map([...prev.values()].map((p) => [p.sig, []]));
  };
  return { each, passes };
}

/**
 * Jedna zmiana z dwiema usterkami. `fault` – usterka w chwili `when` (`runWithFault`); `extra` – druga usterka:
 * `{ type, target, duration, when? }` – w tym samym takcie co pierwsza albo w swojej chwili `when`. Usterka `fault` ma się
 * skończyć ostatnia: po jej naprawie i przejeździe pociągów `runWithFault` liczy jeszcze `settle` min i kończy.
 * `dispatch` – dyżurny (domyślnie automat), `drop` – telefonogramy, których dyżurny nie nadaje, `setup(sim)` – przed zmianą
 * (np. nasłuch zdarzeń), `watch(sim)` – obserwacja w każdym takcie. Chwilę sprawdza się też tuż przed ruchem dyżurnego –
 * ten potrafi odpowiedzieć w tym samym takcie.
 * Zwraca wynik `runWithFault` oraz `second` (druga usterka), `passes` (minięcia semaforów) i `sent` (telefonogramy przyjęte
 * przez sąsiada).
 */
function shift({ st, srk, timetable, when, fault, extra = null, dispatch = autoDispatch, drop = [], setup = null, watch = null, endTime = '10:00' }) {
  const sim = faultSim(st, { srk, timetable, endTime });
  setup?.(sim);
  const sent = [];
  const send = sim.comms.send.bind(sim.comms);
  sim.comms.send = (id, p, o) => {
    if (drop.includes(id)) return { ok: false, reason: 'dyżurny tego telefonogramu nie nadaje' };
    const res = send(id, p, o);
    if (res.ok) sent.push(`${id} ${p.nr}`);
    return res;
  };
  const obs = observer(sim);
  const base = sim.faults.list.length;
  let hit = false, second = null;
  const r = runWithFault(sim, {
    when: (s) => hit || when(s), fault, until: '09:30',
    dispatch: (s) => { hit ||= when(s); dispatch(s); },
    each: (s) => {
      if (extra && !second && (extra.when ? extra.when(s) : s.faults.list.length > base)) {
        const tgt = typeof extra.target === 'function' ? extra.target(s) : extra.target;
        if (tgt != null) second = s.faults.add({ type: extra.type, target: tgt, duration: extra.duration });
      }
      obs.each(s);
      watch?.(s);
    },
  });
  return { ...r, second, passes: obs.passes, sent };
}

/** Wspólne asercje: obie usterki wystąpiły i minęły, niezmienniki, bez spadu i rozprucia, pociąg dojechał, bez kar, stan po naprawie. */
function check(r, msg, { second = true } = {}) {
  const { sim } = r;
  assert.equal(r.fired, true, `${msg}: chwila nie nastąpiła (usterka nie wystąpiła)`);
  if (second) assert.ok(r.second?.since != null, `${msg}: druga usterka nie wystąpiła`);
  assert.deepEqual(sim.faults.list.filter((f) => !f.done).map((f) => `${f.type} ${f.target}`), [], `${msg}: usterki nienaprawione do końca zmiany`);
  assert.deepEqual(r.violations, [], `${msg}: niezmienniki`);
  assert.deepEqual(r.events, [], `${msg}: spad / rozprucie`);
  assert.deepEqual(stuck(sim), [], `${msg}: pociągi, które nie dojechały`);
  assert.deepEqual(unjustified(sim), [], `${msg}: kary za czynności wymuszone usterką`);
  assert.deepEqual(leftovers(sim), [], `${msg}: stan po naprawie`);
}
/** Kary za pominięte czynności zapowiadania (brak dPo do przyjazdu, brak zawiadomienia o odjeździe). */
const missed = (sim) => sim.score.items.filter((i) => ['no-dpo', 'no-depart-report'].includes(i.code)).map((i) => `${i.code} ${i.points}: ${i.msg}`);
/** Wszystkie kary (punkty ujemne). */
const penalties = (sim) => sim.score.items.filter((i) => i.points < 0).map((i) => `${i.code} ${i.points}: ${i.msg}`);
const faultLabel = (r) => [r.fault, r.second].filter(Boolean).map((f) => `${f.type} ${f.target} od ${Clock.format(f.since ?? f.at, true)} ${Math.round(f.duration / 6) / 10} min`).join(' + ');
const label = (st, srk, from, to, track, name, how, r) => `${st.name} ${srk}, pociąg ${NR} ${from}→${to} tor ${track}, ${name}, ${how === 'S' ? 'rozkaz „S”' : how}; ${faultLabel(r)}`;
/** Minięcia semafora `sig`: „sposób [usterki]”. */
const passesOf = (r, sig) => r.passes.filter((p) => p.sig === sig).map((p) => `${p.how} [${p.faults.join(', ')}]`);

/* ---------------- (a) semafor wyjazdowy + blokada tego wyjazdu ---------------- */

/**
 * Pociąg `e` stoi przed semaforem wyjazdowym na „Stój” przy nastawionym przebiegu na szlak – semafor albo null; `ready` –
 * także po postoju i o czasie odjazdu.
 */
function exitWaiting(sim, e, ready = true) {
  const tr = e.train;
  if (!tr || tr.finished || !tr.entered || tr.entryPending || tr.v > 0) return null;
  if (ready && (sim.clock.time < (e.depTime ?? 0) || (tr.dwellUntil ?? 0) > sim.clock.time)) return null;
  const sig = sim.ilk.signals.get(tr.nextSignal());
  const act = sig?.route && sim.ilk.active.get(sig.route);
  return act && !act.trainEntered && act.route.exit === e.to && !Interlocking.isTrainProceed(sig.aspect) ? sig : null;
}

/**
 * Dyżurny przy wyjeździe bez sygnału zezwalającego na szlak bez łączności: Sz daje automat (przebieg nastawiony, semafor
 * na „Stój”, blokada bez łączności); przy `how` = 'S' dyżurny testu wypisuje rozkaz „S”, gdy sąsiad dał „droga wolna”,
 * a automat nie działa, dopóki pociąg z rozkazem stoi (dałby mu jeszcze Sz).
 */
function exitDispatcher(how) {
  return (sim) => {
    const e = entryOf(sim, NR), tr = e?.train;
    if (how === 'S' && tr && !tr.finished) {
      const sig = exitWaiting(sim, e), b = sim.blocks.get(e.to);
      if (sig && b.fault && b.phone.permissionFor != null && !tr.hasOrderFor(sig.id)) sim.traffic.issueOrder({ nr: NR, signal: sig.id });
      if (tr.v === 0 && tr.hasOrderFor(tr.nextSignal())) return;
    }
    autoDispatch(sim);
  };
}

// Pociąg przyjeżdża ok. 07:05:30, automat pyta o drogę ok. 07:04:40 (6 min przed odjazdem), przebieg wyjazdowy nastawia
// o 07:08, odjazd 07:10.
const EXIT_MOMENTS = [
  { name: 'blokada bez łączności od początku zmiany, semafor wyjazdowy gaśnie przy postoju pociągu',
    fault: { type: 'signal-fail', when: moment.standing, target: on.exitSignal, duration: 25 }, extra: { type: 'block-fail', when: moment.start(), target: on.lineOut(NR), duration: 20 } },
  { name: 'obie usterki 10 s przed odjazdem, semafor wyjazdowy zezwala (pozwolenie Eap u nas)', window: true,
    fault: { type: 'signal-fail', when: moment.beforeDep, target: on.exitSignal, duration: 20 }, extra: { type: 'block-fail', target: on.lineOut(NR), duration: 15 } },
  { name: 'semafor wyjazdowy bez sygnału od postoju pociągu, blokada traci łączność przy nastawionym przebiegu',
    window: true, fault: { type: 'block-fail', when: moment.exitSet, target: on.lineOut, duration: 25 }, extra: { type: 'signal-fail', when: moment.standing(NR), target: on.exitSignal(NR), duration: 20 } },
];

test('(a) usterka semafora wyjazdowego i blokady tego wyjazdu: Sz albo rozkaz „S” dopiero po „droga wolna”, dPo 0 pkt, zawiadomienie o odjeździe', () => {
  let n = 0;
  for (const { st, srk } of PANELS) for (const [from, to, track] of WAYS) for (const m of EXIT_MOMENTS) for (const how of HOW) {
    const timetable = [os(st, from, to, track, '07:06', '07:10')];
    // próba Sz i rozkazu „S”, gdy pociąg stoi przed semaforem wyjazdowym bez sygnału, a „droga wolna” jeszcze nie ma
    const probe = { at: null, sz: null, order: null }, auth = [];
    let confirmed = false;
    // Sz i rozkaz „S” – przy telefonogramie „droga wolna” dla tego pociągu?
    const setup = (s) => s.bus.on('score', (i) => {
      if (i.code !== 'Sz' && i.code !== 'order') return;
      const b = s.blocks.get(to);
      auth.push(`${i.code}: ${String(b.phone.permissionFor) === String(NR) ? 'droga wolna' : `bez „droga wolna” (${b.phone.permissionFor})`}`);
    });
    const watch = (s) => {
      const e = entryOf(s, NR), b = s.blocks.get(to);
      if (String(b.phone.arrivalConfirmed) === String(NR)) confirmed = true;
      const sig = !probe.at && exitWaiting(s, e, false);
      if (sig && b.fault && b.phone.permissionFor == null) {
        probe.at = now(s);
        probe.sz = s.execute({ type: 'substitute', signal: sig.id }).ok;
        probe.order = s.traffic.issueOrder({ nr: NR, signal: sig.id }).ok;
      }
    };
    const r = shift({
      st, srk, timetable, dispatch: exitDispatcher(how), setup, watch,
      when: m.fault.when(NR), fault: { type: m.fault.type, target: m.fault.target(NR), duration: m.fault.duration }, extra: m.extra,
    });
    const exitSig = [r.fault, r.second].find((f) => f?.type === 'signal-fail')?.target;
    const msg = label(st, srk, from, to, track, m.name, how, r);
    check(r, msg);
    assert.deepEqual(missed(r.sim), [], `${msg}: pominięte czynności zapowiadania`);
    assert.deepEqual(penalties(r.sim), [], `${msg}: kary`);
    const b = r.sim.blocks.get(to);
    assert.deepEqual(passesOf(r, exitSig), [`${how === 'S' ? 'rozkaz' : 'Sz'} [block-fail ${to}, signal-fail ${exitSig}]`], `${msg}: minięcie ${exitSig}`);
    assert.deepEqual(scores(r.sim, 'Sz'), how === 'Sz' ? [0] : [], `${msg}: Sz`);
    assert.deepEqual(scores(r.sim, 'order'), how === 'S' ? [0] : [], `${msg}: rozkaz „S”`);
    assert.deepEqual(auth, [`${how === 'S' ? 'order' : 'Sz'}: droga wolna`], `${msg}: Sz / rozkaz po telefonogramie „droga wolna”`);
    assert.deepEqual(scores(r.sim, 'dPo'), [0], `${msg}: dPo po wyjeździe bez sygnału zezwalającego`);
    assert.equal(b.counters.dPo, 1, `${msg}: licznik dPo`);
    assert.ok(r.sent.includes(`ask-free ${NR}`), `${msg}: zapytanie o drogę (${r.sent.join(', ')})`);
    assert.ok(r.sent.includes(`departed ${NR}`), `${msg}: odjazd niezawiadomiony telefonicznie (${r.sent.join(', ')})`);
    assert.equal(confirmed, true, `${msg}: sąsiad nie potwierdził przyjazdu telefonicznie`);
    if (m.window) assert.deepEqual(probe, { at: probe.at ?? 'nie było', sz: false, order: false }, `${msg}: Sz / rozkaz „S” przed „droga wolna”`);
    n++;
  }
  assert.equal(n, 144);
});

/* ---------------- (b) semafor wjazdowy + blokada szlaku wjazdu ---------------- */

/** Pociąg `e` stoi przed semaforem wjazdowym z usterką przy nastawionym przebiegu – semafor albo null. */
function entryWaiting(sim, e) {
  const tr = e?.train;
  if (!tr || tr.finished || !tr.entryPending || tr.v > 0 || tr.stoppedAt?.kind !== 'signal') return null;
  const sig = sim.ilk.signals.get(tr.stoppedAt.signal);
  const act = sig?.route && sim.ilk.active.get(sig.route);
  return act && !act.trainEntered && sig.failed && !Interlocking.isTrainProceed(sig.aspect) ? sig : null;
}

/**
 * Dyżurny przy wjeździe przez semafor z usterką ze szlaku bez łączności: pociąg stoi przed semaforem – Sz albo rozkaz „S”
 * bez dKo (przy zapowiadaniu przyjazd potwierdza telefonogram, dKo się nie używa). Potem automat (telefonogram o przyjeździe).
 * `probe.dKo` – wynik próby dKo tuż przed Sz / rozkazem (w czasie próby `probe.active`).
 */
function entryDispatcher(how, probe) {
  return (sim) => {
    const e = entryOf(sim, NR), sig = entryWaiting(sim, e), b = e && sim.blocks.get(e.from);
    if (sig && b.fault && !sig.substitute && !e.train.hasOrderFor(sig.id)) {
      if (probe.dKo == null) { probe.active = true; probe.dKo = sim.execute({ type: 'block', exit: e.from, btn: 'dKo' }).ok; probe.active = false; }
      if (how === 'Sz') sim.execute({ type: 'substitute', signal: sig.id }); else sim.traffic.issueOrder({ nr: NR, signal: sig.id });
    }
    autoDispatch(sim);
  };
}

// Sąsiad zgłasza pociąg ok. 07:10 (zapytanie telefoniczne przy usterce, Wbl przy sprawnej blokadzie), pociąg wyrusza
// ok. 07:12, przebieg wjazdowy automat nastawia, gdy pociąg jest na szlaku, pociąg staje przed semaforem ok. 07:15.
const ENTRY_MOMENTS = [
  { name: 'blokada bez łączności przed zgłoszeniem pociągu, semafor wjazdowy gaśnie, gdy pociąg jest na szlaku',
    fault: { type: 'signal-fail', when: at.onLineIn, target: on.entrySignal, duration: 25 }, extra: { type: 'block-fail', when: (s) => s.clock.time >= entryOf(s, NR).requestAt - 30, target: on.lineIn(NR), duration: 25 } },
  { name: 'obie usterki przy nastawionym przebiegu wjazdowym (sygnał zezwalający), pociąg na szlaku',
    fault: { type: 'signal-fail', when: at.entrySet, target: on.entrySignal, duration: 25 }, extra: { type: 'block-fail', target: on.lineIn(NR), duration: 20 } },
  { name: 'semafor wjazdowy gaśnie przy nastawionym przebiegu, blokada traci łączność, gdy pociąg stoi przed nim',
    fault: { type: 'block-fail', when: moment.beforeEntry, target: on.lineIn, duration: 25 }, extra: { type: 'signal-fail', when: at.entrySet(NR), target: on.entrySignal(NR), duration: 20 } },
];

test('(b) usterka semafora wjazdowego i blokady szlaku wjazdu: wjazd na Sz albo rozkaz „S”, dKo odrzucone, przyjazd potwierdzony telefonogramem', () => {
  let n = 0;
  for (const { st, srk } of PANELS) for (const [from, to, track] of WAYS) for (const m of ENTRY_MOMENTS) for (const how of HOW) {
    const timetable = [os(st, from, to, track, '07:16', '07:20')];
    // próby dKo przed wjazdem i Ko po przybyciu pociągu przy usterce blokady (obie mają być odrzucone); przyciski blokady
    // naciśnięte poza próbami
    const probe = { dKo: null, Ko: null, active: false }, pressed = [];
    const setup = (s) => s.bus.on('button', (x) => { if (!probe.active && x.ref.kind === 'block' && /:(d?Ko)$/.test(x.ref.id)) pressed.push(`${now(s)} ${x.ref.id}`); });
    const watch = (s) => {
      const b = s.blocks.get(from);
      if (probe.Ko != null || !b.fault || !b.koPending) return;
      probe.active = true; probe.Ko = s.execute({ type: 'block', exit: from, btn: 'Ko' }).ok; probe.active = false;
    };
    const r = shift({
      st, srk, timetable, dispatch: entryDispatcher(how, probe), setup, watch,
      when: m.fault.when(NR), fault: { type: m.fault.type, target: m.fault.target(NR), duration: m.fault.duration }, extra: m.extra,
    });
    const entrySig = [r.fault, r.second].find((f) => f?.type === 'signal-fail')?.target;
    const msg = label(st, srk, from, to, track, m.name, how, r);
    check(r, msg);
    assert.deepEqual(missed(r.sim), [], `${msg}: pominięte czynności zapowiadania`);
    assert.deepEqual(penalties(r.sim), [], `${msg}: kary`);
    assert.deepEqual(passesOf(r, entrySig), [`${how === 'S' ? 'rozkaz' : 'Sz'} [block-fail ${from}, signal-fail ${entrySig}]`], `${msg}: minięcie ${entrySig}`);
    assert.deepEqual(scores(r.sim, 'Sz'), how === 'Sz' ? [0] : [], `${msg}: Sz`);
    assert.deepEqual(scores(r.sim, 'order'), how === 'S' ? [0] : [], `${msg}: rozkaz „S”`);
    assert.equal(String(entryOf(r.sim, NR).actualTrack), track, `${msg}: tor przyjazdu`);
    // przy zapowiadaniu telefonicznym przyjazd potwierdza telefonogram – dKo i Ko odrzucone, liczniki bez zmian
    assert.equal(probe.dKo, false, `${msg}: dKo przy usterce blokady (pociąg przed semaforem wjazdowym)`);
    assert.notEqual(probe.Ko, true, `${msg}: Ko przy usterce blokady`);
    assert.deepEqual(pressed, [], `${msg}: Ko / dKo naciśnięte przy zapowiadaniu`);
    assert.equal(r.sim.blocks.get(from).counters.dKo, 0, `${msg}: licznik dKo`);
    assert.deepEqual(scores(r.sim, 'dKo'), [], `${msg}: dKo`);
    assert.ok(r.sent.includes(`arrived ${NR}`), `${msg}: przyjazd niezawiadomiony telefonicznie (${r.sent.join(', ')})`);
    n++;
  }
  assert.equal(n, 144);
});

/* ---------------- (c), (d) wjazd na Sz / rozkaz „S” przy fałszywej zajętości toru docelowego ---------------- */

/**
 * Dyżurny przy wjeździe, gdy przebiegu nie da się nastawić (fałszywa zajętość toru docelowego) albo semafor nie podaje
 * sygnału (Ie-10 §32, §35; Ir-1 §58; docs/SOURCES.md): pociąg stoi przed semaforem wjazdowym na „Stój”, `active(sim)` –
 * obie usterki trwają. Zwrotnice drogi w położenie przebiegu na tor planowy i zamknięte Zz (poza utwierdzonymi
 * w przebiegu); zwrotnica bez kontroli – najpierw próba rozkazu „S” (`st.early`, ma być odrzucony), potem zabezpieczenie
 * na miejscu; gdy zabezpieczona – dKo i Sz albo rozkaz „S” (`st.given`: wynik, czynne usterki, zwrotnice drogi ani
 * zamknięte, ani utwierdzone, ani zabezpieczone – `loose`, zabezpieczone – `secured`). Po przyjeździe Zz zdjęte, po
 * naprawie napędu – zabezpieczenie zdjęte. Potem automat.
 */
function wayDispatcher(how, active) {
  const st = { locked: [], secured: [], early: null, given: null };
  const fn = (sim) => {
    const e = entryOf(sim, NR), tr = e?.train, r = plannedEntry(sim, NR);
    if (st.given && e.actualArr != null) for (const id of st.locked.splice(0)) sim.execute({ type: 'lock', id });
    if (st.given && e.actualArr != null && !sim.faults.list.some((f) => f.type === 'point-control' && !f.done)) for (const id of st.secured.splice(0)) sim.execute({ type: 'point-secure', id, on: false });
    const sig = sim.ilk.signals.get(r.start);
    if (!st.given && tr?.entryPending && tr.v === 0 && tr.stoppedAt?.kind === 'signal' && tr.stoppedAt.signal === r.start && active(sim) && Interlocking.isStop(sig.aspect)) {
      const pts = [...r.points, ...r.flank];
      let ready = true;
      for (const q of pts) {
        const p = sim.ilk.points.get(q.id);
        if (p.moving) { ready = false; continue; }
        if (p.position !== q.position) { ready = false; if (!p.individualLock && !p.secured && !p.securing) sim.execute({ type: 'point', id: q.id, position: q.position }); }
      }
      if (ready) {
        for (const q of pts) if (!sim.ilk.points.get(q.id).individualLock && !sim.ilk.pointLockedByRoute(q.id)) { sim.execute({ type: 'lock', id: q.id }); st.locked.push(q.id); }
        for (const q of pts) {
          const p = sim.ilk.points.get(q.id);
          if (p.control || p.secured) continue;
          ready = false;
          st.early ??= sim.traffic.issueOrder({ nr: NR, signal: r.start });
          if (!p.securing) { sim.execute({ type: 'point-secure', id: q.id, on: true }); st.secured.push(q.id); }
        }
      }
      if (ready) {
        const b = sim.blocks.get(e.from);
        if (b && !b.fault && !b.auto && !b.koPrepared) sim.execute({ type: 'block', exit: e.from, btn: 'dKo' });
        const loose = pts.filter((q) => { const p = sim.ilk.points.get(q.id); return !p.individualLock && !p.secured && !sim.ilk.pointLockedByRoute(q.id); }).map((q) => q.id);
        const res = how === 'Sz' ? sim.execute({ type: 'substitute', signal: r.start }) : sim.traffic.issueOrder({ nr: NR, signal: r.start });
        st.given = { ok: res.ok, reason: res.reason, faults: activeFaults(sim), loose, secured: [...st.secured] };
      }
    }
    autoDispatch(sim);
  };
  fn.state = st;
  return fn;
}

/**
 * Wjazd na Sz / rozkaz „S”: podany w czasie obu usterek przy zwrotnicach drogi zamkniętych, utwierdzonych albo
 * zabezpieczonych (`secured` – zabezpieczone na miejscu), sposób minięcia semafora wjazdowego, punkty, dKo przed wjazdem,
 * tor planowy, zamknięcia i zabezpieczenia zdjęte.
 */
function checkWay(r, d, how, msg, secured = []) {
  const { sim } = r;
  check(r, msg);
  assert.deepEqual(missed(sim), [], `${msg}: pominięte czynności zapowiadania`);
  assert.deepEqual(penalties(sim), [], `${msg}: kary`);
  const faults = [r.fault, r.second].map((f) => `${f.type} ${f.target}`).sort();
  assert.deepEqual(d.state.given, { ok: true, reason: undefined, faults, loose: [], secured }, `${msg}: ${how === 'S' ? 'rozkaz „S”' : 'Sz'} w czasie obu usterek`);
  const sig = plannedEntry(sim, NR).start;
  assert.deepEqual(passesOf(r, sig), [`${how === 'S' ? 'rozkaz' : 'Sz'} [${faults.join(', ')}]`], `${msg}: minięcie ${sig}`);
  assert.deepEqual(scores(sim, 'Sz'), how === 'Sz' ? [0] : [], `${msg}: Sz`);
  assert.deepEqual(scores(sim, 'Sz-points'), [], `${msg}: Sz przy zwrotnicach niezamkniętych`);
  assert.deepEqual(scores(sim, 'order'), how === 'S' ? [0] : [], `${msg}: rozkaz „S”`);
  assert.deepEqual(scores(sim, 'dKo'), [0], `${msg}: dKo przed wjazdem`);
  assert.equal(String(entryOf(sim, NR).actualTrack), String(entryOf(sim, NR).track), `${msg}: tor przyjazdu`);
  assert.deepEqual([...sim.ilk.points.values()].filter((p) => p.individualLock || p.secured || p.securing).map((p) => p.id), [], `${msg}: zamknięcia Zz / zabezpieczenia po przyjeździe i naprawie`);
}

// Napęd zwrotnicy, którą trzeba przestawić na tor 2, i fałszywa zajętość toru 2: obie, gdy sąsiad zgłasza pociąg (07:00,
// przebieg wjazdowy się nie nastawia – zwrotnicę przestawia dyżurny, gdy pociąg stanie przed semaforem ok. 07:05), albo
// napęd od wyprawienia pociągu przez sąsiada (automat przestawia zwrotnicę przy nastawianiu wjazdu, przebieg się nie
// utwierdza), a zajętość, gdy pociąg stoi przed semaforem. Zabezpieczenie zwrotnicy na miejscu trwa 3 min.
const POINT_MOMENTS = [
  { name: 'obie usterki przy zgłoszeniu pociągu',
    fault: { type: 'point-control', when: at.announced, target: on.entryPointToMove, duration: 25 }, extra: { type: 'false-occupancy', target: on.dest(NR), duration: 20 } },
  { name: 'napęd zwrotnicy od wyprawienia pociągu przez sąsiada, tor docelowy zajęty, gdy pociąg stoi przed semaforem',
    fault: { type: 'false-occupancy', when: moment.beforeEntry, target: on.dest, duration: 25 }, extra: { type: 'point-control', when: at.announced(NR), target: on.entryPointToMove(NR), duration: 20 } },
];

test('(c) usterka napędu zwrotnicy i fałszywa zajętość toru docelowego: Sz albo rozkaz „S” dopiero po zabezpieczeniu zwrotnicy na miejscu', () => {
  let n = 0;
  for (const { st, srk } of LIVE) for (const [from, to] of DIRS) for (const m of POINT_MOMENTS) for (const how of HOW) {
    const track = '2';
    const timetable = [os(st, from, to, track, '07:06', '07:10')];
    const d = wayDispatcher(how, (s) => activeFaults(s).length === 2);
    // zwrotnica z usterką w chwili, gdy pociąg na nią wjeżdża
    let atPoint = null;
    const watch = (s) => {
      const f = s.faults.list.find((x) => x.type === 'point-control');
      if (atPoint || !f?.since) return;
      const p = s.ilk.points.get(f.target);
      if (s.ilk.sections.get(p.section).physical) atPoint = { secured: p.secured, control: p.control, faults: activeFaults(s) };
    };
    const r = shift({
      st, srk, timetable, dispatch: d, watch,
      when: m.fault.when(NR), fault: { type: m.fault.type, target: m.fault.target(NR), duration: m.fault.duration }, extra: m.extra,
    });
    const msg = label(st, srk, from, to, track, m.name, how, r);
    const point = [r.fault, r.second].find((f) => f?.type === 'point-control')?.target;
    checkWay(r, d, how, msg, [point]);
    assert.match(d.state.early?.reason ?? '', /bez kontroli/, `${msg}: rozkaz „S” przed zabezpieczeniem zwrotnicy ${point} (${JSON.stringify(d.state.early)})`);
    assert.equal(d.state.early.ok, false, `${msg}: rozkaz „S” przed zabezpieczeniem zwrotnicy ${point}`);
    const both = [r.fault, r.second].map((f) => `${f.type} ${f.target}`).sort();
    assert.deepEqual(atPoint, { secured: true, control: false, faults: both }, `${msg}: pociąg wjeżdża na zwrotnicę ${point}`);
    n++;
  }
  assert.equal(n, 40);
});

/** Przebieg wjazdowy nastawiony, pociąg w odcinku zbliżania (przed semaforem wjazdowym). */
const approaching = (nr) => (sim) => { const a = entryActive(sim, nr), tr = entryOf(sim, nr)?.train; return !!a && !a.trainEntered && !!tr && tr.occupiedSections().has(a.route.approach); };

// Semafor wjazdowy bez sygnału i fałszywa zajętość toru docelowego: obie przy zgłoszeniu pociągu (przebieg się nie
// nastawia) albo semafor od zgłoszenia, a zajętość, gdy przebieg (na „Stój”) jest już nastawiony – pociąg na szlaku
// (automat zwalnia przebieg, Pz) albo w odcinku zbliżania (zwalnianie czasowe, pociąg staje przed semaforem wcześniej).
const WAY_MOMENTS = [
  { name: 'obie usterki przy zgłoszeniu pociągu',
    fault: { type: 'signal-fail', when: at.announced, target: on.entrySignal, duration: 25 }, extra: { type: 'false-occupancy', target: on.dest(NR), duration: 20 } },
  { name: 'semafor wjazdowy bez sygnału od zgłoszenia, tor docelowy zajęty przy nastawionym przebiegu',
    fault: { type: 'false-occupancy', when: moment.entryLocked, target: on.dest, duration: 25 }, extra: { type: 'signal-fail', when: at.announced(NR), target: on.entrySignal(NR), duration: 20 } },
  { name: 'semafor wjazdowy bez sygnału od zgłoszenia, tor docelowy zajęty, gdy pociąg jest w odcinku zbliżania',
    fault: { type: 'false-occupancy', when: approaching, target: on.dest, duration: 25 }, extra: { type: 'signal-fail', when: at.announced(NR), target: on.entrySignal(NR), duration: 20 } },
];

test('(d) usterka semafora wjazdowego i fałszywa zajętość toru docelowego: wjazd na Sz albo rozkaz „S” przez zwrotnice zamknięte, dKo przed wjazdem', () => {
  let n = 0;
  for (const { st, srk } of LIVE) for (const [from, to, track] of WAYS) for (const m of WAY_MOMENTS) for (const how of HOW) {
    const timetable = [os(st, from, to, track, '07:06', '07:10')];
    const d = wayDispatcher(how, (s) => activeFaults(s).length === 2);
    const r = shift({
      st, srk, timetable, dispatch: d,
      when: m.fault.when(NR), fault: { type: m.fault.type, target: m.fault.target(NR), duration: m.fault.duration }, extra: m.extra,
    });
    const msg = label(st, srk, from, to, track, m.name, how, r);
    // zwrotnice mają kontrolę – bez zabezpieczenia na miejscu
    checkWay(r, d, how, msg, []);
    n++;
  }
  assert.equal(n, 120);
});

/* ---------------- (e) koniec zmiany z otwartym obowiązkiem telefonicznym ---------------- */

/**
 * Blokada do sąsiada bez łączności przez całą zmianę (od 07:00 do 07:40); nasz pociąg odjeżdża na Sz (automat) albo na
 * rozkaz „S” (dyżurny testu) po „droga wolna”, dPo daje automat. Zawiadomienie o odjeździe: dyżurny nadaje (automat)
 * albo nie (telefonogram wstrzymany). Zmiana kończy się po rozkładzie (10:00) albo o 07:12, gdy pociąg jest jeszcze na
 * szlaku. Bez zawiadomienia zmiana czeka na obowiązek (`Simulation.#blockDuties`) – nie kończy się „wszystko wykonane”,
 * zanim pociąg dojedzie do sąsiada (wtedy kara `no-depart-report`), a koniec o czasie dolicza tę karę w ocenie końcowej
 * (`#finalScore`). Z zawiadomieniem – bez kary, zmiana kończy się po odjeździe.
 */
const END_VARIANTS = [
  { name: 'bez zawiadomienia o odjeździe, koniec zmiany po rozkładzie', report: false, endTime: '10:00', reason: 'all-done', arrived: true, penalty: true },
  { name: 'bez zawiadomienia o odjeździe, koniec zmiany o 07:12 (pociąg na szlaku)', report: false, endTime: '07:12', reason: 'time', arrived: false, penalty: true },
  { name: 'z zawiadomieniem o odjeździe', report: true, endTime: '10:00', reason: 'all-done', arrived: false, penalty: false },
];
test('(e) koniec zmiany z otwartym obowiązkiem telefonicznym: bez zawiadomienia o odjeździe zmiana czeka na dojazd pociągu, raport z karą no-depart-report; z zawiadomieniem – bez kary', () => {
  let n = 0;
  for (const { st, srk } of PANELS) for (const v of END_VARIANTS) for (const how of HOW) {
    const [from, to, track] = WAYS[0];
    const timetable = [os(st, from, to, track, '07:06', '07:10')];
    let end = null, dep = null;
    const setup = (s) => s.bus.on('shift-end', (rep) => {
      const e = entryOf(s, NR);
      end = { reason: rep.endReason, status: e.status, report: rep.items.filter((i) => i.code === 'no-depart-report').map((i) => i.points) };
    });
    const watch = (s) => { const e = entryOf(s, NR), b = s.blocks.get(to); if (!dep && e.train?.onLine(to)) dep = { fault: b.fault, at: now(s) }; };
    const r = shift({
      st, srk, timetable, endTime: v.endTime, dispatch: exitDispatcher(how), drop: v.report ? [] : ['departed'], setup, watch,
      when: moment.start(), fault: { type: 'block-fail', target: to, duration: 40 },
    });
    const msg = `${st.name} ${srk}, pociąg ${NR} ${from}→${to} tor ${track}, ${v.name}, ${how === 'S' ? 'rozkaz „S”' : how}; ${faultLabel(r)}, koniec zmiany ${v.endTime}`;
    check(r, msg, { second: false });
    assert.deepEqual(dep, { fault: true, at: dep?.at }, `${msg}: wyjazd na szlak przy usterce blokady`);
    assert.deepEqual(scores(r.sim, how === 'S' ? 'order' : 'Sz'), [0], `${msg}: ${how === 'S' ? 'rozkaz „S”' : 'Sz'}`);
    assert.deepEqual(scores(r.sim, 'dPo'), [0], `${msg}: dPo`);
    assert.equal(r.sent.includes(`departed ${NR}`), v.report, `${msg}: zawiadomienie o odjeździe (${r.sent.join(', ')})`);
    // zmiana kończy się „wszystko wykonane” dopiero wtedy, gdy nic na nią nie czeka; bez zawiadomienia – po dojeździe pociągu
    assert.deepEqual(end, { reason: v.reason, status: v.arrived ? 'na następnym posterunku' : 'odjechał', report: v.penalty ? [-10] : [] }, `${msg}: koniec zmiany`);
    // kary do końca przebiegu testu; przy końcu o czasie kara za brak zawiadomienia wraca po dojeździe pociągu – osobny
    // test niżej (błąd silnika)
    if (v.reason === 'all-done') assert.deepEqual(penalties(r.sim).map((x) => x.split(':')[0]), v.penalty ? ['no-depart-report -10'] : [], `${msg}: kary`);
    n++;
  }
  assert.equal(n, 36);
});

/*
 * Koniec zmiany o czasie, gdy pociąg jest jeszcze na szlaku, a obowiązek blokady (zawiadomienie o odjeździe, dPo) nie jest
 * wykonany: ocena końcowa dolicza karę „jak przy dojeździe pociągu do sąsiada (wtedy już jej nie będzie)”
 * (`Simulation.#finalScore`). Symulacja biegnie po końcu zmiany dalej (gra nie zatrzymuje zegara po raporcie, „Stan oceny”
 * liczy dalej), a gdy pociąg dojedzie do sąsiada, `LineBlock.trainArrivedAtNeighbour` dolicza tę samą karę drugi raz.
 */
/** dyżurny nie naciska dPo (automat naciska je w każdym takcie) */
const noDpo = (to) => (s) => { const b = s.blocks.get(to), press = b.press.bind(b); b.press = (btn) => (btn === 'dPo' ? { ok: false, reason: 'dyżurny nie naciska dPo' } : press(btn)); };
for (const duty of ['no-depart-report', 'no-dpo']) {
  const what = duty === 'no-dpo' ? 'dPo' : 'zawiadomienia o odjeździe';
  // wcześniej Simulation.#finalScore nie zamykał obowiązku (needPo / phone.departedReported), a
  // LineBlock.trainArrivedAtNeighbour doliczał karę drugi raz po końcu zmiany
  test(`(e) kara za brak ${what} doliczona przy końcu zmiany o czasie nie powtarza się, gdy pociąg dojedzie do sąsiada po końcu zmiany`, () => {
    const [from, to, track] = WAYS[0];
    let atEnd = null;
    const r = shift({
      st: szkolna, srk: 'E', timetable: [os(szkolna, from, to, track, '07:06', '07:10')], endTime: '07:12', drop: duty === 'no-dpo' ? [] : ['departed'],
      setup: (s) => { if (duty === 'no-dpo') noDpo(to)(s); s.bus.on('shift-end', (rep) => { atEnd = { reason: rep.endReason, status: entryOf(s, NR).status, penalty: rep.items.filter((i) => i.code === duty).map((i) => i.points) }; }); },
      when: moment.start(), fault: { type: 'block-fail', target: to, duration: 40 },
    });
    const msg = `Szkolna E, pociąg ${NR} ${from}→${to} tor ${track}, koniec zmiany o 07:12 bez ${what}; ${faultLabel(r)}`;
    check(r, msg, { second: false });
    assert.deepEqual(atEnd, { reason: 'time', status: 'odjechał', penalty: [-10] }, `${msg}: koniec zmiany`);
    assert.deepEqual(scores(r.sim, duty), [-10], `${msg}: kara ${duty} po dojeździe pociągu do sąsiada po końcu zmiany`);
    assert.deepEqual(r.sim.score.items.filter((i) => i.code === duty).map((i) => i.exit), [to], `${msg}: szlak w polu danych`);
  });
}
