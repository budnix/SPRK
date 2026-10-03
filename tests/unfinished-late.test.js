import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/model/Simulation.js';
import { LATE_SLACK } from '../src/model/Traffic.js';
import { LATE_SLACK as CHECK_SLACK } from '../src/model/scenarioCheck.js';
import { Clock } from '../src/core/Clock.js';
import szkolna from '../src/stations/szkolna.js';
import { playShift } from '../src/model/check/play.js';
import { run } from './helpers.js';

/*
 * Kara „nieobsłużony” (−10) tylko za pociąg, który dało się obsłużyć (przyjęte, docs/sources/sygnaly-i-blokada.md): pociąg, który przez
 * opóźnienie od sąsiada – albo składu, z którego powstaje – nie zdążyłby przed końcem zmiany, zostaje w raporcie jako
 * nieobsłużony z pozycją 0 pkt. Dawniej przy poziomie „duże” (opóźnienia do 40 min) zmiana z zapasem 10–34 min po
 * ostatnim pociągu dawała −10 bez winy dyżurnego.
 */
const at = (hm) => Clock.parse(hm);
const entry = (sim, nr) => sim.traffic.timetable().find((e) => e.nr === nr);
const make = (trains, delays = {}) => {
  const sim = new Simulation(szkolna, { disruptions: 'none', seed: 1, scenario: { id: 't', name: 't', srk: 'komputerowe', endTime: '08:50', trains, tasks: [] } });
  for (const [nr, min] of Object.entries(delays)) sim.traffic.setInboundDelay(entry(sim, Number(nr)), min);
  return sim;
};
const items = (sim, code) => sim.score.items.filter((i) => i.code === code).map((i) => `${i.nr}:${i.points}`);

test('granica: plan + opóźnienie wniesione mniej niż 4 min przed końcem – nie zdążyłby; bez opóźnienia nigdy', () => {
  assert.equal(LATE_SLACK, 4 * 60);
  assert.equal(CHECK_SLACK, LATE_SLACK, 'ta sama granica w kontroli scenariusza');
  const end = at('08:50');
  // 6106: odjazd 08:35
  for (const [min, late] of [[0, false], [5, false], [11, false], [12, true], [40, true]]) {
    const sim = make([6106], min ? { 6106: min } : {});
    const e = entry(sim, 6106);
    assert.equal(sim.traffic.inboundLag(e), min * 60);
    assert.equal(sim.traffic.expectedDone(e), at('08:35') + min * 60);
    assert.equal(sim.traffic.lateFromOutside(e, end), late, `+${min} min`);
  }
  // pociąg ze składu innego pociągu (90202 ze składu 90201, odjazd 08:12) dziedziczy opóźnienie składu
  const sim = make([90201, 90202], { 90201: 40 });
  assert.equal(sim.traffic.unitLag(entry(sim, 90202)), 40 * 60);
  assert.equal(sim.traffic.lateFromOutside(entry(sim, 90202), end), true, '08:12 + 40 min');
  assert.equal(sim.traffic.lateFromOutside(entry(sim, 90201), end), false, 'sam skład (przyjazd 07:52 + 40 min) zdążyłby');
});

test('koniec zmiany: pociąg opóźniony od sąsiada ponad koniec zmiany – 0 pkt; opóźniony mniej i punktualny – −10', () => {
  // nikt nie obsługuje stacji: 6104 (bez opóźnienia), 6105 (+40 min: odjazd 09:04), 6106 (+5 min: odjazd 08:40)
  const sim = make([6104, 6105, 6106], { 6105: 40, 6106: 5 });
  let report = null;
  sim.bus.on('shift-end', (r) => { report = r; });
  run(sim, at('08:50') - sim.clock.time + 5);
  assert.ok(report, 'zmiana skończona o czasie');
  assert.deepEqual(items(sim, 'unfinished').sort(), ['6104:-10', '6106:-10']);
  assert.deepEqual(items(sim, 'unfinished-late'), ['6105:0']);
  const late = sim.score.items.find((i) => i.code === 'unfinished-late');
  assert.equal(late.lag, 40);
  assert.match(late.msg, /6105 nie obsłużony do końca zmiany – opóźniony 40 min .*bez kary/);
  // raport: pociąg dalej na liście nieobsłużonych, z oznaczeniem „bez kary”
  assert.deepEqual(report.unfinished.map((u) => `${u.nr}:${u.excused}`).sort(), ['6104:false', '6105:true', '6106:false']);
  assert.equal(report.total, -20);
});

test('Szkolna, poziom „duże”, ziarno 1, automat: 6105 (+40 min od sąsiada) nieobsłużony bez kary', () => {
  const scenario = szkolna.scenarios.find((s) => s.id === 'zmiana');
  const { sim } = playShift({ station: szkolna, scenario, seed: 1, level: 'high', extra: 1 });
  assert.equal(entry(sim, 6105).delayIn, 40);
  assert.ok(items(sim, 'unfinished-late').includes('6105:0'), items(sim, 'unfinished-late').join(', '));
  assert.ok(!items(sim, 'unfinished').some((x) => x.startsWith('6105:')));
  // każda pozycja „nieobsłużony” z karą dotyczy pociągu, który wg planu i opóźnienia wniesionego zdążyłby
  for (const i of sim.score.items.filter((x) => x.code === 'unfinished')) {
    assert.equal(sim.traffic.lateFromOutside(entry(sim, i.nr), sim.endTime), false, `${i.nr}`);
  }
});
