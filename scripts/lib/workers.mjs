import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { availableParallelism } from 'node:os';

/**
 * Lista zmian w wątkach `worker_threads` – wspólna dla automatu sprawdzającego i przeglądu silnika: `runParallel`
 * (kolejka zadań w wątkach), `runJobs` (w wątku głównym albo w wątkach, najpierw duże stacje), `serveJobs` (obsługa
 * kolejki po stronie wątku), `defaultWorkers` (rdzenie − 1).
 */

/** Liczba wątków domyślnie: rdzenie − 1, co najmniej 1. */
export function defaultWorkers() {
  return Math.max(1, availableParallelism() - 1);
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
