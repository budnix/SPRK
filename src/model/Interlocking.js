import { Topology } from './Topology.js';
import { heading } from '../tiles/directions.js';

/**
 * Model urządzeń przekaźnikowych typu E (pulpit kostkowy) – zależności.
 *
 * Elementy:
 *  - zwrotnice (położenie +/−, przestawianie w czasie, utwierdzenie, zamknięcie indywidualne, kontrola, rozprucie)
 *  - wykolejnice (nałożona 'on' / zdjęta 'off')
 *  - odcinki izolowane (zajętość, utwierdzenie w przebiegu, zwalnianie odcinkowe)
 *  - sygnalizatory (semafory z obrazami wg Ie-1, tarcze manewrowe Ms1/Ms2, sygnał zastępczy Sz)
 *  - przebiegi pociągowe i manewrowe (nastawianie dwuprzyciskowe, ochrona boczna, droga ochronna)
 *  - przyciski grupowe: Zw (zwrotnice), Zz (zamknięcie zwrotnicy), Pz (zwolnienie przebiegu),
 *    dPz (doraźne zwolnienie, licznik), Sz (sygnał zastępczy, licznik)
 *
 * Obsługa: `press(ref)` – naciśnięcie przycisku, `pull(ref)` – wyciągnięcie przycisku.
 * Operacje dwuprzyciskowe: pierwszy przycisk „uzbraja” (ARM_TIMEOUT s), drugi wykonuje.
 */
export const ARM_TIMEOUT = 6;          // s – czas na naciśnięcie drugiego przycisku
export const POINT_SWITCH_TIME = 4;    // s – czas przestawiania zwrotnicy
export const TIMED_RELEASE = 90;       // s – zwalnianie czasowe przebiegu pociągowego przy zajętym odcinku zbliżania
export const SHUNT_TIMED_RELEASE = 30; // s – zwalnianie czasowe przebiegu manewrowego
export const SUBSTITUTE_TIME = 90;     // s – czas świecenia sygnału zastępczego

export class Interlocking {
  /**
   * @param station definicja stacji
   * @param bus EventBus
   * @param opts { blockGate: (exitId) => {ok, reason}, onDeparture: (exitId, route) => void }
   */
  constructor(station, bus, opts = {}) {
    this.station = station;
    this.bus = bus;
    this.opts = opts;
    this.armTimeout = opts.armTimeout ?? ARM_TIMEOUT; // czas na drugi przycisk / wskazanie końca (zależny od systemu srk)
    this.topo = new Topology(station);
    this.time = 0;
    this.log = [];

    this.points = new Map();
    for (const [id, t] of this.topo.points) {
      this.points.set(id, {
        id, tile: t, position: '+', target: '+', moving: false, movingUntil: 0,
        control: true, trailed: false, individualLock: false, section: t.section,
        speedDiverging: t.speedDiverging ?? station.points?.[id]?.speedDiverging ?? 40,
      });
    }
    this.derailers = new Map();
    for (const [id, t] of this.topo.derailers) {
      this.derailers.set(id, { id, tile: t, position: 'on', target: 'on', moving: false, movingUntil: 0, section: t.section, individualLock: false });
    }
    this.sections = new Map();
    for (const [id, tiles] of this.topo.sectionTiles) {
      this.sections.set(id, {
        id, tiles, occupied: false, route: null, wasOccupied: false,
        ...(station.sections?.[id] || {}),
      });
    }
    this.signals = new Map();
    for (const [id, t] of this.topo.signals) {
      this.signals.set(id, {
        id, tile: t, kind: t.kind, dir: t.dir, aspect: t.kind === 'semafor' ? 'S1' : 'Ms1',
        route: null, substitute: false, substituteUntil: 0, shunting: !!t.shunting,
        canSubstitute: t.substitute !== false, overlap: t.overlap !== false,
      });
    }
    this.routes = this.#deriveRoutes();
    this.active = new Map();     // routeId -> aktywny przebieg
    this.pending = [];           // przebiegi w trakcie nastawiania (zwrotnice się przestawiają)
    this.armed = null;           // { ref, until }
    this.counters = { dPz: 0, Sz: 0, rozprucie: 0 };
    this.alarms = new Set();
    this.#refreshSignals();
  }

  /* ------------------------------------------------------------------ */
  /* Przebiegi – tablica zależności                                       */
  /* ------------------------------------------------------------------ */

  #deriveRoutes() {
    const routes = new Map();
    const disabled = new Set(this.station.routes?.disable || []);
    for (const sig of this.topo.signals.values()) {
      const kinds = [];
      if (sig.kind === 'semafor') kinds.push('train');
      if (sig.kind === 'tm' || sig.shunting) kinds.push('shunt');
      for (const kind of kinds) {
        const paths = this.topo.pathsFrom(sig, kind);
        const seen = new Map();
        for (const p of paths) {
          if (p.end.type === 'exit' && kind === 'shunt') continue; // manewry nie wyjeżdżają na szlak
          // przebiegi pociągowe kończą się na semaforze, szlaku albo kozle toru stacyjnego (tor peronowy czołowy)
          if (kind === 'train' && p.end.type !== 'exit' && p.end.type !== 'signal' && !this.#stationBuffer(p.end)) continue;
          const endBtn = this.#endButtonFor(p.end);
          let id = `${sig.id}-${p.end.id}`;
          if (kind === 'shunt' && sig.kind === 'semafor') id += 'm';
          const n = (seen.get(id) || 0) + 1; seen.set(id, n);
          if (n > 1) id += `#${n}`;
          if (disabled.has(id)) continue;
          const lockedSections = p.sections.slice(1).filter((s, i, a) => a.indexOf(s) === i && s !== p.sections[0]);
          const route = {
            id, kind, start: sig.id, end: p.end, endButton: endBtn,
            steps: p.steps, sections: lockedSections, approach: p.sections[0],
            points: p.points, flank: this.topo.flankProtection(p),
            derailers: this.topo.derailersFor(p),
            overlap: (kind === 'train' && p.end.type === 'signal' && this.signals.get(p.end.id).overlap)
              ? this.topo.overlapSections(this.topo.signals.get(p.end.id)) : [],
            exit: p.end.type === 'exit' ? p.end.id : null,
            speed: this.#routeSpeed(p),
            ...(this.station.routes?.override?.[id] || {}),
          };
          routes.set(id, route);
        }
      }
    }
    return routes;
  }

  /** Kozioł toru stacyjnego (peron czołowy): przebieg pociągowy może się na nim kończyć; kozły bocznic – tylko manewry. */
  #stationBuffer(end) {
    if (end.type !== 'buffer') return false;
    const tile = this.topo.endButtons.get(end.id);
    return !!tile && this.station.sections[tile.section]?.kind === 'station';
  }

  #endButtonFor(end) {
    if (end.type === 'signal') return end.id;
    if (end.type === 'exit') {
      const e = this.station.exits[end.id];
      const t = this.topo.trackAt(e.tile.x, e.tile.y);
      return t?.endButton?.id || end.id;
    }
    return end.id; // buffer / endButton – id przycisku końca przebiegu
  }

  #routeSpeed(p) {
    let v = Infinity;
    for (const pt of p.points) {
      if (pt.position === '-') {
        const t = this.topo.points.get(pt.id);
        v = Math.min(v, t.speedDiverging ?? this.station.points?.[pt.id]?.speedDiverging ?? 40);
      }
    }
    return v;
  }

  routeList() {
    return [...this.routes.values()];
  }

  /* ------------------------------------------------------------------ */
  /* Obsługa przycisków                                                    */
  /* ------------------------------------------------------------------ */

  /**
   * ref: { kind: 'signal', id, color: 'green'|'white' }
   *      { kind: 'point', id } | { kind: 'derailer', id } | { kind: 'end', id }
   *      { kind: 'group', id, role }
   */
  press(ref) {
    this.bus.emit('button', { ref, action: 'press' });
    const armed = this.#takeArmed();
    if (ref.kind === 'group') {
      if (armed && armed.kind !== 'group') {
        // Kolejność odwrotna (najpierw przycisk elementu, potem grupowy) też działa
        return this.#twoButton(ref, armed);
      }
      this.#arm(ref);
      return { ok: true, armed: true };
    }
    if (armed?.kind === 'group') return this.#twoButton(armed, ref);
    if (ref.kind === 'signal' || ref.kind === 'end') {
      if (armed && (armed.kind === 'signal') && armed.id !== ref.id) {
        return this.requestRoute(armed, ref);
      }
      if (ref.kind === 'signal') { this.#arm(ref); return { ok: true, armed: true }; }
      return this.#fail('Najpierw naciśnij przycisk sygnałowy początku przebiegu.');
    }
    if (ref.kind === 'point' || ref.kind === 'derailer') {
      // Bez przycisku grupowego – uzbrój (dopuszczalna kolejność odwrotna)
      this.#arm(ref);
      return { ok: true, armed: true };
    }
    return this.#fail('Nieznany przycisk');
  }

  pull(ref) {
    this.bus.emit('button', { ref, action: 'pull' });
    if (this.armed) { this.armed = null; this.bus.emit('armed', null); } // wyciągnięcie odwołuje uzbrojenie
    if (ref.kind === 'signal') return this.cancelSignal(ref.id);
    return { ok: false };
  }

  #arm(ref) {
    this.armed = { ...ref, until: this.time + this.armTimeout };
    this.bus.emit('armed', this.armed);
  }

  #takeArmed() {
    const a = this.armed;
    this.armed = null;
    if (a && a.until >= this.time) { this.bus.emit('armed', null); return a; }
    if (a) this.bus.emit('armed', null);
    return null;
  }

  #twoButton(group, target) {
    switch (group.role) {
      case 'group-point':
        if (target.kind === 'point') return this.switchPoint(target.id);
        if (target.kind === 'derailer') return this.switchDerailer(target.id);
        return this.#fail('Przycisk Zw działa z przyciskiem zwrotnicy lub wykolejnicy.');
      case 'point-lock':
        if (target.kind === 'point') return this.toggleIndividualLock(target.id);
        if (target.kind === 'derailer') return this.toggleIndividualLock(target.id, true);
        return this.#fail('Przycisk Zz działa z przyciskiem zwrotnicy.');
      case 'route-release':
        if (target.kind === 'signal') return this.releaseRoute(target.id, false);
        return this.#fail('Przycisk Pz działa z przyciskiem sygnałowym początku przebiegu.');
      case 'emergency-release':
        if (target.kind === 'signal') return this.releaseRoute(target.id, true);
        return this.#fail('Przycisk dPz działa z przyciskiem sygnałowym początku przebiegu.');
      case 'substitute':
        if (target.kind === 'signal') return this.substituteSignal(target.id);
        return this.#fail('Przycisk Sz działa z przyciskiem sygnałowym semafora.');
      default:
        return this.#fail(`Przycisk ${group.id}: brak funkcji`);
    }
  }

  #fail(msg) {
    this.#log('warn', msg);
    return { ok: false, reason: msg };
  }

  #log(level, msg) {
    const entry = { time: this.time, level, msg };
    this.log.push(entry);
    if (this.log.length > 500) this.log.shift();
    this.bus.emit('log', entry);
  }

  /* ------------------------------------------------------------------ */
  /* Zwrotnice i wykolejnice                                              */
  /* ------------------------------------------------------------------ */

  /**
   * Przebieg, w którym zwrotnica jest utwierdzona. `ignoreOverlapOf` – id przebiegów,
   * których utwierdzenie wyłącznie w drodze ochronnej pomijamy (kontynuacja przebiegu).
   */
  pointLockedByRoute(id, ignoreOverlapOf = null) {
    for (const r of this.active.values()) {
      if (!r.lockedPoints.has(id)) continue;
      if (ignoreOverlapOf?.has(r.id)) {
        const inRoute = [...r.route.points, ...r.route.flank].some((p) => p.id === id);
        if (!inRoute) continue; // utwierdzona tylko jako droga ochronna – zwalniana przez kontynuację
      }
      return r;
    }
    for (const r of this.pending) if (r.route.points.some((p) => p.id === id) || r.route.flank.some((p) => p.id === id)) return r.route;
    return null;
  }

  derailerLockedByRoute(id) {
    for (const r of this.active.values()) if (r.lockedDerailers.has(id)) return r;
    return null;
  }

  canSwitchPoint(id) {
    const p = this.points.get(id);
    if (!p) return { ok: false, reason: `Brak zwrotnicy ${id}` };
    if (p.moving) return { ok: false, reason: `Zwrotnica ${id} w trakcie przestawiania` };
    if (p.individualLock) return { ok: false, reason: `Zwrotnica ${id} zamknięta indywidualnie` };
    if (this.sections.get(p.section)?.occupied) return { ok: false, reason: `Zwrotnica ${id}: odcinek ${p.section} zajęty` };
    const r = this.pointLockedByRoute(id);
    if (r) return { ok: false, reason: `Zwrotnica ${id} utwierdzona w przebiegu ${r.id}` };
    return { ok: true };
  }

  switchPoint(id, target) {
    const c = this.canSwitchPoint(id);
    if (!c.ok) return this.#fail(c.reason);
    const p = this.points.get(id);
    const to = target ?? (p.position === '+' ? '-' : '+');
    if (to === p.position && p.control && !p.trailed) return { ok: true, noop: true };
    p.target = to; p.moving = true; p.movingUntil = this.time + POINT_SWITCH_TIME; p.control = false;
    this.bus.emit('point', p);
    return { ok: true };
  }

  canSwitchDerailer(id) {
    const d = this.derailers.get(id);
    if (!d) return { ok: false, reason: `Brak wykolejnicy ${id}` };
    if (d.moving) return { ok: false, reason: `Wykolejnica ${id} w trakcie przestawiania` };
    if (d.individualLock) return { ok: false, reason: `Wykolejnica ${id} zamknięta` };
    if (this.sections.get(d.section)?.occupied) return { ok: false, reason: `Wykolejnica ${id}: odcinek zajęty` };
    const r = this.derailerLockedByRoute(id);
    if (r) return { ok: false, reason: `Wykolejnica ${id} utwierdzona w przebiegu ${r.id}` };
    return { ok: true };
  }

  switchDerailer(id, target) {
    const c = this.canSwitchDerailer(id);
    if (!c.ok) return this.#fail(c.reason);
    const d = this.derailers.get(id);
    const to = target ?? (d.position === 'on' ? 'off' : 'on');
    if (to === d.position) return { ok: true, noop: true };
    d.target = to; d.moving = true; d.movingUntil = this.time + POINT_SWITCH_TIME;
    this.bus.emit('derailer', d);
    return { ok: true };
  }

  toggleIndividualLock(id, isDerailer = false) {
    const el = isDerailer ? this.derailers.get(id) : this.points.get(id);
    if (!el) return this.#fail(`Brak elementu ${id}`);
    if (el.moving) return this.#fail(`${id}: w trakcie przestawiania`);
    el.individualLock = !el.individualLock;
    this.#log('info', `${isDerailer ? 'Wykolejnica' : 'Zwrotnica'} ${id} ${el.individualLock ? 'zamknięta' : 'otwarta'} (zamknięcie indywidualne)`);
    this.bus.emit(isDerailer ? 'derailer' : 'point', el);
    return { ok: true };
  }

  /** Rozprucie zwrotnicy (najazd z ostrza przy złym położeniu). */
  trailPoint(id) {
    const p = this.points.get(id);
    if (!p || p.trailed) return;
    p.trailed = true; p.control = false;
    this.counters.rozprucie++;
    this.alarms.add(`rozprucie:${id}`);
    this.bus.emit('score', { time: this.time, code: 'rozprucie', points: -100, msg: `Rozprucie zwrotnicy ${id}` });
    this.#log('alarm', `ROZPRUCIE zwrotnicy ${id}! Brak kontroli położenia.`);
    this.bus.emit('point', p);
    this.bus.emit('alarm', { type: 'rozprucie', id });
  }

  positions() {
    const o = {};
    for (const p of this.points.values()) o[p.id] = p.position;
    return o;
  }

  /* ------------------------------------------------------------------ */
  /* Przebiegi                                                            */
  /* ------------------------------------------------------------------ */

  /** Aktywne przebiegi kończące się na semaforze początkowym `route` (ich kontynuacja). */
  #continuedBy(route) {
    return [...this.active.values()].filter((a) => a.route.end.type === 'signal' && a.route.end.id === route.start);
  }

  /** Czy semafor końcowy przebiegu ma nastawiony własny przebieg (kontynuacja – droga ochronna zbędna). */
  #hasContinuation(route) {
    if (route.end.type !== 'signal') return false;
    const endSig = this.signals.get(route.end.id);
    return !!(endSig?.route && this.active.has(endSig.route));
  }

  /** Sprawdzenie warunków nastawienia przebiegu (bez zmiany stanu). */
  checkRoute(route) {
    const problems = [];
    const sig = this.signals.get(route.start);
    const predecessors = this.#continuedBy(route);           // przebiegi, których jesteśmy kontynuacją
    const predIds = new Set(predecessors.map((a) => a.id));
    const overlapNeeded = !this.#hasContinuation(route);
    if (sig.route) problems.push(`Semafor ${sig.id} ma już nastawiony przebieg ${sig.route}`);
    if (this.pending.some((p) => p.route.start === route.start)) problems.push(`Przebieg z ${route.start} w trakcie nastawiania`);
    // Odcinki drogi przebiegu
    route.sections.forEach((sid, i) => {
      const s = this.sections.get(sid);
      const last = i === route.sections.length - 1;
      if (s.closed) problems.push(`Odcinek ${sid} zamknięty dla ruchu`);
      if (s.route && s.route !== route.id) problems.push(`Odcinek ${sid} utwierdzony w przebiegu ${s.route}`);
      if (s.occupied && !(route.kind === 'shunt' && last)) problems.push(`Odcinek ${sid} zajęty`);
      for (const pr of this.pending) if (pr.route.sections.includes(sid)) problems.push(`Odcinek ${sid} w nastawianym przebiegu ${pr.route.id}`);
    });
    // Droga ochronna (zbędna, gdy semafor końcowy ma nastawiony przebieg – kontynuacja)
    if (overlapNeeded) {
      for (const sid of route.overlap) {
        const s = this.sections.get(sid);
        if (s.occupied) problems.push(`Droga ochronna: odcinek ${sid} zajęty`);
        if (s.route && s.route !== route.id) problems.push(`Droga ochronna: odcinek ${sid} utwierdzony w przebiegu ${s.route}`);
      }
    }
    // Odcinki przebiegu nie mogą leżeć w drodze ochronnej innego przebiegu (poza przebiegami, których jesteśmy kontynuacją)
    for (const act of this.active.values()) {
      if (act.id === route.id || predIds.has(act.id)) continue;
      for (const sid of route.sections) if (act.overlap.includes(sid)) problems.push(`Odcinek ${sid} w drodze ochronnej przebiegu ${act.id}`);
    }
    // Zwrotnice w przebiegu i ochrony bocznej
    for (const req of [...route.points, ...route.flank]) {
      const p = this.points.get(req.id);
      if (!p) { problems.push(`Brak zwrotnicy ${req.id}`); continue; }
      if (p.trailed) problems.push(`Zwrotnica ${req.id} rozpruta`);
      if (p.position !== req.position || !p.control) {
        if (p.individualLock) problems.push(`Zwrotnica ${req.id} zamknięta w położeniu ${p.position}`);
        const r = this.pointLockedByRoute(req.id, predIds);
        if (r) problems.push(`Zwrotnica ${req.id} utwierdzona w przebiegu ${r.id}`);
        if (this.sections.get(p.section).occupied) problems.push(`Zwrotnica ${req.id}: odcinek zajęty – nie można przestawić`);
      } else {
        const r = this.pointLockedByRoute(req.id, predIds);
        if (r && this.#lockedPosition(req.id, predIds) !== req.position) problems.push(`Zwrotnica ${req.id} utwierdzona w innym położeniu`);
      }
    }
    for (const req of [...route.derailers.onRoute, ...route.derailers.protect]) {
      const d = this.derailers.get(req.id);
      if (!d) continue;
      if (d.position !== req.position) {
        if (d.individualLock) problems.push(`Wykolejnica ${req.id} zamknięta w położeniu ${d.position}`);
        const r = this.derailerLockedByRoute(req.id);
        if (r) problems.push(`Wykolejnica ${req.id} utwierdzona w przebiegu ${r.id}`);
        if (this.sections.get(d.section).occupied) problems.push(`Wykolejnica ${req.id}: odcinek zajęty`);
      }
    }
    // Blokada liniowa dla wyjazdu
    if (route.exit && this.opts.blockGate) {
      const g = this.opts.blockGate(route.exit);
      if (!g.ok) problems.push(g.reason);
    }
    return problems;
  }

  /** Zwrotnice leżące w drodze ochronnej – utwierdzane w bieżącym położeniu. */
  #overlapPoints(route) {
    const out = [];
    for (const sid of route.overlap) {
      for (const p of this.points.values()) if (p.section === sid) out.push({ id: p.id, position: p.position });
    }
    return out;
  }

  #lockedPosition(pointId, ignoreOverlapOf = null) {
    for (const r of this.active.values()) {
      const inRoute = [...r.route.points, ...r.route.flank].find((p) => p.id === pointId);
      const req = inRoute || (ignoreOverlapOf?.has(r.id) ? null : r.overlapPoints.find((p) => p.id === pointId));
      if (req && r.lockedPoints.has(pointId)) return req.position;
    }
    return null;
  }

  /** Zwolnienie drogi ochronnej po wjeździe pociągu na tor docelowy. */
  #releaseOverlap(act) {
    if (!act.overlap.length && !act.overlapPoints.length) return;
    const keep = new Set([...act.route.points, ...act.route.flank].map((p) => p.id));
    for (const p of act.overlapPoints) if (!keep.has(p.id)) act.lockedPoints.delete(p.id);
    act.overlap = []; act.overlapPoints = [];
    this.bus.emit('route', { id: act.id, state: 'overlap-released' });
  }

  /** Nastawienie przebiegu przyciskami: start (sygnałowy) i koniec. */
  requestRoute(startRef, endRef) {
    const kind = startRef.color === 'white' ? 'shunt' : 'train';
    const endId = endRef.id;
    const candidates = [...this.routes.values()].filter((r) => r.start === startRef.id && r.kind === kind && r.endButton === endId);
    if (!candidates.length) return this.#fail(`Brak przebiegu ${kind === 'train' ? 'pociągowego' : 'manewrowego'} ${startRef.id} → ${endId}`);
    // Wybierz pierwszy możliwy do nastawienia (gdy kilka dróg do tego samego celu)
    let firstProblems = null;
    for (const r of candidates) {
      const problems = this.checkRoute(r);
      if (!problems.length) return this.setRoute(r.id);
      firstProblems ??= problems;
    }
    return this.#fail(`Przebieg ${candidates[0].id}: ${firstProblems.join('; ')}`);
  }

  /** Łańcuchy przebiegów `startId` → … → `endId` przez semafory pośrednie (przebieg złożony), od najkrótszego. */
  routeChains(startId, endId, kind, maxHops = 4) {
    const out = [];
    const walk = (sig, chain, seen) => {
      if (chain.length >= maxHops) return;
      for (const r of this.routes.values()) {
        if (r.start !== sig || r.kind !== kind) continue;
        if (r.endButton === endId) { out.push([...chain, r]); continue; }
        if (r.end.type === 'signal' && !seen.has(r.end.id)) walk(r.end.id, [...chain, r], new Set([...seen, r.end.id]));
      }
    };
    walk(startId, [], new Set([startId]));
    return out.sort((a, b) => a.length - b.length);
  }

  /**
   * Koniec przebiegu złożonego (stanowisko komputerowe): jak `press(end)` po uzbrojeniu semafora, ale gdy nie ma
   * przebiegu bezpośredniego, nastawia łańcuch przebiegów przez semafory pośrednie (np. G502 → A502 → szlak).
   */
  pressCompound(endRef) {
    this.bus.emit('button', { ref: endRef, action: 'press' });
    const armed = this.#takeArmed();
    if (!armed || armed.kind !== 'signal') return this.#fail('Najpierw wskaż semafor początku przebiegu.');
    if (armed.id === endRef.id) return this.#fail('Koniec przebiegu musi być inny niż początek.');
    return this.requestCompoundRoute(armed, endRef);
  }

  /** Przebieg złożony: wszystkie ogniwa muszą dać się nastawić (ogniwo już nastawione liczy się jako gotowe);
   *  inaczej nic nie jest nastawiane, a odmowa nazywa ogniwo i powód. */
  requestCompoundRoute(startRef, endRef) {
    const kind = startRef.color === 'white' ? 'shunt' : 'train';
    const endId = endRef.id;
    if ([...this.routes.values()].some((r) => r.start === startRef.id && r.kind === kind && r.endButton === endId)) return this.requestRoute(startRef, endRef);
    const chains = this.routeChains(startRef.id, endId, kind);
    if (!chains.length) return this.#fail(`Brak przebiegu ${kind === 'train' ? 'pociągowego' : 'manewrowego'} ${startRef.id} → ${endId} (także złożonego)`);
    const isSet = (r) => this.active.has(r.id) || this.pending.some((p) => p.route.id === r.id);
    let firstFail = null;
    for (const chain of chains) {
      const bad = chain.map((r) => [r, isSet(r) ? [] : this.checkRoute(r)]).find(([, p]) => p.length);
      if (bad) { firstFail ??= bad; continue; }
      this.#log('info', `Przebieg złożony ${startRef.id} → ${chain.map((r) => r.endButton).join(' → ')}`);
      const set = [];
      for (const r of chain) {
        if (isSet(r)) continue;
        const res = this.setRoute(r.id);
        if (!res.ok) return res;
        set.push(r.id);
      }
      return { ok: true, pending: true, chain: chain.map((r) => r.id), set };
    }
    return this.#fail(`Przebieg złożony ${startRef.id} → ${endId}: ogniwo ${firstFail[0].id}: ${firstFail[1].join('; ')}`);
  }

  setRoute(routeId) {
    const route = this.routes.get(routeId);
    if (!route) return this.#fail(`Nieznany przebieg ${routeId}`);
    const problems = this.checkRoute(route);
    if (problems.length) return this.#fail(`Przebieg ${routeId}: ${problems.join('; ')}`);
    for (const pred of this.#continuedBy(route)) this.#releaseOverlap(pred);
    // Przestaw zwrotnice i wykolejnice (nastawianie przebiegowe)
    for (const req of [...route.points, ...route.flank]) {
      const p = this.points.get(req.id);
      if (p.position !== req.position || !p.control) this.switchPoint(req.id, req.position);
    }
    for (const req of [...route.derailers.onRoute, ...route.derailers.protect]) {
      const d = this.derailers.get(req.id);
      if (d && d.position !== req.position) this.switchDerailer(req.id, req.position);
    }
    this.pending.push({ route, since: this.time });
    this.#log('info', `Nastawianie przebiegu ${routeId}`);
    this.bus.emit('route', { id: routeId, state: 'pending' });
    return { ok: true, pending: true };
  }

  #completeRoute(route) {
    for (const pred of this.#continuedBy(route)) this.#releaseOverlap(pred); // kontynuacja zastępuje drogę ochronną
    const hasCont = this.#hasContinuation(route);
    const act = {
      id: route.id, route, since: this.time,
      lockedSections: [...route.sections], released: new Set(), trainEntered: false,
      overlapPoints: hasCont ? [] : this.#overlapPoints(route),
      lockedPoints: new Set([...route.points, ...route.flank, ...(hasCont ? [] : this.#overlapPoints(route))].map((p) => p.id)),
      lockedDerailers: new Set([...route.derailers.onRoute, ...route.derailers.protect].map((d) => d.id)),
      overlap: hasCont ? [] : [...route.overlap], signalOff: false, timedRelease: null,
    };
    for (const sid of route.sections) { const s = this.sections.get(sid); s.route = route.id; s.wasOccupied = false; }
    this.active.set(route.id, act);
    const sig = this.signals.get(route.start);
    sig.route = route.id;
    this.#refreshSignals();
    this.#log('info', `Przebieg ${route.id} utwierdzony, ${sig.kind === 'semafor' ? 'semafor' : 'tarcza'} ${sig.id}: ${sig.aspect}`);
    this.bus.emit('route', { id: route.id, state: 'set' });
  }

  /** Wyciągnięcie przycisku sygnałowego – sygnał „Stój”, przebieg pozostaje utwierdzony. */
  cancelSignal(signalId) {
    const sig = this.signals.get(signalId);
    if (!sig) return this.#fail(`Brak sygnalizatora ${signalId}`);
    if (sig.substitute) { sig.substitute = false; this.#refreshSignals(); this.#log('info', `Sygnał zastępczy na ${signalId} wygaszony`); return { ok: true }; }
    if (!sig.route) return { ok: false };
    const act = this.active.get(sig.route);
    if (act.signalOff) return { ok: true, noop: true };
    act.signalOff = true;
    this.#refreshSignals();
    this.#log('info', `Sygnał na ${signalId} wygaszony (przebieg ${sig.route} pozostaje utwierdzony)`);
    if (act.route.kind === 'shunt') this.#tryReleaseShunt(act);
    return { ok: true };
  }

  /**
   * Zwolnienie przebiegu przyciskiem Pz (zwalnianie normalne / czasowe)
   * lub dPz (doraźne, licznikowe).
   */
  releaseRoute(signalId, emergency) {
    const sig = this.signals.get(signalId);
    if (!sig) return this.#fail(`Brak sygnalizatora ${signalId}`);
    const pend = this.pending.findIndex((p) => p.route.start === signalId);
    if (pend >= 0) { this.pending.splice(pend, 1); this.#log('info', `Nastawianie przebiegu z ${signalId} przerwane`); return { ok: true }; }
    if (!sig.route) return this.#fail(`Semafor ${signalId} nie ma nastawionego przebiegu`);
    const act = this.active.get(sig.route);
    act.signalOff = true;
    this.#refreshSignals();
    if (emergency) {
      this.counters.dPz++;
      this.#log('warn', `Doraźne zwolnienie przebiegu ${act.id} (dPz, licznik ${this.counters.dPz})`);
      this.bus.emit('score', { time: this.time, code: 'dPz', points: -20, msg: `Doraźne zwolnienie przebiegu ${act.id} (dPz)` });
      this.#dissolve(act);
      return { ok: true };
    }
    if (act.trainEntered) return this.#fail(`Przebieg ${act.id}: pociąg już wjechał – zwalnianie odcinkowe (lub dPz)`);
    const approach = this.sections.get(act.route.approach);
    const delay = act.route.kind === 'train' ? TIMED_RELEASE : SHUNT_TIMED_RELEASE;
    if (approach?.occupied || act.route.kind === 'shunt' && act.lockedSections.some((s) => this.sections.get(s).occupied)) {
      if (act.timedRelease) return { ok: true, noop: true };
      act.timedRelease = this.time + delay;
      this.#log('info', `Przebieg ${act.id}: odcinek zbliżania zajęty – zwalnianie czasowe (${delay} s)`);
      this.bus.emit('route', { id: act.id, state: 'timed' });
      return { ok: true, timed: true };
    }
    this.#log('info', `Przebieg ${act.id} zwolniony`);
    this.#dissolve(act);
    return { ok: true };
  }

  #tryReleaseShunt(act) {
    if (!act.signalOff) return;
    if (act.lockedSections.some((s) => this.sections.get(s).occupied && !act.released.has(s))) return;
    this.#log('info', `Przebieg manewrowy ${act.id} zwolniony`);
    this.#dissolve(act);
  }

  #dissolve(act) {
    for (const sid of act.lockedSections) {
      const s = this.sections.get(sid);
      if (s.route === act.id) s.route = null;
    }
    const sig = this.signals.get(act.route.start);
    if (sig.route === act.id) sig.route = null;
    this.active.delete(act.id);
    this.#refreshSignals();
    this.bus.emit('route', { id: act.id, state: 'released' });
  }

  /** Sygnał zastępczy Sz na semaforze (licznik). */
  substituteSignal(signalId) {
    const sig = this.signals.get(signalId);
    if (!sig || sig.kind !== 'semafor') return this.#fail(`Sz tylko na semaforze`);
    if (!sig.canSubstitute) return this.#fail(`Semafor ${signalId} nie ma sygnału zastępczego`);
    if (sig.route && Interlocking.isProceed(sig.aspect)) return this.#fail(`Semafor ${signalId} wyświetla sygnał zezwalający`);
    const route = [...this.routes.values()].find((r) => r.start === signalId && r.exit);
    if (route && this.opts.blockGate) {
      const g = this.opts.blockGate(route.exit);
      if (!g.ok) return this.#fail(`Sz na ${signalId}: ${g.reason}`);
    }
    sig.substitute = true; sig.substituteUntil = this.time + SUBSTITUTE_TIME;
    this.counters.Sz++;
    this.#log('warn', `Sygnał zastępczy Sz na semaforze ${signalId} (licznik ${this.counters.Sz})`);
    const justified = !!sig.failed || [...this.sections.values()].some((x) => x.forced) || [...this.points.values()].some((p) => p.faultUntil > this.time);
    this.bus.emit('score', { time: this.time, code: 'Sz', points: justified ? 0 : -5, msg: `Sygnał zastępczy na ${signalId}${justified ? ' (uzasadniony usterką)' : ' bez usterki urządzeń'}` });
    this.#refreshSignals();
    return { ok: true };
  }

  /* ------------------------------------------------------------------ */
  /* Sygnalizatory – obrazy wg Ie-1                                       */
  /* ------------------------------------------------------------------ */

  /** Prędkość dopuszczona obrazem sygnałowym (Infinity = największa dozwolona). */
  static aspectSpeed(aspect) {
    switch (aspect) {
      case 'S1': case 'Ms1': return 0;
      case 'Sz': return 20;
      case 'Ms2': return 25;
      case 'S10': case 'S11': case 'S12': case 'S13': return 40;
      default: return Infinity;
    }
  }

  static isProceed(aspect) {
    return aspect !== 'S1' && aspect !== 'Ms1';
  }

  refreshSignals() { this.#refreshSignals(); }

  #refreshSignals() {
    // Dwa przebiegi, aby uwzględnić zależność od następnego semafora
    for (let i = 0; i < 2; i++) {
      for (const sig of this.signals.values()) {
        const prev = sig.aspect;
        sig.aspect = this.#computeAspect(sig);
        if (prev !== sig.aspect && i === 1) this.bus.emit('signal', sig);
      }
    }
    for (const sig of this.signals.values()) this.bus.emit('signal', sig);
  }

  #computeAspect(sig) {
    if (sig.substitute) return 'Sz';
    if (sig.failed) return sig.kind === 'semafor' ? 'S1' : 'Ms1';
    if (!sig.route) return sig.kind === 'semafor' ? 'S1' : 'Ms1';
    const act = this.active.get(sig.route);
    if (!act || act.signalOff) return sig.kind === 'semafor' ? 'S1' : 'Ms1';
    if (act.route.kind === 'shunt') return 'Ms2';
    const restricted = act.route.speed <= 60;
    let next = null;
    if (act.route.end.type === 'signal') next = this.signals.get(act.route.end.id)?.aspect || 'S1';
    const nextStop = !next || next === 'S1' || next === 'Sz';
    const nextRestricted = next && ['S10', 'S11', 'S12', 'S13'].includes(next);
    if (act.route.end.type === 'exit') return restricted ? 'S10' : 'S2';
    if (nextStop) return restricted ? 'S13' : 'S5';
    if (nextRestricted) return restricted ? 'S12' : 'S4';
    return restricted ? 'S10' : 'S2';
  }

  /* ------------------------------------------------------------------ */
  /* Zajętość i takt                                                      */
  /* ------------------------------------------------------------------ */

  /** Aktualizacja zajętości odcinków (zbiór id odcinków zajętych). */
  updateOccupancy(occupiedSet) {
    for (const s of this.sections.values()) {
      const occ = occupiedSet.has(s.id) || !!s.forced;
      if (occ !== s.occupied) {
        s.occupied = occ;
        if (occ) s.wasOccupied = true;
        this.bus.emit('section', s);
      }
    }
  }

  tick(time) {
    this.time = time;
    if (this.armed && this.armed.until < time) { this.armed = null; this.bus.emit('armed', null); }

    // Zwrotnice i wykolejnice kończą przestawianie
    for (const p of this.points.values()) {
      if (p.moving && p.movingUntil <= time) {
        p.moving = false; p.position = p.target; p.trailed = false;
        p.control = !(p.faultUntil && p.faultUntil > time); // usterka napędu: brak kontroli do czasu naprawy
        if (!p.control) this.#log('alarm', `Zwrotnica ${p.id}: brak kontroli położenia po przestawieniu!`);
        this.alarms.delete(`rozprucie:${p.id}`);
        this.bus.emit('point', p);
      }
    }
    for (const d of this.derailers.values()) {
      if (d.moving && d.movingUntil <= time) { d.moving = false; d.position = d.target; this.bus.emit('derailer', d); }
    }

    // Przebiegi w trakcie nastawiania
    for (const pr of [...this.pending]) {
      const r = pr.route;
      const ready = [...r.points, ...r.flank].every((q) => { const p = this.points.get(q.id); return p.position === q.position && p.control && !p.moving; })
        && [...r.derailers.onRoute, ...r.derailers.protect].every((q) => { const d = this.derailers.get(q.id); return !d || (d.position === q.position && !d.moving); });
      if (ready) {
        this.pending.splice(this.pending.indexOf(pr), 1);
        const problems = this.checkRoute(r).filter((m) => !m.includes('w trakcie nastawiania'));
        if (problems.length) this.#log('warn', `Przebieg ${r.id} nie nastawiony: ${problems.join('; ')}`);
        else this.#completeRoute(r);
      } else if (time - pr.since > 20) {
        this.pending.splice(this.pending.indexOf(pr), 1);
        this.#log('warn', `Przebieg ${r.id}: zwrotnice nie osiągnęły położenia – nastawianie przerwane`);
      }
    }

    // Sygnał zastępczy – czas
    for (const sig of this.signals.values()) {
      if (sig.substitute && sig.substituteUntil <= time) { sig.substitute = false; this.#refreshSignals(); }
    }

    // Aktywne przebiegi: przejazd pociągu, zwalnianie odcinkowe, zwalnianie czasowe
    for (const act of [...this.active.values()]) {
      const secs = act.lockedSections;
      const sig = this.signals.get(act.route.start);
      // czoło pociągu w przebiegu: najdalszy odcinek zajęty od chwili nastawienia (wasOccupied zeruje się przy
      // utwierdzeniu, więc tabor stojący wcześniej na torze docelowym się nie liczy); bardzo krótki odcinek (np. sama
      // zwrotnica) może być przeskoczony między krokami symulacji – dlatego nie wymagamy zajęcia pierwszego
      const front = secs.reduce((m, id, i) => { const x = this.sections.get(id); return x.occupied && x.wasOccupied ? i : m; }, -1);
      if (!act.trainEntered && front >= 0) {
        act.trainEntered = true;
        act.timedRelease = null;
        const prevAspect = sig.aspect;
        if (!act.signalOff) { act.signalOff = true; this.#refreshSignals(); this.#log('info', `Pociąg minął semafor ${sig.id} na sygnale ${prevAspect} – semafor samoczynnie na „Stój”`); }
        if (act.route.exit && this.opts.onDeparture) this.opts.onDeparture(act.route.exit, act.route);
      }
      if (act.timedRelease && act.timedRelease <= time) {
        this.#log('info', `Przebieg ${act.id} zwolniony (zwalnianie czasowe)`);
        this.#dissolve(act);
        continue;
      }
      if (act.trainEntered) {
        if (secs.length && this.sections.get(secs[secs.length - 1]).occupied) this.#releaseOverlap(act);
        for (let i = 0; i < secs.length; i++) {
          const sid = secs[i];
          if (act.released.has(sid)) continue;
          const s = this.sections.get(sid);
          // zwalnianie odcinkowe: odcinek za czołem pociągu i wolny (także przeskoczony bez zajęcia); ostatni odcinek
          // zwalnia się, gdy pociąg go opuścił (wyjazd na szlak) albo wjechał na tor docelowy (gałąź niżej)
          const last = i === secs.length - 1;
          if (!s.occupied && (i < front || (last && s.wasOccupied))) {
            act.released.add(sid);
            if (s.route === act.id) s.route = null;
            this.bus.emit('section', s);
          } else if (last && s.occupied && act.released.size === secs.length - 1 && act.route.end.type !== 'exit') {
            // Pociąg wjechał na tor docelowy – przebieg zakończony
            act.released.add(sid);
            if (s.route === act.id) s.route = null;
            this.bus.emit('section', s);
          }
        }
        // Zwrotnice zwalniają się z odcinkami
        for (const pid of [...act.lockedPoints]) {
          const p = this.points.get(pid);
          const inRoute = act.route.points.some((q) => q.id === pid);
          if (inRoute && act.released.has(p.section)) act.lockedPoints.delete(pid);
        }
        if (act.released.size === secs.length) {
          this.#log('info', `Przebieg ${act.id} rozwiązany (pociąg przejechał)`);
          this.#dissolve(act);
        }
      } else if (act.route.kind === 'shunt' && !secs.length) {
        // przebieg manewrowy w obrębie jednego odcinka: rozwiązuje się, gdy tabor opuści odcinek
        const app = this.sections.get(act.route.approach);
        if (app?.occupied) act.sawTrain = true;
        else if (act.sawTrain) { this.#log('info', `Przebieg manewrowy ${act.id} rozwiązany (tabor opuścił odcinek)`); this.#dissolve(act); }
      } else if (act.route.kind === 'shunt' && act.signalOff) {
        this.#tryReleaseShunt(act);
      }
    }
  }

  /** Zrzut stanu do serializacji (przyszły zapis gry / tryb sieciowy). */
  snapshot() {
    return {
      time: this.time,
      points: [...this.points.values()].map((p) => ({ id: p.id, position: p.position, moving: p.moving, control: p.control, trailed: p.trailed, individualLock: p.individualLock })),
      derailers: [...this.derailers.values()].map((d) => ({ id: d.id, position: d.position })),
      sections: [...this.sections.values()].map((s) => ({ id: s.id, occupied: s.occupied, route: s.route })),
      signals: [...this.signals.values()].map((s) => ({ id: s.id, aspect: s.aspect, route: s.route })),
      active: [...this.active.keys()],
      counters: { ...this.counters },
    };
  }
}
