import { MissionProgress } from './progress.js';
import { t } from '../i18n/index.js';
import { GLOSSARY } from '../data/glossary.js';
import { makeDraggable } from '../ui/drag.js';
import { uiIcon } from '../ui/icons.js';

/**
 * Samouczek (UI): dymek z bieżącym krokiem misji przypięty do wskazywanego elementu (semafor, kostki blokady,
 * przycisk paska poleceń, zakładka panelu), podświetlenie elementu, słownik skrótów po kliknięciu
 * <abbr data-term>, przycisk „Dalej” na krokach informacyjnych. Logika kroków: progress.js / missions.js.
 *
 * opts: { steps, anchorEl(anchor) → Element|null, showTab(id), onFinish() }
 */
export class Tutorial {
  constructor(sim, opts) {
    this.sim = sim;
    this.opts = opts;
    this.progress = new MissionProgress(sim, opts.steps, {
      onStep: (s, i) => this.#render(s, i),
      onFeedback: (msg) => this.#feedback(msg),
      onDone: () => this.#finish(),
    });
    this.box = document.createElement('div');
    this.box.className = 'tut-box hidden';
    this.box.innerHTML = `<div class="tut-head"><span class="tut-step"></span><span class="tut-title"></span><button type="button" class="tut-close" title="${t('tut.close')}" aria-label="${t('tut.close')}">${uiIcon('close', 14)}</button></div>
      <div class="tut-body"></div>
      <div class="tut-feedback hidden"></div>
      <div class="tut-tip hidden"></div>
      <div class="tut-actions"><button type="button" class="tb tut-show">${t('tut.show')}</button><button type="button" class="tb tut-skip">${t('tut.skip')}</button><button type="button" class="tb primary tut-next">${t('tut.next')}</button></div>`;
    document.body.appendChild(this.box);
    this.glossary = document.createElement('div');
    this.glossary.className = 'tut-gloss hidden';
    document.body.appendChild(this.glossary);
    this.box.querySelector('.tut-next').addEventListener('click', () => this.progress.next());
    this.box.querySelector('.tut-skip').addEventListener('click', () => this.progress.next());
    this.box.querySelector('.tut-show').addEventListener('click', () => this.#point(true));
    this.box.querySelector('.tut-close').addEventListener('click', () => this.stop());
    // dymek można odsunąć, gdy zasłania element planu; zostaje tam do następnego kroku
    makeDraggable(this.box, this.box.querySelector('.tut-head'), { onStart: () => { this.dragged = true; }, onTap: () => { if (!this.box.dataset.dragged) { this.dragged = false; this.#reposition(); } } });
    makeDraggable(this.glossary, null, { onTap: () => this.glossary.classList.add('hidden') });
    this.box.addEventListener('click', (ev) => {
      const ab = ev.target.closest('abbr[data-term]');
      if (ab) { ev.preventDefault(); this.#showTerm(ab.dataset.term, ab); }
    });
    // dymek słownika znika po kliknięciu poza nim, po zwykłym kliknięciu w niego i po Esc; przeciągnięty – zostaje
    document.addEventListener('pointerdown', (ev) => { if (!ev.target.closest('abbr[data-term]') && !this.glossary.contains(ev.target)) this.glossary.classList.add('hidden'); }, true);
    document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') this.glossary.classList.add('hidden'); });
    const repos = () => this.#reposition();
    window.addEventListener('resize', repos);
    document.getElementById('desk-scroll')?.addEventListener('scroll', repos, { passive: true });
    sim.bus.on('tick', () => { if (!this.box.classList.contains('hidden') && performance.now() - (this.lastPos || 0) > 400) this.#reposition(); });
  }

  start() { this.progress.start(); }

  stop() {
    this.#unhighlight();
    this.box.classList.add('hidden');
    this.glossary.classList.add('hidden');
    if (this.progress.pausedByUs) { this.sim.clock.paused = false; this.progress.pausedByUs = false; }
    this.progress.finished = true;
    this.sim.autoEnd = true; // samouczek przerwany – zmiana kończy się sama po ostatnim pociągu
    this.opts.onFinish?.();
  }

  #render(step, i) {
    const n = this.progress.steps.length;
    this.box.querySelector('.tut-step').textContent = t('tut.step', { i: i + 1, n });
    this.box.querySelector('.tut-title').textContent = step.title;
    this.box.querySelector('.tut-body').innerHTML = step.text + (step.tip ? `<p class="tut-hint">${step.tip}</p>` : '');
    this.box.querySelector('.tut-next').classList.toggle('hidden', !step.info);
    this.box.querySelector('.tut-skip').classList.toggle('hidden', !!step.info);
    this.box.querySelector('.tut-show').classList.toggle('hidden', !step.anchor);
    this.box.classList.toggle('waiting', !step.info);
    this.box.dataset.step = step.id;
    this.dragged = false; delete this.box.dataset.dragged;
    this.#feedback(null);
    this.glossary.classList.add('hidden');
    this.box.classList.remove('hidden');
    if (step.anchor?.tab) this.opts.showTab?.(step.anchor.tab);
    this.#point(false);
  }

  #feedback(msg) {
    const el = this.box.querySelector('.tut-feedback');
    el.textContent = msg || '';
    el.classList.toggle('hidden', !msg);
  }

  /** Podświetla element kroku i ustawia dymek obok. */
  #point(scroll) {
    this.#unhighlight();
    const step = this.progress.step;
    const el = step?.anchor ? this.opts.anchorEl(step.anchor) : null;
    this.target = el || null;
    if (el) {
      el.classList.add('tut-hl');
      if (scroll && el.scrollIntoView) el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });
    }
    this.#reposition();
  }

  #unhighlight() {
    for (const e of document.querySelectorAll('.tut-hl')) e.classList.remove('tut-hl');
    this.target = null;
  }

  /**
   * Położenie dymku: przy wskazywanym elemencie, ale tak, by nie zasłaniać planu stacji – kandydaci (pod, nad,
   * obok elementu; pas nad planem i pod planem) oceniani wg pola zasłoniętego planu i odległości od elementu.
   * Po ręcznym przesunięciu (uchwyt = nagłówek) dymek zostaje na miejscu do następnego kroku.
   */
  #reposition() {
    this.lastPos = performance.now();
    const box = this.box;
    if (box.classList.contains('hidden') || this.dragged) return;
    const W = Math.min(360, window.innerWidth - 16), M = 10;
    box.style.width = `${W}px`;
    box.style.transform = 'none'; box.style.bottom = 'auto'; box.style.right = 'auto';
    const bh = box.offsetHeight || 200;
    const vw = window.innerWidth, vh = window.innerHeight;
    const t = this.target;
    const r = t?.getBoundingClientRect?.();
    const place = (left, top, side) => { box.style.left = `${Math.max(M, Math.min(vw - W - M, left))}px`; box.style.top = `${Math.max(M, Math.min(vh - bh - M, top))}px`; box.dataset.side = side; };
    if (!r || (r.width === 0 && r.height === 0)) { place(vw - W - M, vh - bh - 52, 'none'); return; }
    if (t.closest?.('#side') && r.left - M - W >= 0) { place(r.left - M - W, r.top, 'left'); return; }
    // obszar rysunku planu (suma warstw SVG) – tego dymek ma nie zasłaniać, gdy wskazuje element planu
    const layers = [...document.querySelectorAll('#desk-scroll svg > g')].map((g) => g.getBoundingClientRect()).filter((q) => q.width && q.height);
    const desk = layers.length ? layers.reduce((a, q) => ({ left: Math.min(a.left, q.left), top: Math.min(a.top, q.top), right: Math.max(a.right, q.right), bottom: Math.max(a.bottom, q.bottom) })) : null;
    const onDesk = !!(desk && t.closest?.('#desk-scroll'));
    const cx = r.left + r.width / 2;
    const clampT = (tp) => Math.max(M, Math.min(vh - bh - M, tp));
    const cands = [
      ['below', cx - W / 2, r.bottom + M], ['above', cx - W / 2, r.top - M - bh],
      ['right', r.right + M, r.top], ['left', r.left - M - W, r.top],
    ];
    // pas nad planem i pod planem (docięty do okna – częściowe zasłonięcie planu liczy się w ocenie)
    if (desk) cands.push(['top-strip', cx - W / 2, clampT(desk.top - M - bh)], ['bottom-strip', cx - W / 2, clampT(desk.bottom + M)]);
    const fits = (l, tp) => l >= M - 0.5 && tp >= M - 0.5 && l + W <= vw - M + 0.5 && tp + bh <= vh - M + 0.5;
    const overlap = (l, tp, q) => Math.max(0, Math.min(l + W, q.right) - Math.max(l, q.left)) * Math.max(0, Math.min(tp + bh, q.bottom) - Math.max(tp, q.top));
    // paski sterowania (nagłówek, pasek poleceń, listwa narzędzi) też lepiej zostawić odsłonięte
    const bars = ['#topbar', '#cmd-host', '#desk-tools'].map((q) => document.querySelector(q)?.getBoundingClientRect()).filter((q) => q && q.height);
    let best = null;
    for (const [side, l0, tp] of cands) {
      const l = Math.max(M, Math.min(vw - W - M, l0));
      if (!fits(l, tp)) continue;
      // nie zasłaniać elementu ani (gdy element leży na planie) rysunku planu; bliżej elementu = lepiej
      const dist = Math.hypot(l + W / 2 - cx, tp + bh / 2 - (r.top + r.height / 2));
      const score = overlap(l, tp, r) * 1000 + (onDesk ? overlap(l, tp, desk) : 0) + bars.reduce((a, q) => a + overlap(l, tp, q) * 0.7, 0) + dist * 0.5;
      if (!best || score < best.score) best = { side, l, tp, score };
    }
    if (best) place(best.l, best.tp, best.side);
    else place(cx - W / 2, r.bottom + M <= vh - bh - M ? r.bottom + M : r.top - M - bh, 'beside');
  }

  #showTerm(term, at) {
    const g = GLOSSARY[term];
    if (!g) return;
    this.glossary.innerHTML = `<b>${g.name}</b><p>${g.text}</p>`;
    this.glossary.classList.remove('hidden');
    const r = at.getBoundingClientRect();
    const W = Math.min(320, window.innerWidth - 16);
    this.glossary.style.width = `${W}px`;
    const h = this.glossary.offsetHeight || 100;
    const top = r.bottom + 6 + h <= window.innerHeight ? r.bottom + 6 : Math.max(6, r.top - 6 - h);
    this.glossary.style.left = `${Math.max(8, Math.min(window.innerWidth - W - 8, r.left))}px`;
    this.glossary.style.top = `${top}px`;
  }

  #finish() {
    this.#unhighlight();
    this.box.classList.add('hidden');
    this.opts.onFinish?.();
    // misja ukończona („Dalej” na ostatnim kroku) – dopiero teraz koniec zmiany i raport
    this.sim.endShift?.();
  }
}
