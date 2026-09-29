import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/model/Simulation.js';
import { Train } from '../src/model/Train.js';
import szkolna from '../src/stations/szkolna.js';
import gdyniaGlowna from '../src/stations/gdynia-glowna.js';
import { run } from './helpers.js';

/*
 * Zezwolenie na jazdę (audyt realizmu, grupa 1). Pociąg jedzie tylko na sygnał zezwalający dla pociągu (S2–S13,
 * Sr2/Sr3), sygnał zastępczy albo rozkaz – nie na Ms2 / M2 (Ie-1 §4 ust. 14 i 17; Ir-1 §11 ust. 1, §63 ust. 1);
 * na szlak wyjeżdża tylko przebiegiem wyjazdowym (Ir-1 §63 ust. 1 pkt 1). Skład manewrowy mija sygnalizator tylko
 * na Ms2 / M2 w swoją stronę (Ie-1 §3 ust. 17–18). Przebieg manewrowy z semafora końcowego nie jest kontynuacją
 * przebiegu pociągowego (Ie-1 §4 ust. 17, §8 ust. 6; Ie-4 §37 ust. 2, §43 ust. 2 pkt 4). Ms2 gaśnie po minięciu
 * sygnalizatora przez cały skład (Ie-4 §40, §42 ust. 2).
 */

const sim = () => new Simulation(szkolna, { scenario: { id: 't', name: 't', endTime: '09:00', trains: [] }, disruptions: 'none' });
/** Kostki odcinka od zachodu na wschód. */
const tilesOf = (s, section) => [...s.ilk.sections.get(section).tiles].filter((t) => t.type === 'track').sort((a, b) => a.x - b.x);
/** Stojący skład na kostkach (od ogona do czoła), czoło w kierunku `dir`. */
function consist(s, tiles, dir, mode = 'train', nr = 'X1') {
  const tr = new Train({ nr, kind: 'os', name: 'Osobowy', length: 60, vmax: 100, stop: false }, s.ilk.topo, s.ilk, { mode });
  tr.placeOnTrack(tiles, dir);
  if (mode === 'shunt') tr.vmax = 25 / 3.6;
  tr.state = 'moving';
  s.traffic.trains.push(tr);
  return tr;
}
const setRoute = (s, id) => { assert.ok(s.ilk.setRoute(id).ok, id); run(s, 8); assert.ok(s.ilk.active.has(id), id); };

test('W18: pociąg nie mija semafora wskazującego Ms2 (sygnał manewrowy nie jest sygnałem dla pociągu)', () => {
  const s = sim();
  const t2 = tilesOf(s, 'T2');
  const tr = consist(s, t2.slice(-3), 'E'); // czoło tuż przed D2
  setRoute(s, 'D2-kT3m');
  assert.equal(s.ilk.signals.get('D2').aspect, 'Ms2');
  const head = tr.head;
  run(s, 60);
  assert.ok(tr.head - head < 1, `pociąg ruszył na Ms2 (${(tr.head - head).toFixed(1)} m)`);
  assert.ok(!tr.occupiedSections().has('T2e'), 'pociąg minął D2');
});

test('W2: pociąg po zmianie czoła przed semaforem wjazdowym nie wyjeżdża sam na szlak', () => {
  const s = sim();
  const tr = consist(s, tilesOf(s, 'ZbA').slice(1), 'E'); // stoi przed A, czołem do stacji
  run(s, 2);
  assert.equal(tr.reverse(), true);
  run(s, 120);
  assert.ok(!tr.onLine('W') && !tr.finished, 'pociąg wyjechał na szlak bez przebiegu wyjazdowego');
});

test('W2: pociąg jedzie na szlak tylko przebiegiem wyjazdowym – z przebiegiem C2-W wyjeżdża', () => {
  const s = sim();
  const t2 = tilesOf(s, 'T2');
  const tr = consist(s, t2.slice(0, 3), 'W'); // czoło tuż przed C2
  s.blocks.get('W').direction = 'out'; s.blocks.get('W').permission = true;
  setRoute(s, 'C2-W');
  run(s, 120);
  assert.ok(tr.onLine('W') || tr.finished, 'z przebiegiem wyjazdowym pociąg wyjeżdża');
});

test('W19: pociąg w trybie pociągowym bez przebiegu nie rusza – nie mija tarczy Tm1 na Ms1', () => {
  const s = sim();
  const tr = consist(s, [...tilesOf(s, 'T3')].reverse().slice(0, 3).reverse(), 'W'); // na torze 3, czołem do Tm1
  const head = tr.head;
  run(s, 60);
  assert.ok(tr.head - head < 1, `pociąg ruszył bez sygnału (${(tr.head - head).toFixed(1)} m)`);
  assert.ok(!tr.occupiedSections().has('T3w'), 'minął Tm1');
});

test('W3: skład manewrowy nie rusza, bo stoi na odcinku przebiegu manewrowego innej jazdy', () => {
  const s = sim();
  const t2 = tilesOf(s, 'T2');
  const tr = consist(s, t2.slice(4, 7), 'W', 'shunt'); // na torze 2, czołem do C2 (Ms1)
  setRoute(s, 'Tm1-Tm2'); // przebieg dla innej jazdy z toru 3 na tor 2
  const head = tr.head;
  run(s, 60);
  assert.ok(tr.head - head < 1, `skład ruszył bez Ms2 (${(tr.head - head).toFixed(1)} m)`);
});

test('W3: skład manewrowy rusza na Ms2 swojej tarczy / semafora i jedzie przebiegiem', () => {
  const s = sim();
  const tr = consist(s, [...tilesOf(s, 'T3')].reverse().slice(0, 3).reverse(), 'W', 'shunt');
  setRoute(s, 'Tm1-Tm2');
  run(s, 90);
  assert.ok(tr.occupiedSections().has('T2') || tr.occupiedSections().has('T2e'), 'skład pojechał przebiegiem na tor 2');
});

test('W1: przebieg manewrowy z semafora końcowego nie zastępuje drogi ochronnej przebiegu pociągowego', () => {
  // najpierw manewr z D2 (przez drogę ochronną T2e), potem wjazd A → D2 – odmowa: manewr nie zastępuje drogi ochronnej
  const s = sim();
  setRoute(s, 'D2-kT3m');
  const first = s.ilk.setRoute('A-D2');
  assert.equal(first.ok, false);
  assert.ok(first.codes.includes('overlap'), JSON.stringify(first.codes));
  // najpierw wjazd A → D2 (droga ochronna T2e), potem manewr z D2 przez drogę ochronną – odmowa
  const t = sim();
  setRoute(t, 'A-D2');
  const res = t.ilk.setRoute('D2-kT3m');
  assert.equal(res.ok, false);
  assert.ok(res.codes.includes('overlap'), JSON.stringify(res.codes));
  assert.deepEqual(t.ilk.active.get('A-D2').overlap, ['T2e'], 'droga ochronna wjazdu zostaje');
});

test('W33: Ms2 gaśnie dopiero, gdy cały skład minie sygnalizator (nie po wjeździe czoła)', () => {
  const s = sim();
  const tr = consist(s, [...tilesOf(s, 'T3')].reverse().slice(0, 4).reverse(), 'W', 'shunt');
  setRoute(s, 'Tm1-Tm2');
  let sawHeadPastWithMs2 = false;
  for (let i = 0; i < 400 && !(tr.occupiedSections().has('T3w') && !tr.occupiedSections().has('T3')); i++) {
    s.step(0.5);
    if (tr.occupiedSections().has('T3w') && tr.occupiedSections().has('T3')) {
      assert.equal(s.ilk.signals.get('Tm1').aspect, 'Ms2', 'czoło za tarczą, ogon jeszcze przed – Ms2 świeci');
      sawHeadPastWithMs2 = true;
    }
  }
  assert.ok(sawHeadPastWithMs2, 'skład przejeżdżał obok tarczy');
  run(s, 5);
  assert.equal(s.ilk.signals.get('Tm1').aspect, 'Ms1', 'po minięciu przez cały skład – Ms1');
});

test('W1: semafor przed semaforem wskazującym Ms2 zapowiada „Stój” (Ms2 nie jest sygnałem dla pociągu)', () => {
  // Gdynia Główna: przebieg S301 → G1 bez drogi ochronnej, z G1 manewr na Tm13
  const s = new Simulation(gdyniaGlowna, { scenario: { id: 't', name: 't', endTime: '23:00', trains: [] }, disruptions: 'none' });
  setRoute(s, 'G1-Tm13m');
  setRoute(s, 'S301-G1');
  assert.equal(s.ilk.signals.get('G1').aspect, 'Ms2');
  assert.equal(s.ilk.signals.get('S301').aspect, 'S5', 'następny semafor „Stój” dla pociągu – S5, nie S2');
});
