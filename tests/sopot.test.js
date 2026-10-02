import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/model/Simulation.js';
import sopot from '../src/stations/sopot.js';
import { validateStation } from '../src/model/validate.js';
import { Clock } from '../src/core/Clock.js';
import { allArrived, play } from './helpers.js';

test('Sopot: definicja poprawna, brak urwanych torów, przebiegi zgodne z planem', () => {
  assert.deepEqual(validateStation(sopot).errors, []);
  const sim = new Simulation(sopot, { disruptions: 'none' });
  assert.equal(sim.ilk.topo.tracks.filter((t) => t._openPorts).length, 0, 'urwane porty toru');
  const ends = (start, kind = 'train') => new Set(sim.ilk.routeList().filter((r) => r.start === start && r.kind === kind).map((r) => r.end.id));
  // przejazd toru 202 to trzy przebiegi: A → H (tor 2a) → O (tor 2) → Orłowo; S → L (tor 1) → C (tor 1a) → Gdańsk
  assert.ok(ends('A').has('H') && ends('A').has('K') && ends('A').has('G'), 'A: tory 2a, 1a, 6');
  assert.ok(ends('B').has('K') && ends('B').has('H') && ends('B').has('J'), 'B: tory 1a, 2a, 4');
  assert.ok(ends('H').has('O') && ends('K').has('P') && ends('G').has('O') && ends('J').has('P'));
  assert.ok(ends('O').has('OR1') && ends('O').has('OR2') && ends('P').has('OR2') && !ends('P').has('OR1'), 'rozjazdy 41–45 tylko z toru górnego na dolny');
  assert.ok(ends('S').has('L') && ends('S').has('M') && ends('R').has('M') && !ends('R').has('L'));
  assert.ok(ends('L').has('C') && ends('L').has('D') && ends('M').has('E') && ends('M').has('F'));
  assert.ok(ends('C').has('GD2') && ends('C').has('GD1') && ends('E').has('GD1'));
  // SKM: wjazd od razu na tor peronowy, wyjazd wprost na szlak; tor 13 z L501, powrót spod Tm13
  assert.ok(ends('A501').has('R501') && ends('A501').has('R502') && ends('A502').has('R502'));
  assert.ok(ends('S502').has('L502') && ends('S501').has('L501') && ends('L502').has('GS2') && ends('R501').has('OS1'));
  assert.ok(ends('L501', 'shunt').has('kT13') && ends('Tm13', 'shunt').has('R501'));
  assert.ok(ends('F', 'shunt').has('kT6b') && ends('G', 'shunt').has('kT6a') && ends('D', 'shunt').has('kT4b') && ends('J', 'shunt').has('kT4a'));
  for (const r of sim.ilk.routeList()) {
    const sig = sim.ilk.signals.get(r.start);
    if (r.exit) assert.equal(sim.station.exits[r.exit].dir, sig.dir, `przebieg ${r.id} zawraca`);
  }
});

test('Sopot: pełna zmiana – przejazdy trzyprzebiegowe, odstawianie na tor 13 i tor 4, dwa składy przekazane', () => {
  const sim = new Simulation(sopot, { disruptions: 'none' });
  const end = Clock.parse('08:20');
  play(sim).until(end, { stop: allArrived, each: (_, { steps }) => {
    if (steps % 20 === 0) {
      const occ = new Map();
      for (const tr of sim.traffic.trains) {
        if (tr.finished) continue;
        for (const s of tr.occupiedSections()) { assert.ok(!occ.has(s) || occ.get(s) === tr.nr, `kolizja na ${s} (${occ.get(s)} i ${tr.nr})`); occ.set(s, tr.nr); }
      }
    }
  } });
  const tt = sim.traffic.timetable();
  assert.equal(tt.length, 29);
  for (const e of tt) {
    if (e.terminates) { assert.ok(e.status.startsWith('przekazany'), `${e.nr}: ${e.status}`); continue; }
    assert.equal(e.status, 'na następnym posterunku', `${e.nr}: ${e.status}`);
    if (e.from) assert.equal(String(e.actualTrack), String(e.track), `${e.nr}: tor ${e.actualTrack} zamiast ${e.track}`);
    assert.ok(e.delay <= 3, `${e.nr}: opóźnienie ${e.delay}`);
  }
  for (const t of sim.traffic.tasks) { assert.equal(t.done, true, `zadanie ${t.id}`); assert.ok(t.doneAt <= t.deadlineTime, `zadanie ${t.id} po terminie`); }
  assert.ok(!sim.score.items.some((i) => i.code === 'held' || i.code === 'unfinished' || i.code === 'wrong-track'),
    sim.score.items.filter((i) => i.points < 0).map((i) => i.msg).join('; '));
  assert.equal(sim.ilk.counters.rozprucie, 0);
  assert.ok(sim.ended);
});

/** Przedziały zajęte przez pociąg na kostkach (współrzędna od pierwszego portu kostki). */
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

/** Odległość od czoła `b` do taboru `a` po torze (niezależnie od obliczeń pociągu). */
function gapAhead(sim, b, a) {
  const sa = spans(a);
  const last = b.trail[b.trail.length - 1];
  if (sa.some((x) => x.tile === last.tile)) return 0;
  let tile = last.tile, outPort = last.outPort, dist = last.start + last.len - b.head;
  for (let i = 0; i < 60 && outPort; i++) {
    const nb = sim.ilk.topo.neighbour(tile, outPort);
    if (!nb) return Infinity;
    tile = nb.tile;
    const hits = sa.filter((x) => x.tile === tile);
    if (hits.length) {
      const p0 = tile._def.ports(tile)[0];
      return dist + Math.min(...hits.map((h) => (nb.inPort === p0 ? h.from : tile._len - h.to)));
    }
    dist += tile._len;
    outPort = sim.ilk.topo.step(tile, nb.inPort, sim.ilk.positions()).outPort;
  }
  return Infinity;
}

// Dojazd do taboru na torze zajętym: do taboru (nie do złącza izolowanego), ostatnie metry do 3 km/h (Dz.U. 2015 poz. 360
// §9 ust. 4 i 7). Wcześniej skład stawał 10 m przed granicą odcinka – ok. 90 m od taboru.
test('tabor manewrujący dojeżdża do taboru stojącego na torze zajętym (jazda na Ms2) – bez najechania, ostatnie metry do 3 km/h', () => {
  const sim = new Simulation(sopot, { disruptions: 'none', scenario: { id: 't', name: 't', tasks: [], timetable: [
    { nr: 1, kind: 'os', name: 'stojący', from: null, to: null, dep: '09:00', track: '501', stop: true, terminates: true, length: 130, vmax: 90, startOn: { section: 'T501a', dir: 'E' } },
    { nr: 2, kind: 'os', name: 'manewrujący', from: null, to: null, dep: '09:00', track: '13', stop: true, terminates: true, length: 130, vmax: 60, startOn: { section: 'T13', dir: 'E' } },
  ] } });
  sim.step(0.5);
  sim.traffic.toShunting(2);
  assert.ok(sim.ilk.setRoute('Tm13-R501').ok, 'przebieg manewrowy na tor zajęty');
  const a = sim.traffic.trains.find((t) => t.nr === 1), b = sim.traffic.trains.find((t) => t.nr === 2);
  const gap = () => gapAhead(sim, b, a);
  let vNear = 0;
  for (let i = 0; i < 1200 && sim.clock.time < Clock.parse('06:15'); i++) {
    sim.step(0.5);
    if (gap() < 40) vNear = Math.max(vNear, b.v * 3.6);
  }
  assert.equal(b.v, 0);
  assert.equal(b.stoppedAt?.reason, 'tabor na torze');
  assert.ok(gap() <= 5, `skład stanął ${gap().toFixed(1)} m od taboru`);
  assert.ok(vNear <= 3.1, `dojazd do taboru ${vNear.toFixed(1)} km/h`);
  // bez najechania: przedziały zajęte na kostkach się nie nakładają
  const sa = spans(a);
  for (const x of spans(b)) for (const y of sa) if (x.tile === y.tile) assert.ok(x.to <= y.from || y.to <= x.from, `najechanie na kostce ${x.tile.x},${x.tile.y}`);
});

test('Sopot: ruch prawostronny jak w Orłowie – tor 1 linii 202 (jazda na Gdynię) pod torem 2, SKM 501 pod 502; sygnalizatory przy swoich torach', async () => {
  const { validateStation } = await import('../src/model/validate.js');
  assert.deepEqual(validateStation(sopot).errors, []);
  const ex = sopot.exits;
  assert.ok(ex.GD1.tile.y > ex.GD2.tile.y && ex.OR1.tile.y > ex.OR2.tile.y, '202: t.1 (in od Gdańska / out na Orłowo) niżej niż t.2');
  assert.ok(ex.GS1.tile.y > ex.GS2.tile.y && ex.OS1.tile.y > ex.OS2.tile.y, 'SKM: 501 niżej niż 502');
  assert.equal(ex.GD1.direction, 'in'); assert.equal(ex.OR1.direction, 'out');
  // każdy sygnalizator stoi w rzędzie sąsiednim do swojego toru, a kostka `at` jest torem
  for (const s of sopot.tiles.filter((t) => t.type === 'signal')) {
    assert.equal(Math.abs(s.y - s.at.y), 1, `${s.id}: sygnalizator nie przy torze`);
    const under = sopot.tiles.find((t) => t.x === s.at.x && t.y === s.at.y && t.type !== 'signal' && t.type !== 'label');
    assert.ok(under && under.type !== 'button', `${s.id}: pod kotwicą brak toru`);
  }
  // topologia po odbiciu spójna: bez urwanych portów, przebiegi zachodniej głowicy istnieją
  const sim = new Simulation(sopot, { disruptions: 'none' });
  assert.equal(sim.ilk.topo.tracks.filter((t) => t._openPorts).length, 0, 'urwane porty toru');
  const ids = new Set(sim.ilk.routeList().map((r) => r.id));
  for (const id of ['A-H', 'H-O', 'S-L', 'L-C', 'A501-R501', 'L502-GS2']) assert.ok(ids.has(id), `brak przebiegu ${id}`);
});
