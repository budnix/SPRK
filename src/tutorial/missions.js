/**
 * Rejestr misji wprowadzających (samouczków), bez DOM. Każda misja jest osobnym plikiem w `src/tutorial/missions/`
 * z własnym słownikiem tekstów i własną listą kroków, więc każdy samouczek może pokazywać obsługę po swojemu.
 * Wspólne lekcje rozkładu stacji Szkolna są w `lessons.js` – misja bierze je, dokłada swoje kroki, podmienia albo
 * pomija (`withSteps`).
 *
 * Nowy samouczek: plik misji (`id`, `name`, `view`, `phrases`, `steps()`), wpis tutaj i scenariusz stacji z polem
 * `tutorial: '<id>'`.
 */
import monitor from './missions/monitor.js';
import pulpit from './missions/pulpit.js';
import izh from './missions/izh.js';

/** Rejestr misji: id z pola `tutorial` scenariusza → definicja. */
export const MISSIONS = Object.fromEntries([monitor, pulpit, izh].map((m) => [m.id, m]));

export function getMission(id) {
  return MISSIONS[id] || null;
}

/** Słowniki tekstów misji (klucz: id misji). Klucze wymagane przez wspólne lekcje: `LESSON_PHRASES`. */
export const PHRASES = Object.fromEntries(Object.values(MISSIONS).map((m) => [m.id, m.phrases]));

/** Misje, dla których są teksty. */
export const MISSION_VIEWS = Object.keys(PHRASES);

/** Kroki misji `id` – własny zestaw tej misji. */
export function missionSteps(id) {
  const mission = MISSIONS[id];
  if (!mission) throw new Error(`Brak tekstów misji dla widoku '${id}'`);
  return mission.steps();
}
