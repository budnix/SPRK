/**
 * Blokada przewijania strony i „pull to refresh” (Safari/iOS): ruch jednym palcem przechodzi tylko wtedy, gdy
 * któryś z przodków celu naprawdę może się przewinąć w tym kierunku (panel, pulpit, ekran ustawień). Inaczej
 * `touchmove` dostaje `preventDefault`, więc dokument się nie rusza i odświeżanie gestem nie startuje.
 * Szczypnięcie (dwa palce) obsługuje pulpit; pola formularzy (suwak, lista) zostają natywne.
 */

/**
 * Czy gest (dx, dy w px od początku dotyku) ma gdzie zadziałać. `chain` – opisy elementów od celu w górę:
 * { overflowX, overflowY, scrollLeft, scrollTop, scrollWidth, clientWidth, scrollHeight, clientHeight }.
 */
export function scrollAllowed(chain, dx, dy) {
  const vertical = Math.abs(dy) >= Math.abs(dx);
  const scrolls = (v) => v === 'auto' || v === 'scroll';
  for (const el of chain) {
    if (vertical) {
      if (!scrolls(el.overflowY) || el.scrollHeight <= el.clientHeight + 1) continue;
      if (dy < 0 && el.scrollTop + el.clientHeight < el.scrollHeight - 1) return true; // palec w górę → treść w dół
      if (dy > 0 && el.scrollTop > 0) return true;
    } else {
      if (!scrolls(el.overflowX) || el.scrollWidth <= el.clientWidth + 1) continue;
      if (dx < 0 && el.scrollLeft + el.clientWidth < el.scrollWidth - 1) return true;
      if (dx > 0 && el.scrollLeft > 0) return true;
    }
  }
  return false;
}

const NATIVE = 'input, textarea, select';

export function installNoBounce(doc = document) {
  let start = null;
  doc.addEventListener('touchstart', (e) => {
    start = e.touches.length === 1 ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : null;
  }, { passive: true });
  doc.addEventListener('touchmove', (e) => {
    if (!start || e.touches.length !== 1 || !e.cancelable) return;
    if (e.target.closest?.(NATIVE)) return;
    const dx = e.touches[0].clientX - start.x, dy = e.touches[0].clientY - start.y;
    const chain = [];
    for (let el = e.target; el && el !== doc.body && el !== doc.documentElement; el = el.parentElement) {
      const cs = getComputedStyle(el);
      chain.push({ overflowX: cs.overflowX, overflowY: cs.overflowY, scrollLeft: el.scrollLeft, scrollTop: el.scrollTop, scrollWidth: el.scrollWidth, clientWidth: el.clientWidth, scrollHeight: el.scrollHeight, clientHeight: el.clientHeight });
    }
    if (!scrollAllowed(chain, dx, dy)) e.preventDefault();
  }, { passive: false });
}
