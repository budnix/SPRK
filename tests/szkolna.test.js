import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/model/Simulation.js';
import szkolna from '../src/stations/szkolna.js';
import { validateStation } from '../src/model/validate.js';
import { Clock } from '../src/core/Clock.js';
import { autoDispatch, allArrived } from './helpers.js';
import { MissionProgress } from '../src/tutorial/progress.js';
import { missionSteps, MISSIONS } from '../src/tutorial/missions.js';
import { GLOSSARY } from '../src/data/glossary.js';

test('Szkolna: definicja poprawna, przebiegi potrzebne w misjach istnieją, scenariusze wskazują misje', () => {
  assert.deepEqual(validateStation(szkolna).errors, []);
  const sim = new Simulation(szkolna, { disruptions: 'none' });
  assert.equal(sim.ilk.topo.tracks.filter((t) => t._openPorts).length, 0, 'urwane porty toru');
  const ids = new Set(sim.ilk.routeList().map((r) => r.id));
  for (const id of ['A-D1', 'A-D2', 'B-C1', 'B-C2', 'D1-E', 'D2-E', 'C1-W', 'C2-W', 'D2-kT3m', 'Tm1-Tm2', 'Tm2-C2']) assert.ok(ids.has(id), `brak przebiegu ${id}`);
  for (const sc of szkolna.scenarios.filter((s) => s.tutorial)) assert.ok(MISSIONS[sc.tutorial], `scenariusz ${sc.id}: nieznana misja ${sc.tutorial}`);
  // misja 1 – monitor, misja 2 – pulpit kostkowy (scenariusz wymusza stanowisko)
  assert.equal(new Simulation(szkolna, { scenario: 'nauka-1' }).srk.view, 'screen');
  assert.equal(new Simulation(szkolna, { scenario: 'zmiana' }).srk.view, 'screen', 'pełna zmiana – monitor');
  assert.equal(new Simulation(szkolna, { scenario: 'zmiana-e' }).srk.view, 'desk', 'pełna zmiana – pulpit typu E');
  assert.deepEqual(szkolna.scenarios.filter((x) => !x.tutorial).map((x) => x.id), ['zmiana', 'zmiana-e', 'zmiana-izh'], 'w wyborze scenariusza po jednej zmianie na każde stanowisko');
  assert.equal(new Simulation(szkolna, { scenario: 'zmiana-izh' }).srk.view, 'izh', 'pełna zmiana – pulpit typu IZH-111');
  assert.equal(new Simulation(szkolna, { scenario: 'nauka-2', srk: 'komputerowe' }).srk.view, 'desk', 'scenariusz misji 2 wygrywa z ustawieniem gracza');
});

test('Szkolna: kroki misji są spójne – unikalne id, teksty, kotwice, skróty ze słownika', () => {
  for (const view of ['monitor', 'pulpit']) {
    const steps = missionSteps(view);
    assert.ok(steps.length > 30, `${view}: za mało kroków`);
    assert.equal(new Set(steps.map((s) => s.id)).size, steps.length, `${view}: powtórzone id kroku`);
    // każdy krok z Poz uprzedza, że pozwolenie daje się dopiero na żądanie sąsiada (lampka / napis „żąd.”) –
    // krok może zacząć się kilka minut przed zgłoszeniem pociągu
    for (const id of ['poz-6101', 'poz-6102', 'passing-42101', 'cross-poz', 'in-90201', 'in-6105-route', 'in-6106']) {
      const st = steps.find((s) => s.id === id);
      assert.ok(st && /żąd\./.test(st.text + (st.tip || '')), `${view}: krok ${id} nie wspomina o żądaniu pozwolenia`);
    }
    // bez ćwiczeń przebiegów bez pociągu (przebieg bez pociągu wymagałby obsługi blokady z sąsiadem)
    assert.ok(!steps.some((s) => s.id.startsWith('lesson-')), `${view}: kroki ćwiczeń`);
    for (const s of steps) {
      assert.ok(s.title && s.text, `${view}/${s.id}: brak tytułu lub tekstu`);
      assert.ok(s.info || typeof s.done === 'function', `${view}/${s.id}: krok bez warunku`);
      for (const [, term] of s.text.matchAll(/data-term="([^"]+)"/g)) assert.ok(GLOSSARY[term], `${view}/${s.id}: brak w słowniku: ${term}`);
      assert.doesNotMatch(`${s.title} ${s.text} ${s.tip || ''}`, /\b(od|do|z|dla|szlak) (Lipno|Dębno)\b/, `${view}/${s.id}: nieodmieniona nazwa sąsiada`);
      if (s.anchor?.cmd) assert.equal(view, 'monitor', `${view}/${s.id}: kotwica paska poleceń tylko na monitorze`);
    }
    // teksty misji 2 nie odsyłają do paska poleceń monitora; misja 1 nie mówi o przyciskach blokady, których na monitorze nie ma
    if (view === 'pulpit') for (const s of steps) assert.ok(!/PRZEBIEG POCIĄGOWY|WYKONAJ/.test(s.text), `${s.id}: tekst z monitora na pulpicie`);
    const blockIntro = steps.find((s) => s.id === 'block-intro');
    if (view === 'monitor') { assert.match(blockIntro.text, /kliknij strzałkę szlaku/); assert.doesNotMatch(blockIntro.text, /Przyciski|Pola w górnych rogach/); }
    else assert.match(blockIntro.text, /Przyciski/);
  }
});

/** Skrypt „ucznia”: dla każdego kroku – co zrobić na modelu (jak kliknięcia na stanowisku). */
function studentScript(sim) {
  const press = (ref) => sim.press(ref);
  const G = (id) => ({ kind: 'signal', id, color: 'green' });
  const Wt = (id) => ({ kind: 'signal', id, color: 'white' });
  const blk = (exit, btn) => ({ kind: 'block', exit, btn });
  const B = (exit) => sim.blocks.get(exit);
  const act = (id) => sim.ilk.active.has(id) || sim.ilk.pending.some((p) => p.route.id === id);
  const e = (nr) => sim.traffic.timetable().find((x) => String(x.nr) === String(nr));
  const poz = (exit) => { if (B(exit).request === 'theirs') press(blk(exit, 'Poz')); };
  const ko = (exit) => { if (B(exit).koPending) press(blk(exit, 'Ko')); };
  const route = (a, b, id) => { if (!act(id) && !sim.ilk.armed) { press(G(a)); press(b.kind ? b : G(b)); } };
  const wbl = (exit) => { const b = B(exit); if (!b.direction && !b.request && !b.occupied && !b.koPending) press(blk(exit, 'Wbl')); };
  const out = (nr, sigId, endId, exit, id) => {
    const en = e(nr); const b = B(exit);
    if (!en?.train || en.actualArr == null || en.status === 'na następnym posterunku') return;
    if (b.direction === 'out' && b.permission) route(sigId, { kind: 'end', id: endId }, id); else wbl(exit);
  };
  const stoppedBefore = (nr, sig) => e(nr)?.train?.stoppedAt?.signal === sig && e(nr).train.v === 0;
  const once = new Set();
  const one = (k, f) => { if (!once.has(k)) { once.add(k); f(); } };
  return {
    'poz-6101': () => poz('W'),
    'route-6101': () => route('A', 'D1', 'A-D1'),
    'ko-6101': () => ko('W'),
    'wbl-6101': () => wbl('E'),
    'out-6101': () => out(6101, 'D1', 'kE', 'E', 'D1-E'),
    'poz-6102': () => poz('E'),
    'route-6102': () => route('B', 'C1', 'B-C1'),
    'ko-6102': () => { ko('E'); if (!B('E').koPending && e(6102).actualArr != null) wbl('W'); },
    'out-6102': () => out(6102, 'C1', 'kW', 'W', 'C1-W'),
    'passing-42101': () => { poz('W'); if (B('W').direction === 'in') route('A', 'D1', 'A-D1'); if (sim.ilk.active.has('A-D1')) { wbl('E'); if (B('E').permission) route('D1', { kind: 'end', id: 'kE' }, 'D1-E'); } },
    'after-42101': () => ko('W'),
    'cross-poz': () => { poz('W'); poz('E'); },
    'cross-routes': () => { if (B('W').direction === 'in') route('A', 'D2', 'A-D2'); if (B('E').direction === 'in') route('B', 'C1', 'B-C1'); },
    'cross-out': () => { ko('W'); ko('E'); out(6103, 'D2', 'kE', 'E', 'D2-E'); out(6104, 'C1', 'kW', 'W', 'C1-W'); },
    'in-90201': () => { poz('W'); if (B('W').direction === 'in') route('A', 'D2', 'A-D2'); ko('W'); },
    'shunt-mode': () => { const tr = e(90201).train; if (tr && tr.v === 0 && tr.mode !== 'shunt') sim.traffic.toShunting(90201); },
    'shunt-route': () => { if (!act('D2-kT3m') && !sim.ilk.armed) { press(Wt('D2')); press({ kind: 'end', id: 'kT3' }); } },
    'shunt-reverse': () => { const tr = e(90201).train; if (tr && tr.v === 0 && !['W', 'NW', 'SW'].includes(tr.direction)) sim.traffic.reverseTrain(90201); },
    'shunt-back': () => { if (sim.ilk.armed) return; if (!act('Tm1-Tm2') && !once.has('tm1')) { once.add('tm1'); press(Wt('Tm1')); press(Wt('Tm2')); } else if (!act('Tm2-C2')) { press(Wt('Tm2')); press(Wt('C2')); } },
    'shunt-task2': () => { const t = sim.traffic.tasks.find((x) => x.id === 'podstaw-90202'); const tr = e(90201).train || e(90202).train; if (t?.done && tr && tr.mode === 'shunt' && tr.v === 0) sim.traffic.toTrainMode(tr.nr); },
    'out-90202': () => { if (!e(90202).train) return; const b = B('W'); if (b.direction === 'out' && b.permission) route('C2', { kind: 'end', id: 'kW' }, 'C2-W'); else wbl('W'); },
    'in-6105-route': () => { poz('W'); if (B('W').direction === 'in') route('A', 'D1', 'A-D1'); },
    'sz-6105': () => { if (stoppedBefore(6105, 'A') && !sim.ilk.armed && sim.ilk.signals.get('A').aspect !== 'Sz') { press({ kind: 'group', id: 'Sz', role: 'substitute' }); press(G('A')); } },
    'out-6105': () => { ko('W'); out(6105, 'D1', 'kE', 'E', 'D1-E'); },
    'in-6106': () => { poz('E'); if (B('E').direction === 'in') route('B', 'C1', 'B-C1'); ko('E'); },
    'phone-ask': () => one('ask', () => sim.comms.send('ask-free', { exit: 'W', nr: '6106' })),
    'phone-route': () => { if (String(B('W').phone.permissionFor) === '6106') route('C1', { kind: 'end', id: 'kW' }, 'C1-W'); },
    'phone-departed': () => { const b = B('W'); if (String(b.phone.departedTrain) === '6106' && !b.phone.departedReported) sim.comms.send('departed', { exit: 'W', nr: '6106' }); },
    'phone-dpo': () => { const b = B('W'); if (String(b.phone.arrivalConfirmed) === '6106' && b.poBlocked) press(blk('W', 'dPo')); },
  };
}

for (const [scenario, mission] of [['nauka-1', 'monitor'], ['nauka-2', 'pulpit']]) {
  test(`Szkolna: misja „${mission}” (${scenario}) – uczeń wykonujący polecenia dymków przechodzi wszystkie kroki po kolei`, () => {
    const sim = new Simulation(szkolna, { scenario, seed: 7 });
    const steps = missionSteps(mission);
    const order = [];
    const progress = new MissionProgress(sim, steps, { onStep: (s) => order.push(s.id) });
    const script = studentScript(sim);
    progress.start();
    assert.equal(sim.clock.paused, true, 'krok informacyjny zatrzymuje zegar');
    const end = Clock.parse('09:10');
    let n = 0, lastIdx = -1, since = sim.clock.time;
    while (!progress.finished && sim.clock.time < end) {
      if (progress.step?.info) { progress.next(); continue; }
      sim.step(0.5);
      if (n++ % 2 === 0) script[progress.step.id]?.();
      if (progress.index !== lastIdx) { lastIdx = progress.index; since = sim.clock.time; }
      assert.ok(sim.clock.time - since < 35 * 60, `krok ${progress.step?.id} nie kończy się (od ${Clock.format(since)})`); // najdłuższy krok: podstawiony skład czeka na odjazd 08:12
    }
    assert.ok(progress.finished, `misja nieukończona – utknęła na kroku ${progress.step?.id} o ${Clock.format(sim.clock.time)}`);
    assert.deepEqual(order, steps.map((s) => s.id), 'kroki w kolejności definicji');
    assert.equal(sim.clock.paused, false, 'po ostatnim „Dalej” zegar biegnie');
    for (const e of sim.traffic.timetable()) {
      assert.ok(e.status === 'na następnym posterunku' || e.status === 'zakończył bieg' || e.status.startsWith('przekazany'), `${e.nr}: ${e.status}`);
      if (e.from && e.stop) assert.equal(String(e.actualTrack), String(e.track), `${e.nr}: tor ${e.actualTrack} zamiast ${e.track}`);
    }
    assert.equal(sim.ilk.counters.Sz, 1);
    assert.equal(sim.blocks.get('W').counters.dPo, 1);
    assert.ok(sim.traffic.tasks.every((t) => t.done), 'zadania manewrowe wykonane');
  });
}

test('Szkolna: krok z warunkiem spełnionym wcześniej jest przeskakiwany, „wrong” daje komunikat, Dalej wznawia zegar', () => {
  const sim = new Simulation(szkolna, { scenario: 'nauka-1' });
  const steps = missionSteps('monitor');
  const fb = [];
  const progress = new MissionProgress(sim, steps, { onFeedback: (m) => fb.push(m) });
  progress.start();
  progress.next(); progress.next(); progress.next(); // intro, layout, block-intro
  assert.equal(progress.step.id, 'poz-6101');
  assert.equal(sim.clock.paused, false);
  // uczeń wyprzedza samouczek: Poz i przebieg na tor 2 (zły tor)
  for (let i = 0; i < 20 && sim.blocks.get('W').request !== 'theirs'; i++) sim.step(0.5);
  sim.press({ kind: 'block', exit: 'W', btn: 'Poz' });
  sim.press({ kind: 'signal', id: 'A', color: 'green' }); sim.press({ kind: 'signal', id: 'D2', color: 'green' });
  for (let i = 0; i < 20; i++) sim.step(0.5);
  assert.equal(progress.step.id, 'route-6101');
  assert.match(fb.at(-1) || '', /tor 2/);
  // poprawka: Pz + A, potem A → D1 → krok zaliczony, komunikat znika
  sim.press({ kind: 'group', id: 'Pz', role: 'route-release' }); sim.press({ kind: 'signal', id: 'A', color: 'green' });
  for (let i = 0; i < 4; i++) sim.step(0.5);
  sim.press({ kind: 'signal', id: 'A', color: 'green' }); sim.press({ kind: 'signal', id: 'D1', color: 'green' });
  for (let i = 0; i < 20; i++) sim.step(0.5);
  assert.equal(progress.step.id, 'watch-6101');
  assert.equal(fb.at(-1), null);
});

test('Szkolna: zmiana bez samouczka – automat prowadzi cały rozkład bez kolizji', () => {
  const sim = new Simulation(szkolna, { scenario: 'zmiana', disruptions: 'none' });
  const end = Clock.parse('09:10');
  let n = 0;
  while (sim.clock.time < end && !allArrived(sim)) { sim.step(0.5); if (n++ % 4 === 0) autoDispatch(sim); }
  for (const e of sim.traffic.timetable()) assert.ok(e.status === 'na następnym posterunku' || e.status === 'zakończył bieg' || e.status.startsWith('przekazany'), `${e.nr}: ${e.status}`);
});

test('Szkolna: zadanie „podstawić na tor 2” zalicza się dopiero po odstawieniu na tor 3 (afterTask), niezależnie od godziny', () => {
  const sim = new Simulation(szkolna, { scenario: 'zmiana', disruptions: 'none' });
  let n = 0;
  const until = (hhmm, auto) => { const t = Clock.parse(hhmm); while (sim.clock.time < t) { sim.step(0.5); if (auto && n++ % 4 === 0) autoDispatch(sim); } };
  // ręcznie: przyjąć zdawczy na tor 2 i zostawić go tam stojącego
  until('07:47', true);
  const W = sim.blocks.get('W');
  until('07:49', false); // bez automatu – nikt nie odstawia składu
  if (W.request === 'theirs') sim.press({ kind: 'block', exit: 'W', btn: 'Poz' });
  sim.press({ kind: 'signal', id: 'A', color: 'green' }); sim.press({ kind: 'signal', id: 'D2', color: 'green' });
  until('07:55', false); // skład stoi na torze 2; jeszcze przed 07:57, gdy pojawi się w rozkładzie jako 90202 (odjazd 08:12 − 15 min)
  const e = sim.traffic.timetable().find((x) => x.nr === 90201);
  assert.equal(e.status, 'zakończył bieg', `zdawczy stoi na torze 2 po przyjeździe (${e.status})`);
  assert.equal(e.train.v, 0);
  const t1 = sim.traffic.tasks.find((t) => t.id === 'odstaw-90201'), t2 = sim.traffic.tasks.find((t) => t.id === 'podstaw-90202');
  assert.equal(t1.done, false);
  assert.equal(t2.done, false, 'skład stojący na torze 2 przed odstawieniem nie zalicza zadania 2');
  // dalej automat: odstawia na tor 3 i podstawia z powrotem
  until('08:11', true);
  assert.equal(t1.done, true, 'automat odstawił skład na tor 3');
  assert.equal(t2.done, true, 'po powrocie na tor 2 zadanie 2 zaliczone');
  assert.ok(t2.doneAt > t1.doneAt, 'zadanie 2 po zadaniu 1');
});

test('Szkolna: skład manewrowy nie wyjeżdża na szlak pod sygnałem pociągowym; przekazanie jako 90202 czeka na tryb pociągowy; odjazd nie przed 08:12', () => {
  const sim = new Simulation(szkolna, { scenario: 'zmiana', disruptions: 'none' });
  let n = 0;
  const until = (hhmm, auto) => { const t = Clock.parse(hhmm); while (sim.clock.time < t) { sim.step(0.5); if (auto && n++ % 4 === 0) autoDispatch(sim); } };
  const run = (sec) => { for (let i = 0; i < sec * 2; i++) sim.step(0.5); };
  const e = (nr) => sim.traffic.timetable().find((x) => x.nr === nr);
  const G = (id) => ({ kind: 'signal', id, color: 'green' }), Wt = (id) => ({ kind: 'signal', id, color: 'white' });
  until('07:47', true);
  const W = sim.blocks.get('W');
  until('07:49', false);
  if (W.request === 'theirs') sim.press({ kind: 'block', exit: 'W', btn: 'Poz' });
  sim.press(G('A')); sim.press(G('D2'));
  until('07:55', false);
  assert.equal(e(90201).status, 'zakończył bieg');
  // manewry na tor 3 – o 07:57 (15 min przed odjazdem 90202) skład stoi na torze 3 w trybie manewrowym
  assert.equal(sim.traffic.toShunting(90201), true);
  sim.press(Wt('D2')); sim.press({ kind: 'end', id: 'kT3' });
  until('07:59', false);
  const tr = e(90201).train;
  assert.ok(tr && tr.v === 0 && tr.mode === 'shunt', `skład stoi na torze 3 w trybie manewrowym (${tr?.mode}, v=${tr?.v})`);
  assert.equal(sim.traffic.tasks.find((t) => t.id === 'odstaw-90201').done, true);
  assert.ok(!e(90202).train, 'przekazanie jako 90202 nie wymusza trybu pociągowego w trakcie manewrów');
  // powrót na tor 2
  assert.equal(sim.traffic.reverseTrain(90201), true);
  sim.press(Wt('Tm1')); sim.press(Wt('Tm2')); run(8); sim.press(Wt('Tm2')); sim.press(Wt('C2'));
  until('08:04', false);
  assert.equal(sim.traffic.tasks.find((t) => t.id === 'podstaw-90202').done, true, 'skład podstawiony na tor 2');
  assert.ok(tr.v === 0 && tr.mode === 'shunt');
  // w trybie manewrowym: pozwolenie i przebieg pociągowy C2 → szlak, a skład stoi (manewr nie wyjeżdża na szlak)
  if (W.koPending) sim.press({ kind: 'block', exit: 'W', btn: 'Ko' });
  run(2);
  sim.press({ kind: 'block', exit: 'W', btn: 'Wbl' });
  for (let i = 0; i < 120 && !(W.direction === 'out' && W.permission); i++) sim.step(0.5);
  assert.ok(W.direction === 'out' && W.permission, 'pozwolenie na wyjazd do Lipna');
  sim.press(G('C2')); sim.press({ kind: 'end', id: 'kW' });
  run(120);
  assert.equal(sim.ilk.signals.get('C2').route, 'C2-W', 'przebieg wyjazdowy nastawiony');
  assert.ok(tr.v === 0 && !tr.onLine('W'), `skład manewrowy nie ruszył na szlak (v=${tr.v})`);
  assert.equal(e(90201).status, 'zakończył bieg');
  // tryb pociągowy → przekazanie jako 90202, odjazd dopiero o 08:12 mimo sygnału zezwalającego
  assert.equal(sim.traffic.toTrainMode(90201), true);
  run(2);
  assert.ok(e(90202).train === tr, 'skład przekazany jako 90202');
  assert.equal(e(90201).status, 'przekazany jako 90202');
  until('08:11:30', false);
  assert.ok(tr.v === 0 && !tr.onLine('W'), 'przed 08:12 pociąg 90202 stoi');
  until('08:15', false);
  assert.ok(tr.onLine('W') || e(90202).status === 'na następnym posterunku', `90202 wyjechał po 08:12 (${e(90202).status})`);
  assert.ok(e(90202).actualDep >= Clock.parse('08:12'), 'odjazd nie przed 08:12');
});

test('Szkolna: w misji zmiana nie kończy się sama po ostatnim pociągu – kończy ją samouczek (endShift); bez misji kończy się sama', () => {
  assert.equal(new Simulation(szkolna, { scenario: 'nauka-2' }).autoEnd, false);
  assert.equal(new Simulation(szkolna, { scenario: 'nauka-1' }).autoEnd, false);
  assert.equal(new Simulation(szkolna, { scenario: 'zmiana', disruptions: 'none' }).autoEnd, true);
  // rozkład bez usterek scenariusza misji (automat nie obsługuje zapowiadania telefonicznego), ale z wyłączonym
  // automatycznym końcem – jak w misji
  const sim = new Simulation(szkolna, { scenario: 'zmiana', disruptions: 'none' });
  sim.autoEnd = false;
  let reports = 0; sim.bus.on('shift-end', () => reports++);
  let n = 0;
  const end = Clock.parse('08:49');
  while (sim.clock.time < end) { sim.step(0.5); if (n++ % 4 === 0) autoDispatch(sim); }
  const done = (e) => e.status === 'na następnym posterunku' || e.status === 'zakończył bieg' || e.status.startsWith('przekazany');
  assert.ok(sim.traffic.timetable().every(done), 'wszystkie pociągi obsłużone');
  assert.equal(sim.ended, false, 'zmiana trwa, dopóki samouczek nie zakończy misji');
  sim.endShift(); sim.endShift();
  assert.equal(sim.ended, true);
  assert.equal(reports, 1, 'raport raz');
  // z automatycznym końcem (zmiana bez misji albo przerwany samouczek) zmiana kończy się sama po ostatnim pociągu
  const sim2 = new Simulation(szkolna, { scenario: 'zmiana', disruptions: 'none' });
  n = 0;
  while (sim2.clock.time < end && !sim2.ended) { sim2.step(0.5); if (n++ % 4 === 0) autoDispatch(sim2); }
  assert.equal(sim2.ended, true);
  assert.ok(sim2.clock.time < end, 'koniec przed 08:49 – po ostatnim pociągu, nie po czasie');
});

test('Szkolna: krzyżowanie – wjazdy A→D2 i B→C1 nastawiają się jednocześnie (drogi ochronne T2e / T1w kończą się przed rozjazdami)', () => {
  const sim = new Simulation(szkolna, { disruptions: 'none' });
  const G = (id) => ({ kind: 'signal', id, color: 'green' });
  const run = (s) => { for (let i = 0; i < s * 2; i++) sim.step(0.5); };
  assert.deepEqual(sim.ilk.routes.get('A-D2').overlap, ['T2e']);
  assert.deepEqual(sim.ilk.routes.get('B-C1').overlap, ['T1w']);
  assert.deepEqual(sim.ilk.routes.get('A-D1').overlap, ['T1e']);
  assert.deepEqual(sim.ilk.routes.get('B-C2').overlap, ['T2w']);
  sim.press(G('A')); sim.press(G('D2')); run(10);
  assert.equal(sim.ilk.signals.get('A').route, 'A-D2');
  assert.deepEqual(sim.ilk.checkRoute(sim.ilk.routes.get('B-C1')), [], 'B→C1 bez konfliktu z A→D2');
  sim.press(G('B')); sim.press(G('C1')); run(10);
  assert.equal(sim.ilk.signals.get('B').route, 'B-C1');
  assert.ok(sim.ilk.active.has('A-D2') && sim.ilk.active.has('B-C1'));
  assert.notEqual(sim.ilk.signals.get('A').aspect, 'S1'); assert.notEqual(sim.ilk.signals.get('B').aspect, 'S1');
  // wjazdy na ten sam tor (A→D2 i B→C2) nadal się wykluczają – wspólny odcinek T2
  const sim2 = new Simulation(szkolna, { disruptions: 'none' });
  sim2.press(G('A')); sim2.press(G('D2')); for (let i = 0; i < 20; i++) sim2.step(0.5);
  assert.ok(sim2.ilk.checkRoute(sim2.ilk.routes.get('B-C2')).some((m) => /T2 utwierdzony/.test(m)), 'B→C2 koliduje z A→D2 na torze 2');
});

test('Szkolna: karta posterunku oznacza stanowisko „do wyboru” (zmiany na monitorze i na pulpicie typu E); Sopot – tylko monitor', async () => {
  const { srkBadge, stationViews } = await import('../src/ui/StartScreen.js');
  const sopot = (await import('../src/stations/sopot.js')).default;
  assert.deepEqual(stationViews(szkolna).sort(), ['desk', 'izh', 'screen']);
  assert.equal(srkBadge({ srk: 'izh111' }), 'IZH-111 · pulpit ciemny');
  assert.match(srkBadge(szkolna), /do wyboru/);
  assert.deepEqual(stationViews(sopot), ['screen']);
  assert.equal(srkBadge(sopot), 'komputerowe · monitor');
  assert.deepEqual(stationViews({ srk: 'E' }), ['desk'], 'bez scenariuszy – stanowisko stacji');
});

test('misje: słownik tekstów ma te same klucze i rodzaje wartości dla każdego widoku; nieznany widok to błąd', async () => {
  const { PHRASES, MISSION_VIEWS } = await import('../src/tutorial/missions.js');
  assert.deepEqual(MISSION_VIEWS, ['monitor', 'pulpit']);
  const shape = (d) => Object.fromEntries(Object.entries(d).map(([k, v]) => [k, typeof v === 'function' ? `function/${v.length}` : typeof v]));
  const base = shape(PHRASES[MISSION_VIEWS[0]]);
  assert.ok(Object.keys(base).length > 15);
  for (const view of MISSION_VIEWS) {
    assert.deepEqual(Object.keys(PHRASES[view]).sort(), Object.keys(base).sort(), `${view}: klucze`);
    for (const [k, kind] of Object.entries(shape(PHRASES[view]))) assert.equal(kind.split('/')[0], base[k].split('/')[0], `${view}/${k}: rodzaj wartości`);
    assert.equal(PHRASES[view].view, view);
    // każdy krok misji powstaje wyłącznie ze słownika – teksty drugiego widoku nie przeciekają
    assert.equal(missionSteps(view).length, missionSteps(MISSION_VIEWS[0]).length, `${view}: ta sama lista kroków`);
  }
  // kotwica: pasek poleceń tylko tam, gdzie widok go ma
  const ref = { ref: { kind: 'signal', id: 'A', color: 'green' } };
  assert.deepEqual(PHRASES.monitor.anchor('train', ref), { cmd: 'train' });
  assert.equal(PHRASES.pulpit.anchor('train', ref), ref);
  assert.throws(() => missionSteps('kluczowy'), /Brak tekstów misji dla widoku 'kluczowy'/);
  // kroki nie rozgałęziają się po widoku poza słownikiem
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../src/tutorial/missions.js', import.meta.url), 'utf8');
  const body = src.slice(src.indexOf('export function missionSteps'));
  assert.doesNotMatch(body, /view === |\bm \? /, 'rozgałęzienie po widoku w krokach misji');
});
