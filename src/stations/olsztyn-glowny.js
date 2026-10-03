/**
 * Olsztyn Główny – węzeł linii 353 (Poznań Wsch. – Skandawa; dwutorowa: od Olsztyna Kortowa i do Łęgajn / Korsz),
 * 216 (z Działdowa przez Olsztynek; jednotorowa), 220 (do Olsztyna Gutkowa / Elbląga; jednotorowa) i 219 (do Ełku przez
 * Szczytno; jednotorowa, niezelektryfikowana). Układ wg planu schematycznego stacji (Semaforek, „Olsztyn_Glowny2026”,
 * stan po modernizacji 2022–2024), komputerowa nastawnia „Ol” (LCS). Odwzorowanie schematyczne – jak Tczew.
 *
 * Siatka 142×36. Zachód (Olsztyn Gutkowo, Olsztyn Kortowo) po lewej, wschód (Łęgajny, Marcinkowo) po prawej; ruch
 * prawostronny – na zachodzie tor wjazdowy 353 pod wyjazdowym, na wschodzie nad nim. Tory (y): grupa towarowa 210 (4),
 * 212 (6), 214 (8), 216 (10); 14 (12), 12 (14), 10 (16), 8 (18), 6 (20), 4 (22), 2 (24), 1 (26), 3 (28), 5 (30), 7 (32).
 * Perony: 4 (8/6), 3 (4/2), 2 (1/3), 1 (5/7). Linie z zachodu (plan: od góry) – 220 (a) na tor 4, 353 tor wyjazdowy (b)
 * z toru 2, 353 tor wjazdowy (c) na tor 1, 216 (d) na tor 3 i (17/22) 5; tory 6–14 tylko z linii 220 (wachlarz 24–28).
 * Przystanki: Olsztyn Zachodni na odcinkach zbliżania wszystkich czterech torów (przed semaforami wjazdowymi), Olsztyn
 * Śródmieście na torach 220 i 216 między semaforami wjazdowymi a głowicą (pole `halt`).
 *
 * Semafory wg planu: wjazdowe A (220), B (353 t.2 – po torze lewym), C (353 t.1), D (216) z zachodu, Y (353 z Łęgajn),
 * X (353 t.1 – po torze lewym) i T (219 z Marcinkowa) ze wschodu; wyjazdowe F1–F14 (na zachód, przy torach
 * peronowych), H1–H8, H14 (na wschód, koniec peronów), K1, K2, K5, K6, K8 (z torów „c” na tory peronowe – wjazd
 * dwustopniowy ze wschodu), M1, M2, M5, M6, M8, M10, M12 (z torów „c” na szlak – wyjazd dwustopniowy), P210–P216
 * (grupa towarowa – tylko na wschód, do Łęgajn); tarcze Tm9, Tm11 (żeberka 6b, 5b) i Tm84 (tor odstawczy 701).
 * Blokady: samoczynna na 353 (oba kierunki), półsamoczynna Eap na 216, 220 i 219 – przyjęte (źródła nie podają).
 *
 * Uproszczenia względem planu: głowice odwzorowane rozjazdami z planu (zachód: 1–28, 101/102; wschód: 41–55, 64, 65,
 * 73, 81, 85, 89/91, 92) – rozjazdy krzyżowe drabiny 44, 47, 49, 52, 53 jako pary zwrotnic „a”/„b” (łańcuch przejść
 * między sąsiednimi torami), wachlarz torów 6–14 i drabiny grupy towarowej jako drabiny; skrzyżowania 120/124 bez
 * zwrotnic (plan: rozjazdy krzyżowe 67, 71). Grupa towarowa 210–217 (8 torów) jako 4 tory 210, 212, 214, 216, wjazd
 * od zachodu z toru 14 (linia 212a/213a). Pominięto: tor 16 i tory zaplecza 500–506, tory 100–105, 14c, 80
 * (wagonownia), tory 7b/7c, 9, tory postojowe PKP Intercity poza 701, bocznice (Michelin, zespół bocznic 400),
 * tor 602, tory 218–220, dwa tory bez krawędzi peronowej w stronę Szczytna (219 jako jeden tor), tarcze manewrowe
 * głowic (poza żeberkami), semafory powtarzające, rozjazd 94/95. Szybkości na tor zwrotny z napisów na planie (`SPEEDS`).
 */
import { createLayout, track as T, run as H, signal as SIG, buffer as BUF } from '../tiles/layout.js';

const { tiles, sections, section: sec, point, diag, plain, lineExit } = createLayout();

/** Przejście między torami w wierszach `ya` → `yb` (o 2 niżej albo wyżej) na kolumnach xa, xa+1, xa+2: zwrotnice `a`, `b`. */
const cross = (xa, ya, a, b, yb) => {
  const down = yb > ya;
  point(xa, ya, a, 'W', 'E', down ? 'SE' : 'NE');
  diag(xa + 1, (ya + yb) / 2, down ? ['NW', 'SE'] : ['SW', 'NE'], a);
  point(xa + 2, yb, b, 'E', 'W', down ? 'NW' : 'SW');
};

// ---- tytuł ----
tiles.push({ x: 60, y: 0, type: 'label', text: 'OLSZTYN GŁÓWNY', size: 13, span: 20 });

// ---- szlaki zachód (x 0–7): odcinki zbliżania z peronami przystanku Olsztyn Zachodni ----
const westExit = (y, id, text, platform) => {
  lineExit({ side: 'W', y, id, text, from: 0, to: 7, length: 700 });
  Object.assign(sections[`Zb${id}`], { platform, halt: 'Olsztyn Zachodni' });
};
westExit(22, 'GU', 'Olsztyn Gutkowo 220', 'Peron III (Olsztyn Zachodni)');
westExit(24, 'KO2', 'Olsztyn Kortowo 353 t.2', 'Peron II (Olsztyn Zachodni)');
westExit(26, 'KO1', 'Olsztyn Kortowo 353 t.1', 'Peron II (Olsztyn Zachodni)');
westExit(28, 'KD', 'Olsztyn Kortowo 216', 'Peron I (Olsztyn Zachodni)');
tiles.push(SIG(7, 23, 'A', 'semafor', { x: 7, y: 22 }, 'E', { entry: true }), SIG(7, 25, 'B', 'semafor', { x: 7, y: 24 }, 'E', { entry: true }),
  SIG(7, 27, 'C', 'semafor', { x: 7, y: 26 }, 'E', { entry: true }), SIG(7, 29, 'D', 'semafor', { x: 7, y: 28 }, 'E', { entry: true }));
tiles.push({ x: 1, y: 19, type: 'label', text: 'linia 220 · linie 353 i 216 (Olsztyn Kortowo)', span: 8, size: 7 },
  { x: 1, y: 33, type: 'label', text: 'p.o. Olsztyn Zachodni', span: 5, size: 7 }, { x: 12, y: 33, type: 'label', text: 'p.o. Olsztyn Śródmieście', span: 6, size: 7 });

// ---- przejście 101/102 (353 t.2 ↔ 220) i przystanek Olsztyn Śródmieście (220, 216) ----
plain('Wa1', 8, 10, 22); plain('Wb1', 8, 8, 24, 40); cross(9, 24, 101, 102, 22);
plain('Wb2', 10, 20, 24, 400); plain('Wc1', 8, 18, 26, 500); plain('Wd1', 8, 11, 28, 160);
sec('SRa', { length: 300, kind: 'plain', platform: 'Peron II (Olsztyn Śródmieście)', halt: 'Olsztyn Śródmieście' }); tiles.push(...H(12, 17, 22, 'SRa'));
sec('SRd', { length: 300, kind: 'plain', platform: 'Peron I (Olsztyn Śródmieście)', halt: 'Olsztyn Śródmieście' }); tiles.push(...H(12, 17, 28, 'SRd'));

// ---- głowica zachodnia (x 18–50) ----
// tor a (220, y=22) → tor 4: 3 (→ b), 13, 19 (z b), 15, 20 (→ wachlarz)
plain('Wa2', 18, 21, 22); plain('Wa3', 23, 29, 22); plain('Wa4', 31, 33, 22); plain('Wa5', 35, 35, 22, 30); plain('W4', 38, 50, 22);
// tor b (353 t.2, y=24) ← tor 2: 4, 5, 6, 9, 12, 14
plain('Wb3', 22, 23, 24, 40); plain('Wb4', 26, 27, 24, 40); plain('Wb5', 29, 29, 24, 30); plain('Wb6', 31, 33, 24); plain('W2', 35, 50, 24);
// tor c (353 t.1, y=26) → tor 1: 1, 7, 8, 10, 11
plain('Wc2', 20, 20, 26, 30); plain('Wc3', 22, 26, 26); plain('Wc4', 29, 30, 26, 40); plain('W1', 32, 50, 26);
// tor d (216, y=28) → tor 3: 2, 16, 17
plain('Wd2', 18, 18, 28, 30); plain('Wd3', 20, 32, 28); plain('Wd4', 34, 36, 28); plain('W3', 38, 50, 28);
cross(19, 26, 1, 4, 24); cross(19, 28, 2, 7, 26); cross(22, 22, 3, 5, 24); cross(25, 24, 6, 8, 26);
cross(28, 24, 9, 13, 22); cross(28, 26, 10, 12, 24); cross(31, 26, 11, 16, 28); cross(34, 24, 14, 19, 22);
// 15/18 i 20/23: z toru a na linię wachlarza (y=20) – z zachodu żeberko 6b (174 m)
cross(34, 22, 15, 18, 20); cross(37, 22, 20, 23, 20);
sec('T6b', { length: 174, kind: 'siding', track: '6b' }); tiles.push(BUF(29, 20, 'E', 'T6b', 'k6b'), ...H(30, 35, 20, 'T6b'));
plain('Wf1', 37, 38, 20, 40); plain('Wf2', 40, 40, 20, 30);
// 17/22: z toru d na tor 5 – z zachodu żeberko 5b (591 m)
cross(37, 28, 17, 22, 30);
sec('T5b', { length: 591, kind: 'siding', track: '5b' }); tiles.push(BUF(25, 30, 'E', 'T5b', 'k5b'), ...H(26, 38, 30, 'T5b'));
plain('W5', 40, 50, 30);
tiles.push(SIG(35, 19, 'Tm9', 'tm', { x: 35, y: 20 }, 'E'), SIG(38, 31, 'Tm11', 'tm', { x: 38, y: 30 }, 'E'));
// wachlarz 24–28: z linii wachlarza (y=20) na tory 6 (wprost), 8, 10, 12, 14
point(41, 20, 24, 'W', 'E', 'NE'); diag(42, 19, ['SW', 'NE'], 24);
point(43, 18, 27, 'SW', 'NE', 'E'); diag(44, 17, ['SW', 'NE'], 27);
point(45, 16, 28, 'SW', 'NE', 'E'); diag(46, 15, ['SW', 'NE'], 28);
point(47, 14, 25, 'SW', 'NE', 'E'); diag(48, 13, ['SW', 'NE'], 25);
sec('W14', { length: 60, kind: 'plain' }); tiles.push(T(49, 12, ['SW', 'E'], 'W14'), T(50, 12, ['W', 'E'], 'W14'));
plain('W6', 42, 50, 20); plain('W8', 44, 50, 18); plain('W10', 46, 50, 16); plain('W12', 48, 50, 14);

// ---- tory peronowe (x 51–80): F na zachód, H na wschód ----
// tory stacyjne: [numer, x1, x2, y, długość z planu, peron, pola dodatkowe] – także tory „c” (x 98–112) niżej
const TRACKS = [
  ['14', 51, 80, 12, 256, false], ['12', 51, 112, 14, 858, false, { mainKind: 'dodatkowy' }], ['10', 51, 112, 16, 857, false, { mainKind: 'dodatkowy' }],
  ['8', 51, 80, 18, 391, 'Peron IV'], ['6', 51, 80, 20, 390, 'Peron IV'], ['4', 51, 80, 22, 550, 'Peron III'], ['2', 51, 80, 24, 502, 'Peron III'],
  ['1', 51, 80, 26, 683, 'Peron II'], ['3', 51, 80, 28, 571, 'Peron II'], ['5', 51, 80, 30, 550, 'Peron I'],
  ['8c', 98, 112, 18, 432, false], ['6c', 98, 112, 20, 367, false], ['2c', 98, 112, 24, 318, false], ['1c', 98, 112, 26, 317, false], ['5c', 98, 112, 30, 339, false],
];
for (const [nr, x1, x2, y, length, platform, extra = {}] of TRACKS) {
  sec(`T${nr}`, { length, kind: 'station', track: nr, platform, ...extra });
  tiles.push(...H(x1, x2, y, `T${nr}`));
}
sec('T7', { length: 167, kind: 'station', track: '7', platform: 'Peron I' }); tiles.push(BUF(70, 32, 'E', 'T7', 'k7'), ...H(71, 80, 32, 'T7'));
for (const nr of ['14', '12', '10', '8', '6', '4', '2', '1', '3', '5']) {
  const y = { 14: 12, 12: 14, 10: 16, 8: 18, 6: 20, 4: 22, 2: 24, 1: 26, 3: 28, 5: 30 }[nr];
  tiles.push(SIG(51, y - 1, `F${nr}`, 'semafor', { x: 51, y }, 'W', { shunting: true }));
}
for (const [nr, y] of [['14', 12], ['8', 18], ['6', 20], ['4', 22], ['2', 24], ['1', 26], ['3', 28], ['5', 30], ['7', 32]]) {
  tiles.push(SIG(80, y + 1, `H${nr}`, 'semafor', { x: 80, y }, 'E', { shunting: true }));
}
for (const [nr, y, x] of [['14', 12, 56], ['12', 14, 60], ['10', 16, 60], ['8', 18, 60], ['4', 22, 60], ['1', 26, 60], ['5', 30, 60]]) {
  tiles.push({ x, y: y - 1, type: 'label', text: `tor ${nr}`, span: 3, size: 8 });
}
for (const [nr, y] of [['6', 20], ['2', 24], ['3', 28]]) tiles.push({ x: 66, y: y + 1, type: 'label', text: `tor ${nr}`, span: 3, size: 8 });

// ---- strefa przejść za peronami (x 81–97) ----
// 41/44a, 44b/47a, 47b/49a, 49b/52a, 52b/53a – łańcuch przejść (drabina 41–53 z rozjazdami krzyżowymi w planie)
cross(81, 18, 41, '44a', 20); cross(84, 20, '44b', '47a', 22); cross(87, 22, '47b', '49a', 24); cross(90, 24, '49b', '52a', 26);
point(93, 26, '52b', 'W', 'E', 'SE'); diag(94, 27, ['NW', 'SE'], '52b'); diag(95, 28, ['NW', 'SE'], '52b'); diag(96, 29, ['NW', 'SE'], '52b');
point(97, 30, '53a', 'E', 'W', 'NW');
// 42/46 (3 → 1), 43/48 (3 → 5, prosto 3c), 45/51 (7 → 5, prosto 7b), 50/55 (4 → 2, prosto 4c)
cross(81, 28, 42, 46, 26); cross(84, 28, 43, 48, 30); cross(81, 32, 45, 51, 30); cross(90, 22, 50, 55, 24);
sec('T3c', { length: 90, kind: 'siding', track: '3c' }); tiles.push(...H(85, 86, 28, 'T3c'), BUF(87, 28, 'W', 'T3c', 'k3c'));
sec('T4c', { length: 90, kind: 'siding', track: '4c' }); tiles.push(...H(91, 92, 22, 'T4c'), BUF(93, 22, 'W', 'T4c', 'k4c'));
sec('T7b', { length: 100, kind: 'siding', track: '7b' }); tiles.push(...H(82, 83, 32, 'T7b'), BUF(84, 32, 'W', 'T7b', 'k7b'));
plain('E8a', 82, 97, 18); plain('E6a', 81, 82, 20, 40); plain('E6b', 85, 97, 20);
plain('E4a', 81, 85, 22); plain('E4b', 88, 89, 22, 40);
plain('E2a', 81, 88, 24); plain('E2b', 91, 91, 24, 30); plain('E2c', 93, 97, 24);
plain('E1a', 81, 82, 26, 40); plain('E1b', 84, 91, 26); plain('E1c', 94, 97, 26);
plain('E3a', 82, 83, 28, 40);
plain('E5a', 81, 82, 30, 40); plain('E5b', 84, 85, 30, 40); plain('E5c', 87, 96, 30);

// ---- tory „c” (x 98–112): K na zachód, M na wschód ----
for (const [nr, y] of [['8', 18], ['6', 20], ['2', 24], ['1', 26], ['5', 30]]) tiles.push(SIG(98, y - 1, `K${nr}`, 'semafor', { x: 98, y }, 'W', { shunting: true }));
for (const [nr, y] of [['12', 14], ['10', 16], ['8', 18], ['6', 20], ['2', 24], ['1', 26], ['5', 30]]) tiles.push(SIG(112, y + 1, `M${nr}`, 'semafor', { x: 112, y }, 'E', { shunting: true }));
for (const [nr, y] of [['8c', 18], ['2c', 24], ['5c', 30]]) tiles.push({ x: 102, y: y - 1, type: 'label', text: `tor ${nr}`, span: 3, size: 8 });
for (const [nr, y] of [['6c', 20], ['1c', 26]]) tiles.push({ x: 104, y: y + 1, type: 'label', text: `tor ${nr}`, span: 3, size: 8 });

// ---- grupa towarowa (y 4–10): z toru 14 od zachodu (H14), wyjazd P na wschód ----
plain('E14', 81, 81, 12, 40); sec('L14', { length: 120, kind: 'plain' }); tiles.push(T(82, 12, ['W', 'NE'], 'L14'), T(83, 11, ['SW', 'NE'], 'L14'));
point(84, 10, 201, 'SW', 'NE', 'E'); diag(85, 9, ['SW', 'NE'], 201);
point(86, 8, 202, 'SW', 'NE', 'E'); diag(87, 7, ['SW', 'NE'], 202);
point(88, 6, 203, 'SW', 'NE', 'E'); diag(89, 5, ['SW', 'NE'], 203);
sec('W210', { length: 40, kind: 'plain' }); tiles.push(T(90, 4, ['SW', 'E'], 'W210'));
for (const [nr, y, x1] of [['210', 4, 91], ['212', 6, 89], ['214', 8, 87], ['216', 10, 85]]) {
  sec(`T${nr}`, { length: 750, kind: 'station', track: nr, mainKind: 'dodatkowy' }); tiles.push(...H(x1, 105, y, `T${nr}`));
  tiles.push(SIG(105, y + 1, `P${nr}`, 'semafor', { x: 105, y }, 'E', { shunting: true }));
}
tiles.push({ x: 92, y: 3, type: 'label', text: 'grupa towarowa 210–216', span: 8, size: 8 });
// drabina wschodnia grupy → tor 6d (85)
sec('E210', { length: 40, kind: 'plain' }); tiles.push(T(106, 4, ['W', 'SE'], 'E210'));
diag(107, 5, ['NW', 'SE'], 211); point(108, 6, 211, 'SE', 'NW', 'W');
diag(109, 7, ['NW', 'SE'], 213); point(110, 8, 213, 'SE', 'NW', 'W');
diag(111, 9, ['NW', 'SE'], 215); point(112, 10, 215, 'SE', 'NW', 'W');
plain('E212', 106, 107, 6, 40); plain('E214', 106, 109, 8); plain('E216', 106, 111, 10);
sec('G1', { length: 400, kind: 'plain' });
tiles.push(...[[113, 11], [114, 12], [115, 13], [116, 14], [117, 15], [118, 16], [119, 17], [120, 18], [121, 19]].map(([x, y]) => T(x, y, ['NW', 'SE'], 'G1')));

// ---- głowica wschodnia (x 113–135) ----
// 64: tor 12 → tor 10; 65: tor 8c → 6c
sec('E12', { length: 20, kind: 'plain' }); tiles.push(T(113, 14, ['W', 'SE'], 'E12')); diag(114, 15, ['NW', 'SE'], 64); point(115, 16, 64, 'E', 'W', 'NW');
plain('E10a', 113, 114, 16, 40); sec('E10b', { length: 30, kind: 'plain' }); tiles.push(T(116, 16, ['W', 'SE'], 'E10b'));
sec('E8c', { length: 20, kind: 'plain' }); tiles.push(T(113, 18, ['W', 'SE'], 'E8c')); diag(114, 19, ['NW', 'SE'], 65); point(115, 20, 65, 'E', 'W', 'NW');
plain('E6c', 113, 114, 20, 40);
// tory 10/12 → tor 1d (73) po skosie nad 6d (skrzyżowanie 120) i torem 2d (124)
sec('D10', { length: 300, kind: 'plain' });
tiles.push(T(117, 17, ['NW', 'SE'], 'D10'), T(118, 18, ['NW', 'SE'], 'D10'), T(119, 19, ['NW', 'SE'], 'D10'),
  T(121, 21, ['NW', 'SE'], 'D10'), T(122, 22, ['NW', 'SE'], 'D10'), T(123, 23, ['NW', 'SE'], 'D10'), T(125, 25, ['NW', 'SE'], 'D10'));
sec('X120', { length: 30, kind: 'point' }); tiles.push({ x: 120, y: 20, type: 'crossing', pairs: [['W', 'E'], ['NW', 'SE']], section: 'X120' });
sec('X124', { length: 30, kind: 'point' }); tiles.push({ x: 124, y: 24, type: 'crossing', pairs: [['W', 'E'], ['NW', 'SE']], section: 'X124' });
// tor 6d: grupa towarowa (85) → tor 2d (92)
plain('E6d', 116, 119, 20); point(122, 20, 85, 'E', 'W', 'NW');
plain('E6e', 121, 121, 20, 30); plain('E6f', 123, 126, 20);
sec('D6', { length: 160, kind: 'plain' }); tiles.push(T(127, 20, ['W', 'SE'], 'D6'), T(128, 21, ['NW', 'SE'], 'D6'), T(129, 22, ['NW', 'SE'], 'D6'), T(130, 23, ['NW', 'SE'], 'D6'));
point(131, 24, 92, 'E', 'W', 'NW');
// tor 2d (353 t.2 z Łęgajn) i 1d (353 t.1 do Łęgajn); 89/91: z 2d na 1d
plain('E2d', 113, 123, 24); plain('E2e', 125, 130, 24); cross(132, 24, 89, 91, 26); plain('E2f', 133, 135, 24);
plain('E1d', 113, 122, 26); point(123, 26, 81, 'E', 'W', 'SW'); plain('E1e', 124, 125, 26, 40); point(126, 26, 73, 'E', 'W', 'NW');
plain('E1f', 127, 133, 26); plain('E1g', 135, 135, 26, 30);
// tor postojowy PKP Intercity 701 (z 1d przez 81)
diag(122, 27, ['NE', 'SW'], 81);
sec('T701', { length: 204, kind: 'siding', track: '701' }); tiles.push(BUF(114, 28, 'E', 'T701', 'k701'), ...H(115, 120, 28, 'T701'), T(121, 28, ['W', 'NE'], 'T701'));
tiles.push(SIG(121, 29, 'Tm84', 'tm', { x: 121, y: 28 }, 'E'), { x: 115, y: 29, type: 'label', text: 'tor 701 (PKP IC)', span: 4, size: 7 });
// tor 5d (219 do Marcinkowa)
plain('E5d', 113, 135, 30, 1200);

// ---- szlaki wschód (x 136–141) ----
const eastExit = (y, id, text) => lineExit({ side: 'E', y, id, text, from: 136, to: 141, length: 600 });
eastExit(24, 'LE2', 'Łęgajny 353 t.2'); eastExit(26, 'LE1', 'Łęgajny 353 t.1'); eastExit(30, 'MA', 'Marcinkowo 219');
tiles.push(SIG(136, 23, 'Y', 'semafor', { x: 136, y: 24 }, 'W', { entry: true }), SIG(136, 25, 'X', 'semafor', { x: 136, y: 26 }, 'W', { entry: true }),
  SIG(136, 29, 'T', 'semafor', { x: 136, y: 30 }, 'W', { entry: true }));
tiles.push({ x: 134, y: 21, type: 'label', text: 'linia 353 · Korsze', span: 6, size: 7 }, { x: 134, y: 32, type: 'label', text: 'linia 219 · Szczytno', span: 6, size: 7 });

// szybkości na tor zwrotny wg napisów na planie [km/h]; bez napisu (drabina 41–53, 81) – 40. Gra ma obrazy „40” (do 60 km/h)
// i największą szybkość: 50 i 60 jadą jak 40, 80 i 100 (2/7, 50/55) – bez ograniczenia. Zw24: na planie 50 (do toru 14)
// i 60 (do 25) – tu jedno ramię zwrotne do całego wachlarza, 60
const SPEEDS = {
  60: [101, 102, 1, 4, 3, 5, 6, 8, 9, 13, 10, 12, 11, 16, 14, 19, 15, 18, 20, 23, 17, 22, 24, 25, 27, 28, 42, 46, 43, 48, 45, 51, 73],
  80: [50, 55], 100: [2, 7], 50: [64, 65, 85, 89, 91, 92, 201, 202, 203, 211, 213, 215],
};

export default {
  schemaVersion: 1,
  id: 'olsztyn-glowny',
  name: 'Olsztyn Główny',
  srk: 'komputerowe',
  srkInfo: 'Komputerowa nastawnia „Ol” z LCS (po modernizacji stacji 2022–2024) – jedno stanowisko na całą stację; w rzeczywistości steruje też posterunkami na liniach 353, 216, 220 i 221.',
  description: 'Węzeł linii 353 (Iława – Korsze), 216 (z Działdowa), 220 (do Elbląga) i 219 (do Ełku przez Szczytno). Cztery perony, przystanki Olsztyn Zachodni i Olsztyn Śródmieście w obrębie stacji, grupa towarowa z wyjazdem tylko na wschód.',
  location: 'Linia 353 Poznań Wsch. – Skandawa między Olsztynem Kortowem a Łęgajnami, węzeł z liniami 216, 219 i 220; Olsztyn, woj. warmińsko-mazurskie.',
  region: 'warminsko-mazurskie', // województwo – mapa wyboru posterunku
  lines: [353, 216, 219, 220],    // linie kolejowe (jak w `location`)
  geo: [53.7857, 20.4973],        // współrzędne stacji (docs/sources/posterunki.md, „Mapa wyboru posterunku”)
  traffic: 'Regio w czterech kierunkach (do Szczytna spalinowe), IC z Warszawy przez Działdowo, TLK z Poznania do Białegostoku, towarowe z grupy do Korsz i przelotem.',
  difficulty: 5,
  startTime: '05:55',
  desk: { cols: 142, rows: 36 },

  exits: {
    GU: { name: 'Olsztyn Gutkowo', label: 'Olsztyn Gutkowo – 220', tile: { x: 0, y: 22 }, dir: 'W', lineLength: 7300, lineSpeed: 100 },
    KO2: { name: 'Olsztyn Kortowo', label: 'Olsztyn Kortowo – 353 t.2', tile: { x: 0, y: 24 }, dir: 'W', direction: 'out', block: 'sbl', lineLength: 5600, lineSpeed: 120 },
    KO1: { name: 'Olsztyn Kortowo', label: 'Olsztyn Kortowo – 353 t.1', tile: { x: 0, y: 26 }, dir: 'W', direction: 'in', block: 'sbl', lineLength: 5600, lineSpeed: 120 },
    KD: { name: 'Olsztyn Kortowo', label: 'Olsztyn Kortowo – 216', tile: { x: 0, y: 28 }, dir: 'W', lineLength: 5600, lineSpeed: 120 },
    LE2: { name: 'Łęgajny', label: 'Łęgajny – 353 t.2', tile: { x: 141, y: 24 }, dir: 'E', direction: 'in', block: 'sbl', lineLength: 8300, lineSpeed: 120 },
    LE1: { name: 'Łęgajny', label: 'Łęgajny – 353 t.1', tile: { x: 141, y: 26 }, dir: 'E', direction: 'out', block: 'sbl', lineLength: 8300, lineSpeed: 120 },
    MA: { name: 'Marcinkowo', label: 'Marcinkowo – 219', tile: { x: 141, y: 30 }, dir: 'E', lineLength: 15000, lineSpeed: 100 },
  },
  sections,
  tiles,
  // wyłączone: wyjazdy na tory szlakowe wjazdowe (353 t.1 od Kortowa, 353 t.2 od Łęgajn) i wjazdy ze wschodu przez grupę
  // towarową na tor 14 (grupa ma wyjazd tylko na wschód)
  points: Object.fromEntries(Object.entries(SPEEDS).flatMap(([v, ids]) => ids.map((n) => [`Zw${n}`, { speedDiverging: Number(v) }]))),
  routes: { disable: [
    'F14-KO1', 'F14-KO1#2', 'F14-KO1#3', 'F14-KO1#4', 'F14-KO1#5', 'F12-KO1', 'F12-KO1#2', 'F12-KO1#3', 'F12-KO1#4',
    'F12-KO1#5', 'F10-KO1', 'F10-KO1#2', 'F10-KO1#3', 'F10-KO1#4', 'F10-KO1#5', 'F8-KO1', 'F8-KO1#2', 'F8-KO1#3',
    'F8-KO1#4', 'F8-KO1#5', 'F6-KO1', 'F6-KO1#2', 'F6-KO1#3', 'F6-KO1#4', 'F6-KO1#5', 'F4-KO1', 'F4-KO1#2',
    'F4-KO1#3', 'F4-KO1#4', 'F2-KO1', 'F2-KO1#2', 'F2-KO1#3', 'F1-KO1', 'F1-KO1#2', 'F3-KO1', 'F3-KO1#2', 'F5-KO1',
    'F5-KO1#2', 'M8-LE2', 'M6-LE2', 'M2-LE2', 'P210-LE2', 'P212-LE2', 'P214-LE2', 'P216-LE2', 'Y-F14', 'Y-F14#2',
    'Y-F14#3', 'Y-F14#4', 'X-F14', 'X-F14#2', 'X-F14#3', 'X-F14#4',
  ], override: {} },

  timetable: [
    { nr: 77100, kind: 'os', name: 'Regio Działdowo – Olsztyn Gł.', from: 'KD', to: null, arr: '06:05', track: '3', stop: true, terminates: true, length: 130, vmax: 120, halts: ['Olsztyn Zachodni', 'Olsztyn Śródmieście'] },
    { nr: 77400, kind: 'os', name: 'Regio Elbląg – Olsztyn Gł.', from: 'GU', to: null, arr: '06:08', track: '4', stop: true, terminates: true, length: 130, vmax: 100, halts: ['Olsztyn Zachodni', 'Olsztyn Śródmieście'] },
    { nr: 77200, kind: 'os', name: 'Regio Iława Gł. – Olsztyn Gł.', from: 'KO1', to: null, arr: '06:12', track: '1', stop: true, terminates: true, length: 160, vmax: 120, halts: ['Olsztyn Zachodni'] },
    { nr: 77300, kind: 'os', name: 'Regio Korsze – Olsztyn Gł.', from: 'LE2', to: null, arr: '06:20', track: '6', stop: true, terminates: true, length: 130, vmax: 120 },
    { nr: 5400, kind: 'os', name: 'TLK Poznań Gł. – Białystok', from: 'KO1', to: 'LE1', arr: '06:24', dep: '06:27', track: '2', stop: true, length: 250, dwell: 90 },
    { nr: 77500, kind: 'os', name: 'Regio Ełk – Olsztyn Gł.', stock: ['SA133', 'SA136', 'SA137', 'SA138'], from: 'MA', to: null, arr: '06:38', track: '8', stop: true, terminates: true, length: 110, vmax: 100 },
    { nr: 77101, kind: 'os', name: 'Regio Olsztyn Gł. – Działdowo', unit: 77100, from: null, to: 'KD', dep: '06:40', track: '3', stop: true, length: 130, vmax: 120, halts: ['Olsztyn Zachodni', 'Olsztyn Śródmieście'] },
    { nr: 77401, kind: 'os', name: 'Regio Olsztyn Gł. – Elbląg', unit: 77400, from: null, to: 'GU', dep: '06:45', track: '4', stop: true, length: 130, vmax: 100, halts: ['Olsztyn Zachodni', 'Olsztyn Śródmieście'] },
    { nr: 77201, kind: 'os', name: 'Regio Olsztyn Gł. – Iława Gł.', unit: 77200, from: null, to: 'KO2', dep: '06:48', track: '1', stop: true, length: 160, vmax: 120, halts: ['Olsztyn Zachodni'] },
    { nr: 5300, kind: 'os', name: 'IC Warszawa Wsch. – Olsztyn Gł.', from: 'KD', to: null, arr: '06:50', track: '5', stop: true, terminates: true, length: 300 },
    { nr: 77301, kind: 'os', name: 'Regio Olsztyn Gł. – Korsze', unit: 77300, from: null, to: 'LE1', dep: '06:55', track: '6', stop: true, length: 130, vmax: 120 },
    { nr: 44600, kind: 'tow', cat: 'TM', name: 'Towarowy Iława Gł. – Korsze', from: 'KO1', to: 'LE1', arr: '07:05', track: '1', stop: false, length: 600, mass: 2400, vmax: 80 },
    { nr: 44601, kind: 'tow', cat: 'TN', name: 'Towarowy Korsze – Iława Gł.', from: 'LE2', to: 'KO2', arr: '06:58', track: '2', stop: false, length: 480, mass: 1200, vmax: 100 },
    { nr: 44602, kind: 'tow', cat: 'TD', name: 'Towarowy Olsztyn Gł. – Korsze', from: null, to: 'LE1', dep: '07:35', track: '212', stop: false, length: 700, mass: 1500, vmax: 100, startOn: { section: 'T212', dir: 'E' } },
    { nr: 77102, kind: 'os', name: 'Regio Działdowo – Olsztyn Gł.', from: 'KD', to: null, arr: '07:05', track: '3', stop: true, terminates: true, length: 130, vmax: 120, halts: ['Olsztyn Zachodni', 'Olsztyn Śródmieście'] },
    { nr: 77402, kind: 'os', name: 'Regio Braniewo – Olsztyn Gł.', from: 'GU', to: null, arr: '07:08', track: '4', stop: true, terminates: true, length: 130, vmax: 100, halts: ['Olsztyn Zachodni', 'Olsztyn Śródmieście'] },
    { nr: 77501, kind: 'os', name: 'Regio Olsztyn Gł. – Ełk', stock: ['SA133', 'SA136', 'SA137', 'SA138'], unit: 77500, from: null, to: 'MA', dep: '07:10', track: '8', stop: true, length: 110, vmax: 100 },
    { nr: 77202, kind: 'os', name: 'Regio Iława Gł. – Olsztyn Gł.', from: 'KO1', to: null, arr: '07:12', track: '1', stop: true, terminates: true, length: 160, vmax: 120, halts: ['Olsztyn Zachodni'] },
    { nr: 77302, kind: 'os', name: 'Regio Korsze – Olsztyn Gł.', from: 'LE2', to: null, arr: '07:20', track: '6', stop: true, terminates: true, length: 130, vmax: 120 },
    { nr: 5401, kind: 'os', name: 'TLK Białystok – Poznań Gł.', from: 'LE2', to: 'KO2', arr: '07:28', dep: '07:31', track: '2', stop: true, length: 250, dwell: 90 },
    { nr: 5301, kind: 'os', name: 'IC Olsztyn Gł. – Warszawa Wsch.', unit: 5300, from: null, to: 'KD', dep: '07:30', track: '5', stop: true, length: 300 },
    { nr: 44603, kind: 'tow', cat: 'TM', name: 'Towarowy Iława Gł. – Olsztyn Gł. (grupa towarowa)', from: 'KO1', to: null, arr: '07:35', track: '214', stop: true, terminates: true, length: 600, mass: 2200, vmax: 80 },
    { nr: 77502, kind: 'os', name: 'Regio Ełk – Olsztyn Gł.', stock: ['SA133', 'SA136', 'SA137', 'SA138'], from: 'MA', to: null, arr: '07:35', track: '8', stop: true, terminates: true, length: 110, vmax: 100 },
    { nr: 77103, kind: 'os', name: 'Regio Olsztyn Gł. – Działdowo', unit: 77102, from: null, to: 'KD', dep: '07:40', track: '3', stop: true, length: 130, vmax: 120, halts: ['Olsztyn Zachodni', 'Olsztyn Śródmieście'] },
    { nr: 77403, kind: 'os', name: 'Regio Olsztyn Gł. – Braniewo', unit: 77402, from: null, to: 'GU', dep: '07:45', track: '4', stop: true, length: 130, vmax: 100, halts: ['Olsztyn Zachodni', 'Olsztyn Śródmieście'] },
    { nr: 77203, kind: 'os', name: 'Regio Olsztyn Gł. – Iława Gł.', unit: 77202, from: null, to: 'KO2', dep: '07:48', track: '1', stop: true, length: 160, vmax: 120, halts: ['Olsztyn Zachodni'] },
    { nr: 77303, kind: 'os', name: 'Regio Olsztyn Gł. – Korsze', unit: 77302, from: null, to: 'LE1', dep: '07:55', track: '6', stop: true, length: 130, vmax: 120 },
    { nr: 77503, kind: 'os', name: 'Regio Olsztyn Gł. – Ełk', stock: ['SA133', 'SA136', 'SA137', 'SA138'], unit: 77502, from: null, to: 'MA', dep: '08:05', track: '8', stop: true, length: 110, vmax: 100 },
  ],
  tasks: [],
  scenarios: [
    { id: 'zmiana', name: 'Pełna zmiana (05:55–08:15)', description: 'Węzeł Olsztyn Główny: Regio w czterech kierunkach (z postojami na przystankach Olsztyn Zachodni i Śródmieście), IC z Warszawy, TLK Poznań – Białystok, towarowe przelotem i z grupy do Korsz. Poziom zakłóceń do wyboru.', endTime: '08:15' },
    { id: 'usterka-ma', name: 'Usterka blokady od Marcinkowa', description: 'Jednotorowa blokada linii 219 bez łączności przez 40 min – zapowiadanie telefoniczne.', endTime: '08:15', faults: [{ type: 'block-fail', target: 'MA', at: '06:25', duration: 40 }] },
    { id: 'szczyt', name: 'Szczyt z zakłóceniami', description: 'Pełny rozkład, duże zakłócenia.', endTime: '08:50', disruptions: 'high' },
  ],
};
