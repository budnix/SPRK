import { getTileDef } from '../tiles/registry.js';
// geometria peronów jest w warstwie logiki (model bierze z niej miejsce zatrzymania) – tu rysunek i opisy torów
export { platformSpans } from '../tiles/platforms.js';

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
 * Położenie opisu „tor N” na pulpicie kostkowym (bez DOM): napis rysuje się zawsze NAD opisywanym torem, na kostce
 * toru (tuż nad paskiem), w kolumnie opisu lub najbliższej z prostą kostką toru. Zwraca { x, y: rząd toru,
 * side: 'top' }; gdy toru nie da się znaleźć – { x, y: własna kostka, side: null } (opis rysowany jak dotąd).
 */
export function trackLabelPlace(station, tile) {
  const keep = { x: tile.x, y: tile.y, side: null };
  const m = /^tor\s+(\S+)/i.exec(tile.text || '');
  if (!m) return keep;
  const secs = new Set(Object.entries(station.sections || {}).filter(([, s]) => String(s.track ?? '') === m[1]).map(([id]) => id));
  const straight = (t) => t.type === 'track' && secs.has(t.section) && !t.endButton && !t.derailer && t.ports.length === 2 && t.ports.every((q) => q === 'W' || q === 'E');
  for (const dy of [1, -1, 2, -2, 3, -3]) {
    const y = tile.y + dy;
    for (const dx of [0, 1, -1, 2, -2, 3, -3, 4, -4, 5, -5]) {
      if (station.tiles.some((t) => t.y === y && t.x === tile.x + dx && straight(t))) return { x: tile.x + dx, y, side: 'top' };
    }
  }
  return keep;
}
