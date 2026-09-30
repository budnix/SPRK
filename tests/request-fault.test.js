import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/model/Simulation.js';
import szkolna from '../src/stations/szkolna.js';
import zacisze from '../src/stations/zacisze.js';
import { Interlocking } from '../src/model/Interlocking.js';
import { autoDispatch, allArrived, run, Clock } from './helpers.js';

/*
 * Zgłoszenie pociągu przez sąsiada nie może przepaść, gdy blokada liniowa zmienia tryb pracy (usterka łączności albo
 * naprawa) między zgłoszeniem a wyprawieniem pociągu. Wcześniej sąsiad uważał pociąg za zgłoszony, blokada o zgłoszeniu
 * już nie pamiętała – pociąg i wszystkie następne z tego szlaku nie przyjeżdżały do końca zmiany.
 */

const sim0 = () => new Simulation(szkolna, { scenario: 'zmiana-e', disruptions: 'none' });
const until = (sim, cond, max = 8000) => { for (let i = 0; i < max && !cond(); i++) sim.step(0.5); return cond(); };

test('usterka blokady po żądaniu pozwolenia, a przed Poz: sąsiad pyta o drogę telefonicznie i po „droga wolna” wyprawia pociąg', () => {
  const sim = sim0();
  const b = sim.blocks.get('W');
  const e = sim.traffic.timetable().find((x) => x.nr === 6101);
  assert.ok(until(sim, () => b.request === 'theirs'), 'sąsiad żąda pozwolenia');
  assert.equal(e.requested, true);
  b.setFault(true); // żądanie przez blokadę przepada – zostaje telefon
  assert.ok(until(sim, () => String(b.phone.askedByThem) === '6101', 600), 'sąsiad pyta telefonicznie o drogę dla 6101');
  assert.ok(sim.comms.send('free', { exit: 'W', nr: 6101 }, { silent: true }).ok);
  assert.ok(until(sim, () => e.dispatched), `pociąg 6101 wyprawiony (${e.status})`);
});

test('naprawa blokady po „droga wolna”, a przed wyprawieniem: sąsiad żąda pozwolenia przez blokadę i po Poz wyprawia pociąg', () => {
  const sim = sim0();
  const b = sim.blocks.get('W');
  const e = sim.traffic.timetable().find((x) => x.nr === 6101);
  b.setFault(true);
  assert.ok(until(sim, () => String(b.phone.askedByThem) === '6101'), 'zapytanie telefoniczne');
  assert.ok(sim.comms.send('free', { exit: 'W', nr: 6101 }, { silent: true }).ok);
  assert.equal(e.dispatched, false, 'pociąg jeszcze u sąsiada');
  b.setFault(false); // blokada naprawiona – telefonogram nie obowiązuje, pozwolenie przenosi blokada
  assert.ok(until(sim, () => b.request === 'theirs', 600), 'sąsiad żąda pozwolenia przez blokadę');
  assert.ok(b.press('Poz').ok);
  assert.ok(until(sim, () => e.dispatched), `pociąg 6101 wyprawiony (${e.status})`);
});

test('Zacisze: usterka blokady kończy się między „droga wolna” a wyprawieniem pociągu – zmiana z automatem dochodzi do końca', () => {
  // opóźniony 7103: zapytanie i „droga wolna” w czasie usterki, wyprawienie wypadłoby po naprawie
  const sim = new Simulation(zacisze, { disruptions: 'none', scenario: { id: 't', name: 't', endTime: '09:00', faults: [{ type: 'block-fail', target: 'W', at: '07:21', duration: 12 }] } });
  const tt = sim.traffic.timetable();
  sim.traffic.setInboundDelay(tt.find((e) => e.nr === 7103), 13);
  const end = Clock.parse('10:30');
  let n = 0;
  while (sim.clock.time < end && !allArrived(sim)) { sim.step(0.5); if (n++ % 4 === 0) autoDispatch(sim); }
  const left = tt.filter((e) => !(e.status === 'na następnym posterunku' || e.status === 'zakończył bieg' || e.status.startsWith('przekazany'))).map((e) => `${e.nr}: ${e.status}`);
  assert.deepEqual(left, []);
});

test('przebieg wyjazdowy nastawiony przy usterce blokady: po naprawie i pozwoleniu sąsiada semafor sam podaje sygnał zezwalający', () => {
  const sim = sim0();
  const w = sim.blocks.get('W'), b = sim.blocks.get('E');
  const e = sim.traffic.timetable().find((x) => x.nr === 6101);
  // 6101 wjeżdża na tor 1 i czeka na odjazd do Dębna
  assert.ok(until(sim, () => w.request === 'theirs')); w.press('Poz');
  assert.ok(until(sim, () => !!e.train?.entered));
  assert.ok(sim.ilk.setRoute('A-D1').ok);
  assert.ok(until(sim, () => e.train.hasStopped && e.train.v === 0), 'pociąg stoi przy peronie');
  if (w.koPending) w.press('Ko');
  e.train.def.depTime = sim.clock.time + 3600; // stoi – obraz semafora widać przed odjazdem
  // usterka blokady do Dębna: po „droga wolna” przebieg daje się nastawić, ale sygnału nie ma (pozwolenie u sąsiada)
  b.setFault(true);
  assert.ok(sim.comms.send('ask-free', { exit: 'E', nr: 6101 }).ok);
  run(sim, 40);
  assert.ok(sim.ilk.setRoute('D1-E').ok); run(sim, 8);
  assert.equal(sim.ilk.signals.get('D1').aspect, 'S1');
  // naprawa: Wbl, sąsiad daje pozwolenie – przebieg jest nastawiony, więc semafor podaje sygnał bez dalszej obsługi
  b.setFault(false);
  assert.ok(b.press('Wbl').ok);
  assert.ok(until(sim, () => b.direction === 'out' && b.permission, 600), 'pozwolenie od sąsiada');
  run(sim, 2);
  assert.ok(Interlocking.isTrainProceed(sim.ilk.signals.get('D1').aspect), `semafor D1: ${sim.ilk.signals.get('D1').aspect}`);
});
