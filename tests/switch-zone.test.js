import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/model/Simulation.js';
import olszyny from '../src/stations/olszyny.js';
import { autoDispatch } from './helpers.js';

/*
 * Szybkość w okręgu zwrotnicowym. Ie-1 §3: S10–S13 i Sr3 zezwalają na jazdę do 40 km/h „począwszy od semafora do
 * końca okręgu zwrotnicowego osłanianego tym semaforem”; zwrotnicę w kierunku zwrotnym pokonuje cały pociąg (nie tylko
 * czoło) z szybkością dla kierunku zwrotnego. Wcześniej ograniczenie kończyło się, gdy czoło minęło semafor lub
 * rozjazd – pociąg przyspieszał do 80 km/h, mając jeszcze wagony na zwrotnicy.
 */

/**
 * Jazda pociągu 8403 (Wierzbno → tor 2 → Grabowiec: wjazd i wyjazd przez zwrotnice w kierunku zwrotnym) pod automatem
 * dyżurnego; zwraca największe szybkości [km/h]: w okręgu zwrotnicowym wjazdu i wyjazdu oraz za nim na wyjeździe.
 */
function ride(scenario) {
  const sim = new Simulation(olszyny, { scenario, disruptions: 'none' });
  const e = sim.traffic.timetable().find((x) => x.nr === 8403);
  const max = { inZone: 0, outZone: 0, afterZone: 0 };
  let leftZone = false;
  for (let i = 0; i < 20000 && !e.train?.finished; i++) {
    autoDispatch(sim);
    sim.step(0.5);
    const tr = e.train;
    if (!tr?.entered || tr.finished) continue;
    const occ = tr.occupiedSections();
    const v = tr.v * 3.6;
    const departing = !!tr.departedAt;
    if (!departing && ['Iz1', 'Iz3'].some((s) => occ.has(s))) max.inZone = Math.max(max.inZone, v);
    if (departing && occ.has('Iz2')) max.outZone = Math.max(max.outZone, v);
    if (departing && max.outZone > 0 && !occ.has('Iz2')) leftZone = true;
    if (leftZone) max.afterZone = Math.max(max.afterZone, v);
  }
  assert.ok(e.train?.finished, `${scenario}: 8403 dojechał do Grabowca`);
  assert.equal(String(e.actualTrack), '2', `${scenario}: przez tor 2`);
  return max;
}

for (const scenario of ['zmiana-e', 'zmiana']) {
  test(`okręg zwrotnicowy (${scenario}): do 40 km/h od semafora do końca okręgu, cały pociąg; potem przyspiesza`, () => {
    const max = ride(scenario);
    // 1 km/h zapasu: krok symulacji 0,5 s – czoło mija semafor w trakcie kroku, w którym jeszcze dohamowuje do 40 km/h
    assert.ok(max.inZone > 0 && max.inZone <= 41, `wjazd przez zwrotnice 1 i 3: ${max.inZone.toFixed(1)} km/h`);
    assert.ok(max.outZone > 0 && max.outZone <= 41, `wyjazd przez zwrotnicę 2: ${max.outZone.toFixed(1)} km/h`);
    assert.ok(max.afterZone > 45, `za okręgiem zwrotnicowym pociąg przyspiesza: ${max.afterZone.toFixed(1)} km/h`);
  });
}

test('pociąg przyspiesza stopniowo (przyspieszenie z kategorii), nie skokiem do dozwolonej szybkości', () => {
  // błąd: `else` hamowania trafił pod warunek odjazdu składu (holdUntil) – każdy krok wyrównywał szybkość w górę
  const sim = new Simulation(olszyny, { scenario: 'zmiana-e', disruptions: 'none' });
  let worst = 0, checked = 0;
  for (let i = 0; i < 12000; i++) {
    autoDispatch(sim);
    const before = new Map(sim.traffic.timetable().filter((e) => e.train && !e.train.finished).map((e) => [e.train, e.train.v]));
    sim.step(0.5);
    for (const [tr, v0] of before) {
      if (tr.finished || !tr.entered) continue;
      checked++;
      worst = Math.max(worst, (tr.v - v0) / 0.5 - tr.accel);
    }
  }
  assert.ok(checked > 1000, 'pociągi jechały po pulpicie');
  assert.ok(worst <= 1e-9, `przyspieszenie większe od dopuszczalnego o ${worst.toFixed(2)} m/s²`);
});
