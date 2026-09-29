/**
 * Zacisze – fikcyjna stacja krańcowa linii jednotorowej (stacja treningowa misji 3).
 *
 * Jedyny szlak prowadzi na zachód, do Modrzewia (blokada Eap). Trzy tory czołowe zakończone kozłami: 1 i 2 przy
 * peronie I (wyspowym), 3 przy peronie II. Każdy pociąg kończy tu bieg, zmienia czoło i wraca na zachód jako nowy
 * pociąg – dlatego ruch wygląda inaczej niż na stacji przelotowej: wjazd kończy się na koźle, a nie na semaforze.
 *
 * Semafory: A (wjazdowy od Modrzewia), B1, B2, B3 (wyjazdowe z torów 1–3). Zwrotnice: 1 (tor 1 / pozostałe),
 * 2 (tor 2 / tor 3). Kroki samouczka: src/tutorial/missions/izh.js.
 */
const T = (x, y, ports, section, extra = {}) => ({ x, y, type: 'track', ports, section, ...extra });
const H = (x1, x2, y, section, extra = {}) => Array.from({ length: x2 - x1 + 1 }, (_, i) => T(x1 + i, y, ['W', 'E'], section, extra));
const BUF = (x, y, section, id) => ({ x, y, type: 'buffer', port: 'W', section, endButton: { id, color: 'white' } });

const shuttle = (nr, arr, track, extra = {}) => ({ nr, kind: 'os', name: 'Osobowy Modrzew – Zacisze', from: 'W', to: null, arr, track, stop: true, terminates: true, length: 110, vmax: 80, ...extra });
const back = (nr, unit, dep, track, extra = {}) => ({ nr, kind: 'os', name: 'Osobowy Zacisze – Modrzew', unit, from: null, to: 'W', dep, track, stop: true, length: 110, vmax: 80, ...extra });

export default {
  schemaVersion: 1,
  id: 'zacisze',
  name: 'Zacisze',
  srk: 'izh111',
  srkInfo: 'Stacja fikcyjna, treningowa: urządzenia przekaźnikowe typu IZH-111 (pulpit ciemny, przyciski adresowe i rozkazów); zmiany także na pulpicie typu E i na stanowisku komputerowym.',
  description: 'Stacja krańcowa linii jednotorowej z Modrzewia. Trzy tory czołowe przy dwóch peronach: pociągi kończą bieg, zmieniają czoło i wracają. Blokada liniowa Eap.',
  location: 'Stacja fikcyjna, koniec linii jednotorowej Modrzew – Zacisze (poligon szkoleniowy).',
  traffic: 'Osobowe kończące bieg i wracające po zmianie czoła; w szczycie dwa składy na stacji jednocześnie.',
  difficulty: 1,
  startTime: '07:00',
  desk: { cols: 28, rows: 10 },

  exits: {
    W: { name: 'Modrzew', tile: { x: 0, y: 4 }, dir: 'W', lineLength: 3600, lineSpeed: 80 },
  },

  sections: {
    ZbA: { length: 320, kind: 'approach' },
    Iz1: { length: 90, kind: 'point' },
    Iz2: { length: 90, kind: 'point' },
    W1: { length: 40, kind: 'plain' },
    W2: { length: 40, kind: 'plain' },
    W3: { length: 40, kind: 'plain' },
    T1: { length: 300, kind: 'station', track: '1', platform: 'Peron I' },
    T2: { length: 270, kind: 'station', track: '2', platform: 'Peron I' },
    T3: { length: 240, kind: 'station', track: '3', platform: 'Peron II' },
  },

  points: { Zw1: { speedDiverging: 40 }, Zw2: { speedDiverging: 40 } },

  tiles: [
    { x: 10, y: 0, type: 'label', text: 'ZACISZE', size: 12, span: 8 },

    // szlak z Modrzewia i głowica
    { ...T(0, 4, ['W', 'E'], 'ZbA'), endButton: { id: 'kW', color: 'green' }, text: 'Modrzew' },
    ...H(1, 4, 4, 'ZbA'),
    T(5, 4, ['W', 'E'], 'Iz1'),
    { x: 6, y: 4, type: 'point', id: 'Zw1', label: '1', toe: 'W', straight: 'E', diverge: 'SE', section: 'Iz1' },
    T(7, 5, ['NW', 'SE'], 'Iz1'),
    T(8, 6, ['NW', 'E'], 'Iz2'),
    { x: 9, y: 6, type: 'point', id: 'Zw2', label: '2', toe: 'W', straight: 'E', diverge: 'SE', section: 'Iz2' },
    T(10, 7, ['NW', 'SE'], 'Iz2'),
    T(11, 8, ['NW', 'E'], 'Iz2'),

    // tor 1 (y = 4), tor 2 (y = 6), tor 3 (y = 8) – czołowe
    T(7, 4, ['W', 'E'], 'W1'),
    ...H(8, 24, 4, 'T1'), BUF(25, 4, 'T1', 'kT1'),
    T(10, 6, ['W', 'E'], 'W2'),
    ...H(11, 24, 6, 'T2'), BUF(25, 6, 'T2', 'kT2'),
    T(12, 8, ['W', 'E'], 'W3'),
    ...H(13, 24, 8, 'T3'), BUF(25, 8, 'T3', 'kT3'),

    // sygnalizatory
    { x: 4, y: 3, type: 'signal', id: 'A', kind: 'semafor', at: { x: 4, y: 4 }, dir: 'E', entry: true },
    { x: 8, y: 3, type: 'signal', id: 'B1', kind: 'semafor', at: { x: 8, y: 4 }, dir: 'W' },
    { x: 11, y: 5, type: 'signal', id: 'B2', kind: 'semafor', at: { x: 11, y: 6 }, dir: 'W' },
    { x: 13, y: 9, type: 'signal', id: 'B3', kind: 'semafor', at: { x: 13, y: 8 }, dir: 'W' },

    // opisy
    { x: 16, y: 3, type: 'label', text: 'tor 1', span: 2 },
    { x: 16, y: 7, type: 'label', text: 'tor 2', span: 2 },
    { x: 16, y: 9, type: 'label', text: 'tor 3', span: 2 },
  ],

  routes: { disable: [], override: {} },

  scenarios: [
    { id: 'nauka-3', name: 'Misja 3: pulpit typu IZH-111 (samouczek)', tutorial: 'izh', srk: 'izh111', disruptions: 'none', endTime: '08:45',
      trains: [7101, 7102, 7103, 7104, 7105, 7106, 7107, 7108],
      // tor 3 pokazuje zajętość bez pociągu – wjazd 7107 na sygnał zastępczy po ręcznym ułożeniu drogi
      faults: [{ type: 'false-occupancy', target: 'T3', at: '08:05', duration: 19 }],
      description: 'Stacja krańcowa na pulpicie ciemnym typu IZH-111: przycisk adresowy i rozkaz, wjazd na tor czołowy, zmiana czoła i odjazd z powrotem, dwa składy na stacji, zwolnienie czasowe Zcz, wjazd na sygnał zastępczy przy usterce obwodu torowego.' },
    { id: 'zmiana', name: 'Pełna zmiana – pulpit typu IZH-111 (07:00–09:00)', srk: 'izh111', description: 'Wahadła z Modrzewia kończą bieg i wracają; w szczycie dwa składy na stacji. Poziom zakłóceń do wyboru.', endTime: '09:00' },
    { id: 'zmiana-e', name: 'Pełna zmiana – pulpit kostkowy typu E (07:00–09:00)', srk: 'E', description: 'Ten sam rozkład na pulpicie kostkowym urządzeń przekaźnikowych typu E.', endTime: '09:00' },
    { id: 'zmiana-lcs', name: 'Pełna zmiana – stanowisko komputerowe (07:00–09:00)', srk: 'komputerowe', description: 'Ten sam rozkład na monitorze (zobrazowanie wg Ie-104).', endTime: '09:00' },
    { id: 'zmiana-mech', name: 'Pełna zmiana – nastawnia mechaniczna (07:00–09:00)', srk: 'mech', description: 'Ten sam rozkład w nastawni mechanicznej: zwrotnice dźwigniami, przebieg drążkiem przebiegowym, blok przebiegowy utwierdzający i dźwignia sygnałowa; po przejeździe dźwignia na „Stój” i drążek z powrotem. Instrukcja obsługi jest pod przyciskiem „?”.', endTime: '09:00' },
    { id: 'zmiana-ebi', name: 'Pełna zmiana – stanowisko EBILock 950 (07:00–09:00)', srk: 'ebilock', description: 'Ten sam rozkład na monitorze EBIScreen: polecenia w linii poleceń (POC, MAN, ZWP, SES…) zatwierdzane „Wykonaj”, prawy klawisz – menu obiektu, sygnał zastępczy dwuczęściowy (SZI → SZW), okno zdarzeń i alarmów. Instrukcja obsługi jest pod przyciskiem „?”.', endTime: '09:00' },
  ],

  timetable: [
    shuttle(7101, '07:04', '1'), back(7102, 7101, '07:14', '1'),
    shuttle(7103, '07:26', '2'), shuttle(7105, '07:40', '1'),
    back(7104, 7103, '07:50', '2'), back(7106, 7105, '08:02', '1'),
    shuttle(7107, '08:14', '3'), back(7108, 7107, '08:26', '3'),
    shuttle(7109, '08:38', '1'), back(7110, 7109, '08:50', '1'),
  ],
};
