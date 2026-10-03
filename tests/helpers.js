import { Simulation } from '../src/model/Simulation.js';
import station from './fixtures/stare-pustkowie.js'; // stacja testowa typu E (dawne Stare Pustkowie)
import { Clock } from '../src/core/Clock.js';

export function makeSim(opts = {}) {
  const sim = new Simulation(station, { speed: 1, ...opts });
  return sim;
}

/** Przesuwa symulację o `seconds` sekund czasu symulacji – same kroki, bez dyżurnego (z dyżurnym: `play`). */
export function run(sim, seconds, each) {
  const steps = Math.ceil(seconds / 0.5);
  for (let i = 0; i < steps; i++) { sim.step(0.5); if (each) each(sim); }
}

/** Wszystkie pociągi rozkładu dotarły do sąsiada / zakończyły bieg (zmiana kończy się wcześniej – po wyprawieniu ostatniego). */
export function allArrived(sim) {
  return sim.traffic.timetable().every(isFinished);
}

export { Clock, station };

/** Id przebiegów nastawionych (utwierdzonych, bez nastawianych) w kolejności nastawienia – `ilk.routesSet()`. */
export const setRoutes = (ilk) => ilk.routesSet().filter((x) => x.state !== 'setting').map((x) => x.id);
/** Id przebiegów w nastawianiu (zwrotnice się przestawiają). */
export const routesBeingSet = (ilk) => ilk.routesSet().filter((x) => x.state === 'setting').map((x) => x.id);

/**
 * Nastawiony przebieg `id` przez interfejs zależności (null, gdy nie jest nastawiony): `routeInfo` (id, route, state,
 * faultDrop), `routeProgress` (sections, released, front, overlap, points) i `entered` – pociąg wjechał
 * (`Interlocking.routeEntered`). Migawka: po kroku symulacji zapytaj od nowa (zapamiętuj id, nie wynik).
 */
export function routeView(ilk, id) {
  const progress = id == null ? null : ilk.routeProgress(id);
  if (!progress) return null;
  const info = ilk.routeInfo(id);
  return { ...info, ...progress, entered: Interlocking.routeEntered(info.state) };
}
/** `routeView` każdego nastawionego przebiegu, w kolejności nastawienia. */
export const routeViews = (ilk) => setRoutes(ilk).map((id) => routeView(ilk, id));

import { AutoOperator } from '../src/model/Operator.js';
import { Interlocking } from '../src/model/Interlocking.js';
import { isFinished } from '../src/model/timetable/phase.js';
import { play as playLoop } from '../src/model/check/play.js';

/**
 * Uniwersalny dyżurny automatyczny (cała stacja) – opakowanie AutoOperator z możliwością
 * nadpisania toru wjazdu (`trackFor`).
 */
export function autoDispatch(sim, trackFor = null) {
  if (!sim._autoOp) sim._autoOp = new AutoOperator(sim, { district: null, role: 'full', trackFor });
  sim._autoOp.tick();
}

/**
 * Gra w rytmie gry z automatem (krok 0,5 s, dyżurny co 2 s) – `play` z `src/model/check/play.js`, domyślnie z dyżurnym
 * `autoDispatch`; `dispatch` – funkcja `(sim) => …`, `AutoOperator` albo `null` (same kroki). Przykład:
 * `play(sim).until('08:25', { stop: allArrived })`; kilka etapów jednej gry: `const game = play(sim, op);
 * game.until('06:16'); …; game.until('06:30');` (dyżurny zachowuje rytm). Nie przepisuj pętli `n++ % 4` w teście.
 */
export const play = (sim, dispatch = autoDispatch) => playLoop(sim, dispatch);
