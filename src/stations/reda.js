/**
 * Reda – stacja na linii 202 (Gdańsk – Stargard) z odgałęzieniem linii 213 do Helu. Układ wg planu schematycznego
 * stacji (stan I 2020, rys. A. Karwat). Dwie nastawnie: „Rd” (głowica wschodnia, dysponująca) i „Rd1” (zachodnia) –
 * w symulatorze jedno stanowisko na całą stację.
 *
 * Pulpit 100×16. Rzędy: 2 – tor 106 (bocznica), 4 – tor 4, 6 – tor 2 (202 t.2, peron II), 8 – tor 1
 * (202 t.1, peron II), 10 – tor 3 i tor 23 (peron I) oraz szlak 213 do Helu, 12 – tor 7 (droga ładunkowa) i tor 11
 * (peron Ia, wahadła do Helu), 14 – tor 9. Ruch prawostronny: Rumia po lewej, tor „w prawo” (wjazdowy od Rumi)
 * pod torem „w lewo”; od Wejherowa tor wjazdowy nad wyjazdowym.
 *
 * Semafory wg planu: wjazdowe A (od Rumi), S (od Wejherowa), R (od Helu); wyjazdowe na zachód E (tor 4), D (2),
 * C1 (1), C2 (3) do semafora Szn2 na szlaku (drugi stopień wyjazdu), na wschód K4 (4), K2 (2), L (1), M (23), P (11)
 * do Szn1 (202) albo wprost na szlak 213. Wykolejnice Wk1 (bocznica Transbud), Wk2 (tor 7/9 → 18), Wk4 (8 → 9).
 *
 * Uproszczenia względem planu: rozjazd krzyżowy 25 jako para 25a/25b na torze 1; tory 106/108 jako jeden tor 106
 * bez rozjazdu 19 i toru 109 (ul. Leśna, Prefabet); rozjazd 51 i tor 27 z Wk5 pominięte (bocznica Transbud wprost
 * z rozjazdu 7); semafor R2/m przy peronie 1 (niejednoznaczny na planie) pominięty; tory szlakowe 202 jednokierunkowe.
 * Dodane tarcze Tm7 (wyjazd z bocznicy Transbud na tory 7/9) i Tm20 (łuk 20–24, dojazd do toru 106) – planu nie ma
 * sygnalizatorów w tych miejscach, bez nich tory 7/9 i 106 byłyby nieosiągalne.
 */

const T = (x, y, ports, section, extra = {}) => ({ x, y, type: 'track', ports, section, ...extra });
const H = (x1, x2, y, section, extra = {}) => Array.from({ length: x2 - x1 + 1 }, (_, i) => T(x1 + i, y, ['W', 'E'], section, extra));
const P = (x, y, id, label, toe, straight, diverge, section) => ({ x, y, type: 'point', id, label, toe, straight, diverge, section });
const SIG = (x, y, id, kind, at, dir, extra = {}) => ({ x, y, type: 'signal', id, kind, at, dir, ...extra });
const BUF = (x, y, port, section, id) => ({ x, y, type: 'buffer', port, section, endButton: { id, color: 'white' } });

const tiles = [];
const sections = {};
const sec = (id, def) => { sections[id] = def; return id; };

// ---- tytuł, przyciski, opisy ----
tiles.push({ x: 24, y: 0, type: 'label', text: 'REDA', size: 12, span: 16 });
tiles.push({ x: 1, y: 10, type: 'label', text: 'linia 202 · Rumia', span: 4, size: 7 }, { x: 91, y: 3, type: 'label', text: 'linia 202 · Wejherowo', span: 5, size: 7 },
  { x: 90, y: 11, type: 'label', text: 'linia 213 · Hel', span: 4, size: 7 },
  { x: 48, y: 1, type: 'label', text: 'tor 106 · 108', span: 4, size: 7 });

// ---- zachód: szlak do Rumi (Eap dwutorowa), semafor wjazdowy A, semafor Szn2 na torze wyjazdowym ----
const westExit = (y, id, sec_, text) => {
  sec(sec_, { length: 400, kind: 'approach' });
  tiles.push({ ...T(0, y, ['W', 'E'], sec_), endButton: { id: `k${id}`, color: 'green' }, text }, ...H(1, 5, y, sec_));
};
westExit(6, 'RM2', 'ZbRM2', 'Rumia 202 t.2'); westExit(8, 'RM1', 'ZbRM1', 'Rumia 202 t.1');
tiles.push(SIG(5, 9, 'A', 'semafor', { x: 5, y: 8 }, 'E', { entry: true }), SIG(6, 5, 'Szn2', 'semafor', { x: 6, y: 6 }, 'W'));

// ---- zachód: głowica ----
// tor 2 (202 t.2): W2a – rozjazd 2 (z toru 1 przez 1) – W2b – rozjazd 3 (na tor 1 przez 5) – W2c – rozjazd 4 (na tor 4) – W2d – D – tor 2
sec('W2a', { length: 100, kind: 'plain' }); tiles.push(...H(6, 9, 6, 'W2a'));
sec('Iz1', { length: 90, kind: 'point' }); tiles.push(P(8, 8, 'Zw1', '1', 'W', 'E', 'NE', 'Iz1'), T(9, 7, ['SW', 'NE'], 'Iz1'), P(10, 6, 'Zw2', '2', 'E', 'W', 'SW', 'Iz1'));
sec('W2b', { length: 30, kind: 'plain' }); tiles.push(T(11, 6, ['W', 'E'], 'W2b'));
sec('Iz3', { length: 90, kind: 'point' }); tiles.push(P(12, 6, 'Zw3', '3', 'W', 'E', 'SE', 'Iz3'), T(13, 7, ['NW', 'SE'], 'Iz3'), P(14, 8, 'Zw5', '5', 'E', 'W', 'NW', 'Iz3'));
sec('W2c', { length: 60, kind: 'plain' }); tiles.push(...H(13, 15, 6, 'W2c'));
sec('Iz4', { length: 90, kind: 'point' }); tiles.push(P(16, 6, 'Zw4', '4', 'W', 'E', 'NE', 'Iz4'), T(17, 5, ['SW', 'NE'], 'Iz4'), T(18, 4, ['SW', 'E'], 'Iz4'));
sec('W2d', { length: 100, kind: 'plain' }); tiles.push(...H(17, 21, 6, 'W2d'));
// tor 1 (202 t.1): W1a – rozjazd 1 – W1b – rozjazd 5 – W1c – rozjazd 6 (na tor 3 przez 7) – W1d – C1 – tor 1
sec('W1a', { length: 40, kind: 'plain' }); tiles.push(...H(6, 7, 8, 'W1a'));
sec('W1b', { length: 100, kind: 'plain' }); tiles.push(...H(9, 13, 8, 'W1b'));
sec('W1c', { length: 40, kind: 'plain' }); tiles.push(...H(15, 16, 8, 'W1c'));
sec('Iz6', { length: 80, kind: 'point' }); tiles.push(P(17, 8, 'Zw6', '6', 'W', 'E', 'SE', 'Iz6'), T(18, 9, ['NW', 'SE'], 'Iz6'));
sec('W1d', { length: 80, kind: 'plain' }); tiles.push(...H(18, 21, 8, 'W1d'));
// tor 3: rozjazd 7 (z toru 1 przez 6; na zachód bocznica Transbud z Wk1) – W3a – rozjazd 8 (na tory 7/9 przez Wk4 i 9) – C2 – tor 3
sec('Iz7', { length: 60, kind: 'point' }); tiles.push(P(19, 10, 'Zw7', '7', 'E', 'W', 'NW', 'Iz7'));
sec('T51', { length: 150, kind: 'siding', track: '51' }); tiles.push(BUF(14, 10, 'E', 'T51', 'kT51'), T(15, 10, ['W', 'E'], 'T51'), T(16, 10, ['W', 'E'], 'T51'),
  { ...T(17, 10, ['W', 'E'], 'T51'), derailer: 'Wk1' }, T(18, 10, ['W', 'E'], 'T51'));
tiles.push({ x: 14, y: 11, type: 'label', text: 'Transbud', span: 3, size: 7 }, { x: 17, y: 11, type: 'label', text: 'Wk1', size: 8 });
tiles.push(SIG(18, 11, 'Tm7', 'tm', { x: 18, y: 10 }, 'E')); // tarcza wyjazdu z bocznicy (brak na planie) – dojazd do torów 7/9
sec('W3a', { length: 30, kind: 'plain' }); tiles.push(T(20, 10, ['W', 'E'], 'W3a'));
sec('Iz8', { length: 80, kind: 'point' }); tiles.push(P(21, 10, 'Zw8', '8', 'W', 'E', 'SE', 'Iz8'), { ...T(22, 11, ['NW', 'SE'], 'Iz8'), derailer: 'Wk4' });
tiles.push({ x: 21, y: 12, type: 'label', text: 'Wk4', size: 8 });
sec('Iz9', { length: 60, kind: 'point' }); tiles.push(P(23, 12, 'Zw9', '9', 'NW', 'E', 'SE', 'Iz9'), T(24, 13, ['NW', 'SE'], 'Iz9'), T(25, 14, ['NW', 'E'], 'Iz9'));
tiles.push(SIG(19, 3, 'E', 'semafor', { x: 19, y: 4 }, 'W', { shunting: true }), SIG(22, 5, 'D', 'semafor', { x: 22, y: 6 }, 'W', { shunting: true }),
  SIG(22, 7, 'C1', 'semafor', { x: 22, y: 8 }, 'W', { shunting: true }), SIG(23, 9, 'C2', 'semafor', { x: 23, y: 10 }, 'W', { shunting: true }));

// ---- tory stacyjne ----
sec('T106', { length: 130, kind: 'siding', track: '106' }); tiles.push(BUF(45, 2, 'E', 'T106', 'kT106'), ...H(46, 56, 2, 'T106'));
sec('W106', { length: 60, kind: 'plain' }); tiles.push(T(57, 2, ['W', 'SE'], 'W106'), T(58, 3, ['NW', 'SE'], 'W106'));
sec('T4', { length: 649, kind: 'station', track: '4' }); tiles.push(...H(19, 58, 4, 'T4'));
sec('T2', { length: 753, kind: 'station', track: '2', platform: 'Peron II' }); tiles.push(...H(22, 60, 6, 'T2'));
sec('T1', { length: 693, kind: 'station', track: '1', platform: 'Peron II' }); tiles.push(...H(22, 62, 8, 'T1'));
sec('T3', { length: 453, kind: 'station', track: '3' }); tiles.push(...H(22, 47, 10, 'T3'));
sec('T7', { length: 282, kind: 'siding', track: '7' }); tiles.push(...H(24, 44, 12, 'T7'));
sec('T9', { length: 282, kind: 'siding', track: '9' }); tiles.push(...H(26, 42, 14, 'T9'));
// tory 7/9 zbiegają się rozjazdem 16, przez Wk2 do rozjazdu 18 na torze 3; dalej tor 23 (peron I)
sec('Iz16', { length: 80, kind: 'point' }); tiles.push(T(43, 14, ['W', 'NE'], 'Iz16'), T(44, 13, ['SW', 'NE'], 'Iz16'), P(45, 12, 'Zw16', '16', 'E', 'W', 'SW', 'Iz16'));
sec('W7c', { length: 50, kind: 'plain' }); tiles.push({ ...T(46, 12, ['W', 'NE'], 'W7c'), derailer: 'Wk2' }, T(47, 11, ['SW', 'NE'], 'W7c'));
tiles.push({ x: 46, y: 13, type: 'label', text: 'Wk2', size: 8 });
sec('Iz18', { length: 60, kind: 'point' }); tiles.push(P(48, 10, 'Zw18', '18', 'E', 'W', 'SW', 'Iz18'));
// na planie tor 23 – wschodnia część toru 3 przy peronie I (jeden numer toru, żeby przelot torem 3 był jednym torem)
sec('T23', { length: 231, kind: 'station', track: '3', platform: 'Peron I' }); tiles.push(...H(49, 65, 10, 'T23'));
sec('T11', { length: 99, kind: 'station', track: '11', platform: 'Peron Ia' }); tiles.push(BUF(59, 12, 'E', 'T11', 'kT11'), ...H(60, 73, 12, 'T11'));
tiles.push({ x: 36, y: 3, type: 'label', text: 'tor 4', span: 2, size: 8 }, { x: 36, y: 5, type: 'label', text: 'tor 2 · Peron II', span: 4, size: 8 },
  { x: 36, y: 9, type: 'label', text: 'tor 1 · Peron II', span: 4, size: 8 }, { x: 30, y: 11, type: 'label', text: 'tor 3', span: 2, size: 8 },
  { x: 54, y: 11, type: 'label', text: 'tor 3 (23) · Peron I', span: 4, size: 8 }, { x: 30, y: 13, type: 'label', text: 'tor 7', span: 2, size: 8 },
  { x: 30, y: 15, type: 'label', text: 'tor 9', span: 2, size: 8 }, { x: 62, y: 13, type: 'label', text: 'tor 11 · Peron Ia', span: 4, size: 8 },
  { x: 24, y: 15, type: 'label', text: 'droga ładunkowa', span: 4, size: 7 });
// semafory wyjazdowe na wschód
tiles.push(SIG(57, 3, 'K4', 'semafor', { x: 57, y: 4 }, 'E', { shunting: true }), SIG(60, 5, 'K2', 'semafor', { x: 60, y: 6 }, 'E', { shunting: true }),
  SIG(62, 9, 'L', 'semafor', { x: 62, y: 8 }, 'E', { shunting: true }), SIG(65, 11, 'M', 'semafor', { x: 65, y: 10 }, 'E', { shunting: true }),
  SIG(73, 13, 'P', 'semafor', { x: 73, y: 12 }, 'E', { shunting: true }));

// ---- wschód: głowica ----
// tor 4 → rozjazd 20 (bocznica 106) → łuk → rozjazd 24 na torze 2
sec('Iz20', { length: 100, kind: 'point' }); tiles.push(P(59, 4, 'Zw20', '20', 'E', 'W', 'NW', 'Iz20'), T(60, 4, ['W', 'SE'], 'Iz20'), T(61, 5, ['NW', 'SE'], 'Iz20'));
tiles.push(SIG(60, 3, 'Tm20', 'tm', { x: 60, y: 4 }, 'W')); // tarcza na łuku 20–24 (brak na planie) – dojazd do bocznic 106/109
sec('Iz24', { length: 60, kind: 'point' }); tiles.push(T(61, 6, ['W', 'E'], 'Iz24'), P(62, 6, 'Zw24', '24', 'E', 'W', 'NW', 'Iz24'));
sec('E2a', { length: 30, kind: 'plain' }); tiles.push(T(63, 6, ['W', 'E'], 'E2a'));
// przejście 21/23 (tor 2 → tor 1), rozjazd krzyżowy 25 (tor 3 ↔ tor 1 ↔ tor 2) jako 25a/25b, przejście 28/29 (tor 1 → tor 3)
sec('Iz21', { length: 100, kind: 'point' }); tiles.push(P(64, 6, 'Zw21', '21', 'W', 'E', 'SE', 'Iz21'), T(65, 7, ['NW', 'SE'], 'Iz21'), P(66, 8, 'Zw23', '23', 'E', 'W', 'NW', 'Iz21'));
sec('E2b', { length: 120, kind: 'plain' }); tiles.push(...H(65, 70, 6, 'E2b'));
sec('Iz27', { length: 60, kind: 'point' }); tiles.push(P(71, 6, 'Zw27', '27', 'E', 'W', 'SW', 'Iz27'));
sec('E2c', { length: 350, kind: 'plain' }); tiles.push(...H(72, 89, 6, 'E2c'));
sec('E1a', { length: 60, kind: 'plain' }); tiles.push(...H(63, 65, 8, 'E1a'));
sec('E1b', { length: 30, kind: 'plain' }); tiles.push(T(67, 8, ['W', 'E'], 'E1b'));
sec('Iz25', { length: 100, kind: 'point' }); tiles.push(P(68, 8, 'Zw25a', '25a', 'E', 'W', 'SW', 'Iz25'), P(69, 8, 'Zw25b', '25b', 'W', 'E', 'NE', 'Iz25'), T(70, 7, ['SW', 'NE'], 'Iz25'));
sec('E1c', { length: 30, kind: 'plain' }); tiles.push(T(70, 8, ['W', 'E'], 'E1c'));
sec('Iz28', { length: 80, kind: 'point' }); tiles.push(P(71, 8, 'Zw28', '28', 'W', 'E', 'SE', 'Iz28'), T(72, 9, ['NW', 'SE'], 'Iz28'));
sec('E1d', { length: 120, kind: 'plain' }); tiles.push(...H(72, 77, 8, 'E1d'));
sec('Iz22', { length: 80, kind: 'point' }); tiles.push(P(66, 10, 'Zw22', '22', 'W', 'E', 'NE', 'Iz22'), T(67, 9, ['SW', 'NE'], 'Iz22'));
sec('E3a', { length: 120, kind: 'plain' }); tiles.push(...H(67, 72, 10, 'E3a'));
sec('Iz29', { length: 60, kind: 'point' }); tiles.push(P(73, 10, 'Zw29', '29', 'E', 'W', 'NW', 'Iz29'));
sec('E3b', { length: 40, kind: 'plain' }); tiles.push(...H(74, 75, 10, 'E3b'));
sec('Iz31', { length: 80, kind: 'point' }); tiles.push(P(76, 10, 'Zw31', '31', 'E', 'W', 'SW', 'Iz31'), T(75, 11, ['NE', 'SW'], 'Iz31'), T(74, 12, ['NE', 'W'], 'Iz31'));
sec('E3c', { length: 250, kind: 'plain' }); tiles.push(...H(77, 89, 10, 'E3c'));
// ---- wschód: szlaki do Wejherowa (202, Eap dwutorowa, S) i do Helu (213, Eap jednotorowa, R); Szn1 na torze wyjazdowym ----
const eastExit = (y, id, sec_, text, x0 = 90) => {
  sec(sec_, { length: 500, kind: 'approach' });
  tiles.push(...H(x0, 98, y, sec_), { ...T(99, y, ['W', 'E'], sec_), endButton: { id: `k${id}`, color: 'green' }, text });
};
eastExit(6, 'WJ2', 'ZbWJ2', 'Wejherowo 202 t.2'); eastExit(8, 'WJ1', 'ZbWJ1', 'Wejherowo 202 t.1', 78); eastExit(10, 'HL', 'ZbHL', 'Hel 213');
tiles.push(SIG(90, 5, 'S', 'semafor', { x: 90, y: 6 }, 'W', { entry: true }), SIG(77, 9, 'Szn1', 'semafor', { x: 77, y: 8 }, 'E'),
  SIG(90, 9, 'R', 'semafor', { x: 90, y: 10 }, 'W', { entry: true }));

export default {
  schemaVersion: 1,
  id: 'reda',
  name: 'Reda',
  srk: 'E',
  srkInfo: 'Urządzenia przekaźnikowe typu E (stan planu: I 2020) z nastawniami „Rd” i „Rd1” – tu jedno stanowisko na całą stację; modernizacja linii 202 zastępuje je urządzeniami komputerowymi, dostępnymi jako druga zmiana.',
  description: 'Stacja na linii 202 Gdańsk – Stargard, początek linii 213 do Helu. Peron II (tory 2/1), peron I (tor 23), peron Ia (tor 11, wahadła do Helu), tor 3 dla przelotów, tor 4 i tory ładunkowe 7/9. Blokady półsamoczynne Eap do Rumi, Wejherowa i Helu.',
  location: 'Linia 202 Gdańsk – Stargard za Rumią, węzeł z linią 213 Reda – Hel; powiat wejherowski, woj. pomorskie.',
  region: 'pomorskie',          // województwo – mapa wyboru posterunku
  lines: [202, 213],              // linie kolejowe (jak w `location`)
  geo: [54.5944, 18.3533],      // współrzędne stacji (docs/SOURCES.md, „Mapa wyboru posterunku”)
  traffic: 'Regionalne i dalekobieżne na peronie II, pociągi z Helu na peronie I i Ia, towarowe przelotem torem 3 i zdawcze na tory ładunkowe.',
  difficulty: 4,
  startTime: '05:55',
  desk: { cols: 100, rows: 16, controls: { x: 28, y: 1 } },

  exits: {
    RM2: { name: 'Rumia', label: 'Rumia – 202 t.2', tile: { x: 0, y: 6 }, dir: 'W', direction: 'out', lineLength: 6400, lineSpeed: 120 },
    RM1: { name: 'Rumia', label: 'Rumia – 202 t.1', tile: { x: 0, y: 8 }, dir: 'W', direction: 'in', lineLength: 6400, lineSpeed: 120 },
    WJ2: { name: 'Wejherowo', label: 'Wejherowo – 202 t.2', tile: { x: 99, y: 6 }, dir: 'E', direction: 'in', lineLength: 8200, lineSpeed: 120 },
    WJ1: { name: 'Wejherowo', label: 'Wejherowo – 202 t.1', tile: { x: 99, y: 8 }, dir: 'E', direction: 'out', lineLength: 8200, lineSpeed: 120 },
    HL: { name: 'Puck', label: 'Puck – 213', tile: { x: 99, y: 10 }, dir: 'E', lineLength: 13000, lineSpeed: 80 },
  },
  sections,
  tiles,
  // wyłączone: jazdy na tory szlakowe wjazdowe (RM1, WJ2), okrężne warianty przez przejścia 1–2/3–5 i tory 7/9,
  // przejazdy z Wejherowa/Helu na zachód bez zatrzymania na semaforze toru
  routes: { disable: ['A-M#2', 'A-M#3', 'A-L#2', 'A-M#4', 'A-M#5', 'A-M#6', 'E-RM1', 'D-RM1', 'C1-RM1', 'C1-RM1#2', 'C2-RM1', 'C2-RM1#2',
    'K4-WJ2', 'K4-WJ2#2', 'K2-WJ2', 'K2-WJ2#2', 'L-WJ2', 'M-HL#2', 'M-WJ2',
    'S-D#2', 'S-E#2', 'S-RM1', 'S-Szn2', 'S-RM1#2', 'S-RM1#3', 'S-Szn2#2', 'S-RM1#4',
    'R-RM1', 'R-Szn2', 'R-RM1#2', 'R-RM1#3', 'R-Szn2#2', 'R-RM1#4', 'R-E', 'R-C2#2', 'R-RM1#5', 'R-Szn2#3', 'R-RM1#6', 'R-RM1#7', 'R-Szn2#4', 'R-RM1#8'], override: {} },

  timetable: [
    { nr: 55700, kind: 'os', name: 'Regio Hel – Reda', stock: ['SA136', 'SA137', 'SA138'], from: 'HL', to: null, arr: '06:08', track: '11', stop: true, terminates: true, length: 65, vmax: 80 },
    { nr: 55201, kind: 'os', name: 'Regio Słupsk – Gdańsk Gł.', from: 'WJ2', to: 'RM2', arr: '06:17', dep: '06:18', track: '2', stop: true, length: 160, vmax: 120, dwell: 40 },
    { nr: 55100, kind: 'os', name: 'Regio Gdańsk Gł. – Słupsk', from: 'RM1', to: 'WJ1', arr: '06:19', dep: '06:20', track: '1', stop: true, length: 160, vmax: 120, dwell: 40 },
    { nr: 55701, kind: 'os', name: 'Regio Reda – Hel', stock: ['SA136', 'SA137', 'SA138'], unit: 55700, from: null, to: 'HL', dep: '06:20', track: '11', stop: true, length: 65, vmax: 80 },
    { nr: 55710, kind: 'os', name: 'Regio Gdynia Gł. – Hel', stock: ['SA136', 'SA137', 'SA138'], from: 'RM1', to: 'HL', arr: '06:35', dep: '06:36', track: '3', stop: true, length: 130, vmax: 100, dwell: 40 },
    { nr: 44560, kind: 'tow', cat: 'TN', name: 'Towarowy Gdynia Port – Szczecin Port Centralny', from: 'RM1', to: 'WJ1', arr: '06:43', track: '3', stop: false, length: 480, mass: 1500, vmax: 60 },
    { nr: 55203, kind: 'os', name: 'Regio Lębork – Gdańsk Gł.', from: 'WJ2', to: 'RM2', arr: '06:47', dep: '06:48', track: '2', stop: true, length: 160, vmax: 120, dwell: 40 },
    { nr: 55102, kind: 'os', name: 'Regio Gdańsk Gł. – Lębork', from: 'RM1', to: 'WJ1', arr: '06:49', dep: '06:50', track: '1', stop: true, length: 160, vmax: 120, dwell: 40 },
    { nr: 55702, kind: 'os', name: 'Regio Hel – Reda', stock: ['SA136', 'SA137', 'SA138'], from: 'HL', to: null, arr: '06:58', track: '11', stop: true, terminates: true, length: 65, vmax: 80 },
    { nr: 5100, kind: 'os', name: 'IC Warszawa Wsch. – Słupsk', from: 'RM1', to: 'WJ1', arr: '06:58', track: '1', stop: false, length: 260 },
    { nr: 44561, kind: 'tow', cat: 'TM', name: 'Towarowy Szczecin Port Centralny – Gdańsk Port Płn.', from: 'WJ2', to: 'RM2', arr: '07:07', track: '2', stop: false, length: 520, mass: 2500, vmax: 60 },
    { nr: 5301, kind: 'os', name: 'TLK Hel – Warszawa Wsch.', stock: '754', from: 'HL', to: 'RM2', arr: '07:12', dep: '07:14', track: '3', stop: true, length: 300, dwell: 60 },
    { nr: 55205, kind: 'os', name: 'Regio Słupsk – Gdańsk Gł.', from: 'WJ2', to: 'RM2', arr: '07:17', dep: '07:18', track: '2', stop: true, length: 160, vmax: 120, dwell: 40 },
    { nr: 55104, kind: 'os', name: 'Regio Gdańsk Gł. – Słupsk', from: 'RM1', to: 'WJ1', arr: '07:19', dep: '07:20', track: '1', stop: true, length: 160, vmax: 120, dwell: 40 },
    { nr: 44570, kind: 'tow', cat: 'TK', traction: 'S', name: 'Towarowy Reda – Rumia (zdawczy)', from: null, to: 'RM2', dep: '07:22', track: '4', stop: false, length: 220, mass: 400, vmax: 60, startOn: { section: 'T4', dir: 'W' } },
    { nr: 55703, kind: 'os', name: 'Regio Reda – Hel', stock: ['SA136', 'SA137', 'SA138'], unit: 55702, from: null, to: 'HL', dep: '07:25', track: '11', stop: true, length: 65, vmax: 80 },
    { nr: 55207, kind: 'os', name: 'Regio Lębork – Gdańsk Gł.', from: 'WJ2', to: 'RM2', arr: '07:47', dep: '07:48', track: '2', stop: true, length: 160, vmax: 120, dwell: 40 },
    { nr: 55711, kind: 'os', name: 'Regio Hel – Gdynia Gł.', stock: ['SA136', 'SA137', 'SA138'], from: 'HL', to: 'RM2', arr: '07:48', dep: '07:50', track: '3', stop: true, length: 130, vmax: 100, dwell: 40 },
    { nr: 55106, kind: 'os', name: 'Regio Gdańsk Gł. – Lębork', from: 'RM1', to: 'WJ1', arr: '07:49', dep: '07:50', track: '1', stop: true, length: 160, vmax: 120, dwell: 40 },
  ],

  tasks: [],

  scenarios: [
    { id: 'zmiana', name: 'Pełna zmiana – pulpit kostkowy typu E (05:55–08:15)', srk: 'E', description: 'Regionalne i dalekobieżne na peronie II, wahadła do Helu z toru 11, TLK z Helu przez peron I, towarowe torem 3. Wyjazdy dwustopniowo (semafor toru, potem Szn na szlaku). Poziom zakłóceń do wyboru.', endTime: '08:15' },
    { id: 'zmiana-lcs', name: 'Pełna zmiana – stanowisko komputerowe (05:55–08:15)', srk: 'komputerowe', description: 'Ten sam rozkład na stanowisku komputerowym (po modernizacji linii 202): przebiegi złożone nastawiają obie części wyjazdu naraz.', endTime: '08:15' },
    { id: 'usterka-hl', name: 'Usterka blokady od Helu', description: 'Blokada linii 213 bez łączności przez 40 min – zapowiadanie telefoniczne na jednotorowym szlaku.', endTime: '08:15', faults: [{ type: 'block-fail', target: 'HL', at: '06:30', duration: 40 }] },
    { id: 'szczyt', name: 'Szczyt z zakłóceniami', description: 'Pełny rozkład, duże zakłócenia.', endTime: '08:25', disruptions: 'high' },
  ],
};
