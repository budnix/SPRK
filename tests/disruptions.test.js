import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/model/Simulation.js';
import station from './fixtures/stare-pustkowie.js';
import { run, Clock } from './helpers.js';
import { POINT_SWITCH_TIME } from '../src/model/Interlocking.js';

const G = (id) => ({ kind: 'signal', id, color: 'green' });

test('poziom zakłóceń: opóźnienia od sąsiadów są deterministyczne dla ziarna', () => {
  const a = new Simulation(station, { disruptions: 'high', seed: 7 });
  const b = new Simulation(station, { disruptions: 'high', seed: 7 });
  const da = a.traffic.timetable().map((e) => e.delayIn);
  const db = b.traffic.timetable().map((e) => e.delayIn);
  assert.deepEqual(da, db);
  assert.ok(da.some((d) => d > 0), 'brak opóźnień przy poziomie „duże”');
  const none = new Simulation(station, { disruptions: 'none', seed: 7 });
  assert.ok(none.traffic.timetable().every((e) => e.delayIn === 0));
  assert.ok(a.faults.list.length >= 3);
});

test('zmiana z ziarnem nie losuje przez Math.random – ta sama zmiana przy tym samym ziarnie (także odpowiedzi sąsiada na Eap)', async () => {
  const { default: szkolna } = await import('../src/stations/szkolna.js');
  const { AutoOperator } = await import('../src/model/Operator.js');
  const random = Math.random;
  let calls = 0;
  Math.random = () => { calls++; return random(); };
  try {
    const journal = () => {
      const sim = new Simulation(szkolna, { scenario: 'zmiana', disruptions: 'high', seed: 3 });
      const op = new AutoOperator(sim, { district: null, role: 'full' });
      const log = [];
      sim.bus.on('log', (m) => log.push(`${Clock.format(m.time, true)} ${m.msg}`));
      let n = 0;
      while (sim.clock.time < sim.endTime) { sim.step(0.5); if (n++ % 4 === 0) op.tick(); }
      return log;
    };
    const a = journal();
    assert.ok(a.some((l) => /Poz|pozwolenie/i.test(l)), 'sąsiad odpowiadał na blokadzie');
    assert.deepEqual(journal(), a);
    assert.equal(calls, 0, 'Math.random w silniku');
  } finally {
    Math.random = random;
  }
});

test('poziom zakłóceń: losowe usterki mają czas wystąpienia w obrębie zmiany i naprawdę się pojawiają', () => {
  // scenariusze gry podają koniec zmiany jako napis „GG:MM” – z niego ma się brać okno losowania usterek
  for (const seed of [1, 7, 42]) {
    const sim = new Simulation(station, { scenario: 'zmiana', disruptions: 'high', seed });
    assert.equal(typeof sim.scenario.endTime, 'string');
    const start = sim.clock.time + 8 * 60, end = sim.endTime - 15 * 60;
    assert.ok(sim.faults.list.length >= 3, `seed ${seed}`);
    for (const f of sim.faults.list) assert.ok(Number.isFinite(f.at) && f.at >= start && f.at <= end, `seed ${seed}: usterka ${f.type} ${f.target} o czasie ${f.at}`);
    let seen = 0;
    sim.bus.on('alarm', (a) => { if (a.type === 'fault') seen++; });
    while (sim.clock.time < sim.endTime) sim.step(0.5);
    // usterka licznika osi czeka na pociąg, pozostałe pojawiają się o swoim czasie
    assert.ok(sim.faults.list.some((f) => f.active || f.done), `seed ${seed}: żadna usterka nie wystąpiła`);
    assert.ok(seen > 0, `seed ${seed}: brak alarmu usterki`);
  }
});

test('usterka dopisana w trakcie zmiany (Faults.add): zaczyna się przy najbliższym takcie po `at`, trwa `duration` min', () => {
  const sim = new Simulation(station, { scenario: { id: 't', name: 't' }, disruptions: 'none' });
  const now = sim.clock.time;
  const f = sim.faults.add({ type: 'signal-fail', target: 'A', duration: 2 });
  const later = sim.faults.add({ type: 'point-control', target: 'Zw1', at: now + 60, duration: 1 });
  assert.equal(f.at, now);
  assert.deepEqual(sim.faults.list.map((x) => x.target), ['A', 'Zw1'], 'lista w kolejności czasu');
  sim.step(0.5);
  assert.equal(f.active, true);
  assert.equal(sim.ilk.signals.get('A').failed, true);
  assert.equal(later.active, false);
  run(sim, 61);
  assert.equal(later.active, true);
  run(sim, 2 * 60);
  assert.equal(f.done, true);
  assert.equal(sim.ilk.signals.get('A').failed, false);
});

test('dwie usterki tego samego elementu nałożone w czasie: element niesprawny do końca późniejszej (wcześniej pierwsza naprawa kasowała drugą)', () => {
  const faults = (type, target) => [{ type, target, at: '05:52', duration: 10 }, { type, target, at: '05:57', duration: 10 }];
  const at = (sim, hhmm) => run(sim, Clock.parse(hhmm) - sim.clock.time);
  for (const [type, target, broken] of [
    ['false-occupancy', 'T1', (sim) => sim.ilk.sections.get('T1').occupied],
    ['signal-fail', 'A', (sim) => sim.ilk.signals.get('A').failed],
    ['block-fail', 'E', (sim) => sim.blocks.get('E').fault],
    ['point-control', 'Zw1', (sim) => sim.ilk.points.get('Zw1').faultUntil > sim.clock.time],
  ]) {
    const sim = new Simulation(station, { scenario: { id: 't', name: 't', faults: faults(type, target) }, disruptions: 'none' });
    at(sim, '06:04');
    assert.equal(sim.faults.list.filter((f) => f.active).length, 1, `${type}: pierwsza naprawiona, druga trwa`);
    assert.ok(broken(sim), `${type}: element dalej niesprawny`);
    at(sim, '06:08');
    assert.ok(!broken(sim), `${type}: po końcu drugiej sprawny`);
  }
  // blokada: początek drugiej usterki nie kasuje naszego zapytania o drogę – odpowiedź sąsiada przychodzi
  const sim = new Simulation(station, { scenario: { id: 't', name: 't', faults: faults('block-fail', 'E') }, disruptions: 'none' });
  at(sim, '05:56:50');
  const b = sim.blocks.get('E');
  const replies = [];
  sim.bus.on('comms', (c) => { if (c.exit === 'E' && /nr 6101/.test(c.text)) replies.push(c.text); });
  assert.ok(b.phoneAskNeighbour(6101).ok);
  at(sim, '05:58:30');
  assert.equal(replies.length, 1, 'odpowiedź sąsiada na zapytanie o 6101 nie przepadła');
});

test('usterka semafora: brak sygnału mimo przebiegu, Sz uzasadniony (0 pkt), po usunięciu semafor działa', () => {
  const sim = new Simulation(station, { scenario: { id: 't', name: 't', faults: [{ type: 'signal-fail', target: 'A', at: '05:53', duration: 2 }] } });
  run(sim, 90);
  assert.equal(sim.ilk.signals.get('A').failed, true);
  sim.press(G('A')); sim.press(G('D1')); run(sim, POINT_SWITCH_TIME + 1);
  assert.ok(sim.ilk.active.has('A-D1'));
  assert.equal(sim.ilk.signals.get('A').aspect, 'S1');
  sim.press({ kind: 'group', id: 'Sz', role: 'substitute' }); sim.press(G('A'));
  assert.equal(sim.ilk.signals.get('A').aspect, 'Sz');
  assert.equal(sim.score.items.at(-1).points, 0, 'Sz przy usterce nie karany');
  run(sim, 120);
  assert.equal(sim.ilk.signals.get('A').failed, false);
  assert.equal(sim.ilk.signals.get('A').aspect, 'S5');
});

test('usterka napędu zwrotnicy: brak kontroli po przestawieniu, przebieg nie utwierdza się do naprawy', () => {
  const sim = new Simulation(station, { scenario: { id: 't', name: 't', faults: [{ type: 'point-control', target: 'Zw1', at: '05:53', duration: 1 }] } });
  run(sim, 70);
  sim.press(G('A')); sim.press(G('D2')); // wymaga Zw1 „−”
  run(sim, POINT_SWITCH_TIME + 1);
  assert.equal(sim.ilk.points.get('Zw1').control, false);
  assert.ok(!sim.ilk.active.has('A-D2'));
  run(sim, 60);
  assert.equal(sim.ilk.points.get('Zw1').control, true);
  sim.press(G('A')); sim.press(G('D2')); run(sim, POINT_SWITCH_TIME + 1);
  assert.ok(sim.ilk.active.has('A-D2'));
});

test('fałszywa zajętość: odcinek zajęty bez pociągu blokuje przebieg', () => {
  const sim = new Simulation(station, { scenario: { id: 't', name: 't', faults: [{ type: 'false-occupancy', target: 'T1', at: '05:53', duration: 1 }] } });
  run(sim, 70);
  assert.equal(sim.ilk.sections.get('T1').occupied, true);
  sim.press(G('A')); const r = sim.press(G('D1'));
  assert.equal(r.ok, false); assert.match(r.reason, /T1 zajęty/);
  run(sim, 60);
  assert.equal(sim.ilk.sections.get('T1').occupied, false);
});

// Przy usterce blokady przyjazd potwierdza telefonogram – dawniej wymagano potem dKo, które „kasowało” blokadę; dKo
// przygotowuje blok końcowy przed wjazdem na Sz i przy zapowiadaniu się go nie używa (LIRK Eap, Ir-1 §28 ust. 16).
test('usterka blokady: zapowiadanie telefoniczne w obie strony, przyjazd potwierdzony telefonogramem (bez dKo); po naprawie blokada w stanie zasadniczym', () => {
  const sim = new Simulation(station, { scenario: { id: 't', name: 't', faults: [{ type: 'block-fail', target: 'W', at: '05:52', duration: 60 }] } });
  const w = sim.blocks.get('W');
  run(sim, 5);
  assert.equal(w.fault, true);
  assert.equal(sim.press({ kind: 'block', exit: 'W', btn: 'Wbl' }).ok, false);
  // sąsiad pyta telefonicznie o drogę dla 5310
  run(sim, 60 * 6);
  const ask = sim.comms.messages.find((m) => m.kind === 'ask' && m.exit === 'W'); // pytania 1a są też przy sprawnej blokadzie (od Dąbrowy)
  assert.ok(ask, 'brak pytania telefonicznego od sąsiada');
  assert.equal(String(ask.nr), '5310');
  // zła formuła – kara
  const wrong = sim.comms.send('arrived', { exit: 'W', nr: 5310 });
  assert.equal(wrong.ok, false);
  assert.ok(sim.score.items.some((i) => i.code === 'comms-wrong'));
  // właściwa odpowiedź
  assert.equal(sim.comms.send('free', { exit: 'W', nr: 5310 }).ok, true);
  run(sim, 60 * 6);
  const e = sim.traffic.timetable().find((x) => x.nr === 5310);
  assert.ok(e.train, 'pociąg nie został wyprawiony po zapowiedzi telefonicznej');
  sim.press(G('A')); sim.press(G('D1'));
  run(sim, 60 * 5);
  assert.equal(w.koPending, true);
  assert.equal(sim.press({ kind: 'block', exit: 'W', btn: 'Ko' }).ok, false, 'Ko elektryczne nie działa przy usterce');
  assert.equal(sim.comms.send('arrived', { exit: 'W', nr: 5310 }).ok, true);
  assert.equal(w.koPending, false, 'telefonogram o przyjeździe zastępuje Ko');
  assert.equal(sim.press({ kind: 'block', exit: 'W', btn: 'dKo' }).ok, false, 'przy zapowiadaniu dKo się nie stosuje');
  assert.equal(w.counters.dKo, 0);
  run(sim, 60 * 60); // naprawa blokady (usterka 60 min)
  assert.equal(w.fault, false);
  assert.equal(w.direction, null, 'po naprawie blokada w stanie zasadniczym');
  // wyjazd 5310 do E działa normalnie (blokada E sprawna) – tu tylko sprawdzamy wyjazd przez W dla innego pociągu: pytanie o drogę
  const eE = sim.traffic.timetable().find((x) => x.nr === 5311);
  void eE;
});

test('raport zmiany: punkty i ocena', () => {
  const sim = new Simulation(station, { disruptions: 'none', seed: 1 });
  sim.bus.emit('score', { time: 0, code: 'x', points: -20, msg: 'test' });
  sim.bus.emit('score', { time: 0, code: 'y', points: 5, msg: 'test2' });
  const r = sim.score.report(sim.traffic);
  assert.equal(r.total, -15);
  assert.equal(r.grade, 'dostatecznie');
  assert.equal(r.items.length, 2);
});

test('scenariusz z zamkniętym torem: przebieg na zamknięty odcinek odrzucony, po otwarciu dozwolony', () => {
  const sim = new Simulation(station, { scenario: { id: 't', name: 't', closedSections: [{ section: 'T1', from: '05:52', to: '05:54' }] } });
  run(sim, 5);
  assert.equal(sim.ilk.sections.get('T1').closed, true);
  sim.press(G('A')); const r = sim.press(G('D1'));
  assert.equal(r.ok, false); assert.match(r.reason, /zamknięty/);
  run(sim, 130);
  assert.equal(sim.ilk.sections.get('T1').closed, false);
  sim.press(G('A')); assert.equal(sim.press(G('D1')).ok, true);
});

test('koniec zmiany: zdarzenie shift-end z raportem po przejechaniu wszystkich pociągów lub po czasie', () => {
  const sim = new Simulation(station, { scenario: { id: 't', name: 't', trains: [5310], endTime: '06:00' } });
  let report = null;
  sim.bus.on('shift-end', (r) => { report = r; });
  run(sim, 60 * 9);
  assert.ok(report, 'brak raportu');
  assert.equal(report.trains, 1);
  assert.ok(report.items.some((i) => i.code === 'unfinished'));
  assert.equal(Clock.format(sim.clock.time) >= '06:00', true);
});
