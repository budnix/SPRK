import { test } from 'node:test';
import assert from 'node:assert/strict';
import { taskWaits, taskReady, taskAlive, taskState } from '../src/model/tasks/order.js';

/*
 * Kolejność i gotowość zadań manewrowych – jedna definicja dla ruchu (Traffic), automatu dyżurnego i panelu
 * (src/model/tasks/order.js). Wcześniej każdy z trzech liczył ją po swojemu (panel inaczej przy brakującym
 * poprzednim zadaniu).
 */

const task = (id, extra = {}) => ({ id, afterTask: null, afterTime: 0, done: false, failed: false, ...extra });

test('zadanie czeka na poprzednie, dopóki tamto nie jest wykonane; bez poprzedniego na liście – też czeka', () => {
  const away = task('odstaw'), back = task('podstaw', { afterTask: 'odstaw' }), lost = task('x', { afterTask: 'brak' });
  const tasks = [away, back, lost];
  assert.deepEqual([taskWaits(tasks, away), taskWaits(tasks, back), taskWaits(tasks, lost)], [false, true, true]);
  away.done = true;
  assert.equal(taskWaits(tasks, back), false);
});

test('do wykonania teraz: nie wykonane, nie przepadło, nie czeka, nadeszła pora', () => {
  const first = task('a'), next = task('b', { afterTask: 'a', afterTime: 100 });
  const tasks = [first, next];
  assert.deepEqual([taskReady(tasks, first, 0), taskReady(tasks, next, 200)], [true, false], 'czeka na poprzednie');
  first.done = true;
  assert.deepEqual([taskReady(tasks, next, 99), taskReady(tasks, next, 100)], [false, true], 'pora');
  next.failed = true;
  assert.equal(taskReady(tasks, next, 200), false);
});

test('może się jeszcze wykonać, dopóki ono i poprzednie nie przepadły', () => {
  const first = task('a'), next = task('b', { afterTask: 'a' });
  const tasks = [first, next];
  assert.equal(taskAlive(tasks, next), true, 'czeka, ale żyje');
  first.failed = true;
  assert.equal(taskAlive(tasks, next), false, 'poprzednie przepadło');
  assert.equal(taskAlive([task('c', { afterTask: 'brak' })], task('c', { afterTask: 'brak' })), true, 'brakujące poprzednie nie przepadło');
});

test('stan do pokazania: wykonane, przepadło, czeka (na poprzednie albo porę), w toku', () => {
  const first = task('a'), next = task('b', { afterTask: 'a' }), later = task('c', { afterTime: 500 });
  const tasks = [first, next, later];
  assert.deepEqual(tasks.map((x) => taskState(tasks, x, 100)), ['active', 'waiting', 'waiting']);
  first.done = true; later.failed = true;
  assert.deepEqual(tasks.map((x) => taskState(tasks, x, 600)), ['done', 'active', 'failed']);
});
