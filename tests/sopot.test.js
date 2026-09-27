import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/model/Simulation.js';
import sopot from '../src/stations/sopot.js';
import { validateStation } from '../src/model/validate.js';
import { Clock } from '../src/core/Clock.js';
import { autoDispatch, allArrived } from './helpers.js';

test('Sopot: definicja poprawna, brak urwanych torów, przebiegi zgodne z planem', () => {
  assert.deepEqual(validateStation(sopot).errors, []);
  const sim = new Simulation(sopot, { disruptions: 'none' });
  assert.equal(sim.ilk.topo.tracks.filter((t) => t._openPorts).length, 0, 'urwane porty toru');
  const ends = (start, kind = 'train') => new Set(sim.ilk.routeList().filter((r) => r.start === start && r.kind === kind).map((r) => r.end.id));
  // przejazd toru 202 to trzy przebiegi: A → H (tor 2a) → O (tor 2) → Orłowo; S → L (tor 1) → C (tor 1a) → Gdańsk
  assert.ok(ends('A').has('H') && ends('A').has('K') && ends('A').has('G'), 'A: tory 2a, 1a, 6');
  assert.ok(ends('B').has('K') && ends('B').has('H') && ends('B').has('J'), 'B: tory 1a, 2a, 4');
  assert.ok(ends('H').has('O') && ends('K').has('P') && ends('G').has('O') && ends('J').has('P'));
  assert.ok(ends('O').has('OR1') && ends('O').has('OR2') && ends('P').has('OR2') && !ends('P').has('OR1'), 'rozjazdy 41–45 tylko z toru górnego na dolny');
  assert.ok(ends('S').has('L') && ends('S').has('M') && ends('R').has('M') && !ends('R').has('L'));
  assert.ok(ends('L').has('C') && ends('L').has('D') && ends('M').has('E') && ends('M').has('F'));
  assert.ok(ends('C').has('GD2') && ends('C').has('GD1') && ends('E').has('GD1'));
  // SKM: wjazd od razu na tor peronowy, wyjazd wprost na szlak; tor 13 z L501, powrót spod Tm13
  assert.ok(ends('A501').has('R501') && ends('A501').has('R502') && ends('A502').has('R502'));
  assert.ok(ends('S502').has('L502') && ends('S501').has('L501') && ends('L502').has('GS2') && ends('R501').has('OS1'));
  assert.ok(ends('L501', 'shunt').has('kT13') && ends('Tm13', 'shunt').has('R501'));
  assert.ok(ends('F', 'shunt').has('kT6b') && ends('G', 'shunt').has('kT6a') && ends('D', 'shunt').has('kT4b') && ends('J', 'shunt').has('kT4a'));
  for (const r of sim.ilk.routeList()) {
    const sig = sim.ilk.signals.get(r.start);
    if (r.exit) assert.equal(sim.station.exits[r.exit].dir, sig.dir, `przebieg ${r.id} zawraca`);
  }
});

test('Sopot: pełna zmiana – przejazdy trzyprzebiegowe, odstawianie na tor 13 i tor 4, dwa składy przekazane', () => {
  const sim = new Simulation(sopot, { disruptions: 'none' });
  const end = Clock.parse('08:20');
  let n = 0;
  while (sim.clock.time < end && !allArrived(sim)) {
    sim.step(0.5);
    if (n++ % 4 === 0) autoDispatch(sim);
    if (n % 20 === 0) {
      const occ = new Map();
      for (const tr of sim.traffic.trains) {
        if (tr.finished) continue;
        for (const s of tr.occupiedSections()) { assert.ok(!occ.has(s) || occ.get(s) === tr.nr, `kolizja na ${s} (${occ.get(s)} i ${tr.nr})`); occ.set(s, tr.nr); }
      }
    }
  }
  const tt = sim.traffic.timetable();
  assert.equal(tt.length, 29);
  for (const e of tt) {
    if (e.terminates) { assert.ok(e.status.startsWith('przekazany'), `${e.nr}: ${e.status}`); continue; }
    assert.equal(e.status, 'na następnym posterunku', `${e.nr}: ${e.status}`);
    if (e.from) assert.equal(String(e.actualTrack), String(e.track), `${e.nr}: tor ${e.actualTrack} zamiast ${e.track}`);
    assert.ok(e.delay <= 3, `${e.nr}: opóźnienie ${e.delay}`);
  }
  for (const t of sim.traffic.tasks) { assert.equal(t.done, true, `zadanie ${t.id}`); assert.ok(t.doneAt <= t.deadlineTime, `zadanie ${t.id} po terminie`); }
  assert.ok(!sim.score.items.some((i) => i.code === 'held' || i.code === 'unfinished' || i.code === 'wrong-track'),
    sim.score.items.filter((i) => i.points < 0).map((i) => i.msg).join('; '));
  assert.equal(sim.ilk.counters.rozprucie, 0);
  assert.ok(sim.ended);
});

test('tabor manewrujący zatrzymuje się przed taborem stojącym na torze zajętym (jazda na Ms2)', () => {
  const sim = new Simulation(sopot, { disruptions: 'none', scenario: { id: 't', name: 't', tasks: [], timetable: [
    { nr: 1, kind: 'os', name: 'stojący', from: null, to: null, dep: '09:00', track: '501', stop: true, terminates: true, length: 130, vmax: 90, startOn: { section: 'T501a', dir: 'E' } },
    { nr: 2, kind: 'os', name: 'manewrujący', from: null, to: null, dep: '09:00', track: '13', stop: true, terminates: true, length: 130, vmax: 60, startOn: { section: 'T13', dir: 'E' } },
  ] } });
  sim.step(0.5);
  sim.traffic.toShunting(2);
  assert.ok(sim.ilk.setRoute('Tm13-R501').ok, 'przebieg manewrowy na tor zajęty');
  for (let i = 0; i < 600 && sim.clock.time < Clock.parse('06:10'); i++) sim.step(0.5);
  const a = sim.traffic.trains.find((t) => t.nr === 1), b = sim.traffic.trains.find((t) => t.nr === 2);
  assert.equal(b.v, 0);
  assert.equal(b.stoppedAt?.reason, 'tabor na torze');
  for (const s of b.occupiedSections()) assert.ok(!a.occupiedSections().has(s), `najechanie na ${s}`);
});
