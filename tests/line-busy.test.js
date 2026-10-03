import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/model/Simulation.js';
import szkolna from '../src/stations/szkolna.js';
import rumia from '../src/stations/rumia.js';
import { run, Clock } from './helpers.js';

/*
 * Tor szlakowy nie jest wolny, dopóki pociąg sąsiada stoi przed naszym semaforem wjazdowym – choć zjechał już w całości
 * na odcinek przed semaforem. Przy sprawnej blokadzie dwukierunkowej pilnuje tego kierunek (do Ko). Luki były dwie:
 * zapowiadanie telefoniczne (usterka blokady) i blokada jednokierunkowa, przy których sąsiad wyprawiał następny pociąg.
 */

const waitingBefore = (tr, sig) => !!tr && tr.entered && tr.v === 0 && tr.nextSignal() === sig;

test('zapowiadanie telefoniczne: dopóki pociąg stoi przed semaforem wjazdowym, sąsiad nie dostaje „droga wolna” dla następnego', () => {
  const sim = new Simulation(szkolna, { scenario: 'zmiana-e', disruptions: 'none' });
  const b = sim.blocks.get('W');
  const e = sim.traffic.timetable().find((x) => x.nr === 6101);
  for (let i = 0; i < 6000 && !waitingBefore(e.train, 'A'); i++) { sim.step(0.5); if (b.request === 'theirs') b.press('Poz'); }
  assert.ok(waitingBefore(e.train, 'A'), 'pociąg 6101 stoi przed A');
  assert.equal(b.occupied, false, 'pociąg zjechał z toru szlakowego na odcinek przed semaforem');
  assert.equal(b.awaitingEntry, true);
  // usterka blokady – zapowiadanie telefoniczne; sąsiad pyta o drogę dla następnego pociągu
  b.setFault(true);
  assert.equal(b.phoneAskFromNeighbour(6103), false, 'zapytanie o drogę przy pociągu przed semaforem wjazdowym');
  b.phone.askedByThem = 6103; // zapytanie, które mimo to dotarło (np. tuż przed usterką)
  assert.deepEqual(b.phoneAnswerFree(6103), { ok: false, reason: 'Droga nie jest wolna' });
  assert.equal(b.canNeighbourDispatch(6103), false);
  b.phone.askedByThem = null;
  // naprawa blokady z pociągiem wciąż przed semaforem: kierunek zostaje „wjazd”, sąsiad nie żąda pozwolenia
  b.setFault(false);
  assert.equal(b.direction, 'in');
  assert.ok(!b.neighbourRequests(6103), 'żądanie pozwolenia przy pociągu przed semaforem wjazdowym');
  // pociąg wjeżdża, Ko – dopiero wtedy tor szlakowy jest wolny
  assert.ok(sim.ilk.setRoute('A-D1').ok);
  for (let i = 0; i < 2000 && !b.koPending; i++) sim.step(0.5);
  assert.equal(b.awaitingEntry, false);
  assert.ok(b.press('Ko').ok);
  assert.equal(b.neighbourRequests(6103), true);
});

test('blokada jednokierunkowa (Rumia, tor od Redy): sąsiad nie wyprawia następnego pociągu, dopóki poprzedni stoi przed semaforem R', () => {
  const sim = new Simulation(rumia, { disruptions: 'none' });
  const b = sim.blocks.get('RD2');
  const from = sim.traffic.timetable().filter((e) => e.from === 'RD2');
  const [first, second] = from;
  for (let i = 0; i < 8000 && !waitingBefore(first.train, 'R'); i++) sim.step(0.5);
  assert.ok(waitingBefore(first.train, 'R'), `pociąg ${first.nr} stoi przed R`);
  // semafor R zostaje na „Stój” do planowego przyjazdu następnego pociągu i 10 min dłużej
  const until = second.arrTime + 10 * 60;
  let queued = 0;
  while (sim.clock.time < until) { sim.step(0.5); queued = Math.max(queued, from.filter((e) => e.train && !e.train.finished && e.train.entryPending).length); }
  assert.equal(queued, 1, 'przed semaforem R (i na torze szlakowym) najwyżej jeden pociąg');
  assert.equal(second.dispatched, false, `pociąg ${second.nr} czeka u sąsiada`);
  // wjazd pierwszego, Ko – sąsiad wyprawia następny
  const route = sim.ilk.routeList().find((r) => r.start === 'R' && r.kind === 'train' && sim.ilk.checkRoute(r).length === 0);
  assert.ok(sim.ilk.setRoute(route.id).ok);
  for (let i = 0; i < 2000 && !b.koPending; i++) sim.step(0.5);
  assert.ok(b.press('Ko').ok);
  run(sim, 120);
  assert.equal(second.dispatched, true);
  assert.ok(Clock.format(sim.clock.time) > '06:00');
});

test('blokada samoczynna (Rumia, tor od Cisowej): ostatni odstęp kończy się na semaforze wjazdowym – sąsiad nie wyprawia następnego, dopóki poprzedni stoi przed nim', () => {
  // wcześniej odstęp SBL zwalniał się, gdy pociąg zjechał ze szlaku na odcinek przed semaforem; sąsiad wyprawiał następny
  // pociąg, który wjeżdżał na odcinek zajęty przez poprzedni (przegląd: dwa pociągi na Zb* w Orłowie, Chyloni, Tczewie)
  const sim = new Simulation(rumia, { disruptions: 'none' });
  const b = sim.blocks.get('GS1');
  assert.equal(b.auto, true);
  const ex = rumia.exits.GS1;
  const app = sim.ilk.topo.trackAt(ex.tile.x, ex.tile.y).section;
  const sig = sim.ilk.routeList().find((r) => r.kind === 'train' && r.approach === app).start;
  const from = sim.traffic.timetable().filter((e) => e.from === 'GS1');
  const [first, second] = from;
  for (let i = 0; i < 8000 && !waitingBefore(first.train, sig); i++) sim.step(0.5);
  assert.ok(waitingBefore(first.train, sig), `pociąg ${first.nr} stoi przed ${sig}`);
  assert.equal(b.occupied, false, 'pociąg zjechał ze szlaku na odcinek przed semaforem');
  assert.equal(b.awaitingEntry, true);
  const until = second.arrTime + 10 * 60;
  let queued = 0;
  while (sim.clock.time < until) { sim.step(0.5); queued = Math.max(queued, from.filter((e) => e.train && !e.train.finished && e.train.entryPending).length); }
  assert.equal(queued, 1, `przed semaforem ${sig} (i na szlaku) najwyżej jeden pociąg`);
  assert.equal(second.dispatched, false, `pociąg ${second.nr} czeka u sąsiada`);
  // wjazd pierwszego – odstęp wolny bez obsługi (SBL), sąsiad wyprawia następny
  const route = sim.ilk.routeList().find((r) => r.start === sig && r.kind === 'train' && sim.ilk.checkRoute(r).length === 0);
  assert.ok(sim.ilk.setRoute(route.id).ok);
  for (let i = 0; i < 2000 && b.awaitingEntry; i++) sim.step(0.5);
  assert.equal(b.awaitingEntry, false);
  run(sim, 120);
  assert.equal(second.dispatched, true);
});

test('pociąg kończący bieg, który stanął za taborem na odcinku przed semaforem wjazdowym, nie „przyjechał” – nie kończy biegu poza torem stacyjnym', () => {
  const sim = new Simulation(szkolna, { disruptions: 'none', scenario: { id: 't', name: 't', endTime: '09:00', tasks: [], timetable: [
    { nr: 1, kind: 'os', name: 'stojący przed A', from: null, to: null, dep: '09:30', track: '1', stop: true, terminates: true, length: 130, vmax: 60, startOn: { section: 'ZbA', dir: 'E' } },
    { nr: 90201, kind: 'os', name: 'Osobowy', from: 'W', to: null, arr: '07:12', track: '2', stop: true, terminates: true, length: 180, vmax: 100, dwell: 30 },
  ] } });
  const b = sim.blocks.get('W');
  const e = sim.traffic.timetable().find((x) => x.nr === 90201);
  for (let i = 0; i < 6000 && !(e.train?.entered && e.train.v === 0); i++) { sim.step(0.5); if (b.request === 'theirs') b.press('Poz'); }
  assert.ok(e.train?.entered && e.train.v === 0, 'pociąg stanął');
  assert.equal(e.train.stoppedAt?.reason, 'tabor na torze');
  assert.ok(e.train.occupiedSections().has('ZbA'));
  run(sim, 60);
  assert.equal(e.actualArr, null, 'przyjazdu nie ma – pociąg stoi przed semaforem wjazdowym');
  assert.notEqual(e.phase, 'ended');
  assert.equal(e.train.hasStopped, false);
});
