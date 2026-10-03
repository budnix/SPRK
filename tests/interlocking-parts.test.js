import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Topology } from '../src/model/Topology.js';
import { deriveRoutes } from '../src/model/interlocking/routeTable.js';
import { aspectSpeed, isProceed, isStop, isTrainProceed, isShuntProceed, warningAspect, stopAspect, shapedAspect, proceedAspect } from '../src/model/interlocking/aspects.js';
import { Interlocking } from '../src/model/Interlocking.js';
import station from './fixtures/stare-pustkowie.js';

/*
 * Części zależności w osobnych plikach (src/model/interlocking/): obrazy sygnałowe wg Ie-1 i tablica zależności –
 * czyste reguły, sprawdzane bez symulacji. Zależności (`Interlocking`) wystawiają je pod dotychczasowymi nazwami.
 */

test('obrazy wg Ie-1: szybkość, „Stój”, jazda pociągu i manewrowa', () => {
  assert.deepEqual(['S1', 'Sr1', 'Ms1', 'M1', 'Sz', 'Ms2', 'S10', 'S13', 'Sr3', 'S2', 'S5'].map(aspectSpeed), [0, 0, 0, 0, 40, 25, 40, 40, 40, Infinity, Infinity]);
  assert.deepEqual(['S1', 'Sr1', 'Ms1', 'S2', 'Sz', 'Ms2'].map(isProceed), [false, false, false, true, true, true]);
  assert.deepEqual(['S1', 'Sr1', 'Ms1'].map(isStop), [true, true, false]);
  assert.deepEqual(['S5', 'Sz', 'Ms2', 'M2', 'S1'].map(isTrainProceed), [true, true, false, false, false], 'Ms2 na semaforze dla pociągu to „Stój”');
  assert.deepEqual(['Ms2', 'M2', 'S2'].map(isShuntProceed), [true, true, false]);
  assert.deepEqual([stopAspect('semafor', false), stopAspect('semafor', true), stopAspect('tm', false), stopAspect('tm', true)], ['S1', 'Sr1', 'Ms1', 'M1']);
  assert.deepEqual(['Sr1', 'Sr2', 'Sr3'].map((a) => warningAspect(a, 1)), ['Od1', 'Od2', 'Od2']);
  assert.deepEqual(['Sr1', 'Sr2', 'Sr3'].map((a) => warningAspect(a, 2)), ['Ot1', 'Ot2', 'Ot3']);
  // statyczne zależności to te same funkcje
  assert.equal(Interlocking.isTrainProceed, isTrainProceed);
  assert.equal(Interlocking.aspectSpeed('Sz'), 40);
});

test('obraz zezwalający dla przebiegu: wg szybkości przebiegu i następnego semafora; kształtowy; manewrowy', () => {
  const train = (speed, endType = 'signal') => ({ kind: 'train', speed, end: { type: endType } });
  const shunt = { kind: 'shunt', speed: Infinity, end: { type: 'signal' } };
  // świetlne: [przebieg ≤ 60 km/h?] × [następny: Stój, Sz, Ms2, „40”, zezwalający; wyjazd; kozioł]
  const cases = [
    [train(100), 'S1', 'S5'], [train(40), 'S1', 'S13'], [train(100), 'Sz', 'S5'], [train(100), 'Ms2', 'S5'],
    [train(100), 'S10', 'S4'], [train(40), 'S12', 'S12'], [train(100), 'S2', 'S2'], [train(40), 'S5', 'S10'],
    [train(100, 'exit'), null, 'S2'], [train(60, 'exit'), null, 'S10'], [train(100, 'buffer'), null, 'S5'],
  ];
  for (const [route, next, want] of cases) assert.equal(proceedAspect(route, next, false), want, `${route.speed} km/h, ${route.end.type}, następny ${next}`);
  assert.deepEqual([proceedAspect(train(100), 'S1', true), proceedAspect(train(60), 'S1', true), shapedAspect(train(100))], ['Sr2', 'Sr3', 'Sr2'], 'kształtowe nie zapowiadają');
  assert.deepEqual([proceedAspect(shunt, null, false), proceedAspect(shunt, null, true)], ['Ms2', 'M2']);
});

test('tablica zależności: przebiegi z planu – pociągowe i manewrowe, wyłączenie i nadpisanie z definicji stacji', () => {
  const routes = deriveRoutes(station, new Topology(station));
  assert.ok(routes.has('A-D1') && routes.has('A-D2'), 'wjazdy z A na tory 1 i 2');
  const ad2 = routes.get('A-D2');
  assert.deepEqual([ad2.kind, ad2.start, ad2.approach, ad2.sections, ad2.exit], ['train', 'A', 'ZbA', ['Iz1', 'T2'], null]);
  assert.ok(ad2.speed <= 60, 'przez zwrotnicę na kierunek zwrotny');
  assert.ok([...routes.values()].some((r) => r.exit && r.kind === 'train'), 'wyjazdy na szlak');
  assert.ok([...routes.values()].every((r) => !(r.kind === 'shunt' && r.exit)), 'manewry nie wyjeżdżają na szlak');
  const off = deriveRoutes({ ...station, routes: { disable: ['A-D2'], override: { 'A-D1': { speed: 30 } } } }, new Topology(station));
  assert.deepEqual([off.has('A-D2'), off.get('A-D1').speed], [false, 30]);
});
