import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeSim, run, autoDispatch } from './helpers.js';
import { exitApproach, entryRoutes, trainTrack } from '../src/model/trainPaths.js';
import sopot from '../src/stations/sopot.js';
import { Simulation } from '../src/model/Simulation.js';

/*
 * Małe pytania o układ stacji, wspólne dla automatu dyżurnego, ruchu, kontroli scenariusza i narzędzi
 * (`src/model/trainPaths.js`). Łańcuchy przebiegów (`entryPath`, `trainRouteChains`) – tests/scenario-check.test.js.
 */

test('odcinek zbliżania szlaku i przebiegi wjazdowe od jego strony; nieznany szlak – null i pusta lista', () => {
  const ilk = makeSim().ilk;
  assert.deepEqual([exitApproach(ilk, 'W'), exitApproach(ilk, 'E')], ['ZbA', 'ZbB']);
  assert.deepEqual(entryRoutes(ilk, 'W').map((r) => r.id), ['A-D1', 'A-D2']);
  assert.deepEqual(entryRoutes(ilk, 'E').map((r) => r.id), ['B-C1', 'B-C2']);
  assert.ok(entryRoutes(ilk, 'W').every((r) => r.kind === 'train' && r.approach === 'ZbA'));
  // spośród podanych przebiegów (np. bez tych przez zamknięty odcinek)
  const open = ilk.routeList().filter((r) => !r.sections.includes('T1'));
  assert.deepEqual(entryRoutes(ilk, 'W', open).map((r) => r.id), ['A-D2']);
  assert.equal(exitApproach(ilk, 'XX'), null);
  assert.deepEqual(entryRoutes(ilk, 'XX'), []);
  assert.deepEqual(entryRoutes(ilk, undefined), []);
});

test('stacja z kilkoma szlakami (Sopot): każdy szlak ma swój odcinek zbliżania, a wjazdy z niego zaczynają się przy jednym semaforze', () => {
  const ilk = new Simulation(sopot, { disruptions: 'none' }).ilk;
  for (const id of Object.keys(sopot.exits)) {
    const app = exitApproach(ilk, id), routes = entryRoutes(ilk, id);
    assert.ok(app, `${id}: odcinek zbliżania`);
    assert.ok(routes.every((r) => r.kind === 'train' && r.approach === app), id);
    assert.ok(new Set(routes.map((r) => r.start)).size <= 1, `${id}: ${routes.map((r) => r.start)}`);
  }
  assert.deepEqual([...new Set(entryRoutes(ilk, 'GD1').map((r) => r.start))], ['A']);
});

test('tor, na którym stoi skład: pierwszy zajęty odcinek z numerem toru, jako napis; bez takiego odcinka – null', () => {
  const sim = makeSim({ disruptions: 'none' });
  const on = (...ids) => ({ occupiedSections: () => new Set(ids) });
  assert.equal(trainTrack(sim.ilk, on('Iz1', 'T1')), '1');
  assert.equal(trainTrack(sim.ilk, on('T2b', 'T2')), '2');
  assert.equal(trainTrack(sim.ilk, on('ZbA', 'Iz1')), null);
  assert.equal(trainTrack(sim.ilk, on()), null);
  // prawdziwy pociąg zmiany prowadzonej automatem: po przyjeździe stoi na torze, który zapisał ruch
  // (sprawdzane raz, gdy pociąg z postojem stanie po przyjeździe – skład z zadaniem manewrowym przejeżdża potem na
  // inny tor, a pociąg bez postoju w chwili zapisu przejazdu jest już dalej)
  let n = 0;
  const checked = new Set();
  run(sim, 2 * 3600, (s) => {
    if (n++ % 4 === 0) autoDispatch(s);
    for (const e of s.traffic.timetable()) {
      if (checked.has(e.nr) || !e.train || !e.stop || e.train.v !== 0 || e.actualArr == null || e.actualDep != null || !e.actualTrack) continue;
      checked.add(e.nr);
      assert.equal(trainTrack(s.ilk, e.train), String(e.actualTrack), `pociąg ${e.nr}`);
    }
  });
  assert.ok(checked.size >= 3, `pociągi sprawdzone przy przyjeździe: ${[...checked]}`);
});
