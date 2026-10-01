import { VIEWBOX } from './poland.js';

/**
 * Przybliżanie mapy (bez DOM – testy w Node, tests/map.test.js). Widok to prostokąt w jednostkach rysunku
 * { x, y, w, h } (atrybut `viewBox`); przybliżenie z = szerokość całej Polski / szerokość widoku.
 * Poziomy szczegółów zależą od gęstości – pikseli ekranu na jednostkę rysunku (szerokość mapy na ekranie / w): kraj
 * (województwa, liczby posterunków, sieć z Natural Earth), region (dokładny przebieg linii, lampki posterunków),
 * szczegół (tablice z nazwami, numery linii) – od gęstości, przy której sąsiednie posterunki Trójmiasta (Reda – Rumia,
 * ok. 4 jednostki) są na ekranie dalej niż wysokość tablicy z nazwą.
 */
export const ZOOM = { min: 0.85, max: 40 };
export const LEVELS = { region: 2.5, detail: 4.7 };
export const BASE_W = VIEWBOX[2];

export function zoomOf(view) {
  return BASE_W / view.w;
}

/** Poziom szczegółów dla gęstości `pxPerUnit` (pikseli ekranu na jednostkę rysunku). */
export function levelOf(pxPerUnit) {
  return pxPerUnit >= LEVELS.detail ? 'detail' : pxPerUnit >= LEVELS.region ? 'region' : 'country';
}

/** Widok o proporcjach `aspect` (szer. / wys.) obejmujący prostokąt `box`, wyśrodkowany. */
export function fitBox(box, aspect) {
  let { x, y, w, h } = box;
  if (w / h < aspect) { const nw = h * aspect; x -= (nw - w) / 2; w = nw; } else { const nh = w / aspect; y -= (nh - h) / 2; h = nh; }
  return { x, y, w, h };
}

/** Cała Polska w proporcjach `aspect`. */
export function homeView(aspect) {
  return fitBox({ x: VIEWBOX[0], y: VIEWBOX[1], w: VIEWBOX[2], h: VIEWBOX[3] }, aspect);
}

/**
 * Widok w granicach: przybliżenie między ZOOM.min a ZOOM.max, proporcje `aspect`, środek widoku w obrębie rysunku
 * Polski (mapa nie ucieka poza ekran).
 */
export function clampView(view, aspect) {
  // najdalej: cała Polska w tych proporcjach (na szerokim ekranie decyduje wysokość rysunku) albo ZOOM.min
  const maxW = Math.max(BASE_W / ZOOM.min, homeView(aspect).w);
  const w = Math.min(maxW, Math.max(BASE_W / ZOOM.max, view.w));
  const h = w / aspect;
  let cx = view.x + view.w / 2, cy = view.y + view.h / 2;
  cx = Math.min(VIEWBOX[0] + VIEWBOX[2], Math.max(VIEWBOX[0], cx));
  cy = Math.min(VIEWBOX[1] + VIEWBOX[3], Math.max(VIEWBOX[1], cy));
  return { x: cx - w / 2, y: cy - h / 2, w, h };
}

/** Przybliżenie o `factor` (> 1 – bliżej) wokół punktu `[px, py]` (jednostki rysunku) – punkt zostaje w miejscu. */
export function zoomAt(view, factor, [px, py]) {
  const w = view.w / factor, h = view.h / factor;
  return { x: px - ((px - view.x) / view.w) * w, y: py - ((py - view.y) / view.h) * h, w, h };
}

export function panBy(view, dx, dy) {
  return { ...view, x: view.x + dx, y: view.y + dy };
}

/** Widok pośredni (animacja): t od 0 do 1, przybliżenie zmienia się wykładniczo (płynnie dla oka). */
export function lerpView(a, b, t) {
  const w = a.w * (b.w / a.w) ** t, h = a.h * (b.h / a.h) ** t;
  const cx = a.x + a.w / 2 + (b.x + b.w / 2 - a.x - a.w / 2) * t, cy = a.y + a.h / 2 + (b.y + b.h / 2 - a.y - a.h / 2) * t;
  return { x: cx - w / 2, y: cy - h / 2, w, h };
}
