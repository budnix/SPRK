import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/model/Simulation.js';
import { getSrk } from '../src/srk/registry.js';
import { AddressOrderProtocol, ORDERS } from '../src/srk/address.js';
import { ButtonProtocol } from '../src/srk/buttons.js';
import { POINT_SWITCH_TIME, TIMED_RELEASE } from '../src/model/Interlocking.js';
import szkolna from '../src/stations/szkolna.js';
import sopot from '../src/stations/sopot.js';
import { run } from './helpers.js';

/* Urządzenia przekaźnikowe typu IZH-111: przyciski adresowe elementów + przyciski rozkazów (bsk.isdr.pl, srk_izh111) */

const izh = (station = szkolna, opts = {}) => new Simulation(station, { disruptions: 'none', srk: 'izh111', scenario: { id: 't', name: 't', endTime: '09:00' }, ...opts });
const adr = (kind, id) => ({ kind, id });
const S = (id) => adr('signal', id), P = (id) => adr('point', id), E = (id) => adr('end', id);
const order = (id) => ({ kind: 'order', id });

test('IZH-111 w rejestrze: własny protokół obsługi i parametry zależności; typ E zostaje przy przyciskach', () => {
  const srk = getSrk('izh111');
  assert.equal(srk.id, 'izh111'); assert.equal(srk.view, 'izh');
  assert.deepEqual(srk.model, { armTimeout: 10, timedRelease: 120, shuntTimedRelease: 0, timedReleaseAlways: true });
  const sim = izh();
  assert.ok(sim.ilk.input instanceof AddressOrderProtocol);
  assert.ok(new Simulation(szkolna, { scenario: 'zmiana-e' }).ilk.input instanceof ButtonProtocol);
  assert.ok(new Simulation(szkolna, { scenario: 'zmiana' }).ilk.input instanceof ButtonProtocol);
  assert.deepEqual(ORDERS.map((o) => o.id), ['P', 'M', '+', '-', 'STOP', 'Zw', 'Zcz', 'Sz']);
});

test('IZH-111: przebieg = adres początku, adres końca, rozkaz P albo M; rodzaj wynika z rozkazu, nie z koloru', () => {
  const sim = izh();
  const armed = [];
  sim.bus.on('armed', (a) => armed.push(a && { id: a.id, n: a.selection.length }));
  assert.deepEqual(sim.press(S('A')), { ok: true, armed: true });
  assert.equal(sim.ilk.armed.id, 'A');
  sim.press(S('D1'));
  assert.deepEqual(sim.ilk.input.selection.map((r) => r.id), ['A', 'D1']);
  assert.equal(sim.ilk.armed.id, 'A', 'uzbrojony jest pierwszy adres – początek');
  const r = sim.press(order('P'));
  assert.ok(r.ok, JSON.stringify(r));
  assert.equal(sim.ilk.armed, null);
  assert.deepEqual(armed, [{ id: 'A', n: 1 }, { id: 'A', n: 2 }, null]);
  run(sim, POINT_SWITCH_TIME + 1);
  assert.ok(sim.ilk.active.has('A-D1'));
  // wyjazd na szlak: adres końca to przycisk końca przebiegu; manewry rozkazem M
  sim.press(S('D2')); sim.press(E('kT3'));
  assert.ok(sim.press(order('M')).ok);
  run(sim, POINT_SWITCH_TIME + 8);
  assert.ok(sim.ilk.active.has('D2-kT3m'));
  assert.equal(sim.ilk.signals.get('D2').aspect, 'Ms2');
});

test('IZH-111: przebieg przez semafory pośrednie nastawia się od razu cały (początek i koniec)', () => {
  const sim = izh(sopot);
  sim.press(S('A')); sim.press(E('kOR1'));
  assert.deepEqual(sim.press(order('P')).chain, ['A-H', 'H-O', 'O-OR1']);
});

test('IZH-111: odmowy – rozkaz bez adresu, przebieg z jednym adresem, rozkaz nie do tego elementu; wyciągnięcia nie ma', () => {
  const sim = izh();
  assert.match(sim.press(order('P')).reason, /przycisk adresowy/);
  sim.press(S('A'));
  assert.match(sim.press(order('P')).reason, /początku i końca/);
  assert.equal(sim.ilk.armed, null, 'rozkaz zużywa wybór także przy odmowie');
  sim.press(P('Zw1'));
  assert.match(sim.press(order('Sz')).reason, /semafora/);
  sim.press(S('A'));
  assert.match(sim.press(order('+')).reason, /zwrotnicy/);
  assert.equal(sim.pull(S('A')).ok, false);
  assert.equal(sim.press(order('dPz')).ok, false, 'nieznany rozkaz');
  // ten sam adres drugi raz odwołuje wybór; trzeci adres zastępuje drugi
  sim.press(S('A')); sim.press(S('A'));
  assert.equal(sim.ilk.armed, null);
  sim.press(S('A')); sim.press(S('D1')); sim.press(S('D2'));
  assert.deepEqual(sim.ilk.input.selection.map((r) => r.id), ['A', 'D2']);
  // wybór wygasa po czasie
  run(sim, 11);
  assert.equal(sim.ilk.armed, null);
  assert.deepEqual(sim.ilk.input.selection, []);
});

test('IZH-111: zwrotnica rozkazem „+” / „−” w podane położenie; STOP zamyka, Zw odwołuje zamknięcie', () => {
  const sim = izh();
  const p = sim.ilk.points.get('Zw1');
  sim.press(P('Zw1'));
  assert.deepEqual(sim.press(order('+')), { ok: true, noop: true }, 'już w położeniu zasadniczym');
  assert.equal(p.moving, false);
  sim.press(P('Zw1')); assert.ok(sim.press(order('-')).ok);
  run(sim, POINT_SWITCH_TIME + 0.5);
  assert.equal(p.position, '-');
  sim.press(P('Zw1')); assert.ok(sim.press(order('STOP')).ok);
  assert.equal(p.individualLock, true);
  sim.press(P('Zw1')); assert.ok(sim.press(order('STOP')).ok, 'ponowne STOP nie otwiera zamknięcia');
  assert.equal(p.individualLock, true);
  sim.press(P('Zw1')); assert.equal(sim.press(order('+')).ok, false, 'zamknięta zwrotnica się nie przestawia');
  sim.press(P('Zw1')); assert.ok(sim.press(order('Zw')).ok);
  assert.equal(p.individualLock, false);
  // wykolejnica: „+” = nałożona (położenie zasadnicze), „−” = zdjęta
  sim.press(adr('derailer', 'Wk1')); assert.ok(sim.press(order('-')).ok);
  run(sim, POINT_SWITCH_TIME + 0.5);
  assert.equal(sim.ilk.derailers.get('Wk1').position, 'off');
});

test('IZH-111: inny wariant przebiegu wybiera zwrotnica zamknięta przyciskiem STOP', () => {
  const sim = izh();
  // tor 2 zamiast toru 1 nie jest wariantem tej samej pary adresów, więc sprawdzamy regułę na zamknięciu:
  // zwrotnica zamknięta w położeniu przeciwnym do wymaganego blokuje nastawienie przebiegu
  sim.press(P('Zw1')); sim.press(order('-'));
  run(sim, POINT_SWITCH_TIME + 0.5);
  sim.press(P('Zw1')); sim.press(order('STOP'));
  sim.press(S('A')); sim.press(S('D1'));
  const r = sim.press(order('P'));
  assert.equal(r.ok, false);
  assert.match(r.reason, /Zw1 zamknięta/);
  sim.press(S('A')); sim.press(S('D2'));
  assert.ok(sim.press(order('P')).ok, 'przebieg zgodny z zamkniętą zwrotnicą');
});

test('IZH-111: Zcz z adresem semafora końcowego zwalnia przebieg pociągowy po 120 s; Zw zwalnia manewrowy od razu', () => {
  const sim = izh();
  assert.equal(sim.ilk.timedRelease, 120);
  assert.notEqual(TIMED_RELEASE, 120, 'typ E ma inny czas');
  sim.press(S('A')); sim.press(S('D1')); sim.press(order('P'));
  run(sim, POINT_SWITCH_TIME + 1);
  assert.ok(sim.ilk.active.has('A-D1'));
  sim.press(S('A'));
  assert.match(sim.press(order('Zcz')).reason, /kończącego się/, 'adres początku to nie adres końca');
  sim.press(S('D1'));
  const r = sim.press(order('Zcz'));
  assert.equal(r.timed, true);
  assert.equal(sim.ilk.signals.get('A').aspect, 'S1', 'sygnał wygaszony od razu');
  run(sim, 118);
  assert.ok(sim.ilk.active.has('A-D1'), 'przed upływem 120 s przebieg utwierdzony');
  run(sim, 4);
  assert.ok(!sim.ilk.active.has('A-D1'));
  assert.equal(sim.ilk.counters.dPz, 0, 'IZH-111 nie ma doraźnego zwolnienia z licznikiem');
  // manewrowy: Zw z adresem końca – bezzwłocznie; Zcz go nie dotyczy
  sim.press(S('D2')); sim.press(E('kT3')); sim.press(order('M'));
  run(sim, POINT_SWITCH_TIME + 8);
  assert.ok(sim.ilk.active.has('D2-kT3m'));
  sim.press(E('kT3'));
  assert.match(sim.press(order('Zcz')).reason, /Zw/);
  sim.press(E('kT3'));
  assert.ok(sim.press(order('Zw')).ok);
  assert.ok(!sim.ilk.active.has('D2-kT3m'));
});

test('IZH-111: STOP na semaforze gasi sygnał, Sz podaje sygnał zastępczy z licznikiem; blokada liniowa bez zmian', () => {
  const sim = izh();
  sim.press(S('A')); sim.press(S('D1')); sim.press(order('P'));
  run(sim, POINT_SWITCH_TIME + 1);
  assert.notEqual(sim.ilk.signals.get('A').aspect, 'S1');
  sim.press(S('A')); assert.ok(sim.press(order('STOP')).ok);
  assert.equal(sim.ilk.signals.get('A').aspect, 'S1');
  assert.ok(sim.ilk.active.has('A-D1'), 'przebieg pozostaje utwierdzony');
  sim.press(S('B')); assert.ok(sim.press(order('Sz')).ok);
  assert.equal(sim.ilk.signals.get('B').aspect, 'Sz');
  assert.equal(sim.ilk.counters.Sz, 1);
  assert.ok(sim.press({ kind: 'block', exit: 'E', btn: 'Wbl' }).ok);
  assert.equal(sim.blocks.get('E').request, 'ours');
  // polecenia wprost działają niezależnie od protokołu
  assert.ok(sim.execute({ type: 'point', id: 'Zw4' }).ok);
});

test('typ E i stanowisko komputerowe: zwalnianie jak dotąd (opcje zależności mają wartości domyślne)', () => {
  const sim = new Simulation(szkolna, { disruptions: 'none', scenario: 'zmiana-e' });
  assert.equal(sim.ilk.timedRelease, TIMED_RELEASE);
  assert.equal(sim.ilk.timedReleaseAlways, false);
  sim.execute({ type: 'route', start: 'A', end: 'D1', kind: 'train' });
  run(sim, POINT_SWITCH_TIME + 1);
  const r = sim.execute({ type: 'release', signal: 'A' });
  assert.ok(r.ok && !r.timed, 'wolny odcinek zbliżania – zwolnienie od razu');
  assert.ok(!sim.ilk.active.has('A-D1'));
});

test('IZH-111: pełna zmiana na Szkolnej z automatem dyżurnego – wszystkie pociągi obsłużone, bez rozpruć', async () => {
  const { autoDispatch, allArrived } = await import('./helpers.js');
  const sim = new Simulation(szkolna, { disruptions: 'none', scenario: 'zmiana-izh' });
  assert.equal(sim.srk.id, 'izh111');
  for (let i = 0; i < 2 * 60 * 120 && !allArrived(sim) && !sim.ended; i++) { sim.step(0.5); if (i % 4 === 0) autoDispatch(sim); }
  const left = sim.traffic.timetable().filter((e) => !/na następnym posterunku|zakończył bieg|przekazany|odjechał/.test(e.status)).map((e) => `${e.nr}: ${e.status}`);
  assert.deepEqual(left, []);
  assert.equal(sim.ilk.counters.rozprucie, 0);
  assert.equal(sim.ilk.counters.dPz, 0);
});
