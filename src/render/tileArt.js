import { el, text, CELL } from './svg.js';
import { PORT_XY } from '../tiles/directions.js';

/**
 * Grafika kostek pulpitu (SVG). Każda funkcja zwraca { g, refs } –
 * grupę SVG 40×40 i odwołania do elementów dynamicznych (lampki, przyciski).
 *
 * Kolorystyka wzorowana na pulpitach kostkowych typu E: seledynowe lico kostki,
 * ciemne szczeliny świetlne, przyciski o kolorach: zielony (przebiegi pociągowe),
 * biały (manewrowe), czarny/szary (zwrotnicowe), czerwony (blokada/doraźne).
 */
export const SLIT_W = 7;
const C = CELL / 2;

export function tileBase(extraClass = '', face = '') {
  return el('g', { class: `tile ${extraClass}`.trim() }, [
    el('rect', { class: `face ${face}`.trim(), x: 0, y: 0, width: CELL, height: CELL }),
  ]);
}

/** Odcinek szczeliny od środka kostki do portu. */
function slitPath(port) {
  const [px, py] = PORT_XY[port];
  return `M${C},${C} L${px},${py}`;
}

/** Szczelina torowa między dwoma portami – dwa segmenty (każdy osobna lampka? nie – jedna). */
export function slit(ports, cls = 'slit') {
  const d = ports.map((p) => slitPath(p)).join(' ');
  return el('path', { class: cls, d, 'stroke-width': SLIT_W, 'stroke-linecap': 'butt', fill: 'none' });
}

/** Ciemna obwódka szczeliny (rysowana pod szczeliną). */
export function slitEdge(ports) {
  const d = ports.map((p) => slitPath(p)).join(' ');
  return el('path', { class: 'slit-edge', d, 'stroke-width': SLIT_W + 1.6, 'stroke-linecap': 'butt', fill: 'none' });
}

/** Krótki wskaźnik położenia zwrotnicy (żółty) przy końcu legu. */
function posBar(port) {
  const [px, py] = PORT_XY[port];
  const ax = C + (px - C) * 0.45, ay = C + (py - C) * 0.45;
  const bx = C + (px - C) * 0.95, by = C + (py - C) * 0.95;
  return el('path', { class: 'pos', d: `M${ax},${ay} L${bx},${by}`, 'stroke-width': SLIT_W - 2, fill: 'none' });
}

/** Znacznik izolacji (złącze izolowane) przy porcie. */
export function joint(port) {
  const [px, py] = PORT_XY[port];
  const dx = px - C, dy = py - C;
  const len = Math.hypot(dx, dy);
  const nx = -dy / len, ny = dx / len; // normalna
  const bx = C + dx * 0.86, by = C + dy * 0.86;
  return el('path', { class: 'joint', d: `M${bx + nx * 6},${by + ny * 6} L${bx - nx * 6},${by - ny * 6}`, 'stroke-width': 1.5 });
}

/** Przycisk (kółko) z ewentualnym opisem. */
export function button(cx, cy, r, color, ref, label, labelPos = 'below') {
  const g = el('g', { class: `btn btn-${color}`, 'data-ref': JSON.stringify(ref), role: 'button', tabindex: 0 }, [
    el('circle', { class: 'btn-shadow', cx: cx + 0.6, cy: cy + 1.2, r }),
    el('circle', { class: 'btn-ring', cx, cy, r }),
    el('circle', { class: 'btn-cap', cx, cy, r: r - 2 }),
    el('circle', { class: 'btn-hl', cx: cx - r * 0.3, cy: cy - r * 0.35, r: r * 0.28 }),
  ]);
  if (label) {
    const ly = labelPos === 'below' ? cy + r + 6 : cy - r - 5;
    g.appendChild(text(cx, ly, label, { class: 'btn-label' }));
  }
  return g;
}

/** Okienko licznika. */
export function counter(x, y, w, h) {
  const g = el('g', { class: 'counter' }, [
    el('rect', { x, y, width: w, height: h, rx: 1.5 }),
  ]);
  const t = text(x + w / 2, y + h / 2 + 0.5, '00000', { class: 'counter-text' });
  g.appendChild(t);
  return { g, t };
}

/** Lampka (kółko). */
export function lamp(cx, cy, r, cls = '') {
  return el('circle', { class: `lamp ${cls}`.trim(), cx, cy, r });
}

/* ------------------------------------------------------------------ */

export function trackArt(tile, ctx) {
  const g = tileBase('t-track', tile.face);
  const refs = { slits: [] };
  g.appendChild(slitEdge(tile.ports));
  const s = slit(tile.ports);
  g.appendChild(s);
  refs.slits.push(s);
  for (const p of tile.ports) if (ctx.isJoint(tile, p)) g.appendChild(joint(p));
  if (tile.text) {
    const above = tile.ports.every((p) => !p.includes('N'));
    g.appendChild(text(C, above ? 9 : 33, tile.text, { class: 'tile-text small' }));
  }
  if (tile.derailer) {
    // symbol wykolejnicy: klin nad torem + lampka + przycisk
    const wk = el('g', { class: 'derailer' }, [
      el('path', { class: 'wk-body', d: `M${C - 7},${C - 6} L${C + 7},${C - 6} L${C + 2},${C - 12} Z` }),
    ]);
    refs.derailerLamp = lamp(C - 12, C - 9, 2.6, 'lamp-yellow');
    wk.appendChild(refs.derailerLamp);
    g.appendChild(wk);
    refs.derailerBtn = button(C + 12, C + 12, 5.5, 'black', { kind: 'derailer', id: tile.derailer }, null);
    g.appendChild(refs.derailerBtn);
    g.appendChild(text(C - 10, C + 12, 'Wk', { class: 'tile-text tiny' }));
  }
  if (tile.endButton) {
    const onTop = tile.ports.every((p) => !p.includes('N'));
    refs.endBtn = button(C + 10, onTop ? 9 : 31, 5.5, tile.endButton.color || 'green', { kind: 'end', id: tile.endButton.id }, null);
    g.appendChild(refs.endBtn);
  }
  return { g, refs };
}

export function bufferArt(tile, ctx) {
  const g = tileBase('t-buffer', tile.face);
  const refs = { slits: [] };
  g.appendChild(el('path', { class: 'slit-edge', d: slitPath(tile.port), 'stroke-width': SLIT_W + 1.6, fill: 'none' }));
  const s = el('path', { class: 'slit', d: slitPath(tile.port), 'stroke-width': SLIT_W, fill: 'none' });
  g.appendChild(s); refs.slits.push(s);
  if (ctx.isJoint(tile, tile.port)) g.appendChild(joint(tile.port));
  // kozioł – klamra ⊐ na końcu szczeliny
  const [px, py] = PORT_XY[tile.port];
  const dx = px - C, dy = py - C, len = Math.hypot(dx, dy);
  const ux = dx / len, uy = dy / len, nx = -dy / len, ny = dx / len;
  const ex = C - ux * 2, ey = C - uy * 2;
  g.appendChild(el('path', { class: 'buffer-bar', 'stroke-width': 1.6,
    d: `M${ex + ux * 6 + nx * 7},${ey + uy * 6 + ny * 7} L${ex + nx * 7},${ey + ny * 7} L${ex - nx * 7},${ey - ny * 7} L${ex + ux * 6 - nx * 7},${ey + uy * 6 - ny * 7}` }));
  if (tile.endButton) {
    refs.endBtn = button(tile.port.includes('W') ? C + 10 : C - 10, 9, 5.5, tile.endButton.color || 'white', { kind: 'end', id: tile.endButton.id }, null);
    g.appendChild(refs.endBtn);
  }
  return { g, refs };
}

export function pointArt(tile, ctx) {
  const g = tileBase(`t-point${tile.face === 'plain' ? ' plain' : ''}`);
  const mk = (port) => el('path', { class: 'slit', d: slitPath(port), 'stroke-width': SLIT_W, fill: 'none' });
  g.appendChild(slitEdge([tile.toe, tile.straight, tile.diverge]));
  const refs = { toe: mk(tile.toe), straight: mk(tile.straight), diverge: mk(tile.diverge) };
  g.append(refs.diverge, refs.straight, refs.toe);
  refs.posStraight = posBar(tile.straight); refs.posDiverge = posBar(tile.diverge);
  g.append(refs.posStraight, refs.posDiverge);
  for (const p of [tile.toe, tile.straight, tile.diverge]) if (ctx.isJoint(tile, p)) g.appendChild(joint(p));
  // znak „+” przy torze zasadniczym (po stronie przeciwnej do toru zwrotnego)
  {
    const [sx, sy] = PORT_XY[tile.straight];
    const [dxp, dyp] = PORT_XY[tile.diverge];
    const side = dyp > C ? -1 : 1; // tor zwrotny w dół -> plus nad torem
    g.appendChild(text(C + (sx - C) * 0.8, C + side * 9 + 0.5, '+', { class: 'tile-text plus' }));
  }
  // przycisk zwrotnicowy w wolnej ćwiartce
  const quad = freeQuadrant([tile.toe, tile.straight, tile.diverge], tile.diverge);
  const bx = quad[0] < C ? 8 : 32, by = quad[1] < C ? 9 : 31;
  refs.btn = button(bx, by, 5, 'black', { kind: 'point', id: tile.id }, null);
  g.appendChild(refs.btn);
  const dirIn = quad[0] < C ? 1 : -1;
  g.appendChild(text(bx + dirIn * 9, by + 0.5, tile.label ?? tile.id, { class: 'tile-text point-label', 'text-anchor': dirIn > 0 ? 'start' : 'end' }));
  refs.lockLamp = lamp(bx + dirIn * 18, by, 2.2, 'lamp-white');
  g.appendChild(refs.lockLamp);
  return { g, refs };
}

function quadrantOf(port) {
  return { NE: [30, 10], NW: [10, 10], SE: [30, 30], SW: [10, 30] }[port];
}

function freeQuadrant(ports, diverge) {
  const used = new Set(ports.filter((p) => p.length === 2));
  const order = [];
  // najpierw ćwiartka po przeciwnej stronie toru zwrotnego
  const opp = { NE: 'SW', NW: 'SE', SE: 'NW', SW: 'NE' }[diverge];
  if (opp) order.push(opp);
  order.push('SE', 'SW', 'NE', 'NW');
  for (const q of order) if (!used.has(q)) return quadrantOf(q);
  return [30, 30];
}

function oppositeQuadrant(q, ports) {
  const used = new Set(ports.filter((p) => p.length === 2));
  const cands = ['NE', 'NW', 'SE', 'SW'].filter((k) => !used.has(k)).map(quadrantOf).filter((c) => c[0] !== q[0] || c[1] !== q[1]);
  // preferuj tę samą stronę toru (góra/dół) co przycisk
  const same = cands.find((c) => c[1] === q[1]);
  return same || cands[0] || [10, 10];
}

export function crossingArt(tile, ctx) {
  const g = tileBase('t-crossing');
  const refs = { slits: [] };
  for (const pair of tile.pairs) { const s = slit(pair); g.appendChild(s); refs.slits.push(s); }
  for (const p of tile.pairs.flat()) if (ctx.isJoint(tile, p)) g.appendChild(joint(p));
  return { g, refs };
}

/**
 * Powtarzacz sygnalizatora. Jeśli kostka leży nad torem – maszt w dół, pod torem – w górę.
 */
export function signalArt(tile) {
  const g = tileBase('t-signal', tile.face);
  const east = tile.dir === 'E';
  const refs = {};
  const hasShunt = tile.kind === 'tm' || tile.shunting;
  // Powtarzacz: ciemne pudełko z lampkami; obok przycisk i etykieta (etykieta może wystawać poza kostkę)
  const y1 = 12, y2 = 28;
  if (tile.kind === 'semafor') {
    g.appendChild(el('rect', { class: 'sig-head', x: 2, y: y1 - 5.5, width: 19, height: 11, rx: 3 }));
    refs.top = lamp(7.5, y1, 3, 'lamp-red on');
    refs.bottom = lamp(15.5, y1, 3, '');
    g.append(refs.top, refs.bottom);
    refs.btnGreen = button(28, y1, 4.5, 'green', { kind: 'signal', id: tile.id, color: 'green' }, null);
    g.appendChild(refs.btnGreen);
    g.appendChild(text(34, y1 + 0.5, tile.id, { class: 'tile-text sig-label', 'text-anchor': 'start' }));
    if (hasShunt) {
      refs.btnWhite = button(28, y2, 4.5, 'white', { kind: 'signal', id: tile.id, color: 'white' }, null);
      g.appendChild(refs.btnWhite);
      const t = text(34, y2 + 0.5, '', { class: 'tile-text sig-label', 'text-anchor': 'start' });
      t.appendChild(el('tspan', { text: tile.id }));
      t.appendChild(el('tspan', { text: 'm', 'baseline-shift': 'super', style: 'font-size:5px' }));
      g.appendChild(t);
    }
  } else {
    g.appendChild(el('rect', { class: 'sig-head tm', x: 2, y: y1 - 5.5, width: 19, height: 11, rx: 3 }));
    refs.top = lamp(7.5, y1, 3, 'lamp-blue on');
    refs.ms = lamp(15.5, y1, 3, '');
    g.append(refs.top, refs.ms);
    refs.btnWhite = button(28, y1, 4.5, 'white', { kind: 'signal', id: tile.id, color: 'white' }, null);
    g.appendChild(refs.btnWhite);
    g.appendChild(text(34, y1 + 0.5, tile.id, { class: 'tile-text sig-label', 'text-anchor': 'start' }));
  }
  // strzałka kierunku ważności
  const ay = hasShunt && tile.kind === 'semafor' ? y2 : y2 - 4;
  const ax = 11;
  g.appendChild(el('path', { class: 'dir-arrow', d: east ? `M${ax - 4},${ay - 3} L${ax + 3},${ay} L${ax - 4},${ay + 3} Z` : `M${ax + 4},${ay - 3} L${ax - 3},${ay} L${ax + 4},${ay + 3} Z` }));
  return { g, refs };
}

export function buttonTileArt(tile) {
  const g = tileBase('t-button', tile.face);
  const refs = {};
  refs.btn = button(C, tile.counter ? 11 : 16, 7, tile.color || 'grey', { kind: 'group', id: tile.id, role: tile.role }, null);
  g.appendChild(refs.btn);
  g.appendChild(text(C, tile.counter ? 24 : 31, tile.label, { class: 'tile-text btn-title' }));
  if (tile.counter) {
    const c = counter(6, 28, 28, 9);
    g.appendChild(c.g); refs.counter = c.t;
  }
  return { g, refs };
}

export function labelArt(tile) {
  const span = tile.span || 1;
  const g = el('g', { class: 'tile t-label' }, [
    el('rect', { class: `face ${tile.face || ''}`.trim(), x: 0, y: 0, width: CELL * span, height: CELL }),
  ]);
  g.appendChild(text((CELL * span) / 2, C, tile.text, { class: 'tile-text label', style: `font-size:${tile.size || 10}px` }));
  return { g, refs: {} };
}

export function blankArt() {
  return { g: tileBase('t-blank'), refs: {} };
}

/** Pole blokady liniowej Eap: 4×2 kostki. */
export function blockArt(tile, exitDef) {
  const W = CELL * 4, Hh = CELL * 2;
  const g = el('g', { class: 'tile t-block' }, [
    el('rect', { class: 'face', x: 0, y: 0, width: W, height: Hh }),
    el('rect', { class: 'block-frame', x: 3, y: 3, width: W - 6, height: Hh - 6, rx: 3 }),
  ]);
  const refs = {};
  const toWest = exitDef.dir === 'W';
  g.appendChild(text(W / 2, 12, `${toWest ? '◀ ' : ''}${exitDef.name}${toWest ? '' : ' ▶'}`, { class: 'tile-text block-title' }));
  // Lampki: żądanie, kierunek wjazd/wyjazd, zajętość, Po, Ko
  const ly = 30;
  const items = [
    ['req', 'żąd.', 'lamp-white'],
    ['in', toWest ? '◀ wj.' : 'wj. ▶', 'lamp-white'],
    ['out', toWest ? '◀ wyj.' : 'wyj. ▶', 'lamp-white'],
    ['occ', 'szlak', 'lamp-red'],
    ['po', 'Po', 'lamp-red'],
    ['ko', 'Ko', 'lamp-yellow'],
  ];
  items.forEach(([key, label, cls], i) => {
    const x = 16 + i * 26;
    refs[key] = lamp(x, ly, 4, cls);
    g.appendChild(refs[key]);
    g.appendChild(text(x, ly + 11, label, { class: 'tile-text tiny' }));
  });
  // Przyciski
  const by = 60;
  const btns = [
    ['Wbl', 'grey'], ['Poz', 'white'], ['Ko', 'red'], ['dPo', 'red'], ['dKo', 'red'],
  ];
  refs.btns = {};
  btns.forEach(([id, color], i) => {
    const x = 18 + i * 31;
    const b = button(x, by, 7, color, { kind: 'block', exit: tile.exit, btn: id }, id, 'below');
    refs.btns[id] = b;
    g.appendChild(b);
  });
  const c1 = counter(100, 46, 22, 8); const c2 = counter(131, 46, 22, 8);
  g.append(c1.g, c2.g);
  refs.cntPo = c1.t; refs.cntKo = c2.t;
  return { g, refs };
}
