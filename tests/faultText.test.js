import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FAULT_TYPES } from '../src/model/faults/types.js';
import { faultAlarm, faultListText } from '../src/ui/faultText.js';
import { setLang } from '../src/i18n/index.js';

/* Każdy rodzaj usterki ma opis w panelu – bez „undefined” (usterka bloku przebiegowego nie miała) */

const sim = { blocks: new Map([['W', { neighbour: 'Wierzbno' }]]) };
const target = (type) => (type === 'block-fail' ? 'W' : 'A');

test('opisy usterek w panelu: alarm i lista dla każdego rodzaju, we wszystkich językach', () => {
  for (const lang of ['pl', 'en', 'de']) {
    setLang(lang);
    for (const type of FAULT_TYPES) {
      const f = { type, target: target(type) };
      for (const txt of [faultAlarm(f, sim), faultListText(f, sim)]) {
        assert.doesNotMatch(txt, /undefined|sp\.(fault|alarm)/, `${lang}/${type}: ${txt}`);
        assert.match(txt, type === 'block-fail' ? /Wierzbno/ : /\bA\b/, `${lang}/${type}: element`);
      }
    }
  }
  setLang('pl');
  assert.equal(faultAlarm({ type: 'route-block', target: 'A' }, sim), 'USTERKA: blok przebiegowy za semaforem A – zwolnij zwalniaczem');
});
