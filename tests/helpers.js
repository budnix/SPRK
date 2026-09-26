import { Simulation } from '../src/model/Simulation.js';
import station from '../src/stations/stare-pustkowie.js';
import { Clock } from '../src/core/Clock.js';

export function makeSim(opts = {}) {
  const sim = new Simulation(station, { speed: 1, ...opts });
  return sim;
}

/** Przesuwa symulację o `seconds` sekund czasu symulacji. */
export function run(sim, seconds, each) {
  const steps = Math.ceil(seconds / 0.5);
  for (let i = 0; i < steps; i++) { sim.step(0.5); if (each) each(sim); }
}

export { Clock, station };

/**
 * Uniwersalny dyżurny automatyczny (dla dowolnej stacji):
 * pozwolenia i Ko, zapowiadanie telefoniczne przy usterce, przebiegi wjazdowe na tor planowy
 * (lub zadany przez `trackFor`), przebiegi wyjazdowe, zadania manewrowe, przekazane składy.
 */
export function autoDispatch(sim, trackFor = (e) => e.track) {
  const ilk = sim.ilk, topo = ilk.topo;
  const routes = ilk.routeList();
  const trackOf = (tr) => { for (const sid of tr.occupiedSections()) { const t = ilk.sections.get(sid)?.track; if (t) return String(t); } return null; };
  const fullyOn = (tr, track) => { const secs = [...tr.occupiedSections()].map((s) => ilk.sections.get(s)); return secs.length && secs.every((s) => String(s.track) === String(track)); };
  const routeTrack = (r) => {
    const last = r.sections[r.sections.length - 1];
    const t = last ? ilk.sections.get(last)?.track : null;
    if (t) return String(t);
    if (r.end.type === 'signal') { const sg = topo.signals.get(r.end.id); return String(topo.trackAt(sg.at.x, sg.at.y)?.section ? ilk.sections.get(topo.trackAt(sg.at.x, sg.at.y).section).track : ''); }
    return null;
  };
  const approachOf = (exitId) => { const e = sim.station.exits[exitId]; return topo.trackAt(e.tile.x, e.tile.y).section; };

  for (const b of sim.blocks.values()) {
    if (b.fault) {
      if (b.phone.askedByThem) sim.comms.send('free', { exit: b.id, nr: b.phone.askedByThem });
      if (b.koPending && String(b.phone.arrivalConfirmed) !== String(b.phone.arrivedTrain)) sim.comms.send('arrived', { exit: b.id, nr: b.phone.arrivedTrain });
      if (b.koPending && String(b.phone.arrivalConfirmed) === String(b.phone.arrivedTrain)) b.press('dKo');
      if (b.poBlocked && String(b.phone.arrivalConfirmed) === String(b.phone.departedTrain)) { if (!b.phone.departedReported) sim.comms.send('departed', { exit: b.id, nr: b.phone.departedTrain }); b.press('dPo'); }
      continue;
    }
    if (b.request === 'theirs') b.press('Poz');
    if (b.koPending) b.press('Ko');
  }

  for (const e of sim.traffic.timetable()) {
    const tr = e.train;
    if (!tr || tr.finished) continue;
    // wjazd
    if (e.from && !e.entryRouteSet) {
      const app = approachOf(e.from);
      const want = trackFor(e);
      const cands = routes.filter((r) => r.kind === 'train' && r.approach === app);
      const pick = cands.find((r) => routeTrack(r) === String(want)) || cands.find((r) => ilk.sections.get(r.sections.at(-1))?.platform) || cands[0];
      if (pick && ilk.setRoute(pick.id).ok) e.entryRouteSet = true;
      continue;
    }
    // zadania manewrowe dla tego składu
    const task = (sim.traffic.tasks || []).find((t) => !t.done && !t.failed && sim.clock.time >= t.afterTime && (String(t.unit) === String(e.nr) || String(t.unit) === String(e.unit)));
    if (task && tr.entered && tr.v === 0) {
      if (fullyOn(tr, task.toTrack)) continue;
      if (tr.mode !== 'shunt') sim.traffic.toShunting(e.nr);
      const next = tr.nextSignal();
      const occ = tr.occupiedSections();
      const head = ['E', 'NE', 'SE'].includes(tr.direction) ? 'E' : 'W';
      // droga manewrowa: od sygnalizatora przed czołem lub od sygnalizatora, za którym tabor stoi (w jego odcinku zbliżania)
      const usable = routes.filter((x) => x.kind === 'shunt' && topo.signals.get(x.start).dir === head && (x.start === next || occ.has(x.approach)));
      const isSet = (x) => ilk.active.has(x.id) || ilk.pending.some((p) => p.route.id === x.id);
      const r = usable.find((x) => routeTrack(x) === String(task.toTrack) && !isSet(x));
      const activeShunt = usable.some(isSet);
      if (r) ilk.setRoute(r.id);
      else if (!activeShunt) sim.traffic.reverseTrain(e.nr); // brak drogi manewrowej w tym kierunku – zmiana czoła
      continue;
    }
    // wyjazd
    if (e.to && tr.entered && !e.exitRouteSet && (tr.hasStopped || !e.stop)) {
      if (tr.mode === 'shunt') { if (tr.v === 0) sim.traffic.toTrainMode(e.nr); continue; }
      const cur = trackOf(tr);
      const b = sim.blocks.get(e.to);
      let cands = routes.filter((r) => r.kind === 'train' && r.exit === e.to && String(ilk.sections.get(r.approach)?.track) === String(cur));
      if (!cands.length) continue; // z tego toru nie ma wyjazdu – najpierw zadanie manewrowe
      if (e.unit && tr.v === 0) {
        // skład przekazany: musi stać czołem do semafora wyjazdowego
        const ahead = tr.nextSignal();
        const facing = cands.filter((r) => r.start === ahead);
        if (!facing.length) { sim.traffic.reverseTrain(e.nr); continue; }
        cands = facing;
      }
      if (b.fault) { if (!b.phone.permissionFor && !b.neighbourReply && !b.occupied) sim.comms.send('ask-free', { exit: e.to, nr: e.nr }); }
      else if (!b.fixed && !b.direction && !b.request && !b.occupied) b.press('Wbl');
      if (b.gate().ok) { for (const r of cands) if (ilk.setRoute(r.id).ok) { e.exitRouteSet = true; break; } }
    }
  }
}
