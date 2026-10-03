import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allArrived, play, setRoutes } from './helpers.js';
import { Simulation } from '../src/model/Simulation.js';
import gdynia from './fixtures/gdynia-glowna-okregi.js'; // okręgi tylko w stacji testowej – w grze Gdynia Główna jest jednym stanowiskiem
import { Clock } from '../src/core/Clock.js';
import { AutoOperator } from '../src/model/Operator.js';

function runShift(sim, playerOp) {
  const end = Clock.parse('08:25');
  play(sim, playerOp).until(end, { stop: allArrived });
}

function assertAllDone(sim) {
  for (const e of sim.traffic.timetable()) {
    if (e.terminates) { assert.ok(e.phase === 'handed-over', `${e.nr}: ${e.status}`); continue; }
    assert.equal(e.phase, 'at-neighbour', `${e.nr}: ${e.status}`);
    assert.ok(e.delay <= 4, `${e.nr}: opóźnienie ${e.delay}`);
  }
  assert.equal(sim.ilk.counters.rozprucie, 0);
}

test('okręgi: sygnalizatory i szlaki przypisane do GO / GO2, przyciski drugiego okręgu zablokowane', () => {
  const sim = new Simulation(gdynia, { district: 'GO' });
  assert.equal(sim.playerDistrict, 'GO');
  assert.equal(sim.districtOf('A1'), 'GO2'); assert.equal(sim.districtOf('G6'), 'GO2');
  assert.equal(sim.districtOf('K6'), 'GO'); assert.equal(sim.districtOf('A'), 'GO');
  assert.equal(sim.exitDistrict('G2'), 'GO2'); assert.equal(sim.exitDistrict('C1'), 'GO');
  assert.equal(sim.press({ kind: 'signal', id: 'A1', color: 'green' }).ok, false, 'przycisk GO2 dla gracza GO');
  assert.equal(sim.press({ kind: 'block', exit: 'G2', btn: 'Wbl' }).ok, false);
  assert.equal(sim.press({ kind: 'signal', id: 'K6', color: 'green' }).armed, true);
  assert.equal(sim.operators.length, 1); assert.equal(sim.operators[0].role, 'executive');
});

test('gracz jako dyżurny GO: GO2 wykonuje polecenia, bez polecenia pociąg od Gdańska czeka', () => {
  const sim = new Simulation(gdynia, { district: 'GO', scenario: { id: 't', name: 't', trains: [55100], endTime: '06:40' } });
  const go = new AutoOperator(sim, { district: 'GO', role: 'full' }); // gracz obsługuje tylko wschód, poleceń nie wydaje
  const game = play(sim, go);
  game.until('06:16');
  const e = sim.traffic.timetable()[0];
  // linia 202: blokada samoczynna – sąsiad wyprawia bez pozwolenia, ale GO2 bez polecenia nie nastawia wjazdu
  assert.ok(e.train && e.train.v === 0 && e.train.stoppedAt?.kind === 'signal', 'GO2 przyjęło pociąg bez polecenia dyżurnego');
  assert.equal(setRoutes(sim.ilk).length, 0, 'przebieg wjazdowy bez polecenia');
  // polecenie: przyjąć na tor 6
  sim.issueCommand({ kind: 'accept', nr: 55100, track: '6', from: 'GO', to: 'GO2' });
  game.until('06:30');
  assert.ok(e.train && e.train.entered, 'pociąg nie wjechał po poleceniu');
  assert.equal(sim.commands[0].status, 'done');
  assert.ok(sim.comms.messages.some((m) => m.from === 'GO2' && /przygotowana/.test(m.text)), 'brak meldunku GO2');
});

test('gracz jako dyżurny GO (z poleceniami dla GO2): pełna zmiana', () => {
  const sim = new Simulation(gdynia, { district: 'GO' });
  // gracz: obsługuje GO i wydaje polecenia GO2 (symulacja przez operator w roli dyżurnego)
  const player = new AutoOperator(sim, { district: 'GO', role: 'dispatcher', playerDistrict: 'GO2' });
  runShift(sim, player);
  assertAllDone(sim);
  assert.ok(sim.commands.length >= 20, `poleceń: ${sim.commands.length}`);
  assert.ok(sim.commands.every((c) => c.status === 'done'), 'niewykonane polecenia');
});

test('gracz jako nastawniczy GO2: automat GO wydaje polecenia, gracz je wykonuje – pełna zmiana', () => {
  const sim = new Simulation(gdynia, { district: 'GO2' });
  assert.equal(sim.operators[0].role, 'dispatcher');
  const player = new AutoOperator(sim, { district: 'GO2', role: 'executive' });
  runShift(sim, player);
  assertAllDone(sim);
  const mine = sim.commands.filter((c) => c.to === 'GO2');
  assert.ok(mine.length >= 20, `poleceń dla GO2: ${mine.length}`);
  assert.ok(mine.every((c) => c.status === 'done'));
  assert.ok(sim.score.items.some((i) => i.code === 'command'), 'brak punktów za wykonane polecenia');
});

test('oba okręgi jednoosobowo: brak automatów, pełna zmiana', () => {
  const sim = new Simulation(gdynia, { district: 'both' });
  assert.equal(sim.operators.length, 0);
  runShift(sim, new AutoOperator(sim, { district: null, role: 'full' }));
  assertAllDone(sim);
});
