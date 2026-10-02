import { Simulation } from '../src/model/Simulation.js';
import station from './fixtures/stare-pustkowie.js'; // stacja testowa typu E (dawne Stare Pustkowie)
import { Clock } from '../src/core/Clock.js';

export function makeSim(opts = {}) {
  const sim = new Simulation(station, { speed: 1, ...opts });
  return sim;
}

/** Przesuwa symulację o `seconds` sekund czasu symulacji. */
export function run(sim, seconds, each) {
  const steps = Math.ceil(seconds / 0.5);
  for (let i = 0; i < steps; i++) { sim.step(0.5); if (each) each(sim); }
}

/** Wszystkie pociągi rozkładu dotarły do sąsiada / zakończyły bieg (zmiana kończy się wcześniej – po wyprawieniu ostatniego). */
export function allArrived(sim) {
  return sim.traffic.timetable().every(isFinished);
}

export { Clock, station };

import { AutoOperator } from '../src/model/Operator.js';
import { isFinished } from '../src/model/timetable/phase.js';

/**
 * Uniwersalny dyżurny automatyczny (cała stacja) – opakowanie AutoOperator z możliwością
 * nadpisania toru wjazdu (`trackFor`).
 */
export function autoDispatch(sim, trackFor = null) {
  if (!sim._autoOp) sim._autoOp = new AutoOperator(sim, { district: null, role: 'full', trackFor });
  sim._autoOp.tick();
}
