import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/model/Simulation.js';
import rumia from '../src/stations/rumia.js';
import { validateStation } from '../src/model/validate.js';
import { Clock } from '../src/core/Clock.js';
import { allArrived, run, play, setRoutes, routeViews } from './helpers.js';
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
  // ziarno stałe: bez niego zmiana losuje je (maszynista, miejsce zatrzymania, tabor), a SKM 93204 / 93205 mają z samego
  // planu ok. 3 min opóźnienia na szlaku RD2 (uwagi line-headway w tests/scenario-accepted.js) – przy rzadkim ziarnie
  // 93205 miał 4 min i test padał przypadkowo (npm run seed-scan, zestaw 139)
  const sim = new Simulation(rumia, { disruptions: 'none', seed: 1 });
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

test('Rumia: pociąg opóźniony u sąsiada i wyprzedzony na szlaku – automat przyjmuje pociągi w kolejności przyjazdu, każdy na swój tor', () => {
  // SKM 93205 z Cisowej opóźniony o 21 min jedzie szlakiem (blokada samoczynna) za następnym z rozkładu, 93207; ten
  // czeka przed semaforem A2, bo tor 5 zajmuje spóźniony SKM 93204 z Redy. Przebieg wjazdowy należy się pociągowi,
  // który stoi pierwszy przed semaforem – nie pierwszemu w rozkładzie.
  const sim = new Simulation(rumia, { disruptions: 'none' });
  const tt = sim.traffic.timetable();
  for (const [nr, min] of [[93204, 26], [93205, 21], [93207, 5]]) sim.traffic.setInboundDelay(tt.find((e) => e.nr === nr), min);
  const end = Clock.parse('08:20');
  play(sim).until(end, { stop: allArrived });
  for (const e of tt) {
    if (e.terminates) { assert.ok(e.status === 'zakończył bieg' || e.status.startsWith('przekazany'), `${e.nr}: ${e.status}`); continue; }
    assert.equal(e.status, 'na następnym posterunku', `${e.nr}: ${e.status}`);
    assert.equal(String(e.actualTrack), String(e.track), `${e.nr}: tor ${e.actualTrack} zamiast ${e.track}`);
  }
  const by = (nr) => tt.find((e) => e.nr === nr);
  assert.ok(by(93207).actualArr < by(93205).actualArr, 'pierwszy wjechał pociąg, który pierwszy stał przed semaforem');
  assert.ok(!sim.score.items.some((i) => i.code === 'unfinished' || i.code === 'wrong-track'), sim.score.items.filter((i) => i.points < 0).map((i) => i.msg).join('; '));
  assert.ok(sim.ended);
});

/** Pełna zmiana z automatem i jedną usterką ze scenariusza; zwraca symulację po przejechaniu wszystkich pociągów. */
function shiftWithFault(fault) {
  const sim = new Simulation(rumia, { disruptions: 'none', scenario: { id: 't', name: 't', endTime: '08:15', faults: [fault] } });
  const end = Clock.parse('09:30');
  play(sim).until(end, { stop: allArrived });
  return sim;
}
const stuckTrains = (sim) => sim.traffic.timetable().filter((e) => !(e.status === 'na następnym posterunku' || e.status === 'zakończył bieg' || e.status.startsWith('przekazany'))).map((e) => `${e.nr}: ${e.status}`);

test('Rumia: usterka obwodu torowego gasi semafor nastawionego przebiegu – automat zwalnia przebieg i nastawia go od nowa po naprawie', () => {
  // 06:20: odcinek Iz38 na drodze nastawionego przebiegu R-C wskazuje zajętość – semafor R sam staje na „Stój” i sam nie wraca
  const sim = shiftWithFault({ type: 'false-occupancy', target: 'Iz38', at: '06:20', duration: 8 });
  assert.deepEqual(stuckTrains(sim), []);
  assert.equal(setRoutes(sim.ilk).length, 0);
  assert.equal(sim.ilk.counters.dPz, 0, 'zwykłe zwolnienie (Pz), bez licznika');
});

test('Rumia: usterka obwodu torowego pod pociągiem – przebieg nie rozwiązuje się sam; automat zwalnia go doraźnie, bez kary (uzasadnione usterką)', () => {
  const sim = new Simulation(rumia, { disruptions: 'none' });
  const from = sim.traffic.timetable().filter((e) => e.from === 'RD2');
  const end = Clock.parse('09:30');
  let faulty = null, stuckSeen = false, repaired = false;
  play(sim).until(end, { stop: allArrived, each: () => {
    // pierwszy pociąg od Redy jest na pierwszym odcinku przebiegu od semafora R: środkowy odcinek wykazuje zajętość
    if (!faulty) {
      const act = routeViews(sim.ilk).find((a) => a.route.start === 'R' && a.entered && a.sections.length >= 3);
      if (act && from[0].train?.occupiedSections().has(act.sections[0])) {
        faulty = sim.ilk.sections.get(act.sections[1]);
        faulty.forced = true; sim.ilk.updateOccupancy(sim.traffic.currentOccupancy());
      }
    } else if (!repaired) {
      const act = routeViews(sim.ilk).find((a) => a.route.start === 'R');
      if (act?.state === 'stuck') stuckSeen = true;
      // obwód torowy naprawiony dopiero po doraźnym zwolnieniu przebiegu
      if (stuckSeen && !act) { faulty.forced = false; sim.ilk.updateOccupancy(sim.traffic.currentOccupancy()); repaired = true; }
    }
  } });
  assert.ok(faulty && stuckSeen, 'usterka pod pociągiem zatrzymała rozwiązanie przebiegu');
  assert.deepEqual(stuckTrains(sim), []);
  assert.equal(setRoutes(sim.ilk).length, 0);
  assert.ok(sim.ilk.counters.dPz >= 1, 'doraźne zwolnienie z licznikiem');
  const dpz = sim.score.items.filter((i) => i.code === 'dPz');
  assert.ok(dpz.length >= 1 && dpz.every((i) => i.points === 0 && /uzasadnione usterką/.test(i.msg)), JSON.stringify(dpz));
});

test('Rumia: kontynuacja wyjazdu (G311 → szlak) nie żąda ochrony bocznej zza własnego semafora – po C-G311 da się nastawić G311-GS2', () => {
  const sim = new Simulation(rumia, { disruptions: 'none' });
  const cont = sim.ilk.routes.get('G311-GS2');
  // za G311 (od strony stacji) leży Zw7a – osłania ją sam semafor G311, nie jest zwrotnicą ochrony bocznej przebiegu
  assert.deepEqual(cont.flank, [], 'ochrona boczna G311-GS2');
  assert.deepEqual(sim.ilk.routes.get('D312-GC2').flank, []);
  assert.equal(sim.ilk.setRoute('C-G311').ok, true);
  run(sim, POINT_SWITCH_TIME + 1);
  assert.ok(sim.ilk.routeIsSet('C-G311'), 'C-G311 utwierdzony');
  assert.deepEqual(sim.ilk.checkRoute(cont), [], 'kontynuacja po utwierdzeniu C-G311');
  assert.equal(sim.ilk.setRoute('G311-GS2').ok, true);
});
