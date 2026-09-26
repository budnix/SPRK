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
  srk: 'E',
  srkInfo: 'Stacja fikcyjna: urządzenia przekaźnikowe typu E z pulpitem kostkowym (wzorzec ISDR).',
  description: 'Mała stacja na linii jednotorowej Lipowa – Dąbrowa Leśna. Urządzenia przekaźnikowe typu E, blokada liniowa Eap.',
  location: 'Stacja fikcyjna na linii jednotorowej Lipowa – Dąbrowa Leśna.',
  traffic: '11 pociągów: osobowe z krzyżowaniami, towarowe przelotem, zdawczy z manewrami na bocznicę.',
  difficulty: 2,
  startTime: '05:52',
  desk: { cols: 32, rows: 10 },

  exits: {
    W: { name: 'Lipowa', tile: { x: 0, y: 4 }, dir: 'W', lineLength: 4200, lineSpeed: 100 },
    E: { name: 'Dąbrowa Leśna', tile: { x: 31, y: 4 }, dir: 'E', lineLength: 5100, lineSpeed: 100 },
  },

  sections: {
    ZbA: { length: 320, kind: 'approach' },
    Iz1: { length: 130, kind: 'point' },
    T1: { length: 520, kind: 'station', track: '1', platform: 'Peron I' },
    T2: { length: 300, kind: 'station', track: '2', platform: 'Peron I' },
    Iz3: { length: 70, kind: 'point' },
    T2b: { length: 75, kind: 'station', track: '2' },
    Iz4: { length: 140, kind: 'point' },
    ZbB: { length: 320, kind: 'approach' },
    T3w: { length: 30, kind: 'siding', track: '3' },
    T3: { length: 220, kind: 'siding', track: '3' },
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
    { ...T(23, 8, ['W', 'E'], 'T3w'), derailer: 'Wk1' },
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
   * Scenariusze: podzbiór rozkładu, czas, usterki zadane, zamknięcia torów, poziom zakłóceń.
   */
  scenarios: [
    { id: 'zmiana', name: 'Pełna zmiana (05:52–08:20)', description: 'Cały rozkład, 11 pociągów, dwa krzyżowania, pociąg zdawczy z manewrami na tor 3 i powrotem do Lipowej. Poziom zakłóceń do wyboru.', endTime: '08:40' },
    { id: 'krzyzowanie', name: 'Krzyżowanie (30 min)', description: 'Dwa osobowe z przeciwnych kierunków o tej samej porze. Przyjmij oba na różne tory i wypraw punktualnie.', trains: [5311, 5310], endTime: '06:25' },
    { id: 'awaria-zw3', name: 'Awaria zwrotnicy 3', description: 'Zwrotnica 3 traci kontrolę w porze przyjazdu pociągu zdawczego. Pociąg musi dojechać na tor 2, a zdawczy trzeba odstawić i wyprawić z powrotem.',
      trains: [5314, 5315, 90211, 5316, 90212], startTime: '07:10', endTime: '08:30', faults: [{ type: 'point-control', target: 'Zw3', at: '07:36', duration: 12 }], disruptions: 'none' },
    { id: 'tor1-zamkniety', name: 'Tor 1 zamknięty', description: 'Tor 1 zamknięty dla ruchu do 06:50 (roboty). Wszystkie pociągi przez tor 2, krzyżowanie niemożliwe – trzeba je rozegrać.',
      trains: [5311, 5310, 44120, 5312], endTime: '07:10', closedSections: [{ section: 'T1', from: '05:52', to: '06:50' }], disruptions: 'none' },
    { id: 'usterki', name: 'Zmiana z usterkami', description: 'Pełny rozkład, usterka semafora A i blokady do Lipowej. Sz, rozkazy pisemne i zapowiadanie telefoniczne.',
      endTime: '08:30', faults: [{ type: 'signal-fail', target: 'A', at: '06:35', duration: 15 }, { type: 'block-fail', target: 'W', at: '07:05', duration: 40 }], disruptions: 'low' },
  ],

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
    { nr: 90212, kind: 'tow', name: 'Zdawczy', unit: 90211, from: null, to: 'W', dep: '08:12', track: '2', stop: false, length: 180, vmax: 60 },
  ],

  /** Zadania manewrowe. */
  tasks: [
    { id: 'odstaw-90211', unit: 90211, type: 'move', toTrack: '3', deadline: '07:52', text: 'Skład zdawczego 90211 odstawić na tor 3 (tor 2 potrzebny; 5316 przyjeżdża 07:55).' },
    { id: 'podstaw-90212', unit: 90211, type: 'move', toTrack: '2', after: '07:58', deadline: '08:10', text: 'Skład podstawić na tor 2 jako pociąg 90212 do Lipowej (odjazd 08:12).' },
  ],
};
