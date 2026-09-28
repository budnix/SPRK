/**
 * Rozmiar panelu bocznego przeciąganego krawędzią (bez DOM, testowane w Node). Panel nie może zniknąć ani zabrać
 * całego miejsca planowi: najmniej `min` px panelu i `minRest` px dla planu z listwą narzędzi.
 */
export const SIDE_LIMITS = {
  vertical: { min: 120, minRest: 200 },   // panel na dole: wysokość
  horizontal: { min: 240, minRest: 360 }, // panel z boku: szerokość
};

/** Rozmiar panelu w granicach: `total` – wysokość (szerokość) całego obszaru planu i panelu. */
export function clampSide(size, total, { min, minRest }) {
  const max = Math.max(min, total - minRest);
  return Math.round(Math.max(min, Math.min(max, size)));
}

/**
 * Nowy rozmiar panelu po przesunięciu wskaźnika o `delta` px (w dół / w prawo dodatnio). Panel na dole i po prawej
 * rośnie, gdy krawędź idzie w górę / w lewo; panel po lewej – gdy krawędź idzie w prawo.
 */
export function dragSide(start, delta, placement) {
  return placement === 'left' ? start + delta : start - delta;
}
