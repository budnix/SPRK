import { Simulation, EXTRA_TRAIN, extraTrainShifts } from './Simulation.js';
import { validateStation, validateTimetable } from './validate.js';
import { FAULTS, FAULT_TYPES } from './faults/types.js';
import { LATE_SLACK } from './Traffic.js';
import { trainSpeed } from './rollingStock.js';
import { entryPath as findEntryPath, exitPath as findExitPath, routeEndTrack, entryRoutes } from './trainPaths.js';
import { Clock } from '../core/Clock.js';
import { DISRUPTION_LEVELS } from '../core/Random.js';
import { hasSrk } from '../srk/registry.js';

/**
 * Statyczne sprawdzenie scenariusza – błędy definicji, które widać bez grania zmiany (docs/STATION-FORMAT.md,
 * „Scenariusze”, „Rozkład jazdy”, „Zadania manewrowe”). Najpierw `validateStation` (stacja), potem okno zmiany,
 * podzbiór i własny rozkład scenariusza, pociągi, których nie da się obsłużyć, kierunek jazdy, zadania, usterki
 * i zamknięcia torów wskazujące nieistniejące elementy, rozkład za gęsty dla szlaku (wjazdy i wyjazdy).
 *
 * Kontrole czytają symulację utworzoną bez ani jednego kroku (rozkład z czasami w sekundach, odcinki, przebiegi,
 * blokady po normalizacji) – tak samo, jak scenariusz zobaczy gra. Łańcuchy przebiegów – te same co w automacie
 * dyżurnego i w ruchu (`trainPaths.js`).
 *
 * Wynik: lista `{ level: 'error' | 'warning' | 'info', code, msg, train? }`.
 *  - `error` – pociąg albo zadanie nie do obsłużenia, kara pewna albo pole po cichu pomijane (scenariusz nie sprawdza
 *    tego, co zapisano): do poprawy przed dodaniem scenariusza,
 *  - `warning` – ryzyko opóźnień lub kar na poziomie scenariusza (bez zakłóceń albo wymuszonym), rzeczy nietypowe,
 *  - `info` – odporność na zakłócenia poziomu wybieranego przez gracza i ograniczenia silnika / automatu: wypisywane,
 *    ale nie zmieniają oceny scenariusza.
 * `msg` po polsku, z pociągiem / torem / godziną; `train` – numer pociągu, którego dotyczy.
 *
 * Moduł logiki: bez DOM i bez importów spoza modelu – listę misji samouczka (`src/tutorial/missions.js`) podaje
 * wywołujący (`opts.missions`: identyfikatory misji); bez niej pole `tutorial` nie jest sprawdzane.
 * `opts.levels` (albo `opts.level`) – poziomy zakłóceń, na których scenariusz będzie grany (zapas na opóźnienia od
 * sąsiada, pociągi nadzwyczajne); scenariusz z własnym `disruptions` ma pierwszeństwo.
 */

/** Pola scenariusza z docs/STATION-FORMAT.md – inne to zwykle literówka (pole po cichu pomijane). */
export const SCENARIO_KEYS = ['id', 'name', 'description', 'trains', 'timetable', 'startTime', 'endTime', 'faults', 'faultWeights', 'closedSections', 'disruptions', 'tasks', 'tutorial', 'srk'];

/** Granica „pociąg mieści się w zmianie” – jedna dla oceny, kontroli definicji i werdyktu przebiegu (`Traffic.js`). */
export { LATE_SLACK };
/** Zapas planu (min) przy poziomie zakłóceń: najdłuższe opóźnienie od sąsiada + czas na wyjazd ze stacji. */
export function levelSlackMin(levelId) {
  return (DISRUPTION_LEVELS[levelId]?.delayMax ?? 0) + LATE_SLACK / 60;
}
/** Opóźnienie wynikające z samego planu, od którego jest uwaga (min): od 2 min kara za przetrzymanie (late-depart). */
const PLAN_DELAY_MIN = 2;
/** Skład na następcę (`unit`): mniej minut między przyjazdem a odjazdem – uwaga (przekazanie, zmiana czoła). */
const UNIT_TURN_MIN = 3;
/** Poza oknem: termin zadania i jego zapas po terminie (Traffic: przepada 10 min po terminie). */
export const TASK_GRACE = 10 * 60;
/** Usterka bez `duration` trwa 10 min (Faults.#normalize). */
const FAULT_DEFAULT_MIN = 10;

const TIME_RE = /^([01]?\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;
// godziny 24–47: następna doba w zmianie przez północ („25:10” = 01:10 następnego dnia; `Clock.stamp`) – dozwolone tylko
// w scenariuszu, którego `endTime` jest po północy; w zwykłej zmianie „26:15” to literówka
const LATE_RE = /^(2[4-9]|3\d|4[0-7]):[0-5]\d(:[0-5]\d)?$/;
const isLate = (v) => typeof v === 'string' && LATE_RE.test(v);
const hm = (s) => (Number.isFinite(s) ? Clock.format(s) : String(s));
const mins = (s) => Math.ceil(s / 60);
const same = (a, b) => String(a) === String(b);

/** Odległość edycyjna (Levenshtein) – podpowiedź pola przy literówce. */
function editDistance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  }
  return d[a.length][b.length];
}

/** Najbliższe pole scenariusza (bez rozróżniania wielkości liter, odległość ≤ 2) albo null. */
export function nearestKey(key) {
  let best = null, bd = 3;
  for (const k of SCENARIO_KEYS) {
    const dist = editDistance(String(key).toLowerCase(), k.toLowerCase());
    if (dist < bd) { bd = dist; best = k; }
  }
  return best;
}

/**
 * Tory osiągalne przebiegami manewrowymi z toru `from` (warunek konieczny drogi manewru: graf torów po przebiegach
 * manewrowych, bez kierunku i zmiany czoła). `ilk` – zależności symulacji.
 */
export function shuntReach(ilk, from) {
  const trackOfSec = (sid) => { const t = ilk.sections.get(sid)?.track; return t == null ? null : String(t); };
  const node = (sid) => trackOfSec(sid) ?? `#${sid}`;
  const adj = new Map();
  const link = (a, b) => { if (!a || !b || a === b) return; for (const [p, q] of [[a, b], [b, a]]) { if (!adj.has(p)) adj.set(p, new Set()); adj.get(p).add(q); } };
  for (const r of ilk.routeList()) if (r.kind === 'shunt') { let p = node(r.approach); for (const s of r.sections) { link(p, node(s)); p = node(s); } }
  const seen = new Set([String(from)]); const q = [String(from)];
  while (q.length) { const n = q.shift(); for (const m of adj.get(n) || []) if (!seen.has(m)) { seen.add(m); q.push(m); } }
  return seen;
}

export function checkScenario(station, scenarioRef, opts = {}) {
  const out = [];
  // `extra` – dane ustalenia dla programów (np. `pair` i `with` przy konflikcie dwóch pociągów), nie dla człowieka
  const add = (level, code, msg, train, extra = null) => out.push({ ...(train != null ? { level, code, msg, train } : { level, code, msg }), ...extra });
  const error = (code, msg, train, extra) => add('error', code, msg, train, extra);
  const warn = (code, msg, train, extra) => add('warning', code, msg, train, extra);
  const info = (code, msg, train, extra) => add('info', code, msg, train, extra);
  // ---- stacja: niepoprawna definicja – symulacja nie wystartuje; każdy błąd osobno, z treścią ----
  const sv = validateStation(station);
  if (sv.errors.length) {
    for (const e of sv.errors) error('station-invalid', `Definicja stacji ${station?.id ?? '?'}: ${e}`);
    return out;
  }
  const list = station.scenarios || [];
  // ---- scenariusz: istnienie i kształt ----
  if (typeof scenarioRef === 'string' && !list.some((x) => x.id === scenarioRef)) {
    error('sc-unknown-id', `Scenariusz „${scenarioRef}” nie istnieje na stacji ${station.id} – gra zaczęłaby zamiast niego ${list[0] ? `„${list[0].id}”` : 'zmianę domyślną'}`);
    return out;
  }
  const sc = typeof scenarioRef === 'string' ? list.find((x) => x.id === scenarioRef) : scenarioRef;
  if (!sc || typeof sc !== 'object') { error('sc-unknown-id', 'Brak scenariusza'); return out; }
  if (typeof scenarioRef === 'string') {
    const n = list.filter((x) => x.id === sc.id).length;
    if (n > 1) error('sc-dup-id', `Identyfikator scenariusza „${sc.id}” powtórzony ${n}× – gra i przegląd widzą tylko pierwszy`);
  }
  for (const k of Object.keys(sc)) {
    if (SCENARIO_KEYS.includes(k)) continue;
    const near = nearestKey(k);
    error('sc-unknown-key', `Nieznane pole scenariusza „${k}”${near ? ` – literówka? chodzi o „${near}”` : ''}; gra je pomija (scenariusz nie ma tego, co zapisano). Pola: ${SCENARIO_KEYS.join(', ')}`);
  }
  // listy scenariusza – inny kształt wywraca grę albo jest po cichu pomijany
  const notList = ['trains', 'timetable', 'faults', 'closedSections', 'tasks'].filter((k) => sc[k] != null && !Array.isArray(sc[k]));
  for (const k of notList) error('sc-shape', `${k}: ${JSON.stringify(sc[k])} – lista (tablica) w nawiasach [ ]`);
  if (notList.length) return out;
  if (sc.disruptions != null && !Object.hasOwn(DISRUPTION_LEVELS, sc.disruptions)) error('sc-disruptions', `disruptions: „${sc.disruptions}” – nieznany poziom zakłóceń (none, low, high); gra przyjmie „none”`);
  if (sc.tutorial != null && opts.missions && !new Set(opts.missions).has(sc.tutorial)) error('sc-tutorial', `tutorial: „${sc.tutorial}” – nie ma takiej misji (${[...opts.missions].join(', ')}); zmiana nie skończy się sama po ostatnim pociągu`);
  if (sc.srk != null && !hasSrk(sc.srk)) error('sc-srk', `srk: „${sc.srk}” – nieznany system srk`);
  // wagi losowania usterek: rodzaj, który się losuje → liczba ≥ 0
  if (sc.faultWeights != null) {
    if (typeof sc.faultWeights !== 'object' || Array.isArray(sc.faultWeights)) error('sc-fault-weights', `faultWeights: ${JSON.stringify(sc.faultWeights)} – obiekt { rodzaj: waga }`);
    else for (const [k, v] of Object.entries(sc.faultWeights)) {
      if (!FAULT_TYPES.includes(k)) error('sc-fault-weights', `faultWeights: nieznany rodzaj usterki „${k}” (${FAULT_TYPES.join(', ')})`);
      if (!(typeof v === 'number' && v >= 0)) error('sc-fault-weights', `faultWeights.${k}: „${v}” – waga to liczba ≥ 0`);
    }
  }
  // zmiana przez północ: `endTime` po 24:00 – wtedy godziny rozkładu, zadań, usterek i zamknięć też mogą być po 24:00
  const overnight = isLate(sc.endTime);
  const isTime = (v) => typeof v === 'string' && (TIME_RE.test(v) || (overnight && LATE_RE.test(v)));
  let badTime = false;
  for (const k of ['startTime', 'endTime']) if (sc[k] != null && !(isTime(sc[k]) || (k === 'endTime' && isLate(sc[k])))) { error('sc-time', `${k}: „${sc[k]}” – czas w formacie GG:MM (zegar zmiany stanąłby na NaN)`); badTime = true; }
  if (badTime) return out;
  const start = Clock.parse(sc.startTime ?? station.startTime ?? '06:00');
  const end = sc.endTime ? Clock.parse(sc.endTime) : null;
  if (end != null && end <= start) error('sc-window', `endTime ${sc.endTime} nie później niż start ${hm(start)} – zmiana skończy się w pierwszym kroku; zmiana przez północ ma godziny następnej doby po 24:00 (01:00 → endTime: '25:00')`);
  // godziny w nazwie („Pełna zmiana (05:55–08:15)”) – gracz wybiera zmianę po nazwie, więc mają się zgadzać z oknem
  const named = typeof sc.name === 'string' ? /(\d{1,2}:\d{2})\s*[–—-]\s*(\d{1,2}:\d{2})/.exec(sc.name) : null;
  if (named && end != null) {
    // w nazwie godziny jak na zegarze – zmiana przez północ kończy się w danych po 24:00
    const [from, to] = [named[1], named[2]].map((x) => Clock.parse(x) % 86400);
    if (from !== start % 86400 || to !== end % 86400) warn('sc-name-window', `Nazwa „${sc.name}” podaje godziny ${named[1]}–${named[2]}, a zmiana trwa ${hm(start)}–${hm(end)} – popraw nazwę albo startTime / endTime`);
  }
  if (sc.trains && sc.timetable) error('sc-trains-ignored', 'trains i timetable naraz – gra bierze timetable, a trains pomija');
  if (sc.trains && !sc.timetable) {
    const nrs = new Set((station.timetable || []).map((t) => t.nr));
    for (const n of sc.trains) {
      if (nrs.has(n)) continue;
      const other = (station.timetable || []).some((t) => String(t.nr) === String(n));
      error('sc-trains-unknown', other ? `trains: ${JSON.stringify(n)} – w rozkładzie stacji numer jest liczbą (${n}); pociąg zostałby pominięty` : `trains: ${n} – nie ma takiego pociągu w rozkładzie stacji`, n);
    }
    if (new Set(sc.trains).size !== sc.trains.length) warn('sc-trains-dup', 'trains: powtórzony numer pociągu');
  }
  if (sc.timetable) {
    // stacja jest poprawna – błędy dotyczą rozkładu scenariusza; uwagi (np. pociąg dłuższy niż tor) – tylko dla wpisów
    // innych niż w rozkładzie stacji (te sprawdza walidacja stacji)
    const v = validateTimetable(station, sc.timetable);
    for (const e of v.errors) error('sc-timetable-invalid', `timetable scenariusza: ${e}`);
    const own = new Set(station.timetable || []);
    for (const e of sc.timetable) {
      if (own.has(e)) continue;
      for (const w of validateTimetable(station, sc.timetable, new Set([e])).warnings) warn('sc-timetable-warning', `timetable scenariusza: ${w}`, e.nr);
    }
  }
  if (out.some((x) => x.level === 'error' && x.code === 'sc-timetable-invalid')) return out;
  // ---- poziomy zakłóceń, na których scenariusz będzie grany ----
  const forced = sc.disruptions && Object.hasOwn(DISRUPTION_LEVELS, sc.disruptions) ? sc.disruptions : null;
  const levels = forced ? [forced] : (opts.levels ?? (opts.level ? [opts.level] : [])).filter((l) => Object.hasOwn(DISRUPTION_LEVELS, l));
  // zakłócenia wymuszone scenariuszem należą do zamysłu autora (uwaga), wybierane przez gracza – odporność (informacja)
  const levelNote = forced ? warn : info;
  // ---- symulacja bez kroku: rozkład, odcinki, przebiegi, blokady jak w grze ----
  let sim;
  try {
    // bez losowych zakłóceń: opóźnienia od sąsiada przesunęłyby czasy planu, a usterki losowe nie należą do scenariusza
    sim = new Simulation(station, { scenario: { ...sc, disruptions: 'none' }, disruptions: 'none', seed: 1 });
  } catch (err) {
    error('sim-throws', `Symulacja nie startuje: ${String(err?.message ?? err).replace(/\n+/g, '; ')}`);
    return out;
  }
  const ilk = sim.ilk, topo = ilk.topo;
  const tt = sim.traffic.timetable();
  const exits = sim.station.exits || {};
  const exitName = (id) => `${exits[id]?.name ?? id} (${id})`;
  if (!tt.length) error('tt-empty', `Pusty rozkład zmiany – scenariusz bez ruchu niczego nie sprawdza${end == null ? '; bez endTime zmiana nie skończy się nigdy' : ''}`);
  else if (end == null && !sc.tutorial) warn('sc-no-end', 'Brak endTime – zmiana kończy się dopiero po obsłużeniu wszystkich pociągów (bez raportu o czasie)');
  // tory stacji: numer toru → odcinki
  const tracks = new Map();
  for (const s of ilk.sections.values()) if (s.track != null) { const k = String(s.track); if (!tracks.has(k)) tracks.set(k, []); tracks.get(k).push(s); }
  const allRoutes = ilk.routeList();
  const trainRoutes = allRoutes.filter((r) => r.kind === 'train');
  const shuntRoutes = allRoutes.filter((r) => r.kind === 'shunt');
  const trackOfSec = (sid) => { const t = ilk.sections.get(sid)?.track; return t == null ? null : String(t); };
  const routeTrack = (r) => routeEndTrack(ilk, r) || null;
  const avoids = (closed) => (r) => !closed || !r.sections.some((s) => closed.has(s));
  // wjazd jak w automacie dyżurnego, wyjazd jak w ruchu (`trainPaths.js`): do 3 przebiegów pociągowych
  const entryPath = (from, T, closed = null) => {
    const ok = avoids(closed);
    const routes = trainRoutes.filter(ok);
    return findEntryPath(ilk, routes, entryRoutes(ilk, from, routes), T);
  };
  const exitPath = (T, to, closed = null) => findExitPath(ilk, trainRoutes.filter(avoids(closed)), T, to);
  const isDir = (d) => d === 'E' || d === 'W';
  // ---- wpisy rozkładu zmiany ----
  const count = new Map();
  for (const e of tt) count.set(String(e.nr), (count.get(String(e.nr)) || 0) + 1);
  for (const [k, n] of count) if (n > 1) error('tt-dup-nr', `Numer pociągu ${k} ${n}× w rozkładzie zmiany – skład (unit), zadania i rozkazy trafią zawsze do pierwszego`, k);
  const find = (nr) => tt.find((x) => same(x.nr, nr));
  const successors = (e) => tt.filter((x) => x.unit != null && same(x.unit, e.nr));
  const startOnAt = new Map();
  let lastEvent = null;
  for (const e of tt) {
    const w = `Pociąg ${e.nr}`;
    // zapis z definicji (`e.source`) – wpis rozkładu pokazuje godziny po północy już jak na zegarze (`shownTime`)
    const def = e.source;
    for (const k of ['arr', 'dep']) if (def[k] != null && !isTime(def[k])) error('tt-time', `${w}: ${k} „${def[k]}” – czas w formacie GG:MM${isLate(def[k]) ? ' (godziny po 24:00 tylko w zmianie przez północ: endTime po 24:00)' : ''}`, e.nr);
    if (e.arrTime != null && e.depTime != null && e.depTime < e.arrTime) error('tt-dep-before-arr', `${w}: odjazd ${e.dep} przed przyjazdem ${e.arr} – punktualności nie da się ocenić`, e.nr);
    if (!e.from && !e.startOn && e.unit == null) error('tt-no-spawn', `${w}: bez from, startOn i unit – pociąg nigdy nie powstanie`, e.nr);
    if (e.from && e.startOn) warn('tt-startOn-ignored', `${w}: startOn przy from „${e.from}” – pociąg przyjedzie od sąsiada, startOn jest pomijane`, e.nr);
    if (e.from && e.unit != null) warn('tt-unit-and-from', `${w}: unit i from naraz – pociąg powstanie od sąsiada, a skład ${e.unit} też go utworzy`, e.nr);
    // kierunek jazdy: pociąg nie zmienia czoła – wjazd i wyjazd po tej samej stronie stacji to nawrót
    if (e.from && e.to && exits[e.from] && exits[e.to] && isDir(exits[e.from].dir) && exits[e.from].dir === exits[e.to].dir) {
      error('tt-turnback', `${w}: wjeżdża od ${exitName(e.from)} i wyjeżdża do ${exitName(e.to)} po tej samej stronie stacji (${exits[e.to].dir}) – pociąg nie zmienia czoła; nawrót to pociąg kończący bieg (terminates) i pociąg ze składu (unit)`, e.nr);
    }
    if (!e.from && e.startOn) {
      const s = ilk.sections.get(e.startOn.section);
      if (!s) error('tt-startOn-section', `${w}: startOn.section „${e.startOn.section}” – nie ma takiego odcinka, pociąg się nie pojawi`, e.nr);
      else {
        if (!isDir(e.startOn.dir)) error('tt-startOn-dir', `${w}: startOn.dir „${e.startOn.dir}” – kierunek E albo W`, e.nr);
        else if (e.to && exits[e.to] && isDir(exits[e.to].dir) && e.startOn.dir !== exits[e.to].dir) {
          error('tt-startOn-dir-exit', `${w}: stoi czołem na ${e.startOn.dir} (startOn.dir), a wyjazd do ${exitName(e.to)} jest na ${exits[e.to].dir} – pociąg nie zmienia czoła i nie odjedzie; startOn.dir: '${exits[e.to].dir}'`, e.nr);
        }
        if ((e.length ?? 100) > (s.length ?? 0)) warn('tt-startOn-long', `${w}: ${e.length ?? 100} m na odcinku ${s.id} (${s.length ?? '?'} m) – wystaje na sąsiednie odcinki`, e.nr);
        if (startOnAt.has(s.id)) error('tt-startOn-twice', `${w}: stoi na odcinku ${s.id} razem z pociągiem ${startOnAt.get(s.id)}`, e.nr);
        startOnAt.set(s.id, e.nr);
        if (e.track != null && s.track != null && String(s.track) !== String(e.track)) warn('tt-startOn-track', `${w}: stoi na torze ${s.track}, a w rozkładzie tor ${e.track}`, e.nr);
      }
      if (e.depTime != null && e.depTime < start) error('tt-before-start', `${w}: stoi od początku zmiany, a odjazd ${e.dep} jest przed startem ${hm(start)} – odjedzie z opóźnieniem`, e.nr);
    }
    if (!e.to && !e.terminates && !successors(e).length) error('tt-never-done', `${w}: bez to, terminates i pociągu ze składu (unit) – nigdy nie będzie obsłużony`, e.nr);
    if (e.unit != null) {
      const u = find(e.unit);
      if (!u) {
        const inStation = (station.timetable || []).some((t) => same(t.nr, e.unit));
        error('tt-unit-missing', `${w}: skład z pociągu ${e.unit}, którego nie ma w rozkładzie zmiany${inStation && sc.trains ? ' (dopisz go do trains)' : ''} – pociąg nie powstanie`, e.nr);
      } else {
        if (u.to && !u.terminates) warn('tt-unit-source-continues', `${w}: skład z pociągu ${u.nr}, który jedzie dalej (do ${u.to})`, e.nr);
        const ready = u.arrTime ?? (u.startOn ? start : null);
        if (ready != null && e.depTime != null && ready + UNIT_TURN_MIN * 60 > e.depTime) {
          const gap = Math.round((e.depTime - ready) / 60);
          (ready > e.depTime ? error : warn)('tt-unit-late', `${w}: skład ${u.nr} przyjeżdża ${u.arr ?? hm(ready)}, odjazd ${e.dep} (${gap} min) – ${ready > e.depTime ? 'odjazd przed przyjazdem składu, kara late-depart pewna' : 'za mało czasu na przekazanie składu'}`, e.nr);
        }
        const sibs = successors(u);
        if (sibs.length > 1 && sibs[0] === e) error('tt-unit-twice', `Skład pociągu ${u.nr} ma ${sibs.length} następców (${sibs.map((x) => x.nr).join(', ')}) – powstanie tylko pierwszy`, sibs[1].nr);
      }
      if (e.depTime == null) warn('tt-unit-no-dep', `${w}: pociąg ze składu bez dep – odjedzie zaraz po przekazaniu`, e.nr);
    }
    // tor planowy i przebiegi do niego
    const T = e.track != null ? String(e.track) : null;
    if (T != null && !tracks.has(T)) (e.stop ? error : warn)('tt-track-unknown', `${w}: tor „${e.track}” nie istnieje (żaden odcinek nie ma track: '${e.track}')${e.stop ? ' – kara za inny tor pewna' : ''}`, e.nr);
    if (T != null && tracks.has(T)) {
      if (e.from && exits[e.from] && !entryPath(e.from, T)) (e.stop ? error : warn)('tt-no-entry-route', `${w}: brak przebiegu pociągowego od ${exitName(e.from)} na tor ${T}${e.stop ? ' – automat przyjmie go na inny tor, kara pewna' : ''}`, e.nr);
      if (e.to && exits[e.to] && !exitPath(T, e.to)) (e.stop ? error : warn)('tt-no-exit-route', `${w}: brak przebiegu pociągowego z toru ${T} na szlak do ${exitName(e.to)}${e.stop ? ' – kara za inny tor pewna' : ''}`, e.nr);
      if (e.stop && !e.terminates && !tracks.get(T).some((s) => s.platform)) warn('tt-stop-no-platform', `${w}: postój na torze ${T} bez peronu – pociąg nie zatrzyma się planowo`, e.nr);
    }
    if (T == null && (e.from || e.to)) warn('tt-no-track', `${w}: bez toru planowego (track) – kara za inny tor nie działa, automat przyjmie na dowolny`, e.nr);
    // okno zmiany
    const ref = e.arrTime ?? e.depTime;
    if (e.from && Number.isFinite(ref)) {
      if (ref < start) {
        const late = Number.isFinite(e.neighbourDep) ? mins(start - e.neighbourDep) : null;
        error('tt-before-start', `${w}: ${e.arr ? 'przyjazd' : 'przejazd'} ${e.arr ?? e.dep} przed startem zmiany ${hm(start)} – sąsiad wyprawi go dopiero na starcie, przyjedzie${late != null ? ` ok. ${late} min` : ''} po planie (wypadnie z punktualności, bez +5 za punktualny odjazd); usuń go z trains albo przesuń start`, e.nr);
      } else if (e.neighbourDep < start && mins(start - e.neighbourDep) >= PLAN_DELAY_MIN) warn('tt-tight-start', `${w}: sąsiad musiałby go wyprawić o ${hm(e.neighbourDep)}, przed startem ${hm(start)} – ok. ${mins(start - e.neighbourDep)} min opóźnienia z samego planu`, e.nr);
    }
    // koniec zmiany: pociąg odjeżdżający musi zdążyć zjechać ze stacji (LATE_SLACK), kończący bieg – przyjechać
    const last = Math.max(e.arrTime ?? -Infinity, e.depTime ?? -Infinity);
    if (end != null && Number.isFinite(last)) {
      if (last >= end) error('tt-after-end', `${w}: ${e.dep ?? e.arr} nie przed końcem zmiany ${sc.endTime} – nie zdąży, kara „nieobsłużony” pewna`, e.nr);
      else if (e.to && end - last < LATE_SLACK) error('tt-after-end', `${w}: odjazd ${e.dep ?? e.arr}, koniec zmiany ${sc.endTime} – ${Math.round((end - last) / 60)} min to za mało na wyjazd ze stacji (potrzeba co najmniej ${LATE_SLACK / 60} min); kara „nieobsłużony” pewna`, e.nr);
    }
    if (Number.isFinite(last) && (lastEvent == null || last > lastEvent.time)) lastEvent = { time: last, nr: e.nr };
  }
  // zapas na opóźnienia od sąsiada – na każdym poziomie, na którym scenariusz będzie grany (ta sama reguła co
  // `late-inbound` w przebiegu: opóźnienie poziomu + czas na wyjazd ze stacji)
  if (end != null && lastEvent && lastEvent.time < end) {
    const slack = Math.floor((end - lastEvent.time) / 60);
    for (const L of levels) {
      const need = levelSlackMin(L);
      if (!DISRUPTION_LEVELS[L].delayMax || slack >= need) continue;
      levelNote('sc-slack', `Ostatnie zdarzenie rozkładu (pociąg ${lastEvent.nr}, ${hm(lastEvent.time)}) ${slack} min przed końcem zmiany ${sc.endTime}; przy poziomie ${L} (opóźnienie od sąsiada do ${DISRUPTION_LEVELS[L].delayMax} min) potrzeba ${need} min – pociągi opóźnione bardziej nie zdążą (bez kary, ale zmiana kończy się bez ich obsługi)`, lastEvent.nr);
    }
  }
  // ---- konflikty planu: ten sam tor, ten sam szlak ----
  const taskDefs = sc.tasks || station.tasks || [];
  const tasksOf = (nr) => taskDefs.filter((k) => same(k.unit, nr));
  const occ = [], passes = [];
  for (const e of tt) {
    if (e.track == null) continue;
    let a = e.arrTime ?? (e.startOn ? start : null);
    let b = e.depTime ?? null;
    // przedziały najkrótsze możliwe (zgłaszane tylko nakładania nieuniknione): skład kończący bieg zajmuje tor do
    // odjazdu następcy albo do odstawienia (zadanie zaraz po przyjeździe), następca – od podstawienia w terminie
    if (e.terminates || !e.to) {
      b = successors(e)[0]?.depTime ?? b ?? end;
      const k = tasksOf(e.nr)[0];
      if (k && String(k.toTrack) !== String(e.track) && a != null) b = Math.max(a + 5 * 60, k.after ? Clock.parse(k.after) : 0);
    }
    if (e.unit != null) { const ks = tasksOf(e.unit); a = ks.length ? Clock.parse(ks.at(-1).deadline) : (find(e.unit)?.arrTime ?? a); }
    // przelot zajmuje tor chwilę – sprawdzany niżej tylko wobec postojów
    if (!e.stop && !e.startOn && e.unit == null) { if (Number.isFinite(e.arrTime)) passes.push({ e, T: String(e.track), t: e.arrTime }); continue; }
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
    occ.push({ e, T: String(e.track), a, b });
  }
  // przelot w czasie postoju innego pociągu na tym torze (np. skład na zmianę czoła stoi od przyjazdu do odjazdu następcy)
  // nie przejedzie – pójdzie innym torem albo poczeka
  for (const p of passes) {
    const x = occ.find((o) => o.T === p.T && o.a < p.t && p.t < o.b);
    if (x) warn('tt-track-overlap', `Tor ${p.T}: przelot ${p.e.nr} (${hm(p.t)}) w czasie postoju ${x.e.nr} (${hm(x.a)}–${hm(x.b)}) – pojedzie innym torem (kara) albo poczeka`, p.e.nr, { pair: true, with: x.e.nr });
  }
  for (let i = 0; i < occ.length; i++) for (let j = i + 1; j < occ.length; j++) {
    const x = occ[i], y = occ[j];
    if (x.T !== y.T) continue;
    if ((y.e.unit != null && same(y.e.unit, x.e.nr)) || (x.e.unit != null && same(x.e.unit, y.e.nr))) continue;
    const ov = Math.min(x.b, y.b) - Math.max(x.a, y.a);
    if (ov > 0) warn('tt-track-overlap', `Tor ${x.T}: pociągi ${x.e.nr} (${hm(x.a)}–${hm(x.b)}) i ${y.e.nr} (${hm(y.a)}–${hm(y.b)}) w planie naraz (${Math.round(ov / 60)} min) – jeden pójdzie na inny tor (kara) albo poczeka`, y.e.nr, { pair: true, with: x.e.nr });
  }
  const blockKind = (b) => (b.auto ? 'SBL' : b.fixed ? 'Eap jednokierunkowa' : 'Eap');
  // pociąg zwalnia szlak po ok. minucie wyjazdu ze stacji i przejeździe po szlaku (szlak to jeden odstęp – także SBL:
  // odstęp zwalnia się, gdy pociąg dojedzie do sąsiada)
  const lineClear = (e, ex, at) => at + 60 + (exits[ex].lineLength ?? 3000) / (Math.min(trainSpeed(e, e.rollingStock), exits[ex].lineSpeed ?? 100) / 3.6);
  for (const ex of Object.keys(exits)) {
    const b = sim.blocks.get(ex);
    if (!b) continue;
    // wjazdy: sąsiad wyprawia następny pociąg, gdy poprzedni zjechał ze szlaku
    const ins = tt.filter((e) => e.from === ex && Number.isFinite(e.neighbourDep)).sort((p, q) => p.requestAt - q.requestAt);
    for (let i = 1; i < ins.length; i++) {
      const A = ins[i - 1], B = ins[i];
      const aIn = (A.arrTime ?? A.depTime) - A.entryRun; // czoło A na granicy stacji (jazda do toru z układu – `entryRun`)
      const lag = mins(aIn - B.neighbourDep);
      if (B.neighbourDep < aIn && lag >= (B.stop ? PLAN_DELAY_MIN : 3)) {
        warn('line-headway', `Szlak od ${exitName(ex)}, ${blockKind(b)}: pociąg ${B.nr}${B.stop ? '' : ' (przelot)'} musiałby wyjechać od sąsiada o ${hm(B.neighbourDep)}, zanim ${A.nr} zjedzie ze szlaku (${hm(aIn)}) – ok. ${lag} min opóźnienia z samego planu`, B.nr, { pair: true, with: A.nr });
      }
    }
    // wyjazdy: następny pociąg na ten szlak dopiero, gdy poprzedni go zwolni
    const outs = tt.filter((e) => e.to === ex && Number.isFinite(e.depTime ?? e.arrTime)).sort((p, q) => (p.depTime ?? p.arrTime) - (q.depTime ?? q.arrTime));
    for (let i = 1; i < outs.length; i++) {
      const A = outs[i - 1], B = outs[i];
      const ad = A.depTime ?? A.arrTime, bd = B.depTime ?? B.arrTime;
      const clear = lineClear(A, ex, ad);
      const lag = mins(clear - bd);
      const pass = !B.stop && !!B.from;
      if (bd < clear && lag >= (pass ? 3 : PLAN_DELAY_MIN)) {
        warn('line-headway-out', `Szlak do ${exitName(ex)}, ${blockKind(b)}: pociąg ${B.nr}${pass ? ' (przelot)' : ''} odjeżdża ${hm(bd)}, zanim ${A.nr} (odjazd ${hm(ad)}) zwolni szlak (ok. ${Clock.format(clear, true)}) – ok. ${lag} min opóźnienia z samego planu`, B.nr, { pair: true, with: A.nr });
      }
    }
    if (b.fixed) continue;
    // szlak dwukierunkowy (Eap): nasz wyjazd w czasie, gdy sąsiad ma już wyprawić pociąg do nas
    for (const o of tt.filter((e) => e.to === ex)) {
      const od = o.depTime ?? o.arrTime;
      if (!Number.isFinite(od)) continue;
      const oEnd = lineClear(o, ex, od);
      for (const i of tt.filter((e) => e.from === ex && Number.isFinite(e.neighbourDep))) {
        const iEnd = (i.arrTime ?? i.depTime) - 60;
        const ov = Math.min(oEnd, iEnd) - Math.max(od, i.neighbourDep);
        if (ov >= PLAN_DELAY_MIN * 60) warn('line-opposing', `Szlak ${exitName(ex)}, ${blockKind(b)}: wyjazd ${o.nr} (${hm(od)}–${hm(oEnd)}) i wjazd ${i.nr} od sąsiada (${hm(i.neighbourDep)}–${hm(iEnd)}) naprzeciw – ${Math.round(ov / 60)} min; jeden poczeka`, i.nr, { pair: true, with: o.nr });
      }
    }
  }
  // ---- zamknięcia torów (do zadań i pociągów niżej) ----
  const closures = [];
  for (const c of sc.closedSections || []) {
    if (!ilk.sections.has(c.section)) continue;
    if ((c.from != null && !isTime(c.from)) || (c.to != null && !isTime(c.to))) continue;
    closures.push({ section: c.section, from: c.from ? Clock.parse(c.from) : 0, to: c.to ? Clock.parse(c.to) : Infinity });
  }
  /** Odcinek zamknięty przez cały przedział [a, b]. */
  const closedThrough = (sid, a, b) => closures.some((c) => c.section === sid && c.from <= a && c.to >= b);
  // ---- zadania manewrowe ----
  const taskIds = new Map();
  for (const t of taskDefs) taskIds.set(t.id, (taskIds.get(t.id) || 0) + 1);
  for (const [id, n] of taskIds) if (n > 1) error('task-dup-id', `Zadanie „${id}” ${n}× – afterTask wskaże zawsze pierwsze`);
  const order = (t) => taskDefs.indexOf(t);
  for (const t of taskDefs) {
    const w = `Zadanie „${t.id}”`;
    const u = find(t.unit);
    if (!u) {
      const inherited = !sc.tasks && (station.timetable || []).some((x) => same(x.nr, t.unit));
      if (inherited) warn('task-unit-missing', `${w} stacji pominięte – skład ${t.unit} nie jedzie w tej zmianie (własne zadania: tasks w scenariuszu, bez zadań: tasks: [])`, t.unit);
      else error('task-unit-missing', `${w}: skład ${t.unit} nie jedzie w tej zmianie – zadanie zniknie bez śladu`, t.unit);
      continue;
    }
    if (t.type != null && t.type !== 'move') warn('task-type', `${w}: type „${t.type}” – jedyny rodzaj zadania to 'move'`, t.unit);
    if (!t.text) warn('task-text', `${w}: brak text – ocena i dziennik pokażą „undefined”`, t.unit);
    if (!isTime(t.deadline)) error('task-time', `${w}: deadline „${t.deadline}” – czas w formacie GG:MM (bez niego zadanie nie przepada, a skład nie przechodzi w następcę)`, t.unit);
    if (t.after != null && !isTime(t.after)) error('task-time', `${w}: after „${t.after}” – czas w formacie GG:MM`, t.unit);
    if (t.afterTask != null && !taskIds.has(t.afterTask)) error('task-after-missing', `${w}: afterTask „${t.afterTask}” nie istnieje – zadanie czeka, aż przepadnie, a skład do tego czasu nie przechodzi w następcę`, t.unit);
    if (t.toTrack == null || !tracks.has(String(t.toTrack))) error('task-track-unknown', `${w}: toTrack „${t.toTrack}” – nie ma takiego toru`, t.unit);
    const dl = isTime(t.deadline) ? Clock.parse(t.deadline) : NaN;
    const af = isTime(t.after) ? Clock.parse(t.after) : null;
    const ready = u.arrTime ?? (u.startOn ? start : null);
    const prev = taskDefs.filter((x) => x !== t && same(x.unit, t.unit) && order(x) < order(t)).at(-1);
    const earlier = !!prev;
    if (Number.isFinite(dl)) {
      if (af != null && af > dl) error('task-after-gt-deadline', `${w}: after ${t.after} po terminie ${t.deadline}`, t.unit);
      if (dl < start) error('task-before-start', `${w}: termin ${t.deadline} przed startem zmiany ${hm(start)}`, t.unit);
      if (end != null && dl + TASK_GRACE > end) warn('task-after-end', `${w}: termin ${t.deadline} + 10 min po końcu zmiany ${sc.endTime} – niewykonane nie przepadnie i nie będzie kary`, t.unit);
      if (ready != null && ready > dl + TASK_GRACE) error('task-impossible', `${w}: skład ${u.nr} przyjeżdża ${u.arr ?? hm(ready)}, po terminie ${t.deadline} + 10 min – zadanie przepadnie`, t.unit);
      else if (ready != null && ready > dl) warn('task-late', `${w}: skład ${u.nr} przyjeżdża ${u.arr ?? hm(ready)}, po terminie ${t.deadline} – zadanie bez punktów`, t.unit);
      const succ = successors(u)[0];
      if (succ?.depTime != null && dl > succ.depTime) warn('task-after-succ-dep', `${w}: termin ${t.deadline} po odjeździe pociągu ${succ.nr} ze składu (${succ.dep}) – skład czeka na zadanie, więc ${succ.nr} odjedzie po planie`, t.unit);
    }
    if (u.to && !u.terminates && !successors(u).length) error('task-unit-leaves', `${w}: skład ${u.nr} jedzie dalej (do ${u.to}) – manewry zatrzymają go na stacji`, t.unit);
    if (earlier && t.afterTask == null) warn('task-chain', `${w}: kolejne zadanie składu ${t.unit} bez afterTask – zaliczy się, zanim poprzednie będzie wykonane`, t.unit);
    // droga manewrowa z toru składu (po poprzednim zadaniu – jego tor docelowy) na tor docelowy (warunek konieczny):
    // graf torów po przebiegach manewrowych
    const from = prev?.toTrack != null ? String(prev.toTrack) : u.track != null ? String(u.track) : null;
    const goal = t.toTrack != null ? String(t.toTrack) : null;
    if (from && goal && from === goal && !earlier) warn('task-trivial', `${w}: tor docelowy ${goal} to tor, na który skład ${u.nr} przyjeżdża – zadanie zaliczy się bez manewrów`, t.unit);
    if (from && goal && tracks.has(goal) && from !== goal && !shuntReach(ilk, from).has(goal)) error('task-no-shunt-path', `${w}: brak drogi przebiegami manewrowymi z toru ${from} (skład ${u.nr}) na tor ${goal}`, t.unit);
    // tor docelowy zamknięty przez cały czas na zadanie: każdy przebieg manewrowy na niego prowadzi przez zamknięcie
    if (goal && tracks.has(goal) && closures.length && Number.isFinite(dl)) {
      const a = Math.max(ready ?? start, af ?? start), b = dl + TASK_GRACE;
      const into = shuntRoutes.filter((r) => routeTrack(r) === goal || trackOfSec(r.sections.at(-1)) === goal);
      const shut = (r) => r.sections.some((sid) => closedThrough(sid, a, b));
      if (into.length ? into.every(shut) : tracks.get(goal).every((s) => closedThrough(s.id, a, b))) {
        error('closed-task-track', `${w}: tor ${goal} zamknięty (closedSections) przez cały czas na zadanie (${hm(a)}–${hm(b)}) – żaden przebieg manewrowy na niego nie przejdzie, zadanie przepadnie`, t.unit);
      }
    }
  }
  // ostatnie zadanie składu a pociąg ze składu: skład zostaje na torze docelowym zadania
  for (const u of tt) {
    const ks = tasksOf(u.nr);
    const succ = successors(u)[0];
    if (!ks.length || !succ) continue;
    const lastTask = ks.at(-1);
    const T = lastTask.toTrack != null ? String(lastTask.toTrack) : null;
    if (!T || succ.track == null || same(succ.track, T) || !tracks.has(T)) continue;
    const reach = succ.to && exits[succ.to] ? !!exitPath(T, succ.to) : true;
    (reach ? warn : error)('task-succ-track', `Zadanie „${lastTask.id}” zostawia skład ${u.nr} na torze ${T}, a pociąg ${succ.nr} ze składu ma tor ${succ.track}${reach ? ` – odjedzie z toru ${T}` : ` i z toru ${T} nie ma przebiegu na szlak do ${exitName(succ.to)} – pociąg nie odjedzie`}`, succ.nr);
  }
  // ---- usterki i zamknięcia: odcinek z definicji stacji podzielony przy normalizacji (łącznica) ----
  const rawSection = new Map((station.tiles || []).filter((t) => t.section).map((t) => [`${t.x},${t.y}`, t.section]));
  const partsOf = (id) => { const o = new Set(); for (const t of sim.station.tiles) if (t.section && rawSection.get(`${t.x},${t.y}`) === id) o.add(t.section); return o; };
  const checkSplit = (id, w) => { const parts = partsOf(id); if (parts.size > 1) warn('split-section', `${w}: odcinek ${id} jest w grze podzielony (${[...parts].join(', ')}) – dotyczy tylko części ${id}`); };
  const faults = sc.faults || [];
  const faultWindow = [];
  for (const f of faults) {
    const w = `Usterka ${f.type} ${f.target}`;
    if (!FAULT_TYPES.includes(f.type)) { error('fault-type', `${w}: nieznany rodzaj usterki (${FAULT_TYPES.join(', ')}) – nic się nie stanie`); continue; }
    const kind = FAULTS[f.type];
    if (!kind.exists(sim, f.target)) error('fault-target', `${w}: nie ma takiego elementu – usterka nic nie zrobi, a dziennik i tak ją pokaże`);
    else if (kind.target === 'section') checkSplit(f.target, w);
    else if (f.type === 'signal-fail' && ilk.signals.get(f.target)?.kind !== 'semafor') warn('fault-shunt-signal', `${w}: ${f.target} to tarcza manewrowa – usterka nie dotyczy pociągów (tylko manewrów)`);
    // `at` liczbą gra przyjęłaby jako sekundy od północy (450 → 00:07:30) – zawsze napis GG:MM
    if (!isTime(f.at)) { error('fault-time', `${w}: at ${JSON.stringify(f.at)} – czas jako napis „GG:MM”${typeof f.at === 'number' ? ` (liczbę gra bierze jako sekundy od północy: ${Clock.format(f.at, true)})` : ''}`); continue; }
    const at = Clock.parse(f.at);
    if (f.duration != null && !(f.duration > 0)) error('fault-duration', `${w}: duration ${f.duration} – minuty, więcej niż 0`);
    const len = (f.duration ?? FAULT_DEFAULT_MIN) * 60;
    faultWindow.push({ f, at, len });
    if (at < start) warn('fault-before-start', `${w}: at ${hm(at)} przed startem zmiany – czynna od pierwszej chwili`);
    if (end != null && at >= end) error('fault-after-end', `${w}: at ${hm(at)} nie przed końcem zmiany ${sc.endTime} – usterka nie wystąpi`);
    // usterkę, którą gracz usuwa sam (licznik osi – MOR-3), i samouczek (celowo do końca lekcji) – bez uwagi
    else if (end != null && at + len > end && !kind.outlastsShift && !sc.tutorial) warn('fault-past-end', `${w}: ${hm(at)} + ${len / 60} min trwa po końcu zmiany ${sc.endTime}`);
    const need = kind.requires?.(sim);
    if (need) (need.level === 'error' ? error : warn)('fault-srk', `${w}: ${need.msg}`);
    if (!kind.automat) info('fault-automat', `${w}: automat dyżurnego jej nie obsługuje (${kind.automatGap}) – sprawdzenie przebiegu automatem tego nie oceni`);
  }
  for (let i = 0; i < faultWindow.length; i++) for (let j = i + 1; j < faultWindow.length; j++) {
    const a = faultWindow[i], b = faultWindow[j];
    if (a.f.type !== b.f.type || a.f.target !== b.f.target) continue;
    if (Math.min(a.at + a.len, b.at + b.len) > Math.max(a.at, b.at)) warn('fault-twin', `Usterki ${a.f.type} ${a.f.target} (${hm(a.at)} i ${hm(b.at)}) nakładają się w czasie`);
  }
  for (const c of sc.closedSections || []) {
    const w = `Zamknięcie ${c.section}`;
    const exists = ilk.sections.has(c.section);
    if (!exists) error('closed-section', `${w}: nie ma takiego odcinka – tor nie zostanie zamknięty, a dziennik i tak to pokaże`);
    else checkSplit(c.section, w);
    let badT = false;
    for (const [k, v] of Object.entries({ from: c.from, to: c.to })) if (v != null && !isTime(v)) { error('closed-time', `${w}: ${k} „${v}” – czas w formacie GG:MM`); badT = true; }
    if (badT) continue;
    const f = c.from ? Clock.parse(c.from) : 0, t = c.to ? Clock.parse(c.to) : Infinity;
    if (f >= t) { error('closed-window', `${w}: from ${c.from} nie przed to ${c.to} – zamknięcie nigdy nie zadziała`); continue; }
    if (t <= start || (end != null && f >= end)) warn('closed-outside', `${w}: ${c.from ?? 'od początku'}–${c.to ?? 'do końca'} poza oknem zmiany`);
    if (!exists) continue;
    const closed = new Set([c.section]);
    for (const e of tt) {
      if (!e.from || !exits[e.from]) continue;
      const ea = e.requestAt ?? e.arrTime ?? e.depTime, eb = e.depTime ?? e.arrTime;
      if (!Number.isFinite(ea) || !Number.isFinite(eb) || eb < f || ea >= t) continue;
      const ok = [...tracks.keys()].filter((T) => entryPath(e.from, T, closed) && (!e.to || exitPath(T, e.to, closed)));
      if (!ok.length) {
        const forever = end == null ? t === Infinity : t >= end;
        (forever ? error : warn)('closed-blocks-train', `${w}: pociąg ${e.nr} (${e.from} → ${e.to ?? 'stacja'}) nie ma toru z wjazdem${e.to ? ' i wyjazdem' : ''} z ominięciem zamknięcia – ${forever ? 'nie przejedzie do końca zmiany' : `czeka do ${hm(t)}`}`, e.nr);
      } else if (e.track != null && !ok.includes(String(e.track))) {
        warn('closed-planned-track', `${w}: pociąg ${e.nr} – tor planowy ${e.track} niedostępny, pójdzie na ${ok.slice(0, 3).join(' / ')} (bez kary za inny tor)`, e.nr);
      }
    }
  }
  // ---- pociągi nadzwyczajne (poziom z pociągami nadzwyczajnymi): kopia pociągu z rozkładu zmiany (własny `timetable`
  // scenariusza), inaczej stacji; numer nr + 1000, a gdy zajęty – następny wolny (Simulation.#planExtraTrains) ----
  for (const L of levels) {
    if (!DISRUPTION_LEVELS[L]?.extraTrains) continue;
    const pool = (sc.timetable ?? station.timetable ?? []).filter((x) => x.from && x.to);
    // Simulation.#planExtraTrains: kopia mieści się w zmianie (`extraTrainShifts`); gdy żaden pociąg rozkładu stacji się
    // nie mieści, zmiana idzie bez pociągu nadzwyczajnego – informacja (poziom miał go dać)
    if (pool.length && !pool.some((x) => extraTrainShifts(x, start, end))) {
      info('extra-none', `Poziom ${L}: żaden pociąg rozkładu stacji przesunięty o ${EXTRA_TRAIN.shiftMin}…${EXTRA_TRAIN.shiftMax} min nie mieści się w zmianie ${hm(start)}–${end != null ? hm(end) : '…'} (zapowiedź ${EXTRA_TRAIN.announce / 60} min przed przyjazdem, ostatnie zdarzenie ${EXTRA_TRAIN.endSlack / 60} min przed końcem) – zmiana bez pociągu nadzwyczajnego`);
    }
  }
  return out;
}

/** Czy wynik `checkScenario` ma błędy. */
export function hasErrors(findings) {
  return findings.some((f) => f.level === 'error');
}
