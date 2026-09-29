import { Topology } from './Topology.js';

/**
 * Zależności stacyjne – wspólne dla wszystkich stanowisk obsługi (pulpit kostkowy, monitor, …).
 *
 * Elementy:
 *  - zwrotnice (położenie +/−, przestawianie w czasie, utwierdzenie, zamknięcie indywidualne, kontrola, rozprucie)
 *  - wykolejnice (nałożona 'on' / zdjęta 'off')
 *  - odcinki izolowane (zajętość, utwierdzenie w przebiegu, zwalnianie odcinkowe)
 *  - sygnalizatory (semafory z obrazami wg Ie-1, tarcze manewrowe Ms1/Ms2, sygnał zastępczy Sz)
 *  - przebiegi pociągowe i manewrowe (ochrona boczna, droga ochronna)
 *
 * Polecenia zależnościowe (nie znają przycisków): `requestRoute`, `requestCompoundRoute`, `setRoute`,
 * `releaseRoute` (Pz / dPz z licznikiem), `cancelSignal`, `switchPoint`, `switchDerailer`,
 * `toggleIndividualLock` (Zz), `substituteSignal` (Sz z licznikiem); przy opcjach nastawni mechanicznej także
 * `clearSignal` (dźwignia sygnałowa) i `blockRoute` (blok przebiegowy utwierdzający).
 *
 * Opcje nastawni mechanicznej (domyślnie wyłączone – stanowiska przekaźnikowe i komputerowe działają jak dotąd):
 *  - `manualPoints` – przebieg nie przestawia zwrotnic; zwrotnice i wykolejnice w złym położeniu to przeszkoda
 *    (`point-position`, `derailer-position`), a przebieg w dobrych położeniach zamyka się od razu (drążek przebiegowy),
 *  - `manualSignal` – po nastawieniu przebiegu sygnał zostaje „Stój” do `clearSignal` (dźwignia sygnałowa);
 *    przebiegu nie da się zwolnić, dopóki dźwignia nie wróci na „Stój” (`cancelSignal`); sygnał zezwalający podaje
 *    się dla jazdy tylko raz,
 *  - `routeBlock` – przebieg pociągowy wymaga zablokowania bloku przebiegowego utwierdzającego (`blockRoute`) przed
 *    podaniem sygnału; zablokowany przebieg zwalnia dopiero pociąg (albo zwalniacz – `releaseRoute(id, true)`),
 *  - `holdRoute` – po przejeździe pociągu przebieg zostaje zamknięty (drążek przełożony, zwrotnice zamknięte),
 *    aż gracz go zwolni (`releaseRoute`),
 *  - `shapedSignals` – semafory kształtowe (Ie-1 §3): obrazy Sr1 / Sr2 / Sr3 zamiast świetlnych, tarcze manewrowe
 *    kształtowe M1 / M2; semafor z przebiegiem pociągowym ≤ 60 km/h ma dwa ramiona (`arms`), a semafor wjazdowy –
 *    tarczę ostrzegawczą kształtową (`warning`: Od1 / Od2 przy jednym ramieniu, Ot1 / Ot2 / Ot3 przy dwóch).
 *
 * Sposób wydawania poleceń należy do stanowiska: przyciski pulpitu typu E tłumaczy `src/srk/buttons.js`
 * (podłączany przez `attachInput`); `press` / `pull` / `pressCompound` / `armed` są tu tylko przekazaniem do niego.
 */
export const POINT_SWITCH_TIME = 4;    // s – czas przestawiania zwrotnicy
export const TIMED_RELEASE = 90;       // s – zwalnianie czasowe przebiegu pociągowego przy zajętym odcinku zbliżania
export const SHUNT_TIMED_RELEASE = 30; // s – zwalnianie czasowe przebiegu manewrowego
export const SUBSTITUTE_TIME = 90;     // s – czas świecenia sygnału zastępczego

export class Interlocking {
  /**
   * @param station definicja stacji
   * @param bus EventBus
   * @param opts { blockGate: (exitId) => {ok, reason}, onDeparture: (exitId, route) => void,
   *               timedRelease, shuntTimedRelease – czasy zwalniania czasowego [s] (0 = bezzwłocznie),
   *               timedReleaseAlways – przebieg pociągowy zwalnia się zawsze czasowo (IZH-111: Zcz) }
   */
  constructor(station, bus, opts = {}) {
    this.station = station;
    this.bus = bus;
    this.opts = opts;
    this.input = null; // protokół obsługi stanowiska (np. przyciski typu E) – attachInput
    this.timedRelease = opts.timedRelease ?? TIMED_RELEASE;
    this.shuntTimedRelease = opts.shuntTimedRelease ?? SHUNT_TIMED_RELEASE;
    this.timedReleaseAlways = !!opts.timedReleaseAlways;
    this.pointSwitchTime = opts.pointSwitchTime ?? POINT_SWITCH_TIME;
    this.manualPoints = !!opts.manualPoints;
    this.manualSignal = !!opts.manualSignal;
    this.routeBlock = !!opts.routeBlock;
    this.holdRoute = !!opts.holdRoute;
    this.shapedSignals = !!opts.shapedSignals;
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
        id, tile: t, kind: t.kind, dir: t.dir, aspect: this.#stopAspect(t.kind),
        route: null, substitute: false, substituteUntil: 0, stopped: false, shunting: !!t.shunting,
        canSubstitute: t.substitute !== false, overlap: t.overlap !== false,
      });
    }
    this.routes = this.#deriveRoutes();
    if (this.shapedSignals) {
      for (const sig of this.signals.values()) {
        if (sig.kind !== 'semafor') continue;
        sig.arms = [...this.routes.values()].some((r) => r.start === sig.id && r.kind === 'train' && r.speed <= 60) ? 2 : 1;
        if (sig.tile.entry) sig.warning = sig.arms === 2 ? 'Ot1' : 'Od1';
      }
    }
    this.active = new Map();     // routeId -> aktywny przebieg
    this.pending = [];           // przebiegi w trakcie nastawiania (zwrotnice się przestawiają)
    this.counters = { dPz: 0, Sz: 0, rozprucie: 0 };
    this.allStop = false;        // SSS – wszystkie sygnalizatory stacji na „Stój” (stanowiska komputerowe)
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
  /* Protokół obsługi stanowiska (przyciski) – przekazanie               */
  /* ------------------------------------------------------------------ */

  /** Podłącza protokół obsługi stanowiska: { press, pull, pressCompound, cancel, tick, armed }. */
  attachInput(input) {
    this.input = input;
    return input;
  }

  /** Uzbrojony przycisk / wskazany początek polecenia (stan protokołu obsługi) albo null. */
  get armed() {
    return this.input?.armed ?? null;
  }

  press(ref) { return this.input ? this.input.press(ref) : this.#noInput(); }
  pull(ref) { return this.input ? this.input.pull(ref) : this.#noInput(); }
  pressCompound(ref) { return this.input ? this.input.pressCompound(ref) : this.#noInput(); }

  #noInput() {
    return this.#fail('Brak protokołu obsługi stanowiska');
  }

  /** Odmowa wykonania polecenia: wpis do dziennika i wynik { ok: false, reason }. */
  refuse(msg) {
    return this.#fail(msg);
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
    p.target = to; p.moving = true; p.movingUntil = this.time + this.pointSwitchTime; p.control = false;
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
    d.target = to; d.moving = true; d.movingUntil = this.time + this.pointSwitchTime;
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

  /**
   * Droga jazdy za semaforem po bieżących położeniach zwrotnic – do następnego semafora w tym kierunku, wyjazdu na szlak
   * albo końca toru (droga Sz i rozkazu „S”). `points`: zwrotnice na drodze (`trailing` – najazd od strony
   * krzyżownicy przy złym położeniu), `derailers`: wykolejnice, `exit`: wyjazd na szlak albo null.
   */
  pathBeyond(signalId) {
    const sig = this.signals.get(signalId);
    const path = { sections: [], points: [], derailers: [], exit: null };
    if (!sig) return path;
    const positions = this.positions();
    const start = this.topo.trackAt(sig.tile.at.x, sig.tile.at.y);
    let outPort = start._def.ports(start).find((p) => (p.includes('E') ? 'E' : p.includes('W') ? 'W' : null) === sig.dir);
    let tile = start;
    const sections = new Set();
    for (let guard = 0; guard < 100 && outPort; guard++) {
      const exit = this.topo.exitAt(tile, outPort);
      if (exit) { path.exit = exit.id; break; }
      const nb = this.topo.neighbour(tile, outPort);
      if (!nb) break;
      tile = nb.tile;
      if (tile.section) sections.add(tile.section);
      if (tile.derailer) path.derailers.push(tile.derailer);
      if (tile.type === 'buffer') break;
      const st = this.topo.step(tile, nb.inPort, positions);
      if (tile.type === 'point') path.points.push({ id: tile.id, trailing: !!st.trailing });
      outPort = st.outPort;
      if (outPort && this.topo.signalsAt(tile, outPort).some((sg) => sg.kind === 'semafor')) break;
    }
    path.sections = [...sections];
    return path;
  }

  /**
   * Usterka urządzeń na drodze za semaforem (uzasadnienie Sz i rozkazu „S”): semafor bez sygnału zezwalającego,
   * zajętość z usterki na odcinku drogi, zwrotnica drogi bez kontroli albo z usterką napędu.
   */
  faultOnPath(signalId, path = this.pathBeyond(signalId)) {
    if (this.signals.get(signalId)?.failed) return true;
    if (path.sections.some((id) => Interlocking.faultOccupied(this.sections.get(id)))) return true;
    return path.points.some(({ id }) => { const p = this.points.get(id); return !p.control || p.faultUntil > this.time; });
  }

  /* ------------------------------------------------------------------ */
  /* Przebiegi                                                            */
  /* ------------------------------------------------------------------ */

  /**
   * Aktywne przebiegi pociągowe kończące się na semaforze początkowym `route` (ich kontynuacja). Kontynuacją przebiegu
   * pociągowego jest tylko przebieg pociągowy: przebieg manewrowy z semafora końcowego nie przedłuża jazdy pociągu
   * (dla pociągu Ms2 znaczy „Stój”, Ie-1 §4 ust. 17), więc nie zastępuje drogi ochronnej.
   */
  #continuedBy(route) {
    if (route.kind !== 'train') return [];
    return [...this.active.values()].filter((a) => a.route.kind === 'train' && a.route.end.type === 'signal' && a.route.end.id === route.start);
  }

  /** Czy semafor końcowy przebiegu ma nastawiony własny przebieg pociągowy (kontynuacja – droga ochronna zbędna). */
  #hasContinuation(route) {
    if (route.end.type !== 'signal') return false;
    const endSig = this.signals.get(route.end.id);
    const cont = endSig?.route && this.active.get(endSig.route);
    return !!cont && cont.route.kind === 'train';
  }

  /** Sprawdzenie warunków nastawienia przebiegu (bez zmiany stanu) – komunikaty przeszkód. */
  checkRoute(route) {
    return this.routeProblems(route).map((p) => p.msg);
  }

  /**
   * Przeszkody w nastawieniu przebiegu jako dane: [{ code, msg }]. Kody: `signal-busy`, `setting` (przebieg z tego
   * semafora właśnie się nastawia), `section-closed`, `section-locked`, `section-occupied`, `section-pending`,
   * `overlap`, `point`, `derailer`, `block`, przy `manualPoints` także `point-position` i `derailer-position`
   * (element trzeba najpierw przestawić dźwignią). Logika decyduje po kodzie, komunikat jest dla człowieka.
   */
  routeProblems(route) {
    const problems = [];
    const add = (code, msg) => problems.push({ code, msg });
    const sig = this.signals.get(route.start);
    const predecessors = this.#continuedBy(route);           // przebiegi, których jesteśmy kontynuacją
    const predIds = new Set(predecessors.map((a) => a.id));
    const overlapNeeded = !this.#hasContinuation(route);
    if (sig.route) add('signal-busy', `Semafor ${sig.id} ma już nastawiony przebieg ${sig.route}`);
    if (this.pending.some((p) => p.route.start === route.start)) add('setting', `Przebieg z ${route.start} w trakcie nastawiania`);
    // Odcinki drogi przebiegu
    route.sections.forEach((sid, i) => {
      const s = this.sections.get(sid);
      const last = i === route.sections.length - 1;
      if (s.closed) add('section-closed', `Odcinek ${sid} zamknięty dla ruchu`);
      if (s.route && s.route !== route.id) add('section-locked', `Odcinek ${sid} utwierdzony w przebiegu ${s.route}`);
      if (s.occupied && !(route.kind === 'shunt' && last)) add('section-occupied', `Odcinek ${sid} zajęty`);
      for (const pr of this.pending) if (pr.route.sections.includes(sid)) add('section-pending', `Odcinek ${sid} w nastawianym przebiegu ${pr.route.id}`);
    });
    // Droga ochronna (zbędna, gdy semafor końcowy ma nastawiony przebieg – kontynuacja)
    if (overlapNeeded) {
      for (const sid of route.overlap) {
        const s = this.sections.get(sid);
        if (s.occupied) add('overlap', `Droga ochronna: odcinek ${sid} zajęty`);
        if (s.route && s.route !== route.id) add('overlap', `Droga ochronna: odcinek ${sid} utwierdzony w przebiegu ${s.route}`);
      }
    }
    // Odcinki przebiegu nie mogą leżeć w drodze ochronnej innego przebiegu (poza przebiegami, których jesteśmy kontynuacją)
    for (const act of this.active.values()) {
      if (act.id === route.id || predIds.has(act.id)) continue;
      for (const sid of route.sections) if (act.overlap.includes(sid)) add('overlap', `Odcinek ${sid} w drodze ochronnej przebiegu ${act.id}`);
      // przebieg po przejeździe pociągu, wciąż zamknięty (holdRoute): jego odcinki wykluczają przebiegi sprzeczne
      if (act.passed) for (const sid of route.sections) if (act.route.sections.includes(sid)) add('section-locked', `Odcinek ${sid} w zamkniętym przebiegu ${act.id} – zwolnij przebieg`);
    }
    // Zwrotnice w przebiegu i ochrony bocznej
    for (const req of [...route.points, ...route.flank]) {
      const p = this.points.get(req.id);
      if (!p) { add('point', `Brak zwrotnicy ${req.id}`); continue; }
      if (p.trailed) add('point', `Zwrotnica ${req.id} rozpruta`);
      if (this.manualPoints && (p.position !== req.position || p.moving)) {
        add('point-position', p.moving ? `Zwrotnica ${req.id} w trakcie przestawiania` : `Zwrotnica ${req.id} w położeniu ${p.position} – potrzebne ${req.position}`);
      } else if (p.position !== req.position || !p.control) {
        if (p.individualLock) add('point', `Zwrotnica ${req.id} zamknięta w położeniu ${p.position}`);
        const r = this.pointLockedByRoute(req.id, predIds);
        if (r) add('point', `Zwrotnica ${req.id} utwierdzona w przebiegu ${r.id}`);
        if (this.sections.get(p.section).occupied) add('point', `Zwrotnica ${req.id}: odcinek zajęty – nie można przestawić`);
      } else {
        const r = this.pointLockedByRoute(req.id, predIds);
        if (r && this.#lockedPosition(req.id, predIds) !== req.position) add('point', `Zwrotnica ${req.id} utwierdzona w innym położeniu`);
      }
    }
    for (const req of [...route.derailers.onRoute, ...route.derailers.protect]) {
      const d = this.derailers.get(req.id);
      if (!d) continue;
      if (this.manualPoints && (d.position !== req.position || d.moving)) {
        add('derailer-position', `Wykolejnica ${req.id} ${d.moving ? 'w trakcie przestawiania' : `${d.position === 'on' ? 'nałożona' : 'zdjęta'} – potrzebna ${req.position === 'on' ? 'nałożona' : 'zdjęta'}`}`);
      } else if (d.position !== req.position) {
        if (d.individualLock) add('derailer', `Wykolejnica ${req.id} zamknięta w położeniu ${d.position}`);
        const r = this.derailerLockedByRoute(req.id);
        if (r) add('derailer', `Wykolejnica ${req.id} utwierdzona w przebiegu ${r.id}`);
        if (this.sections.get(d.section).occupied) add('derailer', `Wykolejnica ${req.id}: odcinek zajęty`);
      }
    }
    // Blokada liniowa dla wyjazdu
    if (route.exit && this.opts.blockGate) {
      const g = this.opts.blockGate(route.exit);
      if (!g.ok) add('block', g.reason);
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

  /**
   * Zwolnienie drogi ochronnej po wjeździe pociągu na tor docelowy albo (`byContinuation`) przez nastawiany przebieg
   * kontynuacji – wtedy droga ochronna wraca po jego zwolnieniu (`#restoreOverlap`).
   */
  #releaseOverlap(act, byContinuation = false) {
    if (byContinuation && act.route.overlap.length) act.overlapByCont = true;
    else if (!byContinuation) act.overlapByCont = false;
    if (!act.overlap.length && !act.overlapPoints.length) return;
    const keep = new Set([...act.route.points, ...act.route.flank].map((p) => p.id));
    for (const p of act.overlapPoints) if (!keep.has(p.id)) act.lockedPoints.delete(p.id);
    act.overlap = []; act.overlapPoints = [];
    this.bus.emit('route', { id: act.id, state: 'overlap-released' });
  }

  /**
   * Początek, koniec i rodzaj przebiegu z polecenia. Zgodność wstecz: początek i koniec mogą być elementami obsługi
   * pulpitu ({ id, color }) – wtedy rodzaj wynika z koloru przycisku początkowego (biały = manewrowy).
   */
  static #routeArgs(start, end, kind) {
    const fromRef = start !== null && typeof start === 'object';
    return {
      startId: fromRef ? start.id : start,
      endId: end !== null && typeof end === 'object' ? end.id : end,
      kind: kind ?? (fromRef ? (start.color === 'white' ? 'shunt' : 'train') : null),
    };
  }

  /** Nastawienie przebiegu: semafor początkowy, koniec (semafor / przycisk końca przebiegu), rodzaj 'train' | 'shunt'. */
  requestRoute(start, end, routeKind) {
    const { startId, endId, kind } = Interlocking.#routeArgs(start, end, routeKind);
    if (kind !== 'train' && kind !== 'shunt') return this.#fail(`Przebieg ${startId} → ${endId}: nie podano rodzaju przebiegu`);
    const candidates = [...this.routes.values()].filter((r) => r.start === startId && r.kind === kind && r.endButton === endId);
    if (!candidates.length) return this.#fail(`Brak przebiegu ${kind === 'train' ? 'pociągowego' : 'manewrowego'} ${startId} → ${endId}`);
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

  /** Przebieg złożony (gdy nie ma bezpośredniego – łańcuch przez semafory pośrednie, np. G502 → A502 → szlak):
   *  wszystkie ogniwa muszą dać się nastawić (ogniwo już nastawione liczy się jako gotowe);
   *  inaczej nic nie jest nastawiane, a odmowa nazywa ogniwo i powód. */
  requestCompoundRoute(start, end, routeKind) {
    const { startId, endId, kind } = Interlocking.#routeArgs(start, end, routeKind);
    if (kind !== 'train' && kind !== 'shunt') return this.#fail(`Przebieg ${startId} → ${endId}: nie podano rodzaju przebiegu`);
    if ([...this.routes.values()].some((r) => r.start === startId && r.kind === kind && r.endButton === endId)) return this.requestRoute(startId, endId, kind);
    const chains = this.routeChains(startId, endId, kind);
    if (!chains.length) return this.#fail(`Brak przebiegu ${kind === 'train' ? 'pociągowego' : 'manewrowego'} ${startId} → ${endId} (także złożonego)`);
    const isSet = (r) => this.active.has(r.id) || this.pending.some((p) => p.route.id === r.id);
    let firstFail = null;
    for (const chain of chains) {
      const bad = chain.map((r) => [r, isSet(r) ? [] : this.checkRoute(r)]).find(([, p]) => p.length);
      if (bad) { firstFail ??= bad; continue; }
      this.#log('info', `Przebieg złożony ${startId} → ${chain.map((r) => r.endButton).join(' → ')}`);
      const set = [];
      for (const r of chain) {
        if (isSet(r)) continue;
        const res = this.setRoute(r.id);
        if (!res.ok) return res;
        set.push(r.id);
      }
      return { ok: true, pending: true, chain: chain.map((r) => r.id), set };
    }
    return this.#fail(`Przebieg złożony ${startId} → ${endId}: ogniwo ${firstFail[0].id}: ${firstFail[1].join('; ')}`);
  }

  setRoute(routeId) {
    const route = this.routes.get(routeId);
    if (!route) return this.#fail(`Nieznany przebieg ${routeId}`);
    const problems = this.routeProblems(route);
    if (problems.length) return { ...this.#fail(`Przebieg ${routeId}: ${problems.map((p) => p.msg).join('; ')}`), codes: [...new Set(problems.map((p) => p.code))] };
    // nastawnia mechaniczna: zwrotnice już stoją dobrze (inaczej przeszkoda point-position) – przebieg zamyka się od razu
    if (this.manualPoints) { this.#completeRoute(route); return { ok: true }; }
    for (const pred of this.#continuedBy(route)) this.#releaseOverlap(pred, true);
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
    for (const pred of this.#continuedBy(route)) this.#releaseOverlap(pred, true); // kontynuacja zastępuje drogę ochronną
    const hasCont = this.#hasContinuation(route);
    const act = {
      id: route.id, route, since: this.time,
      lockedSections: [...route.sections], released: new Set(), trainEntered: false,
      overlapPoints: hasCont ? [] : this.#overlapPoints(route),
      lockedPoints: new Set([...route.points, ...route.flank, ...(hasCont ? [] : this.#overlapPoints(route))].map((p) => p.id)),
      lockedDerailers: new Set([...route.derailers.onRoute, ...route.derailers.protect].map((d) => d.id)),
      overlap: hasCont ? [] : [...route.overlap], overlapByCont: hasCont && route.overlap.length > 0,
      signalOff: this.manualSignal, timedRelease: null,
      lever: false, blocked: false, passed: false, // dźwignia sygnałowa, blok przebiegowy, przejazd przy holdRoute
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
    // dźwignię sygnałową zawsze da się przełożyć na „Stój” – także bez przebiegu
    if (!sig.route) return this.manualSignal ? { ok: true, noop: true } : { ok: false };
    const act = this.active.get(sig.route);
    if (this.manualSignal) {
      if (!act.lever) return { ok: true, noop: true };
      act.lever = false;
      if (act.signalOff) { this.bus.emit('route', { id: act.id, state: 'lever' }); return { ok: true }; } // pociąg już minął semafor
    } else if (act.signalOff) return { ok: true, noop: true };
    act.signalOff = true;
    this.#refreshSignals();
    this.#log('info', `Sygnał na ${signalId} wygaszony (przebieg ${sig.route} pozostaje utwierdzony)`);
    if (act.route.kind === 'shunt') this.#tryReleaseShunt(act);
    return { ok: true };
  }

  /**
   * Dźwignia sygnałowa (manualSignal): sygnał zezwalający na przebiegu zamkniętym drążkiem. Przy `routeBlock` przebieg
   * pociągowy wymaga zablokowanego bloku przebiegowego; dla jednej jazdy sygnał podaje się tylko raz.
   */
  clearSignal(signalId) {
    const sig = this.signals.get(signalId);
    if (!sig) return this.#fail(`Brak sygnalizatora ${signalId}`);
    if (!this.manualSignal) return this.#fail(`${signalId}: sygnał podaje się przy nastawianiu przebiegu`);
    if (!sig.route) return this.#fail(`${signalId}: brak nastawionego przebiegu – najpierw drążek przebiegowy`);
    const act = this.active.get(sig.route);
    if (act.lever) return { ok: true, noop: true };
    if (act.trainEntered || act.passed) return this.#fail(`${signalId}: sygnał zezwalający dla tej jazdy już był – zwolnij przebieg i nastaw go od nowa`);
    if (this.routeBlock && act.route.kind === 'train' && !act.blocked) return this.#fail(`${signalId}: najpierw zablokuj blok przebiegowy utwierdzający przebiegu ${act.id}`);
    act.lever = true; act.signalOff = false;
    this.#refreshSignals();
    this.#log('info', `Dźwignia sygnałowa ${signalId} przełożona – ${sig.kind === 'semafor' ? 'semafor' : 'tarcza'} ${signalId}: ${sig.aspect}`);
    this.bus.emit('route', { id: act.id, state: 'lever' });
    return { ok: true };
  }

  /** Blok przebiegowy utwierdzający (routeBlock): zablokowany przebieg pociągowy zwalnia dopiero pociąg. */
  blockRoute(signalId) {
    const sig = this.signals.get(signalId);
    if (!sig) return this.#fail(`Brak sygnalizatora ${signalId}`);
    if (!this.routeBlock) return this.#fail('Brak bloku przebiegowego utwierdzającego');
    if (!sig.route) return this.#fail(`${signalId}: brak nastawionego przebiegu – najpierw drążek przebiegowy`);
    const act = this.active.get(sig.route);
    if (act.route.kind !== 'train') return this.#fail(`Przebieg manewrowy ${act.id} nie ma bloku przebiegowego`);
    if (act.blocked) return { ok: true, noop: true };
    if (act.passed || act.trainEntered) return this.#fail(`Przebieg ${act.id}: pociąg już wjechał`);
    act.blocked = true;
    this.#log('info', `Blok przebiegowy utwierdzający przebiegu ${act.id} zablokowany`);
    this.bus.emit('route', { id: act.id, state: 'blocked' });
    return { ok: true };
  }

  /**
   * Zwolnienie przebiegu przyciskiem Pz (zwalnianie normalne / czasowe)
   * lub dPz (doraźne, licznikowe). Przy nastawni mechanicznej: cofnięcie drążka przebiegowego (dźwignia sygnałowa
   * musi stać na „Stój”); zablokowany blok przebiegowy – tylko zwalniacz (`emergency`, licznik jak dPz).
   */
  releaseRoute(signalId, emergency, timed = false) {
    const sig = this.signals.get(signalId);
    if (!sig) return this.#fail(`Brak sygnalizatora ${signalId}`);
    const pend = this.pending.findIndex((p) => p.route.start === signalId);
    if (pend >= 0) {
      const [{ route }] = this.pending.splice(pend, 1);
      this.#log('info', `Nastawianie przebiegu z ${signalId} przerwane`);
      this.#restoreOverlap(this.#continuedBy(route));
      return { ok: true };
    }
    if (!sig.route) return this.#fail(`Semafor ${signalId} nie ma nastawionego przebiegu`);
    const act = this.active.get(sig.route);
    if (this.manualSignal && act.lever && !emergency) return this.#fail(`Przebieg ${act.id}: najpierw przełóż dźwignię sygnałową ${signalId} na „Stój”`);
    // zablokowany blok przebiegowy (także niezwolniony przez pociąg przy usterce) – tylko zwalniacz
    if (this.routeBlock && act.blocked && !emergency) return this.#fail(`Przebieg ${act.id}: blok przebiegowy utwierdzający zablokowany – ${act.stuck ? 'pociąg go nie zwolnił (usterka), użyj zwalniacza' : 'zwolni go pociąg (albo zwalniacz)'}`);
    if (act.passed && !emergency) {
      this.#log('info', `Przebieg ${act.id} zwolniony (drążek przebiegowy w położeniu zasadniczym)`);
      this.#dissolve(act);
      return { ok: true };
    }
    act.lever = false;
    act.signalOff = true;
    this.#refreshSignals();
    if (emergency) {
      this.counters.dPz++;
      this.#log('warn', `Doraźne zwolnienie przebiegu ${act.id} (dPz, licznik ${this.counters.dPz})`);
      // zwalniacz przy bloku, którego nie zwolnił pociąg (usterka urządzenia oddziaływania) jest uzasadniony
      this.bus.emit('score', { time: this.time, code: 'dPz', points: act.stuck ? 0 : -20, msg: `Doraźne zwolnienie przebiegu ${act.id} (dPz)${act.stuck ? ' – uzasadnione usterką' : ''}` });
      this.#dissolve(act);
      return { ok: true };
    }
    if (act.trainEntered) return this.#fail(`Przebieg ${act.id}: pociąg już wjechał – zwalnianie odcinkowe (lub dPz)`);
    const approach = this.sections.get(act.route.approach);
    const train = act.route.kind === 'train';
    const delay = train ? this.timedRelease : this.shuntTimedRelease;
    // zbliżanie zajęte także wtedy, gdy przebieg poprzedni (kończący się na tym semaforze) ma sygnał zezwalający albo
    // pociąg – pociąg może już jechać na ten przebieg (Ie-4 §41 ust. 3)
    const predTrain = train && this.#continuedBy(act.route).some((p) => !p.signalOff || p.trainEntered);
    const occupied = approach?.occupied || predTrain || (!train && act.lockedSections.some((s) => this.sections.get(s).occupied));
    // `timed` – zwolnienie czasowe na żądanie dyżurnego (MOR-3: ZCZ), także przy wolnym odcinku zbliżania
    if (delay > 0 && (occupied || timed || (train && this.timedReleaseAlways))) {
      if (act.timedRelease) return { ok: true, noop: true };
      act.timedRelease = this.time + delay;
      this.#log('info', `Przebieg ${act.id}: ${occupied ? 'odcinek zbliżania zajęty – ' : ''}zwalnianie czasowe (${delay} s)`);
      this.bus.emit('route', { id: act.id, state: 'timed' });
      return { ok: true, timed: true };
    }
    this.#log('info', `Przebieg ${act.id} zwolniony`);
    this.#dissolve(act);
    return { ok: true };
  }

  /** Przebieg (nastawiony lub nastawiany), który kończy się na elemencie `endId` – semaforze albo przycisku końca. */
  routeEndingAt(endId) {
    for (const act of this.active.values()) if (act.route.endButton === endId) return act.route;
    return this.pending.find((p) => p.route.endButton === endId)?.route ?? null;
  }

  #tryReleaseShunt(act) {
    if (!act.signalOff || act.passed) return;
    if (act.lockedSections.some((s) => this.sections.get(s).occupied && !act.released.has(s))) return;
    this.#finish(act, `Przebieg manewrowy ${act.id} zwolniony`);
  }

  /** Koniec jazdy w przebiegu: rozwiązanie albo (holdRoute) przebieg zostaje zamknięty do zwolnienia przez gracza. */
  #finish(act, msg) {
    if (!this.holdRoute) { this.#log('info', msg); this.#dissolve(act); return; }
    if (act.passed) return;
    // usterka urządzenia oddziaływania: pociąg przejechał, ale blok przebiegowy zostaje zablokowany
    act.stuck = !!(this.routeBlock && act.blocked && this.signals.get(act.route.start)?.blockStuck);
    act.passed = true; act.blocked = act.stuck; act.signalOff = true;
    if (act.stuck) this.#log('alarm', `Przebieg ${act.id}: blok przebiegowy nie zwolnił się po przejeździe – sprawdź, że pociąg minął miejsce końca pociągu, i użyj zwalniacza`);
    this.#refreshSignals();
    this.#log('info', `Przebieg ${act.id}: pociąg przejechał${act.route.kind === 'train' && this.routeBlock ? ', blok przebiegowy zwolniony' : ''} – ${this.manualSignal ? 'przełóż dźwignię sygnałową na „Stój” i ' : ''}zwolnij przebieg (drążek)`);
    this.bus.emit('route', { id: act.id, state: 'passed' });
  }

  #dissolve(act) {
    const preds = this.#continuedBy(act.route);
    for (const sid of act.lockedSections) {
      const s = this.sections.get(sid);
      if (s.route === act.id) s.route = null;
    }
    const sig = this.signals.get(act.route.start);
    if (sig.route === act.id) sig.route = null;
    this.active.delete(act.id);
    this.#restoreOverlap(preds);
    this.#refreshSignals();
    this.bus.emit('route', { id: act.id, state: 'released' });
  }

  /**
   * Po zwolnieniu przebiegu kontynuacji droga ochronna przebiegów poprzedzających wraca (jest częścią przebiegu
   * pociągowego, Ie-4 §37 ust. 2); gdy nie może (odcinek zajęty lub w innym przebiegu, zwrotnica utwierdzona inaczej),
   * semafor poprzedzający przed wjazdem pociągu zmienia się na „Stój”.
   */
  #restoreOverlap(preds) {
    for (const pred of preds) {
      if (!this.active.has(pred.id) || !pred.overlapByCont || pred.overlap.length) continue;
      pred.overlapByCont = false;
      const secs = pred.route.overlap;
      const pts = this.#overlapPoints(pred.route);
      const busySec = secs.find((sid) => {
        const s = this.sections.get(sid);
        return s.occupied || s.route || [...this.active.values()].some((a) => a !== pred && a.overlap.includes(sid));
      });
      const busyPoint = pts.find((p) => this.points.get(p.id).moving || (this.#lockedPosition(p.id) ?? p.position) !== p.position);
      if (!busySec && !busyPoint) {
        pred.overlap = [...secs]; pred.overlapPoints = pts;
        for (const p of pts) pred.lockedPoints.add(p.id);
        this.#log('info', `Przebieg ${pred.id}: droga ochronna ${secs.join(', ')} przywrócona`);
        this.bus.emit('route', { id: pred.id, state: 'overlap-restored' });
      } else if (!pred.trainEntered && !pred.signalOff && !this.manualSignal) {
        pred.signalOff = true;
        this.#log('warn', `Semafor ${pred.route.start} na „Stój”: droga ochronna przebiegu ${pred.id} nie może wrócić (${busySec ? `odcinek ${busySec}` : `zwrotnica ${busyPoint.id}`})`);
      }
    }
  }

  /* ------------------------------------------------------------------ */
  /* Polecenia stanowisk komputerowych (EBILock 950: ITS/ITO, SES/SEO, SSS/SSO, SZO, KZW)                  */
  /* ------------------------------------------------------------------ */

  /**
   * Zamknięcie ruchowe toru przez dyżurnego (ITS) i jego odwołanie (ITO). Odcinka utwierdzonego w przebiegu się nie
   * zamyka; zamknięcia z planu (scenariusz, `closedSections`) dyżurny nie odwołuje.
   */
  closeSection(id, closed) {
    const s = this.sections.get(id);
    if (!s) return this.#fail(`Brak odcinka ${id}`);
    if (closed) {
      if (s.closed) return { ok: true, noop: true };
      if (s.route) return this.#fail(`Odcinek ${id} utwierdzony w przebiegu ${s.route} – nie można zamknąć`);
      s.closed = true; s.closedByOrder = true;
    } else {
      if (!s.closed) return { ok: true, noop: true };
      if (!s.closedByOrder) return this.#fail(`Odcinek ${id} zamknięty z planu (zamknięcie torowe) – dyżurny go nie otwiera`);
      s.closed = false; s.closedByOrder = false;
    }
    this.#log('info', `Odcinek ${id} ${closed ? 'zamknięty' : 'otwarty'} dla ruchu (polecenie dyżurnego)`);
    this.bus.emit('section', s);
    return { ok: true };
  }

  /**
   * Zerowanie licznika osi (MOR-3: ZeroLO) na odcinku z usterką licznika: odcinek dalej wskazuje zajętość, ale czeka na
   * przejazd kontrolny – zwolni go wjazd i wyjazd pierwszego pociągu (Faults, `axle-counter`).
   */
  resetAxleCounter(id) {
    const s = this.sections.get(id);
    if (!s) return this.#fail(`Brak odcinka ${id}`);
    if (!s.axleFault) return this.#fail(`Odcinek ${id}: licznik osi sprawny – zerowanie niepotrzebne`);
    if (s.resetPending) return this.#fail(`Odcinek ${id}: licznik już wyzerowany – czeka na przejazd kontrolny`);
    if (s.route) return this.#fail(`Odcinek ${id} utwierdzony w przebiegu ${s.route}`);
    s.resetPending = true;
    this.#log('warn', `Zerowanie licznika osi odcinka ${id} (ZeroLO) – odcinek zajęty do przejazdu kontrolnego; pierwszy pociąg na sygnał zastępczy`);
    this.bus.emit('section', s);
    return { ok: true };
  }

  /** Stopowanie sygnalizatora (SES) – „Stój” mimo nastawionego przebiegu – i odwołanie (SEO). */
  stopSignal(signalId, on) {
    const sig = this.signals.get(signalId);
    if (!sig) return this.#fail(`Brak sygnalizatora ${signalId}`);
    if (sig.stopped === !!on) return { ok: true, noop: true };
    sig.stopped = !!on;
    this.#log('info', `Sygnalizator ${signalId} ${on ? 'stopowany – „Stój”' : 'odstopowany'}`);
    this.#refreshSignals();
    return { ok: true };
  }

  /** Stopowanie wszystkich sygnalizatorów stacji (SSS) i odwołanie (SSO). */
  stopAll(on) {
    if (this.allStop === !!on) return { ok: true, noop: true };
    this.allStop = !!on;
    this.#log('warn', on ? 'Wszystkie sygnalizatory stacji na „Stój” (SSS)' : 'Odwołanie stopowania wszystkich sygnalizatorów (SSO)');
    this.#refreshSignals();
    return { ok: true };
  }

  /** Wygaszenie wszystkich wyświetlonych sygnałów zastępczych (SZO). */
  substituteOff() {
    const on = [...this.signals.values()].filter((s) => s.substitute);
    for (const s of on) s.substitute = false;
    if (on.length) { this.#log('info', `Sygnały zastępcze wygaszone: ${on.map((s) => s.id).join(', ')}`); this.#refreshSignals(); }
    return on.length ? { ok: true } : { ok: true, noop: true };
  }

  /** Odwołanie zwalniania czasowego przebiegu od sygnalizatora (KZW) – przebieg zostaje utwierdzony. */
  cancelTimedRelease(signalId) {
    const act = [...this.active.values()].find((a) => a.route.start === signalId && a.timedRelease);
    if (!act) return this.#fail(`${signalId}: brak zwalniania czasowego do odwołania`);
    act.timedRelease = null;
    this.#log('info', `Przebieg ${act.id}: zwalnianie czasowe odwołane`);
    this.bus.emit('route', { id: act.id, state: 'set' });
    return { ok: true };
  }

  /** Sygnał zastępczy Sz na semaforze (licznik). */
  substituteSignal(signalId) {
    const sig = this.signals.get(signalId);
    if (!sig || sig.kind !== 'semafor') return this.#fail(`Sz tylko na semaforze`);
    if (!sig.canSubstitute) return this.#fail(`Semafor ${signalId} nie ma sygnału zastępczego`);
    if (sig.route && Interlocking.isProceed(sig.aspect)) return this.#fail(`Semafor ${signalId} wyświetla sygnał zezwalający`);
    // blokada liniowa – tylko wyjazdu, na który prowadzi droga za semaforem (po bieżących położeniach zwrotnic)
    const path = this.pathBeyond(signalId);
    if (path.exit && this.opts.blockGate) {
      const g = this.opts.blockGate(path.exit);
      if (!g.ok) return this.#fail(`Sz na ${signalId}: ${g.reason}`);
    }
    sig.substitute = true; sig.substituteUntil = this.time + SUBSTITUTE_TIME;
    this.counters.Sz++;
    this.#log('warn', `Sygnał zastępczy Sz na semaforze ${signalId} (licznik ${this.counters.Sz})`);
    const justified = this.faultOnPath(signalId, path);
    this.bus.emit('score', { time: this.time, code: 'Sz', points: justified ? 0 : -5, msg: `Sygnał zastępczy na ${signalId}${justified ? ' (uzasadniony usterką)' : ' bez usterki urządzeń'}` });
    // przed Sz zwrotnice drogi ustawia się i utwierdza (przebieg albo zamknięcie Zz) – urządzenie tego nie wymusza
    const loose = path.points.filter(({ id }) => !this.points.get(id).individualLock && !this.pointLockedByRoute(id)).map((p) => p.id);
    if (loose.length) this.bus.emit('score', { time: this.time, code: 'Sz-points', points: -10, msg: `Sz na ${signalId}: zwrotnice ${loose.join(', ')} nieutwierdzone ani niezamknięte (Zz)` });
    this.#refreshSignals();
    return { ok: true };
  }

  /* ------------------------------------------------------------------ */
  /* Sygnalizatory – obrazy wg Ie-1                                       */
  /* ------------------------------------------------------------------ */

  /** Prędkość dopuszczona obrazem sygnałowym (Infinity = największa dozwolona). */
  static aspectSpeed(aspect) {
    switch (aspect) {
      case 'S1': case 'Sr1': case 'Ms1': case 'M1': return 0;
      case 'Sz': return 20;
      case 'Ms2': case 'M2': return 25;
      case 'S10': case 'S11': case 'S12': case 'S13': case 'Sr3': return 40;
      default: return Infinity;
    }
  }

  static isProceed(aspect) {
    return !['S1', 'Sr1', 'Ms1', 'M1'].includes(aspect);
  }

  /** „Stój” na semaforze (świetlnym S1 albo kształtowym Sr1). */
  static isStop(aspect) {
    return aspect === 'S1' || aspect === 'Sr1';
  }

  /** Sygnał zezwalający dla pociągu (S2–S13, Sr2/Sr3, Sz) – Ms2 / M2 na semaforze dla pociągu znaczy „Stój”. */
  static isTrainProceed(aspect) {
    return Interlocking.isProceed(aspect) && !Interlocking.isShuntProceed(aspect);
  }

  /** Jazda manewrowa dozwolona (Ms2 na tarczy świetlnej albo semaforze, M2 na tarczy kształtowej). */
  static isShuntProceed(aspect) {
    return aspect === 'Ms2' || aspect === 'M2';
  }

  /** Obraz tarczy ostrzegawczej kształtowej (Ie-1 §5) dla obrazu semafora: dwustawna Od, trzystawna Ot. */
  static warningAspect(aspect, arms) {
    if (arms === 2) return aspect === 'Sr2' ? 'Ot2' : aspect === 'Sr3' ? 'Ot3' : 'Ot1';
    return aspect === 'Sr2' || aspect === 'Sr3' ? 'Od2' : 'Od1';
  }

  #stopAspect(kind) {
    if (kind === 'semafor') return this.shapedSignals ? 'Sr1' : 'S1';
    return this.shapedSignals ? 'M1' : 'Ms1';
  }

  refreshSignals() { this.#refreshSignals(); }

  /** Kostka leży na drodze, w którą są ustawione zwrotnice jej odcinka (`Topology.branchGates`) – dla widoków. */
  onSetBranch(tile) {
    return (this.topo.branchGates.get(tile._key) || []).every((g) => this.points.get(g.id)?.position === g.position);
  }

  #refreshSignals() {
    // Dwa przebiegi, aby uwzględnić zależność od następnego semafora
    for (let i = 0; i < 2; i++) {
      for (const sig of this.signals.values()) {
        const prev = sig.aspect;
        sig.aspect = this.#computeAspect(sig);
        if (sig.warning) sig.warning = Interlocking.warningAspect(sig.aspect, sig.arms);
        if (prev !== sig.aspect && i === 1) this.bus.emit('signal', sig);
      }
    }
    for (const sig of this.signals.values()) this.bus.emit('signal', sig);
  }

  /** Warunek sygnału zezwalającego przebiegu niespełniony (opis) albo null. */
  #signalCondition(act) {
    for (const sid of [...act.lockedSections, ...act.overlap]) {
      if (this.sections.get(sid)?.occupied) return `odcinek ${sid} zajęty`;
    }
    for (const pid of act.lockedPoints) {
      const p = this.points.get(pid);
      if (!p.control || p.moving) return `zwrotnica ${pid} bez kontroli`;
    }
    return null;
  }

  #computeAspect(sig) {
    if (sig.substitute) return 'Sz';
    const stop = this.#stopAspect(sig.kind);
    if (sig.failed || sig.stopped || this.allStop) return stop;
    if (!sig.route) return stop;
    const act = this.active.get(sig.route);
    if (!act || act.signalOff) return stop;
    if (act.route.kind === 'shunt') return this.shapedSignals ? 'M2' : 'Ms2';
    const restricted = act.route.speed <= 60;
    // semafor kształtowy nie zapowiada następnego: Sr3 – do 40 km/h przez okręg zwrotnicowy, Sr2 – największa dozwolona
    if (this.shapedSignals) return restricted ? 'Sr3' : 'Sr2';
    let next = null;
    if (act.route.end.type === 'signal') next = this.signals.get(act.route.end.id)?.aspect || 'S1';
    // następny semafor na „Stój” – także gdy wskazuje tylko sygnał manewrowy (Ms2 / M2 dla pociągu znaczy „Stój”)
    const nextStop = !next || next === 'S1' || next === 'Sz' || Interlocking.isShuntProceed(next);
    const nextRestricted = next && ['S10', 'S11', 'S12', 'S13'].includes(next);
    if (act.route.end.type === 'exit') return restricted ? 'S10' : 'S2';
    if (nextStop) return restricted ? 'S13' : 'S5';
    if (nextRestricted) return restricted ? 'S12' : 'S4';
    return restricted ? 'S10' : 'S2';
  }

  /* ------------------------------------------------------------------ */
  /* Zajętość i takt                                                      */
  /* ------------------------------------------------------------------ */

  /**
   * Aktualizacja zajętości odcinków (zbiór id odcinków zajętych przez tabor). Obraz zajętości (`occupied`) obejmuje też
   * usterki (fałszywa zajętość `forced`, licznik osi `axleFault`), ale wjazd pociągu (`wasOccupied`) i zajętość fizyczna
   * (`physical`) – tylko tabor: zajętość z usterki nie „przejeżdża” przebiegu.
   */
  updateOccupancy(occupiedSet) {
    for (const s of this.sections.values()) {
      const phys = occupiedSet.has(s.id);
      if (phys && !s.physical) s.wasOccupied = true; // wjazd taboru (tabor stojący przy utwierdzeniu się nie liczy)
      s.physical = phys;
      const occ = phys || Interlocking.faultOccupied(s);
      if (occ !== s.occupied) {
        s.occupied = occ;
        this.bus.emit('section', s);
      }
    }
  }

  /** Zajętość odcinka z usterki urządzeń (nie z taboru). */
  static faultOccupied(s) {
    return !!s.forced || !!s.axleFault;
  }

  /** Obraz zajętości od nowa z ostatniej zajętości fizycznej – po zmianie usterki odcinka. */
  refreshOccupancy() {
    this.updateOccupancy(new Set([...this.sections.values()].filter((s) => s.physical).map((s) => s.id)));
  }

  tick(time) {
    this.time = time;
    this.input?.tick(time); // uzbrojenie przycisku wygasa w protokole obsługi

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
        const problems = this.routeProblems(r).filter((p) => p.code !== 'setting').map((p) => p.msg);
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
        // sygnał manewrowy gaśnie dopiero, gdy cały skład minie sygnalizator (Ie-4 §40) – ogon na odcinku przed nim;
        // nastawnia mechaniczna: tarczę przestawia dźwignia, bez zmian
        const approach = this.sections.get(act.route.approach);
        if (!act.signalOff && act.route.kind === 'shunt' && !this.manualSignal && approach?.physical) act.shuntHold = true;
        else if (!act.signalOff) { act.signalOff = true; this.#refreshSignals(); this.#log('info', `Pociąg minął semafor ${sig.id} na sygnale ${prevAspect} – semafor samoczynnie na „Stój”`); }
        if (act.route.exit && this.opts.onDeparture) this.opts.onDeparture(act.route.exit, act.route);
      }
      // stała kontrola warunków sygnału przed wjazdem pociągu: zajętość odcinka przebiegu lub drogi ochronnej, utrata
      // kontroli zwrotnicy – semafor na „Stój”, przebieg zostaje utwierdzony; sygnał nie wraca sam (nastawnia
      // mechaniczna: sygnał trzyma dźwignia – bez zmian)
      if (!act.trainEntered && !act.signalOff && !this.manualSignal && act.route.kind === 'train') {
        const why = this.#signalCondition(act);
        if (why) {
          act.signalOff = true; this.#refreshSignals();
          this.#log('warn', `Semafor ${sig.id} samoczynnie na „Stój”: ${why} – przebieg ${act.id} utwierdzony`);
        }
      }
      if (act.shuntHold && !this.sections.get(act.route.approach)?.physical) {
        act.shuntHold = false; act.signalOff = true; this.#refreshSignals();
        this.#log('info', `Skład minął ${sig.kind === 'tm' ? 'tarczę' : 'semafor'} ${sig.id} – sygnał manewrowy zgasł`);
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
        // Zwrotnice zwalniają się z odcinkami (holdRoute: trzyma je drążek przebiegowy do zwolnienia przebiegu)
        if (!this.holdRoute) {
          for (const pid of [...act.lockedPoints]) {
            const p = this.points.get(pid);
            const inRoute = act.route.points.some((q) => q.id === pid);
            if (inRoute && act.released.has(p.section)) act.lockedPoints.delete(pid);
          }
        }
        if (act.released.size === secs.length) this.#finish(act, `Przebieg ${act.id} rozwiązany (pociąg przejechał)`);
      } else if (act.route.kind === 'shunt' && !secs.length) {
        // przebieg manewrowy w obrębie jednego odcinka: rozwiązuje się, gdy tabor opuści odcinek
        const app = this.sections.get(act.route.approach);
        if (app?.occupied) act.sawTrain = true;
        else if (act.sawTrain) this.#finish(act, `Przebieg manewrowy ${act.id} rozwiązany (tabor opuścił odcinek)`);
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
