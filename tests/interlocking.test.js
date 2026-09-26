import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeSim, run } from './helpers.js';
import { POINT_SWITCH_TIME, TIMED_RELEASE } from '../src/model/Interlocking.js';

const G = (id) => ({ kind: 'signal', id, color: 'green' });
const W = (id) => ({ kind: 'signal', id, color: 'white' });
const ZW = { kind: 'group', id: 'Zw', role: 'group-point' };

test('przestawienie zwrotnicy wymaga przycisku grupowego Zw i trwa w czasie', () => {
  const sim = makeSim();
  const p = sim.ilk.points.get('Zw1');
  assert.equal(p.position, '+');
  sim.press({ kind: 'point', id: 'Zw1' }); // samo naciśnięcie – tylko uzbraja
  run(sim, 1);
  assert.equal(p.moving, false);
  sim.press(ZW);
  assert.equal(p.moving, true, 'kolejność odwrotna też działa');
  assert.equal(p.control, false);
  run(sim, POINT_SWITCH_TIME + 0.5);
  assert.equal(p.position, '-');
  assert.equal(p.control, true);
});

test('nastawienie przebiegu pociągowego: zwrotnice, utwierdzenie, obraz sygnałowy', () => {
  const sim = makeSim();
  const res = sim.press(G('A'));
  assert.equal(res.armed, true);
  sim.press(G('D2'));
  assert.equal(sim.ilk.pending.length, 1);
  run(sim, POINT_SWITCH_TIME + 1);
  assert.ok(sim.ilk.active.has('A-D2'));
  assert.equal(sim.ilk.points.get('Zw1').position, '-');
  assert.equal(sim.ilk.sections.get('Iz1').route, 'A-D2');
  assert.equal(sim.ilk.sections.get('T2').route, 'A-D2');
  // D2 pokazuje Stój -> A: S13 (40 km/h, następny semafor Stój)
  assert.equal(sim.ilk.signals.get('A').aspect, 'S13');
  // zwrotnica utwierdzona – nie można przestawić
  sim.press(ZW); const r2 = sim.press({ kind: 'point', id: 'Zw1' });
  assert.equal(r2.ok, false);
});

test('przebiegi sprzeczne są odrzucane', () => {
  const sim = makeSim();
  sim.press(G('A')); sim.press(G('D1'));
  run(sim, 1);
  assert.ok(sim.ilk.active.has('A-D1'));
  sim.press(G('B')); const r = sim.press(G('C1'));
  assert.equal(r.ok, false);
  assert.match(r.reason, /T1|Iz4/);
  // wjazd od B na tor 2 blokuje droga ochronna przebiegu A-D1 (Iz4)
  sim.press(G('B')); const r2 = sim.press(G('C2'));
  assert.equal(r2.ok, false);
  assert.match(r2.reason, /drodze ochronnej/);
});

test('wyciągnięcie przycisku gasi sygnał, Pz zwalnia przebieg', () => {
  const sim = makeSim();
  sim.press(G('A')); sim.press(G('D1'));
  run(sim, 1);
  assert.equal(sim.ilk.signals.get('A').aspect, 'S5');
  sim.pull(G('A'));
  assert.equal(sim.ilk.signals.get('A').aspect, 'S1');
  assert.ok(sim.ilk.active.has('A-D1'), 'przebieg pozostaje utwierdzony');
  sim.press({ kind: 'group', id: 'Pz', role: 'route-release' });
  sim.press(G('A'));
  assert.ok(!sim.ilk.active.has('A-D1'));
  assert.equal(sim.ilk.sections.get('T1').route, null);
});

test('zwalnianie czasowe przy zajętym odcinku zbliżania, dPz natychmiast z licznikiem', () => {
  const sim = makeSim();
  sim.press(G('A')); sim.press(G('D1'));
  run(sim, 1);
  sim.ilk.updateOccupancy(new Set(['ZbA']));
  sim.press({ kind: 'group', id: 'Pz', role: 'route-release' });
  const r = sim.press(G('A'));
  assert.equal(r.timed, true);
  assert.ok(sim.ilk.active.has('A-D1'));
  run(sim, TIMED_RELEASE / 2);
  assert.ok(sim.ilk.active.has('A-D1'));
  sim.press({ kind: 'group', id: 'dPz', role: 'emergency-release' });
  sim.press(G('A'));
  assert.ok(!sim.ilk.active.has('A-D1'));
  assert.equal(sim.ilk.counters.dPz, 1);
});

test('zwalnianie odcinkowe po przejeździe pociągu', () => {
  const sim = makeSim();
  sim.press(G('A')); sim.press(G('D1'));
  run(sim, 1);
  const occ = (...s) => { sim.ilk.updateOccupancy(new Set(s)); sim.ilk.tick(sim.ilk.time + 0.1); };
  occ('ZbA', 'Iz1');
  assert.equal(sim.ilk.signals.get('A').aspect, 'S1', 'semafor pada po minięciu');
  occ('Iz1', 'T1');
  occ('T1');
  assert.equal(sim.ilk.sections.get('Iz1').route, null, 'Iz1 zwolniony');
  assert.ok(!sim.ilk.active.has('A-D1'), 'przebieg rozwiązany po wjeździe na tor docelowy');
});

test('sygnał zastępczy Sz z licznikiem i czasem', () => {
  const sim = makeSim();
  sim.press({ kind: 'group', id: 'Sz', role: 'substitute' });
  sim.press(G('A'));
  assert.equal(sim.ilk.signals.get('A').aspect, 'Sz');
  assert.equal(sim.ilk.counters.Sz, 1);
  run(sim, 95);
  assert.equal(sim.ilk.signals.get('A').aspect, 'S1');
});

test('przebieg manewrowy i wykolejnica', () => {
  const sim = makeSim();
  sim.press(W('D2')); sim.press({ kind: 'end', id: 'kT3' });
  run(sim, POINT_SWITCH_TIME + 1);
  assert.ok(sim.ilk.active.has('D2-kT3m'));
  assert.equal(sim.ilk.derailers.get('Wk1').position, 'off');
  assert.equal(sim.ilk.signals.get('D2').aspect, 'Ms2');
  // wyjazd D2-E wymaga nałożonej wykolejnicy – w konflikcie z manewrem
  sim.press(G('D2')); const r = sim.press({ kind: 'end', id: 'kE' });
  assert.equal(r.ok, false);
  // zwolnienie: wyciągnięcie białego przycisku
  sim.pull(W('D2'));
  assert.ok(!sim.ilk.active.has('D2-kT3m'));
});

test('zamknięcie indywidualne zwrotnicy blokuje przestawianie i przebiegi', () => {
  const sim = makeSim();
  sim.press({ kind: 'group', id: 'Zz', role: 'point-lock' });
  sim.press({ kind: 'point', id: 'Zw1' });
  assert.equal(sim.ilk.points.get('Zw1').individualLock, true);
  sim.press(G('A')); const r = sim.press(G('D2'));
  assert.equal(r.ok, false);
  assert.match(r.reason, /zamknięta/);
});

test('wyjazd na szlak wymaga pozwolenia blokady Eap', () => {
  const sim = makeSim();
  sim.press(G('D1')); const r = sim.press({ kind: 'end', id: 'kE' });
  assert.equal(r.ok, false);
  assert.match(r.reason, /pozwolenia/);
  sim.press({ kind: 'block', exit: 'E', btn: 'Wbl' });
  run(sim, 40);
  assert.equal(sim.blocks.get('E').direction, 'out');
  sim.press(G('D1')); const r2 = sim.press({ kind: 'end', id: 'kE' });
  assert.equal(r2.ok, true);
});

test('migawka stanu jest serializowalna', () => {
  const sim = makeSim();
  const snap = sim.snapshot();
  assert.ok(JSON.stringify(snap).length > 100);
  assert.equal(snap.interlocking.points.length, 3);
});
