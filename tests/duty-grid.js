import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STATIONS } from '../src/stations/index.js';
import { checkScenario } from '../src/model/scenarioCheck.js';
import { DUTY_MINUTES, buildDuty, closableTracks, hasDuty } from '../src/model/duty.js';
import { isTraining, shiftChoices } from '../src/model/shift/offers.js';
import { checkShift } from '../scripts/lib/shift-report.mjs';
import { getSrk } from '../src/srk/registry.js';
/** Nazwa stanowiska jak w raporcie automatu. */
const srkLabel = (id) => { const x = getSrk(id); return x.short || x.name || x.id; };

/**
 * Służba o wybranej porze na każdym posterunku do służby (`src/model/duty.js`) – nowy posterunek dochodzi tu sam:
 *  - siatka godzin startu × długości: kontrola definicji bez błędów i bez uwag, jakich nie ma wzorzec stacji;
 *  - kilka służb o różnych porach granych automatem (ziarno stałe, bez zakłóceń): bez zatoru, naruszeń zależności,
 *    spad / rozprucia, kar wymuszonych usterką, z urządzeniami w stanie zasadniczym i werdyktem bez BŁĘDÓW;
 *  - służba z robotami torowymi (lipiec, ziarno z robotami): tor zamknięty, a gra jak wyżej.
 * Posterunki są rozdzielone na `SHARDS` plików `tests/duty-grid-<n>.test.js` (`node --test` liczy pliki równolegle).
 */
export const SHARDS = 3;
const STARTS = [0, 2, 4, 5, 6, 8, 10, 13, 15, 17, 19, 21, 22, 23];
const PLAYS = [[6, 120, 1], [19, 120, 1], [1, 180, 1], [22, 180, 2], [10, 60, 2]]; // 22:00 / 3 h – przez północ
/** Służba z robotami torowymi: lipiec, dzień roboczy, pierwsze z ziaren, które losuje roboty (`WORKS`). */
const WORKS_PLAY = { start: 10, minutes: 120, month: 7, day: 'roboczy' };
const WORKS_SEEDS = [4, 12, 13, 16, 20, 22];
const duty = STATIONS.filter((st) => !isTraining(st) && hasDuty(st));

export function dutyGrid(shard) {
  duty.forEach((station, i) => {
    if (i % SHARDS !== shard) return;
    test(`służba ${station.id}: każda pora i długość – definicja bez błędów i bez uwag spoza wzorca stacji`, () => {
      const tt = station.timetable, times = tt.map((e) => e.arr || e.dep).sort();
      const pattern = { id: 'wzorzec', name: 'wzorzec', startTime: station.startTime, endTime: '10:00', timetable: tt, tasks: station.tasks || [] };
      // uwagi wzorca stacji i „pociąg pójdzie innym torem” przy robotach torowych (zamierzone – bez kary)
      const known = new Set([...checkScenario(station, pattern).filter((f) => f.level === 'warning').map((f) => f.code), 'closed-planned-track']);
      assert.ok(times.length > 0);
      let built = 0, trains = 0;
      for (const start of STARTS) for (const minutes of DUTY_MINUTES) for (const seed of start % 6 === 0 ? [1, 2] : [1]) {
        const { scenario, stats } = buildDuty(station, { start, minutes, seed });
        const key = `${station.id} ${scenario.name}, ziarno ${seed}`;
        const findings = checkScenario(station, scenario);
        const errors = findings.filter((f) => f.level === 'error');
        assert.deepEqual(errors.map((f) => `${f.code}: ${f.msg}`), [], key);
        assert.deepEqual(findings.filter((f) => f.level === 'warning' && !known.has(f.code)).map((f) => `${f.code}: ${f.msg}`), [], key);
        assert.ok(stats.trains > 0, `${key}: bez pociągów`);
        built++; trains += stats.trains;
      }
      assert.ok(built >= 50 && trains > built, `${station.id}: ${built} służb, ${trains} pociągów`);
    });
    // stacja z kilkoma stanowiskami: służba także na drugim stanowisku
    for (const srk of shiftChoices(station).srks.filter((x) => x !== station.srk)) {
      test(`służba ${station.id} 06:00 / 60 min na stanowisku ${srk} grana automatem: bez zatoru, naruszeń i błędów werdyktu`, () => {
        const r = checkShift({ station, duty: { start: 6, minutes: 60, srk }, seed: 1, level: 'none', extra: 120 });
        assert.deepEqual([r.error, r.srk], [undefined, srkLabel(srk)]);
        assert.ok(r.trains.length > 0);
        assert.deepEqual(r.jam.map((j) => `${j.nr}: ${j.status}`), [], 'zator');
        assert.equal(r.violations.count, 0);
        assert.deepEqual(r.leftovers, [], 'stan urządzeń po zmianie');
        assert.deepEqual(r.findings.filter((f) => f.level === 'error').map((f) => `${f.code}: ${f.msg}`), [], 'werdykt');
      });
    }
    for (const [start, minutes, seed] of PLAYS) {
      test(`służba ${station.id} ${String(start).padStart(2, '0')}:00 / ${minutes} min (ziarno ${seed}) grana automatem: bez zatoru, naruszeń i błędów werdyktu`, () => {
        const r = checkShift({ station, duty: { start, minutes }, seed, level: 'none', extra: 120 });
        assert.equal(r.error, undefined, r.error);
        assert.ok(r.trains.length > 0, 'służba z pociągami');
        assert.deepEqual(r.jam.map((j) => `${j.nr}: ${j.status}`), [], 'zator');
        assert.equal(r.violations.count, 0, r.violations.first.map((v) => `${v.time} ${v.msg}`).join('; '));
        assert.deepEqual(r.events.filter((e) => e.code === 'spad' || e.code === 'rozprucie').map((e) => e.msg), [], 'spad / rozprucie');
        assert.deepEqual(r.forced, [], 'kary za czynności wymuszone usterką');
        assert.deepEqual(r.leftovers, [], 'stan urządzeń po zmianie');
        assert.deepEqual(r.findings.filter((f) => f.level === 'error').map((f) => `${f.code}: ${f.msg}`), [], 'werdykt');
      });
    }
    // stacja bez toru pomocniczego (`closableTracks`) nie ma robót – test pomija
    const worksSeed = closableTracks(station).length ? WORKS_SEEDS.find((seed) => buildDuty(station, { ...WORKS_PLAY, seed }).stats.works != null) : null;
    test(`służba ${station.id} z robotami torowymi (lipiec, 10:00 / 120 min) grana automatem: tor zamknięty, bez zatoru, naruszeń i błędów werdyktu`, { skip: worksSeed == null && 'stacja bez toru do zamknięcia' }, () => {
      const duty = WORKS_PLAY, seed = worksSeed;
      const r = checkShift({ station, duty, seed, level: 'none', extra: 120 });
      assert.equal(r.error, undefined, r.error);
      assert.deepEqual(r.jam.map((j) => `${j.nr}: ${j.status}`), [], 'zator');
      assert.equal(r.violations.count, 0, r.violations.first.map((v) => `${v.time} ${v.msg}`).join('; '));
      assert.deepEqual(r.events.filter((e) => e.code === 'spad' || e.code === 'rozprucie').map((e) => e.msg), [], 'spad / rozprucie');
      assert.deepEqual(r.findings.filter((f) => f.level === 'error').map((f) => `${f.code}: ${f.msg}`), [], 'werdykt');
    });
  });
}
