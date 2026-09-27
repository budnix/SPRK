import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scrollAllowed } from '../src/ui/noBounce.js';

const box = (o) => ({ overflowX: 'visible', overflowY: 'visible', scrollLeft: 0, scrollTop: 0, scrollWidth: 100, clientWidth: 100, scrollHeight: 100, clientHeight: 100, ...o });

test('blokada przewijania strony: gest przechodzi tylko gdy przodek ma jeszcze co przewinąć w tym kierunku', () => {
  assert.equal(scrollAllowed([box()], 0, 40), false, 'nic nie przewija → pull to refresh zablokowany');
  const panel = box({ overflowY: 'auto', scrollHeight: 400, clientHeight: 100, scrollTop: 0 });
  assert.equal(scrollAllowed([panel], 0, -40), true, 'palec w górę: panel ma treść poniżej');
  assert.equal(scrollAllowed([panel], 0, 40), false, 'palec w dół na górze panelu: to byłby bounce/odświeżanie');
  assert.equal(scrollAllowed([box(), { ...panel, scrollTop: 300 }], 0, -40), false, 'na dole panelu nie ma już czego przewijać w dół');
  assert.equal(scrollAllowed([box(), { ...panel, scrollTop: 150 }], 0, 40), true, 'w środku: oba kierunki');
  const desk = box({ overflowX: 'auto', scrollWidth: 900, clientWidth: 300, scrollLeft: 0 });
  assert.equal(scrollAllowed([desk], -30, 5), true, 'poziomo: pulpit szerszy niż okno');
  assert.equal(scrollAllowed([desk], 30, 5), false, 'poziomo przy lewej krawędzi');
  assert.equal(scrollAllowed([desk], 5, 30), false, 'gest pionowy na pulpicie, który przewija tylko poziomo');
  assert.equal(scrollAllowed([box({ overflowY: 'hidden', scrollHeight: 400 })], 0, -40), false, 'overflow hidden nie przewija');
  assert.equal(scrollAllowed([], 0, -40), false);
});
