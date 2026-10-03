/**
 * Obrazy sygnałowe wg Ie-1 – czyste reguły, bez stanu zależności: co znaczy obraz (szybkość, „Stój”, jazda pociągu /
 * manewrowa), obraz „Stój” sygnalizatora, obraz zezwalający dla nastawionego przebiegu (świetlny wg następnego semafora
 * albo kształtowy) i tarcza ostrzegawcza kształtowa. Warunki urządzeń (Sz, usterka, stopowanie, blokada liniowa,
 * dźwignia) sprawdza `Interlocking` przed wyborem obrazu. `Interlocking` wystawia te funkcje jako swoje statyczne
 * (`Interlocking.isProceed` …). Moduł logiki: bez DOM.
 */

/** Największa szybkość na obraz [km/h]: „Stój” – 0, Sz – 40 (Ie-1 od 17.01.2026 §4 ust. 13 pkt 18), Ms2 / M2 – 25. */
export function aspectSpeed(aspect) {
  switch (aspect) {
    case 'S1': case 'Sr1': case 'Ms1': case 'M1': return 0;
    case 'Sz': return 40; // Ie-1 od 17.01.2026 §4 ust. 13 pkt 18 (wcześniej 20 km/h)
    case 'Ms2': case 'M2': return 25;
    case 'S10': case 'S11': case 'S12': case 'S13': case 'Sr3': return 40;
    default: return Infinity;
  }
}

/** Obraz zezwala na jazdę (pociągu albo manewrową) – każdy poza „Stój” i Ms1 / M1. */
export function isProceed(aspect) {
  return !['S1', 'Sr1', 'Ms1', 'M1'].includes(aspect);
}

/** „Stój” na semaforze (świetlnym S1 albo kształtowym Sr1). */
export function isStop(aspect) {
  return aspect === 'S1' || aspect === 'Sr1';
}

/** Jazda manewrowa dozwolona (Ms2 na tarczy świetlnej albo semaforze, M2 na tarczy kształtowej). */
export function isShuntProceed(aspect) {
  return aspect === 'Ms2' || aspect === 'M2';
}

/** Sygnał zezwalający dla pociągu (S2–S13, Sr2/Sr3, Sz) – Ms2 / M2 na semaforze dla pociągu znaczy „Stój”. */
export function isTrainProceed(aspect) {
  return isProceed(aspect) && !isShuntProceed(aspect);
}

/** Obraz tarczy ostrzegawczej kształtowej (Ie-1 §5) dla obrazu semafora: dwustawna Od, trzystawna Ot. */
export function warningAspect(aspect, arms) {
  if (arms === 2) return aspect === 'Sr2' ? 'Ot2' : aspect === 'Sr3' ? 'Ot3' : 'Ot1';
  return aspect === 'Sr2' || aspect === 'Sr3' ? 'Od2' : 'Od1';
}

/** Obraz „Stój” sygnalizatora rodzaju `kind` ('semafor' – S1 / Sr1, tarcza – Ms1 / M1); `shaped` – urządzenia kształtowe. */
export function stopAspect(kind, shaped) {
  if (kind === 'semafor') return shaped ? 'Sr1' : 'S1';
  return shaped ? 'M1' : 'Ms1';
}

/**
 * Obraz semafora kształtowego dla przebiegu: semafor nie zapowiada następnego – Sr3 (do 40 km/h przez okręg
 * zwrotnicowy) na przebieg o szybkości do 60 km/h, Sr2 (największa dozwolona) na pozostałe; manewrowy – M2.
 */
export function shapedAspect(route) {
  if (route.kind === 'shunt') return 'M2';
  return route.speed <= 60 ? 'Sr3' : 'Sr2';
}

/**
 * Obraz zezwalający dla nastawionego przebiegu `route` (warunki urządzeń już spełnione): manewrowy – Ms2 / M2;
 * kształtowy – `shapedAspect`; świetlny – wg szybkości przebiegu (≤ 60 km/h – obrazy „40”) i obrazu następnego semafora
 * `next` (null – przebieg kończy się na szlaku albo kozle): następny na „Stój” (także Sz albo tylko sygnał manewrowy) –
 * S5 / S13, następny „40” – S4 / S12, wyjazd na szlak i następny zezwalający – S2 / S10.
 */
export function proceedAspect(route, next, shaped) {
  if (route.kind === 'shunt') return shaped ? 'M2' : 'Ms2';
  if (shaped) return shapedAspect(route);
  const restricted = route.speed <= 60;
  if (route.end.type === 'exit') return restricted ? 'S10' : 'S2';
  // następny semafor na „Stój” – także gdy wskazuje tylko sygnał manewrowy (Ms2 / M2 dla pociągu znaczy „Stój”)
  const nextStop = !next || next === 'S1' || next === 'Sz' || isShuntProceed(next);
  const nextRestricted = next && ['S10', 'S11', 'S12', 'S13'].includes(next);
  if (nextStop) return restricted ? 'S13' : 'S5';
  if (nextRestricted) return restricted ? 'S12' : 'S4';
  return restricted ? 'S10' : 'S2';
}
