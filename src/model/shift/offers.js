import { hasDuty } from '../duty.js';

/**
 * Co posterunek oferuje do gry – wspólne dla strony posterunku (`src/ui/StartScreen.js`), automatu sprawdzającego
 * (lista służb na każdym stanowisku) i testów służby: stacja szkoleniowa, wybór zmiany (służba o wybranej porze,
 * scenariusze specjalne, stanowiska do wyboru), czy gracz wybiera stanowisko. Moduł logiki: bez DOM.
 */

/** Stacja szkoleniowa: ma misję (scenariusz z `tutorial`) – jest tylko w szkoleniu, nie w służbie. */
export function isTraining(station) {
  return (station.scenarios || []).some((sc) => sc.tutorial);
}

/**
 * Wybór zmiany na stronie posterunku. Posterunek do służby z rozkładem (`hasDuty`) ma służbę o wybranej porze
 * i długości (`duty`), a z listy scenariuszy zostają tylko specjalne – z usterką albo zamknięciem toru ze scenariusza
 * (`specials`); zwykłe zmiany („Pełna zmiana”, „Szczyt”) zastępuje służba – zostają w definicji stacji jako wzorzec
 * rozkładu i pod dawnym adresem. `srks` – stanowiska do wyboru (zwykłe zmiany stacji na różnych stanowiskach) – dla
 * służby i dla scenariusza specjalnego bez własnego stanowiska (`srkChoosable`).
 * Stacja szkoleniowa: bez służby, wszystkie zmiany bez samouczka.
 */
export function shiftChoices(station) {
  const scs = (station.scenarios || []).filter((sc) => !sc.tutorial);
  if (isTraining(station) || !hasDuty(station)) return { duty: false, srks: [], specials: scs };
  const special = (sc) => !!(sc.faults?.length || sc.closedSections?.length);
  const srks = [...new Set(scs.filter((sc) => !special(sc)).map((sc) => sc.srk ?? station.srk).filter(Boolean))];
  return { duty: true, srks, specials: scs.filter(special) };
}

/**
 * Czy gracz wybiera stanowisko dla scenariusza `sc` (służba albo scenariusz specjalny): posterunek ma kilka stanowisk
 * (`choices.srks` z `shiftChoices`), a scenariusz nie ma własnego (`srk` w definicji – wtedy idzie na swoim).
 */
export function srkChoosable(choices, sc) {
  return choices.srks.length > 1 && sc?.srk == null;
}
