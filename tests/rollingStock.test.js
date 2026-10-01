import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ROLLING_STOCK, STOCK_KINDS, STOCK_LENGTH_TOLERANCE, candidatesFor, chainOf, stockFor } from '../src/model/rollingStock.js';
import { CATEGORIES, categoryOf, relationOf } from '../src/model/categories.js';
import { validateStation } from '../src/model/validate.js';
import { Simulation } from '../src/model/Simulation.js';
import { STATIONS } from '../src/stations/index.js';
import szkolna from '../src/stations/szkolna.js';

const POOLS = ['skm', 'regio', 'ic', 'eip', 'freight', 'shunt'];
const station = (id) => STATIONS.find((s) => s.id === id);
const entry = (st, nr) => st.timetable.find((e) => e.nr === nr);
/** Sekcja „Tabor pociągów” w docs/SOURCES.md. */
const sourcesSection = () => {
  const text = readFileSync(new URL('../docs/SOURCES.md', import.meta.url), 'utf8');
  const start = text.indexOf('## Tabor pociągów');
  assert.ok(start >= 0, 'docs/SOURCES.md: sekcja „Tabor pociągów”');
  const end = text.indexOf('\n## ', start + 5);
  return text.slice(start, end < 0 ? undefined : end);
};

test('katalog taboru: rodzaj, przewoźnik, pule, prędkość, długość zespołu; każdy typ ma źródło w docs/SOURCES.md', () => {
  const ids = Object.keys(ROLLING_STOCK);
  assert.ok(ids.length >= 10, `typów: ${ids.length}`);
  const section = sourcesSection();
  assert.match(section, /https?:\/\//, 'sekcja ze źródłami (adresy)');
  for (const id of ids) {
    const t = ROLLING_STOCK[id];
    assert.ok(STOCK_KINDS[t.kind], `${id}: rodzaj ${t.kind}`);
    assert.ok(typeof t.operator === 'string' && t.operator, `${id}: przewoźnik`);
    assert.ok(t.pools.every((p) => POOLS.includes(p)), `${id}: pule ${t.pools}`);
    assert.ok(t.vmax === null || t.vmax > 0, `${id}: prędkość (null – źródło jej nie podaje)`);
    if (STOCK_KINDS[t.kind].unit) {
      assert.ok(t.length > 0 && t.cars >= 1 && t.maxCount >= 1, `${id}: długość, człony i liczba zespołów`);
    } else {
      assert.equal(t.length, undefined, `${id}: lokomotywa bez długości zespołu`);
    }
    assert.ok(section.includes(id), `${id}: wpis w docs/SOURCES.md („Tabor pociągów”)`);
  }
  // pule: każda kategoria pasażerska i obie trakcje pociągów towarowych mają tabor
  for (const pool of POOLS) assert.ok(ids.some((id) => ROLLING_STOCK[id].pools.includes(pool)), `pula ${pool}`);
  for (const k of ['E', 'S']) assert.ok(ids.some((id) => ROLLING_STOCK[id].pools.includes('freight') && STOCK_KINDS[ROLLING_STOCK[id].kind].traction === k), `lokomotywy towarowe ${k}`);
});

test('dobór taboru: kategoria, trakcja i długość pociągu; ten sam tabor przy tym samym ziarnie', () => {
  const skm = { nr: 1, name: 'SKM Gdańsk Śródmieście – Wejherowo', kind: 'os', length: 130 };
  for (const s of candidatesFor(skm)) {
    const t = ROLLING_STOCK[s.id];
    assert.ok(t.pools.includes('skm') && t.kind === 'ezt', `SKM: ${s.id}`);
    assert.ok(Math.abs(s.count * t.length - 130) <= STOCK_LENGTH_TOLERANCE * 130, `SKM 130 m: ${s.count} × ${s.id}`);
  }
  // pociąg towarowy: lokomotywa o trakcji rodzaju pociągu (TME – elektryczna, TKS – spalinowa)
  const tm = { nr: 2, name: 'Towarowy', kind: 'tow', cat: 'TM', length: 500, mass: 2000 };
  const tks = { nr: 3, name: 'Towarowy (zdawczy)', kind: 'tow', cat: 'TK', traction: 'S', length: 220, mass: 400 };
  for (let seed = 1; seed <= 20; seed++) {
    assert.equal(stockFor(tm, [tm], seed).kind, 'lok-e');
    assert.equal(stockFor(tks, [tks], seed).kind, 'lok-s');
    assert.equal(stockFor(tm, [tm], seed).count, 1);
  }
  // pociągi dalekobieżne: zespół tylko wtedy, gdy mieści się w długości pociągu, inaczej lokomotywa
  const ic = { nr: 4, name: 'IC Warszawa Wsch. – Gdynia Gł.', kind: 'os', length: 300 };
  for (const s of candidatesFor(ic)) {
    const t = ROLLING_STOCK[s.id];
    assert.ok(t.pools.includes('ic'), s.id);
    if (STOCK_KINDS[t.kind].unit) assert.ok(s.diff <= STOCK_LENGTH_TOLERANCE * 300, `IC 300 m: ${s.count} × ${s.id}`);
  }
  // to samo ziarno – ten sam tabor; inne ziarna – na stacji różny tabor przynajmniej dla części pociągów
  const tt = station('sopot').timetable;
  const draw = (seed) => tt.map((e) => stockFor(e, tt, seed).label);
  assert.deepEqual(draw(7), draw(7));
  assert.notDeepEqual(draw(7), draw(8));
});

test('pociąg utworzony ze składu innego (unit) ma tabor pociągu, z którego powstał', () => {
  const pairs = [['szkolna', 90201, 90202], ['tczew', 55600, 55601], ['gdynia-glowna', 5100, 5101], ['gdansk-glowny', 44660, 44661], ['sopot', 91151, 91202], ['reda', 55700, 55701]];
  for (const [id, from, to] of pairs) {
    const tt = station(id).timetable;
    assert.equal(String(entry(station(id), to).unit), String(from), `${id}: ${to} ze składu ${from}`);
    for (let seed = 1; seed <= 30; seed++) assert.deepEqual(stockFor(entry(station(id), to), tt, seed), stockFor(entry(station(id), from), tt, seed), `${id}/${to}, ziarno ${seed}`);
  }
  // cały łańcuch: 3 pociągi jednego składu
  const a = { nr: 10, name: 'Regio A – B', kind: 'os', length: 130 }, b = { nr: 11, name: 'Regio B – A', kind: 'os', length: 130, unit: 10 }, c = { nr: 12, name: 'Regio A – B', kind: 'os', length: 130, unit: 11 };
  assert.deepEqual(chainOf(c, [a, b, c]), [a, b, c]);
  for (let seed = 1; seed <= 30; seed++) assert.deepEqual(stockFor(c, [a, b, c], seed), stockFor(a, [a, b, c], seed));
});

test('przypięty tabor (stock): typ albo lista typów; obowiązuje cały skład', () => {
  // dwa typy, które pasują do pociągu 130 m
  const [u1, u2] = candidatesFor({ nr: 20, name: 'Regio A – B', kind: 'os', length: 130 }).map((s) => s.id);
  assert.ok(u1 && u2);
  const one = { nr: 20, name: 'Regio A – B', kind: 'os', length: 130, stock: u1 };
  const heir = { nr: 21, name: 'Regio B – A', kind: 'os', length: 130, unit: 20 };
  const seen = new Set();
  for (let seed = 1; seed <= 30; seed++) {
    assert.equal(stockFor(one, [one, heir], seed).id, u1);
    assert.equal(stockFor(heir, [one, heir], seed).id, u1, 'przypięcie w pociągu, z którego skład powstał');
    seen.add(stockFor({ ...one, stock: [u1, u2] }, [], seed).id);
  }
  assert.deepEqual([...seen].sort(), [u1, u2].sort(), 'lista typów – losowanie z listy');
});

test('każdy pociąg na każdej stacji ma tabor; zespoły pasują długością, lokomotywy towarowe trakcją', () => {
  for (const st of STATIONS) {
    const tt = st.timetable;
    for (const e of tt) {
      for (const seed of [1, 2, 3]) {
        const s = stockFor(e, tt, seed);
        assert.ok(s, `${st.id}/${e.nr}: tabor`);
        const t = ROLLING_STOCK[s.id];
        const cat = CATEGORIES[categoryOf(e)];
        if (cat.tractions) assert.equal(STOCK_KINDS[t.kind].traction, e.traction ?? 'E', `${st.id}/${e.nr}: trakcja ${s.id}`);
        else assert.ok(!t.pools.includes('freight') || t.pools.length > 1, `${st.id}/${e.nr}: pociąg pasażerski bez lokomotywy towarowej (${s.id})`);
        if (STOCK_KINDS[t.kind].unit && !e.unit) {
          const len = e.length ?? 100;
          assert.ok(Math.abs(s.count * t.length - len) <= STOCK_LENGTH_TOLERANCE * len, `${st.id}/${e.nr}: ${s.label} (${(s.count * t.length).toFixed(1)} m) na ${len} m`);
        }
      }
    }
  }
});

test('kolejny pociąg tej samej linii ma inny tabor niż poprzedni, gdy pasuje więcej typów (ziarna 1–5)', () => {
  // linia: ta sama kategoria i te same szlaki wjazdu i wyjazdu; kolejność godzin; pociągi ze składu innego – jak tamten
  const lineKey = (e) => `${categoryOf(e)}|${e.from ?? ''}|${e.to ?? ''}`;
  const time = (e) => e.arr ?? e.dep;
  let checked = 0;
  for (const seed of [1, 2, 3, 4, 5]) {
    for (const st of STATIONS) {
      const tt = st.timetable;
      const lines = new Map();
      for (const e of tt) {
        if (e.unit != null && tt.some((x) => String(x.nr) === String(e.unit))) continue;
        if (!lines.has(lineKey(e))) lines.set(lineKey(e), []);
        lines.get(lineKey(e)).push(e);
      }
      for (const [key, list] of lines) {
        list.sort((a, b) => (time(a) < time(b) ? -1 : time(a) > time(b) ? 1 : 0));
        for (let i = 1; i < list.length; i++) {
          if (list[i].stock || candidatesFor(list[i]).length < 2) continue;
          const a = stockFor(list[i - 1], tt, seed), b = stockFor(list[i], tt, seed);
          assert.notEqual(b.id, a.id, `${st.id} ${key}, ziarno ${seed}: ${list[i - 1].nr} i ${list[i].nr} – ${a.label}`);
          checked++;
        }
      }
    }
  }
  assert.ok(checked > 100, `sprawdzone pary: ${checked}`);
  // przypięta lista typów też się zmienia: pociągi Hel – Reda nie mają tego samego zespołu
  const reda = station('reda');
  for (const seed of [1, 2, 3]) assert.notEqual(stockFor(entry(reda, 55702), reda.timetable, seed).id, stockFor(entry(reda, 55700), reda.timetable, seed).id);
});

test('tabor tylko do pokazania: dobór nie zużywa losowań zmiany', () => {
  const sim = new Simulation(szkolna, { scenario: 'zmiana', disruptions: 'high', seed: 5 });
  const state = sim.rng.state;
  for (const e of sim.traffic.timetable()) stockFor(e, sim.traffic.timetable(), sim.seed);
  assert.equal(sim.rng.state, state);
});

test('pociąg nadzwyczajny dodany w trakcie zmiany nie zmienia taboru pociągów z rozkładu', () => {
  const sopot = station('sopot');
  for (const seed of [1, 2, 3, 4, 5]) {
    const sim = new Simulation(sopot, { scenario: 'zmiana', seed });
    const tt = sim.traffic.timetable();
    const before = new Map(tt.map((e) => [e, stockFor(e, tt, seed).label]));
    // kopia pociągu SKM przesunięta w czasie – ta sama kategoria i szlaki (jak #planExtraTrains)
    const base = sopot.timetable.find((e) => e.nr === 91101);
    const extra = sim.traffic.addTrain({ ...base, nr: base.nr + 1000, name: `${base.name} nadzwyczajny`, arr: '07:20', dep: '07:21' });
    for (const [e, label] of before) assert.equal(stockFor(e, tt, seed).label, label, `ziarno ${seed}: ${e.nr}`);
    assert.ok(stockFor(extra, tt, seed), 'pociąg nadzwyczajny też ma tabor');
  }
});

test('walidacja pola stock: znany typ, trakcja pociągu towarowego, jeden tabor dla składu', () => {
  const base = { ...szkolna, timetable: [] };
  const errs = (...tt) => validateStation({ ...base, timetable: tt.map((e) => ({ from: 'W', to: 'E', arr: '07:00', track: '1', stop: false, ...e })) }).errors;
  const ids = Object.keys(ROLLING_STOCK);
  const unit = ids.find((id) => ROLLING_STOCK[id].kind === 'ezt');
  const unit2 = ids.filter((id) => ROLLING_STOCK[id].kind === 'ezt')[1];
  const locoE = ids.find((id) => ROLLING_STOCK[id].kind === 'lok-e' && ROLLING_STOCK[id].pools.includes('freight'));
  const locoS = ids.find((id) => ROLLING_STOCK[id].kind === 'lok-s' && ROLLING_STOCK[id].pools.includes('freight'));
  const os = { nr: 1, kind: 'os', name: 'Regio X – Y', length: 130 };
  const tow = { nr: 2, kind: 'tow', name: 'Towarowy', length: 400, mass: 1200 };
  assert.deepEqual(errs({ ...os, stock: unit }), []);
  assert.deepEqual(errs({ ...os, stock: [unit, unit2] }), []);
  assert.ok(errs({ ...os, stock: 'XX99' }).some((e) => /nieznany typ taboru XX99/.test(e)));
  assert.ok(errs({ ...os, stock: [] }).some((e) => /typ albo niepusta lista typów/.test(e)));
  assert.deepEqual(errs({ ...tow, stock: locoE }), []);
  assert.deepEqual(errs({ ...tow, traction: 'S', stock: locoS }), []);
  assert.ok(errs({ ...tow, traction: 'S', stock: locoE }).some((e) => new RegExp(`tabor ${locoE} \\(trakcja E\\) niezgodny z trakcją pociągu S`).test(e)));
  assert.ok(errs({ ...os, nr: 1, to: null, terminates: true, stock: unit }, { ...os, nr: 3, from: null, unit: 1, dep: '07:30', stock: unit2 })
    .some((e) => /tabor \(stock\) inny niż w pociągu 1 tego samego składu/.test(e)));
  assert.deepEqual(errs({ ...os, nr: 1, to: null, terminates: true, stock: unit }, { ...os, nr: 3, from: null, unit: 1, dep: '07:30' }), []);
  // stacje w grze: przypięcia poprawne
  for (const st of STATIONS) assert.deepEqual(validateStation(st).errors.filter((e) => /tabor|stock/.test(e)), [], st.id);
});
