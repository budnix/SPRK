import { EventBus } from '../core/EventBus.js';
import { Clock } from '../core/Clock.js';
import { Interlocking } from './Interlocking.js';
import { LineBlock } from './Block.js';
import { Traffic } from './Traffic.js';
import { validateStation } from './validate.js';

/**
 * Symulacja: spina zegar, zależności (Interlocking), blokady liniowe i ruch.
 */
export class Simulation {
  constructor(station, opts = {}) {
    const v = validateStation(station);
    if (v.errors.length) throw new Error(`Definicja stacji niepoprawna:\n${v.errors.join('\n')}`);
    this.station = station;
    this.bus = new EventBus();
    this.clock = new Clock(opts.startTime ?? station.startTime ?? '06:00', opts.speed ?? 1);
    this.blocks = new Map();
    for (const [id, e] of Object.entries(station.exits || {})) this.blocks.set(id, new LineBlock(id, e, this.bus));
    this.ilk = new Interlocking(station, this.bus, {
      blockGate: (exitId) => this.blocks.get(exitId)?.gate() ?? { ok: true },
    });
    this.traffic = new Traffic(station, this.ilk, this.blocks, this.bus);
    this.ilk.time = this.clock.time;
    for (const b of this.blocks.values()) b.time = this.clock.time;
    this.traffic.start(this.clock.time);
    this.accum = 0;
  }

  /** Krok symulacji o `realDt` sekund czasu rzeczywistego. */
  step(realDt) {
    const dt = this.clock.advance(realDt);
    if (dt <= 0) return;
    // Stały krok wewnętrzny (max 0.5 s symulacji) dla stabilności ruchu
    let remaining = dt;
    while (remaining > 0) {
      const h = Math.min(0.5, remaining);
      remaining -= h;
      const t = this.clock.time - remaining;
      for (const b of this.blocks.values()) b.tick(t);
      this.traffic.tick(h, t);
      this.ilk.tick(t);
    }
    this.bus.emit('tick', { time: this.clock.time });
  }

  /** Naciśnięcie przycisku – ref jak w Interlocking.press lub { kind:'block', exit, btn }. */
  press(ref) {
    if (ref.kind === 'block') return this.blocks.get(ref.exit)?.press(ref.btn) ?? { ok: false };
    return this.ilk.press(ref);
  }

  pull(ref) {
    if (ref.kind === 'block') return { ok: false };
    return this.ilk.pull(ref);
  }

  snapshot() {
    return {
      time: this.clock.time,
      interlocking: this.ilk.snapshot(),
      blocks: [...this.blocks.values()].map((b) => b.snapshot()),
      trains: this.traffic.trains.map((t) => t.snapshot()),
    };
  }
}
