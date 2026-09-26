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

export const DISRUPTION_LEVELS = {
  none: { label: 'brak', delayChance: 0, delayMax: 0, faults: [0, 0], extraTrains: 0 },
  low: { label: 'małe', delayChance: 0.3, delayMax: 15, faults: [1, 2], extraTrains: 0 },
  high: { label: 'duże', delayChance: 0.6, delayMax: 40, faults: [3, 5], extraTrains: 1 },
};
