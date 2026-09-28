/**
 * Wspólne zachowanie okien pełnoekranowych (instrukcja, ustawienia, raport, ekran startowy): rola okna dialogowego
 * dla czytników ekranu, fokus w oknie po otwarciu i powrót fokusu do poprzedniego elementu po zamknięciu.
 */
const returnTo = new WeakMap();

export function initDialog(root, label) {
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', label);
  root.tabIndex = -1;
}

export function openDialog(root) {
  if (root.classList.contains('hidden')) returnTo.set(root, document.activeElement);
  root.classList.remove('hidden');
  root.focus({ preventScroll: true });
}

export function closeDialog(root) {
  if (root.classList.contains('hidden')) return;
  root.classList.add('hidden');
  const prev = returnTo.get(root);
  returnTo.delete(root);
  if (prev && prev.isConnected && typeof prev.focus === 'function') prev.focus({ preventScroll: true });
}

export function isOpen(root) {
  return !root.classList.contains('hidden');
}
