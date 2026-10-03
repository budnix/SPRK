import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeSim, play } from './helpers.js';
import { Simulation } from '../src/model/Simulation.js';
import szkolna from '../src/stations/szkolna.js';
import { PHASES, setPhase, initialPhase, isHandled, isFinished } from '../src/model/timetable/phase.js';

/*
 * Etap pociągu w rozkładzie (`src/model/timetable/phase.js`): kod etapu to dane, napis dla człowieka powstaje z kodu.
 * Ruch (`Traffic`) zmienia etap tylko przez `setPhase`, więc napis zawsze odpowiada kodowi.
 */

/** Kolejne różne etapy pociągu `nr` w zmianie prowadzonej automatem; przy każdym takcie sprawdza zgodność napisu z kodem. */
function phases(sim, nr, seconds) {
  const seen = [];
  play(sim).until(sim.clock.time + seconds, { each: (s) => {
    for (const e of s.traffic.timetable()) {
      assert.equal(e.status, PHASES[e.phase]({ signal: e.heldAt, nr: e.handedTo }), `${e.nr}: napis „${e.status}” do etapu ${e.phase}`);
    }
    const e = s.traffic.entry(nr);
    const k = e.phase === 'held' ? `held:${e.heldAt}` : e.phase === 'handed-over' ? `handed-over:${e.handedTo}` : e.phase;
    if (seen.at(-1) !== k) seen.push(k);
  } });
  return seen;
}

test('etap pociągu z postojem: od oczekiwania u sąsiada po dojazd do następnego posterunku; napis zawsze z kodu', () => {
  const seen = phases(makeSim({ disruptions: 'none', seed: 1 }), 5311, 20 * 60);
  assert.equal(seen[0], 'expected');
  // („odjeżdża” trwa krócej niż takt – w tym samym takcie pociąg już „jedzie”, więc tu go nie widać)
  for (const p of ['permission-requested', 'on-line', 'running', 'dwell', 'departed', 'at-neighbour']) assert.ok(seen.includes(p), `${p}: ${seen.join(' → ')}`);
  assert.ok(seen.indexOf('dwell') < seen.indexOf('departed') && seen.indexOf('departed') < seen.indexOf('at-neighbour'), seen.join(' → '));
});

test('etap składu kończącego bieg, który przechodzi w inny pociąg (Szkolna 90201 → 90202): zakończył bieg, manewry, przekazany z numerem', () => {
  const sim = new Simulation(szkolna, { disruptions: 'none', scenario: 'zmiana', seed: 1 });
  const seen = phases(sim, 90201, 75 * 60);
  assert.ok(seen.includes('ended') && seen.includes('shunting'), seen.join(' → '));
  assert.equal(seen.at(-1), 'handed-over:90202');
  const unit = sim.traffic.entry(90201);
  assert.deepEqual([unit.status, unit.handedTo, unit.heldAt], ['przekazany jako 90202', 90202, null]);
  assert.equal(initialPhase(szkolna.timetable.find((x) => x.nr === 90202)), 'awaiting-unit');
});

test('pociąg obsłużony a skończony: wyprawiony pociąg w drodze do sąsiada jest obsłużony, ale jeszcze nie skończony', () => {
  const e = {};
  const at = (phase, data) => { setPhase(e, phase, data); return [isHandled(e), isFinished(e)]; };
  assert.deepEqual(at('departed'), [true, false]);
  assert.deepEqual(at('at-neighbour'), [true, true]);
  assert.deepEqual(at('ended'), [true, true]);
  assert.deepEqual(at('handed-over', { nr: 5 }), [true, true]);
  for (const p of ['expected', 'awaiting-unit', 'permission-requested', 'on-line', 'entering', 'running', 'dwell', 'at-station', 'shunting', 'departing']) assert.deepEqual(at(p), [false, false], p);
  assert.deepEqual([at('held', { signal: 'A' }), e.status, e.heldAt], [[false, false], 'stoi przed A', 'A']);
  assert.throws(() => setPhase(e, 'odjechał'), /Nieznany etap/);
  assert.deepEqual([initialPhase({ from: 'W' }), initialPhase({ unit: 1 }), initialPhase({})], ['expected', 'awaiting-unit', 'at-station']);
});
