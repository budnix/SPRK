import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/model/Simulation.js';
import { FORMULAS } from '../src/model/Comms.js';
import szkolna from '../src/stations/szkolna.js';
import jodlowa from '../src/stations/jodlowa.js';
import { autoDispatch, allArrived, run, Clock } from './helpers.js';

/*
 * Wstrzymanie pociągu sąsiada: „Stój pociąg nr …” (Ir-1, Dodatek 2, wzór 5a). Bez tego żądania pozwolenia od sąsiada
 * nie dało się odrzucić – wisiało bez końca i blokowało nasze Wbl, więc dyżurny musiał dać Poz także wtedy, gdy jedyny
 * tor dla pociągu sąsiada zajmował pociąg czekający na ten sam szlak.
 */

const until = (sim, cond, max = 8000) => { for (let i = 0; i < max && !cond(); i++) sim.step(0.5); return cond(); };

test('telefonogram „Stój pociąg nr …” (wzór 5a) jest na liście formuł do sąsiada', () => {
  const f = FORMULAS.find((x) => x.id === 'hold');
  assert.equal(f.to, 'neighbour');
  assert.equal(f.text({ nr: 7 }), 'Stój pociąg nr 7 – droga nie jest wolna.');
});

test('wstrzymanie przy sprawnej blokadzie: żądanie pozwolenia znika, sąsiad ponawia je po kilku minutach; w tym czasie działa nasze Wbl', () => {
  const sim = new Simulation(szkolna, { scenario: 'zmiana-e', disruptions: 'none' });
  const b = sim.blocks.get('W');
  const e = sim.traffic.timetable().find((x) => x.nr === 6101);
  assert.ok(until(sim, () => b.request === 'theirs'), 'sąsiad żąda pozwolenia');
  assert.equal(b.press('Wbl').ok, false, 'przy żądaniu sąsiada nasze Wbl nie działa');
  // zły numer pociągu – odmowa i kara za niewłaściwy telefonogram
  assert.equal(sim.comms.send('hold', { exit: 'W', nr: 9999 }).ok, false);
  assert.equal(sim.score.items.filter((i) => i.code === 'comms-wrong').length, 1);
  assert.equal(b.request, 'theirs');
  // właściwy numer – żądanie wycofane
  assert.deepEqual(sim.comms.send('hold', { exit: 'W', nr: 6101 }), { ok: true });
  assert.equal(b.request, null);
  run(sim, 5);
  assert.equal(e.requested, false);
  assert.equal(e.status, 'oczekiwany');
  assert.equal(b.press('Wbl').ok, true, 'teraz możemy zażądać pozwolenia dla swojego pociągu');
  assert.ok(b.press('oWbl').ok);
  run(sim, 120);
  assert.equal(b.request, null, 'przez 3 min sąsiad nie ponawia żądania');
  assert.ok(until(sim, () => b.request === 'theirs', 400), 'po 3 min sąsiad żąda pozwolenia od nowa');
  assert.ok(b.press('Poz').ok);
  assert.ok(until(sim, () => e.dispatched), 'po Poz pociąg wyprawiony');
});

test('wstrzymanie przy zapowiadaniu telefonicznym: zapytanie o drogę znika, sąsiad pyta od nowa po kilku minutach', () => {
  const sim = new Simulation(szkolna, { scenario: 'zmiana-e', disruptions: 'none' });
  const b = sim.blocks.get('W');
  b.setFault(true);
  assert.ok(until(sim, () => String(b.phone.askedByThem) === '6101'), 'sąsiad pyta telefonicznie');
  assert.deepEqual(sim.comms.send('hold', { exit: 'W', nr: 6101 }), { ok: true });
  assert.equal(b.phone.askedByThem, null);
  run(sim, 120);
  assert.equal(b.phone.askedByThem, null);
  assert.ok(until(sim, () => String(b.phone.askedByThem) === '6101', 400), 'po 3 min sąsiad pyta od nowa');
});

for (const delay of [6, 10, 14]) {
  test(`Jodłowa: pociąg do Borków opóźniony o ${delay} min spotyka pociąg z Borków przy jedynym torze (3) – automat ustala kolejność, bez zatoru`, () => {
    const sim = new Simulation(jodlowa, { disruptions: 'none' });
    const tt = sim.traffic.timetable();
    sim.traffic.setInboundDelay(tt.find((e) => e.nr === 6612), delay);
    const end = Clock.parse('10:00');
    let n = 0;
    while (sim.clock.time < end && !allArrived(sim)) { sim.step(0.5); if (n++ % 4 === 0) autoDispatch(sim); }
    for (const e of tt) assert.equal(e.status, 'na następnym posterunku', `${e.nr}: ${e.status}`);
    for (const nr of [6611, 6612]) assert.equal(String(tt.find((e) => e.nr === nr).actualTrack), '3');
    assert.deepEqual(sim.score.items.filter((i) => i.code === 'unfinished' || i.code === 'comms-wrong' || i.code === 'spad'), []);
    assert.equal(sim.ilk.counters.Sz, 0);
  });
}

test('Jodłowa: pociąg do Borków stoi na torze 3, a Borki żądają pozwolenia – automat wstrzymuje pociąg sąsiada i najpierw wyprawia swój', () => {
  const sim = new Simulation(jodlowa, { srk: 'E', disruptions: 'none', scenario: { id: 't', name: 't', endTime: '08:30', tasks: [], timetable: [
    { nr: 2001, kind: 'os', name: 'Osobowy Krasne – Borki', from: 'K2', to: 'B', arr: '07:10', dep: '07:30', track: '3', stop: true, length: 80, vmax: 80, dwell: 60 },
    { nr: 2002, kind: 'os', name: 'Osobowy Borki – Krasne', from: 'B', to: 'K1', arr: '07:20', dep: '07:24', track: '3', stop: true, length: 80, vmax: 80, dwell: 60 },
  ] } });
  const log = [];
  sim.bus.on('log', (m) => log.push(m.msg));
  const end = Clock.parse('09:30');
  let n = 0;
  while (sim.clock.time < end && !allArrived(sim)) { sim.step(0.5); if (n++ % 4 === 0) autoDispatch(sim); }
  const [p, q] = [2001, 2002].map((nr) => sim.traffic.timetable().find((e) => e.nr === nr));
  assert.equal(p.status, 'na następnym posterunku', `2001: ${p.status}`);
  assert.equal(q.status, 'na następnym posterunku', `2002: ${q.status}`);
  assert.ok(log.some((m) => /Pociąg nr 2002 wstrzymany u sąsiada/.test(m)), 'telefonogram „Stój pociąg nr 2002”');
  assert.ok(q.actualArr > p.actualDep, 'pociąg z Borków wjechał po odjeździe pociągu do Borków');
  assert.deepEqual(sim.score.items.filter((i) => i.code === 'comms-wrong' || i.code === 'unfinished'), []);
});
