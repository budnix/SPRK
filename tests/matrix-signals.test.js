import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeSim, run } from './helpers.js';
import { POINT_SWITCH_TIME } from '../src/model/Interlocking.js';

/**
 * Obrazy sygnałowe wg Ie-1 dla każdego przebiegu wjazdowego × stan następnego semafora:
 *  - następny „Stój”:   S5 (bez ograniczenia) / S13 (40 km/h)
 *  - następny „Jazda”:  S2 / S10
 *  - następny 40 km/h:  S4 / S12
 */
test('macierz obrazów sygnałowych semaforów wjazdowych', () => {
  const base = makeSim();
  const entries = base.ilk.routeList().filter((r) => r.kind === 'train' && r.end.type === 'signal');
  assert.ok(entries.length >= 4);
  for (const r of entries) {
    const restricted = r.speed <= 60;
    // wariant 1: następny semafor Stój
    {
      const sim = makeSim();
      sim.ilk.setRoute(r.id); run(sim, POINT_SWITCH_TIME + 1);
      assert.equal(sim.ilk.signals.get(r.start).aspect, restricted ? 'S13' : 'S5', `${r.id} / następny Stój`);
    }
    // wariant 2 i 3: następny semafor pokazuje jazdę (przebieg wyjazdowy z semafora końcowego)
    const nextRoutes = base.ilk.routeList().filter((x) => x.kind === 'train' && x.start === r.end.id);
    for (const nr of nextRoutes) {
      const sim = makeSim();
      for (const b of sim.blocks.values()) b.press('Wbl');
      run(sim, 40);
      assert.equal(sim.ilk.setRoute(nr.id).ok, true, nr.id);
      run(sim, POINT_SWITCH_TIME + 1);
      assert.equal(sim.ilk.setRoute(r.id).ok, true, `${r.id} po ${nr.id}`);
      run(sim, POINT_SWITCH_TIME + 1);
      const nextAspect = sim.ilk.signals.get(nr.start).aspect;
      const nextRestricted = ['S10', 'S11', 'S12', 'S13'].includes(nextAspect);
      const expect = nextRestricted ? (restricted ? 'S12' : 'S4') : (restricted ? 'S10' : 'S2');
      assert.equal(sim.ilk.signals.get(r.start).aspect, expect, `${r.id} gdy ${nr.start} pokazuje ${nextAspect}`);
      // zmiana następnego semafora na Stój musi natychmiast zmienić obraz
      sim.ilk.cancelSignal(nr.start);
      assert.equal(sim.ilk.signals.get(r.start).aspect, restricted ? 'S13' : 'S5', `${r.id} po wygaszeniu ${nr.start}`);
    }
  }
});

test('semafory wyjazdowe: S2 lub S10 przy wyjeździe na szlak, Sz tylko z pozwoleniem blokady', () => {
  const base = makeSim();
  for (const r of base.ilk.routeList().filter((x) => x.kind === 'train' && x.end.type === 'exit')) {
    const sim = makeSim();
    // bez pozwolenia: ani przebieg, ani Sz
    assert.equal(sim.ilk.setRoute(r.id).ok, false, `${r.id} bez pozwolenia`);
    assert.equal(sim.ilk.substituteSignal(r.start).ok, false, `Sz na ${r.start} bez pozwolenia`);
    sim.blocks.get(r.exit).press('Wbl'); run(sim, 40);
    assert.equal(sim.ilk.setRoute(r.id).ok, true);
    run(sim, POINT_SWITCH_TIME + 1);
    assert.equal(sim.ilk.signals.get(r.start).aspect, r.speed <= 60 ? 'S10' : 'S2', r.id);
  }
});

test('tarcze manewrowe i Ms2: każdy przebieg manewrowy daje Ms2 tylko na sygnalizatorze początkowym', () => {
  const base = makeSim();
  for (const r of base.ilk.routeList().filter((x) => x.kind === 'shunt')) {
    const sim = makeSim();
    assert.equal(sim.ilk.setRoute(r.id).ok, true, r.id);
    run(sim, POINT_SWITCH_TIME + 1);
    for (const s of sim.ilk.signals.values()) {
      if (s.id === r.start) assert.equal(s.aspect, 'Ms2', r.id);
      else assert.ok(s.aspect === 'S1' || s.aspect === 'Ms1', `${r.id}: ${s.id} pokazuje ${s.aspect}`);
    }
  }
});
