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

export function tileBase(extraClass = '') {
  return el('g', { class: `tile ${extraClass}`.trim() }, [
    el('rect', { class: 'face', x: 0, y: 0, width: CELL, height: CELL }),
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
  const t = text(x + w / 2, y + h / 2 + 0.5, '000', { class: 'counter-text' });
  g.appendChild(t);
  return { g, t };
}

/** Lampka (kółko). */
export function lamp(cx, cy, r, cls = '') {
  return el('circle', { class: `lamp ${cls}`.trim(), cx, cy, r });
}

/* ------------------------------------------------------------------ */

export function trackArt(tile, ctx) {
  const g = tileBase('t-track');
  const refs = { slits: [] };
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
  const g = tileBase('t-buffer');
  const refs = { slits: [] };
  const s = el('path', { class: 'slit', d: slitPath(tile.port), 'stroke-width': SLIT_W, fill: 'none' });
  g.appendChild(s); refs.slits.push(s);
  if (ctx.isJoint(tile, tile.port)) g.appendChild(joint(tile.port));
  // kozioł – poprzeczka
  const [px, py] = PORT_XY[tile.port];
  const dx = px - C, dy = py - C, len = Math.hypot(dx, dy);
  const nx = -dy / len, ny = dx / len;
  g.appendChild(el('path', { class: 'buffer-bar', d: `M${C + nx * 8},${C + ny * 8} L${C - nx * 8},${C - ny * 8}`, 'stroke-width': 3 }));
  g.appendChild(el('path', { class: 'buffer-bar', d: `M${C - dx * 0.25 + nx * 5},${C - dy * 0.25 + ny * 5} L${C - dx * 0.25 - nx * 5},${C - dy * 0.25 - ny * 5}`, 'stroke-width': 2 }));
  if (tile.endButton) {
    refs.endBtn = button(tile.port.includes('W') ? C + 10 : C - 10, 9, 5.5, tile.endButton.color || 'white', { kind: 'end', id: tile.endButton.id }, null);
    g.appendChild(refs.endBtn);
  }
  return { g, refs };
}

export function pointArt(tile, ctx) {
  const g = tileBase('t-point');
  const mk = (port) => el('path', { class: 'slit', d: slitPath(port), 'stroke-width': SLIT_W, fill: 'none' });
  const refs = { toe: mk(tile.toe), straight: mk(tile.straight), diverge: mk(tile.diverge) };
  g.append(refs.diverge, refs.straight, refs.toe);
  for (const p of [tile.toe, tile.straight, tile.diverge]) if (ctx.isJoint(tile, p)) g.appendChild(joint(p));
  // przycisk zwrotnicowy w wolnej ćwiartce
  const quad = freeQuadrant([tile.toe, tile.straight, tile.diverge], tile.diverge);
  refs.btn = button(quad[0], quad[1], 5.5, 'black', { kind: 'point', id: tile.id }, null);
  g.appendChild(refs.btn);
  const lq = oppositeQuadrant(quad, [tile.toe, tile.straight, tile.diverge]);
  g.appendChild(text(lq[0], lq[1], tile.label ?? tile.id, { class: 'tile-text point-label' }));
  refs.lockLamp = lamp(quad[0] + (quad[0] < C ? 9 : -9), quad[1], 2.2, 'lamp-white');
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
  const g = tileBase('t-signal');
  const above = tile.y < tile.at.y;
  const east = tile.dir === 'E';
  const refs = {};
  // maszt
  const mastX = 11;
  const headY = above ? 12 : 28;
  g.appendChild(el('path', { class: 'mast', d: above ? `M${mastX},${CELL} L${mastX},${headY}` : `M${mastX},0 L${mastX},${headY}`, 'stroke-width': 2 }));
  if (tile.kind === 'semafor') {
    // głowica z dwiema lampami (górna/dolna) – obrazy dwuświatłowe wg Ie-1
    g.appendChild(el('rect', { class: 'sig-head', x: mastX - 6, y: headY - 11, width: 12, height: 22, rx: 5 }));
    refs.top = lamp(mastX, headY - 5, 3.6, 'lamp-red on');
    refs.bottom = lamp(mastX, headY + 5, 3.6, '');
    g.append(refs.top, refs.bottom);
  } else {
    // tarcza manewrowa – kwadrat z przekątną
    g.appendChild(el('rect', { class: 'sig-head tm', x: mastX - 6, y: headY - 6, width: 12, height: 12, rx: 2 }));
    g.appendChild(el('path', { class: 'tm-bar', d: `M${mastX - 5},${headY + 5} L${mastX + 5},${headY - 5}`, 'stroke-width': 1.2 }));
    refs.top = lamp(mastX, headY, 3.2, 'lamp-blue on');
  }
  // strzałka kierunku
  const ay = above ? headY + 16 : headY - 16;
  g.appendChild(el('path', { class: 'dir-arrow', d: east ? `M${mastX - 4},${ay - 3} L${mastX + 3},${ay} L${mastX - 4},${ay + 3} Z` : `M${mastX + 4},${ay - 3} L${mastX - 3},${ay} L${mastX + 4},${ay + 3} Z` }));
  // opis
  g.appendChild(text(mastX + 17, above ? 36 : 5, tile.id, { class: 'tile-text sig-label' }));
  // przyciski
  const hasShunt = tile.kind === 'tm' || tile.shunting;
  const bx = 30;
  if (tile.kind === 'semafor') {
    refs.btnGreen = button(bx, hasShunt ? 11 : 15, 5.5, 'green', { kind: 'signal', id: tile.id, color: 'green' }, null);
    g.appendChild(refs.btnGreen);
    if (hasShunt) { refs.btnWhite = button(bx, 26, 5.5, 'white', { kind: 'signal', id: tile.id, color: 'white' }, null); g.appendChild(refs.btnWhite); }
  } else {
    refs.btnWhite = button(bx, 15, 5.5, 'white', { kind: 'signal', id: tile.id, color: 'white' }, null);
    g.appendChild(refs.btnWhite);
  }
  return { g, refs };
}

export function buttonTileArt(tile) {
  const g = tileBase('t-button');
  const refs = {};
  g.appendChild(text(C, 7, tile.label, { class: 'tile-text btn-title' }));
  refs.btn = button(C, tile.counter ? 19 : 22, 8, tile.color || 'grey', { kind: 'group', id: tile.id, role: tile.role }, null);
  g.appendChild(refs.btn);
  if (tile.counter) {
    const c = counter(9, 30, 22, 8);
    g.appendChild(c.g); refs.counter = c.t;
  }
  return { g, refs };
}

export function labelArt(tile) {
  const span = tile.span || 1;
  const g = el('g', { class: 'tile t-label' }, [
    el('rect', { class: 'face', x: 0, y: 0, width: CELL * span, height: CELL }),
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
    ['req', 'żąd.', 'lamp-white blink-src'],
    ['in', 'wjazd', 'lamp-white'],
    ['out', 'wyjazd', 'lamp-white'],
    ['occ', 'zaj.', 'lamp-red'],
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
  const c1 = counter(102, 48, 18, 7); const c2 = counter(133, 48, 18, 7);
  g.append(c1.g, c2.g);
  refs.cntPo = c1.t; refs.cntKo = c2.t;
  return { g, refs };
}
