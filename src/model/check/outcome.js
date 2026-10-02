/**
 * Wynik zmiany po stronie urządzeń i oceny – wspólny dla gry zmian automatem (`play.js`), automatu sprawdzającego,
 * przeglądu silnika i testów usterek: kary za czynności wymuszone usterką (`unjustified`) i stan urządzeń po zmianie
 * (`leftovers` – wiszące przebiegi, blokady poza stanem zasadniczym, sygnały zezwalające, zajętość bez taboru).
 * Moduł logiki: bez DOM.
 */

/** Kary za czynności, które przy usterce są wymuszone: Sz, rozkaz „S”, doraźne zwolnienie, dPo / dKo. */
export function unjustified(sim) {
  return sim.score.items.filter((i) => ['Sz', 'Sz-points', 'order', 'dPz', 'dPo', 'dKo'].includes(i.code) && i.points < 0).map((i) => `${i.code} ${i.points}: ${i.msg}`);
}

/** Stan po naprawie i przejeździe: bez wiszących przebiegów, blokady w stanie zasadniczym, semafory na „Stój”. */
export function leftovers(sim) {
  const out = [];
  for (const x of sim.ilk.routesSet()) if (x.state !== 'setting') out.push(`przebieg ${x.id} czynny`);
  for (const [id, b] of sim.blocks) {
    // blok początkowy zablokowany bez pociągu na szlaku albo niewykorzystane pozwolenie / kierunek Eap – szlak dla sąsiada
    // zostałby zamknięty (kierunek SBL zostaje, dopóki ktoś go nie zmieni – to nie pozostałość)
    const stale = !b.occupied && (b.poBlocked || (!b.auto && !b.fixed && (b.permission || b.direction != null)));
    if (b.occupied || b.fault || b.koPending || b.needPo || b.request || b.awaitingEntry || stale) out.push(`blokada ${id}: ${JSON.stringify({ occupied: b.occupied, fault: b.fault, ko: b.koPending, needPo: b.needPo, request: b.request, awaitingEntry: b.awaitingEntry, poBlocked: b.poBlocked, permission: b.permission, direction: b.direction })}`);
  }
  for (const s of sim.ilk.signals.values()) if (s.aspect && s.aspect !== 'S1' && s.aspect !== 'Sr1' && s.aspect !== 'Ms1' && s.aspect !== 'M1') out.push(`${s.id}: ${s.aspect}`);
  for (const s of sim.ilk.sections.values()) if (s.occupied && !s.physical) out.push(`odcinek ${s.id} zajęty bez taboru`);
  return out;
}
