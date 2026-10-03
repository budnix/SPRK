import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/model/Simulation.js';
import { POINT_SWITCH_TIME } from '../src/model/Interlocking.js';
import { STATIONS } from '../src/stations/index.js';
import sopot from '../src/stations/sopot.js';
import { run, setRoutes, routeViews } from './helpers.js';

/* Dwa przebiegi manewrowe z przeciwnych stron na ten sam tor stacyjny nie są sprzeczne (Ie-4 §43 ust. 5) – sprzeczne są
   dopiero na odcinkach między rozjazdami tej samej głowicy. Tor docelowy jest wtedy wspólny dla obu przebiegów. */

/** Pary przebiegów manewrowych, których jedynym wspólnym odcinkiem jest tor stacyjny – ostatni odcinek obu. */
function sharedPairs(ilk) {
  const rs = ilk.routeList().filter((r) => r.kind === 'shunt' && r.sections.length > 1);
  const out = [];
  for (const a of rs) for (const b of rs) {
    if (a.id >= b.id || a.start === b.start || a.sections.at(-1) !== b.sections.at(-1)) continue;
    const common = a.sections.filter((s) => b.sections.includes(s));
    if (common.length === 1 && ilk.sections.get(common[0]).kind === 'station') out.push([a, b, common[0]]);
  }
  return out;
}

const pointsAgree = (a, b) => {
  const pos = new Map([...a.points, ...a.flank].map((p) => [p.id, p.position]));
  return [...b.points, ...b.flank].every((p) => !pos.has(p.id) || pos.get(p.id) === p.position);
};

test('każda para przebiegów manewrowych z przeciwnych stron na ten sam tor stacyjny daje się nastawić razem (wszystkie stacje)', () => {
  let pairs = 0;
  for (const st of STATIONS) {
    const base = new Simulation(st, { disruptions: 'none', scenario: { id: 't', name: 't', tasks: [], timetable: [], endTime: '09:00' } });
    for (const [a, b, track] of sharedPairs(base.ilk)) {
      if (!pointsAgree(a, b)) continue;
      for (const [r1, r2] of [[a, b], [b, a]]) {
        const sim = new Simulation(st, { disruptions: 'none', scenario: { id: 't', name: 't', tasks: [], timetable: [], endTime: '09:00' } });
        assert.ok(sim.ilk.setRoute(r1.id).ok, `${st.id}: ${r1.id}`);
        run(sim, POINT_SWITCH_TIME + 1);
        const res = sim.ilk.setRoute(r2.id);
        assert.ok(res.ok, `${st.id}: ${r1.id} + ${r2.id} na tor ${track}: ${res.reason}`);
        run(sim, POINT_SWITCH_TIME + 1);
        assert.ok(sim.ilk.routeIsSet(r1.id) && sim.ilk.routeIsSet(r2.id), `${st.id}: ${r1.id} + ${r2.id}`);
        // poza torem docelowym żaden odcinek nie jest utwierdzony w dwóch przebiegach
        const owners = new Map();
        for (const act of routeViews(sim.ilk)) for (const s of act.sections) {
          if (s === track) continue;
          assert.ok(!owners.has(s), `${st.id}: odcinek ${s} utwierdzony podwójnie`);
          owners.set(s, act.id);
        }
        assert.equal(sim.ilk.sections.get(track).route, r1.id, 'tor docelowy zostaje utwierdzony');
        // zwolnienie pierwszego przebiegu: tor trzyma drugi; zwolnienie drugiego: tor wolny
        assert.ok(sim.ilk.releaseRoute(r1.start, false).ok);
        run(sim, 1);
        assert.equal(sim.ilk.routeIsSet(r1.id), false);
        assert.equal(sim.ilk.sections.get(track).route, r2.id, `${st.id}: tor ${track} nadal utwierdzony w ${r2.id}`);
        assert.ok(sim.ilk.releaseRoute(r2.start, false).ok);
        run(sim, 1);
        assert.equal(sim.ilk.sections.get(track).route, null);
        pairs++;
      }
    }
  }
  assert.ok(pairs >= 100, `sprawdzono ${pairs} par`);
});

test('wspólny tor docelowy dotyczy tylko dwóch przebiegów manewrowych: przebieg pociągowy na ten tor i manewr przez ten tor są sprzeczne', () => {
  const sim = new Simulation(sopot, { disruptions: 'none', scenario: { id: 't', name: 't', tasks: [], timetable: [], endTime: '09:00' } });
  const ilk = sim.ilk;
  assert.ok(ilk.setRoute('H-Om').ok); run(sim, POINT_SWITCH_TIME + 1);
  assert.ok(ilk.setRoute('Tm11-M').ok); run(sim, POINT_SWITCH_TIME + 1);
  const track = ilk.routes.get('H-Om').sections.at(-1);
  // pociągowy na ten tor albo przez niego – odmowa (tor utwierdzony w manewrowych)
  const trains = ilk.routeList().filter((r) => r.kind === 'train' && r.sections.includes(track));
  assert.ok(trains.length > 0);
  for (const r of trains) assert.ok(ilk.checkRoute(r).some((m) => m.includes(`Odcinek ${track} utwierdzony`)), r.id);
  // manewrowy, dla którego ten tor nie jest ostatnim odcinkiem (jedzie dalej) – też odmowa
  const through = ilk.routeList().filter((r) => r.kind === 'shunt' && r.sections.includes(track) && r.sections.at(-1) !== track);
  for (const r of through) assert.ok(ilk.checkRoute(r).length > 0, r.id);
  // po zwolnieniu jednego manewrowego tor dalej trzyma drugi – pociągowy nadal nie wejdzie
  assert.ok(ilk.releaseRoute('H', false).ok); run(sim, 1);
  for (const r of trains) assert.ok(ilk.checkRoute(r).some((m) => m.includes(`Odcinek ${track} utwierdzony`)), `${r.id} po zwolnieniu H-Om`);
  // odwrotnie: tor utwierdzony w przebiegu pociągowym nie jest celem manewru
  const t = new Simulation(sopot, { disruptions: 'none', scenario: { id: 't', name: 't', tasks: [], timetable: [], endTime: '09:00' } });
  const train = trains.find((r) => t.ilk.checkRoute(r).length === 0);
  if (train) {
    assert.ok(t.ilk.setRoute(train.id).ok); run(t, POINT_SWITCH_TIME + 1);
    assert.ok(t.ilk.routeIsSet(train.id));
    assert.equal(t.ilk.setRoute('Tm11-M').ok, false, 'manewr na tor utwierdzony w przebiegu pociągowym');
  }
});

/** Przedziały zajęte przez skład na kostkach (współrzędna od pierwszego portu kostki). */
function spans(tr) {
  const out = [];
  for (const seg of tr.trail) {
    if (!seg.tile) continue;
    const a = Math.max(0, tr.tail - seg.start), b = Math.min(seg.len, tr.head - seg.start);
    if (a >= b) continue;
    const p0 = seg.tile._def.ports(seg.tile)[0];
    out.push({ tile: seg.tile, from: seg.inPort === p0 ? a : seg.len - b, to: seg.inPort === p0 ? b : seg.len - a });
  }
  return out;
}

test('dwa składy manewrowe wjeżdżają z przeciwnych stron na ten sam tor: każdy przebieg rozwiązuje się po swoim składzie, składy stają bez najechania', () => {
  const sim = new Simulation(sopot, { disruptions: 'none', scenario: { id: 't', name: 't', tasks: [], endTime: '09:00', timetable: [
    { nr: 1, kind: 'os', name: 'od zachodu', from: null, to: null, dep: '09:00', track: '2', stop: true, terminates: true, length: 130, vmax: 60, startOn: { section: 'T2a', dir: 'E' } },
    { nr: 2, kind: 'os', name: 'od wschodu', from: null, to: null, dep: '09:00', track: '2', stop: true, terminates: true, length: 50, vmax: 60, startOn: { section: 'E1e', dir: 'W' } },
  ] } });
  const ilk = sim.ilk;
  sim.step(0.5);
  assert.ok(sim.traffic.toShunting(1)); assert.ok(sim.traffic.toShunting(2));
  assert.ok(ilk.setRoute('H-Om').ok);
  assert.ok(ilk.setRoute('Tm11-M').ok, 'drugi przebieg manewrowy na ten sam tor');
  const a = sim.traffic.trains.find((t) => t.nr === 1), b = sim.traffic.trains.find((t) => t.nr === 2);
  const track = ilk.routes.get('H-Om').sections.at(-1);
  let bothSet = false, early = null;
  for (let i = 0; i < 2400; i++) {
    sim.step(0.5);
    if (ilk.routeIsSet('H-Om') && ilk.routeIsSet('Tm11-M')) bothSet = true;
    // przebieg nie rozwiązuje się od cudzego składu: dopóki własny skład nie wjechał w przebieg, przebieg trwa z sygnałem
    for (const [id, tr] of [['H-Om', a], ['Tm11-M', b]]) {
      const act = ilk.routeIsSet(id);
      const entered = ilk.routes.get(id).sections.some((s) => tr.occupiedSections().has(s));
      if (bothSet && !entered && tr.v === 0 && !act && !early && !tr.occupiedSections().has(track)) early = id;
    }
    for (const x of spans(a)) for (const y of spans(b)) if (x.tile === y.tile) assert.ok(x.to <= y.from || y.to <= x.from, `najechanie na kostce ${x.tile.x},${x.tile.y}`);
    if (!setRoutes(ilk).length && a.v === 0 && b.v === 0 && i > 60) break;
  }
  assert.ok(bothSet, 'oba przebiegi były utwierdzone jednocześnie');
  assert.equal(early, null, `przebieg ${early} rozwiązał się, zanim wjechał w niego własny skład`);
  assert.ok(a.occupiedSections().has(track) && b.occupiedSections().has(track), 'oba składy stoją na torze docelowym');
  assert.equal(setRoutes(ilk).length, 0, `przebiegi rozwiązane (${setRoutes(ilk)})`);
  assert.equal(ilk.sections.get(track).route, null);
  assert.equal(a.v, 0); assert.equal(b.v, 0);
});
