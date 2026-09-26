/**
 * Stacja Gdynia Orłowo (wg planu schematycznego, stan IV 2024) – uproszczona.
 *
 * Linie: 202 Sopot – Gdynia Główna (tory 1/2) i 250 SKM (tory 501/502), obie w obu kierunkach.
 * Tory: 6 (Baza EZ, 394 m), 4 (715 m), 2 i 1 (peron II), 3 (791 m), 502 i 501 (peron I SKM),
 * bocznica 18 (328 m) z wykolejnicą Wk11.
 * Semafory: A, B (wjazd od Sopotu), C, D, E, F (wyjazd na Sopot z torów 3, 1, 2, 4), G (tor 6, na Gdynię),
 * H, J, K (wyjazd na Gdynię z 2, 1, 3), L, M (wjazd od Gdyni), C501, D502 (SKM na Sopot), T501, T502 (SKM na Gdynię),
 * P, R (SKM wjazd od Gdyni), A501, A502 (SKM wjazd od Sopotu – nazwy umowne).
 * Rozjazdy: 1–7 (głowica zachodnia), 25, 26, 31–37 (głowica wschodnia), SKM: 1–2 (zachód), 51–54 (wschód).
 * Pominięto: tory 8, 10 Bazy EZ Sopot, bocznice 14 i 24, tor 152.
 */
const T = (x, y, ports, section, extra = {}) => ({ x, y, type: 'track', ports, section, ...extra });
const H = (x1, x2, y, section, extra = {}) => Array.from({ length: x2 - x1 + 1 }, (_, i) => T(x1 + i, y, ['W', 'E'], section, extra));
const P = (x, y, id, label, toe, straight, diverge, section) => ({ x, y, type: 'point', id, label, toe, straight, diverge, section });
const SIG = (x, y, id, kind, at, dir, extra = {}) => ({ x, y, type: 'signal', id, kind, at, dir, ...extra });

const tiles = [];
const sections = {};
const sec = (id, def) => { sections[id] = def; return id; };

// ---- blokady, przyciski ----
[['S2', 0], ['S1', 4], ['S502', 8], ['S501', 12], ['Z2', 54], ['Z1', 58], ['Z502', 62], ['Z501', 66]].forEach(([exit, x]) => tiles.push({ x, y: 0, type: 'block', exit }));
tiles.push({ x: 26, y: 0, type: 'label', text: 'GDYNIA ORŁOWO', size: 12, span: 18 });
tiles.push({ x: 30, y: 1, type: 'button', id: 'Zw', label: 'Zw', role: 'group-point', color: 'black' });
tiles.push({ x: 31, y: 1, type: 'button', id: 'Zz', label: 'Zz', role: 'point-lock', color: 'blue' });
tiles.push({ x: 33, y: 1, type: 'button', id: 'Pz', label: 'Pz', role: 'route-release', color: 'grey' });
tiles.push({ x: 34, y: 1, type: 'button', id: 'dPz', label: 'dPz', role: 'emergency-release', color: 'red', counter: true });
tiles.push({ x: 36, y: 1, type: 'button', id: 'Sz', label: 'Sz', role: 'substitute', color: 'white', counter: true });

// ---- tory stacyjne ----
sec('T6', { length: 394, kind: 'station', track: '6' });   tiles.push(...H(15, 49, 2, 'T6'));
sec('T4', { length: 715, kind: 'station', track: '4' });   tiles.push(...H(13, 49, 4, 'T4'));
sec('T2', { length: 747, kind: 'station', track: '2', platform: 'Peron II' }); tiles.push(...H(11, 49, 6, 'T2'));
sec('T1', { length: 734, kind: 'station', track: '1', platform: 'Peron II' }); tiles.push(...H(12, 49, 8, 'T1'));
sec('T3', { length: 791, kind: 'station', track: '3' });   tiles.push(...H(14, 49, 10, 'T3'));
sec('T502', { length: 300, kind: 'station', track: '502', platform: 'Peron I (SKM)' }); tiles.push(...H(11, 49, 12, 'T502'));
sec('T501', { length: 300, kind: 'station', track: '501', platform: 'Peron I (SKM)' }); tiles.push(...H(9, 49, 14, 'T501'));
tiles.push({ x: 30, y: 3, type: 'label', text: 'tor 6 · Baza EZ Sopot', span: 5, size: 8 }, { x: 30, y: 5, type: 'label', text: 'tor 4', span: 2, size: 8 },
  { x: 30, y: 7, type: 'label', text: 'tor 2 · Peron II', span: 4, size: 8 }, { x: 30, y: 9, type: 'label', text: 'tor 1 · Peron II', span: 4, size: 8 },
  { x: 30, y: 11, type: 'label', text: 'tor 3', span: 2, size: 8 }, { x: 30, y: 13, type: 'label', text: 'tor 502 · Peron I', span: 4, size: 8 }, { x: 30, y: 15, type: 'label', text: 'tor 501 · Peron I', span: 4, size: 8 });

// ---- zachód: linia 202 (rzędy 6, 8) ----
sec('ZbB', { length: 400, kind: 'approach' }); tiles.push({ ...T(0, 6, ['W', 'E'], 'ZbB'), endButton: { id: 'kS2', color: 'green' }, text: 'Sopot t.2' }, ...H(1, 5, 6, 'ZbB'));
sec('ZbA', { length: 400, kind: 'approach' }); tiles.push({ ...T(0, 8, ['W', 'E'], 'ZbA'), endButton: { id: 'kS1', color: 'green' }, text: 'Sopot t.1' }, ...H(1, 5, 8, 'ZbA'));
sec('W2a', { length: 30, kind: 'plain' }); tiles.push(T(6, 6, ['W', 'E'], 'W2a'));
sec('Iz1', { length: 80, kind: 'point' }); tiles.push(P(7, 6, 'Zw1', '1', 'W', 'E', 'SE', 'Iz1'), T(8, 7, ['NW', 'SE'], 'Iz1'), P(9, 8, 'Zw2', '2', 'E', 'W', 'NW', 'Iz1'));
sec('W1a', { length: 60, kind: 'plain' }); tiles.push(...H(6, 8, 8, 'W1a'));
sec('W2b', { length: 40, kind: 'plain' }); tiles.push(...H(8, 9, 6, 'W2b'));
sec('Iz5', { length: 60, kind: 'point' }); tiles.push(P(10, 6, 'Zw5', '5', 'W', 'E', 'NE', 'Iz5'), T(11, 5, ['SW', 'NE'], 'Iz5'));
sec('Iz7', { length: 60, kind: 'point' }); tiles.push(P(12, 4, 'Zw7', '7', 'SW', 'E', 'NE', 'Iz7'), T(13, 3, ['SW', 'NE'], 'Iz7'), T(14, 2, ['SW', 'E'], 'Iz7'));
sec('W1b', { length: 30, kind: 'plain' }); tiles.push(T(10, 8, ['W', 'E'], 'W1b'));
sec('Iz4', { length: 60, kind: 'point' }); tiles.push(P(11, 8, 'Zw4', '4', 'W', 'E', 'SE', 'Iz4'), T(12, 9, ['NW', 'SE'], 'Iz4'), T(13, 10, ['NW', 'E'], 'Iz4'));
tiles.push(SIG(5, 5, 'B', 'semafor', { x: 5, y: 6 }, 'E', { entry: true }), SIG(5, 7, 'A', 'semafor', { x: 5, y: 8 }, 'E', { entry: true }));
tiles.push(SIG(6, 9, 'Tm1', 'tm', { x: 6, y: 8 }, 'W'), SIG(7, 9, 'Tm2', 'tm', { x: 6, y: 8 }, 'E'));
// ---- zachód: SKM (rzędy 12, 14) ----
sec('ZbA502', { length: 400, kind: 'approach' }); tiles.push({ ...T(0, 12, ['W', 'E'], 'ZbA502'), endButton: { id: 'kS502', color: 'green' }, text: 'Sopot 502' }, ...H(1, 5, 12, 'ZbA502'));
sec('ZbA501', { length: 400, kind: 'approach' }); tiles.push({ ...T(0, 14, ['W', 'E'], 'ZbA501'), endButton: { id: 'kS501', color: 'green' }, text: 'Sopot 501' }, ...H(1, 5, 14, 'ZbA501'));
sec('W502a', { length: 80, kind: 'plain' }); tiles.push(...H(6, 9, 12, 'W502a'));
sec('W501a', { length: 40, kind: 'plain' }); tiles.push(...H(6, 7, 14, 'W501a'));
sec('IzS1', { length: 80, kind: 'point' }); tiles.push(P(8, 14, 'ZwS1', '1', 'W', 'E', 'NE', 'IzS1'), T(9, 13, ['SW', 'NE'], 'IzS1'), P(10, 12, 'ZwS2', '2', 'E', 'W', 'SW', 'IzS1'));
tiles.push(SIG(5, 11, 'A502', 'semafor', { x: 5, y: 12 }, 'E', { entry: true }), SIG(5, 13, 'A501', 'semafor', { x: 5, y: 14 }, 'E', { entry: true }));

// ---- semafory wyjazdowe zachód (x=20) i wschód (x=49) ----
tiles.push(SIG(20, 5, 'F', 'semafor', { x: 20, y: 4 }, 'W', { shunting: true }), SIG(20, 7, 'E', 'semafor', { x: 20, y: 6 }, 'W', { shunting: true }),
  SIG(20, 9, 'D', 'semafor', { x: 20, y: 8 }, 'W'), SIG(20, 11, 'C', 'semafor', { x: 20, y: 10 }, 'W'),
  SIG(20, 13, 'D502', 'semafor', { x: 20, y: 12 }, 'W'), SIG(20, 15, 'C501', 'semafor', { x: 20, y: 14 }, 'W'));
tiles.push(SIG(49, 1, 'G', 'semafor', { x: 49, y: 2 }, 'E', { shunting: true }), SIG(49, 5, 'H', 'semafor', { x: 49, y: 6 }, 'E', { shunting: true }),
  SIG(49, 7, 'J', 'semafor', { x: 49, y: 8 }, 'E'), SIG(49, 9, 'K', 'semafor', { x: 49, y: 10 }, 'E'),
  SIG(49, 11, 'T502', 'semafor', { x: 49, y: 12 }, 'E'), SIG(49, 13, 'T501', 'semafor', { x: 49, y: 14 }, 'E'));
tiles.push(SIG(21, 3, 'Tm4', 'tm', { x: 21, y: 2 }, 'W'), SIG(22, 3, 'Tm11', 'tm', { x: 21, y: 2 }, 'E'));
tiles.push(SIG(49, 3, 'Tm3', 'tm', { x: 49, y: 4 }, 'E')); // koniec toru 4 od strony Gdyni – wyjazd manewrowy na tor 6 przez rozjazdy 25/26

// ---- wschód: tor 6 → bocznica 18 (Wk11) i zjazd na tor 4 ----
sec('Iz26', { length: 60, kind: 'point' }); tiles.push(P(50, 2, 'Zw26', '26', 'W', 'E', 'SE', 'Iz26'), T(51, 3, ['NW', 'SE'], 'Iz26'));
sec('T18w', { length: 25, kind: 'siding', track: '18' }); tiles.push({ ...T(51, 2, ['W', 'E'], 'T18w'), derailer: 'Wk11' });
sec('T18', { length: 300, kind: 'siding', track: '18' }); tiles.push(...H(52, 57, 2, 'T18'), { x: 58, y: 2, type: 'buffer', port: 'W', section: 'T18', endButton: { id: 'kT18', color: 'white' } });
tiles.push(SIG(53, 3, 'Tm13', 'tm', { x: 53, y: 2 }, 'W'), { x: 55, y: 3, type: 'label', text: 'tor 18 · Magazyn', span: 4, size: 8 });
sec('E4', { length: 60, kind: 'plain' }); tiles.push(T(50, 4, ['W', 'E'], 'E4'), T(51, 4, ['W', 'E'], 'E4'));
sec('Iz25', { length: 70, kind: 'point' }); tiles.push(P(52, 4, 'Zw25', '25', 'E', 'W', 'NW', 'Iz25'), T(53, 4, ['W', 'SE'], 'Iz25'), T(54, 5, ['NW', 'SE'], 'Iz25'));
// ---- wschód: linia 202 ----
sec('E2', { length: 120, kind: 'plain' }); tiles.push(...H(50, 54, 6, 'E2'));
sec('Iz33', { length: 40, kind: 'point' }); tiles.push(P(55, 6, 'Zw33', '33', 'E', 'W', 'NW', 'Iz33'));
sec('Iz35', { length: 80, kind: 'point' }); tiles.push(P(56, 6, 'Zw35', '35', 'W', 'E', 'SE', 'Iz35'), T(57, 7, ['NW', 'SE'], 'Iz35'), P(58, 8, 'Zw36', '36', 'E', 'W', 'NW', 'Iz35'));
sec('E2b', { length: 30, kind: 'plain' }); tiles.push(T(57, 6, ['W', 'E'], 'E2b'));
sec('Iz37', { length: 80, kind: 'point' }); tiles.push(P(58, 6, 'Zw37', '37', 'W', 'E', 'SE', 'Iz37'), T(59, 7, ['NW', 'SE'], 'Iz37'), P(60, 8, 'Zw34', '34', 'E', 'W', 'NW', 'Iz37'));
sec('E2c', { length: 200, kind: 'plain' }); tiles.push(...H(59, 63, 6, 'E2c'));
sec('ZbM', { length: 400, kind: 'approach' }); tiles.push(...H(64, 68, 6, 'ZbM'), { ...T(69, 6, ['W', 'E'], 'ZbM'), endButton: { id: 'kZ2', color: 'green' }, text: 'Gdynia t.2' });
sec('E1', { length: 50, kind: 'plain' }); tiles.push(...H(50, 51, 8, 'E1'));
sec('Iz31', { length: 70, kind: 'point' }); tiles.push(P(52, 8, 'Zw31', '31', 'E', 'W', 'SW', 'Iz31'), T(51, 9, ['NE', 'SW'], 'Iz31'), T(50, 10, ['W', 'NE'], 'Iz31'));
sec('E1b', { length: 120, kind: 'plain' }); tiles.push(...H(53, 57, 8, 'E1b'));
sec('E1c', { length: 30, kind: 'plain' }); tiles.push(T(59, 8, ['W', 'E'], 'E1c'));
sec('E1d', { length: 80, kind: 'plain' }); tiles.push(...H(61, 63, 8, 'E1d'));
sec('ZbL', { length: 400, kind: 'approach' }); tiles.push(...H(64, 68, 8, 'ZbL'), { ...T(69, 8, ['W', 'E'], 'ZbL'), endButton: { id: 'kZ1', color: 'green' }, text: 'Gdynia t.1' });
tiles.push(SIG(64, 5, 'M', 'semafor', { x: 64, y: 6 }, 'W', { entry: true }), SIG(64, 7, 'L', 'semafor', { x: 64, y: 8 }, 'W', { entry: true }));
tiles.push(SIG(62, 7, 'Tm5', 'tm', { x: 62, y: 6 }, 'E'), SIG(63, 7, 'Tm6', 'tm', { x: 62, y: 6 }, 'W')); // tor 2 za rozjazdem 37 – zmiana kierunku przy manewrach tor 4 ↔ tor 6
tiles.push(SIG(61, 9, 'Tm14', 'tm', { x: 61, y: 8 }, 'E'), SIG(62, 9, 'Tm12', 'tm', { x: 61, y: 8 }, 'W'));
// ---- wschód: SKM ----
sec('E502', { length: 140, kind: 'plain' }); tiles.push(...H(50, 55, 12, 'E502'));
sec('IzS51', { length: 80, kind: 'point' }); tiles.push(P(56, 12, 'ZwS51', '51', 'W', 'E', 'SE', 'IzS51'), T(57, 13, ['NW', 'SE'], 'IzS51'), P(58, 14, 'ZwS52', '52', 'E', 'W', 'NW', 'IzS51'));
sec('E502b', { length: 40, kind: 'plain' }); tiles.push(...H(57, 58, 12, 'E502b'));
sec('IzS53', { length: 80, kind: 'point' }); tiles.push(P(59, 12, 'ZwS54', '54', 'W', 'E', 'SE', 'IzS53'), T(60, 13, ['NW', 'SE'], 'IzS53'), P(61, 14, 'ZwS53', '53', 'E', 'W', 'NW', 'IzS53'));
sec('E502c', { length: 60, kind: 'plain' }); tiles.push(...H(60, 63, 12, 'E502c'));
sec('ZbP', { length: 400, kind: 'approach' }); tiles.push(...H(64, 68, 12, 'ZbP'), { ...T(69, 12, ['W', 'E'], 'ZbP'), endButton: { id: 'kZ502', color: 'green' }, text: 'Gdynia 502' });
sec('E501', { length: 180, kind: 'plain' }); tiles.push(...H(50, 57, 14, 'E501'));
sec('E501b', { length: 40, kind: 'plain' }); tiles.push(...H(59, 60, 14, 'E501b'));
sec('E501c', { length: 40, kind: 'plain' }); tiles.push(...H(62, 63, 14, 'E501c'));
sec('ZbR', { length: 400, kind: 'approach' }); tiles.push(...H(64, 68, 14, 'ZbR'), { ...T(69, 14, ['W', 'E'], 'ZbR'), endButton: { id: 'kZ501', color: 'green' }, text: 'Gdynia 501' });
tiles.push(SIG(64, 11, 'P', 'semafor', { x: 64, y: 12 }, 'W', { entry: true }), SIG(64, 13, 'R', 'semafor', { x: 64, y: 14 }, 'W', { entry: true }));
tiles.push({ x: 2, y: 4, type: 'label', text: 'linia 202', span: 2, size: 7 }, { x: 2, y: 10, type: 'label', text: 'linia 250 SKM', span: 3, size: 7 });

const skm = (t, nrE, nrW) => {
  const [h, m] = t.split(':').map(Number);
  const f = (mm) => `${String(h + Math.floor(mm / 60)).padStart(2, '0')}:${String(mm % 60).padStart(2, '0')}`;
  return [
    { nr: nrE, kind: 'os', name: 'SKM', from: 'S501', to: 'Z501', arr: t, dep: f(m + 1), track: '501', stop: true, length: 130, vmax: 90, dwell: 30 },
    { nr: nrW, kind: 'os', name: 'SKM', from: 'Z502', to: 'S502', arr: f(m + 6), dep: f(m + 7), track: '502', stop: true, length: 130, vmax: 90, dwell: 30 },
  ];
};

export default {
  schemaVersion: 1,
  id: 'gdynia-orlowo',
  name: 'Gdynia Orłowo',
  srk: 'komputerowe',
  srkInfo: 'Komputerowe (Ebilock 950 ze sterownikami STC i licznikami osi, 2014, obszar LCS Gdynia – sterowanie zdalne z Gdyni Głównej); tory SKM 501/502 – obiekt zdalnego sterowania „GOr-SKM” (PKP SKM). W symulatorze stanowisko obsługi na miejscu.',
  description: 'Stacja na linii dwutorowej 202 Sopot – Gdynia Główna z równoległą linią SKM 250. Perony I (SKM) i 2, tory 3 i 4, tor 6 Bazy EZ Sopot, bocznica 18 z wykolejnicą. Numeracja rozjazdów i semaforów z planu stacji (2024).',
  startTime: '05:55',
  desk: { cols: 70, rows: 16 },

  exits: {
    S1: { name: 'Sopot', label: 'Sopot – 202 t.1', tile: { x: 0, y: 8 }, dir: 'W', direction: 'in', block: 'sbl', lineLength: 3900, lineSpeed: 120 },
    S2: { name: 'Sopot', label: 'Sopot – 202 t.2', tile: { x: 0, y: 6 }, dir: 'W', direction: 'out', block: 'sbl', lineLength: 3900, lineSpeed: 120 },
    S502: { name: 'Sopot SKM', label: 'Sopot – 250 t.502', tile: { x: 0, y: 12 }, dir: 'W', direction: 'out', block: 'sbl', lineLength: 3700, lineSpeed: 100 },
    S501: { name: 'Sopot SKM', label: 'Sopot – 250 t.501', tile: { x: 0, y: 14 }, dir: 'W', direction: 'in', block: 'sbl', lineLength: 3700, lineSpeed: 100 },
    Z1: { name: 'Gdynia Główna', label: 'Gdynia Gł. – 202 t.1', tile: { x: 69, y: 8 }, dir: 'E', direction: 'out', block: 'sbl', lineLength: 3600, lineSpeed: 120 },
    Z2: { name: 'Gdynia Główna', label: 'Gdynia Gł. – 202 t.2', tile: { x: 69, y: 6 }, dir: 'E', direction: 'in', block: 'sbl', lineLength: 3600, lineSpeed: 120 },
    Z502: { name: 'Gdynia Główna SKM', label: 'Gdynia Gł. – 250 t.502', tile: { x: 69, y: 12 }, dir: 'E', direction: 'in', block: 'sbl', lineLength: 3400, lineSpeed: 100 },
    Z501: { name: 'Gdynia Główna SKM', label: 'Gdynia Gł. – 250 t.501', tile: { x: 69, y: 14 }, dir: 'E', direction: 'out', block: 'sbl', lineLength: 3400, lineSpeed: 100 },
  },
  sections,
  tiles,
  routes: { disable: [], override: {} },

  timetable: [
    ...skm('06:02', 92101, 92102), ...skm('06:17', 92103, 92104), ...skm('06:32', 92105, 92106), ...skm('06:47', 92107, 92108),
    ...skm('07:02', 92109, 92110), ...skm('07:17', 92111, 92112), ...skm('07:32', 92113, 92114), ...skm('07:47', 92115, 92116),
    { nr: 55100, kind: 'os', name: 'Regio Gdańsk – Słupsk', from: 'S1', to: 'Z1', arr: '06:08', dep: '06:09', track: '1', stop: true, length: 160, vmax: 120, dwell: 40 },
    { nr: 55201, kind: 'os', name: 'Regio Słupsk – Gdańsk', from: 'Z2', to: 'S2', arr: '06:22', dep: '06:23', track: '2', stop: true, length: 160, vmax: 120, dwell: 40 },
    { nr: 5100, kind: 'os', name: 'IC Warszawa – Gdynia', from: 'S1', to: 'Z1', arr: '06:45', track: '1', stop: false, length: 260, vmax: 120 },
    { nr: 55102, kind: 'os', name: 'Regio Gdańsk – Lębork', from: 'S1', to: 'Z1', arr: '06:38', dep: '06:39', track: '1', stop: true, length: 160, vmax: 120, dwell: 40 },
    { nr: 55203, kind: 'os', name: 'Regio Lębork – Gdańsk', from: 'Z2', to: 'S2', arr: '06:52', dep: '06:53', track: '2', stop: true, length: 160, vmax: 120, dwell: 40 },
    { nr: 88301, kind: 'os', name: 'Skład EZT z Bazy (próżny)', from: null, to: 'Z2', dep: '07:05', track: '6', stop: false, length: 130, vmax: 90, startOn: { section: 'T6', dir: 'E' } },
    { nr: 55104, kind: 'os', name: 'Regio Gdańsk – Słupsk', from: 'S1', to: 'Z1', arr: '07:08', dep: '07:09', track: '1', stop: true, length: 160, vmax: 120, dwell: 40 },
    { nr: 5301, kind: 'os', name: 'TLK Hel – Warszawa', from: 'Z2', to: 'S2', arr: '07:15', track: '2', stop: false, length: 300, vmax: 120 },
    { nr: 55205, kind: 'os', name: 'Regio Lębork – Gdańsk', from: 'Z2', to: 'S2', arr: '07:22', dep: '07:23', track: '2', stop: true, length: 160, vmax: 120, dwell: 40 },
    { nr: 44561, kind: 'tow', name: 'Towarowy', from: 'S1', to: 'Z1', arr: '07:30', track: '3', stop: false, length: 520, vmax: 80 },
    { nr: 55106, kind: 'os', name: 'Regio Gdańsk – Słupsk', from: 'S1', to: 'Z1', arr: '07:38', dep: '07:39', track: '1', stop: true, length: 160, vmax: 120, dwell: 40 },
    { nr: 88302, kind: 'os', name: 'Skład EZT do Bazy (próżny)', from: 'Z2', to: null, arr: '07:44', track: '4', stop: true, terminates: true, length: 130, vmax: 90, dwell: 30 },
    { nr: 55207, kind: 'os', name: 'Regio Lębork – Gdańsk', from: 'Z2', to: 'S2', arr: '07:52', dep: '07:53', track: '2', stop: true, length: 160, vmax: 120, dwell: 40 },
  ],

  tasks: [
    { id: 'baza-88302', unit: 88302, type: 'move', toTrack: '6', deadline: '08:05', text: 'Skład EZT 88302 odstawić z toru 4 na tor 6 (Baza EZ Sopot).' },
  ],

  scenarios: [
    { id: 'zmiana', name: 'Pełna zmiana (05:55–08:10)', description: 'SKM co 15 min, regionalne z postojem przy peronie II, IC i TLK przelotem, towarowy torem 3, skład EZT z Bazy i do Bazy.', endTime: '08:15' },
    { id: 'usterka-202', name: 'Usterka blokady od Gdyni', description: 'Blokada toru 2 od Gdyni Głównej bez łączności przez 40 min – zapowiadanie telefoniczne.', endTime: '08:15', faults: [{ type: 'block-fail', target: 'Z2', at: '06:40', duration: 40 }], disruptions: 'none' },
    { id: 'szczyt', name: 'Szczyt z zakłóceniami', description: 'Pełny rozkład, duże zakłócenia.', endTime: '08:25', disruptions: 'high' },
  ],
};
