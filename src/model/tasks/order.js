/**
 * Kolejność i gotowość zadań manewrowych zmiany (`Traffic.tasks`) – jedna definicja dla ruchu (wykonanie, przesuwanie
 * terminu), automatu dyżurnego i panelu. Zadanie może czekać na poprzednie (`afterTask`, np. „podstaw” po „odstaw”)
 * i na swoją porę (`afterTime`, sekundy; 0 – bez pory). Moduł logiki: bez DOM.
 */

const previous = (tasks, task) => (task.afterTask ? tasks.find((x) => x.id === task.afterTask) : null);

/** Zadanie czeka na poprzednie (`afterTask`), które nie jest jeszcze wykonane – także gdy poprzedniego nie ma na liście. */
export const taskWaits = (tasks, task) => !!task.afterTask && !previous(tasks, task)?.done;

/** Zadanie jest do wykonania teraz (`time`, s): nie wykonane, nie przepadło, nie czeka na poprzednie, nadeszła jego pora. */
export const taskReady = (tasks, task, time) => !task.done && !task.failed && !taskWaits(tasks, task) && time >= task.afterTime;

/** Zadanie jeszcze może się wykonać: nie wykonane, nie przepadło, a poprzednie (jeśli jest) nie przepadło. */
export const taskAlive = (tasks, task) => !task.done && !task.failed && !previous(tasks, task)?.failed;

/** Stan zadania do pokazania: 'done' | 'failed' | 'waiting' (na poprzednie albo na swoją porę) | 'active'. */
export function taskState(tasks, task, time) {
  if (task.done) return 'done';
  if (task.failed) return 'failed';
  return taskWaits(tasks, task) || time < task.afterTime ? 'waiting' : 'active';
}
