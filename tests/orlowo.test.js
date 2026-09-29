import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/model/Simulation.js';
import orlowo from '../src/stations/gdynia-orlowo.js';
import { validateStation } from '../src/model/validate.js';
import { Clock } from '../src/core/Clock.js';
import { autoDispatch, allArrived } from './helpers.js';

test('Gdynia Orłowo: definicja poprawna, brak urwanych torów, przebiegi zgodne z planem', () => {
  assert.deepEqual(validateStation(orlowo).errors, []);
  const sim = new Simulation(orlowo, { disruptions: 'none' });
  assert.equal(sim.ilk.topo.tracks.filter((t) => t._openPorts).length, 0, 'urwane porty toru');
  const ends = (start, kind = 'train') => new Set(sim.ilk.routeList().filter((r) => r.start === start && r.kind === kind).map((r) => r.end.id));
  // linia 202: tor 1 od Sopotu, tor 2 od Gdyni; zjazdy na tory 3/4/6 przez rozjazdy 1–7 i 31–37
  assert.ok(ends('A').has('J') && ends('A').has('K'), 'wjazd od Sopotu na tor 1 i 3');
  assert.ok(ends('B').has('H') && ends('B').has('G'), 'wjazd od Sopotu na tor 2 i 6');
  assert.ok(ends('L').has('D') && ends('L').has('C') && ends('L').has('E') && ends('L').has('F'), 'wjazd od Gdyni torem 1 na tory 1, 3, 2, 4');
  assert.ok(ends('M').has('E') && ends('M').has('F'), 'wjazd od Gdyni torem 2 na tory 2 i 4');
  assert.ok(ends('J').has('Z1') && ends('K').has('Z1') && ends('G').has('Z2') && ends('H').has('Z2'));
  assert.ok(ends('D').has('S1') && ends('C').has('S1') && ends('E').has('S2') && ends('F').has('S2'));
  assert.ok(ends('J').has('Z1') && !ends('J').has('Z2'), 'z toru 1 wyjazd tylko torem prawym (rozjazdy 31–37 bez przejścia na tor 2 w kierunku Gdyni)');
  // SKM: tory 501/502 z przejściami przez rozjazdy S1/S2 i S51–S54
  assert.ok(ends('A501').has('T501') && ends('A501').has('T502') && ends('A502').has('T502'));
  assert.ok(ends('T502').has('Z502') && ends('T502').has('Z501') && ends('T501').has('Z501'));
  assert.ok(ends('P').has('D502') && ends('R').has('C501') && ends('R').has('D502'));
  // manewry: tor 6 ↔ bocznica 18 (Wk11) i tor 4 ↔ tor 6 przez rozjazdy 25/26 z nawrotem za rozjazdem 37
  assert.ok(ends('G', 'shunt').has('kT18'), 'wjazd manewrowy na tor 18');
  assert.ok(ends('Tm3', 'shunt').has('Tm5') && ends('Tm6', 'shunt').has('Tm4'), 'manewr tor 4 → Tm5 → tor 6');
  assert.ok(ends('Tm11', 'shunt').has('G') && ends('Tm13', 'shunt').has('Tm4'));
  // brak przebiegów zawracających
  for (const r of sim.ilk.routeList()) {
    const sig = sim.ilk.signals.get(r.start);
    if (r.exit) assert.equal(sim.station.exits[r.exit].dir, sig.dir, `przebieg ${r.id} zawraca`);
  }
});

test('Gdynia Orłowo: pełna zmiana – SKM co 15 min, regionalne z postojem, skład EZT z Bazy i do Bazy (manewr dwuetapowy)', () => {
  const sim = new Simulation(orlowo, { disruptions: 'none' });
  const end = Clock.parse('08:20');
  let n = 0;
  while (sim.clock.time < end && !allArrived(sim)) {
    sim.step(0.5);
    if (n++ % 4 === 0) autoDispatch(sim);
    if (n % 20 === 0) {
      const occ = new Map();
      for (const tr of sim.traffic.trains) {
        if (tr.mode !== 'train') continue;
        for (const s of tr.occupiedSections()) { assert.ok(!occ.has(s) || occ.get(s) === tr.nr, `kolizja na ${s}`); occ.set(s, tr.nr); }
      }
    }
  }
  const tt = sim.traffic.timetable();
  assert.equal(tt.length, 29);
  for (const e of tt) {
    if (e.terminates) { assert.equal(e.status, 'zakończył bieg', `${e.nr}: ${e.status}`); continue; }
    assert.equal(e.status, 'na następnym posterunku', `${e.nr}: ${e.status}`);
    if (e.from) assert.equal(String(e.actualTrack), String(e.track), `${e.nr}: tor ${e.actualTrack} zamiast ${e.track}`);
    assert.ok(e.delay <= 3, `${e.nr}: opóźnienie ${e.delay}`);
  }
  const task = sim.traffic.tasks.find((t) => t.id === 'baza-88302');
  assert.equal(task.done, true, 'skład 88302 nie odstawiony na tor 6');
  assert.ok(task.doneAt <= task.deadlineTime, 'zadanie po terminie');
  const unit = tt.find((e) => e.nr === 88302).train;
  assert.deepEqual([...unit.occupiedSections()], ['T6'], 'skład nie stoi w całości na torze 6');
  assert.ok(!sim.score.items.some((i) => i.code === 'held' && /88302/.test(i.msg)), 'pociąg kończący bieg nie jest „przetrzymany”');
  assert.ok(!sim.score.items.some((i) => i.code === 'unfinished'), 'wszystkie pociągi obsłużone do końca zmiany');
  assert.equal(sim.ilk.counters.rozprucie, 0);
  assert.ok(sim.ended);
});

test('Gdynia Orłowo: scenariusz z usterką blokady od Gdyni – zapowiadanie telefoniczne', () => {
  const sim = new Simulation(orlowo, { scenario: 'usterka-202' });
  const end = Clock.parse('08:20');
  let n = 0;
  while (sim.clock.time < end && !allArrived(sim)) { sim.step(0.5); if (n++ % 4 === 0) autoDispatch(sim); }
  for (const e of sim.traffic.timetable().filter((x) => x.from === 'Z2' || x.to === 'Z2')) {
    assert.ok(e.status === 'na następnym posterunku' || e.status === 'zakończył bieg', `${e.nr}: ${e.status}`);
  }
  // linia dwutorowa: przy zapowiadaniu na torze właściwym sąsiad nie pyta o drogę, tylko zawiadamia o odjeździe
  // (Ir-1 §23 ust. 2–4) – dawniej gra wymagała pytania „Czy droga … wolna?” także tu
  assert.ok(sim.comms.messages.some((m) => m.dir === 'in' && /Pociąg nr \d+ odjechał o/.test(m.text)), 'brak zawiadomienia o odjeździe');
  assert.ok(!sim.comms.messages.some((m) => m.kind === 'ask' && m.exit === 'Z2'), 'pytanie o drogę na torze właściwym');
  assert.ok(!sim.score.items.some((i) => i.code === 'comms-wrong'), 'zła formuła telefoniczna');
});
