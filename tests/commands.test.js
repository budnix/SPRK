import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeSim, run } from './helpers.js';
import { Simulation } from '../src/model/Simulation.js';
import { ButtonProtocol, ARM_TIMEOUT } from '../src/srk/buttons.js';
import { validateStation } from '../src/model/validate.js';
import { POINT_SWITCH_TIME } from '../src/model/Interlocking.js';
import sopot from '../src/stations/sopot.js';
import gdynia from './fixtures/gdynia-glowna-okregi.js';
import starePustkowie from './fixtures/stare-pustkowie.js';

/** Zdarzenia uzbrojenia i przycisków zebrane z szyny – polecenia wprost nie mogą ich wywoływać. */
function watch(sim) {
  const seen = { armed: 0, button: 0 };
  sim.bus.on('armed', () => { seen.armed++; });
  sim.bus.on('button', () => { seen.button++; });
  return seen;
}

test('polecenie „przebieg”: rodzaj podany wprost, bez przycisków i bez uzbrojenia', () => {
  const sim = makeSim();
  const seen = watch(sim);
  const r = sim.execute({ type: 'route', start: 'A', end: 'D2', kind: 'train' });
  assert.ok(r.ok, JSON.stringify(r));
  run(sim, POINT_SWITCH_TIME + 1);
  assert.ok(sim.ilk.active.has('A-D2'));
  assert.equal(sim.ilk.signals.get('A').aspect, 'S13');
  assert.equal(sim.ilk.armed, null);
  assert.deepEqual(seen, { armed: 0, button: 0 });
  // przebieg manewrowy z semafora z Ms2 – ten sam początek i koniec, inny rodzaj
  const bad = sim.execute({ type: 'route', start: 'A', end: 'D2', kind: 'shunt' });
  assert.equal(bad.ok, false);
  assert.match(bad.reason, /manewrowego/);
  assert.equal(sim.execute({ type: 'route', start: 'A', end: 'D2' }).ok, false, 'rodzaj przebiegu jest wymagany');
});

test('polecenia „stój”, „zwolnij”, „zwolnij doraźnie” działają jak wyciągnięcie, Pz i dPz', () => {
  const sim = makeSim();
  sim.execute({ type: 'route', start: 'A', end: 'D1', kind: 'train' });
  run(sim, 1);
  assert.equal(sim.ilk.signals.get('A').aspect, 'S5');
  assert.ok(sim.execute({ type: 'stop', signal: 'A' }).ok);
  assert.equal(sim.ilk.signals.get('A').aspect, 'S1');
  assert.ok(sim.ilk.active.has('A-D1'), 'przebieg pozostaje utwierdzony');
  assert.ok(sim.execute({ type: 'release', signal: 'A' }).ok);
  assert.ok(!sim.ilk.active.has('A-D1'));

  sim.execute({ type: 'route', start: 'A', end: 'D1', kind: 'train' });
  run(sim, 1);
  assert.ok(sim.execute({ type: 'release', signal: 'A', emergency: true }).ok);
  assert.ok(!sim.ilk.active.has('A-D1'));
  assert.equal(sim.ilk.counters.dPz, 1, 'doraźne zwolnienie jest rejestrowane w liczniku');
});

test('polecenia „zwrotnica”, „zamknięcie”, „sygnał zastępczy”, „blokada”', () => {
  const sim = makeSim();
  const p = sim.ilk.points.get('Zw1');
  assert.ok(sim.execute({ type: 'point', id: 'Zw1' }).ok);
  assert.equal(p.moving, true);
  run(sim, POINT_SWITCH_TIME + 0.5);
  assert.equal(p.position, '-');
  assert.ok(sim.execute({ type: 'lock', id: 'Zw1' }).ok);
  assert.equal(p.individualLock, true);
  assert.equal(sim.execute({ type: 'point', id: 'Zw1' }).ok, false, 'zwrotnica zamknięta indywidualnie');
  assert.ok(sim.execute({ type: 'substitute', signal: 'A' }).ok);
  assert.equal(sim.ilk.signals.get('A').aspect, 'Sz');
  assert.equal(sim.ilk.counters.Sz, 1);
  const b = sim.blocks.get('W');
  assert.ok(sim.execute({ type: 'block', exit: 'W', btn: 'Wbl' }).ok);
  assert.equal(b.request, 'ours');
  assert.equal(sim.execute({ type: 'nieznane' }).ok, false);
});

test('polecenie „przebieg złożony” nastawia łańcuch przez semafory pośrednie', () => {
  const sim = new Simulation(sopot, { disruptions: 'none' });
  const seen = watch(sim);
  const r = sim.execute({ type: 'route', start: 'A', end: 'kOR1', kind: 'train', compound: true });
  assert.deepEqual(r.chain, ['A-H', 'H-O', 'O-OR1']);
  assert.deepEqual(seen, { armed: 0, button: 0 });
  // bez `compound` nie ma przebiegu bezpośredniego A → szlak
  const s2 = new Simulation(sopot, { disruptions: 'none' });
  assert.equal(s2.execute({ type: 'route', start: 'A', end: 'kOR1', kind: 'train' }).ok, false);
});

test('polecenia wprost pilnują okręgu nastawczego jak przyciski', () => {
  const sim = new Simulation(gdynia, { district: 'GO' });
  assert.equal(sim.execute({ type: 'route', start: 'A1', end: 'G6', kind: 'train' }).ok, false, 'semafor okręgu GO2');
  assert.equal(sim.execute({ type: 'stop', signal: 'A1' }).ok, false);
  assert.equal(sim.execute({ type: 'block', exit: 'G2', btn: 'Wbl' }).ok, false);
  assert.match(sim.execute({ type: 'substitute', signal: 'A1' }).reason, /drugą nastawnię/);
  assert.notEqual(sim.execute({ type: 'stop', signal: 'K6' }).reason, sim.execute({ type: 'stop', signal: 'A1' }).reason);
});

test('odwołanie wskazania: widok nie zmienia stanu modelu, tylko woła cancelSelection', () => {
  const sim = makeSim();
  sim.press({ kind: 'signal', id: 'A', color: 'green' });
  assert.equal(sim.ilk.armed.id, 'A');
  const events = [];
  sim.bus.on('armed', (a) => events.push(a));
  sim.cancelSelection();
  assert.equal(sim.ilk.armed, null);
  assert.deepEqual(events, [null]);
  sim.cancelSelection();
  assert.deepEqual(events, [null], 'bez uzbrojenia nie ma zdarzenia');
});

test('protokół przycisków typu E tłumaczy przyciski na polecenia zależnościowe', () => {
  const calls = [];
  const ok = { ok: true };
  const ilk = {
    time: 100,
    refuse: (msg) => ({ ok: false, reason: msg }),
    requestRoute: (...a) => { calls.push(['route', ...a]); return ok; },
    requestCompoundRoute: (...a) => { calls.push(['compound', ...a]); return ok; },
    releaseRoute: (...a) => { calls.push(['release', ...a]); return ok; },
    cancelSignal: (...a) => { calls.push(['stop', ...a]); return ok; },
    switchPoint: (...a) => { calls.push(['point', ...a]); return ok; },
    switchDerailer: (...a) => { calls.push(['derailer', ...a]); return ok; },
    toggleIndividualLock: (...a) => { calls.push(['lock', ...a]); return ok; },
    substituteSignal: (...a) => { calls.push(['sz', ...a]); return ok; },
  };
  const bus = { emit() {} };
  const p = new ButtonProtocol(ilk, bus);
  assert.equal(p.armTimeout, ARM_TIMEOUT);
  const G = (id) => ({ kind: 'signal', id, color: 'green' });
  const W = (id) => ({ kind: 'signal', id, color: 'white' });
  const group = (id, role) => ({ kind: 'group', id, role });

  assert.deepEqual(p.press(G('A')), { ok: true, armed: true });
  assert.equal(p.armed.until, 100 + ARM_TIMEOUT);
  p.press(G('D1'));
  p.press(W('D2')); p.press({ kind: 'end', id: 'kT3' });
  p.press(group('Pz', 'route-release')); p.press(G('A'));
  p.press(G('B')); p.press(group('dPz', 'emergency-release')); // kolejność odwrotna
  p.press(group('Zw', 'group-point')); p.press({ kind: 'point', id: 'Zw1' });
  p.press(group('Zw', 'group-point')); p.press({ kind: 'derailer', id: 'Wk1' });
  p.press(group('Zz', 'point-lock')); p.press({ kind: 'derailer', id: 'Wk1' });
  p.press(group('Sz', 'substitute')); p.press(G('A'));
  p.press(W('Tm1')); p.pressCompound({ kind: 'end', id: 'kT3' });
  p.pull(G('A'));
  assert.deepEqual(calls, [
    ['route', 'A', 'D1', 'train'],
    ['route', 'D2', 'kT3', 'shunt'],
    ['release', 'A', false],
    ['release', 'B', true],
    ['point', 'Zw1'],
    ['derailer', 'Wk1'],
    ['lock', 'Wk1', true],
    ['sz', 'A'],
    ['compound', 'Tm1', 'kT3', 'shunt'],
    ['stop', 'A'],
  ]);
  // uzbrojenie wygasa po czasie
  p.press(G('A'));
  p.tick(100 + ARM_TIMEOUT + 1);
  assert.equal(p.armed, null);
  assert.equal(p.press({ kind: 'end', id: 'kE' }).ok, false, 'koniec bez początku');
  assert.equal(new ButtonProtocol(ilk, bus, { armTimeout: 60 }).armTimeout, 60);
});

test('walidacja: nieznany system srk w scenariuszu jest błędem', () => {
  const ok = { ...starePustkowie, scenarios: [{ id: 'a', name: 'a', srk: 'komputerowe' }] };
  assert.deepEqual(validateStation(ok).errors, []);
  const bad = { ...starePustkowie, scenarios: [{ id: 'a', name: 'a', srk: 'iltor-x' }] };
  assert.ok(validateStation(bad).errors.some((e) => /Scenariusz a.*srk.*iltor-x/.test(e)));
});
