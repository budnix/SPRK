import { edgeLayout } from '../render/edges.js';
import { CELL } from '../render/svg.js';

const NS = 'http://www.w3.org/2000/svg';

/**
 * Stałe pola skrajne pulpitu (DOM): dwa małe SVG przypięte (position: sticky) do lewej i prawej krawędzi okna
 * przewijania, rysujące żywą kopię (`<use>`) skrajnych kolumn aktywnego pulpitu – strzałki szlaku i przyciski blokady
 * są widoczne zawsze, gdy powiększony pulpit nie mieści się na szerokość; środek przewija się między nimi (linia
 * przerywana oddziela pole od środka). Dotknięcia na polu są przekazywane do właściwego elementu pulpitu (przycisk
 * kostki, punkt dotyku monitora), więc blokadę obsługuje się z pola tak samo jak z pulpitu.
 * Geometria: `edgeLayout` (bez DOM). Opcja w menu (`edgePanels`), domyślnie wyłączona.
 */
export class EdgePanels {
  constructor(scroll, deskEl, { edgeCells = 3, enabled = false } = {}) {
    this.scroll = scroll; this.deskEl = deskEl; this.edgeCells = edgeCells; this.enabled = enabled;
    this.svg = null; this.pad = 0; this.target = null;
    this.left = this.#panel('left'); this.right = this.#panel('right');
    scroll.insertBefore(this.left, deskEl);
    scroll.insertBefore(this.right, deskEl.nextSibling);
    this.active = false;
  }

  #panel(side) {
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('class', `edge-panel ${side}`);
    svg.setAttribute('preserveAspectRatio', 'xMinYMin meet');
    svg.dataset.side = side;
    svg.appendChild(document.createElementNS(NS, 'use'));
    for (const type of ['pointerdown', 'pointerup', 'pointercancel']) svg.addEventListener(type, (ev) => this.#forward(ev));
    svg.addEventListener('contextmenu', (ev) => ev.preventDefault());
    return svg;
  }

  /** Aktywny pulpit: SVG renderera z grupą `inner` (translate o margines) – kopiowaną do pól. */
  attach(renderer) {
    this.svg = renderer.svg;
    if (!renderer.inner.id) renderer.inner.id = `desk-inner-${Math.random().toString(36).slice(2, 8)}`;
    const m = renderer.inner.transform?.baseVal?.numberOfItems ? renderer.inner.transform.baseVal.getItem(0).matrix : null;
    this.pad = m ? m.e : 0;
    for (const p of [this.left, this.right]) {
      p.querySelector('use').setAttribute('href', `#${renderer.inner.id}`);
      p.setAttribute('class', `edge-panel ${p.dataset.side} ${this.svg.getAttribute('class') || ''}`); // style monitora / pulpitu
      p.setAttribute('style', this.svg.getAttribute('style') || '');
    }
    this.update();
  }

  /** Po zmianie powiększenia, ekranu lub rozmiaru okna. */
  update() {
    if (!this.svg) return;
    const vb = this.svg.viewBox.baseVal;
    const desk = this.deskEl.getBoundingClientRect();
    const lay = edgeLayout({
      viewBox: [vb.x, vb.y, vb.width, vb.height], deskPx: { w: desk.width, h: desk.height },
      clientPx: { w: this.scroll.clientWidth - 8, h: this.scroll.clientHeight - 8 }, edgeUnits: this.edgeCells * CELL + this.pad,
    });
    this.active = this.enabled && lay.active;
    lay.active = this.active;
    for (const [p, side] of [[this.left, lay.left], [this.right, lay.right]]) {
      p.classList.toggle('on', lay.active);
      if (!lay.active) continue;
      p.setAttribute('viewBox', side.viewBox.join(' '));
      p.setAttribute('width', side.w); p.setAttribute('height', side.h);
      p.style.width = `${side.w}px`; p.style.height = `${side.h}px`;
      p.style[p === this.left ? 'marginRight' : 'marginLeft'] = `${-side.w}px`;
    }
    this.left.classList.toggle('hidden', !lay.active); this.right.classList.toggle('hidden', !lay.active);
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
