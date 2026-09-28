/**
 * Położenie dymku samouczka (bez DOM): wybór miejsca spośród kandydatów wg tego, co dymek by zasłonił.
 *
 * Ważność, od najważniejszego: wskazywany element; paski sterowania (nagłówek, pasek poleceń, listwa narzędzi
 * z zakładkami panelu) – gracz ma w nie klikać; plan stacji (najmocniej, gdy element leży na planie); treść panelu bocznego –
 * ją najłatwiej poświęcić, bo przewija się i wraca po zamknięciu dymku. Przy równym zasłonięciu wygrywa miejsce
 * bliżej elementu.
 *
 * Prostokąty: { left, top, right, bottom }. Wynik: { left, top, side }.
 */
const WEIGHT = { target: 1000, bar: 40, desk: 1, deskAside: 0.3, panel: 0.02, distance: 0.5 };

export function overlapArea(a, b) {
  if (!a || !b) return 0;
  return Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
}

/**
 * @param box { w, h } rozmiar dymku
 * @param viewport { w, h } okno
 * @param target wskazywany element albo null
 * @param desk rysunek planu albo null
 * @param bars paski sterowania
 * @param panel treść panelu bocznego albo null
 * @param onDesk czy element leży na planie
 * @param margin odstęp od elementu i krawędzi okna
 */
export function placeBox({ box, viewport, target = null, desk = null, bars = [], panel = null, onDesk = false, margin = 10 }) {
  const { w: W, h: H } = box, { w: vw, h: vh } = viewport, M = margin;
  const clampL = (l) => Math.max(M, Math.min(vw - W - M, l));
  const clampT = (t) => Math.max(M, Math.min(vh - H - M, t));
  const rectAt = (left, top) => ({ left, top, right: left + W, bottom: top + H });
  // miejsca w panelu bocznym: tuż pod listwą narzędzi, przy lewej i prawej krawędzi oraz pod elementem
  const inPanel = (cx) => (panel ? [['panel', cx - W / 2, panel.top + M], ['panel', panel.left + M, panel.top + M], ['panel', panel.right - W - M, panel.top + M]] : []);
  // wolne pasy między paskami sterowania: wysoki dymek mieści się tam w całości, choć nie przy samym elemencie
  const bands = freeBands(bars, vh).filter((b) => b.bottom - b.top >= H + 2 * M);
  const inBands = (xs, cy) => bands.flatMap((b) => xs.map((x) => ['band', x, Math.max(b.top + M, Math.min(b.bottom - M - H, cy - H / 2))]));
  if (!target || (target.right - target.left === 0 && target.bottom - target.top === 0)) {
    // krok bez wskazywanego elementu: prawy dolny róg, panel albo prawa strona wolnego pasa
    const spots = [['none', vw - W - M, vh - H - M], ...inPanel(vw), ...inBands([vw - W - M], vh)].map(([, l, t]) => ['none', l, t]);
    return pick(spots, null);
  }
  const cx = (target.left + target.right) / 2, cy = (target.top + target.bottom) / 2;
  const spots = [
    ['below', cx - W / 2, target.bottom + M], ['above', cx - W / 2, target.top - M - H],
    ['right', target.right + M, target.top], ['left', target.left - M - W, target.top],
    ...inPanel(cx),
    ...inBands([target.right + M, target.left - M - W, cx - W / 2, M, vw - W - M], cy),
  ];
  // pas nad planem i pod planem
  if (desk) spots.push(['top-strip', cx - W / 2, desk.top - M - H], ['bottom-strip', cx - W / 2, desk.bottom + M]);
  return pick(spots, { cx, cy });

  function pick(list, centre) {
    let best = null;
    for (const [side, l0, t0] of list) {
      const left = clampL(l0), top = clampT(t0);
      const r = rectAt(left, top);
      const moved = Math.abs(left - l0) + Math.abs(top - t0); // kandydat wypchnięty z okna – gorszy od mieszczącego się
      const score = overlapArea(r, target) * WEIGHT.target
        + bars.reduce((a, b) => a + overlapArea(r, b), 0) * WEIGHT.bar
        + overlapArea(r, desk) * (onDesk ? WEIGHT.desk : WEIGHT.deskAside)
        + overlapArea(r, panel) * WEIGHT.panel
        + (centre ? Math.hypot(left + W / 2 - centre.cx, top + H / 2 - centre.cy) * WEIGHT.distance : 0)
        + moved * 0.1;
      if (!best || score < best.score) best = { left, top, side, score };
    }
    return { left: best.left, top: best.top, side: best.side };
  }
}

/** Poziome pasy okna wolne od pasków sterowania, od góry do dołu: [{ top, bottom }]. */
export function freeBands(bars, height) {
  const out = [];
  let top = 0;
  for (const b of [...bars].sort((a, c) => a.top - c.top)) {
    if (b.top > top) out.push({ top, bottom: b.top });
    top = Math.max(top, b.bottom);
  }
  if (height > top) out.push({ top, bottom: height });
  return out;
}
