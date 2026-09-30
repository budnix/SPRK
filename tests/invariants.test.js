import { test } from 'node:test';
import assert from 'node:assert/strict';
import { violations } from './invariants.js';

/* Niezmienniki bezpieczeństwa (tests/invariants.js) – czy wykrywają naruszenie, zanim posłużą testom i przeglądowi. */

const train = (nr, line = null) => ({ nr, mode: 'train', finished: false, occupiedSections: () => new Set(), onLine: (id) => id === line });
const sim = (trains) => ({
  traffic: { trains },
  blocks: new Map([['W', {}], ['E', {}]]),
  ilk: { active: new Map(), signals: new Map(), points: new Map(), sections: new Map(), manualSignal: false },
});

test('niezmiennik szlaku: dwa pociągi na jednym torze szlakowym to naruszenie; po jednym na dwóch szlakach – nie', () => {
  assert.deepEqual(violations(sim([train(1, 'W'), train(2, 'W')])), ['pociągi 1 i 2 na szlaku W']);
  assert.deepEqual(violations(sim([train(1, 'W'), train(2, 'E'), train(3)])), []);
  assert.deepEqual(violations(sim([train(1, 'W'), { ...train(2, 'W'), finished: true }])), [], 'pociąg, który dojechał, się nie liczy');
});
