import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DICTS, LANGS, detectLang, getLang, setLang, t } from '../src/i18n/index.js';

const placeholders = (s) => [...String(s).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

test('i18n: słowniki en i de mają dokładnie te same klucze co pl, bez pustych tekstów i z tymi samymi parametrami {x}', () => {
  assert.deepEqual(LANGS, ['pl', 'en', 'de']);
  const keys = Object.keys(DICTS.pl);
  assert.ok(keys.length > 250);
  for (const lang of ['en', 'de']) {
    const d = DICTS[lang];
    assert.deepEqual(Object.keys(d).sort(), [...keys].sort(), `${lang}: klucze jak w pl`);
    for (const k of keys) {
      assert.ok(typeof d[k] === 'string' && d[k].trim(), `${lang}/${k}: pusty`);
      assert.deepEqual(placeholders(d[k]), placeholders(DICTS.pl[k]), `${lang}/${k}: parametry`);
    }
  }
  // przetłumaczone naprawdę: większość tekstów różni się od polskich (poza wspólnymi skrótami jak A–Z, dPo / dKo)
  for (const lang of ['en', 'de']) {
    const same = keys.filter((k) => DICTS[lang][k] === DICTS.pl[k]);
    assert.ok(same.length < keys.length * 0.1, `${lang}: nieprzetłumaczone ${same.join(', ')}`);
  }
  // klucze pomocy zawierają HTML z tymi samymi nagłówkami (liczba <h3>) w każdym języku
  for (const lang of LANGS) assert.equal((DICTS[lang]['help.body'].match(/<h3>/g) || []).length, 6, `${lang}: sekcje pomocy`);
});

test('i18n: t() tłumaczy w bieżącym języku, podstawia parametry, brak klucza → polski → sam klucz', () => {
  try {
    assert.equal(setLang('en'), 'en');
    assert.equal(getLang(), 'en');
    assert.equal(t('menu.new'), 'New shift…');
    assert.equal(t('tut.step', { i: 2, n: 40 }), 'Step 2/40');
    assert.equal(t('arm.point', { id: '3' }), 'Point 3 armed – press Zw (throw) or Zz (lock)');
    assert.equal(t('brak.takiego.klucza'), 'brak.takiego.klucza');
    assert.equal(t('rp.res.late'), '⚠ +{n} min', 'bez parametrów placeholder zostaje');
    assert.equal(setLang('xx'), 'pl', 'nieznany język → polski');
    setLang('de');
    assert.equal(t('sp.tab.rj'), 'Fahrplan');
  } finally { setLang('pl'); }
  assert.equal(t('menu.new'), 'Nowa zmiana…');
});

test('i18n: detectLang – ustawienie użytkownika przed przeglądarką, przeglądarka przed domyślnym polskim', () => {
  assert.equal(detectLang('de', ['en-US']), 'de');
  assert.equal(detectLang('auto', ['en-GB', 'pl']), 'en', 'nieobsługiwana preferencja („auto”) → przeglądarka');
  assert.equal(detectLang(null, ['fr-FR', 'de-AT']), 'de', 'pierwszy obsługiwany z listy przeglądarki');
  assert.equal(detectLang(null, ['fr', 'it']), 'pl');
  assert.equal(detectLang(null, []), 'pl');
  assert.equal(detectLang(undefined, ['de']), 'de');
});
