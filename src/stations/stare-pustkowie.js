/**
 * Stacja Stare Pustkowie – mała stacja na linii jednotorowej.
 *
 * Układ: tor 1 (główny zasadniczy, peron), tor 2 (główny dodatkowy, peron),
 * tor 3 (boczny, ładunkowy, z kozłem i wykolejnicą Wk1).
 * Zwrotnice: 1 (głowica zachodnia), 3 (odgałęzienie toru 3), 4 (głowica wschodnia).
 * Semafory: A, B (wjazdowe), C1, C2 (wyjazdowe na zachód), D1, D2 (wyjazdowe na wschód, D2 z Ms2).
 * Tarcze manewrowe: Tm1 (tor 3), Tm2 (tor 2, kierunek zachodni).
 * Szlaki: W – Lipowa, E – Dąbrowa Leśna (blokada Eap).
 *
 * Siatka: 32 × 10 kostek. Współrzędne (x,y) od lewego górnego rogu.
 */

const T = (x, y, ports, section, extra = {}) => ({ x, y, type: 'track', ports, section, ...extra });
const H = (x1, x2, y, section, extra = {}) => Array.from({ length: x2 - x1 + 1 }, (_, i) => T(x1 + i, y, ['W', 'E'], section, extra));

export default {
  schemaVersion: 1,
  id: 'stare-pustkowie',
  name: 'Stare Pustkowie',
  description: 'Mała stacja na linii jednotorowej Lipowa – Dąbrowa Leśna. Urządzenia przekaźnikowe typu E, blokada liniowa Eap.',
  startTime: '05:52',
  desk: { cols: 32, rows: 10 },

  exits: {
    W: { name: 'Lipowa', tile: { x: 0, y: 4 }, dir: 'W', lineLength: 4200, lineSpeed: 100 },
    E: { name: 'Dąbrowa Leśna', tile: { x: 31, y: 4 }, dir: 'E', lineLength: 5100, lineSpeed: 100 },
  },

  sections: {
    ZbA: { length: 320, kind: 'approach' },
    Iz1: { length: 130, kind: 'point' },
    T1: { length: 520, kind: 'station', track: '1', platform: true },
    T2: { length: 300, kind: 'station', track: '2', platform: true },
    Iz3: { length: 70, kind: 'point' },
    T2b: { length: 75, kind: 'station', track: '2b' },
    Iz4: { length: 140, kind: 'point' },
    ZbB: { length: 320, kind: 'approach' },
    T3: { length: 160, kind: 'siding', track: '3' },
  },

  points: {
    Zw1: { speedDiverging: 40 },
    Zw3: { speedDiverging: 40 },
    Zw4: { speedDiverging: 40 },
  },

  tiles: [
    // ---- Blokady liniowe ----
    { x: 0, y: 0, type: 'block', exit: 'W' },
    { x: 28, y: 0, type: 'block', exit: 'E' },

    // ---- Nazwa stacji i przyciski grupowe ----
    { x: 12, y: 0, type: 'label', text: 'STARE PUSTKOWIE', size: 12, span: 8 },
    { x: 10, y: 1, type: 'button', id: 'Zw', label: 'Zw', role: 'group-point', color: 'black' },
    { x: 11, y: 1, type: 'button', id: 'Zz', label: 'Zz', role: 'point-lock', color: 'blue' },
    { x: 13, y: 1, type: 'button', id: 'Pz', label: 'Pz', role: 'route-release', color: 'grey' },
    { x: 14, y: 1, type: 'button', id: 'dPz', label: 'dPz', role: 'emergency-release', color: 'red', counter: true },
    { x: 16, y: 1, type: 'button', id: 'Sz', label: 'Sz', role: 'substitute', color: 'white', counter: true },

    // ---- Tor 1 (y = 4) ----
    ...H(1, 3, 4, 'ZbA'),
    { ...T(0, 4, ['W', 'E'], 'ZbA'), endButton: { id: 'kW', color: 'green' }, text: 'Lipowa' },
    ...H(4, 4, 4, 'Iz1'),
    { x: 5, y: 4, type: 'point', id: 'Zw1', label: '1', toe: 'W', straight: 'E', diverge: 'SE', section: 'Iz1' },
    T(6, 4, ['W', 'E'], 'Iz1'),
    ...H(7, 23, 4, 'T1'),
    T(24, 4, ['W', 'E'], 'Iz4'),
    T(25, 4, ['W', 'E'], 'Iz4'),
    { x: 26, y: 4, type: 'point', id: 'Zw4', label: '4', toe: 'E', straight: 'W', diverge: 'SW', section: 'Iz4' },
    T(27, 4, ['W', 'E'], 'Iz4'),
    ...H(28, 30, 4, 'ZbB'),
    { ...T(31, 4, ['W', 'E'], 'ZbB'), endButton: { id: 'kE', color: 'green' }, text: 'Dąbrowa L.' },

    // ---- Łącznice do toru 2 ----
    T(6, 5, ['NW', 'SE'], 'Iz1'),
    T(7, 6, ['NW', 'E'], 'Iz1'),
    T(25, 5, ['NE', 'SW'], 'Iz4'),
    T(24, 6, ['NE', 'W'], 'Iz4'),

    // ---- Tor 2 (y = 6) ----
    ...H(8, 19, 6, 'T2'),
    { x: 20, y: 6, type: 'point', id: 'Zw3', label: '3', toe: 'W', straight: 'E', diverge: 'SE', section: 'Iz3' },
    ...H(21, 23, 6, 'T2b'),

    // ---- Tor 3 (y = 8) ----
    T(21, 7, ['NW', 'SE'], 'Iz3'),
    T(22, 8, ['NW', 'E'], 'Iz3'),
    { ...T(23, 8, ['W', 'E'], 'T3'), derailer: 'Wk1' },
    ...H(24, 28, 8, 'T3'),
    { x: 29, y: 8, type: 'buffer', port: 'W', section: 'T3', endButton: { id: 'kT3', color: 'white' } },

    // ---- Sygnalizatory ----
    { x: 3, y: 3, type: 'signal', id: 'A', kind: 'semafor', at: { x: 3, y: 4 }, dir: 'E', entry: true },
    { x: 28, y: 5, type: 'signal', id: 'B', kind: 'semafor', at: { x: 28, y: 4 }, dir: 'W', entry: true },
    { x: 7, y: 5, type: 'signal', id: 'C1', kind: 'semafor', at: { x: 7, y: 4 }, dir: 'W' },
    { x: 9, y: 7, type: 'signal', id: 'C2', kind: 'semafor', at: { x: 9, y: 6 }, dir: 'W' },
    { x: 23, y: 3, type: 'signal', id: 'D1', kind: 'semafor', at: { x: 23, y: 4 }, dir: 'E' },
    { x: 19, y: 5, type: 'signal', id: 'D2', kind: 'semafor', at: { x: 19, y: 6 }, dir: 'E', shunting: true },
    { x: 19, y: 7, type: 'signal', id: 'Tm2', kind: 'tm', at: { x: 19, y: 6 }, dir: 'W' },
    { x: 25, y: 9, type: 'signal', id: 'Tm1', kind: 'tm', at: { x: 25, y: 8 }, dir: 'W' },

    // ---- Opisy ----
    { x: 14, y: 3, type: 'label', text: 'tor 1', span: 2 },
    { x: 14, y: 5, type: 'label', text: 'tor 2', span: 2 },
    { x: 26, y: 9, type: 'label', text: 'tor 3', span: 2 },
    { x: 24, y: 7, type: 'label', text: 'Wk1', size: 8 },
  ],

  routes: {
    disable: [],
    override: {},
  },

  /**
   * Rozkład jazdy. from/to – szlaki (W/E), arr/dep – czasy planowe na stacji,
   * track – tor planowy, stop – zatrzymanie, terminates – kończy bieg na stacji.
   */
  timetable: [
    { nr: 5311, kind: 'os', name: 'Osobowy', from: 'E', to: 'W', arr: '06:04', dep: '06:08', track: '2', stop: true, length: 130, vmax: 100, dwell: 60 },
    { nr: 5310, kind: 'os', name: 'Osobowy', from: 'W', to: 'E', arr: '06:05', dep: '06:07', track: '1', stop: true, length: 130, vmax: 100, dwell: 60 },
    { nr: 44120, kind: 'tow', name: 'Towarowy', from: 'W', to: 'E', arr: '06:25', track: '1', stop: false, length: 380, vmax: 70 },
    { nr: 5312, kind: 'os', name: 'Osobowy', from: 'W', to: 'E', arr: '06:45', dep: '06:46', track: '1', stop: true, length: 130, vmax: 100, dwell: 45 },
    { nr: 5313, kind: 'os', name: 'Osobowy', from: 'E', to: 'W', arr: '06:55', dep: '06:57', track: '1', stop: true, length: 130, vmax: 100, dwell: 60 },
    { nr: 44121, kind: 'tow', name: 'Towarowy', from: 'E', to: 'W', arr: '07:10', track: '1', stop: false, length: 400, vmax: 70 },
    { nr: 5315, kind: 'os', name: 'Osobowy', from: 'E', to: 'W', arr: '07:24', dep: '07:28', track: '2', stop: true, length: 130, vmax: 100, dwell: 60 },
    { nr: 5314, kind: 'os', name: 'Osobowy', from: 'W', to: 'E', arr: '07:25', dep: '07:27', track: '1', stop: true, length: 130, vmax: 100, dwell: 60 },
    { nr: 90211, kind: 'tow', name: 'Zdawczy', from: 'W', to: null, arr: '07:40', track: '2', stop: true, terminates: true, length: 180, vmax: 60, dwell: 30 },
    { nr: 5316, kind: 'os', name: 'Osobowy', from: 'W', to: 'E', arr: '07:55', dep: '07:56', track: '1', stop: true, length: 130, vmax: 100, dwell: 45 },
  ],
};
