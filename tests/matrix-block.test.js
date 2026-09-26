import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventBus } from '../src/core/EventBus.js';
import { LineBlock } from '../src/model/Block.js';

/**
 * Wyczerpujące przeszukanie przestrzeni stanów blokady Eap: z każdego osiągalnego
 * stanu wykonujemy każde możliwe zdarzenie i sprawdzamy niezmienniki.
 */
const EVENTS = ['Wbl', 'Poz', 'Ko', 'dPo', 'dKo', 'nbReq', 'nbEnter', 'nbArrive', 'ourDepart', 'ourArrive', 'time'];

function mk() {
  const bus = new EventBus();
  return new LineBlock('W', { name: 'X', tile: { x: 0, y: 4 }, dir: 'W' }, bus);
}

function key(b) {
  return JSON.stringify([b.direction, b.request, b.permission, b.occupied, b.poBlocked, b.koPending, !!b.neighbourReply, !!b.pendingArrivalAck]);
}

function apply(b, ev) {
  switch (ev) {
    case 'Wbl': case 'Poz': case 'Ko': case 'dPo': case 'dKo': b.press(ev); break;
    case 'nbReq': b.neighbourRequests(); break;
    case 'nbEnter': if (b.canNeighbourDispatch()) b.neighbourTrainEntered({ nr: 1 }); break;
    case 'nbArrive': if (b.occupied && b.direction === 'in') b.neighbourTrainArrived({ nr: 1 }); break;
    case 'ourDepart': if (b.gate().ok) b.trainDeparted({ nr: 2 }); break;
    case 'ourArrive': if (b.poBlocked) b.trainArrivedAtNeighbour({ nr: 2 }); break;
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
  assert.ok(seen.size >= 8 && seen.size < 200, `osiągalnych stanów: ${seen.size}`);
  assert.ok(steps > 100);
});

test('blokada Eap: liczniki doraźne rosną tylko przy dPo/dKo', () => {
  const b = mk();
  for (const ev of ['nbReq', 'Poz', 'nbEnter', 'nbArrive', 'Ko', 'Wbl', 'time', 'ourDepart', 'ourArrive', 'time']) apply(b, ev);
  assert.deepEqual(b.counters, { dPo: 0, dKo: 0 });
  apply(b, 'dPo'); apply(b, 'dKo');
  assert.deepEqual(b.counters, { dPo: 1, dKo: 1 });
});
