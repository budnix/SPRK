import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeSim, run } from './helpers.js';

/*
 * Blokada Eap w całej symulacji (audyt realizmu, grupa 4). Źródło: LIRK, P. Okrzesik, „Obsługa i sygnalizacja stanu
 * półsamoczynnej blokady liniowej typu Eap”; Ie-20 zał. 4 pkt 16; Ir-1 §28 ust. 8–9, 16.
 *  - W4: dPo blokuje blok początkowy po wyjeździe na Sz / rozkaz, dKo przygotowuje blok końcowy przed wjazdem na Sz –
 *    żaden nie kasuje blokady; wjazd na Sz bez dKo – Ko odmawia (brak stwierdzenia przejazdu).
 *  - W13: po podaniu sygnału wyjazdowego (Pwl) drugi sygnał na szlak nie wyjdzie – po odwołaniu wyprawienie na Sz.
 *  - W12: przy blokadzie bez łączności sygnał wyjazdowy wymaga pozwolenia, które było u nas; inaczej Sz (uzasadniony).
 */

const score = (sim, code) => sim.score.items.filter((i) => i.code === code);
const G = (id) => ({ kind: 'signal', id, color: 'green' });

/** Pociąg 5310 (Lipowa → Dąbrowa Leśna) stoi przed A; Poz dane. */
function trainAtA(sim) {
  const w = sim.blocks.get('W');
  run(sim, 60 * 16, () => { if (w.request === 'theirs') w.press('Poz'); });
  const e = sim.traffic.timetable().find((x) => x.nr === 5310);
  assert.equal(e.train.stoppedAt?.signal, 'A');
  return e;
}

/** Wjazd 5310 na Sz przy usterce semafora A (przebieg A-D1 utwierdzony, A na „Stój”). */
function entryOnSz(sim, { dko }) {
  const e = trainAtA(sim);
  const w = sim.blocks.get('W');
  sim.ilk.signals.get('A').failed = true;
  assert.ok(sim.ilk.setRoute('A-D1').ok); run(sim, 8);
  assert.equal(sim.ilk.signals.get('A').aspect, 'S1');
  if (dko) assert.ok(w.press('dKo').ok);
  assert.ok(sim.ilk.substituteSignal('A').ok);
  run(sim, 4 * 60);
  assert.equal(e.actualTrack, '1');
  assert.equal(w.koPending, true);
  return { e, w };
}

test('W4: wjazd na Sz z dKo przed Sz – Ko działa, dKo bez kary, blokada nie skasowana przez dKo', () => {
  const sim = makeSim();
  const { w } = entryOnSz(sim, { dko: true });
  assert.equal(score(sim, 'dKo').at(-1).points, 0);
  assert.equal(w.press('Ko').ok, true);
  assert.equal(w.direction, null);
  assert.equal(w.counters.dKo, 1);
});

test('W4: wjazd na Sz bez dKo – Ko odmawia (brak stwierdzenia przejazdu), spóźnione dKo z karą', () => {
  const sim = makeSim();
  const { w } = entryOnSz(sim, { dko: false });
  const ko = w.press('Ko');
  assert.equal(ko.ok, false);
  assert.match(ko.reason, /stwierdzenia przejazdu/);
  assert.equal(w.press('dKo').ok, true);
  assert.ok(score(sim, 'dKo').at(-1).points < 0);
  assert.equal(w.press('Ko').ok, true);
});

/** 5310 przyjęty na tor 1 zwykłym przebiegiem, blokada do Dąbrowy z pozwoleniem na wyjazd; `hold` – odjazd później. */
function beforeExit(sim, hold = false) {
  const e = trainAtA(sim);
  assert.ok(sim.ilk.setRoute('A-D1').ok);
  run(sim, 5 * 60, () => { const w = sim.blocks.get('W'); if (w.koPending) w.press('Ko'); });
  assert.equal(e.train.nextSignal(), 'D1');
  const b = sim.blocks.get('E'); b.request = null; b.direction = 'out'; b.permission = true;
  // stan blokady ustawiony ręcznie: pociągi sąsiada z tego szlaku odsunięte, żeby nie zgłosił ich od nowa
  for (const x of sim.traffic.timetable()) if (x.from === 'E' && !x.dispatched) { x.requested = false; x.requestAt = Infinity; }
  b.phone.askedByThem = null;
  if (hold) e.train.def.depTime = sim.clock.time + 3600; // pociąg czeka – obraz semafora widać przed odjazdem
  return { e, b };
}

test('W4: wyjazd na sygnał blokuje blok początkowy sam; wyjazd na Sz – dopiero dPo (bez kary), brak dPo – kara', () => {
  const s1 = makeSim();
  const { b: b1 } = beforeExit(s1);
  assert.ok(s1.ilk.setRoute('D1-E').ok);
  run(s1, 3 * 60);
  assert.equal(b1.poBlocked, true, 'sygnał zezwalający – Po zablokowany przez pociąg');
  assert.equal(b1.counters.dPo, 0);

  const s2 = makeSim();
  const { b: b2 } = beforeExit(s2);
  s2.ilk.signals.get('D1').failed = true;
  assert.ok(s2.ilk.setRoute('D1-E').ok); run(s2, 8);
  assert.ok(s2.ilk.substituteSignal('D1').ok);
  run(s2, 3 * 60);
  assert.equal(b2.occupied, true);
  assert.equal(b2.poBlocked, false, 'wyjazd na Sz nie blokuje Po');
  assert.equal(b2.needPo, true);
  assert.equal(b2.press('dPo').ok, true);
  assert.equal(b2.poBlocked, true);
  assert.equal(score(s2, 'dPo').at(-1).points, 0);
  assert.equal(b2.occupied, true, 'dPo nie kasuje blokady');

  const s3 = makeSim();
  const { b: b3 } = beforeExit(s3);
  s3.ilk.signals.get('D1').failed = true;
  s3.ilk.setRoute('D1-E'); run(s3, 8); s3.ilk.substituteSignal('D1');
  run(s3, 10 * 60);
  assert.ok(score(s3, 'no-dpo').length, 'brak dPo po wyjeździe na Sz');
  assert.equal(score(s3, 'no-dpo')[0].exit, b3.id, 'szlak w polu danych');
  assert.ok(s3.traffic.timetable().some((e) => String(e.nr) === String(score(s3, 'no-dpo')[0].nr)), 'numer pociągu w polu danych');
  assert.equal(b3.occupied, false, 'sąsiad potwierdził przyjazd');
});

test('W13: Pwl – po odwołaniu sygnału wyjazdowego drugi sygnał nie wyjdzie; wyprawienie na Sz', () => {
  const sim = makeSim();
  const { e, b } = beforeExit(sim, true);
  assert.ok(sim.ilk.setRoute('D1-E').ok); run(sim, 8);
  assert.ok(['S2', 'S10'].includes(sim.ilk.signals.get('D1').aspect));
  assert.equal(b.pwl, true);
  sim.ilk.releaseRoute('D1', false); run(sim, 100); // zwalnianie czasowe – pociąg w zbliżaniu
  assert.ok(!sim.ilk.routeIsSet('D1-E'));
  assert.ok(sim.ilk.setRoute('D1-E').ok, 'przebieg da się nastawić');
  run(sim, 8);
  assert.equal(sim.ilk.signals.get('D1').aspect, 'S1', 'Pwl – sygnał nie wyszedł drugi raz');
  assert.equal(sim.press({ kind: 'block', exit: 'E', btn: 'oWbl' }).ok, false, 'po sygnale pozwolenia nie zwraca się');
  e.train.def.depTime = sim.clock.time;
  assert.ok(sim.ilk.substituteSignal('D1').ok);
  run(sim, 3 * 60);
  assert.equal(b.needPo, true, 'wyjazd na Sz');
});

test('W27: wyciągnięcie Wbl na pulpicie (pull) odwołuje żądanie – bez licznika i kary', () => {
  const sim = makeSim({ scenario: { id: 't', name: 't', endTime: '09:00', trains: [] } });
  const e = sim.blocks.get('E');
  assert.ok(sim.press({ kind: 'block', exit: 'E', btn: 'Wbl' }).ok);
  assert.equal(e.request, 'ours');
  assert.ok(sim.pull({ kind: 'block', exit: 'E', btn: 'Wbl' }).ok);
  assert.equal(e.request, null);
  run(sim, 60);
  assert.equal(e.direction, null);
  assert.deepEqual(e.counters, { dPo: 0, dKo: 0 });
  assert.equal(sim.score.items.length, 0);
});

test('W12: blokada bez łączności – po „droga wolna” przebieg tak, sygnał zezwalający nie (pozwolenie u sąsiada); Sz uzasadniony', () => {
  const sim = makeSim({ scenario: { id: 't', name: 't', faults: [{ type: 'block-fail', target: 'E', at: '06:00', duration: 90 }] } });
  const { e } = beforeExit(sim);
  const b = sim.blocks.get('E'); b.direction = null; b.permission = false; // pozwolenie nie u nas
  run(sim, 60);
  assert.equal(b.fault, true);
  assert.equal(sim.ilk.setRoute('D1-E').ok, false, 'bez telefonogramu nie');
  assert.ok(sim.comms.send('ask-free', { exit: 'E', nr: 5310 }).ok);
  run(sim, 40);
  assert.equal(String(b.phone.permissionFor), '5310');
  assert.equal(b.direction, null, 'telefonogram nie przestawia kierunku blokady');
  assert.ok(sim.ilk.setRoute('D1-E').ok); run(sim, 8);
  assert.equal(sim.ilk.signals.get('D1').aspect, 'S1');
  assert.ok(sim.ilk.substituteSignal('D1').ok);
  assert.equal(score(sim, 'Sz').at(-1).points, 0, 'Sz uzasadniony usterką blokady');
  run(sim, 3 * 60);
  assert.ok(e.train.onLine('E') || e.status === 'na następnym posterunku', 'pociąg wyjechał na Sz');
});

test('W12: blokada bez łączności, pozwolenie było u nas – po „droga wolna” sygnał zezwalający', () => {
  const sim = makeSim();
  const { b } = beforeExit(sim, true); // kierunek wyjazdu z pozwoleniem przed usterką
  b.setFault(true);
  assert.ok(sim.comms.send('ask-free', { exit: 'E', nr: 5310 }).ok);
  run(sim, 40);
  assert.ok(sim.ilk.setRoute('D1-E').ok); run(sim, 8);
  assert.ok(['S2', 'S10'].includes(sim.ilk.signals.get('D1').aspect), sim.ilk.signals.get('D1').aspect);
});
