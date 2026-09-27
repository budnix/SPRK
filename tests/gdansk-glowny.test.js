import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/model/Simulation.js';
import gdansk from '../src/stations/gdansk-glowny.js';
import { validateStation } from '../src/model/validate.js';
import { Clock } from '../src/core/Clock.js';
import { autoDispatch, allArrived } from './helpers.js';

test('Gdańsk Główny: definicja poprawna, brak urwanych torów, przebiegi (9, SKM, 202, 250, 227, 249) i tory czołowe peronów IV/V; tylko stanowisko komputerowe', () => {
  assert.deepEqual(validateStation(gdansk).errors, []);
  const sim = new Simulation(gdansk, { disruptions: 'none' });
  assert.equal(sim.ilk.topo.tracks.filter((t) => t._openPorts).length, 0, 'urwane porty toru');
  const ends = (start, kind = 'train') => new Set(sim.ilk.routeList().filter((r) => r.start === start && r.kind === kind).map((r) => r.end.id));
  // wjazdy: od Gdańska Płd. (B) na 1, 3, 2, 4 i 502; od Śródmieścia (A501) na 501/502; od Wrzeszcza 202 (G) na 1–4, 502/501 i tory czołowe
  // 7–15 (przebieg na kozioł toru stacyjnego); od Wrzeszcza 250 (N) na 502/501 i tory czołowe; od Zaspy (H) na tor 4; z Brzeźna (M) na tory czołowe
  assert.deepEqual([...ends('B')].sort(), ['E1', 'E2', 'E3', 'E4', 'F502']);
  assert.deepEqual([...ends('A501')].sort(), ['F501', 'F502']);
  assert.deepEqual([...ends('G')].sort(), ['C1', 'C2', 'C3', 'C4', 'E501', 'E502', 'kT11', 'kT13', 'kT15', 'kT7', 'kT9']);
  assert.deepEqual([...ends('N')].sort(), ['E501', 'E502', 'kT11', 'kT13', 'kT15', 'kT7', 'kT9']);
  assert.deepEqual([...ends('H')], ['C4']); assert.deepEqual([...ends('M')].sort(), ['kT11', 'kT13', 'kT15', 'kT7', 'kT9']);
  // wyjazdy tylko na tory wyjazdowe szlaków
  for (const s of ['C4', 'C2', 'C1', 'C3']) assert.deepEqual([...ends(s)], ['GP2'], s);
  assert.deepEqual([...ends('E4')].sort(), ['WR1', 'ZT']); for (const s of ['E2', 'E1', 'E3']) assert.deepEqual([...ends(s)], ['WR1'], s);
  assert.deepEqual([...ends('E502')].sort(), ['GP2', 'SR2']); assert.deepEqual([...ends('E501')], ['SR2']);
  assert.deepEqual([...ends('F502')].sort(), ['SK1', 'WR1']); assert.deepEqual([...ends('F501')].sort(), ['SK1', 'WR1']);
  for (const nr of ['7', '9', '11', '13', '15']) assert.deepEqual([...ends(`F${nr}`)].sort(), ['BR', 'SK1', 'WR1'], `F${nr}`);
  for (const r of sim.ilk.routeList()) {
    const sig = sim.ilk.signals.get(r.start);
    if (r.exit) assert.equal(sim.station.exits[r.exit].dir, sig.dir, `przebieg ${r.id} zawraca`);
    assert.ok(!r.id.includes('#'), `wariant okrężny ${r.id}`);
  }
  assert.ok(sim.blocks.get('GP1').auto && sim.blocks.get('SR1').auto && sim.blocks.get('WR2').auto && sim.blocks.get('SK2').auto && !sim.blocks.get('ZT').fixed && !sim.blocks.get('BR').fixed);
  assert.equal(gdansk.srk, 'komputerowe');
  for (const sc of gdansk.scenarios) assert.equal(new Simulation(gdansk, { scenario: sc.id }).srk.view, 'screen', sc.id);
});

test('Gdańsk Główny: pełna zmiana – SKM co 15 min, Regio i IC/EIC linii 9, pociągi kończące bieg na peronach IV/V i wracające, towarowe na Zaspę i z Brzeźna – bez kolizji i przetrzymań', () => {
  const sim = new Simulation(gdansk, { disruptions: 'none' });
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
  assert.equal(tt.length, 37);
  for (const e of tt) {
    if (e.terminates) { assert.ok(e.status === 'zakończył bieg' || e.status.startsWith('przekazany'), `${e.nr}: ${e.status}`); assert.equal(String(e.actualTrack), String(e.track), `${e.nr}: tor`); continue; }
    assert.equal(e.status, 'na następnym posterunku', `${e.nr}: ${e.status}`);
    assert.equal(String(e.actualTrack), String(e.track), `${e.nr}: tor ${e.actualTrack} zamiast ${e.track}`);
    assert.ok(e.delay <= 3, `${e.nr}: opóźnienie ${e.delay}`);
  }
  assert.ok(!sim.score.items.some((i) => i.code === 'held'), 'przetrzymania: ' + sim.score.items.filter((i) => i.code === 'held').map((i) => i.msg).join('; '));
  assert.ok(sim.ended, 'zmiana zakończona');
});
