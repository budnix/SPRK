import { Clock } from '../core/Clock.js';
import { mixSeed } from '../core/Random.js';
import { brandOf, categoryOf, relationOf, speedFor } from './categories.js';
import { cityOf, namedTrainsVia, namedTrainTitle } from './namedTrains.js';
import { checkScenario } from './scenarioCheck.js';

/**
 * Służba o wybranej porze i długości: scenariusz budowany z rozkładu stacji, bez danych per stacja.
 *
 * Rozkład stacji (`station.timetable`, ok. 2 h porannego szczytu) jest wzorcem ruchu. Doba powstaje z jego powtórzeń co
 * okres wzorca (`patternPeriod`), a o tym, co z wzorca kursuje o danej godzinie, decyduje pora doby (`DAY_BANDS`):
 * w szczytach cały wzorzec, w dzień i wieczorem rzadziej pociągi aglomeracyjne i regionalne, w nocy prawie sam ruch
 * towarowy – w miejsce pociągów pasażerskich, które nie kursują, wchodzą pociągi towarowe. Powtórzenie pociągu
 * dalekobieżnego dostaje nazwę i relację pociągu z listy pociągów z nazwami (`namedTrains.js`), który jedzie tą samą
 * drogą. Liczby i numery pociągów poza wzorcem są przyjęte (docs/SOURCES.md „Służba o wybranej porze”) – to nie
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
export const DUTY_MINUTES = [30, 60, 120, 180];
/** Początek identyfikatora scenariusza służby (`sluzba-120`) – wynik gracza zapisuje się osobno dla każdej długości. */
export const DUTY_ID = 'sluzba';
/**
 * Brzegi okna służby [s]. Pociąg od sąsiada przyjeżdża najwcześniej tak, żeby sąsiad wyprawił go `neighbour` s po starcie
 * (czas przejazdu szlaku i dojazdu do peronu – `leadOf`); pociąg bez wjazdu (stoi od początku, powstaje ze składu)
 * – `start` s po starcie. Ostatnie zdarzenie nie później niż `end` s przed końcem (w najkrótszej służbie `endShort` –
 * inaczej na pociągi zostawałoby kilkanaście minut).
 */
export const DUTY_EDGE = { start: 3 * 60, neighbour: 2 * 60, run: 90, end: 10 * 60, endShort: 6 * 60 };
/** Pociąg towarowy spoza wzorca: od innego pociągu na tym samym szlaku co najmniej czas przejazdu szlaku + tyle [s]. */
export const FREIGHT_GAP = 3 * 60;
/** Udział pociągów (poza aglomeracyjnymi), które w danej służbie nie kursują – urozmaicenie (przyjęte). */
export const DUTY_SKIP = 0.12;

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

/**
 * Uwagi kontroli definicji o konflikcie dwóch pociągów (ten sam tor, ten sam szlak): gdy obok jest pociąg towarowy spoza
 * wzorca na tej samej drodze, wypada on; przy każdej innej uwadze wypada pociąg, którego uwaga dotyczy.
 */
const PAIR_CODE = /^(tt-track-overlap|line-)/;
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
/** Ułamek [0, 1) z ziarna i klucza – powtarzalny, niezależny od generatora zmiany. */
const fraction = (seed, key) => { const h = mixSeed(Number(seed) || 0, key, 0x51ed270b); return (Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 8) / 0x1000000; };

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
 * `srk` – stanowisko służby (stacje z więcej niż jednym; bez niego stanowisko stacji).
 *
 * Zwraca `{ scenario, stats }`: scenariusz (obiekt dla `Simulation`: `id`, `name` z godzinami, `startTime`, `endTime`,
 * własne `timetable` i `tasks`) oraz `stats` – pora doby startu i liczba pociągów wg klasy.
 */
export function buildDuty(station, { start, minutes, seed = 0, srk = null } = {}) {
  if (!Number.isInteger(start) || start < 0 || start > 23) throw new Error(`Służba: start – pełna godzina 0–23, jest ${start}`);
  if (!DUTY_MINUTES.includes(minutes)) throw new Error(`Służba: długość ${minutes} min – do wyboru ${DUTY_MINUTES.join(', ')}`);
  const t0 = start * 3600, t1 = t0 + minutes * 60;
  const last = t1 - (minutes <= 30 ? DUTY_EDGE.endShort : DUTY_EDGE.end);
  const period = patternPeriod(station);
  const groups = patternGroups(station);
  const exits = station.exits || {};
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

  // powtórzenia wzorca, które sięgają okna służby
  const span = groups.flatMap((g) => g.trains.flatMap((e) => [firstOf(e), lastOf(e)]));
  const lo = Math.min(...span), hi = Math.max(...span);
  const candidates = [];
  for (let n = Math.floor((t0 - hi) / period); n <= Math.ceil((t1 - lo) / period); n++) {
    for (const g of groups) {
      const shift = n * period;
      const a = Math.min(...g.trains.map(firstOf)) + shift, b = Math.max(...g.trains.map(lastOf)) + shift;
      const standing = g.trains.some((e) => e.startOn);
      // pociąg stojący od początku zmiany (startOn) – tylko gdy odjeżdża w pierwszym okresie wzorca od startu
      if (g.trains.some((e) => firstOf(e) + shift < t0 + leadOf(e)) || b > last || (standing && a > t0 + period)) continue;
      const list = lines.get(g.key);
      candidates.push({ g, n, shift, at: a, course: n * list.length + list.indexOf(g) });
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
    picked.push({ c, trains: g.trains.map((e) => renamed(shifted(e, shift, map.get(String(e.nr)), map), e, n)), tasks: g.tasks.map((k) => shiftedTask(k, shift, tag, map)) });
  };
  for (const c of candidates) {
    const { g, n } = c;
    const band = bandOf(c.at), every = band.every[g.cls];
    const phase = every > 1 ? Math.floor(fraction(seed, `faza|${g.key}`) * every) : 0;
    const runs = every > 0 && (((c.course + phase) % every) + every) % every === 0;
    const skipped = runs && g.cls !== 'agl' && fraction(seed, `brak|${g.head.nr}|${n}`) < DUTY_SKIP;
    if (!runs || skipped) { dropped.push({ ...c, band, skipped }); continue; }
    take(c);
  }
  // pociągi towarowe w miejsce pasażerskich, które o tej porze nie kursują (bez linii aglomeracyjnych)
  // parametry (rodzaj, długość, masa, prędkość) z pociągów towarowych wzorca – bez zdawczych i lokomotyw luzem
  const templates = (station.timetable || []).filter((e) => e.kind === 'tow' && e.from && e.to && e.unit == null && !e.startOn && !e.terminates && !['TK', 'LT', 'TH'].includes(categoryOf(e)));
  // odstęp na szlaku: pociąg towarowy jedzie wolniej niż pasażerski, w którego miejsce wchodzi – od innego pociągu na tym
  // samym szlaku (wjazd albo wyjazd) dzieli go co najmniej czas przejazdu szlaku i `FREIGHT_GAP`
  const clear = (train, at) => picked.every((p) => p.trains.every((o) => {
    const gap = (exit) => lineTime(exit, train.vmax) + FREIGHT_GAP;
    if (o.to && o.to === train.to && Math.abs(lastOf(o) - at) < gap(train.to)) return false;
    if (o.from && o.from === train.from && Math.abs(firstOf(o) - at) < gap(train.from)) return false;
    return true;
  }));
  const addFreight = (force) => { for (const d of dropped) {
    const e = d.g.head;
    if (d.freight || (d.g.cls !== 'reg' && d.g.cls !== 'dal') || d.g.trains.length > 1 || !e.from || !e.to || e.terminates) continue;
    if (!force && fraction(seed, `tow|${e.nr}|${d.n}`) >= d.band.freight) continue;
    const tpl = templates.length ? templates[Math.floor(fraction(seed, `wzor|${e.nr}|${d.n}`) * templates.length)] : GENERIC_FREIGHT;
    const vmax = tpl.vmax ?? GENERIC_FREIGHT.vmax, at = firstOf(e) + d.shift;
    // wolniejszy pociąg sąsiad wyprawia wcześniej – też nie przed startem służby
    if (at < t0 + leadOf(e, vmax) || !clear({ from: e.from, to: e.to, vmax }, at)) continue;
    const nr = free(FREIGHT_NR + Math.floor(fraction(seed, `nr|${e.nr}|${d.n}`) * 400) * 2 + (Number(e.nr) % 2));
    const train = { nr, kind: 'tow', cat: tpl.cat ?? 'TM', name: `Towarowy ${exits[e.from]?.name ?? e.from} – ${exits[e.to]?.name ?? e.to}`,
      from: e.from, to: e.to, arr: stamp(at), track: e.track, stop: false, length: tpl.length, vmax };
    if (tpl.mass != null) train.mass = tpl.mass;
    if (tpl.traction) train.traction = tpl.traction;
    d.freight = true; // miejsce zajęte – drugi raz towarowy tu nie wchodzi
    picked.push({ c: d, freight: true, trains: [train], tasks: [] });
  } };

  // kontrola definicji: pociąg z błędem albo uwagą, jakiej nie ma we wzorcu, wypada. Przy konflikcie dwóch pociągów
  // (tor, szlak) wypada najpierw pociąg towarowy spoza wzorca na tej samej drodze obok w czasie; każda inna uwaga
  // (pociąg sprzed startu, po końcu, zadanie) dotyczy samego pociągu – inne pociągi przez nią nie wypadają
  const pattern = { id: 'wzorzec', name: 'wzorzec', startTime: stamp(Math.max(0, lo - 30 * 60)), endTime: stamp(hi + 60 * 60), timetable: station.timetable, tasks: station.tasks || [] };
  const known = new Set(checkScenario(station, pattern).filter((f) => f.level !== 'info' && f.train != null).map((f) => `${f.code}:${f.train}`));
  const scenario = () => {
    const sc = { id: `${DUTY_ID}-${minutes}`, name: `Służba ${hm(t0)}–${hm(t1)}`, startTime: stamp(t0), endTime: stamp(t1),
      timetable: picked.flatMap((p) => p.trains).sort((a, b) => firstOf(a) - firstOf(b)), tasks: picked.flatMap((p) => p.tasks) };
    if (srk) sc.srk = srk;
    return sc;
  };
  const sameWay = (p, q) => p.trains.some((a) => q.trains.some((b) => (a.from && a.from === b.from) || (a.to && a.to === b.to) || (a.track != null && a.track === b.track)));
  const validate = () => {
    for (let round = 0; round < 40 && picked.length; round++) {
      const fresh = checkScenario(station, scenario()).filter((f) => f.level !== 'info' && !(f.train != null && known.has(`${f.code}:${baseOf.get(String(f.train)) ?? f.train}`)));
      if (!fresh.length) break;
      const out = new Set();
      for (const f of fresh) {
        if (f.train == null) {
          if (f.level === 'error') throw new Error(`Służba ${station.id} ${hm(t0)} / ${minutes} min: ${f.code} – ${f.msg}`);
          continue;
        }
        const own = picked.find((p) => p.trains.some((e) => String(e.nr) === String(f.train)));
        if (!own) continue;
        const near = !own.freight && PAIR_CODE.test(f.code)
          ? picked.filter((p) => p.freight && Math.abs(p.c.at - own.c.at) <= 20 * 60 && sameWay(p, own)).sort((a, b) => Math.abs(a.c.at - own.c.at) - Math.abs(b.c.at - own.c.at))[0]
          : null;
        out.add(near ?? own);
      }
      if (!out.size) break;
      for (const p of out) { picked.splice(picked.indexOf(p), 1); for (const e of p.trains) used.delete(e.nr); }
    }
  };

  addFreight(false);
  validate();
  // Służba bez żadnego pociągu (krótkie okno, środek nocy) – po kolei, każdy krok z kontrolą definicji: wracają pociągi,
  // które wypadły dla urozmaicenia; towarowy wchodzi w każde wolne miejsce; na koniec pojedynczo pociągi wzorca, których
  // klasa o tej porze kursuje (inny kurs linii). Pociąg klasy, która o tej porze nie kursuje, nie wraca.
  if (!picked.length) { for (const d of dropped.filter((x) => x.skipped)) { dropped.splice(dropped.indexOf(d), 1); take(d); } validate(); }
  if (!picked.length) { addFreight(true); validate(); }
  for (const d of dropped.filter((x) => !x.freight && x.band.every[x.g.cls] > 0)) {
    if (picked.length) break;
    take(d); validate();
  }

  const sc = scenario();
  const count = { agl: 0, reg: 0, dal: 0, tow: 0 };
  for (const e of sc.timetable) count[trainClass(e)]++;
  const band = bandOf(t0);
  const parts = [[count.agl, 'SKM'], [count.reg, 'regionalne'], [count.dal, 'dalekobieżne'], [count.tow, 'towarowe']].filter(([n]) => n).map(([n, w]) => `${n} ${w}`);
  // opis pory doby pokazuje strona posterunku (teksty `start.bandDesc.*`) – tu tylko liczby
  sc.description = `Służba o wybranej porze. Pociągi: ${sc.timetable.length}${parts.length ? ` (${parts.join(', ')})` : ''}. Poziom zakłóceń do wyboru.`;
  return { scenario: sc, stats: { band: band.id, trains: sc.timetable.length, ...count } };
}
