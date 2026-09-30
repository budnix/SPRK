import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/model/Simulation.js';
import szkolna from '../src/stations/szkolna.js';
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
