import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/model/Simulation.js';
import { Clock } from '../src/core/Clock.js';
import szkolna from '../src/stations/szkolna.js';
import { run } from './helpers.js';

/*
 * Odjazd z peronu (audyt realizmu, grupa 2, W8). Pociąg rusza z peronu dopiero na sygnał zezwalający (albo Sz / rozkaz)
 * – nie podjeżdża pod semafor na „Stój” (Ie-1 §4 ust. 13 pkt 1). Czas odjazdu w dzienniku to chwila faktycznego ruszenia,
 * więc przetrzymanie przed semaforem wyjazdowym liczy się jako późny odjazd.
 */

/** Pociąg 6101 (W → E, postój na torze 1, odjazd 07:08) po wjeździe na tor 1, bez przebiegu wyjazdowego. */
function atPlatform() {
  const s = new Simulation(szkolna, { scenario: { id: 't', name: 't', endTime: '09:00', trains: [6101] }, disruptions: 'none' });
  const w = s.blocks.get('W');
  let entry = false;
  run(s, 60 * 12, () => {
    if (w.request === 'theirs') w.press('Poz');
    const e = s.traffic.timetable()[0];
    if (!entry && e.train) entry = s.ilk.setRoute('A-D1').ok;
  });
  const e = s.traffic.timetable()[0];
  assert.equal(e.actualTrack, '1', e.status);
  return { s, e };
}

test('W8: pociąg bez sygnału na semaforze wyjazdowym zostaje w postoju – bez „odjazdu”, punktów i podjazdu pod semafor', () => {
  const { s, e } = atPlatform();
  assert.ok(s.clock.time > Clock.parse('07:10'), 'po planowym odjeździe');
  assert.equal(e.train.state, 'dwell');
  assert.equal(e.actualDep ?? null, null, 'odjazd zapisany mimo S1 na D1');
  assert.ok(!s.score.items.some((i) => i.code === 'punctual'));
  const head = e.train.head;
  run(s, 60);
  assert.equal(e.train.head, head, 'pociąg podjechał pod semafor na „Stój”');
  assert.equal(e.phase, 'dwell');
});

test('W8: odjazd liczy się od faktycznego ruszenia na sygnał zezwalający – przetrzymanie to późny odjazd', () => {
  const { s, e } = atPlatform();
  run(s, 3 * 60);
  const bE = s.blocks.get('E'); bE.request = null; bE.direction = 'out'; bE.permission = true;
  const t0 = s.clock.time;
  assert.ok(s.ilk.setRoute('D1-E').ok);
  run(s, 30);
  assert.ok(e.actualDep >= t0, 'odjazd przed podaniem sygnału');
  assert.ok(s.score.items.some((i) => i.code === 'late-depart'), 'przetrzymanie na stacji bez kary');
});
