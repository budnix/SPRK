import { getTileDef } from '../tiles/registry.js';
import { VEC, OPPOSITE, heading, portLen, key } from '../tiles/directions.js';

/**
 * Topologia toru zbudowana z kostek pulpitu.
 *
 * Kostki torowe łączą się przez porty; kostka o portach ['W','E'] w (5,4)
 * łączy się z kostką w (4,4) posiadającą port 'E' i kostką w (6,4) z portem 'W'.
 *
 * Topologia dostarcza:
 *  - `tileAt(x,y)`, `tracks` – kostki torowe
 *  - `neighbour(tile, port)` – kostka sąsiednia przez port (jeśli połączona)
 *  - `walk(...)` – przejście po torze z uwzględnieniem położeń zwrotnic
 *  - `signalsAt(tile, outPort)` – sygnalizatory na granicy wyjścia z kostki
 *  - `deriveRoutes(...)` – automatyczne wyznaczenie przebiegów (tablica zależności)
 */
export class Topology {
  constructor(station) {
    this.station = station;
    this.tiles = new Map();      // key -> tile (wszystkie kostki)
    this.tracks = [];            // kostki torowe
    this.signals = new Map();    // id -> signal tile
    this.signalIndex = new Map(); // `${x},${y}:${heading}` -> [signal tiles]
    this.points = new Map();     // id -> point tile
    this.derailers = new Map();  // id -> track tile
    this.endButtons = new Map(); // button id -> tile
    this.sectionTiles = new Map(); // section id -> [tiles]

    for (const tile of station.tiles) {
      const def = getTileDef(tile.type);
      tile._def = def;
      tile._key = key(tile.x, tile.y);
      this.tiles.set(tile._key, tile);
      if (def.category === 'track') {
        this.tracks.push(tile);
        if (!tile.section) throw new Error(`Kostka torowa (${tile.x},${tile.y}) nie ma odcinka izolowanego`);
        if (!this.sectionTiles.has(tile.section)) this.sectionTiles.set(tile.section, []);
        this.sectionTiles.get(tile.section).push(tile);
        if (tile.type === 'point') this.points.set(tile.id, tile);
        if (tile.derailer) this.derailers.set(tile.derailer, tile);
        if (tile.endButton) this.endButtons.set(tile.endButton.id, tile);
      }
      if (def.category === 'signal') {
        this.signals.set(tile.id, tile);
        const k = `${tile.at.x},${tile.at.y}:${tile.dir}`;
        if (!this.signalIndex.has(k)) this.signalIndex.set(k, []);
        this.signalIndex.get(k).push(tile);
      }
    }
    this.#validateConnections();
    this.#assignTileLengths();
    this.branchGates = this.#pointBranches();
  }

  /**
   * Kostki odcinka zwrotnicowego za ramieniem zwrotnicy (łącznica, tor za iglicami): klucz kostki → lista
   * { id, position } zwrotnic, które muszą leżeć w tym położeniu, aby kostka była na drodze jazdy. Kostki przed ostrzem
   * (i poza odcinkami zwrotnic) nie mają wpisu. Widoki świecą zajętość i utwierdzenie odcinka tylko na drodze, w którą
   * zwrotnice są ustawione – łącznica, w którą zwrotnica nie jest ustawiona, zostaje ciemna.
   */
  #pointBranches() {
    const gates = new Map();
    for (const pt of this.points.values()) {
      for (const [port, position] of [[pt.straight, '+'], [pt.diverge, '-']]) {
        let nb = this.neighbour(pt, port);
        const seen = new Set();
        while (nb && nb.tile.type === 'track' && nb.tile.section === pt.section && !seen.has(nb.tile._key)) {
          seen.add(nb.tile._key);
          if (!gates.has(nb.tile._key)) gates.set(nb.tile._key, []);
          gates.get(nb.tile._key).push({ id: pt.id, position });
          const out = nb.tile._def.exits(nb.tile, nb.inPort)[0];
          nb = out ? this.neighbour(nb.tile, out) : null;
        }
      }
    }
    return gates;
  }

  tileAt(x, y) {
    return this.tiles.get(key(x, y));
  }

  trackAt(x, y) {
    const t = this.tileAt(x, y);
    return t && t._def.category === 'track' ? t : null;
  }

  /** Kostka sąsiednia połączona przez port `port` (lub null). */
  neighbour(tile, port) {
    const [dx, dy] = VEC[port];
    const n = this.trackAt(tile.x + dx, tile.y + dy);
    if (!n) return null;
    const back = OPPOSITE[port];
    return n._def.ports(n).includes(back) ? { tile: n, inPort: back } : null;
  }

  #validateConnections() {
    for (const t of this.tracks) {
      for (const p of t._def.ports(t)) {
        // Port może prowadzić „poza pulpit” tylko na kostce wyjazdu (exit)
        if (!this.neighbour(t, p)) {
          const isExit = Object.values(this.station.exits || {}).some(
            (e) => e.tile.x === t.x && e.tile.y === t.y && e.dir === p,
          );
          if (!isExit) {
            t._openPorts = (t._openPorts || []).concat(p);
          }
        }
      }
    }
  }

  /**
   * Długość każdej kostki w metrach: długość odcinka rozłożona proporcjonalnie
   * do geometrii kostek (skosy są dłuższe od prostych).
   */
  #assignTileLengths() {
    const sections = this.station.sections || {};
    for (const [sid, tiles] of this.sectionTiles) {
      const secLen = sections[sid]?.length ?? tiles.length * 25;
      const geo = tiles.map((t) => t._def.ports(t).reduce((s, p) => s + portLen(p), 0) || 1);
      const total = geo.reduce((a, b) => a + b, 0);
      tiles.forEach((t, i) => { t._len = secLen * geo[i] / total; });
    }
  }

  /** Sygnalizatory ważne przy wyjeździe z kostki `tile` portem `outPort`. */
  signalsAt(tile, outPort) {
    const h = heading(outPort);
    if (!h) return [];
    return this.signalIndex.get(`${tile.x},${tile.y}:${h}`) || [];
  }

  /** Wyjazd ze stacji (szlak) przez kostkę i port, jeśli istnieje. */
  exitAt(tile, outPort) {
    for (const [id, e] of Object.entries(this.station.exits || {})) {
      if (e.tile.x === tile.x && e.tile.y === tile.y && e.dir === outPort) return { id, ...e };
    }
    return null;
  }

  /**
   * Jeden krok po torze: z kostki `tile`, wchodząc portem `inPort`, wychodzimy
   * przez port zależny od położenia zwrotnicy (`positions[id]`).
   * Zwraca { tile, inPort, outPort, next: {tile, inPort} | null, exit, trailing, requiredPosition }.
   */
  step(tile, inPort, positions) {
    const def = tile._def;
    const state = tile.type === 'point' ? { position: positions[tile.id] ?? '+' } : null;
    let trailing = false;
    let outPort;
    if (tile.type === 'point' && inPort !== tile.toe) {
      // Jazda z ostrza – sprawdź, czy zwrotnica leży w kierunku, z którego wjeżdżamy (inaczej rozprucie)
      const req = def.requiredPosition(tile, inPort, tile.toe);
      trailing = req !== state.position;
      outPort = tile.toe;
    } else {
      const ex = def.exits(tile, inPort, state);
      outPort = ex[0];
    }
    if (!outPort) return { tile, inPort, outPort: null, next: null, exit: null, trailing };
    const next = this.neighbour(tile, outPort);
    const exit = this.exitAt(tile, outPort);
    return { tile, inPort, outPort, next, exit, trailing };
  }

  /**
   * Wyznaczenie wszystkich możliwych dróg jazdy od sygnalizatora `sig`
   * (od kostki `at` w kierunku `dir`) do następnego sygnalizatora ważnego
   * w tym kierunku, wyjazdu na szlak lub kozła (dla jazd manewrowych).
   *
   * Zwraca listę ścieżek: { steps: [{tile,inPort,outPort}], points: [{id,position}],
   *   sections: [...], end: {type:'signal'|'exit'|'buffer'|'endButton', id} }
   */
  pathsFrom(sig, kind) {
    const start = this.trackAt(sig.at.x, sig.at.y);
    if (!start) throw new Error(`Sygnalizator ${sig.id}: brak kostki torowej w (${sig.at.x},${sig.at.y})`);
    // Port wyjścia z kostki startowej w kierunku dir
    const outPorts = start._def.ports(start).filter((p) => heading(p) === sig.dir);
    const results = [];
    for (const op of outPorts) {
      // Jeżeli kostka startowa jest zwrotnicą, ustal wymagane położenie
      const firstPoints = [];
      if (start.type === 'point') {
        const inP = start._def.ports(start).find((p) => heading(p) !== sig.dir && p !== op) || start.toe;
        const rp = start._def.requiredPosition(start, inP, op);
        if (rp) firstPoints.push({ id: start.id, position: rp });
      }
      this.#explore(start, op, kind, {
        steps: [{ tile: start, inPort: null, outPort: op }],
        points: [...firstPoints],
        sections: [start.section],
        startSignal: sig,
        heading: sig.dir,
      }, results, new Set([start._key]));
    }
    return results;
  }

  #explore(tile, outPort, kind, acc, results, visited) {
    const exit = this.exitAt(tile, outPort);
    if (exit) {
      results.push({ ...acc, end: { type: 'exit', id: exit.id } });
      return;
    }
    const nb = this.neighbour(tile, outPort);
    if (!nb) return; // tor urwany
    const n = nb.tile;
    if (visited.has(n._key)) return;
    const inPort = nb.inPort;
    const def = n._def;
    const sections = acc.sections.includes(n.section) ? acc.sections : [...acc.sections, n.section];

    if (n.type === 'buffer') {
      results.push({
        ...acc, sections,
        steps: [...acc.steps, { tile: n, inPort, outPort: null }],
        end: { type: 'buffer', id: n.endButton?.id || n._key },
      });
      return;
    }

    const exits = n.type === 'point' && inPort === n.toe
      ? [n.straight, n.diverge]
      : def.exits(n, inPort, { position: n.type === 'point' ? (inPort === n.straight ? '+' : '-') : '+' });

    for (const op of exits) {
      // Przebieg nie zmienia kierunku jazdy (brak „zawracania” przez drabinę rozjazdów)
      const h = heading(op);
      if (h && acc.heading && h !== acc.heading) continue;
      const points = [...acc.points];
      if (n.type === 'point') {
        const rp = def.requiredPosition(n, inPort, op);
        if (rp) points.push({ id: n.id, position: rp });
      }
      const steps = [...acc.steps, { tile: n, inPort, outPort: op }];
      const next = { ...acc, steps, points, sections };
      // Sygnalizator na granicy wyjścia z tej kostki kończy przebieg
      const sigs = this.signalsAt(n, op);
      const endSig = sigs.find((s) => (kind === 'train' ? s.kind === 'semafor' : true));
      if (endSig) {
        results.push({ ...next, end: { type: 'signal', id: endSig.id } });
        continue;
      }
      // Przycisk końca przebiegu na kostce (np. koniec toru manewrowego)
      if (n.endButton && kind === 'shunt' && !this.exitAt(n, op)) {
        results.push({ ...next, end: { type: 'endButton', id: n.endButton.id } });
        continue;
      }
      const v = new Set(visited); v.add(n._key);
      this.#explore(n, op, kind, next, results, v);
    }
  }

  /**
   * Zwrotnice ochrony bocznej dla przebiegu: zwrotnice spoza drogi przebiegu,
   * które stykają się z odcinkami drogi przebiegu, ustawiane „od” przebiegu.
   * Zwraca [{id, position}].
   */
  flankProtection(path) {
    const inRoute = new Set(path.points.map((p) => p.id));
    const routeTiles = new Set(path.steps.map((s) => s.tile._key));
    const flank = [];
    for (const step of path.steps) {
      const t = step.tile;
      // Kostka startowa: tył (za semaforem początkowym) osłania sam semafor – z tej strony
      // wjeżdża pociąg, dla którego przebieg jest nastawiany, nie szukamy tam ochrony bocznej.
      const rear = step.inPort === null && path.startSignal
        ? new Set(t._def.ports(t).filter((p) => p !== step.outPort && heading(p) !== path.startSignal.dir))
        : null;
      for (const p of t._def.ports(t)) {
        if (p === step.inPort || p === step.outPort || rear?.has(p)) continue;
        // Port kostki nieużywany w przebiegu – z niego może „wjechać” coś z boku
        const nb = this.neighbour(t, p);
        if (!nb || routeTiles.has(nb.tile._key)) continue;
        const flankPoint = this.#findFlankPoint(nb.tile, nb.inPort, new Set());
        if (flankPoint && !inRoute.has(flankPoint.id) && !flank.some((f) => f.id === flankPoint.id)) {
          flank.push(flankPoint);
        }
      }
      // Kostka zwrotnicowa w przebiegu: sąsiad przez nieużywany leg
      if (t.type === 'point' && step.inPort === t.toe) {
        // jedziemy z ostrza – drugi leg jest odcięty położeniem zwrotnicy, brak dodatkowej ochrony
      }
    }
    return flank;
  }

  /** Szukaj najbliższej zwrotnicy, do której wjeżdżamy z ostrza lub legu – jako ochrony bocznej. */
  #findFlankPoint(tile, inPort, visited) {
    if (visited.has(tile._key)) return null;
    visited.add(tile._key);
    if (tile.type === 'point') {
      // Wjeżdżamy z legu -> zwrotnica ma być ustawiona na drugi leg (od nas)
      if (inPort === tile.straight) return { id: tile.id, position: '-' };
      if (inPort === tile.diverge) return { id: tile.id, position: '+' };
      return null; // wjazd z ostrza – nie da się „odciąć”
    }
    if (tile.type === 'buffer') return null;
    const ex = tile._def.exits(tile, inPort, null);
    if (ex.length !== 1) return null;
    const nb = this.neighbour(tile, ex[0]);
    if (!nb) return null;
    // Nie przechodzimy przez sygnalizatory ani dalej niż 3 kostki
    if (visited.size > 3) return null;
    return this.#findFlankPoint(nb.tile, nb.inPort, visited);
  }

  /** Wykolejnice na kostkach przebiegu (muszą być zdjęte) i sąsiadujące (muszą być nałożone). */
  derailersFor(path) {
    const onRoute = [];
    for (const s of path.steps) if (s.tile.derailer) onRoute.push({ id: s.tile.derailer, position: 'off' });
    const protect = [];
    const routeTiles = new Set(path.steps.map((s) => s.tile._key));
    for (const step of path.steps) {
      const t = step.tile;
      // Kostka startowa: tył (za semaforem początkowym) osłania sam semafor – z tej strony
      // wjeżdża pociąg, dla którego przebieg jest nastawiany, nie szukamy tam ochrony bocznej.
      const rear = step.inPort === null && path.startSignal
        ? new Set(t._def.ports(t).filter((p) => p !== step.outPort && heading(p) !== path.startSignal.dir))
        : null;
      for (const p of t._def.ports(t)) {
        if (p === step.inPort || p === step.outPort || rear?.has(p)) continue;
        const nb = this.neighbour(t, p);
        if (!nb || routeTiles.has(nb.tile._key)) continue;
        const d = this.#findDerailer(nb.tile, nb.inPort, new Set());
        if (d && !protect.some((x) => x.id === d)) protect.push({ id: d, position: 'on' });
      }
    }
    return { onRoute, protect };
  }

  #findDerailer(tile, inPort, visited) {
    if (visited.has(tile._key) || visited.size > 4) return null;
    visited.add(tile._key);
    if (tile.derailer) return tile.derailer;
    if (tile.type === 'point' && inPort === tile.toe) return null;
    const ex = tile._def.exits(tile, inPort, null);
    if (ex.length !== 1) return null;
    const nb = this.neighbour(tile, ex[0]);
    return nb ? this.#findDerailer(nb.tile, nb.inPort, visited) : null;
  }

  /** Odcinek bezpośrednio przed sygnalizatorem (odcinek zbliżania). */
  approachSection(sig) {
    const start = this.trackAt(sig.at.x, sig.at.y);
    return start ? start.section : null;
  }

  /** Odcinek(i) drogi ochronnej za sygnalizatorem końcowym. */
  overlapSections(sig, positions = {}) {
    const start = this.trackAt(sig.at.x, sig.at.y);
    if (!start) return [];
    const outPorts = start._def.ports(start).filter((p) => heading(p) === sig.dir);
    const secs = new Set();
    for (const op of outPorts) {
      if (this.exitAt(start, op)) continue;
      const nb = this.neighbour(start, op);
      if (nb && nb.tile.section !== start.section) secs.add(nb.tile.section);
      else if (nb) {
        // ten sam odcinek – idź dalej jeden krok
        const st = this.step(nb.tile, nb.inPort, positions);
        if (st.next && st.next.tile.section !== start.section) secs.add(st.next.tile.section);
      }
    }
    return [...secs];
  }
}
