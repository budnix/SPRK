import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/model/Simulation.js';
import { STATIONS } from '../src/stations/index.js';
import { Clock } from '../src/core/Clock.js';
import { validateStation } from '../src/model/validate.js';
import { checkScenario } from '../src/model/scenarioCheck.js';
import { NAMED_TRAINS } from '../src/model/data/namedTrains.js';
import { cityOf, namedTrainsVia, namedTrainTitle } from '../src/model/namedTrains.js';
import { categoryOf, relationOf } from '../src/model/categories.js';
import {
  DAY_BANDS, DUTY_EDGE, DUTY_ID, DUTY_MINUTES, DUTY_SHIFT, FREIGHT_GAP, SERVICE_NR, SERVICE_RUNS, bandOf, closableTracks, buildDuty, hasDuty, normalizeDuty, patternPeriod, trainClass,
} from '../src/model/duty.js';
import { shiftChoices, srkChoosable, isTraining } from '../src/model/shift/offers.js';
import sopot from '../src/stations/sopot.js';
import pruszcz from '../src/stations/pruszcz-gdanski.js';
import rumia from '../src/stations/rumia.js';
import szkolna from '../src/stations/szkolna.js';
import wola from './fixtures/wola-pustkowska.js';
import { DAY_TYPES, WORKS, calendarLabel, normalizeCalendar, resolveCalendar, seasideTrain } from '../src/model/timetable/calendar.js';
import { seedFraction } from '../src/core/Random.js';
import reda from '../src/stations/reda.js';
import tczew from '../src/stations/tczew.js';
import olsztyn from '../src/stations/olsztyn-glowny.js';

/*
 * Służba o wybranej porze i długości (`src/model/duty.js`): rozkład budowany z wzorca stacji – bez danych per stacja,
 * więc każdy posterunek do służby (także nowy) ma ją od razu. Siatkę wszystkich stacji sprawdza `tests/duty-grid.js`.
 */
const duty = STATIONS.filter((st) => !isTraining(st) && hasDuty(st));
const at = (hm) => Clock.parse(hm);
const first = (e) => at(e.arr || e.dep), last = (e) => at(e.dep || e.arr);
const perHour = (stats, minutes) => ({ pass: (stats.agl + stats.reg + stats.dal) * 60 / minutes, tow: stats.tow * 60 / minutes });

test('pory doby pokrywają całą dobę bez przerw; klasy pociągów z kategorii', () => {
  assert.equal(DAY_BANDS[0].from, 0);
  assert.equal(DAY_BANDS.at(-1).to, 24);
  for (let i = 1; i < DAY_BANDS.length; i++) assert.equal(DAY_BANDS[i].from, DAY_BANDS[i - 1].to, DAY_BANDS[i].id);
  for (const b of DAY_BANDS) { assert.deepEqual(Object.keys(b.every).sort(), ['agl', 'dal', 'reg', 'tow']); assert.ok(b.freight >= 0 && b.freight <= 1); }
  assert.equal(bandOf(at('06:00')).id, 'szczyt-rano');
  assert.equal(bandOf(at('03:59')).id, 'noc');
  assert.equal(bandOf(at('23:30')).id, 'pozny-wieczor');
  assert.equal(bandOf(at('24:00')).id, 'noc', 'po północy od nowa');
  assert.deepEqual(['SKM Gdańsk – Wejherowo', 'Regio Gdańsk – Słupsk', 'IC „Kaszub” Kraków – Gdynia', 'TLK Hel – Warszawa'].map((name) => trainClass({ name, kind: 'os' })), ['agl', 'reg', 'dal', 'dal']);
  assert.equal(trainClass({ name: 'Towarowy', kind: 'tow', cat: 'TM' }), 'tow');
  assert.equal(trainClass({ name: 'Lokomotywa luzem', kind: 'tow' }), 'tow');
});

test('długości służby: 1, 2, 3 i 5 h od każdej pełnej godziny; parametry z adresu sprowadzone do dozwolonych', () => {
  assert.deepEqual(DUTY_MINUTES, [60, 120, 180, 300]);
  assert.deepEqual(normalizeDuty('22', '120'), { start: 22, minutes: 120 });
  assert.deepEqual(normalizeDuty('23', '180'), { start: 23, minutes: 180 });
  assert.deepEqual(normalizeDuty(null, null), { start: 6, minutes: 120 });
  assert.deepEqual(normalizeDuty('25', 'x'), { start: 6, minutes: 120 });
  assert.deepEqual(normalizeDuty('7.5', '45'), { start: 6, minutes: 120 });
  assert.throws(() => buildDuty(sopot, { start: 23, minutes: 90 }), /długość 90 min – do wyboru 60, 120, 180, 300/);
  assert.throws(() => buildDuty(sopot, { start: 24, minutes: 60 }), /pełna godzina 0–23/);
});

test('służba przez północ: w danych godziny po północy to 24, 25… (ta sama zmiana trwa dalej), na zegarze i w rozkładzie – 00:…, 01:…', () => {
  assert.equal(Clock.stamp(at('23:59') + 120), '24:01');
  assert.equal(Clock.parse('25:30'), 25.5 * 3600);
  assert.equal(Clock.format(Clock.parse('25:30')), '01:30');
  const { scenario: sc, stats } = buildDuty(sopot, { start: 23, minutes: 180, seed: 4 });
  assert.equal(sc.name, `Służba 23:00–02:00 (${calendarLabel(stats)})`);
  assert.deepEqual([sc.startTime, sc.endTime], ['23:00', '26:00']);
  const after = sc.timetable.filter((e) => first(e) >= 86400);
  assert.ok(after.length >= 3 && after.length < stats.trains, `po północy ${after.length} z ${stats.trains} pociągów`);
  assert.ok(after.every((e) => /^2[4-5]:\d\d$/.test(e.arr ?? e.dep)), after.map((e) => e.arr ?? e.dep).join(' '));
  assert.deepEqual(checkScenario(sopot, sc).filter((f) => f.level === 'error'), []);
  // symulacja: chwile liczone dalej (bez zawijania), godziny pokazywane jak na zegarze; koniec zmiany o 02:00
  const sim = new Simulation(sopot, { scenario: sc, disruptions: 'none', seed: 4 });
  assert.equal(sim.endTime, 26 * 3600);
  const entry = sim.traffic.timetable().find((e) => e.arrTime >= 86400);
  assert.match(entry.arr, /^0[01]:\d\d$/, `rozkład pokazuje ${entry.arr}`);
  assert.equal(entry.arrTime, at(after.find((e) => e.nr === entry.nr).arr));
  assert.ok(sim.traffic.timetable().every((e, i, all) => i === 0 || (e.arrTime ?? e.depTime) >= (all[i - 1].arrTime ?? all[i - 1].depTime)), 'kolejność wg chwili, nie napisu');
  // pora doby po północy to noc: bez pociągów aglomeracyjnych i regionalnych
  assert.ok(after.every((e) => !['agl', 'reg'].includes(trainClass(e))), after.map((e) => `${e.nr}:${trainClass(e)}`).join(' '));
});

test('scenariusz służby: nazwa z godzinami, okno, własny rozkład w oknie, numery bez powtórzeń, składy w całości', () => {
  for (const [start, minutes] of [[6, 120], [15, 180], [21, 180], [23, 60], [0, 180], [22, 180]]) {
    const { scenario: sc, stats } = buildDuty(sopot, { start, minutes, seed: 7 });
    const t0 = start * 3600, t1 = t0 + minutes * 60;
    assert.equal(sc.id, `${DUTY_ID}-${minutes}`);
    assert.equal(sc.name, `Służba ${Clock.format(t0)}–${Clock.format(t1)} (${calendarLabel(stats)})`);
    assert.deepEqual([sc.startTime, sc.endTime], [Clock.stamp(t0), Clock.stamp(t1)]);
    assert.equal(stats.trains, sc.timetable.length);
    assert.equal(stats.agl + stats.reg + stats.dal + stats.tow, stats.trains);
    assert.equal(stats.band, bandOf(t0).id);
    assert.match(sc.description, /Pociągi: \d+/);
    const nrs = sc.timetable.map((e) => e.nr);
    assert.equal(new Set(nrs).size, nrs.length, `${sc.name}: numery`);
    for (const e of sc.timetable) {
      assert.ok(first(e) >= t0 + DUTY_EDGE.start && last(e) <= t1 - DUTY_EDGE.end, `${sc.name}: ${e.nr} ${e.arr ?? ''}–${e.dep ?? ''}`);
      if (e.unit != null) assert.ok(nrs.includes(e.unit), `${sc.name}: skład ${e.unit} pociągu ${e.nr}`);
      assert.ok(!nrs.includes(e.nr + 1000), `${sc.name}: ${e.nr} + 1000 wolne dla pociągu nadzwyczajnego`);
    }
    for (const task of sc.tasks) {
      assert.ok(nrs.includes(task.unit), `${sc.name}: zadanie ${task.id} bez składu`);
      if (task.afterTask) assert.ok(sc.tasks.some((x) => x.id === task.afterTask), `${sc.name}: ${task.id} po ${task.afterTask}`);
      assert.ok(at(task.deadline) > t0 && at(task.deadline) <= t1, `${sc.name}: termin ${task.deadline}`);
    }
    assert.equal(new Set(sc.tasks.map((x) => x.id)).size, sc.tasks.length);
  }
});

test('zadanie manewrowe przesunięte z grupą: terminy, numery i godziny w treści', () => {
  // Sopot: skład SKM 91151 (wzorzec 06:52) odstawiany i podstawiany jako 91202 – w popołudniowym powtórzeniu wzorca
  const found = [1, 2, 3, 4, 5, 6, 7, 8].map((seed) => buildDuty(sopot, { start: 14, minutes: 180, seed }).scenario).find((sc) => sc.tasks.some((x) => x.id.startsWith('podstaw-91202@')));
  assert.ok(found, 'popołudniowa służba z grupą 91151');
  const task = found.tasks.find((x) => x.id.startsWith('podstaw-91202@'));
  const unit = found.timetable.find((e) => e.nr === task.unit), next = found.timetable.find((e) => e.unit === task.unit);
  assert.ok(unit && next, 'skład i pociąg ze składu');
  assert.equal(task.afterTask, task.id.replace('podstaw-91202', 'odstaw-91151'));
  assert.ok(at(task.after) < at(task.deadline) && at(task.deadline) < at(next.dep));
  assert.ok(task.text.includes(String(next.nr)) && task.text.includes(next.dep), task.text);
  assert.ok(!task.text.includes('07:25') && !task.text.includes('91202 '), task.text);
});

test('powtórzenie pociągu dalekobieżnego to pociąg z listy pociągów z nazwami, który jedzie tą samą drogą – nazwa z własną relacją', () => {
  // wzorzec o swojej porze zostaje: Sopot, IC „Kaszub” 5100 o 06:42
  const morning = [1, 2, 3, 4].map((seed) => buildDuty(sopot, { start: 6, minutes: 120, seed }).scenario);
  assert.ok(morning.some((sc) => sc.timetable.some((e) => e.nr === 5100 && e.name === 'IC „Kaszub” Kraków Gł. – Gdynia Gł.')), 'rano – pociąg wzorca');
  const titles = new Map(NAMED_TRAINS.map((t) => [namedTrainTitle(t), t]));
  const seen = new Set();
  let renamed = 0;
  for (const st of duty) for (const start of [9, 14, 19, 22, 1]) for (const seed of [1, 2]) {
    const sc = buildDuty(st, { start, minutes: 180, seed }).scenario;
    const dal = sc.timetable.filter((e) => trainClass(e) === 'dal');
    for (const e of dal) {
      const t = titles.get(e.name);
      if (!t) continue; // relacja bez pociągu na liście – nazwa wzorca
      renamed++; seen.add(t.name);
      // pociąg z listy jedzie przez stację w tę samą stronę co pociąg wzorca: przez miasto początku, potem końca relacji
      // pociąg wzorca: ta sama droga przez stację i te same dane składu (długość, tabor, prędkość zostają z wzorca)
      const base = st.timetable.find((x) => trainClass(x) === 'dal' && x.from === e.from && x.to === e.to && x.track === e.track && namedTrainsVia(...relationOf(x).split(' – ')).includes(t)
        && x.length === e.length && x.stock === e.stock && x.vmax === e.vmax);
      assert.ok(base, `${st.id} ${sc.name}: ${e.name} bez pociągu wzorca tej drogi`);
      if (!e.to) assert.equal(cityOf(t.stops.at(-1)), cityOf(relationOf(base).split(' – ')[1]), `${st.id}: ${e.name} kończy bieg tutaj`);
      assert.ok(['EIP', 'EIC', 'IC', 'TLK'].includes(t.cat) && e.name.startsWith(`${t.cat} „`));
      // EIP (zespół trakcyjny) zastępuje tylko EIP, pociągi wagonowe (EIC, IC, TLK) – siebie nawzajem
      assert.equal(t.cat === 'EIP', categoryOf(base) === 'EIP', `${st.id}: ${e.name} za ${base.name}`);
      assert.equal(categoryOf(e), t.cat);
    }
    // w jednej służbie nazwa nie wraca w tym samym kierunku
    const dir = dal.filter((e) => titles.has(e.name)).map((e) => `${titles.get(e.name).name}|${e.from ?? ''}`);
    assert.equal(new Set(dir).size, dir.length, `${st.id} ${sc.name}: ${dir.join(', ')}`);
  }
  assert.ok(renamed > 80 && seen.size >= 15, `pociągi z listy: ${renamed}, różnych nazw ${seen.size}`);
  // ten sam pociąg (numer wzorca i powtórzenie) ma tę samą nazwę na każdej stacji na trasie i w każdej służbie
  const one = (st, start) => buildDuty(st, { start, minutes: 180, seed: 1 }).scenario.timetable.find((e) => e.nr === 5500)?.name;
  assert.equal(one(sopot, 14), one(sopot, 13));
  assert.match(one(sopot, 14), /^(EIP|EIC|IC|TLK) „[^”]+” .+ – .+$/);
  // relacja bez pociągów na liście (stacja fikcyjna) – nazwa wzorca bez zmian
  const names = new Set(szkolna.timetable.map((e) => e.name));
  for (const e of buildDuty(szkolna, { start: 15, minutes: 180, seed: 1 }).scenario.timetable) if (e.kind !== 'tow') assert.ok(names.has(e.name), e.name);
});

test('to samo ziarno – ten sam rozkład; inne ziarno – inny (każda służba trochę inna)', () => {
  const tt = (station, start, minutes, seed) => buildDuty(station, { start, minutes, seed }).scenario.timetable.map((e) => `${e.nr}@${e.arr ?? e.dep}`).join(' ');
  for (const [station, start, minutes] of [[sopot, 6, 120], [sopot, 22, 120], [pruszcz, 1, 180], [rumia, 10, 120]]) {
    assert.equal(tt(station, start, minutes, 5), tt(station, start, minutes, 5));
    const variants = new Set([1, 2, 3, 4, 5, 6].map((seed) => tt(station, start, minutes, seed)));
    assert.ok(variants.size >= 4, `${station.id} ${start}:00 / ${minutes} min: ${variants.size} różnych rozkładów na 6 ziaren`);
  }
});

test('przesunięcie linii: każdy kurs linii w służbie o tyle samo minut (0–3, z ziarna) – takt zostaje, minuty zmieniają się między służbami', () => {
  // wzorzec co godzinę: dwie linie regionalne Pruszcza (do Tczewa :03, do Gdańska :12); służba w szczycie – każdy kurs jedzie
  const base = { 55301: '06:03', 55300: '06:12' };
  const two = { ...pruszcz, tasks: [], timetable: pruszcz.timetable.filter((e) => base[e.nr]) };
  assert.equal(patternPeriod(two), 3600);
  const offsets = { 55301: new Set(), 55300: new Set() };
  let apart = 0, takt = 0;
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) {
    const { scenario } = buildDuty(two, { start: 6, minutes: 180, seed });
    const runs = scenario.timetable.filter((e) => e.kind === 'os' && e.cat !== 'EZT'); // bez próżnego składu (przejazd służbowy)
    const shift = {};
    for (const nr of Object.keys(base)) {
      const own = runs.filter((e) => e.from === two.timetable.find((x) => String(x.nr) === nr).from);
      assert.ok(own.length >= 1, `ziarno ${seed}: linia ${nr} bez kursu`);
      if (own.length >= 2) takt++;
      // przesunięcie kursu względem wzorca [min] – w obrębie okresu (kursy co godzinę)
      const mins = new Set(own.map((e) => ((((at(e.arr) - at(base[nr])) / 60) % 60) + 60) % 60));
      assert.equal(mins.size, 1, `ziarno ${seed}: linia ${nr} – każdy kurs o tyle samo (${[...mins]})`);
      const [m] = mins;
      assert.ok(m >= 0 && m <= 3, `ziarno ${seed}: linia ${nr} przesunięta o ${m} min`);
      offsets[nr].add(m); shift[nr] = m;
    }
    if (shift[55301] !== shift[55300]) apart++;
  }
  for (const [nr, set] of Object.entries(offsets)) assert.ok(set.size >= 3, `linia ${nr}: przesunięcia ${[...set]} na 12 ziaren`);
  assert.ok(apart >= 4, `linie przesunięte niezależnie: różne przesunięcia w ${apart} z 12 służb`);
  assert.ok(takt >= 12, `takt sprawdzony na ${takt} liniach z co najmniej dwoma kursami`);
});

test('pociąg towarowy w wolnej luce: nie tylko w minucie pociągu, który zastępuje – w oknie ±30 min, z odstępem na szlaku', () => {
  // wzorzec co godzinę: jeden pociąg regionalny Pruszcza do Tczewa (:03); nocą nie kursuje – w jego miejsce towarowe
  const one = { ...pruszcz, tasks: [], timetable: pruszcz.timetable.filter((e) => e.nr === 55301) };
  const [e] = one.timetable;
  const line = (exit, v) => (one.exits[exit].lineLength ?? 3000) / (Math.min(v, one.exits[exit].lineSpeed ?? v) / 3.6);
  const minutes = [];
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) {
    const { scenario } = buildDuty(one, { start: 1, minutes: 180, seed });
    const tow = scenario.timetable.filter((x) => x.kind === 'tow').sort((a, b) => first(a) - first(b));
    for (const x of tow) {
      assert.deepEqual([x.from, x.to, x.track], [e.from, e.to, e.track], `ziarno ${seed}: ${x.nr} drogą zastępowanego pociągu`);
      minutes.push(((first(x) / 60) % 60 + 60) % 60);
    }
    // odstęp na szlaku: czas przejazdu szlaku i FREIGHT_GAP (wjazd i wyjazd tą samą drogą)
    for (let i = 1; i < tow.length; i++) {
      const need = Math.max(line(e.from, tow[i].vmax), line(e.to, tow[i].vmax)) + FREIGHT_GAP;
      assert.ok(first(tow[i]) - first(tow[i - 1]) >= need, `ziarno ${seed}: ${tow[i - 1].nr} ${tow[i - 1].arr} i ${tow[i].nr} ${tow[i].arr}`);
    }
  }
  assert.ok(minutes.length >= 12, `${minutes.length} pociągów towarowych na 12 służb`);
  // dawniej każdy w minucie zastępowanego pociągu (:03 + przesunięcie linii 0–3 min)
  const away = minutes.filter((m) => m < 3 || m > 3 + DUTY_SHIFT);
  assert.ok(away.length >= minutes.length / 2, `poza minutą zastępowanego: ${away.length} z ${minutes.length} (${minutes.join(' ')})`);
  assert.ok(new Set(minutes).size >= 8, `różne minuty: ${[...new Set(minutes)].sort((a, b) => a - b).join(' ')}`);
});

test('pociąg towarowy nie przejeżdża przez tor, na którym stoi skład na zmianę czoła (od przyjazdu do odjazdu następcy)', () => {
  // Olsztyn Główny: Regio z Iławy kończy bieg na torze 1 (:12), jego skład odjeżdża z niego (:48); tor 1 to też droga
  // towarowego przelotu Kortowo – Łęgajny. Dawniej luka liczona od każdego pociągu osobno (:12 i :48) – towarowy w środku
  // postoju (np. 06:00 ziarno 1: o 07:23) stał przed C, aż skład odjechał
  let passes = 0;
  for (const start of [6, 10, 14, 19]) for (const seed of [1, 2, 3, 4]) {
    const tt = buildDuty(olsztyn, { start, minutes: 180, seed }).scenario.timetable;
    const stands = tt.filter((e) => e.terminates).flatMap((e) => {
      const next = tt.find((x) => x.unit === e.nr && String(x.track) === String(e.track));
      return next ? [{ T: String(e.track), a: at(e.arr), b: at(next.dep), nr: e.nr }] : [];
    });
    for (const e of tt.filter((x) => !x.stop && x.from && x.to && x.unit == null)) {
      passes++;
      const s = stands.find((x) => x.T === String(e.track) && x.a < at(e.arr) && at(e.arr) < x.b);
      assert.ok(!s, `${start}:00 ziarno ${seed}: przelot ${e.nr} ${e.arr} po torze ${e.track} w czasie postoju ${s?.nr}`);
    }
  }
  assert.ok(passes >= 16, `${passes} przelotów`);
});

test('przejazdy służbowe: co któraś służba ma lokomotywę luzem, próżny skład EZT albo próżne wagony – drogą przelotu wzorca, w wolnej luce', () => {
  const runs = { LT: 0, EZT: 0, TS: 0 };
  let duties = 0, hours = 0;
  for (const st of duty) {
    const through = st.timetable.filter((e) => e.from && e.to && !e.terminates && !e.startOn && e.unit == null);
    for (const start of [0, 6, 11, 16, 20]) for (const seed of [1, 2, 3]) {
      const { scenario } = buildDuty(st, { start, minutes: 300, seed });
      duties++; hours += 5;
      const own = scenario.timetable.filter((e) => e.nr >= SERVICE_NR && e.nr < SERVICE_NR + 1000);
      assert.ok(own.length <= 5, `${st.id} ${scenario.name}: ${own.length} przejazdów służbowych w 5 h`);
      for (const e of own) {
        const key = `${st.id} ${scenario.name}, ziarno ${seed}: ${e.nr} ${e.name} ${e.arr}`;
        assert.ok(SERVICE_RUNS.some((r) => r.cat === e.cat && r.kind === e.kind), key);
        runs[e.cat]++;
        // droga przelotu wzorca; lokomotywa i wagony – nie po linii aglomeracyjnej, skład EZT – nie nocą
        const ways = through.filter((x) => x.from === e.from && x.to === e.to && x.track === e.track);
        assert.ok(ways.length, `${key}: droga spoza wzorca`);
        if (e.kind === 'tow') assert.ok(ways.some((x) => trainClass(x) !== 'agl'), `${key}: po linii SKM`);
        else assert.ok(ways.some((x) => bandOf(first(e)).every[trainClass(x)] > 0), `${key}: o porze bez pociągów pasażerskich tej linii`);
        assert.equal(e.stop, false, key);
      }
    }
  }
  const total = runs.LT + runs.EZT + runs.TS;
  assert.ok(total >= hours * 0.15 && total <= hours * 0.45, `${total} przejazdów na ${hours} h służby (${duties} służb)`);
  assert.ok(runs.LT > 0 && runs.EZT > 0 && runs.TS > 0, JSON.stringify(runs));
});

test('termin służby: miesiąc i typ dnia z adresu albo z ziarna („losowo”) – ten sam numer, ten sam termin; nazwa z terminem', () => {
  assert.deepEqual(normalizeCalendar('7', 'sobota'), { month: 7, day: 'sobota' });
  for (const [m, d] of [['13', 'x'], ['0', ''], [null, null], ['7.5', 'Sobota']]) assert.deepEqual(normalizeCalendar(m, d), { month: null, day: null }, `${m} ${d}`);
  assert.deepEqual(resolveCalendar(5, { month: 2, day: 'niedziela' }), { month: 2, day: 'niedziela' });
  assert.deepEqual(resolveCalendar(5), resolveCalendar(5));
  // losowo: każdy miesiąc; dni robocze ok. 5 na 7
  const drawn = Array.from({ length: 700 }, (_, i) => resolveCalendar(i + 1));
  assert.equal(new Set(drawn.map((c) => c.month)).size, 12);
  const share = drawn.filter((c) => c.day === 'roboczy').length / drawn.length;
  assert.ok(share > 0.62 && share < 0.8, `dni robocze: ${share}`);
  assert.ok(DAY_TYPES.every((d) => drawn.some((c) => c.day === d)));
  const { scenario, stats } = buildDuty(sopot, { start: 6, minutes: 120, seed: 3, month: 7, day: 'sobota' });
  assert.deepEqual([stats.month, stats.day, scenario.name], [7, 'sobota', 'Służba 06:00–08:00 (lipiec, sobota)']);
  const random = buildDuty(sopot, { start: 6, minutes: 120, seed: 3 });
  assert.deepEqual([random.stats.month, random.stats.day], [resolveCalendar(3).month, resolveCalendar(3).day]);
  assert.equal(random.scenario.name, `Służba 06:00–08:00 (${calendarLabel(resolveCalendar(3))})`);
});

test('typ dnia: w sobotę i w niedzielę bez szczytów – rano mniej pociągów pasażerskich niż w dzień roboczy; niedzielny świt rzadszy', () => {
  const pass = (start, minutes, day) => {
    let n = 0;
    for (const st of duty) for (const seed of [1, 2, 3]) { const { stats } = buildDuty(st, { start, minutes, seed, month: 11, day }); n += stats.agl + stats.reg + stats.dal; }
    return n;
  };
  const weekday = pass(6, 180, 'roboczy'), saturday = pass(6, 180, 'sobota'), sunday = pass(6, 180, 'niedziela');
  assert.ok(saturday < weekday * 0.8 && sunday < weekday * 0.8, `szczyt poranny: roboczy ${weekday}, sobota ${saturday}, niedziela ${sunday}`);
  assert.ok(pass(15, 180, 'sobota') < pass(15, 180, 'roboczy') * 0.8, 'szczyt popołudniowy');
  assert.ok(pass(4, 120, 'niedziela') < pass(4, 120, 'sobota'), 'świt w niedzielę rzadszy niż w sobotę');
  // w dzień (10:00) typ dnia nic nie zmienia
  assert.equal(pass(10, 180, 'sobota'), pass(10, 180, 'roboczy'));
});

test('sezon nad morzem: latem pociągi na Hel kursują każdym kursem (Reda) – częściej niż poza sezonem; pociągi do Słupska i Lęborka bez zmian', () => {
  const count = (month, day) => {
    const out = { sea: 0, seaReg: 0, other: 0 };
    for (const start of [10, 19]) for (const seed of [1, 2, 3, 4]) {
      for (const e of buildDuty(reda, { start, minutes: 300, seed, month, day }).scenario.timetable) {
        if (trainClass(e) === 'tow' || e.nr >= SERVICE_NR) continue;
        out[seasideTrain(e) ? 'sea' : 'other']++;
        if (seasideTrain(e) && trainClass(e) === 'reg') out.seaReg++;
      }
    }
    return out;
  };
  const july = count(7, 'roboczy'), november = count(11, 'roboczy');
  // regionalne na Hel w dzień i wieczorem co drugi (późnym wieczorem co czwarty) kurs – latem każdy; dalekobieżne w dzień
  // i tak każdym kursem
  assert.ok(july.seaReg >= november.seaReg * 1.7, `regionalne nad morze: lipiec ${july.seaReg}, listopad ${november.seaReg}`);
  assert.ok(july.sea > november.sea, `wszystkie nad morze: lipiec ${july.sea}, listopad ${november.sea}`);
  assert.ok(Math.abs(july.other - november.other) <= november.other * 0.1, `pozostałe pasażerskie: lipiec ${july.other}, listopad ${november.other}`);
  // czerwiec i wrzesień – sezon tylko w weekendy
  assert.deepEqual(count(6, 'roboczy'), count(11, 'roboczy'), 'czerwiec w dzień roboczy jak listopad');
  assert.ok(count(9, 'sobota').sea > count(11, 'sobota').sea, 'wrzesień w sobotę – sezon');
  // pociąg nad morze: relacja do albo od miejscowości nad morzem
  assert.deepEqual(['Regio Reda – Hel', 'EIC „Posejdon” Kraków Gł. – Kołobrzeg', 'Regio Gdańsk Gł. – Słupsk'].map((name) => seasideTrain({ name })), [true, true, false]);
});

test('roboty torowe: od wiosny do jesieni bywa zamknięty tor pomocniczy (cała służba), zimą nie; tylko tor, który da się ominąć', () => {
  // tory do zamknięcia: tory dróg przelotowych, których pociągi mają tą samą drogą jeszcze inny tor – bez toru, na którym
  // pociąg kończy bieg (Reda: 11 – pociągi z Helu), toru SKM (Rumia: 5), toru pociągu zdawczego (Rumia: 6) i toru
  // jedynego dla drogi (Sopot: każda droga jednym torem)
  assert.deepEqual(closableTracks(rumia), ['1', '3']);
  assert.deepEqual(closableTracks(reda), ['1']);
  assert.deepEqual(closableTracks(sopot), [], 'Sopot: każda droga jednym torem');
  const stations = duty.filter((st) => closableTracks(st).length);
  assert.ok(stations.length >= 3, stations.map((st) => st.id).join(' '));
  // ziarna, które losują roboty (lipiec: WORKS[7]); tor się znajduje, o ile tor pomocniczy jest w służbie
  let works = 0, drawn = 0;
  for (const st of stations) for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) {
    const draws = seedFraction(seed, 'roboty') < WORKS[7];
    assert.equal(buildDuty(st, { start: 10, minutes: 120, seed, month: 1, day: 'roboczy' }).stats.works, null, `${st.id} w styczniu`);
    const { scenario, stats } = buildDuty(st, { start: 10, minutes: 120, seed, month: 7, day: 'roboczy' });
    if (draws) drawn++;
    if (stats.works == null) { assert.equal(scenario.closedSections, undefined); continue; }
    assert.ok(draws, `${st.id}, ziarno ${seed}: roboty bez losowania`);
    works++;
    const key = `${st.id}, ziarno ${seed}: tor ${stats.works}`;
    assert.ok(closableTracks(st).includes(stats.works), key);
    const sections = Object.entries(st.sections).filter(([, d]) => String(d.track) === stats.works).map(([id]) => id).sort();
    assert.deepEqual(scenario.closedSections.map((c) => c.section).sort(), sections, `${key}: cały tor, cała służba`);
    assert.ok(scenario.closedSections.every((c) => c.from == null && c.to == null));
    // każdy pociąg ma drogę z ominięciem zamknięcia; planowany na zamknięty tor jedzie innym bez kary
    assert.deepEqual(checkScenario(st, scenario).filter((f) => f.code.startsWith('closed-') && f.code !== 'closed-planned-track').map((f) => f.msg), [], key);
    assert.match(scenario.description, new RegExp(`Roboty torowe: tor ${stats.works} zamknięty na całą służbę`));
    // ten sam numer rozkładu – te same roboty („Zagraj ponownie”, numer wpisany później)
    assert.deepEqual(buildDuty(st, { start: 10, minutes: 120, seed, month: 7, day: 'roboczy' }).scenario, scenario, `${key}: powtórka`);
  }
  assert.ok(drawn > 0 && works >= drawn * 0.6, `roboty w ${works} z ${drawn} służb, które je losują`);
});

test('zima: w grudniu, styczniu i lutym przy zakłóceniach częściej marzną zwrotnice (wagi losowania usterek); poza zimą bez wag', () => {
  for (const month of [12, 1, 2]) {
    const { scenario } = buildDuty(sopot, { start: 6, minutes: 120, seed: 3, month, day: 'roboczy' });
    assert.deepEqual(scenario.faultWeights, { 'point-control': 4 }, `miesiąc ${month}`);
    assert.match(scenario.description, /Zima: przy zakłóceniach częściej marzną zwrotnice/);
    assert.deepEqual(checkScenario(sopot, scenario).filter((f) => f.code === 'sc-fault-weights'), []);
  }
  for (const month of [3, 7, 11]) assert.equal(buildDuty(sopot, { start: 6, minutes: 120, seed: 3, month, day: 'roboczy' }).scenario.faultWeights, undefined, `miesiąc ${month}`);
  // gra: zima i zakłócenia – usterki napędu zwrotnicy częściej niż latem
  const share = (month) => {
    let pts = 0, all = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const { scenario } = buildDuty(sopot, { start: 6, minutes: 180, seed, month, day: 'roboczy' });
      const sim = new Simulation(sopot, { scenario, disruptions: 'high', seed });
      for (const f of sim.faults.list) { all++; if (f.type === 'point-control') pts++; }
    }
    return pts / all;
  };
  assert.ok(share(1) > share(7) * 2, `napęd zwrotnicy: styczeń ${share(1).toFixed(2)}, lipiec ${share(7).toFixed(2)}`);
});

test('sezon przewozów: jesienią i zimą więcej pociągów towarowych niż wiosną – na każdym posterunku, w wolnych lukach', () => {
  let may = 0, october = 0;
  for (const st of duty) {
    const tow = (month) => {
      let n = 0;
      for (const seed of [1, 2, 3, 4]) for (const start of [6, 19]) n += buildDuty(st, { start, minutes: 180, seed, month, day: 'roboczy' }).stats.tow;
      return n;
    };
    const a = tow(5), b = tow(10);
    assert.ok(b > a, `${st.id}: maj ${a}, październik ${b}`);
    may += a; october += b;
  }
  assert.ok(october >= may * 1.1, `razem: maj ${may}, październik ${october}`);
  // wiosną i latem bez dodatkowych
  assert.deepEqual([3, 4, 5, 6, 7, 8].map((m) => buildDuty(tczew, { start: 10, minutes: 120, seed: 2, month: m, day: 'roboczy' }).stats.tow), Array(6).fill(buildDuty(tczew, { start: 10, minutes: 120, seed: 2, month: 5, day: 'roboczy' }).stats.tow));
});

test('pora doby jak w rzeczywistości: w nocy prawie sam ruch towarowy, w szczycie pasażerski – na każdym posterunku', () => {
  const all = { peak: 0, evening: 0 };
  for (const st of duty) {
    const sum = (start, minutes) => {
      const acc = { agl: 0, reg: 0, dal: 0, tow: 0 };
      // dzień roboczy – w sobotę i w niedzielę szczytów nie ma (osobny test „typ dnia”)
      for (const seed of [1, 2, 3]) { const { stats } = buildDuty(st, { start, minutes, seed, day: 'roboczy' }); for (const k of Object.keys(acc)) acc[k] += stats[k] / 3; }
      return perHour(acc, minutes);
    };
    const peak = sum(6, 180), day = sum(10, 180), evening = sum(19, 180), night = sum(0, 180);
    assert.ok(night.pass < peak.pass / 4, `${st.id}: nocą ${night.pass.toFixed(1)} pasażerskich na godzinę, w szczycie ${peak.pass.toFixed(1)}`);
    assert.ok(night.tow > peak.tow && night.tow >= 1, `${st.id}: nocą ${night.tow.toFixed(1)} towarowych na godzinę, w szczycie ${peak.tow.toFixed(1)}`);
    assert.ok(night.tow > night.pass, `${st.id}: nocą więcej towarowych niż pasażerskich`);
    assert.ok(day.pass < peak.pass && evening.pass < peak.pass, `${st.id}: w dzień i wieczorem rzadziej niż w szczycie`);
    // wieczorem towarowych nie mniej niż w szczycie (z dokładnością do jednego pociągu na 3 h – część wypada dla urozmaicenia)
    assert.ok(evening.tow >= peak.tow - 0.34, `${st.id}: wieczorem ${evening.tow.toFixed(1)} towarowych na godzinę, w szczycie ${peak.tow.toFixed(1)}`);
    all.peak += peak.tow; all.evening += evening.tow;
    // nocą (0–4) nie jeżdżą pociągi aglomeracyjne ani regionalne
    for (const seed of [1, 2]) { const { stats } = buildDuty(st, { start: 0, minutes: 180, seed }); assert.equal(stats.agl + stats.reg, 0, `${st.id}: noc, ziarno ${seed}`); }
  }
  assert.ok(all.evening > all.peak * 1.2, `wieczorem przybywa towarowych: ${all.evening.toFixed(1)} na godzinę wobec ${all.peak.toFixed(1)} w szczycie (wszystkie posterunki)`);
});

test('okres wzorca: rozpiętość rozkładu w pełnych godzinach albo pole duty.period stacji', () => {
  for (const st of duty) assert.equal(patternPeriod(st), 7200, st.id);
  assert.equal(patternPeriod({ ...sopot, duty: { period: 90 } }), 5400);
  assert.equal(patternPeriod({ timetable: [] }), 3600);
  assert.deepEqual(validateStation({ ...sopot, duty: { period: 90 } }).errors, []);
  for (const bad of [{ period: 50 }, { period: 0 }, { period: '2h' }, 'x']) assert.match(validateStation({ ...sopot, duty: bad }).errors.join('; '), /duty\.period: okres wzorca/, JSON.stringify(bad));
  // pociąg wzorca powtarza się co okres (przesunięty z linią o 0–DUTY_SHIFT min): SKM z 06:17 jedzie o 08:17…, 14:17–14:20
  const sc = buildDuty(sopot, { start: 14, minutes: 60, seed: 1 }).scenario;
  assert.ok(sc.timetable.some((e) => e.arr && at(e.arr) - at('14:17') >= 0 && at(e.arr) - at('14:17') <= DUTY_SHIFT * 60 && trainClass(e) === 'agl'), sc.timetable.map((e) => e.arr).join(' '));
});

test('służba w oknie bez pociągu wzorca: otwarcie służby – pociąg towarowy na najwcześniejszą chwilę, nie pusta', () => {
  // stacja z jednym pociągiem co godzinę o pełnej godzinie: w oknie 10:00–11:00 nie ma żadnego pociągu wzorca (ten
  // z 10:00 musiałby wyjechać od sąsiada przed startem, ten z 11:00 jest po końcu). Dawniej służba była pusta; teraz
  // otwarcie służby (DUTY_OPENING) daje pociąg towarowy na tym szlaku, wyprawiony przez sąsiada po starcie
  const sparse = { ...pruszcz, tasks: [], timetable: [pruszcz.timetable.find((e) => e.from && e.to && trainClass(e) === 'reg')].map((e) => ({ ...e, arr: '07:00', dep: '07:01' })) };
  assert.equal(patternPeriod(sparse), 3600);
  const { scenario } = buildDuty(sparse, { start: 10, minutes: 60, seed: 2 });
  // poza przejazdem służbowym (SERVICE_RUNS), który może dojść w tej godzinie – jeden pociąg: towarowy otwarcia
  const own = scenario.timetable.filter((x) => !(x.nr >= SERVICE_NR && x.nr < SERVICE_NR + 1000));
  assert.equal(own.length, 1);
  const [e] = own;
  assert.deepEqual([e.kind, e.cat], ['tow', 'TM']);
  assert.ok(Clock.parse(e.arr) - 10 * 3600 <= 20 * 60, `pierwszy pociąg o ${e.arr}`);
});

test('otwarcie służby: na każdym posterunku w grze pierwszy pociąg najpóźniej 20 min po starcie (o każdej porze)', () => {
  // Reda 18:00 / 2 h: wieczorem co drugi pociąg regionalny i dalekobieżny – pierwszy przyjeżdżał po 35–43 min
  const late = [];
  for (const st of STATIONS.filter((x) => hasDuty(x) && !isTraining(x))) for (let h = 0; h < 24; h += 3) for (const seed of [1, 5]) {
    const { scenario } = buildDuty(st, { start: h, minutes: 60, seed });
    const first = Math.min(...scenario.timetable.map((x) => Clock.parse(x.arr || x.dep))) - h * 3600;
    if (!(first <= 20 * 60)) late.push(`${st.id} ${h}:00 ziarno ${seed}: ${Math.round(first / 60)} min`);
  }
  const reda = STATIONS.find((x) => x.id === 'reda');
  for (const seed of [1, 2, 3, 4, 5]) {
    const { scenario } = buildDuty(reda, { start: 18, minutes: 120, seed });
    const first = Math.min(...scenario.timetable.map((x) => Clock.parse(x.arr || x.dep))) - 18 * 3600;
    if (!(first <= 20 * 60)) late.push(`reda 18:00 / 2 h ziarno ${seed}: ${Math.round(first / 60)} min`);
  }
  assert.deepEqual(late, []);
});

test('każda służba posterunków w grze ma pociągi – także najkrótsza i środek nocy; pociąg klasy, która o tej porze nie kursuje, nie wraca', () => {
  // Gdańsk Gł. 00:00 / 1 h (ziarno 710083518) wychodziła pusta: uwaga o pociągu sprzed startu usuwała po kolei pociągi
  // towarowe obok, a na końcu sam pociąg. Teraz pociąg od sąsiada wchodzi do służby dopiero, gdy sąsiad wyprawia go po
  // starcie, a uwaga, która nie jest konfliktem dwóch pociągów, usuwa tylko swój pociąg.
  const gdansk = STATIONS.find((st) => st.id === 'gdansk-glowny');
  for (const seed of [710083518, 11, 222, 3333]) for (const start of [0, 2]) {
    const { scenario, stats } = buildDuty(gdansk, { start, minutes: 60, seed });
    assert.ok(stats.trains > 0, `Gdańsk Gł. ${start}:00 / 1 h, ziarno ${seed}`);
    assert.ok(stats.tow > 0, `Gdańsk Gł. ${start}:00, ziarno ${seed}: pociągi towarowe zostają`);
    assert.deepEqual(checkScenario(gdansk, scenario).filter((f) => f.code.startsWith('tt-') && f.level !== 'info').map((f) => f.code), []);
  }
  for (const st of duty) for (const start of [0, 1, 3, 23]) for (const minutes of [60, 120]) for (const seed of [5, 710083518]) {
    const { scenario, stats } = buildDuty(st, { start, minutes, seed });
    assert.ok(stats.trains > 0, `${st.id} ${scenario.name}, ziarno ${seed}: bez pociągów`);
    for (const e of scenario.timetable) assert.ok(bandOf(first(e)).every[trainClass(e)] > 0, `${st.id} ${scenario.name}: ${e.nr} (${trainClass(e)}) o ${e.arr ?? e.dep}`);
  }
});

test('pociąg od sąsiada wchodzi do służby, gdy sąsiad wyprawia go po starcie (czas przejazdu szlaku); wolniejszy towarowy – później', () => {
  for (const st of duty) for (const [start, minutes] of [[6, 60], [0, 120], [19, 60]]) {
    const { scenario } = buildDuty(st, { start, minutes, seed: 9 });
    for (const e of scenario.timetable.filter((x) => x.from)) {
      const x = st.exits[e.from], v = Math.min(e.vmax ?? 160, x.lineSpeed ?? 160) / 3.6;
      const lead = (x.lineLength ?? 3000) / v + DUTY_EDGE.run + DUTY_EDGE.neighbour;
      // prędkość wpisu bez `vmax` daje kategoria (co najmniej tyle, co przyjęte tu 160 km/h) – granica z zapasem 1 s
      assert.ok(first(e) >= start * 3600 + lead - 1, `${st.id} ${scenario.name}: ${e.nr} o ${e.arr}, sąsiad wyprawiłby go przed startem`);
    }
  }
});

test('pociąg nadzwyczajny w służbie: kopia pociągu z rozkładu służby, w jej oknie, z wolnym numerem', () => {
  let planned = 0;
  for (const [station, start, minutes] of [[sopot, 22, 120], [pruszcz, 1, 180], [rumia, 15, 180]]) for (const seed of [1, 2, 3, 4]) {
    const { scenario } = buildDuty(station, { start, minutes, seed });
    const sim = new Simulation(station, { scenario, disruptions: 'high', seed });
    const nrs = new Set(scenario.timetable.map((e) => e.nr));
    for (const x of sim.extraTrainsPlanned) {
      planned++;
      assert.ok(!nrs.has(x.def.nr), `${scenario.name}: numer ${x.def.nr} zajęty`);
      assert.ok(x.at >= start * 3600 && last(x.def) <= start * 3600 + minutes * 60, `${scenario.name}: ${x.def.arr}`);
      assert.ok(scenario.timetable.some((e) => e.from === x.def.from && e.to === x.def.to && e.track === x.def.track), 'wzorzec z rozkładu służby');
    }
  }
  assert.ok(planned >= 6, `zaplanowane: ${planned}`);
});

test('bez danych per stacja: służba powstaje także dla stacji spoza gry (stacja testowa) i szkoleniowej', () => {
  for (const st of [wola, szkolna]) {
    assert.equal(hasDuty(st), true);
    for (const [start, minutes] of [[7, 120], [20, 180], [2, 180]]) {
      const { scenario, stats } = buildDuty(st, { start, minutes, seed: 3 });
      assert.equal(scenario.startTime, Clock.format(start * 3600));
      assert.equal(stats.trains, scenario.timetable.length);
    }
    assert.ok(buildDuty(st, { start: 7, minutes: 180, seed: 3 }).stats.trains > 0, st.id);
  }
});

test('wybór zmiany na stronie posterunku: służba zamiast zwykłych zmian, scenariusze specjalne zostają; stanowiska do wyboru', () => {
  for (const st of duty) {
    const c = shiftChoices(st);
    assert.equal(c.duty, true, st.id);
    assert.ok(c.specials.every((sc) => sc.faults?.length || sc.closedSections?.length), `${st.id}: ${c.specials.map((sc) => sc.id)}`);
    assert.ok(!c.specials.some((sc) => ['zmiana', 'zmiana-lcs', 'szczyt'].includes(sc.id)), st.id);
    assert.ok(c.srks.length >= 1 && c.srks.includes(st.srk), st.id);
  }
  assert.deepEqual(shiftChoices(rumia).srks, ['E', 'komputerowe']);
  assert.deepEqual(shiftChoices(rumia).specials.map((sc) => sc.id), ['usterka-rd2']);
  assert.deepEqual(shiftChoices(sopot).srks, ['komputerowe']);
  // stanowisko wybiera gracz: dla służby i scenariusza specjalnego bez własnego stanowiska, gdy stacja ma ich kilka
  const special = shiftChoices(rumia).specials[0];
  assert.equal(srkChoosable(shiftChoices(rumia), null), true, 'służba');
  assert.equal(srkChoosable(shiftChoices(rumia), special), true, 'scenariusz specjalny bez srk');
  assert.equal(srkChoosable(shiftChoices(rumia), { ...special, srk: 'komputerowe' }), false, 'scenariusz z własnym stanowiskiem');
  assert.equal(srkChoosable(shiftChoices(sopot), null), false, 'jedno stanowisko');
  // stacja szkoleniowa: bez służby, wszystkie zmiany bez samouczka
  const tr = shiftChoices(szkolna);
  assert.equal(tr.duty, false);
  assert.ok(tr.specials.length >= 5 && !tr.specials.some((sc) => sc.tutorial));
});
