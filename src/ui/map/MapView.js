import { boardSvg, regionBox } from './mapSvg.js';
import { ZOOM, zoomOf, levelOf, fitBox, homeView, clampView, zoomAt, panBy, lerpView } from './zoom.js';
import { uiIcon } from '../icons.js';

/**
 * Mapa przybliżana jak mapy w przeglądarce: kółko myszy i szczypanie na gładziku (także Safari – zdarzenia gesture),
 * przeciąganie, dwa palce na tablecie / telefonie, dwuklik, przyciski + / − / cała Polska w rogu, klawiatura (+ − 0
 * i strzałki na mapie z fokusem). Strona się wtedy nie przybliża (preventDefault, `touch-action: none`). Rysunek
 * z `boardSvg`; ta klasa zmienia tylko viewBox, skalę znaczników (stały rozmiar na ekranie) i poziom szczegółów
 * (`data-level` na svg – CSS pokazuje warstwy). Klik w województwo w widoku kraju przybliża je; posterunek to odnośnik.
 *
 * Opcje: `stations`, `counts`, `mark`, `label` (jak w `boardSvg`), `view` – początkowy prostokąt (inaczej cała Polska),
 * `onHover(id)` – posterunek pod kursorem / z fokusem, `labels` – teksty przycisków { in, out, home, map }.
 */
export class MapView {
  constructor(host, opts = {}) {
    this.host = host;
    this.opts = opts;
    this.pointers = new Map();
    host.classList.add('mv');
    host.innerHTML = `${boardSvg(opts)}
      <div class="mv-ctrl" role="group" aria-label="${opts.labels?.map || ''}">
        <button type="button" class="mv-btn" data-zoom="in" aria-label="${opts.labels?.in || '+'}" title="${opts.labels?.in || '+'}">${uiIcon('plus', 16)}</button>
        <button type="button" class="mv-btn" data-zoom="out" aria-label="${opts.labels?.out || '−'}" title="${opts.labels?.out || '−'}">${uiIcon('minus', 16)}</button>
        <button type="button" class="mv-btn" data-zoom="home" aria-label="${opts.labels?.home || ''}" title="${opts.labels?.home || ''}">${uiIcon('fit', 16)}</button>
      </div>`;
    this.svg = host.querySelector('svg');
    this.svg.setAttribute('tabindex', '0');
    this.svg.setAttribute('aria-label', opts.labels?.map || '');
    this.marks = [...this.svg.querySelectorAll('[data-x]')];
    this.view = null;
    this.#bind();
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => this.#resize()) : null;
    ro?.observe(this.svg);
    this.#resize(opts.view);
  }

  /** Proporcje i rozmiar piksela ekranu w jednostkach rysunku. */
  #aspect() {
    const r = this.svg.getBoundingClientRect();
    return r.width > 0 && r.height > 0 ? r.width / r.height : 1.6;
  }

  #resize(initial = null) {
    const aspect = this.#aspect();
    this.set(this.view ? fitBox(this.view, aspect) : initial ? fitBox(initial, aspect) : homeView(aspect));
  }

  /** Ustawia widok (w granicach), skaluje znaczniki i poziom szczegółów. */
  set(view) {
    const aspect = this.#aspect();
    this.view = clampView(view, aspect);
    const v = this.view;
    this.svg.setAttribute('viewBox', `${v.x.toFixed(3)} ${v.y.toFixed(3)} ${v.w.toFixed(3)} ${v.h.toFixed(3)}`);
    const px = v.w / (this.svg.getBoundingClientRect().width || 1000); // jednostki rysunku na piksel ekranu
    const z = zoomOf(v), level = levelOf(1 / px);
    this.svg.dataset.level = level;
    this.svg.dataset.zoom = z.toFixed(2);
    const stopScale = px * (level === 'country' ? 0.55 : level === 'region' ? 0.85 : 1);
    for (const el of this.marks) {
      const k = el.classList.contains('mv-stop') ? stopScale : px;
      el.setAttribute('transform', `translate(${el.dataset.x} ${el.dataset.y}) scale(${k.toFixed(5)})`);
      // numer linii przy krótkim na ekranie odcinku zasłaniałby przystanki
      if (el.classList.contains('mv-lnum')) el.classList.toggle('short', Number(el.dataset.len) / px < 70);
    }
    this.host.querySelector('[data-zoom="in"]').disabled = z >= ZOOM.max * 0.999;
    this.host.querySelector('[data-zoom="out"]').disabled = z <= ZOOM.min * 1.001;
  }

  /** Punkt ekranu (clientX, clientY) → jednostki rysunku. */
  #toMap(cx, cy) {
    const r = this.svg.getBoundingClientRect(), v = this.view;
    return [v.x + ((cx - r.left) / r.width) * v.w, v.y + ((cy - r.top) / r.height) * v.h];
  }

  #center() {
    return [this.view.x + this.view.w / 2, this.view.y + this.view.h / 2];
  }

  zoomBy(factor, at = this.#center()) {
    cancelAnimationFrame(this.anim); this.target = null;
    this.set(zoomAt(this.view, factor, at));
  }

  /** Płynne przejście do widoku (bez animacji przy „ogranicz ruch”). */
  animateTo(target, ms = 380) {
    const from = this.view, to = clampView(fitBox(target, this.#aspect()), this.#aspect());
    cancelAnimationFrame(this.anim);
    if (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches) { this.target = null; this.set(to); return; }
    this.target = to; // kolejny przycisk w trakcie animacji liczy się od celu, nie od klatki pośredniej
    const t0 = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - t0) / ms), e = 1 - (1 - t) ** 3;
      this.set(lerpView(from, to, e));
      if (t < 1) this.anim = requestAnimationFrame(step); else this.target = null;
    };
    this.anim = requestAnimationFrame(step);
  }

  /** Przybliża województwo do wycinka jego posterunków (jak schemat regionu). */
  zoomToRegion(region) {
    const stations = (this.opts.stations || []).filter((s) => s.region === region);
    this.animateTo(regionBox(region, stations, { aspect: this.#aspect() }));
  }

  #bind() {
    const svg = this.svg;
    // kółko myszy, a na gładziku szczypanie (Chrome / Firefox: wheel z ctrlKey) – przybliża mapę, nie stronę
    svg.addEventListener('wheel', (e) => {
      e.preventDefault();
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
      this.zoomBy(Math.exp(-e.deltaY * unit * (e.ctrlKey ? 0.01 : 0.0018)), this.#toMap(e.clientX, e.clientY));
    }, { passive: false });
    // Safari (macOS, iOS): szczypanie to zdarzenia gesture – bez preventDefault przybliżyłaby się strona
    let gScale = 1;
    svg.addEventListener('gesturestart', (e) => { e.preventDefault(); gScale = 1; });
    svg.addEventListener('gesturechange', (e) => {
      e.preventDefault();
      if (this.pointers.size >= 2) return; // na tablecie szczypanie obsługują zdarzenia wskaźnika
      this.zoomBy(e.scale / gScale, this.#toMap(e.clientX, e.clientY));
      gScale = e.scale;
    });
    svg.addEventListener('gestureend', (e) => e.preventDefault());
    // przeciąganie jednym wskaźnikiem, szczypanie dwoma (palce)
    let moved = 0, last = null;
    svg.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      cancelAnimationFrame(this.anim); this.target = null; // gracz chwyta mapę – animacja przybliżenia staje
      this.pointers.set(e.pointerId, [e.clientX, e.clientY]);
      moved = this.pointers.size > 1 ? moved : 0;
      last = this.#gesture();
    });
    svg.addEventListener('pointermove', (e) => {
      if (!this.pointers.has(e.pointerId)) return;
      this.pointers.set(e.pointerId, [e.clientX, e.clientY]);
      const g = this.#gesture();
      if (!last || !g || last.n !== g.n) { last = g; return; }
      const r = svg.getBoundingClientRect(), k = this.view.w / r.width;
      moved += Math.hypot(g.x - last.x, g.y - last.y) + Math.abs(g.d - last.d);
      // przechwycenie wskaźnika dopiero przy przeciąganiu: przechwycony klik trafiałby w całą mapę, nie w posterunek
      if (moved > 3 && !svg.hasPointerCapture?.(e.pointerId)) { try { svg.setPointerCapture(e.pointerId); } catch { /* wskaźnik nieaktywny */ } }
      let view = panBy(this.view, -(g.x - last.x) * k, -(g.y - last.y) * k);
      if (g.n === 2 && last.d > 0) view = zoomAt(view, g.d / last.d, this.#toMapIn(view, g.x, g.y));
      this.set(view);
      last = g;
    });
    const up = (e) => { this.pointers.delete(e.pointerId); last = this.#gesture(); };
    svg.addEventListener('pointerup', up);
    svg.addEventListener('pointercancel', up);
    // klik po przeciągnięciu to nie klik (nie otwiera posterunku); klik w województwo w widoku kraju – przybliżenie
    svg.addEventListener('click', (e) => {
      if (moved > 6) { e.preventDefault(); e.stopPropagation(); moved = 0; return; }
      const region = e.target.closest?.('[data-region]')?.dataset.region;
      if (region && svg.dataset.level === 'country' && !e.target.closest('.mv-stop')) { e.preventDefault(); this.zoomToRegion(region); }
    }, true);
    svg.addEventListener('dblclick', (e) => { e.preventDefault(); this.zoomBy(2, this.#toMap(e.clientX, e.clientY)); });
    svg.addEventListener('keydown', (e) => {
      const step = this.view.w * 0.12;
      const act = { '+': () => this.zoomBy(1.6), '=': () => this.zoomBy(1.6), '-': () => this.zoomBy(1 / 1.6), 0: () => this.animateTo(homeView(this.#aspect())),
        ArrowLeft: () => this.set(panBy(this.view, -step, 0)), ArrowRight: () => this.set(panBy(this.view, step, 0)),
        ArrowUp: () => this.set(panBy(this.view, 0, -step)), ArrowDown: () => this.set(panBy(this.view, 0, step)) }[e.key];
      if (act && !e.target.closest('.mv-stop')) { e.preventDefault(); act(); }
    });
    this.host.querySelector('.mv-ctrl').addEventListener('click', (e) => {
      const b = e.target.closest('[data-zoom]'); if (!b) return;
      if (b.dataset.zoom === 'home') this.animateTo(homeView(this.#aspect()));
      else {
        const base = this.target || this.view;
        this.animateTo(zoomAt(base, b.dataset.zoom === 'in' ? 2 : 0.5, [base.x + base.w / 2, base.y + base.h / 2]), 220);
      }
    });
    const hover = (e) => {
      const stop = e.target.closest?.('.mv-stop'); if (stop) this.opts.onHover?.(stop.dataset.id);
      // podświetlenie województwa (widok kraju): obrys w warstwie nad wypełnieniami – ta sama grubość na całej granicy
      const shape = e.target.closest?.('.mp-shape');
      this.svg.querySelector('.mp-hover').setAttribute('d', shape && svg.dataset.level === 'country' ? shape.getAttribute('d') : '');
    };
    svg.addEventListener('pointerleave', () => this.svg.querySelector('.mp-hover').setAttribute('d', ''));
    svg.addEventListener('pointerover', hover);
    svg.addEventListener('focusin', hover);
  }

  /** Środek i rozstaw wskaźników (palców) – do przeciągania i szczypania. */
  #gesture() {
    const pts = [...this.pointers.values()].slice(0, 2);
    if (!pts.length) return null;
    const x = pts.reduce((s, p) => s + p[0], 0) / pts.length, y = pts.reduce((s, p) => s + p[1], 0) / pts.length;
    return { n: pts.length, x, y, d: pts.length === 2 ? Math.hypot(pts[0][0] - pts[1][0], pts[0][1] - pts[1][1]) : 0 };
  }

  #toMapIn(view, cx, cy) {
    const r = this.svg.getBoundingClientRect();
    return [view.x + ((cx - r.left) / r.width) * view.w, view.y + ((cy - r.top) / r.height) * view.h];
  }
}
