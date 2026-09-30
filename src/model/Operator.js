import { Clock } from '../core/Clock.js';
import { Interlocking } from './Interlocking.js';

/**
 * Automatyczny operator okręgu nastawczego (nastawniczy / dyżurny ruchu sterowany przez program).
 *
 * Obsługuje w swoim okręgu: pozwolenia i bloki końcowe, zapowiadanie telefoniczne przy usterce,
 * przebiegi wjazdowe i wyjazdowe, zadania manewrowe, składy przekazane.
 *
 * Tryby:
 *  - `district: null`      – cała stacja (dyżurny automatyczny, używany w testach),
 *  - `role: 'executive'`   – nastawnia wykonawcza: wykonuje tylko polecenia dyżurnego (gracza) z `sim.commands`,
 *  - `role: 'dispatcher'`  – dyżurny dysponujący (automat): sam decyduje w swoim okręgu i wydaje polecenia graczowi
 *                            (nastawni wykonawczej) dla ruchu w jego okręgu.
 */
export class AutoOperator {
  constructor(sim, { district = null, role = 'full', playerDistrict = null, delay = 0, trackFor = null } = {}) {
    this.sim = sim;
    this.trackFor = trackFor;      // opcjonalny wybór toru wjazdu (testy)
    this.district = district;
    this.role = role;
    this.playerDistrict = playerDistrict;
    this.delay = delay;            // opóźnienie reakcji (s) – realizm
    this.lastAction = -Infinity;
    this.issued = new Set();       // polecenia wydane graczowi (klucze)
    this.stuckSince = new Map();   // przebieg, który nie rozwiązał się za pociągiem → od kiedy
  }

  #inDistrict(signalId) {
    if (!this.district) return true;
    return this.sim.districtOf(signalId) === this.district;
  }

  #exitInDistrict(exitId) {
    if (!this.district) return true;
    return this.sim.exitDistrict(exitId) === this.district;
  }

  /** Polecenie gracza (tryb wykonawczy) dla pociągu: { kind: 'accept', track } lub { kind: 'dispatch', exit }. */
  #command(e, kind) {
    return (this.sim.commands || []).find((c) => String(c.nr) === String(e.nr) && c.kind === kind && c.status === 'pending');
  }

  #complete(cmd, msg) {
    if (this.sim.playerDistrict === this.district) return; // operator zastępuje gracza (testy): wykonanie wykrywa symulacja
    cmd.status = 'done'; cmd.doneAt = this.sim.clock.time;
    this.sim.bus.emit('comms', { time: this.sim.clock.time, from: this.district, kind: 'info', text: msg });
    this.sim.bus.emit('commands', this.sim.commands);
  }

  /** Wydanie polecenia graczowi (tryb dyżurnego-automatu). */
  #order(e, kind, extra, text) {
    const key = `${e.nr}:${kind}`;
    if (this.issued.has(key)) return;
    this.issued.add(key);
    this.sim.issueCommand({ kind, nr: e.nr, ...extra, from: this.district, to: this.playerDistrict, text });
  }

  /**
   * Nastawienie przebiegu. Nastawnia mechaniczna (opcje zależności `manualPoints`, `manualSignal`, `routeBlock`):
   * najpierw dźwignie zwrotnic i wykolejnic (przebieg w następnym takcie), po zamknięciu przebiegu blok przebiegowy
   * i dźwignia sygnałowa.
   */
  #setRoute(id) {
    const ilk = this.sim.ilk;
    const res = ilk.setRoute(id);
    const levers = new Set(['point-position', 'derailer-position']);
    if (!res.ok && res.codes?.length && res.codes.every((c) => levers.has(c))) {
      const r = ilk.routes.get(id);
      for (const q of [...r.points, ...r.flank]) { const p = ilk.points.get(q.id); if (p.position !== q.position && !p.moving) ilk.switchPoint(q.id, q.position); }
      for (const q of [...r.derailers.onRoute, ...r.derailers.protect]) { const d = ilk.derailers.get(q.id); if (d && d.position !== q.position && !d.moving) ilk.switchDerailer(q.id, q.position); }
      return res;
    }
    if (res.ok && ilk.manualSignal) {
      const r = ilk.routes.get(id);
      if (ilk.routeBlock && r.kind === 'train') ilk.blockRoute(r.start);
      ilk.clearSignal(r.start);
    }
    return res;
  }

  /** Nastawnia mechaniczna: po przejeździe dźwignia sygnałowa na „Stój” i drążek w położenie zasadnicze. */
  #releasePassed() {
    const ilk = this.sim.ilk;
    for (const act of [...ilk.active.values()]) {
      if (!act.passed || !this.#inDistrict(act.route.start)) continue;
      ilk.cancelSignal(act.route.start);
      // blok niezwolniony przez pociąg (usterka) – zwalniacz
      if (!ilk.releaseRoute(act.route.start).ok && act.blocked) ilk.releaseRoute(act.route.start, true);
    }
  }

  /**
   * Przebiegi, które po usterce same nie wrócą do pracy (urządzenia przekaźnikowe i komputerowe):
   *  - semafor zgasł przed pociągiem, bo odcinek drogi przebiegu wykazał zajętość albo zwrotnica straciła kontrolę –
   *    sygnał sam nie wraca; automat zwalnia przebieg (Pz) i nastawia go od nowa, gdy droga będzie sprawna,
   *  - pociąg przejechał, a przebieg się nie rozwiązał (`Interlocking.routeStuck`) – doraźne zwolnienie po chwili.
   */
  #recoverRoutes() {
    const sim = this.sim, ilk = sim.ilk, t = sim.clock.time;
    if (ilk.manualSignal) return; // nastawnia mechaniczna: sygnał trzyma dźwignia, przebieg zwalnia drążek
    for (const id of this.stuckSince.keys()) if (!ilk.active.has(id)) this.stuckSince.delete(id);
    for (const act of [...ilk.active.values()]) {
      if (!this.#inDistrict(act.route.start) || act.timedRelease || ilk.signals.get(act.route.start).substitute) continue;
      if (!act.trainEntered) {
        if (act.route.kind === 'train' && act.signalOff && ilk.releaseRoute(act.route.start, false).ok) this.#forgetRoute(act.route);
        continue;
      }
      if (!ilk.routeStuck(act)) { this.stuckSince.delete(act.id); continue; }
      if (!this.stuckSince.has(act.id)) { this.stuckSince.set(act.id, t); continue; }
      if (t - this.stuckSince.get(act.id) >= 20) ilk.releaseRoute(act.route.start, true);
    }
  }

  /** Przebieg zwolniony przed pociągiem: pociąg, który na niego czekał, dostanie go od nowa. */
  #forgetRoute(route) {
    for (const e of this.sim.traffic.timetable()) {
      const tr = e.train;
      if (!tr || tr.finished || tr.nextSignal() !== route.start) continue;
      if (e.exitRouteSet && route.exit) e.exitRouteSet = false;
      // pierwszy stopień wyjazdu dwustopniowego – wyjazd zacznie się od nowa
      if (e._viaSignal && route.end.type === 'signal' && route.end.id === e._viaSignal) { e._viaSignal = null; continue; }
      // kolejny stopień wjazdu wieloetapowego (pociąg minął już semafor wjazdowy)
      if (e.from && !tr.entryPending && !route.exit) e._entryPath = [route.id, ...(e._entryPath || [])];
    }
  }

  tick() {
    const sim = this.sim;
    const t = sim.clock.time;
    if (t - this.lastAction < this.delay) return;
    this.lastAction = t;
    const ilk = sim.ilk, topo = ilk.topo;
    if (ilk.holdRoute) this.#releasePassed();
    this.#recoverRoutes();
    const routes = ilk.routeList();
    const trackOf = (tr) => { for (const sid of tr.occupiedSections()) { const tk = ilk.sections.get(sid)?.track; if (tk) return String(tk); } return null; };
    const fullyOn = (tr, track) => { const secs = [...tr.occupiedSections()].map((s) => ilk.sections.get(s)); return secs.length && secs.every((s) => String(s.track) === String(track)); };
    const routeTrack = (r) => {
      const last = r.sections[r.sections.length - 1];
      const tk = last ? ilk.sections.get(last)?.track : null;
      if (tk) return String(tk);
      if (r.end.type === 'signal') { const sg = topo.signals.get(r.end.id); const sec = topo.trackAt(sg.at.x, sg.at.y)?.section; return sec ? String(ilk.sections.get(sec).track ?? '') : null; }
      return null;
    };
    const approachOf = (exitId) => { const ex = sim.station.exits[exitId]; return topo.trackAt(ex.tile.x, ex.tile.y).section; };

    // ---- blokady w moim okręgu ----
    for (const b of sim.blocks.values()) {
      if (!this.#exitInDistrict(b.id)) continue;
      // pociąg wyprawiony bez sygnału zezwalającego (Sz, rozkaz, zapowiadanie) – doraźne zablokowanie bloku początkowego
      if (b.needPo) b.press('dPo');
      if (b.fault) {
        if (b.phone.askedByThem && this.#mayAccept(b)) sim.comms.send('free', { exit: b.id, nr: b.phone.askedByThem }, { silent: true });
        // przyjazd pociągu sąsiada: telefonogram zastępuje Ko
        if (b.koPending && String(b.phone.arrivalConfirmed) !== String(b.phone.arrivedTrain)) sim.comms.send('arrived', { exit: b.id, nr: b.phone.arrivedTrain }, { silent: true });
        if (b.phone.departedTrain && !b.phone.departedReported) sim.comms.send('departed', { exit: b.id, nr: b.phone.departedTrain }, { silent: true });
        continue;
      }
      // prośba sąsiada: Eap – pozwolenie (Poz), SBL – zgoda na zmianę kierunku (Zk)
      if (b.request === 'theirs' && this.#mayAccept(b)) {
        // tryb ręczny rozmów: automat też nadaje 4a przed Poz (kary za pominięcie nie mogą trafić do gracza)
        if (!b.auto && b.phoneRoutine === 'manual' && b.talk.theirAsk != null) sim.comms.send('free', { exit: b.id, nr: b.talk.theirAsk }, { silent: true });
        b.press(b.auto ? 'Zk' : 'Poz');
      }
      if (!b.fault && b.phoneRoutine === 'manual' && b.phone.departedTrain && !b.phone.departedReported) sim.comms.send('departed', { exit: b.id, nr: b.phone.departedTrain }, { silent: true });
      if (b.koPending) { if (!b.zpg && !b.koPrepared) b.press('dKo'); b.press('Ko'); }
    }

    for (const e of sim.traffic.timetable()) {
      const tr = e.train;
      // ---- dyżurny-automat wydaje polecenia graczowi (dla ruchu w okręgu gracza) ----
      if (this.role === 'dispatcher' && this.playerDistrict) {
        if (e.from && !e.dispatched && !tr && sim.exitDistrict(e.from) === this.playerDistrict && t >= e.requestAt - 60) {
          this.#order(e, 'accept', { track: e.track }, `Przyjąć pociąg nr ${e.nr} od ${sim.station.exits[e.from].name} na tor ${e.track}.`);
        }
        if (e.to && tr && !tr.finished && tr.entered && sim.exitDistrict(e.to) === this.playerDistrict && (tr.hasStopped || !e.stop || e.unit) && t >= (e.depTime ?? 0) - 6 * 60) {
          this.#order(e, 'dispatch', { exit: e.to }, `Wyprawić pociąg nr ${e.nr} z toru ${trackOf(tr) ?? e.track} do ${sim.station.exits[e.to].name} (${sim.station.exits[e.to].label || e.to}).`);
        }
      }
      if (!tr || tr.finished) continue;

      // ---- pociąg stanął za semaforem, który zgasł tuż przed nim: rozkaz pisemny na dalszą jazdę ----
      if (tr.stoppedAt?.kind === 'spad' && tr.v === 0 && this.#inDistrict(tr.stoppedAt.signal)) {
        sim.traffic.issueOrder({ nr: e.nr, signal: tr.stoppedAt.signal });
        continue;
      }

      // ---- wyjazd przy blokadzie bez łączności: przebieg nastawiony, semafor na „Stój” (pozwolenie u sąsiada) – Sz ----
      // pociąg ma wyjazd za sobą, gdy minął semafor wyjazdowy: zezwolenie na ten szlak albo – po Sz / rozkazie – brak
      // kolejnego semafora przed granicą stacji
      const leaving = tr.exitAuth != null && (tr.exitAuth !== '*' || !tr.nextSignal());
      if (e.to && sim.blocks.get(e.to)?.fault && tr.v === 0 && !leaving && (e.depTime == null || t >= e.depTime)) {
        const act = [...ilk.active.values()].find((a) => a.route.exit === e.to && a.route.kind === 'train' && !a.trainEntered);
        const sig = act && ilk.signals.get(act.route.start);
        if (sig && this.#inDistrict(sig.id) && tr.nextSignal() === sig.id && !Interlocking.isTrainProceed(sig.aspect)) ilk.substituteSignal(sig.id);
      }

      // ---- wjazd (kolejne stopnie przebiegu wieloetapowego, np. A → H → O) ----
      if (e._entryPath?.length) {
        if (this.#setRoute(e._entryPath[0]).ok) e._entryPath.shift();
        continue;
      }
      // ---- wjazd ----
      // Przebiegu wjazdowego potrzebuje pociąg, który nie minął jeszcze semafora wjazdowego (`entryPending`), i to ten,
      // który jedzie pierwszy: na szlaku z blokadą samoczynną jedzie ich kilka, a po opóźnieniach nie w kolejności
      // rozkładu. Przebieg nastawiony „dla” dalszego pociągu zabrałby go pierwszy – na cudzy tor – a automat czekałby
      // potem bez końca na wjazd, który już się odbył.
      if (e.from && tr.entryPending && this.#exitInDistrict(e.from)) {
        const ahead = sim.traffic.timetable().some((o) => o !== e && o.from === e.from && o.train && !o.train.finished && o.train.entryPending && o.train.head > tr.head);
        if (ahead) continue;
        let want = this.trackFor ? this.trackFor(e) : e.track;
        if (this.role === 'executive') { const c = this.#command(e, 'accept'); if (!c) continue; want = c.track; e._cmdAccept = c; }
        const app = approachOf(e.from);
        const cands = routes.filter((r) => r.kind === 'train' && r.approach === app);
        // przebieg od semafora wjazdowego już czeka na ten pociąg (nastawiony albo w nastawianiu)
        if (cands.some((r) => (ilk.active.has(r.id) && !ilk.active.get(r.id).trainEntered) || ilk.pending.some((p) => p.route.id === r.id))) continue;
        // Ścieżka przebiegów do toru docelowego (BFS po przebiegach pociągowych, do 3 stopni) – dla stacji,
        // na których tor peronowy leży za semaforem pośrednim (np. Sopot: A → H → O).
        const pathTo = (track) => {
          const queue = cands.map((r) => [r]);
          const seen = new Set();
          while (queue.length) {
            const path = queue.shift();
            const last = path[path.length - 1];
            if (routeTrack(last) === String(track) && ilk.sections.get(last.sections.at(-1))?.kind === 'station') return path;
            if (path.length >= 3 || last.end.type !== 'signal' || seen.has(last.end.id)) continue;
            seen.add(last.end.id);
            for (const r of routes) if (r.kind === 'train' && r.start === last.end.id && !r.exit) queue.push([...path, r]);
          }
          return null;
        };
        const path = pathTo(want);
        // kolejność prób: tor planowy, potem inne tory peronowe, na końcu pozostałe (np. tor planowy zamknięty)
        const rank = (r) => (routeTrack(r) === String(want) ? 0 : ilk.sections.get(r.sections.at(-1))?.platform ? 1 : 2);
        const order = [...(path ? [path[0]] : []), ...[...cands].sort((a, b) => rank(a) - rank(b)).filter((r) => r !== path?.[0])];
        // Krzyżowanie na szlaku jednotorowym: tor planowy zajmuje stojący pociąg, który odjedzie dopiero na szlak, z którego
        // ten pociąg nadjeżdża – żaden nie ruszy, dopóki ten nie wjedzie na inny tor
        const crossing = (r) => {
          const sid = r.sections.at(-1);
          return sim.traffic.timetable().some((o) => o !== e && o.to === e.from && o.train && !o.train.finished && o.train.v === 0 && o.train.occupiedSections().has(sid));
        };
        let closed = false;
        for (const pick of order) {
          const res = this.#setRoute(pick.id);
          // inny tor tylko przy torze zamkniętym albo przy krzyżowaniu; chwilowo zajęty/utwierdzony tor planowy – czekać
          if (!res.ok) { if (res.codes?.includes('section-closed') || crossing(pick)) closed = true; if (closed) continue; break; }
          if (path && pick === path[0] && path.length > 1) e._entryPath = path.slice(1).map((r) => r.id);
          if (e._cmdAccept) this.#complete(e._cmdAccept, `Droga przebiegu dla pociągu nr ${e.nr} na tor ${routeTrack(pick) ?? want} przygotowana, semafor ${pick.start} otwarty.`);
          break;
        }
        continue;
      }
      // ---- zadania manewrowe (tylko operator całej stacji) ----
      const task = !this.district ? (sim.traffic.tasks || []).find((x) => !x.done && !x.failed && t >= x.afterTime && (String(x.unit) === String(e.nr) || String(x.unit) === String(e.unit))) : null;
      if (task && tr.entered && tr.v === 0) {
        if (fullyOn(tr, task.toTrack)) continue;
        if (tr.mode !== 'shunt') sim.traffic.toShunting(e.nr);
        const next = tr.nextSignal();
        const occ = tr.occupiedSections();
        const head = ['E', 'NE', 'SE'].includes(tr.direction) ? 'E' : 'W';
        const usable = routes.filter((x) => x.kind === 'shunt' && topo.signals.get(x.start).dir === head && (x.start === next || occ.has(x.approach)));
        const isSet = (x) => ilk.active.has(x.id) || ilk.pending.some((p) => p.route.id === x.id);
        // Przebieg wprost na tor docelowy; gdy go nie ma – przebieg do tarczy, spod której (po zmianie
        // kierunku) tor docelowy jest osiągalny (manewr „za rozjazdy i z powrotem”).
        const opposite = (sigId) => { const s = topo.signals.get(sigId); return [...topo.signals.values()].find((o) => o.kind === 'tm' && o.at.x === s.at.x && o.at.y === s.at.y && o.dir !== s.dir); };
        const leadsTo = (x) => { if (x.end.type !== 'signal') return false; const o = opposite(x.end.id); return !!o && routes.some((y) => y.kind === 'shunt' && y.start === o.id && routeTrack(y) === String(task.toTrack)); };
        const free = usable.filter((x) => !isSet(x) && !x.sections.some((sid) => ilk.sections.get(sid).occupied && !occ.has(sid)));
        const r = free.find((x) => routeTrack(x) === String(task.toTrack))
          || free.filter(leadsTo).sort((a, b) => a.sections.length - b.sections.length)[0];
        if (r) this.#setRoute(r.id);
        else if (!usable.some(isSet)) sim.traffic.reverseTrain(e.nr);
        continue;
      }
      // skład po manewrach (bez zadań) wraca w tryb jazdy pociągowej – dopiero wtedy przejmie go pociąg powrotny
      if (!task && !e.to && tr.mode === 'shunt' && tr.v === 0 && sim.traffic.timetable().some((x) => String(x.unit) === String(e.nr))) { sim.traffic.toTrainMode(e.nr); continue; }
      // ---- wyjazd ----
      // Pozwolenie na wyjazd (Wbl) na szlak dwukierunkowy zawczasu – 6 min przed planowym odjazdem, gdy pociąg już jedzie
      // do nas albo stoi na stacji: kto pierwszy zażąda kierunku, ten go dostaje, a sąsiad z pociągiem w tę stronę poczeka
      if (e.to && tr && !tr.finished && e.actualDep == null && e.depTime != null && t >= e.depTime - 6 * 60 && this.#exitInDistrict(e.to) && this.role !== 'executive') {
        const b = sim.blocks.get(e.to);
        if (b && b.fault) { if (!b.auto && !b.fixed && !b.phone.permissionFor && !b.neighbourReply && !b.occupied) sim.comms.send('ask-free', { exit: e.to, nr: e.nr }, { silent: true }); }
        else if (b && !b.auto && !b.fixed && !b.direction && !b.request && !b.occupied && !b.koPending) this.#wbl(b, e.nr);
      }
      // Wyjazd: przebieg nastawiany dopiero na ~2 min przed planowym odjazdem (nie blokować głowicy stojącym składem)
      // Czy wyjazd jest już nastawiony, wynika ze stanu urządzeń, a nie z notatek automatu: przebieg w nastawianiu może
      // przepaść (zwrotnica bez kontroli), a nastawiony – zostać zwolniony po usterce. Pociąg ma wyjazd za sobą, gdy minął
      // semafor wyjazdowy (`leaving`).
      if (e.to && tr.entered && !leaving && (tr.hasStopped || !e.stop) && (e.depTime == null || t >= e.depTime - 120) && this.#exitInDistrict(e.to)) {
        let exitId = e.to;
        let cmd = null;
        if (this.role === 'executive') { cmd = this.#command(e, 'dispatch'); if (!cmd) continue; exitId = cmd.exit || e.to; }
        if (tr.mode === 'shunt') { if (tr.v === 0) sim.traffic.toTrainMode(e.nr); continue; }
        const cur = trackOf(tr);
        const b = sim.blocks.get(exitId);
        if (!b) continue;
        let cands = routes.filter((r) => r.kind === 'train' && r.exit === exitId && String(ilk.sections.get(r.approach)?.track) === String(cur));
        // Wyjazd dwustopniowy: brak przebiegu wprost na szlak – najpierw do semafora pośredniego (np. G502 → A502 → szlak),
        // potem od niego na szlak.
        let staged = false;
        const waiting = (pred) => [...ilk.active.values()].some((a) => !a.trainEntered && pred(a.route)) || ilk.pending.some((p) => pred(p.route));
        // pierwszy stopień wyjazdu przepadł, zanim pociąg ruszył – wyjazd zaczyna się od nowa
        if (e._viaSignal && tr.nextSignal() !== e._viaSignal && !waiting((r) => r.kind === 'train' && r.end.type === 'signal' && r.end.id === e._viaSignal)) e._viaSignal = null;
        if (e._viaSignal) cands = routes.filter((r) => r.kind === 'train' && r.exit === exitId && r.start === e._viaSignal);
        else if (!cands.length) {
          const toExit = new Set(routes.filter((r) => r.kind === 'train' && r.exit === exitId).map((r) => r.start));
          cands = routes.filter((r) => r.kind === 'train' && r.end.type === 'signal' && toExit.has(r.end.id) && String(ilk.sections.get(r.approach)?.track) === String(cur));
          staged = cands.length > 0;
        }
        if (!cands.length) continue;
        if (e.unit && tr.v === 0) {
          const ahead = tr.nextSignal();
          const facing = cands.filter((r) => r.start === ahead);
          if (!facing.length) { sim.traffic.reverseTrain(e.nr); continue; }
          cands = facing;
        }
        if (b.fault) { if (b.fixed !== 'out' && !b.phone.permissionFor && !b.neighbourReply && !b.occupied) sim.comms.send('ask-free', { exit: exitId, nr: e.nr }, { silent: true }); }
        else if (b.auto) { if (b.direction !== 'out' && b.request !== 'theirs' && !b.occupied && !b.poBlocked && !b.koPending) b.press('Zk'); }
        else if (!b.fixed && !b.direction && !b.request && !b.occupied) this.#wbl(b, e.nr);
        if (staged) {
          for (const r of cands) if (waiting((x) => x === r) || this.#setRoute(r.id).ok) { e._viaSignal = r.end.id; break; }
          continue;
        }
        if (waiting((r) => cands.includes(r))) continue; // przebieg wyjazdowy czeka na pociąg
        if (b.gate().ok) {
          for (const r of cands) if (this.#setRoute(r.id).ok) {
            e.exitRouteSet = true;
            if (cmd) this.#complete(cmd, `Droga przebiegu dla pociągu nr ${e.nr} do ${b.neighbour} przygotowana, semafor ${r.start} otwarty.`);
            break;
          }
        }
      }
    }
  }

  /** Wbl; w trybie ręcznym rozmów najpierw zapytanie 1a (automat nie może zostawić kary graczowi). */
  #wbl(b, nr) {
    if (b.phoneRoutine === 'manual' && String(b.talk.askedFor) !== String(nr)) this.sim.comms.send('ask-free', { exit: b.id, nr }, { silent: true });
    b.press('Wbl');
  }

  /** Czy nastawnia wykonawcza może dać pozwolenie sąsiadowi: tylko gdy dyżurny polecił przyjąć ten pociąg. */
  #mayAccept(b) {
    if (this.role !== 'executive') return true;
    const nr = b.request === 'theirs' ? this.#pendingArrivalNr(b) : b.phone.askedByThem;
    if (!nr) return false;
    return (this.sim.commands || []).some((c) => String(c.nr) === String(nr) && c.kind === 'accept' && c.status === 'pending');
  }

  #pendingArrivalNr(b) {
    const e = this.sim.traffic.timetable().find((x) => x.from === b.id && x.requested && !x.dispatched);
    return e?.nr ?? null;
  }
}
