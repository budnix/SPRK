/**
 * Lampki powtarzacza sygnalizatora na pulpicie kostkowym typu E (bez DOM).
 *
 * Powtarzacz ma albo światła takie jak semafor, albo jedną zieloną lampkę dla wszystkich sygnałów zezwalających – to
 * drugie jest typowe dla pulpitów typu E (Ie-10 (E18) rozdz. II §7 ust. 7; ISDR 2.3.2.2.1.5; bsk.isdr.pl). Gra
 * stosuje wariant typowy: semafor – zielona (każdy sygnał zezwalający dla pociągu, S2–S13), czerwona („Stój”), biała
 * (Ms2 – ciągła, sygnał zastępczy Sz – migająca, razem z czerwoną); tarcza manewrowa – niebieska (Ms1), biała (Ms2).
 * Obraz sygnału (S5, S13…) widać na semaforze, nie na powtarzaczu.
 *
 * @returns { [kolor lampki]: 'kolor' | 'kolor blink' } – lampki, które świecą; pozostałe zgaszone
 */
export function repeaterLamps(aspect, kind = 'semafor') {
  if (kind === 'tm') return aspect === 'Ms2' ? { white: 'white' } : { blue: 'blue' };
  if (aspect === 'Sz') return { red: 'red', white: 'white blink' };
  if (aspect === 'Ms2') return { white: 'white' };
  if (!aspect || aspect === 'S1') return { red: 'red' };
  return { green: 'green' };
}

/** Lampki powtarzacza semafora w kolejności od podstawy (wschód – od lewej): zielona, czerwona, biała. */
export const SEMAPHORE_REPEATER_LAMPS = ['green', 'red', 'white'];
