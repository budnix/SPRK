import { Clock } from '../core/Clock.js';
import { mixSeed, seedFraction } from '../core/Random.js';
import { brandOf, categoryOf, relationOf, speedFor } from './categories.js';
import { cityOf, namedTrainsVia, namedTrainTitle } from './namedTrains.js';
import { checkScenario } from './scenarioCheck.js';
import { DAY_RULES, WORKS, calendarLabel, resolveCalendar, seasideSeason, seasideTrain } from './timetable/calendar.js';

/**
 * Służba o wybranej porze i długości: scenariusz budowany z rozkładu stacji, bez danych per stacja.
 *
 * Rozkład stacji (`station.timetable`, ok. 2 h porannego szczytu) jest wzorcem ruchu. Doba powstaje z jego powtórzeń co
 * okres wzorca (`patternPeriod`), a o tym, co z wzorca kursuje o danej godzinie, decyduje pora doby (`DAY_BANDS`):
 * w szczytach cały wzorzec, w dzień i wieczorem rzadziej pociągi aglomeracyjne i regionalne, w nocy prawie sam ruch
 * towarowy – w miejsce pociągów pasażerskich, które nie kursują, wchodzą pociągi towarowe. Powtórzenie pociągu
 * dalekobieżnego dostaje nazwę i relację pociągu z listy pociągów z nazwami (`namedTrains.js`), który jedzie tą samą
 * drogą. Liczby i numery pociągów poza wzorcem są przyjęte (docs/sources/posterunki.md „Służba o wybranej porze”) – to nie
 * rzeczywisty rozkład jazdy.
 *
 * Każda służba jest trochę inna: ziarno zmiany wybiera, które kursy linii jadą (faza co drugiego / co czwartego),
 * które pociągi wypadają i gdzie wchodzą towarowe – przez mieszanie ziarna (`mixSeed`), bez generatora zmiany, żeby
 * nie przesuwać losowania zakłóceń. To samo ziarno daje ten sam rozkład.
 *
 * Poprawność pilnuje kontrola definicji (`checkScenario`): pociąg, który w zbudowanym rozkładzie daje błąd albo uwagę,
 * jakiej nie ma we wzorcu (styk powtórzeń, pociąg sprzed startu, konflikt toru albo szlaku z pociągiem towarowym),
 * wypada z rozkładu. Moduł logiki: bez DOM.
 */

/** Długości służby do wyboru [min]. */
export const DUTY_MINUTES = [60, 120, 180, 300];
/** Początek identyfikatora scenariusza służby (`sluzba-120`) – wynik gracza zapisuje się osobno dla każdej długości. */
export const DUTY_ID = 'sluzba';
/**
 * Brzegi okna służby [s]. Pociąg od sąsiada przyjeżdża najwcześniej tak, żeby sąsiad wyprawił go `neighbour` s po starcie
 * (czas przejazdu szlaku i dojazdu do peronu – `leadOf`); pociąg bez wjazdu (stoi od początku, powstaje ze składu)
 * – `start` s po starcie. Ostatnie zdarzenie nie później niż `end` s przed końcem.
 */
export const DUTY_EDGE = { start: 3 * 60, neighbour: 2 * 60, run: 90, end: 10 * 60 };
/**
 * Otwarcie służby [s]: pierwszy pociąg najpóźniej tyle po najwcześniejszej możliwej chwili (pociąg od sąsiada wyprawiony
 * po starcie) – gracz nie czeka pół godziny na pierwszy pociąg, gdy pora doby przerzedziła wzorzec (przyjęte).
 */
export const DUTY_OPENING = 5 * 60;
/** Pociąg towarowy spoza wzorca: od innego pociągu na tym samym szlaku co najmniej czas przejazdu szlaku + tyle [s]. */
export const FREIGHT_GAP = 3 * 60;
/**
 * Pociąg towarowy w wolnej luce: szuka chwili w oknie ±`FREIGHT_SPAN` [s] wokół miejsca pociągu, który zastępuje,
 * najchętniej z zapasem `FREIGHT_BUFFER` [s] ponad odstęp – planowy odstęp to odstęp najmniejszy i zapas (przyjęte).
 */
export const FREIGHT_SPAN = 30 * 60;
export const FREIGHT_BUFFER = 2 * 60;
/**
 * Przejazdy służbowe (przyjęte): w każdej godzinie służby z prawdopodobieństwem `SERVICE_RATE` jeden przejazd spoza
 * wzorca drogą przelotu pociągu wzorca, w wolnej luce tej godziny – lokomotywa luzem i próżne wagony po liniach
 * pociągów regionalnych, dalekobieżnych i towarowych, próżny skład EZT po liniach aglomeracyjnych i regionalnych o porze,
 * w której ich pociągi kursują. Parametry jak we wpisach wzorców stacji (Gdańsk Gł. 44660, Tczew 44631, Gdynia Orłowo
 * 88301); `length: null` – długość pociągu wzorca, którego drogą jedzie.
 */
export const SERVICE_RATE = 0.3;
export const SERVICE_RUNS = [
  { kind: 'tow', cat: 'LT', name: 'Lokomotywa luzem', length: 20, vmax: 100 },
  { kind: 'tow', cat: 'TS', name: 'Próżne wagony', length: 400, mass: 600, vmax: 80 },
  { kind: 'os', cat: 'EZT', name: 'Skład EZT', suffix: ' (próżny)', length: null, vmax: 90 },
];
/** Numery przejazdów służbowych: od tej liczby (przyjęte), parzystość jak pociągu, którego drogą jadą. */
export const SERVICE_NR = 48000;
/** Udział pociągów (poza aglomeracyjnymi), które w danej służbie nie kursują – urozmaicenie (przyjęte). */
export const DUTY_SKIP = 0.12;
/** Roboty torowe: ile torów najwyżej sprawdzić (kolejność z ziarna), zanim służba pójdzie bez robót. */
export const WORKS_TRIES = 4;
/** Uwaga kontroli definicji, która przy zamkniętym torze jest zamierzona: pociąg jedzie innym torem bez kary. */
const WORKS_ACCEPTED = 'closed-planned-track';
/**
 * Przesunięcie linii [min]: każdy kurs linii (klasa i para szlaków – oba kierunki linii jednotorowej razem, więc
 * krzyżowania zostają jak we wzorcu) jedzie w danej służbie o tyle samo minut później, 0…`DUTY_SHIFT` z ziarna. Takt
 * linii zostaje, a minuty i kolejność pociągów różnych linii zmieniają się między służbami (przyjęte).
 */
export const DUTY_SHIFT = 3;

/**
 * Pory doby (przyjęte): `every` – co który kurs linii jedzie (1 każdy, 2 co drugi, 4 co czwarty, 0 żaden) dla pociągów
 * aglomeracyjnych (`agl`: SKM), regionalnych (`reg`), dalekobieżnych (`dal`: IC, TLK, EIC, EIP) i towarowych (`tow`);
 * `freight` – udział niekursujących pociągów regionalnych i dalekobieżnych, w których miejsce wchodzi pociąg towarowy.
 */
export const DAY_BANDS = [
  { id: 'noc', from: 0, to: 4, every: { agl: 0, reg: 0, dal: 4, tow: 1 }, freight: 0.6 },
  { id: 'swit', from: 4, to: 6, every: { agl: 2, reg: 2, dal: 2, tow: 1 }, freight: 0.25 },
  { id: 'szczyt-rano', from: 6, to: 9, every: { agl: 1, reg: 1, dal: 1, tow: 1 }, freight: 0 },
  { id: 'dzien', from: 9, to: 14, every: { agl: 2, reg: 2, dal: 1, tow: 1 }, freight: 0.1 },
  { id: 'szczyt-po', from: 14, to: 18, every: { agl: 1, reg: 1, dal: 1, tow: 1 }, freight: 0 },
  { id: 'wieczor', from: 18, to: 22, every: { agl: 2, reg: 2, dal: 2, tow: 1 }, freight: 0.35 },
  { id: 'pozny-wieczor', from: 22, to: 24, every: { agl: 4, reg: 4, dal: 2, tow: 1 }, freight: 0.4 },
];

/** Pociąg towarowy w miejsce pasażerskiego, gdy stacja nie ma we wzorcu żadnego towarowego przelotu (przyjęte). */
const GENERIC_FREIGHT = { kind: 'tow', cat: 'TM', length: 400, mass: 1200, vmax: 80 };
/** Numery pociągów towarowych spoza wzorca: od tej liczby (przyjęte), parzystość jak pociągu, w którego miejsce wchodzą. */
const FREIGHT_NR = 46000;
const DAY = 24 * 3600;

/** Godzina do pokazania (jak na zegarze) i do danych (po północy 24, 25… – ta sama zmiana trwa dalej, `Clock.stamp`). */
const hm = (s) => Clock.format(s);
const stamp = (s) => Clock.stamp(s);
const firstOf = (e) => Clock.parse(e.arr || e.dep);
const lastOf = (e) => Clock.parse(e.dep || e.arr);
/** Ułamek [0, 1) z ziarna i klucza – powtarzalny, niezależny od generatora zmiany (`seedFraction`). */
const fraction = seedFraction;

/** Pora doby dla chwili `seconds` (od północy; godziny powyżej 24 zawijają się). */
export function bandOf(seconds) {
  const h = (((seconds % DAY) + DAY) % DAY) / 3600;
  return DAY_BANDS.find((b) => h >= b.from && h < b.to);
}

/** Klasa pociągu w profilu doby: 'agl' | 'reg' | 'dal' | 'tow'. */
export function trainClass(entry) {
  const cat = categoryOf(entry);
  if (cat === 'SKM') return 'agl';
  if (['IC', 'TLK', 'EIC', 'EIP'].includes(cat)) return 'dal';
  return entry.kind === 'tow' || /^[TL]/.test(cat) ? 'tow' : 'reg';
}

/**
 * Okres wzorca [s]: po tylu sekundach rozkład stacji się powtarza. Pole `duty.period` stacji (minuty) albo rozpiętość
 * rozkładu zaokrąglona do pełnej godziny (co najmniej jedna) – wzorce z taktem 15 / 30 / 60 min zachowują takt na styku.
 */
export function patternPeriod(station) {
  if (station.duty?.period > 0) return station.duty.period * 60;
  const times = (station.timetable || []).flatMap((e) => [firstOf(e), lastOf(e)]).filter(Number.isFinite);
  if (!times.length) return 3600;
  return Math.max(1, Math.round((Math.max(...times) - Math.min(...times)) / 3600)) * 3600;
}

/** Parametry służby z adresu (`start` – godzina, `czas` – minuty) sprowadzone do dozwolonych: zła godzina – 6, zła długość – 2 h. */
export function normalizeDuty(start, minutes) {
  const h = Number.isInteger(Number(start)) && start !== null && start !== '' && Number(start) >= 0 && Number(start) <= 23 ? Number(start) : 6;
  const m = Number(minutes);
  return { start: h, minutes: DUTY_MINUTES.includes(m) ? m : 120 };
}

/** Czy stacja ma z czego budować służby: rozkład z pociągami od sąsiada. */
export function hasDuty(station) {
  return (station.timetable || []).some((e) => e.from);
}

/**
 * Tory, które roboty torowe (`WORKS`) mogą zamknąć na całą służbę – numery torów stacji (z odcinkami). Tylko tory,
 * którymi we wzorcu pociągi jadą przelotem albo z krótkim postojem: bez toru, na którym pociąg kończy bieg, stoi od
 * początku, powstaje ze składu, nie ma wjazdu albo wyjazdu, albo kończy się zadanie manewrowe – skład stanąłby na
 * zastępczym torze głównym na długo i zatrzymał ruch (Reda: tor 11 pociągów z Helu, Rumia: tor 6 pociągu zdawczego);
 * bez toru pociągów aglomeracyjnych – linia SKM to osobne tory, roboty na niej to jazda jednym torem, nie objazd torami
 * dalekobieżnymi (Rumia: SKM z toru 5 na tor 2 nie miała wyjazdu). I tylko tor pomocniczy: każdy pociąg wzorca na nim ma
 * tą samą drogą (wjazd i wyjazd) tor, którym jedzie więcej pociągów – zamknięcie toru głównego drogi to objazd pod prąd
 * przez stację i konflikty z pociągami przeciwnego kierunku (Sopot, Gdynia Orłowo, Rumia, Reda: tor 1 – zatory w grze
 * automatem). Stacja bez takiego toru nie ma robót.
 */
export function closableTracks(station) {
  const tt = station.timetable || [], tasks = station.tasks || [];
  const trackOf = (nr) => tt.find((e) => String(e.nr) === String(nr))?.track;
  const parked = new Set([
    ...tt.filter((e) => e.terminates || e.startOn || e.unit != null || !e.from || !e.to || trainClass(e) === 'agl').map((e) => String(e.track)),
    ...tasks.map((x) => String(x.toTrack)), ...tasks.map((x) => String(trackOf(x.unit))),
  ]);
  const use = (e, T) => tt.filter((x) => x.from === e.from && x.to === e.to && x.track != null && String(x.track) === T).length;
  const secondary = (e) => tt.some((x) => x.from === e.from && x.to === e.to && x.track != null && use(e, String(x.track)) > use(e, String(e.track)));
  const hasSections = (T) => Object.values(station.sections || {}).some((d) => d.track != null && String(d.track) === T);
  return [...new Set(tt.map((e) => e.track).filter((T) => T != null).map(String))]
    .filter((T) => !parked.has(T) && hasSections(T) && tt.filter((e) => String(e.track) === T).every(secondary));
}

/**
 * Grupy wzorca: pociąg z tym, co musi jechać razem z nim – pociągi ze składu (`unit`) i zadania manewrowe składu.
 * Zwraca listę `{ trains, tasks, key }`; `key` – linia grupy (klasa, wjazd, wyjazd, tor pierwszego pociągu).
 */
function patternGroups(station) {
  const tt = station.timetable || [], tasks = station.tasks || [];
  const root = (e) => { let x = e; for (let i = 0; i < 10 && x.unit != null; i++) { const u = tt.find((y) => String(y.nr) === String(x.unit)); if (!u) break; x = u; } return x; };
  const groups = new Map();
  for (const e of tt) {
    const r = root(e);
    if (!groups.has(r)) groups.set(r, { trains: [], tasks: [] });
    groups.get(r).trains.push(e);
  }
  for (const task of tasks) {
    const u = tt.find((y) => String(y.nr) === String(task.unit));
    if (u) groups.get(root(u)).tasks.push(task);
  }
  return [...groups.values()].map((g) => {
    g.trains.sort((a, b) => firstOf(a) - firstOf(b));
    const head = g.trains[0];
    return { ...g, head, cls: trainClass(head), key: `${trainClass(head)}|${head.from ?? ''}|${head.to ?? ''}|${head.track ?? ''}|${g.trains.length}` };
  });
}

/** Wpis rozkładu przesunięty o `shift` sekund, z numerem `nr` (i składem `unit` wg `map`). */
function shifted(e, shift, nr, map) {
  const out = { ...e, nr };
  if (e.arr) out.arr = stamp(Clock.parse(e.arr) + shift);
  if (e.dep) out.dep = stamp(Clock.parse(e.dep) + shift);
  if (e.unit != null) out.unit = map.get(String(e.unit)) ?? e.unit;
  return out;
}

/** Zadanie manewrowe przesunięte razem z grupą: terminy, numery pociągów i godziny w treści. */
function shiftedTask(task, shift, tag, map) {
  const time = (v) => (v ? stamp(Clock.parse(v) + shift) : v);
  const text = String(task.text || '')
    .replace(/\b(\d{1,2}:\d{2})\b/g, (m) => hm(Clock.parse(m) + shift))
    .replace(/\b\d{3,6}\b/g, (m) => String(map.get(m) ?? m));
  const out = { ...task, id: tag ? `${task.id}${tag}` : task.id, unit: map.get(String(task.unit)) ?? task.unit, text };
  if (task.deadline) out.deadline = time(task.deadline);
  if (task.after) out.after = time(task.after);
  if (task.afterTask) out.afterTask = tag ? `${task.afterTask}${tag}` : task.afterTask;
  return out;
}

/**
 * Służba na stacji `station` od pełnej godziny `start` (0–23) przez `minutes` minut, dla ziarna `seed`.
 * `srk` – stanowisko służby (stacje z więcej niż jednym; bez niego stanowisko stacji). `month` (1–12) i `day`
 * (`DAY_TYPES`) – termin służby (`src/model/timetable/calendar.js`); bez nich („losowo”) termin losuje ziarno.
 *
 * Zwraca `{ scenario, stats }`: scenariusz (obiekt dla `Simulation`: `id`, `name` z godzinami i terminem,
 * `startTime`, `endTime`, własne `timetable` i `tasks`) oraz `stats` – pora doby startu, termin (`month`, `day`)
 * i liczba pociągów wg klasy.
 */
export function buildDuty(station, { start, minutes, seed = 0, srk = null, month = null, day = null } = {}) {
  if (!Number.isInteger(start) || start < 0 || start > 23) throw new Error(`Służba: start – pełna godzina 0–23, jest ${start}`);
  if (!DUTY_MINUTES.includes(minutes)) throw new Error(`Służba: długość ${minutes} min – do wyboru ${DUTY_MINUTES.join(', ')}`);
  const t0 = start * 3600, t1 = t0 + minutes * 60;
  const last = t1 - DUTY_EDGE.end;
  const period = patternPeriod(station);
  const groups = patternGroups(station);
  const exits = station.exits || {};
  // termin: typ dnia wybiera zasady pory doby (sobota, niedziela – bez szczytów), sezon nad morzem – kursy pociągów nad morze
  const cal = resolveCalendar(seed, { month, day });
  const rules = DAY_RULES[cal.day], season = seasideSeason(cal);
  const bandAt = (t) => { const b = bandOf(t); return rules[b.id] ? DAY_BANDS.find((x) => x.id === rules[b.id]) : b; };
  // czas przejazdu szlaku `exit` z prędkością `v` [km/h] i najwcześniejsza chwila pierwszego zdarzenia pociągu w służbie:
  // pociąg od sąsiada musi zostać wyprawiony po starcie (inaczej przyjeżdża po planie – uwaga `tt-tight-start`)
  const lineTime = (exit, v) => { const x = exits[exit]; return x ? (x.lineLength ?? 3000) / (Math.min(v, x.lineSpeed ?? v) / 3.6) : 0; };
  const leadOf = (e, v = speedFor(e)) => (e.from ? lineTime(e.from, v) + DUTY_EDGE.run + DUTY_EDGE.neighbour : DUTY_EDGE.start);

  // kursy linii we wzorcu: grupy tej samej linii po kolei – numer kursu w dobie to powtórzenie · liczba + miejsce
  const lines = new Map();
  for (const g of groups) lines.set(g.key, [...(lines.get(g.key) ?? []), g]);
  for (const list of lines.values()) list.sort((a, b) => firstOf(a.head) - firstOf(b.head));

  const used = new Set();
  const free = (nr) => { let n = nr; while (used.has(n) || used.has(n + 1000) || used.has(n - 1000)) n += 2; used.add(n); return n; };
  const picked = [], dropped = [];
  const baseOf = new Map(); // numer w służbie → numer wzorca (do porównania uwag z wzorcem)

  // przesunięcie linii w tej służbie [s] (`DUTY_SHIFT`): klasa i para szlaków grupy, bez kierunku
  const offsetOf = (g) => Math.floor(fraction(seed, `przesuniecie|${g.cls}|${[g.head.from ?? '', g.head.to ?? ''].sort().join('|')}`) * (DUTY_SHIFT + 1)) * 60;

  // powtórzenia wzorca, które sięgają okna służby (przesunięte z linią)
  const span = groups.flatMap((g) => g.trains.flatMap((e) => [firstOf(e), lastOf(e)]));
  const lo = Math.min(...span), hi = Math.max(...span);
  const candidates = [];
  for (let n = Math.floor((t0 - hi - DUTY_SHIFT * 60) / period); n <= Math.ceil((t1 - lo) / period); n++) {
    for (const g of groups) {
      // kurs, który mieści się w oknie tylko bez pełnego przesunięcia, jedzie przesunięty o tyle, ile się mieści
      const end = Math.max(...g.trains.map(lastOf)) + n * period;
      const offset = Math.max(0, Math.min(offsetOf(g), Math.floor((last - end) / 60) * 60)), shift = n * period + offset;
      const a = Math.min(...g.trains.map(firstOf)) + shift, b = end + offset;
      const standing = g.trains.some((e) => e.startOn);
      // pociąg stojący od początku zmiany (startOn) – tylko gdy odjeżdża w pierwszym okresie wzorca od startu
      if (g.trains.some((e) => firstOf(e) + shift < t0 + leadOf(e)) || b > last || (standing && a > t0 + period)) continue;
      const list = lines.get(g.key);
      candidates.push({ g, n, shift, offset, at: a, course: n * list.length + list.indexOf(g) });
    }
  }
  candidates.sort((x, y) => x.at - y.at || String(x.g.head.nr).localeCompare(String(y.g.head.nr)));

  // Powtórzenie pociągu dalekobieżnego to inny pociąg tej samej drogi: nazwa i relacja z listy pociągów z nazwami
  // (`namedTrainsVia` – jadące przez miasto początku, potem końca relacji wzorca). Wybór zależy od numeru wzorca
  // i powtórzenia (ten sam pociąg ma tę samą nazwę na każdej stacji na trasie), a w jednej służbie nazwa nie wraca
  // w tym samym kierunku. Relacja bez pociągów na liście (stacje fikcyjne) zostaje jak we wzorcu.
  const names = new Set(groups.flatMap((g) => g.trains).map((e) => brandOf(e)).filter(Boolean).map((b) => `${b}|`));
  const renamed = (out, e, n) => {
    if (n === 0 || trainClass(e) !== 'dal') return out;
    const [a, b] = relationOf(e).split(' – ');
    // pociąg, który tu kończy albo zaczyna bieg, zastępuje tylko pociąg kończący / zaczynający w tym samym mieście;
    // EIP to osobny tabor (zespół trakcyjny) – zastępuje tylko EIP, a pociągi wagonowe (EIC, IC, TLK) – siebie nawzajem:
    // mają wspólną pulę taboru, długość wpisu zostaje z wzorca, a prędkość idzie za nową kategorią (TLK 140, IC / EIC
    // 160 km/h), o ile wpis nie ma własnego `vmax` – kontrola definicji sprawdza rozkład już z nową kategorią
    const eip = categoryOf(e) === 'EIP';
    const list = namedTrainsVia(a, b).filter((t) => (t.cat === 'EIP') === eip && (e.to || cityOf(t.stops.at(-1)) === cityOf(b)) && (e.from || cityOf(t.stops[0]) === cityOf(a)));
    if (!list.length) return out;
    const at = mixSeed(0, String(e.nr)) + n;
    for (let i = 0; i < list.length; i++) {
      const t = list[(((at + i) % list.length) + list.length) % list.length];
      const key = `${t.name}|${e.from ?? ''}`;
      if (names.has(key) || names.has(`${t.name}|`)) continue;
      names.add(key);
      delete out.brand;
      if (out.cat != null) out.cat = t.cat;
      return { ...out, name: namedTrainTitle(t) };
    }
    return out;
  };
  const take = (c) => {
    const { g, n, shift } = c;
    const map = new Map();
    for (const e of g.trains) { const nr = n === 0 ? free(e.nr) : free(e.nr + 100 * n); map.set(String(e.nr), nr); baseOf.set(String(nr), e.nr); }
    const tag = n === 0 ? '' : `@${n}`;
    const p = { c, trains: g.trains.map((e) => renamed(shifted(e, shift, map.get(String(e.nr)), map), e, n)), tasks: g.tasks.map((k) => shiftedTask(k, shift, tag, map)) };
    picked.push(p);
    return p;
  };
  for (const c of candidates) {
    const { g, n } = c;
    // pora doby grupy: pora jej pierwszego pociągu, a gdy któryś pociąg grupy wypada w porze, w której klasa nie kursuje
    // (skład z wieczora odjeżdża po północy) – ta pora: grupa nie jedzie
    const bands = g.trains.map((e) => bandAt(firstOf(e) + c.shift));
    const band = bands.find((b) => b.every[g.cls] === 0) ?? bands[0];
    // sezon nad morzem: pociąg nad morze jedzie każdym kursem i nie wypada dla urozmaicenia (o ile klasa o tej porze kursuje)
    const sea = season && band.every[g.cls] > 0 && seasideTrain(g.head);
    const every = sea ? 1 : band.every[g.cls];
    const phase = every > 1 ? Math.floor(fraction(seed, `faza|${g.key}`) * every) : 0;
    const runs = every > 0 && (((c.course + phase) % every) + every) % every === 0;
    const skipped = runs && g.cls !== 'agl' && !sea && fraction(seed, `brak|${g.head.nr}|${n}`) < DUTY_SKIP;
    if (!runs || skipped) { dropped.push({ ...c, band, skipped }); continue; }
    take(c);
  }
  // pociągi towarowe w miejsce pasażerskich, które o tej porze nie kursują (bez linii aglomeracyjnych)
  // parametry (rodzaj, długość, masa, prędkość) z pociągów towarowych wzorca – bez zdawczych i lokomotyw luzem
  const templates = (station.timetable || []).filter((e) => e.kind === 'tow' && e.from && e.to && e.unit == null && !e.startOn && !e.terminates && !['TK', 'LT', 'TH'].includes(categoryOf(e)));
  // zapas [s] pociągu towarowego `way` (wjazd `from`, wyjazd `to`, tor `track`, prędkość `vmax`) w chwili `at` wobec
  // pociągów służby – ujemny: konflikt. Jedzie wolniej niż pasażerski, w którego miejsce wchodzi: od innego pociągu na
  // szlaku wjazdu i wyjazdu (w obu kierunkach – linia jednotorowa) dzieli go czas przejazdu szlaku i `FREIGHT_GAP`, od
  // postoju innego pociągu na tym samym torze stacji – `FREIGHT_GAP`
  const slack = (way, at) => {
    let s = Infinity;
    for (const p of picked) for (const o of p.trains) {
      for (const exit of [way.from, way.to]) {
        const need = lineTime(exit, way.vmax) + FREIGHT_GAP;
        if (o.from === exit) s = Math.min(s, Math.abs(firstOf(o) - at) - need);
        if (o.to === exit) s = Math.min(s, Math.abs(lastOf(o) - at) - need);
      }
      if (way.track != null && o.track === way.track) s = Math.min(s, Math.max(firstOf(o) - at, at - lastOf(o)) - FREIGHT_GAP);
    }
    return s;
  };
  // wolna luka na drodze pociągu wzorca `e` dla pociągu o prędkości `vmax`: chwila w pełnych minutach w oknie [`open`,
  // `close`] – nie przed wyprawieniem przez sąsiada po starcie (wolniejszy pociąg sąsiad wyprawia wcześniej), nie po
  // ostatnim zdarzeniu służby – z zapasem `FREIGHT_BUFFER`, a gdy takich nie ma, z samym odstępem; którą – z ziarna
  // (klucz `key`). Bez luki – null
  const gapFor = (e, vmax, open, close, key) => {
    const way = { from: e.from, to: e.to, track: e.track, vmax };
    const earliest = Math.ceil(Math.max(open, t0 + leadOf(e, vmax)) / 60) * 60, latest = Math.min(close, last);
    const ok = [], good = [];
    for (let t = earliest; t <= latest; t += 60) {
      const s = slack(way, t);
      if (s >= 0) ok.push(t);
      if (s >= FREIGHT_BUFFER) good.push(t);
    }
    const pool = good.length ? good : ok;
    return pool.length ? pool[Math.floor(fraction(seed, key) * pool.length)] : null;
  };
  // pociąg towarowy na drodze pociągu wzorca `e` (szablon i numer z ziarna – klucz `key`) w wolnej luce w oknie
  // ±`FREIGHT_SPAN` wokół `at`, nie później niż `until`. Bez luki – null
  const freightFor = (e, at, key, until = Infinity) => {
    const tpl = templates.length ? templates[Math.floor(fraction(seed, `wzor|${key}`) * templates.length)] : GENERIC_FREIGHT;
    const vmax = tpl.vmax ?? GENERIC_FREIGHT.vmax;
    const when = gapFor(e, vmax, at - FREIGHT_SPAN, Math.min(at + FREIGHT_SPAN, until), `luka|${key}`);
    if (when == null) return null;
    const nr = free(FREIGHT_NR + Math.floor(fraction(seed, `nr|${key}`) * 400) * 2 + (Number(e.nr) % 2));
    const train = { nr, kind: 'tow', cat: tpl.cat ?? 'TM', name: `Towarowy ${exits[e.from]?.name ?? e.from} – ${exits[e.to]?.name ?? e.to}`,
      from: e.from, to: e.to, arr: stamp(when), track: e.track, stop: false, length: tpl.length, vmax };
    if (tpl.mass != null) train.mass = tpl.mass;
    if (tpl.traction) train.traction = tpl.traction;
    return train;
  };
  const freightSlot = (d) => (d.g.cls === 'reg' || d.g.cls === 'dal') && d.g.trains.length === 1 && d.g.head.from && d.g.head.to && !d.g.head.terminates;
  const addFreight = (force, until = Infinity) => { for (const d of dropped) {
    const e = d.g.head;
    if (d.freight || !freightSlot(d) || d.at > until) continue;
    if (!force && fraction(seed, `tow|${e.nr}|${d.n}`) >= d.band.freight) continue;
    const train = freightFor(e, firstOf(e) + d.shift, `${e.nr}|${d.n}`, until);
    if (!train) continue;
    d.freight = true; // miejsce zajęte – drugi raz towarowy tu nie wchodzi
    picked.push({ c: d, freight: true, trains: [train], tasks: [] });
  } };

  // kontrola definicji: pociąg z błędem albo uwagą, jakiej nie ma we wzorcu, wypada. Przy konflikcie dwóch pociągów
  // (tor, szlak) wypada najpierw pociąg towarowy spoza wzorca na tej samej drodze obok w czasie; każda inna uwaga
  // (pociąg sprzed startu, po końcu, zadanie) dotyczy samego pociągu – inne pociągi przez nią nie wypadają
  const pattern = { id: 'wzorzec', name: 'wzorzec', startTime: stamp(Math.max(0, lo - 30 * 60)), endTime: stamp(hi + 60 * 60), timetable: station.timetable, tasks: station.tasks || [] };
  const known = new Set(checkScenario(station, pattern).filter((f) => f.level !== 'info' && f.train != null).map((f) => `${f.code}:${f.train}`));
  let works = null; // roboty torowe: { track, sections } – tor zamknięty na całą służbę
  const scenario = () => {
    const sc = { id: `${DUTY_ID}-${minutes}`, name: `Służba ${hm(t0)}–${hm(t1)} (${calendarLabel(cal)})`, startTime: stamp(t0), endTime: stamp(t1),
      timetable: picked.flatMap((p) => p.trains).sort((a, b) => firstOf(a) - firstOf(b)), tasks: picked.flatMap((p) => p.tasks) };
    if (srk) sc.srk = srk;
    if (works) sc.closedSections = works.sections.map((section) => ({ section }));
    return sc;
  };
  const sameWay = (p, q) => p.trains.some((a) => q.trains.some((b) => (a.from && a.from === b.from) || (a.to && a.to === b.to) || (a.track != null && a.track === b.track)));
  // zwraca grupy, które wypadły
  const validate = () => {
    const removed = [];
    for (let round = 0; round < 40 && picked.length; round++) {
      const fresh = checkScenario(station, scenario()).filter((f) => f.level !== 'info' && f.code !== WORKS_ACCEPTED && !(f.train != null && known.has(`${f.code}:${baseOf.get(String(f.train)) ?? f.train}`)));
      if (!fresh.length) break;
      const out = new Set();
      for (const f of fresh) {
        if (f.train == null) {
          if (f.level === 'error') throw new Error(`Służba ${station.id} ${hm(t0)} / ${minutes} min: ${f.code} – ${f.msg}`);
          continue;
        }
        const own = picked.find((p) => p.trains.some((e) => String(e.nr) === String(f.train)));
        if (!own) continue;
        // uwaga o konflikcie dwóch pociągów (ten sam tor, ten sam szlak – kontrola definicji oznacza ją `pair`): gdy obok
        // jest pociąg towarowy spoza wzorca na tej samej drodze, wypada on; przy każdej innej uwadze – pociąg z uwagi
        const near = !own.freight && f.pair
          ? picked.filter((p) => p.freight && Math.abs(p.c.at - own.c.at) <= 20 * 60 && sameWay(p, own)).sort((a, b) => Math.abs(a.c.at - own.c.at) - Math.abs(b.c.at - own.c.at))[0]
          : null;
        if (!near && f.pair) own.partner = picked.find((p) => p.trains.some((e) => String(e.nr) === String(f.with)));
        out.add(near ?? own);
      }
      if (!out.size) break;
      for (const p of out) { picked.splice(picked.indexOf(p), 1); removed.push(p); for (const e of p.trains) used.delete(e.nr); }
    }
    return removed;
  };

  addFreight(false);
  const lost = validate();
  // Pociąg wzorca, który wypadł przez konflikt z pociągiem innej linii, przesuniętej inaczej: wraca z przesunięciem tamtej
  // linii (odstęp obu jak we wzorcu), a gdy i tak wypada – bez przesunięcia; każdy krok z kontrolą definicji
  for (const p of lost.filter((x) => !x.freight)) {
    const tries = [...new Set([p.partner?.c.offset, 0])].filter((o) => o != null && o !== p.c.offset);
    for (const o of tries) {
      const back = take({ ...p.c, shift: p.c.shift - p.c.offset + o, at: p.c.at - p.c.offset + o, offset: o });
      validate();
      if (picked.includes(back)) break;
    }
  }
  // Służba bez żadnego pociągu (krótkie okno, środek nocy) – po kolei, każdy krok z kontrolą definicji: wracają pociągi,
  // które wypadły dla urozmaicenia; towarowy wchodzi w każde wolne miejsce; na koniec pojedynczo pociągi wzorca, których
  // klasa o tej porze kursuje (inny kurs linii). Pociąg klasy, która o tej porze nie kursuje, nie wraca.
  if (!picked.length) { for (const d of dropped.filter((x) => x.skipped)) { dropped.splice(dropped.indexOf(d), 1); take(d); } validate(); }
  if (!picked.length) { addFreight(true); validate(); }
  for (const d of dropped.filter((x) => !x.freight && x.band.every[x.g.cls] > 0)) {
    if (picked.length) break;
    take(d); validate();
  }
  // Otwarcie służby: pierwszy pociąg najpóźniej `DUTY_OPENING` po najwcześniejszej możliwej chwili. Po kolei, każdy krok
  // z kontrolą definicji: pociąg wzorca z okna otwarcia, który wypadł (rzadszy kurs o tej porze, urozmaicenie), o ile
  // jego klasa o tej porze kursuje; pociąg towarowy w wolne miejsce wzorca w oknie; pociąg towarowy na najwcześniejszą
  // chwilę na którymś szlaku przelotowym (kolejność szlaków z ziarna).
  const firstAt = () => Math.min(Infinity, ...picked.flatMap((p) => p.trains.map(firstOf)));
  const arriving = groups.filter((g) => g.head.from);
  const opening = arriving.length ? t0 + Math.min(...arriving.map((g) => leadOf(g.head))) + DUTY_OPENING : Infinity;
  if (firstAt() > opening && opening < last) {
    for (const d of dropped.filter((x) => !x.freight && x.at <= opening && x.band.every[x.g.cls] > 0).sort((a, b) => a.at - b.at)) {
      dropped.splice(dropped.indexOf(d), 1); take(d); validate();
      if (firstAt() <= opening) break;
    }
    if (firstAt() > opening) { addFreight(true, opening); validate(); }
    const through = [...new Map(groups.filter((g) => g.trains.length === 1 && g.head.from && g.head.to && !g.head.terminates && !g.head.startOn)
      .map((g) => [`${g.head.from}|${g.head.to}|${g.head.track}`, g])).values()]
      .sort((a, b) => fraction(seed, `otwarcie|${a.key}`) - fraction(seed, `otwarcie|${b.key}`));
    for (const g of through) {
      if (firstAt() <= opening) break;
      // najwcześniejsza chwila dla pociągu towarowego na tym szlaku, w pełnych minutach
      const at = Math.ceil((t0 + leadOf(g.head, templates[0]?.vmax ?? GENERIC_FREIGHT.vmax)) / 60) * 60;
      if (at > opening + 5 * 60 || at > last) continue;
      const train = freightFor(g.head, at, `otwarcie|${g.head.nr}`, at);
      if (!train) continue;
      picked.push({ c: { g, n: 0, shift: 0, at }, freight: true, trains: [train], tasks: [] });
      validate();
    }
  }

  // Przejazdy służbowe (`SERVICE_RUNS`): w każdej godzinie służby z prawdopodobieństwem `SERVICE_RATE` jeden – rodzaj
  // i droga przelotu wzorca z ziarna, chwila w wolnej luce tej godziny (pora doby w obrębie godziny się nie zmienia);
  // jak pociąg towarowy spoza wzorca ustępuje pociągom wzorca w kontroli definicji
  const ways = [...new Map(groups.filter((g) => g.trains.length === 1 && g.head.from && g.head.to && !g.head.terminates && !g.head.startOn)
    .map((g) => [`${g.cls}|${g.head.from}|${g.head.to}|${g.head.track}`, g])).values()];
  for (let h = t0; h < t1; h += 3600) {
    if (fraction(seed, `sluzbowy|${h}`) >= SERVICE_RATE) continue;
    const run = SERVICE_RUNS[Math.floor(fraction(seed, `sluzbowy-rodzaj|${h}`) * SERVICE_RUNS.length)];
    const band = bandAt(h);
    const fit = ways.filter((g) => (run.kind === 'tow' ? g.cls !== 'agl' : (g.cls === 'agl' || g.cls === 'reg') && band.every[g.cls] > 0));
    if (!fit.length) continue;
    const g = fit[Math.floor(fraction(seed, `sluzbowy-droga|${h}`) * fit.length)], e = g.head;
    const when = gapFor(e, run.vmax, h, h + 3600 - 60, `sluzbowy-luka|${h}`);
    if (when == null) continue;
    const nr = free(SERVICE_NR + Math.floor(fraction(seed, `sluzbowy-nr|${h}`) * 400) * 2 + (Number(e.nr) % 2));
    const train = { nr, kind: run.kind, cat: run.cat, name: `${run.name} ${exits[e.from]?.name ?? e.from} – ${exits[e.to]?.name ?? e.to}${run.suffix ?? ''}`,
      from: e.from, to: e.to, arr: stamp(when), track: e.track, stop: false, length: run.length ?? e.length, vmax: run.vmax };
    if (run.mass != null) train.mass = run.mass;
    picked.push({ c: { g, n: 0, shift: 0, at: when }, freight: true, trains: [train], tasks: [] });
    validate();
  }

  // Roboty torowe (`WORKS`): w miesiącu robót, z ziarna, jeden tor stacji zamknięty na całą służbę – spośród torów, które
  // roboty mogą zamknąć (`closableTracks`) i którymi jadą pociągi służby (kolejność z ziarna, najwyżej `WORKS_TRIES`);
  // tor, przy którego zamknięciu kontrola definicji nie zgłasza nic poza „pociąg pójdzie innym torem” (`WORKS_ACCEPTED`):
  // każdy pociąg ma drogę z ominięciem zamknięcia
  if (fraction(seed, 'roboty') < (WORKS[cal.month] ?? 0)) {
    const used = new Set(picked.flatMap((p) => p.trains).map((e) => String(e.track)));
    const tracks = closableTracks(station).filter((T) => used.has(T))
      .sort((a, b) => fraction(seed, `roboty|${a}`) - fraction(seed, `roboty|${b}`)).slice(0, WORKS_TRIES);
    for (const track of tracks) {
      const sections = Object.entries(station.sections || {}).filter(([, d]) => d.track != null && String(d.track) === track).map(([id]) => id);
      if (!sections.length) continue;
      works = { track, sections };
      const blocked = checkScenario(station, scenario()).some((f) => f.code !== WORKS_ACCEPTED && (f.code.startsWith('closed-') || f.code === 'split-section'));
      if (!blocked) break;
      works = null;
    }
    if (works) validate();
  }

  const sc = scenario();
  const count = { agl: 0, reg: 0, dal: 0, tow: 0 };
  for (const e of sc.timetable) count[trainClass(e)]++;
  const band = bandOf(t0);
  const parts = [[count.agl, 'SKM'], [count.reg, 'regionalne'], [count.dal, 'dalekobieżne'], [count.tow, 'towarowe']].filter(([n]) => n).map(([n, w]) => `${n} ${w}`);
  // opis pory doby pokazuje strona posterunku (teksty `start.bandDesc.*`) – tu tylko liczby
  sc.description = `Służba o wybranej porze. Pociągi: ${sc.timetable.length}${parts.length ? ` (${parts.join(', ')})` : ''}.${works ? ` Roboty torowe: tor ${works.track} zamknięty na całą służbę – pociągi planowane na niego jadą innym torem bez kary.` : ''} Poziom zakłóceń do wyboru.`;
  return { scenario: sc, stats: { band: band.id, month: cal.month, day: cal.day, works: works?.track ?? null, trains: sc.timetable.length, ...count } };
}
