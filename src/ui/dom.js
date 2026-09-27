/** Drobne narzędzia DOM bez zależności od dokumentu (testowalne w Node na atrapie elementu). */

/**
 * Podmienia `innerHTML` tylko, gdy treść się zmieniła (porównanie z ostatnio ustawionym tekstem w `dataset.html`).
 * Dzięki temu listy odświeżane co takt (karty pociągów, zadań) nie odtwarzają przycisków spod palca użytkownika.
 * Zwraca true, gdy DOM został przebudowany.
 */
export function setHtmlIfChanged(host, html) {
  if (host.dataset.html === html) return false;
  host.dataset.html = html;
  host.innerHTML = html;
  return true;
}
