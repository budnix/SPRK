import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STATIONS } from '../src/stations/index.js';
import { REGIONS } from '../src/model/regions.js';
import { VOIVODESHIPS, VIEWBOX } from '../src/ui/map/poland.js';
import { project, unproject, pathRings, insidePath, polandMapSvg, regionMapSvg, regionBox } from '../src/ui/map/mapSvg.js';
import { RAIL_LINES } from '../src/ui/map/railLines.js';
import { dutyStations } from '../src/ui/catalog.js';

/*
 * Mapa wyboru posterunku (src/ui/map/): województwa z Natural Earth (dane generowane scripts/poland-map.mjs), rzut
 * współrzędnych stacji, mapa Polski i schemat regionu jako tekst SVG.
 */

const voiv = (id) => VOIVODESHIPS.find((v) => v.id === id);
const duty = dutyStations(STATIONS);

test('województwa na mapie to te same 16 co w modelu (identyfikator i nazwa), ścieżki w obrębie rysunku', () => {
  assert.deepEqual(VOIVODESHIPS.map((v) => [v.id, v.name]).sort(), Object.entries(REGIONS).sort());
  const [, , w, h] = VIEWBOX;
  for (const v of VOIVODESHIPS) {
    const pts = pathRings(v.d).flat();
    assert.ok(pts.length > 20, `${v.id}: kształt`);
    assert.ok(pts.every(([x, y]) => x >= 0 && x <= w && y >= 0 && y <= h), `${v.id}: w VIEWBOX`);
    assert.ok(insidePath(v.d, v.label), `${v.id}: etykieta wewnątrz`);
  }
});

test('rzut: miasta wojewódzkie wpadają we własne województwo; punkt poza obszarem – poza', () => {
  const cities = { pomorskie: [54.352, 18.646], mazowieckie: [52.23, 21.012], malopolskie: [50.062, 19.938], slaskie: [50.264, 19.023],
    dolnoslaskie: [51.108, 17.039], podlaskie: [53.133, 23.164], zachodniopomorskie: [53.428, 14.553] };
  for (const [id, geo] of Object.entries(cities)) {
    const p = project(geo);
    assert.ok(insidePath(voiv(id).d, p), `${id}: ${p}`);
    for (const other of VOIVODESHIPS.filter((v) => v.id !== id)) assert.ok(!insidePath(other.d, p), `${id} nie w ${other.id}`);
  }
  const square = 'M0 0L10 0L10 10L0 10Z';
  assert.ok(insidePath(square, [5, 5]) && !insidePath(square, [15, 5]));
  assert.ok(!insidePath(`${square}M2 2L8 2L8 8L2 8Z`, [5, 5]), 'dziura w obszarze');
});

test('każdy posterunek do służby ma współrzędne w swoim województwie (zamienione współrzędne, zły region – błąd)', () => {
  for (const st of duty) {
    assert.ok(Array.isArray(st.geo), `${st.id}: geo`);
    assert.ok(insidePath(voiv(st.region).d, project(st.geo)), `${st.id}: ${st.geo} w ${st.region}`);
  }
});

test('mapa Polski: 16 województw jako odnośniki do regionu, liczba posterunków tylko przy niepustych, kropki stacji', () => {
  const svg = polandMapSvg({ counts: { pomorskie: 9, slaskie: 2 }, stations: duty, label: (name, n) => `${name} (${n})` });
  const links = [...svg.matchAll(/<a class="mp-region( has)?" href="([^"]+)" data-region="([^"]+)" aria-label="([^"]+)"/g)];
  assert.equal(links.length, 16);
  for (const m of links) assert.equal(m[2], `#/sluzba/${m[3]}`);
  assert.deepEqual(links.filter((m) => m[1]).map((m) => m[3]).sort(), ['pomorskie', 'slaskie']);
  assert.ok(links.some((m) => m[4] === 'pomorskie (9)'));
  assert.equal((svg.match(/class="mp-count"/g) || []).length, 2);
  assert.equal((svg.match(/class="mp-dot"/g) || []).length, duty.length);
});

test('schemat regionu: przystanki jako odnośniki do stron stacji, odcinki jak w regionLayout, rysunek poziomy, przystanki w kadrze', () => {
  const pom = duty.filter((s) => s.region === 'pomorskie');
  const svg = regionMapSvg('pomorskie', pom, { mark: (st) => (st.id === 'sopot' ? 'played' : '') });
  const [, w, h] = svg.match(/viewBox="0 0 (\d+) (\d+)"/).map(Number);
  assert.ok(w / h >= 1.79, `proporcje ${w}×${h}`);
  const stops = [...svg.matchAll(/<a class="rm-stop ([^"]*)" href="([^"]+)" data-id="([^"]+)"[^>]*>\s*<circle class="rm-halo" cx="([\d.-]+)" cy="([\d.-]+)"/g)];
  assert.deepEqual(stops.map((m) => m[3]).sort(), pom.map((s) => s.id).sort());
  for (const m of stops) {
    assert.equal(m[2], `#/stacja/${m[3]}`);
    assert.ok(+m[4] > 0 && +m[4] < w && +m[5] > 0 && +m[5] < h, `${m[3]} w kadrze`);
  }
  assert.equal(stops.find((m) => m[3] === 'sopot')[1].trim(), 'played');
  // przystanek: lampka w obudowie i nazwa na tablicy stacyjnej
  assert.equal((svg.match(/class="rm-lamp"/g) || []).length, pom.length);
  assert.match(svg, /<g class="rm-plate"[^>]*><rect[^>]*\/><rect class="rm-plate-edge"[^>]*\/><text[^>]*>Gdańsk Główny<\/text><\/g>/);
  // tory: rzeczywisty przebieg każdej linii posterunków (wszystkie mają dane OSM) – bez odcinków prostych
  const drawn = new Set([...svg.matchAll(/class="rm-rail(?: hot)?" data-line="(\d+)"/g)].map((m) => Number(m[1])));
  assert.deepEqual([...drawn].sort((a, b) => a - b), [...new Set(pom.flatMap((st) => st.lines))].sort((a, b) => a - b));
  assert.doesNotMatch(svg, /data-lines=/);
  // główny ciąg (linia przez co najmniej dwa posterunki) jaśniejszy niż odgałęzienia
  assert.match(svg, /class="rm-rail hot" data-line="202"/);
  assert.match(svg, /class="rm-rail" data-line="201"/);
  assert.match(svg, /<text class="rm-line"[^>]*>202 · 250<\/text>/, 'numer wspólnego odcinka');
  // linia bez danych o przebiegu: odcinek prosty między kolejnymi posterunkami
  const fake = [{ id: 'a', name: 'A', geo: [54.0, 18.0], lines: [999] }, { id: 'b', name: 'B', geo: [54.2, 18.3], lines: [999] }];
  assert.equal((regionMapSvg('pomorskie', fake).match(/class="rm-rail" data-lines="999"/g) || []).length, 1);
  // województwo bez posterunków: cały jego obszar, bez przystanków
  assert.equal((regionMapSvg('slaskie', []).match(/rm-stop/g) || []).length, 0);
});

test('przebieg linii (OpenStreetMap): każdy posterunek leży przy torze każdej swojej linii, tory w wycinku schematu', () => {
  const COS = Math.cos((52 * Math.PI) / 180), M = 111_320; // metry na stopień szerokości
  // odległość punktu od odcinka toru w metrach (tor uproszczony – wierzchołki bywają kilometr od siebie). Do 1 km: współrzędne
  // to budynek stacji, a obszar stacji ma ponad kilometr – linia kończy się w głowicy (9 w Gdańsku Gł., ok. 520 m), odgałęzienie
  // zaczyna się w głowicy (964 w Chyloni); zamienione współrzędne albo zły numer linii to kilka–kilkadziesiąt km
  const toSegment = ([la, lo], [la1, lo1], [la2, lo2]) => {
    const [px, py, ax, ay, bx, by] = [lo * COS * M, la * M, lo1 * COS * M, la1 * M, lo2 * COS * M, la2 * M];
    const dx = bx - ax, dy = by - ay, t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));
    return Math.hypot(px - ax - t * dx, py - ay - t * dy);
  };
  for (const st of duty) {
    for (const l of st.lines) {
      assert.ok(RAIL_LINES[l], `linia ${l}: brak przebiegu (node scripts/rail-lines.mjs)`);
      let best = Infinity;
      for (const flat of RAIL_LINES[l]) for (let i = 2; i < flat.length; i += 2) best = Math.min(best, toSegment(st.geo, [flat[i - 2], flat[i - 1]], [flat[i], flat[i + 1]]));
      assert.ok(best < 1000, `${st.id}: linia ${l} najbliżej ${Math.round(best)} m`);
    }
  }
  // dane przycięte do wycinka schematu (z zapasem) – plik nie rośnie o całą długość linii
  const b = regionBox('pomorskie', duty.filter((st) => st.region === 'pomorskie'));
  const [north, west] = unproject([b.x - b.w * 0.2, b.y - b.h * 0.2]), [south, east] = unproject([b.x + b.w * 1.2, b.y + b.h * 1.2]);
  for (const [l, parts] of Object.entries(RAIL_LINES)) for (const flat of parts) for (let i = 0; i < flat.length; i += 2) {
    assert.ok(flat[i] >= south && flat[i] <= north && flat[i + 1] >= west && flat[i + 1] <= east, `linia ${l}: punkt ${flat[i]}, ${flat[i + 1]} poza wycinkiem`);
  }
  const [lat, lon] = unproject(project([54.35, 18.65]));
  assert.ok(Math.abs(lat - 54.35) < 1e-9 && Math.abs(lon - 18.65) < 1e-9, 'unproject odwraca project');
});
