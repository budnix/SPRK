/**
 * Stacja Gdynia Główna – okręg pasażerski (wg planu schematycznego stacji, stan X 2024).
 *
 * Odwzorowanie na pulpicie kostkowym (schemat, nie mapa):
 *  - tory peronowe 1–10 (perony V: tory 10/9, 4: tory 7/6, 3: tory 5/4, 2: tory 2/1; tory 8 i 3 bez peronu),
 *    tory SKM 501/502 (peron I SKM),
 *  - głowica zachodnia (od Gdańska): linie 202 tor 1/2 (semafory wjazdowe A1, A2), 201 (B1, tor 10);
 *    ruch prawostronny jak na sąsiednich posterunkach (SKM na dole = wschód): tor 1 linii 202 (jazda w prawo,
 *    na Chylonię) wchodzi w tor 7 (y=8), tor 2 w tor 8 (y=6) – A1 na torze 1, A2 na torze 2,
 *    250 SKM 501/502 (A501, A502); rozjazdy 3, 4, 11, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 25, 26, 27,
 *  - głowica wschodnia (do Chyloni / Portu): linia 202 (semafory wjazdowe A, B), 250 SKM (L501, L502),
 *    201 Gdynia Port (S301); rozjazdy 31–36, 40–47, 61–66,
 *  - semafory wyjazdowe G1–G10 (na zachód), K1–K10 (na wschód), D501/D502 i E501/E502 (SKM),
 *  - bocznica 51 z wykolejnicą Wk51 i tarczą Tm51.
 * Pominięto: grupy torów odstawczych (GO1/GO2, 26–29, 35–38, 503), Gdynię Postojową (linia 960),
 * tory 21/22/24 rejonu wschodniego.
 *
 * Siatka 100 × 28. Tory: 10 (y=2), 9 (4), 8 (6), 7 (8), 6 (10), 5 (12), 4 (14), 3 (16), 2 (18), 1 (20), 502 (22), 501 (24).
 */
const T = (x, y, ports, section, extra = {}) => ({ x, y, type: 'track', ports, section, ...extra });
const H = (x1, x2, y, section, extra = {}) => Array.from({ length: x2 - x1 + 1 }, (_, i) => T(x1 + i, y, ['W', 'E'], section, extra));
const P = (x, y, id, toe, straight, diverge, section, extra = {}) => ({ x, y, type: 'point', id: `Zw${id}`, label: String(id), toe, straight, diverge, section, ...extra });
const SIG = (x, y, id, kind, at, dir, extra = {}) => ({ x, y, type: 'signal', id, kind, at, dir, ...extra });

const TRACKS = [
  // [nr, y, dł. użyteczna, peron, x początku toru peronowego (za głowicą zachodnią)]
  ['10', 2, 501, 'Peron V', 14], ['9', 4, 531, 'Peron V', 12], ['8', 6, 527, null, 11], ['7', 8, 497, 'Peron IV', 14],
  ['6', 10, 430, 'Peron IV', 16], ['5', 12, 409, 'Peron III', 18], ['4', 14, 430, 'Peron III', 20], ['3', 16, 371, null, 22],
  ['2', 18, 294, 'Peron II', 24], ['1', 20, 292, 'Peron II', 26], ['502', 22, 300, 'Peron I SKM', 24], ['501', 24, 300, 'Peron I SKM', 19],
];
// koniec toru peronowego (x) i początek odcinka wschodniego – wg głowicy wschodniej
const EAST_END = { 10: 85, 9: 87, 8: 89, 7: 87, 6: 85, 5: 83, 4: 81, 3: 79, 2: 77, 1: 75, 502: 74, 501: 83 };

const tiles = [];
const sections = {};

// ---------------- blokady i przyciski ----------------
tiles.push({ x: 38, y: 0, type: 'label', text: 'GDYNIA GŁÓWNA', size: 13, span: 24 });
tiles.push({ x: 45, y: 1, type: 'button', id: 'Zw', label: 'Zw', role: 'group-point', color: 'black' });
tiles.push({ x: 46, y: 1, type: 'button', id: 'Zz', label: 'Zz', role: 'point-lock', color: 'blue' });
tiles.push({ x: 48, y: 1, type: 'button', id: 'Pz', label: 'Pz', role: 'route-release', color: 'grey' });
tiles.push({ x: 49, y: 1, type: 'button', id: 'dPz', label: 'dPz', role: 'emergency-release', color: 'red', counter: true });
tiles.push({ x: 51, y: 1, type: 'button', id: 'Sz', label: 'Sz', role: 'substitute', color: 'white', counter: true });

// ---------------- tory peronowe ----------------
for (const [nr, y, len, peron, x0] of TRACKS) {
  const sid = `T${nr}`;
  sections[sid] = { length: len, kind: 'station', track: nr, platform: peron || false };
  tiles.push(...H(x0, 69, y, sid));
  // odcinek wschodni za semaforem K (do głowicy wschodniej)
  const esid = `E${nr}`;
  sections[esid] = { length: 160, kind: 'plain', track: nr };
  tiles.push(...H(70, EAST_END[nr], y, esid));
  // semafory wyjazdowe: G (na zachód, przycisk manewrowy), K (na wschód)
  const g = nr === '502' ? 'D502' : nr === '501' ? 'D501' : `G${nr}`;
  const k = nr === '502' ? 'E502' : nr === '501' ? 'E501' : `K${nr}`;
  tiles.push(SIG(30, y + 1, g, 'semafor', { x: 30, y }, 'W', { shunting: true }));
  tiles.push(SIG(69, y - 1, k, 'semafor', { x: 69, y }, 'E', { shunting: true }));
  // etykieta toru nad torem (wiersz nieparzysty między torami dzielą dwa tory – etykiety w różnych kolumnach)
  const upper = ['10', '8', '7', '5', '4', '2', '502'].includes(nr); // etykieta nad torem, pozostałe pod torem
  tiles.push({ x: upper ? 40 : 56, y: upper ? y - 1 : y + 1, type: 'label', text: peron ? `tor ${nr} · ${peron}` : `tor ${nr}`, span: 4, size: 8 });
}

// ---------------- głowica zachodnia ----------------
// linia 201 (tor 10) – od Gdyni Wielki Kack
sections.ZbB1 = { length: 400, kind: 'approach' };
tiles.push({ ...T(0, 2, ['W', 'E'], 'ZbB1'), endButton: { id: 'kK', color: 'green' }, text: 'Wlk. Kack' }, ...H(1, 5, 2, 'ZbB1'));
sections.W201 = { length: 180, kind: 'plain' };
tiles.push(...H(6, 12, 2, 'W201'));
sections.Iz25 = { length: 60, kind: 'point' };
tiles.push(P(13, 2, 25, 'E', 'W', 'SW', 'Iz25'), T(12, 3, ['NE', 'SW'], 'Iz25'));
// linia 202 tor 1 (A1) – wiersz toru 8
sections.ZbA1 = { length: 400, kind: 'approach' };
tiles.push({ ...T(0, 6, ['W', 'E'], 'ZbA1'), endButton: { id: 'kG1', color: 'green' }, text: 'Gdańsk t.1' }, ...H(1, 5, 6, 'ZbA1'));
sections.W1a = { length: 60, kind: 'plain' };
tiles.push(...H(6, 7, 6, 'W1a'));
sections.Iz3 = { length: 80, kind: 'point' };
tiles.push(P(8, 6, 4, 'E', 'W', 'SW', 'Iz3'), T(7, 7, ['NE', 'SW'], 'Iz3'), P(6, 8, 3, 'W', 'E', 'NE', 'Iz3'));
sections.Iz14 = { length: 50, kind: 'point' };
tiles.push(P(9, 6, 14, 'W', 'E', 'NE', 'Iz14'), T(10, 5, ['SW', 'NE'], 'Iz14'));
sections.Iz22 = { length: 50, kind: 'point' };
tiles.push(P(11, 4, 22, 'SW', 'NE', 'E', 'Iz22'));
sections.Iz16 = { length: 60, kind: 'point' };
tiles.push(P(10, 6, 16, 'W', 'E', 'SE', 'Iz16'), T(11, 7, ['NW', 'SE'], 'Iz16'));
// linia 202 tor 2 (A2) – wiersz toru 7
sections.ZbA2 = { length: 400, kind: 'approach' };
tiles.push({ ...T(0, 8, ['W', 'E'], 'ZbA2'), endButton: { id: 'kG2', color: 'green' }, text: 'Gdańsk t.2' }, ...H(1, 5, 8, 'ZbA2'));
sections.W2a = { length: 120, kind: 'plain' };
tiles.push(...H(7, 11, 8, 'W2a'));
sections.Iz23 = { length: 40, kind: 'point' };
tiles.push(P(12, 8, 23, 'E', 'W', 'NW', 'Iz23'));
// drabina w dół: 26 → 27 → 19 → 20 → 18 → 17 → 21 → 15
const ladderW = [[13, 8, 26, 'W', 'E', 'SE'], [15, 10, 27], [17, 12, 19], [19, 14, 20], [21, 16, 18], [23, 18, 17]];
for (const [x, y, id, toe = 'NW', straight = 'SE', diverge = 'E'] of ladderW) {
  sections[`Iz${id}`] = { length: 60, kind: 'point' };
  tiles.push(P(x, y, id, toe, straight, diverge, `Iz${id}`), T(x + 1, y + 1, ['NW', 'SE'], `Iz${id}`));
}
sections.Iz21 = { length: 60, kind: 'point' };
tiles.push(P(25, 20, 21, 'NW', 'E', 'SW', 'Iz21'), T(24, 21, ['NE', 'SW'], 'Iz21'));
sections.Iz15 = { length: 40, kind: 'point' };
tiles.push(P(23, 22, 15, 'W', 'E', 'NE', 'Iz15'));
// SKM 502 / 501 od Gdyni Orłowo
sections.ZbA502 = { length: 400, kind: 'approach' };
tiles.push({ ...T(0, 22, ['W', 'E'], 'ZbA502'), endButton: { id: 'kS2', color: 'green' }, text: 'Orłowo 502' }, ...H(1, 5, 22, 'ZbA502'));
sections.W502a = { length: 260, kind: 'plain' };
tiles.push(...H(6, 17, 22, 'W502a'));
sections.Iz11 = { length: 80, kind: 'point' };
tiles.push(P(18, 22, 11, 'E', 'W', 'SW', 'Iz11'), T(17, 23, ['NE', 'SW'], 'Iz11'), P(16, 24, 13, 'W', 'E', 'NE', 'Iz11'));
sections.W502b = { length: 90, kind: 'plain' };
tiles.push(...H(19, 22, 22, 'W502b'));
sections.ZbA501 = { length: 400, kind: 'approach' };
tiles.push({ ...T(0, 24, ['W', 'E'], 'ZbA501'), endButton: { id: 'kS1', color: 'green' }, text: 'Orłowo 501' }, ...H(1, 5, 24, 'ZbA501'));
sections.W501a = { length: 220, kind: 'plain' };
tiles.push(...H(6, 15, 24, 'W501a'));
sections.W501b = { length: 50, kind: 'plain' };
tiles.push(...H(17, 18, 24, 'W501b'));
// semafory wjazdowe zachód
tiles.push(SIG(5, 3, 'B1', 'semafor', { x: 5, y: 2 }, 'E', { entry: true }));
tiles.push(SIG(5, 5, 'A2', 'semafor', { x: 5, y: 6 }, 'E', { entry: true })); // t.2 (wyjazdowy) – wjazd po torze lewym
tiles.push(SIG(5, 7, 'A1', 'semafor', { x: 5, y: 8 }, 'E', { entry: true })); // t.1 – zasadniczy wjazd od Gdańska
tiles.push(SIG(5, 21, 'A502', 'semafor', { x: 5, y: 22 }, 'E', { entry: true }));
tiles.push(SIG(5, 23, 'A501', 'semafor', { x: 5, y: 24 }, 'E', { entry: true }));
// tarcze manewrowe głowicy zachodniej
tiles.push(SIG(7, 5, 'Tm14', 'tm', { x: 7, y: 6 }, 'W'), SIG(6, 5, 'Tm16', 'tm', { x: 7, y: 6 }, 'E'));
tiles.push(SIG(9, 9, 'Tm13', 'tm', { x: 9, y: 8 }, 'W'), SIG(10, 9, 'Tm15', 'tm', { x: 9, y: 8 }, 'E'));
tiles.push(SIG(8, 25, 'Tm9', 'tm', { x: 8, y: 24 }, 'W'), SIG(9, 25, 'Tm12', 'tm', { x: 8, y: 24 }, 'E'));
tiles.push({ x: 2, y: 4, type: 'label', text: 'linia 202', size: 7, span: 2 }, { x: 2, y: 10, type: 'label', text: 'linia 250 SKM', size: 7, span: 3 });
tiles.push({ x: 20, y: 0, type: 'label', text: 'GO2 – głowica zachodnia', size: 8, span: 6 });

// ---------------- głowica wschodnia ----------------
// tor 10: koniec na drabinie w górę (łuk)
sections.Iz45 = { length: 70, kind: 'point' };
tiles.push(T(86, 2, ['W', 'SE'], 'Iz45'), T(87, 3, ['NW', 'SE'], 'Iz45'), P(88, 4, 45, 'SE', 'NW', 'W', 'Iz45'));
sections.Iz46 = { length: 50, kind: 'point' };
tiles.push(P(90, 6, 46, 'E', 'W', 'NW', 'Iz46'), T(89, 5, ['SE', 'NW'], 'Iz46'));
sections.Iz47 = { length: 60, kind: 'point' };
tiles.push(P(91, 6, 47, 'E', 'W', 'SW', 'Iz47'), T(90, 7, ['NE', 'SW'], 'Iz47'));
sections.E1a = { length: 40, kind: 'plain' };
tiles.push(T(92, 6, ['W', 'E'], 'E1a'));
// przejście 61/62 dla pociągów jadących na zachód z toru 2 linii 202 na tor 1 (i dalej na tory 8–10)
sections.Iz61 = { length: 80, kind: 'point' };
tiles.push(P(93, 6, 61, 'W', 'E', 'SE', 'Iz61'), T(94, 7, ['NW', 'SE'], 'Iz61'), P(95, 8, 62, 'E', 'W', 'NW', 'Iz61'));
sections.E1b = { length: 50, kind: 'plain' };
tiles.push(...H(94, 95, 6, 'E1b'));
sections.ZbB = { length: 400, kind: 'approach' };
tiles.push(...H(96, 98, 6, 'ZbB'), { ...T(99, 6, ['W', 'E'], 'ZbB'), endButton: { id: 'kC1', color: 'green' }, text: 'Chylonia t.1' });
// tor 7 / linia 202 tor 2
sections.Iz42 = { length: 60, kind: 'point' };
tiles.push(P(88, 8, 42, 'E', 'W', 'SW', 'Iz42'), T(87, 9, ['NE', 'SW'], 'Iz42'));
sections.Iz43 = { length: 40, kind: 'point' };
tiles.push(P(89, 8, 43, 'W', 'E', 'NE', 'Iz43'));
sections.E2a = { length: 100, kind: 'plain' };
tiles.push(...H(90, 94, 8, 'E2a'));
sections.ZbA = { length: 400, kind: 'approach' };
tiles.push(...H(96, 98, 8, 'ZbA'), { ...T(99, 8, ['W', 'E'], 'ZbA'), endButton: { id: 'kC2', color: 'green' }, text: 'Chylonia t.2' });
// drabina w dół (na zachód): 41 → 40 → 36 → 35 → 34 → 33
const ladderE = [[86, 10, 41], [84, 12, 40], [82, 14, 36], [80, 16, 35], [78, 18, 34]];
for (const [x, y, id] of ladderE) {
  sections[`Iz${id}`] = { length: 60, kind: 'point' };
  tiles.push(P(x, y, id, 'NE', 'SW', 'W', `Iz${id}`), T(x - 1, y + 1, ['NE', 'SW'], `Iz${id}`));
}
sections.Iz33 = { length: 40, kind: 'point' };
tiles.push(P(76, 20, 33, 'W', 'E', 'NE', 'Iz33'));
sections.Iz32 = { length: 60, kind: 'point' };
tiles.push(P(77, 20, 32, 'W', 'E', 'SW', 'Iz32'), T(76, 21, ['NE', 'SW'], 'Iz32'));
sections.Iz31 = { length: 40, kind: 'point' };
tiles.push(P(75, 22, 31, 'E', 'W', 'NE', 'Iz31'));
// linia 201 do Gdyni Port (z toru 1)
sections.EP = { length: 350, kind: 'plain' };
tiles.push(...H(78, 93, 20, 'EP'));
sections.ZbS = { length: 400, kind: 'approach' };
tiles.push(...H(94, 98, 20, 'ZbS'), { ...T(99, 20, ['W', 'E'], 'ZbS'), endButton: { id: 'kP', color: 'green' }, text: 'Gdynia Port' });
// SKM wschód
sections.E502b = { length: 220, kind: 'plain' };
tiles.push(...H(76, 85, 22, 'E502b'));
sections.Iz63 = { length: 80, kind: 'point' };
tiles.push(P(86, 22, 63, 'W', 'E', 'SW', 'Iz63'), T(85, 23, ['NE', 'SW'], 'Iz63'), P(84, 24, 64, 'E', 'W', 'NE', 'Iz63'));
sections.E502c = { length: 160, kind: 'plain' };
tiles.push(...H(87, 93, 22, 'E502c'));
sections.ZbL502 = { length: 400, kind: 'approach' };
tiles.push(...H(94, 98, 22, 'ZbL502'), { ...T(99, 22, ['W', 'E'], 'ZbL502'), endButton: { id: 'kR2', color: 'green' }, text: 'Chylonia 502' });
sections.E501b = { length: 70, kind: 'plain' };
tiles.push(...H(85, 87, 24, 'E501b'));
sections.Iz66 = { length: 60, kind: 'point' };
tiles.push(P(88, 24, 66, 'W', 'E', 'SE', 'Iz66'), T(89, 25, ['NW', 'SE'], 'Iz66'), T(90, 26, ['NW', 'E'], 'Iz66'));
sections.E501c = { length: 120, kind: 'plain' };
tiles.push(...H(89, 93, 24, 'E501c'));
sections.ZbL501 = { length: 400, kind: 'approach' };
tiles.push(...H(94, 98, 24, 'ZbL501'), { ...T(99, 24, ['W', 'E'], 'ZbL501'), endButton: { id: 'kR1', color: 'green' }, text: 'Chylonia 501' });
// bocznica 51
sections.T51w = { length: 25, kind: 'siding', track: '51' };
sections.T51 = { length: 150, kind: 'siding', track: '51' };
tiles.push({ ...T(91, 26, ['W', 'E'], 'T51w'), derailer: 'Wk51' }, ...H(92, 96, 26, 'T51'), { x: 97, y: 26, type: 'buffer', port: 'W', section: 'T51', endButton: { id: 'kT51', color: 'white' } });
tiles.push(SIG(93, 27, 'Tm51', 'tm', { x: 93, y: 26 }, 'W'));
tiles.push({ x: 94, y: 27, type: 'label', text: 'tor 51', size: 8, span: 2 });
// semafory wjazdowe wschód
tiles.push(SIG(96, 5, 'B', 'semafor', { x: 96, y: 6 }, 'W', { entry: true }));
tiles.push(SIG(96, 7, 'A', 'semafor', { x: 96, y: 8 }, 'W', { entry: true }));
tiles.push(SIG(94, 19, 'S301', 'semafor', { x: 94, y: 20 }, 'W', { entry: true }));
tiles.push(SIG(94, 21, 'L502', 'semafor', { x: 94, y: 22 }, 'W', { entry: true }));
tiles.push(SIG(94, 23, 'L501', 'semafor', { x: 94, y: 24 }, 'W', { entry: true }));
// tarcze manewrowe głowicy wschodniej
tiles.push(SIG(92, 5, 'Tm22', 'tm', { x: 92, y: 6 }, 'E'), SIG(93, 5, 'Tm24', 'tm', { x: 92, y: 6 }, 'W'));
tiles.push(SIG(91, 9, 'Tm25', 'tm', { x: 91, y: 8 }, 'E'), SIG(92, 9, 'Tm26', 'tm', { x: 91, y: 8 }, 'W'));
tiles.push(SIG(80, 21, 'Tm21', 'tm', { x: 80, y: 20 }, 'E'), SIG(81, 21, 'Tm23', 'tm', { x: 80, y: 20 }, 'W'));
tiles.push({ x: 74, y: 0, type: 'label', text: 'GO – głowica wschodnia', size: 8, span: 6 });

export default {
  schemaVersion: 1,
  id: 'gdynia-glowna',
  name: 'Gdynia Główna',
  srk: 'komputerowe',
  srkInfo: 'Komputerowe (Ebilock 950 firmy Bombardier/ZWUS, nastawnia dysponująca GO – Lokalne Centrum Sterowania Gdynia, od 2013: monitory, klawiatury, cztery komputery zależnościowe); nastawnia wykonawcza GO2. Tory SKM 501/502 – nastawnia zdalnego sterowania GG-SKM (PKP SKM).',
  description: 'Okręg pasażerski Gdyni Głównej: 10 torów peronowych, 2 tory SKM, linie 202 i 250 od Gdańska i Chyloni, 201 do Wielkiego Kacka i Gdyni Portu. Schemat wg planu stacji (2024), rozjazdy i semafory z numeracją rzeczywistą.',
  location: 'Linie 202, 250 (SKM) i 201 – główna stacja Gdyni, woj. pomorskie.',
  traffic: 'Największy ruch: 10 torów peronowych, SKM, dalekobieżne, towarowe; dwa okręgi nastawcze i polecenia między nastawniami.',
  difficulty: 5,
  startTime: '05:55',
  desk: { cols: 100, rows: 28 },

  /**
   * Okręgi nastawcze. GO – nastawnia dysponująca (dyżurny ruchu, głowica wschodnia),
   * GO2 – nastawnia wykonawcza (nastawniczy, głowica zachodnia). Podział pulpitu po kolumnach.
   */
  districts: {
    GO: { name: 'GO – nastawnia dysponująca (głowica wschodnia)', short: 'GO', role: 'dysponująca', cols: [35, 99] },
    GO2: { name: 'GO2 – nastawnia wykonawcza (głowica zachodnia)', short: 'GO2', role: 'wykonawcza', cols: [0, 34] },
  },

  exits: {
    K: { name: 'Gdynia Wielki Kack', label: 'Wlk. Kack – 201', tile: { x: 0, y: 2 }, dir: 'W', lineLength: 5200, lineSpeed: 80 },
    G1: { name: 'Gdynia Orłowo', label: 'Gdańsk – 202 t.1', tile: { x: 0, y: 8 }, dir: 'W', direction: 'in', block: 'sbl', lineLength: 3600, lineSpeed: 120 },
    G2: { name: 'Gdynia Orłowo', label: 'Gdańsk – 202 t.2', tile: { x: 0, y: 6 }, dir: 'W', direction: 'out', block: 'sbl', lineLength: 3600, lineSpeed: 120 },
    S2: { name: 'Gdynia Orłowo SKM', label: 'Orłowo – 250 t.502', tile: { x: 0, y: 22 }, dir: 'W', direction: 'out', block: 'sbl', lineLength: 3400, lineSpeed: 100 },
    S1: { name: 'Gdynia Orłowo SKM', label: 'Orłowo – 250 t.501', tile: { x: 0, y: 24 }, dir: 'W', direction: 'in', block: 'sbl', lineLength: 3400, lineSpeed: 100 },
    C1: { name: 'Gdynia Chylonia', label: 'Chylonia – 202 t.1', tile: { x: 99, y: 8 }, dir: 'E', direction: 'out', block: 'sbl', lineLength: 4300, lineSpeed: 120 },
    C2: { name: 'Gdynia Chylonia', label: 'Chylonia – 202 t.2', tile: { x: 99, y: 6 }, dir: 'E', direction: 'in', block: 'sbl', lineLength: 4300, lineSpeed: 120 },
    R2: { name: 'Gdynia Chylonia SKM', label: 'Chylonia – 250 t.502', tile: { x: 99, y: 22 }, dir: 'E', direction: 'in', block: 'sbl', lineLength: 4100, lineSpeed: 100 },
    R1: { name: 'Gdynia Chylonia SKM', label: 'Chylonia – 250 t.501', tile: { x: 99, y: 24 }, dir: 'E', direction: 'out', block: 'sbl', lineLength: 4100, lineSpeed: 100 },
    P: { name: 'Gdynia Port', label: 'Gdynia Port – 201', tile: { x: 99, y: 20 }, dir: 'E', lineLength: 3000, lineSpeed: 60 },
  },

  sections,
  tiles,
  routes: { disable: [], override: {} },

  timetable: [
    // SKM co 15 min: od Orłowa tor 501 → Chylonia 501, od Chyloni tor 502 → Orłowo 502
    ...[['06:03', 91101, 91102], ['06:18', 91103, 91104], ['06:33', 91105, 91106], ['06:48', 91107, 91108], ['07:03', 91109, 91110], ['07:18', 91111, 91112], ['07:33', 91113, 91114], ['07:48', 91115, 91116]]
      .flatMap(([t, nrE, nrW]) => {
        const [h, m] = t.split(':').map(Number);
        const dep = `${String(h).padStart(2, '0')}:${String(m + 1).padStart(2, '0')}`;
        const tW = `${String(h).padStart(2, '0')}:${String(m + 7).padStart(2, '0')}`;
        const depW = `${String(h).padStart(2, '0')}:${String(m + 8).padStart(2, '0')}`;
        return [
          { nr: nrE, kind: 'os', name: 'SKM Gdańsk Śródmieście – Wejherowo', from: 'S1', to: 'R1', arr: t, dep, track: '501', stop: true, length: 130, dwell: 50 },
          { nr: nrW, kind: 'os', name: 'SKM Wejherowo – Gdańsk Śródmieście', from: 'R2', to: 'S2', arr: tW, dep: depW, track: '502', stop: true, length: 130, dwell: 50 },
        ];
      }),
    { nr: 55100, kind: 'os', name: 'Regio Gdańsk Gł. – Słupsk', from: 'G1', to: 'C1', arr: '06:12', dep: '06:14', track: '6', stop: true, length: 160, vmax: 120, dwell: 90 },
    { nr: 5100, kind: 'os', name: 'IC „Kaszub” Kraków Gł. – Gdynia Gł.', from: 'G1', to: null, arr: '06:25', track: '4', stop: true, terminates: true, length: 260, dwell: 60 },
    { nr: 55201, kind: 'os', name: 'Regio Słupsk – Gdańsk Gł.', from: 'C2', to: 'G2', arr: '06:32', dep: '06:34', track: '7', stop: true, length: 160, vmax: 120, dwell: 90 },
    { nr: 59310, kind: 'os', name: 'Regio Kościerzyna – Gdynia Gł.', from: 'K', to: null, arr: '06:40', track: '10', stop: true, terminates: true, length: 80, vmax: 80, dwell: 60 },
    { nr: 5301, kind: 'os', name: 'TLK Hel – Warszawa Wsch.', from: 'C2', to: 'G2', arr: '06:48', dep: '06:51', track: '5', stop: true, length: 300, dwell: 120 },
    { nr: 44561, kind: 'tow', name: 'Towarowy Gdynia Port – Zajączkowo Tczewskie', from: 'C2', to: 'G2', arr: '06:57', track: '8', stop: false, length: 520, vmax: 80 },
    { nr: 44770, kind: 'tow', name: 'Towarowy Gdynia Port – Gdańsk Port Płn.', from: 'P', to: 'G2', arr: '07:06', track: '1', stop: false, length: 400, vmax: 70 },
    { nr: 55102, kind: 'os', name: 'Regio Gdańsk Gł. – Lębork', from: 'G1', to: 'C1', arr: '07:12', dep: '07:14', track: '6', stop: true, length: 160, vmax: 120, dwell: 90 },
    { nr: 59311, kind: 'os', name: 'Regio Gdynia Gł. – Kościerzyna', unit: 59310, from: null, to: 'K', dep: '07:25', track: '10', stop: false, length: 80, vmax: 80 },
    { nr: 55203, kind: 'os', name: 'Regio Lębork – Gdańsk Gł.', from: 'C2', to: 'G2', arr: '07:32', dep: '07:34', track: '7', stop: true, length: 160, vmax: 120, dwell: 90 },
    { nr: 5101, kind: 'os', name: 'IC „Kaszub” Gdynia Gł. – Kraków Gł.', unit: 5100, from: null, to: 'G2', dep: '07:40', track: '4', stop: false, length: 260 },
    { nr: 44560, kind: 'tow', name: 'Towarowy Zajączkowo Tczewskie – Gdynia Port', from: 'G1', to: 'C1', arr: '07:45', track: '8', stop: false, length: 520, vmax: 80 },
    { nr: 5310, kind: 'os', name: 'IC Gdańsk Gł. – Słupsk', from: 'G1', to: 'C1', arr: '07:58', dep: '08:00', track: '6', stop: true, length: 300, dwell: 90 },
  ],

  tasks: [],

  scenarios: [
    { id: 'zmiana', name: 'Pełna zmiana (05:55–08:15)', description: 'SKM co 15 min w obu kierunkach, pociągi regionalne i IC, dwa składy kończące bieg i wracające, towarowe przelotem i z Portu.', endTime: '08:20' },
    { id: 'szczyt', name: 'Szczyt z zakłóceniami', description: 'Pełny rozkład, duże zakłócenia: opóźnienia, usterki, pociąg nadzwyczajny.', endTime: '08:30', disruptions: 'high' },
    { id: 'awaria-glowicy', name: 'Awaria w głowicy zachodniej', description: 'Semafor A1 bez sygnału i fałszywa zajętość rozjazdu 26 w porze przyjazdów od Gdańska.', endTime: '08:20', faults: [{ type: 'signal-fail', target: 'A1', at: '06:20', duration: 15 }, { type: 'false-occupancy', target: 'Iz26', at: '07:05', duration: 10 }], disruptions: 'none' },
  ],
};
