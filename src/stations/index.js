import starePustkowie from './stare-pustkowie.js';
import wolaPustkowska from './wola-pustkowska.js';
import gdyniaGlowna from './gdynia-glowna.js';
import gdyniaOrlowo from './gdynia-orlowo.js';
import gdyniaChylonia from './gdynia-chylonia.js';

/** Rejestr stacji dostępnych w grze. Przyszły edytor doda tu stacje użytkowników. */
export const STATIONS = [starePustkowie, wolaPustkowska, gdyniaOrlowo, gdyniaChylonia, gdyniaGlowna];

export function getStation(id) {
  return STATIONS.find((s) => s.id === id) || STATIONS[0];
}
