import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blockLayouts } from '../src/render/blockLayout.js';
import { STATIONS } from '../src/stations/index.js';
import szkolna from '../src/stations/szkolna.js';
import sopot from '../src/stations/sopot.js';
import wola from '../src/stations/wola-pustkowska.js';
import { getTileDef } from '../src/tiles/registry.js';

const straight = (st, x, y) => st.tiles.find((t) => t.x === x && t.y === y && t.type === 'track' && t.ports.every((p) => p === 'W' || p === 'E'));

test('kostki blokady Eap dwukierunkowej: strzałki na dwóch skrajnych kostkach toru, Ko | Poz | Wbl nad torem, dKo | dPo wyżej', () => {
  const L = blockLayouts(szkolna);
  const W = L.get('W'), E = L.get('E');
  assert.deepEqual(W.arrows, [{ x: 0, y: 4, kind: 'in' }, { x: 1, y: 4, kind: 'out' }]);
  assert.deepEqual(W.name, { x: 2, y: 4 });
  assert.deepEqual(W.devices, [
    { x: 0, y: 3, role: 'Ko' }, { x: 1, y: 3, role: 'Poz' }, { x: 2, y: 3, role: 'Wbl' },
    { x: 0, y: 2, role: 'dKo' }, { x: 1, y: 2, role: 'dPo' },
  ]);
  // prawy kraniec – lustrzanie, od krawędzi pulpitu do środka
  assert.deepEqual(E.arrows, [{ x: 31, y: 4, kind: 'in' }, { x: 30, y: 4, kind: 'out' }]);
  assert.deepEqual(E.devices.map((d) => [d.role, d.x, d.y]), [['Ko', 31, 3], ['Poz', 30, 3], ['Wbl', 29, 3], ['dKo', 31, 2], ['dPo', 30, 2]]);
});

test('blokada jednokierunkowa: jedna strzałka; wjazdowa ma Ko i dKo, wyjazdowa tylko dPo; SBL: Zk i licznik', () => {
  const Lw = blockLayouts(wola);
  assert.deepEqual(Lw.get('K1').arrows, [{ x: 0, y: 4, kind: 'out' }]); // tor wyjazdowy
  assert.deepEqual(Lw.get('K1').devices.map((d) => d.role), ['dPo']);
  assert.deepEqual(Lw.get('K2').arrows, [{ x: 0, y: 6, kind: 'in' }]); // tor wjazdowy
  assert.deepEqual(Lw.get('K2').devices.map((d) => [d.role, d.y]), [['Ko', 5], ['dKo', 7]]); // rząd 4 zajęty torem K1 → licznik pod torem
  const Ls = blockLayouts(sopot);
  assert.deepEqual(Ls.get('GD1').arrows.map((a) => a.kind), ['in', 'out']); // SBL: kierunek zmienny (Zk) – obie strzałki
  assert.deepEqual(Ls.get('GD1').devices.map((d) => d.role), ['Zk', 'dKo']);
  assert.deepEqual(Ls.get('GD2').devices.map((d) => d.role), ['Zk', 'dPo']);
});

test('każdy wyjazd każdej stacji ma komplet kostek blokady na wolnych polach pulpitu, bez nakładania', () => {
  for (const st of STATIONS) {
    const used = new Set();
    for (const t of st.tiles) {
      const sp = t.type === 'label' ? { w: t.span || 1, h: 1 } : getTileDef(t.type).span;
      for (let dx = 0; dx < sp.w; dx++) for (let dy = 0; dy < sp.h; dy++) used.add(`${t.x + dx},${t.y + dy}`);
    }
    const L = blockLayouts(st);
    for (const [id, e] of Object.entries(st.exits)) {
      const l = L.get(id);
      assert.ok(l, `${st.id}/${id}: brak układu blokady`);
      const auto = e.block === 'sbl', fixed = e.direction;
      const want = auto ? ['Zk', fixed === 'in' ? 'dKo' : 'dPo'] : fixed === 'in' ? ['Ko', 'dKo'] : fixed === 'out' ? ['dPo'] : ['Ko', 'Poz', 'Wbl', 'dKo', 'dPo'];
      assert.deepEqual(l.devices.map((d) => d.role), want, `${st.id}/${id}: role kostek`);
      for (const a of l.arrows) assert.ok(straight(st, a.x, a.y), `${st.id}/${id}: strzałka ${a.kind} nie na prostej kostce toru (${a.x},${a.y})`);
      assert.equal(l.arrows[0].x, e.tile.x, `${st.id}/${id}: pierwsza strzałka na kostce wyjazdu`);
      for (const d of l.devices) {
        const k = `${d.x},${d.y}`;
        assert.ok(!used.has(k), `${st.id}/${id}: kostka ${d.role} na zajętym polu ${k}`);
        assert.ok(d.x >= 0 && d.x < st.desk.cols && d.y >= 0 && d.y < st.desk.rows, `${st.id}/${id}: ${d.role} poza pulpitem`);
        assert.ok(Math.abs(d.y - e.tile.y) <= 2 && Math.abs(d.x - e.tile.x) <= 4, `${st.id}/${id}: ${d.role} daleko od końca toru`);
        used.add(k);
      }
    }
  }
});

test('gdy rząd nad torem jest zajęty, przyciski idą pod tor; bez miejsca – bez kostek (układ nie rzuca)', () => {
  const st = {
    desk: { cols: 8, rows: 6 },
    exits: { W: { tile: { x: 0, y: 2 }, dir: 'W', name: 'X' } },
    tiles: [
      ...[0, 1, 2, 3, 4].map((x) => ({ x, y: 2, type: 'track', ports: ['W', 'E'], section: 's' })),
      ...[0, 1, 2].map((x) => ({ x, y: 1, type: 'label', text: 'zajęte' })),
    ],
  };
  const L = blockLayouts(st).get('W');
  assert.deepEqual(L.devices.map((d) => [d.role, d.y]), [['Ko', 3], ['Poz', 3], ['Wbl', 3], ['dKo', 4], ['dPo', 4]]);
  const tight = { ...st, desk: { cols: 8, rows: 3 }, tiles: [...st.tiles, ...[0, 1, 2, 3, 4].map((x) => ({ x, y: 0, type: 'label', text: 'z' }))] };
  assert.deepEqual(blockLayouts(tight).get('W').devices, []);
});
