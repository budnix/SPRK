import { normalizeStation } from './normalize.js';
import { EventBus } from '../core/EventBus.js';
import { Clock } from '../core/Clock.js';
import { Random, DISRUPTION_LEVELS } from '../core/Random.js';
import { Interlocking } from './Interlocking.js';
import { exitApproach, trainTrack } from './trainPaths.js';
import { LineBlock } from './Block.js';
import { Traffic } from './Traffic.js';
import { Faults } from './Faults.js';
import { Comms } from './Comms.js';
import { Score } from './Score.js';
import { AutoOperator } from './Operator.js';
import { validateStation } from './validate.js';
import { getSrk } from '../srk/registry.js';
import { ButtonProtocol } from '../srk/buttons.js';
import { SpecialCommand } from '../srk/special.js';
import { isHandled } from './timetable/phase.js';

const OTHER_DISTRICT = 'Element w okręgu obsługiwanym przez drugą nastawnię';

/**
 * Pociąg nadzwyczajny (poziom „duże”): kopia pociągu przelotowego z rozkładu stacji przesunięta o `shiftMin`…`shiftMax`
 * minut. Mieści się w zmianie (przyjęte): sąsiad zapowiada go `announce` s przed przyjazdem – nie przed startem zmiany –
 * a jego ostatnie zdarzenie (odjazd, przy przelocie przejazd) wypada co najmniej `endSlack` s przed końcem zmiany, żeby
 * dyżurny zdążył go obsłużyć (kara „nieobsłużony” tylko za pociąg, który dało się obsłużyć).
 */
export const EXTRA_TRAIN = { shiftMin: 25, shiftMax: 70, announce: 25 * 60, endSlack: 10 * 60 };

/**
 * Przesunięcia [min], przy których kopia pociągu `base` mieści się w zmianie od `start` do `end` [s] (`end` null – bez
 * końca): `{ lo, hi }` albo null, gdy żadne. Ta sama reguła w generatorze (`Simulation`) i w kontroli scenariusza.
 */
export function extraTrainShifts(base, start, end) {
  const first = Clock.parse(base.arr || base.dep), last = Clock.parse(base.dep || base.arr);
  const lo = Math.max(EXTRA_TRAIN.shiftMin, Math.ceil((start + EXTRA_TRAIN.announce - first) / 60));
  const hi = end == null ? EXTRA_TRAIN.shiftMax : Math.min(EXTRA_TRAIN.shiftMax, Math.floor((end - EXTRA_TRAIN.endSlack - last) / 60));
  return lo <= hi ? { lo, hi } : null;
}

/**
 * Symulacja: spina zegar, zależności (Interlocking), blokady liniowe, ruch, usterki,
 * łączność i ocenę zmiany.
 *
 * opts: { scenario: id | obiekt, disruptions: 'none'|'low'|'high', seed, startTime, speed, phoneRoutine: 'auto'|'manual' }
 */
export class Simulation {
  constructor(station, opts = {}) {
    const v = validateStation(station);
    if (v.errors.length) throw new Error(`Definicja stacji niepoprawna:\n${v.errors.join('\n')}`);
    this.station = normalizeStation(station); // łącznice: osobny odcinek izolowany na każdą zwrotnicę
    this.scenario = Simulation.resolveScenario(station, opts.scenario);
    // System sterowania ruchem (strategia): wg scenariusza, parametru `srk` (testy, porównania) albo stacji
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
    // rozmowy telefoniczne przy sprawnej blokadzie: 'auto' (domyślnie) albo 'manual' (ustawienie gracza)
    // samouczki uczą obsługi urządzeń – rozmowy idą w nich zawsze same
    this.phoneRoutine = opts.phoneRoutine === 'manual' && !this.scenario.tutorial ? 'manual' : 'auto';
    const nextTrain = (exitId) => this.traffic?.timetable().filter((e) => e.to === exitId && e.actualDep == null && e.phase !== 'at-neighbour')
      .sort((a, b) => (a.depTime ?? a.arrTime ?? 0) - (b.depTime ?? b.arrTime ?? 0))[0]?.nr ?? null;
    // każdy szlak ma własny ciąg losowy z ziarna zmiany – losowania blokady nie przesuwają opóźnień ani usterek
    Object.keys(station.exits || {}).forEach((id, i) => {
      const rng = new Random((Math.imul(this.seed, 0x9e3779b1) + (i + 1) * 0x85ebca6b) >>> 0);
      this.blocks.set(id, new LineBlock(id, station.exits[id], this.bus, { phoneRoutine: this.phoneRoutine, nextTrain, random: () => rng.next() }));
    });
    this.ilk = new Interlocking(this.station, this.bus, {
      blockGate: (exitId, mode, routeId) => this.blocks.get(exitId)?.gate(mode, routeId) ?? { ok: true },
      // sygnał wyjazdowy podany / przebieg z nim rozwiązany bez wyjazdu – przeciwwtórność liniowa Eap (Pwl)
      onExitSignal: (exitId, routeId, on, byFault) => { const b = this.blocks.get(exitId); if (b) { if (on) b.exitSignalGiven(routeId); else b.exitSignalCancelled(routeId, byFault); } },
      ...this.srk.model,
    });
    // obsługa przyciskami (press / pull): protokół systemu srk, domyślnie przyciski typu E
    this.buttons = this.ilk.attachInput(this.srk.input
      ? this.srk.input(this.ilk, this.bus, this.srk.model, { blocks: (exit) => this.blocks.get(exit) })
      : new ButtonProtocol(this.ilk, this.bus, { armTimeout: this.srk.model.armTimeout }));
    // obraz semafora wyjazdowego zależy od blokady (pozwolenie, Pwl, usterka łączności) – zmiana stanu blokady odświeża
    // sygnały; inaczej przebieg nastawiony przy usterce zostawał na „Stój” także po naprawie i pozwoleniu
    this.bus.on('block', () => this.ilk.refreshSignals());
    // nastawiony przebieg wyjazdowy „zajmuje” kierunek blokady samoczynnej – sąsiad nie zmieni go pod naszym pociągiem
    this.bus.on('route', (r) => {
      const route = this.ilk.routes.get(r.id);
      if (!route?.exit) return;
      if (r.state === 'set') this.blocks.get(route.exit)?.commitOut();
      else if (r.state === 'released') this.blocks.get(route.exit)?.releaseCommit(); // bez pociągu: blokada nie zajęta
    });
    const timetable = this.scenario.timetable
      ? this.scenario.timetable
      : (this.scenario.trains ? station.timetable.filter((t) => this.scenario.trains.includes(t.nr)) : station.timetable);
    this.traffic = new Traffic(this.station, this.ilk, this.blocks, this.bus, { rng: this.rng, seed: this.seed, level: this.level, timetable, tasks: this.scenario.tasks });
    this.special = new SpecialCommand(); // polecenie specjalne stanowiska komputerowego (Ie-104.1 §11)
    this.comms = new Comms(this);
    this.faults = new Faults(this, this.rng, this.level, this.scenario.faults || []);
    this.traffic.faultList = () => this.faults.list; // usterki uzasadniające decyzje dyżurnego (np. inny tor)
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
      const e = this.traffic.entry(c.nr);
      if (!e) continue;
      let done = false;
      for (const set of this.ilk.routesSet()) {
        const r = set.route;
        if (r.kind !== 'train' || !Interlocking.routeLocked(set.state)) continue;
        if (c.kind === 'accept' && e.from) {
          const app = exitApproach(this.ilk, e.from);
          const last = r.sections[r.sections.length - 1];
          if (r.approach === app && String(this.ilk.sections.get(last)?.track) === String(c.track)) done = true;
        }
        if (c.kind === 'dispatch' && r.exit === c.exit && e.train && !e.train.finished) {
          const cur = trainTrack(this.ilk, e.train);
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

  /**
   * Pociągi nadzwyczajne (poziom „duże”): kopia losowego pociągu z rozkładu przesunięta w czasie tak, żeby mieściła się
   * w zmianie (`extraTrainShifts`). Losowania jak dotąd (pociąg, przesunięcie) – zmiana, w której wylosowany pociąg się
   * mieści, przebiega bez zmian; inaczej z tych samych liczb wychodzi pociąg i przesunięcie spośród mieszczących się
   * (bez dodatkowych losowań – reszta zakłóceń zmiany zostaje ta sama). Żaden się nie mieści – zmiana bez nadzwyczajnego.
   */
  #planExtraTrains() {
    const out = [];
    if (!this.level.extraTrains || !this.station.timetable.length) return out;
    const start = this.clock.time, end = this.endTime;
    // wzorce z rozkładu zmiany (własny `timetable` scenariusza – np. służba o wybranej porze), inaczej stacji
    const pool = (this.scenario.timetable ?? this.station.timetable).filter((t) => t.from && t.to);
    const taken = new Set(this.traffic.timetable().map((e) => Number(e.nr)));
    for (let i = 0; i < this.level.extraTrains; i++) {
      let base = this.rng.pick(pool);
      if (!base) continue;
      let minutes = this.rng.int(EXTRA_TRAIN.shiftMin, EXTRA_TRAIN.shiftMax);
      let fit = extraTrainShifts(base, start, end);
      if (!fit || minutes < fit.lo || minutes > fit.hi) {
        if (!fit) {
          const others = pool.filter((t) => extraTrainShifts(t, start, end));
          if (!others.length) continue;
          base = others[pool.indexOf(base) % others.length];
          fit = extraTrainShifts(base, start, end);
        }
        minutes = fit.lo + (minutes - EXTRA_TRAIN.shiftMin) % (fit.hi - fit.lo + 1);
      }
      const shift = minutes * 60;
      const ref = Clock.parse(base.arr || base.dep) + shift;
      const at = ref - EXTRA_TRAIN.announce;
      let nr = base.nr + 1000;
      while (taken.has(nr)) nr += 2; // numer zajęty w rozkładzie zmiany – następny o tej samej parzystości
      taken.add(nr);
      const def = { ...base, nr, name: `${base.name} nadzwyczajny`, arr: Clock.stamp(ref), dep: base.dep ? Clock.stamp(Clock.parse(base.dep) + shift) : undefined };
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
      const expired = this.special.tick(t);
      if (expired) {
        this.bus.emit('log', { time: t, level: 'warn', msg: `Polecenie specjalne „${expired.label}” odwołane samoczynnie po 60 s bez potwierdzenia` });
        this.bus.emit('special', null);
      }
      for (const op of this.operators) op.tick();
      if (this.commands.length) this.#checkCommands(t);
    }
    this.bus.emit('tick', { time: this.clock.time });
    if (this.special.pending) this.bus.emit('special', this.special.state(this.clock.time)); // odliczanie zwłoki w widoku
    this.#checkEnd();
  }

  #closedSections(t) {
    for (const c of this.closed) {
      const active = t >= c.from && t < c.to;
      if (active !== c.active) {
        c.active = active;
        const s = this.ilk.sections.get(c.section);
        if (s) { s.closed = active || !!s.closedByOrder; this.bus.emit('section', s); }
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
    const trainsDone = tt.length && tt.every(isHandled);
    const tasksDone = tasks.every((t) => t.done || t.failed);
    // pociąg „odjechał”, ale blokada czeka jeszcze na dyżurnego (dPo, telefonogram o odjeździe, Ko) – zmiana trwa
    const duties = this.#blockDuties();
    const timeUp = this.endTime && this.clock.time >= this.endTime;
    if ((trainsDone && tasksDone && !duties.length && this.autoEnd) || timeUp) { this.endShift(timeUp && !(trainsDone && tasksDone && !duties.length) ? 'time' : 'all-done'); return; }
    // rozkład wyczerpany, a zmiana trwa – jedna podpowiedź, co ją trzyma (pociąg na stacji, zadanie manewrowe)
    if (!this.lateHinted && this.autoEnd) {
      const last = Math.max(...tt.map((e) => Math.max(e.arrTime ?? 0, e.depTime ?? 0)), ...tasks.map((t) => t.deadlineTime || 0));
      if (this.clock.time >= last + 3 * 60) {
        this.lateHinted = true;
        const left = [...tt.filter((e) => !isHandled(e)).map((e) => `${e.label ?? e.nr} (${e.status})`), ...tasks.filter((t) => !t.done && !t.failed).map((t) => `zadanie: ${t.text}`), ...duties.map((d) => d.text)];
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
    const now = this.clock.time;
    for (const e of this.traffic.timetable()) {
      if (isHandled(e)) continue;
      // pociąg, który przez opóźnienie od sąsiada (albo składu, z którego powstaje) nie mógł zdążyć przed końcem zmiany –
      // bez kary (przyjęte: kara tylko za pociąg, który dało się obsłużyć); pozycja 0 pkt zostaje w raporcie
      if (this.traffic.lateFromOutside(e, now)) {
        const lag = Math.round(this.traffic.inboundLag(e) / 60);
        this.bus.emit('score', { time: now, code: 'unfinished-late', points: 0, nr: e.nr, lag, msg: `Pociąg ${e.nr} nie obsłużony do końca zmiany – opóźniony ${lag} min bez winy posterunku, nie zdążyłby (bez kary)` });
      } else this.bus.emit('score', { time: now, code: 'unfinished', points: -10, nr: e.nr, msg: `Pociąg ${e.nr} nie obsłużony do końca zmiany (${e.status})` });
    }
    // obowiązki blokady niewykonane do końca zmiany – kara jak przy dojeździe pociągu do sąsiada; obowiązek się zamyka,
    // żeby dojazd pociągu po końcu zmiany (symulacja biegnie dalej) nie doliczył jej drugi raz
    for (const d of this.#blockDuties()) {
      if (!d.code) continue;
      this.bus.emit('score', { time: this.clock.time, code: d.code, points: d.points, exit: d.exit, msg: `${d.text} – niewykonane do końca zmiany` });
      d.close();
    }
  }

  /**
   * Czynności dyżurnego na blokadach, na które zmiana czeka (`LineBlock.duties`: dPo, telefonogram o odjeździe, Ko
   * przyjazdu) – z opisem do dziennika i zamknięciem (`close`) po naliczeniu kary na koniec zmiany.
   */
  #blockDuties() {
    const out = [];
    for (const [id, b] of this.blocks) {
      const to = this.station.exits[id]?.name ?? id;
      const text = { dPo: () => `blok początkowy do ${to} – dPo`, 'departure-report': (d) => `zawiadomienie ${to} o odjeździe pociągu ${d.nr}`, Ko: () => `przyjazd od ${to} – Ko` };
      for (const d of b.duties()) out.push({ code: d.code, points: d.points, exit: id, text: text[d.duty](d), close: () => b.closeDuty(d.duty) });
    }
    return out;
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

  /**
   * Polecenie nastawcze wydane wprost (bez przycisków) – wspólne wejście dla stanowisk, które nie są pulpitem
   * typu E (monitor, przyszłe panele). Zwraca { ok, reason? }.
   *
   *  { type: 'route', start, end, kind: 'train'|'shunt', compound? } – nastawienie przebiegu; `end` to semafor końcowy
   *      albo przycisk końca przebiegu (szlak, kozioł); `compound` – także łańcuch przez semafory pośrednie
   *  { type: 'route', id }                    – przebieg wskazany wprost (drążek przebiegowy nastawni mechanicznej)
   *  { type: 'route-half', id }               – drążek przebiegowy w położeniu pośrednim: zamyka zwrotnice, bez sygnału
   *  { type: 'clear', signal, aspect? }       – dźwignia sygnałowa (nastawnia mechaniczna); `aspect` – dźwignia Sr2 / Sr3
   *  { type: 'route-block', signal }          – blok przebiegowy utwierdzający
   *  { type: 'stop', signal }                 – sygnał „Stój”, przebieg pozostaje utwierdzony
   *  { type: 'release', signal, emergency?, timed? } – zwolnienie przebiegu (Pz) / doraźne (dPz, licznik) / czasowe na żądanie
   *  { type: 'substitute', signal }           – sygnał zastępczy (Sz, licznik)
   *  { type: 'point', id } | { type: 'derailer', id } – przestawienie
   *  { type: 'lock', id, derailer? }          – zamknięcie indywidualne (Zz) – założenie / zdjęcie
   *  { type: 'point-secure', id, on }         – zabezpieczenie zwrotnicy na miejscu (zamek / spona) – polecenie dla pracownika
   *  { type: 'shunt-permit', nr }              – zezwolenie na jazdę manewrową obok uszkodzonego sygnalizatora (Ir-9 § 10 ust. 15)
   *  { type: 'block', exit, btn }             – blokada liniowa (Wbl, oWbl, Poz, Ko, Zk, dPo, dKo)
   *  { type: 'close-section', section, closed } – zamknięcie ruchowe toru (ITS) / odwołanie (ITO)
   *  { type: 'signal-stop', signal, on }      – stopowanie sygnalizatora (SES) / odwołanie (SEO)
   *  { type: 'all-stop', on }                 – stopowanie wszystkich sygnalizatorów stacji (SSS / SSO)
   *  { type: 'substitute-off' }               – wygaszenie sygnałów zastępczych (SZO)
   *  { type: 'cancel-timed', signal }         – odwołanie zwalniania czasowego (KZW)
   *  { type: 'axle-reset', section }         – zerowanie licznika osi (ZeroLO) przy usterce licznika
   * Czynności dyżurnego poza urządzeniami srk i czas gry – polecenie specjalne ich nie blokuje:
   *  { type: 'comms', form, exit, nr }        – telefonogram / rozmowa (wzory Ir-1, `Comms.send`)
   *  { type: 'order', nr, signal, text, reason } – rozkaz pisemny „S” (`Traffic.issueOrder`)
   *  { type: 'to-shunting', nr } | { type: 'to-train', nr } | { type: 'reverse', nr } – tryb jazdy pociągu: manewry,
   *                                             jazda pociągowa, zmiana kierunku (polecenie dla maszynisty)
   *  { type: 'pause', on } | { type: 'speed', value } – pauza i tempo gry
   * Widoki i samouczek zmieniają stan tylko tędy (oraz `press` / `pull` / `cancelSelection`) – `tests/layers.test.js`.
   */
  execute(cmd, { confirmed = false } = {}) {
    const refuse = (reason) => ({ ok: false, reason });
    switch (cmd?.type) {
      case 'comms': return this.comms.send(cmd.form, { exit: cmd.exit, nr: cmd.nr });
      case 'order': return this.traffic.issueOrder({ nr: cmd.nr, signal: cmd.signal, text: cmd.text, reason: cmd.reason });
      case 'to-shunting': return { ok: !!this.traffic.toShunting(cmd.nr) };
      case 'to-train': return { ok: !!this.traffic.toTrainMode(cmd.nr) };
      case 'reverse': return { ok: !!this.traffic.reverseTrain(cmd.nr) };
      case 'pause': this.clock.paused = !!cmd.on; return { ok: true };
      case 'speed': this.clock.speed = cmd.value; return { ok: true };
    }
    // w trakcie polecenia specjalnego inne polecenia są zablokowane (Ie-104.1 §11 ust. 16)
    if (this.special.pending && !confirmed) return refuse(`Trwa polecenie specjalne „${this.special.pending.label}” – potwierdź albo odwołaj (OPS)`);
    const ilk = this.ilk;
    switch (cmd?.type) {
      case 'route':
        // przebieg wskazany wprost (drążek przebiegowy nastawni mechanicznej)
        if (cmd.id) { const r = ilk.routes.get(cmd.id); return !r ? refuse(`Nieznany przebieg ${cmd.id}`) : this.#allowed('signal', r.start) ? ilk.setRoute(cmd.id) : refuse(OTHER_DISTRICT); }
        if (!this.#allowed('signal', cmd.start) || !this.#allowed(ilk.topo.signals.has(cmd.end) ? 'signal' : 'end', cmd.end)) return refuse(OTHER_DISTRICT);
        return cmd.compound ? ilk.requestCompoundRoute(cmd.start, cmd.end, cmd.kind) : ilk.requestRoute(cmd.start, cmd.end, cmd.kind);
      case 'stop':
        return this.#allowed('signal', cmd.signal) ? ilk.cancelSignal(cmd.signal) : refuse(OTHER_DISTRICT);
      case 'route-half': {
        const r = ilk.routes.get(cmd.id);
        return !r ? refuse(`Nieznany przebieg ${cmd.id}`) : this.#allowed('signal', r.start) ? ilk.halfRoute(cmd.id) : refuse(OTHER_DISTRICT);
      }
      case 'clear':
        return this.#allowed('signal', cmd.signal) ? ilk.clearSignal(cmd.signal, cmd.aspect) : refuse(OTHER_DISTRICT);
      case 'route-block':
        return this.#allowed('signal', cmd.signal) ? ilk.blockRoute(cmd.signal) : refuse(OTHER_DISTRICT);
      case 'release':
        return this.#allowed('signal', cmd.signal) ? ilk.releaseRoute(cmd.signal, !!cmd.emergency, !!cmd.timed) : refuse(OTHER_DISTRICT);
      case 'substitute':
        return this.#allowed('signal', cmd.signal) ? ilk.substituteSignal(cmd.signal, { justifiedAtChoice: !!cmd.justifiedAtChoice }) : refuse(OTHER_DISTRICT);
      case 'point':
        return this.#allowed('point', cmd.id) ? ilk.switchPoint(cmd.id, cmd.position) : refuse(OTHER_DISTRICT);
      case 'derailer':
        return this.#allowed('derailer', cmd.id) ? ilk.switchDerailer(cmd.id, cmd.position) : refuse(OTHER_DISTRICT);
      case 'lock':
        return this.#allowed(cmd.derailer ? 'derailer' : 'point', cmd.id) ? ilk.toggleIndividualLock(cmd.id, !!cmd.derailer) : refuse(OTHER_DISTRICT);
      case 'point-secure':
        return this.#allowed('point', cmd.id) ? ilk.securePoint(cmd.id, !!cmd.on) : refuse(OTHER_DISTRICT);
      case 'shunt-permit':
        return this.traffic.shuntPermit(cmd.nr);
      case 'block':
        if (!this.#allowed('block', cmd.exit)) return refuse(OTHER_DISTRICT);
        return this.blocks.get(cmd.exit)?.press(cmd.btn) ?? refuse(`Brak blokady liniowej ${cmd.exit}`);
      case 'close-section':
        return this.#allowed('section', cmd.section) ? ilk.closeSection(cmd.section, !!cmd.closed) : refuse(OTHER_DISTRICT);
      case 'signal-stop':
        return this.#allowed('signal', cmd.signal) ? ilk.stopSignal(cmd.signal, !!cmd.on) : refuse(OTHER_DISTRICT);
      case 'all-stop':
        return ilk.stopAll(!!cmd.on);
      case 'substitute-off':
        return ilk.substituteOff();
      case 'axle-reset':
        return this.#allowed('section', cmd.section) ? ilk.resetAxleCounter(cmd.section) : refuse(OTHER_DISTRICT);
      case 'cancel-timed':
        return this.#allowed('signal', cmd.signal) ? ilk.cancelTimedRelease(cmd.signal) : refuse(OTHER_DISTRICT);
      default:
        return refuse(`Nieznane polecenie: ${cmd?.type}`);
    }
  }

  /**
   * Linia poleceń stanowiska komputerowego (EBILock 950): protokół zamienia tekst („POC A D1”) na polecenie i je
   * wykonujemy jak każde inne (`execute` – okręg nastawczy, blokada). Stanowisko bez linii poleceń odmawia.
   */
  submitCommand(text) {
    if (typeof this.buttons.submit !== 'function') return { ok: false, reason: 'To stanowisko nie ma linii poleceń' };
    return this.#runInput(this.buttons.submit(text));
  }

  /**
   * Menu obiektu stanowiska MOR-3: wybór polecenia (zwykłe wykonuje się od razu, fioletowe i specjalne czekają na
   * potwierdzenie) i potwierdzenie polecenia czekającego (Ie-20 §13.7).
   */
  chooseCommand(code) {
    if (typeof this.buttons.choose !== 'function') return { ok: false, reason: 'To stanowisko nie ma menu poleceń obiektu' };
    return this.#runInput(this.buttons.choose(code));
  }

  confirmCommand() {
    if (typeof this.buttons.confirm !== 'function') return { ok: false, reason: 'To stanowisko nie potwierdza poleceń' };
    return this.#runInput(this.buttons.confirm());
  }

  /** Wynik protokołu obsługi: polecenie do wykonania (`cmd`) idzie przez `execute` (okręg nastawczy, blokada). */
  #runInput(r) {
    if (!r?.ok || !r.cmd) return r;
    return this.execute(r.cmd);
  }

  /** Potwierdzenie alarmów w oknie alarmów stanowiska komputerowego: lista numerów albo 'all'. */
  ackAlarms(ids) {
    if (typeof this.buttons.ack !== 'function') return { ok: false };
    if (ids === 'all') this.buttons.ackAll(); else this.buttons.ack(ids);
    return { ok: true };
  }

  /** Protokół obsługi stanowiska (stan wyboru, menu poleceń, okno zdarzeń i alarmów) – tylko do odczytu przez widok. */
  get input() {
    return this.buttons;
  }

  /** Odwołanie wskazanego początku polecenia / uzbrojonego przycisku (OPS na monitorze). */
  cancelSelection() {
    this.buttons.cancel();
  }

  /** Koniec przebiegu złożonego (stanowisko komputerowe): jak press(end), ale z łańcuchem przez semafory pośrednie. */
  pressCompound(ref) {
    if (!this.#refAllowed(ref)) return { ok: false, reason: OTHER_DISTRICT };
    return this.buttons.pressCompound(ref);
  }

  /** Naciśnięcie przycisku – ref jak w ButtonProtocol.press lub { kind:'block', exit, btn }. */
  /** Inicjowanie polecenia specjalnego (stanowisko komputerowe): `cmd` – polecenie `execute`, `meta` { label, target }. */
  initiateSpecial(cmd, meta = {}) {
    // Sz ocenia się w chwili wyboru: uzasadnienie usterką zapamiętane przy inicjowaniu (docs/sources/sygnaly-i-blokada.md)
    if (cmd?.type === 'substitute') cmd = { ...cmd, justifiedAtChoice: this.ilk.faultOnPath(cmd.signal) };
    const res = this.special.start(this.clock.time, cmd, meta);
    if (res.ok) {
      this.bus.emit('log', { time: this.clock.time, level: 'info', msg: `Polecenie specjalne zainicjowane: ${meta.label ?? cmd.type} – potwierdzenie po 5 s, najpóźniej po 60 s` });
      this.bus.emit('special', this.special.state(this.clock.time));
    }
    return res;
  }

  /** Potwierdzenie polecenia specjalnego – wykonanie po zwłoce (odmowa: za wcześnie, brak polecenia). */
  confirmSpecial() {
    const res = this.special.confirm(this.clock.time);
    if (!res.ok) return res;
    this.bus.emit('special', null);
    return this.execute(res.cmd, { confirmed: true });
  }

  /** Odwołanie polecenia specjalnego (OPS). */
  cancelSpecial() {
    const had = this.special.cancel();
    if (had) { this.bus.emit('log', { time: this.clock.time, level: 'info', msg: `Polecenie specjalne „${had.label}” odwołane (OPS)` }); this.bus.emit('special', null); }
    return { ok: true, noop: !had };
  }

  press(ref) {
    if (this.special.pending) return { ok: false, reason: `Trwa polecenie specjalne „${this.special.pending.label}” – potwierdź albo odwołaj (OPS)` };
    if (!this.#refAllowed(ref)) return { ok: false, reason: OTHER_DISTRICT };
    if (ref.kind === 'block') return this.blocks.get(ref.exit)?.press(ref.btn) ?? { ok: false };
    return this.buttons.press(ref);
  }

  #refAllowed(ref) {
    return this.#allowed(ref.kind, ref.kind === 'block' ? ref.exit : ref.id);
  }

  /** Czy gracz może obsługiwać element: 'signal' | 'point' | 'derailer' | 'end' (przycisk końca przebiegu) | 'block' (szlak). */
  #allowed(kind, id) {
    if (!this.districts || this.playerDistrict === 'both') return true;
    if (kind === 'block') return this.playerControls(this.exitDistrict(id));
    if (kind === 'signal') return this.playerControls(this.districtOf(id));
    const topo = this.ilk.topo;
    const tile = kind === 'point' ? topo.points.get(id) : kind === 'derailer' ? topo.derailers.get(id) : kind === 'end' ? topo.endButtons.get(id)
      : kind === 'section' ? topo.sectionTiles.get(id)?.[0] : null;
    return tile ? this.playerControls(this.#districtAtX(tile.x)) : true;
  }

  pull(ref) {
    if (this.special.pending) return { ok: false, reason: `Trwa polecenie specjalne „${this.special.pending.label}” – potwierdź albo odwołaj (OPS)` };
    // wyciągnięcie Wbl – odwołanie żądania / zwrot niewykorzystanego pozwolenia (oWbl); inne przyciski blokady się nie wyciąga
    if (ref.kind === 'block') return ref.btn === 'Wbl' && this.#allowed('block', ref.exit) ? this.blocks.get(ref.exit)?.press('oWbl') ?? { ok: false } : { ok: false };
    return this.buttons.pull(ref);
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
