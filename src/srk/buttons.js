/**
 * Protokół przycisków urządzeń przekaźnikowych typu E (bez DOM): tłumaczy naciśnięcia i wyciągnięcia
 * przycisków pulpitu kostkowego na polecenia zależnościowe (`Interlocking`: przebieg, zwolnienie, zwrotnica…).
 *
 * Obsługa dwuprzyciskowa: pierwszy przycisk „uzbraja” (`armTimeout` s), drugi wykonuje. Rodzaj przebiegu wynika
 * z koloru przycisku sygnałowego (zielony – pociągowy, biały – manewrowy), funkcja przycisku grupowego z jego roli
 * (Zw, Zz, Pz, dPz, Sz). Zależności nie znają przycisków – inne stanowisko (np. pulpit kluczowy) dostaje własny
 * protokół albo wydaje polecenia wprost (`Simulation.command`).
 *
 * ref: { kind: 'signal', id, color: 'green'|'white' }
 *      { kind: 'point', id } | { kind: 'derailer', id } | { kind: 'end', id }
 *      { kind: 'group', id, role }
 */
export const ARM_TIMEOUT = 6; // s – czas na naciśnięcie drugiego przycisku

export class ButtonProtocol {
  /**
   * @param ilk Interlocking (polecenia zależnościowe, `time`, `refuse(msg)`)
   * @param bus EventBus (zdarzenia `button`, `armed`)
   * @param opts { armTimeout } – czas na drugi przycisk / wskazanie końca (zależny od systemu srk)
   */
  constructor(ilk, bus, opts = {}) {
    this.ilk = ilk;
    this.bus = bus;
    this.armTimeout = opts.armTimeout ?? ARM_TIMEOUT;
    this.armed = null; // { ...ref, until }
  }

  static routeKind(ref) {
    return ref.color === 'white' ? 'shunt' : 'train';
  }

  press(ref) {
    this.bus.emit('button', { ref, action: 'press' });
    const armed = this.#takeArmed();
    if (ref.kind === 'group') {
      if (armed && armed.kind !== 'group') {
        // Kolejność odwrotna (najpierw przycisk elementu, potem grupowy) też działa
        return this.#twoButton(ref, armed);
      }
      this.#arm(ref);
      return { ok: true, armed: true };
    }
    if (armed?.kind === 'group') return this.#twoButton(armed, ref);
    if (ref.kind === 'signal' || ref.kind === 'end') {
      if (armed && (armed.kind === 'signal') && armed.id !== ref.id) {
        return this.ilk.requestRoute(armed.id, ref.id, ButtonProtocol.routeKind(armed));
      }
      if (ref.kind === 'signal') { this.#arm(ref); return { ok: true, armed: true }; }
      return this.ilk.refuse('Najpierw naciśnij przycisk sygnałowy początku przebiegu.');
    }
    if (ref.kind === 'point' || ref.kind === 'derailer') {
      // Bez przycisku grupowego – uzbrój (dopuszczalna kolejność odwrotna)
      this.#arm(ref);
      return { ok: true, armed: true };
    }
    return this.ilk.refuse('Nieznany przycisk');
  }

  pull(ref) {
    this.bus.emit('button', { ref, action: 'pull' });
    this.cancel(); // wyciągnięcie odwołuje uzbrojenie
    if (ref.kind === 'signal') return this.ilk.cancelSignal(ref.id);
    return { ok: false };
  }

  /**
   * Koniec przebiegu złożonego (stanowisko komputerowe): jak `press(end)` po uzbrojeniu semafora, ale gdy nie ma
   * przebiegu bezpośredniego, nastawia łańcuch przebiegów przez semafory pośrednie (np. G502 → A502 → szlak).
   */
  pressCompound(endRef) {
    this.bus.emit('button', { ref: endRef, action: 'press' });
    const armed = this.#takeArmed();
    if (!armed || armed.kind !== 'signal') return this.ilk.refuse('Najpierw wskaż semafor początku przebiegu.');
    if (armed.id === endRef.id) return this.ilk.refuse('Koniec przebiegu musi być inny niż początek.');
    return this.ilk.requestCompoundRoute(armed.id, endRef.id, ButtonProtocol.routeKind(armed));
  }

  /** Odwołanie uzbrojenia (wyciągnięcie przycisku, OPS na monitorze). */
  cancel() {
    if (!this.armed) return;
    this.armed = null;
    this.bus.emit('armed', null);
  }

  /** Uzbrojenie wygasa po `armTimeout` sekundach. */
  tick(time) {
    if (this.armed && this.armed.until < time) this.cancel();
  }

  #arm(ref) {
    this.armed = { ...ref, until: this.ilk.time + this.armTimeout };
    this.bus.emit('armed', this.armed);
  }

  #takeArmed() {
    const a = this.armed;
    this.armed = null;
    if (a) this.bus.emit('armed', null);
    return a && a.until >= this.ilk.time ? a : null;
  }

  #twoButton(group, target) {
    const ilk = this.ilk;
    switch (group.role) {
      case 'group-point':
        if (target.kind === 'point') return ilk.switchPoint(target.id);
        if (target.kind === 'derailer') return ilk.switchDerailer(target.id);
        return ilk.refuse('Przycisk Zw działa z przyciskiem zwrotnicy lub wykolejnicy.');
      case 'point-lock':
        if (target.kind === 'point') return ilk.toggleIndividualLock(target.id);
        if (target.kind === 'derailer') return ilk.toggleIndividualLock(target.id, true);
        return ilk.refuse('Przycisk Zz działa z przyciskiem zwrotnicy.');
      case 'route-release':
        if (target.kind === 'signal') return ilk.releaseRoute(target.id, false);
        return ilk.refuse('Przycisk Pz działa z przyciskiem sygnałowym początku przebiegu.');
      case 'emergency-release':
        if (target.kind === 'signal') return ilk.releaseRoute(target.id, true);
        return ilk.refuse('Przycisk dPz działa z przyciskiem sygnałowym początku przebiegu.');
      case 'substitute':
        if (target.kind === 'signal') return ilk.substituteSignal(target.id);
        return ilk.refuse('Przycisk Sz działa z przyciskiem sygnałowym semafora.');
      default:
        return ilk.refuse(`Przycisk ${group.id}: brak funkcji`);
    }
  }
}
