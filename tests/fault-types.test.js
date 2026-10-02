import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeSim } from './helpers.js';
import { Simulation } from '../src/model/Simulation.js';
import szkolna from '../src/stations/szkolna.js';
import { FAULTS, FAULT_TYPES } from '../src/model/faults/types.js';

/*
 * Rodzaje usterek (`src/model/faults/types.js`): każdy rodzaj opisany w jednym miejscu – cel, losowanie, automat,
 * początek i koniec. Harmonogram (`Faults.js`), kontrola definicji, ruch i automat sprawdzający czytają ten opis.
 */

test('kolejność rodzajów jest stała – od niej zależy losowanie usterek (to samo ziarno – te same usterki)', () => {
  assert.deepEqual(FAULT_TYPES, ['signal-fail', 'point-control', 'false-occupancy', 'block-fail', 'route-block', 'track-defect', 'axle-counter']);
});

test('każdy rodzaj ma pełny opis: cel, nazwę, automat, drogę pociągu, losowanie, początek i koniec', () => {
  for (const [type, k] of Object.entries(FAULTS)) {
    assert.ok(['signal', 'point', 'section', 'block'].includes(k.target), type);
    assert.equal(typeof k.name, 'string', type);
    assert.equal(typeof k.automat, 'boolean', type);
    assert.equal(typeof k.blocksPath, 'boolean', type);
    for (const fn of ['exists', 'pool', 'apply', 'clear']) assert.equal(typeof k[fn], 'function', `${type}.${fn}`);
    if (!k.automat) assert.equal(typeof k.automatGap, 'string', `${type}: czego automat nie robi`);
  }
});

test('cel usterki i losowanie: elementy stacji danego rodzaju; usterki tylko ze scenariusza i blok przebiegowy poza nastawnią mechaniczną się nie losują', () => {
  const sim = makeSim({ disruptions: 'none' });
  assert.deepEqual(FAULT_TYPES.filter((t) => FAULTS[t].pool(sim) != null), ['signal-fail', 'point-control', 'false-occupancy', 'block-fail']);
  for (const t of ['signal-fail', 'point-control', 'false-occupancy', 'block-fail']) {
    const pool = FAULTS[t].pool(sim);
    assert.ok(pool.length > 0 && pool.every((id) => FAULTS[t].exists(sim, id)), t);
  }
  assert.ok(FAULTS['signal-fail'].exists(sim, 'Tm1') && !FAULTS['route-block'].exists(sim, 'Tm1'), 'blok przebiegowy – tylko semafor');
  assert.ok(!FAULTS['false-occupancy'].exists(sim, 'XX'));
  const mech = new Simulation(szkolna, { disruptions: 'none', srk: 'mech', scenario: { id: 't', name: 't', endTime: '09:00' } });
  assert.ok(FAULTS['route-block'].pool(mech).length > 0);
  assert.equal(FAULTS['route-block'].requires(mech), null);
  assert.equal(FAULTS['route-block'].requires(sim).level, 'error');
  assert.equal(FAULTS['axle-counter'].requires(sim).level, 'warning');
});

test('początek i koniec usterki: element niesprawny, potem sprawny; dziennik ma wpis przy każdym; brak elementu – usterka bez skutku', () => {
  const cases = {
    'signal-fail': ['A', (s) => s.ilk.signals.get('A').failed],
    'point-control': ['Zw1', (s) => s.ilk.points.get('Zw1').faultUntil > 0],
    'false-occupancy': ['T1', (s) => !!s.ilk.sections.get('T1').forced],
    'block-fail': ['W', (s) => !!s.blocks.get('W').fault],
    'track-defect': ['T1', (s) => !!s.ilk.sections.get('T1').defect],
    'axle-counter': ['T1', (s) => !!s.ilk.sections.get('T1').axleFault],
  };
  for (const [type, [target, broken]] of Object.entries(cases)) {
    const sim = makeSim({ disruptions: 'none' });
    const log = [];
    const ctx = { time: 0, log: (level, msg) => log.push(level), finish: () => {} };
    const f = { type, target, at: 0, since: 0, duration: 600 };
    assert.equal(FAULTS[type].apply(sim, f, ctx), true, type);
    assert.equal(broken(sim), true, `${type}: po początku`);
    FAULTS[type].clear(sim, f, ctx);
    assert.equal(broken(sim), false, `${type}: po końcu`);
    assert.deepEqual(log, ['alarm', 'info'], type);
    assert.equal(FAULTS[type].apply(sim, { ...f, target: 'XX' }, ctx), false, `${type}: brak elementu`);
  }
});
