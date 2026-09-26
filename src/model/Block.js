import { Clock } from '../core/Clock.js';
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
    this.fixed = exitDef.direction || null; // 'in' | 'out' – blokada jednokierunkowa (tor szlakowy linii dwutorowej)
    if (this.fixed) this.direction = this.fixed;
    this.fault = false;            // brak łączności elektrycznej – zapowiadanie telefoniczne
    this.phone = { askedByThem: null, permissionFor: null, arrivalConfirmed: null, arrivedTrain: null, departedTrain: null, clearedFor: null, departedReported: true };
    this.time = 0;
    this.neighbourReply = null; // { at, grant }
    this.pendingArrivalAck = null; // czas, kiedy sąsiad potwierdzi przyjazd naszego pociągu
    this.log = (level, msg) => bus.emit('log', { time: this.time, level, msg: `[${this.neighbour}] ${msg}` });
  }

  /** Warunek nastawienia przebiegu wyjazdowego na ten szlak. */
  gate() {
    if (this.fixed === 'in') return { ok: false, reason: `Tor szlakowy do ${this.neighbour} jest torem wjazdowym (ruch jednokierunkowy)` };
    if (this.occupied) return { ok: false, reason: `Tor szlakowy do ${this.neighbour} zajęty` };
    if (this.poBlocked) return { ok: false, reason: `Blok początkowy do ${this.neighbour} zablokowany` };
    if (this.fault) {
      if (!this.phone.permissionFor) return { ok: false, reason: `Blokada bez łączności – zapytaj ${this.neighbour} telefonicznie, czy droga wolna` };
      return { ok: true };
    }
    if (this.fixed === 'out') return { ok: true };
    if (this.direction !== 'out' || !this.permission) return { ok: false, reason: `Brak pozwolenia na wyjazd do ${this.neighbour} (blokada Eap)` };
    return { ok: true };
  }

  /** Włączenie / usunięcie usterki łączności blokady. */
  setFault(on) {
    this.fault = on;
    if (on) { this.request = null; this.neighbourReply = null; this.pendingArrivalAck = null; }
    else { this.phone = { askedByThem: null, permissionFor: null, arrivalConfirmed: null, arrivedTrain: null, departedTrain: null, clearedFor: null, departedReported: true }; if (this.fixed) this.direction = this.fixed; }
    this.#emit();
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
    if (this.fixed) return this.#fail(`Blokada jednokierunkowa – pozwolenia nie stosuje się`);
    if (this.fault) return this.#fail(`Blokada bez łączności – zapowiadanie telefoniczne (Łączność)`);
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
    if (this.fixed) return this.#fail(`Blokada jednokierunkowa – pozwolenia nie stosuje się`);
    if (this.fault) return this.#fail(`Blokada bez łączności – odpowiedz telefonicznie (Łączność)`);
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
      const justified = this.fault && this.koPending && String(this.phone.arrivalConfirmed) === String(this.phone.arrivedTrain);
      this.log('warn', `Doraźne zwolnienie bloku końcowego dKo (licznik ${this.counters.dKo})${justified ? ' – uzasadnione (usterka, przyjazd zapowiedziany)' : ''}`);
      this.bus.emit('score', { time: this.time, code: 'dKo', points: justified ? 0 : -15, msg: `dKo na blokadzie do ${this.neighbour}${justified ? ' (uzasadnione)' : ' bez uzasadnienia'}` });
      this.#reset();
      return { ok: true };
    }
    if (this.fault) return this.#fail(`Blokada bez łączności – po telefonicznym zawiadomieniu o przyjeździe użyj dKo`);
    if (this.direction !== 'in') return this.#fail(`Ko: brak przyjętego pociągu`);
    if (!this.koPending) return this.#fail(`Ko: pociąg nie przybył w całości (lub tor szlakowy zajęty)`);
    this.log('info', `Blok końcowy Ko obsłużony – przyjazd potwierdzony`);
    this.#reset();
    return { ok: true };
  }

  #emergencyPo() {
    this.counters.dPo++;
    const justified = this.fault && this.poBlocked && String(this.phone.arrivalConfirmed) === String(this.phone.departedTrain);
    this.log('warn', `Doraźne zwolnienie bloku początkowego dPo (licznik ${this.counters.dPo})${justified ? ' – uzasadnione (usterka, przyjazd potwierdzony)' : ''}`);
    this.bus.emit('score', { time: this.time, code: 'dPo', points: justified ? 0 : -15, msg: `dPo na blokadzie do ${this.neighbour}${justified ? ' (uzasadnione)' : ' bez potwierdzenia przyjazdu'}` });
    this.#reset();
    return { ok: true };
  }

  #reset() {
    this.direction = this.fixed; this.permission = false; this.occupied = false;
    this.poBlocked = false; this.koPending = false; this.arrivedFully = false; this.request = null;
    this.pendingArrivalAck = null;
    this.phone.permissionFor = null; this.phone.arrivalConfirmed = null; this.phone.arrivedTrain = null;
    this.phone.askedByThem = null; this.phone.clearedFor = null; this.phone.departedTrain = null;
    this.#emit();
  }

  /* ---- zapowiadanie telefoniczne (usterka blokady) ---- */

  /** Sąsiad pyta telefonicznie o drogę dla swojego pociągu. */
  phoneAskFromNeighbour(nr) {
    if (this.phone.askedByThem || this.phone.clearedFor || this.occupied || this.koPending || (this.direction === 'out' && (this.permission || this.phone.permissionFor))) return false;
    this.phone.askedByThem = nr;
    this.bus.emit('comms', { time: this.time, from: this.neighbour, kind: 'ask', exit: this.id, nr, text: `Czy droga dla pociągu nr ${nr} wolna?` });
    this.bus.emit('alarm', { type: 'phone', exit: this.id });
    this.#emit();
    return true;
  }

  /** Nasza odpowiedź „Droga dla pociągu nr … wolna”. */
  phoneAnswerFree(nr) {
    if (String(this.phone.askedByThem) !== String(nr)) return { ok: false, reason: `${this.neighbour} nie pytał o pociąg nr ${nr}` };
    if (this.occupied || this.koPending || (this.direction === 'out' && (this.permission || this.phone.permissionFor))) return { ok: false, reason: `Droga nie jest wolna` };
    this.phone.askedByThem = null;
    this.direction = this.fixed || 'in';
    this.phone.clearedFor = nr;
    this.log('info', `Zapowiedziano telefonicznie: droga dla pociągu ${nr} wolna`);
    this.#emit();
    return { ok: true };
  }

  /** Nasze pytanie o drogę dla naszego pociągu – sąsiad odpowiada po chwili. */
  phoneAskNeighbour(nr) {
    if (!this.fault) return { ok: false, reason: `blokada działa – użyj Wbl` };
    if (this.occupied || this.poBlocked) return { ok: false, reason: `tor szlakowy zajęty` };
    this.neighbourReply = { at: this.time + 8 + Math.random() * 15, phoneFor: nr };
    return { ok: true };
  }

  /** Nasze zawiadomienie o przyjeździe pociągu sąsiada. */
  phoneReportArrival(nr) {
    if (String(this.phone.arrivedTrain) !== String(nr) || !this.koPending) return { ok: false, reason: `pociąg nr ${nr} nie przybył w całości od ${this.neighbour}` };
    this.phone.arrivalConfirmed = nr;
    this.bus.emit('comms', { time: this.time + 2, from: this.neighbour, kind: 'info', exit: this.id, text: `Zrozumiano, pociąg nr ${nr} przybył.` });
    return { ok: true };
  }

  /** Nasze zawiadomienie o odjeździe naszego pociągu. */
  phoneReportDeparture(nr) {
    if (String(this.phone.departedTrain) !== String(nr)) return { ok: false, reason: `pociąg nr ${nr} nie odjechał na szlak do ${this.neighbour}` };
    this.phone.departedReported = true;
    this.bus.emit('comms', { time: this.time + 2, from: this.neighbour, kind: 'info', exit: this.id, text: `Zrozumiano, pociąg nr ${nr} odjechał.` });
    return { ok: true };
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
    this.phone.permissionFor = null; this.phone.departedTrain = train.nr;
    if (this.fault) this.phone.departedReported = false;
    this.log('info', `Pociąg ${train.nr} wyjechał na szlak – blok początkowy zablokowany`);
    this.#emit();
  }

  /** Nasz pociąg dotarł do sąsiada (koniec toru szlakowego). */
  trainArrivedAtNeighbour(train) {
    this.log('info', `Pociąg ${train.nr} przybył do ${this.neighbour}`);
    if (this.fault) {
      // sąsiad zawiadamia telefonicznie – zwolnienie bloku tylko przez dPo
      this.pendingArrivalAck = null;
      this.phone.arrivalConfirmed = train.nr;
      this.bus.emit('comms', { time: this.time + 5, from: this.neighbour, kind: 'info', exit: this.id, text: `Pociąg nr ${train.nr} przybył o ${Clock.format(this.time)}.` });
      if (!this.phone.departedReported) this.bus.emit('score', { time: this.time, code: 'no-depart-report', points: -10, msg: `Brak telefonicznego zawiadomienia ${this.neighbour} o odjeździe pociągu ${train.nr}` });
      return;
    }
    this.pendingArrivalAck = this.time + 10 + Math.random() * 20;
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
    this.occupied = false; this.koPending = true; this.arrivedFully = true; this.phone.arrivedTrain = train.nr; this.phone.clearedFor = null;
    this.log('info', `Pociąg ${train.nr} przybył w całości – ${this.fault ? 'zawiadom sąsiada telefonicznie i użyj dKo' : 'obsłuż blok końcowy (Ko)'}`);
    this.#emit();
  }

  /** Żądanie pozwolenia od sąsiada (AI). */
  neighbourRequests(nr) {
    if (this.fault) return this.phoneAskFromNeighbour(nr);
    if (this.fixed === 'in') return !this.occupied && !this.koPending; // blokada jednokierunkowa: bez pozwolenia
    if (this.fixed === 'out') return false;
    if (this.request || this.direction || this.occupied) return false;
    this.request = 'theirs'; this.requestSince = this.time;
    this.log('info', `${this.neighbour} żąda pozwolenia na wyprawienie pociągu – naciśnij Poz`);
    this.bus.emit('alarm', { type: 'request', exit: this.id });
    this.#emit();
    return true;
  }

  canNeighbourDispatch(nr) {
    if (this.fault) return String(this.phone.clearedFor) === String(nr) && !this.occupied;
    if (this.fixed === 'in') return !this.occupied && !this.koPending;
    return this.direction === 'in' && !this.occupied;
  }

  tick(time) {
    this.time = time;
    if (this.neighbourReply && this.neighbourReply.at <= time) {
      const reply = this.neighbourReply;
      this.neighbourReply = null;
      if (reply.phoneFor) {
        const free = !this.occupied && !this.phone.askedByThem && !this.phone.clearedFor;
        this.bus.emit('comms', { time, from: this.neighbour, kind: 'info', exit: this.id, text: free ? `Droga dla pociągu nr ${reply.phoneFor} wolna.` : `Droga dla pociągu nr ${reply.phoneFor} zajęta.` });
        if (free) { this.phone.permissionFor = reply.phoneFor; this.direction = this.fixed || 'out'; }
        this.#emit();
      } else if (this.request === 'ours') {
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
