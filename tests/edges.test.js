import { test } from 'node:test';
import assert from 'node:assert/strict';
import { edgeLayout } from '../src/render/edges.js';

test('stałe pola skrajne: aktywne tylko, gdy pulpit szerszy niż okno i zostaje miejsce na środek; viewBoxy skrajnych kolumn w skali pulpitu', () => {
  const vb = [0, 0, 4504, 700]; // Sopot: 112 kolumn × 40 + 2 × 12
  const off = edgeLayout({ viewBox: vb, deskPx: { w: 990, h: 154 }, clientPx: { w: 992, h: 600 }, edgeUnits: 132 });
  assert.equal(off.active, false, 'pulpit mieści się – bez pól');
  const on = edgeLayout({ viewBox: vb, deskPx: { w: 1712, h: 266 }, clientPx: { w: 992, h: 600 }, edgeUnits: 132 });
  assert.equal(on.active, true);
  assert.deepEqual(on.left.viewBox, [0, 0, 132, 700]);
  assert.deepEqual(on.right.viewBox, [4504 - 132, 0, 132, 700]);
  assert.ok(Math.abs(on.left.w - 132 * 1712 / 4504) < 1e-9); // szerokość pola w px = kolumny × skala pulpitu, bez zaokrągleń
  assert.equal(on.left.h, 266);
  assert.equal(on.right.w, on.left.w);
  // ekran (wycinek kolumn): viewBox z przesunięciem – pola liczą się od jego krawędzi
  const scr = edgeLayout({ viewBox: [2000, 0, 1600, 700], deskPx: { w: 2400, h: 1050 }, clientPx: { w: 900, h: 600 }, edgeUnits: 132 });
  assert.equal(scr.active, true);
  assert.deepEqual(scr.left.viewBox, [2000, 0, 132, 700]);
  assert.deepEqual(scr.right.viewBox, [3600 - 132, 0, 132, 700]);
  // zbyt duże powiększenie: oba pola zajęłyby ponad 60 % okna – środek nie miałby sensu – pola wyłączone
  const huge = edgeLayout({ viewBox: [0, 0, 1000, 300], deskPx: { w: 8000, h: 2400 }, clientPx: { w: 700, h: 600 }, edgeUnits: 132 });
  assert.equal(huge.active, false);
  // wąski pulpit (mniej niż trzy szerokości pola) – bez pól
  assert.equal(edgeLayout({ viewBox: [0, 0, 300, 300], deskPx: { w: 900, h: 900 }, clientPx: { w: 500, h: 600 }, edgeUnits: 132 }).active, false);
});
