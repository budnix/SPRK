import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/model/Simulation.js';
import szkolna from '../src/stations/szkolna.js';
import chylonia from '../src/stations/gdynia-chylonia.js';
import sopot from '../src/stations/sopot.js';
import { autoDispatch, allArrived, run, Clock } from './helpers.js';

/*
 * Szkolna: osobowy 90201 kończy bieg na torze 2, skład ma być odstawiony na tor 3 (zadanie 1) i podstawiony z powrotem
 * (zadanie 2), a potem odjeżdża do Lipna jako 90202. Przy dużym opóźnieniu 90201 oba zadania są już po terminie.
 */

const late = (min, all = false) => {
  // bez innych pociągów (test ręczny) albo pełny rozkład (automat)
  const scenario = all ? 'zmiana-e' : { id: 't', name: 't', endTime: '10:00', srk: 'E', trains: [90201, 90202], tasks: szkolna.tasks };
  const sim = new Simulation(szkolna, { scenario, disruptions: 'none' });
  sim.traffic.setInboundDelay(sim.traffic.timetable().find((e) => e.nr === 90201), min);
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

test('pociąg utworzony ze składu nie jedzie na dawnym zezwoleniu: 90202 stoi przy peronie, dopóki nie dostanie sygnału', () => {
  const sim = late(37);
  const w = sim.blocks.get('W');
  const u = sim.traffic.timetable().find((e) => e.nr === 90201), e = sim.traffic.timetable().find((x) => x.nr === 90202);
  // wjazd 90201 na tor 2 (A → D2) – bez manewrów; skład staje się pociągiem 90202 (odjazd 08:12 już minął)
  for (let i = 0; i < 12000 && !u.train; i++) { sim.step(0.5); if (w.request === 'theirs') w.press('Poz'); }
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
  let n = 0;
  while (sim.clock.time < end && !allArrived(sim)) { sim.step(0.5); if (n++ % 4 === 0) autoDispatch(sim); }
  for (const e of sim.traffic.timetable()) assert.ok(['na następnym posterunku', 'zakończył bieg'].includes(e.status) || e.status.startsWith('przekazany'), `${e.nr}: ${e.status}`);
  assert.equal(sim.traffic.timetable().find((e) => e.nr === 90202).status, 'na następnym posterunku');
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
  for (const st of [chylonia, sopot, szkolna]) {
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
    const tasks = st.tasks.filter((x) => String(x.unit) === String(unit));
    const scenario = { id: 't', name: 't', endTime: '10:00', trains: [unit, next], tasks: reversed ? tasks.reverse() : tasks };
    const sim = new Simulation(st, { scenario, disruptions: 'none' });
    const u = sim.traffic.timetable().find((e) => e.nr === unit), e = sim.traffic.timetable().find((x) => x.nr === next);
    sim.traffic.setInboundDelay(u, delay);
    const [t1, t2] = [away, back].map((id) => sim.traffic.tasks.find((t) => t.id === id));
    let n = 0;
    // do terminu „podstaw” + 10 min – wtedy zadanie jest wykonane albo przepadło
    while (sim.clock.time < t2.deadlineTime + 11 * 60) {
      sim.step(0.5);
      if (n++ % 4 === 0) autoDispatch(sim);
      assert.ok(!t2.done || t1.done, `${name}: podstawienie zaliczone przed odstawieniem`);
    }
    assert.ok(u.actualArr > t2.afterTime, `${name}: skład przyjechał po godzinie „podstaw”`);
    assert.deepEqual([t1.done, t2.done], [done, done], name);
    if (!done) assert.equal(sim.score.items.filter((i) => i.code === 'task-failed').length, 2, name);
    assert.equal(e.status, 'na następnym posterunku', `${name}: ${e.nr} ${e.status}`);
  }
});
