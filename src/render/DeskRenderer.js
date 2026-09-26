import { el, text, CELL } from './svg.js';

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
  constructor(container, sim, handlers) {
    this.sim = sim;
    this.station = sim.station;
    this.ilk = sim.ilk;
    this.topo = sim.ilk.topo;
    this.handlers = handlers;
    this.tileRefs = new Map();     // tileKey -> refs
    this.sectionSlits = new Map(); // sectionId -> [{el, tile}]
    this.pointRefs = new Map();
    this.derailerRefs = new Map();
    this.signalRefs = new Map();
    this.buttonEls = new Map();    // refKey -> element
    this.blockRefs = new Map();
    this.counterRefs = new Map();
    this.trainLabels = new Map();

    const { cols, rows } = this.station.desk;
    this.FRAME = FRAME;
    this.svg = el('svg', {
      class: 'desk', viewBox: `0 0 ${cols * CELL + 2 * FRAME} ${rows * CELL + 2 * FRAME}`,
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
    this.inner = el('g', { transform: `translate(${FRAME},${FRAME})` });
    this.layerTiles = el('g', { class: 'layer-tiles' });
    this.layerGrid = el('g', { class: 'layer-grid' });
    this.layerTrains = el('g', { class: 'layer-trains' });
    this.inner.append(this.layerTiles, this.layerGrid, this.layerTrains);
    this.svg.appendChild(this.inner);
    container.appendChild(this.svg);

    this.#buildFrame();
    this.#buildTiles();
    this.#buildGrid();
    this.#bindEvents();
    this.refreshAll();
  }

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
    for (const tile of this.station.tiles) {
      let out;
      switch (tile.type) {
        case 'track': out = art.trackArt(tile, ctx); break;
        case 'buffer': out = art.bufferArt(tile, ctx); break;
        case 'point': out = art.pointArt(tile, ctx); break;
        case 'crossing': out = art.crossingArt(tile, ctx); break;
        case 'signal': out = art.signalArt(tile); break;
        case 'button': out = art.buttonTileArt(tile); break;
        case 'label': out = art.labelArt(tile); break;
        case 'block': out = art.blockArt(tile, this.station.exits[tile.exit]); break;
        default: out = art.blankArt();
      }
      out.g.setAttribute('transform', `translate(${tile.x * CELL},${tile.y * CELL})`);
      out.g.dataset.tile = tile._key;
      this.layerTiles.appendChild(out.g);
      this.tileRefs.set(tile._key, out.refs);
      const def = getTileDef(tile.type);
      const span = tile.type === 'label' ? { w: tile.span || 1, h: 1 } : def.span;
      for (let dx = 0; dx < span.w; dx++) for (let dy = 0; dy < span.h; dy++) filled.add(`${tile.x + dx},${tile.y + dy}`);

      if (def.category === 'track' && tile.type !== 'point') {
        if (!this.sectionSlits.has(tile.section)) this.sectionSlits.set(tile.section, []);
        for (const s of out.refs.slits) this.sectionSlits.get(tile.section).push({ el: s, tile });
      }
      if (tile.type === 'point') this.pointRefs.set(tile.id, out.refs);
      if (tile.derailer) this.derailerRefs.set(tile.derailer, out.refs);
      if (tile.type === 'signal') this.signalRefs.set(tile.id, out.refs);
      if (tile.type === 'button' && out.refs.counter) this.counterRefs.set(tile.id, out.refs.counter);
      if (tile.type === 'block') this.blockRefs.set(tile.exit, out.refs);
    }
    // Puste kostki
    const { cols, rows } = this.station.desk;
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      if (filled.has(`${x},${y}`)) continue;
      const b = art.blankArt();
      b.g.setAttribute('transform', `translate(${x * CELL},${y * CELL})`);
      this.layerTiles.insertBefore(b.g, this.layerTiles.firstChild);
    }
    for (const b of this.svg.querySelectorAll('.btn')) {
      const ref = JSON.parse(b.dataset.ref);
      this.buttonEls.set(refKey(ref), b);
    }
  }

  /** Rama pulpitu: numeracja kolumn (od lewej) i rzędów (od dołu), śruby. */
  #buildFrame() {
    const { cols, rows } = this.station.desk;
    const W = cols * CELL + 2 * FRAME, H = rows * CELL + 2 * FRAME;
    const g = el('g', { class: 'frame' });
    const pad = (n) => String(n).padStart(2, '0');
    for (let x = 0; x < cols; x++) {
      const cx = FRAME + x * CELL + CELL / 2;
      g.appendChild(text(cx, FRAME / 2 + 3, pad(x + 1), { class: 'frame-text' }));
      g.appendChild(text(cx, H - FRAME / 2 + 3, pad(x + 1), { class: 'frame-text' }));
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
    const { cols, rows } = this.station.desk;
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
    for (const [id, t] of this.counterRefs) t.textContent = String(this.ilk.counters[id] ?? 0).padStart(3, '0');
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
    // strzałka „wyjazd”: biała – pozwolenie na wyjazd, czerwona – nasz pociąg na szlaku (Po zablokowany)
    setLamp(r.outW, b.direction === 'out' && (b.permission || b.phone?.permissionFor || b.fixed === 'out') && !b.occupied ? 'white' : (b.request === 'ours' ? 'white blink' : 'off'));
    setLamp(r.outR, b.poBlocked ? 'red' : 'off');
    // strzałka „wjazd”: biała – pozwolenie dane sąsiadowi, czerwona – pociąg sąsiada na szlaku
    setLamp(r.inW, b.direction === 'in' && !b.occupied && !b.koPending ? 'white' : 'off');
    setLamp(r.inR, b.direction === 'in' && b.occupied ? 'red' : 'off');
    setLamp(r.req, b.request === 'theirs' ? 'white blink' : 'off');
    setLamp(r.ko, b.koPending ? 'white blink' : 'off');
    r.cntPo.textContent = String(b.counters.dPo).padStart(3, '0');
    r.cntKo.textContent = String(b.counters.dKo).padStart(3, '0');
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
      const above = headTile.y >= 6 || headTile.y === 4;
      const ty = headTile.y * CELL + (above ? -6 : CELL + 8);
      lbl.setAttribute('transform', `translate(${headTile.x * CELL + CELL / 2},${ty})`);
      lbl.querySelector('.train-nr').textContent = `${tr.nr}${tr.v > 0.3 ? '' : ' ■'}`;
    }
    for (const [nr, lbl] of this.trainLabels) if (!seen.has(nr)) { lbl.remove(); this.trainLabels.delete(nr); }
    for (const [id, t] of this.counterRefs) t.textContent = String(this.ilk.counters[id] ?? 0).padStart(3, '0');
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

export function refKey(ref) {
  if (ref.kind === 'signal') return `signal:${ref.id}:${ref.color}`;
  if (ref.kind === 'block') return `block:${ref.exit}:${ref.btn}`;
  return `${ref.kind}:${ref.id}`;
}
