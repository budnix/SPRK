import { PORT_XY } from '../tiles/directions.js';

/**
 * Miniatura planu stacji (SVG jako tekst, bez DOM) – na karty ekranu startowego.
 * Rysuje tory (proste, skosy, łuki, zwrotnice, skrzyżowania), kozły, perony i strzałki szlaków
 * z definicji kostek; kolory jak na monitorze (ciemne tło, szare tory).
 */
export function stationThumbnail(station, { w = 320, h = 120, pad = 6 } = {}) {
  const tiles = station.tiles || [];
  const track = tiles.filter((t) => ['track', 'point', 'buffer', 'crossing'].includes(t.type));
  if (!track.length) return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}"></svg>`;
  const xs = track.map((t) => t.x), ys = track.map((t) => t.y);
  const x0 = Math.min(...xs), x1 = Math.max(...xs) + 1, y0 = Math.min(...ys), y1 = Math.max(...ys) + 1;
  const sx = (w - 2 * pad) / (x1 - x0), sy = (h - 2 * pad) / (y1 - y0);
  const s = Math.min(sx, sy); // zachowaj proporcje
  const ox = pad + ((w - 2 * pad) - (x1 - x0) * s) / 2, oy = pad + ((h - 2 * pad) - (y1 - y0) * s) / 2;
  const P = (t, port) => { const [px, py] = PORT_XY[port]; return [ox + (t.x - x0 + px / 40) * s, oy + (t.y - y0 + py / 40) * s]; };
  const C = (t) => [ox + (t.x - x0 + 0.5) * s, oy + (t.y - y0 + 0.5) * s];
  const seg = (a, b) => `M${a[0].toFixed(1)},${a[1].toFixed(1)}L${b[0].toFixed(1)},${b[1].toFixed(1)}`;
  const d = [];
  const dPlat = [];
  const platformSec = new Set(Object.entries(station.sections || {}).filter(([, sec]) => sec.platform).map(([id]) => id));
  for (const t of track) {
    const c = C(t);
    if (t.type === 'track') {
      const [a, b] = t.ports || [];
      if (a && b) { d.push(seg(P(t, a), c)); d.push(seg(c, P(t, b))); }
      if (platformSec.has(t.section)) dPlat.push(t);
    } else if (t.type === 'point') {
      d.push(seg(P(t, t.toe), c), seg(c, P(t, t.straight)), seg(c, P(t, t.diverge)));
    } else if (t.type === 'crossing') {
      for (const [a, b] of t.pairs || []) d.push(seg(P(t, a), P(t, b)));
    } else if (t.type === 'buffer') {
      d.push(seg(P(t, t.port), c));
      const [cx, cy] = c; d.push(seg([cx, cy - s * 0.2], [cx, cy + s * 0.2]));
    }
  }
  // perony: pas między dwoma torami peronowymi 2 rzędy od siebie lub obok toru
  const rows = new Map();
  for (const t of dPlat) { const k = t.y; if (!rows.has(k)) rows.set(k, []); rows.get(k).push(t.x); }
  const plats = [];
  const done = new Set();
  for (const [y, xsRow] of [...rows.entries()].sort((a, b) => a[0] - b[0])) {
    if (done.has(y)) continue;
    const other = [y + 2, y + 4].find((yy) => rows.has(yy) && !done.has(yy));
    const xa = Math.min(...xsRow), xb = Math.max(...xsRow);
    if (other) {
      const ox2 = rows.get(other); const X0 = Math.max(xa, Math.min(...ox2)), X1 = Math.min(xb, Math.max(...ox2));
      if (X1 - X0 >= 2) { plats.push([X0, X1, (y + other) / 2, other - y === 2 ? 0.5 : 1.2]); done.add(y); done.add(other); continue; }
    }
    plats.push([xa, xb, y - 0.7, 0.4]); done.add(y);
  }
  const platRects = plats.map(([X0, X1, yr, hc]) => `<rect x="${(ox + (X0 - x0 + 0.15) * s).toFixed(1)}" y="${(oy + (yr - y0 + 0.5) * s - hc * s / 2).toFixed(1)}" width="${((X1 - X0 + 0.7) * s).toFixed(1)}" height="${(hc * s).toFixed(1)}" rx="1" fill="#2a323a" stroke="#48535f" stroke-width="0.6"/>`).join('');
  const exits = Object.values(station.exits || {}).map((e) => {
    const t = { x: e.tile.x, y: e.tile.y }; const c = C(t); const dir = e.dir === 'E' ? 1 : -1;
    return `<path d="M${(c[0] - dir * s * 0.3).toFixed(1)},${(c[1] - s * 0.35).toFixed(1)}L${(c[0] + dir * s * 0.45).toFixed(1)},${c[1].toFixed(1)}L${(c[0] - dir * s * 0.3).toFixed(1)},${(c[1] + s * 0.35).toFixed(1)}Z" fill="#3a4653"/>`;
  }).join('');
  const sw = Math.max(1.2, s * 0.12).toFixed(2);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid meet" class="thumb">`
    + `<rect width="${w}" height="${h}" fill="#05080b"/>${platRects}`
    + `<path d="${d.join('')}" fill="none" stroke="#8a949e" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"/>${exits}</svg>`;
}
