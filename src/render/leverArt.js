import * as e from './tileArt.js';

/**
 * Grafika planu świetlnego nastawni mechanicznej. Kostki toru, zwrotnic i powtarzacze sygnałów są jak na pulpicie
 * typu E, ale bez przycisków: zwrotnice, sygnały i przebiegi obsługuje się dźwigniami i drążkami ławy (poniżej planu).
 * Zostają przyciski blokady liniowej (półsamoczynna przekaźnikowa – obsługa przyciskami, E16 §9 ust. 7).
 */

/** Usuwa przyciski z kostki (plan świetlny ich nie ma); opisy i lampki zostają. */
function noButtons(out) {
  for (const b of out.g.querySelectorAll('.btn')) b.remove();
  for (const k of Object.keys(out.refs)) if (out.refs[k]?.classList?.contains('btn')) delete out.refs[k];
  return out;
}

export const { labelArt, blankArt, blockArrowArt, blockDeviceArt, crossingArt } = e;

export const trackArt = (tile, ctx) => noButtons(e.trackArt(tile, ctx));
export const bufferArt = (tile, ctx) => noButtons(e.bufferArt(tile, ctx));
export const pointArt = (tile, ctx) => noButtons(e.pointArt(tile, ctx));
export const signalArt = (tile) => noButtons(e.signalArt(tile));

/** Przycisków grupowych na planie świetlnym nie ma – liczniki są przy aparacie blokowym. */
export function buttonTileArt() {
  return e.blankArt();
}
