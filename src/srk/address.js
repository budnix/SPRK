/**
 * Protokół obsługi urządzeń przekaźnikowych typu IZH-111 (bez DOM): przyciski adresowe + przyciski rozkazów.
 *
 * Przycisk adresowy (przy zwrotnicy, sygnalizatorze, końcu toru) wybiera element, przycisk rozkazu mówi, co z nim
 * zrobić. Na prawdziwym pulpicie oba wciska się jednocześnie; tu adres zostaje wybrany na `armTimeout` sekund,
 * a rozkaz wykonuje się na wyborze i go zużywa. Przebieg to dwa adresy (początek, koniec) i rozkaz „P” albo „M” –
 * rodzaj przebiegu wynika z rozkazu, nie z koloru przycisku. Sygnały na semaforach pośrednich podają się same,
 * więc przebieg nastawia się od razu cały (`requestCompoundRoute`).
 *
 * ref: { kind: 'signal' | 'end' | 'point' | 'derailer', id } – przycisk adresowy
 *      { kind: 'order', id } – przycisk rozkazu (`ORDERS`)
 *
 * Uproszczenia względem urządzeń: bez rozkazów RZ, IZ, NSz, S, Ln, Rm; sygnał zastępczy świeci przez czas z zależności
 * (nie „dopóki trzymane są przyciski”); czas wyboru adresu jest przyjęty, źródła go nie podają.
 */
export const SELECT_TIMEOUT = 10; // s – czas na rozkaz po wybraniu adresu (założenie)

/** Rozkazy: `targets` – rodzaje adresów, których dotyczą; `addresses` – ile adresów trzeba wybrać. */
export const ORDERS = [
  { id: 'P', name: 'przebieg pociągowy', addresses: 2, targets: ['signal'] },
  { id: 'M', name: 'przebieg manewrowy', addresses: 2, targets: ['signal'] },
  { id: '+', name: 'zwrotnica w położenie zasadnicze', addresses: 1, targets: ['point', 'derailer'] },
  { id: '-', name: 'zwrotnica w położenie przełożone', addresses: 1, targets: ['point', 'derailer'] },
  { id: 'STOP', name: 'zamknięcie zwrotnicy / sygnał „Stój”', addresses: 1, targets: ['point', 'derailer', 'signal'] },
  { id: 'Zw', name: 'odwołanie zamknięcia / zwolnienie przebiegu manewrowego', addresses: 1, targets: ['point', 'derailer', 'signal', 'end'] },
  { id: 'Zcz', name: 'zwolnienie czasowe przebiegu pociągowego', addresses: 1, targets: ['signal', 'end'] },
  { id: 'Sz', name: 'sygnał zastępczy', addresses: 1, targets: ['signal'], counter: true },
];

const ADDRESS_KINDS = ['signal', 'end', 'point', 'derailer'];
const same = (a, b) => a.kind === b.kind && a.id === b.id;

export class AddressOrderProtocol {
  /**
   * @param ilk Interlocking (polecenia zależnościowe, `time`, `refuse(msg)`, `routeEndingAt(id)`)
   * @param bus EventBus (zdarzenia `button`, `armed`)
   * @param opts { armTimeout } – czas ważności wyboru adresu
   */
  constructor(ilk, bus, opts = {}) {
    this.ilk = ilk;
    this.bus = bus;
    this.armTimeout = opts.armTimeout ?? SELECT_TIMEOUT;
    this.selection = []; // wybrane adresy (najwyżej dwa: początek i koniec przebiegu)
    this.until = 0;
  }

  /** Pierwszy wybrany adres (dla przebiegu – początek) z całym wyborem; null, gdy nic nie wybrano. */
  get armed() {
    return this.selection.length ? { ...this.selection[0], until: this.until, selection: [...this.selection] } : null;
  }

  press(ref) {
    this.bus.emit('button', { ref, action: 'press' });
    if (ref.kind === 'order') return this.#order(ref.id);
    if (!ADDRESS_KINDS.includes(ref.kind)) return this.ilk.refuse('Nieznany przycisk');
    return this.#select({ kind: ref.kind, id: ref.id });
  }

  /** Przyciski IZH-111 nie są wyciągane. */
  pull(ref) {
    this.bus.emit('button', { ref, action: 'pull' });
    return { ok: false };
  }

  pressCompound(ref) {
    return this.press(ref);
  }

  cancel() {
    if (!this.selection.length) return;
    this.selection = [];
    this.bus.emit('armed', null);
  }

  tick(time) {
    if (this.selection.length && this.until < time) this.cancel();
  }

  #select(ref) {
    if (this.selection.length && this.until < this.ilk.time) this.selection = [];
    const at = this.selection.findIndex((r) => same(r, ref));
    if (at >= 0) this.selection.splice(at, 1);          // ten sam adres drugi raz – odwołanie wyboru
    else if (this.selection.length >= 2) this.selection[1] = ref; // trzeci adres zastępuje koniec
    else this.selection.push(ref);
    this.until = this.ilk.time + this.armTimeout;
    this.bus.emit('armed', this.armed);
    return this.selection.length ? { ok: true, armed: true } : { ok: true };
  }

  #order(id) {
    const ilk = this.ilk;
    const order = ORDERS.find((o) => o.id === id);
    const valid = this.until >= ilk.time;
    const [first, second] = valid ? this.selection : [];
    this.cancel(); // rozkaz zużywa wybór, także przy odmowie
    if (!order) return ilk.refuse(`Nieznany rozkaz ${id}`);
    if (!first) return ilk.refuse(`Rozkaz ${id}: najpierw naciśnij przycisk adresowy elementu.`);
    if (order.addresses === 2) {
      if (!second || first.kind !== 'signal') return ilk.refuse(`Rozkaz ${id}: wybierz przyciski adresowe początku i końca przebiegu.`);
      return ilk.requestCompoundRoute(first.id, second.id, id === 'M' ? 'shunt' : 'train');
    }
    const target = second || first;
    if (!order.targets.includes(target.kind)) return ilk.refuse(`Rozkaz ${id} nie dotyczy tego elementu – działa z przyciskiem adresowym ${TARGET_NAMES[order.targets[0]]}.`);
    const moving = target.kind === 'point' || target.kind === 'derailer';
    switch (id) {
      case '+':
      case '-':
        if (target.kind === 'derailer') return ilk.switchDerailer(target.id, id === '+' ? 'on' : 'off');
        return ilk.switchPoint(target.id, id);
      case 'STOP':
        if (moving) return this.#lock(target, true);
        return ilk.cancelSignal(target.id);
      case 'Zw':
        if (moving) return this.#lock(target, false);
        return this.#release(target, 'shunt', id);
      case 'Zcz':
        return this.#release(target, 'train', id);
      case 'Sz':
        return ilk.substituteSignal(target.id);
      default:
        return ilk.refuse(`Rozkaz ${id}: brak funkcji`);
    }
  }

  /** Zamknięcie indywidualne w podany stan (zależności mają przełącznik). */
  #lock(target, locked) {
    const derailer = target.kind === 'derailer';
    const el = (derailer ? this.ilk.derailers : this.ilk.points).get(target.id);
    if (!el) return this.ilk.refuse(`Brak elementu ${target.id}`);
    if (!!el.individualLock === locked) return { ok: true, noop: true };
    return this.ilk.toggleIndividualLock(target.id, derailer);
  }

  /** Zwolnienie przebiegu wskazanego adresem końca: Zcz – pociągowy (czasowo), Zw – manewrowy (bezzwłocznie). */
  #release(target, kind, id) {
    const route = this.ilk.routeEndingAt(target.id);
    if (!route) return this.ilk.refuse(`Rozkaz ${id}: nie ma przebiegu kończącego się na ${target.id} (wskaż przycisk adresowy końca przebiegu).`);
    if (route.kind !== kind) return this.ilk.refuse(kind === 'train' ? `Przebieg manewrowy ${route.id} zwalnia rozkaz Zw.` : `Przebieg pociągowy ${route.id} zwalnia rozkaz Zcz (zwolnienie czasowe).`);
    return this.ilk.releaseRoute(route.start, false);
  }
}

const TARGET_NAMES = { signal: 'semafora lub tarczy', point: 'zwrotnicy lub wykolejnicy', derailer: 'zwrotnicy lub wykolejnicy', end: 'końca przebiegu' };
