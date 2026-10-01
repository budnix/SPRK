import { CATEGORIES, categoryOf } from './categories.js';
import { Random } from '../core/Random.js';

/**
 * Tabor pociągu – tylko do pokazania w rozkładzie i na zakładce „Pociągi” (bez DOM). Nie zmienia prędkości, dynamiki
 * ani niczego w przebiegu zmiany: prędkość i długość pociągu dalej biorą się z wpisu rozkładu i kategorii.
 *
 * `ROLLING_STOCK` – typy pojazdów jeżdżących w rejonie Trójmiasta (źródła: docs/SOURCES.md, „Tabor pociągów”):
 *  - `kind` – rodzaj: `ezt` (elektryczny zespół trakcyjny), `szt` (spalinowy zespół trakcyjny), `lok-e` (lokomotywa
 *    elektryczna), `lok-s` (lokomotywa spalinowa); trakcja rodzaju to litera z zał. 6.3 Regulaminu sieci (J, M, E, S),
 *  - `name` – nazwa handlowa dopisywana do oznaczenia („EU46 Vectron”), `operator` – przewoźnik w rejonie,
 *  - `pools` – pule, z których gra losuje tabor (`skm`, `regio`, `ic`, `eip`, `freight` – lokomotywy liniowe pociągów
 *    towarowych, `shunt` – manewrowe, też do pociągów zdawczych); typ bez puli (`pools: []`) jest tylko do przypięcia
 *    polem `stock` wpisu,
 *  - `length` – długość jednego zespołu [m] (tylko zespoły), `cars` – liczba członów, `maxCount` – najwięcej zespołów
 *    w jednym pociągu (przyjęte: 2; ED160 – 1, bo jazdy dwóch zespołów źródła nie potwierdzają), `vmax` – prędkość
 *    maksymalna wg źródła [km/h] (null – źródło jej nie podaje).
 *
 * Losowanie (przyjęte): każdy pociąg losuje tabor z własnego ciągu losowego z ziarna zmiany i numeru pociągu – ten sam
 * przy tym samym ziarnie, bez losowań zmiany (opóźnień, usterek), więc przebieg zmiany się nie zmienia. Pociąg utworzony
 * ze składu innego (`unit`) ma tabor pociągu, z którego powstał; kolejny pociąg tej samej linii – inny typ niż
 * poprzedni, gdy pasuje więcej typów. Pole `stock` wpisu (typ albo lista typów) przypina tabor.
 */
export const STOCK_KINDS = {
  ezt: { traction: 'J', unit: true },
  szt: { traction: 'M', unit: true },
  'lok-e': { traction: 'E', unit: false },
  'lok-s': { traction: 'S', unit: false },
};

export const ROLLING_STOCK = {
  // elektryczne zespoły trakcyjne SKM Trójmiasto (linia 250) i Polregio (oddział pomorski) – stan na 1.10.2026
  EN57: { kind: 'ezt', operator: 'SKM Trójmiasto, Polregio', pools: ['skm', 'regio'], cars: 3, length: 64.97, maxCount: 2, vmax: 120 },
  EN71: { kind: 'ezt', operator: 'SKM Trójmiasto', pools: ['skm'], cars: 4, length: 86.84, maxCount: 2, vmax: 110 },
  '31WE': { kind: 'ezt', name: 'Impuls', operator: 'SKM Trójmiasto', pools: ['skm'], cars: 4, length: 74.4, maxCount: 2, vmax: null },
  '31WEbb': { kind: 'ezt', name: 'Impuls 2', operator: 'SKM Trójmiasto, Polregio', pools: ['skm', 'regio'], cars: 4, length: 75, maxCount: 2, vmax: 160 },
  '58WE': { kind: 'ezt', name: 'Impuls 2', operator: 'SKM Trójmiasto', pools: ['skm'], cars: 3, length: 77, maxCount: 2, vmax: null },
  '45WE': { kind: 'ezt', name: 'Impuls', operator: 'Polregio', pools: ['regio'], cars: 5, length: 90.4, maxCount: 2, vmax: 160 },
  // spalinowe zespoły trakcyjne Polregio (oddział pomorski) – linie niezelektryfikowane; tylko przypięte polem `stock`
  SA133: { kind: 'szt', operator: 'Polregio', pools: [], cars: 2, length: 41.7, maxCount: 2, vmax: 120 },
  SA136: { kind: 'szt', name: 'Atribo', operator: 'Polregio', pools: [], cars: 3, length: 55.57, maxCount: 2, vmax: 140 },
  SA137: { kind: 'szt', operator: 'Polregio', pools: [], cars: 2, length: 41.8, maxCount: 2, vmax: 120 },
  SA138: { kind: 'szt', operator: 'Polregio', pools: [], cars: 3, length: 58.36, maxCount: 2, vmax: 120 },
  // PKP Intercity – zespoły i lokomotywy pociągów do Gdyni i Gdańska (lato 2026)
  ED250: { kind: 'ezt', name: 'Pendolino', operator: 'PKP Intercity', pools: ['eip'], cars: 7, length: 187.4, maxCount: 2, vmax: 250 },
  ED160: { kind: 'ezt', name: 'Flirt', operator: 'PKP Intercity', pools: ['ic'], cars: 8, length: 152.9, maxCount: 1, vmax: 160 },
  EU160: { kind: 'lok-e', name: 'Griffin', operator: 'PKP Intercity', pools: ['ic'], vmax: 160 },
  EU200: { kind: 'lok-e', name: 'Griffin', operator: 'PKP Intercity', pools: ['ic'], vmax: 200 },
  EP07: { kind: 'lok-e', operator: 'PKP Intercity', pools: ['ic'], vmax: 125 },
  // linia 213 Reda – Hel bez sieci: lokomotywa spalinowa od Gdyni Głównej (zmiana lokomotywy) – tylko przypięta
  '754': { kind: 'lok-s', name: 'Nurek', operator: 'České dráhy (dzierżawa PKP Intercity)', pools: [], vmax: 100 },
  // lokomotywy towarowe – przewoźnicy obecni w portach Gdańska i Gdyni (docs/SOURCES.md)
  ET22: { kind: 'lok-e', operator: 'PKP Cargo', pools: ['freight'], vmax: 125 },
  ET41: { kind: 'lok-e', operator: 'PKP Cargo', pools: ['freight'], vmax: 125 },
  EU07: { kind: 'lok-e', operator: 'PKP Cargo, Captrain Polska', pools: ['freight'], vmax: 125 },
  EU46: { kind: 'lok-e', name: 'Vectron', operator: 'PKP Cargo', pools: ['freight'], vmax: 160 },
  E6ACT: { kind: 'lok-e', name: 'Dragon', operator: 'Orlen Kolej', pools: ['freight'], vmax: 120 },
  E6ACTa: { kind: 'lok-e', name: 'Dragon 2', operator: 'Orlen Kolej, CTL Logistics', pools: ['freight'], vmax: 120 },
  '111Eo': { kind: 'lok-e', name: 'Gama', operator: 'PCC Intermodal', pools: ['freight'], vmax: 160 },
  'Class 66': { kind: 'lok-s', operator: 'Freightliner PL, DB Cargo Polska', pools: ['freight'], vmax: 120 },
  '311D': { kind: 'lok-s', operator: 'DB Cargo Polska, CTL Logistics', pools: ['freight'], vmax: 100 },
  ST44: { kind: 'lok-s', operator: 'PKP Cargo', pools: ['freight'], vmax: 100 },
  ST45: { kind: 'lok-s', operator: 'PKP Cargo', pools: ['freight'], vmax: 120 },
  ST48: { kind: 'lok-s', operator: 'PKP Cargo', pools: ['freight'], vmax: 100 },
  SM42: { kind: 'lok-s', operator: 'PKP Cargo, Orlen Kolej', pools: ['shunt'], vmax: 90 },
  SM48: { kind: 'lok-s', operator: 'PKP Cargo', pools: ['shunt'], vmax: 100 },
};

/**
 * Pule taboru kategorii (przyjęte): pociągi pasażerskie – pula przewoźnika (skład EZT bez pasażerów – zespoły SKM
 * i Regio); towarowe i pojazdy luzem – lokomotywy towarowe o trakcji wpisu (`traction`, domyślnie E).
 */
const CATEGORY_POOLS = { SKM: ['skm'], R: ['regio'], EZT: ['skm', 'regio'], IC: ['ic'], EIC: ['ic'], TLK: ['ic'], EIP: ['eip'] };
/** Pule pociągów towarowych: liniowe lokomotywy towarowe, zdawcze (TK) także manewrowe (przyjęte). */
const FREIGHT_POOLS = { TK: ['freight', 'shunt'] };

/**
 * Tolerancja długości (przyjęte): zespoły pasują do pociągu, gdy ich łączna długość różni się od długości z rozkładu
 * najwyżej o `STOCK_LENGTH_TOLERANCE` tej długości (długości w rozkładach gry są zaokrąglone). Gdy żaden typ nie
 * pasuje, gra bierze zestaw o najmniejszej różnicy.
 */
export const STOCK_LENGTH_TOLERANCE = 0.2;

/** Trakcja pociągu: litera z zał. 6.3 – dla pociągów towarowych i luzem pole `traction` (domyślnie E). */
function tractionOf(entry) {
  return CATEGORIES[categoryOf(entry)].tractions ? (entry.traction ?? 'E') : null;
}

/** Lista typów z pola `stock` (typ albo lista typów) albo null. */
export function pinnedTypes(stock) {
  if (stock == null) return null;
  return Array.isArray(stock) ? stock : [stock];
}

/** Pociąg, z którego składu powstał wpis (łańcuch `unit` do początku), w rozkładzie `timetable`. */
export function rootOf(entry, timetable) {
  let e = entry;
  const seen = new Set([e]);
  while (e.unit != null) {
    const u = timetable.find((x) => String(x.nr) === String(e.unit));
    if (!u || seen.has(u)) break;
    seen.add(u);
    e = u;
  }
  return e;
}

/** Wszystkie pociągi jednego składu (ten sam początek łańcucha `unit`). */
export function chainOf(entry, timetable) {
  const list = timetable.includes(entry) ? timetable : [...timetable, entry];
  const root = rootOf(entry, list);
  return list.filter((x) => x === root || rootOf(x, list) === root);
}

/** Ziarno ciągu losowego pociągu: ziarno zmiany i numer pociągu (FNV-1a). */
function entrySeed(seed, nr) {
  let h = ((seed >>> 0) ^ 0x811c9dc5) >>> 0;
  for (const ch of `tabor:${nr}`) h = Math.imul(h ^ ch.charCodeAt(0), 0x01000193) >>> 0;
  return h;
}

/** Zestaw dla typu: zespoły – liczba dobrana do długości pociągu, lokomotywa – jedna. */
function setOf(id, length) {
  const type = ROLLING_STOCK[id];
  if (!STOCK_KINDS[type.kind].unit) return { id, count: 1, diff: 0 };
  const count = Math.min(type.maxCount ?? 1, Math.max(1, Math.round(length / type.length)));
  return { id, count, diff: Math.abs(count * type.length - length) };
}

/** Typy, z których gra losuje tabor wpisu (bez przypięcia): pule kategorii, trakcja, długość. */
export function candidatesFor(entry) {
  const key = categoryOf(entry);
  const traction = tractionOf(entry);
  const pools = traction ? (FREIGHT_POOLS[key] ?? ['freight']) : (CATEGORY_POOLS[key] ?? []);
  const types = Object.keys(ROLLING_STOCK).filter((id) => {
    const t = ROLLING_STOCK[id];
    if (!t.pools.some((p) => pools.includes(p))) return false;
    // pociągi towarowe: trakcja lokomotywy jak w rodzaju pociągu; pasażerskie: bez przypięcia – elektryczne
    return traction ? STOCK_KINDS[t.kind].traction === traction : ['J', 'E'].includes(STOCK_KINDS[t.kind].traction);
  });
  return fitting(types, entry.length ?? 100);
}

/** Zestawy typów `ids` pasujące długością (w tolerancji), a gdy żaden nie pasuje – zestawy o najmniejszej różnicy. */
function fitting(ids, length) {
  const sets = ids.map((id) => setOf(id, length));
  const fit = sets.filter((s) => s.diff <= STOCK_LENGTH_TOLERANCE * length);
  if (fit.length || !sets.length) return fit;
  const best = Math.min(...sets.map((s) => s.diff));
  return sets.filter((s) => s.diff === best);
}

/** Linia pociągu (przyjęte): ta sama kategoria i te same szlaki wjazdu i wyjazdu (`from`, `to`). */
function lineKey(e) {
  return `${categoryOf(e)}|${e.from ?? ''}|${e.to ?? ''}`;
}

/** Kolejność pociągów linii: godzina przyjazdu albo odjazdu („GG:MM”), potem numer. */
function byTime(a, b) {
  const ta = a.arr ?? a.dep ?? '', tb = b.arr ?? b.dep ?? '';
  return ta < tb ? -1 : ta > tb ? 1 : String(a.nr).localeCompare(String(b.nr));
}

/** Zestawy, z których losuje się tabor składu o początku `root`: przypięte (`stock` w łańcuchu) albo z puli. */
function setsFor(root, list, roots) {
  const pinned = list.find((x) => roots.get(x) === root && x.stock != null);
  const length = root.length ?? 100;
  return pinned ? fitting(pinnedTypes(pinned.stock).filter((id) => ROLLING_STOCK[id]), length) : candidatesFor(root);
}

/**
 * Tabor pociągu `entry` w rozkładzie `timetable` przy ziarnie zmiany `seed`:
 * { id, count, kind, unit, label } („2 × EN57”, „EU46 Vectron”) albo null, gdy katalog nie ma typu dla pociągu.
 * Pociąg utworzony ze składu innego (`unit`) ma tabor pociągu, z którego powstał. Kolejne pociągi jednej linii
 * (`lineKey`, w kolejności godzin) losują tabor po kolei: następny nie dostaje typu poprzedniego, gdy pasuje inny;
 * pociąg nadzwyczajny (`extra`) losuje osobno, więc jego dodanie nie zmienia taboru pokazanego już pociągom.
 */
export function stockFor(entry, timetable, seed) {
  const list = timetable.includes(entry) ? timetable : [...timetable, entry];
  const roots = new Map(list.map((x) => [x, rootOf(x, list)]));
  const root = roots.get(entry);
  const key = lineKey(root);
  // pociąg nadzwyczajny (`extra`, dodany w trakcie zmiany) losuje sam – nie zmienia taboru pociągów z rozkładu
  const line = root.extra ? [root] : list.filter((x) => roots.get(x) === x && !x.extra && lineKey(x) === key).sort(byTime);
  let prev = null, pick = null;
  for (const x of line) {
    const sets = setsFor(x, list, roots);
    const other = sets.filter((s) => s.id !== prev);
    pick = sets.length ? new Random(entrySeed(seed, x.nr)).pick(other.length ? other : sets) : null;
    if (x === root) break;
    prev = pick?.id ?? null;
  }
  if (!pick) return null;
  const type = ROLLING_STOCK[pick.id];
  const name = type.name ? `${pick.id} ${type.name}` : pick.id;
  return { id: pick.id, count: pick.count, kind: type.kind, unit: STOCK_KINDS[type.kind].unit, label: pick.count > 1 ? `${pick.count} × ${name}` : name };
}
