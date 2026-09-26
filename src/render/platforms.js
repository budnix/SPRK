import { getTileDef } from '../tiles/registry.js';

/**
 * Geometria peronów z definicji stacji (bez DOM) – wspólna dla monitora i pulpitu kostkowego.
 * Peron wyspowy: dwa tory peronowe 2 lub 4 rzędy od siebie bez torów pomiędzy; inaczej peron boczny
 * w wolnym rzędzie obok toru. Zakres kolumn docinany do sygnalizatorów stojących w rzędzie peronu.
 *
 * @param station definicja stacji
 * @param win [x0, x1] okno kolumn
 * @param labelText (text) => tekst opisu faktycznie rysowany (null = opis pominięty) – do omijania napisem peronu
 * @returns [{ x0, x1, yRow, kind: 'island'|'side', hCells, name, labelX, edges }] – yRow może być połówkowy (między
 *   rzędami); edges: krawędzie peronowe (od strony toru peronowego) – 'top' i/lub 'bottom'; rysowane podwójną kreską
 */
export function platformSpans(station, win, labelText = (t) => t) {
  const [X0, X1] = win;
  const spans = [];
  for (const [sid, sec] of Object.entries(station.sections || {})) {
    if (!sec.platform) continue;
    const tiles = station.tiles.filter((t) => t.section === sid && t.type === 'track' && t.x >= X0 && t.x <= X1);
    if (!tiles.length) continue;
    const ys = [...new Set(tiles.map((t) => t.y))];
    if (ys.length !== 1) continue;
    spans.push({ sid, y: ys[0], x0: Math.min(...tiles.map((t) => t.x)), x1: Math.max(...tiles.map((t) => t.x)), done: false });
  }
  const TRACKY = new Set(['track', 'point', 'buffer', 'crossing', 'block', 'button']);
  const rowBusy = (y, x0, x1) => station.tiles.some((t) => t.y === y && t.x >= x0 && t.x <= x1 && TRACKY.has(t.type));
  const clip = (y, x0, x1) => {
    const mid = (x0 + x1) / 2;
    const sig = station.tiles.filter((t) => t.type === 'signal' && t.y === y && t.x >= x0 && t.x <= x1);
    const left = sig.filter((t) => t.x < mid).map((t) => t.x), right = sig.filter((t) => t.x >= mid).map((t) => t.x);
    return [left.length ? Math.max(x0, Math.max(...left) + 1) : x0, right.length ? Math.min(x1, Math.min(...right) - 1) : x1];
  };
  const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'];
  const nameOf = (...sp) => {
    const vals = sp.map((s) => station.sections[s.sid].platform);
    const v = vals.find((x) => typeof x === 'string') ?? vals.find((x) => typeof x === 'number');
    return typeof v === 'string' ? v : typeof v === 'number' ? `Peron ${ROMAN[v - 1] || v}` : 'Peron';
  };
  const out = [];
  const push = (x0, x1, yRow, kind, hCells, name, edges) => {
    if (x1 - x0 < 2) return;
    const rows = [Math.floor(yRow), Math.ceil(yRow)];
    const labels = station.tiles.filter((t) => t.type === 'label' && labelText(t.text) && rows.includes(t.y) && t.x + (t.span || 1) - 1 >= x0 && t.x <= x1);
    // napis peronu na środku, a gdy tam leży opis toru – w najszerszym wolnym odcinku peronu
    const mid = (x0 + x1) / 2;
    const covered = labels.map((t) => [t.x - 1, t.x + (t.span || 1)]);
    const inCovered = (c) => covered.some(([a, b]) => c >= a - 1 && c <= b + 1);
    let labelX = mid;
    if (inCovered(mid)) {
      const free = []; let start = x0;
      for (const [a, b] of covered.sort((p, q) => p[0] - q[0])) { if (a - 1 > start) free.push([start, a - 1]); start = Math.max(start, b + 1); }
      if (x1 > start) free.push([start, x1]);
      const best = free.filter(([a, b]) => b - a >= 2).sort((p, q) => (q[1] - q[0]) - (p[1] - p[0]))[0];
      if (best) labelX = (best[0] + best[1]) / 2;
    }
    out.push({ x0, x1, yRow, kind, hCells, name, labelX, edges });
  };
  spans.sort((a, b) => a.y - b.y);
  for (const a of spans) {
    if (a.done) continue;
    const b = spans.find((o) => !o.done && o !== a && (o.y === a.y + 2 || o.y === a.y + 4) && o.x0 <= a.x1 && o.x1 >= a.x0);
    if (b) {
      const W0 = Math.max(a.x0, b.x0), W1 = Math.min(a.x1, b.x1);
      let free = true;
      for (let y = a.y + 1; y < b.y; y++) if (rowBusy(y, W0, W1)) free = false;
      if (free) {
        let [c0, c1] = [W0, W1];
        for (let y = a.y + 1; y < b.y; y++) { const [q0, q1] = clip(y, W0, W1); c0 = Math.max(c0, q0); c1 = Math.min(c1, q1); }
        push(c0, c1, (a.y + b.y) / 2, 'island', b.y - a.y === 2 ? 0.7 : 1.1, nameOf(a, b), ['top', 'bottom']);
        a.done = b.done = true;
        continue;
      }
    }
    const side = !rowBusy(a.y - 1, a.x0, a.x1) ? a.y - 1 : !rowBusy(a.y + 1, a.x0, a.x1) ? a.y + 1 : null;
    if (side != null) { const [c0, c1] = clip(side, a.x0, a.x1); push(c0, c1, side, 'side', 0.5, nameOf(a), [side < a.y ? 'bottom' : 'top']); }
    a.done = true;
  }
  return out;
}

/**
 * Po której stronie kostki opisu „tor N” leży opisywany tor (bez DOM) – napis na pulpicie kostkowym rysuje się
 * przy tej krawędzi, żeby nie wpadał na obrys peronu między torami.
 * @returns 'up' | 'down' | null (opis nie dotyczy toru lub tor nie sąsiaduje z kostką)
 */
export function labelSide(station, tile) {
  const m = /^tor\s+(\S+)/i.exec(tile.text || '');
  if (!m) return null;
  const nr = m[1];
  const secs = new Set(Object.entries(station.sections || {}).filter(([, s]) => String(s.track ?? '') === nr).map(([id]) => id));
  const x0 = tile.x - 2, x1 = tile.x + (tile.span || 1) + 1;
  const near = (y) => station.tiles.some((t) => t.y === y && t.x >= x0 && t.x <= x1 && (t.type === 'track' || t.type === 'point') && secs.has(t.section));
  const down = near(tile.y + 1), up = near(tile.y - 1);
  return down && !up ? 'down' : up && !down ? 'up' : null;
}

/**
 * Opis toru na pulpicie kostkowym: „tor N” (ewentualny dopisek „· Peron …” pomija się – peron ma własny obrys
 * z nazwą). Taki opis mieści się na jednej kostce i rysuje się delikatnie. Inne opisy → null (rysowane jak dotąd).
 */
export function trackLabelText(text) {
  const m = /^tor\s+(\S+)(?:\s*·\s*Peron\b.*)?$/i.exec(text || '');
  return m ? `tor ${m[1]}` : null;
}

/**
 * Krawędzie peronowe jako podwójna kreska (jak na pulpitach nastawczych): dla obrysu [x, y, w, h] daje odcinki
 * [x1, y1, x2, y2] wewnętrznej linii przy każdej krawędzi z `edges`, odsunięte o `gap` do środka. Bez DOM.
 */
export function platformEdgeLines(x, y, w, h, edges, gap = 3) {
  const out = [];
  for (const e of edges || []) {
    if (e === 'top') out.push([x, y + gap, x + w, y + gap]);
    if (e === 'bottom') out.push([x, y + h - gap, x + w, y + h - gap]);
  }
  return out;
}

/**
 * Położenie opisu „tor N” na pulpicie kostkowym (bez DOM). Opis leży w wierszu peronu (między torami peronowymi)
 * → przenosi się na wolną kostkę po drugiej stronie opisywanego toru, żeby nie zasłaniał obrysu peronu; inaczej
 * zostaje na swojej kostce. Zwraca { x, y, side } – side to krawędź kostki od strony toru (jak w labelSide).
 */
export function trackLabelPlace(station, tile) {
  const keep = { x: tile.x, y: tile.y, side: labelSide(station, tile) };
  const m = /^tor\s+(\S+)/i.exec(tile.text || '');
  if (!m) return keep;
  const W = Math.max(...station.tiles.map((t) => t.x));
  const onPlatform = platformSpans(station, [0, W]).some((p) => {
    const rows = [Math.floor(p.yRow), Math.ceil(p.yRow)];
    return rows.includes(tile.y) && tile.x >= p.x0 - 1 && tile.x <= p.x1 + 1;
  });
  if (!onPlatform) return keep;
  const secs = new Set(Object.entries(station.sections || {}).filter(([, s]) => String(s.track ?? '') === m[1]).map(([id]) => id));
  const near = (y) => station.tiles.some((t) => t.y === y && Math.abs(t.x - tile.x) <= 3 && (t.type === 'track' || t.type === 'point') && secs.has(t.section));
  const ty = [1, 2, -1, -2].map((d) => tile.y + d).find(near); // rząd opisywanego toru
  if (ty == null) return keep;
  const y = ty + (ty > tile.y ? 1 : -1); // kostka za torem, patrząc od peronu
  const busy = station.tiles.some((t) => {
    if (t === tile) return false;
    const sp = t.type === 'label' ? { w: t.span || 1, h: 1 } : getTileDef(t.type)?.span || { w: 1, h: 1 };
    return tile.x >= t.x && tile.x < t.x + sp.w && y >= t.y && y < t.y + sp.h;
  });
  if (busy) return keep;
  return { x: tile.x, y, side: ty > tile.y ? 'up' : 'down' };
}
