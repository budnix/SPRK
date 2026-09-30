import { test } from 'node:test';
import assert from 'node:assert/strict';
import { availableParallelism, tmpdir } from 'node:os';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs, listShifts, surveyShift, runAll, main, compareResults, isProblem, shiftKey } from '../scripts/survey.mjs';
import { STATIONS } from '../src/stations/index.js';

/**
 * Przegląd zmian z automatem (`scripts/survey.mjs`): opcje wiersza poleceń, lista zmian, jedna krótka zmiana
 * i porównanie dwóch przeglądów. Pełny przegląd (setki zmian) uruchamia się ręcznie: `npm run survey`.
 */

test('survey: opcje domyślne', () => {
  const o = parseArgs([]);
  assert.deepEqual(o.levels, ['high', 'low']);
  assert.deepEqual(o.seeds, [1, 2, 3, 4]);
  assert.equal(o.extra, 120);
  assert.equal(o.only, null);
  assert.equal(o.tutorial, false);
  assert.equal(o.log, false);
  assert.equal(o.json, null);
  assert.equal(o.compare, null);
  assert.equal(o.workers, Math.max(1, availableParallelism() - 1));
  assert.ok(o.workers >= 1);
});

test('survey: opcje podane', () => {
  const o = parseArgs(['--level', 'low', '--seeds', '1,2,3', '--only', '^tczew:', '--extra', '30', '--tutorial',
    '--workers', '2', '--json', 'a.json', '--compare', 'b.json', '--log']);
  assert.deepEqual(o.levels, ['low']);
  assert.deepEqual(o.seeds, [1, 2, 3]);
  assert.equal(o.only, '^tczew:');
  assert.equal(o.extra, 30);
  assert.equal(o.tutorial, true);
  assert.equal(o.workers, 2);
  assert.equal(o.json, 'a.json');
  assert.equal(o.compare, 'b.json');
  assert.equal(o.log, true);
  assert.deepEqual(parseArgs(['--level', 'all']).levels, ['high', 'low']);
  assert.deepEqual(parseArgs(['--level=none']).levels, ['none']);
  assert.deepEqual(parseArgs(['--seeds', '1-4']).seeds, [1, 2, 3, 4]);
  assert.deepEqual(parseArgs(['--seeds=2-3,7']).seeds, [2, 3, 7]);
});

test('survey: błędne opcje są odrzucane', () => {
  assert.throws(() => parseArgs(['--level', 'extreme']), /poziom/);
  assert.throws(() => parseArgs(['--seeds', 'a-b']), /ziarna/i);
  assert.throws(() => parseArgs(['--seeds', '4-1']), /zakres/);
  assert.throws(() => parseArgs(['--seeds', '0-2']), /od 1/, 'ziarno 0 = ziarno 1 w generatorze');
  assert.throws(() => parseArgs(['--workers', '0']), /wątków/);
  assert.throws(() => parseArgs(['--extra', '-5']), /--extra/);
  assert.throws(() => parseArgs(['--only', '(']), /--only/);
  assert.throws(() => parseArgs(['--json']), /wymaga wartości/);
  assert.throws(() => parseArgs(['--nieznana']), /Nieznana opcja/);
});

test('survey: lista zmian – stała kolejność, filtr --only, samouczki tylko na życzenie', () => {
  const jobs = listShifts({ levels: ['high', 'low'], seeds: [2, 1], only: '^szkolna:zmiana-e$', extra: 5 });
  assert.deepEqual(jobs.map((j) => `${j.stationId}:${j.scenarioId}:${j.level}:${j.seed}`),
    ['szkolna:zmiana-e:high:2', 'szkolna:zmiana-e:high:1', 'szkolna:zmiana-e:low:2', 'szkolna:zmiana-e:low:1']);
  assert.ok(jobs.every((j) => j.extra === 5));
  const plain = listShifts({ levels: ['none'], seeds: [1], only: '^szkolna:' });
  const withTut = listShifts({ levels: ['none'], seeds: [1], only: '^szkolna:', tutorial: true });
  assert.ok(!plain.some((j) => j.scenarioId === 'nauka-1'), 'samouczek domyślnie pominięty');
  assert.ok(withTut.some((j) => j.scenarioId === 'nauka-1'), 'samouczek z --tutorial');
  assert.equal(withTut.length, plain.length + 1);
});

test('survey: scenariusz z własnym poziomem zakłóceń – raz na ziarno, na swoim poziomie', () => {
  const keys = (o) => listShifts(o).map((j) => `${j.stationId}:${j.scenarioId}:${j.level}:${j.seed}`);
  assert.deepEqual(keys({ levels: ['high', 'low'], seeds: [1], only: '^gdynia-orlowo:' }),
    ['gdynia-orlowo:zmiana:high:1', 'gdynia-orlowo:zmiana:low:1', 'gdynia-orlowo:usterka-202:none:1', 'gdynia-orlowo:szczyt:high:1']);
  assert.deepEqual(keys({ levels: ['low'], seeds: [1, 2], only: '^gdynia-orlowo:szczyt$' }),
    ['gdynia-orlowo:szczyt:high:1', 'gdynia-orlowo:szczyt:high:2']);
  // wszystkie stacje: każda zmiana raz, a poziom zmiany to poziom, na którym symulacja naprawdę jedzie
  const jobs = listShifts({ levels: ['high', 'low', 'none'], seeds: [1, 2], tutorial: true });
  assert.equal(new Set(jobs.map((j) => `${j.stationId}:${j.scenarioId}:${j.level}:${j.seed}`)).size, jobs.length);
  for (const j of jobs) {
    const sc = STATIONS.find((s) => s.id === j.stationId).scenarios.find((c) => c.id === j.scenarioId);
    if (sc.disruptions) assert.equal(j.level, sc.disruptions, `${j.stationId}:${j.scenarioId}`);
  }
});

test('survey: jedna zmiana (Szkolna, zmiana-e, bez zakłóceń) – wszystkie pociągi dojechały, bez naruszeń', () => {
  const r = surveyShift({ stationId: 'szkolna', scenarioId: 'zmiana-e', seed: 1, level: 'none', extra: 10 });
  assert.equal(r.station, 'szkolna');
  assert.equal(r.scenario, 'zmiana-e');
  assert.equal(r.seed, 1);
  assert.equal(r.level, 'none');
  assert.equal(r.effectiveLevel, 'none');
  assert.ok(r.trains > 0);
  assert.deepEqual(r.stuck, []);
  assert.deepEqual(r.violations, { count: 0, ticks: 0, first: [] });
  assert.deepEqual(r.events, []);
  assert.equal(typeof r.counters.dPz, 'number');
  assert.equal(typeof r.counters.Sz, 'number');
  assert.equal(typeof r.score, 'number');
  assert.match(r.fingerprint, /^[0-9a-f]{16}$/);
  assert.equal(r.log, undefined, 'dziennik tylko z log i tylko dla zmiany z problemem');
  assert.equal(isProblem(r), false);
  assert.equal(shiftKey(r), 'szkolna:zmiana-e:none:1');
  // wynik przechodzi między wątkami i do JSON bez strat
  assert.deepEqual(structuredClone(r), r);
  assert.deepEqual(JSON.parse(JSON.stringify(r)), r);
});

const noMs = ({ ms, ...r }) => r;

test('survey: to samo ziarno – ten sam przebieg zmiany (także na szlakach Eap, gdzie blokada losuje przez Math.random)', () => {
  // Szkolna: szlaki Eap dwukierunkowe – odpowiedzi sąsiada i potwierdzenia przyjazdu z Math.random (src/model/Block.js)
  const job = { stationId: 'szkolna', scenarioId: 'zmiana', seed: 1, level: 'high', extra: 10 };
  const random = Math.random;
  const a = surveyShift(job);
  assert.equal(Math.random, random, 'Math.random przywrócone po zmianie');
  const b = surveyShift(job);
  assert.deepEqual(noMs(b), noMs(a));
  assert.notEqual(surveyShift({ ...job, seed: 2 }).fingerprint, a.fingerprint, 'inne ziarno – inny przebieg');
});

test('survey: wyniki z wątków takie same jak z jednego wątku, w kolejności listy', async () => {
  const jobs = [
    { stationId: 'szkolna', scenarioId: 'zmiana', seed: 2, level: 'high', extra: 10 },
    { stationId: 'szkolna', scenarioId: 'zmiana-e', seed: 1, level: 'low', extra: 10 },
    { stationId: 'szkolna', scenarioId: 'zmiana', seed: 1, level: 'high', extra: 10 },
  ];
  const threads = await runAll(jobs, 2);
  const single = jobs.map((j) => surveyShift(j));
  assert.deepEqual(threads.map(noMs), single.map(noMs));
});

test('survey: wiersz poleceń – kod wyjścia, zapis --json i porównanie --compare', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sprk-survey-'));
  const out = [];
  const { log, error } = console;
  console.log = (...a) => out.push(a.join(' '));
  console.error = (...a) => out.push(a.join(' '));
  try {
    const file = join(dir, 'wyniki.json');
    const args = ['--only', '^szkolna:zmiana-e$', '--seeds', '1', '--level', 'none', '--extra', '0', '--workers', '1'];
    assert.equal(await main([...args, '--json', file]), 0, out.join('\n'));
    const saved = JSON.parse(readFileSync(file, 'utf8'));
    assert.deepEqual(saved.options, { levels: ['none'], seeds: [1], only: '^szkolna:zmiana-e$', extra: 0, tutorial: false });
    assert.deepEqual(saved.results.map(shiftKey), ['szkolna:zmiana-e:none:1']);
    assert.ok(out.includes('RAZEM: 1 zmian, 0 pociągów w zatorze, 0 naruszeń bezpieczeństwa'), out.join('\n'));
    out.length = 0;
    assert.equal(await main([...args, '--compare', file]), 0);
    assert.ok(out.includes('  bez zmian we wskaźnikach'), out.join('\n'));
    assert.ok(out.includes('  razem: gorzej 0, lepiej 0, nowe zatory 0, inny przebieg 0'), out.join('\n'));
    assert.equal(await main(['--level', 'x']), 2);
    assert.equal(await main(['--compare', join(dir, 'nie-ma.json')]), 2);
    assert.equal(await main(['--only', '^nie-ma-takiej-stacji:']), 2);
  } finally {
    console.log = log; console.error = error;
    rmSync(dir, { recursive: true, force: true });
  }
});

test('survey: nieznana stacja lub scenariusz – błąd', () => {
  assert.throws(() => surveyShift({ stationId: 'nie-ma', scenarioId: 'zmiana', seed: 1 }), /stacja/);
  assert.throws(() => surveyShift({ stationId: 'szkolna', scenarioId: 'nie-ma', seed: 1 }), /scenariusz/);
});

const shift = (scenario, seed, { stuck = [], violations = 0, events = 0, level = 'high' } = {}) => ({
  station: 'tczew', scenario, seed, level,
  stuck: stuck.map((nr) => ({ nr, status: 'stoi przed E1' })),
  violations: { count: violations, ticks: violations * 4, first: [] },
  events: Array.from({ length: events }, () => ({ code: 'spad', time: '07:00:00', msg: 'spad' })),
  counters: { dPz: 0, Sz: 0 }, score: 0,
});

test('survey: porównanie – gorzej, lepiej, nowe zatory, zmiany tylko po jednej stronie', () => {
  const before = [
    shift('zmiana', 1),
    shift('zmiana', 2, { stuck: [44611] }),
    shift('zmiana', 3, { violations: 2 }),
    shift('zmiana', 4, { stuck: [1] }),
    shift('zmiana', 5),
    shift('szczyt', 1),
  ];
  const after = [
    shift('zmiana', 1, { stuck: [5305] }),       // nowy zator
    shift('zmiana', 2),                          // zator zniknął
    shift('zmiana', 3, { violations: 1, events: 1 }), // mniej naruszeń, ale spad – gorzej
    shift('zmiana', 4, { stuck: [2] }),          // tyle samo, ale inny pociąg
    shift('zmiana', 5),                          // bez zmian
    shift('szczyt', 1, { level: 'low' }),        // inny poziom – inny klucz
  ];
  const c = compareResults(before, { results: after });
  assert.deepEqual(c.worse.map((w) => w.key), ['tczew:zmiana:high:1', 'tczew:zmiana:high:3']);
  assert.deepEqual(c.worse[0].old, { stuck: 0, violations: 0, events: 0, error: 0 });
  assert.deepEqual(c.worse[0].now, { stuck: 1, violations: 0, events: 0, error: 0 });
  assert.deepEqual(c.better.map((b) => b.key), ['tczew:zmiana:high:2']);
  assert.deepEqual(c.newJams, [
    { key: 'tczew:zmiana:high:1', nr: 5305, status: 'stoi przed E1' },
    { key: 'tczew:zmiana:high:4', nr: 2, status: 'stoi przed E1' },
  ]);
  assert.deepEqual(c.onlyNew, ['tczew:szczyt:low:1']);
  assert.deepEqual(c.onlyOld, ['tczew:szczyt:high:1']);
  // ten sam przegląd – bez różnic
  const same = compareResults(before, before);
  assert.deepEqual([same.worse, same.better, same.newJams, same.onlyOld, same.onlyNew, same.changed], [[], [], [], [], [], []]);
  assert.deepEqual(c.changed, []);
  // te same wskaźniki, inny przebieg (fingerprint) – „changed”, ani gorzej, ani lepiej
  const fp = (f) => ({ ...shift('zmiana', 1), fingerprint: f });
  const moved = compareResults([fp('aaaa')], [fp('bbbb')]);
  assert.deepEqual([moved.worse, moved.better, moved.changed], [[], [], ['tczew:zmiana:high:1']]);
  assert.deepEqual(compareResults([shift('zmiana', 1)], [fp('bbbb')]).changed, [], 'stary plik bez fingerprint – bez porównania');
  // błąd przebiegu zmiany liczy się jako pogorszenie
  const err = compareResults([shift('zmiana', 1)], [{ ...shift('zmiana', 1), error: 'TypeError: x' }]);
  assert.deepEqual(err.worse.map((w) => w.key), ['tczew:zmiana:high:1']);
});
