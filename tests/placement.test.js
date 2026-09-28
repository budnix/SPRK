import { test } from 'node:test';
import assert from 'node:assert/strict';
import { placeBox, overlapArea, freeBands } from '../src/tutorial/placement.js';

/* Położenie dymku samouczka: nie zasłania wskazywanego elementu ani pasków sterowania (zakładki panelu, pasek poleceń) */

const rect = (left, top, w, h) => ({ left, top, right: left + w, bottom: top + h, width: w, height: h });
// okno 1366×1024, panel boczny na dole: nagłówek, pasek poleceń, plan, listwa z zakładkami panelu, panel
const viewport = { w: 1366, h: 1024 };
const bars = [rect(0, 0, 1366, 40), rect(0, 40, 1366, 38), rect(0, 586, 1366, 46)];
const desk = rect(4, 84, 1358, 490);
const panel = rect(0, 632, 1366, 392);
const box = { w: 360, h: 190 };
const at = (p) => rect(p.left, p.top, box.w, box.h);
const clear = (p, what) => overlapArea(at(p), what) === 0;

test('dymek przy elemencie planu nie zasłania zakładek panelu, paska poleceń ani elementu', () => {
  // elementy planu: przy górnej krawędzi, na środku, przy dolnej krawędzi i w rogach
  for (const target of [rect(460, 120, 24, 24), rect(680, 300, 24, 24), rect(240, 540, 24, 24), rect(30, 250, 60, 30), rect(1300, 540, 40, 30), rect(20, 100, 24, 24)]) {
    const p = placeBox({ box, viewport, target, desk, bars, panel, onDesk: true });
    assert.ok(clear(p, target), `zasłania element ${JSON.stringify(target)}`);
    for (const b of bars) assert.ok(clear(p, b), `zasłania pasek ${b.top} przy elemencie ${target.left},${target.top}: ${JSON.stringify(p)}`);
    assert.ok(p.left >= 0 && p.top >= 0 && p.left + box.w <= viewport.w && p.top + box.h <= viewport.h, 'w oknie');
  }
});

test('dymek przy elemencie paska (przycisk polecenia, zakładka panelu) nie zasłania tego paska', () => {
  const cmd = rect(900, 46, 120, 26), tab = rect(300, 592, 80, 34);
  for (const target of [cmd, tab]) {
    const p = placeBox({ box, viewport, target, desk, bars, panel, onDesk: false });
    assert.ok(clear(p, target));
    for (const b of bars) assert.ok(clear(p, b), `pasek ${b.top}: ${JSON.stringify(p)}`);
  }
  // zakładka panelu: dymek schodzi nad treść panelu, nie na plan
  const p = placeBox({ box, viewport, target: tab, desk, bars, panel, onDesk: false });
  assert.ok(p.top >= panel.top, `nad treścią panelu: ${JSON.stringify(p)}`);
});

test('wysoki dymek, mały ekran, brak elementu i brak panelu – zawsze w oknie, paski odsłonięte, gdy to możliwe', () => {
  const tall = { w: 360, h: 330 };
  const p = placeBox({ box: tall, viewport, target: rect(680, 300, 24, 24), desk, bars, panel, onDesk: true });
  for (const b of bars) assert.equal(overlapArea(rect(p.left, p.top, tall.w, tall.h), b), 0);
  // bez wskazywanego elementu: prawy dolny róg, nad treścią panelu
  const none = placeBox({ box, viewport, target: null, desk, bars, panel, onDesk: false });
  assert.equal(none.side, 'none');
  for (const b of bars) assert.ok(clear(none, b));
  // panel zwinięty albo z boku: bez miejsca w panelu dymek zostaje przy elemencie, w oknie
  const noPanel = placeBox({ box, viewport: { w: 1366, h: 700 }, target: rect(680, 300, 24, 24), desk: rect(4, 84, 1358, 560), bars: [rect(0, 0, 1366, 40), rect(0, 654, 1366, 46)], panel: null, onDesk: true });
  assert.ok(noPanel.top + box.h <= 700 && noPanel.top >= 0);
  assert.ok(clear(noPanel, rect(680, 300, 24, 24)));
  // telefon: dymek szerszy niż wolne miejsce – mieści się w oknie
  const phone = placeBox({ box: { w: 344, h: 220 }, viewport: { w: 360, h: 640 }, target: rect(100, 200, 24, 24), desk: rect(0, 80, 360, 300), bars: [rect(0, 0, 360, 40), rect(0, 380, 360, 40)], panel: rect(0, 420, 360, 220), onDesk: true });
  assert.ok(phone.left >= 0 && phone.left + 344 <= 360 && phone.top >= 0 && phone.top + 220 <= 640);
  assert.equal(overlapArea(rect(0, 0, 10, 10), rect(10, 0, 10, 10)), 0);
  assert.equal(overlapArea(rect(0, 0, 10, 10), rect(5, 5, 10, 10)), 25);
});

test('wysoki dymek: gdy nie mieści się przy elemencie ani w panelu, staje w wolnym pasie między paskami sterowania', () => {
  assert.deepEqual(freeBands(bars, 1024), [{ top: 78, bottom: 586 }, { top: 632, bottom: 1024 }]);
  assert.deepEqual(freeBands([], 500), [{ top: 0, bottom: 500 }]);
  const tall = { w: 360, h: 435 };
  // kostki blokady przy lewej krawędzi planu, tuż nad listwą narzędzi – jak w misji 2
  const target = rect(30, 330, 120, 80);
  const p = placeBox({ box: tall, viewport, target, desk, bars, panel, onDesk: true });
  const r = rect(p.left, p.top, tall.w, tall.h);
  assert.equal(overlapArea(r, target), 0, JSON.stringify(p));
  for (const b of bars) assert.equal(overlapArea(r, b), 0, `pasek ${b.top}: ${JSON.stringify(p)}`);
  // krok bez elementu i dymek wyższy niż panel
  const none = placeBox({ box: { w: 360, h: 400 }, viewport, target: null, desk, bars, panel, onDesk: false });
  for (const b of bars) assert.equal(overlapArea(rect(none.left, none.top, 360, 400), b), 0, JSON.stringify(none));
});
