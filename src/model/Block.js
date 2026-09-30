import { Clock } from '../core/Clock.js';

/** Po tylu sekundach sąsiad ponawia zgłoszenie pociągu wstrzymanego telefonogramem „Stój pociąg” (przyjęte). */
export const HOLD_TIME = 180;
/**
 * Blokada liniowa – jeden tor szlakowy między naszą stacją a posterunkiem sąsiednim
 * (symulowanym przez „AI sąsiada”). Dwa rodzaje:
 *  - półsamoczynna Eap (domyślna): pozwolenia (Wbl/Poz) i potwierdzenie przyjazdu (Ko),
 *  - samoczynna SBL (`block: 'sbl'`, tor linii dwutorowej z kierunkiem zasadniczym `direction`):
 *    bez pozwoleń Eap, bez bloków Po / Ko – odstęp zwalnia się sam po przejeździe pociągu. Blokada jest
 *    dwukierunkowa: kierunek zmienia się tylko przy wolnym odstępie i za zgodą sąsiada (Ir-1 §30 ust. 2 pkt 1) –
 *    nasze Zk to prośba, na którą sąsiad odpowiada; prośbę sąsiada gracz przyjmuje przyciskiem Zk; godzina zgody
 *    trafia do dziennika. Przy usterce (brak łączności) obowiązuje zapowiadanie telefoniczne.
 *
 * Przyciski: Wbl (żądanie pozwolenia / włączenie kierunku), oWbl (wyciągnięcie Wbl: odwołanie żądania, zwrot
 *            niewykorzystanego pozwolenia), Poz (danie pozwolenia), Ko (blok końcowy – potwierdzenie przyjazdu),
 *            dPo (doraźne zablokowanie bloku początkowego po wyjeździe na Sz / rozkaz), dKo (doraźne przygotowanie
 *            bloku końcowego przed wjazdem na Sz / rozkaz – bez stwierdzenia przejazdu Ko nie działa); oba z licznikiem.
 *            Żaden przycisk doraźny nie kasuje blokady (LIRK, „Obsługa … blokady liniowej typu Eap”).
 * Pwl:       przeciwwtórność liniowa – po podaniu sygnału wyjazdowego drugi sygnał na ten szlak nie wyjdzie, dopóki
 *            pociąg nie wyjedzie (po odwołaniu sygnału – wyprawienie na Sz lub rozkaz).
 * Lampki:    żądanie (migające), pozwolenie (strzałka wyjazdu / wjazdu),
 *            zajętość toru szlakowego, blok początkowy (Po), koniec (Ko do obsłużenia).
 *
 * Stany kierunku: null – blokada zdjęta, 'out' – pozwolenie na wyjazd od nas,
 *                 'in' – pozwolenie dane sąsiadowi na wjazd do nas.
 */
export class LineBlock {
  /**
   * opts: `phoneRoutine` – rozmowy telefoniczne przy sprawnej blokadzie (1a / 4a na szlaku jednotorowym, numer pociągu
   * przy odjeździe na dwutorowym): 'auto' (domyślnie – nadają się same, widać je w Łączności) albo 'manual' (gracz nadaje,
   * pominięcie kosztuje punkty); `nextTrain(exitId)` – numer naszego następnego pociągu na ten szlak.
   */
  constructor(exitId, exitDef, bus, opts = {}) {
    this.id = exitId;
    this.phoneRoutine = opts.phoneRoutine || 'auto';
    this.nextTrain = opts.nextTrain || (() => null);
    // czasy odpowiedzi sąsiada (Poz, potwierdzenie przyjazdu, telefonogramy): generator zmiany – to samo ziarno daje tę
    // samą zmianę; bez niego (blokada tworzona osobno, np. w testach jednostkowych) – Math.random
    this.random = opts.random || Math.random;
    this.talk = { askedFor: null, clearedFor: null, theirAsk: null, answered: null }; // rozmowy 1a / 4a przy sprawnej blokadzie
    this.def = exitDef;
    this.bus = bus;
    this.neighbour = exitDef.name;
    // tor szlakowy z etykiety wyjazdu („Sopot – 202 t.2” → „202 t.2”) – odróżnia dwa tory do tego samego posterunku
    this.trackLabel = exitDef.label && exitDef.label !== exitDef.name ? exitDef.label.replace(/^.*?\s[–-]\s/, '') : null;
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
    this.auto = exitDef.block === 'sbl';   // blokada samoczynna: bez Wbl/Poz/Ko
    this.fault = false;            // brak łączności elektrycznej – zapowiadanie telefoniczne
    this.phone = { askedByThem: null, permissionFor: null, arrivalConfirmed: null, arrivedTrain: null, departedTrain: null, clearedFor: null, departedReported: true };
    this.time = 0;
    this.neighbourReply = null; // { at, grant }
    this.pendingArrivalAck = null; // czas, kiedy sąsiad potwierdzi przyjazd naszego pociągu
    this.lineTrain = null;         // numer pociągu na torze szlakowym (nasz wyprawiony albo sąsiada jadący do nas)
    this.pwl = false;              // przeciwwtórność liniowa: sygnał wyjazdowy na ten szlak podany (przebieg `pwlRoute`)
    this.pwlRoute = null;
    this.pwlFault = false;         // Pwl po sygnale, który zgasł z usterki – Sz / rozkaz uzasadnione
    this.needPo = false;           // nasz pociąg wyjechał bez sygnału zezwalającego – blok początkowy zablokować dPo
    this.zpg = false;              // stwierdzenie przejazdu pociągu sąsiada przy semaforze wjazdowym (sygnał zezwalający)
    this.koPrepared = false;       // dKo przed wjazdem na Sz / rozkaz – Ko zadziała bez stwierdzenia przejazdu
    this.entrySeen = false;        // pociąg sąsiada minął nasz semafor wjazdowy (na sygnał albo Sz / rozkaz)
    this.beforeEntry = null;       // numer pociągu sąsiada, który zjechał ze szlaku i stoi przed semaforem wjazdowym
    this.heldUntil = 0;            // do tego czasu sąsiad nie ponawia zgłoszenia pociągu wstrzymanego „Stój pociąg”
    this.faultDir = null;          // kierunek z pozwoleniem w chwili utraty łączności
    this.log = (level, msg) => bus.emit('log', { time: this.time, level, msg: `[${this.neighbour}] ${msg}` });
  }

  /**
   * Warunek wyjazdu na ten szlak. `mode`: 'route' – nastawienie przebiegu wyjazdowego (także pod Sz / rozkaz),
   * 'substitute' – Sz / rozkaz „S”, 'signal' – sygnał zezwalający semafora wyjazdowego przebiegu `routeId`
   * (wymaga pozwolenia przeniesionego przez blokadę i wolnej przeciwwtórności Pwl). `fault: true` – blokada bez
   * łączności (uzasadnia Sz i rozkaz).
   */
  gate(mode = 'route', routeId = null) {
    if (this.fixed === 'in' && !this.auto) return { ok: false, reason: `Tor szlakowy do ${this.neighbour} jest torem wjazdowym (ruch jednokierunkowy)` };
    if (this.occupied) return { ok: false, reason: `Tor szlakowy do ${this.neighbour} zajęty` };
    if (this.fault) {
      // sygnał wyjazdowy podany przed usterką na niewykorzystanym pozwoleniu zostaje – pozwolenie trzymają urządzenia
      // naszej stacji (wcześniej gasł tuż przed pociągiem i pociąg przejeżdżał „Stój”)
      if (mode === 'signal' && this.faultDir === 'out' && this.pwl && this.pwlRoute != null && this.pwlRoute === routeId) return { ok: true, fault: true };
      // zapowiadanie telefoniczne: blok początkowy zostaje zablokowany do naprawy – o drodze decyduje telefonogram
      // tor właściwy linii dwutorowej: wyjazd po potwierdzeniu przyjazdu poprzedniego pociągu (tor wolny), bez zapytania
      if (!this.phone.permissionFor && this.fixed !== 'out') return { ok: false, fault: true, reason: `Blokada bez łączności – zapytaj ${this.neighbour} telefonicznie, czy droga jest wolna` };
      // sygnał zezwalający tylko, gdy pozwolenie było u nas przed utratą łączności (albo tor ma stały kierunek wyjazdu)
      if (mode === 'signal' && !this.auto && this.fixed !== 'out' && this.faultDir !== 'out') return { ok: false, fault: true, reason: `Blokada do ${this.neighbour} bez łączności, pozwolenie u sąsiada – wyprawienie na Sz lub rozkaz „S”` };
      return { ok: true, fault: true };
    }
    if (this.poBlocked) return { ok: false, reason: this.auto ? `Odstęp do ${this.neighbour} zajęty` : `Blok początkowy do ${this.neighbour} zablokowany` };
    if (this.auto) return this.direction === 'out' ? { ok: true } : { ok: false, reason: `Kierunek blokady samoczynnej do ${this.neighbour} na wjazd – zmień kierunek (Zk)` };
    if (mode === 'signal' && this.pwl && this.pwlRoute !== routeId) return { ok: false, fault: this.pwlFault, reason: `Pwl – sygnał wyjazdowy do ${this.neighbour} już był podany; wypraw pociąg na Sz lub rozkaz „S”` };
    // Pwl po sygnale zgaszonym przez usterkę – Sz / rozkaz wymusiła usterka
    const ok = this.pwl && this.pwlFault ? { ok: true, fault: true } : { ok: true };
    if (this.fixed === 'out') return ok;
    if (this.direction !== 'out' || !this.permission) return { ok: false, reason: `Brak pozwolenia na wyjazd do ${this.neighbour} (blokada Eap)` };
    return ok;
  }

  /** Sygnał zezwalający semafora wyjazdowego przebiegu `routeId` na ten szlak – włącza się przeciwwtórność (Pwl). */
  exitSignalGiven(routeId) {
    if (this.auto || this.fault) return;
    this.pwl = true; this.pwlRoute = routeId;
    this.#emit();
  }

  /**
   * Przebieg z podanym sygnałem rozwiązany bez wyjazdu pociągu – Pwl zostaje, nowego sygnału już nie będzie. `byFault` –
   * sygnał zgasł z usterki (zajętość, kontrola zwrotnicy): Sz wymuszony przez taki Pwl jest uzasadniony usterką.
   */
  exitSignalCancelled(routeId, byFault = false) {
    if (this.pwlRoute === routeId) { this.pwlRoute = null; if (byFault) this.pwlFault = true; this.#emit(); }
  }

  /**
   * Pociąg sąsiada minął nasz semafor wjazdowy – na sygnał zezwalający urządzenie stwierdza przejazd (ZPG). Ko jest do
   * obsłużenia, gdy pociąg minął semafor wjazdowy i zjechał w całości ze szlaku (kolejność zależy od długości pociągu).
   */
  entryPassed(onSignal, faultOverrun = false) {
    this.entrySeen = true; this.beforeEntry = null;
    if (onSignal) this.zpg = true;
    // semafor wjazdowy zgasł z usterki tuż przed pociągiem – dKo przed wjazdem nie było kiedy nacisnąć
    if (faultOverrun) this.overrunByFault = true;
    // SBL tylko przy usterce – przyjazd do zawiadomienia telefonicznego (krótki pociąg zjeżdża ze szlaku przed semaforem)
    if (this.arrivedFully && (!this.auto || this.fault) && !this.koPending) this.#arrivalComplete();
  }

  #arrivalComplete() {
    this.koPending = true; // na SBL (tylko przy usterce): przyjazd do zawiadomienia telefonicznego
    this.log('info', `Pociąg ${this.phone.arrivedTrain} przybył w całości – ${this.fault ? 'zawiadom sąsiada telefonicznie' : 'obsłuż blok końcowy (Ko)'}`);
    this.#emit();
  }

  /** Włączenie / usunięcie usterki łączności blokady. */
  setFault(on) {
    this.fault = on;
    if (on) {
      // pozwolenie sprzed usterki liczy się tylko niewykorzystane (pociąg, który na nim wyjechał, już je zużył)
      this.faultDir = this.direction === 'out' && (this.permission || this.fixed === 'out') ? 'out' : null;
      this.request = null; this.neighbourReply = null;
      if (this.pendingArrivalAck != null && !this.auto) {
        // nasz pociąg dojechał już do sąsiada, a jego Ko nie zdążyło przyjść – sąsiad zawiadamia o przyjeździe telefonicznie
        // (inaczej tor szlakowy zostawał zajęty na zawsze); blok początkowy zostaje zablokowany do naprawy
        const nr = this.lineTrain;
        this.occupied = false; this.lineTrain = null; this.phone.arrivalConfirmed = nr;
        this.#phoneIn(`Pociąg nr ${nr} przyjechał o ${Clock.format(this.time)}.`, 5);
      }
      this.pendingArrivalAck = null;
    }
    else {
      // koniec usterki: blokada wraca do pracy, więc blok początkowy zwalnia się jak zwykle po potwierdzeniu przyjazdu,
      // a na SBL odstęp po zjeździe pociągu sąsiada zwalnia się sam – bez dPo/dKo, których wymagało zapowiadanie
      const arrivedOurs = this.poBlocked && this.phone.arrivalConfirmed != null && String(this.phone.arrivalConfirmed) === String(this.phone.departedTrain);
      // droga była nasza (zapowiedź naszego pociągu albo niewykorzystane pozwolenie sprzed usterki), a pociąg jeszcze nie
      // wjechał na szlak – może właśnie mijać semafor wyjazdowy; po naprawie pozwolenie zostaje u nas
      const oursPending = !this.occupied && this.#oursUnderFault() ? (this.phone.permissionFor ?? true) : null;
      // pociąg sąsiada stoi przed semaforem wjazdowym – jego numer zostaje (przyjazd potwierdzi się po wjeździe)
      const waiting = this.awaitingEntry ? this.phone.arrivedTrain : null;
      this.phone = { askedByThem: null, permissionFor: null, arrivalConfirmed: null, arrivedTrain: waiting, departedTrain: null, clearedFor: null, departedReported: true };
      if (this.fixed) this.direction = this.fixed;
      this.faultDir = null;
      if (this.auto) { if (arrivedOurs) this.pendingArrivalAck = this.time + 5; }
      else {
        // Eap – automatyk po naprawie ustawia blokadę zgodnie ze stanem szlaku: wolny – stan zasadniczy; nasz pociąg
        // w drodze – blok początkowy zablokowany do Ko sąsiada; pociąg sąsiada – kierunek wjazdu (Ko po przyjeździe)
        this.pwl = false; this.pwlRoute = null; this.pwlFault = false; this.needPo = false; this.permission = false;
        if (this.awaitingEntry) { this.direction = this.fixed || 'in'; } // pociąg sąsiada stoi przed semaforem wjazdowym
        else if (oursPending != null && !this.fixed) {
          this.direction = 'out'; this.permission = true; this.poBlocked = false; this.koPending = false; this.zpg = false; this.koPrepared = false; this.entrySeen = false;
          this.log('info', `Blokada sprawna – pozwolenie na wyjazd zostaje u nas${oursPending === true ? '' : ` (pociąg nr ${oursPending})`}`);
        }
        else if (!this.occupied) { this.direction = this.fixed; this.poBlocked = false; this.koPending = false; this.zpg = false; this.koPrepared = false; this.entrySeen = false; }
        else if (this.lineOurs) { this.direction = this.fixed || 'out'; this.poBlocked = true; }
        else { this.direction = this.fixed || 'in'; }
      }
      if (this.auto && this.koPending) { this.koPending = false; this.log('info', `Blokada sprawna – odstęp zwolniony samoczynnie`); }
    }
    this.#emit();
  }

  /* ---- przyciski dyżurnego ---- */

  press(btn) {
    this.bus.emit('button', { ref: { kind: 'block', id: `${this.id}:${btn}` }, action: 'press' });
    switch (btn) {
      case 'Wbl': return this.#requestPermission();
      case 'oWbl': return this.#releaseRequest();
      case 'Zk': return this.#changeDirection();
      case 'Poz': return this.#grantPermission();
      case 'Ko': return this.#confirmArrival(false);
      case 'dKo': return this.#confirmArrival(true);
      case 'dPo': return this.#emergencyPo();
      default: return { ok: false };
    }
  }

  /** Szlak jednotorowy z Eap – rozmowa 1a / 4a przy każdym pociągu (Ir-1 §28 ust. 3, §24 ust. 5, 9). */
  #single() { return !this.auto && !this.fixed; }

  /**
   * Pociąg sąsiada zjechał w całości ze szlaku na odcinek przed semaforem wjazdowym, ale semafora jeszcze nie minął.
   * Tor szlakowy nie jest wtedy wolny: sąsiad nie wyprawi następnego pociągu, a „droga wolna” się nie należy. Na
   * blokadzie samoczynnej tak samo – ostatni odstęp kończy się na semaforze wjazdowym (wcześniej odstęp zwalniał się
   * przy zjeździe ze szlaku i następny pociąg wjeżdżał na odcinek, na którym stał poprzedni).
   */
  get awaitingEntry() { return this.beforeEntry != null; }

  #phoneOut(text) { this.bus.emit('phone-out', { to: this.neighbour, text }); }

  #phoneIn(text, delay = 0, extra = {}) {
    this.bus.emit('comms', { time: this.time + delay, from: this.neighbour, kind: 'info', exit: this.id, text, ...extra });
  }

  /** Kara za pominięty telefonogram w trybie ręcznym (`phoneRoutine: 'manual'`). */
  #routineMissed(msg) {
    this.bus.emit('score', { time: this.time, code: 'phone-routine', points: -2, msg: `${msg} (${this.neighbour})` });
  }

  #requestPermission() {
    if (this.auto) return this.#fail(`Blokada samoczynna – pozwolenia nie stosuje się`);
    if (this.fixed) return this.#fail(`Blokada jednokierunkowa – pozwolenia nie stosuje się`);
    if (this.fault) return this.#fail(`Blokada bez łączności – zapowiadanie telefoniczne (Łączność)`);
    if (this.occupied) return this.#fail(`Tor szlakowy zajęty`);
    if (this.direction === 'out' && this.permission) return { ok: true, noop: true };
    if (this.direction === 'in') return this.#fail(`Kierunek ustawiony na wjazd – sąsiad ma pozwolenie`);
    if (this.request === 'theirs') return this.#fail(`Sąsiad żąda pozwolenia – najpierw obsłuż Poz (lub poczekaj)`);
    if (this.request === 'ours') return { ok: true, noop: true };
    this.request = 'ours'; this.requestSince = this.time;
    this.neighbourReply = { at: this.time + 8 + this.random() * 20, nr: this.nextTrain(this.id) };
    // żądanie pozwolenia na szlaku jednotorowym poprzedza zapytanie telefoniczne (wzór 1a)
    const nr = this.neighbourReply.nr;
    if (nr != null) {
      if (this.phoneRoutine === 'auto') this.#phoneOut(`Czy droga dla pociągu nr ${nr} jest wolna?`);
      else if (String(this.talk.askedFor) !== String(nr)) this.#routineMissed(`Wbl bez zapytania telefonicznego o drogę dla pociągu nr ${nr} (wzór 1a)`);
    }
    this.log('info', `Żądanie pozwolenia na wyjazd wysłane (Wbl)`);
    this.#emit();
    return { ok: true };
  }

  /**
   * Wyciągnięcie Wbl (oWbl): odwołanie naszego żądania pozwolenia albo zwrot niewykorzystanego pozwolenia (sąsiad też
   * wyciąga Wbl – kierunek wraca do położenia zasadniczego). Zwykła obsługa, bez licznika. Po podaniu sygnału (Pwl) –
   * nie.
   */
  #releaseRequest() {
    if (this.auto) return this.#fail(`Blokada samoczynna – pozwolenia nie stosuje się`);
    if (this.fixed) return this.#fail(`Blokada jednokierunkowa – pozwolenia nie stosuje się`);
    if (this.fault) return this.#fail(`Blokada bez łączności – zapowiadanie telefoniczne (Łączność)`);
    if (this.request === 'ours') {
      this.request = null; this.neighbourReply = null;
      this.log('info', `Żądanie pozwolenia odwołane (oWbl)`);
      this.#emit();
      return { ok: true };
    }
    if (this.direction === 'out' && this.permission && !this.occupied) {
      if (this.pwl) return this.#fail(`Pwl – sygnał wyjazdowy już był podany; pozwolenia nie da się zwrócić`);
      if (this.neighbourReply?.giveBack) return { ok: true, noop: true };
      this.neighbourReply = { at: this.time + 5 + this.random() * 10, giveBack: true };
      this.log('info', `Zwrot pozwolenia (oWbl) – ${this.neighbour} wyciąga Wbl`);
      this.#emit();
      return { ok: true };
    }
    return this.#fail(`oWbl: brak żądania ani niewykorzystanego pozwolenia`);
  }

  /**
   * Zk na blokadzie samoczynnej: zgoda na prośbę sąsiada o kierunek przyjazdu albo nasza prośba o zmianę kierunku,
   * na którą sąsiad odpowiada po chwili – tylko przy wolnym odstępie (Ir-1 §30 ust. 2 pkt 1).
   */
  #changeDirection() {
    if (!this.auto) return this.#fail(`Zmiana kierunku dotyczy blokady samoczynnej – tu użyj Wbl / Poz`);
    if (this.fault) return this.#fail(`Blokada bez łączności – zapowiadanie telefoniczne (Łączność)`);
    if (this.occupied || this.poBlocked || this.koPending || this.awaitingEntry) return this.#fail(`Odstęp do ${this.neighbour} zajęty – zmiana kierunku niemożliwa`);
    if (this.request === 'theirs') {
      // nasz przebieg wyjazdowy na ten tor nastawiony (commitOut) – pociąg może już mijać semafor wyjazdowy
      if (this.permission) return this.#fail(`Przebieg wyjazdowy do ${this.neighbour} nastawiony – zgoda na zmianę kierunku dopiero po wyjeździe pociągu albo zwolnieniu przebiegu`);
      this.request = null; this.direction = 'in'; this.permission = false;
      this.log('info', `Zgoda na zmianę kierunku blokady samoczynnej do ${this.neighbour} na przyjazd – ${Clock.format(this.time)} (dziennik ruchu)`);
      this.#emit();
      return { ok: true };
    }
    if (this.request === 'ours') return { ok: true, noop: true };
    this.request = 'ours'; this.requestSince = this.time;
    this.neighbourReply = { at: this.time + 8 + this.random() * 12, dirChange: true };
    this.log('info', `Prośba o zmianę kierunku blokady samoczynnej do ${this.neighbour} (Zk) – czekaj na zgodę`);
    this.#emit();
    return { ok: true };
  }

  /** Nastawiono przebieg wyjazdowy na ten szlak – sąsiad nie może już zmienić kierunku. */
  commitOut() {
    if (this.auto && this.direction === 'out') this.permission = true;
  }

  /** Przebieg wyjazdowy na ten szlak rozwiązany bez wyjazdu pociągu – kierunek znów można oddać sąsiadowi. */
  releaseCommit() {
    if (this.auto && this.permission && !this.occupied) { this.permission = false; this.#emit(); }
  }

  #grantPermission() {
    if (this.auto) return this.#fail(`Blokada samoczynna – pozwolenia nie stosuje się`);
    if (this.fixed) return this.#fail(`Blokada jednokierunkowa – pozwolenia nie stosuje się`);
    if (this.fault) return this.#fail(`Blokada bez łączności – odpowiedz telefonicznie (Łączność)`);
    if (this.request !== 'theirs') return this.#fail(`Brak żądania pozwolenia od sąsiada`);
    if (this.occupied) return this.#fail(`Tor szlakowy zajęty`);
    if (this.direction) return this.#fail(`Kierunek już ustawiony`);
    const nr = this.talk.theirAsk;
    if (nr != null) {
      if (this.phoneRoutine === 'auto') this.#phoneOut(`Dla pociągu nr ${nr} droga jest wolna.`);
      else if (String(this.talk.answered) !== String(nr)) this.#routineMissed(`Poz bez telefonogramu „Dla pociągu nr ${nr} droga jest wolna” (wzór 4a)`);
    }
    this.talk.theirAsk = null; this.talk.answered = null;
    this.request = null; this.direction = 'in'; this.permission = false;
    this.log('info', `Pozwolenie dane (Poz) – kierunek: wjazd od ${this.neighbour}`);
    this.#emit();
    return { ok: true };
  }

  #confirmArrival(emergency) {
    if (this.auto) return this.#fail(`Blokada samoczynna – bloków Po / Ko nie ma, odstęp zwalnia się sam`);
    if (emergency) return this.#prepareKo();
    if (this.fault) return this.#fail(`Blokada bez łączności – przyjazd potwierdź telefonicznie (Łączność)`);
    if (this.direction !== 'in') return this.#fail(`Ko: brak przyjętego pociągu`);
    if (!this.koPending) return this.#fail(`Ko: pociąg nie przybył w całości (lub tor szlakowy zajęty)`);
    // bez stwierdzenia przejazdu przy semaforze wjazdowym (wjazd na Sz / rozkaz) Ko działa tylko po dKo
    if (!this.zpg && !this.koPrepared) return this.#fail(`Ko: brak stwierdzenia przejazdu – pociąg wjechał bez sygnału zezwalającego; przygotuj blok końcowy dKo`);
    this.log('info', `Blok końcowy Ko obsłużony – przyjazd potwierdzony`);
    this.#reset();
    return { ok: true };
  }

  /**
   * dKo – doraźne przygotowanie bloku końcowego: przed wjazdem pociągu na Sz / rozkaz zastępuje stwierdzenie przejazdu,
   * potem Ko działa. Przed wjazdem przy zapowiedzianym pociągu – uzasadnione; po wjeździe – spóźnione (kara), inaczej
   * bez uzasadnienia. Blokady nie kasuje.
   */
  #prepareKo() {
    if (this.fault) return this.#fail(`Blokada bez łączności – przyjazd potwierdź telefonicznie (Łączność)`);
    const incoming = this.direction === 'in' || this.fixed === 'in';
    if (!incoming) return this.#fail(`dKo: brak pociągu przyjmowanego od ${this.neighbour}`);
    if (this.koPrepared) return { ok: true, noop: true };
    this.counters.dKo++;
    this.koPrepared = true;
    const late = this.koPending && !this.zpg && !this.overrunByFault;
    const points = this.zpg ? -15 : late ? -10 : 0;
    this.log('warn', `Doraźne przygotowanie bloku końcowego dKo (licznik ${this.counters.dKo})`);
    this.bus.emit('score', { time: this.time, code: 'dKo', points, msg: `dKo na blokadzie do ${this.neighbour}${points === 0 ? ' przed wjazdem na Sz / rozkaz' : late ? ' po wjeździe – należało przed podaniem Sz' : ' bez uzasadnienia (przejazd stwierdzony)'}` });
    this.#emit();
    return { ok: true };
  }

  /** dPo – doraźne zablokowanie bloku początkowego po wyjeździe naszego pociągu bez sygnału zezwalającego. */
  #emergencyPo() {
    if (this.auto) return this.#fail(`Blokada samoczynna – bloków Po / Ko nie ma`);
    if (!this.needPo) return this.#fail(`dPo: brak pociągu wyprawionego do ${this.neighbour} bez sygnału zezwalającego`);
    this.counters.dPo++;
    this.needPo = false; this.poBlocked = true;
    this.log('warn', `Doraźne zablokowanie bloku początkowego dPo (licznik ${this.counters.dPo})`);
    this.bus.emit('score', { time: this.time, code: 'dPo', points: 0, msg: `dPo na blokadzie do ${this.neighbour} po wyjeździe na Sz / rozkaz` });
    this.#emit();
    return { ok: true };
  }

  #reset() {
    this.direction = this.auto ? this.direction : this.fixed; this.permission = false; this.occupied = false;
    this.poBlocked = false; this.koPending = false; this.arrivedFully = false; this.request = null;
    this.pendingArrivalAck = null; this.lineTrain = null; this.beforeEntry = null;
    this.pwl = false; this.pwlRoute = null; this.pwlFault = false; this.needPo = false; this.zpg = false; this.koPrepared = false; this.entrySeen = false; this.overrunByFault = false;
    this.phone.permissionFor = null; this.phone.arrivalConfirmed = null; this.phone.arrivedTrain = null;
    this.phone.askedByThem = null; this.phone.clearedFor = null; this.phone.departedTrain = null;
    this.talk = { askedFor: null, clearedFor: null, theirAsk: null, answered: null };
    this.#emit();
  }

  /* ---- zapowiadanie telefoniczne (usterka blokady) ---- */

  /**
   * Szlak jest „nasz” przy zapowiadaniu: mamy od sąsiada „droga wolna” dla naszego pociągu (telefonogram nie przestawia
   * kierunku blokady – kierunek bywa pusty) albo niewykorzystane pozwolenie sprzed usterki. Wtedy drogi dla pociągu
   * sąsiada się nie daje – na szlak jednotorowy nie wyjadą dwa pociągi naprzeciw siebie.
   */
  #oursUnderFault() {
    return this.phone.permissionFor != null || (this.direction === 'out' && this.permission);
  }

  /** Sąsiad pyta telefonicznie o drogę dla swojego pociągu. */
  phoneAskFromNeighbour(nr) {
    if (this.phone.askedByThem || this.phone.clearedFor || this.occupied || this.awaitingEntry || this.koPending || this.#oursUnderFault()) return false;
    this.phone.askedByThem = nr;
    this.bus.emit('comms', { time: this.time, from: this.neighbour, kind: 'ask', exit: this.id, nr, text: `Czy droga dla pociągu nr ${nr} jest wolna?` });
    this.bus.emit('alarm', { type: 'phone', exit: this.id });
    this.#emit();
    return true;
  }

  /**
   * Nasza odmowa „Stój pociąg nr …” (wzór 5a): sąsiad wycofuje żądanie pozwolenia (przy usterce – zapytanie o drogę)
   * i ponawia je po `HOLD_TIME`. Do tego czasu kierunek jest wolny – można zażądać pozwolenia dla swojego pociągu.
   */
  phoneHold(nr) {
    if (this.auto || this.fixed) return { ok: false, reason: `na tym szlaku ${this.neighbour} nie żąda pozwolenia – pociągu nie wstrzymuje się telefonogramem` };
    const asked = this.fault ? this.phone.askedByThem : (this.request === 'theirs' ? (this.talk.theirAsk ?? nr) : null);
    if (asked == null || String(asked) !== String(nr)) return { ok: false, reason: `${this.neighbour} nie pytał o pociąg nr ${nr}` };
    if (this.fault) this.phone.askedByThem = null;
    else { this.request = null; this.talk.theirAsk = null; this.talk.answered = null; }
    this.heldUntil = this.time + HOLD_TIME;
    this.log('info', `Pociąg nr ${nr} wstrzymany u sąsiada („Stój pociąg”) – ${this.neighbour} zgłosi go ponownie`);
    this.#emit();
    return { ok: true };
  }

  /** Nasza odpowiedź „Droga dla pociągu nr … wolna”. */
  phoneAnswerFree(nr) {
    if (!this.fault) {
      // sprawna blokada, szlak jednotorowy: telefonogram 4a przed Poz (pozwolenie przenosi blokada)
      if (!this.#single() || String(this.talk.theirAsk) !== String(nr)) return { ok: false, reason: `${this.neighbour} nie pytał o pociąg nr ${nr}` };
      this.talk.answered = nr;
      return { ok: true };
    }
    if (String(this.phone.askedByThem) !== String(nr)) return { ok: false, reason: `${this.neighbour} nie pytał o pociąg nr ${nr}` };
    if (this.occupied || this.awaitingEntry || this.koPending || this.#oursUnderFault()) return { ok: false, reason: `Droga nie jest wolna` };
    this.phone.askedByThem = null;
    this.phone.clearedFor = nr; // telefonogram nie przestawia kierunku blokady
    this.log('info', `Zapowiedziano telefonicznie: droga dla pociągu ${nr} wolna`);
    this.#emit();
    return { ok: true };
  }

  /** Nasze pytanie o drogę dla naszego pociągu – sąsiad odpowiada po chwili. */
  phoneAskNeighbour(nr) {
    if (!this.fault) {
      // sprawna blokada: na szlaku jednotorowym zapytanie 1a przed Wbl; na dwutorowym zapytania się nie stosuje
      if (!this.#single()) return { ok: false, reason: `tor szlakowy linii dwutorowej – zapytanie o drogę zbędne` };
      this.talk.askedFor = nr;
      const free = !this.occupied && this.direction !== 'in' && this.request !== 'theirs';
      this.#phoneIn(free ? `Dla pociągu nr ${nr} droga jest wolna.` : `Stój pociąg nr ${nr} – tor szlakowy zajęty.`, 6 + this.random() * 8);
      return { ok: true };
    }
    if (this.fixed === 'out') return { ok: false, reason: `tor właściwy linii dwutorowej – zapytanie zbędne, wystarczy potwierdzony przyjazd poprzedniego pociągu` };
    // przy zapowiadaniu blok początkowy zostaje zablokowany do naprawy – o wolnej drodze decyduje telefonogram
    if (this.occupied) return { ok: false, reason: `tor szlakowy zajęty` };
    this.neighbourReply = { at: this.time + 8 + this.random() * 15, phoneFor: nr };
    return { ok: true };
  }

  /** Nasze zawiadomienie o przyjeździe pociągu sąsiada. */
  phoneReportArrival(nr) {
    if (String(this.phone.arrivedTrain) !== String(nr) || !this.koPending) return { ok: false, reason: `pociąg nr ${nr} nie przybył w całości od ${this.neighbour}` };
    this.phone.arrivalConfirmed = nr;
    this.koPending = false; // przy zapowiadaniu telefonicznym telefonogram zastępuje Ko
    this.#emit();
    this.#phoneIn(`Powtarzam: pociąg nr ${nr} przyjechał.`, 2); // odbiorca powtarza treść telefonogramu
    return { ok: true };
  }

  /** Nasze zawiadomienie o odjeździe naszego pociągu. */
  phoneReportDeparture(nr) {
    if (String(this.phone.departedTrain) !== String(nr)) return { ok: false, reason: `pociąg nr ${nr} nie odjechał na szlak do ${this.neighbour}` };
    this.phone.departedReported = true;
    this.#phoneIn(`Powtarzam: pociąg nr ${nr} odjechał.`, 2); // odbiorca powtarza treść telefonogramu
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
    this.occupied = true; this.permission = false; this.lineTrain = train.nr; this.lineOurs = true;
    this.phone.permissionFor = null; this.phone.departedTrain = train.nr;
    if (this.fault && !this.fixed) this.faultDir = null; // pozwolenie sprzed usterki wykorzystane – następny pociąg na Sz / rozkaz
    // zawiadomienie o odjeździe: przy zapowiadaniu telefonicznym, a na linii dwutorowej (Eap, SBL) – numer pociągu zawsze
    // (Ir-1 §28 ust. 2, §29 ust. 4)
    const notice = this.fault || this.fixed || this.auto;
    if (notice && !this.fault && this.phoneRoutine === 'auto') { this.#phoneOut(`Pociąg nr ${train.nr} odjechał o ${Clock.format(this.time)}.`); this.phone.departedReported = true; }
    else if (notice) this.phone.departedReported = false;
    // blok początkowy blokuje sam pociąg wyjeżdżający na sygnał zezwalający; po wyjeździe na Sz / rozkaz (albo przy
    // zapowiadaniu telefonicznym) – dyżurny doraźnie dPo
    const onSignal = train.exitAuth !== '*' && !this.fault;
    if (this.auto) { this.poBlocked = true; this.log('info', `Pociąg ${train.nr} wyjechał na szlak – odstęp zajęty`); }
    else if (onSignal) { this.poBlocked = true; this.log('info', `Pociąg ${train.nr} wyjechał na szlak – blok początkowy zablokowany`); }
    else { this.needPo = true; this.log('warn', `Pociąg ${train.nr} wyjechał na szlak bez sygnału zezwalającego – zablokuj blok początkowy (dPo)`); }
    this.pwl = false; this.pwlRoute = null; this.pwlFault = false;
    this.#emit();
  }

  /** Nasz pociąg dotarł do sąsiada (koniec toru szlakowego). */
  trainArrivedAtNeighbour(train) {
    this.log('info', `Pociąg ${train.nr} przybył do ${this.neighbour}`);
    if (!this.fault && !this.phone.departedReported) {
      this.phone.departedReported = true;
      this.#routineMissed(`Brak zawiadomienia o odjeździe pociągu nr ${train.nr}`);
    }
    if (this.needPo) {
      this.needPo = false;
      this.bus.emit('score', { time: this.time, code: 'no-dpo', points: -10, msg: `Blok początkowy do ${this.neighbour} nie zablokowany (dPo) po wyjeździe pociągu ${train.nr} bez sygnału` });
    }
    if (this.auto && !this.fault) {
      // SBL: odstęp zwalnia się sam, gdy pociąg go opuści – bez potwierdzenia sąsiada
      this.occupied = false; this.poBlocked = false; this.lineTrain = null; this.permission = false;
      this.log('info', `Pociąg ${train.nr} zjechał z odstępu – odstęp do ${this.neighbour} wolny`);
      this.#emit();
      return;
    }
    if (this.fault) {
      // sąsiad zawiadamia telefonicznie – tor szlakowy wolny; blok początkowy zostaje zablokowany do naprawy blokady
      this.pendingArrivalAck = null;
      this.occupied = false; this.lineTrain = null;
      this.phone.arrivalConfirmed = train.nr;
      this.#phoneIn(`Pociąg nr ${train.nr} przyjechał o ${Clock.format(this.time)}.`, 5);
      if (!this.phone.departedReported) this.bus.emit('score', { time: this.time, code: 'no-depart-report', points: -10, msg: `Brak telefonicznego zawiadomienia ${this.neighbour} o odjeździe pociągu ${train.nr}` });
      this.phone.departedReported = true;
      return;
    }
    this.pendingArrivalAck = this.time + 10 + this.random() * 20;
  }

  /** Pociąg sąsiada wjechał na tor szlakowy (w naszym kierunku). */
  neighbourTrainEntered(train) {
    this.occupied = true; this.arrivedFully = false; this.koPending = false; this.lineTrain = train.nr; this.lineOurs = false; this.zpg = false; this.entrySeen = false; this.overrunByFault = false;
    this.log('info', `Pociąg ${train.nr} wyjechał z ${this.neighbour} – tor szlakowy zajęty`);
    if (this.fault || this.fixed || this.auto) this.#phoneIn(`Pociąg nr ${train.nr} odjechał o ${Clock.format(this.time)}.`);
    this.#emit();
  }

  /** Pociąg sąsiada w całości opuścił tor szlakowy (jest na stacji). */
  neighbourTrainArrived(train) {
    if (!this.occupied) return;
    this.occupied = false; this.arrivedFully = true; this.lineTrain = null; this.phone.arrivedTrain = train.nr; this.phone.clearedFor = null;
    this.beforeEntry = this.entrySeen ? null : train.nr; // stoi jeszcze przed semaforem wjazdowym
    if (this.auto && !this.fault) {
      // blokada samoczynna: odstęp zwalnia się po zjeździe pociągu, bez obsługi
      this.koPending = false;
      this.log('info', `Pociąg ${train.nr} przybył w całości – odstęp blokowy zwolniony samoczynnie`);
    } else if (this.entrySeen) {
      this.#arrivalComplete();
    }
    this.#emit();
  }

  /** Żądanie pozwolenia od sąsiada (AI). */
  neighbourRequests(nr) {
    if (this.time < this.heldUntil && !this.auto && !this.fixed) return false; // pociąg wstrzymany naszym „Stój pociąg”
    // przy zapowiadaniu na torze właściwym linii dwutorowej sąsiad nie pyta – wyprawia po potwierdzonym przyjeździe
    if (this.fault) return this.fixed === 'in' ? !this.occupied && !this.awaitingEntry && !this.koPending : this.phoneAskFromNeighbour(nr);
    if (this.auto) { this.#neighbourWantsDirection(); return !this.occupied && !this.koPending && !this.poBlocked && !this.awaitingEntry; }
    if (this.fixed === 'in') return !this.occupied && !this.awaitingEntry && !this.koPending; // blokada jednokierunkowa: bez pozwolenia
    if (this.fixed === 'out') return false;
    if (this.request || this.direction || this.occupied) return false;
    this.request = 'theirs'; this.requestSince = this.time;
    // szlak jednotorowy: zapytanie o drogę (wzór 1a) przed żądaniem pozwolenia przez blokadę
    if (nr != null) { this.talk.theirAsk = nr; this.talk.answered = null; this.bus.emit('comms', { time: this.time, from: this.neighbour, kind: 'ask', exit: this.id, nr, text: `Czy droga dla pociągu nr ${nr} jest wolna?` }); }
    this.log('info', `${this.neighbour} żąda pozwolenia na wyprawienie pociągu – daj pozwolenie (Poz)`);
    this.bus.emit('alarm', { type: 'request', exit: this.id });
    this.#emit();
    return true;
  }

  /**
   * Blokada samoczynna: sąsiad chce wyprawić pociąg do nas, a kierunek jest na odjazd – prosi o zmianę kierunku (alarm)
   * i czeka na naszą zgodę (Zk), o ile odstęp jest wolny i nie mamy nastawionego wyjazdu.
   */
  #neighbourWantsDirection() {
    if (this.direction === 'in' || this.occupied || this.koPending || this.poBlocked || this.permission || this.awaitingEntry) return;
    if (this.request === 'theirs') return;
    if (this.request === 'ours') { this.request = null; this.neighbourReply = null; } // obie strony chcą kierunku – decyduje nasza zgoda
    this.request = 'theirs'; this.requestSince = this.time;
    this.log('info', `${this.neighbour} prosi o zmianę kierunku blokady samoczynnej na przyjazd do nas – zgoda: Zk`);
    this.bus.emit('alarm', { type: 'request', exit: this.id });
    this.#emit();
  }

  /**
   * Czy zgłoszenie pociągu `nr` przez sąsiada jest nadal w toku. Zmiana trybu blokady (usterka łączności, naprawa)
   * kasuje żądanie pozwolenia albo telefonogram – sąsiad musi wtedy zgłosić pociąg od nowa, właściwą drogą.
   */
  neighbourRequestAlive(nr) {
    if (this.auto || this.fixed === 'in') return true; // SBL i blokada jednokierunkowa: sąsiad nie żąda pozwolenia
    if (this.fault) return String(this.phone.askedByThem) === String(nr) || String(this.phone.clearedFor) === String(nr);
    return this.request === 'theirs' || this.direction === 'in';
  }

  canNeighbourDispatch(nr) {
    if (this.fault) return this.fixed === 'in' ? !this.occupied && !this.awaitingEntry && !this.koPending : String(this.phone.clearedFor) === String(nr) && !this.occupied && !this.awaitingEntry;
    // SBL: sąsiad z pociągiem do wyprawienia prosi o kierunek przyjazdu (np. po naszej jeździe po torze lewym) i czeka
    // na zgodę
    if (this.auto) {
      if (this.direction !== 'in') { this.#neighbourWantsDirection(); return false; }
      return !this.occupied && !this.koPending && !this.poBlocked && !this.awaitingEntry;
    }
    if (this.fixed === 'in') return !this.occupied && !this.awaitingEntry && !this.koPending;
    return this.direction === 'in' && !this.occupied && !this.awaitingEntry;
  }

  tick(time) {
    this.time = time;
    if (this.neighbourReply && this.neighbourReply.at <= time) {
      const reply = this.neighbourReply;
      this.neighbourReply = null;
      if (reply.phoneFor && !this.fault) {
        // odpowiedź na zapytanie z czasu usterki przyszła po naprawie – zapowiadanie już nie obowiązuje
      } else if (reply.phoneFor) {
        // droga wolna dopiero, gdy pociąg sąsiada minął nasz semafor wjazdowy i jego przyjazd jest zawiadomiony
        const free = !this.occupied && !this.phone.askedByThem && !this.phone.clearedFor && !this.awaitingEntry && !this.koPending;
        this.bus.emit('comms', { time, from: this.neighbour, kind: 'info', exit: this.id, text: free ? `Dla pociągu nr ${reply.phoneFor} droga jest wolna.` : `Stój pociąg nr ${reply.phoneFor} – tor szlakowy zajęty.` });
        if (free) this.phone.permissionFor = reply.phoneFor; // telefonogram nie przestawia kierunku blokady
        this.#emit();
      } else if (reply.dirChange) {
        if (this.request === 'ours') {
          this.request = null;
          if (this.occupied || this.poBlocked || this.koPending || this.awaitingEntry) this.log('warn', `${this.neighbour} nie zgadza się na zmianę kierunku – odstęp zajęty`);
          else {
            this.direction = this.direction === 'out' ? 'in' : 'out';
            this.permission = false;
            this.log('info', `${this.neighbour} zgodził się na zmianę kierunku blokady samoczynnej – ${Clock.format(time)} (dziennik ruchu), kierunek: ${this.direction === 'out' ? 'odjazd' : 'przyjazd'}`);
          }
        }
        this.#emit();
      } else if (reply.giveBack) {
        if (this.direction === 'out' && this.permission && !this.pwl && !this.occupied) {
          this.direction = null; this.permission = false;
          this.log('info', `Pozwolenie zwrócone – blokada w położeniu zasadniczym`);
        }
        this.#emit();
      } else if (this.request === 'ours') {
        this.request = null;
        if (this.occupied || this.direction) {
          this.log('warn', `${this.neighbour} odmawia pozwolenia`);
        } else {
          this.direction = 'out'; this.permission = true;
          if (reply.nr != null && this.phoneRoutine === 'auto') this.#phoneIn(`Dla pociągu nr ${reply.nr} droga jest wolna.`);
          this.log('info', `${this.neighbour} dał pozwolenie na wyjazd (Poz)`);
        }
        this.#emit();
      }
    }
    if (this.pendingArrivalAck && this.pendingArrivalAck <= time) {
      this.pendingArrivalAck = null;
      this.log('info', this.auto ? `Odstęp do ${this.neighbour} wolny` : `${this.neighbour} potwierdził przyjazd (Ko) – tor szlakowy wolny`);
      this.occupied = false; this.poBlocked = false; this.lineTrain = null; this.direction = this.auto ? this.direction : this.fixed; this.permission = false;
      this.needPo = false; this.pwl = false; this.pwlRoute = null; this.pwlFault = false;
      this.#emit();
    }
  }

  snapshot() {
    return {
      id: this.id, auto: this.auto, direction: this.direction, request: this.request, permission: this.permission,
      occupied: this.occupied, poBlocked: this.poBlocked, koPending: this.koPending, lineTrain: this.lineTrain, counters: { ...this.counters },
      pwl: this.pwl, needPo: this.needPo, zpg: this.zpg, koPrepared: this.koPrepared,
    };
  }
}
