import { test } from 'node:test';
import assert from 'node:assert/strict';
import { frontIcon, modeIcon } from '../src/ui/icons.js';

test('ikony pociągu: tryb pociągowy = trzy zapalone światła (Pc1), manewrowy = jedno; czoło = sylwetka zwrócona w stronę jazdy', () => {
  const on = (s) => (s.match(/class="lamp on"/g) || []).length, off = (s) => (s.match(/class="lamp off"/g) || []).length;
  assert.equal(on(modeIcon('train')), 3); assert.equal(off(modeIcon('train')), 0);
  assert.equal(on(modeIcon('shunt')), 1); assert.equal(off(modeIcon('shunt')), 2);
  assert.match(modeIcon('shunt'), /data-mode="shunt"/); assert.match(modeIcon('train'), /data-mode="train"/);
  assert.equal(on(modeIcon(undefined)), 3, 'brak trybu = pociągowy');
  for (const d of ['E', 'NE', 'SE']) { assert.match(frontIcon(d), /data-dir="E"/); assert.doesNotMatch(frontIcon(d), /scale\(-1 1\)/); }
  for (const d of ['W', 'NW', 'SW']) { assert.match(frontIcon(d), /data-dir="W"/); assert.match(frontIcon(d), /scale\(-1 1\)/); }
  for (const s of [modeIcon('train'), frontIcon('E')]) assert.match(s, /^<svg[^>]*aria-hidden="true"/);
});
