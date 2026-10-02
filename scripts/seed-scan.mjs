#!/usr/bin/env node
/**
 * Szukanie testów przypadkowych: testy, które tworzą zmianę bez `seed`, dostają przy każdym uruchomieniu inne ziarno
 * (maszynista hamuje inaczej, inne miejsce zatrzymania, inny tabor) i mogą paść raz na sto razy – zwykle w CI.
 * Skrypt uruchamia pliki testów pod wieloma zestawami ziaren powtarzalnie (`scripts/random-seed.mjs`: `SPRK_RAND=<n>`)
 * i wypisuje testy, które przy którymś zestawie nie przeszły, z poleceniem do odtworzenia.
 *
 * Równolegle: każda para (plik, zestaw) to osobne zadanie w puli procesów (rdzenie − 1) – żaden rdzeń nie czeka, aż
 * skończy się najdłuższy plik zestawu. Pierwszy zestaw idzie po wszystkich plikach i ustala, które pliki w ogóle
 * losują ziarno; kolejne zestawy – tylko po nich.
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { defaultWorkers } from './lib/workers.mjs';
import { executedDirectly } from './lib/cli.mjs';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PRELOAD = join(ROOT, 'scripts', 'random-seed.mjs');

export const HELP = `Użycie: node scripts/seed-scan.mjs [opcje]

  --runs <n>      liczba zestawów ziaren (domyślnie 30)
  --from <n>      numer pierwszego zestawu (domyślnie 1) – do odtworzenia pojedynczego zestawu: --from 139 --runs 1
  --only <regex>  tylko pliki testów pasujące do wzorca (np. rumia)
  --workers <n>   liczba procesów naraz (domyślnie liczba rdzeni − 1)
  --help          ta pomoc

Test, który padł przy zestawie n, odtwarza polecenie:
  SPRK_RAND=<n> node --import ./scripts/random-seed.mjs --test tests/<plik>.test.js
Poprawka: ziarno wpisane w teście (\`seed\`) albo zapas wynikający z modelu – nie luźniejsza asercja „na oko”.`;

/** Opcje z wiersza poleceń (`argv` bez `node` i nazwy skryptu); przy błędzie wyjątek z komunikatem. */
export function parseArgs(argv) {
  const opts = { runs: 30, from: 1, only: null, workers: defaultWorkers(), help: false };
  const int = (name, v, min) => { const n = Number(v); if (!Number.isInteger(n) || n < min) throw new Error(`${name}: liczba całkowita od ${min}, jest „${v}”`); return n; };
  for (let i = 0; i < argv.length; i++) {
    const [name, eq] = argv[i].split(/=(.*)/s);
    const value = () => { const v = eq ?? argv[++i]; if (v == null) throw new Error(`${name}: brak wartości`); return v; };
    if (name === '--help' || name === '-h') opts.help = true;
    else if (name === '--runs') opts.runs = int(name, value(), 1);
    else if (name === '--from') opts.from = int(name, value(), 1);
    else if (name === '--workers') opts.workers = int(name, value(), 1);
    else if (name === '--only') opts.only = new RegExp(value());
    else throw new Error(`Nieznana opcja: ${argv[i]}`);
  }
  return opts;
}

/** Nazwy testów, które nie przeszły, z wyjścia reportera `spec` (wiersze „✖ nazwa (czas)”, bez powtórzeń). */
export function failedTests(output) {
  const names = new Set();
  for (const line of String(output).split('\n')) {
    const m = /^✖ (.*?)(?: \([\d.]+ms\))?$/.exec(line.trim());
    if (m && m[1] !== 'failing tests:') names.add(m[1]);
  }
  return [...names];
}

/** Pliki testów Node (`tests/*.test.js`), ścieżki względem katalogu projektu. */
export function testFiles(only = null) {
  return readdirSync(join(ROOT, 'tests')).filter((f) => f.endsWith('.test.js')).map((f) => `tests/${f}`).filter((f) => !only || only.test(f)).sort();
}

/** Jeden plik testów pod zestawem ziaren `set`: `{ file, set, ok, failed, ms }`. */
function runFile(file, set, log = null) {
  return new Promise((done) => {
    const t0 = performance.now();
    const child = spawn(process.execPath, ['--import', PRELOAD, '--test-reporter=spec', join(ROOT, file)], {
      cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, SPRK_RAND: String(set), SPRK_RAND_LOG: log ?? '', FORCE_COLOR: '0', NO_COLOR: '1' },
    });
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { out += d; });
    child.on('close', (code) => {
      const failed = failedTests(out);
      done({ file, set, ok: code === 0, failed: code === 0 ? [] : failed.length ? failed : ['(plik testów zakończony błędem)'], ms: performance.now() - t0 });
    });
  });
}

/** Zadania w puli `workers` procesów naraz; wyniki w kolejności zadań. */
async function pool(jobs, workers, run, onDone = null) {
  const results = new Array(jobs.length);
  let next = 0;
  const worker = async () => {
    while (next < jobs.length) { const i = next++; results[i] = await run(jobs[i]); onDone?.(results[i]); }
  };
  await Promise.all(Array.from({ length: Math.min(workers, jobs.length) }, worker));
  return results;
}

export async function main(argv = process.argv.slice(2)) {
  let opts;
  try { opts = parseArgs(argv); } catch (e) { console.error(`${e.message}\n\n${HELP}`); return 2; }
  if (opts.help) { console.log(HELP); return 0; }
  const files = testFiles(opts.only);
  if (!files.length) { console.error('Żaden plik testów nie pasuje do wzorca'); return 2; }
  const t0 = performance.now();
  const dir = mkdtempSync(join(tmpdir(), 'sprk-seed-'));
  const log = join(dir, 'random.log');
  const failures = new Map(); // „plik › test” → zestawy
  const note = (r) => { for (const name of r.failed) { const k = `${r.file} › ${name}`; failures.set(k, [...(failures.get(k) ?? []), r.set]); } };
  const tty = process.stdout.isTTY;
  let done = 0, total = files.length;
  const progress = (r) => { note(r); done++; if (tty) process.stdout.write(`\r  ${done} / ${total} uruchomień, przypadki: ${failures.size}   `); };

  // zestaw pierwszy: wszystkie pliki; przy okazji – które losują ziarno (tylko te idą dalej)
  console.log(`Zestaw ${opts.from}: ${files.length} plików testów (procesy naraz: ${opts.workers})`);
  const first = await pool(files, opts.workers, (f) => runFile(f, opts.from, log), progress);
  const used = new Set(existsSync(log) ? readFileSync(log, 'utf8').split('\n').filter(Boolean).map((p) => relative(ROOT, p)) : []);
  rmSync(dir, { recursive: true, force: true });
  const random = first.filter((r) => used.has(r.file)).sort((a, b) => b.ms - a.ms).map((r) => r.file); // najdłuższe najpierw
  if (tty) process.stdout.write('\n');
  console.log(`Ziarno losuje ${random.length} z ${files.length} plików${opts.runs > 1 ? `; kolejne zestawy: ${opts.from + 1}–${opts.from + opts.runs - 1}` : ''}`);

  const jobs = [];
  for (let set = opts.from + 1; set < opts.from + opts.runs; set++) for (const file of random) jobs.push({ file, set });
  done = 0; total = jobs.length;
  if (jobs.length) await pool(jobs, opts.workers, (j) => runFile(j.file, j.set), progress);
  if (tty && jobs.length) process.stdout.write('\n');

  const sec = ((performance.now() - t0) / 1000).toFixed(1);
  if (!failures.size) { console.log(`\nBez przypadków: ${opts.runs} zestawów ziaren, ${files.length + jobs.length} uruchomień plików. Czas: ${sec} s`); return 0; }
  console.log(`\nTesty przypadkowe (${failures.size}) – nie przeszły przy podanych zestawach ziaren:`);
  for (const [name, sets] of [...failures].sort((a, b) => b[1].length - a[1].length)) {
    const [file] = name.split(' › ');
    console.log(`  ${name}\n    zestawy: ${sets.sort((a, b) => a - b).join(', ')} (${sets.length} z ${opts.runs})\n    odtworzenie: SPRK_RAND=${sets[0]} node --import ./scripts/random-seed.mjs --test ${file}`);
  }
  console.log(`Czas: ${sec} s`);
  return 1;
}

if (executedDirectly(import.meta.url)) process.exitCode = await main();
