/**
 * Drogi pociągu po przebiegach pociągowych (łańcuchy przebiegów) – jedno wyszukiwanie dla automatu dyżurnego (wjazd
 * na tor, `AutoOperator`), ruchu (usterka na drodze toru planowego, `Traffic`) i statycznego sprawdzenia scenariusza
 * (`scenarioCheck.js`). Zmiana zasad szukania (głębokość, warunek toru stacyjnego) zmienia wszystkie trzy naraz –
 * kontrola scenariusza nie rozjedzie się z tym, co zrobi automat. (Przebieg złożony od semafora do przycisku końca –
 * osobno: `Interlocking.routeChains`.)
 *
 * Moduł logiki: bez DOM; przebiegi i odcinki z `Interlocking` (`routeList()`, `sections`, `topo`).
 */

/**
 * Tor (numer jako napis), na którym kończy się przebieg: tor ostatniego odcinka drogi, a gdy ten nie ma numeru – tor
 * odcinka pod semaforem końcowym. Pusty napis – odcinek bez toru; null – przebieg nie kończy się na semaforze.
 */
export function routeEndTrack(ilk, r) {
  const last = r.sections[r.sections.length - 1];
  const tk = last ? ilk.sections.get(last)?.track : null;
  if (tk) return String(tk);
  if (r.end.type === 'signal') {
    const sg = ilk.topo.signals.get(r.end.id);
    const sec = ilk.topo.trackAt(sg.at.x, sg.at.y)?.section;
    return sec ? String(ilk.sections.get(sec).track ?? '') : null;
  }
  return null;
}

/**
 * Wjazd na tor `track` (jak przyjmuje pociąg automat): najkrótszy łańcuch do `depth` przebiegów pociągowych zaczynający
 * się jednym z `starts`, którego ostatni przebieg kończy się na odcinku stacyjnym toru `track`; dalsze stopnie
 * (stacje z torem peronowym za semaforem pośrednim, np. Sopot A → H → O) – przebiegi z `routes` od semafora końcowego
 * poprzedniego, bez wyjazdu na szlak. Zwraca listę przebiegów albo null.
 */
export function entryPath(ilk, routes, starts, track, depth = 3) {
  const queue = starts.map((r) => [r]);
  const seen = new Set();
  while (queue.length) {
    const path = queue.shift();
    const last = path[path.length - 1];
    if (routeEndTrack(ilk, last) === String(track) && ilk.sections.get(last.sections.at(-1))?.kind === 'station') return path;
    if (path.length >= depth || last.end.type !== 'signal' || seen.has(last.end.id)) continue;
    seen.add(last.end.id);
    for (const r of routes) if (r.kind === 'train' && r.start === last.end.id && !r.exit) queue.push([...path, r]);
  }
  return null;
}

/**
 * Wszystkie łańcuchy do `depth` przebiegów z `trainRoutes` zaczynające się jednym z `starts` i kończące przebiegiem
 * spełniającym `goal` (każdy następny przebieg od semafora końcowego poprzedniego, bez powtórzeń).
 */
export function trainRouteChains(trainRoutes, starts, goal, depth = 3) {
  const out = [];
  const walk = (path) => {
    const last = path[path.length - 1];
    if (goal(last)) { out.push(path); return; }
    if (path.length >= depth || last.end.type !== 'signal') return;
    for (const r of trainRoutes) if (r.start === last.end.id && !path.includes(r)) walk([...path, r]);
  };
  for (const r of starts) walk([r]);
  return out;
}
