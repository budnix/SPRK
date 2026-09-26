import { MissionProgress } from './progress.js';
import { GLOSSARY } from '../data/glossary.js';

/**
 * Samouczek (UI): dymek z bieżącym krokiem misji przypięty do wskazywanego elementu (semafor, pole blokady,
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
    this.box.innerHTML = `<div class="tut-head"><span class="tut-step"></span><span class="tut-title"></span><button type="button" class="tut-close" title="Zakończ samouczek" aria-label="Zakończ samouczek">×</button></div>
      <div class="tut-body"></div>
      <div class="tut-feedback hidden"></div>
      <div class="tut-tip hidden"></div>
      <div class="tut-actions"><button type="button" class="tb tut-show">Pokaż gdzie</button><button type="button" class="tb tut-skip">Pomiń krok</button><button type="button" class="tb primary tut-next">Dalej</button></div>`;
    document.body.appendChild(this.box);
    this.glossary = document.createElement('div');
    this.glossary.className = 'tut-gloss hidden';
    document.body.appendChild(this.glossary);
    this.box.querySelector('.tut-next').addEventListener('click', () => this.progress.next());
    this.box.querySelector('.tut-skip').addEventListener('click', () => this.progress.next());
    this.box.querySelector('.tut-show').addEventListener('click', () => this.#point(true));
    this.box.querySelector('.tut-close').addEventListener('click', () => this.stop());
    this.box.addEventListener('click', (ev) => {
      const ab = ev.target.closest('abbr[data-term]');
      if (ab) { ev.preventDefault(); this.#showTerm(ab.dataset.term, ab); }
    });
    // dymek słownika znika przy każdym kliknięciu (także w niego) – nie może zasłaniać przycisków
    document.addEventListener('pointerdown', (ev) => { if (!ev.target.closest('abbr[data-term]')) this.glossary.classList.add('hidden'); }, true);
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
    this.opts.onFinish?.();
  }

  #render(step, i) {
    const n = this.progress.steps.length;
    this.box.querySelector('.tut-step').textContent = `Krok ${i + 1}/${n}`;
    this.box.querySelector('.tut-title').textContent = step.title;
    this.box.querySelector('.tut-body').innerHTML = step.text + (step.tip ? `<p class="tut-hint">${step.tip}</p>` : '');
    this.box.querySelector('.tut-next').classList.toggle('hidden', !step.info);
    this.box.querySelector('.tut-skip').classList.toggle('hidden', !!step.info);
    this.box.querySelector('.tut-show').classList.toggle('hidden', !step.anchor);
    this.box.classList.toggle('waiting', !step.info);
    this.box.dataset.step = step.id;
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

  #reposition() {
    this.lastPos = performance.now();
    const box = this.box;
    if (box.classList.contains('hidden')) return;
    const W = Math.min(360, window.innerWidth - 16), M = 10;
    box.style.width = `${W}px`;
    const bh = box.offsetHeight || 200;
    const t = this.target;
    const r = t?.getBoundingClientRect?.();
    if (!r || (r.width === 0 && r.height === 0)) {
      // bez kotwicy: dół ekranu, po prawej
      box.style.left = `${window.innerWidth - W - M}px`;
      box.style.top = `${Math.max(M, window.innerHeight - bh - 52)}px`;
      box.dataset.side = 'none';
      return;
    }
    let top, side;
    if (r.bottom + M + bh <= window.innerHeight) { top = r.bottom + M; side = 'below'; }
    else if (r.top - M - bh >= 0) { top = r.top - M - bh; side = 'above'; }
    else { top = Math.max(M, Math.min(window.innerHeight - bh - M, r.top)); side = 'beside'; }
    let left = r.left + r.width / 2 - W / 2;
    if (side === 'beside') left = r.right + M + W <= window.innerWidth ? r.right + M : Math.max(M, r.left - M - W);
    left = Math.max(M, Math.min(window.innerWidth - W - M, left));
    box.style.left = `${left}px`; box.style.top = `${top}px`;
    box.dataset.side = side;
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
  }
}
