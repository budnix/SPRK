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
import { ButtonProtocol } from '../srk/buttons.js';

const OTHER_DISTRICT = 'Element w okręgu obsługiwanym przez drugą nastawnię';

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
    for (const [id, e] of Object.entries(station.exits || {})) this.blocks.set(id, new LineBlock(id, e, this.bus));
    this.ilk = new Interlocking(this.station, this.bus, {
      blockGate: (exitId) => this.blocks.get(exitId)?.gate() ?? { ok: true },
      ...this.srk.model,
    });
    // obsługa przyciskami (press / pull): protokół systemu srk, domyślnie przyciski typu E
    this.buttons = this.ilk.attachInput(this.srk.input
      ? this.srk.input(this.ilk, this.bus, this.srk.model, { blocks: (exit) => this.blocks.get(exit) })
      : new ButtonProtocol(this.ilk, this.bus, { armTimeout: this.srk.model.armTimeout }));
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

  /**
   * Polecenie nastawcze wydane wprost (bez przycisków) – wspólne wejście dla stanowisk, które nie są pulpitem
   * typu E (monitor, przyszłe panele). Zwraca { ok, reason? }.
   *
   *  { type: 'route', start, end, kind: 'train'|'shunt', compound? } – nastawienie przebiegu; `end` to semafor końcowy
   *      albo przycisk końca przebiegu (szlak, kozioł); `compound` – także łańcuch przez semafory pośrednie
   *  { type: 'stop', signal }                 – sygnał „Stój”, przebieg pozostaje utwierdzony
   *  { type: 'release', signal, emergency?, timed? } – zwolnienie przebiegu (Pz) / doraźne (dPz, licznik) / czasowe na żądanie
   *  { type: 'substitute', signal }           – sygnał zastępczy (Sz, licznik)
   *  { type: 'point', id } | { type: 'derailer', id } – przestawienie
   *  { type: 'lock', id, derailer? }          – zamknięcie indywidualne (Zz) – założenie / zdjęcie
   *  { type: 'point-secure', id, on }         – zabezpieczenie zwrotnicy na miejscu (zamek / spona) – polecenie dla pracownika
   *  { type: 'block', exit, btn }             – blokada liniowa (Wbl, Poz, Ko, Zk, dPo, dKo)
   *  { type: 'close-section', section, closed } – zamknięcie ruchowe toru (ITS) / odwołanie (ITO)
   *  { type: 'signal-stop', signal, on }      – stopowanie sygnalizatora (SES) / odwołanie (SEO)
   *  { type: 'all-stop', on }                 – stopowanie wszystkich sygnalizatorów stacji (SSS / SSO)
   *  { type: 'substitute-off' }               – wygaszenie sygnałów zastępczych (SZO)
   *  { type: 'cancel-timed', signal }         – odwołanie zwalniania czasowego (KZW)
   *  { type: 'axle-reset', section }         – zerowanie licznika osi (ZeroLO) przy usterce licznika
   */
  execute(cmd) {
    const refuse = (reason) => ({ ok: false, reason });
    const ilk = this.ilk;
    switch (cmd?.type) {
      case 'route':
        // przebieg wskazany wprost (drążek przebiegowy nastawni mechanicznej)
        if (cmd.id) { const r = ilk.routes.get(cmd.id); return !r ? refuse(`Nieznany przebieg ${cmd.id}`) : this.#allowed('signal', r.start) ? ilk.setRoute(cmd.id) : refuse(OTHER_DISTRICT); }
        if (!this.#allowed('signal', cmd.start) || !this.#allowed(ilk.topo.signals.has(cmd.end) ? 'signal' : 'end', cmd.end)) return refuse(OTHER_DISTRICT);
        return cmd.compound ? ilk.requestCompoundRoute(cmd.start, cmd.end, cmd.kind) : ilk.requestRoute(cmd.start, cmd.end, cmd.kind);
      case 'stop':
        return this.#allowed('signal', cmd.signal) ? ilk.cancelSignal(cmd.signal) : refuse(OTHER_DISTRICT);
      case 'clear':
        return this.#allowed('signal', cmd.signal) ? ilk.clearSignal(cmd.signal) : refuse(OTHER_DISTRICT);
      case 'route-block':
        return this.#allowed('signal', cmd.signal) ? ilk.blockRoute(cmd.signal) : refuse(OTHER_DISTRICT);
      case 'release':
        return this.#allowed('signal', cmd.signal) ? ilk.releaseRoute(cmd.signal, !!cmd.emergency, !!cmd.timed) : refuse(OTHER_DISTRICT);
      case 'substitute':
        return this.#allowed('signal', cmd.signal) ? ilk.substituteSignal(cmd.signal) : refuse(OTHER_DISTRICT);
      case 'point':
        return this.#allowed('point', cmd.id) ? ilk.switchPoint(cmd.id, cmd.position) : refuse(OTHER_DISTRICT);
      case 'derailer':
        return this.#allowed('derailer', cmd.id) ? ilk.switchDerailer(cmd.id, cmd.position) : refuse(OTHER_DISTRICT);
      case 'lock':
        return this.#allowed(cmd.derailer ? 'derailer' : 'point', cmd.id) ? ilk.toggleIndividualLock(cmd.id, !!cmd.derailer) : refuse(OTHER_DISTRICT);
      case 'point-secure':
        return this.#allowed('point', cmd.id) ? ilk.securePoint(cmd.id, !!cmd.on) : refuse(OTHER_DISTRICT);
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
  press(ref) {
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
    if (ref.kind === 'block') return { ok: false };
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
