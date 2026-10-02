import { Simulation } from '../Simulation.js';
import { AutoOperator } from '../Operator.js';
import { Clock } from '../../core/Clock.js';
import { violations } from './invariants.js';
import { leftovers } from './outcome.js';
import { isFinished } from '../timetable/phase.js';

/**
 * Zmiana grana dyżurnym automatycznym bez widoku – wspólna dla automatu sprawdzającego scenariusze
 * (`scripts/check-scenario.mjs`), przeglądu silnika (`scripts/survey.mjs`), skilla diagnoza-zatoru i testów: krok 0,5 s
 * (jeden takt silnika), automat co 2 s, niezmienniki bezpieczeństwa po każdym takcie. Moduł logiki: bez DOM.
 */

/** Ile pierwszych naruszeń (z czasem) zapisać dla zmiany. */
export const FIRST_VIOLATIONS = 3;

/** Koniec zmiany bez `endTime` w scenariuszu (jak w przeglądzie). */
export const DEFAULT_END = '10:00';

/**
 * Wszystko się uspokoiło po końcu zmiany (reguła wcześniejszego końca przebiegu): czas ≥ `endTime`, każdy pociąg
 * obsłużony do końca (także nadzwyczajny – musi już być w rozkładzie), zadania wykonane albo przepadły, urządzenia
 * w stanie zasadniczym. Dalej nic się już nie zmieni – zapas `extra` byłby pustym ogonem.
 */
export function settled(sim, endTime) {
  if (sim.clock.time < endTime) return false;
  if (sim.extraTrainsPlanned.some((x) => !x.done)) return false;
  if (!sim.traffic.timetable().every(isFinished)) return false;
  if (!(sim.traffic.tasks || []).every((t) => t.done || t.failed)) return false;
  return leftovers(sim).length === 0;
}

/**
 * Jedna zmiana z automatem. `scenario` – id scenariusza stacji albo obiekt scenariusza (wariant spoza stacji).
 * Koniec: `endTime` scenariusza (bez niego 10:00) + `extra` minut; z `settle` – wcześniej, gdy po `endTime` wszystko
 * jest obsłużone (`settled`, sprawdzane co minutę czasu symulacji; przebieg ruchu ten sam co bez skrótu).
 *
 * `onCreate(sim)` – symulacja utworzona, przed pierwszym taktem (np. subskrypcja dziennika); `onTick(sim, { opTick })` – po każdym takcie (`opTick`: w tym takcie działał automat); `onViolation(msg, time)` –
 * naruszenie niezmiennika, które pojawiło się w tym takcie.
 *
 * Zwraca `{ sim, violations: { count, ticks, first }, endTime, until }`: `count` – ile razy naruszenie się pojawiło
 * (napis nieobecny w poprzednim takcie), `ticks` – suma naruszeń po wszystkich taktach, `first` – pierwsze pojawienia
 * się `{ time, msg }`; `endTime` – koniec zmiany (s), `until` – koniec przebiegu (s).
 */
export function playShift({ station, scenario, seed, level = 'none', extra = 120, settle = false, onCreate = null, onTick = null, onViolation = null }) {
  // speed 1: jeden krok 0,5 s = jeden takt silnika, więc niezmienniki są sprawdzane po każdym takcie;
  // district 'both': na stacji z okręgami automat prowadzi całą stację, bez wbudowanych automatów okręgów
  const sim = new Simulation(station, { scenario, disruptions: level, seed, speed: 1, district: 'both' });
  const op = new AutoOperator(sim, { district: null, role: 'full' });
  onCreate?.(sim, op);
  const endTime = Number.isFinite(sim.endTime) ? sim.endTime : Clock.parse(DEFAULT_END);
  const until = endTime + extra * 60;
  const viol = { count: 0, ticks: 0, first: [] };
  let prev = new Set();
  let n = 0;
  while (sim.clock.time < until) {
    sim.step(0.5);
    const opTick = n++ % 4 === 0;
    if (opTick) op.tick();
    const v = violations(sim);
    viol.ticks += v.length;
    const now = new Set(v);
    for (const msg of now) {
      if (prev.has(msg)) continue;
      viol.count++;
      if (viol.first.length < FIRST_VIOLATIONS) viol.first.push({ time: Clock.format(sim.clock.time, true), msg });
      onViolation?.(msg, sim.clock.time);
    }
    prev = now;
    onTick?.(sim, { opTick, op });
    if (settle && n % 120 === 0 && settled(sim, endTime)) break;
  }
  return { sim, violations: viol, endTime, until: sim.clock.time };
}
