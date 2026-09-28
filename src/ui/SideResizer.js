import { clampSide, dragSide, SIDE_LIMITS } from './sideSize.js';

/**
 * Przeciąganie granicy między planem a panelem bocznym (rozkład, dziennik…): za krawędź panelu (mysz – kursor
 * ↕ albo ↔) albo za uchwyt w listwie narzędzi obok przycisku panelu (palec na tablecie), także strzałkami z klawiatury
 * na uchwycie. Rozmiar jest zapamiętany: panel na dole – ułamek wysokości (`sideSize`), z boku – szerokość w px
 * (`sideWidth`). Rachunki bez DOM: `sideSize.js`.
 */
export class SideResizer {
  /**
   * @param opts { main, side, grip, settings, onResize – w trakcie przeciągania (plan dopasowuje się na żywo),
   *               onEnd – po puszczeniu }
   */
  constructor({ main, side, grip, settings, onResize = () => {}, onEnd = () => {} }) {
    Object.assign(this, { main, side, grip, settings, onResize, onEnd });
    this.edge = document.createElement('div');
    this.edge.className = 'side-edge';
    this.edge.setAttribute('aria-hidden', 'true');
    side.prepend(this.edge);
    for (const handle of [this.edge, grip]) this.#bindDrag(handle);
    grip.addEventListener('keydown', (ev) => this.#key(ev));
    this.apply();
  }

  /** Gdzie jest panel: 'bottom' (także wąski ekran), 'right' albo 'left' – z faktycznego układu, nie z ustawienia. */
  placement() {
    const dir = getComputedStyle(this.main).flexDirection;
    return dir.startsWith('column') ? 'bottom' : dir === 'row-reverse' ? 'left' : 'right';
  }

  #limits() {
    return this.placement() === 'bottom' ? SIDE_LIMITS.vertical : SIDE_LIMITS.horizontal;
  }

  #total() {
    const r = this.main.getBoundingClientRect();
    return this.placement() === 'bottom' ? r.height : r.width;
  }

  #current() {
    const r = this.side.getBoundingClientRect();
    return this.placement() === 'bottom' ? r.height : r.width;
  }

  /** Zapamiętany rozmiar (albo domyślny z CSS) dla bieżącego układu; wołać po zmianie okna i położenia panelu. */
  apply() {
    const where = this.placement();
    document.getElementById('app').dataset.sidePlacement = where;
    const { sideSize, sideWidth } = this.settings.values;
    const total = this.#total();
    const size = where === 'bottom' ? (sideSize != null ? sideSize * total : null) : sideWidth;
    this.side.style.flexBasis = size != null && total > 0 ? `${clampSide(size, total, this.#limits())}px` : '';
  }

  #set(size) {
    this.side.style.flexBasis = `${clampSide(size, this.#total(), this.#limits())}px`;
    this.onResize();
  }

  #save() {
    const size = this.#current(), total = this.#total();
    if (this.placement() === 'bottom') this.settings.set('sideSize', Math.round((size / total) * 1e4) / 1e4);
    else this.settings.set('sideWidth', Math.round(size));
    this.onEnd();
  }

  #bindDrag(handle) {
    let start = null;
    handle.addEventListener('pointerdown', (ev) => {
      if (ev.button > 0) return;
      ev.preventDefault();
      handle.setPointerCapture?.(ev.pointerId);
      const where = this.placement();
      start = { pos: where === 'bottom' ? ev.clientY : ev.clientX, size: this.#current(), where, moved: false };
      document.body.dataset.sideResizing = where === 'bottom' ? 'v' : 'h';
    });
    handle.addEventListener('pointermove', (ev) => {
      if (!start) return;
      const delta = (start.where === 'bottom' ? ev.clientY : ev.clientX) - start.pos;
      if (Math.abs(delta) < 2 && !start.moved) return;
      start.moved = true;
      this.#set(dragSide(start.size, delta, start.where));
    });
    const end = (ev) => {
      if (!start) return;
      const moved = start.moved;
      start = null;
      delete document.body.dataset.sideResizing;
      handle.releasePointerCapture?.(ev.pointerId);
      if (moved) this.#save();
    };
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
  }

  /** Uchwyt z klawiatury: strzałki powiększają / zmniejszają panel o 24 px. */
  #key(ev) {
    const where = this.placement();
    const grow = where === 'bottom' ? { ArrowUp: 1, ArrowDown: -1 } : where === 'right' ? { ArrowLeft: 1, ArrowRight: -1 } : { ArrowRight: 1, ArrowLeft: -1 };
    const dir = grow[ev.key];
    if (!dir) return;
    ev.preventDefault();
    this.#set(this.#current() + dir * 24);
    this.#save();
  }
}
