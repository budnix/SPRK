/** Deterministyczny generator losowy (mulberry32) – powtarzalne zmiany przy tym samym ziarnie. */
export class Random {
  constructor(seed = 1) {
    this.state = (seed >>> 0) || 1;
  }

  next() {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Liczba całkowita z przedziału [min, max]. */
  int(min, max) {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  chance(p) {
    return this.next() < p;
  }

  pick(arr) {
    return arr[Math.floor(this.next() * arr.length)];
  }
}

/**
 * Ziarno z ziarna zmiany i tekstu (FNV-1a, 32 bity): `basis` – wartość mieszana z ziarnem, rozróżnia zastosowania
 * (rozrzut zatrzymania przy peronie, tabor pociągu). Własne ciągi losowe pociągów nie zużywają losowań zmiany.
 */
export function mixSeed(seed, text, basis = 0x811c9dc5) {
  let h = ((seed >>> 0) ^ basis) >>> 0;
  for (const ch of String(text)) h = Math.imul(h ^ ch.charCodeAt(0), 0x01000193) >>> 0;
  return h;
}

/**
 * Ułamek [0, 1) z ziarna i klucza – powtarzalny, niezależny od generatora zmiany: ta sama para (ziarno, klucz) daje
 * zawsze ten sam ułamek, a nowy klucz nie przesuwa innych losowań (budowa służby, kalendarz służby).
 */
export function seedFraction(seed, key) {
  const h = mixSeed(Number(seed) || 0, key, 0x51ed270b);
  return (Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 8) / 0x1000000;
}

export const DISRUPTION_LEVELS = {
  none: { label: 'brak', delayChance: 0, delayMax: 0, faults: [0, 0], extraTrains: 0 },
  low: { label: 'małe', delayChance: 0.3, delayMax: 15, faults: [1, 2], extraTrains: 0 },
  high: { label: 'duże', delayChance: 0.6, delayMax: 40, faults: [3, 5], extraTrains: 1 },
};
