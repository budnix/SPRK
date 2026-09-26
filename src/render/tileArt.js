import { el, text, CELL } from './svg.js';
import { trackLabelText } from './platforms.js';
import { PORT_XY } from '../tiles/directions.js';

/**
 * Grafika kostek pulpitu (SVG) wzorowana na pulpitach kostkowych ISDR / AC-20.
 * Każda funkcja zwraca { g, refs } – grupę 40×40 i odwołania do elementów dynamicznych.
 *
 * Kostka torowa: szary kanał przez całą kostkę, w nim ciemny pasek świetlny
 * (czarny – nieaktywny, kremowy – przebieg utwierdzony, czerwony – zajętość),
 * przy każdym końcu paska „śrubka”/dioda.
 */
const C = CELL / 2;
export const CHANNEL_W = 10;
export const BAR_W = 5;

export function tileBase(extraClass = '', face = '') {
  return el('g', { class: `tile ${extraClass}`.trim() }, [
    el('rect', { class: `face ${face || ''}`.trim(), x: 0, y: 0, width: CELL, height: CELL }),
  ]);
}

/** Punkt na odcinku środek→port w ułamku t (0 = środek, 1 = port). */
function along(port, t) {
  const [px, py] = PORT_XY[port];
  return [C + (px - C) * t, C + (py - C) * t];
}

/** Szary kanał torowy dla listy portów. */
export function channel(ports) {
  const d = ports.map((p) => { const [x, y] = PORT_XY[p]; return `M${C},${C} L${x},${y}`; }).join(' ');
  return el('g', { class: 'channel' }, [
    el('path', { class: 'channel-edge', d, 'stroke-width': CHANNEL_W + 1.4, fill: 'none' }),
    el('path', { class: 'channel-fill', d, 'stroke-width': CHANNEL_W, fill: 'none' }),
  ]);
}

/** Pasek świetlny (lampka) wzdłuż legu: od t0 do t1 odcinka środek→port. */
export function bar(port, t0 = 0, t1 = 0.8, cls = 'bar') {
  const [ax, ay] = along(port, t0);
  const [bx, by] = along(port, t1);
  return el('path', { class: cls, d: `M${ax},${ay} L${bx},${by}`, 'stroke-width': BAR_W, 'stroke-linecap': 'round', fill: 'none' });
}

/** Pasek przez całą kostkę między dwoma portami (jedna lampka). */
export function throughBar(ports, cls = 'bar') {
  const [ax, ay] = along(ports[0], 0.84);
  const [bx, by] = along(ports[1], 0.84);
  return el('path', { class: cls, d: `M${ax},${ay} L${C},${C} L${bx},${by}`, 'stroke-width': BAR_W, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', fill: 'none' });
}

/** Śrubka / dioda przy końcu paska. */
export function screw(port) {
  const [x, y] = along(port, 0.93);
  return el('circle', { class: 'screw', cx: x, cy: y, r: 1.7 });
}

/** Złącze izolowane – ciemna kreska w poprzek kanału przy porcie. */
export function joint(port) {
  const [px, py] = PORT_XY[port];
  const dx = px - C, dy = py - C, len = Math.hypot(dx, dy);
  const nx = -dy / len, ny = dx / len;
  const [bx, by] = along(port, 0.985);
  return el('path', { class: 'joint', d: `M${bx + nx * 5},${by + ny * 5} L${bx - nx * 5},${by - ny * 5}`, 'stroke-width': 1.4 });
}

/** Przycisk (kółko) z ewentualnym opisem. */
export function button(cx, cy, r, color, ref, label, labelPos = 'right') {
  const g = el('g', { class: `btn btn-${color}`, 'data-ref': JSON.stringify(ref), role: 'button', tabindex: 0 }, [
    el('circle', { class: 'btn-shadow', cx: cx + 0.5, cy: cy + 1, r }),
    el('circle', { class: 'btn-ring', cx, cy, r }),
    el('circle', { class: 'btn-cap', cx, cy, r: r - 1.8 }),
    el('circle', { class: 'btn-hl', cx: cx - r * 0.3, cy: cy - r * 0.35, r: r * 0.26 }),
  ]);
  if (label) {
    if (labelPos === 'right') g.appendChild(text(cx + r + 3, cy + 0.5, label, { class: 'btn-label', 'text-anchor': 'start' }));
    else if (labelPos === 'left') g.appendChild(text(cx - r - 3, cy + 0.5, label, { class: 'btn-label', 'text-anchor': 'end' }));
    else g.appendChild(text(cx, cy + r + 6, label, { class: 'btn-label' }));
  }
  // Niewidoczne, większe pole trafienia (palec na iPadzie)
  g.appendChild(el('circle', { class: 'btn-hit', cx, cy, r: Math.max(r + 5, 10) }));
  return g;
}

/** Licznik – urządzenie z plombą, okienkiem cyfr i tabliczką. */
export function counterDevice(x, y, w, h, label) {
  const g = el('g', { class: 'counter' }, [
    el('rect', { class: 'counter-body', x, y, width: w, height: h, rx: 2 }),
    el('rect', { class: 'counter-inner', x: x + 2, y: y + 2, width: w - 4, height: h - 4, rx: 1.5 }),
    el('rect', { class: 'counter-win', x: x + 5, y: y + 4, width: w - 10, height: h * 0.38, rx: 1 }),
    el('rect', { class: 'counter-plate', x: x + 6, y: y + h * 0.55, width: w - 12, height: h * 0.3, rx: 0.8 }),
    el('circle', { class: 'counter-seal', cx: x + 3.5, cy: y + 3.5, r: 2 }),
  ]);
  const t = text(x + w / 2, y + 4 + h * 0.19 + 0.5, '00000', { class: 'counter-text' });
  g.appendChild(t);
  if (label) g.appendChild(text(x + w / 2, y + h * 0.55 + h * 0.15 + 0.5, label, { class: 'counter-label' }));
  return { g, t };
}

/** Lampka okrągła. */
export function lamp(cx, cy, r, cls = '') {
  return el('circle', { class: `lamp ${cls}`.trim(), cx, cy, r });
}

/** Lampka-pasek (np. Po, Poz, Ko na blokadzie) z opisem nad nią. */
export function lampBar(x, y, w, label) {
  const g = el('g', { class: 'lampbar' }, [
    el('rect', { class: 'lampbar-frame', x, y, width: w, height: 9, rx: 1.5 }),
  ]);
  const b = el('rect', { class: 'lampbar-lamp', x: x + 6, y: y + 2.5, width: w - 12, height: 4, rx: 1 });
  g.appendChild(el('circle', { class: 'screw', cx: x + 3, cy: y + 4.5, r: 1.4 }));
  g.appendChild(el('circle', { class: 'screw', cx: x + w - 3, cy: y + 4.5, r: 1.4 }));
  g.appendChild(b);
  if (label) g.appendChild(text(x + w / 2, y - 3.5, label, { class: 'tile-text tiny' }));
  return { g, lamp: b };
}

/* ------------------------------------------------------------------ */

export function trackArt(tile, ctx) {
  const g = tileBase('t-track', tile.face);
  const refs = { slits: [], screws: [] };
  g.appendChild(channel(tile.ports));
  const b = throughBar(tile.ports);
  g.appendChild(b); refs.slits.push(b);
  for (const p of tile.ports) { const s = screw(p); g.appendChild(s); refs.screws.push(s); if (ctx.isJoint(tile, p)) g.appendChild(joint(p)); }
  if (tile.text) {
    // opis (nazwa sąsiedniego posterunku) po przeciwnej stronie toru niż przycisk końca przebiegu – nie nachodzą na siebie
    const above = tile.ports.every((p) => !p.includes('N'));
    const y = tile.endButton && !tile.endButtonBelow ? (above ? 34 : 8) : (above ? 8 : 34);
    g.appendChild(text(C, y, tile.text, { class: 'tile-text small' }));
  }
  if (tile.derailer) {
    const wk = el('g', { class: 'derailer' }, [
      el('path', { class: 'wk-body', d: `M${C - 7},${C - 7} L${C + 7},${C - 7} L${C + 2},${C - 13} Z` }),
    ]);
    refs.derailerLamp = lamp(C - 12, C - 10, 2.6, 'lamp-yellow');
    wk.appendChild(refs.derailerLamp);
    g.appendChild(wk);
    refs.derailerBtn = button(C + 12, C + 12, 5, 'black', { kind: 'derailer', id: tile.derailer }, null);
    g.appendChild(refs.derailerBtn);
    g.appendChild(text(C - 9, C + 12.5, 'Wk', { class: 'tile-text tiny' }));
  }
  if (tile.endButton) {
    // na kostce ze strzałką blokady (endButtonBelow) przycisk jest pod torem, w połowie między kanałem a dolną krawędzią
    const onTop = !tile.endButtonBelow && tile.ports.every((p) => !p.includes('N'));
    refs.endBtn = button(C + 11, onTop ? 9 : tile.endButtonBelow ? 32.5 : 31, 5, tile.endButton.color || 'green', { kind: 'end', id: tile.endButton.id }, null);
    g.appendChild(refs.endBtn);
  }
  return { g, refs };
}

export function bufferArt(tile, ctx) {
  const g = tileBase('t-buffer', tile.face);
  const refs = { slits: [], screws: [] };
  g.appendChild(channel([tile.port]));
  const b = bar(tile.port, 0.1, 0.84);
  g.appendChild(b); refs.slits.push(b);
  g.appendChild(screw(tile.port));
  if (ctx.isJoint(tile, tile.port)) g.appendChild(joint(tile.port));
  // kozioł – klamra ⊏ z szarego kanału
  const [px, py] = PORT_XY[tile.port];
  const dx = px - C, dy = py - C, len = Math.hypot(dx, dy);
  const ux = dx / len, uy = dy / len, nx = -dy / len, ny = dx / len;
  const ex = C - ux * 4, ey = C - uy * 4;
  const d = `M${ex + ux * 7 + nx * 9},${ey + uy * 7 + ny * 9} L${ex + nx * 9},${ey + ny * 9} L${ex - nx * 9},${ey - ny * 9} L${ex + ux * 7 - nx * 9},${ey + uy * 7 - ny * 9}`;
  g.appendChild(el('path', { class: 'channel-edge', d, 'stroke-width': 6.4, fill: 'none' }));
  g.appendChild(el('path', { class: 'channel-fill', d, 'stroke-width': 5, fill: 'none' }));
  g.appendChild(el('circle', { class: 'screw', cx: ex + nx * 9, cy: ey + ny * 9, r: 1.4 }));
  g.appendChild(el('circle', { class: 'screw', cx: ex - nx * 9, cy: ey - ny * 9, r: 1.4 }));
  if (tile.endButton) {
    refs.endBtn = button(tile.port.includes('W') ? C + 10 : C - 10, 9, 5, tile.endButton.color || 'white', { kind: 'end', id: tile.endButton.id }, null);
    g.appendChild(refs.endBtn);
  }
  return { g, refs };
}

export function pointArt(tile, ctx) {
  const g = tileBase('t-point', tile.face);
  const refs = {};
  g.appendChild(channel([tile.toe, tile.straight, tile.diverge]));
  refs.toe = bar(tile.toe, 0, 0.84);
  refs.straight = bar(tile.straight, 0, 0.84);
  refs.diverge = bar(tile.diverge, 0, 0.84);
  g.append(refs.diverge, refs.straight, refs.toe);
  for (const p of [tile.toe, tile.straight, tile.diverge]) { g.appendChild(screw(p)); if (ctx.isJoint(tile, p)) g.appendChild(joint(p)); }
  // „+” przy torze zasadniczym, po stronie przeciwnej do toru zwrotnego
  const [sx] = PORT_XY[tile.straight];
  const [, dyp] = PORT_XY[tile.diverge];
  const side = dyp > C ? -1 : 1;
  g.appendChild(text(C + (sx - C) * 0.75, C + side * 10 + 0.5, '+', { class: 'tile-text plus' }));
  // lampka kontrolna, numer i przycisk – w ćwiartce po stronie toru zwrotnego, z dala od legu
  const [dxp] = PORT_XY[tile.diverge];
  const qx = dxp > C ? 5 : 35;        // po przeciwnej stronie w poziomie niż leg zwrotny
  const qy = dyp > C ? 9 : 31;        // po przeciwnej stronie w pionie niż leg zwrotny
  const dir = qx < C ? 1 : -1;
  refs.lockLamp = lamp(qx, qy, 2.4, 'lamp-white');
  g.appendChild(refs.lockLamp);
  g.appendChild(text(qx + dir * 8, qy + 0.5, tile.label ?? tile.id, { class: 'tile-text point-label' }));
  refs.btn = button(qx + dir * 17, qy, 4.5, 'black', { kind: 'point', id: tile.id }, null);
  g.appendChild(refs.btn);
  return { g, refs };
}

export function crossingArt(tile, ctx) {
  const g = tileBase('t-crossing', tile.face);
  const refs = { slits: [] };
  g.appendChild(channel(tile.pairs.flat()));
  for (const pair of tile.pairs) { const b = throughBar(pair); g.appendChild(b); refs.slits.push(b); }
  for (const p of tile.pairs.flat()) { g.appendChild(screw(p)); if (ctx.isJoint(tile, p)) g.appendChild(joint(p)); }
  return { g, refs };
}

/**
 * Powtarzacz sygnalizatora: szara pastylka z lampkami i znakiem masztu,
 * pod nią przycisk(i) z literą sygnalizatora.
 */
export function signalArt(tile) {
  const g = tileBase('t-signal', tile.face);
  const east = tile.dir === 'E';
  const refs = {};
  const hasShunt = tile.kind === 'tm' || tile.shunting;
  const py = 11;
  const lampsN = tile.kind === 'tm' ? 2 : (hasShunt ? 4 : 3);
  const pw = 8 + lampsN * 7;
  const px = C - pw / 2;
  g.appendChild(el('rect', { class: 'pill', x: px, y: py - 5.5, width: pw, height: 11, rx: 5.5 }));
  // znak masztu po stronie „podstawy” (przeciwnej do kierunku jazdy)
  const mx = east ? px - 1.5 : px + pw + 1.5;
  g.appendChild(el('path', { class: 'mast', d: `M${mx},${py - 4} L${mx},${py + 4} M${mx},${py} L${mx + (east ? 3 : -3)},${py}`, 'stroke-width': 1.2 }));
  const lx = (i) => px + 7.5 + i * 7;
  if (tile.kind === 'semafor') {
    const order = east ? ['orange', 'green', 'red', 'white'] : ['white', 'red', 'green', 'orange'];
    const use = hasShunt ? order : order.filter((c) => c !== 'white');
    refs.lamps = {};
    use.forEach((c, i) => { refs.lamps[c] = lamp(lx(i), py, 2.8, ''); g.appendChild(refs.lamps[c]); });
    // semafor z sygnałem manewrowym: dwa przyciski jeden pod drugim (obok siebie opis pociągowego wchodził pod biały przycisk)
    const gy = hasShunt ? 23.5 : 29, r = hasShunt ? 4.5 : 5;
    refs.btnGreen = button(9, gy, r, 'green', { kind: 'signal', id: tile.id, color: 'green' }, null);
    g.appendChild(refs.btnGreen);
    g.appendChild(text(16, gy + 0.5, tile.id, { class: 'tile-text sig-label', 'text-anchor': 'start' }));
    if (hasShunt) {
      refs.btnWhite = button(9, 34, r, 'white', { kind: 'signal', id: tile.id, color: 'white' }, null);
      g.appendChild(refs.btnWhite);
      const t = text(16, 34.5, '', { class: 'tile-text sig-label', 'text-anchor': 'start' });
      t.appendChild(el('tspan', { text: tile.id }));
      t.appendChild(el('tspan', { text: 'm', 'baseline-shift': 'super', style: 'font-size:5px' }));
      g.appendChild(t);
    }
  } else {
    refs.lamps = { blue: lamp(lx(east ? 0 : 1), py, 2.8, ''), white: lamp(lx(east ? 1 : 0), py, 2.8, '') };
    g.append(refs.lamps.blue, refs.lamps.white);
    refs.btnWhite = button(9, 29, 5, 'white', { kind: 'signal', id: tile.id, color: 'white' }, null);
    g.appendChild(refs.btnWhite);
    g.appendChild(text(16, 29.5, tile.id, { class: 'tile-text sig-label', 'text-anchor': 'start' }));
  }
  return { g, refs };
}

/** Przycisk grupowy; z licznikiem – urządzenie licznikowe nad przyciskiem. */
export function buttonTileArt(tile) {
  const g = tileBase('t-button', tile.face);
  const refs = {};
  if (tile.counter) {
    const c = counterDevice(5, 1, 30, 22, tile.label);
    g.appendChild(c.g); refs.counter = c.t;
    refs.btn = button(11, 32, 5, tile.color || 'grey', { kind: 'group', id: tile.id, role: tile.role }, tile.label, 'right');
  } else {
    refs.btn = button(11, 20, 6, tile.color || 'grey', { kind: 'group', id: tile.id, role: tile.role }, tile.label, 'right');
  }
  g.appendChild(refs.btn);
  return { g, refs };
}

/**
 * Opis (napis) na kostce. Opis toru „tor N” (trackLabelText) z side === 'top' to sam napis bez płytki – rysowany na
 * kostce toru tuż nad paskiem (DeskRenderer kładzie go nad płytką toru); inaczej napis na własnej kostce.
 */
export function labelArt(tile, side = null) {
  const trk = trackLabelText(tile.text);
  if (trk && side === 'top') return { g: el('g', { class: 'tile t-label' }, [text(CELL / 2, 7, trk, { class: 'tile-text label track-label' })]), refs: {} };
  const span = trk ? 1 : tile.span || 1;
  const g = el('g', { class: 'tile t-label' }, [
    el('rect', { class: `face ${tile.face || ''}`.trim(), x: 0, y: 0, width: CELL * span, height: CELL }),
  ]);
  if (trk) g.appendChild(text(CELL / 2, C, trk, { class: 'tile-text label track-label' }));
  else g.appendChild(text((CELL * span) / 2, C, tile.text, { class: 'tile-text label', style: `font-size:${tile.size || 10}px` }));
  return { g, refs: {} };
}

export function blankArt() {
  return { g: tileBase('t-blank'), refs: {} };
}

/** Skrzynka wskaźnika kierunku blokady: obrys w kształcie strzałki, w środku dwie okrągłe lampki (biała, czerwona). */
/**
 * Strzałka blokady liniowej na kostce toru szlakowego – jak na pulpitach typu E: kanał toru w kształcie strzałki, w nim
 * zamiast paska świetlnego krótka lampka-strzałka (biała – pozwolenie / kierunek, czerwona – tor szlakowy zajęty),
 * pod kanałem opis „wjazd” / „wyjazd” (na kostce z przyciskiem końca przebiegu – po lewej, przycisk po prawej).
 * Dokłada się do gotowej kostki toru (`g`), usuwając jej pasek i śrubki; zwraca lampkę-strzałkę. `toWest` – szlak leży na zachód.
 */
export function blockArrowArt(g, kind, toWest, hasEndButton = false) {
  const pointLeft = kind === 'out' ? toWest : !toWest;
  // zwykły prosty kanał toru zostaje; zamiast paska świetlnego jest w nim czarna strzałka o grubości paska,
  // z grotem mieszczącym się w kanale (bez własnego kanału i obwódki)
  for (const e of g.querySelectorAll('.bar, .screw')) e.remove();
  // obrys lampki (.lamp, 0,6) dolicza się do grubości – korpus ma dokładnie grubość paska toru
  const h = BAR_W / 2 - 0.3, H = CHANNEL_W / 2 - 0.9, tip = 7, a = 5, b = CELL - 5;
  const d = pointLeft
    ? `M${a},${C} L${a + tip},${C - H} L${a + tip},${C - h} H${b} V${C + h} H${a + tip} L${a + tip},${C + H} Z`
    : `M${b},${C} L${b - tip},${C - H} L${b - tip},${C - h} H${a} V${C + h} H${b - tip} L${b - tip},${C + H} Z`;
  const lampEl = el('path', { class: 'lamp arrow-lamp', d });
  g.appendChild(lampEl);
  g.appendChild(text(hasEndButton ? 3 : C, 33, kind === 'out' ? 'wyjazd' : 'wjazd', { class: 'tile-text tiny blk-arrow-label', ...(hasEndButton ? { 'text-anchor': 'start' } : {}) }));
  return lampEl;
}

/**
 * Kostka urządzenia blokady liniowej – w układzie zwykłych kostek przyciskowych pulpitu (buttonTileArt):
 * przycisk Wbl / Poz / Ko / Zk z opisem po prawej i lampką w rogu (żąd. / Ko / Wbl), albo licznik doraźny dKo / dPo
 * z przyciskiem pod nim. Poz i Wbl na zielonym polu, jak na pulpitach typu E.
 */
export function blockDeviceArt(role, exit) {
  const refs = { btns: {} };
  const ref = { kind: 'block', exit, btn: role };
  if (role === 'dPo' || role === 'dKo') {
    const g = tileBase('t-blockdev t-counter');
    const c = counterDevice(5, 1, 30, 22, role); g.appendChild(c.g);
    refs.counter = c.t;
    refs.btns[role] = button(11, 32, 5, 'black', ref, role, 'right'); g.appendChild(refs.btns[role]);
    return { g, refs };
  }
  const g = tileBase('t-blockdev', role === 'Poz' || role === 'Wbl' ? 'green' : '');
  if (role !== 'Zk') {
    // lampka w prawym górnym rogu (żąd. – sąsiad żąda pozwolenia, Ko – potwierdzić przyjazd, Wbl – żądanie wysłane)
    refs.lamp = lamp(33, 7, 3, 'lamp-white'); g.appendChild(refs.lamp);
    if (role === 'Poz') g.appendChild(text(28.5, 7.5, 'żąd.', { class: 'tile-text tiny', 'text-anchor': 'end' }));
  }
  refs.btns[role] = button(11, 20, 6, role === 'Zk' ? 'black' : 'red', ref, role, 'right'); g.appendChild(refs.btns[role]);
  return { g, refs };
}
