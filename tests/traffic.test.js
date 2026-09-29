import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeSim, run, Clock, autoDispatch } from './helpers.js';

test('pełna zmiana: wszystkie pociągi przejeżdżają bez opóźnień i rozpruć', () => {
  const sim = makeSim();
  const end = Clock.parse('08:40');
  let n = 0;
  while (sim.clock.time < end) { sim.step(0.5); if (n++ % 4 === 0) autoDispatch(sim); }
  const tt = sim.traffic.timetable();
  for (const e of tt) {
    if (e.terminates) { assert.ok(e.status.startsWith('przekazany'), `pociąg ${e.nr}: ${e.status}`); assert.equal(e.actualTrack, '2'); continue; }
    assert.equal(e.status, 'na następnym posterunku', `pociąg ${e.nr}: ${e.status}`);
    assert.ok(e.delay <= 2, `pociąg ${e.nr} opóźniony ${e.delay} min`);
    if (e.from) assert.equal(String(e.actualTrack), String(e.track), `pociąg ${e.nr} na złym torze`);
  }
  for (const t of sim.traffic.tasks) assert.equal(t.done, true, `zadanie ${t.id} niewykonane`);
  assert.ok(sim.ended, 'zmiana powinna się zakończyć');
  assert.equal(sim.ilk.counters.rozprucie, 0);
  assert.equal(sim.ilk.active.size, 0, 'wszystkie przebiegi rozwiązane');
  for (const b of sim.blocks.values()) assert.equal(b.occupied, false);
});

test('pociąg zatrzymuje się przed semaforem Stój i rusza po nastawieniu przebiegu', () => {
  const sim = makeSim();
  const b = sim.blocks.get('W');
  // Wymuś wjazd pierwszego pociągu od W bez przebiegu
  run(sim, 60 * 12, (s) => { if (b.request === 'theirs') b.press('Poz'); });
  const e = sim.traffic.timetable().find((x) => x.nr === 5310);
  assert.ok(e.train, 'pociąg 5310 wyprawiony');
  run(sim, 60 * 4);
  assert.equal(e.train.v, 0);
  assert.equal(e.train.stoppedAt?.signal, 'A');
  assert.ok(sim.ilk.sections.get('ZbA').occupied);
  sim.ilk.requestRoute({ kind: 'signal', id: 'A', color: 'green' }, { kind: 'end', id: 'D1' });
  run(sim, 30);
  assert.ok(e.train.v > 0, 'pociąg ruszył');
});

test('sygnał zastępczy prowadzi pociąg po ustawionych zwrotnicach z prędkością do 40 km/h', () => {
  const sim = makeSim();
  const b = sim.blocks.get('W');
  run(sim, 60 * 16, (s) => { if (b.request === 'theirs') b.press('Poz'); });
  const e = sim.traffic.timetable().find((x) => x.nr === 5310);
  assert.equal(e.train.stoppedAt?.signal, 'A');
  sim.press({ kind: 'group', id: 'Sz', role: 'substitute' });
  sim.press({ kind: 'signal', id: 'A', color: 'green' });
  let vmax = 0;
  run(sim, 60, () => { vmax = Math.max(vmax, e.train.v * 3.6); });
  assert.ok(e.train.head > 0 && vmax > 5, 'pociąg jedzie');
  assert.ok(vmax <= 40.5, `prędkość ${vmax.toFixed(1)} km/h`); // Ie-1 od 17.01.2026: Sz – 40 km/h
});

test('rozkład jest posortowany po czasie na każdej stacji, niezależnie od kolejności w definicji (SKM i dalekobieżne przemieszane)', async () => {
  const { STATIONS } = await import('../src/stations/index.js');
  const { Simulation } = await import('../src/model/Simulation.js');
  for (const st of STATIONS) {
    const tt = new Simulation(st, { disruptions: 'none' }).traffic.timetable();
    const key = (e) => e.arrTime ?? e.depTime;
    for (let i = 1; i < tt.length; i++) assert.ok(key(tt[i]) >= key(tt[i - 1]), `${st.id}: ${tt[i - 1].nr} (${tt[i - 1].arr || tt[i - 1].dep}) przed ${tt[i].nr} (${tt[i].arr || tt[i].dep})`);
  }
  const orl = new Simulation((await import('../src/stations/gdynia-orlowo.js')).default, { disruptions: 'none' }).traffic.timetable();
  assert.deepEqual(orl.slice(0, 3).map((e) => e.arr), ['06:02', '06:08', '06:08']); // 06:02 SKM, potem Regio 55100 i SKM 92102 o 06:08
  assert.ok(orl.slice(0, 3).some((e) => e.nr === 55100), 'dalekobieżny między pociągami SKM, nie na końcu listy');
});

test('status „odjechał” zostaje, gdy pociąg jedzie torem szlakowym do sąsiada (nie jest nadpisywany przez „jedzie”)', async () => {
  const { Simulation } = await import('../src/model/Simulation.js');
  const { Clock } = await import('../src/core/Clock.js');
  const { autoDispatch } = await import('./helpers.js');
  const szkolna = (await import('../src/stations/szkolna.js')).default;
  const sim = new Simulation(szkolna, { scenario: 'zmiana', disruptions: 'none' });
  const e = sim.traffic.timetable().find((x) => x.nr === 6101);
  const after = new Set(); // statusy od chwili, gdy pociąg opuścił stację
  let n = 0, left = false;
  while (sim.clock.time < Clock.parse('07:20') && e.status !== 'na następnym posterunku') {
    sim.step(0.5); if (n++ % 4 === 0) autoDispatch(sim);
    if (e.status === 'odjechał') left = true;
    if (left) after.add(e.status);
  }
  assert.equal(e.status, 'na następnym posterunku');
  assert.ok(left, 'pociąg powinien przejść przez status „odjechał”');
  assert.deepEqual([...after].sort(), ['na następnym posterunku', 'odjechał'], 'na szlaku status nie wraca do „jedzie”');
});
