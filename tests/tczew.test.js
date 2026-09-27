import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/model/Simulation.js';
import tczew from '../src/stations/tczew.js';
import { validateStation } from '../src/model/validate.js';
import { Clock } from '../src/core/Clock.js';
import { autoDispatch, allArrived } from './helpers.js';

test('Tczew: definicja poprawna, brak urwanych torów, przebiegi węzła (9, 131, 203, 726/728) zgodne z układem', () => {
  assert.deepEqual(validateStation(tczew).errors, []);
  const sim = new Simulation(tczew, { disruptions: 'none' });
  assert.equal(sim.ilk.topo.tracks.filter((t) => t._openPorts).length, 0, 'urwane porty toru');
  const ends = (start, kind = 'train') => new Set(sim.ilk.routeList().filter((r) => r.start === start && r.kind === kind).map((r) => r.end.id));
  // wjazdy: od Górek (A1) na tory 10, 8, 6, 4, 2, 1; od Szymankowa (E1) na 1, 2, 3, 5–15; od Malinowa (U) na 10, 8, 6, 4, 2, 1;
  // od Pszczółek (S) na 1, 2, 3, 5, 7; od Zajączkowa (P, Z) na 5, 7–15
  assert.deepEqual([...ends('A1')].sort(), ['M1', 'M10', 'M2', 'M4', 'M6', 'M8']);
  assert.deepEqual([...ends('E1')].sort(), ['M1', 'M11', 'M13', 'M15', 'M2', 'M3', 'M5', 'M7', 'M9']);
  assert.deepEqual([...ends('U')].sort(), ['K1', 'K10', 'K2', 'K4', 'K6', 'K8']);
  assert.deepEqual([...ends('S')].sort(), ['K1', 'K2', 'K3', 'K5', 'K7']);
  for (const s of ['P', 'Z']) assert.deepEqual([...ends(s)].sort(), ['K11', 'K13', 'K15', 'K5', 'K7', 'K9'], s);
  // wyjazdy tylko na tory wyjazdowe szlaków: na zachód GK2 (tory 10–1) i SZ2 (tory 2–15), na wschód ML1 (10–1), PS1 (2–7), ZA1/ZB (5–15)
  for (const nr of ['10', '8', '6', '4']) { assert.deepEqual([...ends(`K${nr}`)], ['GK2'], `K${nr}`); assert.deepEqual([...ends(`M${nr}`)], ['ML1'], `M${nr}`); }
  assert.deepEqual([...ends('K2')].sort(), ['GK2', 'SZ2']); assert.deepEqual([...ends('M2')].sort(), ['ML1', 'PS1']);
  assert.deepEqual([...ends('K1')].sort(), ['GK2', 'SZ2']); assert.deepEqual([...ends('M1')].sort(), ['ML1', 'PS1']);
  for (const nr of ['3', '5', '7', '9', '11', '13', '15']) assert.deepEqual([...ends(`K${nr}`)], ['SZ2'], `K${nr}`);
  assert.deepEqual([...ends('M3')], ['PS1']); assert.deepEqual([...ends('M5')].sort(), ['PS1', 'ZA1', 'ZB']); assert.deepEqual([...ends('M7')].sort(), ['PS1', 'ZA1', 'ZB']);
  for (const nr of ['9', '11', '13', '15']) assert.deepEqual([...ends(`M${nr}`)].sort(), ['ZA1', 'ZB'], `M${nr}`);
  for (const r of sim.ilk.routeList()) {
    const sig = sim.ilk.signals.get(r.start);
    if (r.exit) assert.equal(sim.station.exits[r.exit].dir, sig.dir, `przebieg ${r.id} zawraca`);
    assert.ok(!r.id.includes('#'), `wariant okrężny ${r.id}`);
  }
  // blokady: samoczynna na 9 i 131, Eap na 203 i 726, dwukierunkowa na 728
  assert.ok(sim.blocks.get('PS1').auto && sim.blocks.get('GK1').auto && !sim.blocks.get('ML1').auto && !sim.blocks.get('ZB').fixed);
  // tylko stanowisko komputerowe – żaden scenariusz nie daje pulpitu kostkowego
  assert.equal(tczew.srk, 'komputerowe');
  for (const sc of tczew.scenarios) assert.equal(new Simulation(tczew, { scenario: sc.id }).srk.view, 'screen', sc.id);
});

test('Tczew: pełna zmiana – IC/Regio linii 9, Bydgoszcz, nawroty do Chojnic, towarowe do Zajączkowa – bez kolizji i przetrzymań', () => {
  const sim = new Simulation(tczew, { disruptions: 'none' });
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
  assert.equal(tt.length, 30);
  for (const e of tt) {
    if (e.terminates) { assert.ok(e.status === 'zakończył bieg' || e.status.startsWith('przekazany'), `${e.nr}: ${e.status}`); assert.equal(String(e.actualTrack), String(e.track), `${e.nr}: tor`); continue; }
    assert.equal(e.status, 'na następnym posterunku', `${e.nr}: ${e.status}`);
    assert.equal(String(e.actualTrack), String(e.track), `${e.nr}: tor ${e.actualTrack} zamiast ${e.track}`);
    assert.ok(e.delay <= 3, `${e.nr}: opóźnienie ${e.delay}`);
  }
  assert.ok(!sim.score.items.some((i) => i.code === 'held'), 'przetrzymania: ' + sim.score.items.filter((i) => i.code === 'held').map((i) => i.msg).join('; '));
  assert.ok(sim.ended, 'zmiana zakończona');
});
