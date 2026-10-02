import { test } from 'node:test';
import assert from 'node:assert/strict';
import { violations } from '../src/model/check/invariants.js';
import { makeSim, run } from './helpers.js';

/* Niezmienniki bezpieczeństwa (src/model/check/invariants.js) – czy wykrywają naruszenie, zanim posłużą testom i przeglądowi. */

const train = (nr, line = null) => ({ nr, mode: 'train', finished: false, occupiedSections: () => new Set(), onLine: (id) => id === line });
const sim = (trains) => ({
  traffic: { trains },
  blocks: new Map([['W', {}], ['E', {}]]),
  ilk: { lockConflicts: () => [], signals: new Map(), points: new Map(), sections: new Map(), manualSignal: false },
});

test('niezmiennik szlaku: dwa pociągi na jednym torze szlakowym to naruszenie; po jednym na dwóch szlakach – nie', () => {
  assert.deepEqual(violations(sim([train(1, 'W'), train(2, 'W')])), ['pociągi 1 i 2 na szlaku W']);
  assert.deepEqual(violations(sim([train(1, 'W'), train(2, 'E'), train(3)])), []);
  assert.deepEqual(violations(sim([train(1, 'W'), { ...train(2, 'W'), finished: true }])), [], 'pociąg, który dojechał, się nie liczy');
});

test('niezmiennik „odcinek w jednym przebiegu”: zależności same sprawdzają swój zapis (lockConflicts), niezmiennik podaje odcinek i oba przebiegi', () => {
  const s = sim([]);
  s.ilk.lockConflicts = () => [{ section: 'Iz1', first: 'A-D1', second: 'B-C1' }];
  assert.deepEqual(violations(s), ['odcinek Iz1 w dwóch przebiegach (A-D1, B-C1)']);
  // prawdziwe zależności: wszystkie przebiegi, które dają się nastawić naraz – zapis spójny
  const real = makeSim({ disruptions: 'none' });
  for (const r of real.ilk.routeList()) { real.ilk.setRoute(r.id); run(real, 1); }
  run(real, 10);
  assert.ok(real.ilk.routesSet().filter((x) => x.state !== 'setting').length >= 2, 'nastawione przebiegi');
  assert.deepEqual(real.ilk.lockConflicts(), []);
});
