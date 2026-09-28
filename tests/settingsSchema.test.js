import { test } from 'node:test';
import assert from 'node:assert/strict';
import { settingsCategories, schemaKeys } from '../src/ui/settingsSchema.js';
import { setLang } from '../src/i18n/index.js';
import { DEFAULTS } from '../src/ui/Settings.js';

test('schemat ekranu ustawień opisuje każde ustawienie dokładnie raz, z tytułem i opisem; wartości domyślne są wśród wyborów', () => {
  const keys = schemaKeys();
  const byHand = ['sideCollapsed', 'sideSize', 'sideWidth']; // przycisk „ukryj” i przeciągnięcie granicy panelu – nie ekran ustawień
  assert.deepEqual([...keys].sort(), Object.keys(DEFAULTS).filter((k) => !byHand.includes(k)).sort(), 'klucze schematu = DEFAULTS (bez ustawień zmienianych przyciskiem i przeciąganiem)');
  assert.equal(new Set(keys).size, keys.length, 'klucz opisany raz');
  const SETTINGS_CATEGORIES = settingsCategories();
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
  const lang = SETTINGS_CATEGORIES.flatMap((c) => c.options).find((o) => o.key === 'lang');
  assert.deepEqual(lang.choices.map((x) => x.value), ['auto', 'pl', 'en', 'de'], 'język: auto + trzy języki');
  assert.ok(lang.reload, 'zmiana języka przeładowuje widok');
  assert.equal(lang.type, 'select', 'języki jako lista rozwijana');
  // schemat jest funkcją, bo teksty zależą od bieżącego języka
  setLang('en');
  try { assert.equal(settingsCategories().find((c) => c.id === 'jezyk').title, 'Language'); } finally { setLang('pl'); }
});
