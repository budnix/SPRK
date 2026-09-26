import { el, text, CELL } from './svg.js';
import { PORT_XY } from '../tiles/directions.js';
import { refKey } from './DeskRenderer.js';

const C = CELL / 2;
const PAD = 12;

/**
 * Stanowisko komputerowe (monitor dyżurnego): schemat stacji na ciemnym tle w stylu
 * komputerowych urządzeń srk (ISKRA-SRK / EbiScreen). Ta sama siatka co pulpit kostkowy,
 * ale zamiast kostek – linie toru i symbole, a zamiast przycisków – menu poleceń elementu.
 *
 * Kolory toru: szary – wolny, zielony – utwierdzony w przebiegu pociągowym, żółty – w przebiegu
 * manewrowym, czerwony – zajęty, niebieski przerywany – zamknięty.
 * Polecenia: kliknięcie elementu otwiera menu; przebieg = „Przebieg … od X” i wskazanie końca;
 * polecenia specjalne (dPz, Sz, Zz, dPo, dKo) wymagają potwierdzenia „Wykonaj”.
 */
export class ScreenRenderer {
  constructor(container, sim, handlers, opts = {}) {
    this.sim = sim;
    this.station = sim.station;
    this.ilk = sim.ilk;
    this.topo = sim.ilk.topo;
    this.handlers = handlers;
    this.x0 = opts.window?.[0] ?? 0;
    this.x1 = opts.window?.[1] ?? this.station.desk.cols - 1;
    this.readonly = !!opts.readonly;
    this.title = opts.title || null;
    this.cols = this.x1 - this.x0 + 1; this.rows = this.station.desk.rows;
    this.sectionEls = new Map();  // sectionId -> [path]
    this.pointRefs = new Map();
    this.derailerRefs = new Map();
    this.signalRefs = new Map();
    this.blockRefs = new Map();
    this.counterRefs = new Map();
    this.hitEls = new Map();      // refKey -> group element (podświetlenie uzbrojenia)
    this.trainLabels = new Map();
    this.pending = null;          // trwające polecenie przebiegu: { id, color }

    const W = this.cols * CELL + 2 * PAD, H = this.rows * CELL + 2 * PAD;
    this.svg = el('svg', { class: `screen${this.readonly ? ' readonly' : ''}`, viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'xMidYMid meet' });
    this.svg.appendChild(el('defs', {}, [
      el('filter', { id: 'glow', x: '-50%', y: '-50%', width: '200%', height: '200%' }, [
        el('feGaussianBlur', { stdDeviation: 1.2, result: 'b' }),
        el('feMerge', {}, [el('feMergeNode', { in: 'b' }), el('feMergeNode', { in: 'SourceGraphic' })]),
      ]),
    ]));
    this.svg.appendChild(el('rect', { class: 'scr-bg', x: 0, y: 0, width: W, height: H }));
    if (this.readonly) this.svg.appendChild(text(W / 2, 8, `${this.title || 'okręg'} – obsługuje druga nastawnia (podgląd)`, { class: 'scr-banner' }));
    this.inner = el('g', { transform: `translate(${PAD},${PAD})` });
    this.layerTracks = el('g', { class: 'layer-tracks' });
    this.layerMarks = el('g', { class: 'layer-marks' });
    this.layerSignals = el('g', { class: 'layer-signals' });
    this.layerTrains = el('g', { class: 'layer-trains' });
    this.inner.append(this.layerTracks, this.layerMarks, this.layerSignals, this.layerTrains);
    this.svg.appendChild(this.inner);
    container.appendChild(this.svg);

    this.menu = document.createElement('div');
    this.menu.className = 'scr-menu hidden';
    document.body.appendChild(this.menu);
    this.confirmBar = document.createElement('div');
    this.confirmBar.className = 'scr-confirm hidden';
    document.body.appendChild(this.confirmBar);

    this.#build();
    this.#bind();
    this.refreshAll();
  }

  /* ---------------- geometria ---------------- */
  #pt(tile, port) { const [px, py] = PORT_XY[port]; return [(tile.x - this.x0) * CELL + px, tile.y * CELL + py]; }
  #ctr(tile) { return [(tile.x - this.x0) * CELL + C, tile.y * CELL + C]; }
  #leg(tile, port, t0 = 0, t1 = 1) {
    const [cx, cy] = this.#ctr(tile); const [px, py] = this.#pt(tile, port);
    return `M${cx + (px - cx) * t0},${cy + (py - cy) * t0} L${cx + (px - cx) * t1},${cy + (py - cy) * t1}`;
  }
  #hit(ref, cx, cy, r = 9) {
    const h = el('circle', { class: 'hit', cx, cy, r });
    h.dataset.ref = JSON.stringify(ref);
    return h;
  }
  #exitAt(tile) {
    return Object.entries(this.station.exits || {}).find(([, e]) => e.tile.x === tile.x && e.tile.y === tile.y);
  }

  /* ---------------- budowa obrazu ---------------- */
  #build() {
    const addSec = (sid, e) => { if (!this.sectionEls.has(sid)) this.sectionEls.set(sid, []); this.sectionEls.get(sid).push(e); };
    for (const tile of this.station.tiles) {
      if (tile.x < this.x0 || tile.x > this.x1) continue;
      const [cx, cy] = this.#ctr(tile);
      switch (tile.type) {
        case 'track': {
          const [a, b] = tile.ports;
          const p = el('path', { class: 'trk free', d: `${this.#leg(tile, a)} ${this.#leg(tile, b)}` });
          this.layerTracks.appendChild(p); addSec(tile.section, p);
          if (tile.derailer) {
            const g = el('g', { class: 'scr-el derailer' }, [
              el('path', { class: 'wk-mark', d: `M${cx - 5},${cy + 6} L${cx},${cy - 4} L${cx + 5},${cy + 6} Z` }),
              text(cx, cy + 14, tile.derailer, { class: 'scr-text small' }),
              this.#hit({ kind: 'derailer', id: tile.derailer }, cx, cy),
            ]);
            this.layerMarks.appendChild(g);
            this.derailerRefs.set(tile.derailer, { mark: g.querySelector('.wk-mark'), g });
            this.hitEls.set(refKey({ kind: 'derailer', id: tile.derailer }), g);
          }
          if (tile.endButton) this.#exitMark(tile);
          break;
        }
        case 'buffer': {
          const p = el('path', { class: 'trk free', d: this.#leg(tile, tile.port, 0, 1) });
          const [px, py] = this.#pt(tile, tile.port);
          const nx = -(py - cy), ny = px - cx; // prostopadła
          const bar = el('path', { class: 'buffer-bar', d: `M${cx + nx * 0.35},${cy + ny * 0.35} L${cx - nx * 0.35},${cy - ny * 0.35}` });
          this.layerTracks.append(p, bar); addSec(tile.section, p);
          if (tile.endButton) this.#exitMark(tile);
          break;
        }
        case 'point': {
          const toe = el('path', { class: 'trk free', d: this.#leg(tile, tile.toe) });
          const straight = el('path', { class: 'trk free', d: this.#leg(tile, tile.straight) });
          const diverge = el('path', { class: 'trk free', d: this.#leg(tile, tile.diverge) });
          this.layerTracks.append(diverge, straight, toe);
          const [dx, dy] = PORT_XY[tile.diverge];
          const below = dy > C; // rozjazd odgałęzia się w dół → numer nad torem
          const lbl = text(cx, cy + (below ? -9 : 12), tile.label || tile.id, { class: 'scr-text pt-label' });
          const lock = el('rect', { class: 'pt-lock', x: cx + 8, y: cy + (below ? -15 : 6), width: 7, height: 7, rx: 1 });
          const g = el('g', { class: 'scr-el point' }, [lbl, lock, this.#hit({ kind: 'point', id: tile.id }, cx, cy, 10)]);
          this.layerMarks.appendChild(g);
          this.pointRefs.set(tile.id, { toe, straight, diverge, lbl, lock, g });
          this.hitEls.set(refKey({ kind: 'point', id: tile.id }), g);
          break;
        }
        case 'crossing': {
          for (const [a, b] of tile.pairs) {
            const p = el('path', { class: 'trk free', d: `${this.#leg(tile, a)} ${this.#leg(tile, b)}` });
            this.layerTracks.appendChild(p); addSec(tile.section, p);
          }
          break;
        }
        case 'signal': this.#signal(tile); break;
        case 'block': this.#blockPanel(tile); break;
        case 'button': {
          if (!tile.counter) break;
          const g = el('g', { class: 'scr-counter' }, [
            el('rect', { x: 2, y: 8, width: CELL - 4, height: 22, rx: 2 }),
            text(C, 15, tile.label, { class: 'scr-text small' }),
            text(C, 25, '00000', { class: 'scr-text counter' }),
          ]);
          g.setAttribute('transform', `translate(${(tile.x - this.x0) * CELL},${tile.y * CELL})`);
          this.layerMarks.appendChild(g);
          this.counterRefs.set(tile.id, g.querySelector('.counter'));
          break;
        }
        case 'label': {
          const span = tile.span || 1;
          const t = text((tile.x - this.x0) * CELL + span * CELL / 2, cy, tile.text, { class: `scr-label${tile.size >= 11 ? ' title' : ''}`, 'font-size': Math.max(7, (tile.size || 8) * 0.95) });
          this.layerMarks.appendChild(t);
          break;
        }
        default: break;
      }
    }
  }

  /** Strzałka wyjazdu na szlak / koniec toru z przyciskiem końca przebiegu. */
  #exitMark(tile) {
    const [cx, cy] = this.#ctr(tile);
    const ex = this.#exitAt(tile);
    const ref = { kind: 'end', id: tile.endButton.id };
    const g = el('g', { class: 'scr-el end' });
    if (ex) {
      const dir = ex[1].dir === 'E' ? 1 : -1;
      const x = cx + dir * 4;
      g.append(el('path', { class: 'exit-arrow', d: `M${x - dir * 8},${cy - 7} L${x + dir * 6},${cy} L${x - dir * 8},${cy + 7} Z` }),
        text(cx, cy + 15, tile.text || ex[0], { class: 'scr-text small' }));
    } else {
      g.append(el('circle', { class: 'end-mark', cx, cy, r: 3 }));
    }
    g.appendChild(this.#hit(ref, cx, cy, 10));
    this.layerMarks.appendChild(g);
    this.hitEls.set(refKey(ref), g);
  }

  #signal(tile) {
    const [cx, cy] = this.#ctr(tile);
    const at = this.topo.trackAt(tile.at.x, tile.at.y);
    const above = at ? tile.y < at.y : true;
    const dir = tile.dir === 'E' ? 1 : -1;
    const g = el('g', { class: `scr-el signal ${tile.kind}` });
    // podstawa (kreska do toru) i maszt
    const baseY = above ? cy + 12 : cy - 12;
    g.appendChild(el('path', { class: 'sig-mast', d: `M${cx - dir * 9},${baseY} L${cx - dir * 9},${cy} L${cx - dir * 4},${cy}` }));
    const lamps = {};
    if (tile.kind === 'tm') {
      lamps.main = el('rect', { class: 'sig-body', x: cx - 4, y: cy - 4, width: 8, height: 8 });
      g.appendChild(lamps.main);
    } else {
      lamps.main = el('circle', { class: 'sig-body', cx, cy, r: 4.5 });
      lamps.aux = el('circle', { class: 'sig-body aux', cx: cx + dir * 8, cy, r: 2.6 });
      g.append(lamps.main, lamps.aux);
    }
    // grot kierunku jazdy
    g.appendChild(el('path', { class: 'sig-dir', d: `M${cx + dir * 12},${cy - 3} L${cx + dir * 16},${cy} L${cx + dir * 12},${cy + 3} Z` }));
    g.appendChild(text(cx, above ? cy - 9 : cy + 13, tile.id, { class: 'scr-text sig-label' }));
    g.appendChild(this.#hit({ kind: 'signal', id: tile.id }, cx, cy, 10));
    this.layerSignals.appendChild(g);
    this.signalRefs.set(tile.id, { lamps, g, tile });
    this.hitEls.set(refKey({ kind: 'signal', id: tile.id, color: 'green' }), g);
    this.hitEls.set(refKey({ kind: 'signal', id: tile.id, color: 'white' }), g);
  }

  /** Pole blokady liniowej: nazwa szlaku, wskaźniki wyjazd/wjazd/żądanie/Ko, liczniki. */
  #blockPanel(tile) {
    const ex = this.station.exits[tile.exit];
    const ox = (tile.x - this.x0) * CELL, oy = tile.y * CELL;
    const W = 4 * CELL - 6, H = 2 * CELL - 6;
    const lamp = (x, y, cls = '') => el('rect', { class: `scr-lamp ${cls}`.trim(), x, y, width: 8, height: 8, rx: 1 });
    const refs = {
      outW: lamp(10, 24), outR: lamp(20, 24), inW: lamp(10, 40), inR: lamp(20, 40), req: lamp(92, 24), ko: lamp(92, 40),
    };
    const g = el('g', { class: 'scr-el block', transform: `translate(${ox + 3},${oy + 3})` }, [
      el('rect', { class: 'block-box', x: 0, y: 0, width: W, height: H, rx: 3 }),
      text(W / 2, 10, ex?.label || tile.exit, { class: 'scr-text block-title' }),
      refs.outW, refs.outR, text(52, 31, 'wyjazd', { class: 'scr-text small', 'text-anchor': 'middle' }),
      refs.inW, refs.inR, text(52, 47, 'wjazd', { class: 'scr-text small', 'text-anchor': 'middle' }),
      text(118, 31, 'żąd.', { class: 'scr-text small' }), text(118, 47, 'Ko', { class: 'scr-text small' }),
      text(W - 8, 31, '00000', { class: 'scr-text counter cnt-po', 'text-anchor': 'end', 'font-size': 6 }),
      text(W - 8, 47, '00000', { class: 'scr-text counter cnt-ko', 'text-anchor': 'end', 'font-size': 6 }),
      text(W - 8, 60, 'dPo / dKo', { class: 'scr-text small', 'text-anchor': 'end' }),
    ]);
    const hit = el('rect', { class: 'hit', x: 0, y: 0, width: W, height: H });
    hit.dataset.ref = JSON.stringify({ kind: 'blockpanel', exit: tile.exit });
    g.appendChild(hit);
    refs.cntPo = g.querySelector('.cnt-po'); refs.cntKo = g.querySelector('.cnt-ko');
    this.layerMarks.appendChild(g);
    this.blockRefs.set(tile.exit, refs);
    for (const btn of ['Wbl', 'Poz', 'Ko', 'dPo', 'dKo']) this.hitEls.set(refKey({ kind: 'block', exit: tile.exit, btn }), g);
  }

  /* ---------------- obsługa ---------------- */
  #bind() {
    this.svg.addEventListener('pointerdown', (ev) => {
      const h = ev.target.closest('.hit');
      if (!h) { this.#closeMenu(); return; }
      ev.preventDefault();
      if (this.readonly) return;
      this.#click(JSON.parse(h.dataset.ref), ev);
    });
    this.svg.addEventListener('contextmenu', (ev) => { ev.preventDefault(); this.#cancelPending(); this.#closeMenu(); });
    document.addEventListener('pointerdown', (ev) => { if (!this.menu.contains(ev.target) && !this.svg.contains(ev.target)) this.#closeMenu(); });
    document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') { this.#cancelPending(); this.#closeMenu(); this.confirmBar.classList.add('hidden'); } });

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

  #click(ref, ev) {
    if (this.pending) {
      // wskazanie końca przebiegu
      if (ref.kind === 'signal' || ref.kind === 'end') {
        const endRef = ref.kind === 'signal' ? { kind: 'signal', id: ref.id, color: this.pending.color } : ref;
        this.handlers.onPress(endRef);
        this.#endPending();
        return;
      }
      this.#cancelPending();
    }
    this.#openMenu(ref, ev);
  }

  /** Lista poleceń dla elementu. */
  #commands(ref) {
    const H = this.handlers;
    const two = (group, role, target) => () => { H.onPress({ kind: 'group', id: group, role }); return H.onPress(target); };
    if (ref.kind === 'signal') {
      const s = this.ilk.signals.get(ref.id);
      const sigRef = (color) => ({ kind: 'signal', id: ref.id, color });
      const startRoute = (color) => () => {
        const res = H.onPress(sigRef(color));
        if (res?.ok) this.#beginPending(ref.id, color);
        return res;
      };
      const items = [];
      if (s.kind === 'semafor') items.push({ label: `Przebieg pociągowy od ${ref.id} …`, run: startRoute('green') });
      if (s.kind === 'tm' || s.shunting) items.push({ label: `Przebieg manewrowy od ${ref.id} …`, run: startRoute('white') });
      items.push({ label: 'Wygaś sygnał (przebieg pozostaje)', run: () => H.onPull(sigRef(s.kind === 'tm' ? 'white' : 'green')) });
      items.push({ label: 'Zwolnij przebieg (Pz)', run: two('Pz', 'route-release', sigRef('green')) });
      items.push({ label: 'Zwolnienie doraźne przebiegu (dPz)', special: true, run: two('dPz', 'emergency-release', sigRef('green')) });
      if (s.kind === 'semafor') items.push({ label: 'Sygnał zastępczy Sz', special: true, run: two('Sz', 'substitute', sigRef('green')) });
      return { title: `${s.kind === 'tm' ? 'Tarcza manewrowa' : 'Semafor'} ${ref.id}`, items };
    }
    if (ref.kind === 'point') {
      const p = this.ilk.points.get(ref.id);
      return { title: `Zwrotnica ${p?.label || ref.id}`, items: [
        { label: 'Przestaw zwrotnicę (Zw)', run: two('Zw', 'group-point', { kind: 'point', id: ref.id }) },
        { label: p?.individualLock ? 'Otwórz zamknięcie indywidualne (Zz)' : 'Zamknij indywidualnie (Zz)', special: true, run: two('Zz', 'point-lock', { kind: 'point', id: ref.id }) },
      ] };
    }
    if (ref.kind === 'derailer') {
      const d = this.ilk.derailers.get(ref.id);
      return { title: `Wykolejnica ${ref.id}`, items: [
        { label: d?.position === 'on' ? 'Zdejmij wykolejnicę (Zw)' : 'Nałóż wykolejnicę (Zw)', run: two('Zw', 'group-point', { kind: 'derailer', id: ref.id }) },
        { label: d?.individualLock ? 'Otwórz zamknięcie (Zz)' : 'Zamknij indywidualnie (Zz)', special: true, run: two('Zz', 'point-lock', { kind: 'derailer', id: ref.id }) },
      ] };
    }
    if (ref.kind === 'blockpanel') {
      const b = this.sim.blocks.get(ref.exit);
      const press = (btn) => () => H.onPress({ kind: 'block', exit: ref.exit, btn });
      const items = [];
      if (!b?.fixed) items.push({ label: 'Żądanie pozwolenia na wyprawienie (Wbl)', run: press('Wbl') }, { label: 'Pozwolenie dla sąsiada (Poz)', run: press('Poz') });
      items.push({ label: 'Potwierdzenie przyjazdu (Ko)', run: press('Ko') });
      items.push({ label: 'Doraźne zwolnienie bloku początkowego (dPo)', special: true, run: press('dPo') });
      items.push({ label: 'Doraźne zwolnienie bloku końcowego (dKo)', special: true, run: press('dKo') });
      return { title: `Blokada – ${b?.label || ref.exit}`, items };
    }
    if (ref.kind === 'end') {
      return { title: 'Koniec toru / szlak', items: [{ label: 'Wskaż najpierw semafor początku przebiegu', run: () => ({ ok: false }) }] };
    }
    return null;
  }

  #openMenu(ref, ev) {
    const cmd = this.#commands(ref);
    if (!cmd) return;
    this.menu.innerHTML = `<h5>${cmd.title}</h5>`;
    for (const it of cmd.items) {
      const b = document.createElement('button');
      b.type = 'button'; b.textContent = it.label; if (it.special) b.classList.add('special');
      b.addEventListener('click', () => { this.#closeMenu(); if (it.special) this.#confirm(it); else it.run(); });
      this.menu.appendChild(b);
    }
    this.menu.classList.remove('hidden');
    const mw = 260, mh = this.menu.offsetHeight || 160;
    this.menu.style.left = `${Math.min(ev.clientX, window.innerWidth - mw - 8)}px`;
    this.menu.style.top = `${Math.min(ev.clientY, window.innerHeight - mh - 8)}px`;
  }

  #closeMenu() { this.menu.classList.add('hidden'); }

  /** Polecenie specjalne – wymaga potwierdzenia (rejestrowane, liczniki). */
  #confirm(item) {
    this.confirmBar.innerHTML = `<span>Polecenie specjalne: <b>${item.label}</b> – rejestrowane w liczniku.</span>`;
    const ok = document.createElement('button'); ok.type = 'button'; ok.className = 'tb warn'; ok.textContent = 'Wykonaj';
    const no = document.createElement('button'); no.type = 'button'; no.className = 'tb'; no.textContent = 'Anuluj';
    ok.addEventListener('click', () => { this.confirmBar.classList.add('hidden'); item.run(); });
    no.addEventListener('click', () => this.confirmBar.classList.add('hidden'));
    this.confirmBar.append(ok, no);
    this.confirmBar.classList.remove('hidden');
  }

  #beginPending(id, color) {
    this.pending = { id, color };
    this.svg.classList.add('picking');
  }
  #endPending() { this.pending = null; this.svg.classList.remove('picking'); }
  #cancelPending() {
    if (!this.pending) return;
    // wyciągnięcie przycisku = anulowanie uzbrojenia bez wygaszania nastawionego przebiegu
    if (this.ilk.armed) { this.ilk.armed = null; this.sim.bus.emit('armed', null); }
    this.#endPending();
  }

  /* ---------------- aktualizacja stanu ---------------- */
  refreshAll() {
    for (const id of this.sectionEls.keys()) this.updateSection(id);
    for (const id of this.pointRefs.keys()) this.updatePoint(id);
    for (const id of this.derailerRefs.keys()) this.updateDerailer(id);
    for (const id of this.signalRefs.keys()) this.updateSignal(id);
    for (const id of this.blockRefs.keys()) this.updateBlock(id);
    this.#counters();
    this.updateArmed(this.ilk.armed);
  }

  #sectionClass(sec) {
    if (!sec) return 'free';
    if (sec.occupied) return 'occ';
    if (sec.route) { const act = this.ilk.active.get(sec.route); return act?.route.kind === 'shunt' ? 'rt-shunt' : 'rt-train'; }
    if (sec.closed) return 'closed';
    return 'free';
  }

  updateSection(id) {
    const sec = this.ilk.sections.get(id);
    const cls = this.#sectionClass(sec);
    for (const e of this.sectionEls.get(id) || []) setTrk(e, cls);
    for (const p of this.ilk.points.values()) if (p.section === id) this.updatePoint(p.id);
    for (const d of this.ilk.derailers.values()) if (d.section === id) this.updateDerailer(d.id);
  }

  updatePoint(id) {
    const p = this.ilk.points.get(id);
    const r = this.pointRefs.get(id);
    if (!p || !r) return;
    const cls = this.#sectionClass(this.ilk.sections.get(p.section));
    if (p.moving || !p.control) {
      setTrk(r.toe, `${cls} nocontrol`); setTrk(r.straight, 'dim nocontrol'); setTrk(r.diverge, 'dim nocontrol');
      r.g.classList.toggle('trailed', !!p.trailed);
    } else {
      setTrk(r.toe, cls);
      setTrk(r.straight, p.position === '+' ? cls : 'dim');
      setTrk(r.diverge, p.position === '-' ? cls : 'dim');
      r.g.classList.remove('trailed');
    }
    r.lock.classList.toggle('on', !!p.individualLock);
  }

  updateDerailer(id) {
    const d = this.ilk.derailers.get(id);
    const r = this.derailerRefs.get(id);
    if (!d || !r) return;
    r.mark.classList.toggle('on', d.position === 'on' && !d.moving);
    r.g.classList.toggle('locked', !!d.individualLock);
  }

  updateSignal(id) {
    const s = this.ilk.signals.get(id);
    const r = this.signalRefs.get(id);
    if (!s || !r) return;
    const a = s.aspect;
    const main = { S1: 'red', S2: 'green', S3: 'green blink', S4: 'orange blink', S5: 'orange', S10: 'green', S11: 'green blink', S12: 'green', S13: 'orange', Sz: 'white blink', Ms2: 'white' };
    const aux = { S10: 'orange', S11: 'orange', S12: 'orange blink', S13: 'orange' };
    if (s.kind === 'tm') setLamp(r.lamps.main, a === 'Ms2' ? 'white' : 'blue');
    else { setLamp(r.lamps.main, main[a] || 'off'); setLamp(r.lamps.aux, aux[a] || 'off'); }
    r.g.classList.toggle('route', s.route != null);
  }

  updateBlock(exitId) {
    const b = this.sim.blocks.get(exitId);
    const r = this.blockRefs.get(exitId);
    if (!b || !r) return;
    setLamp(r.outW, b.direction === 'out' && (b.permission || b.phone?.permissionFor || b.fixed === 'out') && !b.occupied ? 'white' : (b.request === 'ours' ? 'white blink' : 'off'));
    setLamp(r.outR, b.poBlocked ? 'red' : 'off');
    setLamp(r.inW, b.direction === 'in' && !b.occupied && !b.koPending ? 'white' : 'off');
    setLamp(r.inR, b.direction === 'in' && b.occupied ? 'red' : 'off');
    setLamp(r.req, b.request === 'theirs' ? 'white blink' : 'off');
    setLamp(r.ko, b.koPending ? 'white blink' : 'off');
    r.cntPo.textContent = String(b.counters.dPo).padStart(5, '0');
    r.cntKo.textContent = String(b.counters.dKo).padStart(5, '0');
  }

  updateArmed(a) {
    for (const e of this.hitEls.values()) e.classList.remove('armed');
    if (!a) { if (this.pending) this.#endPending(); return; }
    if (a.kind === 'group') return; // przyciski grupowe nie istnieją na ekranie – polecenie jest złożone od razu
    this.hitEls.get(refKey(a))?.classList.add('armed');
  }

  #counters() {
    for (const [id, t] of this.counterRefs) t.textContent = String(this.ilk.counters[id] ?? 0).padStart(5, '0');
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
        lbl = el('g', { class: 'scr-train' }, [el('rect', { x: -17, y: -7, width: 34, height: 13, rx: 1 }), text(0, 0, String(tr.nr), { class: 'scr-train-nr' })]);
        this.layerTrains.appendChild(lbl);
        this.trainLabels.set(tr.nr, lbl);
      }
      const visible = headTile.x >= this.x0 && headTile.x <= this.x1;
      lbl.style.display = visible ? '' : 'none';
      lbl.setAttribute('transform', `translate(${(headTile.x - this.x0) * CELL + C},${headTile.y * CELL + C - 13})`);
      lbl.querySelector('.scr-train-nr').textContent = `${tr.nr}${tr.v > 0.3 ? '' : ' ■'}`;
    }
    for (const [nr, lbl] of this.trainLabels) if (!seen.has(nr)) { lbl.remove(); this.trainLabels.delete(nr); }
    this.#counters();
  }
}

function setTrk(e, cls) {
  e.setAttribute('class', `trk ${cls}`);
}

function setLamp(e, state) {
  if (!e) return;
  e.classList.remove('on', 'lamp-red', 'lamp-white', 'lamp-yellow', 'lamp-green', 'lamp-orange', 'lamp-blue', 'blink');
  if (!state || state === 'off') return;
  const [color, blink] = state.split(' ');
  e.classList.add('on', `lamp-${color}`);
  if (blink) e.classList.add('blink');
}
