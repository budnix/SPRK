/** Klucz elementu obsługi (przycisk pulpitu, punkt dotyku monitora) – wspólny dla widoków stanowisk, bez DOM. */
export function refKey(ref) {
  if (ref.kind === 'signal') return `signal:${ref.id}:${ref.color}`;
  if (ref.kind === 'block') return `block:${ref.exit}:${ref.btn}`;
  return `${ref.kind}:${ref.id}`;
}
