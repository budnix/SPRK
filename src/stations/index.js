import gdyniaGlowna from './gdynia-glowna.js';
import gdyniaOrlowo from './gdynia-orlowo.js';
import gdyniaChylonia from './gdynia-chylonia.js';
import sopot from './sopot.js';
import szkolna from './szkolna.js';
import rumia from './rumia.js';
import reda from './reda.js';
import tczew from './tczew.js';
import pruszczGdanski from './pruszcz-gdanski.js';

/** Rejestr stacji dostępnych w grze. Przyszły edytor doda tu stacje użytkowników. */
export const STATIONS = [szkolna, sopot, gdyniaOrlowo, gdyniaChylonia, gdyniaGlowna, rumia, reda, tczew, pruszczGdanski];

export function getStation(id) {
  return STATIONS.find((s) => s.id === id) || STATIONS[0];
}
