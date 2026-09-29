import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/model/Simulation.js';
import { getSrk } from '../src/srk/registry.js';
import { MOR_MENUS } from '../src/srk/mor.js';
import szkolna from '../src/stations/szkolna.js';
import { run } from './helpers.js';

/* Stanowisko komputerowe MOR-3 (pulpit MOR-1): menu obiektów, przebieg kliknięciem celu, polecenia do potwierdzenia
   i specjalne (Ie-20 §13), okno komunikatów i alarmów. */

const mor = (opts = {}) => new Simulation(szkolna, { srk: 'mor3', disruptions: 'none', scenario: { id: 't', name: 't', endTime: '09:00' }, ...opts });
const codes = (sim) => sim.input.menu().map((m) => m.code);

test('MOR-3 w rejestrze: widok „mor”, menu obiektów wg opisu SPE (bez poleceń, których gra nie ma)', () => {
  assert.equal(getSrk('mor3').view, 'mor');
  assert.deepEqual(MOR_MENUS.signal.map((m) => m.code), ['Stój', 'Stop', 'oStop', 'ZCZ', 'oZCZ', 'SZ', 'ZD']);
  assert.deepEqual(MOR_MENUS.section.map((m) => m.code), ['Zmk', 'oZmk', 'ZeroLO']);
  assert.deepEqual(MOR_MENUS.point.map((m) => m.code), ['Plus', 'Minus', 'Stop', 'oStop']);
  const e = new Simulation(szkolna, { scenario: 'zmiana-e', disruptions: 'none' });
  assert.equal(e.chooseCommand('Plus').ok, false, 'inne stanowiska nie mają menu MOR');
});

test('przebieg: kliknięcie semafora (menu obiektu), kliknięcie celu – menu „Pociąg”; wybór nastawia od razu', () => {
  const sim = mor();
  assert.deepEqual(sim.press({ kind: 'signal', id: 'A', color: 'green' }), { ok: true, menu: 'object' });
  assert.equal(sim.input.armed.role, 'object');
  assert.ok(codes(sim).includes('Stop') && codes(sim).includes('SZ'));
  assert.deepEqual(sim.press({ kind: 'signal', id: 'D1' }), { ok: true, menu: 'route' });
  assert.deepEqual(sim.input.armed.selection.map((r) => r.id), ['A', 'D1']);
  assert.deepEqual(codes(sim), ['Pociąg'], 'na szlak / do semafora – tylko dostępne rodzaje');
  const r = sim.chooseCommand('Pociąg');
  assert.ok(r.ok);
  assert.equal(sim.input.armed, null);
  run(sim, 8);
  assert.ok(sim.ilk.active.has('A-D1'));
  // cel: tor (ostatni odcinek przebiegu) i strzałka blokady zamiast semafora wjazdowego
  const t = mor();
  const last = t.ilk.routes.get('A-D2').sections.at(-1);
  const kW = [...t.ilk.topo.endButtons.keys()].find((k) => k === 'kW');
  t.press({ kind: 'end', id: kW });
  assert.equal(t.press({ kind: 'section', id: last }).menu, 'route');
  assert.ok(t.chooseCommand('Pociąg').ok);
  run(t, 8);
  assert.ok(t.ilk.active.has('A-D2'));
  // kliknięcie obiektu bez przebiegu do niego – nowy wybór
  const u = mor();
  u.press({ kind: 'signal', id: 'A' });
  assert.equal(u.press({ kind: 'point', id: 'Zw1' }).menu, 'object');
  assert.deepEqual(codes(u), ['Plus', 'Minus', 'Stop']);
});

test('polecenia do potwierdzenia i specjalne: SZ czeka na potwierdzenie, w tym czasie inne polecenia odrzucone; licznik', () => {
  const sim = mor();
  sim.press({ kind: 'signal', id: 'B' });
  const r = sim.chooseCommand('SZ');
  assert.deepEqual([r.ok, r.confirm, r.level], [true, true, 'special']);
  assert.equal(sim.ilk.signals.get('B').aspect, 'S1', 'bez potwierdzenia nic się nie dzieje');
  // Ie-20 §13.8: po zainicjowaniu polecenia specjalnego nie wydaje się innych poleceń
  assert.equal(sim.press({ kind: 'point', id: 'Zw1' }).ok, false);
  assert.equal(sim.chooseCommand('Plus').ok, false);
  assert.ok(sim.confirmCommand().ok);
  assert.equal(sim.ilk.signals.get('B').aspect, 'Sz');
  assert.equal(sim.input.specialCount, 1);
  assert.equal(sim.ilk.counters.Sz, 1);
  // odwołanie w każdej chwili (§13.9)
  sim.press({ kind: 'signal', id: 'A' });
  sim.chooseCommand('SZ');
  sim.cancelSelection();
  assert.equal(sim.input.pending, null);
  assert.equal(sim.confirmCommand().ok, false);
  assert.equal(sim.input.specialCount, 1);
  // fioletowe: oStop – potwierdzenie, bez licznika
  sim.press({ kind: 'signal', id: 'A' }); assert.ok(sim.chooseCommand('Stop').ok);
  assert.equal(sim.ilk.signals.get('A').stopped, true);
  sim.press({ kind: 'signal', id: 'A' });
  assert.deepEqual(codes(sim).filter((c) => /Stop/.test(c)), ['oStop'], 'w menu tylko polecenie pasujące do stanu');
  assert.equal(sim.chooseCommand('oStop').level, 'confirm');
  assert.ok(sim.confirmCommand().ok);
  assert.equal(sim.ilk.signals.get('A').stopped, false);
  assert.equal(sim.input.specialCount, 1);
});

test('ZCZ – zwolnienie czasowe, oZCZ – odwołanie; ZD – od razu, przy zajętym odcinku zbliżania odmowa', () => {
  const sim = mor();
  sim.press({ kind: 'signal', id: 'A' }); sim.press({ kind: 'signal', id: 'D1' }); sim.chooseCommand('Pociąg');
  run(sim, 8);
  sim.press({ kind: 'signal', id: 'A' });
  assert.ok(sim.chooseCommand('ZCZ').timed);
  sim.press({ kind: 'signal', id: 'A' });
  assert.ok(codes(sim).includes('oZCZ') && !codes(sim).includes('ZCZ'));
  assert.ok(sim.chooseCommand('oZCZ').ok);
  assert.equal(sim.ilk.active.get('A-D1').timedRelease, null);
  sim.press({ kind: 'signal', id: 'A' });
  assert.deepEqual(sim.chooseCommand('ZD'), { ok: true });
  assert.equal(sim.ilk.active.has('A-D1'), false);
  // ZD przy zajętym odcinku zbliżania
  const t = mor();
  t.press({ kind: 'signal', id: 'A' }); t.press({ kind: 'signal', id: 'D1' }); t.chooseCommand('Pociąg'); run(t, 8);
  t.ilk.updateOccupancy(new Set([t.ilk.routes.get('A-D1').approach]));
  t.press({ kind: 'signal', id: 'A' });
  assert.match(t.chooseCommand('ZD').reason, /ZCZ/);
  assert.ok(t.ilk.active.has('A-D1'));
});

test('tor i zwrotnica: Zmk / oZmk (potwierdzenie), Plus / Minus, Stop / oStop; blokada: Poz, dKo specjalne', () => {
  const sim = mor();
  const sec = sim.ilk.routes.get('A-D1').sections.find((x) => sim.ilk.sections.get(x).kind === 'station');
  sim.press({ kind: 'section', id: sec }); assert.ok(sim.chooseCommand('Zmk').ok);
  assert.equal(sim.ilk.sections.get(sec).closed, true);
  sim.press({ kind: 'section', id: sec }); assert.equal(sim.chooseCommand('oZmk').level, 'confirm'); sim.confirmCommand();
  assert.equal(sim.ilk.sections.get(sec).closed, false);
  sim.press({ kind: 'point', id: 'Zw1' }); sim.chooseCommand('Minus'); run(sim, 6);
  assert.equal(sim.ilk.points.get('Zw1').position, '-');
  sim.press({ kind: 'point', id: 'Zw1' }); sim.chooseCommand('Stop');
  assert.equal(sim.ilk.points.get('Zw1').individualLock, true);
  sim.press({ kind: 'point', id: 'Zw1' }); sim.chooseCommand('oStop'); sim.confirmCommand();
  assert.equal(sim.ilk.points.get('Zw1').individualLock, false);
  // blokada Eap przy wyjeździe W (trójkąt kW)
  run(sim, 3600, (s) => { if (s.blocks.get('W').request === 'theirs' && !s.input.pending) { s.press({ kind: 'end', id: 'kW' }); s.chooseCommand('Poz'); } });
  assert.equal(sim.blocks.get('W').direction === 'in' || sim.traffic.timetable()[0].actualArr != null, true);
  sim.press({ kind: 'end', id: 'kW' });
  const menu = sim.input.menu();
  assert.equal(menu.find((m) => m.code === 'dKo')?.level, 'special');
  assert.ok(!menu.some((m) => m.code === 'Zk'), 'Eap bez Zk');
});

test('okno komunikatów i alarmów: polecenia jako komunikaty, usterka jako alarm; potwierdzanie', () => {
  const sim = mor({ scenario: { id: 't', name: 't', endTime: '09:00', faults: [{ type: 'signal-fail', target: 'A', at: '07:01', duration: 2 }] } });
  sim.press({ kind: 'signal', id: 'A' }); sim.chooseCommand('Stop');
  assert.ok(sim.input.events.some((e) => e.kind === 'cmd' && e.text === 'Stop A'));
  run(sim, 90);
  assert.equal(sim.input.alarmList().length, 1);
  sim.ackAlarms('all');
  assert.ok(sim.input.alarmList()[0].acked);
});

test('ZeroLO: w menu toru tylko przy usterce licznika osi, polecenie specjalne z potwierdzeniem i licznikiem', () => {
  const sim = mor({ scenario: { id: 't', name: 't', endTime: '09:00', faults: [{ type: 'axle-counter', target: 'T1', at: '07:01', duration: 120 }] } });
  sim.press({ kind: 'section', id: 'T1' });
  assert.ok(!sim.input.menu().some((m) => m.code === 'ZeroLO'), 'licznik sprawny – bez ZeroLO');
  sim.cancelSelection();
  run(sim, 90);
  // pociąg przejechał przez T1 – licznik się pomylił
  sim.traffic.currentOccupancy = () => new Set(['T1']); run(sim, 1);
  sim.traffic.currentOccupancy = () => new Set(); run(sim, 1);
  sim.press({ kind: 'section', id: 'T1' });
  const z = sim.input.menu().find((m) => m.code === 'ZeroLO');
  assert.equal(z?.level, 'special');
  assert.ok(sim.chooseCommand('ZeroLO').confirm);
  assert.ok(sim.confirmCommand().ok);
  assert.equal(sim.ilk.sections.get('T1').resetPending, true);
  assert.equal(sim.input.specialCount, 1);
  sim.press({ kind: 'section', id: 'T1' });
  assert.ok(!sim.input.menu().some((m) => m.code === 'ZeroLO'), 'wyzerowany – drugi raz nie');
});

// Na blokadzie samoczynnej menu trójkąta MOR-1 ma tylko Zk – dPo / dKo dotyczą bloków Eap (SBL ich nie ma).
test('menu trójkąta: SBL – tylko Zk (bez dPo / dKo), Eap – bez Zk, z oWbl', async () => {
  const sopot = (await import('../src/stations/sopot.js')).default;
  const s = new Simulation(sopot, { srk: 'mor3', disruptions: 'none', scenario: { id: 't', name: 't', endTime: '09:00', trains: [] } });
  s.press({ kind: 'end', id: 'kOR1' });
  assert.deepEqual(codes(s), ['Zk']);
  const e = mor();
  e.press({ kind: 'end', id: 'kW' });
  assert.ok(codes(e).includes('oWbl'));
  assert.ok(!codes(e).includes('Zk'));
});
