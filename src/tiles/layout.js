/**
 * Budowa planu stacji – kostki pulpitu (`tiles`) i odcinki izolowane (`sections`) w definicji stacji
 * (`src/stations/<id>.js`, format: docs/STATION-FORMAT.md). Jedno miejsce dla konwencji, które dotąd każda stacja
 * przepisywała po swojemu: nazwy odcinków (`Iz<n>` – zwrotnica, `Zb<id>` – odcinek zbliżania szlaku, `S<id>` –
 * żeberko), długości domyślne (zwrotnica 60 m, odcinek zbliżania 400 m, żeberko 30 m, odcinek prosty 20 m na kostkę),
 * przyciski końca przebiegu (`k<id>`: zielony przy szlaku, biały przy żeberku) i kolejność kostek (z zachodu na wschód).
 *
 * Kostki: `track`, `run`, `signal`, `buffer`, `pointTile` – czyste konstruktory, także jako eksport modułu.
 * Plan: `createLayout()` – kostki i odcinki jednej stacji razem z częściami złożonymi (`point`, `diag`, `plain`, `stub`,
 * `crossover`, `lineExit`), które dopisują kostkę i jej odcinek naraz, więc się nie rozjadą. Nowa stacja: skill
 * `nowa-stacja`. Moduł logiki: bez DOM.
 */

/** Kostka toru na polu (x, y) z portami `ports` (np. ['W', 'E']) w odcinku `section`. */
export const track = (x, y, ports, section, extra = {}) => ({ x, y, type: 'track', ports, section, ...extra });

/** Odcinek toru prosty: kostki od x1 do x2 (włącznie) w wierszu y. */
export const run = (x1, x2, y, section, extra = {}) => Array.from({ length: x2 - x1 + 1 }, (_, i) => track(x1 + i, y, ['W', 'E'], section, extra));

/** Sygnalizator na polu (x, y) przy kostce toru `at`, zwrócony w kierunku `dir` (semafor, tarcza manewrowa …). */
export const signal = (x, y, id, kind, at, dir, extra = {}) => ({ x, y, type: 'signal', id, kind, at, dir, ...extra });

/** Kozioł oporowy z białym przyciskiem końca przebiegu `endId`. */
export const buffer = (x, y, port, section, endId) => ({ x, y, type: 'buffer', port, section, endButton: { id: endId, color: 'white' } });

/** Kostka zwrotnicy: `id` (np. 'Zw12'), napis `label`, porty ostrza i kierunków zasadniczego / zwrotnego, odcinek. */
export const pointTile = (x, y, id, label, toe, straight, diverge, section, extra = {}) => ({ x, y, type: 'point', id, label, toe, straight, diverge, section, ...extra });

/** Domyślne długości odcinków [m]. */
export const LENGTHS = Object.freeze({ point: 60, approach: 400, siding: 30, perTile: 20 });

/**
 * Plan jednej stacji: `tiles` i `sections` do wpisania w definicję i części, które je wypełniają. Funkcje nie używają
 * `this` – można je wyjąć: `const { tiles, sections, point, lineExit } = createLayout();`.
 */
export function createLayout() {
  const tiles = [];
  const sections = {};
  /** Odcinek izolowany `id` (długość, rodzaj, tor, peron – docs/STATION-FORMAT.md „Odcinki izolowane”); zwraca id. */
  const section = (id, def) => { sections[id] = def; return id; };
  const add = (...t) => { tiles.push(...t); };

  /**
   * Zwrotnica numer `n`: kostka `Zw<n>` z napisem „n” w odcinku `Iz<n>` (rodzaj 'point', długość `length`).
   * Porty: `toe` – ostrze, `straight` / `diverge` – kierunek zasadniczy i zwrotny.
   */
  const point = (x, y, n, toe, straight, diverge, length = LENGTHS.point) => {
    section(`Iz${n}`, { length, kind: 'point' });
    add(pointTile(x, y, `Zw${n}`, String(n), toe, straight, diverge, `Iz${n}`));
  };
  /** Kostka ukośna w odcinku zwrotnicy `n` (`Iz<n>`) – łącznik między torami. */
  const diag = (x, y, ports, n) => add(track(x, y, ports, `Iz${n}`));
  /** Odcinek prosty `id` od x1 do x2 w wierszu y; długość podana albo 20 m na kostkę. */
  const plain = (id, x1, x2, y, length) => {
    section(id, { length: length ?? (x2 - x1 + 1) * LENGTHS.perTile, kind: 'plain' });
    add(...run(x1, x2, y, id));
  };
  /** Żeberko `S<id>` (30 m) zakończone kozłem z białym przyciskiem `k<id>`; `port` – strona, z której wjeżdża tor. */
  const stub = (x, y, port, id) => {
    section(`S${id}`, { length: LENGTHS.siding, kind: 'siding' });
    add(buffer(x, y, port, `S${id}`, `k${id}`));
  };
  /**
   * Przejście między torami: zwrotnica `a` na (xa, ya), kostka ukośna pośrodku (porty `diagPorts`, w odcinku `a`)
   * i zwrotnica `b` na (xb, yb). Kierunek zasadniczy każdej zwrotnicy – przeciwny do ostrza.
   */
  const crossover = (xa, ya, a, toeA, divA, xb, yb, b, toeB, divB, diagPorts) => {
    point(xa, ya, a, toeA, toeA === 'W' ? 'E' : 'W', divA);
    diag((xa + xb) / 2, (ya + yb) / 2, diagPorts, a);
    point(xb, yb, b, toeB, toeB === 'W' ? 'E' : 'W', divB);
  };
  /**
   * Wyjazd na szlak `id` (klucz w `exits` stacji) po stronie `side` ('W' – zachód, 'E' – wschód) w wierszu `y`:
   * odcinek zbliżania `section` (domyślnie `Zb<id>`, 400 m) na kostkach od `from` do `to`; kostka skrajna (zachodnia
   * przy 'W', wschodnia przy 'E') ma zielony przycisk końca przebiegu `k<id>` i nazwę sąsiada `text`.
   */
  const lineExit = ({ side, y, id, text, from, to, section: sid = `Zb${id}`, length = LENGTHS.approach }) => {
    if (side !== 'W' && side !== 'E') throw new Error(`lineExit ${id}: side 'W' albo 'E'`);
    if (!Number.isInteger(from) || !Number.isInteger(to) || to < from) throw new Error(`lineExit ${id}: kolumny from ≤ to`);
    section(sid, { length, kind: 'approach' });
    const end = { ...track(side === 'W' ? from : to, y, ['W', 'E'], sid), endButton: { id: `k${id}`, color: 'green' }, text };
    if (side === 'W') add(end, ...run(from + 1, to, y, sid));
    else add(...run(from, to - 1, y, sid), end);
  };
  return { tiles, sections, section, add, point, diag, plain, stub, crossover, lineExit };
}
