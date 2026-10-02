import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeSim, run, autoDispatch } from './helpers.js';
import { Simulation } from '../src/model/Simulation.js';
import szkolna from '../src/stations/szkolna.js';
import { createEntry, shownTime } from '../src/model/timetable/entry.js';

/*
 * Wpis rozkładu (`src/model/timetable/entry.js`): definicja tylko do odczytu (zapis z danych w `source`), plan i przebieg
 * zmiany osobno. Czytelnicy czytają wpis jak zwykły obiekt.
 */

const station = { exits: { W: { lineLength: 6000, lineSpeed: 100 } } };

test('definicja wpisu jest tylko do odczytu, a zapis z danych (także godziny po północy) jest w source', () => {
  const def = { nr: 7101, from: 'W', to: 'E', arr: '24:05', dep: '24:07', track: '1', stop: true, name: 'Regio' };
  const e = createEntry(def, { idx: 3, station });
  assert.equal(e.source, def);
  assert.deepEqual([e.nr, e.track, e.stop, e.idx], [7101, '1', true, 3]);
  assert.deepEqual([e.arr, e.dep, e.arrTime, e.depTime], ['00:05', '00:07', 24 * 3600 + 5 * 60, 24 * 3600 + 7 * 60], 'napis jak na zegarze, chwila bez zawijania');
  assert.equal(typeof e.cat, 'string');
  for (const key of ['nr', 'track', 'stop', 'arr', 'cat', 'label', 'from']) assert.throws(() => { e[key] = 'x'; }, TypeError, key);
  assert.equal(def.track, '1', 'definicja bez zmian');
  // kopia wpisu ma pola definicji, ale nie zapis z danych (source nie jest wyliczalne)
  const copy = { ...e };
  assert.deepEqual([copy.nr, copy.track, copy.arr, copy.phase, copy.status], [7101, '1', '00:05', 'expected', 'oczekiwany']);
  assert.equal('source' in copy, false);
  assert.equal(JSON.parse(JSON.stringify(e)).track, '1');
});

test('plan i przebieg zmiany są zapisywalne; pole definicji o nazwie pola przebiegu nie przesłania go', () => {
  const e = createEntry({ nr: 1, from: 'W', arr: '06:10', delay: 9, status: 'x' }, { idx: 0, station, extra: true });
  assert.deepEqual([e.delay, e.status, e.phase, e.extra], [0, 'oczekiwany', 'expected', true]);
  e.requestAt = Infinity; e.delay = 4; e.actualTrack = '2';
  assert.deepEqual([e.requestAt, e.delay, e.actualTrack], [Infinity, 4, '2']);
  // sąsiad wyprawia pociąg wcześniej o przejazd szlaku (6 km przy 100 km/h) i dojazd do peronu, zgłasza 4 min przed tym
  assert.equal(Math.round(e.neighbourDep), 6 * 3600 + 10 * 60 - 216 - 90);
  assert.equal(shownTime('25:30'), '01:30');
  assert.equal(shownTime('07:00'), '07:00');
  assert.equal(shownTime(null), null);
});

test('skład w manewrach: postój przy peronie już go nie dotyczy (e.stop), a definicja się nie zmienia (Szkolna 90201)', () => {
  const sim = new Simulation(szkolna, { disruptions: 'none', scenario: 'zmiana', seed: 1 });
  const e = sim.traffic.timetable().find((x) => x.nr === 90201);
  let shunted = false, n = 0;
  run(sim, 75 * 60, (s) => { if (n++ % 4 === 0) autoDispatch(s); if (e.phase === 'shunting') shunted = true; });
  assert.ok(shunted, 'skład nie manewrował');
  assert.deepEqual([e.stop, e.stopCancelled, e.source.stop], [false, true, true]);
});

test('każdy wpis rozkładu zmiany (pociągi rozkładu i nadzwyczajne) powstaje przez createEntry – definicja chroniona', () => {
  const sim = makeSim({ disruptions: 'none', seed: 5 });
  const extra = sim.traffic.addTrain({ ...sim.traffic.timetable()[0].source, nr: 99901 });
  assert.deepEqual([extra.extra, extra.nr, sim.traffic.timetable().includes(extra)], [true, 99901, true]);
  run(sim, 10 * 60);
  for (const e of sim.traffic.timetable()) {
    assert.ok(e.source && e.source.nr === e.nr, `${e.nr}: brak source`);
    assert.throws(() => { e.nr = 0; }, TypeError, `${e.nr}: numer da się nadpisać`);
  }
});
