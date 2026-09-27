import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/model/Simulation.js';
import wola from '../src/stations/wola-pustkowska.js';
import { validateStation } from '../src/model/validate.js';
import { Clock } from '../src/core/Clock.js';
import { autoDispatch, allArrived } from './helpers.js';

test('Wola Pustkowska: definicja poprawna, przebiegi zgodne z układem', () => {
  assert.deepEqual(validateStation(wola).errors, []);
  const sim = new Simulation(wola, { disruptions: 'none' });
  const ids = sim.ilk.routeList().map((r) => r.id);
  for (const id of ['A-E2', 'A-E3', 'B-D1', 'C-D3', 'D1-K1', 'D2-K1', 'D3-K1', 'E2-Z2', 'E3-B', 'E3-Z2', 'E3-kT4m', 'Tm1-D3']) assert.ok(ids.includes(id), id);
  assert.ok(!ids.includes('D2-K2') && !ids.includes('D3-K2'), 'brak wyjazdów na tor wjazdowy');
  // blokady jednokierunkowe
  assert.equal(sim.blocks.get('K2').gate().ok, false);
  assert.equal(sim.blocks.get('K1').gate().ok, true, 'tor wyjazdowy linii dwutorowej nie wymaga pozwolenia');
  assert.equal(sim.blocks.get('B').gate().ok, false, 'Eap wymaga pozwolenia');
});

test('Wola Pustkowska: pełna zmiana z manewrami i przekazaniem składu, bez naruszeń bezpieczeństwa', () => {
  const sim = new Simulation(wola, { disruptions: 'none' });
  const end = Clock.parse('09:25');
  let n = 0;
  while (sim.clock.time < end && !allArrived(sim)) {
    sim.step(0.5);
    if (n++ % 4 === 0) autoDispatch(sim);
    const occ = new Map();
    for (const tr of sim.traffic.trains) {
      if (tr.mode !== 'train') continue;
      for (const s of tr.occupiedSections()) { assert.ok(!occ.has(s) || occ.get(s) === tr.nr, `kolizja na ${s}`); occ.set(s, tr.nr); }
    }
  }
  for (const e of sim.traffic.timetable()) {
    if (e.terminates) { assert.ok(e.status.startsWith('przekazany'), `${e.nr}: ${e.status}`); continue; }
    assert.equal(e.status, 'na następnym posterunku', `${e.nr}: ${e.status}`);
    if (e.from) assert.equal(String(e.actualTrack), String(e.track), `${e.nr}: tor ${e.actualTrack}`);
    assert.ok(e.delay <= 3, `${e.nr}: opóźnienie ${e.delay}`);
  }
  for (const t of sim.traffic.tasks) assert.equal(t.done, true, `zadanie ${t.id}`);
  assert.equal(sim.ilk.counters.rozprucie, 0);
  assert.ok(sim.ended);
});

test('Wola Pustkowska: scenariusz z blokadą Borków bez łączności – zapowiadanie telefoniczne', () => {
  const sim = new Simulation(wola, { scenario: 'borki-bez-blokady' });
  const end = Clock.parse('09:25');
  let n = 0;
  while (sim.clock.time < end && !allArrived(sim)) { sim.step(0.5); if (n++ % 4 === 0) autoDispatch(sim); }
  const borki = sim.traffic.timetable().filter((e) => e.from === 'B' || e.to === 'B');
  for (const e of borki) assert.ok(e.status === 'na następnym posterunku' || e.status.startsWith('przekazany'), `${e.nr}: ${e.status}`);
  assert.ok(sim.comms.messages.some((m) => m.kind === 'ask'), 'brak pytania telefonicznego');
  assert.ok(!sim.score.items.some((i) => i.code === 'comms-wrong'), 'dyżurny automatyczny użył złej formuły');
});
