/**
 * Podział szerokiego pulpitu na „ekrany” (jak monitory stanowiska LCS): każdy ekran to okno kolumn,
 * które mieści się w oknie przeglądarki przy czytelnym powiększeniu. Cięcia dobierane tak, by nie
 * przechodziły przez głowice (zwrotnice, skosy, skrzyżowania, sygnalizatory), z zakładką kilku kolumn,
 * żeby tor „kontynuował się” na sąsiednim ekranie. Bez DOM – testowalne w Node.
 */

const DIAG = ['NE', 'NW', 'SE', 'SW'];

/** Koszt „zajętości” kolumny: co byśmy przecięli, tnąc obok niej. */
function columnCost(station, win) {
  const cost = new Map();
  const add = (x, v) => { if (x >= win[0] && x <= win[1]) cost.set(x, (cost.get(x) || 0) + v); };
  for (const t of station.tiles) {
    switch (t.type) {
      case 'point': add(t.x, 6); break;
      case 'crossing': add(t.x, 6); break;
      case 'track': add(t.x, t.ports?.some((p) => DIAG.includes(p)) ? 4 : 0); if (t.endButton) add(t.x, 1); break;
      case 'buffer': add(t.x, 2); break;
      case 'signal': add(t.x, 2); break;
      case 'block': for (let i = 0; i < 4; i++) add(t.x + i, 1); break;
      case 'button': add(t.x, 0.5); break;
      case 'label': for (let i = 0; i < (t.span || 1); i++) add(t.x + i, 0.3); break;
      default: break;
    }
  }
  return cost;
}

/**
 * @param station definicja stacji
 * @param win [x0, x1] okno kolumn (cały pulpit lub okręg)
 * @param maxCols ile kolumn mieści się czytelnie w oknie przeglądarki
 * @returns [{ x0, x1, from, to }] – from/to = zakres bez zakładki
 */
export function planScreens(station, win, maxCols, overlap = 2) {
  const [X0, X1] = win;
  const C = X1 - X0 + 1;
  if (station.screens?.length) {
    return station.screens.filter((s) => s.x1 >= X0 && s.x0 <= X1)
      .map((s) => ({ x0: Math.max(X0, s.x0), x1: Math.min(X1, s.x1), from: Math.max(X0, s.x0), to: Math.min(X1, s.x1), name: s.name }));
  }
  const n0 = Math.max(1, Math.ceil(C / Math.max(8, maxCols)));
  if (n0 === 1) return [{ x0: X0, x1: X1, from: X0, to: X1 }];
  const cost = columnCost(station, win);
  const cutCost = (c) => (cost.get(c - 1) || 0) + (cost.get(c) || 0);
  // ekran szerszy niż limit jest dopuszczalny (mniejsze powiększenie), ale kosztuje – kwadratowo
  // ekran za wąski (poniżej połowy limitu) też kosztuje – nie tworzymy „ogonków” z samymi wyjazdami
  const widthCost = (w) => (w > maxCols ? (w - maxCols) ** 2 * 0.03 : 0) + (w < maxCols / 2 ? (maxCols / 2 - w) ** 2 * 0.25 : 0) + (w < 8 ? 100 : 0);
  // programowanie dynamiczne: podział na k ekranów o minimalnym koszcie cięć + kar za szerokość
  const MIN_W = 6;
  const solve = (k) => {
    const memo = new Map();
    const f = (start, left) => {
      const key = `${start},${left}`;
      if (memo.has(key)) return memo.get(key);
      let best = { cost: Infinity, cuts: [] };
      if (left === 1) best = { cost: widthCost(X1 - start + 1), cuts: [] };
      else {
        for (let end = start + MIN_W - 1; end <= X1 - MIN_W * (left - 1); end++) {
          const rest = f(end + 1, left - 1);
          const v = widthCost(end - start + 1) + cutCost(end + 1) + rest.cost;
          if (v < best.cost) best = { cost: v, cuts: [end + 1, ...rest.cuts] };
        }
      }
      memo.set(key, best);
      return best;
    };
    return f(X0, k);
  };
  let cuts = null, bestCost = Infinity;
  for (const k of [n0 - 1, n0, n0 + 1]) {
    if (k < 1) continue;
    const r = solve(k);
    const v = r.cost + (k - 1) * 1.5; // każdy dodatkowy ekran to koszt przełączania
    if (v < bestCost) { bestCost = v; cuts = r.cuts; }
  }
  if (!cuts.length) return [{ x0: X0, x1: X1, from: X0, to: X1 }];
  const out = [];
  let start = X0;
  for (const c of [...cuts, X1 + 1]) {
    const end = c - 1;
    out.push({ x0: Math.max(X0, start - overlap), x1: Math.min(X1, end + overlap), from: start, to: end });
    start = c;
  }
  return out;
}

/** Nazwa ekranu: wg wyjazdów na szlak, które na nim leżą (zachód / wschód), inaczej „środek”. */
export function screenLabel(station, scr, i, n) {
  if (scr.name) return scr.name;
  const exits = Object.values(station.exits || {}).filter((e) => e.tile.x >= scr.from && e.tile.x <= scr.to);
  const w = exits.filter((e) => e.dir === 'W'), e = exits.filter((x) => x.dir === 'E');
  const names = (xs) => [...new Set(xs.map((x) => x.name))].slice(0, 2).join(', ');
  if (n === 1) return 'całość';
  if (w.length && !e.length) return `zachód · ${names(w)}`;
  if (e.length && !w.length) return `wschód · ${names(e)}`;
  if (w.length && e.length) return `${names(w)} – ${names(e)}`;
  return i === 0 ? 'zachód' : i === n - 1 ? 'wschód' : n === 3 ? 'środek' : `środek ${i}`;
}
