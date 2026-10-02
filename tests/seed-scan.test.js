import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { seededRandom } from '../scripts/random-seed.mjs';
import { parseArgs, failedTests, testFiles, HELP } from '../scripts/seed-scan.mjs';
import { defaultWorkers } from '../scripts/lib/workers.mjs';

/* Szukanie testów przypadkowych (`scripts/seed-scan.mjs`): powtarzalne „losowe” ziarna i odczyt wyniku testów. */

test('generator ziaren: powtarzalny dla tego samego zestawu, inny dla innego, liczby z [0, 1)', () => {
  const take = (n, k = 20) => { const r = seededRandom(n); return Array.from({ length: k }, () => r()); };
  assert.deepEqual(take(139), take(139));
  assert.notDeepEqual(take(139), take(140));
  for (const x of take(7, 500)) assert.ok(x >= 0 && x < 1);
  assert.ok(new Set(take(7, 500).map((x) => Math.floor(x * 1e9))).size > 490, 'ziarna zmian się nie powtarzają');
});

test('moduł ładowany przed testem: z SPRK_RAND zmiana bez ziarna dostaje ziarno powtarzalne; bez zmiennej Math.random zostaje', () => {
  const seedOf = (env) => execFileSync(process.execPath, ['--import', './scripts/random-seed.mjs', '--input-type=module', '-e',
    "import { Simulation } from './src/model/Simulation.js'; import s from './src/stations/szkolna.js'; console.log(new Simulation(s, { disruptions: 'none' }).seed);"],
  { env: { ...process.env, ...env }, encoding: 'utf8' }).trim();
  const a = seedOf({ SPRK_RAND: '139' });
  assert.equal(seedOf({ SPRK_RAND: '139' }), a);
  assert.notEqual(seedOf({ SPRK_RAND: '140' }), a);
  assert.equal(a, String(Math.floor(seededRandom(139)() * 1e9)));
  assert.notEqual(seedOf({ SPRK_RAND: '' }), seedOf({ SPRK_RAND: '' }), 'bez zestawu ziarno jest losowe');
});

test('opcje: wartości domyślne, --runs / --from / --only / --workers, błędy z komunikatem', () => {
  assert.deepEqual(parseArgs([]), { runs: 30, from: 1, only: null, workers: defaultWorkers(), help: false });
  const o = parseArgs(['--runs', '5', '--from=139', '--only', 'rumia', '--workers=2']);
  assert.deepEqual([o.runs, o.from, o.workers, o.only.source], [5, 139, 2, 'rumia']);
  assert.equal(parseArgs(['-h']).help, true);
  assert.throws(() => parseArgs(['--runs', '0']), /--runs: liczba całkowita od 1/);
  assert.throws(() => parseArgs(['--runs']), /--runs: brak wartości/);
  assert.throws(() => parseArgs(['--szybko']), /Nieznana opcja: --szybko/);
  assert.match(HELP, /SPRK_RAND=<n> node --import \.\/scripts\/random-seed\.mjs --test/);
});

test('wynik testów: nazwy testów, które nie przeszły, bez czasu, bez powtórzeń i bez nagłówka', () => {
  const out = ['✔ dobry test (1.2ms)', '✖ Rumia: pełna zmiana (505.38ms)', 'ℹ fail 1', '', '✖ failing tests:', '', 'test at tests/rumia.test.js:37:1',
    '✖ Rumia: pełna zmiana (505.38ms)', '  AssertionError: 93205: opóźnienie 4'].join('\n');
  assert.deepEqual(failedTests(out), ['Rumia: pełna zmiana']);
  assert.deepEqual(failedTests('✔ a (1ms)\nℹ fail 0'), []);
});

test('pliki testów: tylko tests/*.test.js, wzorzec zawęża', () => {
  const all = testFiles();
  assert.ok(all.length > 90 && all.every((f) => /^tests\/[\w-]+\.test\.js$/.test(f)));
  assert.deepEqual(testFiles(/^tests\/rumia\./), ['tests/rumia.test.js']);
});
