import { DUTY_ID, buildDuty, normalizeDuty } from '../duty.js';

/**
 * Wybór zmiany – jedna zmiana opisana tak samo w grze (adres strony), na stronie posterunku i w narzędziach:
 * `{ station, scenario, duty, srk, seed, level, district }`:
 *  - `station` – id stacji, `scenario` – id scenariusza stacji albo `DUTY_ID` (służba o wybranej porze),
 *  - `duty` – `{ start, minutes }` dla służby (inaczej null),
 *  - `srk` – stanowisko wybrane przez gracza (null – stanowisko scenariusza albo stacji),
 *  - `seed` – ziarno zmiany (null – losowe), `level` – poziom zakłóceń, `district` – okręg nastawczy gracza.
 *
 * Adres: `?stacja=…&scenariusz=…&zaklocenia=…[&okreg=…][&start=…&czas=…][&seed=…][&srk=…]` (`choiceToParams`,
 * `choiceFromParams`). Opcje symulacji: `simulationOptions` – służba ma rozkład zbudowany dla ziarna zmiany, więc bez
 * ziarna w adresie losuje się je tu, raz, i to samo ziarno idzie do adresu i do rozkładu. Moduł logiki: bez DOM.
 */

/** Parametry adresu (kolejność w adresie). */
export const PARAMS = Object.freeze({
  station: 'stacja', scenario: 'scenariusz', level: 'zaklocenia', district: 'okreg', start: 'start', minutes: 'czas', seed: 'seed', srk: 'srk',
});

/** Wybór zmiany z parametrów adresu (`params.get(nazwa)` – np. `URLSearchParams`); bez scenariusza `scenario` null – ekran wyboru. */
export function choiceFromParams(params) {
  const get = (k) => params.get(PARAMS[k]) || null;
  const scenario = get('scenario');
  const seed = get('seed');
  return {
    station: get('station'), scenario,
    duty: scenario === DUTY_ID ? normalizeDuty(get('start'), get('minutes')) : null,
    srk: get('srk'), seed: seed != null ? Number(seed) : null, level: get('level'), district: get('district'),
  };
}

/** Parametry adresu dla wyboru zmiany – pary `[nazwa, wartość]` w stałej kolejności, bez pustych. */
export function choiceToParams(choice) {
  const out = [];
  const put = (k, v) => { if (v != null && v !== '') out.push([PARAMS[k], String(v)]); };
  put('station', choice.station); put('scenario', choice.scenario); put('level', choice.level); put('district', choice.district);
  if (choice.scenario === DUTY_ID && choice.duty) { put('start', choice.duty.start); put('minutes', choice.duty.minutes); }
  put('seed', choice.seed); put('srk', choice.srk);
  return out;
}

/**
 * Opcje `Simulation` dla wyboru zmiany na stacji `station` (definicja): `{ scenario, seed, disruptions, district, srk }`.
 * Służba: scenariusz zbudowany z wzorca stacji (`buildDuty`) dla ziarna – podanego albo wylosowanego (`randomSeed`).
 * Stanowisko: z definicji scenariusza, a gdy jej nie ma – wybór gracza (`srk`), inaczej stanowisko stacji (`Simulation`).
 */
export function simulationOptions(station, choice, { randomSeed = () => Math.floor(Math.random() * 1e9) } = {}) {
  const duty = choice.scenario === DUTY_ID ? choice.duty ?? normalizeDuty(null, null) : null;
  const seed = choice.seed ?? (duty ? randomSeed() : undefined);
  return {
    // stanowisko wybrane przez gracza idzie też do scenariusza służby – narzędzia grają scenariusz bez opcji symulacji
    scenario: duty ? buildDuty(station, { start: duty.start, minutes: duty.minutes, seed, srk: choice.srk ?? null }).scenario : choice.scenario || undefined,
    seed,
    disruptions: choice.level || 'none',
    district: choice.district || undefined,
    srk: choice.srk || undefined,
  };
}

/** Okno służby w sekundach od północy: `{ from, to }` (do nazwy „Służba 22:00–00:00” i kafelka ostatniej zmiany). */
export function dutyWindow(duty) {
  return { from: duty.start * 3600, to: duty.start * 3600 + duty.minutes * 60 };
}
