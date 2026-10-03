import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/model/Simulation.js';
import { getSrk } from '../src/srk/registry.js';
import { Interlocking } from '../src/model/Interlocking.js';
import szkolna from '../src/stations/szkolna.js';
import { run, autoDispatch, allArrived, play, setRoutes, routesBeingSet, routeView, grant } from './helpers.js';
import { isHandled } from '../src/model/timetable/phase.js';

/* Urządzenia mechaniczne scentralizowane: dźwignie zwrotnic, drążek przebiegowy, blok przebiegowy utwierdzający,
   dźwignia sygnałowa (Instrukcja E16 §8–9, Ie-8 §5–9) */

const mech = (opts = {}) => new Simulation(szkolna, { disruptions: 'none', srk: 'mech', scenario: { id: 't', name: 't', endTime: '09:00' }, ...opts });
/** Dźwignie zwrotnic i wykolejnic przebiegu w położenia z tablicy zależności. */
function throwLevers(sim, routeId) {
  const r = sim.ilk.routes.get(routeId);
  for (const q of [...r.points, ...r.flank]) sim.execute({ type: 'point', id: q.id, position: q.position });
  for (const q of [...r.derailers.onRoute, ...r.derailers.protect]) sim.execute({ type: 'derailer', id: q.id, position: q.position });
}
/** Zwrotnica przebiegu w położeniu innym niż wymagane – żeby przebieg bez dźwigni był niemożliwy. */
function wrongPoint(sim, routeId) {
  const q = sim.ilk.routes.get(routeId).points[0];
  sim.execute({ type: 'point', id: q.id, position: q.position === '+' ? '-' : '+' });
  run(sim, 3);
  return q;
}

test('nastawnia mechaniczna w rejestrze: widok ława dźwigniowa, opcje zależności; inne stanowiska bez zmian', () => {
  const srk = getSrk('mech');
  assert.equal(srk.view, 'lever');
  assert.deepEqual(srk.model, { armTimeout: 60, pointSwitchTime: 2, timedRelease: 0, shuntTimedRelease: 0, manualPoints: true, manualSignal: true, routeBlock: true, holdRoute: true, shapedSignals: true, emergencyReleaseName: 'zwalniacz' }); // nazwa doraźnego zwolnienia w dzienniku (I3)
  const sim = mech();
  assert.equal(sim.ilk.manualPoints && sim.ilk.manualSignal && sim.ilk.routeBlock && sim.ilk.holdRoute && sim.ilk.shapedSignals, true);
  // domyślnie (typ E, monitor, IZH-111) przebieg sam przestawia zwrotnice i podaje sygnał
  for (const sc of ['zmiana', 'zmiana-e', 'zmiana-izh']) {
    const e = new Simulation(szkolna, { scenario: sc, disruptions: 'none' });
    assert.equal(e.ilk.manualPoints || e.ilk.manualSignal || e.ilk.routeBlock || e.ilk.holdRoute || e.ilk.shapedSignals, false, sc);
    assert.equal(e.ilk.signals.get('A').aspect, 'S1', `${sc}: semafory świetlne`);
    assert.equal(e.ilk.signals.get('A').warning, undefined, sc);
    const q = wrongPoint(e, 'A-D2');
    assert.ok(e.ilk.setRoute('A-D2').pending, sc);
    run(e, 6);
    assert.equal(e.ilk.points.get(q.id).position, q.position, `${sc}: przebieg przestawił zwrotnicę`);
    assert.ok(Interlocking.isProceed(e.ilk.signals.get('A').aspect), `${sc}: sygnał zezwalający bez dźwigni`);
  }
});

test('mechaniczna: drążek przebiegowy nie da się przełożyć przy złym położeniu dźwigni zwrotnicowej', () => {
  const sim = mech();
  const q = wrongPoint(sim, 'A-D2');
  const res = sim.ilk.setRoute('A-D2');
  assert.equal(res.ok, false);
  assert.deepEqual(res.codes, ['point-position']);
  assert.match(res.reason, new RegExp(`Zwrotnica ${q.id}`));
  assert.equal(sim.ilk.points.get(q.id).position === q.position, false, 'przebieg nie przestawia zwrotnic');
  // dźwignia zwrotnicowa: 2 s, potem drążek zamyka przebieg od razu (bez nastawiania)
  sim.execute({ type: 'point', id: q.id, position: q.position });
  assert.deepEqual(sim.ilk.setRoute('A-D2').codes, ['point-position'], 'zwrotnica w trakcie przestawiania');
  run(sim, 2.5);
  assert.deepEqual(sim.ilk.setRoute('A-D2'), { ok: true });
  assert.ok(sim.ilk.routeIsSet('A-D2'));
  assert.equal(routesBeingSet(sim.ilk).length, 0);
  // przełożony drążek zamyka zwrotnice przebiegu
  assert.equal(sim.execute({ type: 'point', id: q.id, position: q.position === '+' ? '-' : '+' }).ok, false);
});

test('mechaniczna: sygnał dopiero dźwignią, po zablokowaniu bloku przebiegowego; drążek wraca przed blokowaniem', () => {
  const sim = mech();
  throwLevers(sim, 'A-D1'); run(sim, 3);
  assert.ok(sim.execute({ type: 'route', start: 'A', end: 'D1', kind: 'train' }).ok);
  assert.equal(sim.ilk.signals.get('A').aspect, 'Sr1', 'drążek sam nie podaje sygnału');
  const early = sim.execute({ type: 'clear', signal: 'A' });
  assert.equal(early.ok, false);
  assert.match(early.reason, /blok przebiegowy/);
  // przed zablokowaniem bloku drążek wolno cofnąć
  assert.ok(sim.execute({ type: 'release', signal: 'A' }).ok);
  assert.equal(sim.ilk.routeIsSet('A-D1'), false);
  assert.equal(sim.ilk.counters.dPz, 0);
  // drążek, blok, dźwignia sygnałowa
  sim.execute({ type: 'route', start: 'A', end: 'D1', kind: 'train' });
  assert.ok(sim.execute({ type: 'route-block', signal: 'A' }).ok);
  assert.ok(sim.execute({ type: 'clear', signal: 'A' }).ok);
  assert.ok(Interlocking.isProceed(sim.ilk.signals.get('A').aspect));
  // zablokowany blok: drążka nie cofnie ani dźwignia na „Stój” – tylko pociąg albo zwalniacz (licznik)
  assert.match(sim.execute({ type: 'release', signal: 'A' }).reason, /dźwignię sygnałową/);
  assert.ok(sim.execute({ type: 'stop', signal: 'A' }).ok);
  assert.equal(sim.ilk.signals.get('A').aspect, 'Sr1');
  assert.match(sim.execute({ type: 'release', signal: 'A' }).reason, /blok przebiegowy utwierdzający zablokowany/);
  assert.ok(sim.execute({ type: 'release', signal: 'A', emergency: true }).ok);
  assert.equal(sim.ilk.counters.dPz, 1);
  assert.equal(sim.ilk.routeIsSet('A-D1'), false);
  // dźwignię sygnałową bez przebiegu da się przełożyć na „Stój” (nic nie robi)
  assert.deepEqual(sim.execute({ type: 'stop', signal: 'A' }), { ok: true, noop: true });
});

test('mechaniczna: drążek w położeniu pośrednim zamyka zwrotnice mimo zajętości z usterki – Sz bez kary za niezamknięte zwrotnice', () => {
  // usterka kontroli zajętości na drodze przebiegu A-D2: drążka nie da się przełożyć do końca
  const fault = (sim) => { const s = sim.ilk.sections.get(sim.ilk.routes.get('A-D2').sections.at(-1)); s.forced = true; sim.ilk.updateOccupancy(sim.traffic.currentOccupancy()); };
  const points = (sim) => sim.score.items.filter((i) => i.code === 'Sz-points').length;
  // bez położenia pośredniego: Sz przy niezamkniętych zwrotnicach – wolno, ale z karą
  const bare = mech();
  throwLevers(bare, 'A-D2'); run(bare, 3); fault(bare);
  assert.deepEqual(bare.execute({ type: 'route', id: 'A-D2' }).codes, ['section-occupied']);
  assert.ok(bare.execute({ type: 'substitute', signal: 'A' }).ok, 'Sz nie jest blokowany');
  assert.equal(points(bare), 1, 'kara za niezamknięte zwrotnice');
  // z położeniem pośrednim: zwrotnice zamknięte, sygnału zezwalającego i bloku nie ma, Sz bez tej kary
  const sim = mech();
  const q = wrongPoint(sim, 'A-D2');
  assert.deepEqual(sim.execute({ type: 'route-half', id: 'A-D2' }).codes, ['point-position'], 'złe położenie dźwigni – odmowa jak przy pełnym przełożeniu');
  throwLevers(sim, 'A-D2'); run(sim, 3); fault(sim);
  assert.deepEqual(sim.execute({ type: 'route-half', id: 'A-D2' }), { ok: true, half: true });
  assert.equal(setRoutes(sim.ilk).length, 0, 'przebiegu nie ma');
  assert.equal(sim.execute({ type: 'point', id: q.id, position: q.position === '+' ? '-' : '+' }).ok, false, 'zwrotnica zamknięta drążkiem');
  assert.match(sim.execute({ type: 'clear', signal: 'A' }).reason, /położeniu pośrednim/);
  assert.match(sim.execute({ type: 'route-block', signal: 'A' }).reason, /położeniu pośrednim/);
  assert.equal(sim.ilk.signals.get('A').aspect, 'Sr1');
  // drugi przebieg z tego samego drążka i przebieg po tych samych odcinkach – wykluczone
  assert.deepEqual(sim.execute({ type: 'route', id: 'A-D1' }).codes.includes('signal-busy'), true);
  assert.ok(sim.ilk.checkRoute(sim.ilk.routes.get('B-C2')).some((m) => /położeniu pośrednim/.test(m)));
  assert.ok(sim.execute({ type: 'substitute', signal: 'A' }).ok);
  assert.equal(points(sim), 0, 'zwrotnice zamknięte drążkiem – bez kary');
  assert.equal(sim.ilk.signals.get('A').aspect, 'Sz');
  // drążek wraca dopiero po zgaśnięciu Sz; potem zwrotnice wolne
  assert.match(sim.execute({ type: 'release', signal: 'A' }).reason, /sygnał zastępczy/);
  run(sim, 95);
  assert.ok(sim.execute({ type: 'release', signal: 'A' }).ok);
  assert.equal(sim.ilk.half.size, 0);
  assert.ok(sim.execute({ type: 'point', id: q.id, position: q.position === '+' ? '-' : '+' }).ok);
});

test('mechaniczna: z położenia pośredniego drążek idzie dalej do końca (pełny przebieg), gdy droga jest wolna; tylko przebiegi pociągowe', () => {
  const sim = mech();
  throwLevers(sim, 'A-D1'); run(sim, 3);
  assert.ok(sim.execute({ type: 'route-half', id: 'A-D1' }).ok);
  assert.deepEqual(sim.execute({ type: 'route-half', id: 'A-D1' }), { ok: true, noop: true });
  assert.deepEqual(sim.execute({ type: 'route', id: 'A-D1' }), { ok: true });
  assert.ok(sim.ilk.routeIsSet('A-D1'));
  assert.equal(sim.ilk.half.size, 0);
  assert.ok(sim.execute({ type: 'route-block', signal: 'A' }).ok);
  assert.ok(sim.execute({ type: 'clear', signal: 'A' }).ok);
  const shunt = [...sim.ilk.routes.values()].find((r) => r.kind === 'shunt');
  assert.match(sim.execute({ type: 'route-half', id: shunt.id }).reason, /manewrowy/);
  // stanowiska bez dźwigni zwrotnicowych nie mają tego położenia
  const e = new Simulation(szkolna, { scenario: 'zmiana-e', disruptions: 'none' });
  assert.equal(e.execute({ type: 'route-half', id: 'A-D1' }).ok, false);
  assert.equal(e.ilk.half.size, 0);
});

test('semafor kształtowy opada na Sr1 dopiero po minięciu go przez cały pociąg, świetlny – już pod czołem', () => {
  const pass = (sim, set) => {
    const e = sim.traffic.timetable().find((x) => x.nr === 6101);
    run(sim, 3600, grant('W'));
    set(sim);
    const route = sim.ilk.routes.get('A-D1'), approach = sim.ilk.sections.get(route.approach);
    const stop = sim.ilk.signals.get('A').kind && (sim.ilk.shapedSignals ? 'Sr1' : 'S1');
    assert.notEqual(sim.ilk.signals.get('A').aspect, stop);
    // czoło za semaforem, ogon jeszcze przed nim
    for (let i = 0; i < 4000 && !(e.train && e.train.occupiedSections().has(route.sections[0])); i++) sim.step(0.5);
    sim.step(0.5);
    assert.ok(approach.physical, 'ogon pociągu jeszcze przed semaforem');
    const under = sim.ilk.signals.get('A').aspect;
    for (let i = 0; i < 4000 && approach.physical; i++) sim.step(0.5);
    sim.step(0.5);
    return { under, after: sim.ilk.signals.get('A').aspect, stop };
  };
  const m = pass(mech(), (sim) => { throwLevers(sim, 'A-D1'); run(sim, 3); sim.execute({ type: 'route', id: 'A-D1' }); sim.execute({ type: 'route-block', signal: 'A' }); sim.execute({ type: 'clear', signal: 'A' }); });
  assert.equal(m.under, 'Sr2', 'ramię wzniesione, dopóki pociąg mija semafor');
  assert.equal(m.after, 'Sr1', 'po ostatniej osi – „Stój”');
  const l = pass(new Simulation(szkolna, { scenario: 'zmiana-e', disruptions: 'none' }), (sim) => { sim.ilk.setRoute('A-D1'); for (let i = 0; i < 40 && !sim.ilk.routeIsSet('A-D1'); i++) sim.step(0.5); });
  assert.equal(l.under, l.stop, 'semafor świetlny gaśnie pod czołem pociągu');
  assert.equal(l.after, l.stop);
});

test('mechaniczna: pociąg zwalnia blok, przebieg zostaje zamknięty do cofnięcia dźwigni i drążka; sygnał tylko raz', () => {
  const sim = mech();
  const e = sim.traffic.timetable().find((x) => x.nr === 6101);
  run(sim, 3600, grant('W'));
  assert.ok(e.requested);
  throwLevers(sim, 'A-D1'); run(sim, 3);
  sim.execute({ type: 'route', start: 'A', end: 'D1', kind: 'train' });
  sim.execute({ type: 'route-block', signal: 'A' });
  sim.execute({ type: 'clear', signal: 'A' });
  for (let i = 0; i < 4000 && e.actualArr == null; i++) sim.step(0.5);
  run(sim, 60);
  assert.equal(String(e.actualTrack), '1');
  const act = sim.ilk.routeFrame('A-D1');
  assert.ok(act?.passed, 'przebieg czeka na zwolnienie drążkiem');
  assert.equal(act.blocked, false, 'blok przebiegowy zwolnił pociąg');
  assert.equal(sim.ilk.signals.get('A').aspect, 'Sr1', 'semafor na „Stój” po minięciu');
  // sygnał zezwalający dla tej jazdy już był (zawórka przeciwwtórna), drążek trzyma zwrotnice i semafor
  sim.execute({ type: 'stop', signal: 'A' });
  assert.match(sim.execute({ type: 'clear', signal: 'A' }).reason, /już był/);
  const q = sim.ilk.routes.get('A-D1').points[0];
  assert.equal(sim.execute({ type: 'point', id: q.id, position: q.position === '+' ? '-' : '+' }).ok, false, 'zwrotnica zamknięta drążkiem');
  assert.deepEqual(sim.ilk.setRoute('A-D2').codes.includes('signal-busy'), true);
  // cofnięcie drążka: przebieg zwolniony, zwrotnice wolne, bez licznika
  assert.deepEqual(sim.execute({ type: 'release', signal: 'A' }), { ok: true });
  assert.equal(setRoutes(sim.ilk).length, 0);
  assert.ok(sim.execute({ type: 'point', id: q.id, position: q.position === '+' ? '-' : '+' }).ok);
  assert.equal(sim.ilk.counters.dPz, 0);
});

test('mechaniczna: dźwignia sygnałowa przełożona po przejeździe blokuje cofnięcie drążka', () => {
  const sim = mech();
  run(sim, 3600, grant('W'));
  throwLevers(sim, 'A-D1'); run(sim, 3);
  sim.execute({ type: 'route', start: 'A', end: 'D1', kind: 'train' });
  sim.execute({ type: 'route-block', signal: 'A' });
  sim.execute({ type: 'clear', signal: 'A' });
  const e = sim.traffic.timetable().find((x) => x.nr === 6101);
  for (let i = 0; i < 4000 && e.actualArr == null; i++) sim.step(0.5);
  run(sim, 60);
  const r = sim.execute({ type: 'release', signal: 'A' });
  assert.equal(r.ok, false);
  assert.match(r.reason, /najpierw przełóż dźwignię sygnałową A/);
});

test('mechaniczna: pełna zmiana na Szkolnej z automatem – dźwignie, drążki, bloki; pociągi o czasie, bez kar', () => {
  const sim = new Simulation(szkolna, { scenario: { ...szkolna.scenarios.find((x) => x.id === 'zmiana'), srk: 'mech' }, disruptions: 'none', seed: 5 });
  assert.equal(sim.srk.id, 'mech');
  play(sim).until('09:10', { stop: () => allArrived(sim) || sim.ended });
  for (const e of sim.traffic.timetable()) {
    assert.ok(isHandled(e), `${e.nr}: ${e.status}`);
    assert.ok(e.delay <= 2, `${e.nr}: opóźnienie ${e.delay}`);
  }
  assert.equal(sim.ilk.counters.rozprucie, 0);
  assert.equal(sim.ilk.counters.dPz, 0);
  assert.deepEqual(sim.score.items.filter((i) => i.points < 0).map((i) => i.msg), []);
});

test('mechaniczna – usterka: blok przebiegowy nie zwalnia się po przejeździe; drążek tylko zwalniaczem, bez kary', () => {
  const sim = new Simulation(szkolna, { disruptions: 'none', srk: 'mech', scenario: { id: 't', name: 't', endTime: '09:00', faults: [{ type: 'route-block', target: 'A', at: '07:00', duration: 120 }] } });
  run(sim, 3600, grant('W'));
  throwLevers(sim, 'A-D1'); run(sim, 3);
  sim.execute({ type: 'route', id: 'A-D1' });
  sim.execute({ type: 'route-block', signal: 'A' });
  sim.execute({ type: 'clear', signal: 'A' });
  const e = sim.traffic.timetable().find((x) => x.nr === 6101);
  for (let i = 0; i < 4000 && e.actualArr == null; i++) sim.step(0.5);
  run(sim, 60);
  const act = sim.ilk.routeFrame('A-D1');
  assert.ok(act.passed, 'pociąg przejechał');
  assert.equal(act.blocked, true, 'blok nie zwolnił się');
  sim.execute({ type: 'stop', signal: 'A' });
  const r = sim.execute({ type: 'release', signal: 'A' });
  assert.equal(r.ok, false);
  assert.match(r.reason, /blok przebiegowy utwierdzający zablokowany/);
  assert.ok(sim.execute({ type: 'release', signal: 'A', emergency: true }).ok);
  assert.equal(setRoutes(sim.ilk).length, 0);
  assert.equal(sim.ilk.counters.dPz, 1);
  assert.deepEqual(sim.score.items.filter((i) => i.code === 'dPz').map((i) => i.points), [0], 'zwalniacz przy usterce nie kosztuje punktów');
  // bez usterki zwalniacz kosztuje
  const plain = mech();
  throwLevers(plain, 'A-D1'); run(plain, 3);
  plain.execute({ type: 'route', id: 'A-D1' }); plain.execute({ type: 'route-block', signal: 'A' });
  plain.execute({ type: 'release', signal: 'A', emergency: true });
  assert.deepEqual(plain.score.items.filter((i) => i.code === 'dPz').map((i) => i.points), [-20]);
});

test('mechaniczna – usterka bloku przebiegowego trafia do losowania tylko na nastawni mechanicznej', async () => {
  const { FAULT_TYPES } = await import('../src/model/faults/types.js');
  assert.ok(FAULT_TYPES.includes('route-block'));
  for (let seed = 1; seed < 30; seed++) {
    const s = new Simulation(szkolna, { scenario: { id: 't', name: 't', endTime: '12:00', srk: 'E' }, disruptions: 'high', seed });
    assert.ok(!s.faults.list.some((f) => f.type === 'route-block'), `seed ${seed}: blok przebiegowy na pulpicie typu E`);
  }
  const drawn = (seed) => new Simulation(szkolna, { scenario: { id: 't', name: 't', endTime: '12:00', srk: 'mech' }, disruptions: 'high', seed }).faults.list;
  const hit = Array.from({ length: 60 }, (_, i) => drawn(i + 1)).flat().find((f) => f.type === 'route-block');
  assert.ok(hit, 'na nastawni mechanicznej usterka bloku bywa losowana');
  assert.ok(szkolna.tiles.some((t) => t.type === 'signal' && t.kind === 'semafor' && t.id === hit.target), 'cel – semafor');
});

test('mechaniczna – automat dyżurnego przy usterce bloku przebiegowego używa zwalniacza; pociągi o czasie', () => {
  const sc = { ...szkolna.scenarios.find((x) => x.id === 'zmiana'), srk: 'mech', faults: [{ type: 'route-block', target: 'A', at: '07:00', duration: 120 }] };
  const sim = new Simulation(szkolna, { scenario: sc, disruptions: 'none', seed: 5 });
  play(sim).until('09:10', { stop: () => allArrived(sim) || sim.ended });
  for (const e of sim.traffic.timetable()) assert.ok(e.delay <= 2 && isHandled(e), `${e.nr}: ${e.status}, ${e.delay} min`);
  assert.ok(sim.ilk.counters.dPz >= 1, 'zwalniacz użyty');
  assert.deepEqual(sim.score.items.filter((i) => i.points < 0).map((i) => i.msg), []);
});

/* Semafory kształtowe (Ie-1 §3, §5, §7): Sr1 / Sr2 / Sr3, tarcze ostrzegawcze kształtowe przy wjazdowych, tarcze
   manewrowe kształtowe M1 / M2 */

/** Drążek, blok (pociągowy) i dźwignia sygnałowa dla przebiegu – zwrotnice już ustawione. */
function setAndClear(sim, routeId) {
  const r = sim.ilk.routes.get(routeId);
  throwLevers(sim, routeId); run(sim, 3);
  assert.ok(sim.execute({ type: 'route', id: routeId }).ok, routeId);
  if (r.kind === 'train') assert.ok(sim.execute({ type: 'route-block', signal: r.start }).ok, routeId);
  assert.ok(sim.execute({ type: 'clear', signal: r.start }).ok, routeId);
  return sim.ilk.signals.get(r.start);
}

test('semafory kształtowe: Sr1 w zasadniczym, Sr2 na tor prosty, Sr3 (do 40 km/h) na zwrotny; dwa ramiona tylko gdy trzeba', () => {
  const sim = mech();
  for (const s of sim.ilk.signals.values()) assert.equal(s.aspect, s.kind === 'semafor' ? 'Sr1' : 'M1', s.id);
  // dwa ramiona ma semafor, z którego wychodzi przebieg pociągowy ze zmniejszoną szybkością
  for (const s of [...sim.ilk.signals.values()].filter((x) => x.kind === 'semafor')) {
    const slow = [...sim.ilk.routes.values()].some((r) => r.start === s.id && r.kind === 'train' && r.speed <= 60);
    assert.equal(s.arms, slow ? 2 : 1, s.id);
  }
  assert.equal(sim.ilk.signals.get('A').arms, 2);
  assert.ok([...sim.ilk.signals.values()].some((s) => s.arms === 1), 'są też semafory jednoramienne');
  assert.equal(setAndClear(sim, 'A-D1').aspect, 'Sr2');
  assert.equal(Interlocking.aspectSpeed('Sr2'), Infinity);
  sim.execute({ type: 'stop', signal: 'A' });
  sim.execute({ type: 'release', signal: 'A', emergency: true });
  assert.equal(setAndClear(sim, 'A-D2').aspect, 'Sr3');
  assert.equal(Interlocking.aspectSpeed('Sr3'), 40);
  assert.ok(Interlocking.isProceed('Sr3') && !Interlocking.isProceed('Sr1') && Interlocking.isStop('Sr1'));
});

test('tarcza ostrzegawcza kształtowa przy semaforze wjazdowym: Ot1 / Ot2 / Ot3 (dwa ramiona), Od1 / Od2 (jedno)', () => {
  const sim = mech();
  const A = sim.ilk.signals.get('A');
  assert.equal(A.warning, 'Ot1');
  for (const s of sim.ilk.signals.values()) assert.equal(s.warning !== undefined, s.kind === 'semafor' && !!s.tile.entry, s.id);
  setAndClear(sim, 'A-D1');
  assert.equal(A.warning, 'Ot2');
  sim.execute({ type: 'stop', signal: 'A' });
  assert.equal(A.warning, 'Ot1');
  sim.execute({ type: 'release', signal: 'A', emergency: true });
  setAndClear(sim, 'A-D2');
  assert.equal(A.warning, 'Ot3');
  // dwustawna – semafor jednoramienny: tylko „Stój” albo „zezwalający”
  assert.deepEqual(['Sr1', 'Sr2', 'Sr3', 'Sz'].map((a) => Interlocking.warningAspect(a, 1)), ['Od1', 'Od2', 'Od2', 'Od1']);
  assert.deepEqual(['Sr1', 'Sr2', 'Sr3', 'Sz'].map((a) => Interlocking.warningAspect(a, 2)), ['Ot1', 'Ot2', 'Ot3', 'Ot1']);
});

test('tarcza manewrowa kształtowa: M1 → M2 po przebiegu manewrowym; semafor z sygnałem manewrowym też M2; Sz przy Sr1', () => {
  const sim = mech();
  const shunt = [...sim.ilk.routes.values()].find((r) => r.kind === 'shunt' && sim.ilk.signals.get(r.start).kind === 'tm');
  assert.equal(setAndClear(sim, shunt.id).aspect, 'M2');
  assert.equal(Interlocking.aspectSpeed('M2'), 25);
  assert.ok(Interlocking.isShuntProceed('M2') && !Interlocking.isProceed('M1'));
  const semShunt = [...sim.ilk.routes.values()].find((r) => r.kind === 'shunt' && sim.ilk.signals.get(r.start).kind === 'semafor' && !r.sections.some((x) => shunt.sections.includes(x)));
  assert.equal(setAndClear(sim, semShunt.id).aspect, 'M2', semShunt.id);
  const sz = mech();
  assert.ok(sz.execute({ type: 'substitute', signal: 'B' }).ok);
  assert.equal(sz.ilk.signals.get('B').aspect, 'Sz');
  assert.equal(sz.ilk.signals.get('B').warning, sz.ilk.signals.get('B').arms === 2 ? 'Ot1' : 'Od1');
});

test('semafor kształtowy: pociąg mija Sr3 z szybkością najwyżej 40 km/h; przed Sr1 rozkaz pisemny nie jest „zbędny”', () => {
  const sim = mech();
  const e = sim.traffic.timetable().find((x) => x.nr === 6101);
  run(sim, 3600, grant('W'));
  setAndClear(sim, 'A-D2');
  // szybkość w chwili wjazdu czoła za semafor A (na pierwszy odcinek przebiegu)
  const first = sim.ilk.routes.get('A-D2').sections[0];
  let v = null;
  for (let i = 0; i < 4000 && v == null; i++) {
    sim.step(0.5);
    if (e.train && [...e.train.occupiedSections()].includes(first)) v = e.train.v * 3.6;
  }
  assert.ok(v > 0, 'pociąg minął semafor');
  assert.ok(v <= 40.5, `przy semaforze ${v.toFixed(1)} km/h`);
  // następny pociąg z Wierzbna staje przed A na „Stój” (Sr1) – rozkaz pisemny nie jest „zbędny”
  const sim2 = mech();
  run(sim2, 3600, grant('W'));
  for (let i = 0; i < 4000 && !(e2(sim2)?.train?.entered && e2(sim2).train.v === 0 && e2(sim2).train.nextSignal() === 'A'); i++) sim2.step(0.5);
  assert.equal(sim2.ilk.signals.get('A').aspect, 'Sr1');
  const res = sim2.traffic.issueOrder({ nr: 6101, signal: 'A', text: 'S', reason: 'test' });
  assert.doesNotMatch(res.reason || '', /zbędny/); // dalej sprawdza drogę jazdy (tu: zwrotnica niezamknięta)
  assert.match(res.reason, /Zw1/);
});
const e2 = (sim) => sim.traffic.timetable().find((x) => x.nr === 6101);

test('tor docelowy z odcinkiem za peronem (Olszyny, B-C2): pociąg staje przy peronie, a przebieg jest „przejechany” – drążek da się cofnąć, zwrotnice wolne', async () => {
  const { default: olszyny } = await import('../src/stations/olszyny.js');
  const { autoDispatch: auto, allArrived: done } = await import('./helpers.js');
  for (const srk of ['mech', 'E']) {
    // pociąg z Grabowca przyjęty na tor 2: peron jest na odcinku T2, a przebieg B-C2 kończy się dalej, na T2x przy semaforze C2
    const sim = new Simulation(olszyny, { srk, disruptions: 'none', scenario: { id: 't', name: 't', endTime: '08:00', tasks: [], timetable: [
      { nr: 4002, kind: 'os', name: 'Osobowy', from: 'E', to: 'W', arr: '07:10', dep: '07:20', track: '2', stop: true, length: 100, vmax: 100, dwell: 60 },
    ] } });
    const e = sim.traffic.timetable()[0];
    const game = play(sim, auto);
    game.until('07:16', { stop: () => e.actualArr != null });
    game.until(sim.clock.time + 20);
    assert.ok(e.actualArr != null, `${srk}: pociąg przyjechał`);
    assert.equal(String(e.actualTrack), '2');
    assert.ok(e.train.occupiedSections().has('T2') && !e.train.occupiedSections().has('T2x'), `${srk}: stoi przy peronie, przed odcinkiem T2x`);
    // przebieg wjazdowy nie wisi: na nastawni mechanicznej automat cofnął drążek, gdzie indziej przebieg rozwiązał się sam
    assert.equal(sim.ilk.routeIsSet('B-C2'), false, `${srk}: przebieg B-C2 zakończony`);
    assert.equal(sim.ilk.sections.get('T2x').route, null, `${srk}: odcinek T2x zwolniony`);
    for (const p of sim.ilk.routes.get('B-C2').points) assert.equal(sim.ilk.pointLockedByRoute(p.id), null, `${srk}: zwrotnica ${p.id} wolna`);
    game.until('08:30', { stop: done });
    assert.equal(e.phase, 'at-neighbour', `${srk}: ${e.status}`);
  }
});

test('nastawnia mechaniczna: usterka obwodu torowego pod pociągiem – przebieg nie jest „przejechany”; zwalniacz uzasadniony usterką, automat go używa', () => {
  // pociąg z Brzeziny na tor 2: przebieg B-C2 prowadzi przez T2b i Iz3, zanim wejdzie na tor docelowy (T2e, T2)
  const sim = new Simulation(szkolna, { srk: 'mech', disruptions: 'none', scenario: { id: 't', name: 't', endTime: '08:00', tasks: [], timetable: [
    { nr: 5002, kind: 'os', name: 'Osobowy', from: 'E', to: 'W', arr: '07:08', dep: '07:10', track: '2', stop: true, length: 100, vmax: 100, dwell: 60 },
  ] } });
  const e = sim.traffic.timetable()[0];
  let faulty = null, stuck = false;
  play(sim).until('08:30', { stop: allArrived, each: () => {
    const act = routeView(sim.ilk, 'B-C2');
    // pociąg wjechał w przebieg: odcinek przed nim (przed torem docelowym) wykazuje zajętość bez taboru; naprawa dopiero
    // po zwolnieniu przebiegu – do tego czasu przebieg nie może się rozwiązać sam
    if (!faulty && act?.entered) {
      const k = act.sections.findIndex((sid, i) => i > act.front && i < act.sections.length - 2);
      if (k >= 0) { faulty = sim.ilk.sections.get(act.sections[k]); faulty.forced = true; sim.ilk.updateOccupancy(sim.traffic.currentOccupancy()); }
    }
    if (faulty && act && sim.ilk.routeState('B-C2') === 'stuck') stuck = true;
    if (stuck && faulty.forced && !act) { faulty.forced = false; sim.ilk.updateOccupancy(sim.traffic.currentOccupancy()); }
  } });
  assert.ok(faulty && stuck, 'przebieg zatrzymany przez usterkę');
  assert.equal(e.phase, 'at-neighbour', e.status);
  assert.equal(setRoutes(sim.ilk).length, 0);
  const dpz = sim.score.items.filter((i) => i.code === 'dPz');
  assert.ok(dpz.length >= 1 && dpz.every((i) => i.points === 0), JSON.stringify(dpz));
});
