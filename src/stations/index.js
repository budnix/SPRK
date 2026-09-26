import starePustkowie from './stare-pustkowie.js';

/** Rejestr stacji dostępnych w grze. Przyszły edytor doda tu stacje użytkowników. */
export const STATIONS = [starePustkowie];

export function getStation(id) {
  return STATIONS.find((s) => s.id === id) || STATIONS[0];
}
