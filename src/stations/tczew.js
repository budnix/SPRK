/**
 * Tczew – węzeł linii 9 (Warszawa – Gdańsk), 131 (Chorzów Batory – Tczew), 203 (Tczew – Kostrzyn) i 726/728
 * (Zajączkowo Tczewskie). Układ wg planu schematycznego stacji (stan VIII 2012, rys. A. Karwat), nastawnia „Tw”.
 * Odwzorowanie schematyczne części pasażerskiej – jak Gdynia Główna.
 *
 * Stanowisko komputerowe (zobrazowanie Ie-104); siatka 120×34. Tory peronowe (y): 10 (4), 8 (6), 6 (8), 4 (10), 2 (12), 1 (14), 3 (16), 5 (18), 7 (20), 9 (22),
 * 11 (24), 13 (26), 15 (28). Perony: I (10/8), II (6), III (2/1), IV (5/7). Zachód (Szymankowo, Górki) po lewej,
 * wschód (Pszczółki, Malinowo, Zajączkowo) po prawej; ruch prawostronny – tor wjazdowy pod torem wyjazdowym
 * na zachodzie, nad nim na wschodzie.
 *
 * Semafory wg planu: wjazdowe A1 (131 od Górek), E1 (9 od Szymankowa), U (203 od Malinowa), S (9 od Pszczółek),
 * P (726 od Zajączkowa ZTA), Z (728 od Zajączkowa ZTB); wyjazdowe K1–K15 (na zachód) i M1–M15 (na wschód);
 * blokada samoczynna na liniach 9 i 131, półsamoczynna Eap na 203, 726 i 728 (jednotorowa).
 *
 * Uproszczenia względem planu: głowice jako drabiny (numery rozjazdów przybliżone do planu: 20–24, 26/27, 30–46 na
 * zachodzie, 60–89 na wschodzie); pominięto tory 101–103 (C1, G1–G3), linię 727 (Malinowo podg, Tczew Postojowa),
 * tor 17, grupy towarowe 15x/20x/30x/40x/50x, bocznice i tarcze manewrowe głowic; semafory A2/E2 i D1/D2 (jazdy
 * po torze lewym) pominięte; tory 7–15 wyjeżdżają na wschód tylko do Zajączkowa, na zachód – do Szymankowa.
 */

const T = (x, y, ports, section, extra = {}) => ({ x, y, type: 'track', ports, section, ...extra });
const H = (x1, x2, y, section, extra = {}) => Array.from({ length: x2 - x1 + 1 }, (_, i) => T(x1 + i, y, ['W', 'E'], section, extra));
const P = (x, y, id, toe, straight, diverge, section) => ({ x, y, type: 'point', id: `Zw${id}`, label: String(id), toe, straight, diverge, section: section || `Iz${id}` });
const SIG = (x, y, id, kind, at, dir, extra = {}) => ({ x, y, type: 'signal', id, kind, at, dir, ...extra });

const tiles = [];
const sections = {};
const sec = (id, def) => { sections[id] = def; return id; };
const point = (x, y, id, toe, straight, diverge, len = 60) => { sec(`Iz${id}`, { length: len, kind: 'point' }); tiles.push(P(x, y, id, toe, straight, diverge)); };
const diag = (x, y, ports, id) => tiles.push(T(x, y, ports, `Iz${id}`));
const plain = (id, x1, x2, y, len) => { sec(id, { length: len ?? (x2 - x1 + 1) * 20, kind: 'plain' }); tiles.push(...H(x1, x2, y, id)); };

// ---- tytuł, przyciski ----
tiles.push({ x: 50, y: 0, type: 'label', text: 'TCZEW', size: 13, span: 16 });

// ---- tory peronowe (x 34–80), semafory K (zachód) i M (wschód) ----
const TRACKS = [
  ['10', 4, 420, 'Peron I'], ['8', 6, 480, 'Peron I'], ['6', 8, 520, 'Peron II'], ['4', 10, 560, null], ['2', 12, 600, 'Peron III'],
  ['1', 14, 600, 'Peron III'], ['3', 16, 560, null], ['5', 18, 520, 'Peron IV'], ['7', 20, 480, 'Peron IV'], ['9', 22, 700, null],
  ['11', 24, 750, null], ['13', 26, 750, null], ['15', 28, 800, null],
];
for (const [nr, y, len, peron] of TRACKS) {
  sec(`T${nr}`, { length: len, kind: 'station', track: nr, platform: peron || false });
  tiles.push(...H(34, 80, y, `T${nr}`));
  tiles.push(SIG(34, y + 1, `K${nr}`, 'semafor', { x: 34, y }, 'W', { shunting: true }));
  tiles.push(SIG(80, y - 1, `M${nr}`, 'semafor', { x: 80, y }, 'E', { shunting: true }));
  const upper = ['10', '6', '2', '5', '9', '13'].includes(nr);
  tiles.push({ x: upper ? 44 : 62, y: upper ? y - 1 : y + 1, type: 'label', text: peron ? `tor ${nr} · ${peron}` : `tor ${nr}`, span: 4, size: 8 });
}

// ---- szlaki: zachód (x 0–5), wschód (x 114–119) ----
const westExit = (y, id, text) => { sec(`Zb${id}`, { length: 400, kind: 'approach' }); tiles.push({ ...T(0, y, ['W', 'E'], `Zb${id}`), endButton: { id: `k${id}`, color: 'green' }, text }, ...H(1, 5, y, `Zb${id}`)); };
const eastExit = (y, id, text) => { sec(`Zb${id}`, { length: 400, kind: 'approach' }); tiles.push(...H(114, 118, y, `Zb${id}`), { ...T(119, y, ['W', 'E'], `Zb${id}`), endButton: { id: `k${id}`, color: 'green' }, text }); };
westExit(4, 'GK2', 'Górki 131 t.2'); westExit(6, 'GK1', 'Górki 131 t.1');
westExit(14, 'SZ2', 'Szymankowo 9 t.2'); westExit(16, 'SZ1', 'Szymankowo 9 t.1');
eastExit(4, 'ML2', 'Malinowo 203 t.2'); eastExit(6, 'ML1', 'Malinowo 203 t.1');
eastExit(14, 'PS2', 'Pszczółki 9 t.2'); eastExit(16, 'PS1', 'Pszczółki 9 t.1');
eastExit(26, 'ZA2', 'Zajączkowo ZTA 726 t.2'); eastExit(28, 'ZA1', 'Zajączkowo ZTA 726 t.1'); eastExit(30, 'ZB', 'Zajączkowo ZTB 728');
tiles.push(SIG(5, 7, 'A1', 'semafor', { x: 5, y: 6 }, 'E', { entry: true }), SIG(5, 17, 'E1', 'semafor', { x: 5, y: 16 }, 'E', { entry: true }),
  SIG(114, 3, 'U', 'semafor', { x: 114, y: 4 }, 'W', { entry: true }), SIG(114, 13, 'S', 'semafor', { x: 114, y: 14 }, 'W', { entry: true }),
  SIG(114, 25, 'P', 'semafor', { x: 114, y: 26 }, 'W', { entry: true }), SIG(114, 31, 'Z', 'semafor', { x: 114, y: 30 }, 'W', { entry: true }));
tiles.push({ x: 1, y: 3, type: 'label', text: 'linia 131', span: 2, size: 7 }, { x: 1, y: 13, type: 'label', text: 'linia 9', span: 2, size: 7 },
  { x: 114, y: 1, type: 'label', text: 'linia 203', span: 3, size: 7 }, { x: 114, y: 11, type: 'label', text: 'linia 9', span: 3, size: 7 },
  { x: 108, y: 33, type: 'label', text: 'linie 726 / 728 · Zajączkowo Tczewskie', span: 10, size: 7 });

// ---- głowica zachodnia ----
// linia 131: tor 2 (y=4, wyjazdowy) → tor 10; tor 1 (y=6, wjazdowy A1) → tor 8 i drabiną 33/36/37/38 na tory 6, 4, 2, 1
plain('W10a', 6, 7, 4); point(8, 4, 26, 'W', 'E', 'SE'); diag(9, 5, ['NW', 'SE'], 26); point(10, 6, 27, 'E', 'W', 'NW');
plain('W10b', 9, 15, 4); point(16, 4, 34, 'E', 'W', 'SW'); diag(15, 5, ['NE', 'SW'], 34); point(14, 6, 35, 'W', 'E', 'NE');
plain('W10c', 17, 33, 4);
plain('W8a', 6, 9, 6); plain('W8b', 11, 11, 6, 30); point(12, 6, 33, 'W', 'E', 'SE'); plain('W8c', 13, 13, 6, 30); plain('W8d', 15, 33, 6);
diag(13, 7, ['NW', 'SE'], 33); point(14, 8, 36, 'NW', 'SE', 'E'); diag(15, 9, ['NW', 'SE'], 36); point(16, 10, 37, 'NW', 'SE', 'E');
diag(17, 11, ['NW', 'SE'], 37); point(18, 12, 38, 'NW', 'SE', 'E'); diag(19, 13, ['NW', 'SE'], 38); point(20, 14, 41, 'E', 'W', 'NW');
plain('W6', 15, 33, 8); plain('W4', 17, 33, 10); plain('W2a', 19, 23, 12);
// przejście 40/42: tor 2 ↔ tor 1 (Szymankowo ↔ tor 2)
point(24, 12, 40, 'E', 'W', 'SW'); diag(23, 13, ['NE', 'SW'], 40); point(22, 14, 42, 'W', 'E', 'NE');
plain('W2b', 25, 33, 12);
// linia 9: tor 2 (y=14, wyjazdowy) → tor 1; tor 1 (y=16, wjazdowy E1) → tor 3 i drabiną 24/30/31/46/39/43 na tory 5–15
plain('W1a', 6, 9, 14); point(10, 14, 21, 'E', 'W', 'SW'); diag(9, 15, ['NE', 'SW'], 21); point(8, 16, 20, 'W', 'E', 'NE');
plain('W1b', 11, 11, 14, 30); point(12, 14, 23, 'W', 'E', 'SE'); diag(13, 15, ['NW', 'SE'], 23); point(14, 16, 22, 'E', 'W', 'NW');
plain('W1c', 13, 19, 14); plain('W1d', 21, 21, 14, 30); plain('W1e', 23, 33, 14);
plain('W3a', 6, 7, 16); plain('W3b', 9, 13, 16); plain('W3c', 15, 15, 16, 30); point(16, 16, 24, 'W', 'E', 'SE'); plain('W3d', 17, 33, 16);
const ladderW = [[18, 18, 30, 5], [20, 20, 31, 7], [22, 22, 46, 9], [24, 24, 39, 11], [26, 26, 43, 13]];
diag(17, 17, ['NW', 'SE'], 24);
for (const [x, y, id, nr] of ladderW) { point(x, y, id, 'NW', 'SE', 'E'); diag(x + 1, y + 1, ['NW', 'SE'], id); plain(`W${nr}`, x + 1, 33, y); }
sec('W15', { length: 120, kind: 'plain' }); tiles.push(T(28, 28, ['NW', 'E'], 'W15'), ...H(29, 33, 28, 'W15'));

// ---- głowica wschodnia ----
// tory 10/8 → linia 203: 63/68 (tor 10 → tor wyjazdowy), 66 (drabina z torów 6/4/2/1), 62/61 (wjazd U na tor 10 / drabinę)
plain('E10a', 81, 103, 4); point(104, 4, 63, 'W', 'E', 'SE'); diag(105, 5, ['NW', 'SE'], 63); point(106, 6, 68, 'E', 'W', 'NW');
plain('E10b', 105, 111, 4); point(112, 4, 61, 'E', 'W', 'SW'); diag(111, 5, ['NE', 'SW'], 61); point(110, 6, 62, 'W', 'E', 'NE');
plain('E10c', 113, 113, 4, 30);
plain('E8a', 81, 105, 6); plain('E8b', 107, 107, 6, 30); point(108, 6, 66, 'E', 'W', 'SW'); plain('E8c', 109, 109, 6, 30); plain('E8d', 111, 113, 6);
diag(107, 7, ['NE', 'SW'], 66); point(106, 8, 65, 'NE', 'SW', 'W'); diag(105, 9, ['NE', 'SW'], 65); point(104, 10, 64, 'NE', 'SW', 'W');
diag(103, 11, ['NE', 'SW'], 64); point(102, 12, 69, 'NE', 'SW', 'W'); diag(101, 13, ['NE', 'SW'], 69); point(100, 14, 70, 'W', 'E', 'NE');
plain('E6', 81, 105, 8); plain('E4', 81, 103, 10); plain('E2a', 81, 89, 12);
// przejście 60/67: tor 2 → tor 1 (na Pszczółki), tor 1 → tor 2 (z Pszczółek)
point(90, 12, 60, 'W', 'E', 'SE'); diag(91, 13, ['NW', 'SE'], 60); point(92, 14, 67, 'E', 'W', 'NW');
plain('E2b', 91, 101, 12);
// linia 9: tor 2 (y=14, wjazdowy S) ← 74/76 ↔ tor 1 (y=16, wyjazdowy); 71/73 z toru wjazdowego na tory 3/5
plain('E1a', 81, 91, 14); plain('E1b', 93, 99, 14); plain('E1c', 101, 103, 14); point(104, 14, 71, 'E', 'W', 'SW'); diag(103, 15, ['NE', 'SW'], 71);
plain('E1d', 105, 107, 14); point(108, 14, 74, 'W', 'E', 'SE'); diag(109, 15, ['NW', 'SE'], 74); plain('E1e', 109, 113, 14);
plain('E3a', 81, 88, 16); point(89, 16, 78, 'E', 'W', 'SW'); plain('E3b', 90, 101, 16); point(102, 16, 73, 'W', 'E', 'NE');
plain('E3c', 103, 109, 16); point(110, 16, 76, 'E', 'W', 'NW'); plain('E3d', 111, 113, 16);
// tor 5: 82 – na tor 3 (łuk do 78) albo drabiną 83–87 w dół; tor 7 przez 79/80 na tor 5
plain('E5a', 81, 83, 18); plain('E5c', 85, 85, 18, 30); point(86, 18, 82, 'W', 'E', 'SE'); sec('E5b', { length: 60, kind: 'plain' }); tiles.push(T(87, 18, ['W', 'NE'], 'E5b'), T(88, 17, ['SW', 'NE'], 'E5b'));
plain('E7a', 81, 81, 20, 30); point(82, 20, 79, 'W', 'E', 'NE'); diag(83, 19, ['SW', 'NE'], 79); point(84, 18, 80, 'E', 'W', 'SW'); plain('E7b', 83, 87, 20);
diag(87, 19, ['NW', 'SE'], 82);
const ladderE = [[88, 20, 83, 9], [90, 22, 84, 11], [92, 24, 85, 13], [94, 26, 86, 15]];
for (const [x, y, id, nr] of ladderE) { point(x, y, id, 'SE', 'NW', 'W'); diag(x + 1, y + 1, ['NW', 'SE'], id); plain(`E${nr}`, 81, x + 1, y + 2); }
point(96, 28, 87, 'E', 'W', 'NW');
plain('E15b', 97, 97, 28, 30); point(98, 28, 89, 'W', 'E', 'NE'); diag(99, 27, ['SW', 'NE'], 89); sec('E13z', { length: 40, kind: 'plain' }); tiles.push(T(100, 26, ['SW', 'E'], 'E13z'), ...H(101, 113, 26, 'E13z'));
plain('E15c', 99, 99, 28, 30); point(100, 28, 88, 'W', 'E', 'SE'); diag(101, 29, ['NW', 'SE'], 88); sec('E15z', { length: 40, kind: 'plain' }); tiles.push(T(102, 30, ['NW', 'E'], 'E15z'), ...H(103, 113, 30, 'E15z'));
plain('E15d', 101, 113, 28);

export default {
  schemaVersion: 1,
  id: 'tczew',
  name: 'Tczew',
  srk: 'komputerowe',
  srkInfo: 'Stanowisko komputerowe LCS Tczew (po modernizacji linii 9); plan z VIII 2012 pokazuje jeszcze urządzenia przekaźnikowe z nastawnią dysponującą „Tw” – tu jedno stanowisko na całą część pasażerską.',
  description: 'Węzeł linii 9 (Warszawa – Gdańsk), 131 (z Bydgoszczy), 203 (do Chojnic) i 726/728 (Zajączkowo Tczewskie). Cztery perony, 13 torów, blokada samoczynna na 9 i 131, Eap do Malinowa i Zajączkowa.',
  location: 'Linia 9 Warszawa Wsch. – Gdańsk Gł. przed Pszczółkami, węzeł z liniami 131, 203 i 726/728; powiat tczewski, woj. pomorskie.',
  region: 'pomorskie',          // województwo – mapa wyboru posterunku
  lines: [9, 131, 203, 726, 728], // linie kolejowe (jak w `location`)
  traffic: 'IC/EIC i Regio linii 9 na peronie III, pociągi z Bydgoszczy i do Chojnic na peronach I/II, towarowe torami 9–15 do Zajączkowa i Szymankowa.',
  difficulty: 5,
  startTime: '05:55',
  desk: { cols: 120, rows: 34 },

  exits: {
    GK2: { name: 'Górki', label: 'Górki – 131 t.2', tile: { x: 0, y: 4 }, dir: 'W', direction: 'out', block: 'sbl', lineLength: 6000, lineSpeed: 100 },
    GK1: { name: 'Górki', label: 'Górki – 131 t.1', tile: { x: 0, y: 6 }, dir: 'W', direction: 'in', block: 'sbl', lineLength: 6000, lineSpeed: 100 },
    SZ2: { name: 'Szymankowo', label: 'Szymankowo – 9 t.2', tile: { x: 0, y: 14 }, dir: 'W', direction: 'out', block: 'sbl', lineLength: 9000, lineSpeed: 160 },
    SZ1: { name: 'Szymankowo', label: 'Szymankowo – 9 t.1', tile: { x: 0, y: 16 }, dir: 'W', direction: 'in', block: 'sbl', lineLength: 9000, lineSpeed: 160 },
    ML2: { name: 'Malinowo', label: 'Malinowo – 203 t.2', tile: { x: 119, y: 4 }, dir: 'E', direction: 'in', lineLength: 5500, lineSpeed: 100 },
    ML1: { name: 'Malinowo', label: 'Malinowo – 203 t.1', tile: { x: 119, y: 6 }, dir: 'E', direction: 'out', lineLength: 5500, lineSpeed: 100 },
    PS2: { name: 'Pszczółki', label: 'Pszczółki – 9 t.2', tile: { x: 119, y: 14 }, dir: 'E', direction: 'in', block: 'sbl', lineLength: 11000, lineSpeed: 160 },
    PS1: { name: 'Pszczółki', label: 'Pszczółki – 9 t.1', tile: { x: 119, y: 16 }, dir: 'E', direction: 'out', block: 'sbl', lineLength: 11000, lineSpeed: 160 },
    ZA2: { name: 'Zajączkowo Tczewskie', label: 'Zajączkowo ZTA – 726 t.2', tile: { x: 119, y: 26 }, dir: 'E', direction: 'in', lineLength: 4000, lineSpeed: 60 },
    ZA1: { name: 'Zajączkowo Tczewskie', label: 'Zajączkowo ZTA – 726 t.1', tile: { x: 119, y: 28 }, dir: 'E', direction: 'out', lineLength: 4000, lineSpeed: 60 },
    ZB: { name: 'Zajączkowo Tczewskie ZTB', label: 'Zajączkowo ZTB – 728', tile: { x: 119, y: 30 }, dir: 'E', lineLength: 4500, lineSpeed: 60 },
  },
  sections,
  tiles,
  // wyłączone: jazdy na tory szlakowe wjazdowe (GK1, SZ1, ML2, PS2, ZA2) i okrężne warianty (#2) przez dwa przejścia
  routes: { disable: ['K10-GK1', 'K10-GK2#2', 'M10-ML2', 'M10-ML2#2', 'K8-GK1', 'M8-ML2', 'K6-GK1', 'M6-ML2', 'K4-GK1', 'M4-ML2',
    'K2-GK1', 'K2-SZ1', 'K2-GK1#2', 'K2-GK2#2', 'M2-ML2', 'M2-PS2', 'M2-ML1#2', 'M2-ML2#2', 'K1-SZ1', 'K1-GK1', 'M1-PS2', 'M1-ML2',
    'K3-SZ1', 'K3-SZ1#2', 'M3-PS2', 'M3-PS1#2', 'K5-SZ1', 'K5-SZ1#2', 'M5-PS2', 'M5-PS1#2', 'M5-ZA2', 'K7-SZ1', 'K7-SZ1#2',
    'M7-ZA2', 'M7-PS2', 'M7-PS1#2', 'M7-ZA1#2', 'M7-ZB#2', 'M7-ZA2#2', 'K9-SZ1', 'K9-SZ1#2', 'M9-ZA2', 'K11-SZ1', 'K11-SZ1#2', 'M11-ZA2',
    'K13-SZ1', 'K13-SZ1#2', 'M13-ZA2', 'K15-SZ1', 'K15-SZ1#2', 'M15-ZA2',
    'A1-M2#2', 'E1-M3#2', 'E1-M15#2', 'E1-M13#2', 'E1-M11#2', 'E1-M9#2', 'E1-M7#2', 'E1-M5#2', 'U-K10#2', 'U-K2#2', 'P-K7#2', 'Z-K7#2'], override: {} },

  timetable: [
    { nr: 5300, kind: 'os', name: 'IC Warszawa Wsch. – Gdynia Gł.', from: 'SZ1', to: 'PS1', arr: '06:05', dep: '06:07', track: '1', stop: true, length: 300, dwell: 90 },
    { nr: 44630, kind: 'tow', cat: 'TK', traction: 'S', name: 'Towarowy Tczew – Zajączkowo Tczewskie (zdawczy)', from: null, to: 'ZB', dep: '06:06', track: '9', stop: false, length: 400, mass: 650, vmax: 60, startOn: { section: 'T9', dir: 'E' } },
    { nr: 5301, kind: 'os', name: 'IC Gdynia Gł. – Warszawa Wsch.', from: 'PS2', to: 'SZ2', arr: '06:12', dep: '06:14', track: '2', stop: true, length: 300, dwell: 90 },
    { nr: 55600, kind: 'os', name: 'Regio Gdynia Gł. – Tczew', stock: ['SA133', 'SA136', 'SA137', 'SA138'], from: 'PS2', to: null, arr: '06:16', track: '2', stop: true, terminates: true, length: 130, vmax: 120 },
    { nr: 55400, kind: 'os', name: 'Regio Malbork – Gdynia Gł.', from: 'SZ1', to: 'PS1', arr: '06:20', dep: '06:22', track: '1', stop: true, length: 160, vmax: 120, dwell: 60 },
    { nr: 55601, kind: 'os', name: 'Regio Tczew – Chojnice', stock: ['SA133', 'SA136', 'SA137', 'SA138'], unit: 55600, from: null, to: 'ML1', dep: '06:24', track: '2', stop: true, length: 130, vmax: 100 },
    { nr: 44600, kind: 'tow', cat: 'TM', name: 'Towarowy Zajączkowo Tczewskie – Szymankowo', from: 'ZA2', to: 'SZ2', arr: '06:25', track: '11', stop: false, length: 560, mass: 2900, vmax: 60 },
    { nr: 55500, kind: 'os', name: 'Regio Bydgoszcz Gł. – Gdynia Gł.', from: 'GK1', to: 'PS1', arr: '06:28', dep: '06:30', track: '2', stop: true, length: 160, vmax: 120, dwell: 60 },
    { nr: 44620, kind: 'tow', cat: 'TN', traction: 'S', name: 'Towarowy Bydgoszcz Wsch. – Chojnice', from: 'GK1', to: 'ML1', arr: '06:33', track: '4', stop: false, length: 500, mass: 1100, vmax: 60 },
    { nr: 55401, kind: 'os', name: 'Regio Gdynia Gł. – Malbork', from: 'PS2', to: 'SZ2', arr: '06:35', dep: '06:37', track: '2', stop: true, length: 160, vmax: 120, dwell: 60 },
    { nr: 55604, kind: 'os', name: 'Regio Chojnice – Tczew', stock: ['SA133', 'SA136', 'SA137', 'SA138'], from: 'ML2', to: null, arr: '06:40', track: '10', stop: true, terminates: true, length: 130, vmax: 100 },
    { nr: 55501, kind: 'os', name: 'Regio Gdynia Gł. – Bydgoszcz Gł.', from: 'PS2', to: 'GK2', arr: '06:42', dep: '06:44', track: '1', stop: true, length: 160, vmax: 120, dwell: 60 },
    { nr: 5302, kind: 'os', name: 'EIC Kraków Gł. – Gdynia Gł.', from: 'SZ1', to: 'PS1', arr: '06:50', dep: '06:52', track: '1', stop: true, length: 350, dwell: 90 },
    { nr: 44601, kind: 'tow', cat: 'TN', name: 'Towarowy Szymankowo – Zajączkowo Tczewskie', from: 'SZ1', to: 'ZA1', arr: '07:00', track: '13', stop: false, length: 600, mass: 1600, vmax: 60 },
    { nr: 5303, kind: 'os', name: 'EIC Gdynia Gł. – Kraków Gł.', from: 'PS2', to: 'SZ2', arr: '07:00', dep: '07:02', track: '2', stop: true, length: 350, dwell: 90 },
    { nr: 55402, kind: 'os', name: 'Regio Malbork – Gdynia Gł.', from: 'SZ1', to: 'PS1', arr: '07:05', dep: '07:07', track: '1', stop: true, length: 160, vmax: 120, dwell: 60 },
    { nr: 55602, kind: 'os', name: 'Regio Chojnice – Tczew', stock: ['SA133', 'SA136', 'SA137', 'SA138'], from: 'ML2', to: null, arr: '07:10', track: '2', stop: true, terminates: true, length: 130, vmax: 100 },
    { nr: 44610, kind: 'tow', cat: 'TD', name: 'Towarowy Zajączkowo Tczewskie ZTB – Szymankowo', from: 'ZB', to: 'SZ2', arr: '07:12', track: '9', stop: false, length: 520, mass: 1300, vmax: 60 },
    { nr: 55603, kind: 'os', name: 'Regio Tczew – Gdynia Gł.', stock: ['SA133', 'SA136', 'SA137', 'SA138'], unit: 55602, from: null, to: 'PS1', dep: '07:14', track: '2', stop: true, length: 130, vmax: 120 },
    { nr: 55605, kind: 'os', name: 'Regio Tczew – Chojnice', stock: ['SA133', 'SA136', 'SA137', 'SA138'], unit: 55604, from: null, to: 'ML1', dep: '07:15', track: '10', stop: true, length: 130, vmax: 100 },
    { nr: 55403, kind: 'os', name: 'Regio Gdynia Gł. – Malbork', from: 'PS2', to: 'SZ2', arr: '07:20', dep: '07:22', track: '2', stop: true, length: 160, vmax: 120, dwell: 60 },
    { nr: 44621, kind: 'tow', cat: 'TN', traction: 'S', name: 'Towarowy Chojnice – Bydgoszcz Wsch.', from: 'ML2', to: 'GK2', arr: '07:33', track: '4', stop: false, length: 500, mass: 850, vmax: 60 },
    { nr: 55502, kind: 'os', name: 'Regio Bydgoszcz Gł. – Gdynia Gł.', from: 'GK1', to: 'PS1', arr: '07:28', dep: '07:30', track: '2', stop: true, length: 160, vmax: 120, dwell: 60 },
    { nr: 5304, kind: 'os', name: 'IC Warszawa Wsch. – Gdynia Gł.', from: 'SZ1', to: 'PS1', arr: '07:35', dep: '07:37', track: '1', stop: true, length: 300, dwell: 90 },
    { nr: 44611, kind: 'tow', cat: 'TM', name: 'Towarowy Szymankowo – Zajączkowo Tczewskie ZTB', from: 'SZ1', to: 'ZB', arr: '07:45', track: '15', stop: false, length: 560, mass: 2400, vmax: 60 },
    { nr: 55503, kind: 'os', name: 'Regio Gdynia Gł. – Bydgoszcz Gł.', from: 'PS2', to: 'GK2', arr: '07:42', dep: '07:44', track: '1', stop: true, length: 160, vmax: 120, dwell: 60 },
    { nr: 5305, kind: 'os', name: 'IC Gdynia Gł. – Warszawa Wsch.', from: 'PS2', to: 'SZ2', arr: '07:45', dep: '07:47', track: '2', stop: true, length: 300, dwell: 90 },
    { nr: 55404, kind: 'os', name: 'Regio Malbork – Gdynia Gł.', from: 'SZ1', to: 'PS1', arr: '07:50', dep: '07:52', track: '1', stop: true, length: 160, vmax: 120, dwell: 60 },
    { nr: 44631, kind: 'tow', cat: 'TS', name: 'Towarowy Zajączkowo Tczewskie ZTB – Tczew (kończy bieg)', from: 'ZB', to: null, arr: '07:55', track: '15', stop: true, terminates: true, length: 480, mass: 600, vmax: 60 },
    { nr: 55405, kind: 'os', name: 'Regio Gdynia Gł. – Malbork', from: 'PS2', to: 'SZ2', arr: '08:00', dep: '08:02', track: '2', stop: true, length: 160, vmax: 120, dwell: 60 },
  ],

  tasks: [],

  scenarios: [
    { id: 'zmiana', name: 'Pełna zmiana (05:55–08:15)', description: 'Węzeł: IC/EIC i Regio linii 9, pociągi z Bydgoszczy (131) i do Chojnic (203) z nawrotem, towarowe do Zajączkowa i Szymankowa. Poziom zakłóceń do wyboru.', endTime: '08:15' },
    { id: 'usterka-zb', name: 'Usterka blokady od Zajączkowa ZTB', description: 'Jednotorowa blokada 728 bez łączności przez 40 min – zapowiadanie telefoniczne.', endTime: '08:15', faults: [{ type: 'block-fail', target: 'ZB', at: '06:30', duration: 40 }] },
    { id: 'szczyt', name: 'Szczyt z zakłóceniami', description: 'Pełny rozkład, duże zakłócenia.', endTime: '08:25', disruptions: 'high' },
  ],
};
