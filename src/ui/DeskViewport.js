import { fitZoom, zoomAround } from '../render/zoom.js';

/**
 * Powiększenie i dopasowanie pulpitu w obszarze przewijania: przyciski +/−, dopasowanie do okna, szczypnięcie
 * dwoma palcami (tablet), Ctrl + kółko / gładzik (komputer). Nie zna rodzaju stanowiska – rozmiar rysunku podaje
 * `size()`, a o zmianie powiadamia `onChange()` (np. stałe pola skrajne).
 */
export class DeskViewport {
  /**
   * @param scroll element przewijany
   * @param deskEl element pulpitu (jego szerokość i wysokość ustawia powiększenie)
   * @param opts { size: () => ({ w, h }) – rozmiar rysunku w jednostkach, onChange: () => void }
   */
  constructor(scroll, deskEl, { size, onChange = () => {} }) {
    this.scroll = scroll;
    this.deskEl = deskEl;
    this.size = size;
    this.onChange = onChange;
    this.zoom = 1;
    /** Ostatni tryb dopasowania: 'whole' | 'width' | 'height' | null (ręczne) – po zmianie układu okna wraca ten sam. */
    this.fitMode = 'whole';
    this.#bindGestures();
  }

  get #client() { return { w: this.scroll.clientWidth, h: this.scroll.clientHeight }; }

  /** Ponowne dopasowanie w tym samym trybie (zmiana układu okna, panelu, ekranu). */
  refit() {
    if (this.fitMode) this.fit(this.fitMode); else this.apply();
  }

  /** Dopasowanie: 'whole' – całość, 'width' – do szerokości (od lewej), 'height' – do wysokości (środek pulpitu). */
  fit(mode = 'whole') {
    this.fitMode = mode;
    this.zoom = fitZoom(mode, this.size(), this.#client);
    this.apply();
    if (mode === 'width') this.scroll.scrollLeft = 0;
    if (mode === 'height') this.scroll.scrollLeft = Math.max(0, (this.scroll.scrollWidth - this.scroll.clientWidth) / 2);
  }

  apply() {
    const { w, h } = this.size();
    this.deskEl.style.width = `${w * this.zoom}px`;
    this.deskEl.style.height = `${h * this.zoom}px`;
    this.onChange();
  }

  /** Zmiana powiększenia wokół punktu (px, py) w układzie widocznego obszaru pulpitu. */
  zoomAt(factor, px, py) {
    this.fitMode = null;
    const r = zoomAround(this.zoom, factor, { left: this.scroll.scrollLeft, top: this.scroll.scrollTop }, { x: px, y: py });
    if (!r.changed) return;
    this.zoom = r.zoom;
    this.apply();
    this.scroll.scrollLeft = r.left;
    this.scroll.scrollTop = r.top;
  }

  /** Krok powiększenia wokół środka widocznego obszaru (przyciski + / −). */
  step(factor) {
    this.zoomAt(factor, this.scroll.clientWidth / 2, this.scroll.clientHeight / 2);
  }

  #bindGestures() {
    const scroll = this.scroll;
    const dist = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    /* Szczypnięcie (dwa palce) – iPad/Android; jeden palec dalej przewija natywnie. */
    let pinch = null;
    scroll.addEventListener('touchstart', (e) => {
      if (e.touches.length !== 2) return;
      e.preventDefault();
      pinch = { d: dist(e.touches), zoom: this.zoom };
    }, { passive: false });
    scroll.addEventListener('touchmove', (e) => {
      if (!pinch || e.touches.length !== 2) return;
      e.preventDefault();
      const r = scroll.getBoundingClientRect();
      const mx = (e.touches[0].clientX + e.touches[1].clientX) / 2 - r.left;
      const my = (e.touches[0].clientY + e.touches[1].clientY) / 2 - r.top;
      const target = pinch.zoom * (dist(e.touches) / pinch.d);
      this.zoomAt(target / this.zoom, mx, my);
    }, { passive: false });
    const endPinch = (e) => { if (e.touches.length < 2) pinch = null; };
    scroll.addEventListener('touchend', endPinch);
    scroll.addEventListener('touchcancel', endPinch);
    // Safari wysyła też zdarzenia gesture* – blokujemy powiększanie strony, obsługa jest w touch*
    for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(ev, (e) => e.preventDefault(), { passive: false });
    // Gładzik / Ctrl + kółko na komputerze
    scroll.addEventListener('wheel', (e) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const r = scroll.getBoundingClientRect();
      this.zoomAt(Math.exp(-e.deltaY * 0.01), e.clientX - r.left, e.clientY - r.top);
    }, { passive: false });
  }
}
