import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/model/Simulation.js';
import szkolna from '../src/stations/szkolna.js';
import { Clock } from '../src/core/Clock.js';

/*
 * Przyczyna postoju pociągu (zakładka Pociągi, Traffic.waitReason). Szkolna: 6106 z Dębna (08:33, tor 1) jedzie dalej
 * do Lipna (odjazd 08:35). Dawniej zakładka mówiła tylko „postój, odjazd 08:35”, także po godzinie odjazdu, gdy semafor
 * C1 stał na „Stój” przez usterkę blokady – gracz nie wiedział, że trzeba zapytać o drogę i podać Sz albo rozkaz.
 */
function run6106(faults) {
  const sim = new Simulation(szkolna, { scenario: { id: 't', name: 't', endTime: '10:00', srk: 'komputerowe', trains: [6106], faults }, disruptions: 'none' });
  const e = sim.traffic.timetable().find((x) => x.nr === 6106), E = sim.blocks.get('E');
  const until = (hhmm) => {
    while (sim.clock.time < Clock.parse(hhmm)) {
      sim.step(0.5);
      if (E.request === 'theirs') E.press('Poz');
      if (!e.train?.entered && !sim.ilk.active.size && !sim.ilk.pending.length) sim.execute({ type: 'route', start: 'B', end: 'C1', kind: 'train' });
      if (E.koPending) E.press('Ko');
    }
  };
  const step = (sec) => { for (let i = 0; i < sec * 2; i++) sim.step(0.5); };
  return { sim, e, until, step, why: () => sim.traffic.waitReason(e) };
}

test('przyczyna postoju przy usterce blokady: przed odjazdem brak, potem zapytanie telefoniczne, po „droga wolna” Sz na C1, po Sz brak', () => {
  const { sim, e, until, step, why } = run6106([{ type: 'block-fail', target: 'W', at: '08:20', duration: 40 }]);
  until('08:34');
  assert.ok(e.train?.entered, '6106 na stacji');
  assert.equal(why(), null, 'planowy postój do 08:35 – bez przyczyny');
  until('08:36');
  assert.deepEqual(why(), { code: 'phone-ask', signal: 'C1', neighbour: 'Lipno' }, 'przebiegu nie da się nastawić – blokada bez łączności, trzeba zapytać o drogę');
  sim.comms.send('ask-free', { exit: 'W', nr: 6106 });
  step(30);
  assert.ok(sim.execute({ type: 'route', start: 'C1', end: 'kW', kind: 'train' }).ok);
  step(10);
  assert.deepEqual(why(), { code: 'phone-sz', signal: 'C1', neighbour: 'Lipno' }, 'przebieg nastawiony, semafor „Stój” – Sz albo rozkaz');
  assert.ok(sim.execute({ type: 'substitute', signal: 'C1' }).ok);
  step(20);
  assert.ok(e.train.v > 0, '6106 jedzie na Sz');
  assert.equal(why(), null);
});

test('przyczyna postoju przy sprawnej blokadzie: bez pozwolenia od Lipna – żądanie Wbl', () => {
  const { e, until, why } = run6106([]);
  until('08:36');
  assert.deepEqual(why(), { code: 'no-permission', signal: 'C1', neighbour: 'Lipno' });
  assert.equal(e.status, 'postój');
});
