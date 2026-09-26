import { el, text, CELL } from './svg.js';
import { PORT_XY } from '../tiles/directions.js';
import { refKey } from './DeskRenderer.js';

const C = CELL / 2;
const PAD = 12;

/**
 * Stanowisko komputerowe (monitor dyżurnego ruchu). Zobrazowanie wg wytycznych PKP PLK Ie-104
 * (zobrazowanie, wprowadzanie poleceń i rejestracja zdarzeń na komputerowych stanowiskach obsługi srk),
 * w układzie znanym ze stanowisk EbiScreen / ISKRA:
 *
 *  Odcinki toru (Ie-104, tab. 8): szary – stan podstawowy (wolny); czerwony – zajęty; zielony – utwierdzony
 *  w przebiegu pociągowym; żółty – utwierdzony w przebiegu manewrowym; fioletowy – zwalnianie czasowe;
 *  podwójna szara linia – tor wolny zamknięty dla ruchu; biały stały – brak danych o stanie.
 *  Sygnalizatory (Ie-104, stany wg malejącego priorytetu): biały – brak danych; biały migający – sygnał
 *  zastępczy; zielony – sygnał zezwalający dla pociągu; żółty – zezwalający na manewry; czerwony –
 *  sygnalizator początkowy lub końcowy utwierdzonego przebiegu; różowy – zamknięty indywidualnie; szary –
 *  stan podstawowy. Symbol semafora: podwójny grot z kreską masztu, nazwa żółta; tarcza manewrowa: pojedynczy grot.
 *  Zwrotnica (Ie-104): pole „Z” i ramiona a/b/c; „+” przy ramieniu położenia zasadniczego; kształt pola Z –
 *  położenie iglic / brak kontroli; kolor – stan odcinka (jak tor), różowy – zamknięcie indywidualne.
 *  Grupa G4 (stany operacyjne): niebieska ramka – element wybrany do polecenia, migająca – trwa nastawianie
 *  przebiegu; czerwona migająca ramka – stan alarmowy elementu. Numery pociągów w czerwonych kasetkach.
 *
 *  Polecenia: pasek poleceń u góry (PRZEBIEG POCIĄGOWY, PRZEBIEG MANEWROWY, ZWOLNIJ, dPz, ZWROTNICA, Zz,
 *  Sz, STOP, OPS – odwołanie polecenia) + menu elementu. Polecenie = rodzaj → element początkowy → element
 *  końcowy. Polecenia specjalne (dPz, Sz, Zz, dPo, dKo) są inicjowane, potwierdzane „WYKONAJ” i rejestrowane.
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
    this.sectionEls = new Map();  // sectionId -> [segment group]
    this.pointRefs = new Map();
    this.derailerRefs = new Map();
    this.signalRefs = new Map();
    this.blockRefs = new Map();
    this.counterRefs = new Map();
    this.hitEls = new Map();      // refKey -> grupa elementu (ramka selekcji)
    this.trainLabels = new Map();
    this.pending = null;          // trwający przebieg: { id, color }
    this.mode = null;             // wybrane polecenie z paska: 'train'|'shunt'|'pz'|'dpz'|'zw'|'zz'|'sz'|'stop'

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
    container.classList.add('screen-host');
    container.appendChild(this.svg);

    this.menu = document.createElement('div');
    this.menu.className = 'scr-menu hidden';
    document.body.appendChild(this.menu);
    this.confirmBar = document.createElement('div');
    this.confirmBar.className = 'scr-confirm hidden';
    document.body.appendChild(this.confirmBar);
    if (!this.readonly) this.#buildCmdBar(container);

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
  #frame(cx, cy, w = 22, h = 22) {
    return el('rect', { class: 'sel-frame', x: cx - w / 2, y: cy - h / 2, width: w, height: h, rx: 2 });
  }
  #exitAt(tile) {
    return Object.entries(this.station.exits || {}).find(([, e]) => e.tile.x === tile.x && e.tile.y === tile.y);
  }
  /** Segment toru: linia zewnętrzna + wewnętrzna (dla podwójnej linii toru zamkniętego). */
  #segment(d) {
    return el('g', { class: 'seg free' }, [el('path', { class: 'trk', d }), el('path', { class: 'trk-inner', d })]);
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
          const s = this.#segment(`${this.#leg(tile, a)} ${this.#leg(tile, b)}`);
          this.layerTracks.appendChild(s); addSec(tile.section, s);
          if (tile.derailer) {
            const g = el('g', { class: 'scr-el derailer' }, [
              this.#frame(cx, cy, 18, 18),
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
          const s = this.#segment(this.#leg(tile, tile.port, 0, 1));
          const [px, py] = this.#pt(tile, tile.port);
          const nx = -(py - cy), ny = px - cx;
          const bar = el('path', { class: 'buffer-bar', d: `M${cx + nx * 0.35},${cy + ny * 0.35} L${cx - nx * 0.35},${cy - ny * 0.35}` });
          this.layerTracks.append(s, bar); addSec(tile.section, s);
          if (tile.endButton) this.#exitMark(tile);
          break;
        }
        case 'point': {
          // ramiona a (ostrze/toe), b (zasadnicze) i c (zwrotne) – wg Ie-104; pole Z w środku
          const toe = this.#segment(this.#leg(tile, tile.toe, 0.3, 1));
          const straight = this.#segment(this.#leg(tile, tile.straight, 0.3, 1));
          const diverge = this.#segment(this.#leg(tile, tile.diverge, 0.3, 1));
          const zField = el('path', { class: 'z-field', d: '' });
          this.layerTracks.append(diverge, straight, toe, zField);
          const [dx, dy] = PORT_XY[tile.diverge];
          const below = dy > C;
          const lbl = text(cx, cy + (below ? -9 : 12), tile.label || tile.id, { class: 'scr-text pt-label' });
          // „+” przy ramieniu zasadniczym
          const [sx, sy] = this.#pt(tile, tile.straight);
          const plus = text(cx + (sx - cx) * 0.62 + (below ? 0 : 0), cy + (sy - cy) * 0.62 + (below ? -7 : 8), '+', { class: 'scr-text pt-plus' });
          const g = el('g', { class: 'scr-el point' }, [this.#frame(cx, cy, 24, 24), lbl, plus, this.#hit({ kind: 'point', id: tile.id }, cx, cy, 10)]);
          this.layerMarks.appendChild(g);
          this.pointRefs.set(tile.id, { toe, straight, diverge, zField, lbl, plus, g, tile });
          this.hitEls.set(refKey({ kind: 'point', id: tile.id }), g);
          break;
        }
        case 'crossing': {
          for (const [a, b] of tile.pairs) {
            const s = this.#segment(`${this.#leg(tile, a)} ${this.#leg(tile, b)}`);
            this.layerTracks.appendChild(s); addSec(tile.section, s);
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

  /** Wyjazd na szlak (sąsiedni posterunek na krańcu) / koniec toru – element końca przebiegu. */
  #exitMark(tile) {
    const [cx, cy] = this.#ctr(tile);
    const ex = this.#exitAt(tile);
    const ref = { kind: 'end', id: tile.endButton.id };
    const g = el('g', { class: 'scr-el end' }, [this.#frame(cx, cy, 22, 22)]);
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

  /** Semafor: podwójny grot z kreską masztu (EbiScreen/Ie-104.1); tarcza manewrowa: pojedynczy grot. */
  #signal(tile) {
    const [cx, cy] = this.#ctr(tile);
    const at = this.topo.trackAt(tile.at.x, tile.at.y);
    const above = at ? tile.y < at.y : true;
    const dir = tile.dir === 'E' ? 1 : -1;
    const g = el('g', { class: `scr-el signal ${tile.kind}` }, [this.#frame(cx, cy, 30, 20)]);
    const baseY = above ? cy + 12 : cy - 12;
    // maszt: kreska od toru do symbolu i podstawa
    g.appendChild(el('path', { class: 'sig-mast', d: `M${cx - dir * 11},${baseY} L${cx - dir * 11},${cy}` }));
    const chevron = (x) => `M${x - dir * 5},${cy - 5} L${x + dir * 2},${cy} L${x - dir * 5},${cy + 5} Z`;
    const body = el('g', { class: 'sig-body' });
    if (tile.kind === 'tm') body.appendChild(el('path', { d: chevron(cx - dir * 2) }));
    else body.append(el('path', { d: chevron(cx - dir * 6) }), el('path', { d: chevron(cx + dir * 2) }));
    g.appendChild(body);
    // mały trójkąt końca przebiegu (Ie-104.1: stan utwierdzenia końca / zwalnianie czasowe)
    const endTri = el('path', { class: 'sig-end', d: `M${cx + dir * 9},${cy - 3} L${cx + dir * 13},${cy} L${cx + dir * 9},${cy + 3} Z` });
    g.appendChild(endTri);
    g.appendChild(text(cx, above ? cy - 10 : cy + 14, tile.id, { class: 'scr-text sig-label' }));
    g.appendChild(this.#hit({ kind: 'signal', id: tile.id }, cx, cy, 11));
    this.layerSignals.appendChild(g);
    this.signalRefs.set(tile.id, { body, endTri, g, tile });
    this.hitEls.set(refKey({ kind: 'signal', id: tile.id, color: 'green' }), g);
    this.hitEls.set(refKey({ kind: 'signal', id: tile.id, color: 'white' }), g);
  }

  /** Pole blokady liniowej: nazwa szlaku, wskaźniki wyjazd/wjazd/żądanie/Ko, liczniki dPo/dKo. */
  #blockPanel(tile) {
    const ex = this.station.exits[tile.exit];
    const ox = (tile.x - this.x0) * CELL, oy = tile.y * CELL;
    const W = 4 * CELL - 6, H = 2 * CELL - 6;
    const lamp = (x, y) => el('rect', { class: 'scr-lamp', x, y, width: 8, height: 8, rx: 1 });
    const refs = { outW: lamp(10, 24), outR: lamp(20, 24), inW: lamp(10, 40), inR: lamp(20, 40), req: lamp(92, 24), ko: lamp(92, 40) };
    const g = el('g', { class: 'scr-el block', transform: `translate(${ox + 3},${oy + 3})` }, [
      el('rect', { class: 'block-box', x: 0, y: 0, width: W, height: H, rx: 3 }),
      el('rect', { class: 'sel-frame', x: -1, y: -1, width: W + 2, height: H + 2, rx: 3 }),
      text(W / 2, 10, ex?.label || tile.exit, { class: 'scr-text block-title' }),
      refs.outW, refs.outR, text(52, 31, 'wyjazd', { class: 'scr-text small' }),
      refs.inW, refs.inR, text(52, 47, 'wjazd', { class: 'scr-text small' }),
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

  /** Pasek poleceń (układ EbiScreen): rodzaj polecenia → element(y). OPS odwołuje polecenie. */
  #buildCmdBar(container) {
    const bar = document.createElement('div');
    bar.className = 'scr-cmdbar';
    const CMDS = [
      ['train', 'PRZEBIEG POCIĄGOWY'], ['shunt', 'PRZEBIEG MANEWROWY'], ['pz', 'ZWOLNIJ PRZEBIEG'], ['dpz', 'dPz', true],
      ['zw', 'ZWROTNICA'], ['zz', 'Zz', true], ['sz', 'Sz', true], ['stop', 'STOP'], ['ops', 'OPS'],
    ];
    this.cmdButtons = new Map();
    for (const [id, label, special] of CMDS) {
      const b = document.createElement('button');
      b.type = 'button'; b.textContent = label; b.dataset.cmd = id;
      if (special) b.classList.add('special');
      b.addEventListener('click', () => this.#setMode(id === 'ops' ? null : id, id === 'ops'));
      bar.appendChild(b); this.cmdButtons.set(id, b);
    }
    this.cmdInfo = document.createElement('span');
    this.cmdInfo.className = 'scr-cmdinfo';
    bar.appendChild(this.cmdInfo);
    container.appendChild(bar);
    this.cmdBar = bar;
  }

  #setMode(mode, cancelAll = false) {
    if (cancelAll) { this.#cancelPending(); this.confirmBar.classList.add('hidden'); }
    this.mode = mode;
    for (const [id, b] of this.cmdButtons) b.classList.toggle('active', id === mode);
    const INFO = {
      train: 'wskaż semafor początkowy, potem semafor końcowy lub szlak', shunt: 'wskaż sygnalizator początkowy, potem końcowy / koniec toru',
      pz: 'wskaż semafor początkowy przebiegu do zwolnienia', dpz: 'polecenie specjalne – wskaż semafor początkowy', zw: 'wskaż zwrotnicę lub wykolejnicę',
      zz: 'polecenie specjalne – wskaż zwrotnicę (zamknięcie / otwarcie)', sz: 'polecenie specjalne – wskaż semafor', stop: 'wskaż sygnalizator do wygaszenia',
    };
    this.cmdInfo.textContent = mode ? INFO[mode] : '';
    this.svg.classList.toggle('picking', !!mode || !!this.pending);
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
    this.svg.addEventListener('contextmenu', (ev) => { ev.preventDefault(); this.#setMode(null, true); this.#closeMenu(); });
    document.addEventListener('pointerdown', (ev) => { if (!this.menu.contains(ev.target) && !this.svg.contains(ev.target)) this.#closeMenu(); });
    document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') { this.#setMode(null, true); this.#closeMenu(); } });

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
      if (ref.kind === 'signal' || ref.kind === 'end') {
        const endRef = ref.kind === 'signal' ? { kind: 'signal', id: ref.id, color: this.pending.color } : ref;
        this.handlers.onPress(endRef);
        this.#endPending();
        return;
      }
      this.#cancelPending();
    }
    if (this.mode) { this.#runMode(ref); return; }
    this.#openMenu(ref, ev);
  }

  /** Polecenie z paska zastosowane do wskazanego elementu. */
  #runMode(ref) {
    const cmd = this.#commands(ref);
    const find = (re) => cmd?.items.find((it) => re.test(it.label));
    const M = {
      train: [/^Przebieg pociągowy/, ['signal']], shunt: [/^Przebieg manewrowy/, ['signal']], pz: [/^Zwolnij przebieg/, ['signal']],
      dpz: [/^Zwolnienie doraźne/, ['signal']], zw: [/^(Przestaw|Zdejmij|Nałóż)/, ['point', 'derailer']], zz: [/\(Zz\)/, ['point', 'derailer']],
      sz: [/^Sygnał zastępczy/, ['signal']], stop: [/^Wygaś/, ['signal']],
    }[this.mode];
    if (!M || !M[1].includes(ref.kind)) { this.sim.bus.emit('log', { time: this.ilk.time, level: 'warn', msg: 'Polecenie nie dotyczy wskazanego elementu' }); return; }
    const item = find(M[0]);
    if (!item) return;
    const keep = this.mode === 'train' || this.mode === 'shunt';
    if (item.special) this.#confirm(item); else item.run();
    if (!keep) this.#setMode(null);
    else if (!this.pending) this.#setMode(null);
  }

  /** Lista poleceń dla elementu (menu). */
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
      items.push({ label: 'Wygaś sygnał – STOP (przebieg pozostaje)', run: () => H.onPull(sigRef(s.kind === 'tm' ? 'white' : 'green')) });
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
      return { title: 'Koniec toru / szlak', items: [{ label: 'Wskaż najpierw sygnalizator początku przebiegu', run: () => ({ ok: false }) }] };
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

  /** Polecenie specjalne – inicjalizacja, potwierdzenie WYKONAJ, rejestracja (licznik). OPS odwołuje. */
  #confirm(item) {
    this.confirmBar.innerHTML = `<span>Polecenie specjalne: <b>${item.label}</b> – rejestrowane w liczniku.</span>`;
    const ok = document.createElement('button'); ok.type = 'button'; ok.className = 'tb warn'; ok.textContent = 'WYKONAJ';
    const no = document.createElement('button'); no.type = 'button'; no.className = 'tb'; no.textContent = 'OPS – odwołaj';
    ok.addEventListener('click', () => { this.confirmBar.classList.add('hidden'); item.run(); });
    no.addEventListener('click', () => this.confirmBar.classList.add('hidden'));
    this.confirmBar.append(ok, no);
    this.confirmBar.classList.remove('hidden');
  }

  #beginPending(id, color) {
    this.pending = { id, color };
    this.svg.classList.add('picking');
  }
  #endPending() { this.pending = null; this.svg.classList.toggle('picking', !!this.mode); this.#setMode(null); }
  #cancelPending() {
    if (!this.pending) return;
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

  /** Stan odcinka wg tab. 8 Ie-104. */
  #sectionClass(sec) {
    if (!sec) return 'free';
    if (sec.occupied) return 'occ';
    if (sec.route) {
      const act = this.ilk.active.get(sec.route);
      if (act?.timedRelease) return 'timed';
      return act?.route.kind === 'shunt' ? 'rt-shunt' : 'rt-train';
    }
    if (sec.closed) return 'closed';
    return 'free';
  }

  updateSection(id) {
    const sec = this.ilk.sections.get(id);
    const cls = this.#sectionClass(sec);
    for (const e of this.sectionEls.get(id) || []) setSeg(e, cls);
    for (const p of this.ilk.points.values()) if (p.section === id) this.updatePoint(p.id);
    for (const d of this.ilk.derailers.values()) if (d.section === id) this.updateDerailer(d.id);
  }

  updatePoint(id) {
    const p = this.ilk.points.get(id);
    const r = this.pointRefs.get(id);
    if (!p || !r) return;
    const [cx, cy] = this.#ctr(r.tile);
    const base = this.#sectionClass(this.ilk.sections.get(p.section));
    const cls = p.individualLock && base === 'free' ? 'locked' : base;
    const leg = (port) => { const [px, py] = this.#pt(r.tile, port); return [cx + (px - cx) * 0.3, cy + (py - cy) * 0.3]; };
    const [tx, ty] = leg(r.tile.toe);
    if (p.moving || !p.control) {
      // pole Z: brak kontroli – iglice w położeniu pośrednim (kreska do środka), migotanie
      setSeg(r.toe, cls); setSeg(r.straight, 'dim'); setSeg(r.diverge, 'dim');
      r.zField.setAttribute('d', `M${tx},${ty} L${cx},${cy}`);
      r.zField.setAttribute('class', `z-field ${cls} nocontrol`);
      r.g.classList.toggle('alarm', !p.moving); // nieoczekiwany brak kontroli / rozprucie – ramka alarmowa
      r.g.classList.toggle('trailed', !!p.trailed);
    } else {
      const [ax, ay] = leg(p.position === '+' ? r.tile.straight : r.tile.diverge);
      setSeg(r.toe, cls);
      setSeg(r.straight, p.position === '+' ? cls : 'dim');
      setSeg(r.diverge, p.position === '-' ? cls : 'dim');
      r.zField.setAttribute('d', `M${tx},${ty} L${cx},${cy} L${ax},${ay}`);
      r.zField.setAttribute('class', `z-field ${cls}`);
      r.g.classList.remove('alarm', 'trailed');
    }
    r.lbl.classList.toggle('locked', !!p.individualLock);
  }

  updateDerailer(id) {
    const d = this.ilk.derailers.get(id);
    const r = this.derailerRefs.get(id);
    if (!d || !r) return;
    r.mark.classList.toggle('on', d.position === 'on' && !d.moving);
    r.g.classList.toggle('locked', !!d.individualLock);
  }

  /** Stan sygnalizatora wg listy Ie-104 (malejący priorytet): Sz biały migający, zielony/żółty zezwalający,
   *  czerwony – początek lub koniec utwierdzonego przebiegu, szary – stan podstawowy. */
  updateSignal(id) {
    const s = this.ilk.signals.get(id);
    const r = this.signalRefs.get(id);
    if (!s || !r) return;
    const a = s.aspect;
    let st = 'base';
    const isEnd = [...this.ilk.active.values()].some((act) => act.route.end.type === 'signal' && act.route.end.id === id);
    if (a === 'Sz') st = 'sz';
    else if (a === 'Ms2') st = 'shunt';
    else if (a && a !== 'S1') st = 'train';
    else if (s.route != null || isEnd) st = 'locked';
    r.body.setAttribute('class', `sig-body st-${st}`);
    r.endTri.setAttribute('class', `sig-end${isEnd ? ' on' : ''}`);
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

  /** G4: element wybrany do polecenia – niebieska ramka (migająca podczas nastawiania przebiegu). */
  updateArmed(a) {
    for (const e of this.hitEls.values()) e.classList.remove('selected');
    if (!a) { if (this.pending) this.#endPending(); return; }
    if (a.kind === 'group') return;
    this.hitEls.get(refKey(a))?.classList.add('selected');
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

function setSeg(e, cls) {
  e.setAttribute('class', `seg ${cls}`);
}

function setLamp(e, state) {
  if (!e) return;
  e.classList.remove('on', 'lamp-red', 'lamp-white', 'lamp-yellow', 'lamp-green', 'lamp-orange', 'lamp-blue', 'blink');
  if (!state || state === 'off') return;
  const [color, blink] = state.split(' ');
  e.classList.add('on', `lamp-${color}`);
  if (blink) e.classList.add('blink');
}
