import { REGIONS, isRegion } from '../model/regions.js';
import { isTraining } from '../model/shift/offers.js';
import { getSrk } from '../srk/registry.js';

/**
 * Katalog posterunków dla ekranów wyboru (bez DOM – testy w Node, tests/catalog.test.js): stacje szkoleniowe i do
 * służby, miejsca i ich edycje (era), wyszukiwanie bez polskich znaków, filtry, adresy ekranów (#/…), układ schematu
 * regionu i postęp gracza (najlepsza ocena, ukończone misje).
 *
 * Miejsce (`place`, domyślnie `id`) to punkt na mapie; edycja to plik stacji z własnym planem, rokiem (`era`) i jednym
 * rodzajem stanowiska. Edycje jednego miejsca są zakładkami na stronie stacji.
 */

/** Tekst do porównań: małe litery, bez znaków diakrytycznych (także „ł”). */
export function normalize(text) {
  return String(text ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l');
}

/** Posterunki do służby: bez stacji szkoleniowych. */
export function dutyStations(stations) {
  return stations.filter((st) => !isTraining(st));
}

/** Systemy srk zmian posterunku (bez samouczków; scenariusz może mieć własny) – identyfikatory z rejestru. */
export function stationSrks(station) {
  const scs = (station.scenarios || []).filter((sc) => !sc.tutorial);
  return [...new Set((scs.length ? scs.map((sc) => sc.srk || station.srk) : [station.srk]).map((id) => getSrk(id).id))];
}

export function placeOf(station) {
  return station.place || station.id;
}

/** Edycje miejsca stacji: najnowsza pierwsza (bez `era` – stan dzisiejszy, przed latami). */
export function editionsOf(stations, station) {
  const place = placeOf(station);
  return stations.filter((st) => placeOf(st) === place && !isTraining(st)).sort((a, b) => (b.era ?? Infinity) - (a.era ?? Infinity) || a.id.localeCompare(b.id));
}

/** Miejsca do służby: jedno na `place`, z edycjami (najnowsza pierwsza) – lista i mapa pokazują miejsca, nie edycje. */
export function placesOf(stations) {
  const out = new Map();
  for (const st of dutyStations(stations)) {
    const p = placeOf(st);
    if (!out.has(p)) out.set(p, editionsOf(stations, st));
  }
  return [...out.values()];
}

/** Słowa, po których można znaleźć stację: nazwa, położenie, ruch, linie, województwo, rok, stanowisko. */
export function searchWords(station) {
  const srks = stationSrks(station).map((id) => getSrk(id).name);
  const text = [station.name, station.location, station.traffic, station.srkInfo, REGIONS[station.region], station.era,
    ...(station.lines || []), ...srks].filter((x) => x != null).join(' ');
  return normalize(text).split(/[^a-z0-9]+/).filter(Boolean);
}

/** Każde słowo zapytania jest początkiem któregoś słowa stacji („gdan” → Gdańsk, „202” → linia 202). */
export function matchesQuery(station, query) {
  const tokens = normalize(query).split(/[^a-z0-9]+/).filter(Boolean);
  if (!tokens.length) return true;
  const words = searchWords(station);
  return tokens.every((tok) => words.some((w) => w.startsWith(tok)));
}

/** Trafność wyniku: 2 – całe zapytanie w nazwie, 1 – w nazwie część słów, 0 – tylko w opisie (wyniki z nazwą pierwsze). */
export function queryRank(station, query) {
  const tokens = normalize(query).split(/[^a-z0-9]+/).filter(Boolean);
  const name = normalize(station.name).split(/[^a-z0-9]+/).filter(Boolean);
  const hits = tokens.filter((tok) => name.some((w) => w.startsWith(tok))).length;
  return tokens.length && hits === tokens.length ? 2 : hits ? 1 : 0;
}

/** Stacje pasujące do zapytania, najtrafniejsze pierwsze (przy równej trafności – kolejność wejścia). */
export function searchStations(stations, query) {
  return stations.filter((st) => matchesQuery(st, query)).map((st, i) => ({ st, i, r: queryRank(st, query) }))
    .sort((a, b) => b.r - a.r || a.i - b.i).map((x) => x.st);
}

/**
 * Filtr listy posterunków (puste pole – bez ograniczenia): `query` (tekst), `srk` (identyfikatory systemów),
 * `difficulty` (stopnie 1–5), `era` (rok albo 'now' – stan dzisiejszy), `region`, `notPlayed` (z `progress`).
 */
export function filterStations(stations, f = {}) {
  return stations.filter((st) => {
    if (f.query && !matchesQuery(st, f.query)) return false;
    if (f.srk?.length && !stationSrks(st).some((id) => f.srk.includes(id))) return false;
    if (f.difficulty?.length && !f.difficulty.includes(st.difficulty)) return false;
    if (f.era != null && (f.era === 'now' ? st.era != null : st.era !== f.era)) return false;
    if (f.region && st.region !== f.region) return false;
    if (f.notPlayed && played(f.progress, st.id)) return false;
    return true;
  });
}

/** Liczba posterunków w województwach: { region: n }. */
export function regionCounts(stations) {
  const out = {};
  for (const st of stations) if (st.region) out[st.region] = (out[st.region] || 0) + 1;
  return out;
}

/** Lata edycji wśród stacji (malejąco) i czy jest stan dzisiejszy (bez `era`) – filtr ery ma sens od dwóch wartości. */
export function erasOf(stations) {
  const years = [...new Set(stations.map((st) => st.era).filter((y) => y != null))].sort((a, b) => b - a);
  return { years, now: stations.some((st) => st.era == null) };
}

// --- adresy ekranów ---------------------------------------------------------------------------------------------

/**
 * Adres ekranu (część po „#”): `#/` tytuł, `#/szkolenie[/n]` szkolenie (n – numer misji od 1), `#/sluzba` mapa,
 * `#/sluzba/lista` lista, `#/sluzba/<województwo>` region, `#/stacja/<id>` strona stacji. Nieznany – tytuł.
 */
export function parseRoute(hash) {
  const parts = String(hash || '').replace(/^#\/?/, '').split('/').filter(Boolean).map((p) => { try { return decodeURIComponent(p); } catch { return p; } });
  const [a, b] = parts;
  if (a === 'szkolenie') {
    const n = Number(b);
    return Number.isInteger(n) && n >= 1 ? { view: 'training', mission: n } : { view: 'training' };
  }
  if (a === 'sluzba') {
    if (b === 'lista') return { view: 'service', mode: 'list' };
    if (b && isRegion(b)) return { view: 'region', region: b };
    return { view: 'service', mode: 'map' };
  }
  if (a === 'stacja' && b) return { view: 'station', id: b };
  return { view: 'title' };
}

export function routeHash(route) {
  switch (route?.view) {
    case 'training': return route.mission ? `#/szkolenie/${route.mission}` : '#/szkolenie';
    case 'service': return route.mode === 'list' ? '#/sluzba/lista' : '#/sluzba';
    case 'region': return `#/sluzba/${encodeURIComponent(route.region)}`;
    case 'station': return `#/stacja/${encodeURIComponent(route.id)}`;
    default: return '#/';
  }
}

/** Ekran nadrzędny (przycisk „wstecz”, Esc): stacja → region (albo służba), region / lista / mapa → tytuł. */
export function parentRoute(route, stations = []) {
  if (route.view === 'station') {
    const st = stations.find((s) => s.id === route.id);
    return st?.region ? { view: 'region', region: st.region } : { view: 'service', mode: 'map' };
  }
  if (route.view === 'region') return { view: 'service', mode: 'map' };
  if (route.view === 'training' && route.mission) return { view: 'training' };
  return { view: 'title' };
}

// --- schemat regionu ----------------------------------------------------------------------------------------------

/** Kolejność punktów wzdłuż linii: rzut na kierunek główny (największa wariancja) – linie w regionie są „proste”. */
export function lineOrder(points) {
  if (points.length < 3) return [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  const mx = points.reduce((s, p) => s + p.x, 0) / points.length, my = points.reduce((s, p) => s + p.y, 0) / points.length;
  let sxx = 0, syy = 0, sxy = 0;
  for (const p of points) { const dx = p.x - mx, dy = p.y - my; sxx += dx * dx; syy += dy * dy; sxy += dx * dy; }
  const angle = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  const ux = Math.cos(angle), uy = Math.sin(angle);
  return [...points].sort((a, b) => (a.x - mx) * ux + (a.y - my) * uy - ((b.x - mx) * ux + (b.y - my) * uy));
}

/**
 * Schemat regionu: węzły (stacje z `geo`, rzutowane `project([lat, lon]) → [x, y]`) i odcinki między kolejnymi
 * stacjami tej samej linii (linia w co najmniej dwóch stacjach). Odcinek wspólny kilku linii jest jeden, z ich numerami.
 */
export function regionLayout(stations, project) {
  const nodes = stations.filter((st) => st.geo).map((st) => { const [x, y] = project(st.geo); return { id: st.id, x, y, lines: st.lines || [] }; });
  const byLine = new Map();
  for (const n of nodes) for (const l of n.lines) { if (!byLine.has(l)) byLine.set(l, []); byLine.get(l).push(n); }
  const segs = new Map();
  for (const [line, pts] of [...byLine].sort((a, b) => a[0] - b[0])) {
    if (pts.length < 2) continue;
    const order = lineOrder(pts);
    for (let i = 1; i < order.length; i++) {
      const [a, b] = [order[i - 1].id, order[i].id].sort();
      const key = `${a}|${b}`;
      if (!segs.has(key)) segs.set(key, { a, b, lines: [] });
      segs.get(key).lines.push(line);
    }
  }
  return { nodes: nodes.map(({ id, x, y }) => ({ id, x, y })), segments: [...segs.values()] };
}

// --- postęp gracza ------------------------------------------------------------------------------------------------

/** Oceny od najsłabszej (Score.js – `grade`). */
export const GRADES = ['niedostatecznie', 'dostatecznie', 'dobrze', 'wzorowo'];

/** Lepszy z dwóch wyników: wyższa ocena, przy równej – więcej punktów. */
export function better(a, b) {
  if (!a) return b; if (!b) return a;
  const d = GRADES.indexOf(b.grade) - GRADES.indexOf(a.grade);
  return d > 0 || (d === 0 && (b.total ?? 0) > (a.total ?? 0)) ? b : a;
}

/**
 * Zapis wyniku zmiany (nowy obiekt, wejście bez zmian): `stations[stacja][scenariusz]` – najlepszy wynik;
 * misja (samouczek) – `missions["stacja/scenariusz"] = true`.
 */
export function recordResult(progress, { station, scenario, grade, total, mission = false }) {
  const p = { stations: { ...(progress?.stations || {}) }, missions: { ...(progress?.missions || {}) } };
  if (mission) { p.missions[`${station}/${scenario}`] = true; return p; }
  if (!GRADES.includes(grade)) return p;
  const st = { ...(p.stations[station] || {}) };
  st[scenario] = better(st[scenario], { grade, total });
  p.stations[station] = st;
  return p;
}

/** Najlepszy wynik na stacji (ze wszystkich zmian) albo null. */
export function bestResult(progress, stationId) {
  return Object.values(progress?.stations?.[stationId] || {}).reduce((acc, r) => better(acc, r), null);
}

export function played(progress, stationId) {
  return !!bestResult(progress, stationId);
}

export function missionDone(progress, stationId, scenarioId) {
  return !!progress?.missions?.[`${stationId}/${scenarioId}`];
}
