/**
 * Tłumaczenia interfejsu (menu, ekrany, panel boczny, pomoc). Klucz → tekst z parametrami `{name}`.
 * Język ustawia `setLang` na starcie (ustawienie `lang`, 'auto' = język przeglądarki); brak klucza → polski → sam klucz.
 * Komunikaty modelu symulacji (dziennik, statusy, telefonogramy Ir-1, opisy posterunków) nie przechodzą przez ten moduł.
 */
import pl from './pl.js';
import en from './en.js';
import de from './de.js';

export const DICTS = { pl, en, de };
export const LANGS = Object.keys(DICTS);
const FALLBACK = 'pl';
let current = FALLBACK;

/** Język do użycia: ustawienie użytkownika (jeśli obsługiwane), inaczej pierwszy obsługiwany język przeglądarki, inaczej polski. */
export function detectLang(pref, navLangs = typeof navigator !== 'undefined' ? navigator.languages || [navigator.language] : []) {
  if (pref && DICTS[pref]) return pref;
  for (const l of navLangs || []) {
    const code = String(l || '').slice(0, 2).toLowerCase();
    if (DICTS[code]) return code;
  }
  return FALLBACK;
}

export function setLang(lang) { current = DICTS[lang] ? lang : FALLBACK; return current; }
export function getLang() { return current; }

/** Tekst dla klucza w bieżącym języku; `{x}` zastępowane wartościami z `params`. */
export function t(key, params) {
  let s = DICTS[current][key] ?? DICTS[FALLBACK][key] ?? key;
  if (params) s = s.replace(/\{(\w+)\}/g, (m, k) => (k in params ? String(params[k]) : m));
  return s;
}

/** Wypełnia statyczny DOM: `data-i18n` → tekst, `data-i18n-title` → title, `data-i18n-aria` → aria-label, `data-i18n-ph` → placeholder. */
export function applyDom(root) {
  for (const el of root.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
  for (const el of root.querySelectorAll('[data-i18n-title]')) el.title = t(el.dataset.i18nTitle);
  for (const el of root.querySelectorAll('[data-i18n-aria]')) el.setAttribute('aria-label', t(el.dataset.i18nAria));
  for (const el of root.querySelectorAll('[data-i18n-ph]')) el.placeholder = t(el.dataset.i18nPh);
}
