import { platformSpans, trackLabelText, trackLabelPlace, platformEdgeLines } from './platforms.js';
import { blockLayouts } from './blockLayout.js';
import { el, text, CELL } from './svg.js';
import { refKey } from './refKey.js';
import { PanelView } from './PanelView.js';
import { getTileDef } from '../tiles/registry.js';
import { deskControls } from '../tiles/controls.js';
import { VEC, OPPOSITE } from '../tiles/directions.js';
import { t } from '../i18n/index.js';

/**
 * Części wspólne pulpitów kostkowych (typ E, IZH-111): rama z numeracją, siatka, kostki z planu stacji, perony,
 * kostki blokady liniowej, lampki, przyciski pod palcem i myszą, etykiety pociągów. Pulpity różnią się grafiką
 * kostek (`art`) i tym, co lampki pokazują – to zostaje w widokach.
 */
export const FRAME = 22; // szerokość ramy pulpitu (margines rysunku)

/** Stan lampki: 'off' albo '<kolor>' / '<kolor> blink'. */
export function setLamp(e, state) {
  if (!e) return;
  e.classList.remove('on', 'lamp-red', 'lamp-white', 'lamp-yellow', 'lamp-green', 'lamp-orange', 'lamp-blue', 'lamp-pos', 'blink');
  if (state === 'off') return;
  const [color, blink] = state.split(' ');
  e.classList.add('on', `lamp-${color}`);
  if (blink) e.classList.add('blink');
}

/** Lampka odcinka: czerwona – zajęty, biała – utwierdzony, żółta migająca – zamknięty, inaczej ciemna. */
export function sectionLamp(sec) {
  if (sec.occupied) return 'red';
  if (sec.route) return 'white';
  if (sec.closed) return 'yellow blink';
  return 'off';
}

/**
 * Buduje pulpit: tło, rama, kostki, perony, siatka. `art` – grafika kostek (`trackArt`, `bufferArt`, `pointArt`,
 * `crossingArt`, `signalArt`, `buttonTileArt`, `labelArt`, `blankArt`, `blockArrowArt`, `blockDeviceArt`).
 * Wypełnia mapy widoku: `tileRefs`, `sectionRefs`, `pointRefs`, `derailerRefs`, `signalRefs`, `counterRefs`,
 * `blockRefs`, `controlEls`.
 */
export function buildDesk(view, art) {
  const { cols, rows } = view;
  view.tileRefs = new Map(); // tileKey -> refs
  view.addBackdrop(
    el('rect', { class: 'desk-bg', x: 0, y: 0, width: view.width, height: view.height, rx: 4 }),
    el('rect', { class: 'desk-face-bg', x: FRAME, y: FRAME, width: cols * CELL, height: rows * CELL }),
  );
  if (view.readonly) {
    view.addBackdrop(el('g', { class: 'readonly-banner' }, [
      el('rect', { x: FRAME + 4, y: 2, width: 260, height: 16, rx: 3 }),
      text(FRAME + 134, 11, t('desk.readonly', { name: view.title || t('desk.district') }), { class: 'readonly-text' }),
    ]));
  }
  view.layerTiles = el('g', { class: 'layer-tiles' });
  view.layerGrid = el('g', { class: 'layer-grid' });
  view.layerTrains = el('g', { class: 'layer-trains' });
  view.inner.append(view.layerTiles, view.layerGrid, view.layerTrains);
  buildFrame(view);
  buildTiles(view, art);
  buildPlatforms(view);
  buildGrid(view);
}

function buildTiles(view, art) {
  const ctx = {
    isJoint: (tile, port) => {
      const [dx, dy] = VEC[port];
      const n = view.topo.trackAt(tile.x + dx, tile.y + dy);
      if (!n) return true;
      if (!n._def.ports(n).includes(OPPOSITE[port])) return true;
      return n.section !== tile.section;
    },
  };
  const filled = new Set();
  const deferred = [];
  // blokada liniowa jako kostki przy końcu toru szlakowego: strzałki na kostkach toru, przyciski i liczniki obok
  const plan = blockLayouts(view.station);
  const arrowAt = new Map();
  for (const L of plan.values()) for (const a of L.arrows) arrowAt.set(`${a.x},${a.y}`, { exit: L.exit, kind: a.kind, toWest: L.dir === 'W' });
  const blockRef = (exit) => { if (!view.blockRefs.has(exit)) view.blockRefs.set(exit, { btns: {} }); return view.blockRefs.get(exit); };
  for (const tile of view.station.tiles) {
    if (!view.inWindow(tile.x) || tile.type === 'button') continue; // przyciski grupowe rysuje stanowisko – niżej
    let out;
    // opis „tor N” rysuje się nad opisywanym torem, na kostce toru; jego własna kostka zostaje pusta
    const pos = tile.type === 'label' && trackLabelText(tile.text) ? trackLabelPlace(view.station, tile) : { x: tile.x, y: tile.y, side: null };
    switch (tile.type) {
      case 'track': {
        const arrow = arrowAt.get(`${tile.x},${tile.y}`);
        // kostka skrajna blokady: nazwa sąsiedniego posterunku (text) nad torem obok przycisku końca przebiegu
        out = art.trackArt(arrow ? { ...tile, blockEdge: arrow.toWest ? 'W' : 'E' } : tile, ctx);
        if (arrow) {
          const r = blockRef(arrow.exit);
          r[arrow.kind === 'out' ? 'outArrow' : 'inArrow'] = art.blockArrowArt(out.g, arrow.kind, arrow.toWest);
          r[arrow.kind === 'out' ? 'outSection' : 'inSection'] = tile.section; // zajętość odcinka kostki pokazuje strzałka
          out.refs.slits = out.refs.slits.filter((e) => e.isConnected); // kostka kierunkowa bez paska odcinka
        }
        break;
      }
      case 'buffer': out = art.bufferArt(tile, ctx); break;
      case 'point': out = art.pointArt(tile, ctx); break;
      case 'crossing': out = art.crossingArt(tile, ctx); break;
      case 'signal': out = art.signalArt(tile); break;
      case 'label': out = art.labelArt(tile, pos.side ?? null); break;
      default: out = art.blankArt();
    }
    out.g.setAttribute('transform', `translate(${(pos.x - view.x0) * CELL},${pos.y * CELL})`);
    out.g.dataset.tile = tile._key;
    if (pos.side === 'top') deferred.push(out.g); // sam napis, ponad płytką kostki toru
    else view.layerTiles.appendChild(out.g);
    // nazwa szlaku na kostce skrajnej blokady bywa dłuższa niż kostka – rysowana ponad sąsiednimi kostkami
    if (out.refs.edgeText) deferred.push(el('g', { class: 'tile-over', transform: out.g.getAttribute('transform') }, [out.refs.edgeText]));
    view.tileRefs.set(tile._key, out.refs);
    const def = getTileDef(tile.type);
    const span = tile.type === 'label' ? { w: trackLabelText(tile.text) ? 1 : tile.span || 1, h: 1 } : def.span;
    if (pos.side !== 'top') for (let dx = 0; dx < span.w; dx++) for (let dy = 0; dy < span.h; dy++) filled.add(`${tile.x + dx},${tile.y + dy}`);

    if (def.category === 'track' && tile.type !== 'point') {
      if (!view.sectionRefs.has(tile.section)) view.sectionRefs.set(tile.section, []);
      for (const s of out.refs.slits) view.sectionRefs.get(tile.section).push({ el: s, tile });
    }
    if (tile.type === 'point') view.pointRefs.set(tile.id, out.refs);
    if (tile.derailer) view.derailerRefs.set(tile.derailer, out.refs);
    if (tile.type === 'signal') view.signalRefs.set(tile.id, out.refs);
  }
  for (const g of deferred) view.layerTiles.appendChild(g);
  // Przyciski grupowe stanowiska (typ E: Zw, Zz, Pz, dPz, Sz) – nie pochodzą z definicji stacji
  for (const c of deskControls(view.station)) {
    if (!view.inWindow(c.x)) continue;
    const out = art.buttonTileArt(c);
    out.g.setAttribute('transform', `translate(${(c.x - view.x0) * CELL},${c.y * CELL})`);
    out.g.dataset.control = c.id;
    view.layerTiles.appendChild(out.g);
    view.tileRefs.set(`control:${c.id}`, out.refs);
    filled.add(`${c.x},${c.y}`);
    if (out.refs.counter) view.counterRefs.set(c.id, out.refs.counter);
  }
  // Kostki urządzeń blokady (Wbl / Poz / Ko / Zk, liczniki dKo / dPo) – grupa na wyjazd, do wskazywania w samouczku
  for (const L of plan.values()) {
    const cluster = el('g', { class: 'block-cluster', 'data-exit': L.exit });
    const r = blockRef(L.exit);
    for (const d of L.devices) {
      if (!view.inWindow(d.x)) continue;
      const dev = art.blockDeviceArt(d.role, L.exit);
      dev.g.setAttribute('transform', `translate(${(d.x - view.x0) * CELL},${d.y * CELL})`);
      cluster.appendChild(dev.g);
      filled.add(`${d.x},${d.y}`);
      Object.assign(r.btns, dev.refs.btns);
      if (d.role === 'Poz') r.req = dev.refs.lamp;
      if (d.role === 'Ko') r.ko = dev.refs.lamp;
      if (d.role === 'Wbl') r.wbl = dev.refs.lamp;
      if (d.role === 'dPo') r.cntPo = dev.refs.counter;
      if (d.role === 'dKo') r.cntKo = dev.refs.counter;
    }
    if (cluster.childNodes.length) view.layerTiles.appendChild(cluster);
  }
  // Puste kostki
  for (let y = 0; y < view.rows; y++) for (let x = view.x0; x <= view.x1; x++) {
    if (filled.has(`${x},${y}`)) continue;
    const b = art.blankArt();
    b.g.setAttribute('transform', `translate(${(x - view.x0) * CELL},${y * CELL})`);
    view.layerTiles.insertBefore(b.g, view.layerTiles.firstChild);
  }
  for (const b of view.svg.querySelectorAll('.btn')) view.controlEls.set(refKey(JSON.parse(b.dataset.ref)), b);
}

/** Perony: przerywany obrys z nazwą (Peron I, II…) w rzędzie między torami peronowymi lub obok toru. */
function buildPlatforms(view) {
  for (const p of platformSpans(view.station, [view.x0, view.x1])) {
    const h = CELL * p.hCells;
    const y = p.yRow * CELL + CELL / 2;
    const rx = (p.x0 - view.x0) * CELL + 4, ry = y - h / 2, rw = (p.x1 - p.x0 + 1) * CELL - 8;
    view.layerTiles.appendChild(el('g', { class: 'desk-platform' }, [
      el('rect', { x: rx, y: ry, width: rw, height: h }),
      // krawędź peronowa od strony toru: podwójna kreska (jak na pulpitach nastawczych)
      ...platformEdgeLines(rx, ry, rw, h, p.edges).map(([x1, y1, x2, y2]) => el('line', { class: 'platform-edge', x1, y1, x2, y2 })),
      text((p.labelX + 0.5 - view.x0) * CELL, y, p.name, { class: 'tile-text platform-label', 'dominant-baseline': 'central' }),
    ]));
  }
}

/** Rama pulpitu: numeracja kolumn (od lewej) i rzędów (od dołu), śruby. */
function buildFrame(view) {
  const { cols, rows, width: W, height: H } = view;
  const g = el('g', { class: 'frame' });
  const pad = (n) => String(n).padStart(2, '0');
  for (let x = 0; x < cols; x++) {
    const cx = FRAME + x * CELL + CELL / 2;
    g.appendChild(text(cx, FRAME / 2 + 3, pad(view.x0 + x + 1), { class: 'frame-text' }));
    g.appendChild(text(cx, H - FRAME / 2 + 3, pad(view.x0 + x + 1), { class: 'frame-text' }));
    g.appendChild(el('circle', { class: 'frame-screw', cx: FRAME + x * CELL, cy: 5, r: 1.8 }));
    g.appendChild(el('circle', { class: 'frame-screw', cx: FRAME + x * CELL, cy: H - 5, r: 1.8 }));
  }
  for (let y = 0; y < rows; y++) {
    const cy = FRAME + y * CELL + CELL / 2;
    const n = pad(rows - y);
    g.appendChild(text(FRAME / 2, cy + 1, n, { class: 'frame-text' }));
    g.appendChild(text(W - FRAME / 2, cy + 1, n, { class: 'frame-text' }));
    g.appendChild(el('circle', { class: 'frame-screw', cx: 5, cy: FRAME + y * CELL, r: 1.8 }));
    g.appendChild(el('circle', { class: 'frame-screw', cx: W - 5, cy: FRAME + y * CELL, r: 1.8 }));
  }
  view.svg.appendChild(g);
}

function buildGrid(view) {
  const { cols, rows } = view;
  const d = [];
  for (let x = 0; x <= cols; x++) d.push(`M${x * CELL},0 V${rows * CELL}`);
  for (let y = 0; y <= rows; y++) d.push(`M0,${y * CELL} H${cols * CELL}`);
  view.layerGrid.appendChild(el('path', { class: 'grid', d: d.join(' ') }));
}

/**
 * Przyciski pulpitu pod palcem, myszą i klawiaturą: naciśnięcie = `onPress(ref)`. Z `pull: true` przytrzymanie
 * (0,55 s), prawy przycisk myszy i Backspace / Delete to wyciągnięcie = `onPull(ref)`; bez niego przytrzymanie
 * jest zwykłym naciśnięciem.
 */
export function bindDeskButtons(view, { pull = true } = {}) {
  const LONG = 550;
  const { svg, handlers } = view;
  const refOf = (b) => JSON.parse(b.dataset.ref);
  let timer = null; let active = null; let longFired = false;
  const cancel = () => { if (timer) clearTimeout(timer); timer = null; };
  svg.addEventListener('pointerdown', (ev) => {
    if (view.readonly) return;
    const b = ev.target.closest('.btn');
    if (!b) return;
    ev.preventDefault();
    active = b; longFired = false;
    b.classList.add('pressed');
    if (!pull) return;
    if (ev.button === 2) { longFired = true; handlers.onPull(refOf(b)); return; }
    timer = setTimeout(() => { longFired = true; b.classList.add('pulled'); handlers.onPull(refOf(b)); }, LONG);
  });
  const finish = (ev) => {
    if (!active) return;
    cancel();
    const b = active; active = null;
    b.classList.remove('pressed');
    setTimeout(() => b.classList.remove('pulled'), 300);
    if (longFired) return;
    if (ev.type === 'pointerup' && b.contains(ev.target)) handlers.onPress(refOf(b));
  };
  svg.addEventListener('pointerup', finish);
  svg.addEventListener('pointercancel', finish);
  svg.addEventListener('pointerleave', finish);
  svg.addEventListener('contextmenu', (ev) => { if (ev.target.closest('.btn')) ev.preventDefault(); });
  svg.addEventListener('keydown', (ev) => {
    const b = ev.target.closest('.btn'); if (!b) return;
    if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); handlers.onPress(refOf(b)); }
    if (pull && (ev.key === 'Backspace' || ev.key === 'Delete')) { ev.preventDefault(); handlers.onPull(refOf(b)); }
  });
}

/** Lampki i liczniki blokady liniowej szlaku (strzałki na kostkach toru, lampki żądania, Wbl i Ko). */
export function updateBlockLamps(view, exitId) {
  const b = view.sim.blocks.get(exitId);
  const r = view.blockRefs.get(exitId);
  if (!b || !r) return;
  // strzałka „wyjazd”: czerwona – nasz pociąg na szlaku (Po zablokowany), biała – pozwolenie na wyjazd, migająca – żądanie wysłane
  // zajęty odcinek pod kostką strzałki (tabor na kostce) – strzałka czerwona jak pasek toru
  const occ = (sid) => !!(sid && view.ilk.sections.get(sid)?.occupied);
  const outPerm = b.direction === 'out' && (b.permission || b.phone?.permissionFor || b.fixed === 'out') && !b.occupied;
  setLamp(r.outArrow, b.poBlocked || occ(r.outSection) ? 'red' : outPerm ? 'white' : b.request === 'ours' ? 'white blink' : 'off');
  // strzałka „wjazd”: czerwona – pociąg sąsiada na szlaku, biała – pozwolenie dane sąsiadowi
  setLamp(r.inArrow, (b.direction === 'in' && b.occupied) || occ(r.inSection) ? 'red' : b.direction === 'in' && !b.koPending ? 'white' : 'off');
  setLamp(r.req, b.request === 'theirs' ? 'white blink' : 'off');
  setLamp(r.wbl, b.request === 'ours' ? 'white blink' : 'off');
  setLamp(r.ko, b.koPending ? 'white blink' : 'off');
  if (r.cntPo) r.cntPo.textContent = PanelView.counterText(b.counters.dPo);
  if (r.cntKo) r.cntKo.textContent = PanelView.counterText(b.counters.dKo);
}

/** Lampki odcinka na kostkach toru i to, co od niego zależy: strzałki blokady, zwrotnice, wykolejnice. */
export function updateSectionLamps(view, id) {
  const sec = view.ilk.sections.get(id);
  if (!sec) return;
  const st = sectionLamp(sec);
  for (const { el: e, tile } of view.sectionRefs.get(id) || []) {
    setLamp(e, st);
    for (const sc of view.tileRefs.get(tile._key)?.screws || []) sc.classList.toggle('lit', st !== 'off');
  }
  for (const [ex, r] of view.blockRefs) if (r.outSection === id || r.inSection === id) view.updateBlock(ex);
  for (const p of view.ilk.points.values()) if (p.section === id) view.updatePoint(p.id);
  for (const d of view.ilk.derailers.values()) if (d.section === id) view.updateDerailer(d.id);
}

export function deskTrainLabel(tr) {
  const nr = text(0, 0, String(tr.nr), { class: 'train-nr' });
  return { label: el('g', { class: 'train-label' }, [el('rect', { x: -16, y: -7, width: 32, height: 13, rx: 2 }), nr]), text: nr };
}

/** Etykieta wewnątrz kostki czoła pociągu (nad albo pod kanałem toru) – nie wchodzi na sąsiedni rząd,
 *  gdzie zasłaniałaby przyciski semaforów. */
export function placeDeskTrainLabel(view, label, headTile) {
  const above = headTile.y >= 6 || headTile.y === 4;
  const ty = headTile.y * CELL + (above ? 8 : CELL - 6);
  label.setAttribute('transform', `translate(${(headTile.x - view.x0) * CELL + CELL / 2},${ty})`);
}
