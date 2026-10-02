import { NAMED_TRAINS } from './data/namedTrains.js';

/**
 * Pociągi dalekobieżne z nazwami (`src/model/data/namedTrains.js` – lista z rozkładu rocznego PKP Intercity, cała Polska):
 * dobór pociągu do relacji. Nazwa jest przypisana do trasy, więc pociąg z listy może zastąpić pociąg rozkładu stacji
 * tylko wtedy, gdy jedzie tą samą drogą – przez miasto początku relacji, a potem przez miasto jej końca. Moduł logiki:
 * bez DOM; nie zna żadnej stacji.
 */

/** Dopiski dworca w nazwie stacji („Gdynia Gł.”, „Warszawa Wsch.”, „Praha hl.n.”) – bez nich zostaje miasto. */
const STATION_SUFFIX = /\s+(Gł\.?|Główn\p{L}+|Wsch\.?|Wschodni\p{L}*|Zach\.?|Zachodni\p{L}*|Cent\.?|Centr\.?|Centraln\p{L}+|Fabr\.?|Fabryczn\p{L}+|Osob\.?|Osobow\p{L}+|hl\.n\.|Hbf)$/u;

/** Miasto stacji: nazwa bez dopisku dworca („Kraków Gł.” → „Kraków”, „Warszawa Zach.” → „Warszawa”). */
export function cityOf(station) {
  return String(station ?? '').trim().replace(STATION_SUFFIX, '');
}

/** Pociągi z listy, które jadą przez miasto stacji `from`, a potem przez miasto stacji `to` (także jako początek / koniec). */
export function namedTrainsVia(from, to, list = NAMED_TRAINS) {
  const a = cityOf(from), b = cityOf(to);
  if (!a || !b || a === b) return [];
  return list.filter((t) => {
    const cities = t.stops.map(cityOf);
    const i = cities.indexOf(a);
    return i >= 0 && cities.lastIndexOf(b) > i;
  });
}

/** Nazwa wpisu rozkładu dla pociągu z listy: kategoria, nazwa w cudzysłowie i relacja – „IC „Lazur” Łódź Fabr. – Gdynia Gł.”. */
export function namedTrainTitle(t) {
  return `${t.cat} „${t.name}” ${t.stops[0]} – ${t.stops.at(-1)}`;
}
