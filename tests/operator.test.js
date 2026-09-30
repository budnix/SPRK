import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/model/Simulation.js';
import szkolna from '../src/stations/szkolna.js';
import { autoDispatch, allArrived, Clock } from './helpers.js';

/* Automat dyżurnego (AutoOperator) – decyzje, które nie mogą kończyć się zatorem. */

test('krzyżowanie na szlaku jednotorowym: tor planowy zajęty przez pociąg, który czeka na ten sam szlak – automat przyjmuje na inny tor', () => {
  // 1001 z Dębna stoi na torze 1 i odjedzie do Lipna; 1002 z Lipna ma w rozkładzie też tor 1. Dopóki 1002 stoi przed
  // semaforem A, szlak do Lipna jest zajęty i 1001 nie odjedzie – a 1002 nie wjedzie na zajęty tor 1.
  const sim = new Simulation(szkolna, { srk: 'E', disruptions: 'none', scenario: { id: 't', name: 't', endTime: '08:00', tasks: [], timetable: [
    { nr: 1001, kind: 'os', name: 'Osobowy', from: 'E', to: 'W', arr: '07:10', dep: '07:20', track: '1', stop: true, length: 130, vmax: 100, dwell: 60 },
    { nr: 1002, kind: 'os', name: 'Osobowy', from: 'W', to: 'E', arr: '07:14', dep: '07:16', track: '1', stop: true, length: 130, vmax: 100, dwell: 60 },
  ] } });
  const end = Clock.parse('09:00');
  let n = 0;
  while (sim.clock.time < end && !allArrived(sim)) { sim.step(0.5); if (n++ % 4 === 0) autoDispatch(sim); }
  const tt = sim.traffic.timetable();
  for (const e of tt) assert.equal(e.status, 'na następnym posterunku', `${e.nr}: ${e.status}`);
  assert.equal(String(tt.find((e) => e.nr === 1001).actualTrack), '1');
  assert.equal(String(tt.find((e) => e.nr === 1002).actualTrack), '2', 'krzyżowanie na torze 2');
  assert.equal(sim.ilk.counters.rozprucie, 0);
  assert.deepEqual(sim.score.items.filter((i) => i.code === 'spad' || i.code === 'unfinished'), []);
});
