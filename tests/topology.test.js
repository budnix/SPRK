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

/* Łącznica w odcinku zwrotnicowym świeci tylko wtedy, gdy zwrotnica jest w nią ustawiona (Olszyny: Iz1 obejmuje
   zwrotnicę 1, tor przed ostrzem i łącznicę do toru 2). */
test('odcinek zwrotnicowy: kostki za ramieniem zwrotnicy mają warunek położenia, tor przed ostrzem – nie', async () => {
  const { default: olszyny } = await import('../src/stations/olszyny.js');
  const { Simulation } = await import('../src/model/Simulation.js');
  const sim = new Simulation(olszyny, { scenario: 'zmiana-e', disruptions: 'none' });
  const g = (x, y) => sim.ilk.topo.branchGates.get(`${x},${y}`) || [];
  assert.deepEqual(g(4, 4), [], 'przed ostrzem Zw1');
  assert.deepEqual(g(6, 5), [{ id: 'Zw1', position: '-' }]);
  assert.deepEqual(g(7, 6), [{ id: 'Zw1', position: '-' }]);
  assert.deepEqual(g(23, 4), [{ id: 'Zw2', position: '+' }], 'Iz2: tor za ramieniem prostym');
  assert.deepEqual(g(22, 6), [{ id: 'Zw2', position: '-' }]);
  assert.deepEqual(g(8, 8), [{ id: 'Zw3', position: '-' }]);
  assert.deepEqual(g(12, 4), [], 'kostki poza odcinkami zwrotnic');
  // każda kostka z warunkiem należy do odcinka zwrotnicy z warunku
  for (const [k, gates] of sim.ilk.topo.branchGates) for (const x of gates) assert.equal(sim.ilk.topo.tiles.get(k).section, sim.ilk.topo.points.get(x.id).section, k);
  const tile = sim.ilk.topo.tiles.get('6,5');
  assert.equal(sim.ilk.onSetBranch(tile), false, 'Zw1 w „+”: łącznica poza drogą');
  sim.execute({ type: 'point', id: 'Zw1' });
  for (let i = 0; i < 20; i++) sim.step(0.5);
  assert.equal(sim.ilk.points.get('Zw1').position, '-');
  assert.equal(sim.ilk.onSetBranch(tile), true);
  assert.equal(sim.ilk.onSetBranch(sim.ilk.topo.tiles.get('4,4')), true, 'przed ostrzem – zawsze');
});
