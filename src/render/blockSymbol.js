/**
 * Symbol blokady liniowej na monitorze (Ie-104.1 §8 pkt 20–22) – stan i kształt bez DOM, testowalne w Node.
 *
 * Strzałki kierunkowe (rysunki s. 53, 56, 61; symbol ponad torem, w głowicy prawej – lustrzane odbicie lewej):
 *  - obraz „A” – stan neutralny albo usterka: trzy części w rzędzie – grot w stronę szlaku, prostokąt, grot w stronę
 *    stacji; barwa wszystkich trzech części: ciemnoszara (neutralny), biała migająca na przemian z czerwoną (usterka);
 *  - obraz „B” – kierunek PRZYJAZD: jedna strzałka w stronę stacji, obraz „C” – kierunek WYJAZD: jedna strzałka w stronę
 *    szlaku; grot to segment „a”, trzon – segment „b”. Przy „B” / „C” obrazu „A” nie ma; wszystkie trzy mają tę samą długość.
 *
 * Barwy: 'dark' (ciemnoszary), 'yellow', 'yellow-blink' (żółty migający), 'red', 'fault' (biały migający na przemian
 * z czerwonym), 'green', 'off' (niewidoczny). Miganie niesie wspólna faza obrazu monitora, nie ten moduł.
 *
 * Blokada Eap (pkt 22, tabele s. 62): żądanie sąsiada – B, a żółty migający, b żółty; ustawiony PRZYJAZD – B żółty;
 * nasze żądanie (Wbl) – C, a migający; ustawiony WYJAZD – C żółty; sygnał zezwalający na wyjazd (Pwl) – a żółty, b
 * czerwony; kierunek wykorzystany – oba czerwone. Blokada samoczynna (pkt 20–21, s. 54, 57): te same żądania i kierunki,
 * bez stanu „wykorzystany” – zajętość odstępu pokazuje odcinek szlaku (u nas strzałka szlaku).
 */

/**
 * @param {object} b stan blokady (`LineBlock`)
 * @returns {{ pic: 'A'|'B'|'C', a: string, b: string }} dla obrazu „A” `a` i `b` to barwa wszystkich trzech części
 */
export function blockSymbol(b) {
  if (b.fault) return { pic: 'A', a: 'fault', b: 'fault' };
  if (b.request === 'theirs') return { pic: 'B', a: 'yellow-blink', b: 'yellow' };
  if (b.request === 'ours') return { pic: 'C', a: 'yellow-blink', b: 'yellow' };
  // przyjęte: kierunek wykorzystany od wjazdu pociągu na szlak do zwolnienia blokady – u nas: Ko po przyjeździe pociągu
  // sąsiada (także gdy stoi jeszcze przed semaforem wjazdowym), u sąsiada – potwierdzenie przyjazdu naszego (blok Po)
  const used = !b.auto && !!(b.occupied || b.poBlocked || b.koPending || b.awaitingEntry);
  if (b.direction === 'in') return used ? { pic: 'B', a: 'red', b: 'red' } : { pic: 'B', a: 'yellow', b: 'yellow' };
  const out = b.direction === 'out' && (b.auto || b.permission || b.fixed === 'out' || !!b.phone?.permissionFor || b.poBlocked);
  if (!out) return { pic: 'A', a: 'dark', b: 'dark' };
  if (used) return { pic: 'C', a: 'red', b: 'red' };
  return !b.auto && b.pwl ? { pic: 'C', a: 'yellow', b: 'red' } : { pic: 'C', a: 'yellow', b: 'yellow' };
}

/** Czy blokada ma symbol Ko/dKo (Eap przyjmująca pociągi – blokada samoczynna i jednokierunkowa wyjazdowa go nie mają). */
export function hasKoSymbol(b) { return !b.auto && b.fixed !== 'out'; }

/**
 * Symbol Ko/dKo (pkt 22 ust. 2 lit. e, s. 62): w stanie podstawowym niewidoczny; żółty migający – przygotowany wjazd na
 * sygnał zastępczy / rozkaz poleceniem dKo; zielony ciągły – spełnione zależności zwolnienia blokady w kierunku PRZYJAZD
 * (przejazd stwierdzony przy semaforze wjazdowym, pociąg w całości na stacji – Ko zadziała).
 */
export function koSymbol(b) {
  if (!hasKoSymbol(b) || b.fault) return 'off';
  if (b.koPending && b.zpg) return 'green';
  if (b.koPrepared) return 'yellow-blink';
  return 'off';
}

/**
 * Kształty symbolu w układzie symbolu wyjazdu (środek kostki wyjazdu, oś x w prawo, y w dół; symbol nad torem).
 * @param {1|-1} dir 1 – szlak po prawej (głowica prawa), -1 – po lewej
 * @returns {{ A: string[], B: { a: string, b: string }, C: { a: string, b: string }, ko: { x, y, width, height } }}
 *   `A` – [grot w stronę szlaku, prostokąt, grot w stronę stacji]
 */
export function blockSymbolShapes(dir) {
  const c = -dir, y0 = -12, H = 4, h = 2, L = 8;             // środek, oś, pół-wysokość grotu i trzonu, pół-długość
  const X = (u) => c + dir * u;                               // u > 0 – w stronę szlaku
  const n = (v) => Math.round(v * 100) / 100;
  const poly = (pts) => `M${pts.map(([u, y]) => `${n(X(u))},${n(y)}`).join(' L')} Z`;
  const bar = (u0, u1) => poly([[u0, y0 - h], [u1, y0 - h], [u1, y0 + h], [u0, y0 + h]]);
  const head = (s, base) => poly([[s * base, y0 - H], [s * L, y0], [s * base, y0 + H]]);
  // grot obrazu „A” z krótkim trzonem (jak na rysunku: dwie strzałki i prostokąt między nimi)
  const arrow = (s) => poly([[s * 2.3, y0 - h], [s * 4.6, y0 - h], [s * 4.6, y0 - H], [s * L, y0], [s * 4.6, y0 + H], [s * 4.6, y0 + h], [s * 2.3, y0 + h]]);
  const ku0 = X(-L), ku1 = X(-3.5);                           // Ko/dKo – nad strzałkami, od strony stacji (rys. s. 61)
  return {
    A: [arrow(1), bar(-1.6, 1.6), arrow(-1)],
    B: { a: head(-1, 4.6), b: bar(-4, L) },
    C: { a: head(1, 4.6), b: bar(-L, 4) },
    ko: { x: n(Math.min(ku0, ku1)), y: -20.5, width: n(Math.abs(ku1 - ku0)), height: 3 },
  };
}
