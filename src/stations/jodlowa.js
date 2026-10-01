/**
 * Jodłowa – fikcyjna stacja węzłowa na linii dwutorowej (stacja treningowa misji 2).
 *
 * Linia dwutorowa Krasne – Zalesie: każdy tor szlakowy ma jeden kierunek ruchu, więc nie ma pozwoleń – sąsiad
 * wyprawia pociąg sam, a dyżurny potwierdza tylko przyjazd (Ko). Jednotorowe odgałęzienie do Borków ma blokadę Eap
 * z pozwoleniami. Układ torów jest taki jak stacji testowej Wola Pustkowska (tests/fixtures), sprawdzonej pełną zmianą.
 *
 * Tory: 1 (główny, na zachód – do Krasnego), 2 (główny, na wschód – do Zalesia), 3 (główny dodatkowy: wyprzedzanie,
 *       pociągi z i do Borków), 4 (boczny, kozioł, wykolejnica Wk1).
 * Semafory: A (wjazd od Krasnego), B (od Zalesia), C (od Borków), D1–D3 (wyjazd na zachód), E2, E3 (na wschód).
 * Kroki samouczka: src/tutorial/missions/pulpit.js.
 */
const T = (x, y, ports, section, extra = {}) => ({ x, y, type: 'track', ports, section, ...extra });
const H = (x1, x2, y, section, extra = {}) => Array.from({ length: x2 - x1 + 1 }, (_, i) => T(x1 + i, y, ['W', 'E'], section, extra));

export default {
  schemaVersion: 1,
  id: 'jodlowa',
  name: 'Jodłowa',
  srk: 'E',
  srkInfo: 'Stacja fikcyjna, treningowa: urządzenia przekaźnikowe typu E z pulpitem kostkowym, blokady jednokierunkowe linii dwutorowej i Eap na odgałęzieniu; zmiany także na pulpicie IZH-111 i na stanowisku komputerowym.',
  description: 'Stacja węzłowa na linii dwutorowej Krasne – Zalesie z odgałęzieniem do Borków. Ruch bez pozwoleń na linii dwutorowej, wyprzedzanie na torze 3, blokada Eap tylko do Borków.',
  location: 'Stacja fikcyjna, węzeł: linia dwutorowa Krasne – Zalesie i odgałęzienie do Borków (poligon szkoleniowy).',
  traffic: 'Osobowe i pospieszne na torach głównych, towarowy wyprzedzany na torze 3, osobowe do Borków.',
  difficulty: 2,
  startTime: '07:00',
  desk: { cols: 36, rows: 13 },

  exits: {
    K1: { name: 'Krasne', label: 'Krasne – tor 1', tile: { x: 0, y: 4 }, dir: 'W', direction: 'out', lineLength: 6100, lineSpeed: 100 },
    K2: { name: 'Krasne', label: 'Krasne – tor 2', tile: { x: 0, y: 6 }, dir: 'W', direction: 'in', lineLength: 6100, lineSpeed: 100 },
    Z1: { name: 'Zalesie', label: 'Zalesie – tor 1', tile: { x: 35, y: 4 }, dir: 'E', direction: 'in', lineLength: 5400, lineSpeed: 100 },
    Z2: { name: 'Zalesie', label: 'Zalesie – tor 2', tile: { x: 35, y: 6 }, dir: 'E', direction: 'out', lineLength: 5400, lineSpeed: 100 },
    B: { name: 'Borki', label: 'Borki', tile: { x: 35, y: 8 }, dir: 'E', lineLength: 3800, lineSpeed: 60 },
  },

  sections: {
    ZbW1: { length: 300, kind: 'approach' },
    ZbA: { length: 300, kind: 'approach' },
    Iz1: { length: 160, kind: 'point' },
    Iz3: { length: 90, kind: 'point' },
    T1: { length: 620, kind: 'station', track: '1', platform: 'Peron I' },
    T2: { length: 440, kind: 'station', track: '2', platform: 'Peron I' },
    T3: { length: 480, kind: 'station', track: '3', platform: 'Peron II', mainKind: 'dodatkowy' },
    Iz7: { length: 70, kind: 'point' },
    T3b: { length: 70, kind: 'station', track: '3' },
    Iz5: { length: 90, kind: 'point' },
    T3c: { length: 60, kind: 'plain' },
    ZbB1: { length: 300, kind: 'approach' },
    ZbE2: { length: 320, kind: 'approach' },
    ZbC: { length: 320, kind: 'approach' },
    T4w: { length: 25, kind: 'siding', track: '4' },
    T4: { length: 160, kind: 'siding', track: '4' },
  },

  tiles: [
    { x: 14, y: 0, type: 'label', text: 'JODŁOWA', size: 12, span: 8 },

    // ---- tor 1 (y = 4) – kierunek zachodni ----
    { ...T(0, 4, ['W', 'E'], 'ZbW1'), endButton: { id: 'kK1', color: 'green' }, text: 'Krasne' },
    ...H(1, 3, 4, 'ZbW1'),
    { x: 4, y: 4, type: 'point', id: 'Zw1', label: '1', toe: 'W', straight: 'E', diverge: 'SE', section: 'Iz1' },
    ...H(5, 32, 4, 'T1'),
    ...H(33, 34, 4, 'ZbB1'),
    { ...T(35, 4, ['W', 'E'], 'ZbB1'), text: 'Zalesie' },

    // ---- tor 2 (y = 6) – kierunek wschodni ----
    { ...T(0, 6, ['W', 'E'], 'ZbA'), text: 'Krasne' },
    ...H(1, 3, 6, 'ZbA'),
    ...H(4, 5, 6, 'Iz1'),
    T(5, 5, ['NW', 'SE'], 'Iz1'),
    { x: 6, y: 6, type: 'point', id: 'Zw2', label: '2', toe: 'E', straight: 'W', diverge: 'NW', section: 'Iz1' },
    T(7, 6, ['W', 'E'], 'Iz3'),
    { x: 8, y: 6, type: 'point', id: 'Zw3', label: '3', toe: 'W', straight: 'E', diverge: 'SE', section: 'Iz3' },
    ...H(9, 27, 6, 'T2'),
    { x: 28, y: 6, type: 'point', id: 'Zw5', label: '5', toe: 'E', straight: 'W', diverge: 'SW', section: 'Iz5' },
    ...H(29, 34, 6, 'ZbE2'),
    { ...T(35, 6, ['W', 'E'], 'ZbE2'), endButton: { id: 'kZ2', color: 'green' }, text: 'Zalesie' },

    // ---- tor 3 (y = 8) ----
    T(9, 7, ['NW', 'SE'], 'Iz3'),
    T(10, 8, ['NW', 'E'], 'Iz3'),
    ...H(11, 21, 8, 'T3'),
    { x: 22, y: 8, type: 'point', id: 'Zw7', label: '7', toe: 'W', straight: 'E', diverge: 'SE', section: 'Iz7' },
    ...H(23, 25, 8, 'T3b'),
    { x: 26, y: 8, type: 'point', id: 'Zw6', label: '6', toe: 'W', straight: 'E', diverge: 'NE', section: 'Iz5' },
    T(27, 7, ['NE', 'SW'], 'Iz5'),
    ...H(27, 28, 8, 'T3c'),
    ...H(29, 34, 8, 'ZbC'),
    { ...T(35, 8, ['W', 'E'], 'ZbC'), endButton: { id: 'kB', color: 'green' }, text: 'Borki' },

    // ---- tor 4 (y = 10) ----
    T(23, 9, ['NW', 'SE'], 'Iz7'),
    T(24, 10, ['NW', 'E'], 'Iz7'),
    { ...T(25, 10, ['W', 'E'], 'T4w'), derailer: 'Wk1' },
    ...H(26, 30, 10, 'T4'),
    { x: 31, y: 10, type: 'buffer', port: 'W', section: 'T4', endButton: { id: 'kT4', color: 'white' } },

    // ---- sygnalizatory ----
    { x: 3, y: 7, type: 'signal', id: 'A', kind: 'semafor', at: { x: 3, y: 6 }, dir: 'E', entry: true },
    { x: 33, y: 3, type: 'signal', id: 'B', kind: 'semafor', at: { x: 33, y: 4 }, dir: 'W', entry: true },
    { x: 29, y: 9, type: 'signal', id: 'C', kind: 'semafor', at: { x: 29, y: 8 }, dir: 'W', entry: true },
    { x: 5, y: 3, type: 'signal', id: 'D1', kind: 'semafor', at: { x: 5, y: 4 }, dir: 'W' },
    { x: 10, y: 7, type: 'signal', id: 'D2', kind: 'semafor', at: { x: 10, y: 6 }, dir: 'W' },
    { x: 11, y: 9, type: 'signal', id: 'D3', kind: 'semafor', at: { x: 11, y: 8 }, dir: 'W' },
    { x: 27, y: 5, type: 'signal', id: 'E2', kind: 'semafor', at: { x: 27, y: 6 }, dir: 'E' },
    { x: 21, y: 7, type: 'signal', id: 'E3', kind: 'semafor', at: { x: 21, y: 8 }, dir: 'E', shunting: true },
    { x: 27, y: 11, type: 'signal', id: 'Tm1', kind: 'tm', at: { x: 27, y: 10 }, dir: 'W' },

    // ---- opisy ----
    { x: 16, y: 3, type: 'label', text: 'tor 1', span: 2 },
    { x: 16, y: 5, type: 'label', text: 'tor 2', span: 2 },
    { x: 16, y: 7, type: 'label', text: 'tor 3', span: 2 },
    { x: 28, y: 9, type: 'label', text: 'tor 4', span: 2 },
    { x: 26, y: 9, type: 'label', text: 'Wk1', size: 8 },
  ],

  routes: { disable: ['D2-K2', 'D3-K2'], override: {} }, // brak wyjazdów na tor wjazdowy linii dwutorowej

  scenarios: [
    { id: 'nauka-2', name: 'Misja 2: pulpit kostkowy typu E (samouczek)', tutorial: 'pulpit', srk: 'E', disruptions: 'none', endTime: '08:30',
      trains: [3301, 3302, 42801, 5501, 6612, 6611, 3304],
      // zwrotnica 3 stoi wtedy w położeniu na tor 3 (po wyjeździe 6611) – pociąg 3304 trzeba przyjąć na tor 3
      faults: [{ type: 'point-control', target: 'Zw3', at: '08:01', duration: 20 }],
      description: 'Linia dwutorowa na pulpicie kostkowym typu E: obsługa dwuprzyciskowa i przyciski grupowe, ruch bez pozwoleń z potwierdzeniem przyjazdu (Ko), wyprzedzanie towarowego na torze 3, pociąg do Borków z pozwoleniem (Wbl), usterka napędu zwrotnicy.' },
    { id: 'zmiana', name: 'Pełna zmiana – pulpit kostkowy typu E (07:00–09:00)', srk: 'E', description: 'Ruch na linii dwutorowej, wyprzedzanie, pociągi do i z Borków. Poziom zakłóceń do wyboru.', endTime: '09:00' },
    { id: 'zmiana-izh', name: 'Pełna zmiana – pulpit typu IZH-111 (07:00–09:00)', srk: 'izh111', description: 'Ten sam rozkład na pulpicie ciemnym urządzeń typu IZH-111.', endTime: '09:00' },
    { id: 'zmiana-lcs', name: 'Pełna zmiana – stanowisko komputerowe (07:00–09:00)', srk: 'komputerowe', description: 'Ten sam rozkład na monitorze (zobrazowanie wg Ie-104).', endTime: '09:00' },
    { id: 'zmiana-mech', name: 'Pełna zmiana – nastawnia mechaniczna (07:00–09:00)', srk: 'mech', description: 'Ten sam rozkład w nastawni mechanicznej: zwrotnice dźwigniami, przebieg drążkiem przebiegowym, blok przebiegowy utwierdzający i dźwignia sygnałowa; po przejeździe dźwignia na „Stój” i drążek z powrotem. Instrukcja obsługi jest pod przyciskiem „?”.', endTime: '09:00' },
    { id: 'zmiana-ebi', name: 'Pełna zmiana – stanowisko EBILock 950 (07:00–09:00)', srk: 'ebilock', description: 'Ten sam rozkład na monitorze EBIScreen: polecenia w linii poleceń (POC, MAN, ZWP, SES…) zatwierdzane „Wykonaj”, prawy klawisz – menu obiektu, sygnał zastępczy dwuczęściowy (SZI → SZW), okno zdarzeń i alarmów. Instrukcja obsługi jest pod przyciskiem „?”.', endTime: '09:00' },
  ],

  timetable: [
    { nr: 3301, kind: 'os', name: 'Osobowy Krasne – Zalesie', from: 'K2', to: 'Z2', arr: '07:05', dep: '07:06', track: '2', stop: true, length: 130, vmax: 100, dwell: 45 },
    { nr: 3302, kind: 'os', name: 'Osobowy Zalesie – Krasne', from: 'Z1', to: 'K1', arr: '07:12', dep: '07:13', track: '1', stop: true, length: 130, vmax: 100, dwell: 45 },
    { nr: 42801, kind: 'tow', cat: 'TM', name: 'Towarowy', from: 'K2', to: 'Z2', arr: '07:21', dep: '07:33', track: '3', stop: true, length: 380, mass: 2000, vmax: 70 },
    { nr: 5501, kind: 'os', name: 'IC Krasne – Zalesie', from: 'K2', to: 'Z2', arr: '07:29', track: '2', stop: false, length: 250, vmax: 120 },
    { nr: 6612, kind: 'os', name: 'Osobowy Krasne – Borki', from: 'K2', to: 'B', arr: '07:42', dep: '07:44', track: '3', stop: true, length: 80, vmax: 80, dwell: 60 },
    { nr: 6611, kind: 'os', name: 'Osobowy Borki – Krasne', from: 'B', to: 'K1', arr: '07:56', dep: '07:59', track: '3', stop: true, length: 80, vmax: 80, dwell: 90 },
    { nr: 3304, kind: 'os', name: 'Osobowy Krasne – Zalesie', from: 'K2', to: 'Z2', arr: '08:10', dep: '08:11', track: '2', stop: true, length: 130, vmax: 100, dwell: 45 },
    { nr: 3303, kind: 'os', name: 'Osobowy Zalesie – Krasne', from: 'Z1', to: 'K1', arr: '08:16', dep: '08:17', track: '1', stop: true, length: 130, vmax: 100, dwell: 45 },
    { nr: 45230, kind: 'tow', cat: 'TN', name: 'Towarowy', from: 'Z1', to: 'K1', arr: '08:28', track: '1', stop: false, length: 500, mass: 1800, vmax: 80 },
    { nr: 6613, kind: 'os', name: 'Osobowy Borki – Krasne', from: 'B', to: 'K1', arr: '08:40', dep: '08:44', track: '3', stop: true, length: 80, vmax: 80, dwell: 90 },
  ],
};
