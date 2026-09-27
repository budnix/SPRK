/**
 * Wola Pustkowska – dawna stacja fikcyjna gry, od usunięcia z rejestru wyłącznie **stacja testowa** (fixture):
 * linia dwutorowa z blokadą jednokierunkową i odgałęzienie z Eap – testy układu kostek blokady i zapowiadania
 * telefonicznego (`wola.test.js`, `blockLayout.test.js`). Nie jest dostępna w grze.
 *
 * Stacja Wola Pustkowska – stacja węzłowa na linii dwutorowej Krasne – Zalesie
 * z odgałęzieniem jednotorowym do Borków.
 *
 * Tory: 1 (główny, kierunek zachodni – do Krasnego), 2 (główny, kierunek wschodni – do Zalesia),
 *       3 (główny dodatkowy, perony, pociągi z/do Borków), 4 (boczny, ładunkowy, kozioł, Wk1).
 * Blokady: tory szlakowe linii dwutorowej – jednokierunkowe (tylko Po/Ko),
 *          szlak do Borków – Eap dwukierunkowa.
 * Semafory: A (wjazd od Krasnego, tor 2), B (wjazd od Zalesia, tor 1), C (wjazd od Borków, tor 3),
 *           D1, D2, D3 (wyjazd na zachód), E2, E3 (wyjazd na wschód / do Borków).
 */
const T = (x, y, ports, section, extra = {}) => ({ x, y, type: 'track', ports, section, ...extra });
const H = (x1, x2, y, section, extra = {}) => Array.from({ length: x2 - x1 + 1 }, (_, i) => T(x1 + i, y, ['W', 'E'], section, extra));

export default {
  schemaVersion: 1,
  id: 'wola-pustkowska',
  name: 'Wola Pustkowska',
  srk: 'E',
  srkInfo: 'Stacja fikcyjna: urządzenia przekaźnikowe typu E z pulpitem kostkowym, blokady jednokierunkowe linii dwutorowej i Eap na odgałęzieniu.',
  description: 'Stacja węzłowa: linia dwutorowa Krasne – Zalesie (blokady jednokierunkowe) i odgałęzienie do Borków (Eap). Cztery tory, bocznica z wykolejnicą.',
  location: 'Stacja fikcyjna, węzeł: linia dwutorowa Krasne – Zalesie i odgałęzienie do Borków.',
  traffic: 'Ruch jednokierunkowy na linii dwutorowej, pociągi do Borków przez tor 3, zdawczy z manewrami.',
  difficulty: 3,
  startTime: '06:55',
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
    T3: { length: 260, kind: 'station', track: '3', platform: 'Peron II' },
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
    { x: 14, y: 0, type: 'label', text: 'WOLA PUSTKOWSKA', size: 12, span: 8 },
    { x: 12, y: 1, type: 'button', id: 'Zw', label: 'Zw', role: 'group-point', color: 'black' },
    { x: 13, y: 1, type: 'button', id: 'Zz', label: 'Zz', role: 'point-lock', color: 'blue' },
    { x: 15, y: 1, type: 'button', id: 'Pz', label: 'Pz', role: 'route-release', color: 'grey' },
    { x: 16, y: 1, type: 'button', id: 'dPz', label: 'dPz', role: 'emergency-release', color: 'red', counter: true },
    { x: 18, y: 1, type: 'button', id: 'Sz', label: 'Sz', role: 'substitute', color: 'white', counter: true },

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

  timetable: [
    { nr: 3301, kind: 'os', name: 'Osobowy', from: 'K2', to: 'Z2', arr: '07:05', dep: '07:06', track: '2', stop: true, length: 130, vmax: 100, dwell: 45 },
    { nr: 3302, kind: 'os', name: 'Osobowy', from: 'Z1', to: 'K1', arr: '07:12', dep: '07:13', track: '1', stop: true, length: 130, vmax: 100, dwell: 45 },
    { nr: 6611, kind: 'os', name: 'Osobowy', from: 'B', to: 'K1', arr: '07:20', dep: '07:24', track: '3', stop: true, length: 80, vmax: 80, dwell: 90 },
    { nr: 42801, kind: 'tow', name: 'Towarowy', from: 'K2', to: 'Z2', arr: '07:35', track: '2', stop: false, length: 450, vmax: 80 },
    { nr: 6612, kind: 'os', name: 'Osobowy', from: 'K2', to: 'B', arr: '07:48', dep: '07:50', track: '3', stop: true, length: 80, vmax: 80, dwell: 60 },
    { nr: 71511, kind: 'tow', name: 'Zdawczy', from: 'B', to: null, arr: '07:58', track: '3', stop: true, terminates: true, length: 120, vmax: 60, dwell: 30 },
    { nr: 3303, kind: 'os', name: 'Osobowy', from: 'Z1', to: 'K1', arr: '08:02', dep: '08:03', track: '1', stop: true, length: 130, vmax: 100, dwell: 45 },
    { nr: 3304, kind: 'os', name: 'Osobowy', from: 'K2', to: 'Z2', arr: '08:10', dep: '08:11', track: '2', stop: true, length: 130, vmax: 100, dwell: 45 },
    { nr: 45230, kind: 'tow', name: 'Towarowy', from: 'Z1', to: 'K1', arr: '08:20', track: '1', stop: false, length: 500, vmax: 80 },
    { nr: 6613, kind: 'os', name: 'Osobowy', from: 'B', to: 'K1', arr: '08:40', dep: '08:44', track: '3', stop: true, length: 80, vmax: 80, dwell: 90 },
    { nr: 71512, kind: 'tow', name: 'Zdawczy', unit: 71511, from: null, to: 'B', dep: '09:05', track: '3', stop: false, length: 120, vmax: 60 },
  ],

  /** Zadania manewrowe: skład pociągu `unit` ma stanąć na torze `toTrack` przed `deadline`. */
  tasks: [
    { id: 'odstaw-71511', unit: 71511, type: 'move', toTrack: '4', deadline: '08:35', text: 'Skład zdawczego 71511 odstawić na tor 4 (przed przyjazdem 6613 na tor 3).' },
    { id: 'podstaw-71512', unit: 71511, type: 'move', toTrack: '3', after: '08:50', deadline: '09:03', text: 'Skład podstawić na tor 3 jako pociąg 71512 do Borków (odjazd 09:05).' },
  ],

  scenarios: [
    { id: 'zmiana', name: 'Pełna zmiana (06:55–09:15)', description: 'Linia dwutorowa z ruchem jednokierunkowym, pociągi do i z Borków przez tor 3, zdawczy z manewrami na tor 4.', endTime: '09:20' },
    { id: 'borki-bez-blokady', name: 'Borki: blokada bez łączności', description: 'Blokada do Borków traci łączność na godzinę. Pociągi 6611, 6612 i zdawczy trzeba zapowiadać telefonicznie.',
      endTime: '09:20', faults: [{ type: 'block-fail', target: 'B', at: '07:08', duration: 60 }], disruptions: 'none' },
    { id: 'szczyt', name: 'Szczyt z zakłóceniami', description: 'Pełny rozkład z dużymi zakłóceniami: opóźnienia, usterki, pociąg nadzwyczajny.', endTime: '09:30', disruptions: 'high' },
  ],
};
