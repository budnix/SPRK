import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventBus } from '../src/core/EventBus.js';
import { LineBlock, MISSED_DUTY_POINTS } from '../src/model/Block.js';

/*
 * Pytania dyżurnego do blokady liniowej – odpowiedzi jako dane, bez czytania pól blokady: następny krok po szlak
 * (`lineStep`), prośba sąsiada (`neighbourAsk`), czynności, na które blokada czeka (`duties`), pociąg sąsiada w drodze
 * (`neighbourTrainComing`), stan poza zasadniczym (`notAtRest`), pytanie o przyjazd naszego pociągu (`phoneAskArrival`).
 * Automat dyżurnego, koniec zmiany i wynik zmiany tylko pytają – reguły Eap / jednokierunkowej / SBL × zapowiadanie są
 * w jednym module. Każdy wariant na samej blokadzie, bez stacji i bez grania zmiany.
 */

const KINDS = {
  eap: {},                                    // szlak jednotorowy z Eap (pozwolenia)
  out: { direction: 'out' },                  // blokada jednokierunkowa – tor wyjazdowy linii dwutorowej
  in: { direction: 'in' },                    // blokada jednokierunkowa – tor wjazdowy
  sbl: { block: 'sbl', direction: 'out' },    // blokada samoczynna, kierunek zasadniczy na wyjazd
  sblIn: { block: 'sbl', direction: 'in' },   // blokada samoczynna, kierunek zasadniczy na przyjazd
};
const mk = (kind = 'eap', opts = {}) => {
  const bus = new EventBus();
  const scores = [];
  bus.on('score', (s) => scores.push(s));
  const b = new LineBlock('W', { name: 'Lipowa', tile: { x: 0, y: 4 }, dir: 'W', ...KINDS[kind] }, bus, { random: () => 0.5, ...opts });
  return { b, bus, scores };
};
/** Pociąg sąsiada przybył w całości i minął semafor wjazdowy (`onSignal` – na sygnał zezwalający, inaczej na Sz / rozkaz). */
const neighbourTrainIn = (b, nr, onSignal = true) => { b.neighbourTrainEntered({ nr }); b.neighbourTrainArrived({ nr }); b.entryPassed(onSignal); };

test('szlak jednotorowy: tylko Eap bez stałego kierunku', () => {
  assert.deepEqual(Object.keys(KINDS).map((k) => mk(k).b.singleTrack), [true, false, false, false, false]);
});

test('lineStep: następny krok po szlak dla naszego pociągu – wg rodzaju blokady i stanu', () => {
  const cases = [
    ['Eap wolna', () => mk('eap').b, { action: 'Wbl', talkFirst: false }],
    ['Eap, tryb ręczny rozmów bez zapytania 1a', () => mk('eap', { phoneRoutine: 'manual' }).b, { action: 'Wbl', talkFirst: true }],
    ['Eap, tryb ręczny po zapytaniu 1a o ten pociąg', () => { const { b } = mk('eap', { phoneRoutine: 'manual' }); b.phoneAskNeighbour(5); return b; }, { action: 'Wbl', talkFirst: false }],
    ['Eap po Wbl (żądanie w toku)', () => { const { b } = mk('eap'); b.press('Wbl'); return b; }, null],
    ['Eap – sąsiad żąda pozwolenia', () => { const { b } = mk('eap'); b.neighbourRequests(7); return b; }, null],
    ['Eap – pociąg sąsiada przybył, czeka Ko', () => { const { b } = mk('eap'); b.neighbourRequests(7); b.press('Poz'); neighbourTrainIn(b, 7); return b; }, null],
    ['jednokierunkowa wyjazdowa', () => mk('out').b, null],
    ['jednokierunkowa wjazdowa', () => mk('in').b, null],
    ['SBL z kierunkiem na wyjazd', () => mk('sbl').b, null],
    ['SBL z kierunkiem na przyjazd', () => mk('sblIn').b, { action: 'Zk' }],
    ['Eap bez łączności', () => { const { b } = mk('eap'); b.setFault(true); return b; }, { action: 'ask-free' }],
    ['Eap bez łączności, zapytanie wysłane', () => { const { b } = mk('eap'); b.setFault(true); b.phoneAskNeighbour(5); return b; }, null],
    ['jednokierunkowa wyjazdowa bez łączności', () => { const { b } = mk('out'); b.setFault(true); return b; }, null],
    ['jednokierunkowa wjazdowa bez łączności (jazda po torze lewym)', () => { const { b } = mk('in'); b.setFault(true); return b; }, { action: 'ask-free' }],
  ];
  for (const [name, build, want] of cases) assert.deepEqual(build().lineStep(5), want, name);
});

test('neighbourAsk: prośba sąsiada i sposób odpowiedzi', () => {
  assert.equal(mk('eap').b.neighbourAsk(), null, 'sąsiad o nic nie prosi');
  const eap = mk('eap').b; eap.neighbourRequests(7);
  assert.deepEqual(eap.neighbourAsk(), { by: 'block', nr: 7, answer: 'Poz', talkFirst: false, wait: false });
  const manual = mk('eap', { phoneRoutine: 'manual' }).b; manual.neighbourRequests(7);
  assert.equal(manual.neighbourAsk().talkFirst, true, 'tryb ręczny rozmów: telefonogram 4a przed Poz');
  const sbl = mk('sbl').b; sbl.canNeighbourDispatch(7); // pociąg sąsiada czeka na kierunek przyjazdu
  assert.deepEqual(sbl.neighbourAsk(), { by: 'block', nr: null, answer: 'Zk', talkFirst: false, wait: false });
  const phone = mk('eap').b; phone.setFault(true); phone.neighbourRequests(8);
  assert.deepEqual(phone.neighbourAsk(), { by: 'phone', nr: 8 }, 'bez łączności – zapytanie telefoniczne');
});

test('duties: dPo po wyjeździe bez sygnału, zawiadomienie o odjeździe, Ko przyjazdu (dKo bez stwierdzenia przejazdu)', () => {
  const sz = mk('eap').b; sz.press('Wbl'); sz.tick(100); sz.trainDeparted({ nr: 3, exitAuth: '*' });
  assert.deepEqual(sz.duties(), [{ duty: 'dPo', code: 'no-dpo', points: MISSED_DUTY_POINTS, nr: 3 }]);
  sz.press('dPo');
  assert.deepEqual(sz.duties(), [], 'dPo wykonane');

  const manual = mk('out', { phoneRoutine: 'manual' }).b; manual.trainDeparted({ nr: 9, exitAuth: null });
  assert.deepEqual(manual.duties().map((d) => [d.duty, d.code, d.nr]), [['departure-report', 'no-depart-report', 9]], 'tryb ręczny: telefonogram o odjeździe');
  manual.phoneReportDeparture(9);
  assert.deepEqual(manual.duties(), []);
  const auto = mk('out').b; auto.trainDeparted({ nr: 9, exitAuth: null });
  assert.deepEqual(auto.duties(), [], 'rozmowy samoczynne: zawiadomienie nadane samo');
  // przy sprawnej blokadzie zawiadomienie czeka tylko w trybie ręcznym – automat na tym polega: naprawa po wyjeździe
  // przy zapowiadaniu nie zostawia zaległego zawiadomienia ani dPo
  const repaired = mk('out').b; repaired.setFault(true); repaired.trainDeparted({ nr: 9, exitAuth: '*' });
  assert.deepEqual(repaired.duties().map((d) => d.duty), ['dPo', 'departure-report'], 'przy zapowiadaniu: dPo i telefonogram o odjeździe');
  repaired.setFault(false);
  assert.deepEqual(repaired.duties(), [], 'po naprawie – nic zaległego');

  for (const [onSignal, prepare] of [[true, false], [false, true]]) {
    const { b } = mk('eap'); b.neighbourRequests(7); b.press('Poz'); neighbourTrainIn(b, 7, onSignal);
    assert.deepEqual(b.duties(), [{ duty: 'Ko', code: null, points: 0, nr: 7, how: 'Ko', prepare }], onSignal ? 'na sygnał' : 'na Sz – najpierw dKo');
  }

  const phone = mk('eap').b; phone.setFault(true); phone.neighbourRequests(7); phone.phoneAnswerFree(7); neighbourTrainIn(phone, 7);
  assert.deepEqual(phone.duties().map((d) => [d.duty, d.how, d.nr]), [['Ko', 'phone', 7]], 'bez łączności – telefonogram o przyjeździe zamiast Ko');
  phone.phoneReportArrival(7);
  assert.deepEqual(phone.duties(), []);
});

test('closeDuty zamyka czynność bez wykonania (kara na koniec zmiany naliczona raz); kara przy dojeździe – ta sama liczba', () => {
  const { b } = mk('out', { phoneRoutine: 'manual' });
  b.trainDeparted({ nr: 4, exitAuth: '*' });
  assert.deepEqual(b.duties().map((d) => d.duty), ['dPo', 'departure-report']);
  for (const d of b.duties()) b.closeDuty(d.duty);
  assert.deepEqual(b.duties(), []);
  const late = mk('eap');
  late.b.press('Wbl'); late.b.tick(100); late.b.trainDeparted({ nr: 6, exitAuth: '*' }); late.b.trainArrivedAtNeighbour({ nr: 6 });
  assert.deepEqual(late.scores.map((s) => [s.code, s.points]), [['no-dpo', MISSED_DUTY_POINTS]]);
});

test('neighbourTrainComing: pozwolenie dane, droga zapowiedziana, pociąg sąsiada na szlaku – tak; nasz pociąg – nie', () => {
  assert.equal(mk('eap').b.neighbourTrainComing(), false);
  const poz = mk('eap').b; poz.neighbourRequests(7); poz.press('Poz');
  assert.equal(poz.neighbourTrainComing(), true, 'kierunek na wjazd');
  const phone = mk('eap').b; phone.setFault(true); phone.neighbourRequests(7); phone.phoneAnswerFree(7);
  assert.equal(phone.neighbourTrainComing(), true, 'droga zapowiedziana telefonicznie');
  const ours = mk('eap').b; ours.press('Wbl'); ours.tick(100); ours.trainDeparted({ nr: 3, exitAuth: null });
  assert.equal(ours.neighbourTrainComing(), false, 'na szlaku nasz pociąg');
});

test('notAtRest: stan zasadniczy – null; żądanie, niewykorzystane pozwolenie Eap, zajętość – stan do raportu; kierunek SBL to nie pozostałość', () => {
  for (const k of Object.keys(KINDS)) assert.equal(mk(k).b.notAtRest(), null, `${k}: świeża blokada`);
  const req = mk('eap').b; req.press('Wbl');
  assert.equal(req.notAtRest().request, 'ours');
  const perm = mk('eap').b; perm.press('Wbl'); perm.tick(100);
  assert.deepEqual(perm.notAtRest(), { occupied: false, fault: false, ko: false, needPo: false, request: null, awaitingEntry: false, poBlocked: false, permission: true, direction: 'out' }, 'niewykorzystane pozwolenie');
  const sbl = mk('sblIn').b; sbl.press('Zk'); sbl.tick(100);
  assert.equal(sbl.direction, 'out');
  assert.equal(sbl.notAtRest(), null, 'zmieniony kierunek SBL zostaje');
});

test('phoneAskArrival: pytanie o przyjazd naszego pociągu przy zapowiadaniu', () => {
  const { b } = mk('eap'); b.setFault(true);
  assert.equal(b.phoneAskArrival(3).ok, false, 'pociąg nie wyprawiony');
  b.trainDeparted({ nr: 3, exitAuth: '*' });
  assert.deepEqual(b.phoneAskArrival(3), { ok: true, arrived: false });
  b.trainArrivedAtNeighbour({ nr: 3 });
  assert.deepEqual(b.phoneAskArrival(3), { ok: true, arrived: true });
});
