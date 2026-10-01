import { CATEGORIES, MAX_TONNES_PER_METRE, categoryOf, dynamicsFor, speedFor, tractionOf } from './categories.js';
import { Random, mixSeed } from '../core/Random.js';
import { Clock } from '../core/Clock.js';

/**
 * Tabor pociągu (bez DOM): pokazywany w rozkładzie i na zakładce „Pociągi”, a w ruchu daje pociągowi dynamikę
 * (`trainDynamics`: przyspieszenie, ograniczenie mocą, hamowanie, prędkość pojazdu). `Traffic` wybiera tabor raz, przy
 * tworzeniu rozkładu zmiany (`stockPlan`), i zapisuje go we wpisie (`rollingStock`) – z nim jedzie pociąg i ten sam
 * pokazuje panel. Długość pociągu dalej bierze się z wpisu rozkładu.
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
 *    maksymalna wg źródła [km/h] (null – źródło jej nie podaje),
 *  - dynamika (wartości ze źródeł, null – źródło ich nie podaje, gra bierze wartość kategorii): zespoły – `accel`
 *    przyspieszenie rozruchu [m/s²], `brake` opóźnienie hamowania służbowego [m/s²] (z wymagań zamówień – przyjęte;
 *    null – `UNIT_BRAKE`); lokomotywy – `tractive` siła
 *    pociągowa rozruchowa [kN], `bufferLength` długość ze zderzakami [m]; oba – `mass` masa [t] (zespoły – własna,
 *    lokomotywy – służbowa), `power` moc do jazdy [kW] (ciągła; spalinowe – trakcyjna, a gdy źródło jej nie podaje –
 *    moc silnika).
 *
 * Losowanie (przyjęte): `Traffic` wybiera tabor raz, dla całego rozkładu zmiany (`stockPlan`); każdy pociąg losuje
 * z własnego ciągu z ziarna zmiany i numeru pociągu – ten sam przy tym samym ziarnie, bez losowań zmiany (opóźnień,
 * usterek). Pociąg utworzony ze składu innego (`unit`) ma tabor pociągu, z którego powstał; kolejny pociąg tej samej
 * linii – inny typ niż poprzedni, gdy pasuje więcej typów. Pole `stock` wpisu (typ albo lista typów) przypina tabor.
 */
export const STOCK_KINDS = {
  ezt: { traction: 'J', unit: true },
  szt: { traction: 'M', unit: true },
  'lok-e': { traction: 'E', unit: false },
  'lok-s': { traction: 'S', unit: false },
};

export const ROLLING_STOCK = {
  // elektryczne zespoły trakcyjne SKM Trójmiasto (linia 250) i Polregio (oddział pomorski) – stan na 1.10.2026
  EN57: { kind: 'ezt', operator: 'SKM Trójmiasto, Polregio', pools: ['skm', 'regio'], cars: 3, length: 64.97, maxCount: 2, vmax: 120, accel: 0.5, brake: 0.8, mass: 123, power: 608 },
  EN71: { kind: 'ezt', operator: 'SKM Trójmiasto', pools: ['skm'], cars: 4, length: 86.84, maxCount: 2, vmax: 110, accel: null, brake: null, mass: 178, power: null },
  '31WE': { kind: 'ezt', name: 'Impuls', operator: 'SKM Trójmiasto', pools: ['skm'], cars: 4, length: 74.4, maxCount: 2, vmax: 160, accel: 1.0, brake: 0.89, mass: 145, power: 2000 },
  '31WEbb': { kind: 'ezt', name: 'Impuls 2', operator: 'SKM Trójmiasto, Polregio', pools: ['skm', 'regio'], cars: 4, length: 75, maxCount: 2, vmax: 160, accel: null, brake: null, mass: 145, power: null },
  '58WE': { kind: 'ezt', name: 'Impuls 2', operator: 'SKM Trójmiasto', pools: ['skm'], cars: 3, length: 77, maxCount: 2, vmax: null, accel: 1.1, brake: null, mass: 165.5, power: null },
  '45WE': { kind: 'ezt', name: 'Impuls', operator: 'Polregio', pools: ['regio'], cars: 5, length: 90.4, maxCount: 2, vmax: 160, accel: 1.0, brake: 1.08, mass: 168, power: 2000 },
  // spalinowe zespoły trakcyjne Polregio (oddział pomorski) – linie niezelektryfikowane; tylko przypięte polem `stock`
  SA133: { kind: 'szt', operator: 'Polregio', pools: [], cars: 2, length: 41.7, maxCount: 2, vmax: 120, accel: null, brake: null, mass: 82, power: 764 },
  SA136: { kind: 'szt', name: 'Atribo', operator: 'Polregio', pools: [], cars: 3, length: 55.57, maxCount: 2, vmax: 140, accel: null, brake: null, mass: 108, power: 764 },
  SA137: { kind: 'szt', operator: 'Polregio', pools: [], cars: 2, length: 41.8, maxCount: 2, vmax: 120, accel: 0.45, brake: null, mass: 82, power: 780 },
  SA138: { kind: 'szt', operator: 'Polregio', pools: [], cars: 3, length: 58.36, maxCount: 2, vmax: 120, accel: 0.45, brake: null, mass: 105, power: 780 },
  // PKP Intercity – zespoły i lokomotywy pociągów do Gdyni i Gdańska (lato 2026)
  ED250: { kind: 'ezt', name: 'Pendolino', operator: 'PKP Intercity', pools: ['eip'], cars: 7, length: 187.4, maxCount: 2, vmax: 250, accel: 0.49, brake: null, mass: 410, power: 5664 },
  ED160: { kind: 'ezt', name: 'Flirt', operator: 'PKP Intercity', pools: ['ic'], cars: 8, length: 152.9, maxCount: 1, vmax: 160, accel: 0.6, brake: null, mass: 257, power: 2000 },
  EU160: { kind: 'lok-e', name: 'Griffin', operator: 'PKP Intercity', pools: ['ic'], vmax: 160, tractive: 310, mass: 79, bufferLength: 19.9, power: 5600 },
  EU200: { kind: 'lok-e', name: 'Griffin', operator: 'PKP Intercity', pools: ['ic'], vmax: 200, tractive: 310, mass: 88, bufferLength: 19.9, power: 5600 },
  EP07: { kind: 'lok-e', operator: 'PKP Intercity', pools: ['ic'], vmax: 125, tractive: 211, mass: 80, bufferLength: 15.915, power: 2000 },
  // linia 213 Reda – Hel bez sieci: lokomotywa spalinowa od Gdyni Głównej (zmiana lokomotywy) – tylko przypięta
  '754': { kind: 'lok-s', name: 'Nurek', operator: 'České dráhy (dzierżawa PKP Intercity)', pools: [], vmax: 100, tractive: 180, mass: 74.4, bufferLength: 16.54, power: 1325 },
  // lokomotywy towarowe – przewoźnicy obecni w portach Gdańska i Gdyni (docs/SOURCES.md)
  ET22: { kind: 'lok-e', operator: 'PKP Cargo', pools: ['freight'], vmax: 125, tractive: 411, mass: 120, bufferLength: 19.24, power: 3000 },
  ET41: { kind: 'lok-e', operator: 'PKP Cargo', pools: ['freight'], vmax: 125, tractive: 550, mass: 167, bufferLength: 31.86, power: 4000 },
  EU07: { kind: 'lok-e', operator: 'PKP Cargo', pools: ['freight'], vmax: 125, tractive: 280, mass: 80, bufferLength: 15.915, power: 2000 },
  EU46: { kind: 'lok-e', name: 'Vectron', operator: 'PKP Cargo', pools: ['freight'], vmax: 160, tractive: 300, mass: 87, bufferLength: 18.98, power: 6000 },
  E6ACT: { kind: 'lok-e', name: 'Dragon', operator: 'Orlen Kolej', pools: ['freight'], vmax: 120, tractive: 375, mass: 119, bufferLength: 20.33, power: 5000 },
  E6ACTa: { kind: 'lok-e', name: 'Dragon 2', operator: 'Orlen Kolej, CTL Logistics', pools: ['freight'], vmax: 120, tractive: 410, mass: 119, bufferLength: 20.33, power: 5000 },
  '111Eo': { kind: 'lok-e', name: 'Gama', operator: 'PCC Intermodal', pools: ['freight'], vmax: 160, tractive: null, mass: null, bufferLength: null, power: 5600 },
  'Class 66': { kind: 'lok-s', operator: 'Freightliner PL, DB Cargo Polska', pools: ['freight'], vmax: 120, tractive: 409, mass: 129.6, bufferLength: 21.4, power: 1850 },
  '311D': { kind: 'lok-s', operator: 'DB Cargo Polska, CTL Logistics', pools: ['freight'], vmax: 100, tractive: 392, mass: 120, bufferLength: 17.55, power: 2133 },
  ST44: { kind: 'lok-s', operator: 'PKP Cargo', pools: ['freight'], vmax: 100, tractive: 375, mass: 116.5, bufferLength: 17.55, power: 1271 },
  ST45: { kind: 'lok-s', operator: 'PKP Cargo', pools: ['freight'], vmax: 120, tractive: 330, mass: 97, bufferLength: 18.99, power: 1300 },
  ST48: { kind: 'lok-s', operator: 'PKP Cargo', pools: ['freight'], vmax: 100, tractive: 372.8, mass: 116, bufferLength: 16.97, power: 1550 },
  SM42: { kind: 'lok-s', operator: 'PKP Cargo, Orlen Kolej', pools: ['shunt'], vmax: 90, tractive: 219, mass: 74, bufferLength: 14.24, power: 590 },
  SM48: { kind: 'lok-s', operator: 'PKP Cargo', pools: ['shunt'], vmax: 100, tractive: 372.8, mass: 116, bufferLength: 16.97, power: 882 },
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

/** Lista typów z pola `stock` (typ albo lista typów) albo null. */
export function pinnedTypes(stock) {
  if (stock == null) return null;
  return Array.isArray(stock) ? stock : [stock];
}

/**
 * Pociąg, od którego zaczyna się skład wpisu (łańcuch `unit` do początku), w rozkładzie `timetable`. Zapętlony łańcuch
 * (błąd walidacji – `unitLoop`): początkiem jest pociąg pętli stojący najwcześniej w rozkładzie – ten sam dla całej pętli.
 */
export function rootOf(entry, timetable) {
  const path = [entry];
  let e = entry;
  while (e.unit != null) {
    const u = timetable.find((x) => String(x.nr) === String(e.unit));
    if (!u) break;
    const at = path.indexOf(u);
    if (at >= 0) return path.slice(at).reduce((a, b) => (timetable.indexOf(b) < timetable.indexOf(a) ? b : a));
    path.push(u);
    e = u;
  }
  return e;
}

/** Czy łańcuch `unit` od wpisu wraca do pociągu, który już był (pętla – błąd rozkładu). */
export function unitLoop(entry, timetable) {
  const seen = new Set([entry]);
  for (let e = entry; e.unit != null;) {
    e = timetable.find((x) => String(x.nr) === String(e.unit));
    if (!e) return false;
    if (seen.has(e)) return true;
    seen.add(e);
  }
  return false;
}

/** Wszystkie pociągi jednego składu (ten sam początek łańcucha `unit`). */
export function chainOf(entry, timetable) {
  const list = timetable.includes(entry) ? timetable : [...timetable, entry];
  const root = rootOf(entry, list);
  return list.filter((x) => x === root || rootOf(x, list) === root);
}

/** Zestaw dla typu: zespoły – liczba dobrana do długości pociągu, lokomotywa – jedna. */
function setOf(id, length) {
  const type = ROLLING_STOCK[id];
  if (!STOCK_KINDS[type.kind].unit) return { id, count: 1, diff: 0 };
  const count = Math.min(type.maxCount ?? 1, Math.max(1, Math.round(length / type.length)));
  return { id, count, diff: Math.abs(count * type.length - length) };
}

/**
 * Typy, z których gra losuje tabor wpisu (bez przypięcia): pule kategorii, trakcja, prędkość, długość. Prędkość
 * (przyjęte): przewoźnik daje pojazd, który pojedzie z prędkością z rozkładu – typ wolniejszy niż pociąg
 * (`vmax` typu < `speedFor`) wchodzi tylko wtedy, gdy żaden typ puli nie jest dość szybki.
 */
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
  const v = speedFor(entry);
  const fast = types.filter((id) => ROLLING_STOCK[id].vmax == null || ROLLING_STOCK[id].vmax >= v);
  return fitting(fast.length ? fast : types, entry.length ?? 100);
}

/** Zestawy typów `ids` pasujące długością (w tolerancji), a gdy żaden nie pasuje – zestawy o najmniejszej różnicy. */
function fitting(ids, length) {
  const sets = ids.map((id) => setOf(id, length));
  const fit = sets.filter((s) => s.diff <= STOCK_LENGTH_TOLERANCE * length);
  if (fit.length || !sets.length) return fit;
  const best = Math.min(...sets.map((s) => s.diff));
  return sets.filter((s) => s.diff === best);
}

/**
 * Zestawy, z których losuje tabor skład o początku `root`: przypięte (`stock` w łańcuchu) – każdy typ z listy, z liczbą
 * zespołów najbliższą długości pociągu (lista to wybór autora stacji, więc tolerancja długości jej nie zawęża); inaczej
 * typy z puli pasujące długością. Klucze spoza katalogu (także dziedziczone, np. „constructor”) są pomijane.
 */
function setsFor(root, pinned) {
  const length = root.length ?? 100;
  if (pinned == null) return candidatesFor(root);
  return [...new Set(pinnedTypes(pinned))].filter((id) => Object.hasOwn(ROLLING_STOCK, id)).map((id) => setOf(id, length));
}

/**
 * Linia pociągu (przyjęte): ta sama kategoria i te same szlaki wjazdu i wyjazdu (`from`, `to`); pociąg, który zaczyna
 * albo kończy bieg na stacji (bez `from` albo `to`), jest sam – szlak z jednej strony nie odróżnia relacji (do Gdańska
 * Gł. jednym szlakiem wjeżdżają pociągi z Helu i z Kartuz). null – linia z jednego pociągu.
 */
export function lineKey(e) {
  if (e.from == null || e.to == null) return null;
  return `${categoryOf(e)}|${e.from}|${e.to}`;
}

/** Godzina pociągu w sekundach: przyjazd, a pociąg zaczynający bieg – odjazd. */
function timeOf(e) {
  return Clock.parse(e.arr ?? e.dep);
}

/** Kolejność pociągów linii: godzina (liczbowo, „9:58” przed „10:05”), potem numer. */
export function byTime(a, b) {
  return timeOf(a) - timeOf(b) || String(a.nr).localeCompare(String(b.nr));
}

/** Opis zestawu: { id, count, kind, unit, label } („2 × EN57”, „EU46 Vectron”). */
function describe(pick) {
  const type = ROLLING_STOCK[pick.id];
  const name = type.name ? `${pick.id} ${type.name}` : pick.id;
  return { id: pick.id, count: pick.count, kind: type.kind, unit: STOCK_KINDS[type.kind].unit, label: pick.count > 1 ? `${pick.count} × ${name}` : name };
}

/**
 * Tabor wszystkich pociągów rozkładu `timetable` przy ziarnie zmiany `seed`: Map wpis → { id, count, kind, unit, label }
 * albo null, gdy katalog nie ma typu dla pociągu. Pociąg utworzony ze składu innego (`unit`) ma tabor pociągu, z którego
 * powstał. Kolejne pociągi jednej linii (`lineKey`, w kolejności `byTime`) losują po kolei: następny nie dostaje typu
 * poprzedniego, gdy pasuje inny. Każdy pociąg losuje z własnego ciągu (`mixSeed` z ziarna i numeru).
 */
export function stockPlan(timetable, seed) {
  const roots = new Map(timetable.map((x) => [x, rootOf(x, timetable)]));
  const pinned = new Map();
  for (const x of timetable) if (x.stock != null && !pinned.has(roots.get(x))) pinned.set(roots.get(x), x.stock);
  const lines = new Map();
  for (const x of timetable) {
    if (roots.get(x) !== x) continue;
    const key = lineKey(x) ?? x;
    if (!lines.has(key)) lines.set(key, []);
    lines.get(key).push(x);
  }
  const picks = new Map();
  for (const line of lines.values()) {
    let prev = null;
    for (const x of line.sort(byTime)) {
      const sets = setsFor(x, pinned.get(x));
      const other = sets.filter((s) => s.id !== prev);
      const pick = sets.length ? new Random(mixSeed(seed, `tabor:${x.nr}`)).pick(other.length ? other : sets) : null;
      picks.set(x, pick ? describe(pick) : null);
      prev = pick?.id ?? null;
    }
  }
  return new Map(timetable.map((x) => [x, picks.get(roots.get(x)) ?? null]));
}

/** Tabor pociągu `entry` w rozkładzie `timetable` przy ziarnie `seed` (jak w `stockPlan`). */
export function stockFor(entry, timetable, seed) {
  const list = timetable.includes(entry) ? timetable : [...timetable, entry];
  return stockPlan(list, seed).get(entry);
}

/**
 * Wagon pasażerski pociągu z lokomotywą: długość ze zderzakami [m] i masa [t] (źródła: docs/SOURCES.md, „Tabor
 * pociągów – dynamika”). Liczba wagonów = (długość pociągu − długość lokomotywy) / `COACH_LENGTH`, zaokrąglona.
 */
export const COACH_LENGTH = 26.4;
export const COACH_MASS = 50;
/**
 * Najwyższe przyspieszenie pociągu z lokomotywą [m/s²] (przyjęte): siła rozruchowa lokomotywy podzielona przez masę
 * daje dla lokomotywy luzem albo krótkiego składu wartości, których pojazd nie osiąga (poślizg kół, wygoda podróżnych).
 */
export const LOCO_ACCEL_MAX = 1.0;

/** Masa ciągnięta przez lokomotywę [t]: pociąg towarowy – `mass` wpisu; pasażerski – wagony z długości pociągu. */
export function trailingMass(entry, type) {
  if (CATEGORIES[categoryOf(entry)].tractions) return entry.mass ?? 0;
  if (COACH_MASS == null || type.bufferLength == null) return null;
  const coaches = Math.max(0, Math.round(((entry.length ?? 100) - type.bufferLength) / COACH_LENGTH));
  return coaches * COACH_MASS;
}

/**
 * Hamowanie (docs/SOURCES.md, „Hamowanie jak maszynista”). Drogi hamowania wg prędkości (Ie-4 §8 ust. 4, zakres
 * zasadniczy): do 60 km/h – 400 m, do 100 – 700 m, do 140 – 1000 m, do 160 – 1300 m (powyżej – 1300 m, przyjęte).
 */
export const BRAKING_DISTANCES = [[60, 400], [100, 700], [140, 1000], [160, 1300]];
/** Równoważny czas narastania hamowania we wzorze EN 14531-1 (a = v² / 2(S − Te·v)): 2 s (UTP WAG, tabl. C.3). */
export const EN14531_TE = 2;
/** Opóźnienie na 1 % masy hamującej [m/s²]: UTP WAG tabl. C.3 przy 100 km/h – 65 % → 0,60; 100 % → 0,91; 125 % → 1,15. */
export const DECEL_PER_PERCENT = 0.0091;
/** Masa hamująca wagonów towarowych [%]: próżne 100, ładowne 65 (UTP WAG tabl. C.3 – najmniejsze λ), w G najwyżej 80. */
export const LAMBDA_EMPTY = 100;
export const LAMBDA_LOADED = 65;
export const LAMBDA_G_MAX = 80;
/** Największe opóźnienie hamowania służbowego [m/s²] (wymagania KM dla 45WE: „Maksymalne opóźnienie hamowania: 1,2 m/s²”). */
export const SERVICE_BRAKE_MAX = 1.2;
/**
 * Hamowanie służbowe zespołu trakcyjnego bez danych typu [m/s²] (przyjęte): dolna granica wymagań polskich zamówień na
 * zespoły – SKM Trójmiasto 2010 (modernizacja EN57) „0,8 – 1,1”, Koleje Śląskie 2012 (SZT) „od 0,9 do 1,1”, ŁKA 2020
 * „od 0,9 m/s2 do 1,2 m/s2”.
 */
export const UNIT_BRAKE = 0.8;
/**
 * Czas od decyzji maszynisty do pełnego hamowania [s] – wyprzedzenie w krzywej hamowania: zespół trakcyjny 2 s
 * (EN 14531-1 jak wyżej), hamulec P / R 5 s (ERA, przykłady: pociąg pasażerski 83 m – 5,02 s, towarowy P 400 m – 5,0 s),
 * G 12,8 s (towarowy G 600 m); pociąg towarowy dłuższy niż 300 m – dodatkowo ok. 10 s wyłączenia siły pociągowej przed
 * hamowaniem (ALZA-W2 §40).
 */
export const BRAKE_DELAY = { unit: 2, P: 5, G: 12.8 };
export const FREIGHT_COAST = 10;
export const LONG_FREIGHT = 300;

/** Droga hamowania dla prędkości `kmh` (Ie-4 §8 ust. 4). */
export function brakingDistanceFor(kmh) {
  for (const [max, s] of BRAKING_DISTANCES) if (kmh <= max) return s;
  return BRAKING_DISTANCES.at(-1)[1];
}

/** Opóźnienie [m/s²], z którym pociąg z prędkości `kmh` staje na drodze `s` (EN 14531-1, Te = `EN14531_TE`). */
export function decelForDistance(kmh, s) {
  const v = kmh / 3.6;
  return (v * v) / (2 * (s - EN14531_TE * v));
}

/**
 * Hamowanie pociągu: { brake – opóźnienie hamowania służbowego [m/s²], brakeDelay – czas do pełnego hamowania [s],
 * ease – czy maszynista może luzować przed zatrzymaniem, regime – nastawienie hamulca }.
 *  - zespół trakcyjny: opóźnienie typu (`brake`), inaczej `UNIT_BRAKE`;
 *  - pociąg pasażerski z lokomotywą (R): z drogi hamowania dla prędkości pociągu – skład ma masę hamującą wymaganą dla
 *    tej prędkości (Ir-1 §21: wymagany procent masy hamującej rośnie z prędkością);
 *  - pociąg towarowy: masa hamująca z ładunku – λ od 100 % (próżne) do 65 % przy 7,2 t/m (najcięższy skład), P przy
 *    składzie ponad 500 m razy 1,00…0,90 przy 700 m (MKT-4 §52), G (skład ponad 700 m albo ponad 4000 t – ALZA-W2 §16)
 *    najwyżej 80 %; opóźnienie = `DECEL_PER_PERCENT` × λ; pociąg dłuższy niż 300 m nie luzuje przed zatrzymaniem
 *    (ALZA-W2 §40 ust. 5, §41);
 *  - wszystko najwyżej `SERVICE_BRAKE_MAX`.
 */
export function brakingOf(entry, stock, kmh = trainSpeed(entry, stock)) {
  const type = typeOf(stock);
  const freight = !!CATEGORIES[categoryOf(entry)].tractions;
  const length = entry.length ?? 100;
  if (freight) {
    const consist = Math.max(1, length - (type?.bufferLength ?? 0));
    const perMetre = entry.mass > 0 ? entry.mass / consist : 0;
    let lambda = LAMBDA_EMPTY - (LAMBDA_EMPTY - LAMBDA_LOADED) * Math.min(1, perMetre / MAX_TONNES_PER_METRE);
    const regime = length > 700 || (entry.mass ?? 0) > 4000 ? 'G' : 'P';
    if (regime === 'G') lambda = Math.min(lambda, LAMBDA_G_MAX);
    else if (length > 500) lambda *= 1 - 0.1 * Math.min(1, (length - 500) / 200);
    const long = length > LONG_FREIGHT;
    return { brake: Math.min(SERVICE_BRAKE_MAX, DECEL_PER_PERCENT * lambda), brakeDelay: BRAKE_DELAY[regime] + (long ? FREIGHT_COAST : 0), ease: !long, regime };
  }
  if (type && STOCK_KINDS[type.kind].unit) {
    return { brake: Math.min(SERVICE_BRAKE_MAX, type.brake ?? UNIT_BRAKE), brakeDelay: BRAKE_DELAY.unit, ease: true, regime: 'EP' };
  }
  return { brake: Math.min(SERVICE_BRAKE_MAX, decelForDistance(kmh, brakingDistanceFor(kmh))), brakeDelay: BRAKE_DELAY.P, ease: true, regime: 'R' };
}

/** Typ taboru zestawu `stock` (wynik `stockFor`) albo null. */
function typeOf(stock) {
  return stock && Object.hasOwn(ROLLING_STOCK, stock.id) ? ROLLING_STOCK[stock.id] : null;
}

/**
 * Prędkość maksymalna pociągu z taborem [km/h]: `speedFor(entry)`, a gdy typ taboru jeździ wolniej (`vmax` typu) –
 * prędkość typu. Tę prędkość pokazuje panel i z nią jedzie pociąg.
 */
export function trainSpeed(entry, stock) {
  const v = speedFor(entry);
  const max = typeOf(stock)?.vmax;
  return max != null && max < v ? max : v;
}

/**
 * Prędkość [km/h] i dynamika pociągu `entry` z taborem `stock` (wynik `stockFor` albo null):
 * { vmax [km/h], accel [m/s²] – przyspieszenie przy ruszaniu, brake [m/s²], power [kW/t] – moc na tonę masy pociągu
 * albo null }. Przy prędkości v [m/s] pociąg przyspiesza najwyżej min(accel, power / v) (`Train.accelAt`): siła
 * pociągowa maleje z prędkością, bo moc pojazdu jest stała.
 *  - prędkość: `trainSpeed` (prędkość typu, gdy jest mniejsza niż pociągu);
 *  - zespół trakcyjny: przyspieszenie rozruchu i hamowanie służbowe typu (null – kategorii), moc / masa zespołu; kilka
 *    zespołów w pociągu przyspiesza jak jeden (każdy zespół ma własny napęd i własną masę);
 *  - lokomotywa: przyspieszenie = siła rozruchowa / (masa lokomotywy + masa ciągnięta), najwyżej `LOCO_ACCEL_MAX`;
 *    moc lokomotywy / (masa lokomotywy + masa ciągnięta); hamowanie – kategorii (Ir-1 §21: hamulce dobiera się do drogi
 *    hamowania, nie do masy); bez siły albo masy lokomotywy w źródle – przyspieszenie jak bez taboru;
 *  - bez taboru – kategoria (`dynamicsFor`: przyspieszenie przeliczone na masę składu), bez ograniczenia mocą.
 * Pola `accel` / `brake` wpisu mają pierwszeństwo; z `accel` wpisu pociąg przyspiesza stale (bez ograniczenia mocą).
 */
export function trainDynamics(entry, stock) {
  const base = dynamicsFor(entry);
  const vmax = trainSpeed(entry, stock);
  const type = typeOf(stock);
  if (!type) {
    // bez taboru: przyspieszenie i hamowanie kategorii; czas do pełnego hamowania jak hamulec P (przyjęte)
    const freight = !!CATEGORIES[categoryOf(entry)].tractions;
    const long = freight && (entry.length ?? 100) > LONG_FREIGHT;
    return { vmax, accel: base.accel, brake: base.brake, power: null, brakeDelay: BRAKE_DELAY.P + (long ? FREIGHT_COAST : 0), ease: !long };
  }
  const cat = CATEGORIES[categoryOf(entry)];
  const brk = brakingOf(entry, stock, vmax);
  let accel = base.accel, power = null;
  if (STOCK_KINDS[type.kind].unit) {
    accel = type.accel ?? cat.accel;
    if (type.power != null && type.mass != null) power = type.power / type.mass;
  } else {
    const load = trailingMass(entry, type);
    if (type.mass != null && load != null) {
      if (type.tractive != null) accel = Math.min(LOCO_ACCEL_MAX, type.tractive / (type.mass + load));
      if (type.power != null) power = type.power / (type.mass + load);
    }
  }
  return { vmax, accel: entry.accel ?? accel, brake: entry.brake ?? brk.brake, power: entry.accel != null ? null : power, brakeDelay: brk.brakeDelay, ease: brk.ease };
}
