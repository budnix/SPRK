/**
 * Drogi pociągu po przebiegach pociągowych (łańcuchy przebiegów) – jedno wyszukiwanie dla automatu dyżurnego (wjazd
 * na tor, `AutoOperator`), ruchu (usterka na drodze toru planowego, `Traffic`) i statycznego sprawdzenia scenariusza
 * (`scenarioCheck.js`). Zmiana zasad szukania (głębokość, warunek toru stacyjnego) zmienia wszystkie trzy naraz –
 * kontrola scenariusza nie rozjedzie się z tym, co zrobi automat. (Przebieg złożony od semafora do przycisku końca –
 * osobno: `Interlocking.routeChains`.)
 *
 * Tu też małe pytania o układ, które zadają te same moduły (i narzędzia): odcinek zbliżania szlaku (`exitApproach`),
 * przebiegi wjazdowe od strony szlaku (`entryRoutes`), tor, na którym stoi skład (`trainTrack`).
 *
 * Moduł logiki: bez DOM; przebiegi i odcinki z `Interlocking` (`routeList()`, `sections`, `topo`, `station`).
 */

/**
 * Odcinek przed granicą stacji od strony szlaku `exitId` – odcinek zbliżania przebiegów wjazdowych z tego szlaku;
 * null, gdy stacja nie ma takiego szlaku.
 */
export function exitApproach(ilk, exitId) {
  const ex = ilk.station.exits?.[exitId];
  return ex ? ilk.topo.trackAt(ex.tile.x, ex.tile.y)?.section ?? null : null;
}

/** Przebiegi pociągowe wjazdowe od strony szlaku `exitId` (spośród `routes`, domyślnie wszystkich przebiegów stacji). */
export function entryRoutes(ilk, exitId, routes = ilk.routeList()) {
  const app = exitApproach(ilk, exitId);
  return app == null ? [] : routes.filter((r) => r.kind === 'train' && r.approach === app);
}

/** Tor (numer jako napis), na którym stoi albo którym jedzie skład `train`: pierwszy zajęty odcinek z numerem toru; null – żaden. */
export function trainTrack(ilk, train) {
  for (const sid of train.occupiedSections()) {
    const tk = ilk.sections.get(sid)?.track;
    if (tk) return String(tk);
  }
  return null;
}

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
 * spełniającym `goal(ostatni, łańcuch)` (każdy następny przebieg od semafora końcowego poprzedniego, bez powtórzeń).
 * Także dla przebiegów manewrowych (`Traffic`: droga zadania manewrowego).
 */
export function trainRouteChains(trainRoutes, starts, goal, depth = 3) {
  const out = [];
  const walk = (path) => {
    const last = path[path.length - 1];
    if (goal(last, path)) { out.push(path); return; }
    if (path.length >= depth || last.end.type !== 'signal') return;
    for (const r of trainRoutes) if (r.start === last.end.id && !path.includes(r)) walk([...path, r]);
  };
  for (const r of starts) walk([r]);
  return out;
}
