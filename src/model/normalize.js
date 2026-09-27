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
 * Długość dzieli się po połowie. Grupa większa (trzy i więcej zwrotnic albo skrzyżowanie w odcinku, np. Chylonia
 * `Iz21`) dzieli się na odcinek na każdą zwrotnicę i każde skrzyżowanie (`Iz21x`), a kostki proste idą do najbliższej
 * zwrotnicy – dzięki temu przebiegi po sąsiednich torach głównych nie blokują się nawzajem. Definicja wejściowa nie jest
 * modyfikowana.
 */
export function splitCrossovers(station) {
  const sections = { ...(station.sections || {}) };
  const tiles = station.tiles.map((t) => ({ ...t }));
  const bySec = new Map();
  for (const t of tiles) if (t.section) { if (!bySec.has(t.section)) bySec.set(t.section, []); bySec.get(t.section).push(t); }
  const split = [];
  const DIRS = { N: [0, -1], NE: [1, -1], E: [1, 0], SE: [1, 1], S: [0, 1], SW: [-1, 1], W: [-1, 0], NW: [-1, -1] };
  const portsOf = (t) => (t.type === 'point' ? [t.toe, t.straight, t.diverge] : t.ports || []);
  for (const [sid, secTiles] of bySec) {
    const pts = secTiles.filter((t) => t.type === 'point');
    const crossings = secTiles.filter((t) => t.type === 'crossing');
    if (pts.length < 2 || !sections[sid]) continue;
    const prefix = sid.replace(/\d+$/, ''), num = sid.slice(prefix.length);
    const keeper = pts.find((p) => String(p.label) === num) || pts[0];
    const at = (x, y) => secTiles.find((t) => t.x === x && t.y === y);
    const uniq = (base) => { let id = base, n = 2; while (sections[id] || id === sid) id = `${base}${n++ === 2 ? 'b' : n - 1}`; return id; };
    const len = sections[sid].length;
    if (pts.length === 2 && !crossings.length) {
      // łącznica: druga zwrotnica dostaje odcinek <prefiks><numer>; kostki osiągalne z niej bez przechodzenia przez
      // pierwszą (zwykle sama zwrotnica, gdy skos jest między nimi; skos przy pierwszej zostaje)
      const other = pts.find((p) => p !== keeper);
      const newId = uniq(`${prefix}${other.label}`);
      const moved = new Set([other]);
      const queue = [other];
      while (queue.length) {
        const t = queue.shift();
        for (const p of portsOf(t)) {
          const [dx, dy] = DIRS[p];
          const n = at(t.x + dx, t.y + dy);
          if (!n || n === keeper || moved.has(n) || n.type === 'point') continue;
          const touchesKeeper = Object.values(DIRS).some(([ex, ey]) => keeper.x === n.x + ex && keeper.y === n.y + ey);
          if (touchesKeeper) continue;
          moved.add(n); queue.push(n);
        }
      }
      for (const t of moved) t.section = newId;
      sections[newId] = { ...sections[sid], length: len != null ? Math.round(len / 2) : undefined };
      sections[sid] = { ...sections[sid], length: len != null ? len - Math.round(len / 2) : undefined };
      split.push({ from: sid, to: newId, keeper: keeper.id, moved: other.id });
      continue;
    }
    // grupa zwrotnic (np. Chylonia Iz21: 21, 24 na torach głównych + 22/26, 25/23 do torów 21/22 ze skrzyżowaniem):
    // każda zwrotnica i każde skrzyżowanie to własny odcinek; kostki proste idą do zwrotnicy, z której są osiągalne
    // najbliżej (skrzyżowanie nie przepuszcza); długość dzieli się po równo, reszta zostaje przy pierwszej
    const idOf = new Map([[keeper, sid]]);
    const created = [];
    for (const p of pts) if (p !== keeper) { const id = uniq(`${prefix}${p.label}`); idOf.set(p, id); created.push([id, p]); }
    crossings.forEach((c, i) => { const id = uniq(`${sid}x${i ? i + 1 : ''}`); idOf.set(c, id); created.push([id, c]); });
    const queue = [keeper, ...pts.filter((p) => p !== keeper)];
    while (queue.length) {
      const t = queue.shift();
      for (const p of portsOf(t)) {
        const [dx, dy] = DIRS[p];
        const n = at(t.x + dx, t.y + dy);
        if (!n || idOf.has(n) || n.type !== 'track') continue;
        idOf.set(n, idOf.get(t)); queue.push(n);
      }
    }
    for (const [t, id] of idOf) t.section = id;
    const parts = created.length + 1;
    const each = len != null ? Math.round(len / parts) : undefined;
    for (const [id, t] of created) { sections[id] = { ...sections[sid], length: each }; split.push({ from: sid, to: id, keeper: keeper.id, moved: t.id || `${t.type}@${t.x},${t.y}` }); }
    sections[sid] = { ...sections[sid], length: len != null ? len - each * created.length : undefined };
  }
  return { ...station, sections, tiles, _split: split };
}

/** Pełna normalizacja definicji stacji używana przez symulację. */
export function normalizeStation(station) {
  return station._split ? station : splitCrossovers(station);
}
