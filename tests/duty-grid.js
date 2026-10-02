import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STATIONS } from '../src/stations/index.js';
import { checkScenario } from '../src/model/scenarioCheck.js';
import { DUTY_MINUTES, buildDuty, hasDuty } from '../src/model/duty.js';
import { isTraining } from '../src/ui/catalog.js';
import { checkShift } from '../scripts/check-scenario.mjs';

/**
 * Służba o wybranej porze na każdym posterunku do służby (`src/model/duty.js`) – nowy posterunek dochodzi tu sam:
 *  - siatka godzin startu × długości: kontrola definicji bez błędów i bez uwag, jakich nie ma wzorzec stacji;
 *  - kilka służb o różnych porach granych automatem (ziarno stałe, bez zakłóceń): bez zatoru, naruszeń zależności,
 *    spad / rozprucia, kar wymuszonych usterką, z urządzeniami w stanie zasadniczym i werdyktem bez BŁĘDÓW.
 * Posterunki są rozdzielone na `SHARDS` plików `tests/duty-grid-<n>.test.js` (`node --test` liczy pliki równolegle).
 */
export const SHARDS = 3;
const STARTS = [0, 2, 4, 5, 6, 8, 10, 13, 15, 17, 19, 21, 22, 23];
const PLAYS = [[6, 120, 1], [19, 120, 1], [1, 180, 1], [22, 180, 2], [10, 60, 2]]; // 22:00 / 3 h – przez północ
const duty = STATIONS.filter((st) => !isTraining(st) && hasDuty(st));

export function dutyGrid(shard) {
  duty.forEach((station, i) => {
    if (i % SHARDS !== shard) return;
    test(`służba ${station.id}: każda pora i długość – definicja bez błędów i bez uwag spoza wzorca stacji`, () => {
      const tt = station.timetable, times = tt.map((e) => e.arr || e.dep).sort();
      const pattern = { id: 'wzorzec', name: 'wzorzec', startTime: station.startTime, endTime: '10:00', timetable: tt, tasks: station.tasks || [] };
      const known = new Set(checkScenario(station, pattern).filter((f) => f.level === 'warning').map((f) => f.code));
      assert.ok(times.length > 0);
      let built = 0, trains = 0;
      for (const start of STARTS) for (const minutes of DUTY_MINUTES) for (const seed of start % 6 === 0 ? [1, 2] : [1]) {
        const { scenario, stats } = buildDuty(station, { start, minutes, seed });
        const key = `${station.id} ${scenario.name}, ziarno ${seed}`;
        const findings = checkScenario(station, scenario);
        const errors = findings.filter((f) => f.level === 'error' && !(f.code === 'tt-empty' && minutes === 30));
        assert.deepEqual(errors.map((f) => `${f.code}: ${f.msg}`), [], key);
        assert.deepEqual(findings.filter((f) => f.level === 'warning' && !known.has(f.code)).map((f) => `${f.code}: ${f.msg}`), [], key);
        if (minutes >= 60) assert.ok(stats.trains > 0, `${key}: bez pociągów`);
        built++; trains += stats.trains;
      }
      assert.ok(built >= 50 && trains > built, `${station.id}: ${built} służb, ${trains} pociągów`);
    });
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
  });
}
