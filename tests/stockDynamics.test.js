import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ROLLING_STOCK, STOCK_KINDS, COACH_LENGTH, COACH_MASS, LOCO_ACCEL_MAX, stockFor, trailingMass, trainDynamics } from '../src/model/rollingStock.js';
import { CATEGORIES, dynamicsFor, speedFor } from '../src/model/categories.js';
import { Simulation } from '../src/model/Simulation.js';
import { Train, EMERGENCY_BRAKE } from '../src/model/Train.js';
import { AutoOperator } from '../src/model/Operator.js';
import { STATIONS } from '../src/stations/index.js';
import szkolna from '../src/stations/szkolna.js';

/*
 * Dynamika z taboru (rollingStock.trainDynamics): zespół trakcyjny – przyspieszenie rozruchu i hamowanie typu;
 * lokomotywa – siła rozruchowa / (masa lokomotywy + masa ciągnięta); prędkość typu ogranicza pociąg, gdy jest mniejsza.
 * Pociąg w ruchu ma ten sam tabor, który pokazuje panel (stockFor z rozkładem i ziarnem zmiany).
 */

const ids = Object.keys(ROLLING_STOCK);
const units = ids.filter((id) => STOCK_KINDS[ROLLING_STOCK[id].kind].unit);
const locos = ids.filter((id) => !STOCK_KINDS[ROLLING_STOCK[id].kind].unit);
const set = (id, count = 1) => ({ id, count });
const station = (id) => STATIONS.find((s) => s.id === id);

test('katalog: dynamika typów – liczby dodatnie albo null (brak w źródle → wartość kategorii), hamowanie poniżej nagłego', () => {
  for (const id of units) {
    const t = ROLLING_STOCK[id];
    for (const k of ['accel', 'brake']) assert.ok(t[k] === null || (t[k] > 0 && t[k] < 2), `${id}.${k}: ${t[k]}`);
    if (t.brake != null) assert.ok(t.brake < EMERGENCY_BRAKE, `${id}: hamowanie służbowe ${t.brake} < nagłe ${EMERGENCY_BRAKE}`);
  }
  for (const id of locos) {
    const t = ROLLING_STOCK[id];
    for (const k of ['tractive', 'mass', 'bufferLength']) assert.ok(t[k] === null || t[k] > 0, `${id}.${k}: ${t[k]}`);
    assert.equal(t.length, undefined, `${id}: lokomotywa – długość pojazdu w bufferLength, nie length (długość zespołu)`);
  }
  assert.ok(units.some((id) => ROLLING_STOCK[id].accel != null), 'co najmniej jeden zespół z przyspieszeniem ze źródła');
  assert.ok(locos.filter((id) => ROLLING_STOCK[id].tractive != null && ROLLING_STOCK[id].mass != null).length >= 5, 'lokomotywy z siłą i masą ze źródła');
  assert.equal(COACH_LENGTH, 26.4);
  assert.ok(COACH_MASS > 20 && COACH_MASS < 70, `masa wagonu ${COACH_MASS} t`);
});

test('zespół trakcyjny: przyspieszenie rozruchu i hamowanie typu (null – kategorii); dwa zespoły jak jeden', () => {
  const regio = { nr: 1, kind: 'os', name: 'Regio A – B', length: 130 };
  const skm = { nr: 2, kind: 'os', name: 'SKM A – B', length: 130 };
  for (const id of units) {
    const t = ROLLING_STOCK[id];
    const e = t.pools.includes('skm') ? skm : regio;
    const cat = CATEGORIES[t.pools.includes('skm') ? 'SKM' : 'R'];
    const d = trainDynamics(e, set(id));
    assert.equal(d.accel, t.accel ?? cat.accel, `${id}: przyspieszenie`);
    assert.equal(d.brake, t.brake ?? cat.brake, `${id}: hamowanie`);
    // kilka zespołów – każdy z własnym napędem: to samo przyspieszenie i hamowanie
    assert.deepEqual(trainDynamics(e, set(id, 2)), d, `${id}: 2 zespoły`);
  }
  // typy różnią się dynamiką – nie wszystkie zespoły jadą jak kategoria
  assert.ok(new Set(units.map((id) => trainDynamics(regio, set(id)).accel)).size >= 3, 'różne przyspieszenia zespołów');
});

test('lokomotywa z wagonami: a = siła rozruchowa / (masa lokomotywy + wagonów), dłuższy pociąg wolniej, najwyżej LOCO_ACCEL_MAX', () => {
  const pass = locos.filter((id) => ROLLING_STOCK[id].pools.includes('ic') && ROLLING_STOCK[id].tractive != null && ROLLING_STOCK[id].mass != null && ROLLING_STOCK[id].bufferLength != null);
  assert.ok(pass.length >= 2, `lokomotywy pasażerskie z danymi: ${pass}`);
  for (const id of pass) {
    const t = ROLLING_STOCK[id];
    const ic = (length) => ({ nr: 5100, kind: 'os', name: 'IC A – B', length });
    const coaches = Math.round((300 - t.bufferLength) / COACH_LENGTH);
    assert.equal(trailingMass(ic(300), t), coaches * COACH_MASS, `${id}: ${coaches} wagonów`);
    const a300 = trainDynamics(ic(300), set(id)).accel;
    assert.ok(Math.abs(a300 - Math.min(LOCO_ACCEL_MAX, t.tractive / (t.mass + coaches * COACH_MASS))) < 1e-12, `${id}: ${a300}`);
    assert.ok(trainDynamics(ic(350), set(id)).accel < trainDynamics(ic(200), set(id)).accel, `${id}: więcej wagonów – wolniej`);
    assert.equal(trainDynamics(ic(300), set(id)).brake, CATEGORIES.IC.brake, `${id}: hamowanie kategorii (Ir-1 §21)`);
  }
  // lokomotywa luzem: siła / masa lokomotywy przekracza granicę – granica
  const lt = { nr: 1, kind: 'tow', name: 'Lokomotywa luzem A – B', length: 20 };
  const strong = locos.find((id) => ROLLING_STOCK[id].tractive / ROLLING_STOCK[id].mass > LOCO_ACCEL_MAX);
  assert.ok(strong);
  assert.equal(trainDynamics(lt, set(strong)).accel, LOCO_ACCEL_MAX);
});

test('pociąg towarowy: cięższy skład tą samą lokomotywą przyspiesza wolniej; hamowanie kategorii', () => {
  const freight = locos.filter((id) => ROLLING_STOCK[id].pools.includes('freight') && ROLLING_STOCK[id].tractive != null && ROLLING_STOCK[id].mass != null);
  assert.ok(freight.length >= 4, `lokomotywy towarowe z danymi: ${freight}`);
  for (const id of freight) {
    const t = ROLLING_STOCK[id];
    const tm = (mass) => ({ nr: 1, kind: 'tow', cat: 'TM', name: 'Towarowy', length: 500, mass });
    assert.ok(Math.abs(trainDynamics(tm(2000), set(id)).accel - Math.min(LOCO_ACCEL_MAX, t.tractive / (t.mass + 2000))) < 1e-12, id);
    assert.ok(trainDynamics(tm(3000), set(id)).accel < trainDynamics(tm(1000), set(id)).accel, `${id}: cięższy wolniej`);
    assert.equal(trainDynamics(tm(3000), set(id)).brake, CATEGORIES.TM.brake);
  }
  // silniejsza lokomotywa rusza ten sam skład szybciej
  const byForce = [...freight].sort((a, b) => ROLLING_STOCK[a].tractive - ROLLING_STOCK[b].tractive);
  const weak = byForce[0], strong = byForce.at(-1);
  const tm = { nr: 1, kind: 'tow', cat: 'TM', name: 'Towarowy', length: 500, mass: 2500 };
  assert.ok(trainDynamics(tm, set(strong)).accel > trainDynamics(tm, set(weak)).accel, `${strong} szybciej niż ${weak}`);
});

test('prędkość: typ wolniejszy niż pociąg ogranicza; typ bez prędkości w źródle albo szybszy – prędkość pociągu', () => {
  const slow = units.find((id) => ROLLING_STOCK[id].vmax != null && ROLLING_STOCK[id].vmax < 120 && ROLLING_STOCK[id].pools.includes('skm'));
  const fast = units.find((id) => ROLLING_STOCK[id].vmax > 120 && ROLLING_STOCK[id].pools.includes('skm'));
  const unknown = units.find((id) => ROLLING_STOCK[id].vmax == null);
  const skm = { nr: 2, kind: 'os', name: 'SKM A – B', length: 130 };
  assert.equal(speedFor(skm), 120);
  assert.equal(trainDynamics(skm, set(slow)).vmax, ROLLING_STOCK[slow].vmax, slow);
  assert.equal(trainDynamics(skm, set(fast)).vmax, 120, fast);
  assert.equal(trainDynamics(skm, set(unknown)).vmax, 120, unknown);
  assert.equal(trainDynamics({ ...skm, vmax: 80 }, set(fast)).vmax, 80, '`vmax` wpisu niższy – wpis');
});

test('bez taboru albo bez danych typu – dynamika kategorii; `accel` / `brake` wpisu mają pierwszeństwo', () => {
  const tm = { nr: 1, kind: 'tow', cat: 'TM', name: 'Towarowy', length: 500, mass: 2500 };
  assert.deepEqual(trainDynamics(tm, null), { vmax: speedFor(tm), ...dynamicsFor(tm), power: null });
  const loco = locos.find((id) => ROLLING_STOCK[id].pools.includes('freight') && ROLLING_STOCK[id].tractive != null);
  const d = trainDynamics({ ...tm, accel: 0.05, brake: 0.25 }, set(loco));
  assert.equal(d.accel, 0.05); assert.equal(d.brake, 0.25);
  assert.equal(d.power, null, '`accel` wpisu – stałe przyspieszenie, bez ograniczenia mocą');
  const unit = units.find((id) => ROLLING_STOCK[id].accel != null);
  const r = trainDynamics({ nr: 2, kind: 'os', name: 'Regio A – B', length: 130, accel: 0.33, brake: 0.44 }, set(unit));
  assert.equal(r.accel, 0.33); assert.equal(r.brake, 0.44);
});

test('pociąg w ruchu ma tabor z panelu (stockFor, ten sam rozkład i ziarno) i dynamikę z tego taboru', () => {
  const seen = new WeakSet();
  let checked = 0;
  for (const [id, seed] of [['gdynia-glowna', 3], ['tczew', 4], ['sopot', 5], ['reda', 6]]) {
    const sim = new Simulation(station(id), { scenario: 'zmiana', disruptions: 'none', seed });
    const op = new AutoOperator(sim, { district: null, role: 'full' });
    for (let i = 0; i < 2 * 3600 * 2; i++) {
      sim.step(0.5);
      if (i % 2 === 0) op.tick();
      for (const e of sim.traffic.timetable()) {
        const tr = e.train;
        if (!tr || seen.has(tr) || tr.mode !== 'train') continue;
        seen.add(tr);
        const panel = stockFor(e, sim.traffic.timetable(), sim.seed);
        assert.deepEqual(tr.stock, panel, `${id}/${e.nr}: tabor w ruchu = tabor w panelu`);
        const d = trainDynamics(e, panel);
        assert.equal(tr.accel, d.accel, `${id}/${e.nr}: przyspieszenie`);
        assert.equal(tr.brake, d.brake, `${id}/${e.nr}: hamowanie`);
        assert.equal(tr.power, d.power, `${id}/${e.nr}: moc na tonę`);
        assert.ok(Math.abs(tr.vmax * 3.6 - d.vmax) < 1e-9, `${id}/${e.nr}: prędkość`);
        checked++;
      }
    }
  }
  assert.ok(checked > 40, `sprawdzone pociągi: ${checked}`);
});

test('przekazanie składu jako inny pociąg: ten sam tabor, dynamika z nowego wpisu (np. inna masa)', () => {
  const loco = locos.find((id) => ROLLING_STOCK[id].pools.includes('freight') && ROLLING_STOCK[id].tractive != null && ROLLING_STOCK[id].mass != null && ROLLING_STOCK[id].tractive / (ROLLING_STOCK[id].mass + 2400) < LOCO_ACCEL_MAX);
  const a = { nr: 1, kind: 'tow', cat: 'TM', name: 'Towarowy', length: 500, mass: 2400, vmax: 80, stock: loco };
  const b = { nr: 2, kind: 'tow', cat: 'TN', name: 'Towarowy', length: 300, mass: 600, vmax: 100, unit: 1 };
  const s = new Simulation(szkolna, { scenario: { id: 't', name: 't', endTime: '09:00', trains: [] }, disruptions: 'none' });
  const tr = new Train(a, s.ilk.topo, s.ilk, { stock: stockFor(a, [a, b], 1) });
  assert.equal(tr.stock.id, loco);
  assert.equal(tr.accel, trainDynamics(a, tr.stock).accel);
  tr.def = b; tr.applyDynamics(b);
  assert.ok(tr.accel > trainDynamics(a, tr.stock).accel, 'lżejszy skład – szybciej');
  assert.equal(tr.accel, trainDynamics(b, tr.stock).accel);
  assert.equal(tr.brake, CATEGORIES.TN.brake);
});

test('cięższy pociąg z lokomotywą rusza wolniej także w symulacji: po minucie jedzie wolniej', () => {
  const loco = locos.find((id) => ROLLING_STOCK[id].pools.includes('freight') && ROLLING_STOCK[id].tractive != null && ROLLING_STOCK[id].mass != null);
  function start(mass) {
    const s = new Simulation(szkolna, { scenario: { id: 't', name: 't', endTime: '09:00', trains: [] }, disruptions: 'none' });
    assert.ok(s.ilk.setRoute('A-D1').ok);
    for (let i = 0; i < 16; i++) s.step(0.5);
    const def = { nr: 'X1', kind: 'tow', cat: 'TM', name: 'Towarowy', length: 400, vmax: 80, mass, stop: false };
    const tr = new Train(def, s.ilk.topo, s.ilk, { lineSpeed: 100, stock: set(loco) });
    tr.placeOnLine('W', 3000);
    tr.v = 0;
    s.traffic.trains.push(tr);
    for (let i = 0; i < 120; i++) s.step(0.5);
    return tr;
  }
  const light = start(800), heavy = start(2800);
  assert.ok(heavy.v < light.v, `${loco}: ciężki ${heavy.v.toFixed(1)} m/s, lekki ${light.v.toFixed(1)} m/s`);
  // krok po kroku: przyspieszenie min(siła / masa, moc / (masa · v)) – wolniej niż stałe przyspieszenie przy ruszaniu
  const d = trainDynamics(heavy.def, heavy.stock);
  let v = 0;
  for (let i = 0; i < 120; i++) v = Math.min(80 / 3.6, v + Math.min(d.accel, d.power / Math.max(v, 0.1)) * 0.5);
  assert.ok(Math.abs(heavy.v - v) < 0.01, `v = ${heavy.v} m/s, oczekiwane ${v}`);
  assert.ok(heavy.v < 60 * d.accel, 'moc ogranicza przyspieszenie przy prędkości');
});

test('moc ogranicza przyspieszenie przy prędkości: EN57 do 100 km/h wolniej niż ze stałym przyspieszeniem, nie dłużej niż w źródle', () => {
  // źródło (docs/SOURCES.md, Medcom „EN57AKM”): EN57 – przyspieszenie 0÷40 km/h 0,5 m/s², rozpędzanie do 100 km/h 120 s
  const en57 = ROLLING_STOCK.EN57;
  assert.equal(en57.accel, 0.5);
  const d = trainDynamics({ nr: 1, kind: 'os', name: 'SKM A – B', length: 130 }, set('EN57', 2));
  assert.equal(d.power, en57.power / en57.mass, 'dwa zespoły – moc i masa razy dwa');
  const s = new Simulation(szkolna, { scenario: { id: 't', name: 't', endTime: '09:00', trains: [] }, disruptions: 'none' });
  const tr = new Train({ nr: 'X2', kind: 'os', name: 'SKM A – B', length: 130, vmax: 100, stop: false }, s.ilk.topo, s.ilk, { stock: set('EN57', 2) });
  let v = 0, t = 0;
  while (v < 100 / 3.6 - 1e-9) { v = Math.min(100 / 3.6, v + tr.accelAt(v) * 0.5); t += 0.5; }
  assert.ok(t > (100 / 3.6) / en57.accel + 10, `EN57 0–100 km/h: ${t} s (stałe przyspieszenie: ${((100 / 3.6) / en57.accel).toFixed(0)} s)`);
  assert.ok(t <= 120, `EN57 0–100 km/h: ${t} s, źródło: 120 s (bez oporów ruchu – szybciej)`);
  // zespół nowszy (moc / masa większa) rozpędza się szybciej
  const impuls = new Train({ nr: 'X3', kind: 'os', name: 'SKM A – B', length: 150, vmax: 100, stop: false }, s.ilk.topo, s.ilk, { stock: set('31WE', 2) });
  assert.ok(impuls.accelAt(20) > tr.accelAt(20), '31WE przy 72 km/h przyspiesza mocniej niż EN57');
});

test('sąsiad wyprawia pociąg wg prędkości z taborem: TLK z 754 (100 km/h) wcześniej niż z prędkością TLK i szlaku', () => {
  // Gdynia Chylonia: szlak od Rumii 5,2 km, 120 km/h; TLK 5301 Hel – Warszawa (140 km/h) jedzie z lokomotywą 754 (100 km/h)
  const st = station('gdynia-chylonia');
  const sim = new Simulation(st, { scenario: 'zmiana', disruptions: 'none', seed: 1 });
  const e = sim.traffic.timetable().find((x) => x.nr === 5301);
  assert.equal(e.rollingStock.id, '754');
  const line = st.exits[e.from];
  assert.equal(line.lineSpeed, 120);
  const dep = (kmh) => e.arrTime - line.lineLength / (kmh / 3.6) - 90;
  assert.ok(Math.abs(e.neighbourDep - dep(100)) < 1e-6, `wyprawienie ${e.neighbourDep}, oczekiwane ${dep(100)} (100 km/h)`);
  assert.ok(e.neighbourDep < dep(120) - 20, 'wcześniej niż przy 120 km/h');
});

test('stałe przyspieszenie: typ bez mocy albo masy w źródle (EN71, 111Eo) i wpis z `accel` – bez ograniczenia mocą', () => {
  const skm = { nr: 1, kind: 'os', name: 'SKM A – B', length: 87 };
  const en71 = trainDynamics(skm, set('EN71'));
  assert.equal(ROLLING_STOCK.EN71.power, null);
  assert.equal(en71.power, null, 'EN71: brak mocy w źródle');
  assert.equal(en71.accel, CATEGORIES.SKM.accel, 'EN71: przyspieszenie kategorii');
  const tm = { nr: 2, kind: 'tow', cat: 'TM', name: 'Towarowy', length: 500, mass: 2000 };
  assert.equal(ROLLING_STOCK['111Eo'].mass, null);
  assert.equal(trainDynamics(tm, set('111Eo')).power, null, '111Eo: brak masy w źródle');
  const s = new Simulation(szkolna, { scenario: { id: 't', name: 't', endTime: '09:00', trains: [] }, disruptions: 'none' });
  for (const [def, stock] of [[skm, set('EN71')], [tm, set('111Eo')], [{ ...tm, accel: 0.2 }, set('ET22')]]) {
    const tr = new Train(def, s.ilk.topo, s.ilk, { stock });
    for (const v of [0, 5, 15, 30]) assert.equal(tr.accelAt(v), tr.accel, `${stock.id}${def.accel ? ' + accel wpisu' : ''}: ${v} m/s`);
  }
  // a z mocą – przy ruszaniu bez ograniczenia (v → 0 nie dzieli przez zero), wyżej mniej
  const et22 = new Train(tm, s.ilk.topo, s.ilk, { stock: set('ET22') });
  assert.equal(et22.accelAt(0), et22.accel);
  assert.ok(Number.isFinite(et22.accelAt(0)) && et22.accelAt(20) < et22.accel);
});
