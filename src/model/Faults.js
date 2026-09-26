import { Clock } from '../core/Clock.js';

/**
 * Usterki urządzeń srk i zakłócenia – generowane losowo (poziom trudności) lub
 * zadane w scenariuszu. Każda usterka ma czas wystąpienia, czas trwania,
 * `apply(sim)` i `clear(sim)`.
 *
 * Typy:
 *  - signal-fail     – semafor nie podaje sygnału zezwalającego (pozostaje Sz i rozkaz „S”)
 *  - point-control   – po przestawieniu zwrotnica nie odzyskuje kontroli przez pewien czas
 *  - false-occupancy – odcinek wskazuje zajętość bez pociągu (pozostaje Sz po potwierdzeniu)
 *  - block-fail      – blokada liniowa bez łączności elektrycznej: zapowiadanie telefoniczne
 */
export const FAULT_TYPES = ['signal-fail', 'point-control', 'false-occupancy', 'block-fail'];

export class Faults {
  constructor(sim, rng, level, scripted = []) {
    this.sim = sim;
    this.rng = rng;
    this.list = [];
    this.time = sim.clock.time;
    for (const f of scripted) this.list.push(this.#normalize(f));
    if (level && level.faults[1] > 0) this.#generate(level);
    this.list.sort((a, b) => a.at - b.at);
  }

  #normalize(f) {
    return {
      type: f.type, target: f.target,
      at: typeof f.at === 'string' ? Clock.parse(f.at) : f.at,
      duration: (f.duration ?? 10) * 60,
      active: false, done: false, scripted: true,
    };
  }

  #generate(level) {
    const sim = this.sim;
    const n = this.rng.int(level.faults[0], level.faults[1]);
    const start = sim.clock.time + 8 * 60;
    const end = (sim.scenario?.endTime ?? sim.clock.time + 2 * 3600) - 15 * 60;
    if (end <= start) return;
    const semafory = [...sim.ilk.signals.values()].filter((s) => s.kind === 'semafor').map((s) => s.id);
    const points = [...sim.ilk.points.keys()];
    const sections = [...sim.ilk.sections.values()].filter((s) => s.kind !== 'approach').map((s) => s.id);
    const exits = [...sim.blocks.keys()];
    for (let i = 0; i < n; i++) {
      const type = this.rng.pick(FAULT_TYPES);
      const pool = { 'signal-fail': semafory, 'point-control': points, 'false-occupancy': sections, 'block-fail': exits }[type];
      if (!pool.length) continue;
      this.list.push({
        type, target: this.rng.pick(pool),
        at: this.rng.int(start, end), duration: this.rng.int(5, 15) * 60,
        active: false, done: false, scripted: false,
      });
    }
  }

  /** Aktywne usterki (do panelu). */
  active() {
    return this.list.filter((f) => f.active);
  }

  tick(time) {
    this.time = time;
    for (const f of this.list) {
      if (!f.active && !f.done && time >= f.at) { f.active = true; this.#apply(f); }
      if (f.active && time >= f.at + f.duration) { f.active = false; f.done = true; this.#clear(f); }
    }
  }

  #log(level, msg) {
    this.sim.bus.emit('log', { time: this.time, level, msg });
  }

  #apply(f) {
    const sim = this.sim;
    switch (f.type) {
      case 'signal-fail': {
        const s = sim.ilk.signals.get(f.target);
        if (!s) return;
        s.failed = true; sim.ilk.refreshSignals();
        this.#log('alarm', `USTERKA: semafor ${f.target} nie podaje sygnału zezwalającego (żarówka / obwód). Użyj Sz lub rozkazu „S”.`);
        sim.bus.emit('alarm', { type: 'fault', fault: f });
        break;
      }
      case 'point-control': {
        const p = sim.ilk.points.get(f.target);
        if (!p) return;
        p.faultUntil = f.at + f.duration;
        this.#log('alarm', `USTERKA: zwrotnica ${f.target} – po przestawieniu nie uzyska kontroli położenia (napęd). Wezwano automatyka.`);
        sim.bus.emit('alarm', { type: 'fault', fault: f });
        break;
      }
      case 'false-occupancy': {
        const s = sim.ilk.sections.get(f.target);
        if (!s) return;
        s.forced = true; sim.ilk.updateOccupancy(sim.traffic.currentOccupancy());
        this.#log('alarm', `USTERKA: odcinek ${f.target} wskazuje zajętość bez pociągu (obwód torowy). Po sprawdzeniu toru – Sz.`);
        sim.bus.emit('alarm', { type: 'fault', fault: f });
        break;
      }
      case 'block-fail': {
        const b = sim.blocks.get(f.target);
        if (!b) return;
        b.setFault(true);
        this.#log('alarm', `USTERKA: blokada liniowa do ${b.neighbour} bez łączności – zapowiadanie telefoniczne (zakładka Łączność).`);
        sim.bus.emit('alarm', { type: 'fault', fault: f });
        break;
      }
      default:
    }
  }

  #clear(f) {
    const sim = this.sim;
    switch (f.type) {
      case 'signal-fail': {
        const s = sim.ilk.signals.get(f.target);
        if (s) { s.failed = false; sim.ilk.refreshSignals(); }
        this.#log('info', `Usterka semafora ${f.target} usunięta.`);
        break;
      }
      case 'point-control': {
        const p = sim.ilk.points.get(f.target);
        if (p) { p.faultUntil = 0; if (!p.moving && !p.control && !p.trailed) { p.control = true; sim.bus.emit('point', p); } }
        this.#log('info', `Zwrotnica ${f.target} – napęd naprawiony, kontrola położenia.`);
        break;
      }
      case 'false-occupancy': {
        const s = sim.ilk.sections.get(f.target);
        if (s) { s.forced = false; sim.ilk.updateOccupancy(sim.traffic.currentOccupancy()); }
        this.#log('info', `Odcinek ${f.target} – obwód torowy sprawny.`);
        break;
      }
      case 'block-fail': {
        const b = sim.blocks.get(f.target);
        if (b) b.setFault(false);
        this.#log('info', `Blokada liniowa do ${b?.neighbour} – łączność przywrócona.`);
        break;
      }
      default:
    }
  }
}
