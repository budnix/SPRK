import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/model/Simulation.js';
import { getSrk } from '../src/srk/registry.js';
import { Interlocking } from '../src/model/Interlocking.js';
import szkolna from '../src/stations/szkolna.js';
import { run, autoDispatch, allArrived, Clock } from './helpers.js';

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
  assert.deepEqual(srk.model, { armTimeout: 60, pointSwitchTime: 2, timedRelease: 0, shuntTimedRelease: 0, manualPoints: true, manualSignal: true, routeBlock: true, holdRoute: true });
  const sim = mech();
  assert.equal(sim.ilk.manualPoints && sim.ilk.manualSignal && sim.ilk.routeBlock && sim.ilk.holdRoute, true);
  // domyślnie (typ E, monitor, IZH-111) przebieg sam przestawia zwrotnice i podaje sygnał
  for (const sc of ['zmiana', 'zmiana-e', 'zmiana-izh']) {
    const e = new Simulation(szkolna, { scenario: sc, disruptions: 'none' });
    assert.equal(e.ilk.manualPoints || e.ilk.manualSignal || e.ilk.routeBlock || e.ilk.holdRoute, false, sc);
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
  assert.ok(sim.ilk.active.has('A-D2'));
  assert.equal(sim.ilk.pending.length, 0);
  // przełożony drążek zamyka zwrotnice przebiegu
  assert.equal(sim.execute({ type: 'point', id: q.id, position: q.position === '+' ? '-' : '+' }).ok, false);
});

test('mechaniczna: sygnał dopiero dźwignią, po zablokowaniu bloku przebiegowego; drążek wraca przed blokowaniem', () => {
  const sim = mech();
  throwLevers(sim, 'A-D1'); run(sim, 3);
  assert.ok(sim.execute({ type: 'route', start: 'A', end: 'D1', kind: 'train' }).ok);
  assert.equal(sim.ilk.signals.get('A').aspect, 'S1', 'drążek sam nie podaje sygnału');
  const early = sim.execute({ type: 'clear', signal: 'A' });
  assert.equal(early.ok, false);
  assert.match(early.reason, /blok przebiegowy/);
  // przed zablokowaniem bloku drążek wolno cofnąć
  assert.ok(sim.execute({ type: 'release', signal: 'A' }).ok);
  assert.equal(sim.ilk.active.has('A-D1'), false);
  assert.equal(sim.ilk.counters.dPz, 0);
  // drążek, blok, dźwignia sygnałowa
  sim.execute({ type: 'route', start: 'A', end: 'D1', kind: 'train' });
  assert.ok(sim.execute({ type: 'route-block', signal: 'A' }).ok);
  assert.ok(sim.execute({ type: 'clear', signal: 'A' }).ok);
  assert.ok(Interlocking.isProceed(sim.ilk.signals.get('A').aspect));
  // zablokowany blok: drążka nie cofnie ani dźwignia na „Stój” – tylko pociąg albo zwalniacz (licznik)
  assert.match(sim.execute({ type: 'release', signal: 'A' }).reason, /dźwignię sygnałową/);
  assert.ok(sim.execute({ type: 'stop', signal: 'A' }).ok);
  assert.equal(sim.ilk.signals.get('A').aspect, 'S1');
  assert.match(sim.execute({ type: 'release', signal: 'A' }).reason, /blok przebiegowy utwierdzający zablokowany/);
  assert.ok(sim.execute({ type: 'release', signal: 'A', emergency: true }).ok);
  assert.equal(sim.ilk.counters.dPz, 1);
  assert.equal(sim.ilk.active.has('A-D1'), false);
  // dźwignię sygnałową bez przebiegu da się przełożyć na „Stój” (nic nie robi)
  assert.deepEqual(sim.execute({ type: 'stop', signal: 'A' }), { ok: true, noop: true });
});

test('mechaniczna: pociąg zwalnia blok, przebieg zostaje zamknięty do cofnięcia dźwigni i drążka; sygnał tylko raz', () => {
  const sim = mech();
  const e = sim.traffic.timetable().find((x) => x.nr === 6101);
  run(sim, 3600, (s) => { const b = s.blocks.get('W'); if (b.request === 'theirs') b.press('Poz'); });
  assert.ok(e.requested);
  throwLevers(sim, 'A-D1'); run(sim, 3);
  sim.execute({ type: 'route', start: 'A', end: 'D1', kind: 'train' });
  sim.execute({ type: 'route-block', signal: 'A' });
  sim.execute({ type: 'clear', signal: 'A' });
  for (let i = 0; i < 4000 && e.actualArr == null; i++) sim.step(0.5);
  run(sim, 60);
  assert.equal(String(e.actualTrack), '1');
  const act = sim.ilk.active.get('A-D1');
  assert.ok(act?.passed, 'przebieg czeka na zwolnienie drążkiem');
  assert.equal(act.blocked, false, 'blok przebiegowy zwolnił pociąg');
  assert.equal(sim.ilk.signals.get('A').aspect, 'S1', 'semafor na „Stój” po minięciu');
  // sygnał zezwalający dla tej jazdy już był (zawórka przeciwwtórna), drążek trzyma zwrotnice i semafor
  sim.execute({ type: 'stop', signal: 'A' });
  assert.match(sim.execute({ type: 'clear', signal: 'A' }).reason, /już był/);
  const q = sim.ilk.routes.get('A-D1').points[0];
  assert.equal(sim.execute({ type: 'point', id: q.id, position: q.position === '+' ? '-' : '+' }).ok, false, 'zwrotnica zamknięta drążkiem');
  assert.deepEqual(sim.ilk.setRoute('A-D2').codes.includes('signal-busy'), true);
  // cofnięcie drążka: przebieg zwolniony, zwrotnice wolne, bez licznika
  assert.deepEqual(sim.execute({ type: 'release', signal: 'A' }), { ok: true });
  assert.equal(sim.ilk.active.size, 0);
  assert.ok(sim.execute({ type: 'point', id: q.id, position: q.position === '+' ? '-' : '+' }).ok);
  assert.equal(sim.ilk.counters.dPz, 0);
});

test('mechaniczna: dźwignia sygnałowa przełożona po przejeździe blokuje cofnięcie drążka', () => {
  const sim = mech();
  run(sim, 3600, (s) => { const b = s.blocks.get('W'); if (b.request === 'theirs') b.press('Poz'); });
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
  let n = 0;
  while (sim.clock.time < Clock.parse('09:10') && !allArrived(sim) && !sim.ended) { sim.step(0.5); if (n++ % 4 === 0) autoDispatch(sim); }
  for (const e of sim.traffic.timetable()) {
    assert.ok(/na następnym posterunku|odjechał|przekazany|zakończył bieg/.test(e.status), `${e.nr}: ${e.status}`);
    assert.ok(e.delay <= 2, `${e.nr}: opóźnienie ${e.delay}`);
  }
  assert.equal(sim.ilk.counters.rozprucie, 0);
  assert.equal(sim.ilk.counters.dPz, 0);
  assert.deepEqual(sim.score.items.filter((i) => i.points < 0).map((i) => i.msg), []);
});
