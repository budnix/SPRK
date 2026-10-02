/**
 * Zegar symulacji. Czas symulacji liczony w sekundach od północy.
 * `speed` – mnożnik czasu (1 = czas rzeczywisty), 0 = pauza.
 */
export class Clock {
  constructor(startTime = '06:00', speed = 1) {
    this.time = Clock.parse(startTime);
    this.speed = speed;
    this.paused = false;
  }

  static parse(hhmm) {
    const [h, m, s = '0'] = String(hhmm).split(':');
    return (+h) * 3600 + (+m) * 60 + (+s);
  }

  /**
   * Zapis chwili do danych (rozkład, okno zmiany) bez zawijania doby: godziny po północy następnego dnia jako 24, 25…
   * („24:30” = pół godziny po północy) – `parse` czyta je jako ciąg dalszy tej samej zmiany. Do pokazania – `format`.
   */
  static stamp(seconds) {
    const t = Math.floor(seconds), p = (n) => String(n).padStart(2, '0');
    return `${p(Math.floor(t / 3600))}:${p(Math.floor((t % 3600) / 60))}`;
  }

  static format(seconds, withSeconds = false) {
    const t = Math.floor(seconds) % 86400;
    const h = Math.floor(t / 3600);
    const m = Math.floor((t % 3600) / 60);
    const s = t % 60;
    const p = (n) => String(n).padStart(2, '0');
    return withSeconds ? `${p(h)}:${p(m)}:${p(s)}` : `${p(h)}:${p(m)}`;
  }

  /** Przesuwa zegar o `realDt` sekund czasu rzeczywistego; zwraca dt symulacji. */
  advance(realDt) {
    if (this.paused) return 0;
    const dt = realDt * this.speed;
    this.time += dt;
    return dt;
  }
}
