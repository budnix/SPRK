import { platformSpans, trackLabelText, trackLabelPlace, platformEdgeLines } from './platforms.js';
import { blockLayouts } from './blockLayout.js';
import { el, text, CELL } from './svg.js';
import { refKey } from './refKey.js';

const FRAME = 22;
import * as art from './tileArt.js';
import { getTileDef } from '../tiles/registry.js';
import { VEC, OPPOSITE } from '../tiles/directions.js';

/**
 * Renderer pulpitu kostkowego (SVG). Buduje grafikę raz, potem aktualizuje
 * tylko lampki i przyciski na podstawie zdarzeń z symulacji.
 */
export class DeskRenderer {
  /**
   * @param container element DOM
   * @param sim Simulation
   * @param handlers { onPress(ref), onPull(ref) }
   */
  constructor(container, sim, handlers, opts = {}) {
    this.sim = sim;
    this.station = sim.station;
    this.ilk = sim.ilk;
    this.topo = sim.ilk.topo;
    this.handlers = handlers;
    // Okno kolumn (okręg nastawczy) i tryb tylko do podglądu (okręg obsługiwany przez drugą nastawnię)
    this.x0 = opts.window?.[0] ?? 0;
    this.x1 = opts.window?.[1] ?? this.station.desk.cols - 1;
    this.readonly = !!opts.readonly;
    this.title = opts.title || null;
    this.tileRefs = new Map();     // tileKey -> refs
    this.sectionSlits = new Map(); // sectionId -> [{el, tile}]
    this.pointRefs = new Map();
    this.derailerRefs = new Map();
    this.signalRefs = new Map();
    this.buttonEls = new Map();    // refKey -> element
    this.blockRefs = new Map();
    this.counterRefs = new Map();
    this.trainLabels = new Map();

    const cols = this.x1 - this.x0 + 1, rows = this.station.desk.rows;
    this.cols = cols; this.rows = rows;
    this.FRAME = FRAME;
    this.svg = el('svg', {
      class: `desk${this.readonly ? ' readonly' : ''}`, viewBox: `0 0 ${cols * CELL + 2 * FRAME} ${rows * CELL + 2 * FRAME}`,
      preserveAspectRatio: 'xMidYMid meet',
    });
    this.svg.appendChild(el('defs', {}, [
      el('filter', { id: 'glow', x: '-50%', y: '-50%', width: '200%', height: '200%' }, [
        el('feGaussianBlur', { stdDeviation: 1.2, result: 'b' }),
        el('feMerge', {}, [el('feMergeNode', { in: 'b' }), el('feMergeNode', { in: 'SourceGraphic' })]),
      ]),
    ]));
    this.svg.appendChild(el('rect', { class: 'desk-bg', x: 0, y: 0, width: cols * CELL + 2 * FRAME, height: rows * CELL + 2 * FRAME, rx: 4 }));
    this.svg.appendChild(el('rect', { class: 'desk-face-bg', x: FRAME, y: FRAME, width: cols * CELL, height: rows * CELL }));
    if (this.readonly) {
      const banner = el('g', { class: 'readonly-banner' }, [
        el('rect', { x: FRAME + 4, y: 2, width: 260, height: 16, rx: 3 }),
        text(FRAME + 134, 11, `${this.title || 'okręg'} – obsługuje druga nastawnia (podgląd)`, { class: 'readonly-text' }),
      ]);
      this.svg.appendChild(banner);
    }
    this.inner = el('g', { transform: `translate(${FRAME},${FRAME})` });
    this.layerTiles = el('g', { class: 'layer-tiles' });
    this.layerGrid = el('g', { class: 'layer-grid' });
    this.layerTrains = el('g', { class: 'layer-trains' });
    this.inner.append(this.layerTiles, this.layerGrid, this.layerTrains);
    this.svg.appendChild(this.inner);
    container.appendChild(this.svg);

    this.#buildFrame();
    this.#buildTiles();
    this.#buildPlatforms();
    this.#buildGrid();
    this.#bindEvents();
    this.refreshAll();
  }

  /** Widoczny wycinek kolumn (ekran) – zmiana viewBox, bez przebudowy grafiki. */
  setView(x0, x1) {
    const H = this.rows * CELL + 2 * FRAME;
    this.svg.setAttribute('viewBox', `${(x0 - this.x0) * CELL} 0 ${(x1 - x0 + 1) * CELL + 2 * FRAME} ${H}`);
  }
  resetView() { this.setView(this.x0, this.x1); }

  #ctx() {
    return {
      isJoint: (tile, port) => {
        const [dx, dy] = VEC[port];
        const n = this.topo.trackAt(tile.x + dx, tile.y + dy);
        if (!n) return true;
        if (!n._def.ports(n).includes(OPPOSITE[port])) return true;
        return n.section !== tile.section;
      },
    };
  }

  #buildTiles() {
    const ctx = this.#ctx();
    const filled = new Set();
    const deferred = [];
    // blokada liniowa jako kostki przy końcu toru szlakowego: strzałki na kostkach toru, przyciski i liczniki obok
    const plan = blockLayouts(this.station);
    const arrowAt = new Map();
    for (const L of plan.values()) for (const a of L.arrows) arrowAt.set(`${a.x},${a.y}`, { exit: L.exit, kind: a.kind, toWest: L.dir === 'W' });
    const blockRef = (exit) => { if (!this.blockRefs.has(exit)) this.blockRefs.set(exit, { btns: {} }); return this.blockRefs.get(exit); };
    for (const tile of this.station.tiles) {
      if (tile.x < this.x0 || tile.x > this.x1) continue;
      let out;
      // opis „tor N” rysuje się nad opisywanym torem, na kostce toru; jego własna kostka zostaje pusta
      const pos = tile.type === 'label' && trackLabelText(tile.text) ? trackLabelPlace(this.station, tile) : { x: tile.x, y: tile.y, side: null };
      switch (tile.type) {
        case 'track': {
          const key = `${tile.x},${tile.y}`;
          const arrow = arrowAt.get(key);
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
        case 'button': out = art.buttonTileArt(tile); break;
        case 'label': out = art.labelArt(tile, pos.side ?? null); break;
        default: out = art.blankArt();
      }
      out.g.setAttribute('transform', `translate(${(pos.x - this.x0) * CELL},${pos.y * CELL})`);
      out.g.dataset.tile = tile._key;
      if (pos.side === 'top') deferred.push(out.g); // sam napis, ponad płytką kostki toru
      else this.layerTiles.appendChild(out.g);
      this.tileRefs.set(tile._key, out.refs);
      const def = getTileDef(tile.type);
      const span = tile.type === 'label' ? { w: trackLabelText(tile.text) ? 1 : tile.span || 1, h: 1 } : def.span;
      if (pos.side !== 'top') for (let dx = 0; dx < span.w; dx++) for (let dy = 0; dy < span.h; dy++) filled.add(`${tile.x + dx},${tile.y + dy}`);

      if (def.category === 'track' && tile.type !== 'point') {
        if (!this.sectionSlits.has(tile.section)) this.sectionSlits.set(tile.section, []);
        for (const s of out.refs.slits) this.sectionSlits.get(tile.section).push({ el: s, tile });
      }
      if (tile.type === 'point') this.pointRefs.set(tile.id, out.refs);
      if (tile.derailer) this.derailerRefs.set(tile.derailer, out.refs);
      if (tile.type === 'signal') this.signalRefs.set(tile.id, out.refs);
      if (tile.type === 'button' && out.refs.counter) this.counterRefs.set(tile.id, out.refs.counter);
    }
    for (const g of deferred) this.layerTiles.appendChild(g);
    // Kostki urządzeń blokady (Wbl / Poz / Ko / Zk, liczniki dKo / dPo) – grupa na wyjazd, do wskazywania w samouczku
    for (const L of plan.values()) {
      const cluster = el('g', { class: 'block-cluster', 'data-exit': L.exit });
      const r = blockRef(L.exit);
      for (const d of L.devices) {
        if (d.x < this.x0 || d.x > this.x1) continue;
        const dev = art.blockDeviceArt(d.role, L.exit);
        dev.g.setAttribute('transform', `translate(${(d.x - this.x0) * CELL},${d.y * CELL})`);
        cluster.appendChild(dev.g);
        filled.add(`${d.x},${d.y}`);
        Object.assign(r.btns, dev.refs.btns);
        if (d.role === 'Poz') r.req = dev.refs.lamp;
        if (d.role === 'Ko') r.ko = dev.refs.lamp;
        if (d.role === 'Wbl') r.wbl = dev.refs.lamp;
        if (d.role === 'dPo') r.cntPo = dev.refs.counter;
        if (d.role === 'dKo') r.cntKo = dev.refs.counter;
      }
      if (cluster.childNodes.length) this.layerTiles.appendChild(cluster);
    }
    // Puste kostki
    for (let y = 0; y < this.rows; y++) for (let x = this.x0; x <= this.x1; x++) {
      if (filled.has(`${x},${y}`)) continue;
      const b = art.blankArt();
      b.g.setAttribute('transform', `translate(${(x - this.x0) * CELL},${y * CELL})`);
      this.layerTiles.insertBefore(b.g, this.layerTiles.firstChild);
    }
    for (const b of this.svg.querySelectorAll('.btn')) {
      const ref = JSON.parse(b.dataset.ref);
      this.buttonEls.set(refKey(ref), b);
    }
  }

  /** Przycisk pulpitu odpowiadający ref (do podświetlania w samouczku). */
  elementFor(ref) {
    if (ref.kind === 'blockpanel') return this.layerTiles.querySelector(`.block-cluster[data-exit="${ref.exit}"]`) || null;
    return this.buttonEls.get(refKey(ref)) || (ref.kind === 'signal' && !ref.color ? this.buttonEls.get(refKey({ ...ref, color: 'green' })) || this.buttonEls.get(refKey({ ...ref, color: 'white' })) : null) || null;
  }

  /** Perony: przerywany obrys z nazwą (Peron I, II…) w rzędzie między torami peronowymi lub obok toru. */
  #buildPlatforms() {
    for (const p of platformSpans(this.station, [this.x0, this.x1])) {
      const h = CELL * p.hCells;
      const y = p.yRow * CELL + CELL / 2;
      const rx = (p.x0 - this.x0) * CELL + 4, ry = y - h / 2, rw = (p.x1 - p.x0 + 1) * CELL - 8;
      const g = el('g', { class: 'desk-platform' }, [
        el('rect', { x: rx, y: ry, width: rw, height: h }),
        // krawędź peronowa od strony toru: podwójna kreska (jak na pulpitach nastawczych)
        ...platformEdgeLines(rx, ry, rw, h, p.edges).map(([x1, y1, x2, y2]) => el('line', { class: 'platform-edge', x1, y1, x2, y2 })),
        text((p.labelX + 0.5 - this.x0) * CELL, y, p.name, { class: 'tile-text platform-label', 'dominant-baseline': 'central' }),
      ]);
      this.layerTiles.appendChild(g);
    }
  }

  /** Rama pulpitu: numeracja kolumn (od lewej) i rzędów (od dołu), śruby. */
  #buildFrame() {
    const cols = this.cols, rows = this.rows;
    const W = cols * CELL + 2 * FRAME, H = rows * CELL + 2 * FRAME;
    const g = el('g', { class: 'frame' });
    const pad = (n) => String(n).padStart(2, '0');
    for (let x = 0; x < cols; x++) {
      const cx = FRAME + x * CELL + CELL / 2;
      g.appendChild(text(cx, FRAME / 2 + 3, pad(this.x0 + x + 1), { class: 'frame-text' }));
      g.appendChild(text(cx, H - FRAME / 2 + 3, pad(this.x0 + x + 1), { class: 'frame-text' }));
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
    this.svg.appendChild(g);
  }

  #buildGrid() {
    const cols = this.cols, rows = this.rows;
    const d = [];
    for (let x = 0; x <= cols; x++) d.push(`M${x * CELL},0 V${rows * CELL}`);
    for (let y = 0; y <= rows; y++) d.push(`M0,${y * CELL} H${cols * CELL}`);
    this.layerGrid.appendChild(el('path', { class: 'grid', d: d.join(' ') }));
  }

  #bindEvents() {
    const LONG = 550;
    let timer = null; let active = null; let longFired = false;
    const cancel = () => { if (timer) clearTimeout(timer); timer = null; };
    this.svg.addEventListener('pointerdown', (ev) => {
      if (this.readonly) return;
      const b = ev.target.closest('.btn');
      if (!b) return;
      ev.preventDefault();
      const ref = JSON.parse(b.dataset.ref);
      active = b; longFired = false;
      b.classList.add('pressed');
      if (ev.button === 2) { longFired = true; this.handlers.onPull(ref); return; }
      timer = setTimeout(() => { longFired = true; b.classList.add('pulled'); this.handlers.onPull(ref); }, LONG);
    });
    const finish = (ev) => {
      if (!active) return;
      cancel();
      const b = active; active = null;
      b.classList.remove('pressed');
      setTimeout(() => b.classList.remove('pulled'), 300);
      if (longFired) return;
      if (ev.type === 'pointerup' && b.contains(ev.target)) this.handlers.onPress(JSON.parse(b.dataset.ref));
    };
    this.svg.addEventListener('pointerup', finish);
    this.svg.addEventListener('pointercancel', finish);
    this.svg.addEventListener('pointerleave', finish);
    this.svg.addEventListener('contextmenu', (ev) => { if (ev.target.closest('.btn')) ev.preventDefault(); });
    this.svg.addEventListener('keydown', (ev) => {
      const b = ev.target.closest('.btn'); if (!b) return;
      if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); this.handlers.onPress(JSON.parse(b.dataset.ref)); }
      if (ev.key === 'Backspace' || ev.key === 'Delete') { ev.preventDefault(); this.handlers.onPull(JSON.parse(b.dataset.ref)); }
    });

    const bus = this.sim.bus;
    bus.on('section', (s) => this.updateSection(s.id));
    bus.on('point', (p) => this.updatePoint(p.id));
    bus.on('derailer', (d) => this.updateDerailer(d.id));
    bus.on('signal', (s) => this.updateSignal(s.id));
    bus.on('route', () => this.refreshAll());
    bus.on('block', (b) => this.updateBlock(b.id));
    bus.on('armed', (a) => this.updateArmed(a));
    bus.on('tick', () => this.updateTrains());
  }

  refreshAll() {
    for (const id of this.sectionSlits.keys()) this.updateSection(id);
    for (const id of this.pointRefs.keys()) this.updatePoint(id);
    for (const id of this.derailerRefs.keys()) this.updateDerailer(id);
    for (const id of this.signalRefs.keys()) this.updateSignal(id);
    for (const id of this.blockRefs.keys()) this.updateBlock(id);
    for (const [id, t] of this.counterRefs) t.textContent = String(this.ilk.counters[id] ?? 0).padStart(5, '0');
    this.updateArmed(this.ilk.armed);
  }

  #sectionState(sec) {
    if (sec.occupied) return 'red';
    if (sec.route) return 'white';
    if (sec.closed) return 'yellow blink';
    return 'off';
  }

  updateSection(id) {
    const sec = this.ilk.sections.get(id);
    if (!sec) return;
    const st = this.#sectionState(sec);
    for (const { el: e, tile } of this.sectionSlits.get(id) || []) {
      setLamp(e, st);
      for (const sc of this.tileRefs.get(tile._key)?.screws || []) sc.classList.toggle('lit', st !== 'off');
    }
    // strzałki blokady na kostkach tego odcinka (świecą na czerwono przy zajętości)
    for (const [ex, r] of this.blockRefs) if (r.outSection === id || r.inSection === id) this.updateBlock(ex);
    // zwrotnice w tym odcinku
    for (const p of this.ilk.points.values()) if (p.section === id) this.updatePoint(p.id);
    for (const d of this.ilk.derailers.values()) if (d.section === id) this.updateDerailer(d.id);
  }

  updatePoint(id) {
    const p = this.ilk.points.get(id);
    const r = this.pointRefs.get(id);
    if (!p || !r) return;
    const sec = this.ilk.sections.get(p.section);
    const base = this.#sectionState(sec);
    const state = base === 'off' ? 'yellow' : base;
    const lit = base !== 'off';
    if (p.moving || !p.control) {
      setLamp(r.toe, p.trailed ? 'red blink' : 'off');
      setLamp(r.straight, 'off'); setLamp(r.diverge, 'off');
    } else {
      // ostrze świeci tylko w przebiegu/zajętości; leg w położeniu – żółty (lub biały/czerwony)
      setLamp(r.toe, lit ? state : 'off');
      setLamp(r.straight, p.position === '+' ? state : 'off');
      setLamp(r.diverge, p.position === '-' ? state : 'off');
    }
    setLamp(r.lockLamp, p.individualLock ? 'white' : 'off');
  }

  updateDerailer(id) {
    const d = this.ilk.derailers.get(id);
    const r = this.derailerRefs.get(id);
    if (!d || !r) return;
    setLamp(r.derailerLamp, d.moving ? 'off' : (d.position === 'on' ? 'yellow' : 'white'));
    r.derailerBtn?.classList.toggle('locked', d.individualLock);
  }

  updateSignal(id) {
    const s = this.ilk.signals.get(id);
    const r = this.signalRefs.get(id);
    if (!s || !r) return;
    const a = s.aspect;
    if (s.kind === 'tm') {
      setLamp(r.lamps.blue, a === 'Ms2' ? 'off' : 'blue');
      setLamp(r.lamps.white, a === 'Ms2' ? 'white' : 'off');
      r.btnWhite?.classList.toggle('active', a === 'Ms2');
      return;
    }
    // Powtarzacz: lampki pomarańczowa / zielona / czerwona / biała (obrazy dwuświatłowe – uproszczenie)
    const map = {
      S1: { red: 'red' }, S2: { green: 'green' }, S3: { green: 'green blink' }, S4: { orange: 'orange blink' }, S5: { orange: 'orange' },
      S10: { orange: 'orange', green: 'green' }, S11: { orange: 'orange', green: 'green blink' }, S12: { orange: 'orange blink', green: 'green' },
      S13: { orange: 'orange' }, Sz: { red: 'red', white: 'white blink' }, Ms2: { white: 'white' },
    };
    const m = map[a] || {};
    for (const [c, e] of Object.entries(r.lamps)) setLamp(e, m[c] || 'off');
    r.btnGreen?.classList.toggle('active', s.route != null && a !== 'S1' && a !== 'Ms2');
    r.btnWhite?.classList.toggle('active', a === 'Ms2');
  }

  updateBlock(exitId) {
    const b = this.sim.blocks.get(exitId);
    const r = this.blockRefs.get(exitId);
    if (!b || !r) return;
    // strzałka „wyjazd”: czerwona – nasz pociąg na szlaku (Po zablokowany), biała – pozwolenie na wyjazd, migająca – żądanie wysłane
    // zajęty odcinek pod kostką strzałki (tabor na kostce) – strzałka czerwona jak pasek toru
    const occ = (sid) => !!(sid && this.ilk.sections.get(sid)?.occupied);
    const outPerm = b.direction === 'out' && (b.permission || b.phone?.permissionFor || b.fixed === 'out') && !b.occupied;
    setLamp(r.outArrow, b.poBlocked || occ(r.outSection) ? 'red' : outPerm ? 'white' : b.request === 'ours' ? 'white blink' : 'off');
    // strzałka „wjazd”: czerwona – pociąg sąsiada na szlaku, biała – pozwolenie dane sąsiadowi
    setLamp(r.inArrow, (b.direction === 'in' && b.occupied) || occ(r.inSection) ? 'red' : b.direction === 'in' && !b.koPending ? 'white' : 'off');
    setLamp(r.req, b.request === 'theirs' ? 'white blink' : 'off');
    setLamp(r.wbl, b.request === 'ours' ? 'white blink' : 'off');
    setLamp(r.ko, b.koPending ? 'white blink' : 'off');
    if (r.cntPo) r.cntPo.textContent = String(b.counters.dPo).padStart(5, '0');
    if (r.cntKo) r.cntKo.textContent = String(b.counters.dKo).padStart(5, '0');
  }

  updateArmed(a) {
    for (const e of this.buttonEls.values()) e.classList.remove('armed');
    if (!a) return;
    const e = this.buttonEls.get(refKey(a));
    e?.classList.add('armed');
  }

  updateTrains() {
    const seen = new Set();
    for (const tr of this.sim.traffic.trains) {
      const tiles = tr.occupiedTiles();
      if (!tiles.length) continue;
      const headTile = tiles[tiles.length - 1];
      seen.add(tr.nr);
      let lbl = this.trainLabels.get(tr.nr);
      if (!lbl) {
        lbl = el('g', { class: 'train-label' }, [
          el('rect', { x: -16, y: -7, width: 32, height: 13, rx: 2 }),
          text(0, 0, String(tr.nr), { class: 'train-nr' }),
        ]);
        this.layerTrains.appendChild(lbl);
        this.trainLabels.set(tr.nr, lbl);
      }
      // etykieta wewnątrz kostki czoła pociągu (nad albo pod kanałem toru) – nie wchodzi na sąsiedni rząd,
      // gdzie zasłaniałaby przyciski semaforów
      const above = headTile.y >= 6 || headTile.y === 4;
      const ty = headTile.y * CELL + (above ? 8 : CELL - 6);
      const visible = headTile.x >= this.x0 && headTile.x <= this.x1;
      lbl.style.display = visible ? '' : 'none';
      lbl.setAttribute('transform', `translate(${(headTile.x - this.x0) * CELL + CELL / 2},${ty})`);
      lbl.querySelector('.train-nr').textContent = `${tr.nr}${tr.v > 0.3 ? '' : ' ■'}`;
    }
    for (const [nr, lbl] of this.trainLabels) if (!seen.has(nr)) { lbl.remove(); this.trainLabels.delete(nr); }
    for (const [id, t] of this.counterRefs) t.textContent = String(this.ilk.counters[id] ?? 0).padStart(5, '0');
  }
}

function setLamp(e, state) {
  if (!e) return;
  e.classList.remove('on', 'lamp-red', 'lamp-white', 'lamp-yellow', 'lamp-green', 'lamp-orange', 'lamp-blue', 'blink');
  if (state === 'off') return;
  const [color, blink] = state.split(' ');
  e.classList.add('on', `lamp-${color}`);
  if (blink) e.classList.add('blink');
}

export { refKey };
