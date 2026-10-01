#!/usr/bin/env node
/**
 * Sieć kolejowa Polski na mapę w małym przybliżeniu – generator `src/ui/map/railOverview.js`.
 *
 * Źródło: Natural Earth, „Railroads”, 1:10m (domena publiczna – https://www.naturalearthdata.com/about/terms-of-use/).
 * W większym przybliżeniu mapa rysuje dokładny przebieg linii posterunków z OpenStreetMap (`scripts/rail-lines.mjs`).
 *
 *   curl -L -o /tmp/ne_10m_railroads.geojson \
 *     https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_railroads.geojson
 *   node scripts/rail-overview.mjs /tmp/ne_10m_railroads.geojson
 *
 * Kroki: odcinki z punktami w granicach Polski (suma województw z `src/ui/map/poland.js`, w rzucie mapy) – przycięte do
 * kraju (punkt tuż za granicą zostaje), połączone po wspólnych końcach, uproszczone (Douglas–Peucker, TOLERANCE stopni
 * szerokości w układzie lon·cos, lat), współrzędne do 3 miejsc (ok. 100 m). Wynik: `RAIL_OVERVIEW = [[lat, lon, …], …]`.
 * Skrypt bez zależności.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { VOIVODESHIPS } from '../src/ui/map/poland.js';
import { project, insidePath } from '../src/ui/map/mapSvg.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const input = process.argv[2];
if (!input) { console.error('Użycie: node scripts/rail-overview.mjs <ne_10m_railroads.geojson> [wynik.js]'); process.exit(1); }
const OUT = resolve(ROOT, process.argv[3] || 'src/ui/map/railOverview.js');
const SOURCE_URL = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_railroads.geojson';
/** Tolerancja uproszczenia w stopniach szerokości (0,008° ≈ 900 m – w małym przybliżeniu niewidoczne). */
const TOLERANCE = 0.008;
const COS = Math.cos((52 * Math.PI) / 180);

const raw = readFileSync(input);
const sha = createHash('sha256').update(raw).digest('hex');
const data = JSON.parse(raw);
// najpierw prostokąt województwa (tani), dopiero potem wielokąt – kilkaset razy szybciej niż sam wielokąt
const boxes = VOIVODESHIPS.map((v) => {
  const xy = [...v.d.matchAll(/(-?[\d.]+)[ ,](-?[\d.]+)/g)].map((m) => [Number(m[1]), Number(m[2])]);
  return { v, x0: Math.min(...xy.map((p) => p[0])), x1: Math.max(...xy.map((p) => p[0])), y0: Math.min(...xy.map((p) => p[1])), y1: Math.max(...xy.map((p) => p[1])) };
});
const inPoland = ([lon, lat]) => {
  const p = project([lat, lon]);
  return boxes.some((b) => p[0] >= b.x0 && p[0] <= b.x1 && p[1] >= b.y0 && p[1] <= b.y1 && insidePath(b.v.d, p));
};

function simplify(pts, tol) {
  if (pts.length < 3) return pts;
  const keep = new Array(pts.length).fill(false);
  keep[0] = keep[pts.length - 1] = true;
  const xy = pts.map(([lon, lat]) => [lon * COS, lat]);
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop();
    const [ax, ay] = xy[s], [bx, by] = xy[e];
    const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy) || 1e-12;
    let best = -1, bi = -1;
    for (let i = s + 1; i < e; i++) {
      const d = Math.abs(dy * xy[i][0] - dx * xy[i][1] + bx * ay - by * ax) / len;
      if (d > best) { best = d; bi = i; }
    }
    if (best > tol) { keep[bi] = true; stack.push([s, bi], [bi, e]); }
  }
  return pts.filter((_, i) => keep[i]);
}

/** Łączy odcinki po wspólnych końcach (także odwróconych) – mniej ciągów, uproszczenie bez szwów. */
function chain(lines) {
  const key = (p) => `${p[0].toFixed(5)},${p[1].toFixed(5)}`;
  const ends = new Map();
  const add = (k, i) => { if (!ends.has(k)) ends.set(k, []); ends.get(k).push(i); };
  lines.forEach((l, i) => { add(key(l[0]), i); add(key(l.at(-1)), i); });
  const used = new Array(lines.length).fill(false);
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    if (used[i]) continue;
    used[i] = true;
    let cur = [...lines[i]];
    for (const atEnd of [true, false]) {
      for (;;) {
        const k = key(atEnd ? cur.at(-1) : cur[0]);
        const j = (ends.get(k) || []).find((x) => !used[x]);
        if (j == null) break;
        used[j] = true;
        let next = lines[j];
        if (atEnd) { if (key(next[0]) !== k) next = [...next].reverse(); cur = [...cur, ...next.slice(1)]; }
        else { if (key(next.at(-1)) !== k) next = [...next].reverse(); cur = [...next, ...cur.slice(1)]; }
      }
    }
    out.push(cur);
  }
  return out;
}

const parts = [];
for (const f of data.features) {
  const g = f.geometry;
  const lines = g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : [];
  for (const line of lines) {
    let cur = null;
    line.forEach((p, i) => {
      if (inPoland(p)) { if (!cur) { cur = []; if (i > 0) cur.push(line[i - 1]); } cur.push(p); }
      else if (cur) { cur.push(p); parts.push(cur); cur = null; }
    });
    if (cur) parts.push(cur);
  }
}
const chained = chain(parts.filter((p) => p.length >= 2)).map((pts) => simplify(pts, TOLERANCE)).filter((p) => p.length >= 2);
const r3 = (v) => Math.round(v * 1e3) / 1e3;
const flat = chained.map((pts) => pts.flatMap(([lon, lat]) => [r3(lat), r3(lon)]));
const points = flat.reduce((n, f) => n + f.length / 2, 0);
const header = `/**
 * Sieć kolejowa Polski na mapę w małym przybliżeniu. PLIK GENEROWANY – nie edytuj ręcznie, uruchom skrypt ponownie.
 *
 * Źródło: Natural Earth, Railroads 1:10m (ne_10m_railroads.geojson, SHA-256 ${sha}) – domena publiczna,
 *   https://www.naturalearthdata.com/about/terms-of-use/ ; ${SOURCE_URL}
 * Polecenie: node scripts/rail-overview.mjs ne_10m_railroads.geojson
 * Odcinki w granicach Polski, połączone i uproszczone (Douglas–Peucker, ${TOLERANCE}° szerokości), współrzędne do 3 miejsc.
 * Ciągi: ${flat.length}, punkty: ${points}. Dokładny przebieg linii posterunków – railLines.js (OpenStreetMap).
 *
 * RAIL_OVERVIEW: [ciąg punktów jako płaska lista [szer., dł., szer., dł., …], …].
 */
`;
const body = `export const RAIL_OVERVIEW = [\n${flat.map((f) => `  [${f.join(',')}],`).join('\n')}\n];\n`;
writeFileSync(OUT, header + body);
console.log(`${OUT}: ciągi ${flat.length}, punkty ${points}, ${Math.round((header + body).length / 1024)} KB`);
