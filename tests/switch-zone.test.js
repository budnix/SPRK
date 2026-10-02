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
function ride(scenario, seed) {
  const sim = new Simulation(olszyny, { scenario, disruptions: 'none', seed });
  const e = sim.traffic.timetable().find((x) => x.nr === 8403);
  const max = { inZone: 0, outZone: 0, afterZone: 0, step: 0 };
  let leftZone = false;
  for (let i = 0; i < 20000 && !e.train?.finished; i++) {
    autoDispatch(sim);
    sim.step(0.5);
    const tr = e.train;
    if (!tr?.entered || tr.finished) continue;
    max.step = tr.brake * 0.5 * 3.6; // o tyle [km/h] pociąg zwalnia w jednym kroku symulacji (hamowanie służbowe)
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

/*
 * Ziarna stałe (zmiana bez ziarna losuje je – maszynista hamuje w każdej zmianie trochę inaczej, więc test bywał
 * przypadkowy: ok. 1 % ziaren dawało 41,0 km/h przy zapasie 1 km/h). 660962753 – najgorsze ze znalezionych (41,03 km/h).
 * Zapas to jeden krok symulacji (0,5 s) hamowania służbowego: czoło mija semafor w trakcie kroku, w którym pociąg
 * jeszcze dohamowuje do 40 km/h.
 */
const SEEDS = [1, 2, 3, 660962753];

for (const scenario of ['zmiana-e', 'zmiana']) {
  test(`okręg zwrotnicowy (${scenario}): do 40 km/h od semafora do końca okręgu, cały pociąg; potem przyspiesza`, () => {
    for (const seed of SEEDS) {
      const max = ride(scenario, seed);
      assert.ok(max.step > 0 && max.step < 3, `krok hamowania ${max.step.toFixed(2)} km/h`);
      const limit = 40 + max.step;
      assert.ok(max.inZone > 0 && max.inZone <= limit, `ziarno ${seed}, wjazd przez zwrotnice 1 i 3: ${max.inZone.toFixed(2)} km/h (do ${limit.toFixed(2)})`);
      assert.ok(max.outZone > 0 && max.outZone <= limit, `ziarno ${seed}, wyjazd przez zwrotnicę 2: ${max.outZone.toFixed(2)} km/h`);
      assert.ok(max.afterZone > 45, `ziarno ${seed}, za okręgiem zwrotnicowym pociąg przyspiesza: ${max.afterZone.toFixed(1)} km/h`);
    }
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
