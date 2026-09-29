import { speedFor, dynamicsFor } from './categories.js';
import { Interlocking } from './Interlocking.js';
import { OPPOSITE } from '../tiles/directions.js';

const KMH = 1 / 3.6;
/** Opóźnienie hamowania nagłego (m/s²) – większego pociąg nie osiąga (Dz.U. 2015 poz. 360 zał. 1: setki metrów drogi). */
export const EMERGENCY_BRAKE = 1.3;

/**
 * Pociąg poruszający się po topologii toru według rzeczywistych położeń zwrotnic
 * i obrazów sygnałowych. Pozycja: ślad (`trail`) przebytych kostek i odległość czoła.
 *
 * Segment śladu: { tile|null, inPort, outPort, len, start, virtual: exitId|null }
 * Segment wirtualny = tor szlakowy (poza pulpitem).
 */
export class Train {
  constructor(def, topo, ilk, opts = {}) {
    this.def = def;
    this.nr = def.nr;
    this.topo = topo;
    this.ilk = ilk;
    this.length = def.length ?? 100;
    this.blockedBy = opts.blockedBy || (() => false); // odcinek zajęty przez inny tabor (jazda na tor zajęty – stop przed taborem)
    // prędkość maksymalna i dynamika wg kategorii pociągu (IC/TLK/R/SKM/towarowy…) – `vmax`/`accel`/`brake` wpisu nadpisują
    this.vmax = speedFor(def) * KMH;
    const dyn = dynamicsFor(def);
    this.accel = dyn.accel;
    this.brake = dyn.brake;
    this.v = 0;
    this.trail = [];
    this.head = 0;           // odległość czoła wzdłuż śladu
    this.mode = opts.mode || 'train'; // 'train' | 'shunt'
    this.state = 'moving';   // moving | stopped | dwell | done
    this.dwellUntil = null;
    this.stoppedAt = null;   // co zatrzymało pociąg (signal id / platform / buffer)
    this.stopTarget = null;
    this.plannedTrack = def.track || null;
    this.arrivedAt = null;
    this.departedAt = null;
    this.hasStopped = false;
    this.delay = 0;
    this.finished = false;
    this.onExit = opts.onExit || (() => {});
    this.onEvent = opts.onEvent || (() => {});
    this.entered = false;     // czoło wjechało na pulpit
    this.fullyIn = false;     // cały pociąg na pulpicie
    this.lineSpeed = (opts.lineSpeed ?? 100) * KMH;
    this.activeLimit = Infinity; // ograniczenie obowiązujące do następnego sygnalizatora (np. Sz – 20 km/h)
    this.zoneLimit = null;       // ograniczenie z obrazu semafora do końca okręgu zwrotnicowego ({ speed, sections, entered })
    this.orders = [];            // rozkazy pisemne: { signal, used }
    // zezwolenie na jazdę pociągu: mija semafor na sygnał zezwalający (albo Sz / rozkaz) – do tej chwili pociąg utworzony
    // na stacji, po zmianie czoła albo przełączeniu z manewrów rusza tylko na sygnał semafora przed sobą
    this.authority = false;
    this.exitAuth = null;        // wyjazd na szlak: id wyjazdu z przebiegu minionego semafora, '*' po Sz / rozkazie
    this.shuntRoute = null;      // przebieg manewrowy, na którego sygnał Ms2 skład minął sygnalizator
    this.spad = null;            // przejechany semafor „Stój” – hamowanie nagłe do zatrzymania
  }

  /** Utrata zezwolenia (zmiana czoła, zmiana rodzaju jazdy) – dalsza jazda dopiero na nowy sygnał. */
  clearAuthority() {
    this.authority = false; this.exitAuth = null; this.shuntRoute = null; this.spad = null;
  }

  /** Czy pociąg ma niewykorzystany rozkaz pisemny na przejazd obok sygnalizatora. */
  hasOrderFor(signalId) {
    return this.orders.some((o) => o.signal === signalId && !o.used);
  }

  /** Ograniczenia przed czołem (do diagnostyki); `listSignals` – także mijane sygnalizatory z sygnałem zezwalającym. */
  constraintsAhead(maxDist = 1500, listSignals = false) {
    return this.#lookahead(maxDist, listSignals);
  }

  /** Identyfikator najbliższego sygnalizatora przed czołem (ważnego dla tej jazdy) lub null. */
  nextSignal() {
    const c = this.#lookahead(3000, true).find((x) => x.kind === 'signal' || x.kind === 'passed-signal');
    return c ? c.signal : null;
  }

  /** Umieszcza pociąg na wirtualnym torze szlakowym przed wjazdem przez `exitId`. */
  placeOnLine(exitId, lineLength) {
    this.trail = [{ tile: null, inPort: null, outPort: null, len: lineLength, start: 0, virtual: exitId, entering: true }];
    this.head = this.length; // cały pociąg na szlaku
    this.v = Math.min(this.vmax, this.lineSpeed);
    this.state = 'moving';
    this.authority = true; // jazda po szlaku na podstawie blokady / sygnału semafora odstępowego
  }

  /** Umieszcza stojący pociąg na kostkach (czoło na kostce `headTile`, kierunek `dir`). */
  placeOnTrack(tiles, headDir) {
    // tiles: lista kostek od ogona do czoła, headDir: port wyjścia z ostatniej kostki
    let start = 0;
    this.trail = [];
    for (let i = 0; i < tiles.length; i++) {
      const t = tiles[i];
      const outPort = i === tiles.length - 1 ? headDir : this.#portTowards(t, tiles[i + 1]);
      const inPort = i === 0 ? this.#otherPort(t, outPort) : this.#portTowards(t, tiles[i - 1]);
      this.trail.push({ tile: t, inPort, outPort, len: t._len, start, virtual: null });
      start += t._len;
    }
    this.head = start;
    this.v = 0;
    this.state = 'stopped';
    this.entered = true; this.fullyIn = true;
  }

  #portTowards(t, other) {
    const dx = other.x - t.x, dy = other.y - t.y;
    const names = { '0,-1': 'N', '1,-1': 'NE', '1,0': 'E', '1,1': 'SE', '0,1': 'S', '-1,1': 'SW', '-1,0': 'W', '-1,-1': 'NW' };
    return names[`${dx},${dy}`];
  }

  #otherPort(t, p) {
    return t._def.ports(t).find((q) => q !== p) || p;
  }

  get tail() {
    return this.head - this.length;
  }

  get direction() {
    const last = this.trail[this.trail.length - 1];
    if (!last) return null;
    if (last.outPort) return last.outPort;
    if (last.tile && last.inPort) return OPPOSITE[last.inPort]; // czoło na kozle – kierunek jak przy wjeździe
    if (last.virtual && last.entering) return this.topo.station.exits[last.virtual].dir === 'W' ? 'E' : 'W';
    return null;
  }

  /** Odcinki zajęte przez pociąg. */
  occupiedSections() {
    const set = new Set();
    for (const seg of this.trail) {
      if (!seg.tile) continue;
      if (seg.start < this.head && seg.start + seg.len > this.tail) set.add(seg.tile.section);
    }
    return set;
  }

  /** Czy pociąg (jakakolwiek część) jest na wirtualnym szlaku `exitId`. */
  onLine(exitId) {
    return this.trail.some((seg) => seg.virtual === exitId && seg.start < this.head && seg.start + seg.len > this.tail);
  }

  /** Kostki zajęte z pozycją (do renderowania). */
  occupiedTiles() {
    return this.trail.filter((seg) => seg.tile && seg.start < this.head && seg.start + seg.len > this.tail).map((s) => s.tile);
  }

  /**
   * Skanuje tor przed czołem: zwraca listę ograniczeń { dist, speed, reason, kind }.
   * `dist` – odległość od czoła do początku ograniczenia.
   */
  #lookahead(maxDist, listSignals = false) {
    const constraints = [];
    const positions = this.ilk.positions();
    let seg = this.trail[this.trail.length - 1];
    let distToSegEnd = seg.start + seg.len - this.head;
    let tile = seg.tile, outPort = seg.outPort, inPort = seg.inPort;
    let dist = distToSegEnd;
    // Ograniczenie na bieżącej kostce (zwrotnica na tor zwrotny)
    if (tile) {
      const lim = this.#tileLimit(tile, inPort, outPort);
      if (lim < Infinity) constraints.push({ dist: 0, speed: lim, reason: `zwrotnica ${tile.id}`, kind: 'limit' });
    }
    if (seg.virtual && !seg.entering) {
      constraints.push({ dist: 0, speed: Math.min(this.lineSpeed, this.vmax), reason: 'szlak', kind: 'limit' });
      return constraints;
    }
    if (tile && !outPort) {
      // czoło na kostce bez wyjścia (kozioł) – koniec toru
      constraints.push({ dist: 0, speed: 0, reason: 'kozioł', kind: 'end' });
      return constraints;
    }
    // Sygnalizator na końcu bieżącej kostki
    let guard = 0;
    while (dist < maxDist && guard++ < 200) {
      if (seg.virtual && seg.entering) {
        // Wjazd na pulpit przez kostkę wyjazdu
        const e = this.topo.station.exits[seg.virtual];
        const t = this.topo.trackAt(e.tile.x, e.tile.y);
        tile = t; inPort = e.dir; outPort = t._def.exits(t, inPort, null)[0];
        seg = { tile, inPort, outPort, len: t._len, virtual: null };
      } else {
        // Miejsce zatrzymania przy peronie: 12 m przed semaforem końcowym toru peronowego
        // (lub 15 m przed końcem odcinka peronowego bez semafora)
        if (this.#shouldStopAt(tile)) {
          const sigHere = this.topo.signalsAt(tile, outPort).some((sg) => this.mode !== 'train' || sg.kind === 'semafor');
          const nbT = this.topo.neighbour(tile, outPort);
          const sectionEnds = !nbT || nbT.tile.section !== tile.section;
          const platform = this.ilk.sections.get(tile.section)?.platform;
          if (sigHere) constraints.push({ dist: dist - 12, speed: 0, reason: 'peron', kind: 'platform', tile });
          // tor bez peronu (pociąg kończący bieg): zatrzymanie tylko przed sygnalizatorem na końcu toru
          else if (platform && sectionEnds) constraints.push({ dist: dist - 15, speed: 0, reason: 'peron', kind: 'platform', tile });
        }
        // Sygnalizator przy wyjeździe z kostki `tile` portem `outPort`
        for (const s of this.topo.signalsAt(tile, outPort)) {
          const sig = this.ilk.signals.get(s.id);
          const relevant = this.mode === 'train' ? sig.kind === 'semafor' : true;
          if (!relevant) continue;
          // skład manewrowy jedzie obok semafora tylko na sygnał manewrowy Ms2 – sygnał pociągowy (przebieg na szlak)
          // go nie dotyczy, więc nie wyjedzie ze stacji jako manewr
          // pociąg – tylko sygnał zezwalający dla pociągu: Ms2 na semaforze dla niego znaczy „Stój” (Ie-1 §4 ust. 17)
          const proceed = this.mode === 'shunt' ? (sig.kind === 'semafor' ? Interlocking.isShuntProceed(sig.aspect) : Interlocking.isProceed(sig.aspect))
            : Interlocking.isTrainProceed(sig.aspect);
          if (!proceed) {
            if (this.hasOrderFor(sig.id)) {
              // Rozkaz pisemny: przejazd obok semafora „Stój” z prędkością do 20 km/h
              constraints.push({ dist, speed: 20 * KMH, reason: `rozkaz pisemny ${sig.id}`, kind: listSignals ? 'passed-signal' : 'limit', signal: sig.id });
              continue;
            }
            constraints.push({ dist, speed: 0, reason: sig.id, kind: 'signal', signal: sig.id });
            return constraints;
          }
          if (listSignals) constraints.push({ dist, speed: Infinity, kind: 'passed-signal', signal: sig.id });
          const sp = Interlocking.aspectSpeed(sig.aspect);
          if (sp < Infinity) constraints.push({ dist, speed: sp * KMH, reason: `sygnał ${sig.aspect} na ${sig.id}`, kind: 'limit', until: 'next-signal' });
        }
        const exit = this.topo.exitAt(tile, outPort);
        if (exit) {
          if (this.mode === 'shunt') { constraints.push({ dist, speed: 0, reason: 'granica stacji – manewry', kind: 'signal', signal: exit.id }); return constraints; }
          // na szlak tylko przebiegiem wyjazdowym (albo na Sz / rozkaz pisemny z semafora wyjazdowego)
          if (this.exitAuth !== exit.id && this.exitAuth !== '*') { constraints.push({ dist, speed: 0, reason: 'granica stacji – brak przebiegu wyjazdowego', kind: 'signal', signal: exit.id }); return constraints; }
          constraints.push({ dist, speed: Math.min(this.lineSpeed, this.vmax), reason: 'szlak', kind: 'limit' });
          return constraints;
        }
        const nb = this.topo.neighbour(tile, outPort);
        if (!nb) { constraints.push({ dist, speed: 0, reason: 'koniec toru', kind: 'end' }); return constraints; }
        const st = this.topo.step(nb.tile, nb.inPort, positions);
        tile = nb.tile; inPort = nb.inPort; outPort = st.outPort;
        if (tile.type === 'buffer') { constraints.push({ dist: dist + tile._len * 0.5, speed: 0, reason: 'kozioł', kind: 'end' }); return constraints; }
        if (tile.section && this.blockedBy(tile.section)) { constraints.push({ dist: Math.max(0, dist - 10), speed: 0, reason: 'tabor na torze', kind: 'end' }); return constraints; }
        if (tile.type === 'point') {
          const p = this.ilk.points.get(tile.id);
          if (p.moving || !p.control) { constraints.push({ dist, speed: 0, reason: `zwrotnica ${tile.id} bez kontroli`, kind: 'end' }); return constraints; }
        }
        const lim = this.#tileLimit(tile, inPort, outPort);
        if (lim < Infinity) constraints.push({ dist, speed: lim, reason: `zwrotnica ${tile.id}`, kind: 'limit' });
        if (!outPort) { constraints.push({ dist: dist + tile._len, speed: 0, reason: 'koniec toru', kind: 'end' }); return constraints; }
      }
      dist += tile._len;
    }
    return constraints;
  }

  #tileLimit(tile, inPort, outPort) {
    if (tile.type !== 'point') return Infinity;
    const req = tile._def.requiredPosition(tile, inPort, outPort);
    if (req === '-') return (this.ilk.points.get(tile.id)?.speedDiverging ?? 40) * KMH;
    return Infinity;
  }

  #shouldStopAt(tile) {
    if (this.mode !== 'train' || !this.def.stop || this.hasStopped) return false;
    const sec = this.ilk.sections.get(tile.section);
    // pociąg kończący bieg zatrzymuje się na torze stacyjnym także bez peronu (np. odstawczy)
    if (!sec?.platform && !(this.def.terminates && sec?.kind === 'station')) return false;
    if (this.plannedTrack && String(sec.track) !== String(this.plannedTrack)) {
      // Zatrzymanie na innym torze niż planowany, jeżeli ma peron – dopuszczalne
    }
    return true;
  }

  /** Krok symulacji. */
  tick(dt, time) {
    if (this.finished) return;
    if (this.def.terminates && this.hasStopped && this.mode === 'train') return; // zakończył bieg – czeka na manewry
    if (this.holdUntil && this.mode === 'train' && this.v === 0 && time < this.holdUntil) return; // pociąg gotowy, czeka na czas odjazdu
    if (this.state === 'dwell') {
      // odjazd z peronu dopiero na sygnał zezwalający (Sz, rozkaz) – nie podjazd pod semafor na „Stój”
      if (time >= this.dwellUntil && this.#canDepart(time) && this.#clearToLeave()) {
        this.state = 'moving'; this.departedAt = time;
        this.onEvent('depart', this);
      } else return;
    }
    // horyzont skanowania nie krótszy niż droga hamowania z bieżącej prędkości (szybkie pociągi: IC 160 km/h ≈ 1,8 km)
    const constraints = this.#lookahead(Math.max(1500, (this.v * this.v) / (2 * this.brake) + 300));
    // Prędkość docelowa uwzględniająca drogę hamowania: v² = u² + 2·b·s; na stacji nie szybciej niż prędkość szlaku
    // (prędkość drogowa) – rozjazdy i sygnały ograniczają dalej
    let allowed = Math.min(this.vmax, this.activeLimit, this.lineSpeed, this.#pointsUnderTrain(), this.#zoneSpeed());
    if (this.mode === 'shunt' && this.v === 0 && !this.#shuntPermitted()) return; // manewry tylko na sygnał Ms2 (lub w nastawionym przebiegu manewrowym)
    if (this.mode === 'train' && this.v === 0 && !this.authority && !this.#mayStart()) return; // pociąg bez zezwolenia – czeka na sygnał
    let stopC = null;
    // hamowanie służbowe; gdy ograniczenie pojawi się bliżej niż droga hamowania (sygnał odwołany, usterka) – mocniej,
    // najwyżej hamowaniem nagłym: pociąg nie staje „w miejscu”
    let decel = this.brake;
    for (const c of constraints) {
      const v = Math.sqrt(c.speed * c.speed + 2 * this.brake * Math.max(0, c.dist));
      if (c.speed === 0 && c.dist <= 0.5 && (!stopC || c.dist < stopC.dist)) stopC = c;
      if (v < allowed) allowed = v;
      if (c.speed === 0 && (!stopC || c.dist < stopC.dist)) stopC = c;
      if (c.speed < this.v) decel = Math.max(decel, (this.v * this.v - c.speed * c.speed) / (2 * Math.max(0.5, c.dist)));
    }
    if (this.spad) { allowed = 0; decel = EMERGENCY_BRAKE; }
    decel = Math.min(decel, Math.max(this.brake, EMERGENCY_BRAKE));
    const v0 = this.v;
    if (this.v < allowed) this.v = Math.min(allowed, this.v + this.accel * dt);
    else this.v = Math.max(allowed, this.v - decel * dt);
    // pociąg utworzony ze składu (holdUntil) rusza bez postoju handlowego – odjazd rejestruje się przy pierwszym ruchu
    if (this.holdUntil && this.mode === 'train' && !this.departedAt && this.v > 0) { this.departedAt = time; this.onEvent('depart', this); }
    if (this.v < 0.05 && allowed < 0.1) this.v = 0;

    let move = this.v * dt;
    // dojazd do miejsca zatrzymania (ostatnie metry, mała prędkość); szybszy pociąg go przejeżdża
    if (stopC && stopC.dist >= 0 && move >= stopC.dist - 0.01 && stopC.dist < 3 && this.v <= 4) {
      move = Math.max(0, stopC.dist - 0.01);
      this.v = Math.min(this.v, Math.max(0, v0 - EMERGENCY_BRAKE * dt)); // stoi w miejscu zatrzymania, prędkość wygasa
      if (this.v < 0.05) this.v = 0;
    }
    if (move > 0) this.#advance(move);

    if (this.v === 0 && this.spad) {
      // zatrzymanie po przejechaniu „Stój” – dalej tylko na nowe zezwolenie (sygnał następnego semafora, rozkaz)
      this.state = 'stopped'; this.stoppedAt = { kind: 'spad', signal: this.spad, reason: `za semaforem ${this.spad}` };
      this.spad = null;
      this.onEvent('stop', this);
    } else if (this.v === 0) {
      if (this.state === 'moving' && stopC) {
        this.state = 'stopped';
        this.stoppedAt = stopC;
        if (stopC.kind === 'platform') {
          this.hasStopped = true;
          this.arrivedAt = time;
          if (this.def.terminates) {
            this.state = 'stopped'; // pociąg kończy bieg – stoi do czasu przełączenia w manewry
          } else {
            this.dwellUntil = time + (this.def.dwell ?? 40);
            this.state = 'dwell';
          }
          this.onEvent('arrive', this);
        } else if (stopC.kind === 'end' && this.def.terminates && !this.hasStopped) {
          this.hasStopped = true; this.arrivedAt = time; this.state = 'stopped';
          this.onEvent('arrive', this);
        } else {
          this.onEvent('stop', this);
        }
      }
    } else if (this.state === 'stopped') {
      this.state = 'moving';
    }
  }

  /** Zwrotnice pod pociągiem: kierunek zwrotny ogranicza szybkość, dopóki ostatni wagon nie zjedzie z rozjazdu. */
  #pointsUnderTrain() {
    let v = Infinity;
    for (const seg of this.trail) {
      if (!seg.tile || !seg.outPort || seg.start >= this.head || seg.start + seg.len <= this.tail) continue;
      v = Math.min(v, this.#tileLimit(seg.tile, seg.inPort, seg.outPort));
    }
    return v;
  }

  /**
   * Ograniczenie z obrazu semafora (S10–S13, Sr3: 40 km/h) obowiązuje od semafora do końca okręgu zwrotnicowego
   * (Ie-1 §3) – do chwili, gdy cały pociąg zjedzie z odcinków zwrotnicowych przebiegu.
   */
  #zoneSpeed() {
    const z = this.zoneLimit;
    if (!z) return Infinity;
    const occ = this.occupiedSections();
    const inside = [...z.sections].some((id) => occ.has(id));
    if (inside) z.entered = true;
    else if (z.entered) { this.zoneLimit = null; return Infinity; }
    return z.speed;
  }

  /** Okręg zwrotnicowy za semaforem: odcinki zwrotnic przebiegu, na który semafor podaje sygnał. */
  #zoneOf(sig, speed) {
    const route = sig.route && this.ilk.active.get(sig.route)?.route;
    if (!route) return null;
    const pointSections = new Set([...this.ilk.points.values()].map((p) => p.section));
    const sections = new Set(route.sections.filter((id) => pointSections.has(id)));
    return sections.size ? { speed: speed * KMH, sections, entered: false } : null;
  }

  /**
   * Jazda manewrowa dozwolona: najbliższy sygnalizator przed czołem (przed najbliższą zwrotnicą) albo pod składem,
   * zwrócony w kierunku jazdy, wskazuje Ms2 / M2, albo skład jest w przebiegu manewrowym, na którego sygnał minął
   * sygnalizator. Przebieg manewrowy innej jazdy, na którego odcinkach skład
   * stoi, nie jest zezwoleniem (Ie-1 §3).
   */
  #shuntPermitted() {
    const act = this.shuntRoute && this.ilk.active.get(this.shuntRoute);
    if (act) {
      const occ = this.occupiedSections();
      if (occ.has(act.route.approach) || act.route.sections.some((sid) => occ.has(sid))) return true;
    }
    // sygnalizator pod składem (skład stoi częściowo za nim), zwrócony w kierunku jazdy
    for (const seg of this.trail) {
      if (!seg.tile || !seg.outPort || seg.start >= this.head || seg.start + seg.len <= this.tail) continue;
      for (const sg of this.topo.signalsAt(seg.tile, seg.outPort)) {
        const under = this.ilk.signals.get(sg.id);
        if (under && Interlocking.isShuntProceed(under.aspect)) { this.shuntRoute = under.route; return true; }
      }
    }
    const sig = this.#signalAhead(() => true, true);
    return !!sig && Interlocking.isShuntProceed(sig.aspect);
  }

  /**
   * Pociąg bez zezwolenia (utworzony na stacji, po zmianie czoła albo po manewrach) rusza tylko wtedy, gdy najbliższy
   * semafor przed nim – przed najbliższą zwrotnicą i granicą stacji – wskazuje sygnał zezwalający dla pociągu albo
   * pociąg ma rozkaz pisemny na jego minięcie.
   */
  #mayStart() {
    const sig = this.#signalAhead((s) => s.kind === 'semafor', true);
    return !!sig && (Interlocking.isTrainProceed(sig.aspect) || this.hasOrderFor(sig.id));
  }

  /**
   * Najbliższy sygnalizator przed czołem spełniający `accept` (po torze wg bieżących położeń zwrotnic) albo null,
   * gdy wcześniej jest koniec toru, granica stacji albo – przy `stopAtPoint` – zwrotnica.
   */
  #signalAhead(accept, stopAtPoint = false) {
    const seg = this.trail[this.trail.length - 1];
    if (!seg?.tile) return null;
    const positions = this.ilk.positions();
    let tile = seg.tile, outPort = seg.outPort;
    for (let dist = seg.start + seg.len - this.head, guard = 0; dist < 2000 && guard < 200 && outPort; guard++) {
      for (const s of this.topo.signalsAt(tile, outPort)) {
        const sig = this.ilk.signals.get(s.id);
        if (sig && accept(sig)) return sig;
      }
      if (this.topo.exitAt(tile, outPort)) return null;
      const nb = this.topo.neighbour(tile, outPort);
      if (!nb || nb.tile.type === 'buffer' || (stopAtPoint && nb.tile.type === 'point')) return null;
      tile = nb.tile; outPort = this.topo.step(nb.tile, nb.inPort, positions).outPort;
      dist += tile._len;
    }
    return null;
  }

  /** Przed czołem nie stoi tuż semafor (albo granica stacji) nakazujący zatrzymanie – pociąg może ruszyć z peronu. */
  #clearToLeave() {
    const stop = this.#lookahead(200).find((c) => c.speed === 0);
    return !(stop && stop.kind === 'signal' && stop.dist < 60);
  }

  #canDepart(time) {
    if (this.def.dep == null) return true;
    return time >= this.def.depTime;
  }

  /** Przesunięcie czoła o `d` metrów, dokładanie nowych segmentów śladu. */
  #advance(d) {
    this.head += d;
    let last = this.trail[this.trail.length - 1];
    while (this.head > last.start + last.len) {
      const next = this.#nextSegment(last);
      if (!next) { this.head = last.start + last.len; this.v = 0; break; }
      // Minięcie sygnalizatora: ograniczenie z obrazu sygnałowego obowiązuje do następnego sygnalizatora
      if (last.tile && last.outPort) {
        for (const sg of this.topo.signalsAt(last.tile, last.outPort)) {
          const sig = this.ilk.signals.get(sg.id);
          if (this.mode === 'train' && sig.kind !== 'semafor') continue;
          const order = this.orders.find((o) => o.signal === sig.id && !o.used);
          if (order && !Interlocking.isTrainProceed(sig.aspect)) { order.used = true; this.onEvent('order-used', this, sig.id); }
          if (this.mode === 'train' && !order && !Interlocking.isTrainProceed(sig.aspect)) {
            // przejechanie semafora wskazującego „Stój” (sygnał zmieniony bliżej niż droga hamowania) – hamowanie nagłe
            this.authority = false; this.exitAuth = null; this.spad = sig.id;
            this.onEvent('spad', this, sig.id);
          } else if (this.mode === 'train') {
            // zezwolenie od minionego semafora: przebieg (i ewentualny wyjazd na szlak), Sz albo rozkaz – na dowolny wyjazd
            const act = sig.route && this.ilk.active.get(sig.route);
            this.authority = true;
            this.exitAuth = (order || sig.aspect === 'Sz') ? '*' : act?.route.kind === 'train' ? (act.route.exit ?? null) : null;
          } else if (Interlocking.isShuntProceed(sig.aspect)) this.shuntRoute = sig.route;
          this.activeLimit = (sig.aspect === 'Sz' || order) ? 20 * KMH : Infinity;
          const sp = Interlocking.aspectSpeed(sig.aspect);
          const restricted = this.mode === 'train' && !order && sig.aspect !== 'Sz' && Interlocking.isProceed(sig.aspect) && sp < Infinity;
          this.zoneLimit = restricted ? this.#zoneOf(sig, sp) : null;
        }
      }
      this.trail.push(next);
      last = next;
      if (next.tile && !this.entered) { this.entered = true; this.onEvent('enter', this); }
      if (next.virtual && !next.entering) { this.onEvent('leave', this); }
    }
    // Zdejmij segmenty całkowicie za ogonem
    while (this.trail.length > 1 && this.trail[0].start + this.trail[0].len < this.tail) {
      const gone = this.trail.shift();
      if (gone.virtual && gone.entering && !this.fullyIn) { this.fullyIn = true; this.onEvent('fullyIn', this); }
    }
    if (last.virtual && !last.entering && this.head >= last.start + last.len - 1) {
      // Czoło dotarło do końca toru szlakowego – pociąg przybył do sąsiada
      this.finished = true; this.state = 'done';
      this.onExit(last.virtual, this);
    }
  }

  #nextSegment(last) {
    const positions = this.ilk.positions();
    if (last.virtual && last.entering) {
      const e = this.topo.station.exits[last.virtual];
      const t = this.topo.trackAt(e.tile.x, e.tile.y);
      const outPort = t._def.exits(t, e.dir, null)[0];
      return { tile: t, inPort: e.dir, outPort, len: t._len, start: last.start + last.len, virtual: null };
    }
    if (last.virtual) return null;
    if (!last.outPort) return null; // kozioł – brak dalszej drogi
    const exit = this.topo.exitAt(last.tile, last.outPort);
    if (exit) {
      return { tile: null, inPort: null, outPort: null, len: exit.lineLength ?? 3000, start: last.start + last.len, virtual: exit.id, entering: false };
    }
    const nb = this.topo.neighbour(last.tile, last.outPort);
    if (!nb) return null;
    const st = this.topo.step(nb.tile, nb.inPort, positions);
    if (st.trailing) this.ilk.trailPoint(nb.tile.id);
    if (nb.tile.type === 'buffer') return { tile: nb.tile, inPort: nb.inPort, outPort: null, len: nb.tile._len, start: last.start + last.len, virtual: null };
    return { tile: nb.tile, inPort: nb.inPort, outPort: st.outPort, len: nb.tile._len, start: last.start + last.len, virtual: null };
  }

  /** Odwrócenie kierunku jazdy stojącego pociągu (manewry). */
  reverse() {
    if (this.v > 0) return false;
    const segs = this.trail.filter((s) => s.tile && s.start < this.head && s.start + s.len > this.tail);
    if (!segs.length) return false;
    // nowy ślad: kostki w odwrotnej kolejności, porty zamienione
    const headOffsetInLast = this.head - segs[segs.length - 1].start; // ile czoła w ostatniej kostce
    const tailOffsetInFirst = this.tail - segs[0].start;
    const rev = [...segs].reverse();
    let start = 0;
    const trail = [];
    for (const s of rev) {
      trail.push({ tile: s.tile, inPort: s.outPort, outPort: s.inPort, len: s.len, start, virtual: null });
      start += s.len;
    }
    // Po odwróceniu ogon staje się czołem: czoło w pierwszej (dawniej ostatniej) kostce...
    // Odległość nowego czoła od początku nowego śladu = suma długości kostek − tailOffsetInFirst
    this.trail = trail;
    this.head = start - Math.max(0, tailOffsetInFirst);
    void headOffsetInLast;
    this.hasStopped = true;
    this.state = 'stopped';
    this.clearAuthority(); // po zmianie czoła jazda dopiero na sygnał sygnalizatora przed nowym czołem
    return true;
  }

  snapshot() {
    return { nr: this.nr, head: this.head, v: Math.round(this.v * 3.6), state: this.state, mode: this.mode, delay: this.delay };
  }
}
