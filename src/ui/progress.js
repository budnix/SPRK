import { recordResult } from './catalog.js';

/**
 * Postęp gracza w przeglądarce (localStorage): najlepsze oceny zmian i ukończone misje (`catalog.recordResult`) oraz
 * ostatnia uruchomiona zmiana (kafelek „Ostatnia zmiana” na ekranie tytułowym). Bez dostępu do pamięci (tryb prywatny)
 * – pusty postęp, gra działa dalej.
 */
const PROGRESS_KEY = 'sprk.progress';
const LAST_KEY = 'sprk.lastShift';

function read(key) {
  try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; }
}
function write(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* brak pamięci – pomijamy */ }
}

export function loadProgress() {
  return read(PROGRESS_KEY) || {};
}

/** Wynik zakończonej zmiany (z raportu) – zapisany, gdy lepszy od dotychczasowego; misja – oznaczona jako ukończona. */
export function saveResult(result) {
  const p = recordResult(loadProgress(), result);
  write(PROGRESS_KEY, p);
  return p;
}

/** Ostatnia zmiana: parametry adresu (`?stacja=…&scenariusz=…`), z których da się ją uruchomić ponownie. */
export function loadLastShift() {
  const v = read(LAST_KEY);
  return v && typeof v.search === 'string' && v.search.startsWith('?') ? v : null;
}

export function saveLastShift(search) {
  write(LAST_KEY, { search });
}
