import { test } from 'node:test';
import assert from 'node:assert/strict';
import { repeaterLamps, SEMAPHORE_REPEATER_LAMPS } from '../src/tiles/repeater.js';
import { E_GROUP_BUTTONS } from '../src/tiles/controls.js';

/* Pulpit typu E: powtarzacz z jedną zieloną lampką dla sygnałów zezwalających (Ie-10 (E18) rozdz. II §7 ust. 7,
   ISDR 2.3.2.2.1.5) i czarne przyciski grupowe (ISDR 2.3.2.1.1, 2.3.2.3) */

test('powtarzacz semafora: każdy sygnał zezwalający to sama zielona lampka – S12 bez pomarańczowej, S13 nie różni się od S5 innym światłem', () => {
  for (const a of ['S2', 'S3', 'S4', 'S5', 'S10', 'S11', 'S12', 'S13']) assert.deepEqual(repeaterLamps(a), { green: 'green' }, a);
});

test('powtarzacz semafora: „Stój” – czerwona, Sz – czerwona i migająca biała, Ms2 – biała; tarcza manewrowa: Ms1 niebieska, Ms2 biała', () => {
  assert.deepEqual(repeaterLamps('S1'), { red: 'red' });
  assert.deepEqual(repeaterLamps(undefined), { red: 'red' });
  assert.deepEqual(repeaterLamps('Sz'), { red: 'red', white: 'white blink' });
  assert.deepEqual(repeaterLamps('Ms2'), { white: 'white' });
  assert.deepEqual(repeaterLamps('Ms1', 'tm'), { blue: 'blue' });
  assert.deepEqual(repeaterLamps('Ms2', 'tm'), { white: 'white' });
});

test('powtarzacz semafora ma lampki zieloną, czerwoną i białą – bez pomarańczowej; każda zapalana lampka istnieje na rysunku', () => {
  assert.deepEqual(SEMAPHORE_REPEATER_LAMPS, ['green', 'red', 'white']);
  for (const a of ['S1', 'S2', 'S5', 'S12', 'S13', 'Sz', 'Ms2']) {
    for (const c of Object.keys(repeaterLamps(a))) assert.ok(SEMAPHORE_REPEATER_LAMPS.includes(c), `${a}: ${c}`);
  }
});

test('przyciski grupowe pulpitu typu E są czarne (Sz nie jest biały jak manewrowe, dPz nie jest czerwony jak blokada)', () => {
  assert.deepEqual(E_GROUP_BUTTONS.map((b) => [b.id, b.color]), [['Zw', 'black'], ['Zz', 'black'], ['Pz', 'black'], ['dPz', 'black'], ['Sz', 'black']]);
});
