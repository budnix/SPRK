import { el, CELL } from './svg.js';
import { refKey } from './refKey.js';

/**
 * Wspólna baza widoków stanowisk obsługi (pulpit kostkowy, monitor, przyszłe panele) – kontrakt, z którego
 * korzysta reszta aplikacji (`main.js`, `EdgePanels`, samouczek):
 *
 *  - `svg`, `inner` – rysunek i grupa planu przesunięta o margines `pad`;
 *  - `setView(x0, x1)`, `resetView()` – widoczny wycinek kolumn (ekran), bez przebudowy grafiki;
 *  - `elementFor(ref)` – element obsługi do wskazania (samouczek);
 *  - `refreshAll()` – obraz stanu od zera;
 *  - `cmdBar`, `cmdButton(id)`, `setSymbolScale(s)` – opcjonalne; baza daje puste odpowiedzi.
 *
 * Baza robi to, co w każdym widoku jest takie samo: okno kolumn i tryb podglądu, rysunek z marginesem, subskrypcje
 * zdarzeń symulacji, odświeżanie wszystkich elementów, liczniki, prowadzenie etykiet pociągów.
 *
 * Widok dostarcza: `static PAD`, opcjonalnie `static rowScale(opts)`, metody obrazu stanu `updateSection(id)`,
 * `updatePoint(id)`, `updateDerailer(id)`, `updateSignal(id)`, `updateBlock(exitId)`, `updateArmed(armed)`, etykiety
 * pociągów `createTrainLabel(train)` → { label, text } i `placeTrainLabel(label, headTile, train)`, warstwę
 * `layerTrains` oraz wpisy w mapach `sectionRefs`, `pointRefs`, `derailerRefs`, `signalRefs`, `blockRefs`,
 * `counterRefs`, `controlEls` (klucz: `refKey`). Na końcu konstruktora woła `bindModel()` i `refreshAll()`.
 */
export class PanelView {
  /** Margines rysunku wokół planu (jednostki rysunku). */
  static PAD = 0;

  /** Skala wysokości rzędu (1 = kostka kwadratowa). */
  static rowScale() { return 1; }

  /** Rozmiar rysunku dla okna `cols` × `rows` kostek. */
  static size(cols, rows, opts = {}) {
    return { w: cols * CELL + 2 * this.PAD, h: rows * CELL * this.rowScale(opts) + 2 * this.PAD };
  }

  /** Tekst licznika plombowanego: pięć cyfr. */
  static counterText(n) {
    return String(n ?? 0).padStart(5, '0');
  }

  /**
   * @param container element DOM
   * @param sim Simulation
   * @param handlers { onPress, onPull, onCompound, onCommand, onCancel }
   * @param opts { window: [x0, x1], readonly, title, … }
   * @param view { className } – klasa CSS rysunku
   */
  constructor(container, sim, handlers, opts = {}, { className }) {
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
    this.cols = this.x1 - this.x0 + 1;
    this.rows = this.station.desk.rows;
    this.pad = this.constructor.PAD;
    this.ry = this.constructor.rowScale(opts);
    this.cmdBar = null;
    this.sectionRefs = new Map();
    this.pointRefs = new Map();
    this.derailerRefs = new Map();
    this.signalRefs = new Map();
    this.blockRefs = new Map();
    this.counterRefs = new Map();
    this.controlEls = new Map();   // refKey -> element obsługi
    this.trainLabels = new Map();  // nr -> { label, text }

    const { w, h } = this.constructor.size(this.cols, this.rows, opts);
    this.width = w; this.height = h;
    this.svg = el('svg', { class: `${className}${this.readonly ? ' readonly' : ''}`, viewBox: `0 0 ${w} ${h}`, preserveAspectRatio: 'xMidYMid meet' });
    this.svg.appendChild(el('defs', {}, [
      el('filter', { id: 'glow', x: '-50%', y: '-50%', width: '200%', height: '200%' }, [
        el('feGaussianBlur', { stdDeviation: 1.2, result: 'b' }),
        el('feMerge', {}, [el('feMergeNode', { in: 'b' }), el('feMergeNode', { in: 'SourceGraphic' })]),
      ]),
    ]));
    this.inner = el('g', { transform: `translate(${this.pad},${this.pad})` });
    this.svg.appendChild(this.inner);
    container.appendChild(this.svg);
  }

  /** Tło i elementy pod planem – przed grupą `inner`. */
  addBackdrop(...nodes) {
    for (const n of nodes) this.svg.insertBefore(n, this.inner);
  }

  /** Czy kolumna leży w oknie widoku. */
  inWindow(x) {
    return x >= this.x0 && x <= this.x1;
  }

  /** Widoczny wycinek kolumn (ekran) – zmiana viewBox, bez przebudowy grafiki. */
  setView(x0, x1) {
    this.svg.setAttribute('viewBox', `${(x0 - this.x0) * CELL} 0 ${(x1 - x0 + 1) * CELL + 2 * this.pad} ${this.height}`);
  }

  resetView() { this.setView(this.x0, this.x1); }

  /** Skala symboli na żywo – widoki bez tej opcji nic nie robią. */
  setSymbolScale() {}

  /** Przycisk paska poleceń – widoki bez paska nie mają żadnego. */
  cmdButton() { return null; }

  /** Element obsługi odpowiadający `ref` (do podświetlania w samouczku). */
  elementFor(ref) {
    if (ref.kind === 'blockpanel') return this.blockPanelElement(ref.exit);
    const get = (r) => this.controlEls.get(refKey(r)) || null;
    return get(ref) || (ref.kind === 'signal' && !ref.color ? get({ ...ref, color: 'green' }) || get({ ...ref, color: 'white' }) : null);
  }

  /** Element blokady liniowej szlaku `exit` (grupa kostek, strzałka szlaku). */
  blockPanelElement(exit) {
    return this.controlEls.get(refKey({ kind: 'block', exit, btn: 'Wbl' })) || null;
  }

  /** Subskrypcje zdarzeń symulacji – te same dla każdego widoku. */
  bindModel() {
    const bus = this.sim.bus;
    bus.on('section', (s) => this.updateSection(s.id));
    bus.on('point', (p) => this.updateSection(p.section)); // odcinek (łącznice) i zwrotnica – updateSection woła updatePoint
    bus.on('derailer', (d) => this.updateDerailer(d.id));
    bus.on('signal', (s) => this.updateSignal(s.id));
    bus.on('route', () => this.refreshAll());
    bus.on('block', (b) => this.updateBlock(b.id));
    bus.on('armed', (a) => this.updateArmed(a));
    bus.on('tick', () => this.updateTrains());
  }

  refreshAll() {
    for (const id of this.sectionRefs.keys()) this.updateSection(id);
    for (const id of this.pointRefs.keys()) this.updatePoint(id);
    for (const id of this.derailerRefs.keys()) this.updateDerailer(id);
    for (const id of this.signalRefs.keys()) this.updateSignal(id);
    for (const id of this.blockRefs.keys()) this.updateBlock(id);
    this.updateCounters();
    this.updateArmed(this.ilk.armed);
  }

  updateCounters() {
    for (const [id, t] of this.counterRefs) t.textContent = PanelView.counterText(this.ilk.counters[id]);
  }

  /** Etykiety numerów pociągów: jedna na pociąg na planie, przy czole; znikają z pociągiem. */
  updateTrains() {
    const seen = new Set();
    for (const tr of this.sim.traffic.trains) {
      const tiles = tr.occupiedTiles();
      if (!tiles.length) continue;
      const headTile = tiles[tiles.length - 1];
      seen.add(tr.nr);
      let entry = this.trainLabels.get(tr.nr);
      if (!entry) {
        entry = this.createTrainLabel(tr);
        this.layerTrains.appendChild(entry.label);
        this.trainLabels.set(tr.nr, entry);
      }
      entry.label.style.display = this.inWindow(headTile.x) ? '' : 'none';
      this.placeTrainLabel(entry.label, headTile, tr);
      entry.text.textContent = `${tr.nr}${tr.v > 0.3 ? '' : ' ■'}`;
    }
    for (const [nr, entry] of this.trainLabels) if (!seen.has(nr)) { entry.label.remove(); this.trainLabels.delete(nr); }
    this.updateCounters();
  }

  /* ---- do dostarczenia przez widok ---- */
  updateSection() { missing(this, 'updateSection'); }
  updatePoint() { missing(this, 'updatePoint'); }
  updateDerailer() { missing(this, 'updateDerailer'); }
  updateSignal() { missing(this, 'updateSignal'); }
  updateBlock() { missing(this, 'updateBlock'); }
  updateArmed() { missing(this, 'updateArmed'); }
  createTrainLabel() { missing(this, 'createTrainLabel'); }
  placeTrainLabel() { missing(this, 'placeTrainLabel'); }
}

function missing(view, name) {
  throw new Error(`${view.constructor.name}: brak metody ${name} (kontrakt PanelView)`);
}

/** Metody, które musi mieć każdy widok (test kontraktu). */
export const PANEL_VIEW_REQUIRED = ['updateSection', 'updatePoint', 'updateDerailer', 'updateSignal', 'updateBlock', 'updateArmed', 'createTrainLabel', 'placeTrainLabel'];
