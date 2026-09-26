import { Clock } from '../core/Clock.js';

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

  tick() {
    const sim = this.sim;
    const t = sim.clock.time;
    if (t - this.lastAction < this.delay) return;
    this.lastAction = t;
    const ilk = sim.ilk, topo = ilk.topo;
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
      if (b.fault) {
        if (b.phone.askedByThem && this.#mayAccept(b)) sim.comms.send('free', { exit: b.id, nr: b.phone.askedByThem }, { silent: true });
        if (b.koPending && String(b.phone.arrivalConfirmed) !== String(b.phone.arrivedTrain)) sim.comms.send('arrived', { exit: b.id, nr: b.phone.arrivedTrain }, { silent: true });
        if (b.koPending && String(b.phone.arrivalConfirmed) === String(b.phone.arrivedTrain)) b.press('dKo');
        if (b.poBlocked && String(b.phone.arrivalConfirmed) === String(b.phone.departedTrain)) { if (!b.phone.departedReported) sim.comms.send('departed', { exit: b.id, nr: b.phone.departedTrain }, { silent: true }); b.press('dPo'); }
        continue;
      }
      if (b.request === 'theirs' && this.#mayAccept(b)) b.press('Poz');
      if (b.koPending) b.press('Ko');
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

      // ---- wjazd ----
      if (e.from && !e.entryRouteSet && this.#exitInDistrict(e.from)) {
        let want = this.trackFor ? this.trackFor(e) : e.track;
        if (this.role === 'executive') { const c = this.#command(e, 'accept'); if (!c) continue; want = c.track; e._cmdAccept = c; }
        const app = approachOf(e.from);
        const cands = routes.filter((r) => r.kind === 'train' && r.approach === app);
        const pick = cands.find((r) => routeTrack(r) === String(want)) || cands.find((r) => ilk.sections.get(r.sections.at(-1))?.platform) || cands[0];
        if (pick && ilk.setRoute(pick.id).ok) {
          e.entryRouteSet = true;
          if (e._cmdAccept) this.#complete(e._cmdAccept, `Droga przebiegu dla pociągu nr ${e.nr} na tor ${want} przygotowana, semafor ${pick.start} otwarty.`);
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
        const free = usable.filter((x) => !isSet(x));
        const r = free.find((x) => routeTrack(x) === String(task.toTrack))
          || free.filter(leadsTo).sort((a, b) => a.sections.length - b.sections.length)[0];
        if (r) ilk.setRoute(r.id);
        else if (!usable.some(isSet)) sim.traffic.reverseTrain(e.nr);
        continue;
      }
      // ---- wyjazd ----
      if (e.to && tr.entered && !e.exitRouteSet && (tr.hasStopped || !e.stop) && this.#exitInDistrict(e.to)) {
        let exitId = e.to;
        let cmd = null;
        if (this.role === 'executive') { cmd = this.#command(e, 'dispatch'); if (!cmd) continue; exitId = cmd.exit || e.to; }
        if (tr.mode === 'shunt') { if (tr.v === 0) sim.traffic.toTrainMode(e.nr); continue; }
        const cur = trackOf(tr);
        const b = sim.blocks.get(exitId);
        if (!b) continue;
        let cands = routes.filter((r) => r.kind === 'train' && r.exit === exitId && String(ilk.sections.get(r.approach)?.track) === String(cur));
        if (!cands.length) continue;
        if (e.unit && tr.v === 0) {
          const ahead = tr.nextSignal();
          const facing = cands.filter((r) => r.start === ahead);
          if (!facing.length) { sim.traffic.reverseTrain(e.nr); continue; }
          cands = facing;
        }
        if (b.fault) { if (!b.phone.permissionFor && !b.neighbourReply && !b.occupied) sim.comms.send('ask-free', { exit: exitId, nr: e.nr }, { silent: true }); }
        else if (!b.fixed && !b.direction && !b.request && !b.occupied) b.press('Wbl');
        if (b.gate().ok) {
          for (const r of cands) if (ilk.setRoute(r.id).ok) {
            e.exitRouteSet = true;
            if (cmd) this.#complete(cmd, `Droga przebiegu dla pociągu nr ${e.nr} do ${b.neighbour} przygotowana, semafor ${r.start} otwarty.`);
            break;
          }
        }
      }
    }
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
