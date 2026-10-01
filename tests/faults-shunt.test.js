import { test } from 'node:test';
import assert from 'node:assert/strict';
import szkolna from '../src/stations/szkolna.js';
import { Interlocking } from '../src/model/Interlocking.js';
import { autoDispatch, allArrived } from './helpers.js';
import { violations, watchEvents } from './invariants.js';
import { faultSim, runWithFault, stuck, unjustified, leftovers, Clock } from './fault-harness.js';

/*
 * Manewry przy usterkach i ochrona drogi pociągu jadącego na Sz / rozkaz „S” (podstawa: `tests/fault-harness.js`).
 * Szkolna, stanowiska E i komputerowe.
 *
 * Część 1 – zadania manewrowe przy usterce na drodze manewru. Osobowy 90201 kończy bieg na torze 2; skład odstawia się na
 * tor 3 (przebieg D2-kT3m: Ms2 na semaforze D2, zwrotnica Zw3 na „−”, odcinki T2e, Iz3, T3w, T3) i podstawia z powrotem
 * na tor 2 (przebieg Tm1-Tm2: Ms2 na tarczy Tm1, odcinki T3w, Iz3, T2e, T2), potem odjeżdża jako 90202 o 08:12. Usterka:
 * semafor / tarcza bez Ms2, napęd zwrotnicy Zw3, fałszywa zajętość odcinka drogi – przed manewrem albo w czasie jazdy
 * składu; krótka (4 min, naprawa przed terminem zadania) i długa (25 min). Ruch prowadzi automat.
 *  - krótka: zadania wykonane w terminie po naprawie, bez kar, bez niezmienników, stan po zmianie czysty;
 *  - długa: obecne zachowanie (przypięte): automat czeka na naprawę; odstawienie przepada (−10), podstawienie po nim też
 *    (−10), 90202 odjeżdża wprost z toru 2 z opóźnieniem; przy usterce przed podstawieniem – podstawienie po terminie
 *    (0 pkt) i późny odjazd 90202;
 *  - Sz i rozkaz „S” przy sygnalizatorze manewrowym z usterką – obecne zachowanie (przypięte): Sz na D2 przyjęty, skład
 *    stoi (Sz nie jest sygnałem dla manewrów); rozkaz „S” na D2 przyjęty, maszynista potwierdza jazdę, a skład stoi
 *    (`Train.#shuntPermitted` nie zna rozkazu); na tarczy Tm1 Sz i rozkaz odrzucone;
 *  - reguła docelowa (todo): skład mija sygnalizator manewrowy z usterką na zezwolenie dyżurnego i wykonuje zadanie
 *    w terminie. Reguły (Ir-9: zezwolenie ustne / przez radiotelefon) nie ma w docs/SOURCES.md – założenie do potwierdzenia.
 *
 * Część 2 – droga pociągu jadącego na Sz albo rozkaz „S” zostaje zabezpieczona, dopóki pociąg jej nie minie
 * (docs/SOURCES.md, „Sygnał zastępczy i rozkaz „S””: przed Sz zwrotnice drogi ustawia się, sprawdza i utwierdza –
 * Ie-10 §35 ust. 1 pkt 1–2 i 6, Ir-1 §58 ust. 4). Pociąg 6101 z Lipna na tor 1, fałszywa zajętość T1: dyżurny zamyka
 * Zw1 (Zz), dKo, Sz na A albo rozkaz „S”. Przy nastawionym przebiegu A-D1 zwrotnicę trzyma utwierdzenie przebiegu.
 */

const SRK = ['E', 'komputerowe'];
const SHORT = 4, LONG = 25;
const entryOf = (sim, nr) => sim.traffic.timetable().find((e) => e.nr === nr);
const taskOf = (sim, id) => sim.traffic.tasks.find((t) => t.id === id);
const unit = (sim) => entryOf(sim, 90201)?.train;
const now = (sim) => Clock.format(sim.clock.time, true);
/** Zmiana z samymi 90201 / 90202 i zadaniami manewrowymi Szkolnej. */
const shuntSim = (srk) => faultSim(szkolna, { srk, timetable: szkolna.timetable.filter((e) => e.nr === 90201 || e.nr === 90202), tasks: szkolna.tasks });
/** Kary (punkty ujemne) jako posortowane kody. */
const penalties = (sim) => sim.score.items.filter((i) => i.points < 0).map((i) => i.code).sort();
const points = (sim, code) => sim.score.items.filter((i) => i.code === code).map((i) => i.points);

/* ------------------------------------------------------------------ */
/* Część 1 – zadania manewrowe przy usterce                             */
/* ------------------------------------------------------------------ */

/** Chwile usterki. */
const moment = {
  /** 90201 minął semafor wjazdowy – usterka jest na drodze odstawienia, zanim automat nastawi przebieg manewrowy */
  entering: (sim) => { const tr = unit(sim); return !!tr && tr.entered && !tr.entryPending; },
  /** skład odstawiony na tor 3 – usterka na drodze podstawienia, zanim automat zmieni kierunek i nastawi przebieg */
  away: (sim) => taskOf(sim, 'odstaw-90201').done,
  /** skład jedzie w przebiegu D2-kT3m, czoło na rozjeździe Zw3 */
  awayMoving: (sim) => { const tr = unit(sim); return !!tr && tr.mode === 'shunt' && tr.v > 0 && sim.ilk.active.has('D2-kT3m') && tr.occupiedSections().has('Iz3'); },
  /** skład jedzie w przebiegu Tm1-Tm2, czoło na rozjeździe Zw3 */
  backMoving: (sim) => { const tr = unit(sim); return !!tr && tr.mode === 'shunt' && tr.v > 0 && sim.ilk.active.has('Tm1-Tm2') && tr.occupiedSections().has('Iz3'); },
};

/**
 * Przypadki: `move` – zadanie, które usterka wstrzymuje (`null` – żadne), `dPz` – przebieg manewrowy, który nie rozwiązuje
 * się za składem (zajętość z usterki) i automat zwalnia go doraźnie: na pulpicie E dPz (licznik, 0 pkt – uzasadnione
 * usterką), na stanowisku komputerowym ZDM – polecenie zwykłe, bez licznika i bez pozycji w ocenie; `permit` –
 * sygnalizator uszkodzony przy nastawionym przebiegu: skład jedzie na zezwolenie dyżurnego (Ir-9 § 10 ust. 15, automat
 * daje je radiem), nie czeka na naprawę.
 */
const CASES = [
  // odstawienie: przebieg D2-kT3m
  { when: 'entering', type: 'signal-fail', target: 'D2', move: 'odstaw-90201', permit: true, what: 'semafor D2 bez Ms2 (przebieg nastawiony, D2 na „Stój”)' },
  { when: 'entering', type: 'point-control', target: 'Zw3', move: 'odstaw-90201', what: 'zwrotnica Zw3 po przestawieniu bez kontroli (przebieg się nie nastawia)' },
  { when: 'entering', type: 'false-occupancy', target: 'T2e', move: 'odstaw-90201', what: 'zajętość T2e (pierwszy odcinek za D2)' },
  { when: 'entering', type: 'false-occupancy', target: 'Iz3', move: 'odstaw-90201', what: 'zajętość Iz3 (rozjazd Zw3)' },
  { when: 'entering', type: 'false-occupancy', target: 'T3', move: 'odstaw-90201', what: 'zajętość T3 (tor docelowy)' },
  // podstawienie: przebieg Tm1-Tm2
  { when: 'away', type: 'signal-fail', target: 'Tm1', move: 'podstaw-90202', permit: true, what: 'tarcza Tm1 bez Ms2 (przebieg nastawiony, Tm1 na Ms1)' },
  { when: 'away', type: 'false-occupancy', target: 'Iz3', move: 'podstaw-90202', what: 'zajętość Iz3 (rozjazd Zw3)' },
  { when: 'away', type: 'false-occupancy', target: 'T2', move: 'podstaw-90202', what: 'zajętość T2 (tor docelowy)' },
  // usterka napędu objawia się dopiero po przestawieniu – Zw3 zostaje na „−” po odstawieniu
  { when: 'away', type: 'point-control', target: 'Zw3', move: null, what: 'zwrotnica Zw3 już w położeniu przebiegu – bez przestawiania, bez wpływu' },
  // usterka w czasie jazdy składu: przebieg nie rozwiązuje się za składem – doraźne zwolnienie bez kary; T3w zajęty
  // z usterki zamyka też drogę podstawienia
  { when: 'awayMoving', type: 'false-occupancy', target: 'T3w', move: 'podstaw-90202', dPz: 'D2-kT3m', what: 'zajętość T3w przed czołem jadącego składu (odstawienie)' },
  { when: 'backMoving', type: 'false-occupancy', target: 'T2e', move: null, dPz: 'Tm1-Tm2', what: 'zajętość T2e przed czołem jadącego składu (podstawienie)' },
];

/** Sygnalizator uszkodzony: zezwolenie dyżurnego radiem (raz, dla przebiegu od tego sygnalizatora), manewr przed naprawą. */
function checkPermit({ sim, msg, permits }, c, repaired) {
  assert.deepEqual(permits.map((p) => p.signal), [c.target], `${msg}: zezwolenie na jazdę obok ${c.target}`);
  assert.ok(taskOf(sim, c.move).doneAt < repaired, `${msg}: ${c.move} na zezwolenie, przed naprawą`);
}

function shuntRun(srk, c, duration) {
  const sim = shuntSim(srk);
  const released = [], permits = [];
  sim.bus.on('log', (l) => {
    const m = /^Doraźne zwolnienie przebiegu (?:manewrowego )?(\S+)/.exec(l.msg); if (m) released.push(m[1]);
    const z = /^Zezwolenie na jazdę manewrową składu \S+ obok uszkodzonego sygnalizatora (\S+)/.exec(l.msg); if (z) permits.push({ signal: z[1] });
  });
  const r = runWithFault(sim, { when: moment[c.when], fault: { type: c.type, target: c.target, duration }, until: '09:00' });
  const msg = `Szkolna ${srk}, ${c.type} ${c.target} (${c.what}), ${duration} min od ${r.fault ? Clock.format(r.fault.since ?? r.fault.at, true) : '–'}`;
  return { sim, r, msg, released, permits };
}

/** Wspólne: usterka wystąpiła, bez naruszeń niezmienników, bez spadu i rozprucia, wszystkie pociągi dojechały. */
function common({ sim, r, msg, released }, c) {
  assert.equal(r.fired, true, `${msg}: chwila nie nastąpiła`);
  assert.deepEqual(r.violations, [], `${msg}: niezmienniki`);
  assert.deepEqual(r.events, [], `${msg}: spad / rozprucie`);
  assert.deepEqual(stuck(sim), [], `${msg}: pociągi, które nie dojechały`);
  assert.deepEqual(unjustified(sim), [], `${msg}: kary za czynności wymuszone usterką`);
  assert.deepEqual(released, c.dPz ? [c.dPz] : [], `${msg}: doraźne zwolnienie przebiegu manewrowego`);
  assert.deepEqual(points(sim, 'dPz'), c.dPz && !sim.ilk.shuntEmergencyPlain ? [0] : [], `${msg}: dPz bez kary (ZDM bez pozycji w ocenie)`);
}

test('manewry przy krótkiej usterce na drodze manewru: zadania wykonane w terminie po naprawie, bez kar (Szkolna, E i komputerowe)', () => {
  for (const srk of SRK) for (const c of CASES) {
    const x = shuntRun(srk, c, SHORT);
    const { sim, r, msg } = x;
    common(x, c);
    const repaired = r.fault.since + r.fault.duration;
    for (const id of ['odstaw-90201', 'podstaw-90202']) {
      const t = taskOf(sim, id);
      assert.ok(t.done && t.doneAt <= t.deadlineTime, `${msg}: ${id} wykonane w terminie (${t.done ? Clock.format(t.doneAt, true) : t.failed ? 'przepadło' : 'w toku'})`);
    }
    // usterka naprawdę wstrzymała manewr: zadanie zaliczone dopiero po naprawie; bez wpływu (`move: null`) – zwrotnica
    // już w położeniu albo zajętość przed składem, który jedzie w nastawionym przebiegu; sygnalizator uszkodzony
    // (`permit`) – skład jedzie na zezwolenie dyżurnego przed naprawą
    if (c.permit) checkPermit(x, c, repaired);
    else if (c.move) assert.ok(taskOf(sim, c.move).doneAt > repaired, `${msg}: ${c.move} wykonane przed naprawą – usterka nie trafiła w drogę manewru`);
    else assert.ok(taskOf(sim, 'podstaw-90202').doneAt < repaired, `${msg}: podstawienie czekało na naprawę`);
    assert.deepEqual(points(sim, 'task'), [10, 10], `${msg}: punkty za zadania`);
    assert.deepEqual(penalties(sim), [], `${msg}: kary`);
    assert.ok(entryOf(sim, 90202).actualDep - entryOf(sim, 90202).depTime < 60, `${msg}: 90202 odjeżdża o czasie`);
    assert.deepEqual(leftovers(sim), [], `${msg}: stan po zmianie`);
  }
});

/*
 * Długa usterka (25 min). Sygnalizator uszkodzony przy nastawionym przebiegu – skład jedzie na zezwolenie dyżurnego
 * (Ir-9 § 10 ust. 15), zadania w terminie. Usterka zwrotnicy albo zajętość z usterki na drodze manewru – obejścia nie ma
 * (przebieg się nie nastawia, Ir-9 zezwolenia nie przewiduje), więc termin zadania przesuwa się o czas usterki (także
 * zadania, które na nie czeka), a 90202 nie ma kary za późny odjazd z tego powodu (przyjęte: kara tylko za czekanie,
 * którego dało się uniknąć; pociąg ma obejście – Sz, rozkaz, inny tor – więc czekanie pociągu przed semaforem liczy
 * się jak dotąd, a termin zaczyna się przesuwać dopiero, gdy skład stoi na torze stacyjnym).
 */
test('manewry przy długiej usterce (25 min): sygnalizator – zezwolenie dyżurnego; zwrotnica i zajętość bez obejścia – termin przesunięty, bez kar', () => {
  for (const srk of SRK) for (const c of CASES) {
    const x = shuntRun(srk, c, LONG);
    const { sim, r, msg } = x;
    common(x, c);
    const repaired = r.fault.since + r.fault.duration;
    const away = taskOf(sim, 'odstaw-90201'), back = taskOf(sim, 'podstaw-90202');
    if (c.permit) {
      checkPermit(x, c, repaired);
      assert.deepEqual(points(sim, 'task'), [10, 10], `${msg}: zadania w terminie na zezwolenie`);
      assert.deepEqual(penalties(sim), [], `${msg}: kary`);
    } else if (c.move) {
      // droga manewru zablokowana bez obejścia – termin przesunięty o czas usterki, zadania w nowym terminie, bez kar
      const task = taskOf(sim, c.move);
      assert.ok(task.shift >= 20 * 60, `${msg}: termin ${c.move} przesunięty (${Math.round((task.shift ?? 0) / 60)} min)`);
      assert.ok(away.done && back.done && away.doneAt <= away.deadlineTime && back.doneAt <= back.deadlineTime, `${msg}: zadania w (przesuniętym) terminie`);
      assert.deepEqual(points(sim, 'task'), [10, 10], `${msg}: punkty za zadania`);
      assert.deepEqual(penalties(sim), [], `${msg}: kary`);
    } else {
      assert.deepEqual(points(sim, 'task'), [10, 10], `${msg}: zadania w terminie – usterka nie na drodze manewru`);
      assert.deepEqual(penalties(sim), [], `${msg}: kary`);
    }
    if (c.leftLong) assert.deepEqual(leftovers(sim), c.leftLong, `${msg}: ograniczenie automatu – przebieg manewrowy zadania, które przepadło, zostaje nastawiony`);
    else assert.deepEqual(leftovers(sim), [], `${msg}: stan po zmianie`);
  }
});

/**
 * Skład stoi przed sygnalizatorem `sig` z usterką przy nastawionym przebiegu manewrowym od niego – chwila, w której
 * dyżurny szuka sposobu, by manewr ruszył.
 */
const waitsAtDark = (sim, sig) => {
  const tr = unit(sim), s = sim.ilk.signals.get(sig);
  return !!tr && tr.mode === 'shunt' && tr.v === 0 && tr.nextSignal() === sig && s.failed && !!s.route && sim.ilk.active.has(s.route) && !sim.ilk.active.get(s.route).trainEntered;
};

/**
 * Długa usterka `sig` w chwili `when`; `act(sim)` – czynność dyżurnego, gdy skład stoi przed sygnalizatorem z usterką.
 * Zwraca wynik czynności, położenie składu 2 min później (przesunięcie czoła) i komunikaty radiowe maszynisty.
 */
function tryAtDark(srk, sig, when, act) {
  const sim = shuntSim(srk);
  // bez zezwolenia dyżurnego (automat daje je sam) – sprawdzamy, co robią same Sz i rozkaz
  const send = sim.comms.send.bind(sim.comms);
  sim.comms.send = (id, p, o) => (id === 'shunt-permit' ? { ok: false, reason: 'test: bez zezwolenia' } : send(id, p, o));
  const radio = [];
  sim.bus.on('comms', (m) => { if (m.kind === 'radio') radio.push(m.text); });
  const st = { res: null, at: 0, head: 0, moved: null, aspect: null };
  runWithFault(sim, {
    when, fault: { type: 'signal-fail', target: sig, duration: LONG }, until: '08:00',
    each: (s) => {
      if (!st.res && waitsAtDark(s, sig)) { st.at = s.clock.time; st.head = unit(s).head; st.res = act(s); st.aspect = s.ilk.signals.get(sig).aspect; }
      else if (st.res && st.moved == null && s.clock.time >= st.at + 120) st.moved = unit(s).head - st.head;
    },
  });
  return { sim, st, radio };
}

test('Sz i rozkaz „S” przy sygnalizatorze manewrowym z usterką nie ruszają składu manewrowego – manewry jadą na zezwolenie dyżurnego', () => {
  for (const srk of SRK) {
    // semafor D2: Sz przyjęty (uzasadniony usterką, 0 pkt), ale Sz nie jest sygnałem dla manewrów – skład stoi
    let x = tryAtDark(srk, 'D2', moment.entering, (s) => s.execute({ type: 'substitute', signal: 'D2' }));
    assert.equal(x.st.res?.ok, true, `${srk}: Sz na D2 (${x.st.res?.reason})`);
    assert.equal(x.st.aspect, 'Sz');
    assert.deepEqual(points(x.sim, 'Sz'), [0], `${srk}: Sz uzasadniony usterką`);
    assert.equal(x.st.moved, 0, `${srk}: skład ruszył na Sz`);
    // semafor D2: rozkaz „S” dotyczy pociągu – dla składu manewrowego odmowa ze wskazaniem zezwolenia (wcześniej rozkaz był
    // przyjmowany, maszynista potwierdzał jazdę, a skład stał)
    x = tryAtDark(srk, 'D2', moment.entering, (s) => s.traffic.issueOrder({ nr: 90201, signal: 'D2' }));
    assert.equal(x.st.res?.ok, false, `${srk}: rozkaz „S” dla składu manewrowego`);
    assert.match(x.st.res.reason, /zezwolenie dyżurnego/);
    assert.deepEqual(points(x.sim, 'order'), [], `${srk}: rozkaz nie wydany`);
    assert.equal(x.st.moved, 0, `${srk}: skład ruszył bez zezwolenia`);
    // tarcza manewrowa Tm1: Sz i rozkaz tylko na semaforze – odmowa
    x = tryAtDark(srk, 'Tm1', moment.away, (s) => ({ sz: s.execute({ type: 'substitute', signal: 'Tm1' }), order: s.traffic.issueOrder({ nr: 90201, signal: 'Tm1' }) }));
    assert.equal(x.st.res?.sz.ok, false, `${srk}: Sz na tarczy Tm1`);
    assert.match(x.st.res.sz.reason, /tylko na semaforze/);
    assert.equal(x.st.res.order.ok, false, `${srk}: rozkaz na tarczy Tm1`);
    assert.match(x.st.res.order.reason, /jeździe manewrowej/);
    assert.equal(x.st.moved, 0, `${srk}: skład przed Tm1 ruszył`);
  }
});

/*
 * Reguła docelowa: skład manewrowy mija sygnalizator manewrowy z usterką (Ms2 nie wychodzi, przebieg nastawiony) na
 * zezwolenie dyżurnego i wykonuje zadanie w terminie, bez kary. Kanał zezwolenia to tu rozkaz „S” (`Traffic.issueOrder`)
 * – jedyny dziś sposób na minięcie sygnalizatora na „Stój”; kształt polecenia (zezwolenie ustne / radiowe, osobne
 * polecenie) to decyzja właściciela.
 */
// Ir-9 § 10 ust. 15–16: przebieg manewrowy nastawiony, sygnalizator uszkodzony – dyżurny zezwala na jazdę ustnie albo przez
// radiotelefon, dla tego jednego przebiegu (telefonogram „shunt-permit” w zakładce Łączność)

for (const srk of SRK) for (const [sig, when, label] of [['D2', 'entering', 'semafor D2 (odstawienie)'], ['Tm1', 'away', 'tarcza Tm1 (podstawienie)']]) {
  test(`długa usterka sygnalizatora manewrowego – ${label}, ${srk}: skład jedzie na zezwolenie dyżurnego, zadania w terminie, bez kar`, () => {
    const sim = shuntSim(srk);
    let permit = null;
    const r = runWithFault(sim, {
      when: moment[when], fault: { type: 'signal-fail', target: sig, duration: LONG }, until: '09:00',
      dispatch: (s) => {
        if (!permit && waitsAtDark(s, sig)) permit = s.comms.send('shunt-permit', { nr: 90201 });
        autoDispatch(s);
      },
    });
    const msg = `${srk} ${sig}`;
    assert.equal(r.fired, true);
    assert.equal(permit?.ok, true, `${msg}: zezwolenie dyżurnego (${permit?.reason})`);
    assert.deepEqual(r.violations, [], `${msg}: niezmienniki`);
    assert.deepEqual(r.events, [], `${msg}: spad / rozprucie`);
    for (const id of ['odstaw-90201', 'podstaw-90202']) {
      const t = taskOf(sim, id);
      assert.ok(t.done && t.doneAt <= t.deadlineTime, `${msg}: ${id} w terminie (${t.done ? Clock.format(t.doneAt, true) : t.failed ? 'przepadło' : 'w toku'})`);
    }
    assert.deepEqual(penalties(sim), [], `${msg}: kary`);
    assert.deepEqual(stuck(sim), [], `${msg}: pociągi`);
  });
}

/* ------------------------------------------------------------------ */
/* Część 2 – droga pociągu na Sz / rozkaz „S” zabezpieczona do przejazdu */
/* ------------------------------------------------------------------ */

const os6101 = { nr: 6101, kind: 'os', name: 'Osobowy', from: 'W', to: 'E', arr: '07:06', dep: '07:08', track: '1', stop: true, length: 130, vmax: 100, dwell: 60 };

/**
 * Pociąg 6101 z Lipna na tor 1. `how`: 'Sz' / 'S' – T1 wskazuje zajętość z usterki, pociąg staje przed A, dyżurny
 * zamyka Zw1 (Zz, położenie „+” na tor 1), dKo i Sz na A albo rozkaz „S”; 'route' – bez usterki, automat nastawia A-D1.
 * `onAuth(sim)` – chwila po zezwoleniu (pociąg jeszcze przed Zw1, odcinek Iz1 wolny), `onPoint(sim)` – pociąg na Zw1
 * (Iz1 zajęty). Po przyjeździe dyżurny zdejmuje Zz, jeśli jeszcze jest. Ruch poza tym prowadzi automat.
 */
function p7Run(srk, how, { onAuth, onPoint }) {
  const sim = faultSim(szkolna, { srk, timetable: [os6101] });
  if (how !== 'route') sim.faults.add({ type: 'false-occupancy', target: 'T1', duration: 10 });
  const events = watchEvents(sim), bad = [], log = [];
  sim.bus.on('log', (l) => { if (/Zw1/.test(l.msg)) log.push(`${now(sim)} ${l.msg}`); });
  const e = entryOf(sim, 6101);
  const st = { auth: null, onAuth: null, onPoint: null, unlockAfter: null };
  const end = Clock.parse('07:30');
  let n = 0;
  while (sim.clock.time < end && !allArrived(sim)) {
    sim.step(0.5);
    const tr = e.train;
    if (!st.auth && tr && how !== 'route' && tr.v === 0 && tr.stoppedAt?.kind === 'signal' && tr.stoppedAt.signal === 'A' && Interlocking.isStop(sim.ilk.signals.get('A').aspect)) {
      const zz = sim.execute({ type: 'lock', id: 'Zw1' });
      const ko = sim.execute({ type: 'block', exit: 'W', btn: 'dKo' });
      const go = how === 'Sz' ? sim.execute({ type: 'substitute', signal: 'A' }) : sim.traffic.issueOrder({ nr: 6101, signal: 'A' });
      st.auth = { zz, ko, go, pos: sim.ilk.points.get('Zw1').position };
    }
    if (!st.auth && tr && how === 'route' && sim.ilk.active.has('A-D1') && tr.entryPending) st.auth = { go: { ok: true } };
    if (st.auth && !st.onAuth) st.onAuth = onAuth(sim) ?? {};
    if (st.onAuth && !st.onPoint && tr?.occupiedSections().has('Iz1')) st.onPoint = onPoint(sim) ?? {};
    if (e.actualArr != null && st.unlockAfter == null) st.unlockAfter = sim.ilk.points.get('Zw1').individualLock ? sim.execute({ type: 'lock', id: 'Zw1' }) : { ok: true, noop: true };
    if (n++ % 4 === 0) autoDispatch(sim);
    if (bad.length < 5) for (const v of violations(sim)) bad.push(`${now(sim)} ${v}`);
  }
  return { sim, e, st, bad, events, log };
}

test('pociąg w przebiegu A-D1: zwrotnica Zw1 nie przestawia się przed pociągiem ani pod nim, Zz niczego nie osłabia (utwierdzenie przebiegu)', () => {
  for (const srk of SRK) {
    const throwIt = (sim) => sim.execute({ type: 'point', id: 'Zw1', position: '-' });
    const x = p7Run(srk, 'route', {
      onAuth: (sim) => ({ before: throwIt(sim), zzOn: sim.execute({ type: 'lock', id: 'Zw1' }), zzOff: sim.execute({ type: 'lock', id: 'Zw1' }), after: throwIt(sim) }),
      onPoint: (sim) => ({ under: throwIt(sim) }),
    });
    const msg = `Szkolna ${srk}, przebieg A-D1`;
    assert.equal(x.st.onAuth?.before.ok, false, `${msg}: przestawienie przed pociągiem`);
    assert.match(x.st.onAuth.before.reason, /utwierdzona w przebiegu A-D1/);
    assert.deepEqual([x.st.onAuth.zzOn.ok, x.st.onAuth.zzOff.ok], [true, true], `${msg}: Zz założone i zdjęte`);
    assert.equal(x.st.onAuth.after.ok, false, `${msg}: po zdjęciu Zz przebieg dalej trzyma zwrotnicę`);
    assert.match(x.st.onAuth.after.reason, /utwierdzona w przebiegu A-D1/);
    assert.equal(x.st.onPoint?.under.ok, false, `${msg}: przestawienie pod pociągiem`);
    assert.deepEqual(x.bad, [], `${msg}: niezmienniki`);
    assert.deepEqual(x.events, [], `${msg}: spad / rozprucie`);
    assert.equal(x.e.actualTrack, '1', `${msg}: przyjazd na tor 1`);
    assert.deepEqual(stuck(x.sim), [], `${msg}: pociągi`);
  }
});

test('pociąg na Sz / rozkaz „S”: dopóki Zw1 jest zamknięta (Zz), nie przestawia się przed pociągiem ani pod nim; pociąg wjeżdża na tor 1 bez kar', () => {
  for (const srk of SRK) for (const how of ['Sz', 'S']) {
    const throwIt = (sim) => sim.execute({ type: 'point', id: 'Zw1', position: '-' });
    const x = p7Run(srk, how, { onAuth: (sim) => ({ before: throwIt(sim) }), onPoint: (sim) => ({ under: throwIt(sim) }) });
    const msg = `Szkolna ${srk}, ${how === 'Sz' ? 'Sz' : 'rozkaz „S”'} na A`;
    assert.deepEqual([x.st.auth?.zz.ok, x.st.auth.ko.ok, x.st.auth.go.ok, x.st.auth.pos], [true, true, true, '+'], `${msg}: Zz, dKo, zezwolenie (${x.st.auth?.go.reason})`);
    assert.equal(x.st.onAuth?.before.ok, false, `${msg}: przestawienie przed pociągiem`);
    assert.match(x.st.onAuth.before.reason, /zamknięta indywidualnie/);
    assert.equal(x.st.onPoint?.under.ok, false, `${msg}: przestawienie pod pociągiem`);
    assert.equal(x.st.unlockAfter?.ok, true, `${msg}: Zz zdjęte po przyjeździe`);
    assert.deepEqual(x.bad, [], `${msg}: niezmienniki`);
    assert.deepEqual(x.events, [], `${msg}: spad / rozprucie`);
    assert.equal(x.e.actualTrack, '1', `${msg}: przyjazd na tor 1`);
    assert.deepEqual(unjustified(x.sim), [], `${msg}: kary za Sz / rozkaz / dKo`);
    assert.deepEqual(stuck(x.sim), [], `${msg}: pociągi`);
  }
});

/*
 * Reguła (docs/SOURCES.md, „Sygnał zastępczy i rozkaz „S””; Ie-10 §35 ust. 1 pkt 1–2 i 6, Ir-1 §58 ust. 4): zwrotnice
 * drogi Sz / rozkazu są ustawione, sprawdzone i utwierdzone (Zz) – do przejazdu pociągu. Zwrotnica na drodze pociągu,
 * który dostał Sz albo rozkaz „S”, nie daje się otworzyć (zdjąć Zz) ani przestawić, zanim ostatni wagon ją minie; po
 * przejeździe – tak.
 *
 * Dziś (błąd): zaraz po Sz / rozkazie zdjęcie Zz i przestawienie Zw1 na „−” przechodzą, zwrotnica przestawia się, gdy
 * czoło pociągu wjeżdża na jej odcinek Iz1 (niezmiennik 4: przestawiana pod taborem – pociąg staje dopiero przed kostką
 * zwrotnicy, `Train.#lookahead`), a pociąg wjeżdża na tor 2 zamiast 1. Gracz widzi tylko „Zwrotnica Zw1 otwarta
 * (zamknięcie indywidualne)” i „Pociąg 6101 przyjęty na tor 2 zamiast 1” – bez alarmu i bez kary (także bez kary
 * `Sz-points`, bo w chwili Sz zwrotnica była zamknięta).
 */
// wcześniej błąd silnika: Zz dało się zdjąć, a zwrotnicę przestawić przed pociągiem (przestawiała się, gdy czoło wjeżdżało
// na jej odcinek) – teraz droga pociągu na Sz / rozkaz „S” jest trzymana do jego przejazdu (Interlocking.holdPath)

for (const srk of SRK) for (const how of ['Sz', 'S']) {
  test(`pociąg na ${how === 'Sz' ? 'Sz' : 'rozkaz „S”'} (${srk}): Zw1 na jego drodze nie daje się otworzyć (Zz) ani przestawić, zanim pociąg ją minie`, () => {
    const out = [];
    const tryUnlockAndThrow = (sim, where) => {
      if (!sim.ilk.points.get('Zw1').individualLock) return;
      if (sim.execute({ type: 'lock', id: 'Zw1' }).ok) out.push(`${now(sim)} ${where}: Zz zdjęte z Zw1`);
      if (sim.execute({ type: 'point', id: 'Zw1', position: '-' }).ok) out.push(`${now(sim)} ${where}: Zw1 przestawiana na „−”`);
    };
    const x = p7Run(srk, how, { onAuth: (sim) => tryUnlockAndThrow(sim, 'po zezwoleniu, pociąg przed Zw1'), onPoint: (sim) => tryUnlockAndThrow(sim, 'pociąg na Zw1') });
    assert.equal(x.st.auth?.go.ok, true, `zezwolenie (${x.st.auth?.go.reason})`);
    assert.ok(x.st.onAuth && x.st.onPoint, 'obie próby (przed Zw1 i na Zw1) wykonane');
    if (x.st.unlockAfter && !x.st.unlockAfter.ok) out.push('Zz nie daje się zdjąć po przejeździe pociągu');
    for (const v of x.bad) out.push(`niezmiennik: ${v}`);
    for (const v of x.events) out.push(v);
    if (x.e.actualTrack !== '1') out.push(`pociąg przyjęty na tor ${x.e.actualTrack}, nie na tor 1`);
    assert.deepEqual(out, [], x.log.join('; '));
  });
}

test('zezwolenie na jazdę manewrową (Ir-9 § 10 ust. 15): tylko dla składu manewrowego, przy nastawionym przebiegu i uszkodzonym sygnalizatorze; inaczej odmowa i kara za zły telefonogram', () => {
  const sim = shuntSim('E');
  const u = sim.traffic.timetable().find((e) => e.nr === 90201);
  let n = 0;
  // zatrzymanie sprawdzane zaraz po kroku – zanim automat przełączy skład w manewry (zadanie odstawienia)
  while (sim.clock.time < Clock.parse('08:30')) { sim.step(0.5); if (u.actualArr != null && u.train?.v === 0) break; if (n++ % 4 === 0) autoDispatch(sim); }
  assert.ok(u.actualArr != null, '90201 na torze 2');
  // pociąg (nie skład manewrowy) – zezwolenia na manewr nie daje się
  assert.match(sim.traffic.shuntPermit(90201).reason, /nie jest w jeździe manewrowej/);
  sim.traffic.toShunting(90201);
  assert.match(sim.traffic.shuntPermit(90201).reason, /nie ma nastawionego przebiegu/, 'bez przebiegu manewrowego');
  // sprawny sygnalizator: przebieg nastawiony, zezwolenie daje się sygnałem Ms2 – odmowa i −5 za zły telefonogram
  assert.ok(sim.ilk.setRoute('D2-kT3m').pending || sim.ilk.active.has('D2-kT3m'));
  for (let i = 0; i < 40 && !sim.ilk.active.has('D2-kT3m'); i++) sim.step(0.5);
  assert.ok(sim.ilk.active.has('D2-kT3m'), 'przebieg D2-kT3m nastawiony');
  assert.equal(u.train.v, 0, 'skład jeszcze stoi');
  const res = sim.comms.send('shunt-permit', { nr: 90201 });
  assert.equal(res.ok, false);
  assert.match(res.reason, /jest sprawny/);
  assert.deepEqual(sim.score.items.filter((i) => i.code === 'comms-wrong').map((i) => i.points), [-5]);
  assert.equal(u.train.shuntPermit, null);
});
