import { Train } from './Train.js';
import { Clock } from '../core/Clock.js';

/**
 * Ruch pociągów: rozkład jazdy, posterunki sąsiednie (AI), wprowadzanie pociągów
 * na pulpit, zajętość odcinków, dziennik ruchu.
 */
export class Traffic {
  constructor(station, ilk, blocks, bus) {
    this.station = station;
    this.ilk = ilk;
    this.blocks = blocks;
    this.bus = bus;
    this.trains = [];
    this.time = 0;
    this.entries = station.timetable.map((t, i) => this.#prepare(t, i));
    this.journal = [];
    this.orders = [];
    this.score = { onTime: 0, delayed: 0, totalDelayMin: 0 };
  }

  /** Stojące pociągi, którym można wydać rozkaz pisemny (wraz z najbliższym semaforem). */
  standingTrains() {
    return this.entries
      .filter((e) => e.train && !e.train.finished && e.train.entered && e.train.v === 0)
      .map((e) => ({ nr: e.nr, name: e.name, signal: e.train.nextSignal(), entry: e }));
  }

  /**
   * Szablon treści rozkazu pisemnego „S” (wg wzoru Ir-1): pozwolenie na przejazd obok
   * semafora wskazującego sygnał „Stój” z prędkością do 20 km/h do następnego semafora.
   */
  orderTemplate(nr, signalId, reason = 'usterki urządzeń srk') {
    const st = this.station.name;
    return `Rozkaz pisemny „S”. Do pociągu nr ${nr}. Semafor ${signalId} na stacji ${st} wskazuje sygnał „Stój” z powodu ${reason}. `
      + `Pociąg nr ${nr} ma pozwolenie na przejechanie obok semafora ${signalId} wskazującego sygnał „Stój” i jazdę do następnego semafora `
      + `z prędkością nieprzekraczającą 20 km/h. Droga przebiegu jest przygotowana, zwrotnice zamknięte.`;
  }

  /**
   * Wydanie rozkazu pisemnego „S”. Warunki (Ir-1, uproszczone):
   *  - pociąg stoi na stacji przed semaforem `signalId` wskazującym „Stój”,
   *  - droga jazdy do następnego semafora: zwrotnice utwierdzone w przebiegu lub zamknięte indywidualnie (Zz),
   *    wykolejnice zdjęte, odcinki wolne i nieutwierdzone w innym przebiegu,
   *  - wyjazd na szlak tylko z pozwoleniem blokady liniowej.
   */
  issueOrder({ nr, signal, text, reason }) {
    const e = this.entries.find((x) => String(x.nr) === String(nr));
    if (!e?.train || e.train.finished || !e.train.entered) return { ok: false, reason: `Pociąg ${nr} nie stoi na stacji` };
    const tr = e.train;
    if (tr.v > 0) return { ok: false, reason: `Pociąg ${nr} jest w ruchu – rozkaz doręcza się na postoju` };
    const next = tr.nextSignal();
    if (next !== signal) return { ok: false, reason: `Pociąg ${nr} stoi przed ${next ?? 'brakiem semafora'}, nie przed ${signal}` };
    const sig = this.ilk.signals.get(signal);
    if (!sig || sig.kind !== 'semafor') return { ok: false, reason: `${signal} nie jest semaforem` };
    if (sig.aspect !== 'S1') return { ok: false, reason: `Semafor ${signal} nie wskazuje „Stój” – rozkaz zbędny` };
    if (tr.hasOrderFor(signal)) return { ok: false, reason: `Pociąg ${nr} ma już rozkaz na ${signal}` };
    // Droga jazdy za semaforem do następnego semafora
    const problems = [];
    const positions = this.ilk.positions();
    const start = this.ilk.topo.trackAt(sig.tile.at.x, sig.tile.at.y);
    let outPort = start._def.ports(start).find((p) => (p.includes('E') ? 'E' : p.includes('W') ? 'W' : null) === sig.dir);
    let tile = start, guard = 0, exitId = null;
    const sections = new Set();
    while (guard++ < 100) {
      const exit = this.ilk.topo.exitAt(tile, outPort);
      if (exit) { exitId = exit.id; break; }
      const nb = this.ilk.topo.neighbour(tile, outPort);
      if (!nb) break;
      tile = nb.tile;
      sections.add(tile.section);
      if (tile.type === 'point') {
        const p = this.ilk.points.get(tile.id);
        const lockedInRoute = !!this.ilk.pointLockedByRoute(tile.id);
        if (!p.individualLock && !lockedInRoute) problems.push(`zwrotnica ${tile.id} niezamknięta (Zz) ani nieutwierdzona`);
        if (!p.control || p.moving) problems.push(`zwrotnica ${tile.id} bez kontroli`);
      }
      if (tile.derailer) {
        const d = this.ilk.derailers.get(tile.derailer);
        if (d.position !== 'off') problems.push(`wykolejnica ${tile.derailer} nałożona`);
      }
      if (tile.type === 'buffer') break;
      const st = this.ilk.topo.step(tile, nb.inPort, positions);
      if (st.trailing) problems.push(`zwrotnica ${tile.id} w położeniu na rozprucie`);
      outPort = st.outPort;
      if (!outPort) break;
      if (this.ilk.topo.signalsAt(tile, outPort).some((sg) => sg.kind === 'semafor')) break;
    }
    for (const sid of sections) {
      const s = this.ilk.sections.get(sid);
      if (s.occupied) problems.push(`odcinek ${sid} zajęty`);
      if (s.route) {
        const act = this.ilk.active.get(s.route);
        if (act && act.route.start !== signal) problems.push(`odcinek ${sid} utwierdzony w przebiegu ${s.route}`);
      }
    }
    if (exitId) {
      const g = this.blocks.get(exitId)?.gate();
      if (g && !g.ok) problems.push(g.reason);
    }
    if (problems.length) return { ok: false, reason: `Rozkaz dla ${nr} na ${signal}: ${problems.join('; ')}` };
    const order = {
      id: this.orders.length + 1, time: this.time, nr: e.nr, signal, type: 'S',
      text: text || this.orderTemplate(e.nr, signal, reason), reason: reason || '',
    };
    this.orders.push(order);
    tr.orders.push({ signal, used: false, id: order.id });
    this.bus.emit('log', { time: this.time, level: 'warn', msg: `Rozkaz pisemny „S” nr ${order.id} dla pociągu ${e.nr}: przejazd obok ${signal} (20 km/h)` });
    this.bus.emit('orders', this.orders);
    return { ok: true, order };
  }

  #prepare(t, i) {
    const arr = t.arr ? Clock.parse(t.arr) : null;
    const dep = t.dep ? Clock.parse(t.dep) : null;
    const exitFrom = t.from ? this.station.exits[t.from] : null;
    const lineLen = exitFrom?.lineLength ?? 3000;
    const vline = Math.min(t.vmax ?? 100, exitFrom?.lineSpeed ?? 100) / 3.6;
    const lineTravel = lineLen / vline;              // s na szlaku
    const stationRun = 90;                           // s od granicy pulpitu do peronu (ok.)
    const ref = arr ?? dep;
    const neighbourDep = t.from ? ref - lineTravel - stationRun : null;
    return {
      idx: i, ...t, arrTime: arr, depTime: dep,
      neighbourDep, requestAt: t.from ? neighbourDep - 240 : null,
      status: t.from ? 'oczekiwany' : 'na stacji', requested: false, dispatched: false,
      train: null, actualArr: null, actualDep: null, delay: 0, track: t.track,
    };
  }

  /** Aktualny rozkład z stanami (dla panelu bocznego). */
  timetable() {
    return this.entries;
  }

  start(time) {
    this.time = time;
    // Pociągi stojące na stacji na początku zmiany
    for (const e of this.entries) {
      if (!e.from && e.startOn) this.#spawnStanding(e);
    }
  }

  #spawnStanding(e) {
    const secTiles = this.ilk.sections.get(e.startOn.section)?.tiles;
    if (!secTiles) return;
    const dirE = e.startOn.dir === 'E';
    const tiles = [...secTiles].sort((a, b) => (dirE ? a.x - b.x : b.x - a.x));
    const train = this.#makeTrain(e);
    // wybierz tyle kostek, ile potrzeba na długość pociągu (od czoła)
    let len = 0; const use = [];
    for (let i = tiles.length - 1; i >= 0 && len < train.length; i--) { use.unshift(tiles[i]); len += tiles[i]._len; }
    train.placeOnTrack(use, e.startOn.dir);
    train.hasStopped = true;
    e.train = train; e.status = 'na stacji';
    this.trains.push(train);
  }

  #makeTrain(e) {
    const train = new Train(e, this.ilk.topo, this.ilk, {
      lineSpeed: this.station.exits[e.to]?.lineSpeed ?? 100,
      onExit: (exitId, tr) => this.#onExit(e, exitId, tr),
      onEvent: (ev, tr) => this.#onTrainEvent(e, ev, tr),
    });
    return train;
  }

  #onTrainEvent(e, ev, tr) {
    const t = this.time;
    switch (ev) {
      case 'enter':
        e.status = 'wjeżdża';
        this.bus.emit('log', { time: t, level: 'info', msg: `Pociąg ${e.nr} wjeżdża na stację od ${this.station.exits[e.from]?.name}` });
        break;
      case 'fullyIn':
        if (e.from) this.blocks.get(e.from)?.neighbourTrainArrived(tr);
        break;
      case 'arrive': {
        e.actualArr = t; e.status = e.terminates ? 'zakończył bieg' : 'na stacji';
        const track = this.#trackOf(tr);
        e.actualTrack = track;
        e.delay = e.arrTime != null ? Math.round((t - e.arrTime) / 60) || 0 : 0;
        this.#journal(e, 'przyjazd', t, track);
        this.bus.emit('log', { time: t, level: e.delay > 2 ? 'warn' : 'info', msg: `Pociąg ${e.nr} przyjazd tor ${track}${e.delay > 0 ? `, opóźnienie ${e.delay} min` : ''}` });
        if (track && e.track && String(track) !== String(e.track)) {
          this.bus.emit('log', { time: t, level: 'warn', msg: `Pociąg ${e.nr} przyjęty na tor ${track} zamiast ${e.track}` });
        }
        break;
      }
      case 'depart':
        e.actualDep = t; e.status = 'odjeżdża';
        this.#journal(e, 'odjazd', t, e.actualTrack);
        this.bus.emit('log', { time: t, level: 'info', msg: `Pociąg ${e.nr} odjazd` });
        break;
      case 'order-used':
        this.bus.emit('log', { time: t, level: 'info', msg: `Pociąg ${e.nr} minął semafor na rozkaz pisemny` });
        break;
      case 'stop':
        if (tr.stoppedAt?.kind === 'signal') {
          this.bus.emit('log', { time: t, level: 'info', msg: `Pociąg ${e.nr} zatrzymany przed ${tr.stoppedAt.signal}` });
        }
        break;
      case 'leave':
        e.status = 'odjechał';
        if (e.to) this.blocks.get(e.to)?.trainDeparted(tr);
        if (!e.stop && e.arrTime != null && e.actualArr == null) {
          // przelot – czas przejazdu liczony przy wyjeździe
          e.actualArr = t; e.delay = Math.round((t - e.arrTime) / 60) || 0;
          this.#journal(e, 'przejazd', t, this.#trackOf(tr) || e.actualTrack);
        }
        break;
      default:
    }
  }

  #trackOf(tr) {
    for (const sid of tr.occupiedSections()) {
      const s = this.ilk.sections.get(sid);
      if (s?.track) return s.track;
    }
    return null;
  }

  #onExit(e, exitId, tr) {
    e.status = 'u sąsiada';
    const delay = (e.depTime != null && e.actualDep != null ? Math.round((e.actualDep - e.depTime) / 60) : e.delay) || 0;
    e.delay = delay;
    if (delay <= 2) this.score.onTime++; else { this.score.delayed++; this.score.totalDelayMin += delay; }
    this.blocks.get(exitId)?.trainArrivedAtNeighbour(tr);
    this.trains = this.trains.filter((x) => x !== tr);
    this.bus.emit('log', { time: this.time, level: 'info', msg: `Pociąg ${e.nr} przybył do ${this.station.exits[exitId].name}` });
    this.bus.emit('timetable', this.entries);
  }

  #journal(e, kind, time, track) {
    this.journal.push({ nr: e.nr, kind, time, track, plan: kind === 'odjazd' ? e.depTime : e.arrTime });
    this.bus.emit('timetable', this.entries);
  }

  tick(dt, time) {
    this.time = time;
    // Sąsiedzi: żądania pozwolenia i wyprawianie pociągów
    for (const e of this.entries) {
      if (!e.from || e.dispatched) continue;
      const block = this.blocks.get(e.from);
      if (!block) continue;
      if (!e.requested && time >= e.requestAt) {
        // Jeden pociąg naraz na szlaku – żądanie, gdy blokada wolna
        const earlier = this.entries.some((o) => o !== e && o.from === e.from && !o.dispatched && o.requestAt < e.requestAt);
        if (!earlier && block.neighbourRequests()) { e.requested = true; e.status = 'żądanie pozwolenia'; this.bus.emit('timetable', this.entries); }
      }
      if (e.requested && time >= e.neighbourDep && block.canNeighbourDispatch()) {
        e.dispatched = true;
        const train = this.#makeTrain(e);
        train.placeOnLine(e.from, this.station.exits[e.from].lineLength ?? 3000);
        e.train = train; e.status = 'na szlaku';
        this.trains.push(train);
        block.neighbourTrainEntered(train);
        this.bus.emit('timetable', this.entries);
      }
      if (e.requested && !e.dispatched && time > e.neighbourDep + 60 && !e.waitLogged) {
        e.waitLogged = true;
        this.bus.emit('log', { time, level: 'warn', msg: `Pociąg ${e.nr} czeka w ${block.neighbour} na pozwolenie (Poz)` });
      }
    }
    // Pociągi
    for (const tr of this.trains) tr.tick(dt, time);
    // Zajętość
    const occ = new Set();
    for (const tr of this.trains) for (const s of tr.occupiedSections()) occ.add(s);
    this.ilk.updateOccupancy(occ);
    // Stan rozkładu
    for (const e of this.entries) {
      if (e.train && !e.train.finished) {
        if (!e.actualTrack) { const tr = this.#trackOf(e.train); if (tr) e.actualTrack = tr; }
        const st = e.train.state;
        if (st === 'dwell') e.status = 'postój';
        else if (st === 'stopped' && e.train.stoppedAt?.kind === 'signal') e.status = `stoi przed ${e.train.stoppedAt.signal}`;
        else if (st === 'moving' && e.train.entered) e.status = e.train.mode === 'shunt' ? 'manewruje' : 'jedzie';
        if (e.train.state === 'dwell' && e.depTime != null && time > e.depTime + 60) {
          e.delay = Math.round((time - e.depTime) / 60);
        }
      }
    }
  }

  /** Stojący pociąg zakończony – przełącz w tryb manewrowy (jazda za Ms2). */
  toShunting(nr) {
    const e = this.entries.find((x) => String(x.nr) === String(nr));
    if (!e?.train || e.train.v > 0) return false;
    e.train.mode = 'shunt';
    e.train.def.stop = false;
    e.train.state = 'moving';
    e.train.vmax = 25 / 3.6;
    return true;
  }

  reverseTrain(nr) {
    const e = this.entries.find((x) => String(x.nr) === String(nr));
    if (!e?.train) return false;
    return e.train.reverse();
  }
}
