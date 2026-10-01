import { el, text, CELL } from './svg.js';
import { PORT_XY } from '../tiles/directions.js';
import { refKey } from './refKey.js';
import { deskControls } from '../tiles/controls.js';
import { PanelView } from './PanelView.js';
import { t } from '../i18n/index.js';
import { platformSpans, platformEdgeLines } from './platforms.js';
import { relationOf } from '../model/categories.js';
import { blockSymbol, blockSymbolShapes, hasKoSymbol, koSymbol } from './blockSymbol.js';
import { trainLabelX } from './trainLabel.js';

const C = CELL / 2;
const PAD = 12;

/**
 * Wspólny obraz stanowisk komputerowych (monitor dyżurnego ruchu) – zobrazowanie wg wytycznych PKP PLK Ie-104
 * (zobrazowanie, wprowadzanie poleceń i rejestracja zdarzeń na komputerowych stanowiskach obsługi srk). Sposób
 * wydawania poleceń należy do stanowiska: `ScreenRenderer` (pasek poleceń i menu elementu), `EbiRenderer`
 * (EBILock 950 / EBIScreen – linia poleceń). Podklasa po `super()` buduje swoje elementy obsługi, a potem woła
 * `bindModel()` i `refreshAll()`.
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
 */
export class ScreenBase extends PanelView {
  static PAD = PAD;

  /** Ściśnięcie rzędów (0,7 = symbole bliżej toru). */
  static rowScale(opts) { return Number(opts.rowScale) || 1; }

  constructor(container, sim, handlers, opts = {}) {
    super(container, sim, handlers, opts, { className: 'screen' });
    this.S = Number(opts.symScale) || 1;       // skala symboli i napisów (1–1,5)
    this.symbols = [];                          // grupy symboli do przeskalowania na żywo

    this.svg.style.setProperty('--sym', String(this.S));
    this.svg.style.setProperty('--symb', String(Math.min(this.S, 1.15)));
    this.addBackdrop(el('rect', { class: 'scr-bg', x: 0, y: 0, width: this.width, height: this.height }));
    // miganie synchroniczne na całym obrazie, 1 Hz, 50/50 (Ie-104.1 §4 ust. 17): wspólna faza – klasa `ph` na obrazie
    // i atrybut `data-ph` grupy planu; reguły CSS migania zaczynają się od grupy, bo pola skrajne rysują ją przez `<use>`,
    // a w kopii rysunek nie jest przodkiem (przy samej klasie rysunku elementy migające na polu świeciły na stałe)
    if (typeof setInterval === 'function') this.blinkTimer = setInterval(() => this.inner.setAttribute('data-ph', this.svg.classList.toggle('ph') ? '1' : '0'), 500);
    if (this.readonly) this.addBackdrop(text(this.width / 2, 8, t('desk.readonly', { name: this.title || t('desk.district') }), { class: 'scr-banner' }));
    this.layerTracks = el('g', { class: 'layer-tracks' });
    this.layerMarks = el('g', { class: 'layer-marks' });
    this.layerSignals = el('g', { class: 'layer-signals' });
    this.layerTrains = el('g', { class: 'layer-trains' });
    this.inner.append(this.layerTracks, this.layerMarks, this.layerSignals, this.layerTrains);

    this.#build();
    // porządki po narysowaniu (geometria z rysunku; także po ułożeniu strony)
    this.#declutter();
    requestAnimationFrame(() => this.#declutter());
  }

  /**
   * Tekst opisu na monitorze: „tor N” i „Peron …” są rysowane osobno (ramka na torze, prostokąt peronu), więc z opisu
   * kostki `label` zostaje reszta („tor 6 · Baza EZ Sopot” → „Baza EZ Sopot”, „tor 2 · Peron II” → nic).
   */
  static labelText(text) {
    const m = /^tor\s+\S+\s*(?:·\s*(.*))?$/i.exec(String(text).trim());
    if (!m) return text;
    const rest = (m[1] || '').replace(/^peron\b.*$/i, '').trim();
    return rest || null;
  }

  /** Skala symboli i napisów na żywo (ustawienie „wielkość symboli”). */
  setSymbolScale(S) {
    this.S = Number(S) || 1;
    this.svg.style.setProperty('--sym', String(this.S));
    this.svg.style.setProperty('--symb', String(Math.min(this.S, 1.15)));
    for (const sym of this.symbols) this.#place(sym);
    for (const { label } of this.trainLabels.values()) label.firstChild.setAttribute('transform', `scale(${this.S})`);
    this.#declutter();
  }

  /**
   * Pola dotyku torów nad liniami torów – tor jako obiekt poleceń (zamknięcie toru, cel przebiegu). Stanowiska, które
   * tego potrzebują, wołają to po `super()`; `sectionHits`: odcinek → pola (do ramki wyboru).
   */
  addSectionHits() {
    this.sectionHits = new Map();
    for (const [sid, segs] of this.sectionRefs) {
      for (const seg of segs) {
        const d = seg.querySelector?.('.trk')?.getAttribute('d');
        if (!d) continue;
        const h = el('path', { class: 'hit hit-seg', d });
        h.dataset.ref = JSON.stringify({ kind: 'section', id: sid });
        this.layerTracks.appendChild(h);
        if (!this.sectionHits.has(sid)) this.sectionHits.set(sid, []);
        this.sectionHits.get(sid).push(h);
      }
    }
  }

  /** Położenie symbolu: środek + przesunięcie w jednostkach symbolu (`sx`, rośnie ze skalą) + przesunięcie porządkujące (`off`). */
  #place(sym) {
    sym.g.setAttribute('transform', `translate(${sym.cx + (sym.sx || 0) * this.S + (sym.off || 0)},${sym.cy}) scale(${this.S})`);
  }

  /** Widoczny prostokąt symbolu w jednostkach rysunku – bez ramki wyboru i pola dotyku (tło pod sygnalizatorem się liczy: zasłania). */
  #box(sym, only = null) {
    let l = Infinity, t = Infinity, r = -Infinity, b = -Infinity;
    for (const e of only ? [only] : sym.g.querySelectorAll('path, text, circle, rect')) {
      if (/sel-frame|hit/.test(e.getAttribute('class') || '')) continue;
      let q; try { q = e.getBBox(); } catch { continue; }
      if (!q.width && !q.height) continue;
      l = Math.min(l, q.x); t = Math.min(t, q.y); r = Math.max(r, q.x + q.width); b = Math.max(b, q.y + q.height);
    }
    if (l === Infinity) return null;
    const x0 = sym.cx + (sym.sx || 0) * this.S + (sym.off || 0), S = this.S;
    return { l: x0 + l * S, r: x0 + r * S, t: sym.cy + t * S, b: sym.cy + b * S };
  }

  /**
   * Porządki po skalowaniu: symbole rosną, odstępy między nimi nie. Wykolejnicę i numer toru przesuwa się wzdłuż toru,
   * a „+” zwrotnicy – na drugą stronę toru, gdy nachodzą na inny symbol lub napis (np. tarczę manewrową obok
   * wykolejnicy przy symbolach 150 %). Geometria z rysunku (getBBox), więc tylko w przeglądarce.
   */
  #declutter() {
    const hit = (a, b) => a && b && Math.min(a.r, b.r) - Math.max(a.l, b.l) > 1 && Math.min(a.b, b.b) - Math.max(a.t, b.t) > 1;
    const movable = (s) => s.g.classList.contains('derailer') || s.g.classList.contains('trk-no');
    for (const s of this.symbols) if (s.off) { s.off = 0; this.#place(s); }
    for (const s of this.symbols) if (s.plus) { s.plus.setAttribute('x', s.plusXY[0]); s.plus.setAttribute('y', s.plusXY[1]); }
    const placed = this.symbols.filter((s) => !movable(s)).map((s) => ({ s, box: this.#box(s) }));
    for (const s of this.symbols.filter(movable)) {
      for (const off of [0, 6, -6, 12, -12, 18, -18, 24, -24, 32, -32]) {
        s.off = off; this.#place(s);
        const box = this.#box(s);
        if (!placed.some((p) => p.s !== s && hit(box, p.box))) break;
      }
      placed.push({ s, box: this.#box(s) });
    }
    // „+” zwrotnicy: to samo miejsce, dalej od toru, bliżej albo dalej od środka, na koniec po drugiej stronie toru
    const spots = ([x, y]) => [1, -1].flatMap((side) => [1, 1.4].flatMap((k) => [1, 0.55, 1.35].map((f) => [x * f, side * y * k])));
    for (const s of this.symbols.filter((x) => x.plus)) {
      for (const [px, py] of spots(s.plusXY)) {
        s.plus.setAttribute('x', px); s.plus.setAttribute('y', py);
        const box = this.#box(s, s.plus);
        if (!placed.some((p) => p.s !== s && hit(box, p.box))) break;
      }
    }
  }

  /* ---------------- geometria ---------------- */
  #pt(tile, port) { const [px, py] = PORT_XY[port]; return [(tile.x - this.x0) * CELL + px, (tile.y * CELL + py) * this.ry]; }
  #ctr(tile) { return [(tile.x - this.x0) * CELL + C, (tile.y * CELL + C) * this.ry]; }
  /** Grupa symbolu we współrzędnych lokalnych (0,0 = środek), skalowana ustawieniem. */
  #sym(cx, cy, cls, children = [], sx = 0) {
    const g = el('g', { class: cls, transform: `translate(${cx + sx * this.S},${cy}) scale(${this.S})` }, children);
    this.symbols.push({ g, cx, cy, sx });
    return g;
  }
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
  exitAt(tile) {
    return Object.entries(this.station.exits || {}).find(([, e]) => e.tile.x === tile.x && e.tile.y === tile.y);
  }
  /** Segment toru: linia zewnętrzna + wewnętrzna (dla podwójnej linii toru zamkniętego). */
  #segment(d) {
    return el('g', { class: 'seg free' }, [el('path', { class: 'trk', d }), el('path', { class: 'trk-inner', d })]);
  }

  /* ---------------- budowa obrazu ---------------- */
  /** Perony (Ie-104: grupa G2 – infrastruktura niesterowana): szare prostokąty wzdłuż torów peronowych.
   *  Dwa tory peronowe dwa rzędy od siebie = peron wyspowy między nimi; pojedynczy tor – peron po wolnej stronie. */
  #platforms() {
    for (const p of platformSpans(this.station, [this.x0, this.x1], ScreenBase.labelText)) {
      const h = CELL * this.ry * p.hCells;
      const y = (p.yRow * CELL + C) * this.ry;
      const rx = (p.x0 - this.x0) * CELL + 3, ry = y - h / 2, rw = (p.x1 - p.x0 + 1) * CELL - 6;
      this.layerTracks.appendChild(el('rect', { class: `platform ${p.kind}`, x: rx, y: ry, width: rw, height: h, rx: 2 }));
      // krawędź peronowa od strony toru peronowego: podwójna kreska
      for (const [x1, y1, x2, y2] of platformEdgeLines(rx, ry, rw, h, p.edges, 2.5)) this.layerTracks.appendChild(el('line', { class: 'platform-edge', x1, y1, x2, y2 }));
      this.layerTracks.appendChild(text((p.labelX + 0.5 - this.x0) * CELL, y, p.name, { class: 'scr-text platform-label', 'dominant-baseline': 'central' }));
    }
  }


  /**
   * Numery torów rysowane NA linii toru w małej ramce (jak na stanowiskach komputerowych) – jedna ramka na numer
   * toru, w środku najdłuższego odcinka z tym numerem. Dzięki temu napis peronu na prostokącie nie myli się z torem.
   */
  #trackNumbers() {
    const byTrack = new Map();
    for (const [sid, sec] of Object.entries(this.station.sections || {})) {
      if (!sec.track) continue;
      const tiles = this.station.tiles.filter((t) => t.section === sid && t.type === 'track' && t.x >= this.x0 && t.x <= this.x1 && !t.derailer);
      const ys = [...new Set(tiles.map((t) => t.y))];
      if (ys.length !== 1) continue; // odcinek ukośny / łuk – bez numeru
      const cur = byTrack.get(String(sec.track));
      if (!cur || tiles.length > cur.tiles.length) byTrack.set(String(sec.track), { sid, tiles, y: ys[0] });
    }
    for (const [nr, { tiles, y }] of byTrack) {
      const xs = tiles.map((t) => t.x);
      const xmin = Math.min(...xs), xmax = Math.max(...xs);
      // geometryczny środek odcinka; gdy stoi tam sygnalizator (symbol na linii) – przesunięcie o kostkę w bok
      const sigX = this.station.tiles.filter((t) => t.type === 'signal' && t.at.y === y).map((t) => t.at.x + (t.dir === 'E' ? 1 : 0));
      let mid = (xmin + xmax + 1) / 2;
      for (let d = 1; d < 6 && sigX.some((x) => Math.abs(x - mid) < 1.2); d++) mid += d % 2 ? d : -d;
      const cx = (mid - this.x0) * CELL, cy = (y * CELL + C) * this.ry;
      // numer toru: sama liczba, ciemnoszara, w linii toru (Ie-104.1 §8 pkt 30) – tło przerywa linię pod cyframi
      const label = String(nr);
      const w = 4.3 * label.length + 4;
      const g = this.#sym(cx, cy, 'scr-el trk-no', [
        el('rect', { class: 'trk-no-box', x: -w / 2, y: -4, width: w, height: 8 }),
        text(0, 0, label, { class: 'scr-text trk-no-text', 'dominant-baseline': 'central' }),
      ]);
      this.layerMarks.appendChild(g);
    }
  }

  /**
   * Liczniki poleceń specjalnych (dPz, Sz) – na polach przycisków grupowych układu stanowiska. Widok bez takich liczników
   * na planie (MOR-1: jeden licznik poleceń specjalnych w oknie) ustawia `static PLAN_COUNTERS = false`.
   */
  #counterBoxes() {
    if (this.constructor.PLAN_COUNTERS === false) return;
    for (const c of deskControls(this.station)) {
      if (!c.counter || !this.inWindow(c.x)) continue;
      const g = el('g', { class: 'scr-counter' }, [
        el('rect', { x: 2, y: 8, width: CELL - 4, height: 22, rx: 2 }),
        text(C, 15, c.label, { class: 'scr-text small' }),
        text(C, 25, '00000', { class: 'scr-text counter' }),
      ]);
      g.setAttribute('transform', `translate(${(c.x - this.x0) * CELL},${c.y * CELL * this.ry})`);
      this.layerMarks.appendChild(g);
      this.counterRefs.set(c.id, g.querySelector('.counter'));
    }
  }

  #build() {
    this.#platforms();
    this.#trackNumbers();
    this.#counterBoxes();
    const addSec = (sid, e) => { if (!this.sectionRefs.has(sid)) this.sectionRefs.set(sid, []); this.sectionRefs.get(sid).push(e); };
    for (const tile of this.station.tiles) {
      if (tile.x < this.x0 || tile.x > this.x1) continue;
      const [cx, cy] = this.#ctr(tile);
      switch (tile.type) {
        case 'track': {
          const [a, b] = tile.ports;
          const s = this.#segment(`${this.#leg(tile, a)} ${this.#leg(tile, b)}`);
          s._tile = tile;
          this.layerTracks.appendChild(s); addSec(tile.section, s);
          if (tile.derailer) {
            // wykolejnica jako pole Z (Ie-104.1 §8 pkt 12): kształt – położenie (nałożona: kreska przez tor, zdjęta:
            // kreska obok toru), „+” przy położeniu zasadniczym (nałożona); barwa – stan (ciemnoszara, różowa – zamknięta)
            const g = this.#sym(cx, cy, 'scr-el derailer', [
              this.#frame(0, 0, 18, 18),
              el('path', { class: 'wk-z', d: '' }),
              text(6, -5, '+', { class: 'scr-text wk-plus' }),
              text(0, 14, tile.derailer, { class: 'scr-text small' }),
              this.#hit({ kind: 'derailer', id: tile.derailer }, 0, 0),
            ]);
            this.layerMarks.appendChild(g);
            this.derailerRefs.set(tile.derailer, { mark: g.querySelector('.wk-z'), g });
            this.controlEls.set(refKey({ kind: 'derailer', id: tile.derailer }), g);
          }
          if (tile.endButton) this.#exitMark(tile);
          break;
        }
        case 'buffer': {
          const s = this.#segment(this.#leg(tile, tile.port, 0, 1));
          this.layerTracks.append(s); addSec(tile.section, s);
          // kozioł: symbol w kształcie T z zagiętymi końcami (Ie-104.1 §8 pkt 32 lit. d); gdy kozioł jest końcem
          // przebiegu – zamiast niego symbol końca przebiegu (#exitMark)
          if (tile.endButton) { this.#exitMark(tile); break; }
          const [px, py] = this.#pt(tile, tile.port);
          const ux = (px - cx) / C, uy = (py - cy) / C / this.ry; // jednostkowo w stronę toru
          const nx = -uy, ny = ux, h = 0.35 * C, k = 0.18 * C;
          const P = (x, y) => `${cx + x},${cy + y * this.ry}`;
          const bar = el('path', { class: 'buffer-bar', d: `M${P(nx * h + ux * k, ny * h + uy * k)} L${P(nx * h, ny * h)} L${P(-nx * h, -ny * h)} L${P(-nx * h + ux * k, -ny * h + uy * k)}` });
          this.layerTracks.append(bar);
          break;
        }
        case 'point': {
          // ramiona a (ostrze/toe), b (zasadnicze) i c (zwrotne) – wg Ie-104; pole Z w środku
          const toe = this.#segment(this.#leg(tile, tile.toe, 0.3, 1));
          const straight = this.#segment(this.#leg(tile, tile.straight, 0.3, 1));
          const diverge = this.#segment(this.#leg(tile, tile.diverge, 0.3, 1));
          const zField = el('path', { class: 'z-field', d: '' });
          this.layerTracks.append(diverge, straight, toe, zField);
          const [, dy] = PORT_XY[tile.diverge];
          const below = dy > C;
          const lbl = text(0, below ? -9 : 12, tile.label || tile.id, { class: 'scr-text pt-label' });
          // „+” przy ramieniu zasadniczym
          const [sx, sy] = PORT_XY[tile.straight];
          const plus = text((sx - C) * 0.62, (sy - C) * 0.62 * this.ry + (below ? -7 : 8), '+', { class: 'scr-text pt-plus' });
          const g = this.#sym(cx, cy, 'scr-el point', [this.#frame(0, 0, 24, 24), lbl, plus, this.#hit({ kind: 'point', id: tile.id }, 0, 0, 10)]);
          Object.assign(this.symbols.at(-1), { plus, plusXY: [Number(plus.getAttribute('x')), Number(plus.getAttribute('y'))] });
          this.layerMarks.appendChild(g);
          this.pointRefs.set(tile.id, { toe, straight, diverge, zField, lbl, plus, g, tile });
          this.controlEls.set(refKey({ kind: 'point', id: tile.id }), g);
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
        case 'label': {
          const span = tile.span || 1;
          const txt = ScreenBase.labelText(tile.text);
          // opis dla pulpitu kostkowego („Wk1” przy wykolejnicy) – na monitorze element ma własny podpis
          if (!txt || this.ilk.derailers.has(txt) || this.topo.signals.has(txt)) break;
          const t = text((tile.x - this.x0) * CELL + span * CELL / 2, cy, txt, { class: `scr-label${tile.size >= 11 ? ' title' : ''}`, 'font-size': Math.max(7, (tile.size || 8) * 0.95) });
          this.layerMarks.appendChild(t);
          break;
        }
        default: break;
      }
    }
  }

  /**
   * Wyjazd na szlak (sąsiedni posterunek na krańcu) / koniec toru – element końca przebiegu.
   * Na wyjeździe rysowany jest też stan blokady liniowej: strzałka szlaku (czerwona – odstęp zajęty), nad torem strzałki
   * kierunkowe (obraz A / B / C, Ie-104.1 §8 pkt 20–22 – `blockSymbol.js`) i przy Eap symbol Ko/dKo. Polecenia blokady
   * są w menu tego elementu; liczniki dPo/dKo – w zakładce Stan.
   */
  #exitMark(tile) {
    const [cx, cy] = this.#ctr(tile);
    const ex = this.exitAt(tile);
    const ref = { kind: 'end', id: tile.endButton.id };
    const kids = [this.#frame(0, 0, 22, 22)];
    const refs = {};
    if (ex) {
      const dir = ex[1].dir === 'E' ? 1 : -1;
      const x = dir * 4;
      refs.exitArrow = el('path', { class: 'exit-arrow', d: `M${x - dir * 8},-7 L${x + dir * 6},0 L${x - dir * 8},7 Z` });
      // strzałki kierunkowe nad torem: widoczny jeden obraz – A (neutralny / usterka), B (PRZYJAZD) albo C (WYJAZD)
      const shape = blockSymbolShapes(dir);
      const seg = (d, name) => el('path', { class: 'blk-seg', d, 'data-seg': name });
      refs.pics = {
        A: el('g', { class: 'blk-pic', 'data-pic': 'A' }, shape.A.map((d, i) => seg(d, ['line', 'box', 'station'][i]))),
        B: el('g', { class: 'blk-pic', 'data-pic': 'B' }, [seg(shape.B.b, 'b'), seg(shape.B.a, 'a')]),
        C: el('g', { class: 'blk-pic', 'data-pic': 'C' }, [seg(shape.C.b, 'b'), seg(shape.C.a, 'a')]),
      };
      refs.dir = el('g', { class: 'blk-dir' }, Object.values(refs.pics));
      kids.push(refs.exitArrow, refs.dir);
      if (hasKoSymbol(this.sim.blocks.get(ex[0]) || {})) kids.push(refs.ko = el('rect', { class: 'blk-ko', ...shape.ko }));
      // opis szlaku wyrównany do wnętrza pulpitu (kostka wyjazdu leży na krawędzi – tekst wyśrodkowany byłby przycięty)
      kids.push(text(-dir * 9, 15, tile.text || ex[0], { class: 'scr-text small', 'text-anchor': dir > 0 ? 'end' : 'start' }));
    } else if (tile.endButton.color === 'white') {
      // koniec przebiegu manewrowego – półkole (Ie-104.1 §8 pkt 7), wypukłością od toru
      const d = tile.type === 'buffer' && tile.port === 'E' ? -1 : 1;
      kids.push(el('path', { class: 'end-mark', d: `M0,-4 A4,4 0 0 ${d > 0 ? 1 : 0} 0,4 Z` }));
    } else {
      // koniec przebiegu pociągowego – pusty prostokąt (Ie-104.1 §8 pkt 7)
      kids.push(el('rect', { class: 'end-mark', x: -3, y: -4, width: 6, height: 8 }));
    }
    kids.push(this.#hit(ref, 0, 0, 10));
    const g = this.#sym(cx, cy, `scr-el end${ex ? ' exit' : ''}`, kids);
    this.layerMarks.appendChild(g);
    this.controlEls.set(refKey(ref), g);
    if (ex) {
      refs.g = g;
      this.blockRefs.set(ex[0], refs);
      for (const btn of ['Wbl', 'Poz', 'Ko', 'dPo', 'dKo', 'Zk']) this.controlEls.set(refKey({ kind: 'block', exit: ex[0], btn }), g);
    }
  }

  /**
   * Semafor / tarcza manewrowa rysowane NA linii toru, w miejscu, gdzie sygnalizator stoi (krawędź kostki `at`
   * w kierunku `dir`) – jak na stanowiskach komputerowych (i w SimRail): nie ma wątpliwości, którego toru dotyczy.
   * Symbol: podwójny grot (semafor) lub pojedynczy (tarcza) skierowany w kierunku jazdy, bez masztu (uproszczenie
   * dla czytelności); nazwa sygnalizatora po prawej stronie toru w kierunku jazdy (E – pod torem, W – nad torem).
   */
  /** Punkt zaczepienia symbolu sygnalizatora na linii toru (krawędź kostki `at` w kierunku jazdy). */
  #signalAnchor(tile) {
    const at = this.topo.trackAt(tile.at.x, tile.at.y);
    return at ? this.#pt(at, tile.dir) : this.#ctr(tile);
  }

  #signal(tile) {
    let [cx, cy] = this.#signalAnchor(tile);
    const dir = tile.dir === 'E' ? 1 : -1;
    // dwa sygnalizatory w tym samym punkcie (np. semafor A na kostce 5 w kierunku E i tarcza Tm1 na kostce 6
    // w kierunku W – oba na wspólnej krawędzi): każdy cofa się o kawałek na swoją kostkę, żeby oba były widoczne i klikalne
    const twin = this.station.tiles.some((t) => t.type === 'signal' && t !== tile && t.at && this.#signalAnchor(t).every((v, i) => Math.abs(v - [cx, cy][i]) < 0.5));
    // rozsunięcie w jednostkach symbolu (rośnie ze skalą): tło jednego (15) nie zasłania trójkąta drugiego (13)
    const sx = twin ? -dir * 14 : 0;
    const side = dir; // prawa strona toru w kierunku jazdy: E → pod torem (+y), W → nad torem (−y)
    // Ie-104.1 §8 pkt 4 ust. 1: a) pełny trójkąt – semafor bez sygnalizacji manewrowej, b) pełny trójkąt z otwartym
    // grotem – semafor z sygnalizacją manewrową, c) otwarty grot – tarcza manewrowa, f) wjazdowy będący końcem przebiegu
    // wyjazdowego – z małym trójkątem skierowanym przeciwnie
    const tri = (x) => `M${x - dir * 4},-4 L${x + dir * 2},0 L${x - dir * 4},4 Z`;
    const open = (x) => `M${x - dir * 4},-4 L${x + dir * 2},0 L${x - dir * 4},4`;
    const body = el('g', { class: 'sig-body' });
    if (tile.kind === 'tm') body.appendChild(el('path', { class: 'open', d: open(dir * 1) }));
    else if (tile.shunting) body.append(el('path', { d: tri(-dir * 3) }), el('path', { class: 'open', d: open(dir * 4) }));
    else body.appendChild(el('path', { d: tri(dir * 1) }));
    const exitEnd = !!tile.entry && [...this.ilk.routes.values()].some((r) => r.kind === 'train' && r.end.type === 'signal' && r.end.id === tile.id);
    const kids = [
      el('rect', { class: 'sig-back', x: dir > 0 ? -9 : -15, y: -5, width: 24, height: 10 }),
      this.#frame(0, 0, 28, 18),
      body,
    ];
    if (exitEnd) kids.push(el('path', { class: 'sig-end', d: `M${dir * 13},-3 L${dir * 9},0 L${dir * 13},3 Z` }));
    // tarcza: sam numer, turkusowy (Ie-104.1 §4 ust. 14, §8 pkt 4 ust. 3); semafor – nazwa
    const name = tile.kind === 'tm' ? tile.id.replace(/^Tm/i, '') : tile.id;
    kids.push(text(-dir * 2, side > 0 ? 18 : -12, name, { class: `scr-text sig-label${tile.kind === 'tm' ? ' tm' : ''}` }),
      this.#hit({ kind: 'signal', id: tile.id }, 0, 0, 10));
    const g = this.#sym(cx, cy, `scr-el signal ${tile.kind}`, kids, sx);
    (this.sigAnchors ??= []).push({ cx, cy, sx }); // symbol na linii toru – numer pociągu go nie przykrywa (#trackSpan)
    g.setAttribute('data-signal', tile.id); // opis tarczy to sam numer – identyfikator sygnalizatora w atrybucie
    this.layerSignals.appendChild(g);
    this.signalRefs.set(tile.id, { body, label: kids.find((k) => k.classList?.contains('sig-label')), g, tile });
    this.controlEls.set(refKey({ kind: 'signal', id: tile.id, color: 'green' }), g);
    this.controlEls.set(refKey({ kind: 'signal', id: tile.id, color: 'white' }), g);
  }

  /** Pociągi toru szlakowego `exit` w kolejności: na szlaku (`on: true`), potem zgłoszone u sąsiada i czekające. */
  lineTrains(exit) {
    const b = this.sim.blocks.get(exit);
    if (!b) return [];
    const tt = this.sim.traffic.timetable();
    const out = [];
    if (b.lineTrain != null) {
      const e = tt.find((x) => String(x.nr) === String(b.lineTrain));
      out.push({ nr: String(b.lineTrain), on: true, title: `${e ? `${e.label} ${relationOf(e)}` : `pociąg nr ${b.lineTrain}`} – na szlaku, ${b.poBlocked ? `od nas do ${b.neighbour}` : `od ${b.neighbour} do nas`}` });
    }
    for (const e of tt.filter((x) => x.from === exit && x.requested && !x.dispatched)) out.push({ nr: String(e.nr), on: false, title: `${e.label} ${relationOf(e)} – zgłoszony przez ${b.neighbour}, czeka na wyprawienie` });
    return out;
  }

  /* ---------------- aktualizacja stanu ---------------- */
  /** Stan odcinka wg tab. 8 Ie-104. */
  #sectionClass(sec) {
    if (!sec) return 'free';
    if (sec.occupied && sec.resetPending) return 'occ-reset'; // ciemnoczerwony – zajęty, po zerowaniu licznika osi
    if (sec.occupied) return 'occ';
    if (sec.route) {
      const act = this.ilk.active.get(sec.route);
      if (act?.timedRelease) return 'timed';
      return act?.route.kind === 'shunt' ? 'rt-shunt' : 'rt-train';
    }
    return 'free';
  }

  updateSection(id) {
    const sec = this.ilk.sections.get(id);
    const cls = this.#sectionClass(sec);
    // zamknięcie toru to kształt (podwójna linia), barwa pokazuje stan – zajęty tor zamknięty: podwójna czerwona
    // (Ie-104.1 §8 pkt 1)
    const closed = sec?.closed ? ' closed' : '';
    // łącznica, w którą zwrotnica nie jest ustawiona, nie pokazuje zajętości ani przebiegu (Topology.branchGates)
    const gated = cls.startsWith('occ') || cls === 'timed' || cls.startsWith('rt-');
    for (const e of this.sectionRefs.get(id) || []) setSeg(e, (gated && e._tile && !this.ilk.onSetBranch(e._tile) ? 'free' : cls) + closed);
    for (const p of this.ilk.points.values()) if (p.section === id) this.updatePoint(p.id);
    for (const d of this.ilk.derailers.values()) if (d.section === id) this.updateDerailer(d.id);
  }

  updatePoint(id) {
    const p = this.ilk.points.get(id);
    const r = this.pointRefs.get(id);
    if (!p || !r) return;
    const [cx, cy] = this.#ctr(r.tile);
    // ramiona w barwie odcinka; róż zamknięcia indywidualnego tylko w polu Z (Ie-104.1 §8 pkt 9)
    const cls = this.#sectionClass(this.ilk.sections.get(p.section));
    const zcls = p.individualLock && cls === 'free' ? 'locked' : cls;
    const leg = (port) => { const [px, py] = this.#pt(r.tile, port); return [cx + (px - cx) * 0.3, cy + (py - cy) * 0.3]; };
    const [tx, ty] = leg(r.tile.toe);
    if (p.moving) {
      // w czasie przestawiania pole Z puste
      setSeg(r.toe, cls); setSeg(r.straight, 'dim'); setSeg(r.diverge, 'dim');
      r.zField.setAttribute('d', '');
      r.zField.setAttribute('class', 'z-field');
      r.g.classList.remove('alarm', 'trailed');
    } else if (!p.control) {
      // brak kontroli: pole Z białe migające, rozprucie – czerwone migające
      setSeg(r.toe, cls); setSeg(r.straight, 'dim'); setSeg(r.diverge, 'dim');
      r.zField.setAttribute('d', `M${tx},${ty} L${cx},${cy}`);
      r.zField.setAttribute('class', `z-field ${p.trailed ? 'trailed' : 'nocontrol'}`);
      r.g.classList.add('alarm'); // ramka alarmowa
      r.g.classList.toggle('trailed', !!p.trailed);
    } else {
      const [ax, ay] = leg(p.position === '+' ? r.tile.straight : r.tile.diverge);
      setSeg(r.toe, cls);
      setSeg(r.straight, p.position === '+' ? cls : 'dim');
      setSeg(r.diverge, p.position === '-' ? cls : 'dim');
      r.zField.setAttribute('d', `M${tx},${ty} L${cx},${cy} L${ax},${ay}`);
      r.zField.setAttribute('class', `z-field ${zcls}`);
      r.g.classList.remove('alarm', 'trailed');
    }
    r.lbl.classList.toggle('locked', !!p.individualLock);
  }

  updateDerailer(id) {
    const d = this.ilk.derailers.get(id);
    const r = this.derailerRefs.get(id);
    if (!d || !r) return;
    // pole Z wykolejnicy: nałożona – kreska przez tor, zdjęta – kreska obok toru; w czasie przestawiania puste
    r.mark.setAttribute('d', d.moving ? '' : d.position === 'on' ? 'M0,-5 L0,5' : 'M-4,-6 L4,-6');
    r.mark.setAttribute('class', `wk-z${d.individualLock ? ' locked' : ''}`);
    r.g.classList.toggle('locked', !!d.individualLock);
  }

  /** Stan sygnalizatora wg listy Ie-104 (malejący priorytet): Sz biały migający, różowy – zamknięty (stopowany),
   *  zielony/żółty zezwalający, czerwony – początek lub koniec utwierdzonego przebiegu, szary – stan podstawowy. */
  updateSignal(id) {
    const s = this.ilk.signals.get(id);
    const r = this.signalRefs.get(id);
    if (!s || !r) return;
    const a = s.aspect;
    let st = 'base';
    const isEnd = [...this.ilk.active.values()].some((act) => act.route.end.type === 'signal' && act.route.end.id === id);
    const stopped = !!(s.stopped || this.ilk.allStop);
    const act = s.route && this.ilk.active.get(s.route);
    if (a === 'Sz') st = 'sz';
    else if (a === 'Ms2') st = 'shunt';
    else if (a && a !== 'S1' && a !== 'Ms1') st = 'train';
    // EBIScreen: sygnalizator w trakcie zwalniania czasowego – fioletowy (bsk.isdr.pl/srk_ebilock.php)
    else if (act?.timedRelease && this.constructor.TIMED_SIGNAL) st = 'timed';
    // czerwony (początek / koniec utwierdzonego przebiegu) ma pierwszeństwo przed różowym (zastopowany)
    else if (s.route != null || isEnd) st = 'locked';
    else if (stopped) st = 'stopped';
    r.body.setAttribute('class', `sig-body st-${st}`);
    // zastopowany – różowy opis (także gdy symbol jest czerwony, Ie-104.1 §8 pkt 4 ust. 3)
    r.label?.classList.toggle('stopped', stopped);
  }

  updateBlock(exitId) {
    const b = this.sim.blocks.get(exitId);
    const r = this.blockRefs.get(exitId);
    if (!b || !r) return;
    r.g.classList.toggle('blk-occ', !!(b.occupied || b.poBlocked));
    // strzałki kierunkowe i Ko/dKo wg Ie-104.1 (barwy segmentów – `blockSymbol.js`); miganie: wspólna faza obrazu (`data-ph`)
    const s = blockSymbol(b);
    r.dir.setAttribute('data-pic', s.pic);
    for (const [pic, g] of Object.entries(r.pics)) {
      const on = pic === s.pic;
      g.setAttribute('display', on ? 'inline' : 'none');
      for (const p of g.children) p.setAttribute('class', on ? `blk-seg s-${p.dataset.seg === 'b' ? s.b : s.a}` : 'blk-seg');
    }
    r.ko?.setAttribute('class', `blk-ko s-${koSymbol(b)}`);
  }

  /** G4: element wybrany do polecenia – niebieska ramka (migająca podczas nastawiania przebiegu). */
  updateArmed(a) {
    for (const e of this.controlEls.values()) e.classList.remove('selected');
    if (!a || a.kind === 'group') return;
    this.controlEls.get(refKey(a))?.classList.add('selected');
  }


  createTrainLabel(tr) {
    const nr = text(0, 0, String(tr.nr), { class: 'scr-train-nr' });
    const inside = el('g', { class: 'scr-train-in', transform: `scale(${this.S})` }, [el('rect', { x: -17, y: -7, width: 34, height: 13, rx: 1 }), nr]);
    return { label: el('g', { class: 'scr-train' }, [inside]), text: nr };
  }

  placeTrainLabel(label, headTile) {
    // numer pociągu w osi toru (Ie-104.1 §8 pkt 29), przy czole, ale w całości na odcinku toru – nie na sygnalizatorze
    // za jego końcem („Wyświetlacz numeru pociągu” pkt 2, 5a; `trainLabel.js`)
    const cx = trainLabelX((headTile.x - this.x0) * CELL + C, this.#trackSpan(headTile), 17 * this.S);
    label.setAttribute('transform', `translate(${cx},${(headTile.y * CELL + C) * this.ry})`);
  }

  /**
   * Zakres na planie (jednostki rysunku) prostego odcinka toru stacyjnego pod kostką czoła, bez symboli sygnalizatorów
   * na jego końcach (trójkąt sięga do 7 jednostek symbolu w głąb toru); inny odcinek – null.
   */
  #trackSpan(tile) {
    if (!tile.section || !this.station.sections?.[tile.section]?.track) return null;
    const key = `${tile.section}:${tile.y}:${tile.x}:${this.x0}:${this.x1}:${this.S}`;
    if (this.spanCache?.has(key)) return this.spanCache.get(key);
    const on = new Set(this.station.tiles.filter((t) => t.section === tile.section && t.type === 'track' && t.y === tile.y && !t.derailer).map((t) => t.x));
    let a = tile.x, b = tile.x;
    while (on.has(a - 1) && a - 1 >= this.x0) a--;
    while (on.has(b + 1) && b + 1 <= this.x1) b++;
    let span = null;
    if (on.has(tile.x)) {
      let [x0, x1] = [(a - this.x0) * CELL, (b + 1 - this.x0) * CELL];
      const y = (tile.y * CELL + C) * this.ry, reach = 7 * this.S;
      for (const s of this.sigAnchors || []) {
        if (Math.abs(s.cy - y) > 1) continue;
        const sx = s.cx + s.sx * this.S;
        if (sx + reach > x0 && sx - reach < x0 + CELL) x0 = Math.max(x0, sx + reach);
        if (sx - reach < x1 && sx + reach > x1 - CELL) x1 = Math.min(x1, sx - reach);
      }
      span = [x0, x1];
    }
    (this.spanCache ??= new Map()).set(key, span);
    return span;
  }
}

function setSeg(e, cls) {
  e.setAttribute('class', `seg ${cls}`);
}
