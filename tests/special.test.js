import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/model/Simulation.js';
import { SpecialCommand, SPECIAL_DELAY, SPECIAL_TIMEOUT } from '../src/srk/special.js';
import szkolna from '../src/stations/szkolna.js';
import { run } from './helpers.js';

/*
 * Polecenie specjalne stanowiska komputerowego (audyt realizmu, grupa 5, K1): dwuetapowe – inicjowanie (element
 * zamarkowany) i potwierdzenie najwcześniej po 5 s; po 60 s bez potwierdzenia odwołuje się samo; w tym czasie inne
 * polecenia są zablokowane (Ie-104.1 (2025) §11 ust. 13, 14, 16). Dawniej WYKONAJ działało od razu.
 */

test('K1: moduł – potwierdzenie najwcześniej po 5 s, samoczynne odwołanie po 60 s, jedno polecenie naraz', () => {
  const s = new SpecialCommand();
  assert.equal(s.start(100, { type: 'substitute', signal: 'A' }, { label: 'Sz A' }).ok, true);
  assert.equal(s.start(101, { type: 'substitute', signal: 'B' }).ok, false, 'drugie polecenie specjalne');
  assert.equal(s.confirm(100 + SPECIAL_DELAY - 1).ok, false, 'za wcześnie');
  assert.equal(s.state(102).wait, 3);
  const ok = s.confirm(100 + SPECIAL_DELAY);
  assert.deepEqual(ok.cmd, { type: 'substitute', signal: 'A' });
  assert.equal(s.pending, null);
  s.start(200, { type: 'substitute', signal: 'A' });
  assert.equal(s.tick(200 + SPECIAL_TIMEOUT), null);
  assert.ok(s.tick(200 + SPECIAL_TIMEOUT + 1), 'odwołane po 60 s');
  assert.equal(s.confirm(262).ok, false);
});

test('K1: symulacja – w trakcie polecenia specjalnego inne polecenia zablokowane; potwierdzenie po 5 s wykonuje; OPS i 60 s odwołują', () => {
  const sim = new Simulation(szkolna, { scenario: { id: 't', name: 't', endTime: '09:00', trains: [] }, disruptions: 'none' });
  sim.clock.paused = false;
  const logs = []; sim.bus.on('log', (l) => logs.push(l.msg));
  assert.equal(sim.initiateSpecial({ type: 'substitute', signal: 'A' }, { label: 'Sz A', target: { kind: 'signal', id: 'A' } }).ok, true);
  assert.equal(sim.execute({ type: 'point', id: 'Zw1' }).ok, false, 'inne polecenie w trakcie specjalnego');
  assert.equal(sim.press({ kind: 'signal', id: 'A', color: 'green' }).ok, false);
  assert.equal(sim.confirmSpecial().ok, false, 'za wcześnie');
  run(sim, SPECIAL_DELAY);
  assert.equal(sim.confirmSpecial().ok, true);
  assert.equal(sim.ilk.signals.get('A').aspect, 'Sz');
  // Zw4 – poza drogą Sz na A (Zw1 na tej drodze trzyma się, dopóki świeci Sz)
  assert.equal(sim.execute({ type: 'point', id: 'Zw4' }).ok, true, 'po potwierdzeniu polecenia znów działają');
  sim.initiateSpecial({ type: 'release', signal: 'B', emergency: true }, { label: 'dPz B' });
  sim.cancelSpecial();
  assert.equal(sim.special.pending, null, 'OPS');
  sim.initiateSpecial({ type: 'substitute', signal: 'B' }, { label: 'Sz B' });
  run(sim, SPECIAL_TIMEOUT + 2);
  assert.equal(sim.special.pending, null, 'samoczynne odwołanie');
  assert.ok(logs.some((m) => /odwołane samoczynnie po 60 s/.test(m)), logs.join('\n'));
  assert.notEqual(sim.ilk.signals.get('B').aspect, 'Sz');
});

// Ie-104.1 §12: ZDM (doraźne zwolnienie przebiegu manewrowego) to polecenie zwykłe – bez licznika i kary; ZDP pociągowego
// – specjalne, z licznikiem. Dawniej monitor liczył jako dPz także przebieg manewrowy. Pulpit typu E bez zmian.
test('K2: stanowisko komputerowe – ZDM bez licznika i kary, ZDP z licznikiem; pulpit typu E liczy oba', () => {
  const mk = (sc) => new Simulation(szkolna, { scenario: sc, disruptions: 'none' });
  const s = mk('zmiana');
  assert.ok(s.ilk.setRoute('D2-kT3m').ok); run(s, 8);
  assert.ok(s.execute({ type: 'release', signal: 'D2', emergency: true }).ok);
  assert.equal(s.ilk.counters.dPz, 0);
  assert.ok(!s.score.items.some((i) => i.code === 'dPz'));
  assert.ok(s.ilk.setRoute('A-D1').ok); run(s, 8);
  assert.ok(s.execute({ type: 'release', signal: 'A', emergency: true }).ok);
  assert.equal(s.ilk.counters.dPz, 1, 'ZDP liczone');
  const e = mk('zmiana-e');
  assert.ok(e.ilk.setRoute('D2-kT3m').ok); run(e, 8);
  e.execute({ type: 'release', signal: 'D2', emergency: true });
  assert.equal(e.ilk.counters.dPz, 1, 'typ E – dPz liczone jak dotąd');
});
