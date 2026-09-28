/**
 * Rejestr misji wprowadzających (samouczków), bez DOM. Każda misja jest osobnym plikiem w `src/tutorial/missions/`
 * z własną listą kroków i własnym scenariuszem: inna stacja, inny układ torów, inny rozkład.
 *  - misja 1 (monitor): Szkolna – linia jednotorowa, krzyżowanie, manewry, usterki; lekcje w `lessons.js`,
 *  - misja 2 (pulpit typu E): Jodłowa – linia dwutorowa, wyprzedzanie, odgałęzienie,
 *  - misja 3 (pulpit IZH-111): Zacisze – stacja krańcowa, tory czołowe, zmiana czoła.
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

/** Słowniki tekstów misji, które korzystają ze wspólnych lekcji (klucze: `LESSON_PHRASES`). */
export const PHRASES = Object.fromEntries(Object.values(MISSIONS).filter((m) => m.phrases).map((m) => [m.id, m.phrases]));

/** Identyfikatory misji w kolejności nauki. */
export const MISSION_VIEWS = Object.keys(MISSIONS);

/** Kroki misji `id` – własny zestaw tej misji. */
export function missionSteps(id) {
  const mission = MISSIONS[id];
  if (!mission) throw new Error(`Brak tekstów misji dla widoku '${id}'`);
  return mission.steps();
}
