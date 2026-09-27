import { DICTS, LANGS, t } from '../i18n/index.js';

const DICT_PL = DICTS.pl;

/**
 * Opis ustawień (bez DOM) do ekranu ustawień: kategorie → opcje z tytułem, opisem działania i wyborami.
 * Klucze i wartości odpowiadają `DEFAULTS` z `Settings.js` (test pilnuje kompletności). Teksty z `t()` – funkcja,
 * bo język jest znany dopiero po starcie.
 * type 'radio': `choices` [{ value, label, hint? }]; type 'range': `range` { min, max, step } (wartość jako tekst).
 * `reload: true` – zmiana przeładowuje stronę (widok budowany od nowa).
 */
const cat = (id, options) => ({ id, kicker: t(`set.cat.${id}.kicker`), title: t(`set.cat.${id}.title`), intro: t(`set.cat.${id}.intro`), options });
const opt = (key, values, extra = {}) => ({
  key, title: t(`set.${key}.title`), description: t(`set.${key}.desc`), ...extra,
  choices: values.map((value) => ({ value, label: t(`set.${key}.${value}`), hint: `set.${key}.${value}.hint` in DICT_PL ? t(`set.${key}.${value}.hint`) : undefined })),
});
export function settingsCategories() {
  return [
    cat('pulpit', [opt('deskPos', ['top', 'middle', 'bottom']), opt('screens', ['auto', 'off']), opt('edgePanels', ['off', 'on'])]),
    cat('monitor', [
      { key: 'symScale', title: t('set.symScale.title'), description: t('set.symScale.desc'), type: 'range', range: { min: 1, max: 1.5, step: 0.05 } },
      opt('rowScale', ['1', '0.7'], { reload: true }),
    ]),
    cat('wyglad', [opt('theme', ['system', 'dark', 'light'])]),
    cat('jezyk', [opt('lang', ['auto', ...LANGS], { reload: true })]),
    cat('panel', [opt('sidePos', ['right', 'left', 'bottom'])]),
  ];
}

/** Klucze ustawień opisane w schemacie (do testu kompletności względem DEFAULTS). */
export function schemaKeys() {
  return settingsCategories().flatMap((c) => c.options.map((o) => o.key));
}
