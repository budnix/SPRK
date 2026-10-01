#!/usr/bin/env node
/**
 * Mapa Polski na ekran startowy – generator `src/ui/map/poland.js` (16 województw jako ścieżki SVG).
 *
 * Źródło: Natural Earth, „Admin 1 – States, Provinces”, skala 1:10m (wydanie 5.1.0), domena publiczna
 * (https://www.naturalearthdata.com/about/terms-of-use/). Obecny `poland.js` powstał z tego pliku (SHA-256 w nagłówku
 * wyniku):
 *   https://raw.githubusercontent.com/nvkelso/natural-earth-vector/117488dc884bad03366ff727eca013e434615127/geojson/ne_10m_admin_1_states_provinces.geojson
 * Plik ma ok. 40 MB – pobierz go poza repozytorium:
 *
 *   curl -L -o /tmp/ne_10m_admin_1_states_provinces.geojson <adres wyżej>
 *   node scripts/poland-map.mjs /tmp/ne_10m_admin_1_states_provinces.geojson          # zapis do src/ui/map/poland.js
 *   node scripts/poland-map.mjs /tmp/ne_10m_admin_1_states_provinces.geojson inny.js  # zapis gdzie indziej
 *
 * Kroki:
 *  1. Zostają obiekty z iso_a2 = 'PL'. Województwo wskazuje kod ISO 3166-2 z tabeli WOJ – literowy (PL-DS…, jak w danych
 *     Natural Earth) albo liczbowy (PL-02…, ISO od 2018 r.) – nie angielska nazwa.
 *  2. Pierścienie (wyspy, dziury) o polu mniejszym niż MIN_RING_AREA odpadają.
 *  3. Uproszczenie Douglasa–Peuckera w układzie (lon·cos, lat), tolerancja TOLERANCE stopni szerokości. Wspólne granice
 *     upraszcza się tak samo po obu stronach: zostają węzły (wierzchołki, w których zmienia się sąsiad), a łuk między
 *     węzłami upraszcza się zawsze w tym samym kierunku. Sąsiednie ścieżki mają więc na wspólnej granicy identyczne
 *     punkty – bez szczelin i zakładek.
 *  4. Rzut walcowy równoodległościowy (wzór przy PROJ w wyniku). Rzutuje się stałymi już zaokrąglonymi, tymi samymi co
 *     w wyniku – punkty liczone z PROJ (np. stacje) trafiają dokładnie w rysunek. Współrzędne do 0,1.
 *  5. Etykieta: środek ciężkości największego pierścienia, jeśli leży wewnątrz i nie przy samej granicy (co najmniej
 *     LABEL_DEPTH głębokości najlepszego punktu); inaczej punkt najdalszy od granicy (przeszukanie siatki co 1 px).
 *
 * Skrypt nie ma zależności; wynik zależy tylko od pliku wejściowego i stałych poniżej.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SOURCE_URL = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/117488dc884bad03366ff727eca013e434615127/geojson/ne_10m_admin_1_states_provinces.geojson';
const LICENSE_URL = 'https://www.naturalearthdata.com/about/terms-of-use/';
/** Tolerancja uproszczenia w stopniach szerokości geograficznej (0,01° ≈ 1,1 km). */
const TOLERANCE = 0.01;
/** Najmniejsze pole pierścienia w stopniach² układu (lon·cos, lat); 0,002 ≈ 25 km². */
const MIN_RING_AREA = 0.002;
/** Szerokość geograficzna, dla której liczy się cos w rzucie. */
const LAT_REF = 52;
/** Margines wokół kraju w stopniach: lon0 / lat0 to krawędź zachodnia / północna minus margines, w dół do 0,1°. */
const MARGIN = 0.1;
/** Docelowa szerokość rysunku (skala zaokrąglona do 0,1, więc wychodzi prawie dokładnie). */
const WIDTH = 1000;
/** Środek ciężkości jest etykietą, gdy jego odległość od granicy to co najmniej taka część najlepszej. */
const LABEL_DEPTH = 0.5;

/** Województwa w kolejności kodów TERYT: [TERYT, kod ISO 3166-2 literowy, id, nazwa]. */
const WOJ = [
  ['02', 'DS', 'dolnoslaskie', 'dolnośląskie'],
  ['04', 'KP', 'kujawsko-pomorskie', 'kujawsko-pomorskie'],
  ['06', 'LU', 'lubelskie', 'lubelskie'],
  ['08', 'LB', 'lubuskie', 'lubuskie'],
  ['10', 'LD', 'lodzkie', 'łódzkie'],
  ['12', 'MA', 'malopolskie', 'małopolskie'],
  ['14', 'MZ', 'mazowieckie', 'mazowieckie'],
  ['16', 'OP', 'opolskie', 'opolskie'],
  ['18', 'PK', 'podkarpackie', 'podkarpackie'],
  ['20', 'PD', 'podlaskie', 'podlaskie'],
  ['22', 'PM', 'pomorskie', 'pomorskie'],
  ['24', 'SL', 'slaskie', 'śląskie'],
  ['26', 'SK', 'swietokrzyskie', 'świętokrzyskie'],
  ['28', 'WN', 'warminsko-mazurskie', 'warmińsko-mazurskie'],
  ['30', 'WP', 'wielkopolskie', 'wielkopolskie'],
  ['32', 'ZP', 'zachodniopomorskie', 'zachodniopomorskie'],
];

const round = (v, digits) => { const f = 10 ** digits; return Math.round(v * f) / f; };
const key = (p) => `${p[0]},${p[1]}`;

/** Pierścienie geometrii (Polygon / MultiPolygon) bez powtórzonego punktu zamykającego. */
function ringsOf(geometry) {
  const polys = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.type === 'MultiPolygon' ? geometry.coordinates : [];
  const rings = [];
  for (const poly of polys) for (const ring of poly) {
    const r = ring.slice();
    if (r.length > 1 && key(r[0]) === key(r[r.length - 1])) r.pop();
    rings.push(r);
  }
  return rings;
}

/** Pole pierścienia ze znakiem (wzór Gaussa); `fx` zamienia punkt na [x, y]. */
function signedArea(ring, fx = (p) => p) {
  let a = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = fx(ring[i]);
    const [x2, y2] = fx(ring[(i + 1) % ring.length]);
    a += x1 * y2 - x2 * y1;
  }
  return a / 2;
}

/** Odległość punktu p od odcinka ab (dla a = b – od punktu a). */
function segDist(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2)) : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}

/** Douglas–Peucker na łuku (końce zostają); `xy` to punkty w układzie, w którym mierzy się tolerancję. */
function douglasPeucker(xy, tol) {
  const keep = new Array(xy.length).fill(false);
  keep[0] = keep[xy.length - 1] = true;
  const stack = [[0, xy.length - 1]];
  while (stack.length) {
    const [i, j] = stack.pop();
    let best = -1, bestD = tol;
    for (let k = i + 1; k < j; k++) {
      const d = segDist(xy[k], xy[i], xy[j]);
      if (d > bestD) { bestD = d; best = k; }
    }
    if (best >= 0) { keep[best] = true; stack.push([i, best], [best, j]); }
  }
  return keep;
}

/** Porządek leksykograficzny punktów [lon, lat] – kierunek upraszczania łuku nie zależy od strony granicy. */
const cmpPt = (a, b) => a[0] - b[0] || a[1] - b[1];

/** Uproszczenie łuku (tablica [lon, lat]) zawsze w tym samym kierunku: od punktu „mniejszego”. */
function simplifyArc(arc, cos) {
  let c = cmpPt(arc[0], arc[arc.length - 1]);
  if (c === 0 && arc.length > 2) c = cmpPt(arc[1], arc[arc.length - 2]);
  const fwd = c <= 0 ? arc : arc.slice().reverse();
  const keep = douglasPeucker(fwd.map(([lon, lat]) => [lon * cos, lat]), TOLERANCE);
  const out = fwd.filter((_, i) => keep[i]);
  return c <= 0 ? out : out.reverse();
}

/**
 * Uproszczenie pierścienia z zachowaniem wspólnych granic. `edgeOwners` – krawędź → zbiór województw, które ją mają;
 * `vertexOwners` – wierzchołek → zbiór województw.
 */
function simplifyRing(ring, edgeOwners, vertexOwners, cos) {
  const n = ring.length;
  const edgeSig = (i) => [...edgeOwners.get(edgeKey(ring[i], ring[(i + 1) % n]))].sort().join('|');
  const node = ring.map((p, i) => vertexOwners.get(key(p)).size >= 3 || edgeSig((i - 1 + n) % n) !== edgeSig(i));
  // pierścień bez węzłów (wyspa) albo z jednym: węzłem staje się też wierzchołek najdalszy od pierwszego węzła
  let first = node.indexOf(true);
  if (first < 0) { first = 0; node[0] = true; }
  if (node.filter(Boolean).length < 2) {
    let far = first, farD = -1;
    ring.forEach((p, i) => { const d = Math.hypot((p[0] - ring[first][0]) * cos, p[1] - ring[first][1]); if (d > farD) { farD = d; far = i; } });
    node[far] = true;
  }
  // start w węźle – inaczej przypadkowy początek pierścienia dzieliłby wspólny łuk tylko po jednej stronie
  const r = [...ring.slice(first), ...ring.slice(0, first)];
  const nd = [...node.slice(first), ...node.slice(0, first)];
  const out = [];
  let start = 0;
  for (let i = 1; i <= n; i++) {
    if (i < n && !nd[i]) continue;
    const arc = r.slice(start, i + 1);
    if (i === n) arc.push(r[0]);
    out.push(...simplifyArc(arc, cos).slice(0, -1));
    start = i;
  }
  return out;
}

const edgeKey = (a, b) => { const ka = key(a), kb = key(b); return ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`; };

// —— etykieta (w pikselach rysunku) ——

function insideRings(rings, [x, y]) {
  let inside = false;
  for (const r of rings) {
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const [xi, yi] = r[i], [xj, yj] = r[j];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
  }
  return inside;
}

function edgeDistance(rings, p) {
  let d = Infinity;
  for (const r of rings) for (let i = 0; i < r.length; i++) d = Math.min(d, segDist(p, r[i], r[(i + 1) % r.length]));
  return d;
}

function centroid(ring) {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i], [x2, y2] = ring[(i + 1) % ring.length];
    const f = x1 * y2 - x2 * y1;
    a += f; cx += (x1 + x2) * f; cy += (y1 + y2) * f;
  }
  return [cx / (3 * a), cy / (3 * a)];
}

/** Punkt etykiety: środek ciężkości największego pierścienia albo najgłębszy punkt siatki. */
function labelPoint(rings) {
  const main = rings.reduce((a, r) => (Math.abs(signedArea(r)) > Math.abs(signedArea(a)) ? r : a));
  const xs = main.map((p) => p[0]), ys = main.map((p) => p[1]);
  let best = null, bestD = -1;
  for (let x = Math.floor(Math.min(...xs)); x <= Math.max(...xs); x += 1) {
    for (let y = Math.floor(Math.min(...ys)); y <= Math.max(...ys); y += 1) {
      if (!insideRings(rings, [x, y])) continue;
      const d = edgeDistance(rings, [x, y]);
      if (d > bestD) { bestD = d; best = [x, y]; }
    }
  }
  const c = centroid(main);
  const cd = insideRings(rings, c) ? edgeDistance(rings, c) : 0;
  const useCentroid = cd >= LABEL_DEPTH * bestD;
  return { point: (useCentroid ? c : best).map((v) => round(v, 1)), useCentroid, depth: round(useCentroid ? cd : bestD, 1) };
}

// —— główny przebieg ——

function main() {
  const input = process.argv[2];
  if (!input) {
    console.error('Użycie: node scripts/poland-map.mjs <ne_10m_admin_1_states_provinces.geojson> [plik-wynikowy.js]');
    process.exit(2);
  }
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const output = resolve(process.argv[3] ?? resolve(root, 'src/ui/map/poland.js'));
  const raw = readFileSync(input);
  const sha256 = createHash('sha256').update(raw).digest('hex');
  const geo = JSON.parse(raw.toString('utf8'));

  const byIso = new Map();
  for (const [teryt, letters, id, name] of WOJ) {
    const w = { teryt, id, name };
    byIso.set(`PL-${letters}`, w);
    byIso.set(`PL-${teryt}`, w);
  }
  const cos = round(Math.cos((LAT_REF * Math.PI) / 180), 6);
  const regions = new Map();
  for (const f of geo.features) {
    if (f.properties.iso_a2 !== 'PL') continue;
    const w = byIso.get(f.properties.iso_3166_2);
    if (!w) throw new Error(`Nieznany kod województwa: ${f.properties.iso_3166_2} (${f.properties.name})`);
    if (regions.has(w.id)) throw new Error(`Województwo dwa razy w danych: ${w.id}`);
    const all = ringsOf(f.geometry);
    const rings = all.filter((r) => Math.abs(signedArea(r, ([lon, lat]) => [lon * cos, lat])) >= MIN_RING_AREA);
    regions.set(w.id, { ...w, rings, dropped: all.length - rings.length, sourcePoints: all.reduce((s, r) => s + r.length, 0) });
  }
  const missing = WOJ.filter(([, , id]) => !regions.has(id)).map(([, , id]) => id);
  if (missing.length) throw new Error(`Brak w danych: ${missing.join(', ')}`);

  // właściciele wierzchołków i krawędzi – podstawa wspólnych granic
  const vertexOwners = new Map(), edgeOwners = new Map();
  const own = (map, k, id) => { if (!map.has(k)) map.set(k, new Set()); map.get(k).add(id); };
  for (const reg of regions.values()) for (const r of reg.rings) r.forEach((p, i) => {
    own(vertexOwners, key(p), reg.id);
    own(edgeOwners, edgeKey(p, r[(i + 1) % r.length]), reg.id);
  });

  // stałe rzutu: krawędź zachodnia / północna minus margines (w dół do 0,1°), wschodni i południowy margines taki sam
  let minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity;
  for (const reg of regions.values()) for (const r of reg.rings) for (const [lon, lat] of r) {
    minLon = Math.min(minLon, lon); maxLon = Math.max(maxLon, lon); minLat = Math.min(minLat, lat); maxLat = Math.max(maxLat, lat);
  }
  const lon0 = round(Math.floor((minLon - MARGIN) * 10) / 10, 1);
  const lat0 = round(Math.ceil((maxLat + MARGIN) * 10) / 10, 1);
  const spanLon = maxLon - lon0 + (minLon - lon0);
  const spanLat = lat0 - minLat + (lat0 - maxLat);
  const scale = round(WIDTH / (spanLon * cos), 1);
  const w = Math.ceil(spanLon * scale * cos), h = Math.ceil(spanLat * scale);
  const project = ([lon, lat]) => [round((lon - lon0) * scale * cos, 1), round((lat0 - lat) * scale, 1)];

  const result = [];
  let total = 0, sourceTotal = 0;
  for (const [, , id] of WOJ) {
    const reg = regions.get(id);
    const rings = [];
    for (const r of reg.rings) {
      const px = simplifyRing(r, edgeOwners, vertexOwners, cos).map(project)
        .filter((p, i, a) => i === 0 || key(p) !== key(a[i - 1]));
      while (px.length > 1 && key(px[0]) === key(px[px.length - 1])) px.pop();
      if (px.length >= 3) rings.push(px);
    }
    for (const r of rings) for (const [x, y] of r) {
      if (x < 0 || y < 0 || x > w || y > h) throw new Error(`${id}: punkt (${x}, ${y}) poza rysunkiem ${w}×${h}`);
    }
    const label = labelPoint(rings);
    const d = rings.map((r) => `M${r.map((p) => p.join(',')).join('L')}Z`).join('');
    const points = rings.reduce((s, r) => s + r.length, 0);
    total += points; sourceTotal += reg.sourcePoints;
    result.push({ id, name: reg.name, label: label.point, d });
    console.log(`${id.padEnd(20)} ${String(reg.sourcePoints).padStart(4)} → ${String(points).padStart(4)} pkt, pierścienie: ${rings.length}`
      + `${reg.dropped ? ` (pominięte: ${reg.dropped})` : ''}, etykieta: ${label.useCentroid ? 'środek ciężkości' : 'najgłębszy punkt'}`
      + ` [${label.point}] ${label.depth} px od granicy`);
  }

  const cmd = `node scripts/poland-map.mjs ${basename(input)}`;
  const text = `/**
 * Mapa Polski – 16 województw jako ścieżki SVG. PLIK GENEROWANY – nie edytuj ręcznie, uruchom skrypt ponownie.
 *
 * Źródło: Natural Earth, Admin 1 – States, Provinces, 1:10m (ne_10m_admin_1_states_provinces.geojson,
 *   SHA-256 ${sha256})
 *   ${SOURCE_URL}
 * Licencja: domena publiczna – ${LICENSE_URL}
 * Polecenie: ${cmd}
 *   (scripts/poland-map.mjs; argument – ścieżka do pobranego pliku GeoJSON)
 * Uproszczenie: Douglas–Peucker, tolerancja ${TOLERANCE}° szerokości (≈ ${round(TOLERANCE * scale, 1)} px), wspólne granice
 *   upraszczane raz – sąsiednie ścieżki mają na granicy te same punkty; pominięte pierścienie mniejsze niż
 *   ${MIN_RING_AREA}°² (≈ ${Math.round(MIN_RING_AREA * 111.2 ** 2)} km²). Punkty: ${total} (w danych źródłowych ${sourceTotal}).
 *
 * Rzut walcowy równoodległościowy (lon, lat w stopniach → x, y w jednostkach VIEWBOX):
 *   x = (lon − PROJ.lon0) · PROJ.scale · PROJ.cos
 *   y = (PROJ.lat0 − lat) · PROJ.scale
 * PROJ.cos = cos ${LAT_REF}°; lon0 / lat0 – krawędź zachodnia / północna Polski z marginesem. Ścieżki policzono tymi
 * samymi (zaokrąglonymi) stałymi, więc punkt z tego wzoru trafia dokładnie w rysunek.
 *
 * VOIVODESHIPS: id – nasz identyfikator (bez znaków diakrytycznych), name – nazwa polska, d – ścieżka SVG (M/L/Z,
 * współrzędne bezwzględne), label – punkt etykiety wewnątrz województwa. Kolejność wg kodów TERYT.
 */
export const PROJ = { lon0: ${lon0}, lat0: ${lat0}, scale: ${scale}, cos: ${cos} };

export const VIEWBOX = [0, 0, ${w}, ${h}];

export const VOIVODESHIPS = [
${result.map((v) => `  { id: '${v.id}', name: '${v.name}', label: [${v.label.join(', ')}], d: '${v.d}' },`).join('\n')}
];
`;
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, text);
  console.log(`\nPROJ = { lon0: ${lon0}, lat0: ${lat0}, scale: ${scale}, cos: ${cos} }, VIEWBOX = [0, 0, ${w}, ${h}]`);
  console.log(`Punkty: ${total} (źródło: ${sourceTotal}); zapisano ${output} (${(Buffer.byteLength(text) / 1024).toFixed(1)} KB)`);
}

main();
