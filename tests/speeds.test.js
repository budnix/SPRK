import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/model/Simulation.js';
import station from './fixtures/stare-pustkowie.js';
import gdansk from '../src/stations/gdansk-glowny.js';
import { run } from './helpers.js';

/*
 * Prędkości (audyt realizmu, grupa 3).
 * W21: sygnał zastępczy i rozkaz „S” pozwalają na jazdę do 40 km/h do następnego semafora (Ie-1 od 17.01.2026 §4 ust. 13
 * pkt 18; Ir-1 §63 ust. 5); przy wyjeździe na szlak bez SBL ograniczenie obowiązuje do końca rozjazdów, na szlaku z SBL –
 * do pierwszego semafora odstępowego (przyjęty umowny pierwszy odstęp).
 * W22: pociąg jedzie z największą prędkością dozwoloną na odcinku, na którym jest (Ie-1 §4 ust. 13 pkt 2) – na szlaku
 * wjazdowym z prędkością tego szlaku.
 */

const mk = (st = station) => new Simulation(st, { speed: 1 });
const kmh = (v) => v * 3.6;

/** Pociąg 5310 stoi przed A (bez przebiegu). */
function trainAtA(sim) {
  const w = sim.blocks.get('W');
  run(sim, 60 * 16, () => { if (w.request === 'theirs') w.press('Poz'); });
  const e = sim.traffic.timetable().find((x) => x.nr === 5310);
  assert.equal(e.train.stoppedAt?.signal, 'A');
  return e;
}

test('W21: na sygnał zastępczy pociąg jedzie do 40 km/h (nie 20) do następnego semafora', () => {
  const sim = mk();
  const e = trainAtA(sim);
  sim.ilk.toggleIndividualLock('Zw1');
  assert.ok(sim.ilk.substituteSignal('A').ok);
  let vmax = 0;
  run(sim, 240, () => { vmax = Math.max(vmax, kmh(e.train.v)); });
  assert.ok(vmax > 30 && vmax <= 40.5, `prędkość ${vmax.toFixed(1)} km/h`);
});

test('W21: rozkaz „S” – do 40 km/h, treść rozkazu podaje 40 km/h', () => {
  const sim = mk();
  const e = trainAtA(sim);
  sim.ilk.toggleIndividualLock('Zw1');
  const r = sim.traffic.issueOrder({ nr: 5310, signal: 'A' });
  assert.ok(r.ok, r.reason);
  assert.match(r.order.text, /40 km\/h/);
  let vmax = 0;
  run(sim, 240, () => { vmax = Math.max(vmax, kmh(e.train.v)); });
  assert.ok(vmax > 30 && vmax <= 40.5, `prędkość ${vmax.toFixed(1)} km/h`);
});

/** Pociąg 5310 stoi przed D1 po wjeździe; Sz na D1 i wyjazd na szlak do Dąbrowy Leśnej. */
function exitOnSz(sbl) {
  // wariant SBL: tor szlakowy do Dąbrowy Leśnej tylko wyjazdowy (jak na linii dwutorowej), bez pociągów od Dąbrowy
  const st = sbl ? { ...station, exits: { ...station.exits, E: { ...station.exits.E, block: 'sbl', direction: 'out' } },
    timetable: station.timetable.filter((t) => t.from !== 'E') } : station;
  const sim = mk(st);
  const e = trainAtA(sim);
  assert.ok(sim.ilk.setRoute('A-D1').ok);
  run(sim, 300);
  assert.equal(e.train.nextSignal(), 'D1');
  const b = sim.blocks.get('E'); b.request = null; b.direction = 'out'; b.permission = true;
  sim.ilk.toggleIndividualLock('Zw4');
  assert.ok(sim.ilk.substituteSignal('D1').ok);
  // prędkość na szlaku w funkcji drogi od granicy stacji
  const onLine = [];
  run(sim, 400, () => {
    const seg = e.train.trail.find((s) => s.virtual === 'E');
    if (seg) onLine.push([e.train.head - seg.start, kmh(e.train.v)]);
  });
  assert.ok(onLine.length, 'pociąg nie wyjechał na szlak');
  return onLine;
}

test('W21: wyjazd na szlak bez SBL na Sz – 40 km/h tylko do końca rozjazdów, dalej prędkość szlakowa', () => {
  const onLine = exitOnSz(false);
  const far = onLine.filter(([d]) => d > 600);
  assert.ok(far.some(([, v]) => v > 50), `na szlaku nadal ${Math.max(...onLine.map(([, v]) => v)).toFixed(1)} km/h`);
});

test('W21: wyjazd na szlak z SBL na Sz – 40 km/h przez pierwszy odstęp', () => {
  const onLine = exitOnSz(true);
  for (const [d, v] of onLine) if (d < 900) assert.ok(v <= 40.5, `${v.toFixed(1)} km/h po ${d.toFixed(0)} m szlaku`);
  assert.ok(onLine.some(([d, v]) => d > 1100 && v > 45), 'po pierwszym odstępie ograniczenie zostało');
});

test('W22: na szlaku wjazdowym pociąg jedzie z prędkością tego szlaku (Śródmieście 60 km/h), nie szlaku wyjazdowego', () => {
  const sim = new Simulation(gdansk, { scenario: { id: 't', name: 't', endTime: '09:00', trains: [93101] }, disruptions: 'none' });
  const e = sim.traffic.timetable()[0];
  let vmax = 0;
  run(sim, 30 * 60, () => { if (e.train && e.train.onLine('SR1')) vmax = Math.max(vmax, kmh(e.train.v)); });
  assert.ok(vmax > 0, 'pociąg nie pojawił się na szlaku');
  assert.ok(vmax <= 60.5, `na szlaku wjazdowym ${vmax.toFixed(1)} km/h`);
});

/*
 * W23, N2: ograniczenie z obrazu semafora (40 km/h) obowiązuje na całej drodze przebiegu, gdy przebieg prowadzi na tor
 * główny dodatkowy (Dz.U. 2015 poz. 360 §66 ust. 3) albo semafor wjazdowy kształtowy wskazuje Sr3 (§65 pkt 3) – nie tylko
 * do końca zwrotnic.
 */
async function maxOnTrack(st, scenario, nr, section) {
  const { AutoOperator } = await import('../src/model/Operator.js');
  const sim = new Simulation(st, { scenario: { ...scenario, trains: [nr] }, disruptions: 'none', seed: 1 });
  const op = new AutoOperator(sim, { district: null, role: 'full' });
  const e = sim.traffic.timetable()[0];
  let vmax = 0, n = 0;
  for (let i = 0; i < 2 * 3600 * 2 && !e.train?.hasStopped; i++) {
    sim.step(0.5); if (n++ % 4 === 0) op.tick();
    if (e.train?.occupiedSections().has(section)) vmax = Math.max(vmax, kmh(e.train.v));
  }
  assert.ok(e.train?.hasStopped, `pociąg ${nr} nie dojechał`);
  return vmax;
}

test('W23: na torze głównym dodatkowym (Jodłowa, tor 3) pociąg po S13 nie przyspiesza za rozjazdami', async () => {
  const jodlowa = (await import('../src/stations/jodlowa.js')).default;
  assert.equal(jodlowa.sections.T3.mainKind, 'dodatkowy');
  const v = await maxOnTrack(jodlowa, { id: 't', name: 't', endTime: '10:00' }, 6612, 'T3');
  assert.ok(v > 20 && v <= 40.5, `na torze 3: ${v.toFixed(1)} km/h`);
});

test('N2: Sr3 na kształtowym semaforze wjazdowym – 40 km/h na całej drodze przebiegu (także poza torem dodatkowym)', async () => {
  const szkolna = (await import('../src/stations/szkolna.js')).default;
  // tor 2 bez oznaczenia „dodatkowy” – działa sama reguła Sr3 na semaforze wjazdowym
  const st = { ...szkolna, sections: { ...szkolna.sections, T2: { ...szkolna.sections.T2, mainKind: undefined } } };
  const mech = szkolna.scenarios.find((s) => s.srk === 'mech');
  const v = await maxOnTrack(st, { ...mech, disruptions: 'none' }, 6103, 'T2');
  assert.ok(v > 20 && v <= 40.5, `na torze 2 po Sr3: ${v.toFixed(1)} km/h`);
});
