import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/model/Simulation.js';
import { validateStation } from '../src/model/validate.js';
import { HALT_DWELL } from '../src/model/Train.js';
import { HALT_TIME } from '../src/model/timetable/entry.js';
import { trainCards } from '../src/ui/panelState.js';
import { play } from './helpers.js';
import fixture from './fixtures/stare-pustkowie.js';

/*
 * Przystanek w obrębie stacji albo na odcinku zbliżania (odcinek z `halt`, np. Olsztyn Śródmieście, Olsztyn Zachodni):
 * pociąg z nazwą przystanku w `halts` staje tam na krótko – to nie jest jego przyjazd ani odjazd ze stacji; postój na
 * stacji robi dalej przy peronie toru planowego. Stacja testowa: odcinek zbliżania od Lipowej (ZbA) z peronem
 * przystanku „Przystanek”.
 */

const withHalt = (halts = { 5310: ['Przystanek'], 5311: ['Przystanek'] }) => ({
  ...fixture,
  sections: { ...fixture.sections, ZbA: { ...fixture.sections.ZbA, platform: 'Przystanek', halt: 'Przystanek' } },
  timetable: fixture.timetable.map((e) => (halts[e.nr] ? { ...e, halts: halts[e.nr] } : e)),
});

/** Gra do `end`: kiedy pociąg `nr` stał na przystanku (chwile i etap) i jak skończył. */
function watch(station, nr, end) {
  const sim = new Simulation(station, { scenario: 'zmiana', disruptions: 'none', seed: 1 });
  const e = sim.traffic.entry(nr);
  const halt = { since: null, until: null, phase: null, card: null };
  play(sim).until(end, { each: (s) => {
    if (e.train?.atHalt && halt.since == null) { halt.since = s.clock.time; halt.phase = [e.phase, e.haltAt]; halt.card = trainCards(s).find((c) => c.e === e)?.where; }
    if (halt.since != null && halt.until == null && !e.train?.atHalt) halt.until = s.clock.time;
  } });
  return { sim, e, halt };
}

test('przystanek: definicja – nazwa, peron, bez numeru toru; pociąg tylko z przystankami stacji', () => {
  assert.deepEqual(validateStation(withHalt()).errors, []);
  const bad = { ...fixture, sections: { ...fixture.sections, ZbA: { ...fixture.sections.ZbA, halt: 'Przystanek' }, T2: { ...fixture.sections.T2, halt: 'Inny' } } };
  const errors = validateStation(bad).errors.join('; ');
  assert.match(errors, /ZbA: przystanek 'Przystanek' bez peronu/);
  assert.match(errors, /T2: przystanek 'Inny' na torze stacyjnym 2/);
  assert.match(validateStation(withHalt({ 5310: ['Nie ma'] })).errors.join('; '), /5310: nieznany przystanek 'Nie ma'/);
});

test('pociąg z przystankiem przed stacją: staje na przystanku, potem na swoim torze o czasie; sąsiad wyprawia go wcześniej', () => {
  const plain = new Simulation(fixture, { scenario: 'zmiana', disruptions: 'none', seed: 1 }).traffic.entry(5310);
  const { e, halt } = watch(withHalt(), 5310, '06:20');
  // przystanek na odcinku zbliżania przed semaforem wjazdowym – sąsiad wyprawia o HALT_TIME wcześniej
  assert.equal(e.neighbourDep, plain.neighbourDep - HALT_TIME);
  assert.ok(halt.since != null, 'postój na przystanku');
  assert.deepEqual(halt.phase, ['at-halt', 'Przystanek']);
  assert.deepEqual(halt.card, { code: 'halt', halt: 'Przystanek' });
  assert.ok(halt.until - halt.since >= HALT_DWELL && halt.until - halt.since < HALT_DWELL + 5, `postój ${halt.until - halt.since} s`);
  // postój na stacji – przy peronie toru planowego, po przystanku, o czasie
  assert.equal(e.actualTrack, '1');
  assert.ok(e.actualArr > halt.until, 'przyjazd na stację po przystanku');
  assert.ok(e.actualArr <= e.arrTime + 60, `przyjazd ${e.actualArr - e.arrTime} s po planie`);
  assert.equal(e.delay, 0);
});

test('pociąg bez przystanku w `halts` przejeżdża peron przystanku bez zatrzymania; postój na stacji zostaje', () => {
  const { e, halt } = watch(withHalt({}), 5310, '06:20');
  assert.equal(halt.since, null);
  assert.equal(e.actualTrack, '1');
  assert.ok(e.train.hasStopped);
});

test('pociąg odjeżdżający staje na przystanku za stacją – odjazd i opóźnienie liczą się ze stacji, nie z przystanku', () => {
  const { e, halt } = watch(withHalt(), 5311, '06:25');
  assert.ok(e.actualDep != null && halt.since > e.actualDep, 'przystanek po odjeździe ze stacji');
  assert.equal(e.delay, 0);
  assert.ok(['departed', 'at-neighbour'].includes(e.phase), e.phase);
});
