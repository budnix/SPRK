import { EventBus } from '../core/EventBus.js';
import { Clock } from '../core/Clock.js';
import { Random, DISRUPTION_LEVELS } from '../core/Random.js';
import { Interlocking } from './Interlocking.js';
import { LineBlock } from './Block.js';
import { Traffic } from './Traffic.js';
import { Faults } from './Faults.js';
import { Comms } from './Comms.js';
import { Score } from './Score.js';
import { validateStation } from './validate.js';

/**
 * Symulacja: spina zegar, zależności (Interlocking), blokady liniowe, ruch, usterki,
 * łączność i ocenę zmiany.
 *
 * opts: { scenario: id | obiekt, disruptions: 'none'|'low'|'high', seed, startTime, speed }
 */
export class Simulation {
  constructor(station, opts = {}) {
    const v = validateStation(station);
    if (v.errors.length) throw new Error(`Definicja stacji niepoprawna:\n${v.errors.join('\n')}`);
    this.station = station;
    this.scenario = Simulation.resolveScenario(station, opts.scenario);
    this.bus = new EventBus();
    this.seed = opts.seed ?? Math.floor(Math.random() * 1e9);
    this.rng = new Random(this.seed);
    const levelId = this.scenario.disruptions ?? opts.disruptions ?? 'none';
    this.level = DISRUPTION_LEVELS[levelId] || DISRUPTION_LEVELS.none;
    this.levelId = levelId;
    this.clock = new Clock(opts.startTime ?? this.scenario.startTime ?? station.startTime ?? '06:00', opts.speed ?? 1);
    this.endTime = this.scenario.endTime ? Clock.parse(this.scenario.endTime) : null;
    this.score = new Score(this.bus);
    this.blocks = new Map();
    for (const [id, e] of Object.entries(station.exits || {})) this.blocks.set(id, new LineBlock(id, e, this.bus));
    this.ilk = new Interlocking(station, this.bus, {
      blockGate: (exitId) => this.blocks.get(exitId)?.gate() ?? { ok: true },
    });
    const timetable = this.scenario.timetable
      ? this.scenario.timetable
      : (this.scenario.trains ? station.timetable.filter((t) => this.scenario.trains.includes(t.nr)) : station.timetable);
    this.traffic = new Traffic(station, this.ilk, this.blocks, this.bus, { rng: this.rng, level: this.level, timetable, tasks: this.scenario.tasks });
    this.comms = new Comms(this);
    this.faults = new Faults(this, this.rng, this.level, this.scenario.faults || []);
    this.closed = (this.scenario.closedSections || []).map((c) => ({ section: c.section, from: c.from ? Clock.parse(c.from) : 0, to: c.to ? Clock.parse(c.to) : Infinity, active: false }));
    this.extraTrainsPlanned = this.#planExtraTrains();
    this.ilk.time = this.clock.time;
    for (const b of this.blocks.values()) b.time = this.clock.time;
    this.traffic.start(this.clock.time);
    this.ended = false;
    this.accum = 0;
    if (this.scenario.description) this.bus.emit('log', { time: this.clock.time, level: 'info', msg: `Scenariusz: ${this.scenario.name} – ${this.scenario.description}` });
  }

  static resolveScenario(station, sc) {
    const list = station.scenarios || [];
    if (sc && typeof sc === 'object') return sc;
    return list.find((x) => x.id === sc) || list[0] || { id: 'zmiana', name: 'Zmiana', startTime: station.startTime };
  }

  /** Pociągi nadzwyczajne (poziom „duże”): kopia losowego pociągu z rozkładu przesunięta w czasie. */
  #planExtraTrains() {
    const out = [];
    if (!this.level.extraTrains || !this.station.timetable.length) return out;
    for (let i = 0; i < this.level.extraTrains; i++) {
      const base = this.rng.pick(this.station.timetable.filter((t) => t.from && t.to));
      if (!base) continue;
      const shift = this.rng.int(25, 70) * 60;
      const ref = Clock.parse(base.arr || base.dep) + shift;
      const at = ref - 25 * 60;
      const def = { ...base, nr: base.nr + 1000, name: `${base.name} nadzwyczajny`, arr: Clock.format(ref), dep: base.dep ? Clock.format(Clock.parse(base.dep) + shift) : undefined };
      out.push({ at, def, done: false });
    }
    return out;
  }

  /** Krok symulacji o `realDt` sekund czasu rzeczywistego. */
  step(realDt) {
    const dt = this.clock.advance(realDt);
    if (dt <= 0) { this.bus.emit('tick', { time: this.clock.time, paused: true }); return; }
    let remaining = dt;
    while (remaining > 0) {
      const h = Math.min(0.5, remaining);
      remaining -= h;
      const t = this.clock.time - remaining;
      this.#closedSections(t);
      for (const x of this.extraTrainsPlanned) {
        if (!x.done && t >= x.at) {
          x.done = true;
          const e = this.traffic.addTrain(x.def);
          const from = this.station.exits[e.from]?.name;
          this.bus.emit('comms', { time: t, from, kind: 'info', text: `Pociąg nadzwyczajny nr ${e.nr} ${e.name}, przyjazd ok. ${e.arr}, kierunek ${this.station.exits[e.to]?.name}.` });
          this.bus.emit('log', { time: t, level: 'warn', msg: `Pociąg nadzwyczajny ${e.nr} (${e.name}) dodany do rozkładu` });
        }
      }
      this.faults.tick(t);
      for (const b of this.blocks.values()) b.tick(t);
      this.traffic.tick(h, t);
      this.ilk.tick(t);
      this.comms.tick(t);
    }
    this.bus.emit('tick', { time: this.clock.time });
    this.#checkEnd();
  }

  #closedSections(t) {
    for (const c of this.closed) {
      const active = t >= c.from && t < c.to;
      if (active !== c.active) {
        c.active = active;
        const s = this.ilk.sections.get(c.section);
        if (s) { s.closed = active; this.bus.emit('section', s); }
        this.bus.emit('log', { time: t, level: 'warn', msg: `Odcinek ${c.section} ${active ? 'zamknięty dla ruchu' : 'otwarty dla ruchu'}` });
      }
    }
  }

  #checkEnd() {
    if (this.ended) return;
    const tt = this.traffic.timetable();
    const isDone = (e) => e.status === 'u sąsiada' || e.status === 'zakończył bieg' || e.status.startsWith('przekazany');
    const allDone = tt.length && tt.every(isDone);
    const timeUp = this.endTime && this.clock.time >= this.endTime;
    if (allDone || timeUp) {
      this.ended = true;
      this.#finalScore();
      this.bus.emit('shift-end', this.score.report(this.traffic));
    }
  }

  #finalScore() {
    for (const e of this.traffic.timetable()) {
      if (e.status !== 'u sąsiada' && e.status !== 'zakończył bieg' && !e.status.startsWith('przekazany')) {
        this.bus.emit('score', { time: this.clock.time, code: 'unfinished', points: -10, msg: `Pociąg ${e.nr} nie dojechał do końca zmiany (${e.status})` });
      }
    }
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
      seed: this.seed,
      interlocking: this.ilk.snapshot(),
      blocks: [...this.blocks.values()].map((b) => b.snapshot()),
      trains: this.traffic.trains.map((t) => t.snapshot()),
      score: this.score.total,
    };
  }
}
