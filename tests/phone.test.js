import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventBus } from '../src/core/EventBus.js';
import { LineBlock } from '../src/model/Block.js';
import { FORMULAS } from '../src/model/Comms.js';

/*
 * Telefonogramy (audyt realizmu, grupa 4). Wzory Ir-1, Dodatek 2: 1a – zapytanie o drogę, 4a – pozwolenie, 5a – „Stój”,
 * 14 – przyjazd; odbiorca powtarza treść (Ir-1 §23 ust. 7 i 9) (W28). Na szlaku jednotorowym rozmowa 1a / 4a przy każdym
 * pociągu, także przy sprawnej blokadzie (Ir-1 §28 ust. 3, §24 ust. 5, 9) – w grze domyślnie idzie sama, w trybie ręcznym
 * nadaje ją gracz (W26). Przy zapowiadaniu na torze właściwym linii dwutorowej zapytania się nie stosuje (Ir-1 §23
 * ust. 2–4) (W30). Na linii dwutorowej numer pociągu przekazuje się telefonicznie przy odjeździe (Ir-1 §28 ust. 2, §29
 * ust. 4) (W31).
 */

function mk(def = {}, opts = {}) {
  const bus = new EventBus();
  const ev = { in: [], out: [], score: [] };
  bus.on('comms', (m) => ev.in.push(m));
  bus.on('phone-out', (m) => ev.out.push(m.text));
  bus.on('score', (s) => ev.score.push(s));
  const b = new LineBlock('W', { name: 'Lipowa', tile: { x: 0, y: 4 }, dir: 'W', ...def }, bus, { nextTrain: () => 22, ...opts });
  b.tick(6 * 3600);
  return { b, ev };
}

test('W28: teksty telefonogramów wg wzorów Ir-1 (1a, 4a, 14)', () => {
  const f = (id) => FORMULAS.find((x) => x.id === id).text({ nr: 1, time: '06:00' });
  assert.equal(f('ask-free'), 'Czy droga dla pociągu nr 1 jest wolna?');
  assert.equal(f('free'), 'Dla pociągu nr 1 droga jest wolna.');
  assert.equal(f('arrived'), 'Pociąg nr 1 przyjechał o 06:00.');
  assert.equal(f('departed'), 'Pociąg nr 1 odjechał o 06:00.');
});

test('W26: sprawna Eap na jednotorze – rozmowa 1a / 4a nadaje się sama (tryb domyślny), bez kar', () => {
  const { b, ev } = mk();
  b.neighbourRequests(11);
  assert.equal(ev.in.at(-1).text, 'Czy droga dla pociągu nr 11 jest wolna?');
  b.press('Poz');
  assert.equal(ev.out.at(-1), 'Dla pociągu nr 11 droga jest wolna.');
  b.neighbourTrainEntered({ nr: 11 }); b.entryPassed(true); b.neighbourTrainArrived({ nr: 11 }); b.press('Ko');
  b.press('Wbl');
  assert.equal(ev.out.at(-1), 'Czy droga dla pociągu nr 22 jest wolna?');
  b.tick(6 * 3600 + 60);
  assert.equal(b.permission, true);
  assert.equal(ev.in.at(-1).text, 'Dla pociągu nr 22 droga jest wolna.');
  assert.equal(ev.score.length, 0);
});

test('W26: tryb ręczny – Poz bez 4a i Wbl bez 1a kosztują punkty; z telefonogramami bez kary', () => {
  const { b, ev } = mk({}, { phoneRoutine: 'manual' });
  b.neighbourRequests(11);
  b.press('Poz');
  assert.equal(ev.out.length, 0, 'w trybie ręcznym nic nie nadaje się samo');
  assert.equal(ev.score.filter((s) => s.code === 'phone-routine').length, 1, 'Poz bez 4a');
  b.neighbourTrainEntered({ nr: 11 }); b.entryPassed(true); b.neighbourTrainArrived({ nr: 11 }); b.press('Ko');
  b.press('Wbl');
  assert.equal(ev.score.filter((s) => s.code === 'phone-routine').length, 2, 'Wbl bez 1a');

  const t = mk({}, { phoneRoutine: 'manual' });
  t.b.neighbourRequests(12);
  assert.equal(t.b.phoneAnswerFree(12).ok, true, '4a przy sprawnej blokadzie');
  t.b.press('Poz');
  t.b.neighbourTrainEntered({ nr: 12 }); t.b.entryPassed(true); t.b.neighbourTrainArrived({ nr: 12 }); t.b.press('Ko');
  assert.equal(t.b.phoneAskNeighbour(22).ok, true, '1a przy sprawnej blokadzie');
  t.b.press('Wbl');
  assert.equal(t.ev.score.length, 0, 'z telefonogramami bez kary');
});

test('W30: zapowiadanie na torze właściwym dwutoru – wyjazd bez zapytania po potwierdzonym przyjeździe; sąsiad nie pyta', () => {
  const out = mk({ direction: 'out' });
  out.b.setFault(true);
  assert.equal(out.b.gate().ok, true, 'tor wolny – wyjazd bez „Czy droga … jest wolna?”');
  assert.equal(out.b.phoneAskNeighbour(22).ok, false, 'zapytanie zbędne');
  out.b.trainDeparted({ nr: 22 });
  assert.equal(out.b.gate().ok, false, 'pociąg na szlaku');
  out.b.trainArrivedAtNeighbour({ nr: 22 }); // przyjazd potwierdzony telefonicznie
  assert.equal(out.b.gate().ok, true);
  const inn = mk({ direction: 'in' });
  inn.b.setFault(true);
  assert.equal(inn.b.neighbourRequests(31), true);
  assert.ok(!inn.ev.in.some((m) => m.kind === 'ask'), 'sąsiad nie pyta na swoim torze właściwym');
  assert.equal(inn.b.canNeighbourDispatch(31), true);
  // jednotor przy usterce – zapytanie zostaje
  const single = mk();
  single.b.setFault(true);
  assert.equal(single.b.gate().ok, false);
  assert.match(single.b.gate().reason, /zapytaj/);
});

test('W31: linia dwutorowa – numer pociągu przy odjeździe: sąsiad zawiadamia, nasz odjazd – sam (domyślnie) albo gracz (ręcznie)', () => {
  const inn = mk({ direction: 'in', block: 'sbl' });
  inn.b.neighbourTrainEntered({ nr: 41 });
  assert.match(inn.ev.in.at(-1).text, /^Pociąg nr 41 odjechał o 06:00\.$/);
  const out = mk({ direction: 'out', block: 'sbl' });
  out.b.trainDeparted({ nr: 42 });
  assert.equal(out.ev.out.at(-1), 'Pociąg nr 42 odjechał o 06:00.');
  const man = mk({ direction: 'out', block: 'sbl' }, { phoneRoutine: 'manual' });
  man.b.trainDeparted({ nr: 43 });
  assert.equal(man.ev.out.length, 0);
  man.b.trainArrivedAtNeighbour({ nr: 43 });
  assert.equal(man.ev.score.filter((s) => s.code === 'phone-routine').length, 1, 'brak zawiadomienia o odjeździe');
  const man2 = mk({ direction: 'out', block: 'sbl' }, { phoneRoutine: 'manual' });
  man2.b.trainDeparted({ nr: 44 });
  assert.equal(man2.b.phoneReportDeparture(44).ok, true);
  man2.b.trainArrivedAtNeighbour({ nr: 44 });
  assert.equal(man2.ev.score.length, 0);
});

// Tryb ręczny rozmów dotyczy gracza: automat dyżurnego (np. drugi okręg) sam nadaje 1a / 4a i zawiadomienia o odjeździe,
// więc kary za pominięcie nie trafiają do gracza; samouczki zawsze w trybie automatycznym.
test('W26 / W31: tryb ręczny – automat dyżurnego nadaje swoje telefonogramy (bez kar); samouczek wymusza tryb automatyczny', async () => {
  const { Simulation } = await import('../src/model/Simulation.js');
  const { AutoOperator } = await import('../src/model/Operator.js');
  const { Clock } = await import('../src/core/Clock.js');
  for (const [id, sc] of [['szkolna', 'zmiana'], ['gdynia-glowna', 'zmiana']]) {
    const st = (await import(`../src/stations/${id}.js`)).default;
    const sim = new Simulation(st, { scenario: sc, disruptions: 'none', seed: 1, phoneRoutine: 'manual' });
    assert.equal(sim.phoneRoutine, 'manual');
    const op = new AutoOperator(sim, { district: null, role: 'full' });
    const end = Clock.parse(sim.scenario.endTime ?? '09:00');
    for (let n = 0; sim.clock.time < end; n++) { sim.step(0.5); if (n % 4 === 0) op.tick(); }
    const bad = sim.score.items.filter((i) => i.code === 'phone-routine');
    assert.deepEqual(bad.map((i) => i.msg), [], `${id}: kary za telefonogramy automatu`);
    assert.ok(sim.comms.messages.some((m) => m.dir === 'out'), `${id}: automat nadawał telefonogramy`);
  }
  const szkolna = (await import('../src/stations/szkolna.js')).default;
  assert.equal(new Simulation(szkolna, { scenario: 'nauka-1', phoneRoutine: 'manual' }).phoneRoutine, 'auto');
});
