import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/model/Simulation.js';
import pruszcz from '../src/stations/pruszcz-gdanski.js';
import { validateStation } from '../src/model/validate.js';
import { Clock } from '../src/core/Clock.js';
import { allArrived, play } from './helpers.js';
import { checkScenario } from '../src/model/scenarioCheck.js';
import { checkShift } from '../scripts/lib/shift-report.mjs';

test('Pruszcz Gdański: definicja poprawna, brak urwanych torów, przebiegi linii 9, 260, 229 i 226 zgodne z układem; tylko stanowisko komputerowe', () => {
  assert.deepEqual(validateStation(pruszcz).errors, []);
  const sim = new Simulation(pruszcz, { disruptions: 'none' });
  assert.equal(sim.ilk.topo.tracks.filter((t) => t._openPorts).length, 0, 'urwane porty toru');
  const ends = (start, kind = 'train') => new Set(sim.ilk.routeList().filter((r) => r.start === start && r.kind === kind).map((r) => r.end.id));
  // wjazdy: od Pszczółek (C) na wszystkie tory, od Zajączkowa (D) na 3/5/7, ze Starej Piły (P) na tor 6,
  // od Gdańska (S) na wszystkie tory, z Portu Północnego (R) na 3/5/7
  assert.deepEqual([...ends('C')].sort(), ['G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'G7']);
  assert.deepEqual([...ends('S')].sort(), ['E1', 'E2', 'E3', 'E4', 'E5', 'E6', 'E7']);
  assert.deepEqual([...ends('D')].sort(), ['G3', 'G5', 'G7']); assert.deepEqual([...ends('R')].sort(), ['E3', 'E5', 'E7']);
  assert.deepEqual([...ends('P')], ['G6']);
  // wyjazdy tylko na tory wyjazdowe: na zachód PS2 (tory 1–7 i 4/2) i SP (tor 6), ZT (3/5/7); na wschód GD1 (wszystkie), GP (3/5/7)
  assert.deepEqual([...ends('E6')].sort(), ['PS2', 'SP']); assert.deepEqual([...ends('E4')], ['PS2']); assert.deepEqual([...ends('E2')], ['PS2']); assert.deepEqual([...ends('E1')], ['PS2']);
  for (const nr of ['3', '5', '7']) { assert.deepEqual([...ends(`E${nr}`)].sort(), ['PS2', 'ZT'], `E${nr}`); assert.deepEqual([...ends(`G${nr}`)].sort(), ['GD1', 'GP'], `G${nr}`); }
  for (const nr of ['6', '4', '2', '1']) assert.deepEqual([...ends(`G${nr}`)], ['GD1'], `G${nr}`);
  for (const r of sim.ilk.routeList()) {
    const sig = sim.ilk.signals.get(r.start);
    if (r.exit) assert.equal(sim.station.exits[r.exit].dir, sig.dir, `przebieg ${r.id} zawraca`);
    assert.ok(!r.id.includes('#'), `wariant okrężny ${r.id}`);
  }
  assert.ok(sim.blocks.get('PS1').auto && sim.blocks.get('GD2').auto && !sim.blocks.get('ZT').fixed && !sim.blocks.get('GP').fixed && !sim.blocks.get('SP').fixed);
  assert.equal(pruszcz.srk, 'komputerowe');
  for (const sc of pruszcz.scenarios) assert.equal(new Simulation(pruszcz, { scenario: sc.id }).srk.view, 'screen', sc.id);
});

test('Pruszcz Gdański: pełna zmiana – Regio i IC linii 9, towarowe Zajączkowo/Pszczółki ↔ Port Północny, Stara Piła ↔ Gdańsk – bez kolizji i przetrzymań', () => {
  const sim = new Simulation(pruszcz, { disruptions: 'none' });
  const end = Clock.parse('08:25');
  play(sim).until(end, { stop: allArrived, each: (_, { steps }) => {
    if (steps % 20 === 0) {
      const occ = new Map();
      for (const tr of sim.traffic.trains) {
        if (tr.mode !== 'train') continue;
        for (const s of tr.occupiedSections()) { assert.ok(!occ.has(s) || occ.get(s) === tr.nr, `kolizja na ${s}`); occ.set(s, tr.nr); }
      }
    }
  } });
  const tt = sim.traffic.timetable();
  assert.equal(tt.length, 21);
  for (const e of tt) {
    assert.equal(e.status, 'na następnym posterunku', `${e.nr}: ${e.status}`);
    assert.equal(String(e.actualTrack), String(e.track), `${e.nr}: tor ${e.actualTrack} zamiast ${e.track}`);
    assert.ok(e.delay <= 3, `${e.nr}: opóźnienie ${e.delay}`);
  }
  assert.ok(!sim.score.items.some((i) => i.code === 'held'), 'przetrzymania: ' + sim.score.items.filter((i) => i.code === 'held').map((i) => i.msg).join('; '));
  assert.ok(sim.ended, 'zmiana zakończona');
});

test('Pruszcz Gdański: zmiana i usterka-gp kończą się 21 min po ostatnim pociągu – przy małych zakłóceniach R 55309 zdąża', () => {
  // koniec 08:15 (11 min po odjeździe 55309 o 08:04) był za wcześnie: 55309 czekał na szlak do Pszczółek i zostawał
  // nieobsłużony już przy poziomie low (ziarna 1 i 5); zapas poziomu low to 19 min (opóźnienie 15 min + 4 min)
  for (const id of ['zmiana', 'usterka-gp']) {
    const sc = pruszcz.scenarios.find((s) => s.id === id);
    assert.equal(sc.endTime, '08:25');
    assert.deepEqual(checkScenario(pruszcz, id, { levels: ['low'] }).filter((f) => f.code === 'sc-slack'), [], `${id}: zapas przy low`);
  }
  for (const seed of [1, 5]) {
    const r = checkShift({ stationId: 'pruszcz-gdanski', scenarioId: 'zmiana', seed, level: 'low', extra: 120 });
    assert.deepEqual(r.unfinished.map((u) => u.nr), [], `ziarno ${seed}: pociągi nieobsłużone na koniec zmiany`);
  }
});
