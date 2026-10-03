import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeSim, run, trainAtA } from './helpers.js';
import { POINT_SECURE_TIME } from '../src/model/Interlocking.js';

/*
 * Zwrotnica bez kontroli położenia (audyt realizmu, grupa 2, W9). Zwrotnicę bez kontroli (także rozprutą) zabezpiecza
 * się na miejscu zamkiem trzpieniowym albo sponą; potem pociąg jedzie przez nią na sygnał zastępczy albo rozkaz
 * pisemny (Ie-10 §32 ust. 2, 4, 8, 9; §35 ust. 1 pkt 1–3 i 6; Ir-1 §41 ust. 6). Zabezpieczenie robi pracownik na
 * miejscu – polecenie ma czas wykonania.
 */

/** Pociąg 5310 stoi przed A; zwrotnica 1 za A przestawiona z usterką napędu – bez kontroli. */
function faultyPointBeforeTrain() {
  const sim = makeSim();
  const e = trainAtA(sim);
  const p = sim.ilk.points.get('Zw1');
  p.faultUntil = sim.clock.time + 3 * 3600;
  assert.ok(sim.execute({ type: 'point', id: 'Zw1' }).ok);
  run(sim, 10);
  assert.equal(p.control, false);
  return { sim, e, p };
}

test('W9: zwrotnica bez kontroli – rozkaz „S” odrzucony, dopóki nie jest zabezpieczona na miejscu', () => {
  const { sim } = faultyPointBeforeTrain();
  const r = sim.traffic.issueOrder({ nr: 5310, signal: 'A' });
  assert.equal(r.ok, false);
  assert.match(r.reason, /Zw1 bez kontroli/);
});

test('W9: zabezpieczenie na miejscu trwa, blokuje przestawianie; potem pociąg jedzie przez zwrotnicę na rozkaz „S”', () => {
  const { sim, e, p } = faultyPointBeforeTrain();
  const res = sim.execute({ type: 'point-secure', id: 'Zw1', on: true });
  assert.equal(res.ok, true, res.reason);
  run(sim, POINT_SECURE_TIME / 2);
  assert.equal(p.secured, false, 'zabezpieczenie od razu – pracownik musi dojść');
  assert.equal(sim.execute({ type: 'point', id: 'Zw1' }).ok, false, 'przestawianie w trakcie zabezpieczania');
  run(sim, POINT_SECURE_TIME / 2 + 5);
  assert.equal(p.secured, true);
  assert.equal(sim.execute({ type: 'point', id: 'Zw1' }).ok, false, 'zabezpieczona zwrotnica się nie przestawia');
  const r = sim.traffic.issueOrder({ nr: 5310, signal: 'A' });
  assert.equal(r.ok, true, r.reason);
  assert.equal(sim.score.items.filter((i) => i.code === 'order').at(-1).points, 0, 'rozkaz uzasadniony usterką zwrotnicy');
  run(sim, 240);
  assert.ok([...e.train.occupiedSections()].some((s) => s !== 'ZbA' && s !== 'Iz1'), 'pociąg nie przejechał przez zwrotnicę');
  assert.equal(sim.ilk.counters.rozprucie, 0);
});

test('W9: pociąg przejeżdża zabezpieczoną zwrotnicę bez kontroli na Sz; zdjęcie zabezpieczenia', () => {
  const { sim, e, p } = faultyPointBeforeTrain();
  assert.ok(sim.execute({ type: 'point-secure', id: 'Zw1', on: true }).ok);
  run(sim, POINT_SECURE_TIME + 5);
  assert.ok(sim.execute({ type: 'substitute', signal: 'A' }).ok);
  assert.equal(sim.score.items.filter((i) => i.code === 'Sz-points').length, 0, 'zabezpieczona zwrotnica liczy się jak zamknięta');
  run(sim, 240);
  assert.ok([...e.train.occupiedSections()].some((s) => s !== 'ZbA' && s !== 'Iz1'), 'pociąg stoi przed zwrotnicą bez kontroli');
  assert.ok(sim.execute({ type: 'point-secure', id: 'Zw1', on: false }).ok);
  assert.equal(p.secured, false);
});
