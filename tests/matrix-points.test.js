import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeSim, run } from './helpers.js';
import { POINT_SWITCH_TIME } from '../src/model/Interlocking.js';
import { Train } from '../src/model/Train.js';

/** Każda zwrotnica w każdym stanie: wolna, zajęta, utwierdzona, zamknięta, w ruchu. */
test('macierz zwrotnic × stanów', () => {
  const base = makeSim();
  for (const pid of base.ilk.points.keys()) {
    const routeWith = base.ilk.routeList().find((r) => r.points.some((p) => p.id === pid));
    for (const state of ['free', 'occupied', 'route', 'locked', 'moving']) {
      const sim = makeSim();
      for (const b of sim.blocks.values()) b.press('Wbl');
      run(sim, 40);
      const p = sim.ilk.points.get(pid);
      let expectOk = true;
      if (state === 'occupied') { sim.ilk.updateOccupancy(new Set([p.section])); expectOk = false; }
      if (state === 'route') { assert.equal(sim.ilk.setRoute(routeWith.id).ok, true); run(sim, POINT_SWITCH_TIME + 1); expectOk = false; }
      if (state === 'locked') { sim.ilk.toggleIndividualLock(pid); expectOk = false; }
      if (state === 'moving') { sim.ilk.switchPoint(pid); expectOk = false; }
      const before = p.position;
      const r = sim.ilk.switchPoint(pid);
      assert.equal(!!r.ok, expectOk, `${pid} ${state}: ${r.reason || 'ok'}`);
      run(sim, POINT_SWITCH_TIME + 1);
      if (state === 'free') assert.notEqual(p.position, before, `${pid}: nie przestawiona`);
      if (state === 'occupied' || state === 'locked') assert.equal(p.position, before, `${pid} ${state}: przestawiona mimo blokady`);
      if (state === 'route') assert.equal(p.position, routeWith.points.find((q) => q.id === pid).position);
      assert.equal(p.control, true, `${pid} ${state}: brak kontroli po zakończeniu`);
    }
  }
});

test('każda wykolejnica: przestawianie i blokady', () => {
  const base = makeSim();
  for (const did of base.ilk.derailers.keys()) {
    const sim = makeSim();
    const d = sim.ilk.derailers.get(did);
    assert.equal(d.position, 'on', 'wykolejnica domyślnie nałożona');
    assert.equal(sim.ilk.switchDerailer(did).ok, true);
    run(sim, POINT_SWITCH_TIME + 1);
    assert.equal(d.position, 'off');
    sim.ilk.updateOccupancy(new Set([d.section]));
    assert.equal(sim.ilk.switchDerailer(did).ok, false, 'zajęta');
    sim.ilk.updateOccupancy(new Set());
    sim.ilk.toggleIndividualLock(did, true);
    assert.equal(sim.ilk.switchDerailer(did).ok, false, 'zamknięta');
    sim.ilk.toggleIndividualLock(did, true);
    assert.equal(sim.ilk.switchDerailer(did).ok, true);
  }
});

test('przebieg nie utwierdza się, gdy zwrotnica nie może osiągnąć położenia (zajęta)', () => {
  const sim = makeSim();
  const r = sim.ilk.routes.get('A-D2'); // wymaga Zw1 w „−”
  sim.ilk.updateOccupancy(new Set(['Iz1']));
  const res = sim.ilk.setRoute(r.id);
  assert.equal(res.ok, false);
  assert.match(res.reason, /zajęty/);
  sim.ilk.updateOccupancy(new Set());
  assert.equal(sim.ilk.setRoute(r.id).ok, true);
  run(sim, POINT_SWITCH_TIME + 1);
  assert.ok(sim.ilk.active.has(r.id));
});

test('rozprucie: najazd na zwrotnicę z ostrza przy złym położeniu', () => {
  const sim = makeSim();
  // Ustaw Zw3 w „−” i wjedź na nią jazdą manewrową z toru T2b (od strony toru zasadniczego)
  sim.ilk.switchPoint('Zw3', '-');
  run(sim, POINT_SWITCH_TIME + 1);
  const t2b = sim.ilk.sections.get('T2b').tiles.sort((a, b) => b.x - a.x); // od czoła (x=21) do ogona (x=23)
  const e = { nr: 'M1', kind: 'tow', length: 20, vmax: 25, stop: false };
  const tr = new Train(e, sim.ilk.topo, sim.ilk, { mode: 'train' });
  tr.placeOnTrack([...t2b].reverse(), 'W'); // czoło na (21,6) w kierunku W
  tr.mode = 'train'; tr.state = 'moving'; tr.vmax = 25 / 3.6; // jazda bez przebiegu (np. na rozkaz) – wjazd na zwrotnicę z ostrza
  sim.traffic.trains.push(tr);
  run(sim, 60);
  assert.equal(sim.ilk.counters.rozprucie, 1, 'rozprucie niewykryte');
  assert.equal(sim.ilk.points.get('Zw3').control, false);
  assert.ok(sim.ilk.alarms.has('rozprucie:Zw3'));
});


