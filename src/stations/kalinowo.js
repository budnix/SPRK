/**
 * Kalinowo – fikcyjna stacja węzłowa trzech linii jednotorowych (stacja treningowa misji 6, stanowisko komputerowe
 * MOR-3 z pulpitem MOR-1).
 *
 * Od zachodu linia z Jesionki, od wschodu – z Bukowa, a tuż za stacją, na wschodzie, odgałęzia się linia do Lipnik
 * (zwrotnica 3 za zwrotnicą 2, między semaforem wjazdowym B a torami stacyjnymi). Tory 1 i 2 przy peronie wyspowym I.
 * Wszystkie szlaki z blokadą Eap: pozwolenia, potwierdzenie przyjazdu. Semafory: A (wjazd od Jesionki), B (od Bukowa),
 * C (od Lipnik), D1, D2 (wyjazd do Jesionki), E1, E2 (wyjazd do Bukowa albo Lipnik).
 * Kroki samouczka: src/tutorial/missions/mor.js.
 */
const T = (x, y, ports, section, extra = {}) => ({ x, y, type: 'track', ports, section, ...extra });
const H = (x1, x2, y, section, extra = {}) => Array.from({ length: x2 - x1 + 1 }, (_, i) => T(x1 + i, y, ['W', 'E'], section, extra));

const os = (nr, from, to, arr, dep, track) => ({ nr, kind: 'os', name: 'Osobowy', from, to, arr, dep, track, stop: true, length: 110, vmax: 100, dwell: 60 });

export default {
  schemaVersion: 1,
  id: 'kalinowo',
  name: 'Kalinowo',
  srk: 'mor3',
  srkInfo: 'Stacja fikcyjna, treningowa: komputerowe urządzenia stacyjne typu MOR-3 z pulpitem MOR-1 (menu obiektów).',
  description: 'Węzeł trzech linii jednotorowych: z Jesionki, Bukowa i Lipnik. Dwa tory przy peronie wyspowym, krzyżowania, blokada Eap na każdym szlaku.',
  location: 'Stacja fikcyjna, węzeł linii jednotorowych Jesionka – Buków i odgałęzienia do Lipnik (poligon szkoleniowy).',
  traffic: 'Osobowe w trzech kierunkach, krzyżowania na torach 1 i 2, towarowy z Lipnik bez zatrzymania.',
  difficulty: 3,
  startTime: '07:00',
  desk: { cols: 37, rows: 10 },

  exits: {
    W: { name: 'Jesionka', tile: { x: 0, y: 4 }, dir: 'W', lineLength: 4200, lineSpeed: 100 },
    E: { name: 'Buków', tile: { x: 36, y: 4 }, dir: 'E', lineLength: 4600, lineSpeed: 100 },
    L: { name: 'Lipniki', tile: { x: 36, y: 8 }, dir: 'E', lineLength: 3800, lineSpeed: 80 },
  },

  sections: {
    ZbA: { length: 320, kind: 'approach' },
    Iz1: { length: 110, kind: 'point' },
    T1w: { length: 60, kind: 'station', track: '1' },
    T1: { length: 520, kind: 'station', track: '1', platform: 'Peron I' },
    T1e: { length: 60, kind: 'station', track: '1' },
    T2w: { length: 40, kind: 'station', track: '2' },
    T2: { length: 480, kind: 'station', track: '2', platform: 'Peron I' },
    T2e: { length: 40, kind: 'station', track: '2' },
    Iz2: { length: 110, kind: 'point' },
    Iz3: { length: 160, kind: 'point' },
    ZbB: { length: 300, kind: 'approach' },
    ZbC: { length: 260, kind: 'approach' },
  },

  points: {
    Zw1: { speedDiverging: 40 },
    Zw2: { speedDiverging: 40 },
    Zw3: { speedDiverging: 40 },
  },

  tiles: [
    { x: 13, y: 0, type: 'label', text: 'KALINOWO', size: 12, span: 8 },

    // tor 1 (y = 4) – linia Jesionka – Buków
    { ...T(0, 4, ['W', 'E'], 'ZbA'), endButton: { id: 'kW', color: 'green' }, text: 'Jesionka' },
    ...H(1, 3, 4, 'ZbA'),
    { x: 4, y: 4, type: 'point', id: 'Zw1', label: '1', toe: 'W', straight: 'E', diverge: 'SE', section: 'Iz1' },
    ...H(5, 6, 4, 'T1w'),
    ...H(7, 24, 4, 'T1'),
    ...H(25, 26, 4, 'T1e'),
    { x: 27, y: 4, type: 'point', id: 'Zw2', label: '2', toe: 'E', straight: 'W', diverge: 'SW', section: 'Iz2' },
    T(28, 4, ['W', 'E'], 'Iz3'),
    { x: 29, y: 4, type: 'point', id: 'Zw3', label: '3', toe: 'W', straight: 'E', diverge: 'SE', section: 'Iz3' },
    T(30, 4, ['W', 'E'], 'Iz3'),
    ...H(31, 35, 4, 'ZbB'),
    { ...T(36, 4, ['W', 'E'], 'ZbB'), endButton: { id: 'kE', color: 'green' }, text: 'Buków' },

    // tor 2 (y = 6)
    T(5, 5, ['NW', 'SE'], 'Iz1'),
    T(6, 6, ['NW', 'E'], 'Iz1'),
    T(7, 6, ['W', 'E'], 'T2w'),
    ...H(8, 23, 6, 'T2'),
    T(24, 6, ['W', 'E'], 'T2e'),
    T(25, 6, ['W', 'NE'], 'Iz2'),
    T(26, 5, ['SW', 'NE'], 'Iz2'),

    // odgałęzienie do Lipnik (y = 8) – za zwrotnicą 3
    T(30, 5, ['NW', 'SE'], 'Iz3'),
    T(31, 6, ['NW', 'SE'], 'Iz3'),
    T(32, 7, ['NW', 'SE'], 'Iz3'),
    T(33, 8, ['NW', 'E'], 'Iz3'),
    ...H(34, 35, 8, 'ZbC'),
    { ...T(36, 8, ['W', 'E'], 'ZbC'), endButton: { id: 'kL', color: 'green' }, text: 'Lipniki' },

    // sygnalizatory
    { x: 3, y: 3, type: 'signal', id: 'A', kind: 'semafor', at: { x: 3, y: 4 }, dir: 'E', entry: true },
    { x: 31, y: 3, type: 'signal', id: 'B', kind: 'semafor', at: { x: 31, y: 4 }, dir: 'W', entry: true },
    { x: 34, y: 9, type: 'signal', id: 'C', kind: 'semafor', at: { x: 34, y: 8 }, dir: 'W', entry: true },
    { x: 7, y: 3, type: 'signal', id: 'D1', kind: 'semafor', at: { x: 7, y: 4 }, dir: 'W' },
    { x: 8, y: 7, type: 'signal', id: 'D2', kind: 'semafor', at: { x: 8, y: 6 }, dir: 'W' },
    { x: 24, y: 3, type: 'signal', id: 'E1', kind: 'semafor', at: { x: 24, y: 4 }, dir: 'E' },
    { x: 23, y: 7, type: 'signal', id: 'E2', kind: 'semafor', at: { x: 23, y: 6 }, dir: 'E' },

    // opisy
    { x: 15, y: 3, type: 'label', text: 'tor 1', span: 2 },
    { x: 15, y: 7, type: 'label', text: 'tor 2', span: 2 },
  ],

  routes: { disable: [], override: {} },

  scenarios: [
    { id: 'nauka-6', name: 'Misja 6: stanowisko MOR-3 (samouczek)', tutorial: 'mor', srk: 'mor3', disruptions: 'none', endTime: '08:40',
      // od 07:30 licznik osi toru 2 pomyli się przy najbliższym przejeździe – towarowym z Lipnik (07:41); zerowanie
      // ZeroLO, osobowy 7205 na sygnał zastępczy jako przejazd kontrolny
      faults: [{ type: 'axle-counter', target: 'T2', at: '07:30', duration: 90 }],
      description: 'Stanowisko MOR-3 krok po kroku: menu obiektów z fioletową obwódką, przebieg kliknięciem celu (semafora, toru, trójkąta) i przeciąganiem, blokada Eap z menu, krzyżowanie w węźle trzech linii, okno alarmów i dwuklik, usterka licznika osi – zerowanie ZeroLO i przejazd kontrolny na sygnał zastępczy.' },
    { id: 'zmiana', name: 'Pełna zmiana – stanowisko MOR-3 (07:00–08:40)', srk: 'mor3', description: 'Ruch w węźle trzech linii jednotorowych na stanowisku MOR-3. Poziom zakłóceń do wyboru.', endTime: '08:40' },
  ],

  timetable: [
    os(7201, 'W', 'E', '07:06', '07:07', '1'),
    os(7202, 'E', 'W', '07:14', '07:15', '1'),
    os(7203, 'W', 'L', '07:24', '07:25', '2'),
    os(7204, 'E', 'W', '07:25', '07:27', '1'),
    { nr: 47201, kind: 'tow', name: 'Towarowy', from: 'L', to: 'W', arr: '07:41', track: '2', stop: false, length: 380, vmax: 70 },
    os(7205, 'L', 'W', '07:58', '07:59', '2'),
    os(7206, 'W', 'E', '08:10', '08:11', '1'),
    os(7207, 'W', 'L', '08:22', '08:23', '2'),
  ],
};
