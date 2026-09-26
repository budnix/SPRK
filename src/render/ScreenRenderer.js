import { el, text, CELL } from './svg.js';
import { PORT_XY } from '../tiles/directions.js';
import { refKey } from './DeskRenderer.js';
import { tip } from '../data/glossary.js';

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
    this.ry = Number(opts.rowScale) || 1;      // ściśnięcie rzędów (0,7 = symbole bliżej toru)
    this.S = Number(opts.symScale) || 1;       // skala symboli i napisów (1–1,5)
    this.symbols = [];                          // grupy symboli do przeskalowania na żywo
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

    const W = this.cols * CELL + 2 * PAD, H = this.rows * CELL * this.ry + 2 * PAD;
    this.svg = el('svg', { class: `screen${this.readonly ? ' readonly' : ''}`, viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'xMidYMid meet' });
    this.svg.style.setProperty('--sym', String(this.S));
    this.svg.style.setProperty('--symb', String(Math.min(this.S, 1.15)));
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
    if (!this.readonly) this.#buildCmdBar(opts.cmdHost || container);

    this.#build();
    this.#bind();
    this.refreshAll();
  }

  /** Element graficzny odpowiadający przyciskowi/elementowi (do podświetlania w samouczku). */
  elementFor(ref) {
    if (ref.kind === 'blockpanel') return this.hitEls.get(refKey({ kind: 'block', exit: ref.exit, btn: 'Wbl' })) || null;
    return this.hitEls.get(refKey(ref)) || (ref.kind === 'signal' ? this.hitEls.get(refKey({ ...ref, color: 'green' })) || this.hitEls.get(refKey({ ...ref, color: 'white' })) : null) || null;
  }

  /** Przycisk paska poleceń (np. 'train') – do wskazywania w samouczku. */
  cmdButton(id) { return this.cmdButtons?.get(id) || null; }

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

  /** Widoczny wycinek kolumn (ekran monitora) – zmiana viewBox, bez przebudowy grafiki. */
  setView(x0, x1) {
    const H = this.rows * CELL * this.ry + 2 * PAD;
    this.svg.setAttribute('viewBox', `${(x0 - this.x0) * CELL} 0 ${(x1 - x0 + 1) * CELL + 2 * PAD} ${H}`);
  }
  resetView() { this.setView(this.x0, this.x1); }

  /** Skala symboli i napisów na żywo (ustawienie „wielkość symboli”). */
  setSymbolScale(S) {
    this.S = Number(S) || 1;
    this.svg.style.setProperty('--sym', String(this.S));
    this.svg.style.setProperty('--symb', String(Math.min(this.S, 1.15)));
    for (const { g, cx, cy } of this.symbols) g.setAttribute('transform', `translate(${cx},${cy}) scale(${this.S})`);
  }

  /* ---------------- geometria ---------------- */
  #pt(tile, port) { const [px, py] = PORT_XY[port]; return [(tile.x - this.x0) * CELL + px, (tile.y * CELL + py) * this.ry]; }
  #ctr(tile) { return [(tile.x - this.x0) * CELL + C, (tile.y * CELL + C) * this.ry]; }
  /** Grupa symbolu we współrzędnych lokalnych (0,0 = środek), skalowana ustawieniem. */
  #sym(cx, cy, cls, children = []) {
    const g = el('g', { class: cls, transform: `translate(${cx},${cy}) scale(${this.S})` }, children);
    this.symbols.push({ g, cx, cy });
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
  #exitAt(tile) {
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
    const spans = [];
    for (const [sid, sec] of Object.entries(this.station.sections || {})) {
      if (!sec.platform) continue;
      const tiles = this.station.tiles.filter((t) => t.section === sid && t.type === 'track' && t.x >= this.x0 && t.x <= this.x1);
      if (!tiles.length) continue;
      const ys = [...new Set(tiles.map((t) => t.y))];
      if (ys.length !== 1) continue;
      spans.push({ sid, y: ys[0], x0: Math.min(...tiles.map((t) => t.x)), x1: Math.max(...tiles.map((t) => t.x)), done: false });
    }
    const TRACKY = new Set(['track', 'point', 'buffer', 'crossing', 'block', 'button']);
    const rowBusy = (y, x0, x1) => this.station.tiles.some((t) => t.y === y && t.x >= x0 && t.x <= x1 && TRACKY.has(t.type));
    /** Zakres kolumn peronu po odcięciu semaforów stojących w tym rzędzie (symbole na końcach toru). */
    const clip = (y, x0, x1) => {
      const mid = (x0 + x1) / 2;
      const sig = this.station.tiles.filter((t) => t.type === 'signal' && t.y === y && t.x >= x0 && t.x <= x1);
      const left = sig.filter((t) => t.x < mid).map((t) => t.x), right = sig.filter((t) => t.x >= mid).map((t) => t.x);
      return [left.length ? Math.max(x0, Math.max(...left) + 1) : x0, right.length ? Math.min(x1, Math.min(...right) - 1) : x1];
    };
    /** Nazwa peronu z pola `platform` odcinka: napis („Peron II”), liczba (2 → „Peron II”) lub true („Peron”). */
    const nameOf = (...spans) => {
      const vals = spans.map((sp) => this.station.sections[sp.sid].platform);
      const v = vals.find((x) => typeof x === 'string') ?? vals.find((x) => typeof x === 'number');
      return typeof v === 'string' ? v : typeof v === 'number' ? `Peron ${['I','II','III','IV','V','VI','VII','VIII'][v - 1] || v}` : 'Peron';
    };
    const rect = (x0, x1, yRow, cls, hCells = 0.42, label = 'Peron') => {
      if (x1 - x0 < 2) return;
      const h = CELL * this.ry * hCells;
      const y = (yRow * CELL + C) * this.ry;
      const r = el('rect', { class: `platform ${cls}`, x: (x0 - this.x0) * CELL + 3, y: y - h / 2, width: (x1 - x0 + 1) * CELL - 6, height: h, rx: 2 });
      this.layerTracks.appendChild(r);
      // napis peronu: na środku, a gdy tam leży opis toru (kostka label w rzędach peronu) – bliżej końca prostokątu
      const rows = [Math.floor(yRow), Math.ceil(yRow)];
      const labels = this.station.tiles.filter((t) => t.type === 'label' && ScreenRenderer.labelText(t.text) && rows.includes(t.y) && t.x + (t.span || 1) - 1 >= x0 && t.x <= x1);
      const clash = (cx) => labels.some((t) => t.x - 2 <= cx + 2 && t.x + (t.span || 1) + 1 >= cx - 2);
      const mid = (x0 + x1) / 2;
      const cx = [mid, x0 + 2.5, x1 - 2.5].find((c) => !clash(c)) ?? mid;
      this.layerTracks.appendChild(text((cx + 0.5 - this.x0) * CELL, y, label, { class: 'scr-text platform-label', 'dominant-baseline': 'central' }));
    };
    spans.sort((a, b) => a.y - b.y);
    for (const a of spans) {
      if (a.done) continue;
      // peron wyspowy: drugi tor peronowy 2 lub 4 rzędy niżej, rzędy pomiędzy bez torów
      const b = spans.find((o) => !o.done && o !== a && (o.y === a.y + 2 || o.y === a.y + 4) && o.x0 <= a.x1 && o.x1 >= a.x0);
      if (b) {
        const X0 = Math.max(a.x0, b.x0), X1 = Math.min(a.x1, b.x1);
        let free = true;
        for (let y = a.y + 1; y < b.y; y++) if (rowBusy(y, X0, X1)) free = false;
        if (free) {
          let [c0, c1] = [X0, X1];
          for (let y = a.y + 1; y < b.y; y++) { const [q0, q1] = clip(y, X0, X1); c0 = Math.max(c0, q0); c1 = Math.min(c1, q1); }
          rect(c0, c1, (a.y + b.y) / 2, 'island', b.y - a.y === 2 ? 0.42 : 1.1, nameOf(a, b));
          a.done = b.done = true;
          continue;
        }
      }
      const side = !rowBusy(a.y - 1, a.x0, a.x1) ? a.y - 1 : !rowBusy(a.y + 1, a.x0, a.x1) ? a.y + 1 : null;
      if (side != null) { const [c0, c1] = clip(side, a.x0, a.x1); rect(c0, c1, side, 'side', 0.42, nameOf(a)); }
      a.done = true;
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
      const label = `tor ${nr}`;
      const w = 4.3 * label.length + 8;
      const g = this.#sym(cx, cy, 'scr-el trk-no', [
        el('rect', { class: 'trk-no-box', x: -w / 2, y: -5.5, width: w, height: 11, rx: 1.5 }),
        text(0, 0, label, { class: 'scr-text trk-no-text', 'dominant-baseline': 'central' }),
      ]);
      this.layerMarks.appendChild(g);
    }
  }

  #build() {
    this.#platforms();
    this.#trackNumbers();
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
            const g = this.#sym(cx, cy, 'scr-el derailer', [
              this.#frame(0, 0, 18, 18),
              el('path', { class: 'wk-mark', d: 'M-5,6 L0,-4 L5,6 Z' }),
              text(0, 14, tile.derailer, { class: 'scr-text small' }),
              this.#hit({ kind: 'derailer', id: tile.derailer }, 0, 0),
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
          const bar = el('path', { class: 'buffer-bar', d: `M${cx + nx * 0.35},${cy + ny * 0.35 / this.ry} L${cx - nx * 0.35},${cy - ny * 0.35 / this.ry}` });
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
          const lbl = text(0, below ? -9 : 12, tile.label || tile.id, { class: 'scr-text pt-label' });
          // „+” przy ramieniu zasadniczym
          const [sx, sy] = PORT_XY[tile.straight];
          const plus = text((sx - C) * 0.62, (sy - C) * 0.62 * this.ry + (below ? -7 : 8), '+', { class: 'scr-text pt-plus' });
          const g = this.#sym(cx, cy, 'scr-el point', [this.#frame(0, 0, 24, 24), lbl, plus, this.#hit({ kind: 'point', id: tile.id }, 0, 0, 10)]);
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
        case 'block': break; // pole blokady Eap to element pulpitu kostkowego; na monitorze stan blokady jest przy wyjeździe na szlak
        case 'button': {
          if (!tile.counter) break;
          const g = el('g', { class: 'scr-counter' }, [
            el('rect', { x: 2, y: 8, width: CELL - 4, height: 22, rx: 2 }),
            text(C, 15, tile.label, { class: 'scr-text small' }),
            text(C, 25, '00000', { class: 'scr-text counter' }),
          ]);
          g.setAttribute('transform', `translate(${(tile.x - this.x0) * CELL},${tile.y * CELL * this.ry})`);
          this.layerMarks.appendChild(g);
          this.counterRefs.set(tile.id, g.querySelector('.counter'));
          break;
        }
        case 'label': {
          const span = tile.span || 1;
          const txt = ScreenRenderer.labelText(tile.text);
          if (!txt) break;
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
   * Na wyjeździe rysowany jest też stan blokady liniowej, jak na stanowiskach komputerowych (Ie-104): strzałka
   * szlaku (czerwona – odstęp zajęty), strzałka kierunku blokady nad torem (wyjazd / wjazd) i napis stanu
   * („żąd.” – sąsiad żąda pozwolenia, „Wbl” – czekamy na pozwolenie, „Ko” – potwierdzić przyjazd, „tel.” – bez
   * łączności). Polecenia blokady są w menu tego elementu; liczniki dPo/dKo – w zakładce Stan.
   */
  #exitMark(tile) {
    const [cx, cy] = this.#ctr(tile);
    const ex = this.#exitAt(tile);
    const ref = { kind: 'end', id: tile.endButton.id };
    const kids = [this.#frame(0, 0, 22, 22)];
    const refs = {};
    if (ex) {
      const dir = ex[1].dir === 'E' ? 1 : -1;
      const x = dir * 4;
      refs.exitArrow = el('path', { class: 'exit-arrow', d: `M${x - dir * 8},-7 L${x + dir * 6},0 L${x - dir * 8},7 Z` });
      // strzałki kierunku blokady nad torem: „wyjazd” (w stronę sąsiada) i „wjazd” (do nas)
      refs.dirOut = el('path', { class: 'blk-dir off', d: `M${-dir * 8},-13 L${-dir * 8},-9 L${dir * 1},-9 L${dir * 1},-7 L${dir * 6},-11 L${dir * 1},-15 L${dir * 1},-13 Z` });
      refs.dirIn = el('path', { class: 'blk-dir off', d: `M${dir * 6},-13 L${dir * 6},-9 L${-dir * 3},-9 L${-dir * 3},-7 L${-dir * 8},-11 L${-dir * 3},-15 L${-dir * 3},-13 Z` });
      refs.status = text(-dir * 12, -8, '', { class: 'blk-status', 'text-anchor': dir > 0 ? 'end' : 'start' });
      // opis szlaku wyrównany do wnętrza pulpitu (kostka wyjazdu leży na krawędzi – tekst wyśrodkowany byłby przycięty)
      kids.push(refs.exitArrow, refs.dirOut, refs.dirIn, refs.status,
        text(-dir * 9, 15, tile.text || ex[0], { class: 'scr-text small', 'text-anchor': dir > 0 ? 'end' : 'start' }));
    } else {
      kids.push(el('circle', { class: 'end-mark', cx: 0, cy: 0, r: 3 }));
    }
    kids.push(this.#hit(ref, 0, 0, 10));
    const g = this.#sym(cx, cy, `scr-el end${ex ? ' exit' : ''}`, kids);
    this.layerMarks.appendChild(g);
    this.hitEls.set(refKey(ref), g);
    if (ex) {
      refs.g = g;
      this.blockRefs.set(ex[0], refs);
      for (const btn of ['Wbl', 'Poz', 'Ko', 'dPo', 'dKo', 'Zk']) this.hitEls.set(refKey({ kind: 'block', exit: ex[0], btn }), g);
    }
  }

  /**
   * Semafor / tarcza manewrowa rysowane NA linii toru, w miejscu, gdzie sygnalizator stoi (krawędź kostki `at`
   * w kierunku `dir`) – jak na stanowiskach komputerowych (i w SimRail): nie ma wątpliwości, którego toru dotyczy.
   * Symbol: podwójny grot (semafor) lub pojedynczy (tarcza) skierowany w kierunku jazdy, bez masztu (uproszczenie
   * dla czytelności); nazwa sygnalizatora po prawej stronie toru w kierunku jazdy (E – pod torem, W – nad torem).
   */
  #signal(tile) {
    const at = this.topo.trackAt(tile.at.x, tile.at.y);
    const [cx, cy] = at ? this.#pt(at, tile.dir) : this.#ctr(tile);
    const dir = tile.dir === 'E' ? 1 : -1;
    const side = dir; // prawa strona toru w kierunku jazdy: E → pod torem (+y), W → nad torem (−y)
    const chevron = (x) => `M${x - dir * 4},-4 L${x + dir * 2},0 L${x - dir * 4},4 Z`;
    const body = el('g', { class: 'sig-body' });
    if (tile.kind === 'tm') body.appendChild(el('path', { d: chevron(dir * 1) }));
    else body.append(el('path', { d: chevron(-dir * 3) }), el('path', { d: chevron(dir * 4) }));
    const endTri = el('path', { class: 'sig-end', d: `M${dir * 9},-3 L${dir * 13},0 L${dir * 9},3 Z` });
    const g = this.#sym(cx, cy, `scr-el signal ${tile.kind}`, [
      // tło przerywa linię toru pod całym symbolem, także pod trójkątem końca przebiegu (dir*9..13)
      el('rect', { class: 'sig-back', x: dir > 0 ? -9 : -15, y: -5, width: 24, height: 10 }),
      this.#frame(0, 0, 28, 18),
      body, endTri,
      text(-dir * 2, side > 0 ? 18 : -12, tile.id, { class: 'scr-text sig-label' }),
      this.#hit({ kind: 'signal', id: tile.id }, 0, 0, 10),
    ]);
    this.layerSignals.appendChild(g);
    this.signalRefs.set(tile.id, { body, endTri, g, tile });
    this.hitEls.set(refKey({ kind: 'signal', id: tile.id, color: 'green' }), g);
    this.hitEls.set(refKey({ kind: 'signal', id: tile.id, color: 'white' }), g);
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
      b.title = tip({ train: 'przebieg pociągowy', shunt: 'przebieg manewrowy', pz: 'Pz', dpz: 'dPz', zw: 'Zw', zz: 'Zz', sz: 'Sz', stop: 'STOP', ops: 'OPS' }[id]);
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
    if (ref.kind === 'blockpanel') return this.#blockMenu(ref.exit);
    if (ref.kind === 'end') {
      const t = this.topo.endButtons.get(ref.id);
      const ex = t ? this.#exitAt(t) : null;
      if (ex) return this.#blockMenu(ex[0]);
      return { title: 'Koniec toru', items: [{ label: 'Wskaż najpierw sygnalizator początku przebiegu', run: () => ({ ok: false }) }] };
    }
    return null;
  }

  /** Polecenia blokady liniowej szlaku: Eap (Wbl, Poz, Ko), samoczynna (Zk), doraźne dPo / dKo. */
  #blockMenu(exit) {
    const b = this.sim.blocks.get(exit);
    const press = (btn) => () => this.handlers.onPress({ kind: 'block', exit, btn });
    const items = [];
    if (b?.auto) items.push({ label: `Zmiana kierunku blokady samoczynnej (Zk) – teraz ${b.direction === 'out' ? 'wyjazd' : 'wjazd'}`, run: press('Zk') });
    else {
      if (!b?.fixed) items.push({ label: 'Żądanie pozwolenia na wyprawienie (Wbl)', run: press('Wbl') }, { label: 'Pozwolenie dla sąsiada (Poz)', run: press('Poz') });
      items.push({ label: 'Potwierdzenie przyjazdu (Ko)', run: press('Ko') });
    }
    items.push({ label: 'Doraźne zwolnienie bloku początkowego (dPo)', special: true, run: press('dPo') });
    items.push({ label: 'Doraźne zwolnienie bloku końcowego (dKo)', special: true, run: press('dKo') });
    return { title: `Szlak ${b?.def?.label || b?.neighbour || exit} – blokada ${b?.auto ? 'samoczynna' : 'Eap'}`, items };
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
    else if (a && a !== 'S1' && a !== 'Ms1') st = 'train';
    else if (s.route != null || isEnd) st = 'locked';
    r.body.setAttribute('class', `sig-body st-${st}`);
    r.endTri.setAttribute('class', `sig-end${isEnd ? ' on' : ''}`);
  }

  updateBlock(exitId) {
    const b = this.sim.blocks.get(exitId);
    const r = this.blockRefs.get(exitId);
    if (!b || !r) return;
    r.g.classList.toggle('blk-occ', !!(b.occupied || b.poBlocked));
    r.g.classList.toggle('blk-fault', !!b.fault);
    const out = b.direction === 'out' && (b.auto || b.permission || b.fixed === 'out' || !!b.phone?.permissionFor);
    const inn = b.direction === 'in';
    r.dirOut.setAttribute('class', `blk-dir${out ? '' : ' off'}`);
    r.dirIn.setAttribute('class', `blk-dir${inn ? '' : ' off'}`);
    const st = b.request === 'theirs' ? ['żąd.', true] : b.request === 'ours' ? ['Wbl', true] : b.koPending ? ['Ko', true] : b.fault ? ['tel.', false] : ['', false];
    r.status.textContent = st[0];
    r.status.setAttribute('class', `blk-status${st[1] ? ' blink' : ''}`);
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
        lbl = el('g', { class: 'scr-train' }, [el('g', { class: 'scr-train-in', transform: `scale(${this.S})` }, [el('rect', { x: -17, y: -7, width: 34, height: 13, rx: 1 }), text(0, 0, String(tr.nr), { class: 'scr-train-nr' })])]);
        this.layerTrains.appendChild(lbl);
        this.trainLabels.set(tr.nr, lbl);
      }
      const visible = headTile.x >= this.x0 && headTile.x <= this.x1;
      lbl.style.display = visible ? '' : 'none';
      lbl.querySelector('.scr-train-in').setAttribute('transform', `scale(${this.S})`);
      lbl.setAttribute('transform', `translate(${(headTile.x - this.x0) * CELL + C},${(headTile.y * CELL + C) * this.ry - 13 * this.S})`);
      lbl.querySelector('.scr-train-nr').textContent = `${tr.nr}${tr.v > 0.3 ? '' : ' ■'}`;
    }
    for (const [nr, lbl] of this.trainLabels) if (!seen.has(nr)) { lbl.remove(); this.trainLabels.delete(nr); }
    this.#counters();
  }
}

function setSeg(e, cls) {
  e.setAttribute('class', `seg ${cls}`);
}

