/**
 * Stacja Szkolna – fikcyjna stacja treningowa dla misji wprowadzających (samouczek).
 *
 * Układ jak na małej stacji linii jednotorowej: tor 1 i 2 (perony), tor 3 (boczny, kozioł, wykolejnica Wk1).
 * Zwrotnice 1 (głowica zachodnia), 3 (odgałęzienie toru 3), 4 (głowica wschodnia).
 * Semafory: A, B (wjazdowe), C1, C2 (wyjazdowe na zachód), D1, D2 (wyjazdowe na wschód, D2 z Ms2).
 * Tarcze manewrowe: Tm1 (tor 3), Tm2 (tor 2, kierunek zachodni). Szlaki: Lipno (W), Dębno (E) – blokada Eap.
 *
 * Rozkład jest liniowy: każdy pociąg wprowadza jedno nowe zagadnienie (pozwolenie, przebieg wjazdowy,
 * Ko, Wbl, przelot, krzyżowanie, manewry ze składem kończącym bieg, usterka semafora – Sz,
 * usterka blokady – zapowiadanie telefoniczne). Kroki samouczka: src/tutorial/missions.js.
 */

const T = (x, y, ports, section, extra = {}) => ({ x, y, type: 'track', ports, section, ...extra });
const H = (x1, x2, y, section, extra = {}) => Array.from({ length: x2 - x1 + 1 }, (_, i) => T(x1 + i, y, ['W', 'E'], section, extra));

export default {
  schemaVersion: 1,
  id: 'szkolna',
  name: 'Szkolna',
  srk: 'komputerowe',
  srkInfo: 'Stacja fikcyjna, treningowa: stanowisko komputerowe (zobrazowanie wg Ie-104) z samouczkiem; ta sama stacja w misji 2 ma pulpit kostkowy typu E.',
  description: 'Stacja treningowa na linii jednotorowej Lipno – Dębno. Dwa tory peronowe, bocznica z kozłem, blokada liniowa Eap. Misje wprowadzające prowadzą krok po kroku.',
  startTime: '07:00',
  desk: { cols: 32, rows: 10 },

  exits: {
    W: { name: 'Lipno', tile: { x: 0, y: 4 }, dir: 'W', lineLength: 4200, lineSpeed: 100 },
    E: { name: 'Dębno', tile: { x: 31, y: 4 }, dir: 'E', lineLength: 5100, lineSpeed: 100 },
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
    { x: 0, y: 0, type: 'block', exit: 'W' },
    { x: 28, y: 0, type: 'block', exit: 'E' },

    { x: 12, y: 0, type: 'label', text: 'SZKOLNA', size: 12, span: 8 },
    { x: 10, y: 1, type: 'button', id: 'Zw', label: 'Zw', role: 'group-point', color: 'black' },
    { x: 11, y: 1, type: 'button', id: 'Zz', label: 'Zz', role: 'point-lock', color: 'blue' },
    { x: 13, y: 1, type: 'button', id: 'Pz', label: 'Pz', role: 'route-release', color: 'grey' },
    { x: 14, y: 1, type: 'button', id: 'dPz', label: 'dPz', role: 'emergency-release', color: 'red', counter: true },
    { x: 16, y: 1, type: 'button', id: 'Sz', label: 'Sz', role: 'substitute', color: 'white', counter: true },

    // tor 1 (y = 4)
    ...H(1, 3, 4, 'ZbA'),
    { ...T(0, 4, ['W', 'E'], 'ZbA'), endButton: { id: 'kW', color: 'green' }, text: 'Lipno' },
    ...H(4, 4, 4, 'Iz1'),
    { x: 5, y: 4, type: 'point', id: 'Zw1', label: '1', toe: 'W', straight: 'E', diverge: 'SE', section: 'Iz1' },
    T(6, 4, ['W', 'E'], 'Iz1'),
    ...H(7, 23, 4, 'T1'),
    T(24, 4, ['W', 'E'], 'Iz4'),
    T(25, 4, ['W', 'E'], 'Iz4'),
    { x: 26, y: 4, type: 'point', id: 'Zw4', label: '4', toe: 'E', straight: 'W', diverge: 'SW', section: 'Iz4' },
    T(27, 4, ['W', 'E'], 'Iz4'),
    ...H(28, 30, 4, 'ZbB'),
    { ...T(31, 4, ['W', 'E'], 'ZbB'), endButton: { id: 'kE', color: 'green' }, text: 'Dębno' },

    // łącznice do toru 2
    T(6, 5, ['NW', 'SE'], 'Iz1'),
    T(7, 6, ['NW', 'E'], 'Iz1'),
    T(25, 5, ['NE', 'SW'], 'Iz4'),
    T(24, 6, ['NE', 'W'], 'Iz4'),

    // tor 2 (y = 6)
    ...H(8, 19, 6, 'T2'),
    { x: 20, y: 6, type: 'point', id: 'Zw3', label: '3', toe: 'W', straight: 'E', diverge: 'SE', section: 'Iz3' },
    ...H(21, 23, 6, 'T2b'),

    // tor 3 (y = 8)
    T(21, 7, ['NW', 'SE'], 'Iz3'),
    T(22, 8, ['NW', 'E'], 'Iz3'),
    { ...T(23, 8, ['W', 'E'], 'T3w'), derailer: 'Wk1' },
    ...H(24, 28, 8, 'T3'),
    { x: 29, y: 8, type: 'buffer', port: 'W', section: 'T3', endButton: { id: 'kT3', color: 'white' } },

    // sygnalizatory
    { x: 3, y: 3, type: 'signal', id: 'A', kind: 'semafor', at: { x: 3, y: 4 }, dir: 'E', entry: true },
    { x: 28, y: 5, type: 'signal', id: 'B', kind: 'semafor', at: { x: 28, y: 4 }, dir: 'W', entry: true },
    { x: 7, y: 5, type: 'signal', id: 'C1', kind: 'semafor', at: { x: 7, y: 4 }, dir: 'W' },
    { x: 9, y: 7, type: 'signal', id: 'C2', kind: 'semafor', at: { x: 9, y: 6 }, dir: 'W' },
    { x: 23, y: 3, type: 'signal', id: 'D1', kind: 'semafor', at: { x: 23, y: 4 }, dir: 'E' },
    { x: 19, y: 5, type: 'signal', id: 'D2', kind: 'semafor', at: { x: 19, y: 6 }, dir: 'E', shunting: true },
    { x: 19, y: 7, type: 'signal', id: 'Tm2', kind: 'tm', at: { x: 19, y: 6 }, dir: 'W' },
    { x: 25, y: 9, type: 'signal', id: 'Tm1', kind: 'tm', at: { x: 25, y: 8 }, dir: 'W' },

    // opisy
    { x: 14, y: 3, type: 'label', text: 'tor 1', span: 2 },
    { x: 14, y: 5, type: 'label', text: 'tor 2', span: 2 },
    { x: 26, y: 9, type: 'label', text: 'tor 3', span: 2 },
    { x: 24, y: 7, type: 'label', text: 'Wk1', size: 8 },
  ],

  routes: { disable: [], override: {} },

  /**
   * Scenariusze. `tutorial` – identyfikator misji (src/tutorial/missions.js); `srk` – wymuszone stanowisko
   * (misja 2 uczy pulpitu kostkowego na tej samej stacji).
   */
  scenarios: [
    { id: 'nauka-1', name: 'Misja 1: stanowisko komputerowe (samouczek)', tutorial: 'monitor', srk: 'komputerowe', disruptions: 'none', endTime: '09:10',
      description: 'Krok po kroku: pozwolenie (Poz), przebieg wjazdowy i wyjazdowy, Ko i Wbl, przelot, krzyżowanie, STOP i zwolnienie przebiegu, zwrotnice, manewry składem kończącym bieg, sygnał zastępczy przy usterce semafora, zapowiadanie telefoniczne przy usterce blokady. Dymki wyjaśniają każdy skrót.',
      faults: [{ type: 'signal-fail', target: 'A', at: '08:33', duration: 10 }, { type: 'block-fail', target: 'W', at: '08:44', duration: 22 }] },
    { id: 'nauka-2', name: 'Misja 2: pulpit kostkowy typu E (samouczek)', tutorial: 'pulpit', srk: 'E', disruptions: 'none', endTime: '09:10',
      description: 'Ten sam rozkład na pulpicie kostkowym urządzeń przekaźnikowych typu E: obsługa dwuprzyciskowa, wyciąganie przycisków, przyciski grupowe Zw, Zz, Pz, Sz i pole blokady Eap.',
      faults: [{ type: 'signal-fail', target: 'A', at: '08:33', duration: 10 }, { type: 'block-fail', target: 'W', at: '08:44', duration: 22 }] },
    { id: 'zmiana', name: 'Zmiana bez samouczka (07:00–09:10)', description: 'Ten sam rozkład bez podpowiedzi. Poziom zakłóceń do wyboru.', endTime: '09:10' },
  ],

  timetable: [
    { nr: 6101, kind: 'os', name: 'Osobowy', from: 'W', to: 'E', arr: '07:06', dep: '07:08', track: '1', stop: true, length: 130, vmax: 100, dwell: 60 },
    { nr: 6102, kind: 'os', name: 'Osobowy', from: 'E', to: 'W', arr: '07:17', dep: '07:19', track: '1', stop: true, length: 130, vmax: 100, dwell: 60 },
    { nr: 42101, kind: 'tow', name: 'Towarowy', from: 'W', to: 'E', arr: '07:29', track: '1', stop: false, length: 380, vmax: 70 },
    { nr: 6103, kind: 'os', name: 'Osobowy', from: 'W', to: 'E', arr: '07:40', dep: '07:43', track: '2', stop: true, length: 130, vmax: 100, dwell: 60 },
    { nr: 6104, kind: 'os', name: 'Osobowy', from: 'E', to: 'W', arr: '07:41', dep: '07:44', track: '1', stop: true, length: 130, vmax: 100, dwell: 60 },
    { nr: 90201, kind: 'tow', name: 'Zdawczy', from: 'W', to: null, arr: '08:02', track: '2', stop: true, terminates: true, length: 180, vmax: 60, dwell: 30 },
    { nr: 90202, kind: 'tow', name: 'Zdawczy', unit: 90201, from: null, to: 'W', dep: '08:30', track: '2', stop: false, length: 180, vmax: 60 },
    { nr: 6105, kind: 'os', name: 'Osobowy', from: 'W', to: 'E', arr: '08:40', dep: '08:42', track: '1', stop: true, length: 130, vmax: 100, dwell: 60 },
    { nr: 6106, kind: 'os', name: 'Osobowy', from: 'E', to: 'W', arr: '08:51', dep: '08:53', track: '1', stop: true, length: 130, vmax: 100, dwell: 60 },
  ],

  tasks: [
    { id: 'odstaw-90201', unit: 90201, type: 'move', toTrack: '3', deadline: '08:16', text: 'Skład zdawczego 90201 odstawić manewrami na tor 3.' },
    { id: 'podstaw-90202', unit: 90201, type: 'move', toTrack: '2', after: '08:14', deadline: '08:28', text: 'Skład podstawić z powrotem na tor 2 jako pociąg 90202 do Lipna (odjazd 08:30).' },
  ],
};
