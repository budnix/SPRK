import { PROJ, VIEWBOX, VOIVODESHIPS } from './poland.js';
import { RAIL_LINES } from './railLines.js';
import { RAIL_OVERVIEW } from './railOverview.js';
import { regionLayout } from '../catalog.js';
import { escapeHtml as esc } from '../dom.js';

/**
 * Mapa wyboru posterunku jako tekst SVG (bez DOM – testy w Node, tests/map.test.js): jedna tablica dyspozytorska
 * w jednostkach rysunku Polski (`src/ui/map/poland.js`), przybliżana przez `MapView` (atrybut viewBox). Warstwy:
 * województwa, sieć kolejowa w małym przybliżeniu (Natural Earth, `railOverview.js`), dokładny przebieg linii posterunków
 * (OpenStreetMap, `railLines.js`), nazwy województw z liczbą posterunków, numery linii, posterunki (lampka w obudowie
 * i tablica stacyjna – odnośnik do strony stacji). Znaczniki i napisy mają stały rozmiar na ekranie: grupa z
 * `data-x` / `data-y` dostaje od `MapView` przesunięcie i skalę (piksel ekranu w jednostkach rysunku).
 */

/** [szerokość, długość] → [x, y] w jednostkach `VIEWBOX` (rzut z nagłówka `poland.js`). */
export function project([lat, lon]) {
  return [(lon - PROJ.lon0) * PROJ.scale * PROJ.cos, (PROJ.lat0 - lat) * PROJ.scale];
}

/** Pierścienie ścieżki `d` (M/L/Z, współrzędne bezwzględne) jako listy punktów. */
export function pathRings(d) {
  const rings = [];
  for (const m of d.matchAll(/([ML])\s*(-?[\d.]+)[ ,](-?[\d.]+)/g)) {
    if (m[1] === 'M') rings.push([]);
    rings.at(-1).push([Number(m[2]), Number(m[3])]);
  }
  return rings;
}

/** Czy punkt leży w obszarze (reguła parzystości – wyspy i dziury liczą się poprawnie). */
export function insidePath(d, [x, y]) {
  let inside = false;
  for (const ring of pathRings(d)) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i], [xj, yj] = ring[j];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
  }
  return inside;
}

/** [x, y] w jednostkach `VIEWBOX` → [szerokość, długość] (odwrotność `project`). */
export function unproject([x, y]) {
  return [PROJ.lat0 - y / PROJ.scale, PROJ.lon0 + x / (PROJ.scale * PROJ.cos)];
}

/**
 * Wycinek schematu regionu w jednostkach `VIEWBOX`: posterunki (z `geo`) z 30 % zapasu, nie mniejszy niż `min` stopni
 * (widać wybrzeże, sąsiednie miasta), poszerzony do proporcji `aspect` (rysunek wypełnia ekran, a nie zwęża się do
 * pionowego paska); bez posterunków – całe województwo. Ten sam wycinek przycina przebieg linii
 * (`scripts/rail-lines.mjs`).
 */
export function regionBox(region, stations, { aspect = 1.8, min = { lat: 0.5, lon: 0.8 } } = {}) {
  const geo = stations.filter((s) => s.geo);
  let box;
  if (geo.length) {
    const lats = geo.map((s) => s.geo[0]), lons = geo.map((s) => s.geo[1]);
    const c = [(Math.min(...lats) + Math.max(...lats)) / 2, (Math.min(...lons) + Math.max(...lons)) / 2];
    const h = Math.max(min.lat, (Math.max(...lats) - Math.min(...lats)) * 1.3), w = Math.max(min.lon, (Math.max(...lons) - Math.min(...lons)) * 1.3);
    const [x0, y0] = project([c[0] + h / 2, c[1] - w / 2]), [x1, y1] = project([c[0] - h / 2, c[1] + w / 2]);
    box = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  } else {
    const pts = pathRings(VOIVODESHIPS.find((x) => x.id === region).d).flat();
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    box = { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
  }
  if (box.w / box.h < aspect) { const w = box.h * aspect; box.x -= (w - box.w) / 2; box.w = w; } else { const h = box.w / aspect; box.y -= (h - box.h) / 2; box.h = h; }
  return box;
}

/** Ciąg [szer., dł., …] → ścieżka SVG w jednostkach rysunku. */
function flatPath(flat) {
  const pts = [];
  for (let i = 0; i < flat.length; i += 2) {
    const [x, y] = project([flat[i], flat[i + 1]]);
    pts.push(`${x.toFixed(2)} ${y.toFixed(2)}`);
  }
  return `M${pts.join('L')}`;
}

/** Sieć w małym przybliżeniu (Natural Earth) – jedna ścieżka, stała grubość na ekranie. */
export function overviewPath() {
  return RAIL_OVERVIEW.map(flatPath).join('');
}

/**
 * Tablica: województwa (z posterunkami – wyróżnione, z liczbą), sieć, dokładne tory linii posterunków (linia przez co
 * najmniej dwa posterunki – jaśniejsza; bez danych OSM – odcinek prosty między kolejnymi posterunkami), numery linii
 * przy torze (środek odcinka między kolejnymi posterunkami, `data-len` – długość odcinka; krótki na ekranie – ukryty),
 * posterunki `stations` (z `geo`). `counts` – { województwo: n }, `mark(station)` – klasa przystanku (ocena gracza),
 * `label(name, n)` – opis województwa dla czytnika ekranu.
 */
export function boardSvg({ stations = [], counts = {}, mark = () => '', label = (name, n) => `${name}: ${n}`, href = (id) => `#/stacja/${id}` } = {}) {
  const geo = stations.filter((s) => s.geo);
  const regions = VOIVODESHIPS.map((v) => {
    const n = counts[v.id] || 0;
    return `<path class="mp-shape${n ? ' has' : ''}" d="${v.d}" data-region="${v.id}" vector-effect="non-scaling-stroke"><title>${esc(label(v.name, n))}</title></path>`;
  }).join('');
  // dokładne tory: linie posterunków; główny ciąg (co najmniej dwa posterunki) jaśniejszy
  const layout = regionLayout(geo, project);
  const at = Object.fromEntries(layout.nodes.map((n) => [n.id, n]));
  const busy = new Set(layout.segments.flatMap((g) => g.lines));
  const lineIds = [...new Set(geo.flatMap((st) => st.lines || []))].sort((a, b) => a - b);
  const tracks = lineIds.filter((l) => RAIL_LINES[l]).map((l) => {
    const d = RAIL_LINES[l].map(flatPath).join(''), hot = busy.has(l) ? ' hot' : '';
    return `<path class="rm-sleepers${hot}" d="${d}" vector-effect="non-scaling-stroke"/><path class="rm-rail${hot}" data-line="${l}" d="${d}" vector-effect="non-scaling-stroke"/>`;
  }).join('');
  const straight = layout.segments.filter((g) => g.lines.some((l) => !RAIL_LINES[l])).map((g) => {
    const a = at[g.a], b = at[g.b];
    return `<path class="rm-rail" data-lines="${g.lines.filter((l) => !RAIL_LINES[l]).join(' ')}" d="M${a.x.toFixed(2)} ${a.y.toFixed(2)}L${b.x.toFixed(2)} ${b.y.toFixed(2)}" vector-effect="non-scaling-stroke"/>`;
  }).join('');
  // numer linii: punkt toru najbliższy środka odcinka, odsunięty w lewo (nazwy posterunków są z prawej) o 12 px ekranu
  const nearest = (line, x, y) => {
    let best = null, bd = Infinity;
    for (const flat of RAIL_LINES[line] || []) for (let i = 0; i < flat.length; i += 2) {
      const p = project([flat[i], flat[i + 1]]), d = Math.hypot(p[0] - x, p[1] - y);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  };
  const lnums = layout.segments.map((g) => {
    const a = at[g.a], b = at[g.b];
    const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
    let nx = -dy / len, ny = dx / len;
    if (nx > 0) { nx = -nx; ny = -ny; }
    const m = nearest(g.lines[0], (a.x + b.x) / 2, (a.y + b.y) / 2) || [(a.x + b.x) / 2, (a.y + b.y) / 2];
    return `<g class="mv-lnum" data-x="${m[0].toFixed(2)}" data-y="${m[1].toFixed(2)}" data-len="${len.toFixed(2)}"><text class="rm-line" x="${(nx * 12).toFixed(1)}" y="${(ny * 12 + 4).toFixed(1)}">${g.lines.join(' · ')}</text></g>`;
  }).join('');
  // nazwy województw z liczbą posterunków (liczba – zapalona lampka)
  const rlabels = VOIVODESHIPS.map((v) => {
    const n = counts[v.id] || 0;
    return `<g class="mv-rlabel${n ? ' has' : ''}" data-x="${v.label[0]}" data-y="${v.label[1]}" data-region="${v.id}"><text class="mp-name">${esc(v.name)}</text>${n ? `<g class="mp-count" transform="translate(0 22)"><circle r="12"/><text>${n}</text></g>` : ''}</g>`;
  }).join('');
  const stops = geo.map((st) => {
    const [x, y] = project(st.geo);
    const w = Math.round(st.name.length * 8.1 + 18); // szerokość tablicy z nazwą (Inter 14 px półgruby)
    return `<a class="rm-stop mv-stop ${mark(st)}" href="${href(st.id)}" data-id="${esc(st.id)}" data-x="${x.toFixed(2)}" data-y="${y.toFixed(2)}" aria-label="${esc(st.name)}">
      <circle class="rm-halo" r="15"/><circle class="rm-housing" r="9"/><circle class="rm-lamp" r="5.5"/>
      <g class="rm-plate" transform="translate(16 -12)"><rect width="${w}" height="24" rx="2"/><rect class="rm-plate-edge" x="2.5" y="2.5" width="${w - 5}" height="19" rx="1"/><text x="9" y="16.5">${esc(st.name)}</text></g></a>`;
  }).join('');
  // obrys województw z posterunkami i podświetlenia (MapView) nad wypełnieniami wszystkich województw – inaczej sąsiad
  // rysowany później zasłania połowę linii na wspólnej granicy, a na wybrzeżu i granicy kraju widać ją całą
  const outlines = VOIVODESHIPS.filter((v) => counts[v.id]).map((v) => `<path class="mp-outline" d="${v.d}" vector-effect="non-scaling-stroke"/>`).join('');
  return `<svg class="mv-svg" viewBox="${VIEWBOX.join(' ')}" data-level="country">
    <g class="mv-regions">${regions}</g>
    <g class="mv-outlines" aria-hidden="true">${outlines}<path class="mp-hover" d=""/></g>
    <path class="mv-overview" d="${overviewPath()}" vector-effect="non-scaling-stroke" aria-hidden="true"/>
    <g class="mv-tracks" aria-hidden="true">${tracks}${straight}</g>
    <g class="mv-rlabels" aria-hidden="true">${rlabels}</g>
    <g class="mv-lnums" aria-hidden="true">${lnums}</g>
    <g class="mv-stops">${stops}</g></svg>`;
}
