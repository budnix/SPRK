/**
 * Przyciski grupowe pulpitu kostkowego typu E (bez DOM). Nie są częścią definicji stacji: stacja opisuje tor
 * i sygnalizację, a stanowisko samo wie, jakie ma przyciski. Stacja może najwyżej wskazać wolne miejsce na pulpicie
 * (`desk.controls: { x, y }`); bez wskazówki miejsce jest dobierane samo.
 *
 * Z tych samych pól korzystają: pulpit typu E (rysuje przyciski i liczniki), monitor (rysuje liczniki dPz i Sz),
 * pulpit IZH-111 (zostawia pola puste – rozkazy ma w osobnej grupie) oraz podział na ekrany i układ peronów
 * (pola są zajęte).
 */
export const E_GROUP_BUTTONS = [
  { id: 'Zw', label: 'Zw', role: 'group-point', color: 'black', dx: 0 },
  { id: 'Zz', label: 'Zz', role: 'point-lock', color: 'blue', dx: 1 },
  { id: 'Pz', label: 'Pz', role: 'route-release', color: 'grey', dx: 3 },
  { id: 'dPz', label: 'dPz', role: 'emergency-release', color: 'red', counter: true, dx: 4 },
  { id: 'Sz', label: 'Sz', role: 'substitute', color: 'white', counter: true, dx: 6 },
];

/** Szerokość grupy w kostkach (z odstępami między parami przycisków). */
export const CONTROLS_WIDTH = Math.max(...E_GROUP_BUTTONS.map((b) => b.dx)) + 1;

const cellsOf = (tile) => Array.from({ length: tile.type === 'label' ? tile.span || 1 : 1 }, (_, i) => `${tile.x + i},${tile.y}`);

/** Kostki przycisków zapisane w definicji stacji (dawny format) – mają pierwszeństwo, żeby stary plik wyglądał jak dotąd. */
export function legacyButtons(station) {
  return (station.tiles || []).filter((t) => t.type === 'button');
}

/** Czy grupa mieści się w rzędzie `y` od kolumny `x`, na wolnych polach pulpitu. */
export function controlsFit(station, x, y) {
  const { cols = 0, rows = 0 } = station.desk || {};
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || y >= rows || x + CONTROLS_WIDTH > cols) return false;
  const used = new Set((station.tiles || []).filter((t) => t.type !== 'button').flatMap(cellsOf));
  return E_GROUP_BUTTONS.every((b) => !used.has(`${x + b.dx},${y}`));
}

/**
 * Miejsce grupy przycisków: wskazówka stacji (`desk.controls`) albo – bez niej – drugi rząd pulpitu, na środku;
 * gdy tam jest zajęte, najbliższe wolne miejsce (najpierw w tym samym rzędzie, potem w kolejnych). Null, gdy
 * pulpit nie ma wolnego miejsca.
 */
export function controlAnchor(station) {
  const hint = station.desk?.controls;
  if (hint) return controlsFit(station, hint.x, hint.y) ? { x: hint.x, y: hint.y } : null;
  const { cols = 0, rows = 0 } = station.desk || {};
  const x0 = Math.max(0, Math.floor(cols / 2) - 6);
  const rowOrder = [1, 0, ...Array.from({ length: Math.max(0, rows - 2) }, (_, i) => i + 2)].filter((y) => y < rows);
  for (const y of rowOrder) {
    for (let d = 0; d < cols; d++) {
      for (const x of d ? [x0 - d, x0 + d] : [x0]) if (controlsFit(station, x, y)) return { x, y };
    }
  }
  return null;
}

/** Pola przycisków grupowych na pulpicie: [{ x, y, type: 'button', id, label, role, color, counter? }]. */
export function deskControls(station) {
  const legacy = legacyButtons(station);
  if (legacy.length) return legacy;
  const at = controlAnchor(station);
  if (!at) return [];
  return E_GROUP_BUTTONS.map(({ dx, ...b }) => ({ x: at.x + dx, y: at.y, type: 'button', ...b }));
}
