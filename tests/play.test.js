import { test } from 'node:test';
import assert from 'node:assert/strict';
import { play, STEP, OP_EVERY } from '../src/model/check/play.js';
import { makeSim, Clock } from './helpers.js';

/** Dyżurny-atrapa: zapisuje czas symulacji, w którym działał. */
const recorder = () => {
  const at = [];
  const dispatch = (sim) => at.push(sim.clock.time);
  return { at, dispatch };
};

test('rytm gry: krok 0,5 s, dyżurny w pierwszym kroku i potem co czwarty (co 2 s)', () => {
  assert.deepEqual([STEP, OP_EVERY], [0.5, 4]);
  const sim = makeSim({ disruptions: 'none', seed: 1 });
  const t0 = sim.clock.time;
  const { at, dispatch } = recorder();
  play(sim, dispatch).until(t0 + 5);
  assert.equal(sim.clock.time, t0 + 5, 'dziesięć kroków po 0,5 s');
  assert.deepEqual(at, [t0 + 0.5, t0 + 2.5, t0 + 4.5]);
});

test('kolejne `until` jednej gry zachowują rytm dyżurnego; nowa gra liczy od nowa', () => {
  const sim = makeSim({ disruptions: 'none', seed: 1 });
  const t0 = sim.clock.time;
  const { at, dispatch } = recorder();
  const game = play(sim, dispatch);
  game.until(t0 + 3).until(t0 + 5); // 6 kroków, potem 4 – jak jedna pętla z jednym licznikiem
  assert.deepEqual(at, [t0 + 0.5, t0 + 2.5, t0 + 4.5]);
  assert.equal(game.steps, 10);
  const fresh = recorder();
  play(sim, fresh.dispatch).until(t0 + 6);
  assert.deepEqual(fresh.at, [t0 + 5.5], 'nowa gra: dyżurny w pierwszym swoim kroku');
});

test('`stop` sprawdzany przed każdym krokiem, `each` po kroku i dyżurnym z `opTick` i liczbą kroków', () => {
  const sim = makeSim({ disruptions: 'none', seed: 1 });
  const t0 = sim.clock.time;
  play(sim, () => assert.fail('dyżurny bez kroku')).until(t0 + 60, { stop: () => true });
  assert.equal(sim.clock.time, t0, 'stop od razu – żadnego kroku');
  const log = [];
  play(sim, () => log.push('op')).until(t0 + 60, {
    stop: () => sim.clock.time >= t0 + 2.5,
    each: (s, { opTick, steps }) => { assert.equal(s, sim); log.push(`${steps}${opTick ? '+' : ''}`); },
  });
  assert.equal(sim.clock.time, t0 + 2.5);
  assert.deepEqual(log, ['op', '1+', '2', '3', '4', 'op', '5+']);
});

test('dyżurny: funkcja, obiekt z `tick()` albo `null` (same kroki); koniec: \'HH:MM\', sekundy albo funkcja', () => {
  const sim = makeSim({ disruptions: 'none', seed: 1 });
  const t0 = sim.clock.time;
  let ticks = 0;
  play(sim, { tick: () => ticks++ }).until(t0 + 4);
  assert.equal(ticks, 2);
  play(sim, null).until(t0 + 8);
  assert.equal(sim.clock.time, t0 + 8);
  const hhmm = Clock.format(Math.ceil((t0 + 60) / 60) * 60); // pełna minuta po kroku 8 s
  play(sim, null).until(hhmm);
  assert.equal(sim.clock.time, Clock.parse(hhmm));
  // koniec, który się przesuwa: czytany przed każdym krokiem
  let end = sim.clock.time + 30;
  play(sim, null).until(() => end, { each: (s) => { if (s.clock.time === end - 25) end -= 20; } });
  assert.equal(sim.clock.time, end);
});

test('grant: odpowiada na żądanie pozwolenia sąsiada przez polecenie stanowiska – tylko na wskazanym szlaku', async () => {
  const { grant, trainAtA, run } = await import('./helpers.js');
  const asked = makeSim({ disruptions: 'none', seed: 1 });
  run(asked, 60 * 12); // 5310 zgłoszony przez sąsiada W
  assert.equal(asked.blocks.get('W').neighbourAsk()?.answer, 'Poz');
  const presses = [];
  asked.bus.on('button', (b) => presses.push(b.ref.id));
  grant('E')(asked);
  assert.deepEqual([presses.filter((id) => id.startsWith('W:')), asked.blocks.get('W').direction], [[], null], 'odpowiedź tylko na wskazanym szlaku');
  presses.length = 0;
  grant('W')(asked);
  assert.deepEqual([presses, asked.blocks.get('W').direction], [['W:Poz'], 'in'], 'pozwolenie dane');
  grant('W')(asked);
  assert.equal(presses.length, 1, 'bez prośby – nic');
  // pociąg dojeżdża do semafora wjazdowego i staje przed nim (bez przebiegu wjazdowego)
  const e = trainAtA(makeSim({ disruptions: 'none', seed: 1 }));
  assert.deepEqual([e.nr, e.phase, e.heldAt], [5310, 'held', 'A']);
});
