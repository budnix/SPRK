import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/model/Simulation.js';
import szkolna from '../src/stations/szkolna.js';
import { Interlocking } from '../src/model/Interlocking.js';
import { autoDispatch, allArrived, Clock } from './helpers.js';

/* Automat dyżurnego (AutoOperator) – decyzje, które nie mogą kończyć się zatorem. */

test('krzyżowanie na szlaku jednotorowym: tor planowy zajęty przez pociąg, który czeka na ten sam szlak – automat przyjmuje na inny tor', () => {
  // 1001 z Dębna stoi na torze 1 i odjedzie do Lipna; 1002 z Lipna ma w rozkładzie też tor 1. Dopóki 1002 stoi przed
  // semaforem A, szlak do Lipna jest zajęty i 1001 nie odjedzie – a 1002 nie wjedzie na zajęty tor 1.
  const sim = new Simulation(szkolna, { srk: 'E', disruptions: 'none', scenario: { id: 't', name: 't', endTime: '08:00', tasks: [], timetable: [
    { nr: 1001, kind: 'os', name: 'Osobowy', from: 'E', to: 'W', arr: '07:10', dep: '07:20', track: '1', stop: true, length: 130, vmax: 100, dwell: 60 },
    { nr: 1002, kind: 'os', name: 'Osobowy', from: 'W', to: 'E', arr: '07:14', dep: '07:16', track: '1', stop: true, length: 130, vmax: 100, dwell: 60 },
  ] } });
  const end = Clock.parse('09:00');
  let n = 0;
  while (sim.clock.time < end && !allArrived(sim)) { sim.step(0.5); if (n++ % 4 === 0) autoDispatch(sim); }
  const tt = sim.traffic.timetable();
  for (const e of tt) assert.equal(e.status, 'na następnym posterunku', `${e.nr}: ${e.status}`);
  assert.equal(String(tt.find((e) => e.nr === 1001).actualTrack), '1');
  assert.equal(String(tt.find((e) => e.nr === 1002).actualTrack), '2', 'krzyżowanie na torze 2');
  assert.equal(sim.ilk.counters.rozprucie, 0);
  assert.deepEqual(sim.score.items.filter((i) => i.code === 'spad' || i.code === 'unfinished'), []);
});

test('krzyżowanie, gdy tor planowy ma dwa odcinki (Reda: peron I na T23, dalej T3) – pociąg czekający na szlak stoi na pierwszym', async () => {
  // 56710 do Helu stoi przy peronie I (odcinek T23 toru 3); 55711 z Helu ma w rozkładzie tor 3, a przebieg R-C2 kończy
  // się dalej, na T3. Automat sprawdzał tylko ostatni odcinek przebiegu – nie widział krzyżowania i 55711 czekał przed R
  // bez końca, a 56710 nie mógł wyjechać na zajęty szlak.
  const { default: reda } = await import('../src/stations/reda.js');
  const sim = new Simulation(reda, { srk: 'E', disruptions: 'none', scenario: { id: 't', name: 't', endTime: '08:30', tasks: [], timetable: [
    // 56710 przyjeżdża pierwszy i długo stoi; Puck zgłasza 55711, gdy 56710 już jest na torze 3 (tory 1, 2, 11 wolne – Poz)
    { nr: 56710, kind: 'os', name: 'Regio Gdynia Gł. – Hel', from: 'RM1', to: 'HL', arr: '07:05', dep: '07:35', track: '3', stop: true, length: 130, vmax: 100, dwell: 40 },
    { nr: 55711, kind: 'os', name: 'Regio Hel – Gdynia Gł.', from: 'HL', to: 'RM2', arr: '07:30', dep: '07:32', track: '3', stop: true, length: 130, vmax: 100, dwell: 40 },
  ] } });
  let n = 0, met = false;
  while (sim.clock.time < Clock.parse('09:00') && !allArrived(sim)) {
    sim.step(0.5);
    if (n++ % 4 === 0) autoDispatch(sim);
    const [a, b] = [56710, 55711].map((nr) => sim.traffic.timetable().find((e) => e.nr === nr).train);
    // krzyżowanie naprawdę zachodzi: 56710 stoi na T23, a 55711 jest już na szlaku od Helu
    if (a?.entered && a.v === 0 && a.occupiedSections().has('T23') && b && !b.entered) met = true;
  }
  assert.ok(met, 'pociągi się krzyżują');
  const tt = sim.traffic.timetable();
  for (const e of tt) assert.equal(e.status, 'na następnym posterunku', `${e.nr}: ${e.status}`);
  assert.equal(String(tt.find((e) => e.nr === 56710).actualTrack), '3');
  assert.notEqual(String(tt.find((e) => e.nr === 55711).actualTrack), '3', 'krzyżowanie na innym torze');
  assert.deepEqual(sim.score.items.filter((i) => i.code === 'spad' || i.code === 'unfinished'), []);
});

test('sygnał wyjazdowy już raz był podany (Pwl), a przebieg trzeba było nastawić od nowa: automat wyprawia pociąg na sygnał zastępczy', () => {
  const sim = new Simulation(szkolna, { scenario: 'zmiana-e', disruptions: 'none' });
  const e = sim.traffic.timetable().find((x) => x.nr === 6101);
  const end = Clock.parse('10:30');
  let n = 0, cancelled = false;
  while (sim.clock.time < end && !allArrived(sim)) {
    sim.step(0.5);
    if (n++ % 4 === 0) autoDispatch(sim);
    // semafor wyjazdowy D1 podał sygnał dla 6101, pociąg jeszcze stoi – sygnał odwołany, przebieg zwolniony (raz)
    if (!cancelled && e.train && e.train.v === 0 && e.train.hasStopped && sim.ilk.signals.get('D1').route === 'D1-E' && Interlocking.isTrainProceed(sim.ilk.signals.get('D1').aspect)) {
      sim.ilk.cancelSignal('D1');
      assert.ok(sim.ilk.releaseRoute('D1', false).ok);
      cancelled = true;
      assert.equal(sim.blocks.get('E').pwl, true, 'przeciwwtórność – drugiego sygnału na to pozwolenie nie będzie');
    }
  }
  assert.ok(cancelled, 'sygnał wyjazdowy był podany i odwołany');
  assert.equal(e.status, 'na następnym posterunku', `6101: ${e.status}`);
  assert.ok(sim.ilk.counters.Sz >= 1, 'wyjazd na Sz');
  for (const x of sim.traffic.timetable()) assert.ok(x.status === 'na następnym posterunku' || x.status === 'zakończył bieg' || x.status.startsWith('przekazany'), `${x.nr}: ${x.status}`);
});

test('mijanka z dwoma torami (Olszyny): gdy z przeciwka nadjeżdża pociąg, automat nie zajmuje ostatniego wolnego toru pociągiem, który czeka na ten sam szlak', async () => {
  const { default: olszyny } = await import('../src/stations/olszyny.js');
  // 3001 stoi na torze 2 i odjedzie do Grabowca; 3002 jedzie z Grabowca (ma pozwolenie) na tor 1; 3003 z Wierzbna też
  // chce na tor 1 i też do Grabowca. Gdyby wjechał, oba tory zajęłyby pociągi czekające na szlak, z którego jedzie 3002.
  const sim = new Simulation(olszyny, { srk: 'E', disruptions: 'none', scenario: { id: 't', name: 't', endTime: '08:30', tasks: [], timetable: [
    { nr: 3001, kind: 'os', name: 'Osobowy', from: 'W', to: 'E', arr: '07:10', dep: '07:40', track: '2', stop: true, length: 100, vmax: 100, dwell: 60 },
    { nr: 3003, kind: 'os', name: 'Osobowy', from: 'W', to: 'E', arr: '07:20', dep: '07:44', track: '1', stop: true, length: 100, vmax: 100, dwell: 60 },
    { nr: 3002, kind: 'os', name: 'Osobowy', from: 'E', to: 'W', arr: '07:22', dep: '07:24', track: '1', stop: true, length: 100, vmax: 100, dwell: 60 },
  ] } });
  const end = Clock.parse('10:00');
  let n = 0;
  while (sim.clock.time < end && !allArrived(sim)) { sim.step(0.5); if (n++ % 4 === 0) autoDispatch(sim); }
  const tt = sim.traffic.timetable();
  for (const e of tt) assert.equal(e.status, 'na następnym posterunku', `${e.nr}: ${e.status}`);
  const by = (nr) => tt.find((e) => e.nr === nr);
  assert.ok(by(3002).actualArr < by(3003).actualArr, 'najpierw wjeżdża pociąg z przeciwka');
  assert.equal(sim.ilk.counters.rozprucie, 0);
  assert.deepEqual(sim.score.items.filter((i) => i.code === 'spad' || i.code === 'unfinished'), []);
});
