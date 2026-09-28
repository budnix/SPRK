/**
 * Gdynia Chylonia – stacja na liniach 202 (Gdańsk – Stargard) i 250 (SKM), z odgałęzieniami
 * 964 (Gdynia Postojowa) i 723 (Gdynia Port). Układ wg planu schematycznego stacji (X 2024).
 *
 * Pulpit 112×20. Rzędy torów w definicji (jak na planie): 2 – tor 502 (linia 250 t.1), 4 – tor 22, 6 – tor 21,
 * 8 – tor 501 (250 t.2), 10 – tor 503 (głowica wschodnia), 12 – tor 2 (202 t.1), 14 – tor 1 (202 t.2), 16 – tor 3 /
 * tor 51 / linia 723, 18 – linia 964 Gdynia Postojowa. Cały blok torowy jest na końcu odbijany w pionie (ruch
 * prawostronny, patrz niżej), więc na pulpicie SKM jest na dole, a tor 1 każdej pary pod torem 2.
 *
 * Uproszczenia względem planu: tor 1 wpięty w tor 2 przez rozjazd 30 (bez przejścia 30–31 na tor 501), rozjazd krzyżowy 38
 * jako dwie zwrotnice 38a/38b, pominięto semafor L502 i tarcze T21/T22 przy kozłach torów 21/22.
 */

const T = (x, y, ports, section, extra = {}) => ({ x, y, type: 'track', ports, section, ...extra });
const H = (x1, x2, y, section, extra = {}) => Array.from({ length: x2 - x1 + 1 }, (_, i) => T(x1 + i, y, ['W', 'E'], section, extra));
const P = (x, y, id, label, toe, straight, diverge, section) => ({ x, y, type: 'point', id, label, toe, straight, diverge, section });
const SIG = (x, y, id, kind, at, dir, extra = {}) => ({ x, y, type: 'signal', id, kind, at, dir, ...extra });
const BUF = (x, y, port, section, id) => ({ x, y, type: 'buffer', port, section, endButton: { id, color: 'white' } });

const tiles = [];
const sections = {};
const sec = (id, def) => { sections[id] = def; return id; };

// ---- blokady, przyciski, opisy ----
tiles.push({ x: 28, y: 0, type: 'label', text: 'GDYNIA CHYLONIA', size: 12, span: 20 });
tiles.push({ x: 2, y: 4, type: 'label', text: 'linia 250 SKM', span: 3, size: 7 }, { x: 2, y: 10, type: 'label', text: 'linia 202', span: 2, size: 7 },
  { x: 22, y: 17, type: 'label', text: 'linia 964 · Gdynia Postojowa (manewry)', span: 8, size: 7 },
  { x: 100, y: 17, type: 'label', text: 'linia 723 · Gdynia Port', span: 5, size: 7 });

// ---- tory stacyjne (x 45–70) ----
sec('T502', { length: 300, kind: 'station', track: '502', platform: 'Peron I (SKM)' }); tiles.push(...H(45, 70, 2, 'T502'));
sec('T501', { length: 300, kind: 'station', track: '501', platform: 'Peron I (SKM)' }); tiles.push(...H(45, 70, 8, 'T501'));
sec('T2', { length: 592, kind: 'station', track: '2', platform: 'Peron II' }); tiles.push(...H(45, 70, 12, 'T2'));
sec('T1', { length: 565, kind: 'station', track: '1', platform: 'Peron II' }); tiles.push(...H(45, 70, 14, 'T1'));
sec('T3', { length: 601, kind: 'station', track: '3', platform: 'Peron III' }); tiles.push(...H(45, 70, 16, 'T3'));
tiles.push({ x: 56, y: 3, type: 'label', text: 'tor 502 · Peron I', span: 4, size: 8 }, { x: 56, y: 9, type: 'label', text: 'tor 501 · Peron I', span: 4, size: 8 },
  { x: 56, y: 11, type: 'label', text: 'tor 2 · Peron II', span: 4, size: 8 }, { x: 56, y: 15, type: 'label', text: 'tor 1 · Peron II', span: 4, size: 8 },
  { x: 56, y: 17, type: 'label', text: 'tor 3 · Peron III', span: 4, size: 8 });
// semafory wyjazdowe zachód (E…) i wschód (G/F/M…)
tiles.push(SIG(44, 1, 'E502', 'semafor', { x: 45, y: 2 }, 'W', { shunting: true }), SIG(44, 9, 'E501', 'semafor', { x: 45, y: 8 }, 'W', { shunting: true }),
  SIG(44, 13, 'E2', 'semafor', { x: 45, y: 12 }, 'W', { shunting: true }), SIG(44, 15, 'E1', 'semafor', { x: 45, y: 14 }, 'W', { shunting: true }),
  SIG(44, 17, 'E3', 'semafor', { x: 45, y: 16 }, 'W', { shunting: true }));
tiles.push(SIG(71, 1, 'G502', 'semafor', { x: 70, y: 2 }, 'E', { shunting: true }), SIG(71, 9, 'F501', 'semafor', { x: 70, y: 8 }, 'E', { shunting: true }),
  SIG(71, 13, 'M2', 'semafor', { x: 70, y: 12 }, 'E', { shunting: true }), SIG(71, 15, 'M1', 'semafor', { x: 70, y: 14 }, 'E', { shunting: true }),
  SIG(71, 17, 'M3', 'semafor', { x: 70, y: 16 }, 'E', { shunting: true }));

// ---- zachód: odcinki zbliżania i semafory wjazdowe A, B, C, D ----
const westExit = (y, id, sec_, text) => {
  sec(sec_, { length: 400, kind: 'approach' });
  tiles.push({ ...T(0, y, ['W', 'E'], sec_), endButton: { id: `k${id}`, color: 'green' }, text }, ...H(1, 5, y, sec_));
};
westExit(2, 'GS1', 'ZbA', 'Gdynia Gł. 250 t.1'); westExit(8, 'GS2', 'ZbB', 'Gdynia Gł. 250 t.2');
westExit(12, 'GG1', 'ZbC', 'Gdynia Gł. 202 t.1'); westExit(14, 'GG2', 'ZbD', 'Gdynia Gł. 202 t.2');
tiles.push(SIG(5, 1, 'A', 'semafor', { x: 5, y: 2 }, 'E', { entry: true }), SIG(5, 9, 'B', 'semafor', { x: 5, y: 8 }, 'E', { entry: true }),
  SIG(5, 11, 'C', 'semafor', { x: 5, y: 12 }, 'E', { entry: true }), SIG(5, 15, 'D', 'semafor', { x: 5, y: 14 }, 'E', { entry: true }));

// ---- zachód: głowica (rozjazdy 1–16) ----
// tor 502 (linia 250 t.1)
sec('W1a', { length: 30, kind: 'plain' }); tiles.push(T(6, 2, ['W', 'E'], 'W1a'));
sec('Iz1', { length: 200, kind: 'point' }); tiles.push(P(7, 2, 'Zw1', '1', 'W', 'E', 'SE', 'Iz1'),
  T(8, 3, ['NW', 'SE'], 'Iz1'), T(9, 4, ['NW', 'SE'], 'Iz1'), T(10, 5, ['NW', 'SE'], 'Iz1'), T(11, 6, ['NW', 'SE'], 'Iz1'), T(12, 7, ['NW', 'SE'], 'Iz1'),
  P(13, 8, 'Zw2', '2', 'E', 'W', 'NW', 'Iz1'));
sec('W1b', { length: 500, kind: 'plain' }); tiles.push(...H(8, 35, 2, 'W1b'));
sec('Iz11', { length: 200, kind: 'point' }); tiles.push(P(30, 8, 'Zw11', '11', 'W', 'E', 'NE', 'Iz11'),
  T(31, 7, ['SW', 'NE'], 'Iz11'), T(32, 6, ['SW', 'NE'], 'Iz11'), T(33, 5, ['SW', 'NE'], 'Iz11'), T(34, 4, ['SW', 'NE'], 'Iz11'), T(35, 3, ['SW', 'NE'], 'Iz11'),
  P(36, 2, 'Zw12', '12', 'E', 'W', 'SW', 'Iz11'));
sec('W1c', { length: 120, kind: 'plain' }); tiles.push(...H(37, 44, 2, 'W1c'));
// tor 501 (linia 250 t.2)
sec('W2a', { length: 120, kind: 'plain' }); tiles.push(...H(6, 12, 8, 'W2a'));
sec('W2b', { length: 30, kind: 'plain' }); tiles.push(T(14, 8, ['W', 'E'], 'W2b'));
sec('Iz5', { length: 140, kind: 'point' }); tiles.push(P(15, 8, 'Zw5', '5', 'W', 'E', 'SE', 'Iz5'),
  T(16, 9, ['NW', 'SE'], 'Iz5'), T(17, 10, ['NW', 'SE'], 'Iz5'), T(18, 11, ['NW', 'SE'], 'Iz5'), P(19, 12, 'Zw6', '6', 'E', 'W', 'NW', 'Iz5'));
sec('W2c', { length: 150, kind: 'plain' }); tiles.push(...H(16, 24, 8, 'W2c'));
sec('Iz7', { length: 140, kind: 'point' }); tiles.push(P(21, 12, 'Zw7', '7', 'W', 'E', 'NE', 'Iz7'),
  T(22, 11, ['SW', 'NE'], 'Iz7'), T(23, 10, ['SW', 'NE'], 'Iz7'), T(24, 9, ['SW', 'NE'], 'Iz7'), P(25, 8, 'Zw8', '8', 'E', 'W', 'SW', 'Iz7'));
sec('W2d', { length: 80, kind: 'plain' }); tiles.push(...H(26, 29, 8, 'W2d'));
sec('W2e', { length: 250, kind: 'plain' }); tiles.push(...H(31, 44, 8, 'W2e'));
tiles.push(SIG(28, 9, 'Tm6', 'tm', { x: 28, y: 8 }, 'W'));
// tor 2 (linia 202 t.1)
sec('W3a', { length: 80, kind: 'plain' }); tiles.push(...H(6, 10, 12, 'W3a'));
sec('Iz3', { length: 80, kind: 'point' }); tiles.push(P(9, 14, 'Zw3', '3', 'W', 'E', 'NE', 'Iz3'), T(10, 13, ['SW', 'NE'], 'Iz3'), P(11, 12, 'Zw4', '4', 'E', 'W', 'SW', 'Iz3'));
sec('W3b', { length: 120, kind: 'plain' }); tiles.push(...H(12, 18, 12, 'W3b'));
sec('W3c', { length: 30, kind: 'plain' }); tiles.push(T(20, 12, ['W', 'E'], 'W3c'));
sec('W3d', { length: 90, kind: 'plain' }); tiles.push(...H(22, 26, 12, 'W3d'));
sec('Iz9', { length: 80, kind: 'point' }); tiles.push(P(27, 12, 'Zw9', '9', 'W', 'E', 'SE', 'Iz9'), T(28, 13, ['NW', 'SE'], 'Iz9'), P(29, 14, 'Zw10', '10', 'E', 'W', 'NW', 'Iz9'));
sec('W3e', { length: 280, kind: 'plain' }); tiles.push(...H(28, 44, 12, 'W3e'));
tiles.push(SIG(8, 13, 'Tm2', 'tm', { x: 8, y: 12 }, 'E'), SIG(13, 13, 'Tm3', 'tm', { x: 13, y: 12 }, 'W'));
// tor 1 (linia 202 t.2)
sec('W4a', { length: 60, kind: 'plain' }); tiles.push(...H(6, 8, 14, 'W4a'));
sec('W4b', { length: 320, kind: 'plain' }); tiles.push(...H(10, 28, 14, 'W4b'));
sec('W4c', { length: 120, kind: 'plain' }); tiles.push(...H(30, 36, 14, 'W4c'));
sec('Iz13', { length: 80, kind: 'point' }); tiles.push(P(37, 14, 'Zw13', '13', 'E', 'W', 'SW', 'Iz13'),
  T(36, 15, ['NE', 'SW'], 'Iz13'), T(35, 16, ['NE', 'SW'], 'Iz13'), T(34, 17, ['NE', 'SW'], 'Iz13'), T(33, 18, ['NE', 'W'], 'Iz13'));
sec('T964', { length: 500, kind: 'siding', track: '964' }); tiles.push(...H(21, 32, 18, 'T964'), BUF(20, 18, 'E', 'T964', 'kPOS'));
tiles.push(SIG(30, 19, 'T57m', 'tm', { x: 30, y: 18 }, 'E'), { x: 21, y: 19, type: 'label', text: 'Gdynia Postojowa', span: 4, size: 7 });
sec('W4d', { length: 40, kind: 'plain' }); tiles.push(...H(38, 39, 14, 'W4d'));
sec('Iz15', { length: 80, kind: 'point' }); tiles.push(P(40, 14, 'Zw15', '15', 'W', 'E', 'SE', 'Iz15'), T(41, 15, ['NW', 'SE'], 'Iz15'), P(42, 16, 'Zw16', '16', 'E', 'W', 'NW', 'Iz15'));
sec('W4e', { length: 60, kind: 'plain' }); tiles.push(...H(41, 44, 14, 'W4e'));
sec('T51', { length: 120, kind: 'siding', track: '51' }); tiles.push(...H(38, 41, 16, 'T51'), BUF(37, 16, 'E', 'T51', 'kT51'));
tiles.push({ x: 38, y: 17, type: 'label', text: 'tor 51', span: 2, size: 7 });
sec('W5', { length: 40, kind: 'plain' }); tiles.push(...H(43, 44, 16, 'W5'));
tiles.push(SIG(6, 15, 'Tm1', 'tm', { x: 6, y: 14 }, 'E'), SIG(31, 15, 'Tm4', 'tm', { x: 31, y: 14 }, 'W'));

// ---- wschód: tory 502/501, tory odstawcze 21/22 (rozjazdy 21–26 ze skrzyżowaniem) ----
sec('E502a', { length: 40, kind: 'plain' }); tiles.push(...H(71, 72, 2, 'E502a'));
sec('E501a', { length: 40, kind: 'plain' }); tiles.push(...H(71, 72, 8, 'E501a'));
sec('Iz21', { length: 160, kind: 'point' }); tiles.push(
  P(73, 2, 'Zw21', '21', 'W', 'E', 'SE', 'Iz21'), T(74, 3, ['NW', 'SE'], 'Iz21'), P(75, 4, 'Zw22', '22', 'NW', 'E', 'SE', 'Iz21'),
  T(76, 4, ['W', 'E'], 'Iz21'), P(77, 4, 'Zw26', '26', 'E', 'W', 'SW', 'Iz21'),
  P(73, 8, 'Zw24', '24', 'W', 'E', 'NE', 'Iz21'), T(74, 7, ['SW', 'NE'], 'Iz21'), P(75, 6, 'Zw25', '25', 'SW', 'E', 'NE', 'Iz21'),
  T(76, 6, ['W', 'E'], 'Iz21'), P(77, 6, 'Zw23', '23', 'E', 'W', 'NW', 'Iz21'),
  { x: 76, y: 5, type: 'crossing', pairs: [['NW', 'SE'], ['SW', 'NE']], section: 'Iz21' });
sec('T22', { length: 160, kind: 'siding', track: '22' }); tiles.push(...H(78, 80, 4, 'T22'), BUF(81, 4, 'W', 'T22', 'kT22'));
sec('T21', { length: 160, kind: 'siding', track: '21' }); tiles.push(...H(78, 80, 6, 'T21'), BUF(81, 6, 'W', 'T21', 'kT21'));
tiles.push(SIG(78, 3, 'Tm22', 'tm', { x: 78, y: 4 }, 'W'), SIG(78, 7, 'Tm21', 'tm', { x: 78, y: 6 }, 'W'),
  { x: 79, y: 3, type: 'label', text: 'tor 22', span: 2, size: 7 }, { x: 79, y: 7, type: 'label', text: 'tor 21', span: 2, size: 7 });
sec('E502b', { length: 220, kind: 'plain' }); tiles.push(...H(74, 85, 2, 'E502b'));
sec('E501b', { length: 120, kind: 'plain' }); tiles.push(...H(74, 79, 8, 'E501b'));
sec('Iz31', { length: 200, kind: 'point' }); tiles.push(P(80, 8, 'Zw31', '31', 'W', 'E', 'NE', 'Iz31'),
  T(81, 7, ['SW', 'NE'], 'Iz31'), T(82, 6, ['SW', 'NE'], 'Iz31'), T(83, 5, ['SW', 'NE'], 'Iz31'), T(84, 4, ['SW', 'NE'], 'Iz31'), T(85, 3, ['SW', 'NE'], 'Iz31'),
  P(86, 2, 'Zw32', '32', 'E', 'W', 'SW', 'Iz31'));
sec('E502c', { length: 30, kind: 'plain' }); tiles.push(T(87, 2, ['W', 'E'], 'E502c'));
sec('Iz33', { length: 200, kind: 'point' }); tiles.push(P(88, 2, 'Zw33', '33', 'W', 'E', 'SE', 'Iz33'),
  T(89, 3, ['NW', 'SE'], 'Iz33'), T(90, 4, ['NW', 'SE'], 'Iz33'), T(91, 5, ['NW', 'SE'], 'Iz33'), T(92, 6, ['NW', 'SE'], 'Iz33'), T(93, 7, ['NW', 'SE'], 'Iz33'),
  P(94, 8, 'Zw34', '34', 'E', 'W', 'NW', 'Iz33'));
sec('E502d', { length: 200, kind: 'plain' }); tiles.push(...H(89, 100, 2, 'E502d'));
tiles.push(SIG(100, 1, 'A502', 'semafor', { x: 100, y: 2 }, 'E'));
sec('E501c', { length: 220, kind: 'plain' }); tiles.push(...H(81, 93, 8, 'E501c'));
sec('E501d', { length: 30, kind: 'plain' }); tiles.push(T(95, 8, ['W', 'E'], 'E501d'));
sec('Iz41', { length: 80, kind: 'point' }); tiles.push(P(96, 8, 'Zw41', '41', 'W', 'E', 'SE', 'Iz41'), T(97, 9, ['NW', 'SE'], 'Iz41'), P(98, 10, 'Zw42', '42', 'E', 'W', 'NW', 'Iz41'));
sec('E501e', { length: 80, kind: 'plain' }); tiles.push(...H(97, 100, 8, 'E501e'));
tiles.push(SIG(100, 9, 'A501', 'semafor', { x: 100, y: 8 }, 'E'));
// tor 503 (od kozła przez rozjazd 39 do 42 i semafora A503)
sec('T503', { length: 100, kind: 'siding', track: '503' }); tiles.push(BUF(87, 10, 'E', 'T503', 'kT503'), ...H(88, 91, 10, 'T503'));
// rozjazd krzyżowy 38 (ciąg 37 → 38 → 39) odwzorowany jako zwrotnice 38a (skrzyżowanie 35/36 z 37) i 38b (odgałęzienie na tor 503)
sec('Iz38', { length: 80, kind: 'point' }); tiles.push(P(90, 12, 'Zw38b', '38b', 'W', 'E', 'NE', 'Iz38'), T(91, 11, ['SW', 'NE'], 'Iz38'), P(92, 10, 'Zw39', '39', 'E', 'W', 'SW', 'Iz38'));
sec('E503a', { length: 100, kind: 'plain' }); tiles.push(...H(93, 97, 10, 'E503a'));
sec('E503b', { length: 40, kind: 'plain' }); tiles.push(...H(99, 100, 10, 'E503b'));
tiles.push(SIG(93, 11, 'Tm32', 'tm', { x: 93, y: 10 }, 'W'), SIG(100, 11, 'A503', 'semafor', { x: 100, y: 10 }, 'E'),
  { x: 84, y: 11, type: 'label', text: 'tor 503', span: 2, size: 7 });
// tory 2, 1, 3 → głowica wschodnia (30, 35/36, 38/39) i linia 723
sec('E2a', { length: 80, kind: 'plain' }); tiles.push(...H(71, 74, 12, 'E2a'));
sec('E1a', { length: 40, kind: 'plain' }); tiles.push(...H(71, 72, 14, 'E1a'));
sec('Iz30', { length: 90, kind: 'point' }); tiles.push(P(75, 12, 'Zw30', '30', 'E', 'W', 'SW', 'Iz30'), T(74, 13, ['NE', 'SW'], 'Iz30'), T(73, 14, ['NE', 'W'], 'Iz30'));
sec('E2b', { length: 180, kind: 'plain' }); tiles.push(...H(76, 85, 12, 'E2b'));
sec('E3a', { length: 120, kind: 'plain' }); tiles.push(...H(71, 73, 16, 'E3a'), T(74, 16, ['W', 'NE'], 'E3a'), T(75, 15, ['SW', 'NE'], 'E3a'), T(76, 14, ['SW', 'E'], 'E3a'));
sec('E1b', { length: 180, kind: 'plain' }); tiles.push(...H(77, 85, 14, 'E1b'));
sec('Iz35', { length: 100, kind: 'point' }); tiles.push(P(86, 12, 'Zw35', '35', 'W', 'E', 'SE', 'Iz35'), P(86, 14, 'Zw37', '37', 'W', 'E', 'NE', 'Iz35'),
  { x: 87, y: 13, type: 'crossing', pairs: [['NW', 'SE'], ['SW', 'NE']], section: 'Iz35' }, T(87, 12, ['W', 'E'], 'Iz35'), T(87, 14, ['W', 'E'], 'Iz35'),
  P(88, 12, 'Zw38a', '38a', 'E', 'W', 'SW', 'Iz35'), P(88, 14, 'Zw36', '36', 'E', 'W', 'NW', 'Iz35'));
sec('E2c', { length: 30, kind: 'plain' }); tiles.push(T(89, 12, ['W', 'E'], 'E2c'));
sec('E2d', { length: 200, kind: 'plain' }); tiles.push(...H(91, 100, 12, 'E2d'));
sec('E1c', { length: 300, kind: 'plain' }); tiles.push(...H(89, 104, 14, 'E1c'), T(105, 14, ['W', 'SE'], 'E1c'), T(106, 15, ['NW', 'SE'], 'E1c'), T(107, 16, ['NW', 'E'], 'E1c'));
tiles.push(SIG(84, 13, 'Tm26', 'tm', { x: 84, y: 12 }, 'E'), SIG(84, 15, 'Tm27', 'tm', { x: 84, y: 14 }, 'E'), SIG(90, 15, 'Tm31', 'tm', { x: 90, y: 14 }, 'W'));

// ---- wschód: odcinki zbliżania i semafory wjazdowe U, T, S, R, P ----
const eastExit = (y, id, sec_, text, x0 = 101) => {
  sec(sec_, { length: 400, kind: 'approach' });
  tiles.push(...H(x0, 110, y, sec_), { ...T(111, y, ['W', 'E'], sec_), endButton: { id: `k${id}`, color: 'green' }, text });
};
eastExit(2, 'RS1', 'ZbU', 'Cisowa 250 t.1'); eastExit(8, 'RS2', 'ZbT', 'Cisowa 250 t.2');
eastExit(10, 'RG1', 'ZbS', 'Rumia 202 t.1'); eastExit(12, 'RG2', 'ZbR', 'Rumia 202 t.2'); eastExit(16, 'PORT', 'ZbP', 'Gdynia Port', 108);
tiles.push(SIG(101, 1, 'U', 'semafor', { x: 101, y: 2 }, 'W', { entry: true }), SIG(101, 9, 'T', 'semafor', { x: 101, y: 8 }, 'W', { entry: true }),
  SIG(101, 11, 'S', 'semafor', { x: 101, y: 10 }, 'W', { entry: true }), SIG(101, 13, 'R', 'semafor', { x: 101, y: 12 }, 'W', { entry: true }),
  SIG(108, 17, 'P', 'semafor', { x: 108, y: 16 }, 'W', { entry: true }));

// ---- rozkład jazdy ----
const skm = (t, nrE, nrW) => {
  const [h, m] = t.split(':').map(Number);
  const f = (mm) => `${String(h + Math.floor(mm / 60)).padStart(2, '0')}:${String(mm % 60).padStart(2, '0')}`;
  return [
    { nr: nrE, kind: 'os', name: 'SKM Gdańsk Śródmieście – Wejherowo', from: 'GS1', to: 'RS1', arr: t, dep: f(m + 1), track: '502', stop: true, length: 130, dwell: 30 },
    { nr: nrW, kind: 'os', name: 'SKM Wejherowo – Gdańsk Śródmieście', from: 'RS2', to: 'GS2', arr: f(m + 7), dep: f(m + 8), track: '501', stop: true, length: 130, dwell: 30 },
  ];
};

// ---- ruch prawostronny: odbicie całego bloku torowego w pionie ----
// Plan schematyczny Chylonii jest rysowany od strony przeciwnej niż plany Sopotu, Orłowa i Gdyni Gł. (SKM u góry,
// tor 1 każdej pary u góry). Żeby wzdłuż linii obraz był ten sam – Gdańsk/Gdynia Gł. po lewej, SKM (po wschodniej
// stronie linii 202) na dole, tor 1 (jazda w prawo) na dole pary jak w ruchu prawostronnym oglądanym od zachodu –
// cały blok torowy (rzędy 1–19) jest odbijany: y → 20 − y, porty N↔S. Tytuł (rząd 0) i przyciski (rząd 1) zostają.
// Po odbiciu: 2 – linia 964, 4 – tor 3 / 51 / linia 723, 6 – tor 1 (202 t.2), 8 – tor 2 (202 t.1), 10 – tor 503,
// 12 – tor 501 (250 t.2), 14 – tor 21, 16 – tor 22, 18 – tor 502 (250 t.1).
const FLIP = { N: 'S', S: 'N', NE: 'SE', SE: 'NE', NW: 'SW', SW: 'NW', E: 'E', W: 'W' };
for (const t of tiles) {
  if (t.y < 1 || t.y > 19 || t.type === 'button') continue;
  t.y = 20 - t.y;
  if (t.ports) t.ports = t.ports.map((p) => FLIP[p]);
  if (t.pairs) t.pairs = t.pairs.map((pr) => pr.map((p) => FLIP[p]));
  if (t.type === 'point') { t.toe = FLIP[t.toe]; t.straight = FLIP[t.straight]; t.diverge = FLIP[t.diverge]; }
  if (t.at) t.at = { ...t.at, y: 20 - t.at.y };
}

export default {
  schemaVersion: 1,
  id: 'gdynia-chylonia',
  name: 'Gdynia Chylonia',
  srk: 'komputerowe',
  srkInfo: 'Komputerowe: tory linii 202 zmodernizowane w ramach E65 (2012–2014, obszar LCS Gdynia, Ebilock 950), tory SKM 501/502 – komputery sterujące włączone do systemu zdalnego sterowania i kierowania dyspozytorskiego (ZSiKD) Gdynia Główna SKM (nastawnia „GCh-SKM”). Typ urządzeń dla „Chy” po modernizacji Chylonia–Słupsk (2023–2025) nieustalony.',
  description: 'Stacja węzłowa na liniach 202 Gdańsk – Stargard i 250 SKM, z odgałęzieniami do Gdyni Postojowej (964) i Gdyni Portu (723). Perony I (SKM 502/501), 2 (tory 2/1) i 3, tory odstawcze 21/22, tor 503, bocznica 51. Numeracja rozjazdów i semaforów z planu stacji (2024).',
  location: 'Węzeł linii 202 i 250 na północ od Gdyni Głównej, odgałęzienia do Gdyni Postojowej (964) i Gdyni Portu (723).',
  traffic: 'SKM, regionalne, dalekobieżne, towarowe do portu i na Postojową; dużo zwrotnic i przejść między torami.',
  difficulty: 4,
  startTime: '05:55',
  desk: { cols: 112, rows: 20 },

  exits: {
    GS1: { name: 'Gdynia Główna', label: 'Gdynia Gł. – 250 t.1', tile: { x: 0, y: 18 }, dir: 'W', direction: 'in', block: 'sbl', lineLength: 2600, lineSpeed: 100 },
    GS2: { name: 'Gdynia Główna', label: 'Gdynia Gł. – 250 t.2', tile: { x: 0, y: 12 }, dir: 'W', direction: 'out', block: 'sbl', lineLength: 2600, lineSpeed: 100 },
    GG1: { name: 'Gdynia Główna', label: 'Gdynia Gł. – 202 t.1', tile: { x: 0, y: 8 }, dir: 'W', direction: 'in', block: 'sbl', lineLength: 2800, lineSpeed: 120 },
    GG2: { name: 'Gdynia Główna', label: 'Gdynia Gł. – 202 t.2', tile: { x: 0, y: 6 }, dir: 'W', direction: 'out', block: 'sbl', lineLength: 2800, lineSpeed: 120 },
    RS1: { name: 'Gdynia Cisowa', label: 'Gdynia Cisowa – 250 t.1', tile: { x: 111, y: 18 }, dir: 'E', direction: 'out', block: 'sbl', lineLength: 2900, lineSpeed: 100 },
    RS2: { name: 'Gdynia Cisowa', label: 'Gdynia Cisowa – 250 t.2', tile: { x: 111, y: 12 }, dir: 'E', direction: 'in', block: 'sbl', lineLength: 2900, lineSpeed: 100 },
    RG1: { name: 'Rumia', label: 'Rumia – 202 t.1', tile: { x: 111, y: 10 }, dir: 'E', direction: 'out', block: 'sbl', lineLength: 5200, lineSpeed: 120 },
    RG2: { name: 'Rumia', label: 'Rumia – 202 t.2', tile: { x: 111, y: 8 }, dir: 'E', direction: 'in', block: 'sbl', lineLength: 5200, lineSpeed: 120 },
    PORT: { name: 'Gdynia Port', label: 'Gdynia Port – 723', tile: { x: 111, y: 4 }, dir: 'E', lineLength: 3200, lineSpeed: 40 },
  },
  sections,
  tiles,
  routes: { disable: [], override: {} },

  timetable: [
    ...skm('06:02', 93101, 93102), ...skm('06:17', 93103, 93104), ...skm('06:32', 93105, 93106), ...skm('06:47', 93107, 93108),
    ...skm('07:02', 93109, 93110), ...skm('07:17', 93111, 93112), ...skm('07:32', 93113, 93114), ...skm('07:47', 93115, 93116),
    { nr: 55100, kind: 'os', name: 'Regio Gdańsk Gł. – Słupsk', from: 'GG1', to: 'RG1', arr: '06:10', dep: '06:11', track: '2', stop: true, length: 160, vmax: 120, dwell: 40 },
    { nr: 55201, kind: 'os', name: 'Regio Słupsk – Gdańsk Gł.', from: 'RG2', to: 'GG2', arr: '06:24', dep: '06:25', track: '1', stop: true, length: 160, vmax: 120, dwell: 40 },
    { nr: 44560, kind: 'tow', name: 'Towarowy Gdynia Port – Gdańsk Port Płn.', from: 'PORT', to: 'GG2', arr: '06:36', track: '3', stop: false, length: 480, vmax: 60 },
    { nr: 55102, kind: 'os', name: 'Regio Gdańsk Gł. – Lębork', from: 'GG1', to: 'RG1', arr: '06:40', dep: '06:41', track: '2', stop: true, length: 160, vmax: 120, dwell: 40 },
    { nr: 5100, kind: 'os', name: 'IC Warszawa Wsch. – Słupsk', from: 'GG1', to: 'RG1', arr: '06:50', track: '2', stop: false, length: 260 },
    { nr: 93151, kind: 'os', name: 'SKM Gdańsk Śródmieście – Gdynia Chylonia (kończy bieg)', from: 'RS2', to: null, arr: '06:55', track: '501', stop: true, terminates: true, length: 130, dwell: 30 },
    { nr: 55203, kind: 'os', name: 'Regio Lębork – Gdańsk Gł.', from: 'RG2', to: 'GG2', arr: '06:58', dep: '06:59', track: '1', stop: true, length: 160, vmax: 120, dwell: 40 },
    { nr: 44561, kind: 'tow', name: 'Towarowy Gdańsk Port Płn. – Gdynia Port', from: 'GG1', to: 'PORT', arr: '07:08', track: '3', stop: false, length: 520, vmax: 60 },
    { nr: 55104, kind: 'os', name: 'Regio Gdańsk Gł. – Słupsk', from: 'GG1', to: 'RG1', arr: '07:10', dep: '07:11', track: '2', stop: true, length: 160, vmax: 120, dwell: 40 },
    { nr: 93202, kind: 'os', name: 'SKM Gdynia Chylonia – Gdańsk Śródmieście', unit: 93151, from: null, to: 'GS2', dep: '07:20', track: '501', stop: false, length: 130 },
    { nr: 5301, kind: 'os', name: 'TLK Hel – Warszawa Wsch.', from: 'RG2', to: 'GG2', arr: '07:20', track: '1', stop: false, length: 300 },
    { nr: 55205, kind: 'os', name: 'Regio Słupsk – Gdańsk Gł.', from: 'RG2', to: 'GG2', arr: '07:26', dep: '07:27', track: '1', stop: true, length: 160, vmax: 120, dwell: 40 },
    { nr: 55152, kind: 'os', name: 'Regio Lębork – Gdynia Chylonia (kończy bieg)', from: 'RG2', to: null, arr: '07:36', track: '1', stop: true, terminates: true, length: 160, vmax: 120, dwell: 40 },
    { nr: 55106, kind: 'os', name: 'Regio Gdańsk Gł. – Lębork', from: 'GG1', to: 'RG1', arr: '07:40', dep: '07:41', track: '2', stop: true, length: 160, vmax: 120, dwell: 40 },
    { nr: 55207, kind: 'os', name: 'Regio Lębork – Gdańsk Gł.', from: 'RG2', to: 'GG2', arr: '07:56', dep: '07:57', track: '1', stop: true, length: 160, vmax: 120, dwell: 40 },
  ],

  tasks: [
    { id: 'odstaw-93151', unit: 93151, type: 'move', toTrack: '22', deadline: '07:15', text: 'Skład SKM 93151 odstawić z toru 501 na tor 22.' },
    { id: 'podstaw-93202', unit: 93151, type: 'move', toTrack: '501', after: '07:11', deadline: '07:18', text: 'Skład z toru 22 podstawić na tor 501 jako pociąg 93202 do Gdańska (odjazd 07:20, przed SKM 93112 o 07:24).' },
    { id: 'postojowa-55152', unit: 55152, type: 'move', toTrack: '964', deadline: '08:05', text: 'Skład Regio 55152 odstawić z toru 1 do Gdyni Postojowej (linia 964).' },
  ],

  scenarios: [
    { id: 'zmiana', name: 'Pełna zmiana (05:55–08:15)', description: 'SKM co 15 min, regionalne z postojem, IC/TLK przelotem, towarowe z Portu i do Portu, odstawianie składów na tor 22 i do Postojowej.', endTime: '08:15' },
    { id: 'usterka-rg2', name: 'Usterka blokady od Rumi', description: 'Blokada toru 2 linii 202 od Rumi bez łączności przez 40 min – zapowiadanie telefoniczne.', endTime: '08:15', faults: [{ type: 'block-fail', target: 'RG2', at: '06:45', duration: 40 }], disruptions: 'none' },
    { id: 'tor-1-zamkniety', name: 'Tor 1 zamknięty', description: 'Tor 1 zamknięty do naprawy – pociągi z Rumi torem 2 lub 3.', endTime: '08:15', closedSections: [{ section: 'T1', from: '05:55', to: '08:15' }], disruptions: 'low' },
    { id: 'szczyt', name: 'Szczyt z zakłóceniami', description: 'Pełny rozkład, duże zakłócenia.', endTime: '08:25', disruptions: 'high' },
  ],
};
