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

test('perony: geometria wspólna dla monitora i pulpitu – wyspowy między torami 2 rzędy od siebie, nazwa z pola platform, napis omija opisy', async () => {
  const { platformSpans } = await import('../src/render/platforms.js');
  const szkolna = (await import('../src/stations/szkolna.js')).default;
  const sopot = (await import('../src/stations/sopot.js')).default;
  const p = platformSpans(szkolna, [0, 31]);
  assert.equal(p.length, 1);
  assert.equal(p[0].kind, 'island'); assert.equal(p[0].yRow, 5); assert.equal(p[0].name, 'Peron I');
  assert.ok(p[0].x0 >= 9 && p[0].x1 <= 19, `zakres ${p[0].x0}–${p[0].x1} między semaforami C2 i Tm2/D2 (T2w za C2 nie jest peronem)`);
  assert.equal(p[0].labelX, 10.5, 'na środku leży opis „tor 2” – napis peronu w wolnej części po lewej (9–12)');
  // monitor pomija opisy „tor N”, więc napis może stać na środku
  const pm = platformSpans(szkolna, [0, 31], (t) => (/^tor \d/.test(t) ? null : t));
  assert.equal(pm[0].labelX, (pm[0].x0 + pm[0].x1) / 2);
  const ps = platformSpans(sopot, [0, 111]);
  assert.deepEqual(ps.map((x) => x.name).sort(), ['Peron I (SKM)', 'Peron II']);
  assert.ok(ps.every((x) => x.kind === 'island'));
  // okno ekranu: peron poza oknem nie jest zwracany
  assert.equal(platformSpans(sopot, [0, 30]).length, 0);
});

test('opis toru na pulpicie kostkowym: „tor N” bez dopisku peronu, inne opisy bez zmian', async () => {
  const { trackLabelText } = await import('../src/render/platforms.js');
  assert.equal(trackLabelText('tor 2'), 'tor 2');
  assert.equal(trackLabelText('tor 502a · Peron I (SKM)'), 'tor 502a');
  assert.equal(trackLabelText('tor 6 · Baza EZ Sopot'), null); // dopisek inny niż peron zostaje w pełnym opisie
  assert.equal(trackLabelText('Wk1'), null);
  assert.equal(trackLabelText('SZKOLNA'), null);
});

test('krawędzie peronowe: peron wyspowy ma dwie (góra i dół), boczny jedną od strony toru; podwójna kreska odsunięta do środka', async () => {
  const { platformSpans, platformEdgeLines } = await import('../src/render/platforms.js');
  const szkolna = (await import('../src/stations/szkolna.js')).default;
  const [isl] = platformSpans(szkolna, [0, 31]);
  assert.equal(isl.kind, 'island');
  assert.deepEqual(isl.edges, ['top', 'bottom']);
  // peron boczny nad torem (rząd yRow = y toru − 1): krawędź od dołu; pod torem: od góry
  const side = { tiles: [
    ...Array.from({ length: 6 }, (_, i) => ({ x: i, y: 4, type: 'track', ports: ['W', 'E'], section: 'P' })),
    ...Array.from({ length: 6 }, (_, i) => ({ x: i, y: 3, type: 'track', ports: ['W', 'E'], section: 'Q' })),
  ], sections: { P: { platform: 'Peron I' }, Q: {} } };
  assert.deepEqual(platformSpans(side, [0, 10]).map((p) => [p.kind, p.yRow, p.edges]), [['side', 5, ['top']]]);
  assert.deepEqual(platformEdgeLines(10, 20, 100, 16, ['top', 'bottom'], 3), [[10, 23, 110, 23], [10, 33, 110, 33]]);
  assert.deepEqual(platformEdgeLines(10, 20, 100, 16, ['bottom'], 2.5), [[10, 33.5, 110, 33.5]]);
  assert.deepEqual(platformEdgeLines(0, 0, 1, 1, undefined), []);
});

test('perony: wyspowy tylko z torów z tą samą nazwą peronu; peron na odcinku zbliżania za stałym polem skrajnym; wyższe prostokąty', async () => {
  const { platformSpans, EDGE_COLS, PLATFORM_H } = await import('../src/tiles/platforms.js');
  const olsztyn = (await import('../src/stations/olsztyn-glowny.js')).default;
  // Olsztyn Zachodni na odcinkach zbliżania czterech linii od zachodu (y 22, 24, 26, 28): dawniej wyspowe z par od góry
  // (220 + 353 t.2 jako „III”, 353 t.1 + 216 jako „II”) na kolumnach 0–7 – pod strzałkami blokady i opisami szlaków
  const zach = platformSpans(olsztyn, [0, 20]).filter((p) => /Zachodni/.test(p.name));
  assert.deepEqual(zach.map((p) => [p.name, p.kind, p.yRow]), [
    ['Peron III (Olsztyn Zachodni)', 'side', 21], ['Peron II (Olsztyn Zachodni)', 'island', 25], ['Peron I (Olsztyn Zachodni)', 'side', 27],
  ]);
  assert.ok(zach.every((p) => p.x0 >= EDGE_COLS && p.x1 - p.x0 >= 5), zach.map((p) => `${p.x0}–${p.x1}`).join(' '));
  // tory co 2 rzędy: tor z sąsiadem o tej samej nazwie peronu – wyspowy z nim, inny tor obok – boczny; dwa tory o różnych
  // nazwach bez takich sąsiadów – wyspowy jak dotąd (Reda: „Peron I” i „Peron Ia”)
  const row = (y, sid, x0 = 0, x1 = 9) => Array.from({ length: x1 - x0 + 1 }, (_, i) => ({ x: x0 + i, y, type: 'track', ports: ['W', 'E'], section: sid }));
  const three = { tiles: [...row(4, 'P'), ...row(6, 'Q'), ...row(8, 'R')], sections: { P: { platform: 'Peron III' }, Q: { platform: 'Peron II' }, R: { platform: 'Peron II' } } };
  assert.deepEqual(platformSpans(three, [0, 20]).map((p) => [p.name, p.kind, p.yRow, p.hCells]), [['Peron III', 'side', 3, PLATFORM_H.side], ['Peron II', 'island', 7, PLATFORM_H.island2]]);
  const two = { tiles: [...row(4, 'P'), ...row(6, 'Q')], sections: { P: { platform: 'Peron I' }, Q: { platform: 'Peron Ia' } } };
  assert.deepEqual(platformSpans(two, [0, 20]).map((p) => [p.name, p.kind, p.yRow]), [['Peron I', 'island', 5]]);
  // wyjazd na wschód – peron przed stałym polem skrajnym
  const east = { tiles: row(4, 'Zb'), sections: { Zb: { platform: 'Peron I', halt: 'X' } }, exits: { E1: { tile: { x: 9, y: 4 }, dir: 'E' } } };
  assert.deepEqual(platformSpans(east, [0, 20]).map((p) => [p.x0, p.x1]), [[0, 9 - EDGE_COLS]]);
  // napis „Peron …” mieści się na wysokość: boczny i wyspowy (tory 2 rzędy od siebie) wyższe niż dawniej (0,5 i 0,7)
  assert.ok(PLATFORM_H.side > 0.5 && PLATFORM_H.island2 > 0.7 && PLATFORM_H.island2 < 1);
});

test('opis „tor N” na pulpicie kostkowym rysuje się nad opisywanym torem, na prostej kostce toru', async () => {
  const { trackLabelPlace, platformSpans, trackLabelText } = await import('../src/render/platforms.js');
  const szkolna = (await import('../src/stations/szkolna.js')).default;
  const { STATIONS } = await import('../src/stations/index.js');
  const lab = (st, txt) => st.tiles.find((t) => t.type === 'label' && t.text === txt);
  assert.deepEqual(trackLabelPlace(szkolna, lab(szkolna, 'tor 1')), { x: 14, y: 4, side: 'top' });
  assert.deepEqual(trackLabelPlace(szkolna, lab(szkolna, 'tor 2')), { x: 14, y: 6, side: 'top' }); // z wiersza peronu na kostkę toru 2
  assert.deepEqual(trackLabelPlace(szkolna, lab(szkolna, 'tor 3')), { x: 26, y: 8, side: 'top' }); // opis pod torem → napis nad torem
  assert.deepEqual(trackLabelPlace(szkolna, lab(szkolna, 'Wk1')), { x: 25, y: 7, side: null });
  assert.deepEqual(trackLabelPlace(szkolna, { x: 14, y: 5, type: 'label', text: 'tor 9' }), { x: 14, y: 5, side: null }); // brak toru
  // każdy opis toru na każdym pulpicie trafia na prostą kostkę toru o tym numerze, poza wierszami peronów
  for (const st of STATIONS) {
    const W = Math.max(...st.tiles.map((t) => t.x));
    const plats = platformSpans(st, [0, W]);
    const onPlatform = (x, y) => plats.some((p) => [Math.floor(p.yRow), Math.ceil(p.yRow)].includes(y) && x >= p.x0 - 1 && x <= p.x1 + 1);
    for (const t of st.tiles.filter((t) => t.type === 'label' && trackLabelText(t.text))) {
      const pos = trackLabelPlace(st, t);
      assert.equal(pos.side, 'top', `${st.id}: ${t.text} bez kostki toru`);
      const nr = trackLabelText(t.text).slice(4);
      const under = st.tiles.find((u) => u.x === pos.x && u.y === pos.y && u.type === 'track');
      assert.equal(String(st.sections[under.section].track), nr, `${st.id}: ${t.text} nad torem ${st.sections[under.section].track}`);
      assert.ok(!onPlatform(pos.x, pos.y), `${st.id}: ${t.text} w wierszu peronu`);
    }
  }
});
