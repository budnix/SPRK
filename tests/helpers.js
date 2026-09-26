import { Simulation } from '../src/model/Simulation.js';
import station from '../src/stations/stare-pustkowie.js';
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

export { Clock, station };
