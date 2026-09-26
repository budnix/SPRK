/**
 * Półsamoczynna blokada liniowa typu Eap – jeden tor szlakowy między naszą
 * stacją a posterunkiem sąsiednim (symulowanym przez „AI sąsiada”).
 *
 * Przyciski: Wbl (żądanie pozwolenia / włączenie kierunku), Poz (danie pozwolenia),
 *            Ko (blok końcowy – potwierdzenie przyjazdu), dPo, dKo (doraźne, z licznikiem).
 * Lampki:    żądanie (migające), pozwolenie (strzałka wyjazdu / wjazdu),
 *            zajętość toru szlakowego, blok początkowy (Po), koniec (Ko do obsłużenia).
 *
 * Stany kierunku: null – blokada zdjęta, 'out' – pozwolenie na wyjazd od nas,
 *                 'in' – pozwolenie dane sąsiadowi na wjazd do nas.
 */
export class LineBlock {
  constructor(exitId, exitDef, bus) {
    this.id = exitId;
    this.def = exitDef;
    this.bus = bus;
    this.neighbour = exitDef.name;
    this.direction = null;
    this.request = null;      // 'ours' | 'theirs'
    this.requestSince = 0;
    this.permission = false;  // pozwolenie otrzymane (kierunek 'out')
    this.occupied = false;    // zajętość toru szlakowego
    this.poBlocked = false;   // blok początkowy zablokowany (nasz pociąg na szlaku)
    this.koPending = false;   // pociąg sąsiada przybył w całości – obsłużyć Ko
    this.arrivedFully = false;
    this.counters = { dPo: 0, dKo: 0 };
    this.time = 0;
    this.neighbourReply = null; // { at, grant }
    this.pendingArrivalAck = null; // czas, kiedy sąsiad potwierdzi przyjazd naszego pociągu
    this.log = (level, msg) => bus.emit('log', { time: this.time, level, msg: `[${this.neighbour}] ${msg}` });
  }

  /** Warunek nastawienia przebiegu wyjazdowego na ten szlak. */
  gate() {
    if (this.occupied) return { ok: false, reason: `Tor szlakowy do ${this.neighbour} zajęty` };
    if (this.direction !== 'out' || !this.permission) return { ok: false, reason: `Brak pozwolenia na wyjazd do ${this.neighbour} (blokada Eap)` };
    return { ok: true };
  }

  /* ---- przyciski dyżurnego ---- */

  press(btn) {
    this.bus.emit('button', { ref: { kind: 'block', id: `${this.id}:${btn}` }, action: 'press' });
    switch (btn) {
      case 'Wbl': return this.#requestPermission();
      case 'Poz': return this.#grantPermission();
      case 'Ko': return this.#confirmArrival(false);
      case 'dKo': return this.#confirmArrival(true);
      case 'dPo': return this.#emergencyPo();
      default: return { ok: false };
    }
  }

  #requestPermission() {
    if (this.occupied) return this.#fail(`Tor szlakowy zajęty`);
    if (this.direction === 'out' && this.permission) return { ok: true, noop: true };
    if (this.direction === 'in') return this.#fail(`Kierunek ustawiony na wjazd – sąsiad ma pozwolenie`);
    if (this.request === 'theirs') return this.#fail(`Sąsiad żąda pozwolenia – najpierw obsłuż Poz (lub poczekaj)`);
    if (this.request === 'ours') return { ok: true, noop: true };
    this.request = 'ours'; this.requestSince = this.time;
    this.neighbourReply = { at: this.time + 8 + Math.random() * 20 };
    this.log('info', `Żądanie pozwolenia na wyjazd wysłane (Wbl)`);
    this.#emit();
    return { ok: true };
  }

  #grantPermission() {
    if (this.request !== 'theirs') return this.#fail(`Brak żądania pozwolenia od sąsiada`);
    if (this.occupied) return this.#fail(`Tor szlakowy zajęty`);
    if (this.direction) return this.#fail(`Kierunek już ustawiony`);
    this.request = null; this.direction = 'in'; this.permission = false;
    this.log('info', `Pozwolenie dane (Poz) – kierunek: wjazd od ${this.neighbour}`);
    this.#emit();
    return { ok: true };
  }

  #confirmArrival(emergency) {
    if (emergency) {
      this.counters.dKo++;
      this.log('warn', `Doraźne zwolnienie bloku końcowego dKo (licznik ${this.counters.dKo})`);
      this.#reset();
      return { ok: true };
    }
    if (this.direction !== 'in') return this.#fail(`Ko: brak przyjętego pociągu`);
    if (!this.koPending) return this.#fail(`Ko: pociąg nie przybył w całości (lub tor szlakowy zajęty)`);
    this.log('info', `Blok końcowy Ko obsłużony – przyjazd potwierdzony`);
    this.#reset();
    return { ok: true };
  }

  #emergencyPo() {
    this.counters.dPo++;
    this.log('warn', `Doraźne zwolnienie bloku początkowego dPo (licznik ${this.counters.dPo})`);
    this.#reset();
    return { ok: true };
  }

  #reset() {
    this.direction = null; this.permission = false; this.occupied = false;
    this.poBlocked = false; this.koPending = false; this.arrivedFully = false; this.request = null;
    this.pendingArrivalAck = null;
    this.#emit();
  }

  #fail(msg) {
    this.log('warn', msg);
    return { ok: false, reason: msg };
  }

  #emit() {
    this.bus.emit('block', this);
  }

  /* ---- zdarzenia ruchu ---- */

  /** Nasz pociąg wjechał na szlak. */
  trainDeparted(train) {
    this.occupied = true; this.poBlocked = true; this.permission = false;
    this.log('info', `Pociąg ${train.nr} wyjechał na szlak – blok początkowy zablokowany`);
    this.#emit();
  }

  /** Nasz pociąg dotarł do sąsiada (koniec toru szlakowego). */
  trainArrivedAtNeighbour(train) {
    this.pendingArrivalAck = this.time + 10 + Math.random() * 20;
    this.log('info', `Pociąg ${train.nr} przybył do ${this.neighbour}`);
  }

  /** Pociąg sąsiada wjechał na tor szlakowy (w naszym kierunku). */
  neighbourTrainEntered(train) {
    this.occupied = true; this.arrivedFully = false; this.koPending = false;
    this.log('info', `Pociąg ${train.nr} wyjechał z ${this.neighbour} – tor szlakowy zajęty`);
    this.#emit();
  }

  /** Pociąg sąsiada w całości opuścił tor szlakowy (jest na stacji). */
  neighbourTrainArrived(train) {
    if (!this.occupied) return;
    this.occupied = false; this.koPending = true; this.arrivedFully = true;
    this.log('info', `Pociąg ${train.nr} przybył w całości – obsłuż blok końcowy (Ko)`);
    this.#emit();
  }

  /** Żądanie pozwolenia od sąsiada (AI). */
  neighbourRequests() {
    if (this.request || this.direction || this.occupied) return false;
    this.request = 'theirs'; this.requestSince = this.time;
    this.log('info', `${this.neighbour} żąda pozwolenia na wyprawienie pociągu – naciśnij Poz`);
    this.bus.emit('alarm', { type: 'request', exit: this.id });
    this.#emit();
    return true;
  }

  canNeighbourDispatch() {
    return this.direction === 'in' && !this.occupied;
  }

  tick(time) {
    this.time = time;
    if (this.neighbourReply && this.neighbourReply.at <= time) {
      this.neighbourReply = null;
      if (this.request === 'ours') {
        this.request = null;
        if (this.occupied || this.direction) {
          this.log('warn', `${this.neighbour} odmawia pozwolenia`);
        } else {
          this.direction = 'out'; this.permission = true;
          this.log('info', `${this.neighbour} dał pozwolenie na wyjazd (Poz)`);
        }
        this.#emit();
      }
    }
    if (this.pendingArrivalAck && this.pendingArrivalAck <= time) {
      this.pendingArrivalAck = null;
      this.log('info', `${this.neighbour} potwierdził przyjazd (Ko) – tor szlakowy wolny`);
      this.occupied = false; this.poBlocked = false; this.direction = null; this.permission = false;
      this.#emit();
    }
  }

  snapshot() {
    return {
      id: this.id, direction: this.direction, request: this.request, permission: this.permission,
      occupied: this.occupied, poBlocked: this.poBlocked, koPending: this.koPending, counters: { ...this.counters },
    };
  }
}
