import { makeDraggable } from '../ui/drag.js';
import { escapeHtml } from '../ui/dom.js';

/**
 * Pasek potwierdzenia polecenia (Ie-20 §13.7: polecenie specjalne wykonuje się po dodatkowej akceptacji – potwierdzeniu)
 * – wspólny dla stanowisk komputerowych. Opis polecenia, przycisk wykonania i odwołania; przesuwany palcem / myszą.
 */
export function createConfirmBar() {
  const bar = document.createElement('div');
  bar.className = 'scr-confirm hidden';
  document.body.appendChild(bar);
  makeDraggable(bar, null);
  const hide = () => bar.classList.add('hidden');
  return {
    el: bar,
    hide,
    /** { html | text, ok, cancel, onOk, onCancel } – `html` tylko z tekstów gry (dane przez `text`). */
    show({ html, text, ok, cancel, onOk, onCancel = () => {} }) {
      bar.innerHTML = `<span>${html ?? escapeHtml(text)}</span>`;
      const okB = document.createElement('button'); okB.type = 'button'; okB.className = 'tb warn'; okB.textContent = ok;
      const noB = document.createElement('button'); noB.type = 'button'; noB.className = 'tb'; noB.textContent = cancel;
      okB.addEventListener('click', () => { hide(); onOk(); });
      noB.addEventListener('click', () => { hide(); onCancel(); });
      // przyciski trzymają się razem: na wąskim ekranie schodzą pod opis jako para
      const actions = document.createElement('div'); actions.className = 'confirm-actions';
      actions.append(okB, noB);
      bar.append(actions);
      bar.classList.remove('hidden');
    },
  };
}
