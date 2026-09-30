import * as e from './tileArt.js';
import { el, text } from './svg.js';

/**
 * Grafika planu świetlnego nastawni mechanicznej. Kostki toru i zwrotnic są jak na pulpicie typu E, ale bez
 * przycisków: zwrotnice, sygnały i przebiegi obsługuje się dźwigniami i drążkami ławy (poniżej planu). Zamiast
 * lampek sygnałów – powtarzacze semaforów kształtowych i tarcz (Ie-1 §3, §5, §7) z ruchomymi ramionami i tarczami.
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

/** Ramię semafora kształtowego (białe z czerwoną obwódką, zakończone tarczką) – poziomo na prawo od osi (px, py). */
function semArm(px, py, cls) {
  return el('g', { class: `sem-arm ${cls}` }, [
    el('path', { class: 'sem-arm-body', d: `M${px},${py - 1.3} L${px + 8.5},${py - 1.3} L${px + 8.5},${py + 1.3} L${px},${py + 1.3} Z` }),
    el('circle', { class: 'sem-arm-body', cx: px + 10, cy: py, r: 2.4 }),
  ]);
}

/** Tarcza manewrowa kształtowa: niebieski kwadrat z białą obwódką, jedną przekątną pionowo (obrót do poziomu = M2). */
function shuntDisc(cx, cy, h) {
  return el('path', { class: 'sem-disc shunt-disc', d: `M${cx},${cy - h} L${cx + h},${cy} L${cx},${cy + h} L${cx - h},${cy} Z` });
}

/**
 * Powtarzacz semafora kształtowego: słup, ramię górne i dolne (dolne widać tylko na semaforze dwuramiennym – w
 * spoczynku stoi pionowo w górę od swojej osi, tarczką tuż pod górnym ramieniem), latarnia sygnału zastępczego, tarcza manewrowa na słupie (semafor z sygnałem
 * manewrowym), przy semaforze wjazdowym – tarcza ostrzegawcza kształtowa (tarcza i strzała trzystawnej). Rysunek
 * jak z miejsca maszynisty; dla jazdy na zachód w lustrzanym odbiciu – ramiona wskazują kierunek jazdy, jak maszt na
 * innych pulpitach. Położenia ramion i tarcz ustawia widok (`LeverRenderer.updateSignal`), obrót jest animowany w CSS.
 */
export function signalArt(tile) {
  const g = e.tileBase('t-signal shaped', tile.face);
  const east = tile.dir !== 'W';
  const pic = el('g', { class: 'sem-pic', ...(east ? {} : { transform: 'translate(40,0) scale(-1,1)' }) });
  const refs = { pic, pivots: {} };
  if (tile.kind === 'tm') {
    pic.append(el('path', { class: 'sem-mast', d: 'M20,14 L20,29 M17,29 L23,29' }));
    refs.disc = shuntDisc(20, 11, 6);
    refs.pivots.disc = [20, 11];
    pic.appendChild(refs.disc);
    g.appendChild(pic);
    g.appendChild(text(20, 35, tile.id, { class: 'tile-text sig-label' }));
    return { g, refs };
  }
  pic.append(el('path', { class: 'sem-mast', d: 'M16,5 L16,30 M13,30 L19,30' }));
  if (tile.entry) {
    // tarcza ostrzegawcza: okrągła, pomarańczowa, z czarnym pierścieniem przylegającym do białej obwódki (Ie-1 §5
    // ust. 2) – od środka: pomarańczowy, czarny, biały; strzała – trzystawna
    pic.append(el('path', { class: 'sem-mast thin', d: 'M5,12 L5,30 M3,30 L7,30' }));
    refs.warnArrow = el('path', { class: 'sem-arrow', d: 'M5,14 L5,19.5 L6.6,19.5 L5,22.5 L3.4,19.5 L5,19.5' });
    refs.pivots.warnArrow = [5, 14];
    refs.warn = el('g', { class: 'sem-disc warn-disc' }, [
      el('circle', { class: 'warn-edge', cx: 5, cy: 9, r: 4 }),
      el('circle', { class: 'warn-ring', cx: 5, cy: 9, r: 3.3 }),
      el('circle', { class: 'warn-face', cx: 5, cy: 9, r: 2.3 }),
    ]);
    refs.pivots.warn = [5, 9];
    pic.append(refs.warnArrow, refs.warn);
  }
  if (tile.shunting) {
    refs.disc = shuntDisc(11, 19, 3.2);
    refs.pivots.disc = [11, 19];
    pic.appendChild(refs.disc);
  }
  if (tile.substitute !== false) {
    refs.sz = e.lamp(12, 26, 1.8, '');
    pic.appendChild(refs.sz);
  }
  // oś dolnego ramienia niżej na słupie: ramię w spoczynku sięga w górę, pod samo ramię górne
  refs.lower = semArm(16, 23, 'lower');
  refs.upper = semArm(16, 9, 'upper');
  refs.pivots.lower = [16, 23];
  refs.pivots.upper = [16, 9];
  refs.lowerHub = el('circle', { class: 'sem-hub', cx: 16, cy: 23, r: 0.9 });
  pic.append(refs.lower, refs.upper, el('circle', { class: 'sem-hub', cx: 16, cy: 9, r: 0.9 }), refs.lowerHub);
  g.appendChild(pic);
  g.appendChild(text(east ? 30 : 10, 34, tile.id, { class: 'tile-text sig-label' }));
  return { g, refs };
}

/** Przycisków grupowych na planie świetlnym nie ma – liczniki są przy aparacie blokowym. */
export function buttonTileArt() {
  return e.blankArt();
}
