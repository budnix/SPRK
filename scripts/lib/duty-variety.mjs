import { Clock } from '../../src/core/Clock.js';
import { STATIONS } from '../../src/stations/index.js';
import { DUTY_MINUTES, buildDuty, hasDuty } from '../../src/model/duty.js';
import { isTraining } from '../../src/model/shift/offers.js';

/**
 * Różnorodność służb (`src/model/duty.js`): ile mają wspólnego rozkłady dwóch ziaren tej samej służby (stacja, godzina
 * startu, długość). Dwie miary, od 0 (nic wspólnego) do 1 (to samo):
 *  - `slotOverlap` – wspólne miejsca w rozkładzie: godzina, tor, wjazd, wyjazd (bez numerów pociągów);
 *  - `meetingOverlap` – wspólne spotkania: pary linii (tor, wjazd, wyjazd), których pociągi są na stacji w odstępie do
 *    `MEET_WINDOW` – kolejność pociągów, której gracz uczy się na pamięć.
 * Bez wyjścia – wypisuje `scripts/duty-variety.mjs`, sprawdza `tests/duty-variety.test.js`.
 */

/** Okno spotkania [s]: pociągi dwóch linii na stacji w takim odstępie gracz obsługuje razem. */
export const MEET_WINDOW = 3 * 60;
/** Pierwszy pociąg później niż tyle po starcie [s] – służba z długim czekaniem (reguła otwarcia służby). */
export const LATE_FIRST = 20 * 60;

const first = (e) => Clock.parse(e.arr || e.dep);
const line = (e) => `${e.track}|${e.from ?? ''}|${e.to ?? ''}`;

/** Podobieństwo zbiorów (Jaccard): część wspólna przez sumę; dwa puste – 1. */
export function jaccard(a, b) {
  const A = new Set(a), B = new Set(b);
  let common = 0;
  for (const x of A) if (B.has(x)) common++;
  const all = A.size + B.size - common;
  return all ? common / all : 1;
}

/** Miejsca w rozkładzie: „godzina|tor|wjazd|wyjazd”. */
export const slots = (timetable) => timetable.map((e) => `${e.arr || e.dep}|${line(e)}`);

/** Spotkania: pary linii (posortowane, „linia~linia”), których pociągi są na stacji w odstępie do `window` sekund. */
export function meetings(timetable, window = MEET_WINDOW) {
  const out = [];
  for (let i = 0; i < timetable.length; i++) for (let j = i + 1; j < timetable.length; j++) {
    if (Math.abs(first(timetable[i]) - first(timetable[j])) <= window) out.push([line(timetable[i]), line(timetable[j])].sort().join('~'));
  }
  return out;
}

export const slotOverlap = (a, b) => jaccard(slots(a), slots(b));
export const meetingOverlap = (a, b) => jaccard(meetings(a), meetings(b));

/** Posterunki gracza ze służbą (bez stacji szkoleniowych). */
export const dutyStations = () => STATIONS.filter((st) => !isTraining(st) && hasDuty(st));

/**
 * Przegląd: dla każdej stacji, godziny startu i długości – służby wszystkich ziaren. Wynik na stację (klucz – id) i razem
 * (`ALL`): `{ duties, trains (średnio na służbę), late (służby z pierwszym pociągiem później niż LATE_FIRST),
 * slots, meetings (średnie podobieństwo par ziaren), byCls (pociągi wg klasy) }`.
 */
export function dutyVariety({ stations = dutyStations(), starts = [...Array(24).keys()], minutes = DUTY_MINUTES, seeds = [1, 2, 3, 4] } = {}) {
  const out = {};
  const sum = { duties: 0, trains: 0, late: 0, slots: 0, meetings: 0, pairs: 0, byCls: { agl: 0, reg: 0, dal: 0, tow: 0 } };
  for (const st of stations) {
    const row = { duties: 0, trains: 0, late: 0, slots: 0, meetings: 0, pairs: 0, byCls: { agl: 0, reg: 0, dal: 0, tow: 0 } };
    for (const start of starts) for (const m of minutes) {
      const tts = seeds.map((seed) => {
        const { scenario, stats } = buildDuty(st, { start, minutes: m, seed });
        row.duties++; row.trains += stats.trains;
        for (const k of Object.keys(row.byCls)) row.byCls[k] += stats[k];
        if (Math.min(...scenario.timetable.map(first)) - start * 3600 > LATE_FIRST) row.late++;
        return scenario.timetable;
      });
      for (let i = 0; i < tts.length; i++) for (let j = i + 1; j < tts.length; j++) {
        row.slots += slotOverlap(tts[i], tts[j]); row.meetings += meetingOverlap(tts[i], tts[j]); row.pairs++;
      }
    }
    out[st.id] = summary(row);
    for (const k of ['duties', 'trains', 'late', 'slots', 'meetings', 'pairs']) sum[k] += row[k];
    for (const k of Object.keys(sum.byCls)) sum.byCls[k] += row.byCls[k];
  }
  out.ALL = summary(sum);
  return out;
}

const round = (x, n) => Number(x.toFixed(n));
const summary = (r) => ({
  duties: r.duties, trains: round(r.trains / (r.duties || 1), 2), late: r.late,
  slots: round(r.slots / (r.pairs || 1), 3), meetings: round(r.meetings / (r.pairs || 1), 3), byCls: r.byCls,
});

/** Różnica dwóch przeglądów (`after` − `before`) dla wierszy obecnych w obu: `{ id: { trains, late, slots, meetings } }`. */
export function compareVariety(before, after) {
  const out = {};
  for (const id of Object.keys(after)) {
    if (!before[id]) continue;
    out[id] = Object.fromEntries(['trains', 'late', 'slots', 'meetings'].map((k) => [k, round(after[id][k] - before[id][k], 3)]));
  }
  return out;
}
