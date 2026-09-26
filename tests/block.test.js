import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventBus } from '../src/core/EventBus.js';
import { LineBlock } from '../src/model/Block.js';

function mk() {
  const bus = new EventBus();
  const b = new LineBlock('W', { name: 'Lipowa', tile: { x: 0, y: 4 }, dir: 'W' }, bus);
  return { b, bus };
}

test('sąsiad żąda pozwolenia, Poz ustawia kierunek wjazdu, Ko po przyjeździe', () => {
  const { b } = mk();
  assert.equal(b.press('Poz').ok, false, 'bez żądania Poz nie działa');
  assert.equal(b.neighbourRequests(), true);
  assert.equal(b.request, 'theirs');
  assert.equal(b.press('Wbl').ok, false, 'nie można żądać, gdy sąsiad żąda');
  assert.equal(b.press('Poz').ok, true);
  assert.equal(b.direction, 'in');
  assert.equal(b.canNeighbourDispatch(), true);
  b.neighbourTrainEntered({ nr: 1 });
  assert.equal(b.occupied, true);
  assert.equal(b.press('Ko').ok, false, 'Ko przed przyjazdem w całości');
  b.neighbourTrainArrived({ nr: 1 });
  assert.equal(b.koPending, true);
  assert.equal(b.press('Ko').ok, true);
  assert.equal(b.direction, null);
});

test('żądanie Wbl, odpowiedź sąsiada, wyjazd i potwierdzenie przyjazdu', () => {
  const { b } = mk();
  assert.equal(b.gate().ok, false);
  b.press('Wbl');
  assert.equal(b.request, 'ours');
  b.tick(100);
  assert.equal(b.direction, 'out');
  assert.equal(b.gate().ok, true);
  b.trainDeparted({ nr: 2 });
  assert.equal(b.poBlocked, true);
  assert.equal(b.gate().ok, false);
  b.trainArrivedAtNeighbour({ nr: 2 });
  b.tick(200);
  assert.equal(b.occupied, false);
  assert.equal(b.direction, null);
});

test('dKo i dPo zwalniają doraźnie i liczą', () => {
  const { b } = mk();
  b.neighbourRequests(); b.press('Poz'); b.neighbourTrainEntered({ nr: 3 });
  b.press('dKo');
  assert.equal(b.counters.dKo, 1);
  assert.equal(b.direction, null);
  b.press('dPo');
  assert.equal(b.counters.dPo, 1);
});
