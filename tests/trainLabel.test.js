import { test } from 'node:test';
import assert from 'node:assert/strict';
import { trainLabelX } from '../src/render/trainLabel.js';

/*
 * Numer pociągu na monitorze w całości na odcinku toru (Ie-104.1 §8 „Wyświetlacz numeru pociągu” pkt 2, 5a): przy
 * czole pociągu, ale nie poza końcem toru – dawniej numer na środku kostki czoła wychodził na semafor (Szkolna:
 * 6101 przy D1, 6102 przy C1).
 */
test('numer pociągu: przy czole, w całości na torze; tor krótszy niż numer – środek toru; poza torem stacyjnym bez zmian', () => {
  const span = [100, 400], half = 25;
  assert.equal(trainLabelX(250, span, half), 250, 'czoło w środku toru – numer przy czole');
  assert.equal(trainLabelX(390, span, half), 375, 'czoło przy prawym końcu – numer cofnięty na tor');
  assert.equal(trainLabelX(110, span, half), 125, 'czoło przy lewym końcu – numer przesunięty na tor');
  for (const head of [110, 250, 390]) {
    const x = trainLabelX(head, span, half);
    assert.ok(x - half >= span[0] && x + half <= span[1], `numer w całości na torze (czoło ${head})`);
  }
  assert.equal(trainLabelX(130, [100, 140], half), 120, 'tor krótszy niż numer – środek toru');
  assert.equal(trainLabelX(130, null, half), 130, 'odcinek bez toru stacyjnego – przy czole');
});
