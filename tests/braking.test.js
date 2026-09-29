import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/model/Simulation.js';
import { Train } from '../src/model/Train.js';
import szkolna from '../src/stations/szkolna.js';

/*
 * Hamowanie przy nagłej zmianie sygnału na „Stój” (audyt realizmu, grupa 2, W20). Opóźnienie pociągu nie przekracza
 * hamowania nagłego (~1,3 m/s²; Dz.U. 2015 poz. 360 zał. 1: droga hamowania setki metrów) – pociąg nie staje „w miejscu”.
 * Gdy semafor zmieni się na „Stój” bliżej niż droga hamowania nagłego, pociąg przejeżdża sygnał „Stój” – to zdarzenie
 * (`spad`), po którym pociąg hamuje nagle, staje i traci zezwolenie na jazdę.
 */

const EMERGENCY = 1.3;

/** Pociąg osobowy ze szlaku od Lipna jadący 100 km/h na semafor A (przebieg A-D1); A na „Stój”, gdy do A zostaje `d` m. */
function approach(d) {
  const s = new Simulation(szkolna, { scenario: { id: 't', name: 't', endTime: '09:00', trains: [] }, disruptions: 'none' });
  assert.ok(s.ilk.setRoute('A-D1').ok);
  for (let i = 0; i < 16; i++) s.step(0.5);
  const events = [];
  const tr = new Train({ nr: 'X1', kind: 'os', name: 'Osobowy', length: 120, vmax: 100, stop: false }, s.ilk.topo, s.ilk,
    { lineSpeed: 100, onEvent: (ev, _t, sig) => events.push([ev, sig]) });
  tr.placeOnLine('W', 1500);
  s.traffic.trains.push(tr);
  const distToA = () => tr.constraintsAhead(3000, true).find((c) => c.signal === 'A')?.dist;
  let dropped = false, maxDecel = 0, prevV = tr.v;
  for (let i = 0; i < 2000 && !(dropped && tr.v === 0); i++) {
    if (!dropped) { const x = distToA(); if (x != null && x <= d) { assert.ok(s.execute({ type: 'signal-stop', signal: 'A', on: true }).ok); dropped = true; } }
    s.step(0.5);
    maxDecel = Math.max(maxDecel, (prevV - tr.v) / 0.5);
    prevV = tr.v;
  }
  assert.ok(dropped, 'pociąg nie dojechał do A');
  return { s, tr, events, maxDecel, passed: tr.occupiedSections().has('Iz1') || tr.occupiedSections().has('T1') };
}

test('W20: po zmianie A na „Stój” opóźnienie nie przekracza hamowania nagłego (także tuż przed semaforem)', () => {
  for (const d of [60, 150, 300, 450, 700, 1000]) {
    const { tr, maxDecel } = approach(d);
    assert.ok(maxDecel <= EMERGENCY + 0.05, `d=${d} m: opóźnienie ${maxDecel.toFixed(2)} m/s²`);
    assert.equal(tr.v, 0, `d=${d} m: pociąg stanął`);
  }
});

test('W20: daleko przed semaforem pociąg zatrzymuje się przed nim; za blisko – przejeżdża „Stój” (zdarzenie) i staje za nim', () => {
  const far = approach(700);
  assert.equal(far.passed, false, 'przejechał A mimo 700 m do semafora');
  assert.ok(!far.events.some(([ev]) => ev === 'spad'));

  const near = approach(60);
  assert.equal(near.passed, true, 'z 100 km/h na 60 m nie da się zatrzymać');
  assert.deepEqual(near.events.filter(([ev]) => ev === 'spad'), [['spad', 'A']]);
  assert.equal(near.tr.authority, false, 'po przejechaniu „Stój” pociąg traci zezwolenie');
  const head = near.tr.head;
  for (let i = 0; i < 120; i++) near.s.step(0.5);
  assert.equal(near.tr.head, head, 'po zatrzymaniu nie jedzie dalej sam');
});
