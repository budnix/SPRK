import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeSim, run } from './helpers.js';
import { Simulation } from '../src/model/Simulation.js';
import { Interlocking, TIMED_RELEASE } from '../src/model/Interlocking.js';
import szkolna from '../src/stations/szkolna.js';

/*
 * Stan przebiegu (`Interlocking.routeState`) – jedno słowo na całe życie przebiegu, o które pytają automat dyżurnego,
 * ruch, widoki i narzędzia zamiast czytać zapis przebiegu. Każdy stan osiągany jest poleceniami i zajętością, jak
 * w grze – bez ustawiania pól zapisu.
 */

const G = (id) => ({ kind: 'signal', id, color: 'green' });
const PZ = { kind: 'group', id: 'Pz', role: 'route-release' };
/** Zajętość odcinków i jeden takt zależności. */
const occupy = (sim, ...ids) => { sim.ilk.updateOccupancy(new Set(ids)); sim.ilk.tick(sim.ilk.time + 0.1); };
const info = (sim, id) => sim.ilk.routesSet().find((x) => x.id === id) ?? null;

test('stan przebiegu (typ E): brak → nastawiany → czeka na pociąg → sygnał na „Stój” → zwolniony; pytanie o przebieg, o sygnalizator i lista', () => {
  const sim = makeSim();
  const ilk = sim.ilk;
  assert.equal(ilk.routeState('A-D1'), 'none');
  assert.equal(ilk.routeFrom('A'), null);
  assert.deepEqual(ilk.routesSet(), []);
  sim.press(G('A')); sim.press(G('D2')); // A-D2: zwrotnica 1 się przestawia
  assert.equal(ilk.routeState('A-D2'), 'setting');
  assert.deepEqual([ilk.routeFrom('A').id, ilk.routeFrom('A').state, ilk.routeFrom('A').route.kind], ['A-D2', 'setting', 'train']);
  assert.deepEqual(ilk.routesSet().map((x) => `${x.id}:${x.state}`), ['A-D2:setting']);
  run(sim, 10);
  assert.equal(ilk.routeState('A-D2'), 'waiting');
  assert.deepEqual(info(sim, 'A-D2'), { id: 'A-D2', route: ilk.routes.get('A-D2'), state: 'waiting', faultDrop: false });
  assert.equal(ilk.routeFrom('A').state, 'waiting');
  assert.equal(ilk.routeState('A-D1'), 'none', 'inny przebieg od tego samego semafora');
  // dyżurny odwołuje sygnał: przebieg zostaje utwierdzony, pociąg jeszcze nie wjechał – to nie usterka
  sim.pull(G('A'));
  assert.equal(ilk.routeState('A-D2'), 'signal-off');
  assert.equal(ilk.routeFaultDrop('A-D2'), false);
  sim.press(PZ); sim.press(G('A'));
  assert.equal(ilk.routeState('A-D2'), 'none');
  assert.equal(ilk.routeFrame('A-D2'), null);
  // przed pociągiem: czeka, sygnał na „Stój” albo zwalnianie czasowe
  assert.deepEqual(['none', 'setting', 'waiting', 'signal-off', 'releasing', 'entered', 'stuck'].filter(Interlocking.routeAhead), ['waiting', 'signal-off', 'releasing']);
});

test('stan przebiegu: zwalnianie czasowe przy zajętym odcinku zbliżania; po czasie – brak', () => {
  const sim = makeSim();
  sim.press(G('A')); sim.press(G('D1'));
  run(sim, 1);
  sim.ilk.updateOccupancy(new Set(['ZbA']));
  sim.press(PZ);
  assert.equal(sim.press(G('A')).timed, true);
  assert.equal(sim.ilk.routeState('A-D1'), 'releasing');
  assert.equal(sim.ilk.routeFrom('A').state, 'releasing');
  run(sim, TIMED_RELEASE / 2, (s) => s.ilk.updateOccupancy(new Set(['ZbA'])));
  assert.equal(sim.ilk.routeState('A-D1'), 'releasing');
  run(sim, TIMED_RELEASE / 2 + 2, (s) => s.ilk.updateOccupancy(new Set(['ZbA'])));
  assert.equal(sim.ilk.routeState('A-D1'), 'none');
});

test('stan przebiegu: pociąg w przebiegu; po przejeździe przebieg się rozwiązuje', () => {
  const sim = makeSim();
  sim.press(G('A')); sim.press(G('D1'));
  run(sim, 1);
  occupy(sim, 'ZbA');
  assert.equal(sim.ilk.routeState('A-D1'), 'waiting', 'pociąg na odcinku zbliżania – jeszcze przed semaforem');
  occupy(sim, 'ZbA', 'Iz1');
  assert.equal(sim.ilk.routeState('A-D1'), 'entered');
  assert.equal(Interlocking.routeAhead(sim.ilk.routeState('A-D1')), false);
  occupy(sim, 'Iz1', 'T1');
  assert.equal(sim.ilk.routeState('A-D1'), 'entered');
  occupy(sim, 'T1');
  assert.equal(sim.ilk.routeState('A-D1'), 'none', 'rozwiązany po wjeździe na tor docelowy');
});

test('stan przebiegu: usterka kontroli zajętości gasi sygnał przed pociągiem (fakt usterki), a po przejeździe przez odcinek z usterką przebieg jest nierozwiązany', () => {
  const sim = makeSim({ disruptions: 'none' });
  const ilk = sim.ilk;
  sim.press(G('A')); sim.press(G('D1'));
  run(sim, 1);
  assert.equal(ilk.routeState('A-D1'), 'waiting');
  // fałszywa zajętość odcinka w drodze przebiegu: semafor samoczynnie na „Stój”, przebieg zostaje utwierdzony
  sim.faults.add({ type: 'false-occupancy', target: 'Iz1', duration: 30 });
  run(sim, 2);
  assert.equal(ilk.routeState('A-D1'), 'signal-off');
  assert.equal(ilk.routeFaultDrop('A-D1'), true);
  assert.equal(ilk.routeFrom('A').faultDrop, true);
  assert.equal(info(sim, 'A-D1').faultDrop, true);
  // pociąg przejeżdża (na sygnał zastępczy) przy trwającej usterce: Iz1 nie zwalnia się za pociągiem
  occupy(sim, 'ZbA', 'Iz1');
  assert.equal(ilk.routeState('A-D1'), 'entered');
  assert.equal(ilk.routeFaultDrop('A-D1'), true, 'fakt usterki zostaje po wjeździe pociągu (ocena Sz / rozkazu)');
  occupy(sim, 'Iz1', 'T1');
  occupy(sim, 'T1');
  assert.equal(ilk.routeState('A-D1'), 'stuck', 'pociąg na torze docelowym, odcinek z usterką dalej utwierdzony');
  assert.equal(Interlocking.routeAhead(ilk.routeState('A-D1')), false);
  // doraźne zwolnienie kończy przebieg
  sim.press({ kind: 'group', id: 'dPz', role: 'emergency-release' }); sim.press(G('A'));
  assert.equal(ilk.routeState('A-D1'), 'none');
});

test('stan przebiegu (IZH-111): zwolnienie przebiegu pociągowego jest zawsze czasowe', () => {
  const sim = new Simulation(szkolna, { disruptions: 'none', srk: 'izh111', scenario: { id: 't', name: 't', endTime: '09:00' } });
  sim.ilk.setRoute('A-D1');
  for (let i = 0; i < 60 && sim.ilk.routeState('A-D1') === 'setting'; i++) sim.step(0.5);
  assert.equal(sim.ilk.routeState('A-D1'), 'waiting');
  assert.equal(sim.ilk.releaseRoute('A', false).timed, true);
  assert.equal(sim.ilk.routeState('A-D1'), 'releasing', 'odcinek zbliżania wolny, a zwalnianie i tak czasowe');
});

test('stan przebiegu (nastawnia mechaniczna): po przełożeniu drążka sygnał jeszcze na „Stój”; części nastawni – dźwignia, blok przebiegowy – osobno', () => {
  const sim = new Simulation(szkolna, { disruptions: 'none', srk: 'mech', scenario: { id: 't', name: 't', endTime: '09:00' } });
  const ilk = sim.ilk, r = ilk.routes.get('A-D1');
  for (const q of [...r.points, ...r.flank]) sim.execute({ type: 'point', id: q.id, position: q.position });
  for (const q of [...r.derailers.onRoute, ...r.derailers.protect]) sim.execute({ type: 'derailer', id: q.id, position: q.position });
  run(sim, 3);
  assert.equal(ilk.routeFrame('A-D1'), null);
  assert.equal(sim.execute({ type: 'route', id: 'A-D1' }).ok, true);
  assert.equal(ilk.routeState('A-D1'), 'signal-off', 'drążek przełożony, dźwignia sygnałowa w górze');
  assert.deepEqual(ilk.routeFrame('A-D1'), { lever: false, blocked: false, passed: false, blockStuck: false });
  assert.equal(ilk.routeFaultDrop('A-D1'), false);
  sim.execute({ type: 'route-block', signal: 'A' });
  assert.equal(ilk.routeFrame('A-D1').blocked, true);
  assert.equal(ilk.routeState('A-D1'), 'signal-off');
  sim.execute({ type: 'clear', signal: 'A' });
  assert.equal(ilk.routeState('A-D1'), 'waiting');
  assert.deepEqual(ilk.routeFrame('A-D1'), { lever: true, blocked: true, passed: false, blockStuck: false });
});

test('stan przebiegu manewrowego: czeka na skład; lista podaje przebiegi w kolejności nastawienia, nastawiane na końcu', () => {
  const sim = makeSim();
  const ilk = sim.ilk;
  const shunt = [...ilk.routes.values()].find((x) => x.kind === 'shunt' && x.id === 'D2-kT3m');
  ilk.setRoute(shunt.id);
  for (let i = 0; i < 60 && ilk.routeState(shunt.id) === 'setting'; i++) sim.step(0.5);
  assert.equal(ilk.routeState(shunt.id), 'waiting');
  assert.equal(ilk.routeFrom('D2').route.kind, 'shunt');
  sim.press(G('A')); sim.press(G('D1'));
  const list = ilk.routesSet().map((x) => `${x.id}:${x.state}`);
  assert.equal(list[0], 'D2-kT3m:waiting');
  assert.ok(['A-D1:setting', 'A-D1:waiting'].includes(list[1]), list.join(', '));
});
