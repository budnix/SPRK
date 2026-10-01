/**
 * Rumia – stacja na linii 202 (Gdańsk – Stargard) z końcem linii 250 (SKM) i dojściem linii 228 (Gdynia Port Oksywie).
 * Układ wg planu schematycznego stacji (stan I 2020, rys. A. Karwat). Dwie nastawnie: „Rm” (głowica zachodnia,
 * dysponująca) i „Rm1” (wschodnia) – w symulatorze jedno stanowisko na całą stację.
 *
 * Pulpit 96×16. Rzędy: 2 – tor 8 (plac ładunkowy), 4 – tor 6, 6 – tor 4, 8 – tor 2 (202 t.2, peron 2), 10 – tor 1
 * (202 t.1, peron 2), 12 – tor 3 (250 t.2), 14 – tor 5 (250 t.1, peron 1). Ruch prawostronny jak w Chyloni:
 * Gdynia po lewej, SKM na dole, tor „w prawo” (wjazdowy od Gdyni) pod torem „w lewo”.
 *
 * Semafory wg planu: wjazdowe od Gdyni A (202 t.1) i A2 (250 t.1) oraz od Redy R (202 t.2); wyjazdowe na zachód
 * stoją dwustopniowo – z torów C (5), D (3), E (2), F (6) na głowicę, a na torach szlakowych za rozjazdami G311
 * (250 t.2) i D312 (202 t.2); wyjazdowe na wschód K (2), M (1), N (3), O (5). Tarcze Tm5 (tor 4) i Tm6 (tor 6),
 * wykolejnica Wk1 na torze 6.
 *
 * Uproszczenia względem planu: tory szlakowe jednokierunkowe (pominięto semafory B, B1, G312, P dla jazdy po torze
 * lewym i linię 228 z Oksywia); rozjazd dwustronny 1/2 jako para 1–1a, połączenie 7→3 jako 7–7a, przejście z toru 5
 * na 3 (rozjazd 8) jako 8a–8b; rozjazdy 29/30 na końcu torów 6/4 jako łuki do rozjazdu 31; bocznice 14 i 16 pominięte,
 * tor 13 jako żeberko za rozjazdem 34; tarcza L pominięta.
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
tiles.push({ x: 40, y: 0, type: 'label', text: 'RUMIA', size: 12, span: 16 });
tiles.push({ x: 1, y: 7, type: 'label', text: 'linia 202', span: 2, size: 7 }, { x: 2, y: 13, type: 'label', text: 'linia 250 SKM', span: 3, size: 7 },
  { x: 85, y: 11, type: 'label', text: 'linia 202 · Reda', span: 4, size: 7 }, { x: 38, y: 1, type: 'label', text: 'tor 8 · plac ładunkowy', span: 5, size: 7 });

// ---- zachód: tory szlakowe (x 0–5), semafory wjazdowe A, A2 i wyjazdowe na szlaku D312, G311 ----
const westExit = (y, id, sec_, text) => {
  sec(sec_, { length: 400, kind: 'approach' });
  tiles.push({ ...T(0, y, ['W', 'E'], sec_), endButton: { id: `k${id}`, color: 'green' }, text }, ...H(1, 5, y, sec_));
};
westExit(8, 'GC2', 'ZbGC2', 'Chylonia 202 t.2'); westExit(10, 'GC1', 'ZbGC1', 'Chylonia 202 t.1');
westExit(12, 'GS2', 'ZbGS2', 'Cisowa 250 t.2'); westExit(14, 'GS1', 'ZbGS1', 'Cisowa 250 t.1');
tiles.push(SIG(5, 9, 'A', 'semafor', { x: 5, y: 10 }, 'E', { entry: true }), SIG(5, 15, 'A2', 'semafor', { x: 5, y: 14 }, 'E', { entry: true }));
tiles.push(SIG(6, 7, 'D312', 'semafor', { x: 6, y: 8 }, 'W'), SIG(6, 11, 'G311', 'semafor', { x: 6, y: 12 }, 'W'));

// ---- zachód: głowica ----
// tor 2 (202 t.2): W2a – rozjazd 1 (z toru 1 przez 1a) – W2b – rozjazd 6 (z toru 4) – E – tor 2
sec('W2a', { length: 200, kind: 'plain' }); tiles.push(...H(6, 15, 8, 'W2a'));
sec('Iz1', { length: 90, kind: 'point' }); tiles.push(P(16, 8, 'Zw1', '1', 'W', 'E', 'SE', 'Iz1'), T(17, 9, ['NW', 'SE'], 'Iz1'), P(18, 10, 'Zw1a', '1a', 'E', 'W', 'NW', 'Iz1'));
sec('W2b', { length: 100, kind: 'plain' }); tiles.push(...H(17, 21, 8, 'W2b'));
sec('Iz6', { length: 90, kind: 'point' }); tiles.push(P(22, 8, 'Zw6', '6', 'W', 'E', 'NW', 'Iz6'), T(21, 7, ['NW', 'SE'], 'Iz6'), T(20, 6, ['SE', 'E'], 'Iz6'));
sec('W2c', { length: 30, kind: 'plain' }); tiles.push(T(23, 8, ['W', 'E'], 'W2c'));
// tor 1 (202 t.1): W1a – przejścia 2/3/4/5 (skrzyżowanie) – W1b – rozjazd 1a – W1c – tor 1
sec('W1a', { length: 120, kind: 'plain' }); tiles.push(...H(6, 11, 10, 'W1a'));
sec('Iz2', { length: 110, kind: 'point' }); tiles.push(P(12, 10, 'Zw2', '2', 'W', 'E', 'SE', 'Iz2'), T(13, 10, ['W', 'E'], 'Iz2'), P(14, 10, 'Zw4', '4', 'E', 'W', 'SW', 'Iz2'),
  P(12, 12, 'Zw3', '3', 'W', 'E', 'NE', 'Iz2'), T(13, 12, ['W', 'E'], 'Iz2'), P(14, 12, 'Zw5', '5', 'E', 'W', 'NW', 'Iz2'),
  { x: 13, y: 11, type: 'crossing', pairs: [['NW', 'SE'], ['SW', 'NE']], section: 'Iz2' });
sec('W1b', { length: 60, kind: 'plain' }); tiles.push(...H(15, 17, 10, 'W1b'));
sec('W1c', { length: 100, kind: 'plain' }); tiles.push(...H(19, 23, 10, 'W1c'));
// tor 3 (250 t.2): W3a – rozjazd 7a (z toru 5 przez 7) – W3b – 3/5 – W3c – rozjazd 8b (z toru 5 przez 8a) – W3d – D – tor 3
sec('W3a', { length: 80, kind: 'plain' }); tiles.push(...H(6, 9, 12, 'W3a'));
sec('Iz7', { length: 90, kind: 'point' }); tiles.push(P(10, 12, 'Zw7a', '7a', 'E', 'W', 'SW', 'Iz7'), T(9, 13, ['NE', 'SW'], 'Iz7'), P(8, 14, 'Zw7', '7', 'W', 'E', 'NE', 'Iz7'));
sec('W3b', { length: 30, kind: 'plain' }); tiles.push(T(11, 12, ['W', 'E'], 'W3b'));
sec('W3c', { length: 60, kind: 'plain' }); tiles.push(...H(15, 17, 12, 'W3c'));
sec('Iz8', { length: 90, kind: 'point' }); tiles.push(P(18, 12, 'Zw8b', '8b', 'W', 'E', 'SE', 'Iz8'), T(19, 13, ['NW', 'SE'], 'Iz8'), P(20, 14, 'Zw8a', '8a', 'E', 'W', 'NW', 'Iz8'));
sec('W3d', { length: 30, kind: 'plain' }); tiles.push(T(19, 12, ['W', 'E'], 'W3d'));
// tor 5 (250 t.1): W5a – rozjazd 7 – W5b – rozjazd 8a – W5c – C – tor 5
sec('W5a', { length: 40, kind: 'plain' }); tiles.push(...H(6, 7, 14, 'W5a'));
sec('W5b', { length: 220, kind: 'plain' }); tiles.push(...H(9, 19, 14, 'W5b'));
sec('W5c', { length: 30, kind: 'plain' }); tiles.push(T(21, 14, ['W', 'E'], 'W5c'));
// tory 4 i 6 od zachodu: Tm5 (tor 4), rozjazd 9 na tor 6, Tm6 i Wk1, semafor F
sec('W4a', { length: 60, kind: 'plain' }); tiles.push(...H(21, 22, 6, 'W4a'));
sec('Iz9', { length: 80, kind: 'point' }); tiles.push(P(23, 6, 'Zw9', '9', 'W', 'E', 'NE', 'Iz9'), T(24, 5, ['SW', 'NE'], 'Iz9'), T(25, 4, ['SW', 'E'], 'Iz9'));
sec('W6a', { length: 80, kind: 'plain' }); tiles.push(T(26, 4, ['W', 'E'], 'W6a'), { ...T(27, 4, ['W', 'E'], 'W6a'), derailer: 'Wk1' }, T(28, 4, ['W', 'E'], 'W6a'));
tiles.push(SIG(21, 5, 'Tm5', 'tm', { x: 21, y: 6 }, 'E'), SIG(26, 3, 'Tm6', 'tm', { x: 26, y: 4 }, 'E'), { x: 27, y: 5, type: 'label', text: 'Wk1', size: 8 });
tiles.push(SIG(24, 7, 'E', 'semafor', { x: 24, y: 8 }, 'W', { shunting: true }), SIG(20, 11, 'D', 'semafor', { x: 20, y: 12 }, 'W', { shunting: true }),
  SIG(22, 15, 'C', 'semafor', { x: 22, y: 14 }, 'W', { shunting: true }), SIG(29, 3, 'F', 'semafor', { x: 29, y: 4 }, 'W', { shunting: true }));

// ---- tory stacyjne ----
sec('T6', { length: 300, kind: 'station', track: '6' }); tiles.push(...H(29, 33, 4, 'T6'));
sec('Iz10', { length: 60, kind: 'point' }); tiles.push(P(34, 4, 'Zw10', '10', 'W', 'E', 'NE', 'Iz10'), T(35, 3, ['SW', 'NE'], 'Iz10'), T(36, 2, ['SW', 'E'], 'Iz10'));
sec('T6b', { length: 345, kind: 'station', track: '6' }); tiles.push(...H(35, 63, 4, 'T6b'));
sec('T8', { length: 217, kind: 'siding', track: '8' }); tiles.push(...H(37, 48, 2, 'T8'), BUF(49, 2, 'W', 'T8', 'kT8'));
sec('T4', { length: 599, kind: 'station', track: '4' }); tiles.push(...H(24, 65, 6, 'T4'));
sec('T2', { length: 645, kind: 'station', track: '2', platform: 'Peron II' }); tiles.push(...H(24, 68, 8, 'T2'));
sec('T1', { length: 768, kind: 'station', track: '1', platform: 'Peron II' }); tiles.push(...H(24, 68, 10, 'T1'));
sec('T3', { length: 776, kind: 'station', track: '3' }); tiles.push(...H(20, 68, 12, 'T3'));
sec('T5', { length: 776, kind: 'station', track: '5', platform: 'Peron I' }); tiles.push(...H(22, 68, 14, 'T5'));
tiles.push({ x: 44, y: 3, type: 'label', text: 'tor 6', span: 2, size: 8 }, { x: 44, y: 5, type: 'label', text: 'tor 4', span: 2, size: 8 },
  { x: 44, y: 7, type: 'label', text: 'tor 2 · Peron II', span: 4, size: 8 }, { x: 44, y: 11, type: 'label', text: 'tor 1 · Peron II', span: 4, size: 8 },
  { x: 44, y: 13, type: 'label', text: 'tor 3', span: 2, size: 8 }, { x: 44, y: 15, type: 'label', text: 'tor 5 · Peron I', span: 4, size: 8 });
// semafory wyjazdowe na wschód
tiles.push(SIG(68, 7, 'K', 'semafor', { x: 68, y: 8 }, 'E', { shunting: true }), SIG(68, 9, 'M', 'semafor', { x: 68, y: 10 }, 'E', { shunting: true }),
  SIG(68, 13, 'N', 'semafor', { x: 68, y: 12 }, 'E', { shunting: true }), SIG(68, 15, 'O', 'semafor', { x: 68, y: 14 }, 'E', { shunting: true }));

// ---- wschód: głowica ----
// końce torów 6 i 4 (łuki 29/30) do rozjazdu 31 na torze 2
sec('Iz30', { length: 80, kind: 'point' }); tiles.push(T(64, 4, ['W', 'SE'], 'Iz30'), T(65, 5, ['NW', 'SE'], 'Iz30'), P(66, 6, 'Zw30', '30', 'E', 'W', 'NW', 'Iz30'));
sec('E4a', { length: 30, kind: 'plain' }); tiles.push(T(67, 6, ['W', 'E'], 'E4a'));
sec('Iz31', { length: 80, kind: 'point' }); tiles.push(T(68, 6, ['W', 'SE'], 'Iz31'), T(69, 7, ['NW', 'SE'], 'Iz31'), P(70, 8, 'Zw31', '31', 'E', 'W', 'NW', 'Iz31'));
sec('E2a', { length: 30, kind: 'plain' }); tiles.push(T(69, 8, ['W', 'E'], 'E2a'));
sec('E2b', { length: 30, kind: 'plain' }); tiles.push(T(71, 8, ['W', 'E'], 'E2b'));
// przejście 32/35 (tor 2 → tor 1), 33 (tor 5 → tor 3), 34/36 (tor 3 → tor 1), 37/38 (tor 1 ↔ tor 2)
sec('Iz32', { length: 90, kind: 'point' }); tiles.push(P(72, 8, 'Zw32', '32', 'W', 'E', 'SE', 'Iz32'), T(73, 9, ['NW', 'SE'], 'Iz32'), P(74, 10, 'Zw35', '35', 'E', 'W', 'NW', 'Iz32'));
sec('E2c', { length: 180, kind: 'plain' }); tiles.push(...H(73, 81, 8, 'E2c'));
sec('E1a', { length: 100, kind: 'plain' }); tiles.push(...H(69, 73, 10, 'E1a'));
sec('E1b', { length: 60, kind: 'plain' }); tiles.push(...H(75, 77, 10, 'E1b'));
sec('E3a', { length: 100, kind: 'plain' }); tiles.push(...H(69, 73, 12, 'E3a'));
sec('E5a', { length: 60, kind: 'plain' }); tiles.push(...H(69, 71, 14, 'E5a'));
sec('Iz33', { length: 90, kind: 'point' }); tiles.push(T(72, 14, ['W', 'NE'], 'Iz33'), T(73, 13, ['NE', 'SW'], 'Iz33'), P(74, 12, 'Zw33', '33', 'E', 'W', 'SW', 'Iz33'));
sec('E3b', { length: 30, kind: 'plain' }); tiles.push(T(75, 12, ['W', 'E'], 'E3b'));
sec('Iz34', { length: 90, kind: 'point' }); tiles.push(P(76, 12, 'Zw34', '34', 'W', 'E', 'NE', 'Iz34'), T(77, 11, ['SW', 'NE'], 'Iz34'), P(78, 10, 'Zw36', '36', 'E', 'W', 'SW', 'Iz34'));
sec('T13', { length: 38, kind: 'siding', track: '13' }); tiles.push(T(77, 12, ['W', 'E'], 'T13'), BUF(78, 12, 'W', 'T13', 'kT13'));
tiles.push({ x: 78, y: 13, type: 'label', text: 'tor 13', span: 2, size: 7 });
sec('E1c', { length: 30, kind: 'plain' }); tiles.push(T(79, 10, ['W', 'E'], 'E1c'));
sec('Iz37', { length: 90, kind: 'point' }); tiles.push(P(80, 10, 'Zw37', '37', 'W', 'E', 'NE', 'Iz37'), T(81, 9, ['SW', 'NE'], 'Iz37'), P(82, 8, 'Zw38', '38', 'E', 'W', 'SW', 'Iz37'));
sec('E2d', { length: 120, kind: 'plain' }); tiles.push(...H(83, 88, 8, 'E2d'));
sec('E1d', { length: 140, kind: 'plain' }); tiles.push(...H(81, 88, 10, 'E1d'));
// ---- wschód: szlaki do Redy (Eap dwutorowa, semafor wjazdowy R) ----
const eastExit = (y, id, sec_, text) => {
  sec(sec_, { length: 500, kind: 'approach' });
  tiles.push(...H(89, 94, y, sec_), { ...T(95, y, ['W', 'E'], sec_), endButton: { id: `k${id}`, color: 'green' }, text });
};
eastExit(8, 'RD2', 'ZbRD2', 'Reda 202 t.2'); eastExit(10, 'RD1', 'ZbRD1', 'Reda 202 t.1');
tiles.push(SIG(89, 7, 'R', 'semafor', { x: 89, y: 8 }, 'W', { entry: true }));

// ---- rozkład jazdy ----
const skm = (t, nrE, nrW) => {
  const [h, m] = t.split(':').map(Number);
  const f = (mm) => `${String(h + Math.floor(mm / 60)).padStart(2, '0')}:${String(mm % 60).padStart(2, '0')}`;
  return [
    { nr: nrE, kind: 'os', name: 'SKM Gdańsk Śródmieście – Wejherowo', from: 'GS1', to: 'RD1', arr: t, dep: f(m + 1), track: '5', stop: true, length: 130, dwell: 30 },
    { nr: nrW, kind: 'os', name: 'SKM Wejherowo – Gdańsk Śródmieście', from: 'RD2', to: 'GS2', arr: f(m + 7), dep: f(m + 8), track: '5', stop: true, length: 130, dwell: 30 },
  ];
};

export default {
  schemaVersion: 1,
  id: 'rumia',
  name: 'Rumia',
  srk: 'E',
  srkInfo: 'Urządzenia przekaźnikowe typu E (stan planu: I 2020) z nastawniami „Rm” i „Rm1” – tu jedno stanowisko na całą stację; modernizacja linii 202 (od 2020) zastępuje je urządzeniami komputerowymi, dostępnymi jako druga zmiana.',
  description: 'Stacja na linii 202 Gdańsk – Stargard, koniec linii 250 SKM. peron I (tor 5, SKM), peron II (tory 2/1), tor 3 dla przelotów, tory 4/6 i plac ładunkowy (tor 8). Od Gdyni blokada samoczynna na 202 i 250, do Redy blokada półsamoczynna Eap.',
  location: 'Linia 202 Gdańsk – Stargard za Gdynią Chylonią, koniec linii 250 (SKM); powiat wejherowski, woj. pomorskie.',
  region: 'pomorskie',          // województwo – mapa wyboru posterunku
  lines: [202, 250],              // linie kolejowe (jak w `location`)
  traffic: 'SKM co 15 min w obu kierunkach na peronie 1, regionalne i dalekobieżne na peronie 2, towarowe przelotem torem 3 i do toru 6.',
  difficulty: 4,
  startTime: '05:55',
  desk: { cols: 96, rows: 16, controls: { x: 44, y: 1 } },

  exits: {
    GC2: { name: 'Gdynia Chylonia', label: 'Chylonia – 202 t.2', tile: { x: 0, y: 8 }, dir: 'W', direction: 'out', block: 'sbl', lineLength: 5200, lineSpeed: 120 },
    GC1: { name: 'Gdynia Chylonia', label: 'Chylonia – 202 t.1', tile: { x: 0, y: 10 }, dir: 'W', direction: 'in', block: 'sbl', lineLength: 5200, lineSpeed: 120 },
    GS2: { name: 'Gdynia Cisowa', label: 'Cisowa – 250 t.2', tile: { x: 0, y: 12 }, dir: 'W', direction: 'out', block: 'sbl', lineLength: 3400, lineSpeed: 100 },
    GS1: { name: 'Gdynia Cisowa', label: 'Cisowa – 250 t.1', tile: { x: 0, y: 14 }, dir: 'W', direction: 'in', block: 'sbl', lineLength: 3400, lineSpeed: 100 },
    RD2: { name: 'Reda', label: 'Reda – 202 t.2', tile: { x: 95, y: 8 }, dir: 'E', direction: 'in', lineLength: 6400, lineSpeed: 120 },
    RD1: { name: 'Reda', label: 'Reda – 202 t.1', tile: { x: 95, y: 10 }, dir: 'E', direction: 'out', lineLength: 6400, lineSpeed: 120 },
  },
  sections,
  tiles,
  // wyłączone: jazdy na tory szlakowe „pod prąd” bez semaforów (pominięte B/B1/G312/P), przejazd z Redy na zachód
  // torem 1 (bez semafora wyjazdowego na zachód) i okrężne warianty przez tor 1 / rozjazdy 37–38
  routes: { disable: ['D-GS1', 'D-GC1', 'C-GS1', 'C-GS1#2', 'C-GC1', 'K-RD2', 'K-RD2#2', 'M-RD2', 'N-RD2', 'O-RD2', 'R-GC1', 'R-G311', 'R-GS1', 'R-D312', 'R-E#2', 'R-F#2', 'A2-O#2'], override: {} },

  timetable: [
    ...skm('06:02', 93201, 93202), ...skm('06:17', 93203, 93204), ...skm('06:32', 93205, 93206), ...skm('06:47', 93207, 93208),
    ...skm('07:02', 93209, 93210), ...skm('07:17', 93211, 93212), ...skm('07:32', 93213, 93214), ...skm('07:47', 93215, 93216),
    { nr: 55100, kind: 'os', name: 'Regio Gdańsk Gł. – Słupsk', from: 'GC1', to: 'RD1', arr: '06:12', dep: '06:13', track: '1', stop: true, length: 160, vmax: 120, dwell: 40 },
    { nr: 55201, kind: 'os', name: 'Regio Słupsk – Gdańsk Gł.', from: 'RD2', to: 'GC2', arr: '06:25', dep: '06:26', track: '2', stop: true, length: 160, vmax: 120, dwell: 40 },
    { nr: 44560, kind: 'tow', cat: 'TN', name: 'Towarowy Gdynia Port – Szczecin Port Centralny', from: 'GC1', to: 'RD1', arr: '06:28', track: '3', stop: false, length: 480, mass: 1500, vmax: 60 },
    { nr: 55102, kind: 'os', name: 'Regio Gdańsk Gł. – Lębork', from: 'GC1', to: 'RD1', arr: '06:42', dep: '06:43', track: '1', stop: true, length: 160, vmax: 120, dwell: 40 },
    { nr: 5100, kind: 'os', name: 'IC Warszawa Wsch. – Słupsk', from: 'GC1', to: 'RD1', arr: '06:53', track: '1', stop: false, length: 260 },
    { nr: 55203, kind: 'os', name: 'Regio Lębork – Gdańsk Gł.', from: 'RD2', to: 'GC2', arr: '06:55', dep: '06:56', track: '2', stop: true, length: 160, vmax: 120, dwell: 40 },
    { nr: 55104, kind: 'os', name: 'Regio Gdańsk Gł. – Słupsk', from: 'GC1', to: 'RD1', arr: '07:12', dep: '07:13', track: '1', stop: true, length: 160, vmax: 120, dwell: 40 },
    { nr: 44561, kind: 'tow', cat: 'TM', name: 'Towarowy Szczecin Port Centralny – Gdańsk Port Płn.', from: 'RD2', to: 'GC2', arr: '07:15', track: '2', stop: false, length: 520, mass: 2500, vmax: 60 },
    { nr: 5301, kind: 'os', name: 'TLK Hel – Warszawa Wsch.', stock: '754', from: 'RD2', to: 'GC2', arr: '07:21', track: '2', stop: false, length: 300 },
    { nr: 55205, kind: 'os', name: 'Regio Słupsk – Gdańsk Gł.', from: 'RD2', to: 'GC2', arr: '07:25', dep: '07:26', track: '2', stop: true, length: 160, vmax: 120, dwell: 40 },
    { nr: 44570, kind: 'tow', cat: 'TK', traction: 'S', name: 'Towarowy Reda – Rumia (zdawczy, kończy bieg)', from: 'RD2', to: null, arr: '07:29', track: '6', stop: true, terminates: true, length: 220, mass: 400, vmax: 60 },
    { nr: 55106, kind: 'os', name: 'Regio Gdańsk Gł. – Lębork', from: 'GC1', to: 'RD1', arr: '07:42', dep: '07:43', track: '1', stop: true, length: 160, vmax: 120, dwell: 40 },
    { nr: 55207, kind: 'os', name: 'Regio Lębork – Gdańsk Gł.', from: 'RD2', to: 'GC2', arr: '07:55', dep: '07:56', track: '2', stop: true, length: 160, vmax: 120, dwell: 40 },
  ],

  tasks: [],

  scenarios: [
    { id: 'zmiana', name: 'Pełna zmiana – pulpit kostkowy typu E (05:55–08:15)', srk: 'E', description: 'SKM co 15 min w obu kierunkach na torze 5, regionalne na peronie II, IC/TLK przelotem, towarowe torem 3 i zdawczy na tor 6. Wyjazdy na zachód dwustopniowo (semafor toru, potem semafor na szlaku). Poziom zakłóceń do wyboru.', endTime: '08:15' },
    { id: 'zmiana-lcs', name: 'Pełna zmiana – stanowisko komputerowe (05:55–08:15)', srk: 'komputerowe', description: 'Ten sam rozkład na stanowisku komputerowym (po modernizacji linii 202): przebiegi złożone nastawiają obie części wyjazdu na zachód naraz.', endTime: '08:15' },
    { id: 'usterka-rd2', name: 'Usterka blokady od Redy', description: 'Blokada toru 2 od Redy bez łączności przez 40 min – zapowiadanie telefoniczne.', endTime: '08:15', faults: [{ type: 'block-fail', target: 'RD2', at: '06:30', duration: 40 }] },
    { id: 'szczyt', name: 'Szczyt z zakłóceniami', description: 'Pełny rozkład, duże zakłócenia.', endTime: '08:25', disruptions: 'high' },
  ],
};
