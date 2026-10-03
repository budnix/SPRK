import assert from 'node:assert/strict';
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

/**
 * Dyżurny „tylko pozwolenia” – po każdym kroku odpowiada na żądania pozwolenia sąsiada (Eap: Poz) na szlakach `exits`
 * (id albo lista; null – wszystkie) przez polecenie stanowiska (`sim.execute`), nie przyciskiem blokady; `ko` – także Ko
 * po przyjeździe pociągu sąsiada. Prośby SBL o zmianę kierunku zostają bez odpowiedzi – o tym decyduje test.
 * Przykład: `run(sim, 960, grant('W'))`, w pętli: `const answer = grant('W'); … answer(sim);`.
 */
export const grant = (exits = null, { ko = false } = {}) => {
  const only = exits == null ? null : new Set([].concat(exits));
  return (sim) => {
    for (const b of sim.blocks.values()) {
      if (only && !only.has(b.id)) continue;
      if (b.neighbourAsk()?.answer === 'Poz') sim.execute({ type: 'block', exit: b.id, btn: 'Poz' });
      if (ko && b.duties().some((d) => d.duty === 'Ko')) sim.execute({ type: 'block', exit: b.id, btn: 'Ko' });
    }
  };
};

/**
 * Pociąg `nr` od sąsiada `from` dojeżdża do semafora `signal` i staje przed nim: `minutes` gry z pozwoleniami dla
 * sąsiada (`grant(from)`), bez przebiegu wjazdowego. Zwraca wpis rozkładu pociągu.
 */
export function heldAt(sim, nr, signal, { from, minutes }) {
  run(sim, minutes * 60, grant(from));
  const e = sim.traffic.entry(nr);
  assert.equal(e.train.stoppedAt?.signal, signal);
  return e;
}
/** Stare Pustkowie: pociąg 5310 od W stoi przed semaforem wjazdowym A (16 min gry). */
export const trainAtA = (sim) => heldAt(sim, 5310, 'A', { from: 'W', minutes: 16 });

/** Wszystkie pociągi rozkładu dotarły do sąsiada / zakończyły bieg (zmiana kończy się wcześniej – po wyprawieniu ostatniego). */
export function allArrived(sim) {
  return sim.traffic.timetable().every(isFinished);
}

export { Clock, station };

/** Wpis rozkładu pociągu `nr` (`Traffic.entry`) albo null. */
export const entryOf = (sim, nr) => sim.traffic.entry(nr);

/** Długość składu osobowego w testach na stacjach szkoleniowych [m] – mieści się przy peronie. */
export const TRAIN_LENGTH = Object.freeze({ szkolna: 130, kalinowo: 110, olszyny: 120 });

/**
 * Wiersz rozkładu do scenariusza testu (docs/STATION-FORMAT.md, „Rozkład”) – pola nazwane: `{ nr, from, to, arr, dep,
 * track }`, domyślnie pociąg osobowy z postojem 60 s, 100 km/h; `st` – stacja albo jej id (długość składu z
 * `TRAIN_LENGTH`); inne pola wpisu nadpisują domyślne (`length`, `vmax`, `stop` …).
 */
export function trainRow({ st = null, nr, from, to, arr, dep, track, ...rest }) {
  return { nr, kind: 'os', name: 'Osobowy', from, to, arr, dep, track, stop: true, length: TRAIN_LENGTH[st?.id ?? st], vmax: 100, dwell: 60, ...rest };
}

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
