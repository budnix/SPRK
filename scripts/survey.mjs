#!/usr/bin/env node
/**
 * Przegląd zmian z automatem – narzędzie do wychwytywania regresji silnika.
 *
 * Każda stacja × scenariusz × poziom zakłóceń (scenariusz z własnym poziomem – tylko ten) × ziarno losowania: pełna
 * zmiana prowadzona przez dyżurnego
 * automatycznego (`AutoOperator`, cała stacja, rola 'full') do końca zmiany (`endTime`) plus `--extra` minut, żeby
 * odróżnić zator od zwykłego opóźnienia. Dla każdej zmiany: pociągi, które nie dojechały („zator”), naruszenia
 * niezmienników bezpieczeństwa (`tests/invariants.js`, sprawdzane w każdym takcie), zdarzenia spad / rozprucie,
 * liczniki dPz i Sz, wynik końcowy.
 *
 *   npm run survey                              # poziomy high i low, ziarna 1–4
 *   npm run survey -- --only '^tczew:' --seeds 4 --level low --log
 *   npm run survey -- --json wyniki.json        # zapis wyników …
 *   npm run survey -- --compare wyniki.json     # … i porównanie po zmianie w silniku
 *
 * Kod wyjścia: 1, gdy którakolwiek zmiana ma zator, naruszenie bezpieczeństwa, spad, rozprucie albo błąd (także awaria
 * wątku); 0 – czysto; 2 – błędne opcje, nieczytelny plik --compare, pusta lista zmian.
 *
 * Funkcje `parseArgs`, `listShifts`, `surveyShift`, `compareResults` są czyste (bez wątków i wyjścia) – testuje je
 * `tests/survey.test.js`. Zmiany idą równolegle w wątkach `worker_threads` (ten sam plik uruchomiony jako wątek);
 * wynik zmiany nie zależy od liczby wątków ani od tego, co wątek liczył wcześniej (`fingerprint` to sprawdza).
 */
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { availableParallelism } from 'node:os';
import { readFileSync, writeFileSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { createHash } from 'node:crypto';
import { Simulation } from '../src/model/Simulation.js';
import { AutoOperator } from '../src/model/Operator.js';
import { Clock } from '../src/core/Clock.js';
import { STATIONS } from '../src/stations/index.js';
import { violations } from '../tests/invariants.js';

const WORKER_ROLE = 'sprk-survey-worker';
const LEVELS = ['high', 'low', 'none'];
/** Ile pierwszych naruszeń (z czasem) zapisać dla zmiany. */
const FIRST_VIOLATIONS = 3;
/** Zdarzenia oceny, które nigdy nie powinny wystąpić przy automacie. */
const BAD_EVENTS = new Set(['spad', 'rozprucie']);

export const USAGE = `Użycie: node scripts/survey.mjs [opcje]

  --level high|low|none|all   poziom zakłóceń (domyślnie all = high i low); scenariusz z własnym poziomem
                              (np. szczyt = high) idzie raz na ziarno, na swoim poziomie
  --seeds 1-4 | 1,2,3         ziarna losowania (domyślnie 1-4)
  --only <regex>              tylko zmiany, których „stacja:scenariusz” pasuje do wzorca
  --extra <min>               czas po końcu zmiany (domyślnie 120 min)
  --tutorial                  także scenariusze samouczka (domyślnie pomijane)
  --workers <n>               liczba wątków (domyślnie liczba rdzeni - 1, co najmniej 1)
  --json <plik>               zapis wyników do pliku JSON
  --compare <plik>            porównanie z zapisanymi wynikami (gorzej / lepiej / nowe zatory / inny przebieg)
  --log                       dziennik zmian z problemem
  --help                      ta pomoc`;

/** Pociąg obsłużony do końca: dojechał do sąsiada, zakończył bieg albo skład przekazano (manewry, odstawienie). */
export function trainDone(e) {
  return e.status === 'na następnym posterunku' || e.status === 'zakończył bieg' || String(e.status).startsWith('przekazany');
}

function defaultWorkers() {
  return Math.max(1, availableParallelism() - 1);
}

function parseSeeds(text) {
  const out = [];
  for (const part of String(text).split(',')) {
    const p = part.trim();
    const m = /^(\d+)(?:-(\d+))?$/.exec(p);
    if (!m) throw new Error(`Niepoprawne ziarna: „${text}” (przykłady: 1-4, 1,2,3)`);
    const a = Number(m[1]);
    const b = m[2] != null ? Number(m[2]) : a;
    if (b < a) throw new Error(`Niepoprawny zakres ziaren: „${p}”`);
    // `Random` zamienia ziarno 0 na 1 – ziarno 0 powtórzyłoby zmianę z ziarnem 1
    if (a < 1) throw new Error(`Niepoprawne ziarna: „${p}” (ziarna od 1)`);
    for (let s = a; s <= b; s++) if (!out.includes(s)) out.push(s);
  }
  return out;
}

/**
 * Opcje wiersza poleceń (`argv` bez `node` i nazwy skryptu). Przyjmuje `--opcja wartość` i `--opcja=wartość`.
 * Zwraca `{ levels, seeds, only, extra, tutorial, workers, json, compare, log, help }`; przy błędzie rzuca wyjątek.
 */
export function parseArgs(argv = []) {
  const opts = {
    levels: ['high', 'low'], seeds: [1, 2, 3, 4], only: null, extra: 120, tutorial: false,
    workers: defaultWorkers(), json: null, compare: null, log: false, help: false,
  };
  const args = [...argv];
  while (args.length) {
    const raw = args.shift();
    const eq = raw.startsWith('--') ? raw.indexOf('=') : -1;
    const name = eq > 0 ? raw.slice(0, eq) : raw;
    const value = () => {
      if (eq > 0) return raw.slice(eq + 1);
      if (!args.length || args[0].startsWith('--')) throw new Error(`Opcja ${name} wymaga wartości`);
      return args.shift();
    };
    const flag = () => { if (eq > 0) throw new Error(`Opcja ${name} nie przyjmuje wartości`); return true; };
    switch (name) {
      case '--level': {
        const v = value();
        if (v === 'all') opts.levels = ['high', 'low'];
        else if (LEVELS.includes(v)) opts.levels = [v];
        else throw new Error(`Nieznany poziom zakłóceń: „${v}” (high, low, none, all)`);
        break;
      }
      case '--seeds': opts.seeds = parseSeeds(value()); break;
      case '--only': {
        const v = value();
        try { new RegExp(v); } catch (e) { throw new Error(`Niepoprawne wyrażenie --only: ${e.message}`); }
        opts.only = v;
        break;
      }
      case '--extra': {
        const v = value();
        const n = Number(v);
        if (v.trim() === '' || !Number.isFinite(n) || n < 0) throw new Error(`Niepoprawna wartość --extra: „${v}” (minuty, ≥ 0)`);
        opts.extra = n;
        break;
      }
      case '--workers': {
        const v = value();
        const n = Number(v);
        if (!Number.isInteger(n) || n < 1) throw new Error(`Niepoprawna liczba wątków: „${v}” (liczba całkowita ≥ 1)`);
        opts.workers = n;
        break;
      }
      case '--json': opts.json = value(); break;
      case '--compare': opts.compare = value(); break;
      case '--tutorial': opts.tutorial = flag(); break;
      case '--log': opts.log = flag(); break;
      case '--help': case '-h': opts.help = true; break;
      default: throw new Error(`Nieznana opcja: ${raw}`);
    }
  }
  return opts;
}

/**
 * Lista zmian do przeglądu w stałej kolejności: stacja (jak w `STATIONS`), scenariusz (jak w definicji stacji),
 * poziom (jak w `levels`), ziarno (jak w `seeds`). Scenariusze samouczka tylko z `tutorial`.
 * Scenariusz z własnym poziomem zakłóceń (`disruptions`, np. „szczyt” = high, „usterka-*” = none) idzie raz na ziarno,
 * na swoim poziomie, niezależnie od `levels` – symulacja i tak pomija poziom zamówiony, więc drugi przebieg byłby
 * kopią pierwszego (liczoną podwójnie w podsumowaniu) pod cudzą etykietą.
 */
export function listShifts({ levels = ['high', 'low'], seeds = [1, 2, 3, 4], only = null, extra = 120, tutorial = false, log = false } = {}) {
  const re = only ? new RegExp(only) : null;
  const jobs = [];
  STATIONS.forEach((st, stationIndex) => {
    for (const sc of st.scenarios || []) {
      if (sc.tutorial && !tutorial) continue;
      if (re && !re.test(`${st.id}:${sc.id}`)) continue;
      for (const level of sc.disruptions ? [sc.disruptions] : levels) for (const seed of seeds) {
        jobs.push({ stationId: st.id, scenarioId: sc.id, seed, level, extra, log, stationIndex });
      }
    }
  });
  return jobs;
}

/**
 * Jedna zmiana z automatem. Pętla jak w grze na przyspieszeniu: krok 0,5 s, automat co 2 s, niezmienniki po każdym
 * kroku. Koniec: `endTime` scenariusza (bez niego 10:00) + `extra` minut.
 *
 * Wynik (zwykły obiekt – przechodzi między wątkami i do JSON):
 *  - `stuck` – pociągi, które nie dojechały: `[{ nr, status }]`,
 *  - `violations` – `{ count, ticks, first }`: `count` – ile razy naruszenie się pojawiło (napis nieobecny w poprzednim
 *    takcie; naruszenie trwające wiele taktów liczy się raz), `ticks` – suma naruszeń po wszystkich taktach,
 *    `first` – pierwsze trzy pojawienia się `{ time, msg }`,
 *  - `events` – zdarzenia oceny spad / rozprucie `{ code, time, msg }`,
 *  - `counters` – `{ dPz, Sz }`, `score` – punkty na końcu przebiegu, `endReason` – jak skończyła się zmiana,
 *  - `level` – poziom zamówiony, `effectiveLevel` – użyty (scenariusz może go narzucić, np. „szczyt” = high),
 *  - `fingerprint` – skrót przebiegu zmiany (czasy i stany pociągów, pozycje oceny): ten sam przy tym samym ziarnie,
 *    niezależnie od wątku; inny przy tych samych wskaźnikach znaczy, że zmiana w silniku zmieniła ruch,
 *  - `log` – dziennik (tylko z `log` i tylko dla zmiany z problemem).
 */
export function surveyShift({ stationId, scenarioId, seed, level = 'none', extra = 120, log = false }) {
  const station = STATIONS.find((s) => s.id === stationId);
  if (!station) throw new Error(`Nieznana stacja: ${stationId}`);
  const scenario = (station.scenarios || []).find((s) => s.id === scenarioId);
  if (!scenario) throw new Error(`Nieznany scenariusz: ${stationId}:${scenarioId}`);
  const t0 = performance.now();
  // speed 1: jeden krok 0,5 s = jeden takt silnika, więc niezmienniki są sprawdzane po każdym takcie;
  // district 'both': na stacji z okręgami automat przeglądu prowadzi całą stację, bez wbudowanych automatów okręgów
  const sim = new Simulation(station, { scenario: scenario.id, disruptions: level, seed, speed: 1, district: 'both' });
  const op = new AutoOperator(sim, { district: null, role: 'full' });
  const lines = [];
  if (log) sim.bus.on('log', (m) => lines.push({ time: m.time, level: m.level, msg: m.msg }));
  const end = Clock.parse(scenario.endTime || '10:00') + extra * 60;
  const viol = { count: 0, ticks: 0, first: [] };
  let prev = new Set();
  let n = 0;
  while (sim.clock.time < end) {
    sim.step(0.5);
    if (n++ % 4 === 0) op.tick();
    const v = violations(sim);
    viol.ticks += v.length;
    const now = new Set(v);
    for (const msg of now) {
      if (prev.has(msg)) continue;
      viol.count++;
      const time = Clock.format(sim.clock.time, true);
      if (viol.first.length < FIRST_VIOLATIONS) viol.first.push({ time, msg });
      if (log) lines.push({ time: sim.clock.time, level: 'NARUSZENIE', msg });
    }
    prev = now;
  }
  const tt = sim.traffic.timetable();
  const stuck = tt.filter((e) => !trainDone(e)).map((e) => ({ nr: e.nr, status: String(e.status) }));
  const events = sim.score.items.filter((i) => BAD_EVENTS.has(i.code)).map((i) => ({ code: i.code, time: Clock.format(i.time, true), msg: i.msg }));
  const trace = createHash('sha1');
  for (const e of tt) trace.update(`${e.nr}|${e.actualArr ?? ''}|${e.actualDep ?? ''}|${e.status}\n`);
  for (const i of sim.score.items) trace.update(`${i.time}|${i.code}|${i.points}\n`);
  const result = {
    station: station.id,
    scenario: scenario.id,
    seed,
    level,
    effectiveLevel: sim.levelId,
    trains: tt.length,
    stuck,
    violations: viol,
    events,
    counters: { dPz: sim.ilk.counters.dPz, Sz: sim.ilk.counters.Sz },
    score: sim.score.total,
    endReason: sim.endReason,
    fingerprint: trace.digest('hex').slice(0, 16),
    ms: Math.round(performance.now() - t0),
  };
  if (log && isProblem(result)) result.log = compactLog(lines);
  return result;
}

/** Dziennik do wydruku: powtórki odmów i ostrzeżeń o przebiegach (ten sam tekst) pominięte. */
function compactLog(lines) {
  const seen = new Set();
  const out = [];
  for (const l of lines) {
    const key = `${l.level} ${l.msg}`;
    if (seen.has(key) && /^warn Przebieg|odmow/.test(key)) continue;
    seen.add(key);
    out.push(`${Clock.format(l.time, true)} ${l.level} ${l.msg}`);
  }
  return out;
}

/** Zmiana z problemem: zator, naruszenie, spad / rozprucie albo błąd przebiegu. */
export function isProblem(r) {
  return !!(r.error || r.stuck?.length || r.violations?.count || r.events?.length);
}

/** Klucz zmiany w porównaniach: „stacja:scenariusz:poziom:ziarno”. */
export function shiftKey(r) {
  return `${r.station}:${r.scenario}:${r.level}:${r.seed}`;
}

function metrics(r) {
  return {
    stuck: r.stuck?.length ?? 0,
    violations: r.violations?.count ?? 0,
    events: r.events?.length ?? 0,
    error: r.error ? 1 : 0,
  };
}

function resultsOf(data) {
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.results)) return data.results;
  throw new Error('Plik wyników nie zawiera listy zmian');
}

/**
 * Porównanie dwóch przeglądów (listy wyników albo obiekty `{ results }` z `--json`). Zmiany łączone po `shiftKey`.
 *  - `worse` – wzrósł którykolwiek wskaźnik (zator, naruszenia, spad/rozprucie, błąd),
 *  - `better` – żaden nie wzrósł, a któryś zmalał,
 *  - `newJams` – pociągi w zatorze teraz, a nie w starym przeglądzie tej samej zmiany `{ key, nr, status }`,
 *  - `onlyOld` / `onlyNew` – klucze zmian obecnych tylko po jednej stronie (np. inny zestaw ziaren),
 *  - `changed` – klucze zmian z tymi samymi wskaźnikami, ale innym przebiegiem (`fingerprint`): zmiana w silniku
 *    zmieniła ruch, choć nie pogorszyła wyniku; pusta lista = zmiana w silniku bez wpływu na ruch.
 * `worse` / `better`: `{ key, old, now }` (wskaźniki).
 */
export function compareResults(oldList, newList) {
  const oldR = resultsOf(oldList);
  const newR = resultsOf(newList);
  const before = new Map(oldR.map((r) => [shiftKey(r), r]));
  const after = new Map(newR.map((r) => [shiftKey(r), r]));
  const out = { worse: [], better: [], newJams: [], onlyOld: [], onlyNew: [], changed: [] };
  for (const [key, r] of after) {
    const o = before.get(key);
    if (!o) { out.onlyNew.push(key); continue; }
    const a = metrics(o), b = metrics(r);
    const names = Object.keys(a);
    if (names.some((k) => b[k] > a[k])) out.worse.push({ key, old: a, now: b });
    else if (names.some((k) => b[k] < a[k])) out.better.push({ key, old: a, now: b });
    else if (o.fingerprint && r.fingerprint && o.fingerprint !== r.fingerprint) out.changed.push(key);
    const was = new Set((o.stuck || []).map((s) => String(s.nr)));
    for (const s of r.stuck || []) if (!was.has(String(s.nr))) out.newJams.push({ key, nr: s.nr, status: s.status });
  }
  for (const key of before.keys()) if (!after.has(key)) out.onlyOld.push(key);
  return out;
}

// ————————————————————————————————————— wiersz poleceń —————————————————————————————————————

function levelLabel(r) {
  return r.effectiveLevel && r.effectiveLevel !== r.level ? `${r.level} (scenariusz: ${r.effectiveLevel})` : r.level;
}

/** Wiersz zmiany z problemem. */
export function formatProblem(r) {
  const head = `${r.station}:${r.scenario} poziom ${levelLabel(r)} seed ${r.seed}`;
  if (r.error) return `${head}  BŁĄD: ${String(r.error).split('\n')[0]}`;
  const parts = [head];
  if (r.stuck.length) parts.push(`zator ${r.stuck.length} [${r.stuck.slice(0, 7).map((s) => `${s.nr}: ${s.status}`).join(' | ')}${r.stuck.length > 7 ? ' | …' : ''}]`);
  if (r.violations.count) parts.push(`naruszenia ${r.violations.count} [${r.violations.first.map((v) => `${v.time} ${v.msg}`).join(' | ')}${r.violations.count > r.violations.first.length ? ' | …' : ''}]`);
  for (const code of BAD_EVENTS) {
    const ev = r.events.filter((e) => e.code === code);
    if (ev.length) parts.push(`${code} ${ev.length} [${ev.slice(0, 3).map((e) => `${e.time} ${e.msg}`).join(' | ')}]`);
  }
  parts.push(`(dPz ${r.counters.dPz}, Sz ${r.counters.Sz}, wynik ${r.score})`);
  return parts.join('  ');
}

function summarize(results) {
  const s = { shifts: results.length, stuck: 0, violations: 0, events: 0, errors: 0 };
  for (const r of results) {
    const m = metrics(r);
    s.stuck += m.stuck; s.violations += m.violations; s.events += m.events; s.errors += m.error;
  }
  return s;
}

function summaryText(s) {
  let t = `${s.shifts} zmian, ${s.stuck} pociągów w zatorze, ${s.violations} naruszeń bezpieczeństwa`;
  if (s.events) t += `, ${s.events} zdarzeń spad/rozprucie`;
  if (s.errors) t += `, ${s.errors} błędów`;
  return t;
}

/** Równoległy przegląd w wątkach; wyniki w kolejności `jobs`. Najpierw duże stacje (dłuższe zmiany), żeby nie czekać na ogon. */
function runParallel(jobs, workers, onProgress) {
  const order = jobs.map((_, i) => i).sort((a, b) => jobs[b].stationIndex - jobs[a].stationIndex || a - b);
  const results = new Array(jobs.length);
  const pool = [];
  return new Promise((resolveAll, reject) => {
    let next = 0, done = 0, failed = false;
    const fail = (err) => { if (failed) return; failed = true; for (const w of pool) w.terminate(); reject(err); };
    const feed = (w) => {
      if (next >= order.length) return;
      const i = order[next++];
      w.postMessage({ i, job: jobs[i] });
    };
    const count = Math.min(workers, jobs.length);
    for (let k = 0; k < count; k++) {
      const w = new Worker(new URL(import.meta.url), { workerData: { role: WORKER_ROLE } });
      pool.push(w);
      w.on('message', ({ i, result }) => {
        results[i] = result;
        done++;
        onProgress?.(done, jobs.length);
        if (done === jobs.length) { Promise.all(pool.map((p) => p.terminate())).then(() => resolveAll(results)); return; }
        feed(w);
      });
      w.on('error', fail);
      w.on('exit', (code) => { if (done < jobs.length && !failed) fail(new Error(`Wątek przeglądu zakończył się przedwcześnie (kod ${code})`)); });
      feed(w);
    }
  });
}

function runShiftSafe(job) {
  try {
    return surveyShift(job);
  } catch (e) {
    return { station: job.stationId, scenario: job.scenarioId, seed: job.seed, level: job.level, error: String(e?.stack || e) };
  }
}

/** Przegląd listy zmian: w jednym wątku albo w `workers` wątkach; wyniki w kolejności `jobs`. */
export async function runAll(jobs, workers, onProgress) {
  if (workers <= 1 || jobs.length <= 1) {
    const out = [];
    for (const job of jobs) { out.push(runShiftSafe(job)); onProgress?.(out.length, jobs.length); }
    return out;
  }
  return runParallel(jobs, workers, onProgress);
}

function printCompare(cmp, file) {
  const arrow = (a, b) => `zator ${a.stuck}→${b.stuck}, naruszenia ${a.violations}→${b.violations}, spad/rozprucie ${a.events}→${b.events}${a.error || b.error ? `, błąd ${a.error}→${b.error}` : ''}`;
  console.log(`\nPorównanie z ${file}:`);
  if (!cmp.worse.length && !cmp.better.length && !cmp.newJams.length) console.log('  bez zmian we wskaźnikach');
  for (const w of cmp.worse) console.log(`  GORZEJ  ${w.key}: ${arrow(w.old, w.now)}`);
  for (const b of cmp.better) console.log(`  lepiej  ${b.key}: ${arrow(b.old, b.now)}`);
  for (const j of cmp.newJams) console.log(`  nowy zator  ${j.key}: ${j.nr} (${j.status})`);
  if (cmp.changed.length) console.log(`  inny przebieg przy tych samych wskaźnikach: ${cmp.changed.length} zmian (${cmp.changed.slice(0, 5).join(', ')}${cmp.changed.length > 5 ? ', …' : ''})`);
  if (cmp.onlyNew.length) console.log(`  tylko w nowym przeglądzie: ${cmp.onlyNew.length} zmian`);
  if (cmp.onlyOld.length) console.log(`  tylko w starym przeglądzie: ${cmp.onlyOld.length} zmian`);
  console.log(`  razem: gorzej ${cmp.worse.length}, lepiej ${cmp.better.length}, nowe zatory ${cmp.newJams.length}, inny przebieg ${cmp.changed.length}`);
}

/** Wiersz poleceń; zwraca kod wyjścia. */
export async function main(argv) {
  let opts;
  try { opts = parseArgs(argv); } catch (e) { console.error(e.message); console.error(USAGE); return 2; }
  if (opts.help) { console.log(USAGE); return 0; }
  let previous = null;
  if (opts.compare) {
    try { previous = JSON.parse(readFileSync(opts.compare, 'utf8')); resultsOf(previous); } catch (e) { console.error(`Nie można odczytać ${opts.compare}: ${e.message}`); return 2; }
  }
  const jobs = listShifts(opts);
  if (!jobs.length) { console.error('Brak zmian do przeglądu (sprawdź --only).'); return 2; }
  const workers = Math.min(opts.workers, jobs.length);
  console.log(`Przegląd: ${jobs.length} zmian (poziomy ${opts.levels.join(', ')}; ziarna ${opts.seeds.join(', ')}; +${opts.extra} min po końcu zmiany${opts.only ? `; --only ${opts.only}` : ''}${opts.tutorial ? '; z samouczkami' : ''}), wątki: ${workers}`);
  const tty = process.stderr.isTTY;
  const progress = tty ? (d, all) => process.stderr.write(`\r  ${d}/${all}`) : null;
  const t0 = performance.now();
  const results = await runAll(jobs, workers, progress);
  const seconds = (performance.now() - t0) / 1000;
  if (tty) process.stderr.write('\r\x1b[K');
  for (const r of results) {
    if (!isProblem(r)) continue;
    console.log(formatProblem(r));
    if (opts.log && r.log) for (const l of r.log) console.log(`    ${l.slice(0, 230)}`);
  }
  // poziomy obecne w wynikach (scenariusz z własnym poziomem dokłada swój) – wiersze sumują się do RAZEM
  const levels = LEVELS.filter((l) => results.some((r) => r.level === l));
  if (levels.length > 1) {
    for (const level of levels) console.log(`poziom ${level}: ${summaryText(summarize(results.filter((r) => r.level === level)))}`);
  }
  const total = summarize(results);
  console.log(`RAZEM: ${summaryText(total)}`);
  console.log(`Czas: ${seconds.toFixed(1)} s`);
  if (opts.json) {
    const data = { tool: 'scripts/survey.mjs', created: new Date().toISOString(), options: { levels: opts.levels, seeds: opts.seeds, only: opts.only, extra: opts.extra, tutorial: opts.tutorial }, results };
    writeFileSync(opts.json, JSON.stringify(data, null, 1) + '\n');
    console.log(`Zapisano: ${opts.json}`);
  }
  if (previous) printCompare(compareResults(previous, results), opts.compare);
  return total.stuck || total.violations || total.events || total.errors ? 1 : 0;
}

// Wątek przeglądu: zmiany z kolejki wątku głównego, jedna po drugiej.
if (!isMainThread && workerData?.role === WORKER_ROLE) {
  parentPort.on('message', ({ i, job }) => parentPort.postMessage({ i, result: runShiftSafe(job) }));
}

function executedDirectly() {
  if (!isMainThread || !process.argv[1]) return false;
  try { return realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url)); } catch { return false; }
}

if (executedDirectly()) {
  main(process.argv.slice(2)).then((code) => { process.exitCode = code; }, (e) => { console.error(e?.stack || e); process.exitCode = 1; });
}
