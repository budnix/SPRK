import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/model/Simulation.js';
import { CAB_CHANGE_MIN, CAB_CHANGE_MAX, cabChangeTime } from '../src/model/Train.js';
import { DRIVER_REPLY } from '../src/model/Comms.js';
import szkolna from '../src/stations/szkolna.js';
import sopot from '../src/stations/sopot.js';
import { playShift } from '../src/model/check/play.js';
import { run } from './helpers.js';

/**
 * Zmiana czoła trwa: maszynista przechodzi do kabiny na drugim końcu składu (45–75 s, docs/SOURCES.md „Zmiana czoła
 * i rozmowy z maszynistą”), a polecenia z zakładki Pociągi idą radiem – wezwanie, odpowiedź, meldunek gotowości.
 */

/** Szkolna: skład (60 m) na torze 3, czołem do kozła (na wschód) – po zmianie czoła stoi przed tarczą Tm1. */
function unitOnT3(seed = 1) {
  const sim = new Simulation(szkolna, { disruptions: 'none', seed, scenario: { id: 't', name: 't', tasks: [], timetable: [
    { nr: 1, kind: 'os', name: 'skład', from: null, to: null, dep: '09:00', track: '3', stop: true, terminates: true, length: 60, vmax: 60, startOn: { section: 'T3', dir: 'E' } },
  ] } });
  sim.step(0.5);
  const e = sim.traffic.timetable().find((x) => x.nr === 1);
  const log = [];
  sim.bus.on('comms-log', (m) => log.push(m));
  return { sim, e, tr: e.train, log };
}

test('czas zmiany czoła: 45–75 s, w każdym pociągu inny, stały dla tej samej zmiany (powtórka)', () => {
  const all = [];
  for (const seed of [1, 2, 3, 4, 5]) for (const nr of [1, 6101, 7101, 90201, 55153]) {
    const d = cabChangeTime(seed, nr);
    assert.ok(Number.isInteger(d) && d >= CAB_CHANGE_MIN && d <= CAB_CHANGE_MAX, `ziarno ${seed}, pociąg ${nr}: ${d} s`);
    assert.equal(cabChangeTime(seed, nr), d);
    all.push(d);
  }
  assert.ok(new Set(all).size > 5, `rozrzut czasów: ${[...new Set(all)].join(', ')}`);
});

test('zmiana czoła: skład stoi, aż maszynista przejdzie do drugiej kabiny – także przy sygnale zezwalającym; potem rusza', () => {
  const { sim, e, tr } = unitOnT3();
  assert.equal(sim.traffic.toShunting(1), true);
  const head = tr.head, t0 = sim.clock.time, d = cabChangeTime(sim.traffic.seed, 1);
  assert.equal(sim.traffic.reverseTrain(1), true);
  // w czasie zmiany: drugie polecenie i zmiana trybu nie przechodzą (maszynisty nie ma w kabinie)
  assert.equal(sim.traffic.reverseTrain(1), false);
  assert.equal(sim.traffic.toTrainMode(1), false);
  assert.ok(sim.ilk.setRoute('Tm1-Tm2').ok, 'przebieg manewrowy od Tm1 – przed nowym czołem');
  run(sim, 5);
  assert.equal(sim.ilk.signals.get('Tm1').aspect, 'Ms2');
  const why = sim.traffic.waitReason(e, sim.clock.time);
  assert.equal(why?.code, 'cab-change');
  assert.equal(why.left, Math.ceil(t0 + d - sim.clock.time), 'odliczanie do końca zmiany');
  run(sim, d - 7);
  assert.equal(tr.direction, 'E', `kierunek zmienia się dopiero po ${d} s`);
  assert.equal(tr.v, 0); assert.equal(tr.head, head, 'skład nie ruszył w czasie zmiany czoła');
  run(sim, 3);
  assert.equal(tr.direction, 'W');
  assert.equal(tr.cabChange, null);
  assert.equal(sim.traffic.waitReason(e, sim.clock.time)?.code ?? null, null, 'po zmianie – bez przyczyny postoju z niej');
  run(sim, 15);
  assert.ok(tr.v > 0, 'skład rusza na Ms2 tarczy Tm1 po zgłoszeniu gotowości');
});

test('pociąg, który zakończył bieg, w trybie pociągowym: w zakładce Pociągi widać odliczanie zmiany czoła', () => {
  const { sim, e, tr } = unitOnT3();
  assert.equal(tr.mode, 'train'); assert.equal(tr.hasStopped, true);
  assert.equal(sim.traffic.waitReason(e, sim.clock.time), null, 'zakończył bieg – bez przyczyny postoju');
  assert.equal(sim.traffic.reverseTrain(1), true);
  assert.equal(sim.traffic.waitReason(e, sim.clock.time)?.code, 'cab-change');
});

test('rozmowa radiowa z maszynistą (Ir-5 §7–§8): tryb jazdy i zmiana czoła – wezwanie, odpowiedź po chwili, meldunek gotowości i jego potwierdzenie', () => {
  const { sim, log } = unitOnT3();
  const t0 = sim.clock.time, d = cabChangeTime(sim.traffic.seed, 1);
  sim.traffic.toShunting(1);
  run(sim, DRIVER_REPLY + 1);
  const t1 = sim.clock.time;
  sim.traffic.reverseTrain(1);
  sim.traffic.reverseTrain(1); // w toku – bez drugiego wezwania
  run(sim, d + DRIVER_REPLY);
  sim.traffic.toTrainMode(1);
  run(sim, DRIVER_REPLY + 1);
  const rows = log.map((m) => ({ dir: m.dir, who: m.dir === 'out' ? m.to : m.from, kind: m.kind, t: m.time, text: m.text }));
  const drv = 'maszynista poc. 1';
  assert.ok(rows.every((r) => r.who === drv), 'cała rozmowa z maszynistą pociągu 1');
  assert.deepEqual(rows.map((r) => r.dir), ['out', 'in', 'out', 'in', 'in', 'out', 'out', 'in']);
  const [shunt, shuntOk, rev, revOk, ready, ack, train, trainOk] = rows;
  assert.match(shunt.text, /^Pociąg 1, tu Szkolna: .*jazda manewrowa – odbiór\.$/);
  assert.match(shuntOk.text, /^Tu pociąg 1, zrozumiałem – jazda manewrowa, bez odbioru\.$/);
  assert.equal(shuntOk.t - shunt.t, DRIVER_REPLY);
  assert.ok(Math.abs(shunt.t - t0) <= 0.5);
  assert.match(rev.text, /^Pociąg 1, tu Szkolna: zmiana czoła.* – odbiór\.$/);
  assert.ok(Math.abs(rev.t - t1) <= 0.5);
  assert.match(revOk.text, /^Tu pociąg 1, zrozumiałem – zmieniam kabinę/);
  // meldunek gotowości po przejściu maszynisty: z sygnalizatorem przed nowym czołem; zakładka Łączność miga (radio)
  assert.equal(ready.kind, 'radio');
  assert.ok(Math.abs(ready.t - (rev.t + d)) <= 0.5, `meldunek po ${d} s (${ready.t - rev.t})`);
  assert.equal(ready.text, 'Szkolna, tu pociąg 1: zmiana czoła zakończona, stoję przed tarczą manewrową Tm1, gotów do jazdy – odbiór.');
  assert.equal(ack.text, 'Tu Szkolna, meldunek zrozumiałem.');
  assert.ok(ack.t > ready.t);
  assert.match(train.text, /^Pociąg 1, tu Szkolna: koniec manewrów, dalej jazda pociągowa – odbiór\.$/);
  assert.match(trainOk.text, /zrozumiałem – jazda pociągowa, bez odbioru\.$/);
  // ponowne przełączenie w ten sam tryb – bez rozmowy
  sim.traffic.toTrainMode(1);
  run(sim, DRIVER_REPLY + 1);
  assert.equal(log.length, 8);
});

test('automat okręgu obok gracza (quiet): zmiana trybu i czoła bez rozmowy w dzienniku łączności gracza, także bez meldunku', () => {
  const { sim, log, tr } = unitOnT3();
  assert.equal(sim.traffic.toShunting(1, { quiet: true }), true);
  assert.equal(sim.traffic.reverseTrain(1, { quiet: true }), true);
  run(sim, CAB_CHANGE_MAX + DRIVER_REPLY + 1);
  assert.equal(tr.direction, 'W');
  assert.deepEqual(log, []);
});

/*
 * Dyżurny automatyczny: pociąg ze składu innego pociągu (`unit`) zmienia czoło zawczasu – od przekazania, nie dopiero
 * z przebiegiem 2 min przed odjazdem. Sopot, R 55153 (skład po manewrach, wyjazd w drugą stronę): przy wydawaniu
 * zmiany czoła razem z przebiegiem odjeżdżał 2 min po planie (ziarna 2 i 3).
 */
test('automat: pociąg ze składu innego pociągu zmienia czoło zawczasu i odjeżdża o czasie (Sopot, R 55153, bez zakłóceń)', () => {
  const scenario = sopot.scenarios.find((s) => s.id === 'zmiana');
  for (const seed of [2, 3]) {
    const late = [];
    const { sim } = playShift({ station: sopot, scenario, seed, level: 'none', settle: true,
      onCreate: (s) => s.bus.on('score', (x) => { if (x.code === 'late-depart') late.push(x.nr); }) });
    const e = sim.traffic.timetable().find((x) => x.nr === 55153);
    assert.ok(e.actualDep != null, `ziarno ${seed}: 55153 odjechał`);
    assert.ok(e.actualDep - e.depTime < 60, `ziarno ${seed}: 55153 odjazd ${Math.round(e.actualDep - e.depTime)} s po planie`);
    assert.deepEqual(late, [], `ziarno ${seed}: kary za przetrzymanie`);
  }
});
