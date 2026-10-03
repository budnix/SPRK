import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/model/Simulation.js';
import szkolna from '../src/stations/szkolna.js';
import chylonia from '../src/stations/gdynia-chylonia.js';
import sopot from '../src/stations/sopot.js';
import pustkowie from './fixtures/stare-pustkowie.js';
import { autoDispatch, allArrived, run, Clock, play, grant } from './helpers.js';

/*
 * Szkolna: osobowy 90201 kończy bieg na torze 2, skład ma być odstawiony na tor 3 (zadanie 1) i podstawiony z powrotem
 * (zadanie 2), a potem odjeżdża do Lipna jako 90202. Przy dużym opóźnieniu 90201 oba zadania są już po terminie.
 *
 * Termin zadania przesuwa się o opóźnienie składu od sąsiada (dyżurny nie mógł go wykorzystać). Testy zadań, które
 * przepadły, mają więc terminy wcześniejsze o to opóźnienie – po przesunięciu wracają do godzin z definicji stacji
 * i sytuacja jest ta sama co dawniej (skład przyjeżdża już po terminie).
 */
const earlier = (tasks, min) => tasks.map((t) => ({ ...t, deadline: Clock.format(Clock.parse(t.deadline) - min * 60) }));

const late = (min, all = false) => {
  // bez innych pociągów (test ręczny) albo pełny rozkład (automat)
  const tasks = earlier(szkolna.tasks, min);
  const scenario = all ? { ...szkolna.scenarios.find((s) => s.id === 'zmiana-e'), tasks } : { id: 't', name: 't', endTime: '10:00', srk: 'E', trains: [90201, 90202], tasks };
  const sim = new Simulation(szkolna, { scenario, disruptions: 'none' });
  sim.traffic.setInboundDelay(sim.traffic.entry(90201), min);
  return sim;
};

test('zadanie zależne od zadania, które przepadło, samo też przepada po terminie – nie zostaje w toku do końca zmiany', () => {
  const sim = late(37);
  run(sim, Clock.parse('08:40') - sim.clock.time);
  const [t1, t2] = ['odstaw-90201', 'podstaw-90202'].map((id) => sim.traffic.tasks.find((t) => t.id === id));
  assert.equal(t1.failed, true, 'odstawienie przepadło');
  assert.equal(t2.failed, true, 'podstawienie po odstawieniu, które przepadło – też przepadło');
  assert.equal(sim.score.items.filter((i) => i.code === 'task-failed').length, 2);
});

test('opóźnienie składu od sąsiada przesuwa termin zadań od chwili zgłoszenia – zadania zdążone, 90202 bez kary', () => {
  const scenario = { id: 't', name: 't', endTime: '10:00', srk: 'E', trains: [90201, 90202], tasks: szkolna.tasks };
  const sim = new Simulation(szkolna, { scenario, disruptions: 'none' });
  sim.traffic.setInboundDelay(sim.traffic.entry(90201), 20);
  const [t1, t2] = ['odstaw-90201', 'podstaw-90202'].map((id) => sim.traffic.tasks.find((t) => t.id === id));
  const game = play(sim);
  const until = (hhmm) => game.until(hhmm, { stop: allArrived });
  // 90201 planowo 07:52 – sąsiad zgłasza opóźnienie 12 min wcześniej (07:40); dyżurny nie zna go przed zgłoszeniem
  until('07:39');
  assert.deepEqual([t1.deadline, t2.deadline], ['08:04', '08:10'], 'przed zgłoszeniem termin bez zmian');
  until('07:41');
  assert.deepEqual([t1.deadline, t2.deadline], ['08:24', '08:30'], 'po zgłoszeniu – termin przesunięty o 20 min');
  until('09:30');
  assert.deepEqual([t1.done, t2.done], [true, true]);
  assert.deepEqual(sim.score.items.filter((i) => i.code === 'task').map((i) => i.points), [10, 10], 'zadania w terminie – pełne punkty');
  assert.deepEqual(sim.score.items.filter((i) => ['task-failed', 'late-depart'].includes(i.code)).map((i) => i.msg), []);
  assert.equal(sim.traffic.entry(90202).phase, 'at-neighbour');
});

test('pociąg utworzony ze składu nie jedzie na dawnym zezwoleniu: 90202 stoi przy peronie, dopóki nie dostanie sygnału', () => {
  const sim = late(37);
  const w = sim.blocks.get('W');
  const u = sim.traffic.entry(90201), e = sim.traffic.entry(90202);
  // wjazd 90201 na tor 2 (A → D2) – bez manewrów; skład staje się pociągiem 90202 (odjazd 08:12 już minął)
  for (let i = 0; i < 12000 && !u.train; i++) { sim.step(0.5); grant('W')(sim); }
  assert.ok(sim.ilk.setRoute('A-D2').ok);
  for (let i = 0; i < 4000 && !e.train; i++) { sim.step(0.5); if (w.koPending) w.press('Ko'); }
  assert.ok(e.train, 'skład przekazany jako 90202');
  const tr = e.train, head = tr.head;
  assert.equal(tr.authority, false, 'nowy pociąg bez zezwolenia na jazdę');
  run(sim, 300);
  assert.equal(tr.head, head, 'przed sygnałem nie rusza (wcześniej odjeżdżał w stronę D2 na zezwoleniu 90201)');
  assert.equal(tr.v, 0);
});

test('Szkolna: 90201 opóźniony tak, że zadania manewrowe przepadły – automat wyprawia 90202 wprost z toru 2, bez zatoru', () => {
  const sim = late(37, true);
  const end = Clock.parse('10:30');
  play(sim).until(end, { stop: allArrived });
  for (const e of sim.traffic.timetable()) assert.ok(['na następnym posterunku', 'zakończył bieg'].includes(e.status) || e.phase === 'handed-over', `${e.nr}: ${e.status}`);
  assert.equal(sim.traffic.entry(90202).phase, 'at-neighbour');
  assert.deepEqual(sim.score.items.filter((i) => i.code === 'spad' || i.code === 'unfinished'), []);
});

/*
 * Odstawić i podstawić z powrotem (Chylonia, Sopot): skład opóźniony przyjeżdża na tor już po godzinie `after`
 * zadania „podstaw”. Bez `afterTask` to zadanie zaliczało się od razu przy przyjeździe, potem skład odjeżdżał na tor
 * odstawczy i tam stawał się nowym pociągiem – bez drogi na tor odjazdu (zator 93202 w Chylonii). W Sopocie skład
 * po godzinie „podstaw” przyjeżdża już po terminie odstawienia: oba zadania przepadają, nowy pociąg odjeżdża wprost
 * z toru przyjazdu (wcześniej „podstaw” dawało punkty za samo przyjście pociągu).
 */
const PAIRS = [
  { st: chylonia, unit: 93151, next: 93202, back: 'podstaw-93202', away: 'odstaw-93151', delay: 18, done: true },
  // automat bierze zadanie gotowe do wykonania, nie pierwsze z listy
  { st: chylonia, unit: 93151, next: 93202, back: 'podstaw-93202', away: 'odstaw-93151', delay: 18, done: true, reversed: true },
  { st: sopot, unit: 91151, next: 91202, back: 'podstaw-91202', away: 'odstaw-91151', delay: 30, done: false },
  { st: sopot, unit: 55152, next: 55153, back: 'podstaw-55153', away: 'odstaw-55152', delay: 32, done: false },
];

test('zadania tego samego składu idą po kolei: każde następne czeka na poprzednie (afterTask)', () => {
  for (const st of [chylonia, sopot, szkolna, pustkowie]) {
    const seen = new Map();
    for (const task of st.tasks || []) {
      const prev = seen.get(String(task.unit));
      if (prev) assert.equal(task.afterTask, prev, `${st.id}: ${task.id} po ${prev}`);
      seen.set(String(task.unit), task.id);
    }
  }
});

test('skład opóźniony po godzinie „podstaw”: najpierw odstawienie, potem podstawienie, nowy pociąg odjeżdża z toru planowego', () => {
  for (const { st, unit, next, back, away, delay, done, reversed } of PAIRS) {
    const name = `${st.id} ${unit}${reversed ? ' (zadania w odwrotnej kolejności)' : ''}`;
    const own = st.tasks.filter((x) => String(x.unit) === String(unit));
    const tasks = done ? own : earlier(own, delay); // zadania, które mają przepaść: termin po przesunięciu jak w stacji
    const scenario = { id: 't', name: 't', endTime: '10:00', trains: [unit, next], tasks: reversed ? tasks.reverse() : tasks };
    const sim = new Simulation(st, { scenario, disruptions: 'none' });
    const u = sim.traffic.entry(unit), e = sim.traffic.entry(next);
    sim.traffic.setInboundDelay(u, delay);
    const [t1, t2] = [away, back].map((id) => sim.traffic.tasks.find((t) => t.id === id));
    // do terminu „podstaw” + 10 min – wtedy zadanie jest wykonane albo przepadło
    play(sim).until(() => t2.deadlineTime + 11 * 60, { each: () => { // termin przesuwa się po zgłoszeniu opóźnienia
      assert.ok(!t2.done || t1.done, `${name}: podstawienie zaliczone przed odstawieniem`);
    } });
    assert.ok(u.actualArr > t2.afterTime, `${name}: skład przyjechał po godzinie „podstaw”`);
    assert.deepEqual([t1.done, t2.done], [done, done], name);
    if (!done) assert.equal(sim.score.items.filter((i) => i.code === 'task-failed').length, 2, name);
    assert.equal(e.phase, 'at-neighbour', `${name}: ${e.nr} ${e.status}`);
  }
});

test('Chylonia: oba zadania przepadły, gdy skład był w drodze na tor 22 – automat podstawia go na tor 501, 93202 odjeżdża', () => {
  // 93151 opóźniony o 30 min: odstawienie przepada (07:25) w trakcie jazdy na tor 22, podstawienie czeka na nie i też
  // przepada; skład na torze odstawczym nie może być przekazany jako pociąg – z toru 22 nie ma przebiegu pociągowego
  const scenario = { id: 't', name: 't', endTime: '10:00', trains: [93151, 93202], tasks: earlier(chylonia.tasks.filter((x) => x.unit === 93151), 30) };
  const sim = new Simulation(chylonia, { scenario, disruptions: 'none' });
  sim.traffic.setInboundDelay(sim.traffic.entry(93151), 30);
  play(sim).until('08:30', { stop: allArrived });
  assert.deepEqual(sim.traffic.tasks.map((t) => t.failed), [true, true]);
  const e = sim.traffic.entry(93202);
  assert.equal(e.phase, 'at-neighbour', e.status);
});

test('skład z zadaniem manewrowym w toku nie przechodzi w pociąg: przekazanie dopiero po wykonaniu albo przepadnięciu zadania', () => {
  // 93151 opóźniony o 30 min przyjeżdża po planowym odjeździe 93202: przekazanie przy przyjeździe uprzedziłoby
  // odstawienie (zależnie od tego, czy automat zdążył przełączyć skład w manewry) – i skład 93202 trafiał na tor 22
  const scenario = { id: 't', name: 't', endTime: '10:00', trains: [93151, 93202], tasks: earlier(chylonia.tasks.filter((x) => x.unit === 93151), 30) };
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
    const sim = new Simulation(chylonia, { scenario, disruptions: 'none', seed });
    sim.traffic.setInboundDelay(sim.traffic.entry(93151), 30);
    const e = sim.traffic.entry(93202);
    const open = () => sim.traffic.tasks.some((x) => !x.done && !x.failed && !(x.afterTask && sim.traffic.tasks.find((y) => y.id === x.afterTask)?.failed));
    // własna pętla, nie `play`: przekazanie sprawdzane zaraz po kroku, przed dyżurnym
    let n = 0, handedWithOpenTask = false;
    while (sim.clock.time < Clock.parse('08:30') && !allArrived(sim)) {
      const before = e.attached;
      sim.step(0.5);
      if (!before && e.attached && open()) handedWithOpenTask = true;
      if (n++ % 4 === 0) autoDispatch(sim);
    }
    assert.equal(handedWithOpenTask, false, `ziarno ${seed}: przekazanie przy zadaniu w toku`);
    assert.equal(e.phase, 'at-neighbour', `ziarno ${seed}: ${e.status}`);
  }
});

test('zadanie, którego nie da się wykonać, nie trzyma składu bez końca: przepada w terminie, potem skład przechodzi w pociąg', () => {
  // odstawienie na tor bez przebiegu manewrowego (99) – zadanie nigdy się nie wykona i nie jest wstrzymane usterką
  const tasks = [{ id: 'nigdy', unit: 90201, type: 'move', toTrack: '99', deadline: '07:58', text: 'Skład odstawić na tor 99.' }];
  const scenario = { id: 't', name: 't', endTime: '10:00', trains: [90201, 90202], tasks };
  const sim = new Simulation(szkolna, { scenario, disruptions: 'none', seed: 3 });
  const e = sim.traffic.entry(90202);
  const task = sim.traffic.tasks[0];
  // własna pętla, nie `play`: chwile zapisywane zaraz po kroku, przed dyżurnym
  let n = 0, handedAt = null, failedAt = null;
  while (sim.clock.time < Clock.parse('09:30') && !allArrived(sim)) {
    sim.step(0.5);
    if (task.failed && failedAt == null) failedAt = sim.clock.time;
    if (e.attached && handedAt == null) handedAt = sim.clock.time;
    if (n++ % 4 === 0) autoDispatch(sim);
  }
  assert.ok(failedAt != null, 'zadanie przepadło');
  assert.ok(failedAt <= Clock.parse('07:58') + 10 * 60 + 1, `w terminie (+10 min): ${Clock.format(failedAt, true)}`);
  assert.ok(handedAt != null && handedAt >= failedAt, `przekazanie ${handedAt && Clock.format(handedAt, true)} po przepadnięciu ${Clock.format(failedAt, true)}`);
  assert.equal(e.phase, 'at-neighbour', e.status);
});
