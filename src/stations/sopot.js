/**
 * Sopot – stacja na liniach 202 (Gdańsk – Stargard) i 250 (SKM), wg planu schematycznego stacji (VI 2023).
 *
 * Pulpit 112×16. Rzędy: 2 – tor 6 (odstawczy, kozły 6b/6a), 4 – linia 202 t.1 → tor 2a → tor 2 (peron 2),
 * 6 – tor 4 (odstawczy, kozły 4b/4a), 8 – linia 202 t.2 → tor 1a → tor 1 (peron 2), 10 – linia 250 t.502 → tor 502a
 * (peron 1 SKM), 12 – linia 250 t.501 → tor 501a, 14 – tor 13 (bocznica z wykolejnicą Wk7).
 *
 * Stacja jest długa: przejazd toru 202 to trzy przebiegi (A → H, H → O, O → szlak; z drugiej strony S → L, L → C,
 * C → szlak). Semafory M/L (na wjeździe z torów 2/1 do grupy 2a/1a) i L502/L501 wg planu.
 * Uproszczenia: pominięto sygnalizatory blokady samoczynnej (82, 83, 101, 102, 108, 121, 125–132), tarczę T13,
 * p.o. Sopot Wyścigi jest tylko opisem na odcinku zbliżania. Rozjazd 41 grupy SKM ma id Zw41s (na planie numer 41
 * występuje dwukrotnie).
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
[['GD1', 6], ['GD2', 10], ['GS2', 14], ['GS1', 18], ['OR1', 60], ['OR2', 64], ['OS2', 68], ['OS1', 72]]
  .forEach(([exit, x]) => tiles.push({ x, y: 0, type: 'block', exit }));
tiles.push({ x: 30, y: 0, type: 'label', text: 'SOPOT', size: 12, span: 18 });
tiles.push({ x: 32, y: 1, type: 'button', id: 'Zw', label: 'Zw', role: 'group-point', color: 'black' });
tiles.push({ x: 33, y: 1, type: 'button', id: 'Zz', label: 'Zz', role: 'point-lock', color: 'blue' });
tiles.push({ x: 35, y: 1, type: 'button', id: 'Pz', label: 'Pz', role: 'route-release', color: 'grey' });
tiles.push({ x: 36, y: 1, type: 'button', id: 'dPz', label: 'dPz', role: 'emergency-release', color: 'red', counter: true });
tiles.push({ x: 38, y: 1, type: 'button', id: 'Sz', label: 'Sz', role: 'substitute', color: 'white', counter: true });
tiles.push({ x: 1, y: 6, type: 'label', text: 'linia 202', span: 2, size: 7 }, { x: 12, y: 11, type: 'label', text: 'p.o. Sopot Wyścigi · linia 250 SKM', span: 8, size: 7 });

// ---- zachód: odcinki zbliżania ----
const approach = (x0, x1, y, sec_, btn, text, dirW = true) => {
  sec(sec_, { length: 400, kind: 'approach' });
  const end = { ...T(dirW ? x0 : x1, y, ['W', 'E'], sec_), endButton: { id: `k${btn}`, color: 'green' }, text };
  tiles.push(end, ...H(dirW ? x0 + 1 : x0, dirW ? x1 : x1 - 1, y, sec_));
};
approach(0, 5, 4, 'ZbA', 'GD1', 'Gdańsk 202 t.1'); approach(0, 5, 8, 'ZbB', 'GD2', 'Gdańsk 202 t.2');
approach(0, 27, 10, 'ZbA502', 'GS2', 'Gdańsk 250 t.502'); approach(0, 27, 12, 'ZbA501', 'GS1', 'Gdańsk 250 t.501');
tiles.push(SIG(5, 3, 'A', 'semafor', { x: 5, y: 4 }, 'E', { entry: true }), SIG(5, 9, 'B', 'semafor', { x: 5, y: 8 }, 'E', { entry: true }),
  SIG(28, 9, 'A502', 'semafor', { x: 27, y: 10 }, 'E', { entry: true }), SIG(28, 13, 'A501', 'semafor', { x: 27, y: 12 }, 'E', { entry: true }));

// ---- zachód: głowica 202 (rozjazdy 1–8) ----
sec('W1a', { length: 30, kind: 'plain' }); tiles.push(T(6, 8, ['W', 'E'], 'W1a'));
sec('Iz1', { length: 120, kind: 'point' }); tiles.push(P(7, 8, 'Zw1', '1', 'W', 'E', 'NE', 'Iz1'),
  T(8, 7, ['SW', 'NE'], 'Iz1'), T(9, 6, ['SW', 'NE'], 'Iz1'), T(10, 5, ['SW', 'NE'], 'Iz1'), P(11, 4, 'Zw2', '2', 'E', 'W', 'SW', 'Iz1'));
sec('W2w', { length: 120, kind: 'plain' }); tiles.push(...H(6, 10, 4, 'W2w'));
sec('W2a', { length: 30, kind: 'plain' }); tiles.push(T(12, 4, ['W', 'E'], 'W2a'));
sec('Iz3', { length: 120, kind: 'point' }); tiles.push(P(13, 4, 'Zw3', '3', 'W', 'E', 'SE', 'Iz3'),
  T(14, 5, ['NW', 'SE'], 'Iz3'), T(15, 6, ['NW', 'SE'], 'Iz3'), T(16, 7, ['NW', 'SE'], 'Iz3'), P(17, 8, 'Zw4', '4', 'E', 'W', 'NW', 'Iz3'));
sec('W2b', { length: 160, kind: 'plain' }); tiles.push(...H(14, 22, 4, 'W2b'));
sec('W1b', { length: 160, kind: 'plain' }); tiles.push(...H(8, 16, 8, 'W1b'));
sec('W1c', { length: 30, kind: 'plain' }); tiles.push(T(18, 8, ['W', 'E'], 'W1c'));
sec('Iz5', { length: 80, kind: 'point' }); tiles.push(P(19, 8, 'Zw5', '5', 'W', 'E', 'NE', 'Iz5'), T(20, 7, ['SW', 'NE'], 'Iz5'), P(21, 6, 'Zw6', '6', 'E', 'W', 'SW', 'Iz5'));
sec('T4b', { length: 60, kind: 'siding', track: '4b' }); tiles.push(BUF(18, 6, 'E', 'T4b', 'kT4b'), ...H(19, 20, 6, 'T4b'));
sec('W1d', { length: 120, kind: 'plain' }); tiles.push(...H(20, 26, 8, 'W1d'));
sec('Iz7', { length: 80, kind: 'point' }); tiles.push(P(23, 4, 'Zw7', '7', 'W', 'E', 'NE', 'Iz7'), T(24, 3, ['SW', 'NE'], 'Iz7'), P(25, 2, 'Zw8', '8', 'E', 'W', 'SW', 'Iz7'));
sec('T6b', { length: 60, kind: 'siding', track: '6b' }); tiles.push(BUF(22, 2, 'E', 'T6b', 'kT6b'), ...H(23, 24, 2, 'T6b'));
sec('W2c', { length: 60, kind: 'plain' }); tiles.push(...H(24, 26, 4, 'W2c'));
sec('W4a', { length: 80, kind: 'plain' }); tiles.push(...H(22, 26, 6, 'W4a'));
sec('W6a', { length: 30, kind: 'plain' }); tiles.push(T(26, 2, ['W', 'E'], 'W6a'));
tiles.push(SIG(6, 9, 'Tm1', 'tm', { x: 6, y: 8 }, 'E'), SIG(12, 3, 'Tm2', 'tm', { x: 12, y: 4 }, 'W'), SIG(20, 5, 'Tm3', 'tm', { x: 20, y: 4 }, 'W'));

// ---- grupa zachodnia: tory 6, 2a, 4, 1a (x 27–54) ----
sec('T6', { length: 771, kind: 'station', track: '6' }); tiles.push(...H(27, 54, 2, 'T6'));
sec('T2a', { length: 751, kind: 'station', track: '2a' }); tiles.push(...H(27, 54, 4, 'T2a'));
sec('T4', { length: 771, kind: 'station', track: '4' }); tiles.push(...H(27, 54, 6, 'T4'));
sec('T1a', { length: 753, kind: 'station', track: '1a' }); tiles.push(...H(27, 54, 8, 'T1a'));
tiles.push({ x: 40, y: 3, type: 'label', text: 'tor 6', span: 2, size: 8 }, { x: 40, y: 5, type: 'label', text: 'tor 2a', span: 2, size: 8 },
  { x: 40, y: 7, type: 'label', text: 'tor 4', span: 2, size: 8 }, { x: 40, y: 9, type: 'label', text: 'tor 1a', span: 2, size: 8 });
tiles.push(SIG(27, 1, 'F', 'semafor', { x: 27, y: 2 }, 'W', { shunting: true }), SIG(27, 3, 'E', 'semafor', { x: 27, y: 4 }, 'W', { shunting: true }),
  SIG(27, 5, 'D', 'semafor', { x: 27, y: 6 }, 'W', { shunting: true }), SIG(27, 9, 'C', 'semafor', { x: 27, y: 8 }, 'W', { shunting: true }));
tiles.push(SIG(55, 1, 'G', 'semafor', { x: 54, y: 2 }, 'E', { shunting: true }), SIG(55, 3, 'H', 'semafor', { x: 54, y: 4 }, 'E', { shunting: true }),
  SIG(55, 5, 'J', 'semafor', { x: 54, y: 6 }, 'E', { shunting: true }), SIG(55, 7, 'K', 'semafor', { x: 54, y: 8 }, 'E', { shunting: true }));

// ---- głowica środkowa (32–35), semafory M/L, tory 2/1 przy peronie 2 ----
sec('E6a', { length: 40, kind: 'plain' }); tiles.push(...H(55, 56, 2, 'E6a'));
sec('Iz34', { length: 80, kind: 'point' }); tiles.push(P(57, 2, 'Zw34', '34', 'W', 'E', 'SE', 'Iz34'), T(58, 3, ['NW', 'SE'], 'Iz34'), P(59, 4, 'Zw35', '35', 'E', 'W', 'NW', 'Iz34'));
sec('T6a', { length: 60, kind: 'siding', track: '6a' }); tiles.push(...H(58, 59, 2, 'T6a'), BUF(60, 2, 'W', 'T6a', 'kT6a'));
sec('E2a', { length: 80, kind: 'plain' }); tiles.push(...H(55, 58, 4, 'E2a'));
sec('E2b', { length: 60, kind: 'plain' }); tiles.push(...H(60, 62, 4, 'E2b'));
sec('E4a', { length: 40, kind: 'plain' }); tiles.push(...H(55, 56, 6, 'E4a'));
sec('Iz32', { length: 80, kind: 'point' }); tiles.push(P(57, 6, 'Zw32', '32', 'W', 'E', 'SE', 'Iz32'), T(58, 7, ['NW', 'SE'], 'Iz32'), P(59, 8, 'Zw33', '33', 'E', 'W', 'NW', 'Iz32'));
sec('T4a', { length: 60, kind: 'siding', track: '4a' }); tiles.push(...H(58, 59, 6, 'T4a'), BUF(60, 6, 'W', 'T4a', 'kT4a'));
sec('E1a', { length: 80, kind: 'plain' }); tiles.push(...H(55, 58, 8, 'E1a'));
sec('E1b', { length: 60, kind: 'plain' }); tiles.push(...H(60, 62, 8, 'E1b'));
tiles.push(SIG(63, 3, 'M', 'semafor', { x: 63, y: 4 }, 'W', { shunting: true }), SIG(63, 9, 'L', 'semafor', { x: 63, y: 8 }, 'W', { shunting: true }));
sec('T2', { length: 600, kind: 'station', track: '2', platform: true }); tiles.push(...H(63, 84, 4, 'T2'));
sec('T1', { length: 578, kind: 'station', track: '1', platform: true }); tiles.push(...H(63, 84, 8, 'T1'));
tiles.push({ x: 70, y: 5, type: 'label', text: 'tor 2 · Peron 2', span: 4, size: 8 }, { x: 70, y: 7, type: 'label', text: 'tor 1 · Peron 2', span: 4, size: 8 });
tiles.push(SIG(85, 3, 'O', 'semafor', { x: 84, y: 4 }, 'E', { shunting: true }), SIG(85, 7, 'P', 'semafor', { x: 84, y: 8 }, 'E', { shunting: true }));

// ---- wschód: głowica 202 (41–45), semafory wjazdowe R, S ----
sec('E2c', { length: 40, kind: 'plain' }); tiles.push(...H(85, 86, 4, 'E2c'));
sec('Iz41', { length: 140, kind: 'point' }); tiles.push(P(87, 4, 'Zw41', '41', 'W', 'E', 'SE', 'Iz41'),
  T(88, 5, ['NW', 'SE'], 'Iz41'), T(89, 6, ['NW', 'SE'], 'Iz41'), T(90, 7, ['NW', 'SE'], 'Iz41'), P(91, 8, 'Zw42', '42', 'E', 'W', 'NW', 'Iz41'));
sec('E2d', { length: 100, kind: 'plain' }); tiles.push(...H(88, 92, 4, 'E2d'));
sec('Iz44', { length: 140, kind: 'point' }); tiles.push(P(93, 4, 'Zw44', '44', 'W', 'E', 'SE', 'Iz44'),
  T(94, 5, ['NW', 'SE'], 'Iz44'), T(95, 6, ['NW', 'SE'], 'Iz44'), T(96, 7, ['NW', 'SE'], 'Iz44'), P(97, 8, 'Zw45', '45', 'E', 'W', 'NW', 'Iz44'));
sec('E2e', { length: 140, kind: 'plain' }); tiles.push(...H(94, 100, 4, 'E2e'));
sec('E1c', { length: 120, kind: 'plain' }); tiles.push(...H(85, 90, 8, 'E1c'));
sec('E1d', { length: 100, kind: 'plain' }); tiles.push(...H(92, 96, 8, 'E1d'));
sec('E1e', { length: 60, kind: 'plain' }); tiles.push(...H(98, 100, 8, 'E1e'));
tiles.push(SIG(99, 9, 'Tm11', 'tm', { x: 99, y: 8 }, 'W'));
approach(101, 111, 4, 'ZbR', 'OR1', 'Orłowo 202 t.1', false); approach(101, 111, 8, 'ZbS', 'OR2', 'Orłowo 202 t.2', false);
tiles.push(SIG(101, 3, 'R', 'semafor', { x: 101, y: 4 }, 'W', { entry: true }), SIG(101, 9, 'S', 'semafor', { x: 101, y: 8 }, 'W', { entry: true }));

// ---- SKM: tory 502/501 → 502a/501a (peron 1), tor 13, głowica 51–54 ----
sec('S502a', { length: 300, kind: 'plain' }); tiles.push(...H(28, 45, 10, 'S502a'));
sec('S501a', { length: 330, kind: 'plain' }); tiles.push(...H(28, 47, 12, 'S501a'));
sec('Iz36', { length: 80, kind: 'point' }); tiles.push(P(46, 10, 'Zw36', '36', 'W', 'E', 'SE', 'Iz36'), T(47, 11, ['NW', 'SE'], 'Iz36'), P(48, 12, 'Zw37', '37', 'E', 'W', 'NW', 'Iz36'));
sec('S502b', { length: 160, kind: 'plain' }); tiles.push(...H(47, 55, 10, 'S502b'));
sec('S501b', { length: 120, kind: 'plain' }); tiles.push(...H(49, 55, 12, 'S501b'));
sec('Iz38', { length: 80, kind: 'point' }); tiles.push(P(56, 12, 'Zw38', '38', 'W', 'E', 'NE', 'Iz38'), T(57, 11, ['SW', 'NE'], 'Iz38'), P(58, 10, 'Zw40', '40', 'E', 'W', 'SW', 'Iz38'));
sec('S502c', { length: 40, kind: 'plain' }); tiles.push(...H(56, 57, 10, 'S502c'));
sec('S502d', { length: 80, kind: 'plain' }); tiles.push(...H(59, 62, 10, 'S502d'));
sec('S501c', { length: 60, kind: 'plain' }); tiles.push(...H(57, 59, 12, 'S501c'));
sec('Iz41s', { length: 60, kind: 'point' }); tiles.push(P(60, 12, 'Zw41s', '41', 'E', 'W', 'SW', 'Iz41s'), T(59, 13, ['NE', 'SW'], 'Iz41s'), T(58, 14, ['NE', 'W'], 'Iz41s'));
sec('T13w', { length: 25, kind: 'siding', track: '13' }); tiles.push({ ...T(57, 14, ['W', 'E'], 'T13w'), derailer: 'Wk7' });
sec('T13', { length: 320, kind: 'siding', track: '13' }); tiles.push(...H(44, 56, 14, 'T13'), BUF(43, 14, 'E', 'T13', 'kT13'));
tiles.push(SIG(56, 15, 'Tm13', 'tm', { x: 56, y: 14 }, 'E'), { x: 48, y: 15, type: 'label', text: 'tor 13', span: 2, size: 7 });
sec('S501d', { length: 40, kind: 'plain' }); tiles.push(...H(61, 62, 12, 'S501d'));
tiles.push(SIG(63, 11, 'L502', 'semafor', { x: 63, y: 10 }, 'W', { shunting: true }), SIG(63, 13, 'L501', 'semafor', { x: 63, y: 12 }, 'W', { shunting: true }));
sec('T502a', { length: 220, kind: 'station', track: '502', platform: true }); tiles.push(...H(63, 84, 10, 'T502a'));
sec('T501a', { length: 220, kind: 'station', track: '501', platform: true }); tiles.push(...H(63, 84, 12, 'T501a'));
tiles.push({ x: 70, y: 11, type: 'label', text: 'tor 502a · Peron 1 (SKM)', span: 5, size: 8 }, { x: 70, y: 13, type: 'label', text: 'tor 501a · Peron 1 (SKM)', span: 5, size: 8 });
tiles.push(SIG(85, 11, 'R502', 'semafor', { x: 84, y: 10 }, 'E', { shunting: true }), SIG(85, 13, 'R501', 'semafor', { x: 84, y: 12 }, 'E', { shunting: true }));
sec('S502e', { length: 80, kind: 'plain' }); tiles.push(...H(85, 90, 10, 'S502e'));
sec('S501e', { length: 60, kind: 'plain' }); tiles.push(...H(85, 88, 12, 'S501e'));
sec('Iz51', { length: 80, kind: 'point' }); tiles.push(P(89, 12, 'Zw51', '51', 'W', 'E', 'NE', 'Iz51'), T(90, 11, ['SW', 'NE'], 'Iz51'), P(91, 10, 'Zw52', '52', 'E', 'W', 'SW', 'Iz51'));
sec('S502f', { length: 30, kind: 'plain' }); tiles.push(T(92, 10, ['W', 'E'], 'S502f'));
sec('Iz53', { length: 80, kind: 'point' }); tiles.push(P(93, 10, 'Zw53', '53', 'W', 'E', 'SE', 'Iz53'), T(94, 11, ['NW', 'SE'], 'Iz53'), P(95, 12, 'Zw54', '54', 'E', 'W', 'NW', 'Iz53'));
sec('S502g', { length: 140, kind: 'plain' }); tiles.push(...H(94, 100, 10, 'S502g'));
sec('S501f', { length: 100, kind: 'plain' }); tiles.push(...H(90, 94, 12, 'S501f'));
sec('S501g', { length: 100, kind: 'plain' }); tiles.push(...H(96, 100, 12, 'S501g'));
approach(101, 111, 10, 'ZbS502', 'OS2', 'Orłowo 250 t.502', false); approach(101, 111, 12, 'ZbS501', 'OS1', 'Orłowo 250 t.501', false);
tiles.push(SIG(101, 11, 'S502', 'semafor', { x: 101, y: 10 }, 'W', { entry: true }), SIG(101, 13, 'S501', 'semafor', { x: 101, y: 12 }, 'W', { entry: true }));

// ---- rozkład jazdy ----
const skm = (t, nrE, nrW) => {
  const [h, m] = t.split(':').map(Number);
  const f = (mm) => `${String(h + Math.floor(mm / 60)).padStart(2, '0')}:${String(mm % 60).padStart(2, '0')}`;
  return [
    { nr: nrE, kind: 'os', name: 'SKM Gdańsk – Gdynia', from: 'GS1', to: 'OS1', arr: t, dep: f(m + 1), track: '501', stop: true, length: 130, vmax: 90, dwell: 30 },
    { nr: nrW, kind: 'os', name: 'SKM Gdynia – Gdańsk', from: 'OS2', to: 'GS2', arr: f(m + 7), dep: f(m + 8), track: '502', stop: true, length: 130, vmax: 90, dwell: 30 },
  ];
};

export default {
  schemaVersion: 1,
  id: 'sopot',
  name: 'Sopot',
  description: 'Stacja na liniach 202 Gdańsk – Stargard i 250 SKM. Grupa zachodnia (tory 6, 2a, 4, 1a), peron 2 (tory 2/1), peron 1 SKM (502a/501a), tor 13 z wykolejnicą Wk7. Przejazd pociągu to trzy przebiegi. Numeracja rozjazdów i semaforów z planu stacji (2023).',
  startTime: '05:55',
  desk: { cols: 112, rows: 16 },

  exits: {
    GD1: { name: 'Gdańsk Oliwa', label: 'Gdańsk Oliwa – 202 t.1', tile: { x: 0, y: 4 }, dir: 'W', lineLength: 4200, lineSpeed: 120 },
    GD2: { name: 'Gdańsk Oliwa', label: 'Gdańsk Oliwa – 202 t.2', tile: { x: 0, y: 8 }, dir: 'W', lineLength: 4200, lineSpeed: 120 },
    GS2: { name: 'Gdańsk Oliwa SKM', label: 'Gdańsk Oliwa – 250 t.502', tile: { x: 0, y: 10 }, dir: 'W', lineLength: 3600, lineSpeed: 100 },
    GS1: { name: 'Gdańsk Oliwa SKM', label: 'Gdańsk Oliwa – 250 t.501', tile: { x: 0, y: 12 }, dir: 'W', lineLength: 3600, lineSpeed: 100 },
    OR1: { name: 'Gdynia Orłowo', label: 'Gdynia Orłowo – 202 t.1', tile: { x: 111, y: 4 }, dir: 'E', lineLength: 3900, lineSpeed: 120 },
    OR2: { name: 'Gdynia Orłowo', label: 'Gdynia Orłowo – 202 t.2', tile: { x: 111, y: 8 }, dir: 'E', lineLength: 3900, lineSpeed: 120 },
    OS2: { name: 'Gdynia Orłowo SKM', label: 'Gdynia Orłowo – 250 t.502', tile: { x: 111, y: 10 }, dir: 'E', lineLength: 3700, lineSpeed: 100 },
    OS1: { name: 'Gdynia Orłowo SKM', label: 'Gdynia Orłowo – 250 t.501', tile: { x: 111, y: 12 }, dir: 'E', lineLength: 3700, lineSpeed: 100 },
  },
  sections,
  tiles,
  routes: { disable: [], override: {} },

  timetable: [
    ...skm('06:02', 91101, 91102), ...skm('06:17', 91103, 91104), ...skm('06:32', 91105, 91106), ...skm('06:47', 91107, 91108),
    ...skm('07:02', 91109, 91110), ...skm('07:17', 91111, 91112), ...skm('07:32', 91113, 91114), ...skm('07:47', 91115, 91116),
    { nr: 55100, kind: 'os', name: 'Regio Gdańsk – Słupsk', from: 'GD1', to: 'OR1', arr: '06:05', dep: '06:06', track: '2', stop: true, length: 160, vmax: 120, dwell: 40 },
    { nr: 55201, kind: 'os', name: 'Regio Słupsk – Gdańsk', from: 'OR2', to: 'GD2', arr: '06:20', dep: '06:21', track: '1', stop: true, length: 160, vmax: 120, dwell: 40 },
    { nr: 55102, kind: 'os', name: 'Regio Gdańsk – Lębork', from: 'GD1', to: 'OR1', arr: '06:35', dep: '06:36', track: '2', stop: true, length: 160, vmax: 120, dwell: 40 },
    { nr: 5100, kind: 'os', name: 'IC Warszawa – Gdynia', from: 'GD1', to: 'OR1', arr: '06:42', dep: '06:43', track: '2', stop: true, length: 260, vmax: 120, dwell: 60 },
    { nr: 91151, kind: 'os', name: 'SKM do Sopotu (kończy bieg)', from: 'GS1', to: null, arr: '06:52', track: '501', stop: true, terminates: true, length: 130, vmax: 90, dwell: 30 },
    { nr: 55203, kind: 'os', name: 'Regio Lębork – Gdańsk', from: 'OR2', to: 'GD2', arr: '06:57', dep: '06:58', track: '1', stop: true, length: 160, vmax: 120, dwell: 40 },
    { nr: 5301, kind: 'os', name: 'TLK Hel – Warszawa', from: 'OR2', to: 'GD2', arr: '07:08', dep: '07:09', track: '1', stop: true, length: 300, vmax: 120, dwell: 60 },
    { nr: 55104, kind: 'os', name: 'Regio Gdańsk – Słupsk', from: 'GD1', to: 'OR1', arr: '07:12', dep: '07:13', track: '2', stop: true, length: 160, vmax: 120, dwell: 40 },
    { nr: 55152, kind: 'os', name: 'Regio z Lęborka (kończy bieg)', from: 'OR2', to: null, arr: '07:22', track: '1', stop: true, terminates: true, length: 160, vmax: 120, dwell: 40 },
    { nr: 91202, kind: 'os', name: 'SKM Sopot – Gdynia', unit: 91151, from: null, to: 'OS1', dep: '07:25', track: '501', stop: false, length: 130, vmax: 90 },
    { nr: 55106, kind: 'os', name: 'Regio Gdańsk – Lębork', from: 'GD1', to: 'OR1', arr: '07:40', dep: '07:41', track: '2', stop: true, length: 160, vmax: 120, dwell: 40 },
    { nr: 55205, kind: 'os', name: 'Regio Słupsk – Gdańsk', from: 'OR2', to: 'GD2', arr: '07:44', dep: '07:45', track: '1', stop: true, length: 160, vmax: 120, dwell: 40 },
    { nr: 55153, kind: 'os', name: 'Regio Sopot – Gdańsk', unit: 55152, from: null, to: 'GD2', dep: '07:58', track: '1', stop: false, length: 160, vmax: 120 },
  ],

  tasks: [
    { id: 'odstaw-91151', unit: 91151, type: 'move', toTrack: '13', deadline: '07:08', text: 'Skład SKM 91151 odstawić z toru 501a na tor 13.' },
    { id: 'podstaw-91202', unit: 91151, type: 'move', toTrack: '501', after: '07:16', deadline: '07:23', text: 'Skład z toru 13 podstawić na tor 501a jako pociąg 91202 do Gdyni (odjazd 07:25).' },
    { id: 'odstaw-55152', unit: 55152, type: 'move', toTrack: '4', deadline: '07:40', text: 'Skład Regio 55152 odstawić z toru 1 na tor 4 (przed przyjazdem 55205 na tor 1).' },
    { id: 'podstaw-55153', unit: 55152, type: 'move', toTrack: '1', after: '07:48', deadline: '07:56', text: 'Skład z toru 4 podstawić na tor 1 jako pociąg 55153 do Gdańska (odjazd 07:58).' },
  ],

  scenarios: [
    { id: 'zmiana', name: 'Pełna zmiana (05:55–08:15)', description: 'SKM co 15 min, regionalne i IC/TLK z postojem przy peronie 2, odstawianie składów na tor 13 i tor 4 i powrót jako nowe pociągi.', endTime: '08:15' },
    { id: 'usterka-gd', name: 'Usterka blokady od Gdańska', description: 'Blokada toru 2 linii 202 od Gdańska Oliwy bez łączności przez 40 min – zapowiadanie telefoniczne.', endTime: '08:15', faults: [{ type: 'block-fail', target: 'GD2', at: '06:40', duration: 40 }], disruptions: 'none' },
    { id: 'szczyt', name: 'Szczyt z zakłóceniami', description: 'Pełny rozkład, duże zakłócenia.', endTime: '08:25', disruptions: 'high' },
  ],
};
