import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/model/Simulation.js';
import { entryRun } from '../src/model/timetable/entryRun.js';
import { STATION_RUN, HALT_TIME } from '../src/model/timetable/entry.js';
import szkolna from '../src/stations/szkolna.js';
import olsztyn from '../src/stations/olsztyn-glowny.js';
import fixture from './fixtures/stare-pustkowie.js';

/*
 * Jazda od granicy pulpitu do toru planowego (`entryRun`): sąsiad wyprawia pociąg o tyle wcześniej niż przejazd szlaku.
 * Dawniej stałe 90 s (`STATION_RUN`) dla każdej stacji – na dużych stacjach pociąg przyjeżdżał po planie przy bezbłędnej
 * grze (Olsztyn Główny: 44603 do grupy towarowej ok. 4 min, Gdańsk Główny i Tczew 1–3 min).
 */

const simOf = (st) => new Simulation(st, { scenario: 'zmiana', disruptions: 'none', seed: 1 });

test('mała stacja: jazda od granicy pulpitu jak dotąd – STATION_RUN dla każdego pociągu', () => {
  for (const st of [szkolna, fixture]) {
    const sim = simOf(st);
    for (const def of st.timetable.filter((e) => e.from)) assert.equal(entryRun(sim.ilk, def), STATION_RUN, `${st.id} ${def.nr}`);
  }
});

test('duża stacja: jazda z układu – dłuższa droga i obraz „40” do zjechania całego pociągu z okręgu zwrotnicowego', () => {
  const sim = simOf(olsztyn);
  const def = (nr) => olsztyn.timetable.find((e) => e.nr === nr);
  // 44603: od Kortowa przez głowicę na tor 14 i drabinkę grupy do toru 214 (600 m) – ponad 4 min
  const group = entryRun(sim.ilk, def(44603));
  assert.ok(group >= 240, `44603: ${group} s`);
  // 5400 (TLK) na tor 2 z toru wjazdowego 353 – przez przejście (obraz „40”), dłużej niż 90 s, krócej niż do grupy
  const tlk = entryRun(sim.ilk, def(5400));
  assert.ok(tlk > STATION_RUN && tlk < group, `5400: ${tlk} s`);
  // przelot zatrzymuje liczenie na wjeździe na tor, pociąg z postojem jedzie jeszcze do peronu i hamuje
  assert.ok(entryRun(sim.ilk, { ...def(5400), stop: false }) < tlk);
  // dłuższy pociąg dłużej jedzie z „40” (cały musi zjechać z okręgu zwrotnicowego)
  assert.ok(entryRun(sim.ilk, { ...def(44603), length: 200 }) < group);
  // przystanki po drodze liczy osobno HALT_TIME – jazda bez nich ta sama
  const r = def(77200);
  assert.equal(entryRun(sim.ilk, r), entryRun(sim.ilk, { ...r, halts: [] }));
  // sąsiad wyprawia pociąg o przejazd szlaku, jazdę od granicy i postoje na przystankach przed torem wcześniej
  const e = sim.traffic.entry(77200), plain = simOf({ ...olsztyn, timetable: olsztyn.timetable.map((x) => (x.nr === 77200 ? { ...x, halts: [] } : x)) }).traffic.entry(77200);
  assert.equal(plain.neighbourDep - e.neighbourDep, HALT_TIME);
  // tor bez drogi wjazdu od tego szlaku – jak dotąd
  assert.equal(entryRun(sim.ilk, { ...def(44603), track: '999' }), STATION_RUN);
});
