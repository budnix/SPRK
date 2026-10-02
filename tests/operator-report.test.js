import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeSim, Clock, play } from './helpers.js';
import { Simulation } from '../src/model/Simulation.js';
import { AutoOperator } from '../src/model/Operator.js';
import { TIMED_RELEASE } from '../src/model/Interlocking.js';
import { faultSim } from './fault-harness.js';
import szkolna from '../src/stations/szkolna.js';
import sopot from '../src/stations/sopot.js';
import gdynia from './fixtures/gdynia-glowna-okregi.js';

/*
 * Co automat dyżurnego zrobił przy pociągu w ostatnim takcie (`AutoOperator.report(nr)`) i jaki ma przy nim plan
 * (`plan(nr)`): krok, powód i to, czy wydał polecenie. Dzięki temu decyzję automatu sprawdza się wprost – po takcie
 * w przygotowanym stanie – a nie tylko po wyniku całej zmiany. Kolejność kroków: rozkaz pisemny, Sz przy wyjeździe,
 * kolejne stopnie wjazdu, wjazd, manewry, prośba o szlak, wyjazd.
 */

const key = (r) => (r ? `${r.step}/${r.reason}${r.route ? `:${r.route}` : ''}${r.code ? `:${r.code}` : ''}` : null);
/** Zmiana z automatem; `each(sim, op)` po każdym takcie automatu. Zwraca kolejne różne wyniki automatu przy pociągu `nr`. */
function timeline(sim, op, until, nr, each = null) {
  const out = [];
  const end = Clock.parse(until);
  for (let n = 0; sim.clock.time < end; n++) {
    sim.step(0.5);
    if (n % 4 !== 0) continue;
    op.tick();
    const k = key(op.report(nr));
    if (out.at(-1) !== k) out.push(k);
    each?.(sim, op);
  }
  return out;
}
const full = (sim) => new AutoOperator(sim, { district: null, role: 'full' });

test('wynik automatu przy pociągu z postojem: wjazd nastawiony, przebieg w drodze, prośba o szlak (nie kończy czynności), wyjazd', () => {
  const sim = makeSim({ disruptions: 'none', seed: 1 });
  const op = full(sim);
  assert.equal(op.report(5311), null, 'przed pierwszym taktem');
  const seen = timeline(sim, op, '06:10', 5311);
  assert.deepEqual(seen, [null, 'entry/route-set:B-C2', 'entry/on-its-way', null, 'line-request/line-asked', null, 'exit/route-set:C2-W', 'exit/on-its-way', null]);
  assert.equal(op.report(999), null, 'nieznany pociąg');
});

test('wynik automatu: krok podaje, czy wydał polecenie i czy kończy czynności; odmowa zależności ma przebieg', () => {
  const sim = makeSim({ disruptions: 'none', seed: 1 });
  const op = full(sim);
  const reports = [];
  // 5310 od zachodu chce toru 1, ale droga ochronna jego wjazdu koliduje z wjazdem 5311 – najpierw odmowa, potem wjazd
  timeline(sim, op, '06:10', 5310, (s, o) => { const r = o.report(5310); if (r && !reports.some((x) => key(x) === key(r))) reports.push({ ...r }); });
  assert.deepEqual(reports[0], { step: 'entry', stop: true, acted: false, reason: 'refused', route: 'A-D1' });
  assert.deepEqual(reports[1], { step: 'entry', stop: true, acted: true, reason: 'route-set', route: 'A-D1' });
  assert.deepEqual(reports.find((r) => r.step === 'line-request'), { step: 'line-request', stop: false, acted: true, reason: 'line-asked', exit: 'E' });
});

test('wynik automatu przy pociągu bez postoju na szlak jednotorowy: wyjazd czeka na pozwolenie blokady (kod z blokady), potem przebieg', () => {
  const sim = makeSim({ disruptions: 'none', seed: 1 });
  const seen = timeline(sim, full(sim), '06:30', 44120);
  assert.deepEqual(seen.filter((k) => k?.startsWith('entry')), ['entry/route-set:A-D1', 'entry/on-its-way']);
  const exit = seen.filter((k) => k?.startsWith('exit'));
  assert.ok(exit.includes('exit/line-block:no-permission'), exit.join(', '));
  assert.deepEqual(exit.slice(-2), ['exit/route-set:D1-E', 'exit/on-its-way']);
});

test('wynik automatu przy manewrach (Szkolna, odstawienie i podstawienie składu): przebiegi manewrowe, zmiana czoła, powrót do jazdy pociągowej', () => {
  const sim = new Simulation(szkolna, { disruptions: 'none', scenario: 'zmiana', seed: 1 });
  const op = full(sim);
  const seen = timeline(sim, op, '08:00', 90201).filter(Boolean);
  assert.deepEqual(seen.slice(0, 2), ['entry/route-set:A-D2', 'entry/on-its-way']);
  const shunt = seen.filter((k) => k.startsWith('shunt'));
  assert.deepEqual(shunt.filter((k) => k !== 'shunt/on-its-way'), ['shunt/route-set:D2-kT3m', 'shunt/reverse', 'shunt/route-set:Tm1-Tm2', 'shunt/route-set:Tm2-C2', 'shunt/to-train-mode']);
  // pociąg ze składu: wyjazd nastawiany dopiero ok. 2 min przed odjazdem
  assert.equal(key(op.report(90202)), 'exit/too-early');
});

// Sopot: wjazd z Gdańska na tor 2 w dwóch stopniach (A-H, H-O), wyjazd O-OR1
const sopotTrain = (nr, arr, dep, extra = {}) => ({ nr, kind: 'os', name: 'Regio', from: 'GD1', to: 'OR1', arr, dep, track: '2', stop: true, length: 160, vmax: 120, dwell: 40, ...extra });
const bothStagesBeforeA = (sim) => !!sim.traffic.timetable()[0].train && sim.ilk.routeState('A-H') === 'waiting' && sim.ilk.routeState('H-O') === 'waiting';

test('plan i wynik automatu przy wjeździe wieloetapowym: plan ma dalszy stopień, a usterka, która go gasi, kończy się poleceniem nastawienia od nowa', () => {
  const sim = faultSim(sopot, { srk: 'komputerowe', startTime: '06:55', endTime: '08:10', timetable: [sopotTrain(55104, '07:04', '07:06')] });
  const op = full(sim);
  let fault = null, planAtFault = null;
  const seen = timeline(sim, op, '07:20', 55104, (s, o) => {
    if (!fault && bothStagesBeforeA(s)) { planAtFault = o.plan(55104); fault = s.faults.add({ type: 'false-occupancy', target: 'T2', duration: 1 }); }
  });
  assert.deepEqual(planAtFault, { entry: ['H-O'], via: null, accept: null }, 'plan: po A-H jeszcze H-O');
  // pierwsze nastawienie H-O, potem – po usterce i naprawie – drugie
  assert.equal(seen.filter((k) => k === 'entry-stage/route-set:H-O').length, 2, seen.join(', '));
  assert.ok(seen.includes('exit/route-set:O-OR1'), seen.join(', '));
  assert.ok(!op.plan(55104).entry?.length, 'po przyjeździe plan wjazdu pusty');
  assert.equal(op.plan(999), null);
});

test('wynik automatu, gdy usterka gasi tylko pierwszy stopień: drugiego, który czeka, automat nie nastawia – bez odmów – i dochodzi do wyjazdu pociągu bez postoju', () => {
  const sim = faultSim(sopot, { srk: 'komputerowe', startTime: '06:55', endTime: '08:10', timetable: [sopotTrain(55104, '07:04', '07:04', { stop: false })] });
  let fault = null;
  const seen = timeline(sim, full(sim), '07:20', 55104, (s) => { if (!fault && bothStagesBeforeA(s)) fault = s.faults.add({ type: 'false-occupancy', target: 'T2a', duration: 1 }); });
  assert.ok(fault, 'chwila nie nastąpiła');
  // (odmowa A-H w czasie usterki jest zwykła – droga zajęta; chodzi o H-O, który cały czas czekał)
  assert.ok(!seen.some((k) => k?.endsWith('refused:H-O')), seen.join(', '));
  assert.equal(seen.filter((k) => k === 'entry-stage/route-set:H-O').length, 1, 'H-O nastawiony raz');
  assert.equal(seen.filter((k) => k === 'entry/route-set:A-H').length, 2, 'A-H od nowa po naprawie');
  assert.ok(seen.indexOf('exit/route-set:O-OR1') > seen.lastIndexOf('entry/route-set:A-H'), seen.join(', '));
});

test('wynik automatu przy przebiegu zwalnianym czasowo: „w drodze” – drugiego nie nastawia i nie wydaje poleceń, którym zależności odmówią', () => {
  const sim = makeSim({ disruptions: 'none', seed: 1 });
  const op = full(sim);
  const commands = [];
  const setRoute = sim.ilk.setRoute.bind(sim.ilk);
  sim.ilk.setRoute = (id) => { commands.push(id); return setRoute(id); };
  let releasedAt = null;
  const seen = timeline(sim, op, '06:05', 5311, (s) => {
    // wjazd B-C2 czeka na pociąg – dyżurny zwalnia go czasowo (jak polecenie ZCZ), pociąg jest jeszcze daleko
    if (releasedAt == null && s.ilk.routeState('B-C2') === 'waiting') { assert.equal(s.ilk.releaseRoute('B', false, true).timed, true); releasedAt = s.clock.time; commands.length = 0; }
    if (releasedAt != null && s.clock.time < releasedAt + TIMED_RELEASE - 4) {
      assert.equal(s.ilk.routeState('B-C2'), 'releasing');
      assert.equal(key(op.report(5311)), 'entry/on-its-way');
      assert.deepEqual(commands, [], 'polecenia nastawienia w czasie zwalniania');
    }
  });
  assert.ok(releasedAt != null, 'chwila nie nastąpiła');
  assert.ok(seen.includes('entry/on-its-way'));
  // po zwolnieniu automat nastawia wjazd od nowa
  assert.equal(seen.filter((k) => k === 'entry/route-set:B-C2').length, 2, seen.join(', '));
});

test('nastawnia wykonawcza (okręgi): bez polecenia dyżurnego wjazd czeka z powodem „brak polecenia”, po poleceniu – przebieg i plan z poleceniem', () => {
  const sim = new Simulation(gdynia, { district: 'GO', seed: 1, scenario: { id: 't', name: 't', trains: [55100], endTime: '06:40' } });
  const go2 = sim.operators[0];
  assert.equal(go2.role, 'executive');
  const player = new AutoOperator(sim, { district: 'GO', role: 'full' });
  const game = play(sim, player);
  game.until('06:16');
  assert.equal(key(go2.report(55100)), 'entry/no-command');
  assert.deepEqual(go2.plan(55100), { entry: null, via: null, accept: null });
  sim.issueCommand({ kind: 'accept', nr: 55100, track: '6', from: 'GO', to: 'GO2' });
  const after = new Set();
  game.until('06:17', { each: () => after.add(key(go2.report(55100))) });
  assert.ok([...after].some((k) => k?.startsWith('entry/route-set:')), [...after].join(', '));
  assert.deepEqual(go2.plan(55100).accept, { kind: 'accept', track: '6' });
});
