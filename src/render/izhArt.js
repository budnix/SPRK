import { text, el, CELL } from './svg.js';
import * as e from './tileArt.js';

/**
 * Grafika kostek pulpitu urządzeń typu IZH-111. Kostki toru są jak na pulpicie typu E; różnią się kostki
 * sygnalizatorów i przyciski:
 *  - przycisk adresowy jest jeden na element, czarny, na środku kostki (semafor, tarcza) albo przy elemencie,
 *  - powtarzacz sygnalizatora nie ma lampki sygnału „Stój”: semafor ma zieloną i białą, tarcza tylko białą,
 *  - przy przycisku sygnalizatora jest lampka kontrolna (miga na biało podczas zwalniania czasowego),
 *  - przycisków grupowych typu E (Zw, Zz, Pz, dPz, Sz) na pulpicie nie ma – rozkazy są w osobnej grupie.
 */
const C = CELL / 2;
const address = (tile) => (tile.endButton ? { ...tile, endButton: { ...tile.endButton, color: 'black' } } : tile);

export const { pointArt, crossingArt, labelArt, blankArt, blockArrowArt, blockDeviceArt } = e;

export function trackArt(tile, ctx) {
  return e.trackArt(address(tile), ctx);
}

export function bufferArt(tile, ctx) {
  return e.bufferArt(address(tile), ctx);
}

/** Kostki przycisków grupowych typu E zostają puste. */
export function buttonTileArt() {
  return e.blankArt();
}

export function signalArt(tile) {
  const g = e.tileBase('t-signal t-izh', tile.face);
  const east = tile.dir === 'E';
  const refs = { lamps: {} };
  const colours = tile.kind === 'tm' ? ['white'] : ['green', 'white'];
  const order = east ? colours : [...colours].reverse();
  const py = 10, pw = 8 + order.length * 7, px = C - pw / 2;
  g.appendChild(el('rect', { class: 'pill', x: px, y: py - 5.5, width: pw, height: 11, rx: 5.5 }));
  // znak masztu po stronie „podstawy” (przeciwnej do kierunku jazdy)
  const mx = east ? px - 1.5 : px + pw + 1.5;
  g.appendChild(el('path', { class: 'mast', d: `M${mx},${py - 4} L${mx},${py + 4} M${mx},${py} L${mx + (east ? 3 : -3)},${py}`, 'stroke-width': 1.2 }));
  order.forEach((c, i) => { refs.lamps[c] = e.lamp(px + 7.5 + i * 7, py, 2.8, ''); g.appendChild(refs.lamps[c]); });
  refs.btn = e.button(C, 28, 5.5, 'black', { kind: 'signal', id: tile.id }, null);
  refs.ctl = e.lamp(C - 12, 28, 2.2, '');
  g.append(refs.ctl, refs.btn);
  g.appendChild(text(C + 9, 28.5, tile.id, { class: 'tile-text sig-label', 'text-anchor': 'start' }));
  return { g, refs };
}
