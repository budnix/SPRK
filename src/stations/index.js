import gdyniaGlowna from './gdynia-glowna.js';
import gdyniaOrlowo from './gdynia-orlowo.js';
import gdyniaChylonia from './gdynia-chylonia.js';
import sopot from './sopot.js';
import szkolna from './szkolna.js';
import jodlowa from './jodlowa.js';
import zacisze from './zacisze.js';
import olszyny from './olszyny.js';
import brzezina from './brzezina.js';
import rumia from './rumia.js';
import reda from './reda.js';
import tczew from './tczew.js';
import pruszczGdanski from './pruszcz-gdanski.js';
import gdanskGlowny from './gdansk-glowny.js';

/** Rejestr stacji dostępnych w grze. Przyszły edytor doda tu stacje użytkowników. */
export const STATIONS = [szkolna, jodlowa, zacisze, olszyny, brzezina, sopot, gdyniaOrlowo, gdyniaChylonia, gdyniaGlowna, rumia, reda, tczew, pruszczGdanski, gdanskGlowny];

export function getStation(id) {
  return STATIONS.find((s) => s.id === id) || STATIONS[0];
}
