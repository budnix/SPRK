import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/model/Simulation.js';
import { leverFrame, leverStates } from '../src/render/leverFrame.js';
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
    '5:signal:A', '6:signal:B', '7:signal:C1', '8:signal:C2', '9:signal:D1', '10:signal:D2', '11:shunt:Tm1', '12:shunt:Tm2',
  ]);
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
  assert.equal(s.levers.A.locked, true, 'dźwignia sygnałowa zamknięta bez drążka');
  run(sim, 3);
  sim.execute({ type: 'route', start: 'A', end: 'D2', kind: 'train' });
  s = leverStates(sim.ilk, f);
  assert.deepEqual(s.drazki.a, { pos: 'down', route: 'A-D2', blocked: false, passed: false });
  assert.equal(s.levers[q.id].locked, true, 'zwrotnica zamknięta drążkiem');
  assert.equal(s.levers.A.locked, false);
  sim.execute({ type: 'route-block', signal: 'A' });
  sim.execute({ type: 'clear', signal: 'A' });
  s = leverStates(sim.ilk, f);
  assert.equal(s.drazki.a.blocked, true);
  assert.equal(s.levers.A.down, true);
  assert.deepEqual(s.drazki.b, { pos: null, route: null, blocked: false, passed: false });
});

test('ława Olszyn: numery dźwigni i nazwy drążków, na które powołują się dymki misji 4', () => {
  const f = leverFrame(mech(olszyny).ilk);
  assert.deepEqual(f.levers.map((l) => `${l.no}:${l.id}`), ['1:Zw1', '2:Zw2', '3:Zw3', '4:Wk1', '5:A', '6:B', '7:C1', '8:C2', '9:D1', '10:D2', '11:Tm1']);
  assert.deepEqual(f.drazki.map((d) => `${d.id}:${d.routes.map((r) => r.id).join('/')}`), ['a:A-D1/A-D2', 'b:B-C1/B-C2', 'c1:C1-W', 'c2:C2-W', 'd1:D1-E', 'd2:D2-E', 'c2m:C2-kT4m', 'tm1m:Tm1-D2']);
});
