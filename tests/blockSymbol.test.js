import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blockSymbol, blockSymbolShapes, hasKoSymbol, koSymbol } from '../src/render/blockSymbol.js';

/*
 * Symbol blokady liniowej na monitorze wg Ie-104.1 §8 pkt 20–22 (rysunki s. 53, 56, 61; tabele barw s. 54, 57, 62).
 * Dawniej: dwie strzałki kierunku w tym samym miejscu (szara zasłaniała żółtą) i własne napisy stanu („żąd.”, „Wbl”,
 * „Ko”, „tel.”, „Pwl”), których przepisy nie znają.
 */

const BASE = { direction: null, request: null, permission: false, occupied: false, poBlocked: false, koPending: false, zpg: false, koPrepared: false, pwl: false, fault: false, auto: false, fixed: null, phone: {} };
const eap = (s) => ({ ...BASE, ...s });
const sbl = (s) => ({ ...BASE, auto: true, ...s });

test('Eap: obraz i barwy segmentów a / b wg tabel Ie-104.1 (s. 62)', () => {
  const cases = [
    ['stan neutralny', {}, ['A', 'dark', 'dark']],
    ['sąsiad żąda pozwolenia', { request: 'theirs' }, ['B', 'yellow-blink', 'yellow']],
    ['ustawiony PRZYJAZD', { direction: 'in' }, ['B', 'yellow', 'yellow']],
    ['PRZYJAZD wykorzystany – pociąg sąsiada na szlaku', { direction: 'in', occupied: true }, ['B', 'red', 'red']],
    ['PRZYJAZD wykorzystany – pociąg przed semaforem wjazdowym', { direction: 'in', awaitingEntry: true }, ['B', 'red', 'red']],
    ['PRZYJAZD wykorzystany – pociąg przybył, czeka na Ko', { direction: 'in', koPending: true, zpg: true }, ['B', 'red', 'red']],
    ['nasze żądanie pozwolenia (Wbl)', { request: 'ours' }, ['C', 'yellow-blink', 'yellow']],
    ['ustawiony WYJAZD', { direction: 'out', permission: true }, ['C', 'yellow', 'yellow']],
    ['WYJAZD na blokadzie jednokierunkowej', { direction: 'out', fixed: 'out' }, ['C', 'yellow', 'yellow']],
    ['sygnał zezwalający na wyjazd (Pwl)', { direction: 'out', permission: true, pwl: true }, ['C', 'yellow', 'red']],
    ['WYJAZD wykorzystany', { direction: 'out', permission: true, poBlocked: true, occupied: true }, ['C', 'red', 'red']],
    ['usterka blokady', { direction: 'in', fault: true }, ['A', 'fault', 'fault']],
    ['kierunek bez pozwolenia – stan neutralny', { direction: 'out' }, ['A', 'dark', 'dark']],
  ];
  for (const [name, s, [pic, a, b]] of cases) assert.deepEqual(blockSymbol(eap(s)), { pic, a, b }, name);
});

test('blokada samoczynna: żądania i kierunki jak w Eap, bez stanu „wykorzystany” i bez Pwl (s. 54, 57)', () => {
  const cases = [
    ['sąsiad żąda zmiany kierunku', { direction: 'out', request: 'theirs' }, ['B', 'yellow-blink', 'yellow']],
    ['nasze żądanie zmiany kierunku (Zk)', { direction: 'in', request: 'ours' }, ['C', 'yellow-blink', 'yellow']],
    ['PRZYJAZD', { direction: 'in' }, ['B', 'yellow', 'yellow']],
    ['PRZYJAZD, odstęp zajęty', { direction: 'in', occupied: true }, ['B', 'yellow', 'yellow']],
    ['WYJAZD', { direction: 'out' }, ['C', 'yellow', 'yellow']],
    ['WYJAZD, nasz pociąg na szlaku', { direction: 'out', poBlocked: true, occupied: true }, ['C', 'yellow', 'yellow']],
    ['WYJAZD, sygnał wyjazdowy podany', { direction: 'out', pwl: true }, ['C', 'yellow', 'yellow']],
    ['usterka', { direction: 'out', fault: true }, ['A', 'fault', 'fault']],
  ];
  for (const [name, s, [pic, a, b]] of cases) assert.deepEqual(blockSymbol(sbl(s)), { pic, a, b }, name);
});

test('symbol Ko/dKo (s. 62): niewidoczny, zielony po stwierdzonym przyjeździe, żółty migający po dKo; tylko Eap przyjmująca', () => {
  assert.equal(koSymbol(eap({})), 'off');
  assert.equal(koSymbol(eap({ direction: 'in', occupied: true })), 'off');
  assert.equal(koSymbol(eap({ direction: 'in', koPending: true, zpg: true })), 'green');
  // wjazd na Sz bez dKo – przejazdu nie stwierdzono, Ko nie zadziała, symbol ciemny
  assert.equal(koSymbol(eap({ direction: 'in', koPending: true })), 'off');
  assert.equal(koSymbol(eap({ direction: 'in', koPrepared: true })), 'yellow-blink');
  assert.equal(koSymbol(eap({ direction: 'in', koPending: true, koPrepared: true })), 'yellow-blink');
  assert.equal(koSymbol(eap({ direction: 'in', koPending: true, zpg: true, fault: true })), 'off');
  assert.equal(hasKoSymbol(eap({})), true);
  assert.equal(hasKoSymbol(eap({ fixed: 'in' })), true);
  assert.equal(hasKoSymbol(eap({ fixed: 'out' })), false);
  assert.equal(hasKoSymbol(sbl({})), false);
  assert.equal(koSymbol(sbl({ direction: 'in', koPending: true, zpg: true })), 'off');
});

const pts = (d) => [...d.matchAll(/(-?[\d.]+),(-?[\d.]+)/g)].map((m) => [Number(m[1]), Number(m[2])]);
const box = (d) => { const p = pts(d); const xs = p.map((q) => q[0]), ys = p.map((q) => q[1]); return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) }; };
const apart = (a, b) => a.x1 <= b.x0 || b.x1 <= a.x0 || a.y1 <= b.y0 || b.y1 <= a.y0;
/** Grot: jeden punkt w skrajnym x na osi, a nie krawędź pionowa. */
const tipAt = (d, x) => pts(d).filter((q) => Math.abs(q[0] - x) < 0.01).length === 1;

test('kształt: obraz A – trzy rozłączne części z grotami na zewnątrz; B do stacji, C w stronę szlaku; ta sama długość; lustro w głowicy prawej', () => {
  for (const dir of [1, -1]) {
    const s = blockSymbolShapes(dir);
    const line = dir > 0 ? 'x1' : 'x0', station = dir > 0 ? 'x0' : 'x1';
    const [aLine, aBox, aStation] = s.A.map(box);
    assert.ok(apart(aLine, aBox) && apart(aBox, aStation) && apart(aLine, aStation), `dir ${dir}: części obrazu A rozłączne`);
    assert.ok(tipAt(s.A[0], aLine[line]) && tipAt(s.A[2], aStation[station]), `dir ${dir}: groty obrazu A na zewnątrz`);
    const whole = (bs) => ({ x0: Math.min(...bs.map((b) => b.x0)), x1: Math.max(...bs.map((b) => b.x1)) });
    const wA = whole([aLine, aStation]), wB = whole([box(s.B.a), box(s.B.b)]), wC = whole([box(s.C.a), box(s.C.b)]);
    assert.deepEqual([wB, wC], [wA, wA], `dir ${dir}: obrazy A, B, C tej samej długości`);
    // B (PRZYJAZD): grot a po stronie stacji, C (WYJAZD): po stronie szlaku; a i b rozłączne
    assert.ok(tipAt(s.B.a, wA[station]) && tipAt(s.C.a, wA[line]), `dir ${dir}: kierunek grotów B / C`);
    assert.ok(apart(box(s.B.a), box(s.B.b)) && apart(box(s.C.a), box(s.C.b)), `dir ${dir}: segmenty a / b rozłączne`);
    // Ko/dKo nad strzałkami, od strony stacji, nie dalej niż symbol
    const ko = { x0: s.ko.x, x1: s.ko.x + s.ko.width, y0: s.ko.y, y1: s.ko.y + s.ko.height };
    assert.ok(ko.y1 < Math.min(aLine.y0, box(s.B.a).y0, box(s.C.a).y0), `dir ${dir}: Ko nad strzałkami`);
    assert.ok(ko.x0 >= wA.x0 && ko.x1 <= wA.x1 && (dir > 0 ? ko.x1 < (wA.x0 + wA.x1) / 2 : ko.x0 > (wA.x0 + wA.x1) / 2), `dir ${dir}: Ko od strony stacji`);
  }
  // głowica prawa to lustrzane odbicie lewej (x → −x)
  const mirror = (d) => pts(d).map(([x, y]) => [-x, y]);
  const L = blockSymbolShapes(-1), R = blockSymbolShapes(1);
  for (const k of ['a', 'b']) {
    assert.deepEqual(mirror(R.B[k]), pts(L.B[k]));
    assert.deepEqual(mirror(R.C[k]), pts(L.C[k]));
  }
  R.A.forEach((d, i) => assert.deepEqual(mirror(d), pts(L.A[i])));
});
