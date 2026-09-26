/**
 * Silnik misji (bez DOM): pilnuje kolejności kroków samouczka, sprawdza warunki ukończenia na stanie
 * symulacji i zdarzeniach z szyny, wstrzymuje zegar na krokach informacyjnych. Warstwa UI (Tutorial.js)
 * tylko pokazuje bieżący krok i woła `next()` po kliknięciu „Dalej”.
 */
export class MissionProgress {
  /**
   * @param sim Simulation
   * @param steps kroki z missions.js: { id, title, text, anchor, info?, done?(sim, ctx), wrong?(sim, ctx), tip? }
   * @param opts { onStep(step, index), onDone(), onFeedback(msg) }
   */
  constructor(sim, steps, opts = {}) {
    this.sim = sim;
    this.steps = steps;
    this.opts = opts;
    this.index = -1;
    this.finished = false;
    this.ctx = { seen: new Set(), sim };
    this.lastFeedback = null;
    this.#listen();
  }

  get step() { return this.steps[this.index] || null; }

  start() {
    this.#enter(0);
  }

  /** „Dalej” na kroku informacyjnym (lub pominięcie kroku). */
  next() {
    if (this.finished) return;
    const s = this.step;
    if (s?.info && this.pausedByUs) { this.sim.clock.paused = false; this.pausedByUs = false; }
    this.#enter(this.index + 1);
  }

  /** Sprawdzenie warunku bieżącego kroku – wołane po każdym ticku / zdarzeniu. */
  check() {
    const s = this.step;
    if (!s || this.finished || s.info) return;
    if (s.done?.(this.sim, this.ctx)) { this.ctx.seen.add(`step:${s.id}`); this.#enter(this.index + 1); return; }
    const w = s.wrong?.(this.sim, this.ctx) || null;
    if (w !== this.lastFeedback) { this.lastFeedback = w; this.opts.onFeedback?.(w); }
  }

  #enter(i) {
    this.lastFeedback = null;
    if (i >= this.steps.length) {
      this.finished = true; this.index = this.steps.length;
      this.opts.onDone?.();
      return;
    }
    this.index = i;
    const s = this.steps[i];
    for (const k of [...this.ctx.seen]) if (k.startsWith('cancel:')) this.ctx.seen.delete(k); // odwołania liczą się tylko w bieżącym kroku
    // krok informacyjny: zatrzymaj zegar, żeby początkujący mógł spokojnie przeczytać
    if (s.info && !this.sim.clock.paused) { this.sim.clock.paused = true; this.pausedByUs = true; }
    else this.pausedByUs = false;
    this.opts.onStep?.(s, i);
    // warunek mógł być spełniony już wcześniej (np. gracz wyprzedził samouczek)
    if (!s.info && s.done?.(this.sim, this.ctx)) { this.ctx.seen.add(`step:${s.id}`); this.#enter(i + 1); }
  }

  #listen() {
    const bus = this.sim.bus, seen = this.ctx.seen;
    // odwołanie / wygaśnięcie uzbrojenia sygnalizatora bez rozpoczęcia przebiegu: 'armed' null, po którym
    // (do najbliższego ticku) nie przyszło zdarzenie przebiegu od tego sygnalizatora
    let lastArmed = null, maybeCancel = null;
    bus.on('armed', (a) => {
      if (a) { seen.add(`armed:${a.id}`); lastArmed = a; return; }
      if (lastArmed?.kind === 'signal') maybeCancel = lastArmed.id;
      lastArmed = null;
    });
    bus.on('route', (r) => { seen.add(`route:${r.id}:${r.state}`); if (maybeCancel && r.id.startsWith(`${maybeCancel}-`)) maybeCancel = null; });
    bus.on('tick', () => { if (maybeCancel) { seen.add(`cancel:${maybeCancel}`); maybeCancel = null; } });
    bus.on('point', (p) => { if (p.individualLock) seen.add(`lock:${p.id}`); if (p.position === '-') seen.add(`minus:${p.id}`); });
    bus.on('signal', (s) => { if (s.aspect === 'Sz') seen.add(`sz:${s.id}`); });
    bus.on('block', (b) => { if (b.request === 'theirs') seen.add(`request:${b.id}`); if (b.direction === 'in') seen.add(`poz:${b.id}`); if (b.direction === 'out' && b.permission) seen.add(`wbl:${b.id}`); if (b.koPending) seen.add(`ko-pending:${b.id}`); });
    bus.on('comms-log', (m) => { if (m.dir === 'out') seen.add(`comms:${m.text}`); });
    bus.on('tick', () => this.check());
    for (const ev of ['route', 'block', 'signal', 'point', 'armed', 'timetable', 'tasks', 'comms-log']) bus.on(ev, () => this.check());
  }
}
