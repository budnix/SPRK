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
 *  - route-block     – nastawnia mechaniczna: pociąg nie zwalnia bloku przebiegowego utwierdzającego (urządzenie
 *                      oddziaływania) – drążek przebiegu od semafora `target` cofa się tylko zwalniaczem
 *  - track-defect    – usterka nawierzchni zgłoszona przez maszynistę (np. pęknięta szyna) na odcinku `target`:
 *                      dyżurny zamyka tor (ITS); wjazd pociągu na tor z usterką bez zamknięcia kosztuje punkty.
 *                      Tylko ze scenariusza – nie losuje się (tor zamyka się poleceniem stanowiska komputerowego)
 */
export const FAULT_TYPES = ['signal-fail', 'point-control', 'false-occupancy', 'block-fail', 'route-block', 'track-defect'];
/** Usterki, których nie losuje się przy zakłóceniach (tylko w scenariuszu). */
const SCRIPTED_ONLY = new Set(['track-defect']);

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
      // usterka bloku przebiegowego tylko tam, gdzie jest blok (nastawnia mechaniczna); na innych stanowiskach losowanie bez zmian
      const type = this.rng.pick(FAULT_TYPES.filter((t) => !SCRIPTED_ONLY.has(t) && (sim.ilk.routeBlock || t !== 'route-block')));
      const pool = { 'signal-fail': semafory, 'point-control': points, 'false-occupancy': sections, 'block-fail': exits, 'route-block': semafory }[type];
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
      if (f.active && f.type === 'track-defect') this.#defectRide(f);
    }
  }

  /** Pociąg wjechał na tor z usterką nawierzchni, którego dyżurny nie zamknął (tabor stojący tam przy zgłoszeniu się nie liczy). */
  #defectRide(f) {
    const s = this.sim.ilk.sections.get(f.target);
    if (!s) return;
    const occ = s.occupied && !s.forced;
    if (occ && !f.wasOccupied && !s.closed && !f.penalized) {
      f.penalized = true;
      this.#log('warn', `Pociąg wjechał na tor z usterką nawierzchni (odcinek ${f.target}) – tor nie został zamknięty`);
      this.sim.bus.emit('score', { time: this.time, code: 'track-defect', points: -50, msg: `Jazda po torze z usterką nawierzchni (${f.target}) bez zamknięcia toru` });
    }
    f.wasOccupied = occ;
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
      case 'track-defect': {
        const s = sim.ilk.sections.get(f.target);
        if (!s) return;
        s.defect = true;
        f.wasOccupied = s.occupied && !s.forced; // pociąg, który już tam jest, zgłosił usterkę – może zjechać
        this.#log('alarm', `USTERKA: maszynista zgłasza pękniętą szynę na odcinku ${f.target}${s.track ? ` (tor ${s.track})` : ''}. Zamknij tor dla ruchu (ITS) i prowadź pociągi innym torem.`);
        sim.bus.emit('alarm', { type: 'fault', fault: f });
        break;
      }
      case 'route-block': {
        const s = sim.ilk.signals.get(f.target);
        if (!s) return;
        s.blockStuck = true;
        this.#log('alarm', `USTERKA: urządzenie oddziaływania pociągu za semaforem ${f.target} – blok przebiegowy nie zwolni się sam. Po przejeździe sprawdź, że pociąg minął miejsce końca pociągu, i użyj zwalniacza.`);
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
      case 'track-defect': {
        const s = sim.ilk.sections.get(f.target);
        if (s) s.defect = false;
        this.#log('info', `Odcinek ${f.target}${s?.track ? ` (tor ${s.track})` : ''} – nawierzchnia naprawiona, tor można otworzyć (ITO).`);
        break;
      }
      case 'route-block': {
        const s = sim.ilk.signals.get(f.target);
        if (s) s.blockStuck = false;
        this.#log('info', `Urządzenie oddziaływania pociągu za semaforem ${f.target} naprawione.`);
        break;
      }
      default:
    }
  }
}
