/**
 * Powiększenie pulpitu – rachunki bez DOM (testowane w Node).
 * Tryby dopasowania: 'whole' (całość w oknie), 'width' (do szerokości), 'height' (do wysokości),
 * null – powiększenie ręczne.
 */
export const ZOOM_MIN = 0.3;
export const ZOOM_MAX = 4;
export const FIT_MARGIN = 8; // px – luz wokół pulpitu w obszarze przewijania

export const clampZoom = (z) => Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z));

/**
 * Powiększenie dla trybu dopasowania. `desk` – rozmiar rysunku { w, h }, `client` – widoczny obszar { w, h } w px.
 * Całość nie ma górnej granicy (mała stacja wypełnia okno), szerokość i wysokość są ograniczone do ZOOM_MAX.
 */
export function fitZoom(mode, desk, client, margin = FIT_MARGIN) {
  const kw = (client.w - margin) / desk.w, kh = (client.h - margin) / desk.h;
  if (mode === 'width') return clampZoom(kw);
  if (mode === 'height') return clampZoom(kh);
  return Math.max(ZOOM_MIN, Math.min(kw, kh));
}

/**
 * Zmiana powiększenia wokół punktu `point` (px w widocznym obszarze): punkt pod palcami zostaje w miejscu.
 * Zwraca nowe powiększenie i położenie przewijania; `changed: false`, gdy powiększenie jest na granicy.
 */
export function zoomAround(zoom, factor, scroll, point) {
  const next = clampZoom(zoom * factor);
  const k = next / zoom;
  if (k === 1) return { zoom, left: scroll.left, top: scroll.top, changed: false };
  return { zoom: next, left: (scroll.left + point.x) * k - point.x, top: (scroll.top + point.y) * k - point.y, changed: true };
}

/** Osie dopasowania trybu: przycisk „do szerokości” (w) i „do wysokości” (h); całość = obie, ręczne = żadna. */
export function fitAxes(mode) {
  return { w: mode === 'width' || mode === 'whole', h: mode === 'height' || mode === 'whole' };
}

/**
 * Tryb po kliknięciu przycisku osi (`'w'` albo `'h'`) – przyciski są stanowe:
 *  - oś wyłączona → dochodzi (sama albo z drugą, wtedy całość),
 *  - obie włączone (całość) → zostaje tylko kliknięta,
 *  - jedyna włączona → wyłączona: powiększenie zostaje, po zmianie okna nic się nie dopasowuje.
 */
export function nextFitMode(mode, axis) {
  const a = fitAxes(mode);
  const other = axis === 'w' ? 'h' : 'w';
  let next;
  if (!a[axis]) next = { ...a, [axis]: true };
  else if (a[other]) next = { [axis]: true, [other]: false };
  else next = { w: false, h: false };
  return next.w && next.h ? 'whole' : next.w ? 'width' : next.h ? 'height' : null;
}
