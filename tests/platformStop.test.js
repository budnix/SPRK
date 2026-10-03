import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/model/Simulation.js';
import { stopScatter, STOP_SCATTER } from '../src/model/Traffic.js';
import { platformRanges } from '../src/tiles/platforms.js';
import szkolna from '../src/stations/szkolna.js';
import { Clock } from '../src/core/Clock.js';
import { PLATFORM_STOP } from '../src/model/Train.js';
import zacisze from '../src/stations/zacisze.js';
import { autoDispatch, play, setRoutes, routesBeingSet, grant } from './helpers.js';

/*
 * Miejsce zatrzymania pociągu przy peronie – z układu stacji, bez danych per stacja. Ie-1 (2026) §17 ust. 15 pkt 4:
 * wskaźnik W 4 oznacza miejsce, do którego może dojechać czoło zatrzymującego się pociągu, i stoi przy końcu peronu
 * (albo przed ukresem) – to granica, nie cel. Gra nie rysuje W 4 (peron ten sam, który rysuje widok: tiles/platforms.js).
 * Przyjęte (docs/sources/jazda-pociagu.md „Zatrzymanie, odjazd i hamowanie”, punkt „Miejsce zatrzymania
 * przy peronie”): pociąg staje wzdłuż peronu, nie przy samym końcu –
 * czoło na 3/4 peronu (PLATFORM_STOP), pociąg dłuższy niż połowa peronu na środku peronu, 0–10 m wcześniej (rozrzut);
 * najdalej przy końcu peronu jak dotąd; tor czołowy – przy końcu peronu (dojazd do kozła). Dawniej czoło zawsze przy
 * końcu peronu, a jeszcze wcześniej – 12 m przed semaforem wyjazdowym (Szkolna: 6101 przy D1, 6102 przy C1).
 */
const run = ({ trains = [6101, 6102], seed = 1, timetable = null, until = '07:25', auto = true, onTick } = {}) => {
  const scenario = { id: 't', name: 't', endTime: '10:00', srk: 'komputerowe', ...(timetable ? { timetable } : { trains }) };
  const sim = new Simulation(szkolna, { scenario, disruptions: 'none', seed });
  const stops = new Map();
  play(sim, auto ? autoDispatch : null).until(until, { each: () => {
    onTick?.(sim);
    for (const tr of sim.traffic.trains) {
      if (!stops.has(tr.nr) && tr.hasStopped && tr.v === 0) { const t = tr.occupiedTiles(); stops.set(tr.nr, { head: t.at(-1).x, tail: t[0].x, at: tr.head, short: tr.stopShort }); }
    }
  } });
  return { sim, stops };
};

/**
 * Kostka czoła wg reguły: odcinek `section` w rzędzie `y`, jazda na wschód (`east`) albo zachód; peron od p0 do p1
 * (kolumny z platformRanges), czoło na p0 + max(PLATFORM_STOP · Lp, (Lp + L) / 2) − rozrzut, nie bliżej niż L + 5 m od
 * początku odcinka.
 */
function ruleHead(sim, { section, y, east, length, short }) {
  const topo = sim.ilk.topo, r = platformRanges(sim.station).get(section);
  const row = [...Array(60).keys()].map((x) => topo.trackAt(x, y)).filter((t) => t?.section === section && t.type !== 'buffer').sort((a, b) => (east ? a.x - b.x : b.x - a.x));
  let pos = 0, p0 = null, p1 = null; const span = [];
  for (const t of row) { if (t.x >= r.x0 && t.x <= r.x1) { p0 ??= pos; p1 = pos + t._len; } span.push([t.x, pos, pos + t._len]); pos += t._len; }
  const Lp = p1 - p0;
  const at = Math.max(p0 + Math.max(PLATFORM_STOP * Lp, (Lp + length) / 2) - short, length + 5);
  return { tile: span.find(([, a, b]) => at > a && at <= b)[0], at, p0, p1 };
}

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

test('Szkolna: 6101 (na wschód) i 6102 (na zachód) stają czołem na 3/4 peronu – nie przy końcu peronu ani przy semaforach D1 / C1', () => {
  for (const seed of [1, 2, 3]) {
    const { sim, stops } = run({ seed });
    for (const [nr, east] of [[6101, true], [6102, false]]) {
      const s = stops.get(nr), want = ruleHead(sim, { section: 'T1', y: 4, east, length: 130, short: s.short });
      assert.equal(s.head, want.tile, `zmiana ${seed}: ${nr} czołem na kostce ${want.tile} (${Math.round(want.at - want.p0)} m od wejścia na peron)`);
      assert.ok(east ? s.head < 18 : s.head > 9, `zmiana ${seed}: ${nr} nie przy samym końcu peronu`);
    }
    for (const e of sim.traffic.timetable()) assert.equal(e.phase, 'at-neighbour', `zmiana ${seed}: ${e.nr} ${e.status}`);
  }
  const at = [1, 2, 3].map((seed) => run({ seed, trains: [6101], until: '07:10' }).stops.get(6101).at.toFixed(1));
  assert.ok(new Set(at).size >= 2, `miejsce zatrzymania różne w różnych zmianach: ${at}`);
});

test('pociąg po godzinie odjazdu bez przebiegu wyjazdowego stoi przy peronie – nie podjeżdża pod semafor na „Stój”', () => {
  // 6101: pozwolenie, przebieg A → D1, bez przebiegu wyjazdowego D1 → Dębno
  const { sim, stops } = run({ trains: [6101], auto: false, until: '07:15', onTick: (s) => {
    const W = s.blocks.get('W'); grant('W')(s);
    const e = s.traffic.timetable()[0];
    if (!e.train?.entered && !setRoutes(s.ilk).length && !routesBeingSet(s.ilk).length && W.direction === 'in') s.execute({ type: 'route', start: 'A', end: 'D1', kind: 'train' });
  } });
  const tr = sim.traffic.trains.find((t) => t.nr === 6101);
  assert.equal(stops.get(6101).head, ruleHead(sim, { section: 'T1', y: 4, east: true, length: 130, short: tr.stopShort }).tile);
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

test('pociąg dłuższy niż połowa peronu staje na środku peronu (Szkolna, tor 1: 200 i 280 m)', () => {
  const def = szkolna.timetable.find((t) => t.nr === 6101);
  for (const length of [200, 280]) {
    const { sim, stops } = run({ timetable: [{ ...def, length }], until: '07:12' });
    const s = stops.get(6101), want = ruleHead(sim, { section: 'T1', y: 4, east: true, length, short: s.short });
    assert.equal(s.head, want.tile, `${length} m: czoło na kostce ${want.tile}`);
    assert.ok(want.at - want.p0 > PLATFORM_STOP * (want.p1 - want.p0), `${length} m: dalej niż 3/4 peronu – pociąg na środku peronu`);
    assert.ok(s.tail >= 7, `${length} m: cały pociąg na torze 1 (tył na kostce ${s.tail})`);
  }
});

test('peron od samego początku odcinka (Szkolna, tor 2): pociąg prawie tak długi jak peron staje dalej – tył na torze 2, nie na T2w przy rozjeździe', () => {
  // 250 m przy peronie 254 m: środek peronu zostawiłby tył kilka metrów na T2w (kostka 8, przed Zw1) – czoło idzie dalej
  const def = szkolna.timetable.find((t) => t.nr === 6103);
  for (const seed of [4, 7]) {
    const { stops } = run({ seed, timetable: [{ ...def, length: 250 }], until: '07:46' });
    const s = stops.get(6103);
    assert.ok(s, `ziarno ${seed}: 6103 stanął`);
    assert.ok(s.tail >= 9 && s.head <= 19, `ziarno ${seed}: cały pociąg na T2 (kostki ${s.tail}–${s.head})`);
  }
});

test('tor czołowy (Zacisze, kozioł za peronem): pociąg dojeżdża do końca peronu jak dotąd', () => {
  const sc = zacisze.scenarios.find((x) => x.id === 'zmiana-lcs');
  const sim = new Simulation(zacisze, { scenario: sc, disruptions: 'none', seed: 1 });
  let stop = null;
  play(sim).until('07:30', { stop: () => Boolean(stop), each: () => {
    const tr = sim.traffic.trains.find((t) => t.nr === 7101);
    if (tr?.hasStopped && tr.v === 0) stop = tr.occupiedTiles().at(-1).x;
  } });
  assert.equal(stop, 24, 'czoło na ostatniej kostce peronu, przed kozłem');
});
