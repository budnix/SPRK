import { test } from 'node:test';
import assert from 'node:assert/strict';
import { E_GROUP_BUTTONS, CONTROLS_WIDTH, controlAnchor, controlsFit, deskControls } from '../src/tiles/controls.js';
import { validateStation } from '../src/model/validate.js';
import { Simulation } from '../src/model/Simulation.js';
import { planScreens } from '../src/render/screens.js';
import { blockLayouts } from '../src/render/blockLayout.js';
import { STATIONS } from '../src/stations/index.js';
import starePustkowie from './fixtures/stare-pustkowie.js';
import wola from './fixtures/wola-pustkowska.js';

/* Przyciski grupowe należą do stanowiska, nie do definicji stacji */

const ALL = [...STATIONS, starePustkowie, wola];

test('żadna stacja nie ma kostek przycisków w definicji; każda ma miejsce na grupę przycisków stanowiska', () => {
  for (const st of ALL) {
    assert.deepEqual(st.tiles.filter((t) => t.type === 'button'), [], `${st.id}: kostki button w definicji`);
    const v = validateStation(st);
    assert.deepEqual(v.errors, [], st.id);
    assert.ok(!v.warnings.some((w) => /button|grupę przycisków/.test(w)), `${st.id}: ${v.warnings.join('; ')}`);
    const controls = deskControls(st);
    assert.deepEqual(controls.map((c) => c.id), ['Zw', 'Zz', 'Pz', 'dPz', 'Sz'], st.id);
    assert.deepEqual(controls.filter((c) => c.counter).map((c) => c.id), ['dPz', 'Sz']);
    // pola przycisków są wolne i leżą w jednym rzędzie pulpitu
    const used = new Set(st.tiles.flatMap((t) => Array.from({ length: t.type === 'label' ? t.span || 1 : 1 }, (_, i) => `${t.x + i},${t.y}`)));
    for (const c of controls) {
      assert.ok(!used.has(`${c.x},${c.y}`), `${st.id}: ${c.id} na zajętym polu (${c.x},${c.y})`);
      assert.ok(c.x >= 0 && c.x < st.desk.cols && c.y >= 0 && c.y < st.desk.rows, `${st.id}: ${c.id} poza pulpitem`);
      assert.equal(c.y, controls[0].y);
    }
    // blokada liniowa i przyciski grupowe nie zajmują tych samych pól
    const block = new Set([...blockLayouts(st).values()].flatMap((L) => L.devices.map((d) => `${d.x},${d.y}`)));
    for (const c of controls) assert.ok(!block.has(`${c.x},${c.y}`), `${st.id}: ${c.id} na polu blokady`);
  }
});

test('miejsce grupy: środek drugiego rzędu, wskazówka stacji, omijanie zajętych pól, brak miejsca', () => {
  const desk = (cols, rows, tiles = [], controls) => ({ desk: { cols, rows, ...(controls ? { controls } : {}) }, tiles });
  assert.equal(CONTROLS_WIDTH, 7);
  assert.deepEqual(controlAnchor(desk(32, 10)), { x: 10, y: 1 });
  assert.deepEqual(deskControls(desk(32, 10)).map((c) => [c.x, c.y]), [[10, 1], [11, 1], [13, 1], [14, 1], [16, 1]]);
  assert.deepEqual(controlAnchor(desk(100, 16, [], { x: 28, y: 1 })), { x: 28, y: 1 });
  // odstępy w grupie (pola 12 i 15) mogą być zajęte; pole przycisku – nie
  assert.deepEqual(controlAnchor(desk(32, 10, [{ x: 12, y: 1, type: 'label', text: 'a' }, { x: 15, y: 1, type: 'label', text: 'b' }])), { x: 10, y: 1 });
  assert.deepEqual(controlAnchor(desk(32, 10, [{ x: 13, y: 1, type: 'label', text: 'a' }])), { x: 11, y: 1 }, 'najbliższe wolne miejsce w tym samym rzędzie (od kolumny 9 grupa też trafia na pole 13)');
  assert.deepEqual(controlAnchor(desk(32, 10, [{ x: 0, y: 1, type: 'label', text: 'a', span: 32 }])), { x: 10, y: 0 }, 'zajęty rząd – następny');
  assert.equal(controlAnchor(desk(5, 3)), null, 'za wąski pulpit');
  assert.deepEqual(deskControls(desk(5, 3)), []);
  assert.equal(controlsFit(desk(32, 10), 26, 1), false, 'grupa wychodzi poza pulpit');
  assert.equal(controlsFit(desk(32, 10), 25, 1), true);
  assert.equal(controlsFit(desk(32, 10), 10, 10), false);
  assert.deepEqual(E_GROUP_BUTTONS.map((b) => b.role), ['group-point', 'point-lock', 'route-release', 'emergency-release', 'substitute']);
});

test('walidacja: wskazówka na zajętym polu to błąd; stary plik z kostkami przycisków działa i dostaje ostrzeżenie', () => {
  const bad = { ...starePustkowie, desk: { ...starePustkowie.desk, controls: { x: 0, y: 4 } } };
  assert.ok(validateStation(bad).errors.some((e) => /desk\.controls \(0,4\)/.test(e)));
  const out = { ...starePustkowie, desk: { ...starePustkowie.desk, controls: { x: 30, y: 1 } } };
  assert.ok(validateStation(out).errors.some((e) => /desk\.controls/.test(e)));
  // dawny format: kostki przycisków w definicji – te same pola co dotąd, bez błędu
  const legacyTiles = [{ x: 20, y: 0, type: 'button', id: 'Zw', label: 'Zw', role: 'group-point', color: 'black' }, { x: 22, y: 0, type: 'button', id: 'Sz', label: 'Sz', role: 'substitute', color: 'white', counter: true }];
  const legacy = { ...starePustkowie, tiles: [...starePustkowie.tiles.filter((t) => !(t.y === 0 && t.x >= 20 && t.x <= 22)), ...legacyTiles] };
  const v = validateStation(legacy);
  assert.deepEqual(v.errors, []);
  assert.ok(v.warnings.some((w) => /przestarzałe/.test(w)));
  assert.deepEqual(deskControls(legacy), legacyTiles);
  const sim = new Simulation(legacy, { disruptions: 'none' });
  sim.press({ kind: 'group', id: 'Zw', role: 'group-point' });
  assert.ok(sim.press({ kind: 'point', id: 'Zw1' }).ok);
});

test('pola przycisków liczą się przy podziale na ekrany tak samo, jak dawne kostki', () => {
  const st = STATIONS.find((s) => s.id === 'rumia');
  const withTiles = { ...st, tiles: [...st.tiles, ...deskControls(st)] };
  for (const max of [36, 45, 60]) assert.deepEqual(planScreens(st, [0, st.desk.cols - 1], max), planScreens(withTiles, [0, st.desk.cols - 1], max));
  assert.deepEqual(st.desk.controls, { x: 44, y: 1 }, 'Rumia wskazuje miejsce inne niż domyślne');
  assert.equal(STATIONS.find((s) => s.id === 'szkolna').desk.controls, undefined, 'Szkolna korzysta z miejsca domyślnego');
});
