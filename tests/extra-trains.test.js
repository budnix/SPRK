import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Simulation, EXTRA_TRAIN, extraTrainShifts } from '../src/model/Simulation.js';
import { STATIONS } from '../src/stations/index.js';
import { Clock } from '../src/core/Clock.js';
import sopot from '../src/stations/sopot.js';
import szkolna from '../src/stations/szkolna.js';

/*
 * Pociąg nadzwyczajny (poziom „duże”) mieści się w zmianie: zapowiedziany nie przed startem, ostatnie zdarzenie co
 * najmniej 10 min przed końcem. Dawniej generator brał wzorzec + 25…70 min bez względu na okno zmiany – pociąg
 * planowany po końcu zmiany dawał karę „nieobsłużony” (−10) bez winy dyżurnego, a w wariancie z późniejszym startem
 * – przyjazd „przed startem”.
 */
const SEEDS = Array.from({ length: 40 }, (_, i) => i + 1);
const plan = (station, scenario, seed) => new Simulation(station, { scenario, disruptions: 'high', seed });
const baseOf = (station, def) => station.timetable.find((t) => t.nr === def.nr - 1000);
const first = (t) => Clock.parse(t.arr || t.dep), last = (t) => Clock.parse(t.dep || t.arr);

test('przesunięcia pociągu nadzwyczajnego: 25…70 min, zapowiedź nie przed startem, ostatnie zdarzenie 10 min przed końcem', () => {
  const t = { arr: '07:00', dep: '07:02' }, at = (hm) => Clock.parse(hm);
  assert.deepEqual(extraTrainShifts(t, at('06:00'), null), { lo: 25, hi: 70 });
  assert.deepEqual(extraTrainShifts(t, at('06:00'), at('09:00')), { lo: 25, hi: 70 });
  assert.deepEqual(extraTrainShifts(t, at('06:00'), at('07:52')), { lo: 25, hi: 40 }, 'odjazd najpóźniej 07:42');
  assert.equal(extraTrainShifts(t, at('06:00'), at('07:36')), null, 'odjazd 07:27 + 10 min nie mieści się');
  assert.deepEqual(extraTrainShifts(t, at('07:15'), at('09:00')), { lo: 40, hi: 70 }, 'zapowiedź 25 min przed przyjazdem – od startu 07:15');
  assert.equal(extraTrainShifts(t, at('08:00'), at('09:00')), null, 'wzorzec ponad 45 min przed startem');
  assert.deepEqual(extraTrainShifts({ arr: '07:00' }, at('06:00'), at('07:40')), { lo: 25, hi: 30 }, 'przelot: liczy się przejazd');
});

test('każdy scenariusz każdej stacji, poziom „duże”, ziarna 1–12: pociąg nadzwyczajny mieści się w zmianie', () => {
  let planned = 0;
  for (const station of STATIONS) for (const scenario of station.scenarios || []) {
    if (scenario.tutorial) continue;
    for (const seed of SEEDS.slice(0, 12)) {
      const sim = plan(station, scenario.id, seed);
      for (const x of sim.extraTrainsPlanned) {
        planned++;
        const key = `${station.id}:${scenario.id}, ziarno ${seed}, ${x.def.nr}`;
        const base = baseOf(station, x.def);
        const minutes = (first(x.def) - first(base)) / 60;
        assert.ok(minutes >= EXTRA_TRAIN.shiftMin && minutes <= EXTRA_TRAIN.shiftMax, `${key}: przesunięcie ${minutes} min`);
        assert.ok(x.at >= sim.startTime, `${key}: zapowiedź ${Clock.format(x.at)} przed startem`);
        assert.equal(x.at, first(x.def) - EXTRA_TRAIN.announce);
        if (sim.endTime != null) assert.ok(last(x.def) <= sim.endTime - EXTRA_TRAIN.endSlack, `${key}: ostatnie zdarzenie ${x.def.dep ?? x.def.arr}, koniec ${scenario.endTime}`);
      }
    }
  }
  assert.ok(planned > 150, `zaplanowane pociągi nadzwyczajne: ${planned}`);
});

test('wylosowany pociąg, który się mieści, zostaje bez zmian; inny – zastąpiony mieszczącym się, reszta losowań ta sama', () => {
  const sc = sopot.scenarios.find((s) => s.id === 'zmiana');
  let same = 0, moved = 0;
  for (const seed of SEEDS) {
    // bez końca zmiany generator nie ma górnego ograniczenia – to dawne losowanie
    const free = plan(sopot, { ...sc, endTime: undefined }, seed), sim = plan(sopot, sc, seed);
    const [a] = free.extraTrainsPlanned, [b] = sim.extraTrainsPlanned;
    assert.ok(a && b, `ziarno ${seed}: pociąg nadzwyczajny zaplanowany`);
    const fits = last(a.def) <= sim.endTime - EXTRA_TRAIN.endSlack;
    if (fits) { same++; assert.deepEqual(b.def, a.def, `ziarno ${seed}: mieścił się – bez zmian`); }
    else { moved++; assert.ok(last(b.def) <= sim.endTime - EXTRA_TRAIN.endSlack, `ziarno ${seed}: zastąpiony`); }
    // opóźnienia od sąsiada (losowane wcześniej) i powtórka tej samej zmiany – bez zmian
    const delays = (s) => s.traffic.timetable().map((e) => `${e.nr}:${e.delayIn}`);
    assert.deepEqual(delays(sim), delays(free), `ziarno ${seed}: opóźnienia od sąsiada`);
    assert.deepEqual(plan(sopot, sc, seed).extraTrainsPlanned.map((x) => x.def), [b.def], `ziarno ${seed}: powtórka`);
  }
  assert.ok(same >= 5 && moved >= 5, `mieszczące się ${same}, zastąpione ${moved}`);
});

test('wariant z późniejszym startem: pociąg nadzwyczajny zapowiadany po starcie; zmiana za krótka – bez nadzwyczajnego', () => {
  const late = { id: 'pozna', name: 'późny start', startTime: '07:00', endTime: '08:15', trains: sopot.timetable.filter((t) => Clock.parse(t.arr || t.dep) >= Clock.parse('07:10')).map((t) => t.nr) };
  for (const seed of SEEDS) {
    for (const x of plan(sopot, late, seed).extraTrainsPlanned) {
      assert.ok(x.at >= Clock.parse('07:00'), `ziarno ${seed}: zapowiedź ${Clock.format(x.at)}`);
      assert.ok(first(x.def) >= Clock.parse('07:25') && last(x.def) <= Clock.parse('08:05'), `ziarno ${seed}: ${x.def.arr}–${x.def.dep ?? x.def.arr}`);
    }
  }
  const short = { id: 'krotka', name: 'krótka', startTime: '07:00', endTime: '07:30', trains: [6101, 6102] };
  for (const seed of SEEDS) assert.deepEqual(plan(szkolna, short, seed).extraTrainsPlanned, [], `ziarno ${seed}`);
});
