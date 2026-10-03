import { trainSpeed, brakingOf } from '../rollingStock.js';
import { entryPath, entryRoutes, exitApproach } from '../trainPaths.js';
import { STATION_RUN } from './entry.js';

/** Szybkość z obrazu „40” (S10–S13, Sr3) w okręgu zwrotnicowym [km/h] – przebieg o szybkości do 60 km/h. */
const ZONE_KMH = 40;

/** Drogi wjazdu wg zależności (`ilk`) i pary szlak|tor – budowa służby tworzy wiele symulacji jednej stacji. */
const paths = new WeakMap();
function pathOf(ilk, from, track) {
  if (!paths.has(ilk)) paths.set(ilk, new Map());
  const memo = paths.get(ilk), key = `${from}|${track}`;
  if (!memo.has(key)) { const routes = ilk.routeList(); memo.set(key, entryPath(ilk, routes, entryRoutes(ilk, from, routes), track)); }
  return memo.get(key);
}

/**
 * Czas jazdy pociągu `def` od granicy pulpitu do toru planowego [s] – tyle wcześniej niż przejazd szlaku sąsiad
 * wyprawia pociąg, żeby był na torze o czasie z rozkładu. Liczony z układu stacji tak, jak jedzie `Train`: odcinek
 * zbliżania z prędkością pociągu (nie większą niż szlaku), dalej łańcuch przebiegów wjazdowych na tor planowy
 * (`entryPath`, jak przyjmuje pociąg automat); przebieg o szybkości do 60 km/h – obraz „40” od semafora do zjechania
 * całego pociągu z okręgu zwrotnicowego (z całej drogi, gdy prowadzi na tor główny dodatkowy); pociąg z postojem jedzie
 * jeszcze torem planowym do peronu i hamuje (`brakingOf`), przelot – do wjazdu na tor. Bez rozpędzania i zwalniania
 * przed semaforem – raczej za krótko niż za długo (pociąg za wcześnie zajmuje głowicę przed innymi). Nigdy mniej niż
 * `STATION_RUN` (małe stacje – jak dotąd); bez drogi na tor planowy – `STATION_RUN`. Postoje na przystankach liczy
 * osobno `HALT_TIME`. Moduł logiki: bez DOM.
 */
export function entryRun(ilk, def, rollingStock = null) {
  const ex = def.from ? ilk.station.exits?.[def.from] : null;
  if (!ex || def.track == null) return STATION_RUN;
  const path = pathOf(ilk, def.from, def.track);
  if (!path) return STATION_RUN;
  const kmh = Math.min(trainSpeed(def, rollingStock), ex.lineSpeed ?? Infinity);
  const v = kmh / 3.6, zone = Math.min(kmh, ZONE_KMH) / 3.6;
  const sec = (id) => ilk.sections.get(id);
  const len = (id) => sec(id)?.length ?? 0;
  const onTrack = (id) => sec(id)?.track != null && String(sec(id).track) === String(def.track);
  const points = new Set([...ilk.points.values()].map((p) => p.section));
  // droga czoła: odcinek zbliżania, potem odcinki przebiegów do toru planowego (z postojem – i po nim, do peronu);
  // ograniczenia „40”: od początku przebiegu do końca jego okręgu zwrotnicowego i jeszcze długość pociągu
  let dist = len(exitApproach(ilk, def.from));
  const slow = [];
  for (const r of path) {
    const from = dist;
    let zoneEnd = null;
    const whole = r.sections.some((id) => sec(id)?.mainKind === 'dodatkowy');
    for (const id of r.sections) {
      if (onTrack(id) && !def.stop) break;
      dist += len(id);
      if (whole || points.has(id)) zoneEnd = dist;
    }
    if (r.speed <= 60 && zoneEnd != null) slow.push([from, zoneEnd + (def.length ?? 0)]);
  }
  // odcinki „40” mogą na siebie zachodzić (kolejne przebiegi) – długość ich sumy na drodze [0, dist]
  let atZone = 0, reach = 0;
  for (const [a, b] of slow.sort((p, q) => p[0] - q[0])) {
    const lo = Math.max(a, reach), hi = Math.min(b, dist);
    if (hi > lo) atZone += hi - lo;
    reach = Math.max(reach, b);
  }
  let t = atZone / zone + (dist - atZone) / v;
  if (def.stop) {
    // hamowanie do zatrzymania trwa dwa razy dłużej niż przejazd tej drogi ze stałą prędkością – dodatek v / (2b)
    const vEnd = reach >= dist ? zone : v;
    t += vEnd / (2 * brakingOf(def, rollingStock).brake);
  }
  return Math.max(STATION_RUN, Math.round(t));
}
