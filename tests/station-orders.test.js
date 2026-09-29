import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/model/Simulation.js';
import szkolna from '../src/stations/szkolna.js';
import { run } from './helpers.js';

/*
 * Polecenia stanowisk komputerowych (instrukcja obsługi EBILock 950 / EBIScreen 3, LIRK): zamknięcie ruchowe toru
 * (ITS / ITO), stopowanie sygnalizatora (SES / SEO), stopowanie wszystkich sygnalizatorów stacji (SSS / SSO),
 * wygaszenie sygnałów zastępczych (SZO), odwołanie zwalniania czasowego (KZW). Model – wspólny dla stanowisk.
 */
const sim = () => new Simulation(szkolna, { scenario: 'zmiana', disruptions: 'none' });
const sectionOf = (s, routeId) => s.ilk.routes.get(routeId).sections.find((id) => s.ilk.sections.get(id).kind === 'station');

test('ITS / ITO: zamknięcie ruchowe toru – przebieg na tor zamknięty odrzucony, po odwołaniu możliwy', () => {
  const s = sim();
  const sec = sectionOf(s, 'A-D1');
  assert.deepEqual(s.execute({ type: 'close-section', section: sec, closed: true }), { ok: true });
  assert.equal(s.ilk.sections.get(sec).closed, true);
  const res = s.ilk.setRoute('A-D1');
  assert.equal(res.ok, false);
  assert.ok(res.codes.includes('section-closed'));
  assert.deepEqual(s.execute({ type: 'close-section', section: sec, closed: false }), { ok: true });
  assert.equal(s.ilk.sections.get(sec).closed, false);
  assert.ok(s.ilk.setRoute('A-D1').ok);
  run(s, 10); // zwrotnice dojechały – przebieg utwierdzony
  // odcinka utwierdzonego w przebiegu zamknąć nie można
  const locked = s.execute({ type: 'close-section', section: sec, closed: true });
  assert.equal(locked.ok, false);
  assert.match(locked.reason, /przebieg/);
  assert.equal(s.execute({ type: 'close-section', section: 'nie-ma', closed: true }).ok, false);
});

test('ITO nie otwiera toru zamkniętego z planu (zamknięcie w scenariuszu)', () => {
  const s = new Simulation(szkolna, { scenario: { id: 't', name: 't', endTime: '09:00', closedSections: [{ section: 'T3' }] }, disruptions: 'none' });
  run(s, 1);
  if (!s.ilk.sections.get('T3')) return; // stacja bez odcinka T3 – nic do sprawdzenia
  assert.equal(s.ilk.sections.get('T3').closed, true);
  const res = s.execute({ type: 'close-section', section: 'T3', closed: false });
  assert.equal(res.ok, false);
  assert.equal(s.ilk.sections.get('T3').closed, true);
});

test('SES / SEO: stopowanie sygnalizatora – „Stój” mimo przebiegu, po odwołaniu sygnał zezwalający wraca', () => {
  const s = sim();
  assert.ok(s.ilk.setRoute('A-D1').ok);
  run(s, 10);
  const A = s.ilk.signals.get('A');
  assert.notEqual(A.aspect, 'S1');
  assert.deepEqual(s.execute({ type: 'signal-stop', signal: 'A', on: true }), { ok: true });
  assert.equal(A.stopped, true);
  assert.equal(A.aspect, 'S1');
  assert.ok(s.ilk.active.has('A-D1'), 'przebieg zostaje utwierdzony');
  s.execute({ type: 'signal-stop', signal: 'A', on: false });
  assert.equal(A.stopped, false);
  assert.notEqual(A.aspect, 'S1');
});

test('SSS / SSO: wszystkie sygnalizatory stacji na „Stój”; SZO gasi sygnały zastępcze', () => {
  const s = sim();
  assert.ok(s.ilk.setRoute('A-D1').ok);
  run(s, 10);
  assert.deepEqual(s.execute({ type: 'all-stop', on: true }), { ok: true });
  assert.equal(s.ilk.allStop, true);
  for (const sig of s.ilk.signals.values()) assert.ok(['S1', 'Ms1'].includes(sig.aspect), sig.id);
  s.execute({ type: 'all-stop', on: false });
  assert.notEqual(s.ilk.signals.get('A').aspect, 'S1');
  // sygnał zastępczy i jego wygaszenie
  const t = sim();
  assert.ok(t.execute({ type: 'substitute', signal: 'B' }).ok);
  assert.equal(t.ilk.signals.get('B').aspect, 'Sz');
  assert.deepEqual(t.execute({ type: 'substitute-off' }), { ok: true });
  assert.equal(t.ilk.signals.get('B').aspect, 'S1');
});

test('KZW: odwołanie zwalniania czasowego – przebieg zostaje utwierdzony', () => {
  const s = sim();
  assert.ok(s.ilk.setRoute('A-D1').ok);
  run(s, 10);
  const approach = s.ilk.routes.get('A-D1').approach;
  s.ilk.updateOccupancy(new Set([approach]));
  const rel = s.execute({ type: 'release', signal: 'A' });
  assert.ok(rel.timed, 'odcinek zbliżania zajęty – zwalnianie czasowe');
  assert.ok(s.ilk.active.get('A-D1').timedRelease);
  assert.deepEqual(s.execute({ type: 'cancel-timed', signal: 'A' }), { ok: true });
  assert.equal(s.ilk.active.get('A-D1').timedRelease, null);
  run(s, 200);
  assert.ok(s.ilk.active.has('A-D1'), 'bez zwalniania czasowego przebieg trwa');
  assert.equal(s.execute({ type: 'cancel-timed', signal: 'A' }).ok, false, 'nic do odwołania');
});

/* Usterka nawierzchni zgłoszona przez maszynistę (track-defect): tor trzeba zamknąć (ITS); jazda po torze z usterką bez
   zamknięcia kosztuje punkty, wjazd na tor zamknięty – więcej; przyjęcie na inny tor – bez kary; usterki nie losuje się. */
test('track-defect: alarm, kara za jazdę po torze bez zamknięcia, wjazd na tor zamknięty (ITS) karany mocniej; tylko ze scenariusza', async () => {
  const { FAULT_TYPES } = await import('../src/model/Faults.js');
  assert.ok(FAULT_TYPES.includes('track-defect'));
  const mk = () => new Simulation(szkolna, { disruptions: 'none', scenario: { id: 't', name: 't', endTime: '09:00', faults: [{ type: 'track-defect', target: 'T1', at: '07:01', duration: 30 }] } });
  const s = mk();
  const alarms = [];
  s.bus.on('alarm', (a) => alarms.push(a));
  run(s, 90);
  assert.equal(alarms.filter((a) => a.type === 'fault').length, 1);
  assert.equal(s.ilk.sections.get('T1').defect, true);
  // pociąg wjeżdża na tor 1 bez zamknięcia – kara
  s.ilk.updateOccupancy(new Set(['T1']));
  run(s, 1);
  assert.ok(s.score.items.some((i) => i.code === 'track-defect' && i.points < 0));
  // zamknięty tor (ITS) nie zwalnia z odpowiedzialności: wjazd pociągu (np. na Sz) karany mocniej niż bez zamknięcia
  const t2 = mk();
  run(t2, 90);
  assert.ok(t2.execute({ type: 'close-section', section: 'T1', closed: true }).ok);
  t2.ilk.updateOccupancy(new Set(['T1']));
  run(t2, 1);
  assert.equal(t2.score.items.find((i) => i.code === 'track-defect')?.points, -80);
  run(t2, 30 * 60);
  assert.equal(t2.ilk.sections.get('T1').defect, false, 'naprawa po czasie usterki');
  // losowanie usterek nie daje usterki nawierzchni
  for (let seed = 1; seed < 30; seed++) {
    const r = new Simulation(szkolna, { scenario: 'zmiana', disruptions: 'high', seed });
    assert.ok(!r.faults.list.some((f) => f.type === 'track-defect'), `seed ${seed}`);
  }
});

test('zwolnienie czasowe na żądanie (release z timed): czasowo także przy wolnym odcinku zbliżania', () => {
  const s = sim();
  assert.ok(s.ilk.setRoute('A-D1').ok);
  run(s, 10);
  const r = s.execute({ type: 'release', signal: 'A', timed: true });
  assert.ok(r.timed, 'zwalnianie czasowe');
  assert.ok(s.ilk.active.get('A-D1').timedRelease);
  assert.equal(s.ilk.signals.get('A').aspect, 'S1', 'sygnał „Stój” od razu');
  run(s, 100);
  assert.equal(s.ilk.active.has('A-D1'), false, 'po czasie przebieg zwolniony');
  // bez flagi, przy wolnym odcinku zbliżania – od razu (jak dotąd)
  const t = sim();
  t.ilk.setRoute('A-D1'); run(t, 10);
  assert.deepEqual(t.execute({ type: 'release', signal: 'A' }), { ok: true });
  assert.equal(t.ilk.active.has('A-D1'), false);
});

/* Usterka licznika osi (axle-counter): od `at` licznik myli się przy najbliższym przejeździe – po zjeździe pociągu odcinek
   wskazuje zajętość; zerowanie ZeroLO (axle-reset) – odcinek ciemnoczerwony do przejazdu kontrolnego (nowy wjazd
   i wyjazd pociągu), potem wolny (opis SPE). Tabor fizycznie symulowany zbiorem zajętości ruchu. */
const axleSim = (duration = 120) => new Simulation(szkolna, { disruptions: 'none', scenario: { id: 't', name: 't', endTime: '09:00', faults: [{ type: 'axle-counter', target: 'T1', at: '07:01', duration }] } });
const occupy = (s, set) => { s.traffic.currentOccupancy = () => new Set(set); run(s, 1); };

test('axle-counter: pojawia się po zjeździe pociągu, zerowanie, przejazd kontrolny zwalnia odcinek; tylko ze scenariusza', async () => {
  const { FAULT_TYPES } = await import('../src/model/Faults.js');
  assert.ok(FAULT_TYPES.includes('axle-counter'));
  const s = axleSim();
  run(s, 90);
  const T1 = s.ilk.sections.get('T1');
  assert.equal(T1.axleFault, undefined, 'bez przejazdu pociągu usterki jeszcze nie ma');
  assert.equal(s.execute({ type: 'axle-reset', section: 'T1' }).ok, false, 'nie ma czego zerować');
  occupy(s, ['T1']); occupy(s, []); // pociąg przejechał – licznik się pomylił
  assert.equal(T1.axleFault, true);
  assert.equal(T1.occupied, true);
  assert.equal(T1.physical, false);
  assert.equal(s.ilk.setRoute('A-D1').ok, false, 'na zajęty tor przebiegu nie ma');
  assert.deepEqual(s.execute({ type: 'axle-reset', section: 'T1' }), { ok: true });
  assert.equal(T1.resetPending, true);
  assert.equal(T1.occupied, true, 'po zerowaniu nadal zajęty – do przejazdu kontrolnego');
  assert.equal(s.execute({ type: 'axle-reset', section: 'T1' }).ok, false, 'zerowanie już wykonane');
  occupy(s, ['T1']); occupy(s, []); // przejazd kontrolny
  assert.equal(T1.occupied, false);
  assert.equal(T1.axleFault, false);
  assert.ok(s.faults.list.find((f) => f.type === 'axle-counter').done);
  for (let seed = 1; seed < 30; seed++) {
    const r = new Simulation(szkolna, { scenario: 'zmiana', disruptions: 'high', seed });
    assert.ok(!r.faults.list.some((f) => f.type === 'axle-counter'), `seed ${seed}`);
  }
});

test('axle-counter: tabor stojący przy zerowaniu to nie przejazd kontrolny; bez przejazdu usterkę usuwa automatyk', () => {
  const s = axleSim();
  const logs = [];
  s.bus.on('log', (e) => logs.push(e.msg));
  run(s, 90); occupy(s, ['T1']); occupy(s, []);
  occupy(s, ['T1']); // na odcinek wjechał pociąg (np. na sygnał zastępczy) jeszcze przed zerowaniem
  assert.ok(s.execute({ type: 'axle-reset', section: 'T1' }).ok);
  occupy(s, []); // ten pociąg zjeżdża – to nie jest przejazd kontrolny po zerowaniu
  assert.equal(s.ilk.sections.get('T1').axleFault, true);
  occupy(s, ['T1']); occupy(s, []); // dopiero nowy wjazd i wyjazd
  assert.equal(s.ilk.sections.get('T1').axleFault, false);
  assert.ok(logs.some((m) => /przejazd kontrolny po zerowaniu/.test(m)));
  // bez przejazdu: po czasie usterki automatyk – właściwy komunikat także po zerowaniu
  const t = axleSim(2);
  const tl = [];
  t.bus.on('log', (e) => tl.push(e.msg));
  run(t, 90); occupy(t, ['T1']); occupy(t, []);
  t.execute({ type: 'axle-reset', section: 'T1' });
  run(t, 180);
  assert.equal(t.ilk.sections.get('T1').axleFault, false);
  assert.ok(tl.some((m) => /naprawiony \(automatyk\)/.test(m)));
  assert.ok(!tl.some((m) => /przejazd kontrolny po zerowaniu/.test(m)));
});

test('fałszywa zajętość i licznik osi na tym samym odcinku nie kasują się nawzajem', () => {
  const s = new Simulation(szkolna, { disruptions: 'none', scenario: { id: 't', name: 't', endTime: '09:00', faults: [
    { type: 'axle-counter', target: 'T1', at: '07:01', duration: 120 }, { type: 'false-occupancy', target: 'T1', at: '07:05', duration: 2 }] } });
  run(s, 90); occupy(s, ['T1']); occupy(s, []);
  run(s, 5 * 60); // fałszywa zajętość minęła
  assert.equal(s.ilk.sections.get('T1').axleFault, true);
  assert.equal(s.ilk.sections.get('T1').occupied, true, 'licznik osi dalej wskazuje zajętość');
});

/* Zajętość z usterki (fałszywa zajętość, licznik osi) nie jest wjazdem pociągu: przebieg nastawiony przed usterką nie
   „przejeżdża” sam – semafor nie spada na „Stój” z powodu przejazdu, przebieg zostaje utwierdzony. */
test('zajętość z usterki na odcinku przebiegu nie jest wjazdem pociągu – przebieg nie rozwiązuje się sam', () => {
  const s = new Simulation(szkolna, { disruptions: 'none', scenario: { id: 't', name: 't', endTime: '09:00', faults: [{ type: 'false-occupancy', target: 'T1', at: '07:01', duration: 10 }] } });
  assert.ok(s.ilk.setRoute('A-D1').ok);
  run(s, 30);
  assert.ok(s.ilk.active.has('A-D1'));
  run(s, 60); // 07:01 – odcinek T1 przebiegu „zajęty” bez pociągu
  assert.equal(s.ilk.sections.get('T1').occupied, true);
  const act = s.ilk.active.get('A-D1');
  assert.ok(act, 'przebieg nadal nastawiony');
  assert.equal(act.trainEntered, false, 'usterka to nie wjazd pociągu');
  assert.ok(!s.ilk.log.some((e) => /Pociąg minął semafor A/.test(e.msg)));
});
