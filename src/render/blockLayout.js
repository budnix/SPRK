import { getTileDef } from '../tiles/registry.js';

/**
 * Układ kostek blokady liniowej na pulpicie kostkowym (bez DOM) – jak na pulpitach typu E (ISDR / AC-20):
 * blokada to nie osobne pole u góry pulpitu, tylko zwykłe kostki przy końcu toru szlakowego.
 *
 *  - na kostce wyjazdu (skrajnej) i sąsiedniej – strzałki „wjazd” / „wyjazd” nad kanałem toru (lampki biała/czerwona);
 *  - w rzędzie obok toru (nad, a gdy zajęty – pod) – kostki przycisków, od krawędzi pulpitu do środka:
 *    Eap dwukierunkowa: Ko | Poz | Wbl; Eap jednokierunkowa wjazdowa: Ko; wyjazdowa: bez przycisków;
 *    SBL (samoczynna): Zk (zmiana kierunku);
 *  - w następnym rzędzie (lub po drugiej stronie toru / w tym samym rzędzie, gdy brak miejsca) – liczniki doraźne
 *    dKo | dPo z przyciskami (jednokierunkowa: tylko odpowiedni licznik).
 *
 * @returns Map exitId → { exit, dir, inward, arrows: [{ x, y, kind: 'in'|'out' }], name: { x, y } | null,
 *   devices: [{ x, y, role }] } – tylko dla wyjazdów W/E; wyjazdy bez miejsca na kostki pomijają je (devices: []).
 */
export function blockLayouts(station) {
  const out = new Map();
  const rows = station.desk?.rows ?? Infinity, cols = station.desk?.cols ?? Infinity;
  const used = new Set();
  for (const t of station.tiles) {
    const sp = t.type === 'label' ? { w: t.span || 1, h: 1 } : getTileDef(t.type).span;
    for (let dx = 0; dx < sp.w; dx++) for (let dy = 0; dy < sp.h; dy++) used.add(`${t.x + dx},${t.y + dy}`);
  }
  const free = (x, y) => x >= 0 && y >= 0 && x < cols && y < rows && !used.has(`${x},${y}`);
  const trackAt = (x, y) => station.tiles.find((t) => t.x === x && t.y === y && t.type === 'track');

  for (const [id, e] of Object.entries(station.exits || {})) {
    if (e.dir !== 'W' && e.dir !== 'E') continue;
    const { x, y } = e.tile;
    const inward = e.dir === 'W' ? 1 : -1;
    const fixed = e.direction;
    const auto = e.block === 'sbl';
    // strzałki: obie dla blokady dwukierunkowej i samoczynnej; jedna dla jednokierunkowej Eap
    const arrows = [];
    if (auto || !fixed) { arrows.push({ x, y, kind: 'in' }); if (trackAt(x + inward, y)) arrows.push({ x: x + inward, y, kind: 'out' }); }
    else arrows.push({ x, y, kind: fixed });
    const nameCell = trackAt(x + 2 * inward, y) ? { x: x + 2 * inward, y } : null;
    const buttons = auto ? ['Zk'] : fixed === 'in' ? ['Ko'] : fixed === 'out' ? [] : ['Ko', 'Poz', 'Wbl'];
    const counters = fixed === 'in' ? ['dKo'] : fixed === 'out' ? ['dPo'] : ['dKo', 'dPo'];
    const rowFree = (yy, n) => Array.from({ length: n }, (_, i) => free(x + i * inward, yy)).every(Boolean);
    let devices = null;
    for (const s of [-1, 1]) {
      if (!rowFree(y + s, buttons.length)) continue;
      const place = (yy, roles, from = 0) => roles.map((role, i) => ({ x: x + (from + i) * inward, y: yy, role }));
      if (rowFree(y + 2 * s, counters.length)) { devices = [...place(y + s, buttons), ...place(y + 2 * s, counters)]; break; }
      if (rowFree(y - s, counters.length)) { devices = [...place(y + s, buttons), ...place(y - s, counters)]; break; }
      if (rowFree(y + s, buttons.length + counters.length)) { devices = [...place(y + s, buttons), ...place(y + s, counters, buttons.length)]; break; }
    }
    devices ??= [];
    for (const d of devices) used.add(`${d.x},${d.y}`);
    out.set(id, { exit: id, dir: e.dir, inward, arrows, name: nameCell, devices });
  }
  return out;
}
