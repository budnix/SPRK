import { normalizeStation } from './normalize.js';
import { EventBus } from '../core/EventBus.js';
import { Clock } from '../core/Clock.js';
import { Random, DISRUPTION_LEVELS } from '../core/Random.js';
import { Interlocking } from './Interlocking.js';
import { LineBlock } from './Block.js';
import { Traffic } from './Traffic.js';
import { Faults } from './Faults.js';
import { Comms } from './Comms.js';
import { Score } from './Score.js';
import { AutoOperator } from './Operator.js';
import { validateStation } from './validate.js';
import { getSrk } from '../srk/registry.js';

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
    this.station = normalizeStation(station); // łącznice: osobny odcinek izolowany na każdą zwrotnicę
    this.scenario = Simulation.resolveScenario(station, opts.scenario);
    // System sterowania ruchem (strategia): wymuszony przez scenariusz (samouczek), z ustawień gracza lub ze stacji
    this.srk = getSrk(this.scenario.srk || opts.srk || station.srk);
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
    this.ilk = new Interlocking(this.station, this.bus, {
      blockGate: (exitId) => this.blocks.get(exitId)?.gate() ?? { ok: true },
      ...this.srk.model,
    });
    // nastawiony przebieg wyjazdowy „zajmuje” kierunek blokady samoczynnej – sąsiad nie zmieni go pod naszym pociągiem
    this.bus.on('route', (r) => { if (r.state === 'set') { const route = this.ilk.routes.get(r.id); if (route?.exit) this.blocks.get(route.exit)?.commitOut(); } });
    const timetable = this.scenario.timetable
      ? this.scenario.timetable
      : (this.scenario.trains ? station.timetable.filter((t) => this.scenario.trains.includes(t.nr)) : station.timetable);
    this.traffic = new Traffic(this.station, this.ilk, this.blocks, this.bus, { rng: this.rng, level: this.level, timetable, tasks: this.scenario.tasks });
    this.comms = new Comms(this);
    this.faults = new Faults(this, this.rng, this.level, this.scenario.faults || []);
    this.closed = (this.scenario.closedSections || []).map((c) => ({ section: c.section, from: c.from ? Clock.parse(c.from) : 0, to: c.to ? Clock.parse(c.to) : Infinity, active: false }));
    this.extraTrainsPlanned = this.#planExtraTrains();
    this.ilk.time = this.clock.time;
    for (const b of this.blocks.values()) b.time = this.clock.time;
    this.traffic.start(this.clock.time);
    this.ended = false;
    this.endReason = null;   // 'all-done' | 'time' | 'manual' (samouczek)
    this.endedAt = null;
    this.startTime = this.clock.time;
    this.lateHinted = false; // podpowiedź „rozkład wyczerpany”, gdy zmiana nie kończy się sama
    // w misji (samouczek) zmiana nie kończy się sama po ostatnim pociągu – kończy ją ostatni krok samouczka (endShift)
    this.autoEnd = !this.scenario.tutorial;
    this.accum = 0;
    // Okręgi nastawcze: gracz obsługuje jeden okręg, pozostałe prowadzi automat
    this.districts = station.districts || null;
    this.playerDistrict = this.districts ? (opts.district && (opts.district === 'both' || this.districts[opts.district]) ? opts.district : Object.keys(this.districts)[0]) : null;
    this.commands = [];
    this.operators = [];
    if (this.districts && this.playerDistrict !== 'both') {
      for (const [id, d] of Object.entries(this.districts)) {
        if (id === this.playerDistrict) continue;
        const role = d.role === 'dysponująca' ? 'dispatcher' : 'executive';
        this.operators.push(new AutoOperator(this, { district: id, role, playerDistrict: this.playerDistrict, delay: 6 }));
      }
    }
    if (this.scenario.description) this.bus.emit('log', { time: this.clock.time, level: 'info', msg: `Scenariusz: ${this.scenario.name} – ${this.scenario.description}` });
  }

  /** Okręg, do którego należy sygnalizator (wg kolumny kostki). */
  districtOf(signalId) {
    if (!this.districts) return null;
    const t = this.ilk.topo.signals.get(signalId);
    if (!t) return null;
    return this.#districtAtX(t.x);
  }

  exitDistrict(exitId) {
    if (!this.districts) return null;
    const e = this.station.exits[exitId];
    return e ? this.#districtAtX(e.tile.x) : null;
  }

  #districtAtX(x) {
    for (const [id, d] of Object.entries(this.districts)) if (x >= d.cols[0] && x <= d.cols[1]) return id;
    return null;
  }

  /** Czy gracz może obsługiwać element (przycisk) w tym okręgu. */
  playerControls(districtId) {
    return !this.districts || this.playerDistrict === 'both' || this.playerDistrict === districtId;
  }

  /**
   * Polecenie nastawcze między nastawniami (Ir-1): { kind: 'accept'|'dispatch', nr, track?, exit?, from, to, text }.
   * Wydaje je dyżurny dysponujący (gracz lub automat); wykonuje nastawnia wykonawcza (automat lub gracz).
   */
  issueCommand(cmd) {
    const c = { id: this.commands.length + 1, time: this.clock.time, status: 'pending', ...cmd };
    if (!c.text) {
      const ex = this.station.exits;
      c.text = c.kind === 'accept'
        ? `Przyjąć pociąg nr ${c.nr} na tor ${c.track}.`
        : `Wyprawić pociąg nr ${c.nr} do ${ex[c.exit]?.name} (${ex[c.exit]?.label || c.exit}).`;
    }
    this.commands.push(c);
    this.bus.emit('comms', { time: this.clock.time, from: c.from, kind: 'order', text: `Polecenie nr ${c.id}: ${c.text}`, nr: c.nr });
    this.bus.emit('log', { time: this.clock.time, level: 'info', msg: `Polecenie ${c.from} → ${c.to}: ${c.text}` });
    this.bus.emit('commands', this.commands);
    return c;
  }

  /** Wykrywanie wykonania poleceń przez gracza-nastawniczego (przebieg nastawiony zgodnie z poleceniem). */
  #checkCommands(t) {
    for (const c of this.commands) {
      if (c.status !== 'pending' || c.to !== this.playerDistrict) continue;
      const e = this.traffic.timetable().find((x) => String(x.nr) === String(c.nr));
      if (!e) continue;
      let done = false;
      for (const act of this.ilk.active.values()) {
        const r = act.route;
        if (r.kind !== 'train') continue;
        if (c.kind === 'accept' && e.from) {
          const app = this.ilk.topo.trackAt(this.station.exits[e.from].tile.x, this.station.exits[e.from].tile.y).section;
          const last = r.sections[r.sections.length - 1];
          if (r.approach === app && String(this.ilk.sections.get(last)?.track) === String(c.track)) done = true;
        }
        if (c.kind === 'dispatch' && r.exit === c.exit && e.train && !e.train.finished) {
          const cur = [...e.train.occupiedSections()].map((sid) => this.ilk.sections.get(sid)?.track).find(Boolean);
          if (String(this.ilk.sections.get(r.approach)?.track) === String(cur)) done = true;
        }
      }
      if (done) {
        c.status = 'done'; c.doneAt = t;
        const late = Math.round((t - c.time) / 60);
        this.bus.emit('score', { time: t, code: 'command', points: late > 4 ? -5 : 2, msg: `Polecenie nr ${c.id} wykonane${late > 4 ? ` z opóźnieniem ${late} min` : ''}: ${c.text}` });
        this.bus.emit('commands', this.commands);
      } else if (t - c.time > 12 * 60 && !c.overdue) {
        c.overdue = true;
        this.bus.emit('score', { time: t, code: 'command-late', points: -10, msg: `Polecenie nr ${c.id} niewykonane od 12 min: ${c.text}` });
        this.bus.emit('comms', { time: t, from: c.from, kind: 'order', text: `Ponawiam polecenie nr ${c.id}: ${c.text}`, nr: c.nr });
      }
    }
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
      for (const op of this.operators) op.tick();
      if (this.commands.length) this.#checkCommands(t);
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

  /** Zmiana kończy się sama, gdy ostatni pociąg rozkładu jest wyprawiony na szlak (nie trzeba czekać, aż dojedzie
   *  do sąsiada) i zadania manewrowe są wykonane albo przepadły; inaczej – o `endTime` scenariusza. */
  #checkEnd() {
    if (this.ended) return;
    const tt = this.traffic.timetable();
    const tasks = this.traffic.tasks || [];
    const trainsDone = tt.length && tt.every(Traffic.isDone);
    const tasksDone = tasks.every((t) => t.done || t.failed);
    const timeUp = this.endTime && this.clock.time >= this.endTime;
    if ((trainsDone && tasksDone && this.autoEnd) || timeUp) { this.endShift(timeUp && !(trainsDone && tasksDone) ? 'time' : 'all-done'); return; }
    // rozkład wyczerpany, a zmiana trwa – jedna podpowiedź, co ją trzyma (pociąg na stacji, zadanie manewrowe)
    if (!this.lateHinted && this.autoEnd) {
      const last = Math.max(...tt.map((e) => Math.max(e.arrTime ?? 0, e.depTime ?? 0)), ...tasks.map((t) => t.deadlineTime || 0));
      if (this.clock.time >= last + 3 * 60) {
        this.lateHinted = true;
        const left = [...tt.filter((e) => !Traffic.isDone(e)).map((e) => `${e.label ?? e.nr} (${e.status})`), ...tasks.filter((t) => !t.done && !t.failed).map((t) => `zadanie: ${t.text}`)];
        this.bus.emit('log', { time: this.clock.time, level: 'warn', msg: `Rozkład wyczerpany – do zakończenia zmiany: ${left.join('; ')}` });
      }
    }
  }

  /** Koniec zmiany: ocena końcowa i raport (zdarzenie `shift-end`); wołane też przez samouczek po ostatnim kroku. */
  endShift(reason = 'manual') {
    if (this.ended) return;
    this.ended = true;
    this.endReason = reason;
    this.endedAt = this.clock.time;
    this.#finalScore();
    this.bus.emit('shift-end', this.report());
  }

  #finalScore() {
    for (const e of this.traffic.timetable()) {
      if (!Traffic.isDone(e)) this.bus.emit('score', { time: this.clock.time, code: 'unfinished', points: -10, msg: `Pociąg ${e.nr} nie obsłużony do końca zmiany (${e.status})` });
    }
  }

  /** Pełny raport zmiany (także w trakcie): ocena, pociągi, zadania, liczniki, dane zmiany. */
  report() {
    const counters = { ...this.ilk.counters, dPo: 0, dKo: 0 };
    for (const b of this.blocks.values()) { counters.dPo += b.counters?.dPo || 0; counters.dKo += b.counters?.dKo || 0; }
    return this.score.report(this.traffic, {
      counters, ended: this.ended, endReason: this.endReason, endedAt: this.endedAt, now: this.clock.time, startTime: this.startTime,
      station: this.station.name, scenario: this.scenario.name, srk: this.srk.short || this.srk.name, level: this.level.label, seed: this.seed,
      district: this.districts ? (this.playerDistrict === 'both' ? 'oba okręgi' : this.playerDistrict) : null,
    });
  }

  /** Koniec przebiegu złożonego (stanowisko komputerowe): jak press(end), ale z łańcuchem przez semafory pośrednie. */
  pressCompound(ref) {
    if (!this.#refAllowed(ref)) return { ok: false, reason: 'Element w okręgu obsługiwanym przez drugą nastawnię' };
    return this.ilk.pressCompound(ref);
  }

  /** Naciśnięcie przycisku – ref jak w Interlocking.press lub { kind:'block', exit, btn }. */
  press(ref) {
    if (!this.#refAllowed(ref)) return { ok: false, reason: 'Element w okręgu obsługiwanym przez drugą nastawnię' };
    if (ref.kind === 'block') return this.blocks.get(ref.exit)?.press(ref.btn) ?? { ok: false };
    return this.ilk.press(ref);
  }

  #refAllowed(ref) {
    if (!this.districts || this.playerDistrict === 'both') return true;
    if (ref.kind === 'block') return this.playerControls(this.exitDistrict(ref.exit));
    if (ref.kind === 'signal') return this.playerControls(this.districtOf(ref.id));
    if (ref.kind === 'point') { const t = this.ilk.topo.points.get(ref.id); return this.playerControls(this.#districtAtX(t.x)); }
    if (ref.kind === 'derailer') { const t = this.ilk.topo.derailers.get(ref.id); return this.playerControls(this.#districtAtX(t.x)); }
    if (ref.kind === 'end') { const t = this.ilk.topo.endButtons.get(ref.id); return t ? this.playerControls(this.#districtAtX(t.x)) : true; }
    return true;
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
