import { seedFraction } from '../../core/Random.js';
import { relationOf } from '../categories.js';

/**
 * Kalendarz służby: miesiąc i typ dnia, w których gra się służbę (`src/model/duty.js`). Gracz wybiera je na stronie
 * posterunku albo zostawia „losowo” – wtedy losuje je ziarno zmiany, więc numer rozkładu (ziarno) odtwarza też termin.
 *
 * Co zmieniają:
 *  - typ dnia – pora doby (`DAY_BANDS`) liczy się wg zasad innej pory (`DAY_RULES`): w sobotę i w niedzielę szczyty
 *    jak dzień (bez dojazdów do pracy i szkoły), w niedzielę świt jak późny wieczór (przyjęte, bez źródła);
 *  - miesiąc – sezon nad morzem (`SEASIDE_SEASON`): pociągi nad morze (`seasideTrain` – relacja do albo od
 *    miejscowości z `SEASIDE_TOWNS`) kursują wtedy każdym kursem linii, o ile ich klasa o tej porze w ogóle kursuje.
 *    Kalendarz z rozkładu POLREGIO Gdynia/Reda – Hel 2026 (docs/sources/posterunki.md); nowych dróg nie przybywa –
 *    jednotorowa linia 213 latem jest pełna, więc zmienia się tylko to, które kursy wzorca jadą;
 *  - miesiąc – roboty torowe (`WORKS`, przyjęte): od wiosny do jesieni bywa zamknięty jeden tor stacji.
 * Moduł logiki: bez DOM.
 */

/** Miesiące 1–12 (do nazwy służby – po polsku, jak komunikaty modelu). */
export const MONTHS = ['styczeń', 'luty', 'marzec', 'kwiecień', 'maj', 'czerwiec', 'lipiec', 'sierpień', 'wrzesień', 'październik', 'listopad', 'grudzień'];
/** Typy dnia: dzień roboczy, sobota, niedziela albo święto. */
export const DAY_TYPES = ['roboczy', 'sobota', 'niedziela'];
const DAY_NAMES = { roboczy: 'dzień roboczy', sobota: 'sobota', niedziela: 'niedziela lub święto' };
/** Losowanie typu dnia: jak w tygodniu – 5 dni roboczych, sobota, niedziela. */
const DAY_WEIGHTS = { roboczy: 5, sobota: 1, niedziela: 1 };
/** Pora doby wg typu dnia: id pory `DAY_BANDS` → id pory, której zasady obowiązują (przyjęte). */
export const DAY_RULES = {
  roboczy: {},
  sobota: { 'szczyt-rano': 'dzien', 'szczyt-po': 'dzien' },
  niedziela: { swit: 'pozny-wieczor', 'szczyt-rano': 'dzien', 'szczyt-po': 'dzien' },
};
/**
 * Sezon nad morzem: miesiąc → typy dnia, w które pociągi nad morze kursują każdym kursem. POLREGIO Hel 2026: od
 * czerwcowej korekty (14 czerwca) w weekendy, od początku wakacji (27 czerwca) do końca sierpnia codziennie, we wrześniu
 * znów w weekendy – czerwiec i wrzesień w kalendarzu miesięcznym to weekendy.
 */
export const SEASIDE_SEASON = { 6: ['sobota', 'niedziela'], 7: DAY_TYPES, 8: DAY_TYPES, 9: ['sobota', 'niedziela'] };
/**
 * Roboty torowe (przyjęte, bez źródła): miesiąc → prawdopodobieństwo, że w służbie jeden tor stacji jest zamknięty na
 * całą służbę – sezon robót od kwietnia do października, w marcu i listopadzie rzadziej, zimą (mróz) bez robót.
 */
export const WORKS = { 3: 0.15, 4: 0.35, 5: 0.35, 6: 0.35, 7: 0.35, 8: 0.35, 9: 0.35, 10: 0.35, 11: 0.15 };
/** Miejscowości nad morzem – relacja pociągu do albo od nich czyni go pociągiem nad morze. */
export const SEASIDE_TOWNS = ['Hel', 'Jastarnia', 'Jurata', 'Władysławowo', 'Łeba', 'Ustka', 'Darłowo', 'Kołobrzeg', 'Międzyzdroje', 'Świnoujście', 'Krynica Morska'];

/** Miesiąc i typ dnia z adresu sprowadzone do dozwolonych: zły albo pusty – null („losowo”). */
export function normalizeCalendar(month, day) {
  const m = Number(month);
  return {
    month: month != null && month !== '' && Number.isInteger(m) && m >= 1 && m <= 12 ? m : null,
    day: DAY_TYPES.includes(day) ? day : null,
  };
}

/** Termin służby: wybrany miesiąc i typ dnia, a brakujące („losowo”) – z ziarna; `{ month, day }`. */
export function resolveCalendar(seed, { month = null, day = null } = {}) {
  const m = month ?? 1 + Math.floor(seedFraction(seed, 'kalendarz|miesiac') * 12);
  let d = day;
  if (d == null) {
    const total = Object.values(DAY_WEIGHTS).reduce((a, b) => a + b, 0);
    let x = seedFraction(seed, 'kalendarz|dzien') * total;
    d = DAY_TYPES.find((k) => (x -= DAY_WEIGHTS[k]) < 0) ?? DAY_TYPES[0];
  }
  return { month: m, day: d };
}

/** Czy pociąg jedzie nad morze albo znad morza (relacja z miejscowością z `SEASIDE_TOWNS`). */
export function seasideTrain(entry) {
  return relationOf(entry).split(' – ').some((city) => SEASIDE_TOWNS.some((town) => city.trim() === town || city.trim().startsWith(`${town} `)));
}

/** Czy w terminie `{ month, day }` trwa sezon nad morzem. */
export function seasideSeason({ month, day }) {
  return (SEASIDE_SEASON[month] ?? []).includes(day);
}

/** Termin do nazwy służby: „lipiec, sobota”. */
export function calendarLabel({ month, day }) {
  return `${MONTHS[month - 1]}, ${DAY_NAMES[day]}`;
}
