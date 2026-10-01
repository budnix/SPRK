import { PROJ, VIEWBOX, VOIVODESHIPS } from './poland.js';
import { RAIL_LINES } from './railLines.js';
import { regionLayout } from '../catalog.js';
import { escapeHtml as esc } from '../dom.js';

/**
 * Mapa wyboru posterunku jako tekst SVG (bez DOM – testy w Node, tests/map.test.js): Polska z województwami
 * (`src/ui/map/poland.js`, dane generowane) i schemat regionu – posterunki jako przystanki na liniach.
 * Województwa i przystanki to odnośniki SVG (`<a href="#/…">`) – klik i klawiatura bez skryptu, adres ekranu z
 * `catalog.routeHash`.
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

/**
 * Polska: województwa z liczbą posterunków (`counts` – { region: n }; województwo z posterunkami jest wyróżnione,
 * etykieta z liczbą) i kropki stacji (`stations` z `geo`). `label(name, n)` – opis dla czytnika ekranu.
 */
export function polandMapSvg({ counts = {}, stations = [], href = (id) => `#/sluzba/${id}`, label = (name, n) => `${name}: ${n}` } = {}) {
  const regions = VOIVODESHIPS.map((v) => {
    const n = counts[v.id] || 0;
    return `<a class="mp-region${n ? ' has' : ''}" href="${href(v.id)}" data-region="${v.id}" aria-label="${esc(label(v.name, n))}">
      <path class="mp-shape" d="${v.d}"/>
      <text class="mp-name" x="${v.label[0]}" y="${v.label[1]}">${esc(v.name)}</text>
      ${n ? `<g class="mp-count" transform="translate(${v.label[0]} ${v.label[1] + 26})"><circle r="13"/><text>${n}</text></g>` : ''}
    </a>`;
  }).join('');
  const dots = stations.filter((s) => s.geo).map((s) => {
    const [x, y] = project(s.geo);
    return `<circle class="mp-dot" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4" data-id="${esc(s.id)}"/>`;
  }).join('');
  const grid = `<defs><pattern id="mp-grid" width="40" height="40" patternUnits="userSpaceOnUse"><path class="rm-gridline" d="M40 0H0V40"/></pattern></defs>
    <rect class="rm-board" x="-40" y="-40" width="${VIEWBOX[2] + 80}" height="${VIEWBOX[3] + 80}"/><rect class="rm-gridfill" x="-40" y="-40" width="${VIEWBOX[2] + 80}" height="${VIEWBOX[3] + 80}" fill="url(#mp-grid)"/>`;
  return `<svg class="mp-poland" viewBox="${VIEWBOX.join(' ')}" role="group">${grid}${regions}<g class="mp-dots" aria-hidden="true">${dots}</g></svg>`;
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

/**
 * Schemat regionu: kontur województwa, rzeczywisty przebieg linii kolejowych posterunków (`RAIL_LINES` z OpenStreetMap;
 * linia bez danych – odcinek prosty między kolejnymi posterunkami, `catalog.regionLayout`), numery linii przy torze,
 * posterunki jako przystanki z nazwą (odnośnik do strony stacji). Wycinek – `regionBox`; rysunek `width` × wysokość.
 * `mark(station)` – klasa przystanku (np. ocena gracza).
 */
export function regionMapSvg(region, stations, { width = 1000, aspect = 1.8, href = (id) => `#/stacja/${id}`, mark = () => '', min } = {}) {
  const geo = stations.filter((s) => s.geo);
  const box = regionBox(region, geo, { aspect, ...(min ? { min } : {}) });
  const s = width / box.w, height = Math.round(box.h * s);
  const px = ([x, y]) => [(x - box.x) * s, (y - box.y) * s];
  const layout = regionLayout(geo, (g) => px(project(g)));
  const at = Object.fromEntries(layout.nodes.map((n) => [n.id, n]));
  const shapes = VOIVODESHIPS.map((x) => `<path class="rm-shape${x.id === region ? ' own' : ''}" d="${x.d}" vector-effect="non-scaling-stroke"/>`).join('');
  // tory: rzeczywisty przebieg linii (RAIL_LINES, ciągi [szer., dł., …]) w pikselach rysunku
  const lineIds = [...new Set(geo.flatMap((st) => st.lines || []))].sort((a, b) => a - b);
  const tracks = Object.fromEntries(lineIds.filter((l) => RAIL_LINES[l]).map((l) => [l, RAIL_LINES[l].map((flat) => {
    const pts = [];
    for (let i = 0; i < flat.length; i += 2) pts.push(px(project([flat[i], flat[i + 1]])));
    return pts;
  })]));
  const pathOf = (pts) => `M${pts.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join('L')}`;
  const near = (line, x, y) => { // punkt toru linii najbliższy (x, y)
    let best = null, bd = Infinity;
    for (const pts of tracks[line] || []) for (const p of pts) { const d = Math.hypot(p[0] - x, p[1] - y); if (d < bd) { bd = d; best = p; } }
    return best;
  };
  // numer linii obok toru, po lewej (nazwy posterunków są z prawej): przy odcinku między kolejnymi posterunkami (punkt toru
  // najbliższy środka; krótki odcinek – bez numeru, zasłoniłby przystanki), linia z jednym posterunkiem – kawałek dalej
  const labels = [], taken = [];
  // zajęte miejsca: przystanek z nazwą (prostokąt na prawo) i już postawione numery – nowy numer nie nachodzi na nie
  const busy = (x, y) => taken.some((b) => x > b.x0 && x < b.x1 && y > b.y0 && y < b.y1);
  for (const n of layout.nodes) taken.push({ x0: n.x - 16, x1: n.x + 14 + 9 * (geo.find((g) => g.id === n.id).name.length), y0: n.y - 16, y1: n.y + 16 });
  const label = (text, x, y, dx, dy) => {
    const len = Math.hypot(dx, dy) || 1;
    let nx = -dy / len, ny = dx / len;
    if (nx > 0) { nx = -nx; ny = -ny; }
    const lx = x + nx * 12, ly = y + ny * 12 + 4;
    if (busy(lx - 4, ly - 4) || busy(lx - 7 * text.length, ly - 4)) return;
    taken.push({ x0: lx - 7.5 * text.length - 6, x1: lx + 6, y0: ly - 16, y1: ly + 6 });
    labels.push(`<text class="rm-line" x="${lx.toFixed(1)}" y="${ly.toFixed(1)}">${text}</text>`);
  };
  const straight = [];
  for (const g of layout.segments) {
    const a = at[g.a], b = at[g.b];
    const dx = b.x - a.x, dy = b.y - a.y;
    const missing = g.lines.filter((l) => !tracks[l]);
    if (missing.length) straight.push(`<path class="rm-rail" data-lines="${missing.join(' ')}" d="M${a.x.toFixed(1)} ${a.y.toFixed(1)}L${b.x.toFixed(1)} ${b.y.toFixed(1)}"/>`);
    if (Math.hypot(dx, dy) < 60) continue;
    const m = near(g.lines[0], (a.x + b.x) / 2, (a.y + b.y) / 2) || [(a.x + b.x) / 2, (a.y + b.y) / 2];
    label(g.lines.join(' · '), m[0], m[1], dx, dy);
  }
  const inSegments = new Set(layout.segments.flatMap((g) => g.lines));
  for (const l of lineIds.filter((x) => tracks[x] && !inSegments.has(x))) {
    const st = geo.find((x) => (x.lines || []).includes(l)), n = at[st.id];
    // pierwszy punkt toru 70–160 px od posterunku, wewnątrz rysunku
    const pts = tracks[l].flat().filter(([x, y]) => x > 20 && x < width - 20 && y > 20 && y < height - 20);
    const p = pts.find(([x, y]) => { const d = Math.hypot(x - n.x, y - n.y); return d >= 70 && d <= 160; });
    if (p) label(String(l), p[0], p[1], p[0] - n.x, p[1] - n.y);
  }
  const busyLines = new Set(layout.segments.flatMap((g) => g.lines));
  const rails = Object.entries(tracks).map(([l, parts]) => parts.map((pts) => {
    const d = pathOf(pts), hot = busyLines.has(Number(l)) ? ' hot' : '';
    return `<path class="rm-sleepers${hot}" d="${d}"/><path class="rm-rail${hot}" data-line="${l}" d="${d}"/>`;
  }).join('')).join('');
  const stops = geo.map((st) => {
    const n = at[st.id], x = n.x.toFixed(1), y = n.y.toFixed(1);
    const w = Math.round(st.name.length * 8.1 + 18); // szerokość tablicy z nazwą (Inter 14 px półgruby)
    return `<a class="rm-stop ${mark(st)}" href="${href(st.id)}" data-id="${esc(st.id)}" aria-label="${esc(st.name)}">
      <circle class="rm-halo" cx="${x}" cy="${y}" r="15"/><circle class="rm-housing" cx="${x}" cy="${y}" r="9"/><circle class="rm-lamp" cx="${x}" cy="${y}" r="5.5"/>
      <g class="rm-plate" transform="translate(${(n.x + 16).toFixed(1)} ${(n.y - 12).toFixed(1)})"><rect width="${w}" height="24" rx="2"/><rect class="rm-plate-edge" x="2.5" y="2.5" width="${w - 5}" height="19" rx="1"/><text x="9" y="16.5">${esc(st.name)}</text></g></a>`;
  }).join('');
  // tło tablicy dyspozytorskiej: siatka jak na pulpicie
  const grid = `<defs><pattern id="rm-grid-${region}" width="40" height="40" patternUnits="userSpaceOnUse"><path class="rm-gridline" d="M40 0H0V40"/></pattern></defs>
    <rect class="rm-board" width="${width}" height="${height}"/>`;
  return `<svg class="rm-region" viewBox="0 0 ${width} ${height}" role="group" data-region="${region}">${grid}
    <g transform="scale(${s.toFixed(4)}) translate(${(-box.x).toFixed(2)} ${(-box.y).toFixed(2)})" aria-hidden="true">${shapes}</g>
    <rect class="rm-gridfill" width="${width}" height="${height}" fill="url(#rm-grid-${region})" aria-hidden="true"/>
    <g class="rm-segs" aria-hidden="true">${rails}${straight.join('')}${labels.join('')}</g>${stops}</svg>`;
}
