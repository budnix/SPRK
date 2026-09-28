/**
 * Stacja Szkolna – fikcyjna stacja treningowa dla misji wprowadzających (samouczek).
 *
 * Układ jak na małej stacji linii jednotorowej: tor 1 i 2 (perony), tor 3 (boczny, kozioł, wykolejnica Wk1).
 * Zwrotnice 1 (głowica zachodnia), 3 (odgałęzienie toru 3), 4 (głowica wschodnia).
 * Za każdym semaforem wyjazdowym (C1, C2, D1, D2) jest osobny odcinek toru (T1w, T2w, T1e, T2e) przed rozjazdem,
 * więc drogi ochronne wjazdów kończą się przed rozjazdami i jednoczesne wjazdy z obu kierunków (krzyżowanie A→D2
 * i B→C1) nie wykluczają się – jak na stacji, gdzie semafory stoją z zapasem przed głowicą.
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
  srkInfo: 'Stacja fikcyjna, treningowa: stanowisko komputerowe (zobrazowanie wg Ie-104) z samouczkiem; osobne zmiany na pulpicie kostkowym typu E i na pulpicie typu IZH-111.',
  description: 'Stacja treningowa na linii jednotorowej Lipno – Dębno. Dwa tory peronowe, bocznica z kozłem, blokada liniowa Eap. Misje wprowadzające prowadzą krok po kroku.',
  location: 'Stacja fikcyjna na linii jednotorowej Lipno – Dębno (poligon szkoleniowy).',
  traffic: 'Kilka osobowych, towarowy przelotem, zdawczy z manewrami; rozkład liniowy pod samouczek.',
  difficulty: 1,
  startTime: '07:00',
  desk: { cols: 32, rows: 10 },

  exits: {
    W: { name: 'Lipno', tile: { x: 0, y: 4 }, dir: 'W', lineLength: 4200, lineSpeed: 100 },
    E: { name: 'Dębno', tile: { x: 31, y: 4 }, dir: 'E', lineLength: 5100, lineSpeed: 100 },
  },

  sections: {
    ZbA: { length: 320, kind: 'approach' },
    Iz1: { length: 110, kind: 'point' },
    T1w: { length: 60, kind: 'station', track: '1' },
    T1: { length: 520, kind: 'station', track: '1', platform: 'Peron I' },
    T1e: { length: 60, kind: 'station', track: '1' },
    T2w: { length: 60, kind: 'station', track: '2' },
    T2: { length: 280, kind: 'station', track: '2', platform: 'Peron I' },
    T2e: { length: 60, kind: 'station', track: '2' },
    Iz3: { length: 70, kind: 'point' },
    T2b: { length: 75, kind: 'station', track: '2' },
    Iz4: { length: 120, kind: 'point' },
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

    { x: 12, y: 0, type: 'label', text: 'SZKOLNA', size: 12, span: 8 },

    // tor 1 (y = 4)
    ...H(1, 3, 4, 'ZbA'),
    { ...T(0, 4, ['W', 'E'], 'ZbA'), endButton: { id: 'kW', color: 'green' }, text: 'Lipno' },
    ...H(4, 4, 4, 'Iz1'),
    { x: 5, y: 4, type: 'point', id: 'Zw1', label: '1', toe: 'W', straight: 'E', diverge: 'SE', section: 'Iz1' },
    T(6, 4, ['W', 'E'], 'T1w'),   // osobny odcinek za C1 – droga ochronna kończy się przed Zw1
    ...H(7, 23, 4, 'T1'),
    T(24, 4, ['W', 'E'], 'T1e'),  // osobny odcinek za D1 – przed Zw4
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
    T(8, 6, ['W', 'E'], 'T2w'),   // za C2 – przed Zw1
    ...H(9, 19, 6, 'T2'),
    T(20, 6, ['W', 'E'], 'T2e'),  // za D2 – przed Zw3
    { x: 21, y: 6, type: 'point', id: 'Zw3', label: '3', toe: 'W', straight: 'E', diverge: 'SE', section: 'Iz3' },
    ...H(22, 23, 6, 'T2b'),

    // tor 3 (y = 8)
    T(22, 7, ['NW', 'SE'], 'Iz3'),
    T(23, 8, ['NW', 'E'], 'Iz3'),
    { ...T(24, 8, ['W', 'E'], 'T3w'), derailer: 'Wk1' },
    ...H(25, 28, 8, 'T3'),
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
    { x: 25, y: 7, type: 'label', text: 'Wk1', size: 8 },
  ],

  routes: { disable: [], override: {} },

  /**
   * Scenariusze. `tutorial` – identyfikator misji (src/tutorial/missions.js); `srk` – stanowisko tej zmiany.
   * Misje 2, 3 i 4 mają
   * własne stacje (Jodłowa, Zacisze, Olszyny).
   */
  scenarios: [
    { id: 'nauka-1', name: 'Misja 1: stanowisko komputerowe (samouczek)', tutorial: 'monitor', srk: 'komputerowe', disruptions: 'none', endTime: '08:50',
      description: 'Krok po kroku: pozwolenie (Poz), przebieg wjazdowy i wyjazdowy, Ko i Wbl, przelot, krzyżowanie, manewry składem kończącym bieg, sygnał zastępczy przy usterce semafora, zapowiadanie telefoniczne przy usterce blokady. Dymki wyjaśniają każdy skrót.',
      faults: [{ type: 'signal-fail', target: 'A', at: '08:15', duration: 10 }, { type: 'block-fail', target: 'W', at: '08:26', duration: 22 }] },
    // zmiany bez samouczka – po jednej na każde stanowisko (samouczki są na liście misji, nie w wyborze scenariusza)
    { id: 'zmiana', name: 'Pełna zmiana – stanowisko komputerowe (07:00–08:50)', srk: 'komputerowe', description: 'Ten sam rozkład bez podpowiedzi, na monitorze (zobrazowanie wg Ie-104). Poziom zakłóceń do wyboru.', endTime: '08:50' },
    { id: 'zmiana-e', name: 'Pełna zmiana – pulpit kostkowy typu E (07:00–08:50)', srk: 'E', description: 'Ten sam rozkład bez podpowiedzi, na pulpicie kostkowym urządzeń przekaźnikowych typu E. Poziom zakłóceń do wyboru.', endTime: '08:50' },
    { id: 'zmiana-izh', name: 'Pełna zmiana – pulpit typu IZH-111 (07:00–08:50)', srk: 'izh111', description: 'Ten sam rozkład na pulpicie ciemnym urządzeń przekaźnikowych typu IZH-111: przycisk adresowy elementu i przycisk rozkazu (P, M, +, −, STOP, Zw, Zcz, Sz). Instrukcja obsługi jest pod przyciskiem „?”. Poziom zakłóceń do wyboru.', endTime: '08:50' },
    { id: 'zmiana-mech', name: 'Pełna zmiana – nastawnia mechaniczna (07:00–08:50)', srk: 'mech', description: 'Ten sam rozkład w nastawni mechanicznej: zwrotnice dźwigniami, przebieg drążkiem przebiegowym, blok przebiegowy utwierdzający i dźwignia sygnałowa; po przejeździe dźwignia na „Stój” i drążek z powrotem. Instrukcja obsługi jest pod przyciskiem „?”.', endTime: '08:50' },
  ],

  timetable: [
    { nr: 6101, kind: 'os', name: 'Osobowy', from: 'W', to: 'E', arr: '07:06', dep: '07:08', track: '1', stop: true, length: 130, vmax: 100, dwell: 60 },
    { nr: 6102, kind: 'os', name: 'Osobowy', from: 'E', to: 'W', arr: '07:17', dep: '07:19', track: '1', stop: true, length: 130, vmax: 100, dwell: 60 },
    { nr: 42101, kind: 'tow', name: 'Towarowy', from: 'W', to: 'E', arr: '07:29', track: '1', stop: false, length: 380, vmax: 70 },
    { nr: 6103, kind: 'os', name: 'Osobowy', from: 'W', to: 'E', arr: '07:40', dep: '07:43', track: '2', stop: true, length: 130, vmax: 100, dwell: 60 },
    { nr: 6104, kind: 'os', name: 'Osobowy', from: 'E', to: 'W', arr: '07:41', dep: '07:44', track: '1', stop: true, length: 130, vmax: 100, dwell: 60 },
    { nr: 90201, kind: 'tow', name: 'Zdawczy', from: 'W', to: null, arr: '07:52', track: '2', stop: true, terminates: true, length: 180, vmax: 60, dwell: 30 },
    { nr: 90202, kind: 'tow', name: 'Zdawczy', unit: 90201, from: null, to: 'W', dep: '08:12', track: '2', stop: false, length: 180, vmax: 60 },
    { nr: 6105, kind: 'os', name: 'Osobowy', from: 'W', to: 'E', arr: '08:22', dep: '08:24', track: '1', stop: true, length: 130, vmax: 100, dwell: 60 },
    { nr: 6106, kind: 'os', name: 'Osobowy', from: 'E', to: 'W', arr: '08:33', dep: '08:35', track: '1', stop: true, length: 130, vmax: 100, dwell: 60 },
  ],

  tasks: [
    { id: 'odstaw-90201', unit: 90201, type: 'move', toTrack: '3', deadline: '08:04', text: 'Skład zdawczego 90201 odstawić manewrami na tor 3.' },
    { id: 'podstaw-90202', unit: 90201, type: 'move', toTrack: '2', afterTask: 'odstaw-90201', deadline: '08:10', text: 'Skład podstawić z powrotem na tor 2 jako pociąg 90202 do Lipna (odjazd 08:12).' },
  ],
};
