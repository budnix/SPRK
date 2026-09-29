/**
 * Polecenie specjalne stanowiska komputerowego wg Ie-104.1 (2025) §11 ust. 13, 14, 16 – bez DOM, czas symulacji.
 *
 *  - polecenie jest dwuetapowe: inicjowanie (element zamarkowany – pomarańczowe tło) i potwierdzenie;
 *  - potwierdzić można najwcześniej po `SPECIAL_DELAY` s od inicjowania, a po `SPECIAL_TIMEOUT` s polecenie odwołuje się
 *    samo;
 *  - w tym czasie nie da się wydać innego polecenia (Simulation odrzuca `execute` / `press` / `pull`);
 *  - odwołanie (OPS) – w każdej chwili.
 */
export const SPECIAL_DELAY = 5;
export const SPECIAL_TIMEOUT = 60;

export class SpecialCommand {
  constructor() {
    this.pending = null; // { cmd, label, target, since }
  }

  /** Inicjowanie polecenia specjalnego `cmd` (polecenie `Simulation.execute`) na elemencie `target`. */
  start(time, cmd, { label = '', target = null } = {}) {
    if (this.pending) return { ok: false, reason: `Trwa polecenie specjalne „${this.pending.label}” – potwierdź albo odwołaj (OPS)` };
    this.pending = { cmd, label, target, since: time };
    return { ok: true };
  }

  /** Stan dla widoku: wiek, czy można już potwierdzić, ile zostało do samoczynnego odwołania. */
  state(time) {
    if (!this.pending) return null;
    const age = time - this.pending.since;
    return { ...this.pending, age, ready: age >= SPECIAL_DELAY, wait: Math.max(0, Math.ceil(SPECIAL_DELAY - age)), left: Math.max(0, Math.ceil(SPECIAL_TIMEOUT - age)) };
  }

  /** Potwierdzenie – zwraca polecenie do wykonania albo odmowę (za wcześnie / brak polecenia). */
  confirm(time) {
    const st = this.state(time);
    if (!st) return { ok: false, reason: 'Brak polecenia specjalnego do potwierdzenia' };
    if (!st.ready) return { ok: false, reason: `Polecenie specjalne: potwierdzenie najwcześniej ${SPECIAL_DELAY} s po inicjowaniu (jeszcze ${st.wait} s)` };
    this.pending = null;
    return { ok: true, cmd: st.cmd, label: st.label };
  }

  cancel() {
    const had = this.pending;
    this.pending = null;
    return had;
  }

  /** Samoczynne odwołanie po `SPECIAL_TIMEOUT` s – zwraca odwołane polecenie albo null. */
  tick(time) {
    if (this.pending && time - this.pending.since > SPECIAL_TIMEOUT) return this.cancel();
    return null;
  }
}
