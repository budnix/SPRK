/**
 * Normalizacja definicji stacji przed symulacją (bez DOM).
 *
 * Łącznice między torami równoległymi są w definicjach stacji jednym odcinkiem izolowanym z dwiema zwrotnicami
 * (np. `Iz1`: Zw1 + kostka skośna + Zw2). W rzeczywistości każda zwrotnica takiej łącznicy ma własny odcinek
 * izolowany – dzięki temu dwa przebiegi równoległe (np. wjazd na tor 502 i wyjazd z toru 501 w SKM) mogą być
 * utwierdzone jednocześnie, bo każdy zajmuje tylko „swoją” zwrotnicę w położeniu zasadniczym. `splitCrossovers`
 * dzieli każdy odcinek z dokładnie dwiema zwrotnicami (bez skrzyżowań) na dwa: zwrotnica, której numer zgadza się
 * z numerem odcinka (albo pierwsza), zostaje w odcinku o starej nazwie razem z kostkami między zwrotnicami;
 * druga dostaje odcinek `<prefiks><jej numer>` (np. `Iz2`, `IzS2`; przy kolizji nazw z przyrostkiem `b`).
 * Długość dzieli się po połowie. Definicja wejściowa nie jest modyfikowana.
 */
export function splitCrossovers(station) {
  const sections = { ...(station.sections || {}) };
  const tiles = station.tiles.map((t) => ({ ...t }));
  const bySec = new Map();
  for (const t of tiles) if (t.section) { if (!bySec.has(t.section)) bySec.set(t.section, []); bySec.get(t.section).push(t); }
  const split = [];
  for (const [sid, secTiles] of bySec) {
    const pts = secTiles.filter((t) => t.type === 'point');
    if (pts.length !== 2 || secTiles.some((t) => t.type === 'crossing') || !sections[sid]) continue;
    const prefix = sid.replace(/\d+$/, ''), num = sid.slice(prefix.length);
    const keeper = pts.find((p) => String(p.label) === num) || pts[0];
    const other = pts.find((p) => p !== keeper);
    let newId = `${prefix}${other.label}`;
    if (sections[newId] || newId === sid) newId = `${sid}b`;
    // kostki osiągalne z drugiej zwrotnicy bez przechodzenia przez pierwszą (zwykle sama zwrotnica, gdy skos jest
    // między nimi; skos zostaje przy pierwszej)
    const moved = new Set([other]);
    const at = (x, y) => secTiles.find((t) => t.x === x && t.y === y);
    const queue = [other];
    const DIRS = { N: [0, -1], NE: [1, -1], E: [1, 0], SE: [1, 1], S: [0, 1], SW: [-1, 1], W: [-1, 0], NW: [-1, -1] };
    while (queue.length) {
      const t = queue.shift();
      const ports = t.type === 'point' ? [t.toe, t.straight, t.diverge] : t.ports || [];
      for (const p of ports) {
        const [dx, dy] = DIRS[p];
        const n = at(t.x + dx, t.y + dy);
        if (!n || n === keeper || moved.has(n) || n.type === 'point') continue;
        // skos między zwrotnicami zostaje przy zwrotnicy-właścicielu, jeśli sąsiaduje z nią bezpośrednio
        const touchesKeeper = Object.values(DIRS).some(([ex, ey]) => keeper.x === n.x + ex && keeper.y === n.y + ey);
        if (touchesKeeper) continue;
        moved.add(n); queue.push(n);
      }
    }
    for (const t of moved) t.section = newId;
    const len = sections[sid].length;
    sections[newId] = { ...sections[sid], length: len != null ? Math.round(len / 2) : undefined };
    sections[sid] = { ...sections[sid], length: len != null ? len - Math.round(len / 2) : undefined };
    split.push({ from: sid, to: newId, keeper: keeper.id, moved: other.id });
  }
  return { ...station, sections, tiles, _split: split };
}

/** Pełna normalizacja definicji stacji używana przez symulację. */
export function normalizeStation(station) {
  return station._split ? station : splitCrossovers(station);
}
