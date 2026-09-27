import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeSim } from './helpers.js';
import { validateStation } from '../src/model/validate.js';
import station from './fixtures/stare-pustkowie.js';

test('definicja stacji przechodzi walidację', () => {
  const v = validateStation(station);
  assert.deepEqual(v.errors, []);
});

test('walidacja wykrywa nakładające się i błędne kostki', () => {
  const bad = { ...station, tiles: [...station.tiles, { x: 5, y: 4, type: 'track', ports: ['W', 'E'], section: 'X' }, { x: 1, y: 1, type: 'point', id: 'Zw9', toe: 'W', straight: 'W', diverge: 'E', section: 'S' }] };
  const v = validateStation(bad);
  assert.ok(v.errors.some((e) => e.includes('nakłada')));
  assert.ok(v.errors.some((e) => e.includes('porty zwrotnicy')));
});

test('automatyczna tablica zależności zawiera oczekiwane przebiegi', () => {
  const sim = makeSim();
  const ids = sim.ilk.routeList().map((r) => r.id).sort();
  for (const id of ['A-D1', 'A-D2', 'B-C1', 'B-C2', 'C1-W', 'C2-W', 'D1-E', 'D2-E', 'D2-kT3m', 'Tm1-Tm2', 'Tm2-C2']) {
    assert.ok(ids.includes(id), `brak przebiegu ${id}`);
  }
  // przebiegi pociągowe nie kończą się na kozłach
  assert.ok(!ids.includes('D2-kT3'));
});

test('przebieg przez tor zwrotny ma ograniczenie 40 km/h i drogę ochronną', () => {
  const sim = makeSim();
  const r = sim.ilk.routes.get('A-D2');
  assert.equal(r.speed, 40);
  assert.deepEqual(r.points, [{ id: 'Zw1', position: '-' }]);
  assert.deepEqual(r.sections, ['Iz1', 'T2']);
  assert.deepEqual(r.overlap, ['Iz3']);
});

test('wykolejnica chroni tor główny i jest zdejmowana dla jazdy na tor 3', () => {
  const sim = makeSim();
  assert.deepEqual(sim.ilk.routes.get('D2-E').derailers.protect, [{ id: 'Wk1', position: 'on' }]);
  assert.deepEqual(sim.ilk.routes.get('D2-kT3m').derailers.onRoute, [{ id: 'Wk1', position: 'off' }]);
});
