import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/model/Simulation.js';
import gdynia from '../src/stations/gdynia-glowna.js';
import { validateStation } from '../src/model/validate.js';
import { Clock } from '../src/core/Clock.js';
import { autoDispatch, allArrived } from './helpers.js';

test('Gdynia Główna: definicja poprawna, brak urwanych torów, każdy tor peronowy osiągalny z obu głowic', () => {
  assert.deepEqual(validateStation(gdynia).errors, []);
  const sim = new Simulation(gdynia, { disruptions: 'none' });
  assert.equal(sim.ilk.topo.tracks.filter((t) => t._openPorts).length, 0, 'urwane porty toru');
  const ends = (start) => new Set(sim.ilk.routeList().filter((r) => r.start === start && r.kind === 'train').map((r) => r.end.id));
  for (const n of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
    assert.ok(ends('A1').has(`K${n}`) || ends('A2').has(`K${n}`), `tor ${n} nieosiągalny od Gdańska`);
    assert.ok(ends('A').has(`G${n}`) || ends('B').has(`G${n}`), `tor ${n} nieosiągalny od Chyloni`);
    assert.ok(ends(`K${n}`).has('C1') || ends(`K${n}`).has('C2'), `brak wyjazdu z toru ${n} do Chyloni`);
    assert.ok(ends(`G${n}`).has('G1') || ends(`G${n}`).has('G2'), `brak wyjazdu z toru ${n} do Gdańska`);
  }
  assert.ok(ends('A501').has('E501') && ends('A502').has('E502') && ends('L501').has('D501') && ends('L502').has('D502'));
  assert.ok(ends('B1').has('K10') && ends('K1').has('P') && ends('S301').has('G1'));
  // brak przebiegów „zawracających” (wjazd od Gdańska i wyjazd z powrotem na zachód)
  for (const r of sim.ilk.routeList()) {
    const sig = sim.ilk.signals.get(r.start);
    if (r.exit) assert.equal(sim.station.exits[r.exit].dir, sig.dir, `przebieg ${r.id} zawraca`);
  }
});

test('Gdynia Główna: pełna zmiana – 29 pociągów, SKM co 15 min, składy przekazane, bez naruszeń bezpieczeństwa', () => {
  const sim = new Simulation(gdynia, { disruptions: 'none' });
  const end = Clock.parse('08:25');
  let n = 0;
  while (sim.clock.time < end && !allArrived(sim)) {
    sim.step(0.5);
    if (n++ % 4 === 0) autoDispatch(sim);
    if (n % 20 === 0) {
      const occ = new Map();
      for (const tr of sim.traffic.trains) {
        if (tr.mode !== 'train') continue;
        for (const s of tr.occupiedSections()) { assert.ok(!occ.has(s) || occ.get(s) === tr.nr, `kolizja na ${s}`); occ.set(s, tr.nr); }
      }
    }
  }
  const tt = sim.traffic.timetable();
  assert.equal(tt.length, 29);
  for (const e of tt) {
    if (e.terminates) { assert.ok(e.status.startsWith('przekazany'), `${e.nr}: ${e.status}`); continue; }
    assert.equal(e.status, 'na następnym posterunku', `${e.nr}: ${e.status}`);
    if (e.from) assert.equal(String(e.actualTrack), String(e.track), `${e.nr}: tor ${e.actualTrack} zamiast ${e.track}`);
    assert.ok(e.delay <= 3, `${e.nr}: opóźnienie ${e.delay}`);
  }
  assert.equal(sim.ilk.counters.rozprucie, 0);
  assert.ok(sim.ended);
});

test('Gdynia Główna: ruch prawostronny – tor 1 linii 202 (jazda w prawo) pod torem 2, A1 na torze 1; SKM 501 pod 502', () => {
  const ex = gdynia.exits;
  assert.ok(ex.G1.tile.y > ex.G2.tile.y && ex.C1.tile.y > ex.C2.tile.y, '202: t.1 niżej niż t.2');
  assert.ok(ex.S1.tile.y > ex.S2.tile.y && ex.R1.tile.y > ex.R2.tile.y, 'SKM: 501 niżej niż 502');
  assert.equal(ex.G1.direction, 'in'); assert.equal(ex.C1.direction, 'out');
  const a1 = gdynia.tiles.find((t) => t.type === 'signal' && t.id === 'A1');
  assert.equal(a1.at.y, ex.G1.tile.y, 'A1 stoi na torze szlakowym 1');
  const sim = new Simulation(gdynia, { disruptions: 'none' });
  const ends = (id) => new Set(sim.ilk.routeList().filter((r) => r.start === id).map((r) => r.endButton));
  assert.ok([...ends('A1')].some((e) => /^K\d+$/.test(e)), 'A1 prowadzi na tory peronowe');
});
