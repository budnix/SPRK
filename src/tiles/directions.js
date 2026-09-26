/**
 * Porty kostki – osiem kierunków geograficznych na siatce pulpitu.
 * Każda kostka toru łączy się z sąsiadem przez wspólny bok/róg.
 *
 *   NW  N  NE
 *    W  ·  E
 *   SW  S  SE
 */
export const DIRS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

/** Wektor przesunięcia na siatce dla portu. */
export const VEC = {
  N: [0, -1], NE: [1, -1], E: [1, 0], SE: [1, 1],
  S: [0, 1], SW: [-1, 1], W: [-1, 0], NW: [-1, -1],
};

/** Port po przeciwnej stronie (port wejściowy kostki sąsiedniej). */
export const OPPOSITE = {
  N: 'S', NE: 'SW', E: 'W', SE: 'NW',
  S: 'N', SW: 'NE', W: 'E', NW: 'SE',
};

/** Pozycja portu na krawędzi kostki 40×40 (środek kostki = 20,20). */
export const PORT_XY = {
  N: [20, 0], NE: [40, 0], E: [40, 20], SE: [40, 40],
  S: [20, 40], SW: [0, 40], W: [0, 20], NW: [0, 0],
};

/**
 * Kierunek jazdy „ogólny” (E = na wschód / w prawo, W = na zachód / w lewo)
 * dla portu, przez który pojazd opuszcza kostkę.
 */
export function heading(port) {
  if (port === 'E' || port === 'NE' || port === 'SE') return 'E';
  if (port === 'W' || port === 'NW' || port === 'SW') return 'W';
  return null; // N/S – tory pionowe nie mają kierunku wschód/zachód
}

export function isDir(p) {
  return DIRS.includes(p);
}

/** Długość geometryczna odcinka od środka kostki do portu (jednostka: bok kostki = 1). */
export function portLen(port) {
  return (port.length === 2) ? Math.SQRT1_2 : 0.5;
}

export function key(x, y) {
  return `${x},${y}`;
}
