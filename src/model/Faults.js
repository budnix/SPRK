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
 *  - axle-counter    – od `at` licznik osi odcinka `target` myli się przy najbliższym przejeździe: gdy pociąg zjedzie
 *                      z odcinka, ten dalej wskazuje zajętość (`axleFault`). Dyżurny zeruje licznik (`axle-reset`, MOR-3:
 *                      ZeroLO), odcinek zostaje zajęty (ciemnoczerwony) do przejazdu kontrolnego – wjazd i wyjazd
 *                      pociągu (na sygnał zastępczy) po zerowaniu go zwalnia. Bez zerowania usterkę usuwa automatyk po
 *                      `duration` od jej wystąpienia. Tylko ze scenariusza (zerowanie ma stanowisko MOR-3)
 */
export const FAULT_TYPES = ['signal-fail', 'point-control', 'false-occupancy', 'block-fail', 'route-block', 'track-defect', 'axle-counter'];
/** Usterki, których nie losuje się przy zakłóceniach (tylko w scenariuszu). */
const SCRIPTED_ONLY = new Set(['track-defect', 'axle-counter']);

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
    // koniec zmiany w sekundach (`sim.endTime`); `scenario.endTime` to napis „GG:MM” – odejmowanie od niego dawało NaN
    // i usterka z takim czasem nie pojawiała się nigdy
    const end = (sim.endTime ?? sim.clock.time + 2 * 3600) - 15 * 60;
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
      if (!f.active && !f.done && time >= f.at && this.#ready(f)) { f.active = true; f.since = time; this.#apply(f); }
      if (f.active && time >= (f.since ?? f.at) + f.duration) { f.active = false; f.done = true; this.#clear(f); }
      if (f.active && f.type === 'track-defect') this.#defectRide(f);
      if (f.active && f.type === 'axle-counter') this.#pilotRide(f);
    }
  }

  /** Usterka licznika osi pojawia się, gdy pociąg zjedzie z odcinka (po `at`); inne usterki – o czasie `at`. */
  #ready(f) {
    if (f.type !== 'axle-counter') return true;
    const s = this.sim.ilk.sections.get(f.target);
    if (!s) return false;
    if (s.physical) { f.trainSeen = true; return false; }
    return !!f.trainSeen;
  }

  /**
   * Po zerowaniu licznika osi – przejazd kontrolny: nowy wjazd pociągu na odcinek i wyjazd z niego zwalnia odcinek. Tabor
   * stojący na odcinku w chwili zerowania musi najpierw zjechać (jego wyjazd nie jest przejazdem kontrolnym).
   */
  #pilotRide(f) {
    const s = this.sim.ilk.sections.get(f.target);
    if (!s?.resetPending) return;
    f.pilot ??= s.physical ? 'leave' : 'enter';
    if (f.pilot === 'leave' && !s.physical) f.pilot = 'enter';
    else if (f.pilot === 'enter' && s.physical) f.pilot = 'inside';
    else if (f.pilot === 'inside' && !s.physical) {
      f.active = false; f.done = true; f.pilot = 'done';
      this.#clear(f);
    }
  }

  /**
   * Pociąg wjechał na tor z usterką nawierzchni (tabor stojący tam przy zgłoszeniu się nie liczy). Pociągi zatrzymuje się
   * przed przeszkodą (Ir-1 §75), więc każdy nowy wjazd jest karany; na tor zamknięty (ITS, np. na Sz) – mocniej.
   * Urządzenie wjazdu nie blokuje – odpowiada za to dyżurny.
   */
  #defectRide(f) {
    const s = this.sim.ilk.sections.get(f.target);
    if (!s) return;
    const occ = !!s.physical;
    if (occ && !f.wasOccupied) {
      const closed = !!s.closed;
      this.#log('warn', `Pociąg wjechał na tor z usterką nawierzchni (odcinek ${f.target})${closed ? ' mimo zamknięcia toru' : ' – tor nie został zamknięty'}`);
      this.sim.bus.emit('score', { time: this.time, code: 'track-defect', points: closed ? -80 : -50,
        msg: `Jazda po torze z usterką nawierzchni (${f.target})${closed ? ' zamkniętym dla ruchu' : ' bez zamknięcia toru'}` });
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
        this.#log('alarm', `USTERKA: semafor ${f.target} nie podaje sygnału zezwalającego (żarówka / obwód). Podaj Sz; gdy nie można – rozkaz „S”.`);
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
      case 'axle-counter': {
        const s = sim.ilk.sections.get(f.target);
        if (!s) return;
        s.axleFault = true; s.resetPending = false;
        sim.ilk.refreshOccupancy();
        this.#log('alarm', `USTERKA: licznik osi odcinka ${f.target}${s.track ? ` (tor ${s.track})` : ''} wskazuje zajętość po przejeździe pociągu. Sprawdź, że tor jest wolny, i wyzeruj licznik (ZeroLO); pierwszy pociąg wjedzie na sygnał zastępczy.`);
        sim.bus.emit('alarm', { type: 'fault', fault: f });
        break;
      }
      case 'track-defect': {
        const s = sim.ilk.sections.get(f.target);
        if (!s) return;
        s.defect = true;
        f.wasOccupied = !!s.physical; // pociąg, który już tam jest, zgłosił usterkę – może zjechać
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
      case 'axle-counter': {
        const s = sim.ilk.sections.get(f.target);
        const pilot = f.pilot === 'done'; // po przejeździe kontrolnym; inaczej – upłynął czas usterki (automatyk)
        if (s) { s.axleFault = false; s.resetPending = false; sim.ilk.refreshOccupancy(); sim.bus.emit('section', s); }
        this.#log('info', pilot ? `Odcinek ${f.target} – przejazd kontrolny po zerowaniu licznika osi, odcinek wolny.` : `Licznik osi odcinka ${f.target} naprawiony (automatyk).`);
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
