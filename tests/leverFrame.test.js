import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/model/Simulation.js';
import { leverFrame, leverStates, signalLevers } from '../src/render/leverFrame.js';
import szkolna from '../src/stations/szkolna.js';
import zacisze from '../src/stations/zacisze.js';
import olszyny from '../src/stations/olszyny.js';
import { run } from './helpers.js';

/* Układ nastawnicy mechanicznej: dźwignie (zwrotnicowe, wykolejnicowe, semaforowe, tarcz) i drążki przebiegowe */

const mech = (station) => new Simulation(station, { disruptions: 'none', srk: 'mech', scenario: { id: 't', name: 't', endTime: '09:00' } });

test('ława dźwigniowa Szkolnej: dźwignie zwrotnic, wykolejnicy, semaforów i tarcz – numeracja kolejna', () => {
  const f = leverFrame(mech(szkolna).ilk);
  assert.deepEqual(f.levers.map((l) => `${l.no}:${l.kind}:${l.id}`), [
    '1:point:Zw1', '2:point:Zw3', '3:point:Zw4', '4:derailer:Wk1',
    '5:signal:A¹', '6:signal:A²', '7:signal:B¹', '8:signal:B²', '9:signal:C1', '10:signal:C2', '11:signal:D1', '12:signal:D2', '13:shunt:Tm1', '14:shunt:Tm2',
  ]);
});

test('semafor rozprzężony (przebiegi na Sr2 i na Sr3) ma dwie dźwignie sygnałowe; jednoramienny i sprzężony – jedną', () => {
  const sim = mech(szkolna);
  const f = leverFrame(sim.ilk);
  const of = (id) => f.levers.filter((l) => l.signal === id).map((l) => `${l.id}:${l.aspect ?? '-'}`);
  assert.deepEqual(of('A'), ['A¹:Sr2', 'A²:Sr3'], 'A: tor 1 prosto (Sr2), tor 2 na zwrotny (Sr3)');
  assert.deepEqual(of('D1'), ['D1:-'], 'jednoramienny – tylko Sr2');
  assert.deepEqual(of('D2'), ['D2:-'], 'sprzężony – każdy przebieg pociągowy na Sr3');
  assert.deepEqual(of('Tm1'), ['Tm1:-']);
  // drążek zamyka dźwignię, której przebieg nie wymaga
  for (const q of [...sim.ilk.routes.get('A-D2').points, ...sim.ilk.routes.get('A-D2').flank]) sim.execute({ type: 'point', id: q.id, position: q.position });
  run(sim, 3);
  assert.deepEqual(signalLevers(sim.ilk, f, 'A').map((l) => l.id), ['A¹', 'A²'], 'bez przebiegu – w kolejności');
  sim.execute({ type: 'route', id: 'A-D2' });
  let s = leverStates(sim.ilk, f);
  assert.deepEqual([s.levers['A¹'].locked, s.levers['A²'].locked], [true, false]);
  assert.deepEqual(signalLevers(sim.ilk, f, 'A').map((l) => l.id), ['A²', 'A¹'], 'przebieg na Sr3 – najpierw dźwignia A²');
  sim.execute({ type: 'route-block', signal: 'A' });
  const wrong = sim.execute({ type: 'clear', signal: 'A', aspect: 'Sr2' });
  assert.equal(wrong.ok, false);
  assert.match(wrong.reason, /dźwignia sygnału Sr2 jest zamknięta.*Sr3/);
  assert.equal(sim.ilk.signals.get('A').aspect, 'Sr1');
  assert.ok(sim.execute({ type: 'clear', signal: 'A', aspect: 'Sr3' }).ok);
  assert.equal(sim.ilk.signals.get('A').aspect, 'Sr3');
  s = leverStates(sim.ilk, f);
  assert.deepEqual([s.levers['A¹'].down, s.levers['A²'].down], [false, true]);
});

test('drążki przebiegowe: jeden na sygnalizator i rodzaj przebiegu, najwyżej dwa przebiegi (w górę, w dół); cel po nazwie', () => {
  const f = leverFrame(mech(szkolna).ilk);
  const d = Object.fromEntries(f.drazki.map((x) => [x.id, x.routes.map((r) => `${r.pos}:${r.id}:${r.target}`)]));
  assert.deepEqual(d, {
    a: ['up:A-D1:D1', 'down:A-D2:D2'], b: ['up:B-C1:C1', 'down:B-C2:C2'],
    c1: ['up:C1-W:Lipno'], c2: ['up:C2-W:Lipno'], d1: ['up:D1-E:Dębno'], d2: ['up:D2-E:Dębno'],
    d2m: ['up:D2-kT3m:tor 3'], tm1m: ['up:Tm1-Tm2:Tm2'], tm2m: ['up:Tm2-C2:C2'],
  });
  // sygnalizator z trzema przebiegami: drugi drążek
  const z = leverFrame(mech(zacisze).ilk).drazki.filter((x) => x.start === 'A');
  assert.deepEqual(z.map((x) => [x.id, x.routes.map((r) => r.id)]), [['a', ['A-kT1', 'A-kT2']], ['a2', ['A-kT3']]]);
});

test('stan nastawnicy: dźwignia zwrotnicowa wg przełożenia, drążek, okienko bloku, dźwignia sygnałowa', () => {
  const sim = mech(szkolna);
  const f = leverFrame(sim.ilk);
  const r = sim.ilk.routes.get('A-D2');
  for (const q of [...r.points, ...r.flank]) sim.execute({ type: 'point', id: q.id, position: q.position });
  let s = leverStates(sim.ilk, f);
  const q = r.points.find((x) => x.position === '-');
  assert.equal(s.levers[q.id].down, true, 'dźwignia przełożona od razu');
  assert.equal(s.levers[q.id].moving, true);
  assert.equal(s.levers['A²'].locked, true, 'dźwignia sygnałowa zamknięta bez drążka');
  run(sim, 3);
  sim.execute({ type: 'route', start: 'A', end: 'D2', kind: 'train' });
  s = leverStates(sim.ilk, f);
  assert.deepEqual(s.drazki.a, { pos: 'down', route: 'A-D2', half: false, blocked: false, passed: false });
  assert.equal(s.levers[q.id].locked, true, 'zwrotnica zamknięta drążkiem');
  assert.equal(s.levers['A²'].locked, false);
  sim.execute({ type: 'route-block', signal: 'A' });
  sim.execute({ type: 'clear', signal: 'A' });
  s = leverStates(sim.ilk, f);
  assert.equal(s.drazki.a.blocked, true);
  assert.equal(s.levers['A²'].down, true);
  assert.deepEqual(s.drazki.b, { pos: null, route: null, half: false, blocked: false, passed: false });
});

test('stan nastawnicy: drążek w położeniu pośrednim – położenie jak przy przebiegu, zwrotnice zamknięte, dźwignie sygnałowe zamknięte', () => {
  const sim = mech(szkolna);
  const f = leverFrame(sim.ilk);
  const r = sim.ilk.routes.get('A-D2');
  for (const q of [...r.points, ...r.flank]) sim.execute({ type: 'point', id: q.id, position: q.position });
  run(sim, 3);
  assert.ok(sim.execute({ type: 'route-half', id: 'A-D2' }).ok);
  const s = leverStates(sim.ilk, f);
  assert.deepEqual(s.drazki.a, { pos: 'down', route: 'A-D2', half: true, blocked: false, passed: false });
  for (const q of r.points) assert.equal(s.levers[q.id].locked, true, q.id);
  assert.deepEqual([s.levers['A¹'].locked, s.levers['A²'].locked], [true, true]);
});

test('ława Olszyn: numery dźwigni i nazwy drążków, na które powołują się dymki misji 4', () => {
  const f = leverFrame(mech(olszyny).ilk);
  assert.deepEqual(f.levers.map((l) => `${l.no}:${l.id}`), ['1:Zw1', '2:Zw2', '3:Zw3', '4:Wk1', '5:A¹', '6:A²', '7:B¹', '8:B²', '9:C1', '10:C2', '11:D1', '12:D2', '13:Tm1']);
  assert.deepEqual(f.drazki.map((d) => `${d.id}:${d.routes.map((r) => r.id).join('/')}`), ['a:A-D1/A-D2', 'b:B-C1/B-C2', 'c1:C1-W', 'c2:C2-W', 'd1:D1-E', 'd2:D2-E', 'c2m:C2-kT4m', 'tm1m:Tm1-D2']);
});
