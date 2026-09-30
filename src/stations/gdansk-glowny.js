/**
 * Gdańsk Główny – stacja węzłowa: linia 9 (od Gdańska Południowego), tory SKM 502/501 (od p.o. Gdańsk Śródmieście),
 * linie 202 (do Gdańska Wrzeszcza) i 250 (SKM do Wrzeszcza), 227 (Gdańsk Zaspa Towarowa) i 249 (Gdańsk Brzeźno).
 * Układ wg planu schematycznego stacji (stan I 2022, rys. A. Karwat), nastawnie „G” (LCS Gdańsk) i „G-SKM”.
 * Odwzorowanie schematyczne części pasażerskiej; wyłącznie stanowisko komputerowe.
 *
 * Siatka 120×28. Tory (y): 4 (4), 2 (6), 1 (8), 3 (10), 502 (12), 501 (14), 7 (16), 9 (18), 11 (20), 13 (22), 15 (24).
 * Perony: I (4/2), II (1/3), III SKM (502/501), IV (7/9), V (13/15); tory 7–15 czołowe (kozły od zachodu).
 * Gdańsk Południowy / Śródmieście po lewej, Wrzeszcz po prawej; ruch prawostronny: od zachodu tor wjazdowy
 * (t.1, y=8; SKM 501, y=14) pod wyjazdowym, od wschodu tor wjazdowy (202 t.2, y=6; 250 t.2, y=12) nad wyjazdowym.
 *
 * Semafory wg planu: wjazdowe B (9 od Gdańska Płd.), A501 (SKM od Śródmieścia), G (202 od Wrzeszcza), N (250 od
 * Wrzeszcza), H (227 od Zaspy Towarowej), M (249 od Brzeźna); wyjazdowe na zachód C4/C2/C1/C3 i E502/E501,
 * na wschód E4/E2/E1/E3, F502/F501 i F7/F9/F13/F15 (F11 dodany – na planie tor 11 bez semafora).
 * Blokada samoczynna na 9, 202 i 250 oraz na torach SKM do Śródmieścia; Eap jednotorowa na 227 i 249.
 *
 * Uproszczenia względem planu: głowice jako przejścia między sąsiednimi torami (numery rozjazdów 1–8, 505–511
 * na zachodzie i 21–55, 512/513 na wschodzie przybliżone do planu); pominięto peron 6 (tory 17–21), tory 4a/20/22/3b/1b,
 * zespół bocznic (308/310/120/314), p.o. Gdańsk Stocznia, tarcze manewrowe i wykolejnice głowic, semafory A, K, L
 * (jazdy po torze lewym linii 9), B502/B501 i C502/C501 (odcinek do Śródmieścia jako szlak).
 */

const T = (x, y, ports, section, extra = {}) => ({ x, y, type: 'track', ports, section, ...extra });
const H = (x1, x2, y, section, extra = {}) => Array.from({ length: x2 - x1 + 1 }, (_, i) => T(x1 + i, y, ['W', 'E'], section, extra));
const P = (x, y, id, toe, straight, diverge) => ({ x, y, type: 'point', id: `Zw${id}`, label: String(id), toe, straight, diverge, section: `Iz${id}` });
const SIG = (x, y, id, kind, at, dir, extra = {}) => ({ x, y, type: 'signal', id, kind, at, dir, ...extra });

const tiles = [];
const sections = {};
const sec = (id, def) => { sections[id] = def; return id; };
const point = (x, y, id, toe, straight, diverge) => { sec(`Iz${id}`, { length: 60, kind: 'point' }); tiles.push(P(x, y, id, toe, straight, diverge)); };
const diag = (x, y, ports, id) => tiles.push(T(x, y, ports, `Iz${id}`));
const plain = (id, x1, x2, y, len) => { sec(id, { length: len ?? (x2 - x1 + 1) * 20, kind: 'plain' }); tiles.push(...H(x1, x2, y, id)); };
const stub = (x, y, port, id) => { sec(`S${id}`, { length: 30, kind: 'siding' }); tiles.push({ x, y, type: 'buffer', port, section: `S${id}`, endButton: { id: `k${id}`, color: 'white' } }); };
/** Przejście między torami: kostka a (toe `toeA`, zwrotny `divA`), ukos, kostka b. */
const crossover = (xa, ya, idA, toeA, divA, xb, yb, idB, toeB, divB, diagPorts) => {
  point(xa, ya, idA, toeA, toeA === 'W' ? 'E' : 'W', divA); diag((xa + xb) / 2, (ya + yb) / 2, diagPorts, idA);
  point(xb, yb, idB, toeB, toeB === 'W' ? 'E' : 'W', divB);
};
const UP = ['SW', 'NE'], DOWN = ['NW', 'SE']; // ukos: z lewej-dołu do prawej-góry / z lewej-góry do prawej-dołu

// ---- tytuł, przyciski ----
tiles.push({ x: 48, y: 0, type: 'label', text: 'GDAŃSK GŁÓWNY', size: 13, span: 20 });

// ---- tory stacyjne (x 34–80) ----
const TRACKS = [
  ['4', 4, 509, 'Peron I', 'C4', 'E4'], ['2', 6, 713, 'Peron I', 'C2', 'E2'], ['1', 8, 604, 'Peron II', 'C1', 'E1'], ['3', 10, 554, 'Peron II', 'C3', 'E3'],
  ['502', 12, 400, 'Peron III SKM', 'E502', 'F502'], ['501', 14, 400, 'Peron III SKM', 'E501', 'F501'],
  ['7', 16, 420, 'Peron IV', null, 'F7'], ['9', 18, 420, 'Peron IV', null, 'F9'], ['11', 20, 380, null, null, 'F11'], ['13', 22, 400, 'Peron V', null, 'F13'], ['15', 24, 400, 'Peron V', null, 'F15'],
];
for (const [nr, y, len, peron, west, east] of TRACKS) {
  sec(`T${nr}`, { length: len, kind: 'station', track: nr, platform: peron || false });
  tiles.push(...H(34, 80, y, `T${nr}`));
  if (west) tiles.push(SIG(34, y + 1, west, 'semafor', { x: 34, y }, 'W', { shunting: true }));
  else tiles.push({ x: 33, y, type: 'buffer', port: 'E', section: `T${nr}`, endButton: { id: `kT${nr}`, color: 'white' } });
  tiles.push(SIG(80, y - 1, east, 'semafor', { x: 80, y }, 'E', { shunting: true }));
  const upper = ['4', '1', '502', '7', '11', '15'].includes(nr);
  tiles.push({ x: upper ? 44 : 62, y: upper ? y - 1 : y + 1, type: 'label', text: peron ? `tor ${nr} · ${peron}` : `tor ${nr}`, span: 5, size: 8 });
}

// ---- szlaki ----
const westExit = (y, id, text) => { sec(`Zb${id}`, { length: 400, kind: 'approach' }); tiles.push({ ...T(0, y, ['W', 'E'], `Zb${id}`), endButton: { id: `k${id}`, color: 'green' }, text }, ...H(1, 5, y, `Zb${id}`)); };
const eastExit = (y, id, text) => { sec(`Zb${id}`, { length: 400, kind: 'approach' }); tiles.push(...H(114, 118, y, `Zb${id}`), { ...T(119, y, ['W', 'E'], `Zb${id}`), endButton: { id: `k${id}`, color: 'green' }, text }); };
westExit(6, 'GP2', 'Gdańsk Płd. 9 t.2'); westExit(8, 'GP1', 'Gdańsk Płd. 9 t.1'); westExit(12, 'SR2', 'Śródmieście 502'); westExit(14, 'SR1', 'Śródmieście 501');
eastExit(4, 'ZT', 'Zaspa Towarowa 227'); eastExit(6, 'WR2', 'Wrzeszcz 202 t.2'); eastExit(8, 'WR1', 'Wrzeszcz 202 t.1');
eastExit(12, 'SK2', 'Wrzeszcz 250 t.2'); eastExit(14, 'SK1', 'Wrzeszcz 250 t.1'); eastExit(16, 'BR', 'Brzeźno 249');
tiles.push(SIG(5, 9, 'B', 'semafor', { x: 5, y: 8 }, 'E', { entry: true }), SIG(5, 15, 'A501', 'semafor', { x: 5, y: 14 }, 'E', { entry: true }),
  SIG(114, 3, 'H', 'semafor', { x: 114, y: 4 }, 'W', { entry: true }), SIG(114, 5, 'G', 'semafor', { x: 114, y: 6 }, 'W', { entry: true }),
  SIG(114, 11, 'N', 'semafor', { x: 114, y: 12 }, 'W', { entry: true }), SIG(114, 15, 'M', 'semafor', { x: 114, y: 16 }, 'W', { entry: true }));
tiles.push({ x: 1, y: 5, type: 'label', text: 'linia 9', span: 2, size: 7 }, { x: 1, y: 11, type: 'label', text: 'SKM · Śródmieście', span: 4, size: 7 },
  { x: 108, y: 1, type: 'label', text: 'linia 227 · Zaspa Tow.', span: 6, size: 7 }, { x: 110, y: 9, type: 'label', text: 'linia 202 · Wrzeszcz', span: 5, size: 7 },
  { x: 110, y: 13, type: 'label', text: 'linia 250 · SKM', span: 4, size: 7 }, { x: 110, y: 17, type: 'label', text: 'linia 249 · Brzeźno', span: 5, size: 7 });

// ---- głowica zachodnia ----
// linia 9: 1/2 – wjazd z t.1 na tor 2, 3/4 – wyjazd z toru 1 na t.2; 5/6 tor 2 ↔ 4; 7/8 tor 1 ↔ 3
plain('W2a', 6, 9, 6); plain('W1a', 6, 7, 8);
crossover(8, 8, 1, 'W', 'NE', 10, 6, 2, 'E', 'SW', UP); plain('W2b', 11, 11, 6, 30); plain('W1b', 9, 13, 8);
crossover(12, 6, 3, 'W', 'SE', 14, 8, 4, 'E', 'NW', DOWN); plain('W2c', 13, 15, 6); plain('W1c', 15, 15, 8, 30);
crossover(16, 6, 5, 'W', 'NE', 18, 4, 6, 'E', 'SW', UP); plain('W2d', 17, 33, 6); stub(17, 4, 'E', 'T4w'); plain('W4', 19, 33, 4);
crossover(16, 8, 7, 'W', 'SE', 18, 10, 8, 'E', 'NW', DOWN); plain('W1d', 17, 33, 8); stub(17, 10, 'E', 'T3w'); plain('W3a', 19, 19, 10, 30);
// łącznik tor 3 ↔ 502 (510/511) i tory SKM od Śródmieścia: 505/506 – wjazd z 501 na 502, 507/508 – wyjazd z 501 na 502
crossover(20, 10, 510, 'W', 'SE', 22, 12, 511, 'E', 'NW', DOWN); plain('W3b', 21, 33, 10);
plain('W502a', 6, 9, 12); plain('W501a', 6, 7, 14);
crossover(8, 14, 505, 'W', 'NE', 10, 12, 506, 'E', 'SW', UP); plain('W502b', 11, 11, 12, 30); plain('W501b', 9, 13, 14);
crossover(12, 12, 507, 'W', 'SE', 14, 14, 508, 'E', 'NW', DOWN); plain('W502c', 13, 21, 12); plain('W502d', 23, 33, 12); plain('W501c', 15, 33, 14);

// ---- głowica wschodnia ----
// tory czołowe 15 → 13 → 11 → 9 → 7 → 501 → 502 → 3 → 1: łańcuch przejść (35/36/40/41/42/43/48/50); tor 7 na wschód – linia 249
const chain = [[82, 24, 35, 36], [85, 22, 40, 41], [88, 20, 42, 43], [91, 18, 48, 50], [94, 16, 512, 513], [97, 14, 55, 52], [100, 12, 25, 24], [103, 10, 27, 26]];
for (const [x, y, lo, hi] of chain) crossover(x, y, lo, 'W', 'NE', x + 2, y - 2, hi, 'E', 'SW', UP);
plain('E15', 81, 81, 24, 30); stub(83, 24, 'W', 'T15e');
plain('E13', 81, 83, 22); stub(86, 22, 'W', 'T13e');
plain('E11', 81, 86, 20); stub(89, 20, 'W', 'T11e');
plain('E9', 81, 89, 18); stub(92, 18, 'W', 'T9e');
plain('E7a', 81, 92, 16); plain('E7b', 95, 113, 16);
plain('E501a', 81, 95, 14); plain('E501b', 98, 105, 14);
plain('E502a', 81, 98, 12); plain('E502b', 101, 103, 12);
plain('E3a', 81, 101, 10); stub(104, 10, 'W', 'T3e');
plain('E1a', 81, 104, 8); plain('E1b', 106, 107, 8); plain('E1c', 109, 109, 8, 30); plain('E1d', 111, 113, 8);
// linia 202: 28/29 – wyjazd z toru 2 na t.1, 30/31 – wjazd z t.2 na tor 1; 32/33 – tor 4 ↔ 2 (tor 4 na wschód – linia 227)
crossover(100, 4, 32, 'W', 'SE', 102, 6, 33, 'E', 'NW', DOWN); plain('E4a', 81, 99, 4); plain('E4b', 101, 113, 4); plain('E2a', 81, 101, 6);
crossover(106, 6, 28, 'W', 'SE', 108, 8, 29, 'E', 'NW', DOWN); plain('E2b', 103, 105, 6);
crossover(112, 6, 31, 'E', 'SW', 110, 8, 30, 'W', 'NE', UP); plain('E2c', 107, 111, 6); plain('E2d', 113, 113, 6, 30);
// linia 250: 21/22 – wyjazd z 502 na t.1, 52a/55a – wjazd z t.2 na 501
crossover(104, 12, 21, 'W', 'SE', 106, 14, 22, 'E', 'NW', DOWN); plain('E502c', 105, 109, 12); plain('E501c', 107, 107, 14, 30);
crossover(110, 12, 34, 'E', 'SW', 108, 14, 45, 'W', 'NE', UP); plain('E502d', 111, 113, 12); plain('E501d', 109, 113, 14);

export default {
  schemaVersion: 1,
  id: 'gdansk-glowny',
  name: 'Gdańsk Główny',
  srk: 'komputerowe',
  srkInfo: 'Stanowisko komputerowe LCS Gdańsk (nastawnia „G”) i nastawnia „G-SKM” dla torów 502/501 – tu jedno stanowisko na całą część pasażerską (stan planu: I 2022).',
  description: 'Stacja węzłowa: perony I/II (tory 4/2 i 1/3) linii 9 i 202, peron III SKM (502/501) między Śródmieściem a Wrzeszczem, perony czołowe IV/V (tory 7–15) dla pociągów kończących bieg od Wrzeszcza; linie 227 na Zaspę Towarową i 249 do Brzeźna.',
  location: 'Linia 9 Warszawa Wsch. – Gdańsk Gł. (koniec), linia 202 Gdańsk Gł. – Stargard, 250 (SKM), 227 i 249; Gdańsk, woj. pomorskie.',
  traffic: 'SKM co 15 min Śródmieście ↔ Wrzeszcz, Regio i IC/EIC linii 9 przez perony I/II, pociągi kończące bieg na peronach IV/V, towarowe na Zaspę Towarową.',
  difficulty: 5,
  startTime: '05:55',
  desk: { cols: 120, rows: 28 },

  exits: {
    GP2: { name: 'Gdańsk Południowy', label: 'Gdańsk Płd. – 9 t.2', tile: { x: 0, y: 6 }, dir: 'W', direction: 'out', block: 'sbl', lineLength: 3500, lineSpeed: 120 },
    GP1: { name: 'Gdańsk Południowy', label: 'Gdańsk Płd. – 9 t.1', tile: { x: 0, y: 8 }, dir: 'W', direction: 'in', block: 'sbl', lineLength: 3500, lineSpeed: 120 },
    SR2: { name: 'Gdańsk Śródmieście', label: 'Śródmieście – 502', tile: { x: 0, y: 12 }, dir: 'W', direction: 'out', block: 'sbl', lineLength: 1300, lineSpeed: 60 },
    SR1: { name: 'Gdańsk Śródmieście', label: 'Śródmieście – 501', tile: { x: 0, y: 14 }, dir: 'W', direction: 'in', block: 'sbl', lineLength: 1300, lineSpeed: 60 },
    ZT: { name: 'Gdańsk Zaspa Towarowa', label: 'Zaspa Towarowa – 227', tile: { x: 119, y: 4 }, dir: 'E', lineLength: 4000, lineSpeed: 60 },
    WR2: { name: 'Gdańsk Wrzeszcz', label: 'Wrzeszcz – 202 t.2', tile: { x: 119, y: 6 }, dir: 'E', direction: 'in', block: 'sbl', lineLength: 3800, lineSpeed: 100 },
    WR1: { name: 'Gdańsk Wrzeszcz', label: 'Wrzeszcz – 202 t.1', tile: { x: 119, y: 8 }, dir: 'E', direction: 'out', block: 'sbl', lineLength: 3800, lineSpeed: 100 },
    SK2: { name: 'Gdańsk Wrzeszcz', label: 'Wrzeszcz – 250 t.2', tile: { x: 119, y: 12 }, dir: 'E', direction: 'in', block: 'sbl', lineLength: 3600, lineSpeed: 80 },
    SK1: { name: 'Gdańsk Wrzeszcz', label: 'Wrzeszcz – 250 t.1', tile: { x: 119, y: 14 }, dir: 'E', direction: 'out', block: 'sbl', lineLength: 3600, lineSpeed: 80 },
    BR: { name: 'Gdańsk Brzeźno', label: 'Brzeźno – 249', tile: { x: 119, y: 16 }, dir: 'E', lineLength: 6000, lineSpeed: 60 },
  },
  sections,
  tiles,
  // wyłączone: jazdy na tory szlakowe wjazdowe (GP1, SR1, WR2, SK2) i okrężne warianty (#n) przez kilka przejść
  routes: { disable: ['C4-GP1', 'E4-WR2', 'E4-WR2#2', 'C2-GP1', 'E2-WR2', 'E2-WR2#2', 'C1-GP1', 'C1-GP1#2', 'E1-WR2', 'C3-GP1', 'C3-GP1#2', 'E3-WR2',
    'E502-SR1', 'E502-GP1', 'E502-GP1#2', 'F502-SK2', 'F502-SK2#2', 'F502-WR2', 'E501-SR1', 'E501-SR1#2', 'F501-SK2', 'F501-SK2#2', 'F501-SK1#2', 'F501-SK2#3', 'F501-WR2',
    'F7-SK2', 'F7-SK2#2', 'F7-SK1#2', 'F7-SK2#3', 'F7-WR2', 'F9-SK2', 'F9-SK2#2', 'F9-SK1#2', 'F9-SK2#3', 'F9-WR2', 'F11-SK2', 'F11-SK2#2', 'F11-SK1#2', 'F11-SK2#3', 'F11-WR2', 'F13-SK2', 'F13-SK2#2', 'F13-SK1#2', 'F13-SK2#3', 'F13-WR2', 'F15-SK2', 'F15-SK2#2', 'F15-SK1#2', 'F15-SK2#3', 'F15-WR2',
    'B-E1#2', 'B-E3#2', 'B-F502#2', 'A501-F501#2', 'G-C2#2', 'G-C4#2', 'N-E501#2', 'N-kT7#2', 'N-kT9#2', 'N-kT11#2', 'N-kT13#2', 'N-kT15#2', 'N-E502#2', 'N-E501#3', 'N-kT7#3', 'N-kT9#3', 'N-kT11#3', 'N-kT13#3', 'N-kT15#3'], override: {} },

  timetable: [
    { nr: 93100, kind: 'os', name: 'SKM Wejherowo – Gdańsk Śródmieście', from: 'SK2', to: 'SR2', arr: '06:00', dep: '06:01', track: '502', stop: true, length: 130, dwell: 30 },
    { nr: 93101, kind: 'os', name: 'SKM Gdańsk Śródmieście – Wejherowo', from: 'SR1', to: 'SK1', arr: '06:07', dep: '06:08', track: '501', stop: true, length: 130, dwell: 30 },
    { nr: 93102, kind: 'os', name: 'SKM Wejherowo – Gdańsk Śródmieście', from: 'SK2', to: 'SR2', arr: '06:15', dep: '06:16', track: '502', stop: true, length: 130, dwell: 30 },
    { nr: 93103, kind: 'os', name: 'SKM Gdańsk Śródmieście – Wejherowo', from: 'SR1', to: 'SK1', arr: '06:22', dep: '06:23', track: '501', stop: true, length: 130, dwell: 30 },
    { nr: 93104, kind: 'os', name: 'SKM Wejherowo – Gdańsk Śródmieście', from: 'SK2', to: 'SR2', arr: '06:30', dep: '06:31', track: '502', stop: true, length: 130, dwell: 30 },
    { nr: 93105, kind: 'os', name: 'SKM Gdańsk Śródmieście – Wejherowo', from: 'SR1', to: 'SK1', arr: '06:37', dep: '06:38', track: '501', stop: true, length: 130, dwell: 30 },
    { nr: 93106, kind: 'os', name: 'SKM Wejherowo – Gdańsk Śródmieście', from: 'SK2', to: 'SR2', arr: '06:45', dep: '06:46', track: '502', stop: true, length: 130, dwell: 30 },
    { nr: 93107, kind: 'os', name: 'SKM Gdańsk Śródmieście – Wejherowo', from: 'SR1', to: 'SK1', arr: '06:52', dep: '06:53', track: '501', stop: true, length: 130, dwell: 30 },
    { nr: 93108, kind: 'os', name: 'SKM Wejherowo – Gdańsk Śródmieście', from: 'SK2', to: 'SR2', arr: '07:00', dep: '07:01', track: '502', stop: true, length: 130, dwell: 30 },
    { nr: 93109, kind: 'os', name: 'SKM Gdańsk Śródmieście – Wejherowo', from: 'SR1', to: 'SK1', arr: '07:07', dep: '07:08', track: '501', stop: true, length: 130, dwell: 30 },
    { nr: 93110, kind: 'os', name: 'SKM Wejherowo – Gdańsk Śródmieście', from: 'SK2', to: 'SR2', arr: '07:15', dep: '07:16', track: '502', stop: true, length: 130, dwell: 30 },
    { nr: 93111, kind: 'os', name: 'SKM Gdańsk Śródmieście – Wejherowo', from: 'SR1', to: 'SK1', arr: '07:22', dep: '07:23', track: '501', stop: true, length: 130, dwell: 30 },
    { nr: 93112, kind: 'os', name: 'SKM Wejherowo – Gdańsk Śródmieście', from: 'SK2', to: 'SR2', arr: '07:30', dep: '07:31', track: '502', stop: true, length: 130, dwell: 30 },
    { nr: 93113, kind: 'os', name: 'SKM Gdańsk Śródmieście – Wejherowo', from: 'SR1', to: 'SK1', arr: '07:37', dep: '07:38', track: '501', stop: true, length: 130, dwell: 30 },
    { nr: 93114, kind: 'os', name: 'SKM Wejherowo – Gdańsk Śródmieście', from: 'SK2', to: 'SR2', arr: '07:45', dep: '07:46', track: '502', stop: true, length: 130, dwell: 30 },
    { nr: 93115, kind: 'os', name: 'SKM Gdańsk Śródmieście – Wejherowo', from: 'SR1', to: 'SK1', arr: '07:52', dep: '07:53', track: '501', stop: true, length: 130, dwell: 30 },
    // lokomotywa luzem zmienia kabinę na miejscu; skład towarowy z toru czołowego by nie wrócił (docs/SOURCES.md)
    { nr: 44660, kind: 'tow', name: 'Lokomotywa luzem Gdańsk Brzeźno – Gdańsk Gł. (kończy bieg)', from: 'BR', to: null, arr: '06:05', track: '7', stop: true, terminates: true, length: 20, vmax: 60 },
    { nr: 55600, kind: 'os', name: 'Regio Malbork – Gdynia Gł.', from: 'GP1', to: 'WR1', arr: '06:10', dep: '06:12', track: '1', stop: true, length: 160, vmax: 120, dwell: 60 },
    { nr: 55601, kind: 'os', name: 'Regio Gdynia Gł. – Malbork', from: 'WR2', to: 'GP2', arr: '06:18', dep: '06:20', track: '2', stop: true, length: 160, vmax: 120, dwell: 60 },
    { nr: 44661, kind: 'tow', name: 'Lokomotywa luzem Gdańsk Gł. – Gdańsk Brzeźno', unit: 44660, from: null, to: 'BR', dep: '06:25', track: '7', stop: false, length: 20, vmax: 60 },
    { nr: 5300, kind: 'os', name: 'IC Warszawa Wsch. – Gdynia Gł.', from: 'GP1', to: 'WR1', arr: '06:28', dep: '06:31', track: '1', stop: true, length: 300, dwell: 120 },
    { nr: 5310, kind: 'os', name: 'IC Słupsk – Gdańsk Gł.', from: 'WR2', to: null, arr: '06:35', track: '7', stop: true, terminates: true, length: 260 },
    { nr: 55602, kind: 'os', name: 'Regio Elbląg – Gdynia Gł.', from: 'GP1', to: 'WR1', arr: '06:40', dep: '06:42', track: '1', stop: true, length: 160, vmax: 120, dwell: 60 },
    { nr: 5301, kind: 'os', name: 'IC Gdynia Gł. – Warszawa Wsch.', from: 'WR2', to: 'GP2', arr: '06:50', dep: '06:53', track: '2', stop: true, length: 300, dwell: 120 },
    { nr: 55610, kind: 'os', name: 'Regio Kartuzy – Gdańsk Gł.', from: 'WR2', to: null, arr: '06:55', track: '9', stop: true, terminates: true, length: 130, vmax: 120 },
    { nr: 44650, kind: 'tow', name: 'Towarowy Gdańsk Port Płn. – Gdańsk Zaspa Towarowa', from: 'GP1', to: 'ZT', arr: '07:00', track: '4', stop: false, length: 500, vmax: 60 },
    { nr: 5302, kind: 'os', name: 'EIC Kraków Gł. – Gdynia Gł.', from: 'GP1', to: 'WR1', arr: '07:05', dep: '07:08', track: '1', stop: true, length: 350, dwell: 120 },
    { nr: 55604, kind: 'os', name: 'Regio Malbork – Gdynia Gł.', from: 'GP1', to: 'WR1', arr: '07:12', dep: '07:14', track: '3', stop: true, length: 160, vmax: 120, dwell: 60 },
    { nr: 55603, kind: 'os', name: 'Regio Gdynia Gł. – Elbląg', from: 'WR2', to: 'GP2', arr: '07:18', dep: '07:20', track: '2', stop: true, length: 160, vmax: 120, dwell: 60 },
    { nr: 5311, kind: 'os', name: 'IC Gdańsk Gł. – Słupsk', unit: 5310, from: null, to: 'WR1', dep: '07:22', track: '7', stop: true, length: 260 },
    { nr: 55620, kind: 'os', name: 'Regio Hel – Gdańsk Gł.', from: 'WR2', to: null, arr: '07:25', track: '13', stop: true, terminates: true, length: 130, vmax: 100 },
    { nr: 55611, kind: 'os', name: 'Regio Gdańsk Gł. – Kartuzy', unit: 55610, from: null, to: 'WR1', dep: '07:30', track: '9', stop: true, length: 130, vmax: 120 },
    { nr: 5303, kind: 'os', name: 'EIC Gdynia Gł. – Kraków Gł.', from: 'WR2', to: 'GP2', arr: '07:35', dep: '07:38', track: '2', stop: true, length: 350, dwell: 120 },
    { nr: 5304, kind: 'os', name: 'IC Warszawa Wsch. – Gdynia Gł.', from: 'GP1', to: 'WR1', arr: '07:40', dep: '07:43', track: '1', stop: true, length: 300, dwell: 120 },
    { nr: 44651, kind: 'tow', name: 'Towarowy Gdańsk Zaspa Towarowa – Gdańsk Port Płn.', from: 'ZT', to: 'GP2', arr: '07:45', track: '4', stop: false, length: 500, vmax: 60 },
    { nr: 55605, kind: 'os', name: 'Regio Gdynia Gł. – Malbork', from: 'WR2', to: 'GP2', arr: '07:48', dep: '07:50', track: '2', stop: true, length: 160, vmax: 120, dwell: 60 },
    { nr: 55621, kind: 'os', name: 'Regio Gdańsk Gł. – Hel', unit: 55620, from: null, to: 'WR1', dep: '08:05', track: '13', stop: true, length: 130, vmax: 100 },
  ],

  tasks: [],

  scenarios: [
    { id: 'zmiana', name: 'Pełna zmiana (05:55–08:15)', description: 'SKM co 15 min w obu kierunkach na peronie III, Regio i IC/EIC linii 9 przez perony I/II, pociągi kończące bieg od Wrzeszcza na peronach IV/V, towarowe na Zaspę Towarową i z Brzeźna. Poziom zakłóceń do wyboru.', endTime: '08:15' },
    { id: 'usterka-zt', name: 'Usterka blokady od Zaspy Towarowej', description: 'Jednotorowa blokada 227 bez łączności przez 40 min – zapowiadanie telefoniczne.', endTime: '08:15', faults: [{ type: 'block-fail', target: 'ZT', at: '06:30', duration: 40 }] },
    { id: 'szczyt', name: 'Szczyt z zakłóceniami', description: 'Pełny rozkład, duże zakłócenia.', endTime: '08:25', disruptions: 'high' },
  ],
};
