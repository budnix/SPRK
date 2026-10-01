import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STATIONS } from '../src/stations/index.js';
import { REGIONS } from '../src/model/regions.js';
import { VOIVODESHIPS, VIEWBOX } from '../src/ui/map/poland.js';
import { project, unproject, pathRings, insidePath, boardSvg, regionBox } from '../src/ui/map/mapSvg.js';
import { ZOOM, LEVELS, BASE_W, zoomOf, levelOf, fitBox, homeView, clampView, zoomAt, panBy, lerpView } from '../src/ui/map/zoom.js';
import { RAIL_OVERVIEW } from '../src/ui/map/railOverview.js';
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

test('tablica: 16 województw (z posterunkami – wyróżnione, z liczbą), sieć z Natural Earth, tory linii posterunków (OSM), przystanki', () => {
  const pom = duty.filter((s) => s.region === 'pomorskie');
  const svg = boardSvg({ stations: duty, counts: { pomorskie: 9, slaskie: 2 }, mark: (st) => (st.id === 'sopot' ? 'played' : ''), label: (name, n) => `${name} (${n})` });
  const shapes = [...svg.matchAll(/<path class="mp-shape( has)?" d="[^"]+" data-region="([^"]+)"[^>]*><title>([^<]+)<\/title>/g)];
  assert.equal(shapes.length, 16);
  assert.deepEqual(shapes.filter((m) => m[1]).map((m) => m[2]).sort(), ['pomorskie', 'slaskie']);
  assert.ok(shapes.some((m) => m[3] === 'pomorskie (9)'));
  assert.equal((svg.match(/class="mp-count"/g) || []).length, 2);
  assert.match(svg, /<path class="mv-overview" d="M/, 'sieć kolejowa w małym przybliżeniu');
  // przystanki: lampka i tablica, położenie w jednostkach rysunku (data-x / data-y), odnośnik do strony stacji
  const stops = [...svg.matchAll(/<a class="rm-stop mv-stop ([^"]*)" href="([^"]+)" data-id="([^"]+)" data-x="([\d.-]+)" data-y="([\d.-]+)"/g)];
  assert.deepEqual(stops.map((m) => m[3]).sort(), duty.map((s) => s.id).sort());
  for (const m of stops) {
    assert.equal(m[2], `#/stacja/${m[3]}`);
    const st = duty.find((s) => s.id === m[3]), [x, y] = project(st.geo);
    assert.ok(Math.abs(+m[4] - x) < 0.01 && Math.abs(+m[5] - y) < 0.01, `${m[3]} na swoim miejscu`);
  }
  assert.equal(stops.find((m) => m[3] === 'sopot')[1].trim(), 'played');
  assert.equal((svg.match(/class="rm-lamp"/g) || []).length, duty.length);
  assert.match(svg, /<g class="rm-plate"[^>]*><rect[^>]*\/><rect class="rm-plate-edge"[^>]*\/><text[^>]*>Gdańsk Główny<\/text><\/g>/);
  // tory: rzeczywisty przebieg każdej linii posterunków (wszystkie mają dane OSM), główny ciąg jaśniejszy
  const drawn = new Set([...svg.matchAll(/class="rm-rail(?: hot)?" data-line="(\d+)"/g)].map((m) => Number(m[1])));
  assert.deepEqual([...drawn].sort((a, b) => a - b), [...new Set(pom.flatMap((st) => st.lines))].sort((a, b) => a - b));
  assert.doesNotMatch(svg, /data-lines=/);
  assert.match(svg, /class="rm-rail hot" data-line="202"/);
  assert.match(svg, /class="rm-rail" data-line="201"/);
  // numery linii przy odcinkach między kolejnymi posterunkami, z długością odcinka (krótki na ekranie – ukryty)
  assert.match(svg, /<g class="mv-lnum" data-x="[\d.]+" data-y="[\d.]+" data-len="[\d.]+"><text class="rm-line"[^>]*>202 · 250<\/text><\/g>/);
  // linia bez danych o przebiegu: odcinek prosty między kolejnymi posterunkami
  const fake = [{ id: 'a', name: 'A', geo: [54.0, 18.0], lines: [999] }, { id: 'b', name: 'B', geo: [54.2, 18.3], lines: [999] }];
  assert.equal((boardSvg({ stations: fake }).match(/class="rm-rail" data-lines="999"/g) || []).length, 1);
  // sieć z Natural Earth: w granicach Polski (punkty przy granicy mogą wystawać o jeden odcinek)
  let inside = 0, all = 0;
  for (const flat of RAIL_OVERVIEW) for (let k = 0; k < flat.length; k += 2) { all++; if (VOIVODESHIPS.some((v) => insidePath(v.d, project([flat[k], flat[k + 1]])))) inside++; }
  assert.ok(all > 1000 && inside / all > 0.97, `sieć: ${inside}/${all} punktów w Polsce`);
});

test('przybliżanie: punkt pod kursorem zostaje w miejscu, granice przybliżenia, cała Polska mieści się w każdych proporcjach, poziomy szczegółów', () => {
  const v = { x: 100, y: 200, w: 400, h: 250 };
  const z = zoomAt(v, 2, [300, 300]);
  // punkt (300, 300) ma te same współrzędne względne w starym i nowym widoku
  assert.ok(Math.abs((300 - v.x) / v.w - (300 - z.x) / z.w) < 1e-12 && Math.abs((300 - v.y) / v.h - (300 - z.y) / z.h) < 1e-12);
  assert.equal(z.w, 200);
  assert.deepEqual(panBy(v, 10, -5), { x: 110, y: 195, w: 400, h: 250 });
  for (const aspect of [0.6, 1, 1.6, 2.4]) {
    const home = homeView(aspect), c = clampView(home, aspect);
    assert.ok(Math.abs(c.w - home.w) < 1e-9, `cała Polska przy proporcjach ${aspect}`);
    assert.ok(c.w >= VIEWBOX[2] - 1e-9 && c.h >= VIEWBOX[3] - 1e-9);
  }
  const deep = clampView(zoomAt(v, 1000, [300, 300]), 1.6);
  assert.ok(Math.abs(zoomOf(deep) - ZOOM.max) < 1e-9, 'najbliżej ZOOM.max');
  const far = clampView({ x: 5000, y: 5000, w: 50, h: 50 / 1.6 }, 1.6);
  assert.ok(far.x + far.w / 2 <= VIEWBOX[2] && far.y + far.h / 2 <= VIEWBOX[3], 'środek widoku nie ucieka poza Polskę');
  // poziom szczegółów z gęstości (piksele ekranu na jednostkę rysunku)
  assert.deepEqual([0.6, LEVELS.region - 0.01, LEVELS.region, LEVELS.detail - 0.01, LEVELS.detail, 30].map(levelOf), ['country', 'country', 'region', 'region', 'detail', 'detail']);
  // cała Polska na typowej mapie (900 px) – poziom kraju
  assert.equal(zoomOf({ w: BASE_W / 4 }), 4);
  const f = fitBox({ x: 0, y: 0, w: 100, h: 100 }, 2);
  assert.deepEqual(f, { x: -50, y: 0, w: 200, h: 100 });
  const mid = lerpView({ x: 0, y: 0, w: 100, h: 50 }, { x: 0, y: 0, w: 25, h: 12.5 }, 0.5);
  assert.ok(Math.abs(mid.w - 50) < 1e-9, 'przybliżenie zmienia się wykładniczo');
  assert.equal(levelOf(900 / homeView(900 / 560).w), 'country');
  // ekran województwa otwiera się z tablicami nazw na każdym ekranie: komputer, szeroki monitor, telefon
  const pom = duty.filter((s) => s.region === 'pomorskie');
  const box = regionBox('pomorskie', pom, { aspect: 0.5, min: { lat: 0.3, lon: 0.4 } }); // wąski – ekran poszerzy go do swoich proporcji
  for (const [w, h] of [[900, 560], [1400, 640], [360, 600]]) assert.equal(levelOf(w / fitBox(box, w / h).w), 'detail', `${w}×${h}`);
  // Trójmiasto na poziomie szczegółów: Reda i Rumia dalej od siebie niż wysokość tablicy (24 px)
  const [a, b] = ['reda', 'rumia'].map((id) => project(duty.find((s) => s.id === id).geo));
  assert.ok(Math.hypot(a[0] - b[0], a[1] - b[1]) * LEVELS.detail >= 24);
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
