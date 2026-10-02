import { Clock } from '../../core/Clock.js';
import { categoryOf, trainLabel } from '../categories.js';
import { trainSpeed } from '../rollingStock.js';
import { setPhase, initialPhase } from './phase.js';

/**
 * Wpis rozkładu zmiany – jeden pociąg w rozkładzie (`Traffic.timetable()`), z trzema częściami o różnych właścicielach:
 *
 * 1. **Definicja** – pociąg jak w rozkładzie stacji albo scenariusza (`nr`, `from`, `to`, `track`, `stop`, `unit`, …):
 *    tylko do odczytu. Przypisanie (`e.track = …`) to błąd (TypeError). Zapis z danych – bez zmian, także godzin
 *    po północy – w `e.source`; `e.arr` / `e.dep` to godziny do pokazania (`shownTime`), `e.cat` / `e.label` –
 *    kategoria i etykieta wyprowadzone z definicji. Jedyny wyjątek od definicji: `e.stop` jest fałszem, gdy pociąg
 *    przeszedł w jazdę manewrową (`stopCancelled`) – postój przy peronie już go nie dotyczy.
 * 2. **Plan** – chwile w sekundach od północy (`arrTime`, `depTime`; po północy dalej rosną), chwila wyprawienia przez
 *    sąsiada (`neighbourDep`) i zgłoszenia (`requestAt`), tabor (`rollingStock`), pociąg nadzwyczajny (`extra`).
 * 3. **Przebieg zmiany** – co się z pociągiem dzieje: etap (`phase`, `heldAt`, `handedTo`, napis `status` –
 *    `phase.js`), skład na pulpicie (`train`), rzeczywiste godziny i tor, opóźnienia, flagi rozmów z sąsiadem.
 *    Zmienia je tylko ruch (`Traffic`) – pilnuje tego `tests/layers.test.js`.
 *
 * Każdy, kto czyta wpis (widoki, automat, ocena, narzędzia), czyta go jak zwykły obiekt – części są rozdzielone
 * w budowie i w prawach zapisu, nie w nazwach pól. Moduł logiki: bez DOM.
 */

/**
 * Godzina z danych do pokazania: zapis po północy („24:30” – zmiana przez północ, `Clock.stamp`) jak na zegarze
 * („00:30”); pozostałe bez zmian. Chwile do obliczeń (`arrTime`, `depTime`, `deadlineTime`) zostają bez zawijania.
 */
export function shownTime(hhmm) {
  return typeof hhmm === 'string' && Clock.parse(hhmm) >= 86400 ? Clock.format(Clock.parse(hhmm)) : hhmm;
}

/** Czas od granicy pulpitu do peronu (s, ok.) – sąsiad wyprawia pociąg tyle wcześniej niż przejazd szlaku. */
const STATION_RUN = 90;
/** Sąsiad zgłasza pociąg (prosi o pozwolenie) tyle sekund przed wyprawieniem. */
const REQUEST_LEAD = 240;

/** Pola planu i przebiegu zmiany – pole definicji o tej nazwie nie przesłania ich (jak dotąd: plan i przebieg wygrywają). */
const OWN = new Set(['idx', 'source', 'cat', 'label', 'arrTime', 'depTime', 'neighbourDep', 'requestAt', 'rollingStock', 'extra',
  'phase', 'heldAt', 'handedTo', 'status', 'train', 'requested', 'dispatched', 'announced', 'delayIn', 'delay', 'actualArr',
  'actualDep', 'actualTrack', 'actualExit', 'attached', 'waitLogged', 'holdScored', 'stopCancelled']);

/**
 * Wpis rozkładu dla definicji `def` na stacji `station`: `idx` – miejsce w rozkładzie zmiany, `rollingStock` – tabor
 * (`rollingStock.js`), `extra` – pociąg nadzwyczajny dodany w trakcie zmiany.
 */
export function createEntry(def, { idx, station, rollingStock = null, extra = false }) {
  const arrTime = def.arr ? Clock.parse(def.arr) : null;
  const depTime = def.dep ? Clock.parse(def.dep) : null;
  const exitFrom = def.from ? station.exits[def.from] : null;
  // jazda po szlaku z prędkością pociągu z jego taborem (wolniejszy pojazd – sąsiad wyprawia go wcześniej, jak rozkład
  // ułożony dla tego pojazdu)
  const vline = Math.min(trainSpeed(def, rollingStock), exitFrom?.lineSpeed ?? 100) / 3.6;
  const lineTravel = (exitFrom?.lineLength ?? 3000) / vline;
  const neighbourDep = def.from ? (arrTime ?? depTime) - lineTravel - STATION_RUN : null;

  const e = { idx };
  // 1. definicja – tylko do odczytu
  const cat = categoryOf(def), label = trainLabel(def);
  for (const key of new Set([...Object.keys(def), 'track', 'stop'])) {
    if (OWN.has(key)) continue;
    const get = key === 'arr' || key === 'dep' ? () => shownTime(def[key])
      : key === 'stop' ? () => (e.stopCancelled ? false : def.stop)
      : () => def[key];
    Object.defineProperty(e, key, { get, enumerable: true });
  }
  Object.defineProperty(e, 'cat', { get: () => cat, enumerable: true });
  Object.defineProperty(e, 'label', { get: () => label, enumerable: true });
  Object.defineProperty(e, 'source', { value: def, enumerable: false });
  // 2. plan
  Object.assign(e, { arrTime, depTime, neighbourDep, requestAt: def.from ? neighbourDep - REQUEST_LEAD : null, rollingStock, extra });
  // 3. przebieg zmiany
  Object.assign(e, {
    phase: null, heldAt: null, handedTo: null, status: null, train: null,
    requested: false, dispatched: false, announced: false, delayIn: 0, delay: 0,
    actualArr: null, actualDep: null, actualTrack: null, actualExit: null,
    attached: false, waitLogged: false, holdScored: false, stopCancelled: false,
  });
  setPhase(e, initialPhase(def));
  return e;
}
