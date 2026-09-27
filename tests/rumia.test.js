import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/model/Simulation.js';
import rumia from '../src/stations/rumia.js';
import { validateStation } from '../src/model/validate.js';
import { Clock } from '../src/core/Clock.js';
import { autoDispatch, allArrived, run } from './helpers.js';
import { POINT_SWITCH_TIME } from '../src/model/Interlocking.js';

test('Rumia: definicja poprawna, brak urwanych torów, przebiegi zgodne z planem (wyjazdy na zachód dwustopniowe)', () => {
  assert.deepEqual(validateStation(rumia).errors, []);
  const sim = new Simulation(rumia, { disruptions: 'none' });
  assert.equal(sim.ilk.topo.tracks.filter((t) => t._openPorts).length, 0, 'urwane porty toru');
  const ends = (start, kind = 'train') => new Set(sim.ilk.routeList().filter((r) => r.start === start && r.kind === kind).map((r) => r.end.id));
  // wjazdy od Gdyni: A (202 t.1) na tory 1, 3, 5; A2 (250 t.1) na tory 5, 3, 1 (przez 7/7a i skrzyżowanie 2–5)
  assert.deepEqual([...ends('A')].sort(), ['M', 'N', 'O']);
  assert.deepEqual([...ends('A2')].sort(), ['M', 'N', 'O']);
  // wjazdy od Redy: R na tor 2, tor 3, tor 5 i tor 6 (przez 31/30); nie na tor 1 ani „przelotem” na zachód
  assert.deepEqual([...ends('R')].sort(), ['C', 'D', 'E', 'F']);
  // wyjazdy na zachód: semafor toru → semafor na szlaku → szlak; nic na tory szlakowe wjazdowe (GS1/GC1)
  assert.deepEqual([...ends('E')], ['D312']); assert.deepEqual([...ends('D312')], ['GC2']);
  assert.deepEqual([...ends('D')], ['G311']); assert.deepEqual([...ends('C')], ['G311']); assert.deepEqual([...ends('G311')], ['GS2']);
  assert.equal(ends('F').size, 0, 'tor 6: wyjazd na zachód tylko manewrami (Tm6/Tm5)');
  // wyjazdy na wschód tylko na tor 1 do Redy (tor 2 od Redy jest wjazdowy)
  for (const s of ['K', 'M', 'N', 'O']) assert.deepEqual([...ends(s)], ['RD1'], `${s}: tylko RD1`);
  // manewry: tor 8 (plac ładunkowy) z Tm6, żeberko 13 z torów 3/5
  assert.ok(ends('Tm6', 'shunt').has('kT8') && ends('N', 'shunt').has('kT13') && ends('O', 'shunt').has('kT13'));
  for (const r of sim.ilk.routeList()) {
    const sig = sim.ilk.signals.get(r.start);
    if (r.exit) assert.equal(sim.station.exits[r.exit].dir, sig.dir, `przebieg ${r.id} zawraca`);
  }
  // scenariusze: pulpit typu E (stan 2020) i stanowisko komputerowe
  assert.equal(new Simulation(rumia, { scenario: 'zmiana' }).srk.view, 'desk');
  assert.equal(new Simulation(rumia, { scenario: 'zmiana-lcs' }).srk.view, 'screen');
});

test('Rumia: pełna zmiana – SKM co 15 min w obu kierunkach na torze 5, regionalne, IC/TLK i towarowe, zdawczy na tor 6', () => {
  const sim = new Simulation(rumia, { disruptions: 'none' });
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
    if (e.terminates) { assert.ok(e.status === 'zakończył bieg' || e.status.startsWith('przekazany'), `${e.nr}: ${e.status}`); assert.equal(String(e.actualTrack), '6'); continue; }
    assert.equal(e.status, 'na następnym posterunku', `${e.nr}: ${e.status}`);
    assert.equal(String(e.actualTrack), String(e.track), `${e.nr}: tor ${e.actualTrack} zamiast ${e.track}`);
    assert.ok(e.delay <= 3, `${e.nr}: opóźnienie ${e.delay}`);
  }
  assert.ok(!sim.score.items.some((i) => i.code === 'held'), 'przetrzymania: ' + sim.score.items.filter((i) => i.code === 'held').map((i) => i.msg).join('; '));
  assert.ok(!sim.score.items.some((i) => i.code === 'unfinished'));
  assert.equal(sim.ilk.counters.rozprucie, 0);
  assert.ok(sim.ended);
});

test('Rumia: kontynuacja wyjazdu (G311 → szlak) nie żąda ochrony bocznej zza własnego semafora – po C-G311 da się nastawić G311-GS2', () => {
  const sim = new Simulation(rumia, { disruptions: 'none' });
  const cont = sim.ilk.routes.get('G311-GS2');
  // za G311 (od strony stacji) leży Zw7a – osłania ją sam semafor G311, nie jest zwrotnicą ochrony bocznej przebiegu
  assert.deepEqual(cont.flank, [], 'ochrona boczna G311-GS2');
  assert.deepEqual(sim.ilk.routes.get('D312-GC2').flank, []);
  assert.equal(sim.ilk.setRoute('C-G311').ok, true);
  run(sim, POINT_SWITCH_TIME + 1);
  assert.ok(sim.ilk.active.has('C-G311'), 'C-G311 utwierdzony');
  assert.deepEqual(sim.ilk.checkRoute(cont), [], 'kontynuacja po utwierdzeniu C-G311');
  assert.equal(sim.ilk.setRoute('G311-GS2').ok, true);
});
