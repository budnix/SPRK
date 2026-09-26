import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planScreens, screenLabel } from '../src/render/screens.js';
import chylonia from '../src/stations/gdynia-chylonia.js';
import sopot from '../src/stations/sopot.js';
import orlowo from '../src/stations/gdynia-orlowo.js';
import gdynia from '../src/stations/gdynia-glowna.js';

const pointCols = (st) => new Set(st.tiles.filter((t) => t.type === 'point' || t.type === 'crossing' || (t.type === 'track' && t.ports.some((p) => /N|S/.test(p)))).map((t) => t.x));

test('podział na ekrany: liczba ekranów wg szerokości, pokrycie całego pulpitu, zakładka, cięcia poza rozjazdami i skosami', () => {
  for (const st of [chylonia, sopot, orlowo, gdynia]) {
    const win = [0, st.desk.cols - 1];
    for (const maxCols of [30, 40, 56, 200]) {
      const scr = planScreens(st, win, maxCols);
      const n0 = Math.max(1, Math.ceil(st.desk.cols / maxCols));
      assert.ok(scr.length >= Math.max(1, n0 - 1) && scr.length <= n0 + 1, `${st.id} maxCols=${maxCols}: ${scr.length} ekranów`);
      if (n0 === 1) assert.equal(scr.length, 1);
      assert.equal(scr[0].from, 0); assert.equal(scr.at(-1).to, st.desk.cols - 1);
      for (let i = 1; i < scr.length; i++) {
        assert.equal(scr[i].from, scr[i - 1].to + 1, 'ekrany przylegają');
        assert.ok(scr[i].x0 < scr[i].from && scr[i - 1].x1 > scr[i - 1].to, 'zakładka po obu stronach cięcia');
        const cut = scr[i].from;
        const busy = pointCols(st);
        assert.ok(!busy.has(cut) && !busy.has(cut - 1), `${st.id}: cięcie ${cut} przez głowicę (maxCols=${maxCols})`);
      }
      for (const s of scr) assert.ok(s.x1 - s.x0 + 1 <= maxCols * 1.7 + 4, `${st.id}: ekran ${s.x0}–${s.x1} za szeroki dla limitu ${maxCols}`);
    }
  }
});

test('nazwy ekranów: zachód / środek / wschód wg wyjazdów, jawny podział stacji ma pierwszeństwo', () => {
  const scr = planScreens(chylonia, [0, chylonia.desk.cols - 1], 40);
  assert.equal(scr.length, 3);
  assert.match(screenLabel(chylonia, scr[0], 0, 3), /^zachód/);
  assert.equal(screenLabel(chylonia, scr[1], 1, 3), 'środek');
  assert.match(screenLabel(chylonia, scr[2], 2, 3), /^wschód/);
  const custom = { ...sopot, screens: [{ x0: 0, x1: 60, name: 'głowica zachodnia' }, { x0: 55, x1: 111, name: 'perony' }] };
  const c = planScreens(custom, [0, 111], 30);
  assert.equal(c.length, 2); assert.equal(screenLabel(custom, c[0], 0, 2), 'głowica zachodnia');
});

test('monitor: opis „tor N · …” – numer toru i peron rysowane osobno, z opisu zostaje reszta', async () => {
  const { ScreenRenderer } = await import('../src/render/ScreenRenderer.js');
  const f = ScreenRenderer.labelText;
  assert.equal(f('tor 1'), null);
  assert.equal(f('tor 2 · Peron II'), null);
  assert.equal(f('tor 502a · Peron I (SKM)'), null);
  assert.equal(f('tor 6 · Baza EZ Sopot'), 'Baza EZ Sopot');
  assert.equal(f('linia 202'), 'linia 202');
  assert.equal(f('SZKOLNA'), 'SZKOLNA');
  assert.equal(f('Wk1'), 'Wk1');
});

test('miniatura planu stacji: SVG z torami, peronami i strzałkami szlaków każdej stacji', async () => {
  const { stationThumbnail } = await import('../src/render/thumbnail.js');
  const { STATIONS } = await import('../src/stations/index.js');
  for (const st of STATIONS) {
    const svg = stationThumbnail(st, { w: 320, h: 100 });
    assert.match(svg, /^<svg /, st.id);
    assert.ok(/<path d="M[\d.]+,[\d.]+L/.test(svg), `${st.id}: brak torów`);
    assert.ok((svg.match(/<rect /g) || []).length >= 2, `${st.id}: brak peronu`);
    assert.equal((svg.match(/fill="#3a4653"/g) || []).length, Object.keys(st.exits).length, `${st.id}: strzałki szlaków`);
    // wszystkie współrzędne w obrysie
    for (const [, x, y] of svg.matchAll(/[ML](-?[\d.]+),(-?[\d.]+)/g)) { assert.ok(+x >= 0 && +x <= 320 && +y >= 0 && +y <= 100, `${st.id}: punkt poza obrazem ${x},${y}`); }
  }
});
