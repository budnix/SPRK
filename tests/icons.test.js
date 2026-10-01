import { test } from 'node:test';
import assert from 'node:assert/strict';
import { frontIcon, modeIcon } from '../src/ui/icons.js';

test('ikony pociągu: tryb pociągowy = trzy zapalone światła (Pc1), manewrowy = jedno dolne lewe (Tb1); czoło = sylwetka zwrócona w stronę jazdy', () => {
  const on = (s) => (s.match(/class="lamp on"/g) || []).length, off = (s) => (s.match(/class="lamp off"/g) || []).length;
  assert.equal(on(modeIcon('train')), 3); assert.equal(off(modeIcon('train')), 0);
  assert.equal(on(modeIcon('shunt')), 1); assert.equal(off(modeIcon('shunt')), 2);
  // Tb1: zapalona lampa dolna lewa (mniejsze cx w dolnym rzędzie), pozostałe zgaszone
  const lamps = [...modeIcon('shunt').matchAll(/<circle cx="([\d.]+)" cy="([\d.]+)" r="[\d.]+" class="lamp (on|off)"/g)].map((m) => ({ x: +m[1], y: +m[2], on: m[3] === 'on' }));
  const bottom = lamps.filter((l) => l.y === Math.max(...lamps.map((x) => x.y)));
  assert.equal(bottom.length, 2);
  assert.ok(bottom.find((l) => l.x === Math.min(...bottom.map((x) => x.x))).on, 'dolna lewa świeci');
  assert.ok(!bottom.find((l) => l.x === Math.max(...bottom.map((x) => x.x))).on, 'dolna prawa zgaszona');
  assert.ok(!lamps.find((l) => l.y === Math.min(...lamps.map((x) => x.y))).on, 'górna zgaszona');
  assert.match(modeIcon('shunt'), /data-mode="shunt"/); assert.match(modeIcon('train'), /data-mode="train"/);
  assert.equal(on(modeIcon(undefined)), 3, 'brak trybu = pociągowy');
  for (const d of ['E', 'NE', 'SE']) { assert.match(frontIcon(d), /data-dir="E"/); assert.doesNotMatch(frontIcon(d), /scale\(-1 1\)/); }
  for (const d of ['W', 'NW', 'SW']) { assert.match(frontIcon(d), /data-dir="W"/); assert.match(frontIcon(d), /scale\(-1 1\)/); }
  for (const s of [modeIcon('train'), frontIcon('E')]) assert.match(s, /^<svg[^>]*aria-hidden="true"/);
});

test('ikony interfejsu: wspólna siatka 16×16, kolor z tekstu, ukryte przed czytnikami; nieznana nazwa to błąd', async () => {
  const { uiIcon, uiIconNames } = await import('../src/ui/icons.js');
  assert.deepEqual(uiIconNames().sort(), ['check', 'close', 'cross', 'menu', 'pause', 'play', 'search', 'todo', 'wait']);
  for (const name of uiIconNames()) {
    const svg = uiIcon(name);
    assert.match(svg, new RegExp(`^<svg class="ui-ic" data-icon="${name}" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">`));
    assert.doesNotMatch(svg, /#[0-9a-f]{3,6}|fill="|stroke="/i, `${name}: barwy tylko ze stylów`);
  }
  assert.match(uiIcon('close', 12), /width="12" height="12"/);
  assert.throws(() => uiIcon('nie-ma'), /Nieznana ikona/);
});
