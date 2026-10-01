import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/model/Simulation.js';
import { stopScatter, STOP_SCATTER } from '../src/model/Traffic.js';
import { platformRanges } from '../src/tiles/platforms.js';
import szkolna from '../src/stations/szkolna.js';
import { Clock } from '../src/core/Clock.js';
import { autoDispatch } from './helpers.js';

/*
 * Miejsce zatrzymania pociągu przy peronie – z układu stacji, bez danych per stacja. Ie-1 (2026) §17 ust. 15 pkt 4:
 * wskaźnik W 4 oznacza miejsce, do którego może dojechać czoło zatrzymującego się pociągu, i stoi przy końcu peronu
 * (albo przed ukresem). Gra nie rysuje W 4 – czoło staje przy końcu peronu (ten sam peron, który rysuje widok:
 * tiles/platforms.js), 0–10 m przed nim (rozrzut – maszynista nie staje co do metra). Dawniej pociąg jechał do końca
 * odcinka toru, 12 m przed semafor wyjazdowy (Szkolna: 6101 przy D1, 6102 przy C1 – numer pociągu przy semaforze).
 */
const run = ({ trains = [6101, 6102], seed = 1, timetable = null, until = '07:25', auto = true, onTick } = {}) => {
  const scenario = { id: 't', name: 't', endTime: '10:00', srk: 'komputerowe', ...(timetable ? { timetable } : { trains }) };
  const sim = new Simulation(szkolna, { scenario, disruptions: 'none', seed });
  const stops = new Map();
  let n = 0;
  while (sim.clock.time < Clock.parse(until)) {
    sim.step(0.5);
    if (auto && n++ % 4 === 0) autoDispatch(sim);
    onTick?.(sim);
    for (const tr of sim.traffic.trains) {
      if (!stops.has(tr.nr) && tr.hasStopped && tr.v === 0) { const t = tr.occupiedTiles(); stops.set(tr.nr, { head: t.at(-1).x, tail: t[0].x, at: tr.head, short: tr.stopShort }); }
    }
  }
  return { sim, stops };
};

test('zasięg peronu z układu stacji: Szkolna – peron I przy torach 1 i 2, kolumny 9–18 (jak na rysunku)', () => {
  assert.deepEqual(Object.fromEntries(platformRanges(szkolna)), { T1: { x0: 9, x1: 18 }, T2: { x0: 9, x1: 18 } });
});

test('rozrzut miejsca zatrzymania: 0–10 m przed końcem peronu, stały dla zmiany (powtórka), różny dla pociągów i zmian', () => {
  for (const seed of [1, 2, 3, 99]) for (const nr of [6101, 6102, 93202]) {
    const v = stopScatter(seed, nr);
    assert.ok(v >= 0 && v <= STOP_SCATTER, `${seed}/${nr}: ${v}`);
    assert.equal(stopScatter(seed, nr), v);
  }
  assert.ok(new Set([1, 2, 3, 4, 5, 6].map((s) => stopScatter(s, 6101).toFixed(2))).size >= 4, 'różne zmiany – różne miejsca');
  assert.notEqual(stopScatter(1, 6101), stopScatter(1, 6102));
});

test('Szkolna: 6101 (na wschód) i 6102 (na zachód) stają czołem przy końcu peronu, nie przy semaforach D1 / C1', () => {
  for (const seed of [1, 2, 3]) {
    const { sim, stops } = run({ seed });
    assert.equal(stops.get(6101)?.head, 18, `zmiana ${seed}: 6101 czołem na ostatniej kostce peronu (na wschód)`);
    assert.equal(stops.get(6102)?.head, 9, `zmiana ${seed}: 6102 czołem na ostatniej kostce peronu (na zachód)`);
    for (const e of sim.traffic.timetable()) assert.equal(e.status, 'na następnym posterunku', `zmiana ${seed}: ${e.nr} ${e.status}`);
  }
  const at = [1, 2, 3].map((seed) => run({ seed, trains: [6101], until: '07:10' }).stops.get(6101).at.toFixed(1));
  assert.ok(new Set(at).size >= 2, `miejsce zatrzymania różne w różnych zmianach: ${at}`);
});

test('pociąg po godzinie odjazdu bez przebiegu wyjazdowego stoi przy peronie – nie podjeżdża pod semafor na „Stój”', () => {
  // 6101: pozwolenie, przebieg A → D1, bez przebiegu wyjazdowego D1 → Dębno
  const { sim, stops } = run({ trains: [6101], auto: false, until: '07:15', onTick: (s) => {
    const W = s.blocks.get('W'); if (W.request === 'theirs') W.press('Poz');
    const e = s.traffic.timetable()[0];
    if (!e.train?.entered && !s.ilk.active.size && !s.ilk.pending.length && W.direction === 'in') s.execute({ type: 'route', start: 'A', end: 'D1', kind: 'train' });
  } });
  const tr = sim.traffic.trains.find((t) => t.nr === 6101);
  assert.equal(stops.get(6101).head, 18);
  assert.equal(tr.v, 0);
  assert.equal(tr.head, stops.get(6101).at, 'czoło w miejscu zatrzymania przy peronie (odjazd 07:08 minął)');
  assert.equal(sim.ilk.signals.get('D1').aspect, 'S1');
});

test('pociąg dłuższy, niż mieści odcinek toru za końcem peronu: staje jak dotąd przed semaforem (tył nie na rozjazdach)', () => {
  const def = szkolna.timetable.find((t) => t.nr === 6101);
  const { stops } = run({ timetable: [{ ...def, length: 400 }], until: '07:12' });
  const s = stops.get(6101);
  assert.ok(s && s.head > 18, `400 m: czoło za peronem, przed D1 (kostka ${s?.head})`);
  assert.ok(s.tail >= 7, 'cały pociąg na torze 1');
});
