import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CATEGORIES, categoryOf, speedFor, dynamicsFor, trainLabel, relationOf, brandOf } from '../src/model/categories.js';
import { STATIONS } from '../src/stations/index.js';
import { Simulation } from '../src/model/Simulation.js';
import { Train } from '../src/model/Train.js';
import sopot from '../src/stations/sopot.js';
import { makeSim, run, Clock } from './helpers.js';

test('kategoria pociągu z pola cat albo z nazwy/rodzaju; prędkość i dynamika wg kategorii, vmax wpisu nadpisuje', () => {
  assert.equal(categoryOf({ name: 'IC „Kaszub” Kraków Gł. – Gdynia Gł.', kind: 'os' }), 'IC');
  assert.equal(categoryOf({ name: 'TLK Hel – Warszawa Wsch.', kind: 'os' }), 'TLK');
  assert.equal(categoryOf({ name: 'Regio Gdańsk Gł. – Słupsk', kind: 'os' }), 'R');
  assert.equal(categoryOf({ name: 'SKM Gdańsk Śródmieście – Wejherowo', kind: 'os' }), 'SKM');
  assert.equal(categoryOf({ name: 'Osobowy', kind: 'os' }), 'R');
  assert.equal(categoryOf({ name: 'Towarowy Gdynia Port – Gdańsk Port Płn.', kind: 'tow' }), 'TOW');
  assert.equal(categoryOf({ name: 'Towarowy próżny', kind: 'tow' }), 'TOWP');
  assert.equal(categoryOf({ name: 'Zdawczy', kind: 'tow' }), 'ZD');
  assert.equal(categoryOf({ name: 'Skład EZT Baza EZ Sopot – Gdynia Gł. (próżny)', kind: 'os' }), 'EZT');
  assert.equal(categoryOf({ name: 'cokolwiek', kind: 'os', cat: 'EIP' }), 'EIP');
  assert.equal(speedFor({ name: 'IC Kraków – Gdynia', kind: 'os' }), 160);
  assert.equal(speedFor({ name: 'SKM', kind: 'os' }), 120);
  assert.equal(speedFor({ name: 'Towarowy', kind: 'tow' }), 80);
  assert.equal(speedFor({ name: 'Towarowy', kind: 'tow', vmax: 60 }), 60);
  assert.ok(dynamicsFor({ name: 'Towarowy', kind: 'tow' }).accel < dynamicsFor({ name: 'SKM', kind: 'os' }).accel);
  assert.equal(trainLabel({ nr: 5100, name: 'IC Kraków – Gdynia', kind: 'os' }), 'IC 5100');
  assert.equal(trainLabel({ nr: 44561, name: 'Towarowy', kind: 'tow' }), 'TOW 44561');
  assert.equal(relationOf({ name: 'IC „Kaszub” Kraków Gł. – Gdynia Gł.' }), 'Kraków Gł. – Gdynia Gł.');
  assert.equal(brandOf({ name: 'IC „Kaszub” Kraków Gł. – Gdynia Gł.' }), 'Kaszub');
  assert.equal(relationOf({ name: 'Osobowy' }), 'Osobowy');
  for (const c of Object.values(CATEGORIES)) assert.ok(c.vmax > 0 && c.accel > 0 && c.brake > 0 && c.label);
});

test('rozkłady stacji trójmiejskich: pełne relacje, kategorie IC/TLK/R/SKM/TOW, prędkości zgodne z kategorią', () => {
  for (const st of STATIONS) {
    const sim = new Simulation(st, { disruptions: 'none' });
    for (const e of sim.traffic.timetable()) {
      assert.ok(CATEGORIES[e.cat], `${st.id}/${e.nr}: kategoria`);
      assert.equal(e.label, `${CATEGORIES[e.cat].label} ${e.nr}`);
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
  // Stare Pustkowie: osobowy 5310 jako IC 160 km/h – wjazd z szlaku 100 km/h, postój na torze 1
  const sim = makeSim();
  const e = sim.traffic.timetable().find((x) => x.nr === 5310);
  e.name = 'IC Warszawa – Gdańsk'; e.cat = 'IC'; delete e.vmax;
  let n = 0;
  const { autoDispatch } = { autoDispatch: null };
  const helpers = await_import();
  async function await_import() { return import('./helpers.js'); }
  return helpers.then(({ autoDispatch }) => {
    while (sim.clock.time < Clock.parse('06:20')) { sim.step(0.5); if (n++ % 4 === 0) autoDispatch(sim); }
    assert.equal(e.train?.vmax, 160 / 3.6, 'pociąg jedzie jako IC');
    assert.ok(e.actualArr != null, 'IC zatrzymał się na stacji (postój handlowy)');
    assert.equal(String(e.actualTrack), '1');
    assert.equal(e.status, 'na następnym posterunku');
  });
});
