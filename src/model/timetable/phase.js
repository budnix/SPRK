/**
 * Etap pociągu w rozkładzie zmiany – gdzie jest pociąg wpisu rozkładu (`Traffic`) i co się z nim dzieje.
 *
 * Etap to dane: kod (`e.phase`), a dla dwóch etapów także szczegół (`e.heldAt` – sygnalizator, przed którym pociąg
 * stoi; `e.handedTo` – numer pociągu, który przejął skład). Napis dla człowieka (`e.status`, po polsku jak komunikaty
 * modelu) powstaje z kodu tutaj i służy tylko do pokazania – kod gry, narzędzia i automat pytają o etap
 * (CLAUDE.md: działanie nie może zależeć od treści komunikatu; pilnuje tego `tests/layers.test.js`).
 *
 * Etapy zmienia wyłącznie ruch (`Traffic`) przez `setPhase`. Znaczenie etapów: `GLOSSARY.md` („Pociąg w rozkładzie”).
 * Moduł logiki: bez DOM.
 */

/** Etapy: kod → napis dla człowieka (z danymi etapu). Kolejność – mniej więcej życie pociągu na stacji. */
export const PHASES = Object.freeze({
  expected: () => 'oczekiwany',                      // pociąg sąsiada jeszcze nie wyprawiony
  'awaiting-unit': () => 'oczekuje na skład',        // pociąg powstanie ze składu innego pociągu
  'permission-requested': () => 'żądanie pozwolenia', // sąsiad prosi o pozwolenie na wyprawienie
  'on-line': () => 'na szlaku',                      // jedzie po szlaku do nas
  entering: () => 'wjeżdża',                         // wjeżdża na pulpit
  running: () => 'jedzie',                           // jedzie przez stację
  held: ({ signal }) => `stoi przed ${signal}`,      // stoi przed sygnalizatorem wskazującym „Stój”
  dwell: () => 'postój',                             // postój przy peronie
  'at-halt': ({ halt }) => `postój na przystanku ${halt}`, // postój na przystanku w obrębie stacji (`halts`)
  'at-station': () => 'na stacji',                   // stoi na stacji (przed odjazdem, po przekazaniu składu)
  shunting: () => 'manewruje',                       // jazda manewrowa
  departing: () => 'odjeżdża',                       // ruszył w stronę szlaku
  departed: () => 'odjechał',                        // wyprawiony, jedzie po szlaku do sąsiada
  'at-neighbour': () => 'na następnym posterunku',   // dojechał do sąsiada
  ended: () => 'zakończył bieg',                     // zakończył bieg na stacji
  'handed-over': ({ nr }) => `przekazany jako ${nr}`, // skład przejął inny pociąg (numer w `handedTo`)
});

/**
 * Ustawia etap pociągu `e` (wpis rozkładu): kod, szczegół i napis. `data`: `{ signal }` dla `held`, `{ nr }` dla
 * `handed-over`, `{ halt }` dla `at-halt`.
 */
export function setPhase(e, phase, data = {}) {
  const text = PHASES[phase];
  if (!text) throw new Error(`Nieznany etap pociągu: ${phase}`);
  e.phase = phase;
  e.heldAt = phase === 'held' ? data.signal : null;
  e.handedTo = phase === 'handed-over' ? data.nr : null;
  e.haltAt = phase === 'at-halt' ? data.halt : null;
  e.status = text(data);
}

/** Pierwszy etap wpisu: pociąg sąsiada czeka na wyprawienie, pociąg ze składu – na skład, inny stoi na stacji. */
export function initialPhase(def) {
  return def.from ? 'expected' : def.unit ? 'awaiting-unit' : 'at-station';
}

const HANDLED = new Set(['departed', 'at-neighbour', 'ended', 'handed-over']);
const FINISHED = new Set(['at-neighbour', 'ended', 'handed-over']);

/**
 * Pociąg obsłużony przez stację: wyprawiony na szlak (także jeszcze w drodze do sąsiada), zakończył bieg albo skład
 * przekazany innemu pociągowi. Tak liczą koniec zmiany i ocena.
 */
export const isHandled = (e) => HANDLED.has(e.phase);

/**
 * Pociąg skończony do końca: dojechał do sąsiada, zakończył bieg albo skład przekazany – nic już się z nim nie stanie.
 * Tak liczą automat sprawdzający („zator”), przegląd silnika i testy pełnych zmian.
 */
export const isFinished = (e) => FINISHED.has(e.phase);
