#!/usr/bin/env node
/**
 * Przebieg linii kolejowych na schemat regionu – generator `src/ui/map/railLines.js`.
 *
 * Źródło: OpenStreetMap (© autorzy OpenStreetMap, licencja ODbL 1.0 – https://www.openstreetmap.org/copyright), relacje
 * `route=railway` z numerem linii PKP PLK w `ref`, pobrane przez Overpass API. Wynik jest bazą pochodną – też na ODbL
 * (nagłówek pliku), a mapa w grze podpisuje źródło.
 *
 *   node scripts/rail-lines.mjs                 # zapis do src/ui/map/railLines.js (potrzebny dostęp do sieci)
 *
 * Kroki:
 *  1. Linie: numery z pola `lines` posterunków do służby; obszar: wycinek schematu każdego województwa z posterunkami
 *     (`regionBox` z src/ui/map/mapSvg.js, ten sam co na ekranie) z zapasem MARGIN.
 *  2. Zapytanie Overpass: relacje route=railway z numerem linii w obszarze, z geometrią torów (`out geom`).
 *  3. Tory relacji (drogi z geometrią) łączone w ciągi po wspólnych końcach, przycinane do obszaru (punkt tuż za
 *     granicą zostaje – linia dochodzi do krawędzi), upraszczane (Douglas–Peucker, TOLERANCE stopni szerokości
 *     w układzie lon·cos, lat), współrzędne do 4 miejsc (ok. 10 m).
 *  4. Wynik: `RAIL_LINES = { numer: [[lat, lon, lat, lon, …], …] }` – ciągi punktów (płaska lista par), bez rzutu.
 *
 * Skrypt bez zależności (Node 18+, wbudowany fetch); wynik zależy od stanu OSM w chwili pobrania (data w nagłówku).
 */
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { STATIONS } from '../src/stations/index.js';
import { dutyStations } from '../src/ui/catalog.js';
import { regionBox, unproject } from '../src/ui/map/mapSvg.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, process.argv[2] || 'src/ui/map/railLines.js');
/** Publiczne serwery Overpass – kolejno, gdy pierwszy jest zajęty (504 / 429) albo nie odpowiada. */
const OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://overpass.private.coffee/api/interpreter'];
/** Zapas wokół wycinka schematu (część jego rozmiaru) – linia nie urywa się na krawędzi rysunku. */
const MARGIN = 0.1;
/** Tolerancja uproszczenia w stopniach szerokości (0,0006° ≈ 65 m – poniżej grubości toru na schemacie). */
const TOLERANCE = 0.0006;
const COS = Math.cos((52 * Math.PI) / 180);

const duty = dutyStations(STATIONS).filter((s) => s.geo && s.region);
const lines = [...new Set(duty.flatMap((s) => s.lines || []))].sort((a, b) => a - b);
// obszary: wycinek schematu każdego województwa z posterunkami, w stopniach
const areas = [...new Set(duty.map((s) => s.region))].sort().map((region) => {
  const b = regionBox(region, duty.filter((s) => s.region === region));
  const mx = b.w * MARGIN, my = b.h * MARGIN;
  const [north, west] = unproject([b.x - mx, b.y - my]), [south, east] = unproject([b.x + b.w + mx, b.y + b.h + my]);
  return { region, south, west, north, east };
});

const r4 = (v) => Math.round(v * 1e4) / 1e4;

async function overpass(area) {
  const bbox = [area.south, area.west, area.north, area.east].map((v) => v.toFixed(4)).join(',');
  const query = `[out:json][timeout:180];relation["route"="railway"]["ref"~"^(${lines.join('|')})$"](${bbox});out geom;`;
  const errors = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    for (const url of OVERPASS) {
      try {
        // bez nagłówka User-Agent serwer odrzuca zapytanie (pusta odpowiedź)
        const res = await fetch(url, { method: 'POST', headers: { 'User-Agent': 'SPRK-map-build/1.0 (scripts/rail-lines.mjs)', 'Content-Type': 'application/x-www-form-urlencoded' }, body: `data=${encodeURIComponent(query)}`, signal: AbortSignal.timeout(200_000) });
        if (res.ok) return await res.json();
        errors.push(`${url}: ${res.status}`);
      } catch (e) { errors.push(`${url}: ${e.message}`); }
    }
    await new Promise((r) => setTimeout(r, 20_000)); // serwery zajęte – chwila przerwy i druga runda
  }
  throw new Error(`Overpass niedostępny: ${errors.join('; ')}`);
}

/** Linia PKP (sieć lub zarządca PKP) – nie tramwaj ani kolej przemysłowa z tym samym numerem. */
function isPkp(tags = {}) {
  return /PKP/.test(`${tags.network || ''} ${tags.operator || ''}`);
}

/** Łączy drogi w ciągi po wspólnych końcach (także odwróconych). */
function chain(ways) {
  const key = (p) => `${p[0]},${p[1]}`;
  const parts = ways.map((w) => [...w]);
  let merged = true;
  while (merged) {
    merged = false;
    for (let i = 0; i < parts.length && !merged; i++) {
      for (let j = 0; j < parts.length && !merged; j++) {
        if (i === j) continue;
        const a = parts[i], b = parts[j];
        if (key(a.at(-1)) === key(b[0])) parts[i] = [...a, ...b.slice(1)];
        else if (key(a.at(-1)) === key(b.at(-1))) parts[i] = [...a, ...[...b].reverse().slice(1)];
        else if (key(a[0]) === key(b.at(-1))) parts[i] = [...b, ...a.slice(1)];
        else if (key(a[0]) === key(b[0])) parts[i] = [...[...b].reverse(), ...a.slice(1)];
        else continue;
        parts.splice(j, 1); merged = true;
      }
    }
  }
  return parts;
}

/** Przycięcie ciągu do obszaru: zostają kawałki wewnątrz, z jednym punktem za granicą na każdym końcu. */
function clip(pts, a) {
  const inside = ([lat, lon]) => lat >= a.south && lat <= a.north && lon >= a.west && lon <= a.east;
  const out = [];
  let cur = null;
  pts.forEach((p, i) => {
    if (inside(p)) {
      if (!cur) { cur = []; if (i > 0) cur.push(pts[i - 1]); }
      cur.push(p);
    } else if (cur) { cur.push(p); out.push(cur); cur = null; }
  });
  if (cur) out.push(cur);
  return out.filter((c) => c.length >= 2);
}

/** Douglas–Peucker w układzie (lon·cos, lat). */
function simplify(pts, tol) {
  if (pts.length < 3) return pts;
  const keep = new Array(pts.length).fill(false);
  keep[0] = keep[pts.length - 1] = true;
  const xy = pts.map(([lat, lon]) => [lon * COS, lat]);
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

const result = {};
let stamp = '';
for (const area of areas) {
  const data = await overpass(area);
  stamp = data.osm3s?.timestamp_osm_base || stamp;
  for (const rel of data.elements.filter((e) => e.type === 'relation' && isPkp(e.tags))) {
    const line = Number(rel.tags.ref);
    if (!lines.includes(line)) continue;
    const ways = rel.members.filter((m) => m.type === 'way' && Array.isArray(m.geometry) && m.geometry.length >= 2)
      .map((m) => m.geometry.filter(Boolean).map((g) => [g.lat, g.lon]));
    const parts = chain(ways).flatMap((pts) => clip(pts, area)).map((pts) => simplify(pts, TOLERANCE).map(([lat, lon]) => [r4(lat), r4(lon)]));
    if (parts.length) (result[line] ||= []).push(...parts.map((pts) => pts.flat()));
  }
}

const found = Object.keys(result).map(Number).sort((a, b) => a - b);
const points = Object.values(result).flat().reduce((n, p) => n + p.length / 2, 0);
const header = `/**
 * Przebieg linii kolejowych na schemat regionu. PLIK GENEROWANY – nie edytuj ręcznie: node scripts/rail-lines.mjs
 *
 * Źródło: © autorzy OpenStreetMap (https://www.openstreetmap.org/copyright), dane na licencji Open Database License
 * (ODbL) 1.0 – ten plik jest bazą pochodną na tej samej licencji. Relacje route=railway (numer linii PKP PLK w ref),
 * Overpass API, stan OSM: ${stamp}.
 * Obszary (wycinki schematów województw z posterunkami + ${MARGIN * 100} %): ${areas.map((a) => `${a.region} ${a.south.toFixed(2)}–${a.north.toFixed(2)}° N, ${a.west.toFixed(2)}–${a.east.toFixed(2)}° E`).join('; ')}.
 * Uproszczenie: Douglas–Peucker, tolerancja ${TOLERANCE}° szerokości; współrzędne do 4 miejsc. Punkty: ${points}.
 * Linie z danymi: ${found.join(', ')}${lines.filter((l) => !found.includes(l)).length ? `; bez relacji w OSM (schemat rysuje odcinek prosty): ${lines.filter((l) => !found.includes(l)).join(', ')}` : ''}.
 *
 * RAIL_LINES: { numer linii: [ciąg punktów jako płaska lista [szer., dł., szer., dł., …], …] }.
 */
`;
const body = `export const RAIL_LINES = {\n${found.map((l) => `  ${l}: [\n${result[l].map((p) => `    [${p.join(',')}],`).join('\n')}\n  ],`).join('\n')}\n};\n`;
writeFileSync(OUT, header + body);
console.log(`${OUT}: linie ${found.join(', ')}; punkty ${points}; ${Math.round((header + body).length / 1024)} KB`);
