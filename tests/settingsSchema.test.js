import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SETTINGS_CATEGORIES, schemaKeys } from '../src/ui/settingsSchema.js';
import { DEFAULTS } from '../src/ui/Settings.js';

test('schemat ekranu ustawień opisuje każde ustawienie dokładnie raz, z tytułem i opisem; wartości domyślne są wśród wyborów', () => {
  const keys = schemaKeys();
  assert.deepEqual([...keys].sort(), Object.keys(DEFAULTS).filter((k) => k !== 'sideCollapsed').sort(), 'klucze schematu = DEFAULTS (bez sideCollapsed – przycisk „ukryj”)');
  assert.equal(new Set(keys).size, keys.length, 'klucz opisany raz');
  for (const c of SETTINGS_CATEGORIES) {
    assert.ok(c.id && c.title && c.kicker && c.intro, `kategoria ${c.id}: brak tytułu/opisu`);
    for (const o of c.options) {
      assert.ok(o.title && o.description && o.description.length > 30, `${o.key}: opis działania`);
      if (o.type === 'range') { const v = Number(DEFAULTS[o.key]); assert.ok(v >= o.range.min && v <= o.range.max, `${o.key}: domyślna poza zakresem`); continue; }
      assert.ok(o.choices.length >= 2, `${o.key}: co najmniej dwa wybory`);
      assert.equal(new Set(o.choices.map((x) => x.value)).size, o.choices.length, `${o.key}: powtórzona wartość`);
      assert.ok(o.choices.some((x) => x.value === String(DEFAULTS[o.key])), `${o.key}: domyślna '${DEFAULTS[o.key]}' nie jest wyborem`);
      for (const x of o.choices) assert.ok(x.label, `${o.key}/${x.value}: etykieta`);
    }
  }
  assert.ok(SETTINGS_CATEGORIES.length >= 4);
});
