import { edgeLayout } from '../render/edges.js';
import { CELL } from '../render/svg.js';
import { EDGE_COLS } from '../tiles/platforms.js';

const NS = 'http://www.w3.org/2000/svg';

/**
 * Stałe pola skrajne pulpitu (DOM): dwa małe SVG w nakładce nad obszarem przewijania, przy lewej i prawej krawędzi,
 * rysujące żywą kopię (`<use>`) skrajnych kolumn aktywnego pulpitu – strzałki szlaku i przyciski blokady
 * są widoczne zawsze, gdy powiększony pulpit nie mieści się na szerokość; środek przewija się między nimi (linia
 * przerywana oddziela pole od środka). Dotknięcia na polu są przekazywane do właściwego elementu pulpitu (przycisk
 * kostki, punkt dotyku monitora), więc blokadę obsługuje się z pola tak samo jak z pulpitu.
 * Geometria: `edgeLayout` (bez DOM). Opcja w menu (`edgePanels`), domyślnie wyłączona.
 */
export class EdgePanels {
  constructor(scroll, deskEl, { edgeCells = EDGE_COLS, enabled = false } = {}) {
    this.scroll = scroll; this.deskEl = deskEl; this.edgeCells = edgeCells; this.enabled = enabled;
    this.svg = null; this.pad = 0; this.target = null; this.active = false;
    // nakładka dokładnie nad obszarem przewijania (poza nim – bez „sticky”, które w Safari zostawia szparę na padding)
    this.overlay = document.createElement('div');
    this.overlay.className = 'edge-overlay hidden';
    this.left = this.#panel('left'); this.right = this.#panel('right');
    this.overlay.append(this.left, this.right);
    scroll.parentElement.insertBefore(this.overlay, scroll.nextSibling);
    scroll.addEventListener('scroll', () => this.#syncTop(), { passive: true });
    window.addEventListener('resize', () => this.update());
  }

  #panel(side) {
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('class', `edge-panel ${side}`);
    svg.setAttribute('preserveAspectRatio', 'none'); // pole ma tę samą skalę co pulpit – bez dopasowywania
    svg.dataset.side = side;
    svg.appendChild(document.createElementNS(NS, 'use'));
    for (const type of ['pointerdown', 'pointerup', 'pointercancel']) svg.addEventListener(type, (ev) => this.#forward(ev));
    svg.addEventListener('contextmenu', (ev) => ev.preventDefault());
    return svg;
  }

  /** Aktywny widok stanowiska (PanelView): rysunek `svg`, grupa planu `inner` kopiowana do pól, margines `pad`. */
  attach(renderer) {
    this.svg = renderer.svg;
    if (!renderer.inner.id) renderer.inner.id = `desk-inner-${Math.random().toString(36).slice(2, 8)}`;
    this.pad = renderer.pad;
    for (const p of [this.left, this.right]) {
      p.querySelector('use').setAttribute('href', `#${renderer.inner.id}`);
      p.setAttribute('style', this.svg.getAttribute('style') || '');
    }
    this.#syncClass();
    // klasa rysunku zmienia się w trakcie pracy – faza migania `ph` co 0,5 s, tryb wskazywania (`picking`) – pola mają ją
    // mieć tę samą, inaczej elementy migające na polu świecą na stałe
    this.classWatch?.disconnect();
    this.classWatch = new MutationObserver(() => this.#syncClass());
    this.classWatch.observe(this.svg, { attributes: true, attributeFilter: ['class', 'style'] });
    this.update();
  }

  /** Klasa pól jak rysunku (style monitora / pulpitu, faza migania) i jego zmienne CSS (`--sym`) – bez nadpisywania
   *  położenia i rozmiaru pól. */
  #syncClass() {
    const st = this.svg.style;
    for (const p of [this.left, this.right]) {
      p.setAttribute('class', `edge-panel ${p.dataset.side} ${this.svg.getAttribute('class') || ''}`);
      for (let i = 0; i < st.length; i++) if (st[i].startsWith('--')) p.style.setProperty(st[i], st.getPropertyValue(st[i]));
    }
  }

  /** Po zmianie powiększenia, ekranu lub rozmiaru okna. */
  update() {
    if (!this.svg) return;
    const vb = this.svg.viewBox.baseVal;
    const desk = this.deskEl.getBoundingClientRect();
    const lay = edgeLayout({
      viewBox: [vb.x, vb.y, vb.width, vb.height], deskPx: { w: desk.width, h: desk.height },
      clientPx: { w: this.scroll.clientWidth, h: this.scroll.clientHeight }, edgeUnits: this.edgeCells * CELL + this.pad,
    });
    this.active = this.enabled && lay.active;
    this.overlay.classList.toggle('hidden', !this.active);
    this.scroll.classList.toggle('edges-on', this.active); // bez poziomego paddingu – pola zlewają się z krańcami pulpitu
    if (!this.active) return;
    // nakładka = widoczny obszar przewijania (bez paska przewijania)
    const s = this.scroll;
    Object.assign(this.overlay.style, { left: `${s.offsetLeft}px`, top: `${s.offsetTop}px`, width: `${s.clientWidth}px`, height: `${s.clientHeight}px` });
    const scale = desk.width / vb.width; // px na jednostkę rysunku – identycznie jak pulpit
    const w = (this.edgeCells * CELL + this.pad) * scale;
    for (const [p, side] of [[this.left, lay.left], [this.right, lay.right]]) {
      p.setAttribute('viewBox', side.viewBox.join(' '));
      p.style.width = `${w}px`; p.style.height = `${desk.height}px`;
    }
    this.left.style.left = '0px';
    this.right.style.left = `${s.clientWidth - w}px`;
    this.#syncTop();
  }

  /** Pola idą w pionie za pulpitem (przewijanie pionowe, położenie góra/środek/dół) – z prostokąta pulpitu, bez zaokrągleń. */
  #syncTop() {
    if (!this.active) return;
    const top = this.deskEl.getBoundingClientRect().top - this.scroll.getBoundingClientRect().top - this.scroll.clientTop;
    this.left.style.top = `${top}px`; this.right.style.top = `${top}px`;
  }

  /** Element pulpitu (przycisk / punkt dotyku) pod punktem pola – w jednostkach rysunku pulpitu. */
  #targetAt(panel, clientX, clientY) {
    const pt = new DOMPoint(clientX, clientY).matrixTransform(panel.getScreenCTM().inverse());
    const inv = this.svg.getScreenCTM().inverse();
    let found = null;
    for (const el of this.svg.querySelectorAll('.hit, .btn')) {
      const bb = el.getBBox(); if (!bb.width && !bb.height) continue;
      const m = inv.multiply(el.getScreenCTM());
      const a = new DOMPoint(bb.x, bb.y).matrixTransform(m), b = new DOMPoint(bb.x + bb.width, bb.y + bb.height).matrixTransform(m);
      if (pt.x >= Math.min(a.x, b.x) - 1 && pt.x <= Math.max(a.x, b.x) + 1 && pt.y >= Math.min(a.y, b.y) - 1 && pt.y <= Math.max(a.y, b.y) + 1) found = el;
    }
    return found;
  }

  #forward(ev) {
    if (!this.svg || !this.active) return;
    const target = ev.type === 'pointerdown' ? this.#targetAt(ev.currentTarget, ev.clientX, ev.clientY) : this.target;
    if (ev.type === 'pointerdown') this.target = target;
    if (!target) return;
    ev.preventDefault(); ev.stopPropagation();
    target.dispatchEvent(new PointerEvent(ev.type, {
      bubbles: true, cancelable: true, button: ev.button, buttons: ev.buttons, clientX: ev.clientX, clientY: ev.clientY,
      pointerId: ev.pointerId, pointerType: ev.pointerType, isPrimary: true,
    }));
    if (ev.type !== 'pointerdown') this.target = null;
  }
}
