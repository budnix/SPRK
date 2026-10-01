import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/model/Simulation.js';
import { Clock } from '../src/core/Clock.js';
import { autoDispatch } from './helpers.js';
import szkolna from '../src/stations/szkolna.js';
import orlowo from '../src/stations/gdynia-orlowo.js';

test('zmiana kończy się po wyprawieniu ostatniego pociągu na szlak (nie czeka na dojazd do sąsiada) i po zadaniach manewrowych', () => {
  const sim = new Simulation(szkolna, { scenario: 'zmiana', disruptions: 'none' });
  let report = null; sim.bus.on('shift-end', (r) => { report = r; });
  let n = 0;
  const end = Clock.parse('09:10');
  while (sim.clock.time < end && !sim.ended) { sim.step(0.5); if (n++ % 4 === 0) autoDispatch(sim); }
  assert.ok(sim.ended, 'zmiana nie zakończyła się sama');
  assert.equal(sim.endReason, 'all-done');
  assert.ok(sim.clock.time < sim.endTime, 'koniec przed czasem zmiany');
  const tt = sim.traffic.timetable();
  assert.ok(tt.some((e) => e.status === 'odjechał'), 'ostatni pociąg powinien być jeszcze na szlaku w chwili końca zmiany');
  assert.ok(sim.traffic.tasks.every((t) => t.done), 'zadania manewrowe wykonane przed końcem');
  assert.ok(!report.items.some((i) => i.code === 'unfinished'), 'pociąg na szlaku nie jest „nieobsłużony”');
  // raport: wiersze wszystkich pociągów z planem i rzeczywistością, statystyka, zadania, liczniki, dane zmiany
  assert.equal(report.rows.length, tt.length);
  assert.ok(report.rows.every((r) => r.done && r.label && typeof r.relation === 'string'));
  assert.equal(report.onTime + report.delayed, report.done);
  assert.equal(report.tasks.length, sim.traffic.tasks.length);
  assert.deepEqual(Object.keys(report.counters).sort(), ['Sz', 'dKo', 'dPo', 'dPz', 'rozprucie']);
  assert.equal(report.station, 'Szkolna');
  assert.equal(report.endedAt, sim.clock.time);
  assert.ok(['wzorowo', 'dobrze', 'dostatecznie', 'niedostatecznie'].includes(report.grade));
  assert.ok(report.byCode.some((b) => b.code === 'punctual' && b.n > 0 && b.points === 5 * b.n));
  // model liczy dalej po końcu zmiany – pociąg dojeżdża do sąsiada
  const until = Clock.parse('09:10');
  while (sim.clock.time < until && tt.some((e) => e.status === 'odjechał')) sim.step(0.5);
  assert.ok(tt.every((e) => e.status !== 'odjechał'));
});

test('zmiana nie kończy się, dopóki zadanie manewrowe nie jest wykonane albo nie przepadło; podpowiedź „rozkład wyczerpany” raz', () => {
  const sim = new Simulation(orlowo, { scenario: 'zmiana', disruptions: 'none' });
  const logs = [];
  sim.bus.on('log', (l) => { if (/Rozkład wyczerpany/.test(l.msg)) logs.push(l); });
  // wszystkie pociągi obsługuje automat, ale zadania manewrowego nikt nie wykonuje (automat widzi je dopiero po afterTime)
  sim.traffic.tasks[0].afterTime = Infinity;
  let n = 0;
  const until = (hhmm) => { const t = Clock.parse(hhmm); while (sim.clock.time < t && !sim.ended) { sim.step(0.5); if (n++ % 4 === 0) autoDispatch(sim); } };
  until('08:07');
  const tt = sim.traffic.timetable();
  assert.ok(tt.every((e) => e.status !== 'oczekiwany' && e.status !== 'żądanie pozwolenia'), 'rozkład powinien być obsłużony');
  assert.ok(!sim.ended, 'zadanie manewrowe niewykonane – zmiana trwa');
  until('08:09');
  assert.equal(logs.length, 1, 'jedna podpowiedź po 3 min od ostatniego terminu');
  assert.match(logs[0].msg, /zadanie: Skład EZT 88302/);
  assert.equal(logs[0].level, 'warn');
  until('08:20');
  assert.ok(sim.ended, 'koniec o endTime scenariusza');
  assert.equal(sim.endReason, 'time');
});

test('podpowiedź wymienia pociągi stojące na stacji, gdy rozkład jest wyczerpany, a zmiana trwa', () => {
  const sim = new Simulation(szkolna, { scenario: 'zmiana', disruptions: 'none' });
  const logs = [];
  sim.bus.on('log', (l) => { if (/Rozkład wyczerpany/.test(l.msg)) logs.push(l.msg); });
  const t = Clock.parse('08:40'); // ostatni czas rozkładu 08:35 + 3 min; nikt nic nie nastawia
  while (sim.clock.time < t) sim.step(0.5);
  assert.equal(logs.length, 1);
  assert.match(logs[0], /90201 \(oczekiwany\)/);
  assert.ok(!sim.ended);
});

test('zdarzenia oceny i wpisy dziennika o pociągu niosą numer pociągu w polu danych (nr) – raport nie czyta komunikatów', () => {
  const base = szkolna.scenarios.find((s) => s.id === 'zmiana');
  const sim = new Simulation(szkolna, { scenario: { ...base, endTime: '08:00' }, disruptions: 'none', seed: 1 });
  const logs = [];
  sim.bus.on('log', (l) => logs.push(l));
  let n = 0;
  const end = Clock.parse('08:01');
  while (sim.clock.time < end) { sim.step(0.5); if (n++ % 4 === 0) autoDispatch(sim); }
  const nrs = new Set(sim.traffic.timetable().map((e) => String(e.nr)));
  const TRAIN_CODES = ['punctual', 'late-depart', 'late-pass', 'held', 'wrong-track', 'unfinished', 'task', 'task-failed', 'spad', 'order'];
  const items = sim.score.items.filter((i) => TRAIN_CODES.includes(i.code));
  for (const code of ['punctual', 'unfinished', 'task']) assert.ok(items.some((i) => i.code === code), `brak zdarzenia ${code}`);
  for (const i of items) assert.ok(nrs.has(String(i.nr)), `${i.code} bez numeru pociągu: ${i.msg}`);
  for (const i of items.filter((x) => x.code.startsWith('task'))) assert.ok(sim.traffic.tasks.some((k) => k.id === i.task), `${i.code}: id zadania w polu task`);
  // wpisy o ruchu pociągu: ten sam numer w polu danych co w treści
  const moves = logs.filter((l) => /^Pociąg \d+ (wjeżdża|przyjazd|odjazd|przybył|zatrzymany)/.test(l.msg));
  assert.ok(moves.length > 10);
  for (const l of moves) assert.equal(String(l.nr), /^Pociąg (\d+)/.exec(l.msg)[1], l.msg);
});
