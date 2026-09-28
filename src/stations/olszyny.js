/**
 * Olszyny – fikcyjna stacja pośrednia linii jednotorowej Wierzbno – Grabowiec z nastawnią mechaniczną (stacja
 * treningowa misji 4).
 *
 * Tor 1 (główny zasadniczy) i tor 2 (główny dodatkowy) przy peronie I; od zachodu, z toru 2, odchodzi bocznica
 * ładunkowa – tor 4 z kozłem i wykolejnicą Wk1, która chroni tor 2 przed taborem z bocznicy. Zwrotnice: 1 (głowica
 * zachodnia), 2 (głowica wschodnia), 3 (bocznica). Za semaforami wyjazdowymi są osobne odcinki przed rozjazdami,
 * więc krzyżowanie (A → tor 2 i B → tor 1 jednocześnie) jest dozwolone.
 * Semafory: A, B (wjazdowe), C1, C2 (wyjazdowe na zachód, C2 z Ms2 na bocznicę), D1, D2 (wyjazdowe na wschód);
 * tarcza Tm1 (wyjazd z bocznicy). Szlaki: Wierzbno (W), Grabowiec (E) – blokada Eap.
 * Kroki samouczka: src/tutorial/missions/mech.js.
 */
const T = (x, y, ports, section, extra = {}) => ({ x, y, type: 'track', ports, section, ...extra });
const H = (x1, x2, y, section, extra = {}) => Array.from({ length: x2 - x1 + 1 }, (_, i) => T(x1 + i, y, ['W', 'E'], section, extra));

const os = (nr, from, to, arr, dep, track) => ({ nr, kind: 'os', name: 'Osobowy', from, to, arr, dep, track, stop: true, length: 120, vmax: 100, dwell: 60 });

export default {
  schemaVersion: 1,
  id: 'olszyny',
  name: 'Olszyny',
  srk: 'mech',
  srkInfo: 'Stacja fikcyjna, treningowa: urządzenia mechaniczne scentralizowane (nastawnia z ławą dźwigniową, drążkami przebiegowymi i blokami przebiegowymi, sygnalizacja świetlna); zmiany także na pulpitach przekaźnikowych i na stanowisku komputerowym.',
  description: 'Stacja pośrednia linii jednotorowej Wierzbno – Grabowiec w nastawni mechanicznej. Dwa tory przy peronie, bocznica ładunkowa z wykolejnicą, blokada liniowa Eap.',
  location: 'Stacja fikcyjna na linii jednotorowej Wierzbno – Grabowiec (poligon szkoleniowy).',
  traffic: 'Osobowe w obu kierunkach, krzyżowanie na torach 1 i 2.',
  difficulty: 2,
  startTime: '07:00',
  desk: { cols: 30, rows: 10 },

  exits: {
    W: { name: 'Wierzbno', tile: { x: 0, y: 4 }, dir: 'W', lineLength: 4000, lineSpeed: 100 },
    E: { name: 'Grabowiec', tile: { x: 29, y: 4 }, dir: 'E', lineLength: 4600, lineSpeed: 100 },
  },

  sections: {
    ZbA: { length: 320, kind: 'approach' },
    Iz1: { length: 110, kind: 'point' },
    T1w: { length: 60, kind: 'station', track: '1' },
    T1: { length: 480, kind: 'station', track: '1', platform: 'Peron I' },
    T1e: { length: 60, kind: 'station', track: '1' },
    Iz2: { length: 110, kind: 'point' },
    ZbB: { length: 320, kind: 'approach' },
    T2w: { length: 60, kind: 'station', track: '2' },
    Iz3: { length: 70, kind: 'point' },
    T2x: { length: 40, kind: 'station', track: '2' },
    T2: { length: 300, kind: 'station', track: '2', platform: 'Peron I' },
    T2e: { length: 60, kind: 'station', track: '2' },
    T4w: { length: 30, kind: 'siding', track: '4' },
    T4: { length: 160, kind: 'siding', track: '4' },
  },

  points: {
    Zw1: { speedDiverging: 40 },
    Zw2: { speedDiverging: 40 },
    Zw3: { speedDiverging: 30 },
  },

  tiles: [
    { x: 11, y: 0, type: 'label', text: 'OLSZYNY', size: 12, span: 8 },

    // tor 1 (y = 4)
    { ...T(0, 4, ['W', 'E'], 'ZbA'), endButton: { id: 'kW', color: 'green' }, text: 'Wierzbno' },
    ...H(1, 3, 4, 'ZbA'),
    T(4, 4, ['W', 'E'], 'Iz1'),
    { x: 5, y: 4, type: 'point', id: 'Zw1', label: '1', toe: 'W', straight: 'E', diverge: 'SE', section: 'Iz1' },
    T(6, 4, ['W', 'E'], 'T1w'),   // za C1 – droga ochronna kończy się przed Zw1
    ...H(7, 21, 4, 'T1'),
    T(22, 4, ['W', 'E'], 'T1e'),  // za D1 – przed Zw2
    T(23, 4, ['W', 'E'], 'Iz2'),
    { x: 24, y: 4, type: 'point', id: 'Zw2', label: '2', toe: 'E', straight: 'W', diverge: 'SW', section: 'Iz2' },
    T(25, 4, ['W', 'E'], 'Iz2'),
    ...H(26, 28, 4, 'ZbB'),
    { ...T(29, 4, ['W', 'E'], 'ZbB'), endButton: { id: 'kE', color: 'green' }, text: 'Grabowiec' },

    // łącznice do toru 2
    T(6, 5, ['NW', 'SE'], 'Iz1'),
    T(7, 6, ['NW', 'E'], 'Iz1'),
    T(23, 5, ['NE', 'SW'], 'Iz2'),
    T(22, 6, ['NE', 'W'], 'Iz2'),

    // tor 2 (y = 6) ze zwrotnicą bocznicy
    ...H(8, 9, 6, 'T2w'),         // za C2 – przed Zw1
    { x: 10, y: 6, type: 'point', id: 'Zw3', label: '3', toe: 'E', straight: 'W', diverge: 'SW', section: 'Iz3' },
    T(11, 6, ['W', 'E'], 'T2x'),
    ...H(12, 20, 6, 'T2'),
    T(21, 6, ['W', 'E'], 'T2e'),  // za D2 – przed Zw2

    // tor 4 – bocznica ładunkowa (y = 8), kozioł od zachodu
    T(9, 7, ['NE', 'SW'], 'Iz3'),
    T(8, 8, ['NE', 'W'], 'Iz3'),
    { ...T(7, 8, ['W', 'E'], 'T4w'), derailer: 'Wk1' },
    ...H(3, 6, 8, 'T4'),
    { x: 2, y: 8, type: 'buffer', port: 'E', section: 'T4', endButton: { id: 'kT4', color: 'white' } },

    // sygnalizatory
    { x: 3, y: 3, type: 'signal', id: 'A', kind: 'semafor', at: { x: 3, y: 4 }, dir: 'E', entry: true },
    { x: 26, y: 5, type: 'signal', id: 'B', kind: 'semafor', at: { x: 26, y: 4 }, dir: 'W', entry: true },
    { x: 7, y: 3, type: 'signal', id: 'C1', kind: 'semafor', at: { x: 7, y: 4 }, dir: 'W' },
    { x: 11, y: 7, type: 'signal', id: 'C2', kind: 'semafor', at: { x: 11, y: 6 }, dir: 'W', shunting: true },
    { x: 21, y: 3, type: 'signal', id: 'D1', kind: 'semafor', at: { x: 21, y: 4 }, dir: 'E' },
    { x: 20, y: 5, type: 'signal', id: 'D2', kind: 'semafor', at: { x: 20, y: 6 }, dir: 'E' },
    { x: 6, y: 9, type: 'signal', id: 'Tm1', kind: 'tm', at: { x: 6, y: 8 }, dir: 'E' },

    // opisy
    { x: 14, y: 3, type: 'label', text: 'tor 1', span: 2 },
    { x: 14, y: 7, type: 'label', text: 'tor 2', span: 2 },
    { x: 3, y: 9, type: 'label', text: 'tor 4', span: 2 },
    { x: 7, y: 7, type: 'label', text: 'Wk1', size: 8 },
  ],

  routes: { disable: [], override: {} },

  scenarios: [
    // misja zaczyna się wcześniej: przed pierwszym pociągiem jest rozgrzewka z dźwigniami i drążkiem
    { id: 'nauka-4', name: 'Misja 4: nastawnia mechaniczna (samouczek)', tutorial: 'mech', srk: 'mech', disruptions: 'none', startTime: '06:54', endTime: '08:40',
      // urządzenie oddziaływania za semaforem A nie zwalnia bloku przebiegowego – drążek cofa się zwalniaczem
      faults: [{ type: 'route-block', target: 'A', at: '07:45', duration: 25 }],
      description: 'Nastawnia mechaniczna krok po kroku: dźwignie zwrotnic i wykolejnicy, drążek przebiegowy, blok przebiegowy utwierdzający, dźwignia sygnałowa, powrót dźwigni i drążka po przejeździe, krzyżowanie na torach 1 i 2 z wykolejnicą ochronną, zwalniacz przy bloku niezwolnionym przez pociąg.' },
    { id: 'zmiana', name: 'Pełna zmiana – nastawnia mechaniczna (07:00–08:40)', srk: 'mech', description: 'Osobowe w obu kierunkach i krzyżowania w nastawni mechanicznej. Poziom zakłóceń do wyboru.', endTime: '08:40' },
    { id: 'zmiana-e', name: 'Pełna zmiana – pulpit kostkowy typu E (07:00–08:40)', srk: 'E', description: 'Ten sam rozkład na pulpicie kostkowym urządzeń przekaźnikowych typu E.', endTime: '08:40' },
    { id: 'zmiana-izh', name: 'Pełna zmiana – pulpit typu IZH-111 (07:00–08:40)', srk: 'izh111', description: 'Ten sam rozkład na pulpicie ciemnym typu IZH-111.', endTime: '08:40' },
    { id: 'zmiana-lcs', name: 'Pełna zmiana – stanowisko komputerowe (07:00–08:40)', srk: 'komputerowe', description: 'Ten sam rozkład na monitorze (zobrazowanie wg Ie-104).', endTime: '08:40' },
  ],

  timetable: [
    os(8401, 'W', 'E', '07:05', '07:06', '1'),
    os(8402, 'E', 'W', '07:16', '07:17', '1'),
    os(8403, 'W', 'E', '07:30', '07:32', '2'),
    os(8404, 'E', 'W', '07:31', '07:33', '1'),
    os(8405, 'W', 'E', '07:52', '07:53', '1'),
    os(8406, 'E', 'W', '08:05', '08:06', '1'),
  ],
};
