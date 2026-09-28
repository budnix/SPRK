import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ZOOM_MIN, ZOOM_MAX, clampZoom, fitZoom, zoomAround, fitAxes, nextFitMode, startFitMode } from '../src/render/zoom.js';
import { clampSide, dragSide, SIDE_LIMITS } from '../src/ui/sideSize.js';

const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≠ ${b}`);

test('dopasowanie pulpitu: całość mieści się w oknie, szerokość i wysokość wypełniają swój wymiar', () => {
  const desk = { w: 1000, h: 400 }, client = { w: 808, h: 408 };
  near(fitZoom('whole', desk, client), 0.8);              // ogranicza szerokość
  near(fitZoom('whole', desk, { w: 2008, h: 208 }), 0.5);  // ogranicza wysokość
  near(fitZoom('width', desk, client), 0.8);
  near(fitZoom('height', desk, client), 1);
  near(fitZoom(undefined, desk, client), 0.8);
  // granice: bardzo szeroka stacja nie schodzi poniżej minimum; mała stacja w trybie „całość” wypełnia okno
  assert.equal(fitZoom('whole', { w: 9000, h: 400 }, client), ZOOM_MIN);
  assert.equal(fitZoom('width', { w: 9000, h: 400 }, client), ZOOM_MIN);
  near(fitZoom('whole', { w: 100, h: 50 }, client), 8);
  assert.equal(fitZoom('width', { w: 100, h: 50 }, client), ZOOM_MAX);
  assert.equal(fitZoom('height', { w: 100, h: 50 }, client), ZOOM_MAX);
  assert.equal(clampZoom(0.01), ZOOM_MIN); assert.equal(clampZoom(99), ZOOM_MAX); assert.equal(clampZoom(1.5), 1.5);
});

test('powiększanie wokół punktu: punkt pod palcami zostaje w miejscu, na granicy nic się nie zmienia', () => {
  const r = zoomAround(1, 2, { left: 100, top: 50 }, { x: 200, y: 80 });
  assert.deepEqual(r, { zoom: 2, left: 400, top: 180, changed: true });
  // ten sam punkt rysunku przed i po: (przewinięcie + punkt) / powiększenie
  near((100 + 200) / 1, (r.left + 200) / r.zoom);
  near((50 + 80) / 1, (r.top + 80) / r.zoom);
  const out = zoomAround(2, 0.5, { left: 400, top: 180 }, { x: 200, y: 80 });
  assert.deepEqual(out, { zoom: 1, left: 100, top: 50, changed: true });
  assert.deepEqual(zoomAround(ZOOM_MAX, 1.2, { left: 10, top: 20 }, { x: 5, y: 5 }), { zoom: ZOOM_MAX, left: 10, top: 20, changed: false });
  assert.deepEqual(zoomAround(ZOOM_MIN, 0.5, { left: 0, top: 0 }, { x: 5, y: 5 }), { zoom: ZOOM_MIN, left: 0, top: 0, changed: false });
  assert.equal(zoomAround(3.9, 2, { left: 0, top: 0 }, { x: 0, y: 0 }).zoom, ZOOM_MAX);
});

test('przyciski dopasowania są stanowe i wykluczają się: wciśnięty najwyżej jeden; klik w wciśnięty – ręcznie', () => {
  assert.deepEqual(fitAxes('width'), { w: true, h: false });
  assert.deepEqual(fitAxes('height'), { w: false, h: true });
  assert.deepEqual(fitAxes(null), { w: false, h: false });
  assert.deepEqual(fitAxes('whole'), { w: true, h: false }, 'całość bez przycisku „wysokość” – jak „szerokość”');
  assert.equal(nextFitMode(null, 'w'), 'width');
  assert.equal(nextFitMode(null, 'h'), 'height');
  assert.equal(nextFitMode('width', 'h'), 'height', 'klik w drugi zwalnia pierwszy');
  assert.equal(nextFitMode('height', 'w'), 'width');
  assert.equal(nextFitMode('width', 'w'), null, 'klik w wciśnięty go zwalnia');
  assert.equal(nextFitMode('height', 'h'), null);
  assert.equal(nextFitMode('whole', 'w'), null);
  assert.equal(nextFitMode('whole', 'h'), 'height');
});

test('na starcie wciśnięty przycisk osi, która ogranicza plan – cały plan mieści się w oknie', () => {
  const desk = { w: 1000, h: 400 };
  assert.equal(startFitMode(desk, { w: 808, h: 408 }), 'width', 'ogranicza szerokość');
  assert.equal(startFitMode(desk, { w: 2008, h: 208 }), 'height', 'ogranicza wysokość');
  assert.equal(startFitMode(desk, { w: 2008, h: 208 }, false), 'whole', 'bez przycisku „wysokość” – całość');
  // powiększenie trybu startowego = powiększenie „całości”
  for (const client of [{ w: 808, h: 408 }, { w: 2008, h: 208 }]) near(fitZoom(startFitMode(desk, client), desk, client), fitZoom('whole', desk, client));
});

test('rozmiar panelu przy przeciąganiu krawędzi: w górę / w lewo rośnie, w granicach, plan zawsze ma miejsce', () => {
  const v = SIDE_LIMITS.vertical;
  assert.equal(dragSide(300, -100, 'bottom'), 400, 'krawędź w górę – panel na dole wyższy');
  assert.equal(dragSide(360, -50, 'right'), 410, 'krawędź w lewo – panel po prawej szerszy');
  assert.equal(dragSide(360, 50, 'left'), 410, 'krawędź w prawo – panel po lewej szerszy');
  assert.equal(clampSide(400, 900, v), 400);
  assert.equal(clampSide(50, 900, v), v.min, 'panel nie znika');
  assert.equal(clampSide(880, 900, v), 900 - v.minRest, 'plan zostaje');
  assert.equal(clampSide(500, 250, v), v.min, 'bardzo małe okno – najmniejszy panel');
  assert.equal(clampSide(333.6, 900, v), 334);
});
