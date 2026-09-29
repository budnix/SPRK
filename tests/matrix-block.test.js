import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventBus } from '../src/core/EventBus.js';
import { LineBlock } from '../src/model/Block.js';

/**
 * Wyczerpujące przeszukanie przestrzeni stanów blokady Eap: z każdego osiągalnego
 * stanu wykonujemy każde możliwe zdarzenie i sprawdzamy niezmienniki.
 */
// zdarzenia: przyciski (także oWbl), pociąg sąsiada (wjazd na szlak, minięcie semafora wjazdowego na sygnał / na Sz,
// zjazd), nasz pociąg (sygnał wyjazdowy podany / odwołany, wyjazd na sygnał / na Sz, przyjazd do sąsiada), czas
const EVENTS = ['Wbl', 'oWbl', 'Poz', 'Ko', 'dPo', 'dKo', 'nbReq', 'nbEnter', 'nbPassSignal', 'nbPassSz', 'nbArrive',
  'sigGiven', 'sigCancel', 'ourDepart', 'ourDepartSz', 'ourArrive', 'time'];

function mk() {
  const bus = new EventBus();
  return new LineBlock('W', { name: 'X', tile: { x: 0, y: 4 }, dir: 'W' }, bus);
}

function key(b) {
  return JSON.stringify([b.direction, b.request, b.permission, b.occupied, b.poBlocked, b.koPending, !!b.neighbourReply, !!b.pendingArrivalAck,
    b.pwl, b.pwlRoute, b.needPo, b.zpg, b.koPrepared, b.lineTrain]);
}

function apply(b, ev) {
  switch (ev) {
    case 'Wbl': case 'oWbl': case 'Poz': case 'Ko': case 'dPo': case 'dKo': b.press(ev); break;
    case 'nbReq': b.neighbourRequests(); break;
    case 'nbEnter': if (b.canNeighbourDispatch()) b.neighbourTrainEntered({ nr: 1 }); break;
    case 'nbPassSignal': case 'nbPassSz': if (b.occupied && b.direction === 'in') b.entryPassed(ev === 'nbPassSignal'); break;
    case 'nbArrive': if (b.occupied && b.direction === 'in') b.neighbourTrainArrived({ nr: 1 }); break;
    case 'sigGiven': if (b.gate('signal', 'r').ok) b.exitSignalGiven('r'); break;
    case 'sigCancel': b.exitSignalCancelled('r'); break;
    case 'ourDepart': if (b.gate('signal', 'r').ok) b.trainDeparted({ nr: 2 }); break;
    case 'ourDepartSz': if (b.gate('substitute').ok) b.trainDeparted({ nr: 2, exitAuth: '*' }); break;
    case 'ourArrive': if (b.occupied && String(b.lineTrain) === '2') b.trainArrivedAtNeighbour({ nr: 2 }); break;
    case 'time': b.tick(b.time + 1000); break;
    default:
  }
}

function invariants(b, trace) {
  const where = trace.join(' → ');
  assert.ok(!(b.permission && b.direction !== 'out'), `pozwolenie bez kierunku wyjazdu: ${where}`);
  assert.ok(!(b.occupied && b.direction === null), `szlak zajęty bez kierunku: ${where}`);
  assert.ok(!(b.poBlocked && b.direction !== 'out'), `Po zablokowany bez kierunku wyjazdu: ${where}`);
  assert.ok(!(b.koPending && b.direction !== 'in'), `Ko do obsłużenia bez kierunku wjazdu: ${where}`);
  assert.ok(!(b.request === 'theirs' && b.direction !== null), `żądanie sąsiada przy ustawionym kierunku: ${where}`);
  assert.ok(!(b.gate().ok && b.occupied), `wyjazd dozwolony na zajęty szlak: ${where}`);
  assert.ok(!(b.canNeighbourDispatch() && b.occupied), `sąsiad może wyprawić na zajęty szlak: ${where}`);
  assert.ok(!(b.gate().ok && b.canNeighbourDispatch()), `obie strony mogą wyprawić naraz: ${where}`);
  // przeciwwtórność: po sygnale (Pwl) i jego odwołaniu drugi sygnał nie wyjdzie; dPo / dKo nie kasują blokady
  assert.ok(!(b.pwl && !b.pwlRoute && b.gate('signal', 'r2').ok), `drugi sygnał mimo Pwl: ${where}`);
  assert.ok(!(b.needPo && !b.occupied), `blok początkowy do zablokowania bez pociągu na szlaku: ${where}`);
  assert.ok(!(b.poBlocked && b.needPo), `Po zablokowany i do zablokowania naraz: ${where}`);
}

test('blokada Eap: wszystkie zdarzenia we wszystkich osiągalnych stanach', () => {
  // BFS po stanach; stan odtwarzamy przez powtórzenie sekwencji zdarzeń (model deterministyczny poza losowym opóźnieniem)
  const seen = new Map();
  const queue = [[]];
  let steps = 0;
  while (queue.length) {
    const trace = queue.shift();
    const b = mk();
    for (const ev of trace) apply(b, ev);
    const k = key(b);
    if (seen.has(k)) continue;
    seen.set(k, trace);
    invariants(b, trace);
    for (const ev of EVENTS) {
      const b2 = mk();
      for (const e of trace) apply(b2, e);
      apply(b2, ev);
      steps++;
      invariants(b2, [...trace, ev]);
      if (!seen.has(key(b2)) && trace.length < 12) queue.push([...trace, ev]);
    }
  }
  assert.ok(seen.size >= 20 && seen.size < 1000, `osiągalnych stanów: ${seen.size}`);
  assert.ok(steps > 100);
});

test('blokada Eap: liczniki doraźne rosną tylko przy dPo/dKo (dPo po wyjeździe na Sz, dKo przed wjazdem na Sz)', () => {
  const b = mk();
  for (const ev of ['nbReq', 'Poz', 'nbEnter', 'nbPassSignal', 'nbArrive', 'Ko', 'Wbl', 'time', 'sigGiven', 'ourDepart', 'ourArrive', 'time', 'oWbl']) apply(b, ev);
  assert.deepEqual(b.counters, { dPo: 0, dKo: 0 });
  assert.equal(b.direction, null, 'pełny cykl bez doraźnych');
  for (const ev of ['Wbl', 'time', 'ourDepartSz', 'dPo', 'ourArrive', 'time']) apply(b, ev);
  assert.deepEqual(b.counters, { dPo: 1, dKo: 0 });
  for (const ev of ['nbReq', 'Poz', 'nbEnter', 'dKo', 'nbPassSz', 'nbArrive', 'Ko']) apply(b, ev);
  assert.deepEqual(b.counters, { dPo: 1, dKo: 1 });
  assert.equal(b.direction, null, 'Ko po dKo zamyka cykl');
});

test('blokada Eap: oWbl odwołuje żądanie i zwraca niewykorzystane pozwolenie; po sygnale (Pwl) – nie', () => {
  const b = mk();
  apply(b, 'Wbl'); assert.equal(b.request, 'ours');
  apply(b, 'oWbl'); assert.equal(b.request, null);
  apply(b, 'time'); assert.equal(b.direction, null, 'odwołane żądanie nie daje pozwolenia');
  apply(b, 'Wbl'); apply(b, 'time'); assert.equal(b.permission, true);
  apply(b, 'oWbl'); apply(b, 'time');
  assert.equal(b.direction, null, 'pozwolenie zwrócone');
  apply(b, 'Wbl'); apply(b, 'time'); apply(b, 'sigGiven'); apply(b, 'sigCancel');
  assert.equal(b.press('oWbl').ok, false, 'po podaniu sygnału pozwolenia nie zwraca się');
  assert.equal(b.gate('signal', 'r').ok, false, 'Pwl – drugi sygnał nie wyjdzie');
  assert.equal(b.gate('substitute').ok, true, 'wyprawienie na Sz możliwe');
  assert.deepEqual(b.counters, { dPo: 0, dKo: 0 });
});
