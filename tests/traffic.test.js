import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeSim, run, Clock } from './helpers.js';

/** Automatyczny dyżurny – scenariusz pełnej zmiany. */
function autoDispatch(sim) {
  const ilk = sim.ilk;
  for (const b of sim.blocks.values()) {
    if (b.request === 'theirs') b.press('Poz');
    if (b.koPending) b.press('Ko');
  }
  for (const e of sim.traffic.timetable()) {
    if (e.train && !e.train.finished && e.from && !e.entryRouteSet) {
      const sig = e.from === 'W' ? 'A' : 'B';
      const end = e.from === 'W' ? (e.track === '2' ? 'D2' : 'D1') : (e.track === '2' ? 'C2' : 'C1');
      if (ilk.requestRoute({ kind: 'signal', id: sig, color: 'green' }, { kind: 'end', id: end }).ok) e.entryRouteSet = true;
    }
    if (e.train && !e.train.finished && e.to && e.train.entered && !e.exitRouteSet) {
      const b = sim.blocks.get(e.to);
      const tr = e.actualTrack || e.track;
      const startSig = e.to === 'E' ? (tr === '2' ? 'D2' : 'D1') : (tr === '2' ? 'C2' : 'C1');
      if (!b.direction && !b.request && !b.occupied) b.press('Wbl');
      if (b.direction === 'out' && b.permission) {
        if (ilk.requestRoute({ kind: 'signal', id: startSig, color: 'green' }, { kind: 'end', id: e.to === 'E' ? 'kE' : 'kW' }).ok) e.exitRouteSet = true;
      }
    }
  }
}

test('pełna zmiana: wszystkie pociągi przejeżdżają bez opóźnień i rozpruć', () => {
  const sim = makeSim();
  const end = Clock.parse('08:20');
  let n = 0;
  while (sim.clock.time < end) { sim.step(0.5); if (n++ % 4 === 0) autoDispatch(sim); }
  const tt = sim.traffic.timetable();
  for (const e of tt) {
    if (e.terminates) { assert.equal(e.status, 'zakończył bieg', `pociąg ${e.nr}`); assert.equal(e.actualTrack, '2'); continue; }
    assert.equal(e.status, 'u sąsiada', `pociąg ${e.nr}: ${e.status}`);
    assert.ok(e.delay <= 2, `pociąg ${e.nr} opóźniony ${e.delay} min`);
    assert.equal(String(e.actualTrack), String(e.track), `pociąg ${e.nr} na złym torze`);
  }
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

test('sygnał zastępczy prowadzi pociąg po ustawionych zwrotnicach z prędkością 20 km/h', () => {
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
  assert.ok(vmax <= 21, `prędkość ${vmax.toFixed(1)} km/h`);
});
