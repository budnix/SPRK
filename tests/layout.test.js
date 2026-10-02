import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLayout, track, run, signal, buffer, pointTile, LENGTHS } from '../src/tiles/layout.js';
import { validateStation } from '../src/model/validate.js';
import { Simulation } from '../src/model/Simulation.js';

/*
 * Budowa planu stacji (`src/tiles/layout.js`): konwencje nazw, długości i przycisków w jednym miejscu, części złożone
 * dopisują kostkę i jej odcinek naraz. Stacje gry i stacje testowe budują plan tym modułem.
 */

test('części złożone: zwrotnica, łącznik, odcinek prosty, żeberko – kostki i odcinki z konwencjami', () => {
  const L = createLayout();
  L.point(10, 4, 7, 'W', 'E', 'SE');
  L.diag(11, 5, ['NW', 'SE'], 7);
  L.plain('T1', 0, 4, 4);
  L.plain('T2', 0, 1, 6, 500);
  L.stub(20, 8, 'W', 'T9');
  assert.deepEqual(L.tiles, [
    { x: 10, y: 4, type: 'point', id: 'Zw7', label: '7', toe: 'W', straight: 'E', diverge: 'SE', section: 'Iz7' },
    { x: 11, y: 5, type: 'track', ports: ['NW', 'SE'], section: 'Iz7' },
    ...run(0, 4, 4, 'T1'), ...run(0, 1, 6, 'T2'),
    { x: 20, y: 8, type: 'buffer', port: 'W', section: 'ST9', endButton: { id: 'kT9', color: 'white' } },
  ]);
  assert.deepEqual(L.sections, {
    Iz7: { length: LENGTHS.point, kind: 'point' }, T1: { length: 100, kind: 'plain' }, T2: { length: 500, kind: 'plain' },
    ST9: { length: LENGTHS.siding, kind: 'siding' },
  });
  assert.equal(L.section('X', { length: 1 }), 'X');
});

test('przejście między torami: dwie zwrotnice z kierunkiem zasadniczym przeciwnym do ostrza i ukos w odcinku pierwszej', () => {
  const L = createLayout();
  L.crossover(10, 4, 1, 'W', 'SE', 12, 6, 2, 'E', 'NW', ['NW', 'SE']);
  assert.deepEqual(L.tiles.map((t) => [t.type, t.x, t.y, t.id ?? t.section, t.straight ?? null]), [
    ['point', 10, 4, 'Zw1', 'E'], ['track', 11, 5, 'Iz1', null], ['point', 12, 6, 'Zw2', 'W'],
  ]);
  assert.deepEqual(Object.keys(L.sections), ['Iz1', 'Iz2']);
});

test('wyjazd na szlak: odcinek zbliżania, kostki z zachodu na wschód, przycisk i nazwa sąsiada na kostce skrajnej', () => {
  const L = createLayout();
  L.lineExit({ side: 'W', y: 4, id: 'PS1', text: 'Pszczółki', from: 0, to: 2 });
  L.lineExit({ side: 'E', y: 6, id: 'GD1', text: 'Gdańsk', from: 7, to: 9, section: 'ZbX', length: 500 });
  assert.deepEqual(L.tiles.map((t) => [t.x, t.y, t.section, t.endButton?.id ?? null, t.text ?? null]), [
    [0, 4, 'ZbPS1', 'kPS1', 'Pszczółki'], [1, 4, 'ZbPS1', null, null], [2, 4, 'ZbPS1', null, null],
    [7, 6, 'ZbX', null, null], [8, 6, 'ZbX', null, null], [9, 6, 'ZbX', 'kGD1', 'Gdańsk'],
  ]);
  assert.ok(L.tiles.filter((t) => t.endButton).every((t) => t.endButton.color === 'green'));
  assert.deepEqual(L.sections, { ZbPS1: { length: LENGTHS.approach, kind: 'approach' }, ZbX: { length: 500, kind: 'approach' } });
  assert.throws(() => L.lineExit({ side: 'N', y: 1, id: 'A', from: 0, to: 1 }), /side/);
  assert.throws(() => L.lineExit({ side: 'W', y: 1, id: 'A', from: 3, to: 1 }), /from ≤ to/);
});

test('stacja zbudowana modułem jest poprawna i daje przebieg na szlak', () => {
  const L = createLayout();
  L.lineExit({ side: 'W', y: 2, id: 'W', text: 'Lewo', from: 0, to: 1 });
  L.plain('T1', 2, 8, 2);
  L.lineExit({ side: 'E', y: 2, id: 'E', text: 'Prawo', from: 9, to: 10 });
  L.add(signal(2, 3, 'A', 'semafor', { x: 2, y: 2 }, 'E', { entry: true }), signal(8, 1, 'B', 'semafor', { x: 8, y: 2 }, 'E'));
  const station = {
    schemaVersion: 1, id: 'proba', name: 'Próba', desk: { cols: 11, rows: 4 }, startTime: '06:00',
    exits: { W: { name: 'Lewo', tile: { x: 0, y: 2 }, dir: 'W', direction: 'in' }, E: { name: 'Prawo', tile: { x: 10, y: 2 }, dir: 'E', direction: 'out' } },
    sections: L.sections, tiles: L.tiles, routes: { disable: [], override: {} }, timetable: [],
  };
  assert.deepEqual(validateStation(station).errors, []);
  const routes = new Simulation(station, { disruptions: 'none' }).ilk.routeList().map((r) => `${r.id}${r.exit ? `>${r.exit}` : ''}`);
  assert.ok(routes.includes('B-E>E'), routes.join(', '));
  assert.deepEqual([track(1, 2, ['W', 'E'], 'S').type, buffer(1, 1, 'W', 'S', 'k1').endButton, pointTile(1, 1, 'Zw1', '1', 'W', 'E', 'NE', 'Iz1').section],
    ['track', { id: 'k1', color: 'white' }, 'Iz1']);
});

test('stacje nie przepisują pomocników planu – biorą je z src/tiles/layout.js (konwencje w jednym miejscu)', () => {
  const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
  const files = [...readdirSync(join(ROOT, 'src', 'stations')).map((f) => join('src', 'stations', f)), ...readdirSync(join(ROOT, 'tests', 'fixtures')).map((f) => join('tests', 'fixtures', f))]
    .filter((f) => f.endsWith('.js') && !f.endsWith('index.js'));
  // przepisany pomocnik: konstruktor kostki toru / zwrotnicy / kozła, rejestr odcinków albo funkcja, która rejestruje
  // odcinek i dopisuje kostki (tak powstawały wyjazdy i zwrotnice) – plan wpisany jako dane jest w porządku
  const COPY = /=>\s*\(\{\s*x,\s*y,\s*type:\s*'(?:track|point|buffer)'|sections\[id\]\s*=|=>\s*\{\s*sec\(/;
  const bad = files.filter((f) => COPY.test(readFileSync(join(ROOT, f), 'utf8')));
  assert.deepEqual(bad, [], 'pomocniki planu przepisane w pliku stacji');
  assert.ok(files.length >= 15);
});
