import assert from 'node:assert/strict';
import { violations } from '../src/model/check/invariants.js';

/** Niezmienniki bezpieczeństwa jako asercja testu (`src/model/check/invariants.js`). */
export function safety(sim, where = '') {
  const v = violations(sim);
  assert.deepEqual(v, [], `${where}: ${v.join('; ')}`);
}
