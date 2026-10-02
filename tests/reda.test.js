import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/model/Simulation.js';
import reda from '../src/stations/reda.js';
import { validateStation } from '../src/model/validate.js';
import { Clock } from '../src/core/Clock.js';
import { allArrived, play } from './helpers.js';

test('Reda: definicja poprawna, brak urwanych torów, przebiegi zgodne z planem (węzeł z linią 213, peron czołowy Ia)', () => {
  assert.deepEqual(validateStation(reda).errors, []);
  const sim = new Simulation(reda, { disruptions: 'none' });
  assert.equal(sim.ilk.topo.tracks.filter((t) => t._openPorts).length, 0, 'urwane porty toru');
  const ends = (start, kind = 'train') => new Set(sim.ilk.routeList().filter((r) => r.start === start && r.kind === kind).map((r) => r.end.id));
  // wjazd od Rumi: A na tory 1, 3 (przez 6/7/8 – koniec na M), 2 i 4 (przez 1/2/3/4)
  assert.deepEqual([...ends('A')].sort(), ['K2', 'K4', 'L', 'M']);
  // wjazd od Wejherowa: S na tory 2, 4, 1 (przez 27/25) i 23 (przez 22); od Helu: R na tor 23, 1, 2 i czołowy tor 11 (kozioł)
  assert.deepEqual([...ends('S')].sort(), ['C1', 'C2', 'D', 'E']);
  assert.deepEqual([...ends('R')].sort(), ['C1', 'C2', 'D', 'kT11']);
  // przebieg pociągowy kończy się na kozle tylko dla toru stacyjnego (peron Ia); bocznice (106, Transbud) tylko manewrami
  assert.ok(!sim.ilk.routeList().some((r) => r.kind === 'train' && ['kT106', 'kT51'].includes(r.end.id)), 'przebieg pociągowy na kozioł bocznicy');
  assert.ok(ends('Tm20', 'shunt').has('kT106') && ends('C2', 'shunt').has('kT51') && ends('Tm7', 'shunt').has('M'));
  // wyjazdy na zachód dwustopniowe: semafor toru → Szn2 → szlak; nic na tor wjazdowy RM1
  for (const s of ['E', 'D', 'C1', 'C2']) assert.deepEqual([...ends(s)], ['Szn2'], `${s}: tylko Szn2`);
  assert.deepEqual([...ends('Szn2')], ['RM2']);
  // wyjazdy na wschód: na 202 przez Szn1 (tor wyjazdowy), na 213 wprost; z toru 11 tylko do Helu
  for (const s of ['K4', 'K2', 'L', 'M']) assert.deepEqual([...ends(s)].sort(), ['HL', 'Szn1'], `${s}: Szn1 i Hel`);
  assert.deepEqual([...ends('P')], ['HL']); assert.deepEqual([...ends('Szn1')], ['WJ1']);
  for (const r of sim.ilk.routeList()) {
    const sig = sim.ilk.signals.get(r.start);
    if (r.exit) assert.equal(sim.station.exits[r.exit].dir, sig.dir, `przebieg ${r.id} zawraca`);
  }
  assert.equal(new Simulation(reda, { scenario: 'zmiana' }).srk.view, 'desk');
  assert.equal(new Simulation(reda, { scenario: 'zmiana-lcs' }).srk.view, 'screen');
});

test('Reda: pełna zmiana – regionalne i IC na peronie II, wahadła Hel na torze 11, TLK z Helu przez peron I, towarowe torem 3/23, zdawczy z toru 4', () => {
  const sim = new Simulation(reda, { disruptions: 'none' });
  const end = Clock.parse('08:20');
  play(sim).until(end, { stop: allArrived, each: (_, { steps }) => {
    if (steps % 20 === 0) {
      const occ = new Map();
      for (const tr of sim.traffic.trains) {
        if (tr.mode !== 'train') continue;
        for (const s of tr.occupiedSections()) { assert.ok(!occ.has(s) || occ.get(s) === tr.nr, `kolizja na ${s}`); occ.set(s, tr.nr); }
      }
    }
  } });
  const tt = sim.traffic.timetable();
  assert.equal(tt.length, 19);
  for (const e of tt) {
    if (e.terminates) { assert.ok(e.status === 'zakończył bieg' || e.status.startsWith('przekazany'), `${e.nr}: ${e.status}`); assert.equal(String(e.actualTrack), '11'); continue; }
    assert.equal(e.status, 'na następnym posterunku', `${e.nr}: ${e.status}`);
    assert.equal(String(e.actualTrack), String(e.track), `${e.nr}: tor ${e.actualTrack} zamiast ${e.track}`);
    assert.ok(e.delay <= 3, `${e.nr}: opóźnienie ${e.delay}`);
  }
  assert.ok(!sim.score.items.some((i) => i.code === 'held'), 'przetrzymania: ' + sim.score.items.filter((i) => i.code === 'held').map((i) => i.msg).join('; '));
  assert.ok(sim.ended, 'zmiana zakończona');
});
