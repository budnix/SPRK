import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/model/Simulation.js';
import chylonia from '../src/stations/gdynia-chylonia.js';
import { validateStation } from '../src/model/validate.js';
import { Clock } from '../src/core/Clock.js';
import { autoDispatch, allArrived } from './helpers.js';

test('Gdynia Chylonia: definicja poprawna, brak urwanych torów, przebiegi zgodne z planem', () => {
  assert.deepEqual(validateStation(chylonia).errors, []);
  const sim = new Simulation(chylonia, { disruptions: 'none' });
  assert.equal(sim.ilk.topo.tracks.filter((t) => t._openPorts).length, 0, 'urwane porty toru');
  const ends = (start, kind = 'train') => new Set(sim.ilk.routeList().filter((r) => r.start === start && r.kind === kind).map((r) => r.end.id));
  // wjazdy od Gdyni Głównej: 250 t.1 → 502, 250 t.2 → 501, 202 t.1 → 2, 202 t.2 → 1/3; przejścia rozjazdami 1–12
  assert.ok(ends('A').has('G502') && ends('A').has('F501') && ends('A').has('M2'), 'A: tory 502, 501, 2');
  assert.ok(ends('B').has('F501') && ends('B').has('G502') && ends('B').has('M1'), 'B: tory 501, 502, 1');
  assert.ok(ends('C').has('M2') && ends('C').has('M1') && ends('C').has('M3') && ends('C').has('F501'), 'C: tory 2, 1, 3, 501');
  assert.ok(ends('D').has('M1') && ends('D').has('M3') && ends('D').has('M2'), 'D: tory 1, 3, 2');
  // wyjazdy na zachód: tor 502 na oba tory linii 250, tor 3 tylko przez rozjazdy 16/15 na 202 t.2
  assert.ok(ends('E502').has('GS1') && ends('E502').has('GS2') && ends('E1').has('GG2') && ends('E3').has('GG2'));
  // wschód: wyjazd dwustopniowy (G502 → A502 → Cisowa), tor 503 przez 38b/39 i 41/42, Port z torów 1/2/3
  assert.ok(ends('G502').has('A502') && ends('A502').has('RS1') && ends('F501').has('A501') && ends('A501').has('RS2'));
  assert.ok(ends('M2').has('A503') && ends('F501').has('A503') && ends('A503').has('RG1'), 'tor 503 → Rumia 202 t.1');
  assert.ok(ends('M2').has('RG2') && ends('M3').has('RG2') && ends('M3').has('PORT') && ends('M1').has('PORT'));
  // wjazdy od wschodu: R na tory 2 i 1 oraz 3 (przez rozjazd krzyżowy 38 → 37), P z Portu, S z toru 503 na 501/502
  assert.ok(ends('R').has('E2') && ends('R').has('E1') && ends('R').has('E3'), 'R: tory 2, 1, 3');
  assert.ok(ends('P').has('E3') && ends('P').has('E2') && ends('P').has('E1'));
  assert.ok(ends('S').has('E501') && ends('S').has('E502') && ends('T').has('E501') && ends('U').has('E502'));
  // manewry: tory odstawcze 21/22 z toru 501 i 502, tor 51, Postojowa (964) z toru 1 i 3
  assert.ok(ends('F501', 'shunt').has('kT22') && ends('F501', 'shunt').has('kT21') && ends('G502', 'shunt').has('kT22'));
  assert.ok(ends('Tm22', 'shunt').has('E501') && ends('Tm21', 'shunt').has('E502'), 'wyjazd z torów 21/22 na 501/502');
  assert.ok(ends('E1', 'shunt').has('kPOS') && ends('E3', 'shunt').has('kT51') && ends('T57m', 'shunt').has('M1'));
  assert.ok(ends('Tm32', 'shunt').has('kT503'));
  for (const r of sim.ilk.routeList()) {
    const sig = sim.ilk.signals.get(r.start);
    if (r.exit) assert.equal(sim.station.exits[r.exit].dir, sig.dir, `przebieg ${r.id} zawraca`);
  }
});

test('Gdynia Chylonia: pełna zmiana – 31 pociągów, wyjazdy dwustopniowe, odstawianie na tor 22 i do Postojowej, skład przekazany', () => {
  const sim = new Simulation(chylonia, { disruptions: 'none' });
  const end = Clock.parse('08:20');
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
  assert.equal(tt.length, 31);
  for (const e of tt) {
    if (e.terminates) { assert.ok(e.status === 'zakończył bieg' || e.status.startsWith('przekazany'), `${e.nr}: ${e.status}`); continue; }
    assert.equal(e.status, 'na następnym posterunku', `${e.nr}: ${e.status}`);
    if (e.from) assert.equal(String(e.actualTrack), String(e.track), `${e.nr}: tor ${e.actualTrack} zamiast ${e.track}`);
    assert.ok(e.delay <= 3, `${e.nr}: opóźnienie ${e.delay}`);
  }
  for (const t of sim.traffic.tasks) { assert.equal(t.done, true, `zadanie ${t.id}`); assert.ok(t.doneAt <= t.deadlineTime, `zadanie ${t.id} po terminie`); }
  const unit = tt.find((e) => e.nr === 55152).train;
  assert.deepEqual([...unit.occupiedSections()], ['T964'], 'skład 55152 nie stoi w całości na torze 964');
  assert.ok(!sim.score.items.some((i) => i.code === 'held'), 'przetrzymania: ' + sim.score.items.filter((i) => i.code === 'held').map((i) => i.msg).join('; '));
  assert.ok(!sim.score.items.some((i) => i.code === 'unfinished'));
  assert.equal(sim.ilk.counters.rozprucie, 0);
  assert.ok(sim.ended);
});

test('Gdynia Chylonia: tor 1 zamknięty – pociągi z Rumi torem 2 lub 3', () => {
  const sim = new Simulation(chylonia, { scenario: 'tor-1-zamkniety', disruptions: 'none' });
  const end = Clock.parse('08:20');
  let n = 0;
  while (sim.clock.time < end && !allArrived(sim)) { sim.step(0.5); if (n++ % 4 === 0) autoDispatch(sim); }
  for (const e of sim.traffic.timetable().filter((x) => x.from === 'RG2' && !x.terminates)) {
    assert.equal(e.status, 'na następnym posterunku', `${e.nr}: ${e.status}`);
    assert.notEqual(String(e.actualTrack), '1', `${e.nr} wjechał na zamknięty tor 1`);
  }
});

test('Chylonia: ruch prawostronny jak w Sopocie i Orłowie – SKM na dole, tor 1 każdej pary (jazda w prawo) pod torem 2; sygnalizatory przy torach, bez nakładania na przyciski', () => {
  assert.deepEqual(validateStation(chylonia).errors, []);
  const ex = chylonia.exits;
  assert.ok(ex.GS1.tile.y > ex.GS2.tile.y && ex.RS1.tile.y > ex.RS2.tile.y, 'SKM: t.1 (jazda w prawo) niżej niż t.2');
  assert.ok(ex.GG1.tile.y > ex.GG2.tile.y && ex.RG1.tile.y > ex.RG2.tile.y, '202: t.1 niżej niż t.2');
  assert.ok(ex.GS1.tile.y > ex.GG1.tile.y, 'SKM pod linią 202 (po wschodniej stronie – na dole planu)');
  assert.equal(ex.GS1.direction, 'in'); assert.equal(ex.RG1.direction, 'out');
  const cells = new Map();
  for (const t of chylonia.tiles) {
    if (t.type === 'label') continue;
    const k = `${t.x},${t.y}`;
    assert.ok(!cells.has(k), `kostki nakładają się w ${k}: ${cells.get(k)} i ${t.type}:${t.id || ''}`);
    cells.set(k, `${t.type}:${t.id || ''}`);
  }
  for (const s of chylonia.tiles.filter((t) => t.type === 'signal')) {
    assert.equal(Math.abs(s.y - s.at.y), 1, `${s.id}: sygnalizator nie przy torze`);
    assert.ok(s.y >= 0 && s.y < chylonia.desk.rows, `${s.id}: poza pulpitem`);
    const under = chylonia.tiles.find((t) => t.x === s.at.x && t.y === s.at.y && ['track', 'point', 'crossing', 'buffer'].includes(t.type));
    assert.ok(under, `${s.id}: pod kotwicą brak toru`);
  }
  const sim = new Simulation(chylonia, { disruptions: 'none' });
  assert.equal(sim.ilk.topo.tracks.filter((t) => t._openPorts).length, 0, 'urwane porty toru');
});

test('Chylonia: przebiegi równoległe po torach 502 i 501 – wyjazd na Cisową (G502 → A502 → szlak) i wjazd od Cisowej (T → E501) jednocześnie', () => {
  const sim = new Simulation(chylonia, { disruptions: 'none' });
  const run = (n) => { for (let i = 0; i < n; i++) sim.step(0.5); };
  sim.press({ kind: 'signal', id: 'G502', color: 'green' });
  assert.equal(sim.pressCompound({ kind: 'end', id: 'kRS1' }).ok, true);
  run(120);
  sim.press({ kind: 'signal', id: 'T', color: 'green' });
  const r = sim.press({ kind: 'signal', id: 'E501', color: 'green' });
  assert.equal(r.ok, true, r.reason);
  run(120);
  assert.deepEqual([...sim.ilk.active.keys()].sort(), ['A502-RS1', 'G502-A502', 'T-E501']);
  assert.notEqual(sim.ilk.signals.get('T').aspect, 'S1');
  assert.notEqual(sim.ilk.signals.get('G502').aspect, 'S1');
  // odwrotnie: wjazd od Gdyni na 502 (A → G502 lub dalej) nie koliduje z wyjazdem z 501 na Gdynię (E501 → …)
  const s2 = new Simulation(chylonia, { disruptions: 'none' });
  s2.press({ kind: 'signal', id: 'A', color: 'green' });
  assert.equal(s2.press({ kind: 'signal', id: 'G502', color: 'green' }).ok, true);
  for (let i = 0; i < 120; i++) s2.step(0.5);
  s2.press({ kind: 'signal', id: 'E501', color: 'green' });
  const r2 = s2.pressCompound({ kind: 'end', id: 'kGS2' });
  assert.equal(r2.ok, true, r2.reason);
  for (let i = 0; i < 120; i++) s2.step(0.5);
  assert.ok(s2.ilk.active.has('A-G502') && [...s2.ilk.active.keys()].some((id) => /^E501-/.test(id)), [...s2.ilk.active.keys()].join(','));
});
