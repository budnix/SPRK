/**
 * Przeciąganie okienek (dymek samouczka, słownik, pasek potwierdzenia) myszą lub palcem.
 * `handle` – element, za który się chwyta (np. nagłówek); okienko jest `position: fixed`.
 * Po przeciągnięciu okienko zostaje tam, gdzie je odłożono – `onMoved()` pozwala właścicielowi
 * wyłączyć automatyczne pozycjonowanie do czasu następnego pokazania; `onTap()` – puszczenie bez przesunięcia
 * (zwykłe kliknięcie w uchwyt).
 */
export function makeDraggable(el, handle, opts = {}) {
  const grip = handle || el;
  grip.classList.add('draggable');
  let drag = null;
  grip.addEventListener('pointerdown', (ev) => {
    if (ev.button !== 0 || ev.target.closest('button, a, input, select, textarea, abbr')) return;
    const r = el.getBoundingClientRect();
    // od tej chwili pozycja jest jawna (lewy górny róg), bez transform / bottom
    el.style.transform = 'none'; el.style.bottom = 'auto'; el.style.right = 'auto';
    el.style.left = `${r.left}px`; el.style.top = `${r.top}px`;
    drag = { dx: ev.clientX - r.left, dy: ev.clientY - r.top, w: r.width, h: r.height, moved: false };
    grip.setPointerCapture?.(ev.pointerId);
    ev.preventDefault();
    opts.onStart?.();
  });
  grip.addEventListener('pointermove', (ev) => {
    if (!drag) return;
    const left = Math.max(0, Math.min(window.innerWidth - drag.w, ev.clientX - drag.dx));
    const top = Math.max(0, Math.min(window.innerHeight - 24, ev.clientY - drag.dy));
    el.style.left = `${left}px`; el.style.top = `${top}px`;
    drag.moved = true;
  });
  const end = (ev) => {
    if (!drag) return;
    const moved = drag.moved; drag = null;
    grip.releasePointerCapture?.(ev.pointerId);
    if (moved) { el.dataset.dragged = 'true'; opts.onMoved?.(); } else opts.onTap?.(ev);
  };
  grip.addEventListener('pointerup', end);
  grip.addEventListener('pointercancel', end);
}
