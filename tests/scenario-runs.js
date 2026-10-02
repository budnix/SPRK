import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STATIONS } from '../src/stations/index.js';
import { checkScenario } from '../src/model/scenarioCheck.js';
import { MISSIONS } from '../src/tutorial/missions.js';
import { checkShift } from '../scripts/lib/shift-report.mjs';
import { deterministicWarnings } from '../scripts/lib/verdict.mjs';
import { ACCEPTED } from './scenario-accepted.js';
import { shiftChoices, srkChoosable } from '../src/model/shift/offers.js';
import { getSrk } from '../src/srk/registry.js';
/** Nazwa stanowiska jak w raporcie automatu. */
const srkLabel = (id) => { const x = getSrk(id); return x.short || x.name || x.id; };

/**
 * Przebieg każdego scenariusza każdej stacji (także samouczków) automatem sprawdzającym scenariusze
 * (`scripts/check-scenario.mjs`): ziarno 1, poziom scenariusza – wymuszony `disruptions` albo none (bez zakłóceń:
 * powtarzalnie, sprawdza zamysł autora; odporność na zakłócenia – `npm run check`), zapas 120 min po końcu zmiany.
 * Wymagane: bez wyjątku, bez zatoru, bez naruszeń zależności, bez spad / rozprucia, bez kar za czynności wymuszone
 * usterką, urządzenia w stanie zasadniczym po zmianie, werdykt bez BŁĘDÓW (także sondy usterek przy wymuszonym
 * poziomie innym niż none) i bez nowych uwag powtarzalnych spoza listy przyjętych (`tests/scenario-accepted.js`).
 * Nowy scenariusz dochodzi tu sam.
 *
 * Scenariusze są rozdzielone na `SHARDS` plików `tests/scenario-check-run-<n>.test.js` (co `SHARDS`-ty scenariusz z
 * listy stacji) – `node --test` liczy pliki równolegle, więc `npm test` wydłuża się o czas jednej części, nie całości.
 */
export const SHARDS = 4;

/**
 * Scenariusze, które dziś nie przechodzą, z uzasadnieniem (klucz „stacja:scenariusz”) – do decyzji właściciela.
 * Wpis zamienia przebieg w test `todo` (uruchamia się, ale nie psuje wyniku). Pusta lista: wszystkie przechodzą.
 */
export const KNOWN = {};

/** Wszystkie scenariusze w kolejności stacji (`STATIONS`) i definicji. */
export function allScenarios() {
  return STATIONS.flatMap((station) => (station.scenarios || []).map((scenario) => ({ station, scenario })));
}

const missions = Object.keys(MISSIONS);
const errorsOf = (r) => r.findings.filter((f) => f.level === 'error').map((f) => `${f.code}: ${f.msg}`);

export function scenarioRuns(shard) {
  allScenarios().forEach(({ station, scenario }, i) => {
    if (i % SHARDS !== shard) return;
    const key = `${station.id}:${scenario.id}`;
    const level = scenario.disruptions ?? 'none';
    test(`przebieg ${key} (${level}, ziarno 1): bez zatoru, naruszeń, spad, błędów werdyktu i nowych uwag powtarzalnych`, { todo: KNOWN[key] }, () => {
      const r = checkShift({ stationId: station.id, scenarioId: scenario.id, seed: 1, level, extra: 120 });
      assert.equal(r.error, undefined, r.error);
      assert.deepEqual(r.jam.map((j) => `${j.nr}: ${j.status}`), [], `${key}: zator`);
      assert.equal(r.violations.count, 0, `${key}: ${r.violations.first.map((v) => `${v.time} ${v.msg}`).join('; ')}`);
      assert.deepEqual(r.events.filter((e) => e.code === 'spad' || e.code === 'rozprucie').map((e) => e.msg), [], `${key}: spad / rozprucie`);
      assert.deepEqual(r.forced, [], `${key}: kary za czynności wymuszone usterką`);
      assert.deepEqual(r.leftovers, [], `${key}: stan urządzeń po zmianie`);
      assert.deepEqual(errorsOf(r), [], `${key}: werdykt`);
      // usterki scenariusza z wymuszonym poziomem: wpływ na ruch oceniany bez zakłóceń (sonda usterek)
      if (scenario.faults?.length && level !== 'none') {
        const p = checkShift({ stationId: station.id, scenarioId: scenario.id, seed: 1, level: 'none', forceLevel: 'none', extra: 120 });
        assert.deepEqual(errorsOf(p), [], `${key}: sonda usterek (none)`);
      }
      const det = deterministicWarnings(checkScenario(station, scenario.id, { missions, levels: [level] }), r);
      const accepted = ACCEPTED[key] ?? [];
      const fresh = det.filter((k) => !accepted.includes(k));
      assert.deepEqual(fresh, [], `${key}: nowe uwagi powtarzalne – popraw scenariusz (npm run check -- ${key} --verbose) albo przyjmij je w tests/scenario-accepted.js:\n  '${key}': [${det.map((k) => `'${k}'`).join(', ')}],`);
    });
  });
}

/**
 * Scenariusze specjalne na stanowisku wybranym przez gracza: posterunek z kilkoma stanowiskami daje wybór także dla
 * scenariusza z usterką albo zamknięciem (`srkChoosable`) – każdy taki scenariusz gra się więc na każdym stanowisku
 * innym niż domyślne (domyślne sprawdza `scenarioRuns`). Nowy posterunek i scenariusz dochodzą tu same.
 */
export function workstationRuns() {
  for (const station of STATIONS) {
    const choices = shiftChoices(station);
    for (const scenario of choices.specials.filter((sc) => srkChoosable(choices, sc))) {
      for (const srk of choices.srks.filter((x) => x !== station.srk)) {
        const key = `${station.id}:${scenario.id}`, level = scenario.disruptions ?? 'none';
        test(`przebieg ${key} na stanowisku ${srk} (${level}, ziarno 1): bez zatoru, naruszeń, spad i błędów werdyktu`, () => {
          const r = checkShift({ station, scenario: { ...scenario, srk }, seed: 1, level, extra: 120 });
          assert.deepEqual([r.error, r.srk], [undefined, srkLabel(srk)]);
          assert.deepEqual(r.jam.map((j) => `${j.nr}: ${j.status}`), [], `${key}: zator`);
          assert.equal(r.violations.count, 0, `${key}: ${r.violations.first.map((v) => `${v.time} ${v.msg}`).join('; ')}`);
          assert.deepEqual(r.events.filter((e) => e.code === 'spad' || e.code === 'rozprucie').map((e) => e.msg), [], `${key}: spad / rozprucie`);
          assert.deepEqual(r.forced, [], `${key}: kary za czynności wymuszone usterką`);
          assert.deepEqual(r.leftovers, [], `${key}: stan urządzeń po zmianie`);
          assert.deepEqual(errorsOf(r), [], `${key}: werdykt`);
        });
      }
    }
  }
}
