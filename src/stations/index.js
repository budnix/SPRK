import starePustkowie from './stare-pustkowie.js';
import wolaPustkowska from './wola-pustkowska.js';
import gdyniaGlowna from './gdynia-glowna.js';

/** Rejestr stacji dostępnych w grze. Przyszły edytor doda tu stacje użytkowników. */
export const STATIONS = [starePustkowie, wolaPustkowska, gdyniaGlowna];

export function getStation(id) {
  return STATIONS.find((s) => s.id === id) || STATIONS[0];
}
