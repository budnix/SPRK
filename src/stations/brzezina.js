/**
 * Brzezina – fikcyjna stacja pośrednia na linii dwutorowej Topolno – Klonów z blokadą samoczynną (stacja treningowa
 * misji 5, stanowisko komputerowe EBILock 950).
 *
 * Tor 1 (główny zasadniczy) – ruch w kierunku Topolna, tor 2 (główny zasadniczy) – w kierunku Klonowa; oba przy
 * peronie I (wyspowym). Tory 3 i 4 (główne dodatkowe) – przy peronach II i III: tor 3 łączy się z torem 1 (zwrotnice
 * 1 i 3), tor 4 z torem 2 (zwrotnice 2 i 4). Pociągi towarowe czekają na torach dodatkowych na wyprzedzenie.
 * Semafory: A (wjazd od Topolna na tory 2 i 4), B (wjazd od Klonowa na tory 1 i 3), D1, D3 (wyjazd do Topolna),
 * E2, E4 (wyjazd do Klonowa). Szlaki: blokada samoczynna, każdy tor szlakowy w jednym kierunku.
 * Kroki samouczka: src/tutorial/missions/ebi.js.
 */
const T = (x, y, ports, section, extra = {}) => ({ x, y, type: 'track', ports, section, ...extra });
const H = (x1, x2, y, section, extra = {}) => Array.from({ length: x2 - x1 + 1 }, (_, i) => T(x1 + i, y, ['W', 'E'], section, extra));

const os = (nr, from, to, arr, dep, track) => ({ nr, kind: 'os', name: 'Osobowy', from, to, arr, dep, track, stop: true, length: 120, vmax: 120, dwell: 60 });

export default {
  schemaVersion: 1,
  id: 'brzezina',
  name: 'Brzezina',
  srk: 'ebilock',
  srkInfo: 'Stacja fikcyjna, treningowa: komputerowe urządzenia stacyjne typu EBILock 950 z pulpitem EBIScreen (linia poleceń); zmiany także na stanowisku komputerowym i na pulpicie typu E.',
  description: 'Stacja pośrednia linii dwutorowej Topolno – Klonów z blokadą samoczynną: dwa tory główne zasadnicze przy peronie wyspowym i dwa tory dodatkowe do wyprzedzania.',
  location: 'Stacja fikcyjna na linii dwutorowej Topolno – Klonów (poligon szkoleniowy).',
  traffic: 'Osobowe w obu kierunkach, pospieszny bez zatrzymania, towarowy wyprzedzany na torze 4.',
  difficulty: 2,
  startTime: '07:00',
  desk: { cols: 34, rows: 11 },

  exits: {
    T1: { name: 'Topolno', label: 'Topolno – tor 1', tile: { x: 0, y: 4 }, dir: 'W', direction: 'out', block: 'sbl', lineLength: 5200, lineSpeed: 120 },
    T2: { name: 'Topolno', label: 'Topolno – tor 2', tile: { x: 0, y: 6 }, dir: 'W', direction: 'in', block: 'sbl', lineLength: 5200, lineSpeed: 120 },
    K1: { name: 'Klonów', label: 'Klonów – tor 1', tile: { x: 33, y: 4 }, dir: 'E', direction: 'in', block: 'sbl', lineLength: 4800, lineSpeed: 120 },
    K2: { name: 'Klonów', label: 'Klonów – tor 2', tile: { x: 33, y: 6 }, dir: 'E', direction: 'out', block: 'sbl', lineLength: 4800, lineSpeed: 120 },
  },

  sections: {
    ZbT1: { length: 300, kind: 'approach' },
    ZbA: { length: 320, kind: 'approach' },
    Iz1: { length: 110, kind: 'point' },
    Iz2: { length: 110, kind: 'point' },
    T1w: { length: 60, kind: 'station', track: '1' },
    T1: { length: 560, kind: 'station', track: '1', platform: 'Peron I' },
    T1e: { length: 60, kind: 'station', track: '1' },
    T3w: { length: 40, kind: 'station', track: '3' },
    T3: { length: 520, kind: 'station', track: '3', platform: 'Peron II' },
    T3e: { length: 40, kind: 'station', track: '3' },
    T2: { length: 600, kind: 'station', track: '2', platform: 'Peron I' },
    T2e: { length: 60, kind: 'station', track: '2' },
    T4: { length: 560, kind: 'station', track: '4', platform: 'Peron III' },
    T4e: { length: 50, kind: 'station', track: '4' },
    Iz3: { length: 110, kind: 'point' },
    Iz4: { length: 110, kind: 'point' },
    ZbB: { length: 320, kind: 'approach' },
    ZbK2: { length: 300, kind: 'approach' },
  },

  points: {
    Zw1: { speedDiverging: 40 },
    Zw2: { speedDiverging: 40 },
    Zw3: { speedDiverging: 40 },
    Zw4: { speedDiverging: 40 },
  },

  tiles: [
    { x: 13, y: 0, type: 'label', text: 'BRZEZINA', size: 12, span: 8 },

    // tor 3 (y = 2) – dodatkowy przy torze 1
    T(5, 3, ['SW', 'NE'], 'Iz1'),
    T(6, 2, ['SW', 'E'], 'Iz1'),
    T(7, 2, ['W', 'E'], 'T3w'),
    ...H(8, 25, 2, 'T3'),
    T(26, 2, ['W', 'E'], 'T3e'),
    T(27, 2, ['W', 'SE'], 'Iz3'),
    T(28, 3, ['NW', 'SE'], 'Iz3'),

    // tor 1 (y = 4) – ruch do Topolna
    { ...T(0, 4, ['W', 'E'], 'ZbT1'), endButton: { id: 'kT1', color: 'green' }, text: 'Topolno' },
    ...H(1, 3, 4, 'ZbT1'),
    { x: 4, y: 4, type: 'point', id: 'Zw1', label: '1', toe: 'W', straight: 'E', diverge: 'NE', section: 'Iz1' },
    ...H(5, 7, 4, 'T1w'),
    ...H(8, 26, 4, 'T1'),
    ...H(27, 28, 4, 'T1e'),
    { x: 29, y: 4, type: 'point', id: 'Zw3', label: '3', toe: 'E', straight: 'W', diverge: 'NW', section: 'Iz3' },
    ...H(30, 32, 4, 'ZbB'),
    { ...T(33, 4, ['W', 'E'], 'ZbB'), text: 'Klonów' },

    // tor 2 (y = 6) – ruch do Klonowa
    { ...T(0, 6, ['W', 'E'], 'ZbA'), text: 'Topolno' },
    ...H(1, 3, 6, 'ZbA'),
    { x: 4, y: 6, type: 'point', id: 'Zw2', label: '2', toe: 'W', straight: 'E', diverge: 'SE', section: 'Iz2' },
    ...H(5, 25, 6, 'T2'),
    ...H(26, 28, 6, 'T2e'),
    { x: 29, y: 6, type: 'point', id: 'Zw4', label: '4', toe: 'E', straight: 'W', diverge: 'SW', section: 'Iz4' },
    ...H(30, 32, 6, 'ZbK2'),
    { ...T(33, 6, ['W', 'E'], 'ZbK2'), endButton: { id: 'kK2', color: 'green' }, text: 'Klonów' },

    // tor 4 (y = 8) – dodatkowy przy torze 2
    T(5, 7, ['NW', 'SE'], 'Iz2'),
    T(6, 8, ['NW', 'E'], 'Iz2'),
    ...H(7, 24, 8, 'T4'),
    ...H(25, 26, 8, 'T4e'),
    T(27, 8, ['W', 'NE'], 'Iz4'),
    T(28, 7, ['SW', 'NE'], 'Iz4'),

    // sygnalizatory
    { x: 3, y: 7, type: 'signal', id: 'A', kind: 'semafor', at: { x: 3, y: 6 }, dir: 'E', entry: true },
    { x: 30, y: 3, type: 'signal', id: 'B', kind: 'semafor', at: { x: 30, y: 4 }, dir: 'W', entry: true },
    { x: 8, y: 5, type: 'signal', id: 'D1', kind: 'semafor', at: { x: 8, y: 4 }, dir: 'W' },
    { x: 8, y: 1, type: 'signal', id: 'D3', kind: 'semafor', at: { x: 8, y: 2 }, dir: 'W' },
    { x: 25, y: 5, type: 'signal', id: 'E2', kind: 'semafor', at: { x: 25, y: 6 }, dir: 'E' },
    { x: 24, y: 9, type: 'signal', id: 'E4', kind: 'semafor', at: { x: 24, y: 8 }, dir: 'E' },

    // opisy
    { x: 16, y: 3, type: 'label', text: 'tor 1', span: 2 },
    { x: 16, y: 1, type: 'label', text: 'tor 3', span: 2 },
    { x: 16, y: 7, type: 'label', text: 'tor 2', span: 2 },
    { x: 16, y: 9, type: 'label', text: 'tor 4', span: 2 },
  ],

  routes: { disable: [], override: {} },

  scenarios: [
    { id: 'nauka-5', name: 'Misja 5: stanowisko EBILock 950 (samouczek)', tutorial: 'ebi', srk: 'ebilock', disruptions: 'none', endTime: '08:40',
      // pęknięta szyna na torze 1 – tor zamknięty poleceniem ITS, osobowy 9104 przyjęty na tor 3
      faults: [{ type: 'track-defect', target: 'T1', at: '07:50', duration: 18 }],
      description: 'Stanowisko EBILock 950 krok po kroku: menu pod prawym klawiszem i linia poleceń z „Wykonaj”, przebiegi POC, wyprzedzanie towarowego na torze 4, okno zdarzeń i alarmów, zamknięcie toru z pękniętą szyną (ITS / ITO) i przyjęcie pociągu na tor 3.' },
    { id: 'zmiana', name: 'Pełna zmiana – stanowisko EBILock 950 (07:00–08:40)', srk: 'ebilock', description: 'Ruch w obu kierunkach i wyprzedzanie na stanowisku EBILock 950. Poziom zakłóceń do wyboru.', endTime: '08:40' },
    { id: 'zmiana-lcs', name: 'Pełna zmiana – stanowisko komputerowe (07:00–08:40)', srk: 'komputerowe', description: 'Ten sam rozkład na monitorze z paskiem poleceń (zobrazowanie wg Ie-104).', endTime: '08:40' },
    { id: 'zmiana-e', name: 'Pełna zmiana – pulpit kostkowy typu E (07:00–08:40)', srk: 'E', description: 'Ten sam rozkład na pulpicie kostkowym urządzeń przekaźnikowych typu E.', endTime: '08:40' },
    { id: 'zmiana-mor', name: 'Pełna zmiana – stanowisko MOR-3 (07:00–08:40)', srk: 'mor3', description: 'Ten sam rozkład na monitorze z pulpitem MOR-1: kliknięcie obiektu – menu poleceń, kliknięcie celu – przebieg „Pociąg” / „Manewr”, polecenia fioletowe i czerwone z potwierdzeniem, okno komunikatów i alarmów. Instrukcja obsługi jest pod przyciskiem „?”.', endTime: '08:40' },
  ],

  timetable: [
    os(9101, 'T2', 'K2', '07:06', '07:07', '2'),
    os(9102, 'K1', 'T1', '07:12', '07:13', '1'),
    { nr: 49101, kind: 'tow', name: 'Towarowy', from: 'T2', to: 'K2', arr: '07:22', dep: '07:34', track: '4', stop: true, length: 450, vmax: 80, dwell: 60 },
    { nr: 1901, kind: 'os', name: 'TLK Topolno – Klonów', from: 'T2', to: 'K2', arr: '07:29', track: '2', stop: false, length: 220, vmax: 120 },
    os(9103, 'K1', 'T1', '07:42', '07:43', '1'),
    os(9104, 'K1', 'T1', '07:58', '07:59', '1'),
    os(9105, 'T2', 'K2', '08:05', '08:06', '2'),
    os(9106, 'K1', 'T1', '08:16', '08:17', '1'),
  ],
};
