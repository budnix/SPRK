import { Simulation } from '../src/model/Simulation.js';
import { Clock } from '../src/core/Clock.js';
import { Interlocking } from '../src/model/Interlocking.js';
import { exitApproach, entryRoutes as routesFrom } from '../src/model/trainPaths.js';
import { autoDispatch, allArrived } from './helpers.js';
import { violations, watchEvents } from '../src/model/check/invariants.js';
import { unjustified, leftovers } from '../src/model/check/outcome.js';
import { isFinished } from '../src/model/timetable/phase.js';

/*
 * Usterki w wybranej chwili jazdy pociągu – wspólna podstawa testów `tests/faults-*.test.js`.
 *
 * Losowe usterki (zakłócenia) trafiają w różne chwile tylko przypadkiem. Tu usterka zaczyna się przy zdarzeniu:
 * pociąg zgłoszony, przebieg nastawiony, pociąg w przebiegu, pociąg przy peronie, przebieg wyjazdowy, pociąg na szlaku.
 * Cel wskazuje się względem pociągu (semafor wjazdowy, zwrotnica przebiegu, odcinek przed pociągiem, szlak…).
 *
 * Ruch prowadzi automat (`autoDispatch`) – jedyny dyżurny, który sam obsługuje usterki (Sz, rozkaz „S”, zapowiadanie
 * telefoniczne, doraźne zwolnienie). Sprawdzane są reguły urządzeń, nie zręczność automatu: niezmienniki w każdym
 * takcie, brak minięcia „Stój” i rozprucia, brak kar za czynności wymuszone usterką, stan po naprawie.
 */

/** Scenariusz z własnym rozkładem na stacji `station` i stanowisku `srk` (bez zadań, bez losowych zakłóceń). */
export function faultSim(station, { srk, timetable, endTime = '10:00', seed = 1, ...rest } = {}) {
  return new Simulation(station, { disruptions: 'none', seed, scenario: { id: 't', name: 't', endTime, srk, tasks: [], timetable, ...rest } });
}

const entryOf = (sim, nr) => sim.traffic.timetable().find((e) => e.nr === nr);
/** Odcinek przed granicą stacji od strony wjazdu `exitId` (odcinek zbliżania przebiegów wjazdowych). */
export function approachOf(sim, exitId) {
  return exitApproach(sim.ilk, exitId);
}
/** Przebiegi pociągowe wjazdowe od strony, z której przyjeżdża pociąg `nr`. */
export function entryRoutes(sim, nr) {
  return routesFrom(sim.ilk, entryOf(sim, nr)?.from);
}
/**
 * Nastawiony (czynny) przebieg wjazdowy pociągu `nr` albo null. Zwraca zapis przebiegu z zależności – testy usterek
 * wybierają chwilę wg postępu pociągu w przebiegu (`front`, `released`), czego stan przebiegu celowo nie podaje;
 * o sam stan pytaj `sim.ilk.routeState(a.id)`.
 */
export function entryActive(sim, nr) {
  const ids = new Set(entryRoutes(sim, nr).map((r) => r.id));
  return [...sim.ilk.active.values()].find((a) => ids.has(a.id)) ?? null;
}
/** Nastawiony przebieg wyjazdowy na szlak pociągu `nr` (ostatni stopień, z `exit`) albo null. */
export function exitActive(sim, nr) {
  const e = entryOf(sim, nr);
  return [...sim.ilk.active.values()].find((a) => a.route.kind === 'train' && a.route.exit === e?.to) ?? null;
}

/** Chwile jazdy pociągu `nr` – predykaty (sim) => bool. */
export const at = {
  /** sąsiad zgłosił pociąg (żądanie pozwolenia / pociąg na szlaku), przebieg wjazdowy jeszcze nienastawiony */
  announced: (nr) => (sim) => { const e = entryOf(sim, nr); return !!e && (!!e.train || sim.blocks.get(e.from)?.request === 'theirs') && !entryActive(sim, nr) && !e.train?.entered; },
  /** pociąg jedzie po szlaku do stacji */
  onLineIn: (nr) => (sim) => { const tr = entryOf(sim, nr)?.train; return !!tr && !tr.entered; },
  /** przebieg wjazdowy nastawiony (sygnał zezwalający), pociąg jeszcze nie wjechał */
  entrySet: (nr) => (sim) => { const a = entryActive(sim, nr); return !!a && Interlocking.routeAhead(sim.ilk.routeState(a.id)) && Interlocking.isProceed(sim.ilk.signals.get(a.route.start).aspect); },
  /** pociąg w przebiegu wjazdowym (minął semafor, przebieg jeszcze się nie rozwiązał) */
  entering: (nr) => (sim) => { const a = entryActive(sim, nr); return !!a && a.trainEntered && a.released.size < a.lockedSections.length - 1; },
  /** pociąg stoi przy peronie (po przyjeździe, przed odjazdem) */
  standing: (nr) => (sim) => { const e = entryOf(sim, nr); return !!e?.train && e.actualArr != null && e.actualDep == null && e.train.v === 0; },
  /** przebieg wyjazdowy nastawiony, pociąg jeszcze nie ruszył */
  exitSet: (nr) => (sim) => { const a = exitActive(sim, nr); return !!a && Interlocking.routeAhead(sim.ilk.routeState(a.id)); },
  /** pociąg wyjeżdża: jest w przebiegu wyjazdowym albo już na szlaku, jeszcze nie dojechał do sąsiada */
  leaving: (nr) => (sim) => { const e = entryOf(sim, nr); const a = exitActive(sim, nr); return !!e?.train && !e.train.finished && ((!!a && ['entered', 'stuck'].includes(sim.ilk.routeState(a.id))) || (e.actualDep != null && !!sim.blocks.get(e.to)?.occupied)); },
};

/** Cele usterek względem pociągu `nr` – (sim) => id. */
export const target = {
  entrySignal: (nr) => (sim) => (entryActive(sim, nr)?.route ?? entryRoutes(sim, nr).find((r) => String(sim.ilk.sections.get(r.sections.at(-1))?.track) === String(entryOf(sim, nr).track)) ?? entryRoutes(sim, nr)[0])?.start,
  /** zwrotnica przebiegu wjazdowego (pierwsza) */
  entryPoint: (nr) => (sim) => (entryActive(sim, nr)?.route ?? entryRoutes(sim, nr)[0])?.points[0]?.id,
  /** odcinek przebiegu wjazdowego przed czołem pociągu (nie ostatni – tor docelowy zwalnia się inaczej) */
  sectionAhead: (nr) => (sim) => {
    const a = entryActive(sim, nr);
    const secs = a ? a.lockedSections : entryRoutes(sim, nr)[0]?.sections ?? [];
    const from = a?.front ?? -1;
    return secs.find((s, i) => i > from && i < secs.length - 1 && !sim.ilk.sections.get(s).physical);
  },
  /** odcinek toru, na którym pociąg stoi / stanie */
  track: (nr) => (sim) => { const tr = entryOf(sim, nr)?.train; return tr ? [...tr.occupiedSections()].find((s) => sim.ilk.sections.get(s)?.track != null) : null; },
  lineIn: (nr) => (sim) => entryOf(sim, nr)?.from,
  lineOut: (nr) => (sim) => entryOf(sim, nr)?.to,
  exitSignal: (nr) => (sim) => exitActive(sim, nr)?.route.start,
  /** zwrotnica przebiegu wyjazdowego (pierwsza w przebiegu, który jest nastawiony od toru pociągu) */
  exitPoint: (nr) => (sim) => {
    const a = sim.ilk.routesSet().find((x) => x.route.kind === 'train' && Interlocking.routeAhead(x.state) && sim.ilk.sections.get(x.route.approach)?.physical && entryOf(sim, nr)?.train?.occupiedSections().has(x.route.approach));
    return a?.route.points[0]?.id;
  },
};

/**
 * Jedna zmiana z usterką w chwili `when`: `fault = { type, target: (sim) => id | id, duration (min) }`.
 * Ruch prowadzi automat (co 2 s), niezmienniki sprawdzane w każdym takcie. Koniec: `settle` min po tym, jak usterka
 * minęła i wszystkie pociągi dojechały, albo `until`.
 *
 * Zwraca `{ sim, fired, fault, violations, events, arrived }`: `violations` – naruszenia niezmienników (pierwsze 5, z czasem),
 * `events` – spad / rozprucie, `fired` – czy chwila nastąpiła, `fault` – usterka (z celem).
 */
export function runWithFault(sim, { when, fault, until = '11:00', dispatch = autoDispatch, each = null, settle = 5 }) {
  let end = Clock.parse(until);
  const events = watchEvents(sim);
  const bad = [];
  let fired = false, added = null, n = 0, calm = false;
  while (sim.clock.time < end) {
    sim.step(0.5);
    if (n++ % 4 === 0 && dispatch) dispatch(sim);
    if (!fired && when(sim)) {
      const tgt = typeof fault.target === 'function' ? fault.target(sim) : fault.target;
      if (tgt != null) { fired = true; added = sim.faults.add({ type: fault.type, target: tgt, duration: fault.duration ?? 5 }); }
    }
    if (each) each(sim);
    if (bad.length < 5) for (const v of violations(sim)) bad.push(`${Clock.format(sim.clock.time, true)} ${v}`);
    // po naprawie i przejeździe wszystkich pociągów jeszcze `settle` min – sąsiad potwierdza przyjazd, przebiegi się rozwiązują
    if (!calm && fired && added.done && allArrived(sim)) { calm = true; end = Math.min(end, sim.clock.time + settle * 60); }
  }
  return { sim, fired, fault: added, violations: bad, events, arrived: allArrived(sim) };
}

/** Pociągi, które nie dojechały (numer i stan) – do komunikatów asercji. */
export function stuck(sim) {
  return sim.traffic.timetable().filter((e) => !isFinished(e)).map((e) => `${e.nr}: ${e.status}`);
}

export { Clock };
