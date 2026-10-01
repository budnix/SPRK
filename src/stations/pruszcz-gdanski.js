/**
 * Pruszcz Gdański – stacja na linii 9 (Warszawa – Gdańsk) z odgałęzieniami linii 260 (od Zajączkowa Tczewskiego),
 * 229 (do Starej Piły) i 226 (do Gdańska Portu Północnego). Układ wg planu schematycznego stacji (stan XII 2014,
 * rys. A. Karwat). Odwzorowanie schematyczne części pasażerskiej; wyłącznie stanowisko komputerowe.
 *
 * Siatka 120×18. Tory (y): 6 (4), 4 (6), 2 (8), 1 (10), 3 (12), 5 (14), 7 (16). Perony: I (tory 4/2), II (1/3).
 * Pszczółki po lewej, Gdańsk po prawej; ruch prawostronny: od Pszczółek tor wjazdowy (t.1, y=10) pod wyjazdowym
 * (t.2, y=8), od Gdańska tor wjazdowy (t.2, y=8) nad wyjazdowym (t.1, y=10). Linia 229 to przedłużenie toru 6 na
 * zachód, 260 – toru 3 na zachód, 226 – toru 3 na wschód.
 *
 * Semafory wg planu: wjazdowe C (9 od Pszczółek), D (260), P (229), S (9 od Gdańska), R (226); wyjazdowe E1–E7
 * (na zachód) i G1–G7 (na wschód). Blokada samoczynna na linii 9 (3140/3141 i 3209/3210), Eap jednotorowa na 260,
 * 229 i 226.
 *
 * Uproszczenia względem planu: głowice jako przejścia między sąsiednimi torami (numery rozjazdów 1–14 i 41–54
 * przybliżone do planu); pominięto tory 2a/1a/3a/4a i 2b/1b/3b z semaforami H i pośrednimi, skrzyżowanie 71–76,
 * tor 18 (plac ładunkowy), tor 6a, bocznice, tarcze manewrowe i wykolejnice głowic, semafor B (jazda po torze
 * lewym); linia 226 jako jeden tor dwukierunkowy.
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

// ---- tytuł, przyciski ----
tiles.push({ x: 48, y: 0, type: 'label', text: 'PRUSZCZ GDAŃSKI', size: 13, span: 20 });

// ---- tory stacyjne (x 34–80), semafory E (zachód) i G (wschód) ----
const TRACKS = [['6', 4, 576, null], ['4', 6, 791, 'Peron I'], ['2', 8, 1113, 'Peron I'], ['1', 10, 1355, 'Peron II'], ['3', 12, 969, 'Peron II'], ['5', 14, 776, null], ['7', 16, 776, null]];
for (const [nr, y, len, peron] of TRACKS) {
  sec(`T${nr}`, { length: len, kind: 'station', track: nr, platform: peron || false });
  tiles.push(...H(34, 80, y, `T${nr}`));
  tiles.push(SIG(34, y + 1, `E${nr}`, 'semafor', { x: 34, y }, 'W', { shunting: true }));
  tiles.push(SIG(80, y - 1, `G${nr}`, 'semafor', { x: 80, y }, 'E', { shunting: true }));
  const upper = ['6', '2', '3', '7'].includes(nr);
  tiles.push({ x: upper ? 44 : 62, y: upper ? y - 1 : y + 1, type: 'label', text: peron ? `tor ${nr} · ${peron}` : `tor ${nr}`, span: 4, size: 8 });
}

// ---- szlaki ----
const westExit = (y, id, text) => { sec(`Zb${id}`, { length: 400, kind: 'approach' }); tiles.push({ ...T(0, y, ['W', 'E'], `Zb${id}`), endButton: { id: `k${id}`, color: 'green' }, text }, ...H(1, 5, y, `Zb${id}`)); };
const eastExit = (y, id, text) => { sec(`Zb${id}`, { length: 400, kind: 'approach' }); tiles.push(...H(114, 118, y, `Zb${id}`), { ...T(119, y, ['W', 'E'], `Zb${id}`), endButton: { id: `k${id}`, color: 'green' }, text }); };
westExit(4, 'SP', 'Stara Piła 229'); westExit(8, 'PS2', 'Pszczółki 9 t.2'); westExit(10, 'PS1', 'Pszczółki 9 t.1'); westExit(12, 'ZT', 'Zajączkowo 260');
eastExit(8, 'GD2', 'Gdańsk Płd. 9 t.2'); eastExit(10, 'GD1', 'Gdańsk Płd. 9 t.1'); eastExit(12, 'GP', 'Gdańsk Port Płn. 226');
tiles.push(SIG(5, 5, 'P', 'semafor', { x: 5, y: 4 }, 'E', { entry: true }), SIG(5, 11, 'C', 'semafor', { x: 5, y: 10 }, 'E', { entry: true }),
  SIG(5, 13, 'D', 'semafor', { x: 5, y: 12 }, 'E', { entry: true }),
  SIG(114, 7, 'S', 'semafor', { x: 114, y: 8 }, 'W', { entry: true }), SIG(114, 11, 'R', 'semafor', { x: 114, y: 12 }, 'W', { entry: true }));
tiles.push({ x: 3, y: 3, type: 'label', text: 'linia 229 · Stara Piła', span: 5, size: 7 }, { x: 1, y: 7, type: 'label', text: 'linia 9', span: 2, size: 7 },
  { x: 3, y: 13, type: 'label', text: 'linia 260 · Zajączkowo', span: 5, size: 7 }, { x: 110, y: 7, type: 'label', text: 'linia 9 · Gdańsk', span: 4, size: 7 },
  { x: 108, y: 13, type: 'label', text: 'linia 226 · Gdańsk Port Płn.', span: 7, size: 7 });

// ---- głowica zachodnia ----
// linia 9: 1/2 – wjazd (t.1 → tor 2 i wyżej), 3/4 – wyjazd (tor 1 i niżej → t.2)
plain('W2a', 6, 9, 8); plain('W1a', 6, 7, 10);
crossover(8, 10, 1, 'W', 'NE', 10, 8, 2, 'E', 'SW', ['SW', 'NE']);
plain('W2b', 11, 11, 8, 30); plain('W1b', 9, 13, 10);
crossover(12, 8, 3, 'W', 'SE', 14, 10, 4, 'E', 'NW', ['NW', 'SE']);
plain('W2c', 13, 15, 8); plain('W1c', 15, 15, 10, 30);
// tor 1 ↔ tor 3 (5/6; tor 3 na zachód – linia 260), 3 ↔ 5 (7/8), 5 ↔ 7 (9/10)
crossover(16, 10, 5, 'W', 'SE', 18, 12, 6, 'E', 'NW', ['NW', 'SE']); plain('W1d', 17, 33, 10); plain('W3a', 6, 17, 12);
crossover(20, 12, 7, 'W', 'SE', 22, 14, 8, 'E', 'NW', ['NW', 'SE']); plain('W3b', 19, 19, 12, 30); plain('W3c', 21, 33, 12); stub(21, 14, 'E', 'T5w');
crossover(24, 14, 9, 'W', 'SE', 26, 16, 10, 'E', 'NW', ['NW', 'SE']); plain('W5a', 23, 23, 14, 30); plain('W5b', 25, 33, 14); stub(25, 16, 'E', 'T7w'); plain('W7', 27, 33, 16);
// tor 2 ↔ tor 4 (11/12), 4 ↔ 6 (13/14; tor 6 na zachód – linia 229)
crossover(16, 8, 11, 'W', 'NE', 18, 6, 12, 'E', 'SW', ['SW', 'NE']); plain('W2d', 17, 33, 8); stub(17, 6, 'E', 'T4w');
crossover(20, 6, 13, 'W', 'NE', 22, 4, 14, 'E', 'SW', ['SW', 'NE']); plain('W4a', 19, 19, 6, 30); plain('W4b', 21, 33, 6); plain('W6a', 6, 21, 4); plain('W6b', 23, 33, 4);

// ---- głowica wschodnia ----
// linia 9: 41/42 – wjazd (t.2 → tor 1 i niżej), 43/44 – wyjazd (tor 2 i wyżej → t.1)
plain('E2a', 81, 97, 8); plain('E1a', 81, 101, 10);
crossover(98, 8, 52, 'E', 'NW', 96, 6, 51, 'W', 'SE', ['NW', 'SE']); plain('E4a', 81, 93, 6); plain('E4b', 95, 95, 6, 30); stub(97, 6, 'W', 'T4e');
crossover(94, 6, 54, 'E', 'NW', 92, 4, 53, 'W', 'SE', ['NW', 'SE']); plain('E6', 81, 91, 4); stub(93, 4, 'W', 'T6e');
plain('E2b', 99, 103, 8);
crossover(104, 8, 43, 'W', 'SE', 106, 10, 44, 'E', 'NW', ['NW', 'SE']); plain('E2c', 105, 110, 8);
crossover(111, 8, 41, 'E', 'SW', 109, 10, 42, 'W', 'NE', ['NE', 'SW']); plain('E2d', 112, 113, 8); plain('E1d', 110, 113, 10);
plain('E1b', 103, 105, 10); plain('E1c', 107, 108, 10);
// tor 3 ↔ tor 1 (45/46; tor 3 na wschód – linia 226), 5 ↔ 3 (47/48), 7 ↔ 5 (49/50)
crossover(100, 12, 45, 'W', 'NE', 102, 10, 46, 'E', 'SW', ['SW', 'NE']); plain('E3a', 81, 97, 12); plain('E3b', 99, 99, 12, 30); plain('E3c', 101, 113, 12);
crossover(96, 14, 47, 'W', 'NE', 98, 12, 48, 'E', 'SW', ['SW', 'NE']); plain('E5a', 81, 93, 14); plain('E5b', 95, 95, 14, 30); stub(97, 14, 'W', 'T5e');
crossover(92, 16, 49, 'W', 'NE', 94, 14, 50, 'E', 'SW', ['SW', 'NE']); plain('E7', 81, 91, 16); stub(93, 16, 'W', 'T7e');

export default {
  schemaVersion: 1,
  id: 'pruszcz-gdanski',
  name: 'Pruszcz Gdański',
  srk: 'komputerowe',
  srkInfo: 'Stanowisko komputerowe (LCS Gdańsk po modernizacji linii 9); plan z XII 2014 pokazuje układ torowy z nastawnią „PrG” – tu jedno stanowisko na całą stację.',
  description: 'Stacja na linii 9 przed Gdańskiem: perony I (tory 4/2) i II (1/3), tory 6, 5, 7 dla towarowych; linie 260 od Zajączkowa Tczewskiego, 229 do Starej Piły i 226 do Gdańska Portu Północnego. Blokada samoczynna na 9, Eap na liniach jednotorowych.',
  location: 'Linia 9 Warszawa Wsch. – Gdańsk Gł. między Pszczółkami a Gdańskiem Południowym; węzeł z liniami 226, 229 i 260; powiat gdański, woj. pomorskie.',
  region: 'pomorskie',          // województwo – mapa wyboru posterunku
  lines: [9, 226, 229, 260],      // linie kolejowe (jak w `location`)
  traffic: 'Regio i dalekobieżne linii 9 na peronach I/II, towarowe z Zajączkowa do Portu Północnego torami 3/5/7, na Starą Piłę torem 6.',
  difficulty: 4,
  startTime: '05:55',
  desk: { cols: 120, rows: 18 },

  exits: {
    SP: { name: 'Stara Piła', label: 'Stara Piła – 229', tile: { x: 0, y: 4 }, dir: 'W', lineLength: 7000, lineSpeed: 60 },
    PS2: { name: 'Pszczółki', label: 'Pszczółki – 9 t.2', tile: { x: 0, y: 8 }, dir: 'W', direction: 'out', block: 'sbl', lineLength: 9000, lineSpeed: 160 },
    PS1: { name: 'Pszczółki', label: 'Pszczółki – 9 t.1', tile: { x: 0, y: 10 }, dir: 'W', direction: 'in', block: 'sbl', lineLength: 9000, lineSpeed: 160 },
    ZT: { name: 'Zajączkowo Tczewskie', label: 'Zajączkowo Tcz. – 260', tile: { x: 0, y: 12 }, dir: 'W', lineLength: 12000, lineSpeed: 80 },
    GD2: { name: 'Gdańsk Południowy', label: 'Gdańsk Płd. – 9 t.2', tile: { x: 119, y: 8 }, dir: 'E', direction: 'in', block: 'sbl', lineLength: 6500, lineSpeed: 160 },
    GD1: { name: 'Gdańsk Południowy', label: 'Gdańsk Płd. – 9 t.1', tile: { x: 119, y: 10 }, dir: 'E', direction: 'out', block: 'sbl', lineLength: 6500, lineSpeed: 160 },
    GP: { name: 'Gdańsk Port Północny', label: 'Gdańsk Port Płn. – 226', tile: { x: 119, y: 12 }, dir: 'E', lineLength: 14000, lineSpeed: 60 },
  },
  sections,
  tiles,
  // wyłączone: jazdy na tory szlakowe wjazdowe (PS1, GD2) i okrężne warianty (#2) przez oba przejścia 8↔10
  routes: { disable: ['E6-PS1', 'G6-GD2', 'G6-GD2#2', 'E4-PS1', 'G4-GD2', 'G4-GD2#2', 'E2-PS1', 'G2-GD2', 'G2-GD2#2', 'E1-PS1', 'E1-PS1#2', 'G1-GD2',
    'E3-PS1', 'E3-PS1#2', 'G3-GD2', 'E5-PS1', 'E5-PS1#2', 'G5-GD2', 'E7-PS1', 'E7-PS1#2', 'G7-GD2',
    'C-G1#2', 'C-G3#2', 'C-G5#2', 'C-G7#2', 'S-E2#2', 'S-E4#2', 'S-E6#2'], override: {} },

  timetable: [
    { nr: 55301, kind: 'os', name: 'Regio Gdańsk Gł. – Tczew', from: 'GD2', to: 'PS2', arr: '06:03', dep: '06:04', track: '2', stop: true, length: 130, vmax: 120, dwell: 40 },
    { nr: 55300, kind: 'os', name: 'Regio Tczew – Gdańsk Gł.', from: 'PS1', to: 'GD1', arr: '06:12', dep: '06:13', track: '1', stop: true, length: 130, vmax: 120, dwell: 40 },
    { nr: 5311, kind: 'os', name: 'IC Gdynia Gł. – Warszawa Wsch.', from: 'GD2', to: 'PS2', arr: '06:20', track: '2', stop: false, length: 300 },
    { nr: 44700, kind: 'tow', cat: 'TM', name: 'Towarowy Zajączkowo Tczewskie – Gdańsk Port Płn.', from: 'ZT', to: 'GP', arr: '06:25', track: '3', stop: false, length: 560, mass: 3000, vmax: 60 },
    { nr: 55303, kind: 'os', name: 'Regio Gdańsk Gł. – Elbląg', from: 'GD2', to: 'PS2', arr: '06:33', dep: '06:34', track: '2', stop: true, length: 130, vmax: 120, dwell: 40 },
    { nr: 55302, kind: 'os', name: 'Regio Elbląg – Gdańsk Gł.', from: 'PS1', to: 'GD1', arr: '06:42', dep: '06:43', track: '1', stop: true, length: 130, vmax: 120, dwell: 40 },
    { nr: 5315, kind: 'os', name: 'EIC Gdynia Gł. – Kraków Gł.', from: 'GD2', to: 'PS2', arr: '06:48', track: '2', stop: false, length: 350 },
    { nr: 5310, kind: 'os', name: 'IC Warszawa Wsch. – Gdynia Gł.', from: 'PS1', to: 'GD1', arr: '06:50', track: '1', stop: false, length: 300 },
    { nr: 44720, kind: 'tow', cat: 'TN', name: 'Towarowy Stara Piła – Gdańsk Port Płn.', from: 'SP', to: 'GD1', arr: '06:55', track: '6', stop: false, length: 400, mass: 1000, vmax: 60 },
    { nr: 44701, kind: 'tow', cat: 'TD', name: 'Towarowy Gdańsk Port Płn. – Zajączkowo Tczewskie', from: 'GP', to: 'ZT', arr: '07:02', track: '3', stop: false, length: 650, mass: 1500, vmax: 60 },
    { nr: 55305, kind: 'os', name: 'Regio Gdańsk Gł. – Tczew', from: 'GD2', to: 'PS2', arr: '07:03', dep: '07:04', track: '2', stop: true, length: 130, vmax: 120, dwell: 40 },
    { nr: 55304, kind: 'os', name: 'Regio Tczew – Gdańsk Gł.', from: 'PS1', to: 'GD1', arr: '07:12', dep: '07:13', track: '1', stop: true, length: 130, vmax: 120, dwell: 40 },
    { nr: 5313, kind: 'os', name: 'IC Gdynia Gł. – Warszawa Wsch.', from: 'GD2', to: 'PS2', arr: '07:20', track: '2', stop: false, length: 300 },
    { nr: 44710, kind: 'tow', cat: 'TN', name: 'Towarowy Zajączkowo Tczewskie – Gdańsk Port Płn.', from: 'PS1', to: 'GP', arr: '07:22', track: '5', stop: false, length: 520, mass: 1400, vmax: 60 },
    { nr: 44721, kind: 'tow', cat: 'TN', name: 'Towarowy Gdańsk Port Płn. – Stara Piła', from: 'GD2', to: 'SP', arr: '07:25', track: '6', stop: false, length: 400, mass: 700, vmax: 60 },
    { nr: 5314, kind: 'os', name: 'EIC Kraków Gł. – Gdynia Gł.', from: 'PS1', to: 'GD1', arr: '07:28', track: '1', stop: false, length: 350 },
    { nr: 55307, kind: 'os', name: 'Regio Gdańsk Gł. – Elbląg', from: 'GD2', to: 'PS2', arr: '07:33', dep: '07:34', track: '2', stop: true, length: 130, vmax: 120, dwell: 40 },
    { nr: 55306, kind: 'os', name: 'Regio Elbląg – Gdańsk Gł.', from: 'PS1', to: 'GD1', arr: '07:42', dep: '07:43', track: '1', stop: true, length: 130, vmax: 120, dwell: 40 },
    { nr: 5312, kind: 'os', name: 'IC Warszawa Wsch. – Gdynia Gł.', from: 'PS1', to: 'GD1', arr: '07:50', track: '1', stop: false, length: 300 },
    { nr: 44711, kind: 'tow', cat: 'TD', traction: 'S', name: 'Towarowy Gdańsk Port Płn. – Pszczółki', from: 'GP', to: 'PS2', arr: '07:54', track: '7', stop: false, length: 500, mass: 1100, vmax: 60 },
    { nr: 55309, kind: 'os', name: 'Regio Gdańsk Gł. – Tczew', from: 'GD2', to: 'PS2', arr: '08:03', dep: '08:04', track: '2', stop: true, length: 130, vmax: 120, dwell: 40 },
  ],

  tasks: [],

  scenarios: [
    { id: 'zmiana', name: 'Pełna zmiana (05:55–08:15)', description: 'Regio i dalekobieżne linii 9 na peronach I/II, towarowe z Zajączkowa i Pszczółek do Portu Północnego, ze Starej Piły do Gdańska. Poziom zakłóceń do wyboru.', endTime: '08:15' },
    { id: 'usterka-gp', name: 'Usterka blokady od Portu Północnego', description: 'Jednotorowa blokada 226 bez łączności przez 40 min – zapowiadanie telefoniczne.', endTime: '08:15', faults: [{ type: 'block-fail', target: 'GP', at: '06:30', duration: 40 }] },
    { id: 'szczyt', name: 'Szczyt z zakłóceniami', description: 'Pełny rozkład, duże zakłócenia.', endTime: '08:25', disruptions: 'high' },
  ],
};
