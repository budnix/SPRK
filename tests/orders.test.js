import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeSim, run } from './helpers.js';

/** Doprowadza pociąg 5310 do zatrzymania przed semaforem A (bez przebiegu). */
function trainAtA(sim) {
  const w = sim.blocks.get('W');
  run(sim, 60 * 16, () => { if (w.request === 'theirs') w.press('Poz'); });
  const e = sim.traffic.timetable().find((x) => x.nr === 5310);
  assert.equal(e.train.stoppedAt?.signal, 'A');
  return e;
}

test('rozkaz „S”: odmowa, gdy zwrotnice nie są zamknięte; po Zz rozkaz wydany, pociąg jedzie ≤20 km/h do następnego semafora', () => {
  const sim = makeSim();
  const e = trainAtA(sim);
  assert.equal(sim.traffic.standingTrains()[0].signal, 'A');
  const r1 = sim.traffic.issueOrder({ nr: 5310, signal: 'A' });
  assert.equal(r1.ok, false);
  assert.match(r1.reason, /Zw1 niezamknięta/);
  sim.ilk.toggleIndividualLock('Zw1');
  const r2 = sim.traffic.issueOrder({ nr: 5310, signal: 'A' });
  assert.equal(r2.ok, true, r2.reason);
  assert.equal(sim.traffic.orders.length, 1);
  assert.match(r2.order.text, /Rozkaz pisemny „S”/);
  let vmax = 0; let passed = false;
  run(sim, 240, () => { vmax = Math.max(vmax, e.train.v * 3.6); if (e.train.occupiedSections().has('T1')) passed = true; });
  assert.ok(passed, 'pociąg nie minął semafora A');
  assert.ok(vmax <= 21, `prędkość ${vmax.toFixed(1)} km/h`);
  // staje przed D1 (Stój) – rozkaz dotyczył tylko A
  run(sim, 120);
  assert.equal(e.train.v, 0);
  assert.equal(e.train.stoppedAt?.signal, 'D1');
  assert.equal(sim.traffic.issueOrder({ nr: 5310, signal: 'A' }).ok, false, 'rozkaz na inny semafor niż ten, przed którym stoi');
});

test('rozkaz „S”: odmowa dla pociągu w ruchu, gdy semafor pokazuje jazdę, przy zajętym odcinku i bez pozwolenia blokady', () => {
  const sim = makeSim();
  const e = trainAtA(sim);
  sim.ilk.toggleIndividualLock('Zw1');
  // odcinek T1 zajęty przez inny pociąg – symulacja
  sim.ilk.updateOccupancy(new Set(['ZbA', 'T1']));
  const r = sim.traffic.issueOrder({ nr: 5310, signal: 'A' });
  assert.equal(r.ok, false); assert.match(r.reason, /T1 zajęty/);
  sim.ilk.updateOccupancy(new Set(['ZbA']));
  // semafor pokazuje jazdę – rozkaz zbędny
  sim.ilk.setRoute('A-D1'); run(sim, 6);
  const r2 = sim.traffic.issueOrder({ nr: 5310, signal: 'A' });
  assert.equal(r2.ok, false); assert.match(r2.reason, /nie wskazuje|w ruchu/);
  run(sim, 300);
  assert.equal(e.train.v, 0);
  assert.equal(e.train.nextSignal(), 'D1', 'pociąg stoi przed D1');
  // wyjazd na szlak bez pozwolenia blokady
  sim.ilk.toggleIndividualLock('Zw4');
  const r3 = sim.traffic.issueOrder({ nr: 5310, signal: 'D1' });
  assert.equal(r3.ok, false); assert.match(r3.reason, /pozwolenia/);
  // pozwolenie od sąsiada (sąsiad ma własne żądanie w toku – ustawiamy stan blokady wprost)
  const bE = sim.blocks.get('E'); bE.request = null; bE.direction = 'out'; bE.permission = true;
  const r4 = sim.traffic.issueOrder({ nr: 5310, signal: 'D1' });
  assert.equal(r4.ok, true, r4.reason);
  run(sim, 400);
  assert.ok(sim.blocks.get('E').poBlocked || e.status === 'u sąsiada', 'pociąg nie wyjechał na szlak na rozkaz');
});
