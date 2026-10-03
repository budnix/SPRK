import { Clock } from '../core/Clock.js';
import { FAULTS, FAULT_TYPES } from './faults/types.js';

/**
 * Harmonogram usterek urządzeń srk i zakłóceń – generowanych losowo (poziom trudności) lub zadanych w scenariuszu.
 * Każda usterka ma czas wystąpienia (`at`) i trwania (`duration`); co się dzieje przy jej początku i końcu, czego
 * dotyczy i czy się losuje – mówi jej rodzaj w `src/model/faults/types.js` (jedno miejsce na rodzaj). Tu: kiedy
 * usterka zaczyna się i kończy, nakładanie się dwóch usterek jednego elementu, losowanie. `weights` – wagi rodzajów przy
 * losowaniu (pole scenariusza `faultWeights`, np. zimą częściej napęd zwrotnicy); bez nich każdy rodzaj tak samo.
 */
export class Faults {
  constructor(sim, rng, level, scripted = [], weights = null) {
    this.sim = sim;
    this.rng = rng;
    this.weights = weights;
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
    // koniec zmiany w sekundach (`sim.endTime`); `scenario.endTime` to napis „GG:MM” – odejmowanie od niego dawało NaN
    // i usterka z takim czasem nie pojawiała się nigdy
    const end = (sim.endTime ?? sim.clock.time + 2 * 3600) - 15 * 60;
    if (end <= start) return;
    // rodzaje, które się losują na tej stacji (np. blok przebiegowy – tylko nastawnia mechaniczna), w kolejności rodzajów
    const random = FAULT_TYPES.filter((t) => FAULTS[t].pool(sim) != null);
    for (let i = 0; i < n; i++) {
      // bez wag – jak dotąd (to samo ziarno, te same usterki)
      const type = this.weights ? this.rng.pickWeighted(random, (t) => this.weights[t] ?? 1) : this.rng.pick(random);
      const pool = FAULTS[type].pool(sim);
      if (!pool.length) continue;
      this.list.push({
        type, target: this.rng.pick(pool),
        at: this.rng.int(start, end), duration: this.rng.int(5, 15) * 60,
        active: false, done: false, scripted: false,
      });
    }
  }

  /**
   * Usterka dopisana w trakcie zmiany – jak w scenariuszu (`at`: „GG:MM” albo sekundy, `duration` w minutach). Zaczyna się
   * przy najbliższym takcie po `at`; bez `at` – przy najbliższym takcie.
   */
  add(f) {
    const n = this.#normalize({ ...f, at: f.at ?? this.sim.clock.time });
    this.list.push(n);
    this.list.sort((a, b) => a.at - b.at);
    return n;
  }

  /** Aktywne usterki (do panelu). */
  active() {
    return this.list.filter((f) => f.active);
  }

  tick(time) {
    this.time = time;
    for (const f of this.list) {
      const kind = FAULTS[f.type];
      if (kind?.arm && !f.active && !f.done && time >= f.at) kind.arm(this.sim, f);
      if (!f.active && !f.done && time >= f.at && (kind?.ready ? kind.ready(this.sim, f) : true)) {
        f.active = true; f.since = time;
        // druga usterka tego samego elementu, gdy pierwsza trwa: element już jest niesprawny – nie ustawia się go od nowa
        // (np. blokada nie gubi zapytania o drogę); rodzaj może przedłużyć usterkę (napęd zwrotnicy – `overlap`)
        if (!this.#twin(f)) this.#apply(f);
        else kind?.overlap?.(this.sim, f, time);
      }
      // naprawa – dopiero po ostatniej z nakładających się usterek elementu
      if (f.active && time >= (f.since ?? f.at) + f.duration) { f.active = false; f.done = true; if (!this.#twin(f)) this.#clear(f); }
      if (f.active) kind?.during?.(this.sim, f, this.#ctx(f));
    }
  }

  /** Inna czynna usterka tego samego rodzaju na tym samym elemencie (losowanie i scenariusz mogą je nałożyć). */
  #twin(f) {
    return this.list.find((x) => x !== f && x.active && x.type === f.type && x.target === f.target) ?? null;
  }

  #log(level, msg) {
    this.sim.bus.emit('log', { time: this.time, level, msg });
  }

  /** Kontekst rodzaju usterki: chwila, dziennik i wcześniejszy koniec usterki (np. po przejeździe kontrolnym). */
  #ctx(f) {
    return {
      time: this.time,
      log: (level, msg) => this.#log(level, msg),
      finish: () => { f.active = false; f.done = true; this.#clear(f); },
    };
  }

  #apply(f) {
    const kind = FAULTS[f.type];
    if (kind?.apply(this.sim, f, this.#ctx(f))) this.sim.bus.emit('alarm', { type: 'fault', fault: f });
  }

  #clear(f) {
    FAULTS[f.type]?.clear(this.sim, f, this.#ctx(f));
  }
}
