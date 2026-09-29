import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/model/Simulation.js';
import szkolna from '../src/stations/szkolna.js';
import { run } from './helpers.js';

/*
 * Stała kontrola warunków sygnału zezwalającego (audyt realizmu, grupa 2). Niezajętość odcinków przebiegu i drogi
 * ochronnej oraz kontrola zwrotnic są sprawdzane stale; gdy warunek przestaje być spełniony przed wjazdem pociągu, semafor
 * zmienia się na „Stój”, a przebieg zostaje utwierdzony (Ie-4 §30 ust. 1, §39 ust. 2 – wniosek z zasady bezpieczności).
 * Sygnał nie wraca sam po ustaniu usterki.
 */

const sim = (faults = []) => new Simulation(szkolna, { scenario: { id: 't', name: 't', endTime: '09:00', trains: [], faults }, disruptions: 'none' });

test('W6: fałszywa zajętość odcinka przebiegu – semafor na „Stój”, przebieg utwierdzony, sygnał nie wraca sam', () => {
  const s = sim([{ type: 'false-occupancy', target: 'T1', at: '07:01', duration: 2 }]);
  assert.ok(s.ilk.setRoute('A-D1').ok);
  run(s, 20);
  assert.ok(['S5', 'S13'].includes(s.ilk.signals.get('A').aspect));
  run(s, 60);
  assert.equal(s.ilk.sections.get('T1').occupied, true);
  assert.equal(s.ilk.signals.get('A').aspect, 'S1', 'S5 nad zajętym odcinkiem');
  assert.ok(s.ilk.active.has('A-D1'), 'przebieg utwierdzony');
  run(s, 3 * 60);
  assert.equal(s.ilk.sections.get('T1').occupied, false, 'usterka minęła');
  assert.equal(s.ilk.signals.get('A').aspect, 'S1', 'sygnał wrócił sam');
});

test('W6: zajętość drogi ochronnej i utrata kontroli zwrotnicy przebiegu – semafor na „Stój”', () => {
  const s = sim([{ type: 'false-occupancy', target: 'T1e', at: '07:01', duration: 5 }]);
  assert.ok(s.ilk.setRoute('A-D1').ok);
  run(s, 80);
  assert.deepEqual(s.ilk.active.get('A-D1').overlap, ['T1e']);
  assert.equal(s.ilk.signals.get('A').aspect, 'S1', 'droga ochronna zajęta');

  const t = sim();
  assert.ok(t.ilk.setRoute('A-D1').ok);
  run(t, 20);
  t.ilk.points.get('Zw1').control = false;
  run(t, 1);
  assert.equal(t.ilk.signals.get('A').aspect, 'S1', 'zwrotnica bez kontroli');
});

/*
 * Droga ochronna jest częścią przebiegu pociągowego (Ie-4 §35 ust. 1, §37 ust. 2). Przebieg wyjazdowy D1-E zastępuje
 * drogę ochronną wjazdu A-D1; po jego zwolnieniu (Pz) droga ochronna wraca albo – gdy nie może – semafor A daje „Stój”.
 * Zwolnienie przebiegu, do którego zbliża się pociąg (przebieg poprzedni z sygnałem zezwalającym), ma zwłokę
 * (Ie-4 §41 ust. 3 pkt 1–2).
 */
function entryWithExit() {
  const s = sim();
  const b = s.blocks.get('E'); b.direction = 'out'; b.permission = true;
  assert.ok(s.ilk.setRoute('A-D1').ok); run(s, 8);
  assert.ok(s.ilk.setRoute('D1-E').ok); run(s, 8);
  assert.deepEqual(s.ilk.active.get('A-D1').overlap, [], 'kontynuacja zastępuje drogę ochronną');
  return s;
}

test('W5: Pz przebiegu wyjazdowego przy sygnale zezwalającym na wjeździe – zwalnianie czasowe', () => {
  const s = entryWithExit();
  const r = s.ilk.releaseRoute('D1', false);
  assert.equal(r.timed, true, 'zwolnienie bez zwłoki mimo S2 na A');
  run(s, 2);
  assert.ok(s.ilk.active.has('D1-E'));
});

test('W5: po zwolnieniu przebiegu wyjazdowego droga ochronna wjazdu wraca (albo A na „Stój”)', () => {
  const s = entryWithExit();
  s.ilk.releaseRoute('D1', false);
  run(s, 120);
  assert.ok(!s.ilk.active.has('D1-E'));
  assert.deepEqual(s.ilk.active.get('A-D1').overlap, ['T1e'], 'droga ochronna nie wróciła');
  assert.equal(s.ilk.sections.get('T1e').route, null, 'droga ochronna nie jest odcinkiem przebiegu');
  assert.equal(s.ilk.signals.get('A').aspect, 'S5');

  // droga ochronna zajęta (fałszywa zajętość T1e) – nie wraca, A na „Stój”
  const t = entryWithExit();
  t.ilk.sections.get('T1e').forced = true; t.ilk.refreshOccupancy();
  t.ilk.releaseRoute('D1', false);
  run(t, 120);
  assert.ok(!t.ilk.active.has('D1-E'));
  assert.equal(t.ilk.signals.get('A').aspect, 'S1', 'wjazd bez drogi ochronnej');
});
