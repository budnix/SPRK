import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/model/Simulation.js';
import { makeSim, run, trainAtA } from './helpers.js';
import szkolna from '../src/stations/szkolna.js';
import sopot from '../src/stations/sopot.js';
import orlowo from '../src/stations/gdynia-orlowo.js';
import reda from '../src/stations/reda.js';

/*
 * Sygnał zastępczy i rozkaz „S” (audyt realizmu, grupa 2). Blokada liniowa dotyczy tylko toru szlakowego, na który
 * pociąg faktycznie wyjeżdża (Ie-1 §4 ust. 13 pkt 18). Uzasadnienie Sz / rozkazu liczy się dla drogi za semaforem, nie
 * dla całej stacji; przed Sz zwrotnice ustawia się i utwierdza (Ie-10 §35 ust. 1 pkt 1–2). Przy fałszywej zajętości
 * dyżurny sprawdza tor na miejscu i daje Sz albo rozkaz (Ie-10 §32 ust. 5). Pociągi zatrzymuje się przed przeszkodą
 * (Ir-1 §75 ust. 1–2) – każdy wjazd na tor z pękniętą szyną jest błędem dyżurnego.
 */

const empty = { id: 't', name: 't', endTime: '23:00', trains: [] };
const sim = (station, scenario = empty) => new Simulation(station, { scenario, disruptions: 'none' });
const scoreOf = (s, code) => s.score.items.filter((i) => i.code === code);

test('W7: Sz sprawdza blokadę tylko wyjazdu, na który prowadzi droga za semaforem', () => {
  // Sopot F – droga kończy się na torze stacyjnym: blokada Gdańska Oliwy (pierwszy wyjazd z listy) nie ma znaczenia
  const s = sim(sopot);
  const r = s.ilk.substituteSignal('F');
  assert.equal(r.ok, true, r.reason);
  assert.equal(s.ilk.signals.get('F').aspect, 'Sz');
  // Reda K2 – droga prowadzi na tor szlakowy do Wejherowa, nie do Pucka: odmowa z powodu tego toru
  const t = sim(reda);
  assert.equal(t.ilk.pathBeyond('K2').exit, 'WJ2');
  const k2 = t.ilk.substituteSignal('K2');
  assert.equal(k2.ok, false);
  assert.match(k2.reason, /Wejherowo/);
  assert.doesNotMatch(k2.reason, /Puck/);
});

test('W7: Sz na semaforze wyjazdowym, którego droga prowadzi na szlak – nadal bez pozwolenia blokady odmowa', () => {
  const s = sim(szkolna);
  const r = s.ilk.substituteSignal('C1'); // tor 1 → Zw1 w „+” → szlak do Lipna
  assert.equal(r.ok, false);
  assert.match(r.reason, /Sz na C1/);
  // Orłowo C: droga po torze 3 i zwrotnicach 4, 2 prowadzi na szlak do Sopotu – kierunek SBL na wjazd
  const o = sim(orlowo);
  assert.equal(o.ilk.pathBeyond('C').exit, 'S1');
  assert.equal(o.ilk.substituteSignal('C').ok, false);
});

test('W17: usterka poza drogą za semaforem nie uzasadnia Sz; na drodze – uzasadnia', () => {
  const far = sim(szkolna, { ...empty, faults: [{ type: 'false-occupancy', target: 'T3', at: '07:00', duration: 30 }] });
  run(far, 60);
  assert.equal(far.ilk.sections.get('T3').occupied, true);
  far.ilk.toggleIndividualLock('Zw1');
  assert.ok(far.ilk.substituteSignal('A').ok);
  assert.equal(scoreOf(far, 'Sz').at(-1).points, -5, 'usterka toru 3 nie dotyczy drogi A → tor 1');

  const near = sim(szkolna, { ...empty, faults: [{ type: 'false-occupancy', target: 'T1', at: '07:00', duration: 30 }] });
  run(near, 60);
  near.ilk.toggleIndividualLock('Zw1');
  assert.ok(near.ilk.substituteSignal('A').ok);
  assert.equal(scoreOf(near, 'Sz').at(-1).points, 0, 'fałszywa zajętość toru 1 na drodze A');
});

test('W17: Sz bez utwierdzonych zwrotnic na drodze – dodatkowa kara (Sz nie jest blokowany)', () => {
  const s = sim(szkolna);
  assert.ok(s.ilk.substituteSignal('A').ok, 'Sz podany mimo niezamkniętej Zw1');
  assert.equal(scoreOf(s, 'Sz-points').length, 1);
  assert.match(scoreOf(s, 'Sz-points')[0].msg, /Zw1/);
  const t = sim(szkolna);
  t.ilk.toggleIndividualLock('Zw1');
  assert.ok(t.ilk.substituteSignal('A').ok);
  assert.equal(scoreOf(t, 'Sz-points').length, 0, 'zwrotnica zamknięta Zz');
});


test('W16: rozkaz „S” przy fałszywej zajętości na jego drodze – wydany i uzasadniony usterką', () => {
  const s = makeSim();
  trainAtA(s);
  s.ilk.toggleIndividualLock('Zw1');
  s.ilk.sections.get('T1').forced = true; // usterka obwodu torowego (jak false-occupancy)
  s.ilk.refreshOccupancy();
  assert.equal(s.ilk.sections.get('T1').occupied, true);
  const r = s.traffic.issueOrder({ nr: 5310, signal: 'A' });
  assert.equal(r.ok, true, r.reason);
  assert.equal(scoreOf(s, 'order').at(-1).points, 0);
});

test('K4: każdy nowy wjazd na tor z pękniętą szyną jest karany, na tor zamknięty – mocniej', () => {
  const mk = () => sim(szkolna, { ...empty, endTime: '09:00', faults: [{ type: 'track-defect', target: 'T1', at: '07:01', duration: 30 }] });
  const s = mk();
  run(s, 90);
  s.ilk.updateOccupancy(new Set(['T1'])); run(s, 1);
  s.ilk.updateOccupancy(new Set()); run(s, 1);
  s.ilk.updateOccupancy(new Set(['T1'])); run(s, 1);
  assert.equal(scoreOf(s, 'track-defect').length, 2, 'dwa wjazdy – dwie kary');
  const open = scoreOf(s, 'track-defect')[0].points;

  const t = mk();
  run(t, 90);
  assert.ok(t.execute({ type: 'close-section', section: 'T1', closed: true }).ok);
  t.ilk.updateOccupancy(new Set(['T1'])); run(t, 1);
  const closed = scoreOf(t, 'track-defect');
  assert.equal(closed.length, 1, 'wjazd na tor zamknięty też karany');
  assert.ok(closed[0].points < open, `${closed[0].points} < ${open}`);
});
