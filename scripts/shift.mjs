/**
 * Wspólna część narzędzi, które grają zmiany automatem bez widoku: przeglądu silnika (`scripts/survey.mjs`) i automatu
 * sprawdzającego scenariusze (`scripts/check-scenario.mjs`).
 *
 *  - `playShift` – jedna zmiana prowadzona przez dyżurnego automatycznego (`AutoOperator`, cała stacja) w przyspieszonym
 *    cyklu: krok 0,5 s (jeden takt silnika), automat co 2 s, niezmienniki bezpieczeństwa po każdym takcie,
 *  - `trainDone` – pociąg obsłużony do końca (dojechał do sąsiada, zakończył bieg, skład przekazany),
 *  - `runParallel` – kolejka zadań rozdzielana na wątki `worker_threads`; `runJobs` / `serveJobs` – lista zmian w wątku
 *    głównym albo w wątkach (najpierw duże stacje) i obsługa kolejki po stronie wątku,
 *  - `parseCli` – wspólne opcje wiersza poleceń (`--level`, `--seeds`, `--extra`, `--workers`, `--json`, `--tutorial`,
 *    `--help`), `executedDirectly` – czy moduł uruchomiono wprost (`node plik.mjs`).
 */
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { availableParallelism } from 'node:os';
import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Simulation } from '../src/model/Simulation.js';
import { AutoOperator } from '../src/model/Operator.js';
import { Clock } from '../src/core/Clock.js';
import { violations } from '../tests/invariants.js';
import { leftovers } from '../tests/fault-harness.js';
import { isFinished } from '../src/model/timetable/phase.js';

/** Ile pierwszych naruszeń (z czasem) zapisać dla zmiany. */
export const FIRST_VIOLATIONS = 3;
/** Koniec zmiany bez `endTime` w scenariuszu (jak w przeglądzie). */
export const DEFAULT_END = '10:00';

/** Liczba wątków domyślnie: rdzenie − 1, co najmniej 1. */
export function defaultWorkers() {
  return Math.max(1, availableParallelism() - 1);
}

/** Ziarna losowania z wiersza poleceń: „1-4”, „1,2,3”, „2-3,7” (od 1, bez powtórzeń); przy błędzie wyjątek. */
export function parseSeeds(text) {
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

/** Pociąg obsłużony do końca: dojechał do sąsiada, zakończył bieg albo skład przekazano (manewry, odstawienie). */
export function trainDone(e) {
  return isFinished(e);
}

/**
 * Wszystko się uspokoiło po końcu zmiany (reguła wcześniejszego końca przebiegu): czas ≥ `endTime`, każdy pociąg
 * obsłużony do końca (także nadzwyczajny – musi już być w rozkładzie), zadania wykonane albo przepadły, urządzenia
 * w stanie zasadniczym. Dalej nic się już nie zmieni – zapas `extra` byłby pustym ogonem.
 */
export function settled(sim, endTime) {
  if (sim.clock.time < endTime) return false;
  if (sim.extraTrainsPlanned.some((x) => !x.done)) return false;
  if (!sim.traffic.timetable().every(trainDone)) return false;
  if (!(sim.traffic.tasks || []).every((t) => t.done || t.failed)) return false;
  return leftovers(sim).length === 0;
}

/**
 * Jedna zmiana z automatem. `scenario` – id scenariusza stacji albo obiekt scenariusza (wariant spoza stacji).
 * Koniec: `endTime` scenariusza (bez niego 10:00) + `extra` minut; z `settle` – wcześniej, gdy po `endTime` wszystko
 * jest obsłużone (`settled`, sprawdzane co minutę czasu symulacji; przebieg ruchu ten sam co bez skrótu).
 *
 * `onCreate(sim)` – symulacja utworzona, przed pierwszym taktem (np. subskrypcja dziennika); `onTick(sim, { opTick })` – po każdym takcie (`opTick`: w tym takcie działał automat); `onViolation(msg, time)` –
 * naruszenie niezmiennika, które pojawiło się w tym takcie.
 *
 * Zwraca `{ sim, violations: { count, ticks, first }, endTime, until }`: `count` – ile razy naruszenie się pojawiło
 * (napis nieobecny w poprzednim takcie), `ticks` – suma naruszeń po wszystkich taktach, `first` – pierwsze pojawienia
 * się `{ time, msg }`; `endTime` – koniec zmiany (s), `until` – koniec przebiegu (s).
 */
export function playShift({ station, scenario, seed, level = 'none', extra = 120, settle = false, onCreate = null, onTick = null, onViolation = null }) {
  // speed 1: jeden krok 0,5 s = jeden takt silnika, więc niezmienniki są sprawdzane po każdym takcie;
  // district 'both': na stacji z okręgami automat prowadzi całą stację, bez wbudowanych automatów okręgów
  const sim = new Simulation(station, { scenario, disruptions: level, seed, speed: 1, district: 'both' });
  const op = new AutoOperator(sim, { district: null, role: 'full' });
  onCreate?.(sim, op);
  const endTime = Number.isFinite(sim.endTime) ? sim.endTime : Clock.parse(DEFAULT_END);
  const until = endTime + extra * 60;
  const viol = { count: 0, ticks: 0, first: [] };
  let prev = new Set();
  let n = 0;
  while (sim.clock.time < until) {
    sim.step(0.5);
    const opTick = n++ % 4 === 0;
    if (opTick) op.tick();
    const v = violations(sim);
    viol.ticks += v.length;
    const now = new Set(v);
    for (const msg of now) {
      if (prev.has(msg)) continue;
      viol.count++;
      if (viol.first.length < FIRST_VIOLATIONS) viol.first.push({ time: Clock.format(sim.clock.time, true), msg });
      onViolation?.(msg, sim.clock.time);
    }
    prev = now;
    onTick?.(sim, { opTick, op });
    if (settle && n % 120 === 0 && settled(sim, endTime)) break;
  }
  return { sim, violations: viol, endTime, until: sim.clock.time };
}

/**
 * Kolejka zadań w wątkach: każdy wątek to moduł `url` uruchomiony z `workerData: { role }`, który na wiadomość
 * `{ i, job }` odpowiada `{ i, result }`. Wyniki w kolejności `jobs`; `order` – kolejność wysyłania (indeksy `jobs`,
 * np. najpierw duże stacje, żeby nie czekać na ogon). Awaria wątku kończy całą kolejkę błędem.
 */
export function runParallel(jobs, { url, role, workers, order = null, onProgress = null }) {
  const queue = order ?? jobs.map((_, i) => i);
  const results = new Array(jobs.length);
  const pool = [];
  return new Promise((resolveAll, reject) => {
    let next = 0, done = 0, failed = false;
    const fail = (err) => { if (failed) return; failed = true; for (const w of pool) w.terminate(); reject(err); };
    const feed = (w) => {
      if (next >= queue.length) return;
      const i = queue[next++];
      w.postMessage({ i, job: jobs[i] });
    };
    const count = Math.min(workers, jobs.length);
    for (let k = 0; k < count; k++) {
      const w = new Worker(url, { workerData: { role } });
      pool.push(w);
      w.on('message', ({ i, result }) => {
        results[i] = result;
        done++;
        onProgress?.(done, jobs.length);
        if (done === jobs.length) { Promise.all(pool.map((p) => p.terminate())).then(() => resolveAll(results)); return; }
        feed(w);
      });
      w.on('error', fail);
      w.on('exit', (code) => { if (done < jobs.length && !failed) fail(new Error(`Wątek zakończył się przedwcześnie (kod ${code})`)); });
      feed(w);
    }
  });
}

/**
 * Lista zmian: w jednym wątku (`run(job)` po kolei) albo w `workers` wątkach – moduł `url` z rolą `role` (`serveJobs`),
 * najpierw zadania dużych stacji (`stationIndex` – dalej w liście stacji to dłuższe zmiany), żeby nie czekać na ogon.
 * Wyniki w kolejności `jobs`.
 */
export async function runJobs(jobs, { workers, url, role, run, onProgress = null }) {
  if (workers <= 1 || jobs.length <= 1) {
    const out = [];
    for (const job of jobs) { out.push(run(job)); onProgress?.(out.length, jobs.length); }
    return out;
  }
  const order = jobs.map((_, i) => i).sort((a, b) => (jobs[b].stationIndex ?? 0) - (jobs[a].stationIndex ?? 0) || a - b);
  return runParallel(jobs, { url, role, workers, order, onProgress });
}

/** Strona wątku: gdy ten wątek ma rolę `role`, odpowiada `{ i, result: run(job) }` na każde zadanie z kolejki. */
export function serveJobs(role, run) {
  if (isMainThread || workerData?.role !== role) return;
  parentPort.on('message', ({ i, job }) => parentPort.postMessage({ i, result: run(job) }));
}

/** Czy moduł `metaUrl` (`import.meta.url`) uruchomiono wprost (`node plik.mjs`), a nie zaimportowano / w wątku. */
export function executedDirectly(metaUrl) {
  if (!isMainThread || !process.argv[1]) return false;
  try { return realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(metaUrl)); } catch { return false; }
}

/**
 * Wiersz poleceń narzędzi zmian (`argv` bez `node` i nazwy skryptu); `--opcja wartość` i `--opcja=wartość`. Wspólne:
 * `--level` (`levels.allowed`, `all` = `levels.all`), `--seeds`, `--extra`, `--workers`, `--json`, `--tutorial`,
 * `--help` / `-h`. `custom(name, { value, flag })` – opcje własne narzędzia (zwraca true, gdy obsłużyła);
 * `positional(raw)` – argument bez „-” (bez niej to nieznana opcja). Wynik w `opts` (wartości domyślne); przy błędzie
 * wyjątek z komunikatem.
 */
export function parseCli(argv, opts, { levels, custom = null, positional = null }) {
  const args = [...argv];
  while (args.length) {
    const raw = args.shift();
    if (positional && !raw.startsWith('-')) { positional(raw); continue; }
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
        if (v === 'all') opts.levels = [...levels.all];
        else if (levels.allowed.includes(v)) opts.levels = [v];
        else throw new Error(`Nieznany poziom zakłóceń: „${v}” (${[...levels.allowed, 'all'].join(', ')})`);
        break;
      }
      case '--seeds': opts.seeds = parseSeeds(value()); break;
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
      case '--tutorial': opts.tutorial = flag(); break;
      case '--help': case '-h': opts.help = true; break;
      default:
        if (!custom?.(name, { value, flag })) throw new Error(`Nieznana opcja: ${raw}`);
    }
  }
  return opts;
}
