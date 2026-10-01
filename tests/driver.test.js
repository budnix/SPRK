import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/model/Simulation.js';
import { AutoOperator } from '../src/model/Operator.js';
import { Train, EMERGENCY_BRAKE, DRIVER_MIN, DRIVER_MAX, EASE_SPEED, EASE_SHARE, driverFactor } from '../src/model/Train.js';
import { STATIONS } from '../src/stations/index.js';
import szkolna from '../src/stations/szkolna.js';
import { Clock } from './helpers.js';

/*
 * Hamowanie jak maszynista (Train.brakeCurve): planowane opóźnienie to część hamowania służbowego (każdy maszynista
 * trochę inaczej – z ziarna zmiany i numeru pociągu), z wyprzedzeniem na działanie hamulca i łagodnym dojazdem do
 * miejsca zatrzymania. Nagła zmiana sygnału na „Stój” – hamowanie służbowe, najwyżej nagłe (jak dotąd).
 */

/** Pociąg od Lipna (szlak 100 km/h) na semafor A w położeniu „Stój”; zapis drogi i prędkości do zatrzymania. */
function approachStop(driver, def = {}) {
  const s = new Simulation(szkolna, { scenario: { id: 't', name: 't', endTime: '09:00', trains: [] }, disruptions: 'none' });
  const tr = new Train({ nr: 'X1', kind: 'os', name: 'Osobowy', length: 120, vmax: 100, stop: false, ...def }, s.ilk.topo, s.ilk, { lineSpeed: 100, driver });
  tr.placeOnLine('W', 3000);
  s.traffic.trains.push(tr);
  const toA = () => tr.constraintsAhead(5000, true).find((c) => c.signal === 'A')?.dist;
  const log = [];
  let prev = tr.v;
  for (let i = 0; i < 4000 && !(tr.v === 0 && log.length); i++) {
    s.step(0.5);
    const d = toA();
    if (d != null) log.push({ d, v: tr.v, decel: (prev - tr.v) / 0.5 });
    prev = tr.v;
  }
  return { tr, log };
}

test('maszynista: współczynnik z ziarna zmiany i numeru pociągu – powtarzalny, w granicach, różny dla pociągów', () => {
  const seen = new Set();
  for (const nr of [6101, 6102, 44560, 'X1', 93151]) {
    for (const seed of [1, 2, 3, 123456789]) {
      const k = driverFactor(seed, nr);
      assert.equal(driverFactor(seed, nr), k, 'to samo ziarno – ten sam maszynista');
      assert.ok(k >= DRIVER_MIN && k <= DRIVER_MAX, `${seed}/${nr}: ${k}`);
      seen.add(k.toFixed(4));
    }
  }
  assert.ok(seen.size >= 15, `różni maszyniści: ${seen.size}`);
  // pociąg w zmianie dostaje maszynistę z ziarna zmiany – bez losowań zmiany (sim.rng)
  const sim = new Simulation(szkolna, { scenario: 'zmiana', disruptions: 'high', seed: 9 });
  const state = sim.rng.state;
  driverFactor(sim.seed, 6101);
  assert.equal(sim.rng.state, state);
});

test('maszynista hamuje wcześniej i łagodniej niż pełnym hamowaniem służbowym, staje przed semaforem, ostatnie metry wolno', () => {
  const full = approachStop(null);
  const driver = approachStop(0.7);
  const start = ({ log }) => log.find((x) => x.decel > 0.01)?.d;
  assert.ok(start(driver) > start(full) + 50, `początek hamowania: maszynista ${start(driver)?.toFixed(0)} m, dawniej ${start(full)?.toFixed(0)} m przed A`);
  for (const r of [full, driver]) {
    assert.equal(r.tr.v, 0);
    assert.ok(r.log.at(-1).d >= 0 && r.log.at(-1).d < 3, `staje przed semaforem: ${r.log.at(-1).d.toFixed(1)} m`);
    assert.ok(!r.tr.stoppedAt || r.tr.stoppedAt.kind !== 'spad');
  }
  // bez ostatniego kroku (z ok. 1 km/h do zatrzymania – pociąg staje w miejscu zatrzymania)
  const maxDecel = Math.max(...driver.log.filter((x) => x.v > 0).map((x) => x.decel));
  assert.ok(maxDecel <= driver.tr.brakePlan + 0.03, `opóźnienie maszynisty ${maxDecel.toFixed(2)} ≤ planowane ${driver.tr.brakePlan.toFixed(2)} m/s²`);
  assert.ok(driver.tr.brakePlan < driver.tr.brake, 'planowane mniejsze niż służbowe');
  // łagodny dojazd: poniżej EASE_SPEED opóźnienie najwyżej EASE_SHARE planowanego
  const ease = driver.log.filter((x) => x.v > 0.5 && x.v < EASE_SPEED - 0.05 && x.decel > 0);
  assert.ok(ease.length > 3, 'kilka kroków łagodnego dojazdu');
  for (const x of ease) assert.ok(x.decel <= EASE_SHARE * driver.tr.brakePlan + 0.03, `dojazd: ${x.decel.toFixed(3)} m/s² przy ${x.v.toFixed(2)} m/s`);
});

test('nagła zmiana na „Stój” z maszynistą: hamowanie służbowe, najwyżej nagłe – zatrzymanie przed semaforem, gdy droga wystarcza', () => {
  for (const d of [250, 450, 700]) {
    const s = new Simulation(szkolna, { scenario: { id: 't', name: 't', endTime: '09:00', trains: [] }, disruptions: 'none' });
    assert.ok(s.ilk.setRoute('A-D1').ok);
    for (let i = 0; i < 16; i++) s.step(0.5);
    const tr = new Train({ nr: 'X1', kind: 'os', name: 'Osobowy', length: 120, vmax: 100, stop: false }, s.ilk.topo, s.ilk, { lineSpeed: 100, driver: 0.6 });
    tr.placeOnLine('W', 1500);
    s.traffic.trains.push(tr);
    let dropped = false, maxDecel = 0, prev = tr.v, passed = false;
    for (let i = 0; i < 3000 && !(dropped && tr.v === 0); i++) {
      const x = tr.constraintsAhead(3000, true).find((c) => c.signal === 'A')?.dist;
      if (!dropped && x != null && x <= d) { assert.ok(s.execute({ type: 'signal-stop', signal: 'A', on: true }).ok); dropped = true; }
      s.step(0.5);
      maxDecel = Math.max(maxDecel, (prev - tr.v) / 0.5); prev = tr.v;
      if (tr.occupiedSections().has('T1')) passed = true;
    }
    assert.ok(maxDecel <= EMERGENCY_BRAKE + 0.05, `d=${d}: ${maxDecel.toFixed(2)} m/s²`);
    // z 100 km/h hamowanie nagłe (1,3 m/s²) potrzebuje ok. 300 m – od 450 m pociąg staje przed A
    if (d >= 450) assert.equal(passed, false, `d=${d}: przejechał A`);
  }
});

test('pełne zmiany z automatem i maszynistami: żaden pociąg nie mija semafora „Stój”, wszystkie dojeżdżają', () => {
  for (const [id, seed] of [['gdynia-glowna', 2], ['tczew', 3], ['sopot', 4], ['reda', 5], ['pruszcz-gdanski', 4]]) {
    const st = STATIONS.find((x) => x.id === id);
    const sim = new Simulation(st, { scenario: 'zmiana', disruptions: 'none', seed });
    const op = new AutoOperator(sim, { district: null, role: 'full' });
    const spads = [];
    sim.bus.on('score', (x) => { if (x.code === 'spad') spads.push(x.msg); });
    const end = Clock.parse(sim.scenario.endTime || '10:00') + 60 * 60;
    let n = 0;
    while (sim.clock.time < end) { sim.step(0.5); if (n++ % 4 === 0) op.tick(); }
    assert.deepEqual(spads, [], `${id}: semafor „Stój” minięty`);
    assert.ok(sim.traffic.trains.every((tr) => tr.driver != null), `${id}: każdy pociąg ma maszynistę`);
    assert.equal(sim.traffic.trains.filter((tr) => tr.stoppedAt?.kind === 'spad').length, 0, `${id}: pociąg za semaforem`);
    const stuck = sim.traffic.timetable().filter((e) => !(e.status === 'na następnym posterunku' || e.status === 'zakończył bieg' || String(e.status).startsWith('przekazany')));
    assert.deepEqual(stuck.map((e) => `${e.nr}: ${e.status}`), [], `${id}: pociągi bez obsługi`);
  }
});

test('hamowanie wg typu i masy: Impuls staje najkrócej, EN57 dłużej, ciężki towarowy jeszcze dłużej, skład G (750 m) najdłużej', () => {
  const s = new Simulation(szkolna, { scenario: { id: 't', name: 't', endTime: '09:00', trains: [] }, disruptions: 'none' });
  const k = 0.7;
  const train = (def, stock) => new Train({ nr: 'X', stop: false, ...def }, s.ilk.topo, s.ilk, { stock: { id: stock, count: 1 }, driver: k });
  const v = 80 / 3.6;
  const skm = { kind: 'os', name: 'SKM A – B', length: 130 };
  const impuls = train(skm, '31WE'), en57 = train(skm, 'EN57');
  const tm = (mass, length) => train({ kind: 'tow', cat: 'TM', name: 'Towarowy', length, mass }, 'ET22');
  const light = tm(600, 500), heavy = tm(3000, 500), longG = tm(3000 * 750 / 500, 750);
  const d = (tr) => tr.brakingDistance(v);
  // EMU: typ z danymi (31WE – wymaganie SKM) hamuje mocniej niż EN57 (droga hamowania z Ie-4)
  assert.ok(impuls.brake > en57.brake, `31WE ${impuls.brake} > EN57 ${en57.brake}`);
  assert.ok(d(impuls) < d(en57), `droga 31WE ${d(impuls).toFixed(0)} m < EN57 ${d(en57).toFixed(0)} m`);
  // towarowy: cięższy na metr składu – mniejszy procent masy hamującej; skład ponad 700 m – nastawienie G, dłuższe narastanie
  assert.ok(heavy.brake < light.brake, `3000 t ${heavy.brake.toFixed(2)} < 600 t ${light.brake.toFixed(2)} m/s²`);
  assert.ok(d(en57) < d(light) && d(light) < d(heavy) && d(heavy) < d(longG), `drogi: EN57 ${d(en57).toFixed(0)}, 600 t ${d(light).toFixed(0)}, 3000 t ${d(heavy).toFixed(0)}, 750 m G ${d(longG).toFixed(0)} m`);
  assert.ok(longG.brakeDelay > heavy.brakeDelay, 'G – dłuższe narastanie hamowania');
  // luzowanie przed zatrzymaniem: zespół i krótki skład tak, towarowy dłuższy niż 300 m nie (ALZA-W2 §40–41)
  assert.equal(impuls.ease, true);
  assert.equal(heavy.ease, false);
  assert.equal(tm(400, 220).ease, true);
  // bez luzowania długi towarowy dojeżdża do zatrzymania stałym opóźnieniem: krzywa = sqrt(2·a·d) przy małej prędkości
  assert.ok(heavy.brakeCurve(0, 5) > en57.brakeCurve(0, 5) || heavy.brakePlan > en57.brakePlan * 0.5);
  // hamowanie służbowe zawsze poniżej nagłego
  for (const tr of [impuls, en57, light, heavy, longG]) assert.ok(tr.brake < EMERGENCY_BRAKE && tr.brakePlan < tr.brake);
});
