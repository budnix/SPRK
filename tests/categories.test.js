import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CATEGORIES, CATEGORY_ALIASES, categoryOf, categoryLabel, speedFor, dynamicsFor, trainLabel, relationOf, brandOf, MASS_ACCEL_MIN, MASS_ACCEL_MAX, MAX_TONNES_PER_METRE, MAX_FREIGHT_LENGTH } from '../src/model/categories.js';
import { validateStation } from '../src/model/validate.js';
import { STATIONS } from '../src/stations/index.js';
import { Simulation } from '../src/model/Simulation.js';
import { Train } from '../src/model/Train.js';
import sopot from '../src/stations/sopot.js';
import szkolna from '../src/stations/szkolna.js';
import { makeSim, play } from './helpers.js';

test('kategoria pociągu z pola cat albo z nazwy/rodzaju; prędkość i dynamika wg kategorii, vmax wpisu nadpisuje', () => {
  assert.equal(categoryOf({ name: 'IC „Kaszub” Kraków Gł. – Gdynia Gł.', kind: 'os' }), 'IC');
  assert.equal(categoryOf({ name: 'TLK Hel – Warszawa Wsch.', kind: 'os' }), 'TLK');
  assert.equal(categoryOf({ name: 'Regio Gdańsk Gł. – Słupsk', kind: 'os' }), 'R');
  assert.equal(categoryOf({ name: 'SKM Gdańsk Śródmieście – Wejherowo', kind: 'os' }), 'SKM');
  assert.equal(categoryOf({ name: 'Osobowy', kind: 'os' }), 'R');
  // klucze kategorii towarowych = rodzaje pociągów z zał. 6.3 (TM, TN, TK); dawne klucze TOW/TOWP/ZD to aliasy
  assert.equal(categoryOf({ name: 'Towarowy Gdynia Port – Gdańsk Port Płn.', kind: 'tow' }), 'TM');
  // nazwa „próżny” nie decyduje o rodzaju (dawna reguła → TN bez źródła) – rodzaj podaje pole cat
  assert.equal(categoryOf({ name: 'Towarowy próżny', kind: 'tow' }), 'TM');
  assert.equal(categoryOf({ name: 'Towarowy próżny', kind: 'tow', cat: 'TN' }), 'TN');
  assert.equal(categoryOf({ name: 'Zdawczy', kind: 'tow' }), 'TK');
  for (const [old, key] of Object.entries(CATEGORY_ALIASES)) assert.equal(categoryOf({ name: 'Towarowy', kind: 'tow', cat: old }), key);
  assert.equal(categoryOf({ name: 'Skład EZT Baza EZ Sopot – Gdynia Gł. (próżny)', kind: 'os' }), 'EZT');
  assert.equal(categoryOf({ name: 'cokolwiek', kind: 'os', cat: 'EIP' }), 'EIP');
  assert.equal(speedFor({ name: 'IC Kraków – Gdynia', kind: 'os' }), 160);
  assert.equal(speedFor({ name: 'SKM', kind: 'os' }), 120);
  assert.equal(speedFor({ name: 'Towarowy', kind: 'tow' }), 80);
  assert.equal(speedFor({ name: 'Towarowy', kind: 'tow', vmax: 60 }), 60);
  assert.ok(dynamicsFor({ name: 'Towarowy', kind: 'tow' }).accel < dynamicsFor({ name: 'SKM', kind: 'os' }).accel);
  assert.equal(trainLabel({ nr: 5100, name: 'IC Kraków – Gdynia', kind: 'os' }), 'IC 5100');
  // towarowe: oznaczenia rodzaju pociągu PKP PLK (Regulamin sieci, zał. 6.3) – TM masowy, TN niemasowy, TK zdawczy,
  // LT lokomotywa luzem; trzecia litera – trakcja (domyślnie E, `catLabel` wpisu nadpisuje)
  assert.equal(trainLabel({ nr: 44561, name: 'Towarowy', kind: 'tow' }), 'TME 44561');
  assert.equal(trainLabel({ nr: 44563, name: 'Towarowy próżny', kind: 'tow', cat: 'TN' }), 'TNE 44563');
  assert.equal(trainLabel({ nr: 90201, name: 'Zdawczy', kind: 'tow' }), 'TKE 90201');
  assert.equal(categoryOf({ name: 'Towarowy Tczew – Zajączkowo Tczewskie (zdawczy)', kind: 'tow' }), 'TK', 'zdawczy także w nawiasie relacji');
  assert.equal(trainLabel({ nr: 44660, name: 'Lokomotywa luzem Gdańsk Brzeźno – Gdańsk Gł.', kind: 'tow' }), 'LTE 44660');
  assert.equal(relationOf({ name: 'Lokomotywa luzem Gdańsk Brzeźno – Gdańsk Gł.' }), 'Gdańsk Brzeźno – Gdańsk Gł.');
  assert.equal(trainLabel({ nr: 44565, name: 'Towarowy', kind: 'tow', catLabel: 'TMS' }), 'TMS 44565');
  assert.equal(categoryLabel({ nr: 1, name: 'IC X – Y', kind: 'os' }), 'IC');
  for (const c of ['TM', 'TN', 'TK', 'LT']) assert.match(CATEGORIES[c].label, /^(T[MNK]|LT)E$/, `${c}: trzy litery z oznaczeniem trakcji`);
  assert.equal(relationOf({ name: 'IC „Kaszub” Kraków Gł. – Gdynia Gł.' }), 'Kraków Gł. – Gdynia Gł.');
  assert.equal(brandOf({ name: 'IC „Kaszub” Kraków Gł. – Gdynia Gł.' }), 'Kaszub');
  assert.equal(relationOf({ name: 'Osobowy' }), 'Osobowy');
  for (const c of Object.values(CATEGORIES)) assert.ok(c.vmax > 0 && c.accel > 0 && c.brake > 0 && c.label);
});

test('rozkłady stacji trójmiejskich: pełne relacje, kategorie IC/TLK/R/SKM i rodzaje towarowych z zał. 6.3, prędkości zgodne z kategorią', () => {
  for (const st of STATIONS) {
    const sim = new Simulation(st, { disruptions: 'none' });
    for (const e of sim.traffic.timetable()) {
      assert.ok(CATEGORIES[e.cat], `${st.id}/${e.nr}: kategoria`);
      assert.equal(e.label, `${e.traction ? CATEGORIES[e.cat].code + e.traction : CATEGORIES[e.cat].label} ${e.nr}`);
      assert.ok(e.kind !== 'tow' || CATEGORIES[e.cat].code, `${st.id}/${e.nr}: towarowy z rodzajem PKP PLK`);
      assert.doesNotMatch(e.label, /^(TOW|ZD) /, `${st.id}/${e.nr}: „TOW” i „ZD” nie są kategoriami PKP PLK`);
      if (/zdawcz/i.test(e.name)) assert.equal(e.cat, 'TK', `${st.id}/${e.nr}: zdawczy`);
      // skład towarowy ma lokomotywę na jednym końcu: nie wraca z toru jako nowy pociąg w drugą stronę bez jej
      // przestawienia (Dz.U. 2015 poz. 360 §12 ust. 4; Ir-1 §66), a tego gra nie odwzorowuje – wolno tylko lokomotywie luzem
      if (e.unit != null) assert.ok(e.kind !== 'tow' || e.cat === 'LT', `${st.id}/${e.nr}: pociąg towarowy z lokomotywą jako nowy pociąg ze składu ${e.unit}`);
      if (/gdynia|sopot/.test(st.id)) assert.ok(/ – /.test(relationOf(e)), `${st.id}/${e.nr}: relacja „${e.name}” bez stacji początkowej i końcowej`);
    }
  }
  const tt = new Simulation(sopot, { disruptions: 'none' }).traffic.timetable();
  const ic = tt.find((e) => e.nr === 5100), skm = tt.find((e) => e.cat === 'SKM'), tow = tt.find((e) => e.kind === 'tow');
  assert.equal(ic.cat, 'IC'); assert.equal(speedFor(ic), 160); assert.equal(relationOf(ic), 'Kraków Gł. – Gdynia Gł.'); assert.equal(brandOf(ic), 'Kaszub');
  assert.equal(speedFor(skm), 120);
  if (tow) assert.ok(speedFor(tow) <= 100);
});

test('szybki pociąg (IC 160 km/h) zatrzymuje się przy peronie: horyzont hamowania i prędkość drogowa na stacji', () => {
  // Stare Pustkowie: osobowy 5310 jako IC 160 km/h – wjazd z szlaku 100 km/h, postój na torze 1 (pociąg zmieniony
  // w rozkładzie zmiany – definicja wpisu jest tylko do odczytu)
  const ic = ({ vmax, ...t }) => ({ ...t, name: 'IC Warszawa – Gdańsk', cat: 'IC' });
  const timetable = makeSim().station.timetable.map((t) => (t.nr === 5310 ? ic(t) : t));
  const sim = makeSim({ scenario: { id: 't', name: 't', timetable } });
  const e = sim.traffic.entry(5310);
  // IC bez taboru jedzie wg kategorii (tabor to część planu wpisu)
  e.rollingStock = null;
  play(sim).until('06:20');
  assert.equal(e.train?.vmax, 160 / 3.6, 'pociąg jedzie jako IC');
  assert.ok(e.actualArr != null, 'IC zatrzymał się na stacji (postój handlowy)');
  assert.equal(String(e.actualTrack), '1');
  assert.equal(e.phase, 'at-neighbour');
});

/*
 * Rodzaje pociągów towarowych i pojazdów luzem – PKP PLK, Regulamin sieci 2025/2026, zał. 6.3 „Klasyfikacja pociągów
 * stosowana w konstrukcji rozkładów jazdy” (aktualizacja z 15.09.2026, s. 9–13): B1 TC/TG/TR, B2 TD/TM/TN/TK/TS/TH,
 * C LT; trzecia litera – trakcja, tylko te z tablic załącznika.
 */
const SOURCE_TRACTIONS = {
  TC: ['E', 'S'], TG: ['E', 'S'], TR: ['E', 'S'],
  TD: ['E', 'S'], TM: ['E', 'S'], TN: ['E', 'S'], TK: ['P', 'E', 'S'], TS: ['E', 'J', 'S', 'M'], TH: ['E', 'S'],
  LT: ['P', 'E', 'S'],
};

test('rodzaje pociągów towarowych z zał. 6.3: kody, trakcje z tablic, etykieta z trakcją wpisu', () => {
  const coded = Object.entries(CATEGORIES).filter(([, c]) => c.code);
  assert.deepEqual(Object.fromEntries(coded.map(([k, c]) => [k, c.tractions])), SOURCE_TRACTIONS);
  for (const [k, c] of coded) {
    assert.equal(c.code, k, `${k}: klucz to rodzaj pociągu`);
    assert.equal(c.label, `${k}E`, `${k}: domyślnie trakcja elektryczna`);
  }
  assert.equal(trainLabel({ nr: 44702, name: 'Towarowy', kind: 'tow', cat: 'TD' }), 'TDE 44702');
  assert.equal(trainLabel({ nr: 44702, name: 'Towarowy', kind: 'tow', cat: 'TD', traction: 'S' }), 'TDS 44702');
  assert.equal(trainLabel({ nr: 44660, name: 'Lokomotywa luzem', kind: 'tow', traction: 'S' }), 'LTS 44660');
  assert.equal(trainLabel({ nr: 1, name: 'Towarowy', kind: 'tow', cat: 'TM', traction: 'S', catLabel: 'XYZ' }), 'XYZ 1', 'catLabel nadpisuje');
  assert.equal(trainLabel({ nr: 5100, name: 'IC Kraków – Gdynia', kind: 'os', traction: 'S' }), 'IC 5100', 'osobowe – etykieta handlowa');
});

test('dynamika a masa: przyspieszenie kategorii przy masie odniesienia, cięższy wolniej (w granicach), hamowanie bez zmian', () => {
  const tm = CATEGORIES.TM;
  const dyn = (extra) => dynamicsFor({ name: 'Towarowy', kind: 'tow', ...extra });
  // bez masy – jak dotąd (wartości kategorii)
  assert.deepEqual(dyn({}), { accel: tm.accel, brake: tm.brake });
  assert.deepEqual(dyn({ mass: tm.refMass }), { accel: tm.accel, brake: tm.brake });
  // przyspieszenie odwrotnie proporcjonalne do masy
  assert.ok(Math.abs(dyn({ mass: 2 * tm.refMass * 0.75 }).accel - tm.accel / 1.5) < 1e-12);
  assert.ok(dyn({ mass: 3000 }).accel < dyn({ mass: 2000 }).accel && dyn({ mass: 2000 }).accel < dyn({ mass: 1500 }).accel);
  // granice: bardzo ciężki nie staje w miejscu, lekki nie przyspiesza jak lokomotywa luzem
  assert.equal(dyn({ mass: 100000 }).accel, tm.accel * MASS_ACCEL_MIN);
  assert.equal(dyn({ mass: 50 }).accel, tm.accel * MASS_ACCEL_MAX);
  // hamowanie nie zależy od masy (Ir-1 §21: wymagany procent masy hamującej)
  for (const mass of [300, 2000, 4000]) assert.equal(dyn({ mass }).brake, tm.brake);
  // `accel` / `brake` wpisu mają pierwszeństwo
  assert.deepEqual(dyn({ mass: 4000, accel: 0.2, brake: 0.4 }), { accel: 0.2, brake: 0.4 });
  // lokomotywa luzem i osobowe – masa nie ma znaczenia (bez masy odniesienia)
  assert.equal(dynamicsFor({ name: 'Lokomotywa luzem', kind: 'tow', mass: 5000 }).accel, CATEGORIES.LT.accel);
  assert.equal(dynamicsFor({ name: 'IC X – Y', kind: 'os', mass: 5000 }).accel, CATEGORIES.IC.accel);
});

test('cięższy pociąg towarowy rusza wolniej: po minucie od zatrzymania jedzie wolniej i przejechał mniej', () => {
  function start(mass) {
    const s = new Simulation(szkolna, { scenario: { id: 't', name: 't', endTime: '09:00', trains: [] }, disruptions: 'none' });
    assert.ok(s.ilk.setRoute('A-D1').ok);
    for (let i = 0; i < 16; i++) s.step(0.5);
    const tr = new Train({ nr: 'X1', kind: 'tow', name: 'Towarowy', length: 400, vmax: 80, mass, stop: false }, s.ilk.topo, s.ilk, { lineSpeed: 100 });
    tr.placeOnLine('W', 3000);
    tr.v = 0;
    s.traffic.trains.push(tr);
    const head0 = tr.head;
    for (let i = 0; i < 120; i++) s.step(0.5);
    return { v: tr.v, dist: tr.head - head0, brake: tr.brake };
  }
  const light = start(1000), heavy = start(3000);
  assert.ok(heavy.v < light.v && heavy.dist < light.dist, `ciężki ${heavy.v.toFixed(1)} m/s, ${heavy.dist.toFixed(0)} m; lekki ${light.v.toFixed(1)} m/s, ${light.dist.toFixed(0)} m`);
  assert.ok(Math.abs(heavy.v - 60 * CATEGORIES.TM.accel * (2000 / 3000)) < 0.01, 'v = a·t z przyspieszeniem przeliczonym na masę');
  assert.equal(heavy.brake, light.brake);
});

test('walidacja wpisu rozkładu: kategoria, trakcja, długość i masa', () => {
  const base = { ...szkolna, timetable: [] };
  const check = (entry) => validateStation({ ...base, timetable: [{ nr: 1, from: 'W', to: 'E', arr: '07:00', track: '1', stop: false, ...entry }] });
  const errs = (entry) => check(entry).errors;
  const tow = { kind: 'tow', name: 'Towarowy', length: 400 };
  assert.deepEqual(errs({ ...tow, cat: 'TD', traction: 'S', mass: 1200 }), []);
  assert.deepEqual(errs({ ...tow, cat: 'TOW', mass: 2000 }), [], 'dawny klucz TOW = TM');
  assert.ok(errs({ ...tow, cat: 'TX' }).some((e) => /nieznana kategoria cat='TX'/.test(e)));
  assert.ok(errs({ ...tow, cat: 'TM', traction: 'J' }).some((e) => /trakcja 'J' niedozwolona dla TM \(dozwolone: E\/S\)/.test(e)), 'TMJ nie istnieje w zał. 6.3');
  assert.deepEqual(errs({ ...tow, cat: 'TS', traction: 'J' }), [], 'TSJ jest w zał. 6.3');
  assert.ok(errs({ kind: 'os', name: 'IC X – Y', length: 300, traction: 'S' }).some((e) => /trakcja 'S' niedozwolona dla IC/.test(e)));
  assert.ok(errs({ ...tow, length: 0 }).some((e) => /długość pociągu musi być liczbą dodatnią/.test(e)));
  assert.ok(errs({ ...tow, mass: -5 }).some((e) => /masa pociągu musi być liczbą dodatnią/.test(e)));
  assert.ok(errs({ ...tow, mass: '2000' }).some((e) => /masa pociągu musi być liczbą dodatnią/.test(e)));
  assert.ok(errs({ kind: 'os', name: 'Regio X – Y', length: 100, mass: 150 }).some((e) => /masa \(mass\) tylko dla pociągu towarowego/.test(e)));
  assert.ok(errs({ kind: 'tow', name: 'Lokomotywa luzem X – Y', length: 20, mass: 80 }).some((e) => /nie dla LT/.test(e)));
  // nacisk liniowy 71 kN/m ≈ 7,2 t/m
  assert.deepEqual(errs({ ...tow, mass: MAX_TONNES_PER_METRE * 400 }), []);
  assert.ok(errs({ ...tow, mass: MAX_TONNES_PER_METRE * 400 + 1 }).some((e) => /nacisk liniowy 71 kN\/m/.test(e)));
  // Ir-1 §19 ust. 4: pociąg nie dłuższy niż tor stacyjny (tor 1 Szkolnej: 60 + 520 + 60 m) – ostrzeżenie
  assert.ok(!check({ ...tow, length: 640 }).warnings.some((w) => /dłuższy niż tor/.test(w)));
  assert.ok(check({ ...tow, length: 641 }).warnings.some((w) => /pociąg 641 m dłuższy niż tor 1 \(640 m\)/.test(w)));
});

test('rozkłady stacji: towarowe z rodzajem PKP PLK, masą i długością w granicach, mieszczą się na torach; rodzaje i masy różne', () => {
  const codes = new Set(), masses = new Set(), lengths = new Set();
  for (const st of STATIONS) {
    const v = validateStation(st);
    assert.deepEqual(v.warnings.filter((w) => /dłuższy niż tor/.test(w)), [], st.id);
    for (const e of st.timetable || []) {
      if (e.kind !== 'tow') continue;
      const c = CATEGORIES[categoryOf(e)];
      assert.ok(SOURCE_TRACTIONS[c.code], `${st.id}/${e.nr}: rodzaj z zał. 6.3`);
      assert.ok(e.length > 0 && e.length <= MAX_FREIGHT_LENGTH, `${st.id}/${e.nr}: długość ${e.length} m`);
      codes.add(categoryLabel(e));
      if (!c.refMass) { assert.equal(e.mass, undefined, `${st.id}/${e.nr}: ${c.code} bez masy składu`); continue; }
      assert.ok(e.mass > 0, `${st.id}/${e.nr}: masa brutto składu`);
      assert.ok(e.mass <= MAX_TONNES_PER_METRE * e.length, `${st.id}/${e.nr}: ${e.mass} t na ${e.length} m`);
      masses.add(e.mass); lengths.add(e.length);
    }
  }
  assert.ok(codes.size >= 5, `różne rodzaje pociągów towarowych: ${[...codes].join(', ')}`);
  assert.ok(masses.size >= 8 && lengths.size >= 6, `różne masy (${masses.size}) i długości (${lengths.size})`);
});
