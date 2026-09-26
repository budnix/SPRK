import { Interlocking } from './Interlocking.js';

const KMH = 1 / 3.6;

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
    this.vmax = (def.vmax ?? 100) * KMH;
    this.accel = def.kind === 'tow' ? 0.15 : 0.35;
    this.brake = def.kind === 'tow' ? 0.35 : 0.6;
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
  }

  /** Umieszcza pociąg na wirtualnym torze szlakowym przed wjazdem przez `exitId`. */
  placeOnLine(exitId, lineLength) {
    this.trail = [{ tile: null, inPort: null, outPort: null, len: lineLength, start: 0, virtual: exitId, entering: true }];
    this.head = this.length; // cały pociąg na szlaku
    this.v = Math.min(this.vmax, this.lineSpeed);
    this.state = 'moving';
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
  #lookahead(maxDist) {
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
        // Sygnalizator przy wyjeździe z kostki `tile` portem `outPort`
        for (const s of this.topo.signalsAt(tile, outPort)) {
          const sig = this.ilk.signals.get(s.id);
          const relevant = this.mode === 'train' ? sig.kind === 'semafor' : true;
          if (!relevant) continue;
          if (!Interlocking.isProceed(sig.aspect)) {
            constraints.push({ dist, speed: 0, reason: sig.id, kind: 'signal', signal: sig.id });
            return constraints;
          }
          const sp = Interlocking.aspectSpeed(sig.aspect);
          if (sp < Infinity) constraints.push({ dist, speed: sp * KMH, reason: `sygnał ${sig.aspect} na ${sig.id}`, kind: 'limit', until: 'next-signal' });
        }
        const exit = this.topo.exitAt(tile, outPort);
        if (exit) {
          constraints.push({ dist, speed: Math.min(this.lineSpeed, this.vmax), reason: 'szlak', kind: 'limit' });
          return constraints;
        }
        const nb = this.topo.neighbour(tile, outPort);
        if (!nb) { constraints.push({ dist, speed: 0, reason: 'koniec toru', kind: 'end' }); return constraints; }
        const st = this.topo.step(nb.tile, nb.inPort, positions);
        tile = nb.tile; inPort = nb.inPort; outPort = st.outPort;
        if (tile.type === 'buffer') { constraints.push({ dist: dist + tile._len * 0.5, speed: 0, reason: 'kozioł', kind: 'end' }); return constraints; }
        if (tile.type === 'point') {
          const p = this.ilk.points.get(tile.id);
          if (p.moving || !p.control) { constraints.push({ dist, speed: 0, reason: `zwrotnica ${tile.id} bez kontroli`, kind: 'end' }); return constraints; }
        }
        const lim = this.#tileLimit(tile, inPort, outPort);
        if (lim < Infinity) constraints.push({ dist, speed: lim, reason: `zwrotnica ${tile.id}`, kind: 'limit' });
        // Peron – miejsce zatrzymania
        if (this.#shouldStopAt(tile)) {
          const stopDist = dist + this.#platformStopOffset(tile);
          if (stopDist > 0) constraints.push({ dist: stopDist, speed: 0, reason: 'peron', kind: 'platform', tile });
        }
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
    if (!sec?.platform) return false;
    if (this.plannedTrack && String(sec.track) !== String(this.plannedTrack)) {
      // Zatrzymanie na innym torze niż planowany, jeżeli ma peron – dopuszczalne
    }
    return true;
  }

  /** Odległość od początku kostki peronowej do miejsca zatrzymania (koniec odcinka − margines). */
  #platformStopOffset(tile) {
    const sec = this.ilk.sections.get(tile.section);
    const total = sec.tiles.reduce((a, t) => a + t._len, 0);
    // pociąg staje tak, by czoło było ~15 m przed końcem odcinka lub cały pociąg zmieścił się
    const margin = Math.max(15, total - Math.max(this.length + 20, total * 0.7));
    // pozycja czoła na odcinku: od wjazdu na odcinek
    const idx = this.#tileIndexInSection(tile);
    let before = 0;
    for (let i = 0; i < idx; i++) before += sec._ordered[i]._len;
    return Math.max(0, total - margin - before);
  }

  #tileIndexInSection(tile) {
    const sec = this.ilk.sections.get(tile.section);
    if (!sec._ordered || sec._orderedDir !== this.direction) {
      // Uporządkuj kostki odcinka wzdłuż kierunku jazdy (po x)
      const dirE = ['E', 'NE', 'SE'].includes(this.direction);
      sec._ordered = [...sec.tiles].sort((a, b) => dirE ? a.x - b.x : b.x - a.x);
      sec._orderedDir = this.direction;
    }
    return sec._ordered.indexOf(tile);
  }

  /** Krok symulacji. */
  tick(dt, time) {
    if (this.finished) return;
    if (this.def.terminates && this.hasStopped && this.mode === 'train') return; // zakończył bieg – czeka na manewry
    if (this.state === 'dwell') {
      if (time >= this.dwellUntil && this.#canDepart(time)) {
        this.state = 'moving'; this.departedAt = time;
        this.onEvent('depart', this);
      } else return;
    }
    const constraints = this.#lookahead(1500);
    // Prędkość docelowa uwzględniająca drogę hamowania: v² = u² + 2·b·s
    let allowed = Math.min(this.vmax, this.activeLimit);
    let stopC = null;
    for (const c of constraints) {
      const v = Math.sqrt(c.speed * c.speed + 2 * this.brake * Math.max(0, c.dist));
      if (c.speed === 0 && c.dist <= 0.5 && (!stopC || c.dist < stopC.dist)) stopC = c;
      if (v < allowed) allowed = v;
      if (c.speed === 0 && (!stopC || c.dist < stopC.dist)) stopC = c;
    }
    if (this.v < allowed) this.v = Math.min(allowed, this.v + this.accel * dt);
    else this.v = Math.max(allowed, this.v - this.brake * dt);
    if (this.v < 0.05 && allowed < 0.1) this.v = 0;

    let move = this.v * dt;
    if (stopC && stopC.dist >= 0 && move >= stopC.dist - 0.01 && stopC.dist < 3) {
      move = Math.max(0, stopC.dist - 0.01);
      this.v = 0;
    }
    if (move > 0) this.#advance(move);

    if (this.v === 0) {
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
          this.activeLimit = sig.aspect === 'Sz' ? 20 * KMH : Infinity;
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
    return true;
  }

  snapshot() {
    return { nr: this.nr, head: this.head, v: Math.round(this.v * 3.6), state: this.state, mode: this.mode, delay: this.delay };
  }
}
