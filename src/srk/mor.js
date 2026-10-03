/**
 * Protokół obsługi komputerowych urządzeń stacyjnych typu MOR-3 z pulpitem MOR-1 (bez DOM).
 *
 * Źródła: Instrukcja Ie-20 (PKP PLK) – ogólne zasady wprowadzania poleceń na komputerowych pulpitach nastawczych
 * (§ 13); opis obsługi pulpitu MOR-1 w symulatorze SPE (wiki Train Driver 2, „Instrukcja SPE”) – nazwy poleceń
 * w menu obiektów i sposób nastawiania przebiegu. Instrukcji stanowiskowej MOR-3 nie ma publicznie; szczegóły
 * i założenia – docs/sources/stanowiska-komputerowe.md.
 *
 * Obsługa:
 *  - kliknięcie obiektu (`press`) – fioletowa obwódka i menu jego poleceń (`menu()`),
 *  - gdy wybrany jest początek przebiegu – sygnalizator, tor początkowy (tor, przy którym stoi sygnalizator; kierunek
 *    wynika z celu) albo strzałka blokady przy wjeździe – kliknięcie celu – sygnalizatora, trójkąta końca toru albo
 *    toru – zamiast polecenia z menu daje menu przebiegu: „Pociąg” / „Manewr” (tylko dostępne); to samo daje
 *    przeciągnięcie prawym klawiszem od początku do celu,
 *  - wybór polecenia (`choose(code)`): polecenie zwykłe wykonuje się od razu (Ie-20 §13.6 – wskazanie w menu to
 *    akceptacja); polecenie „do potwierdzenia” (w menu fioletowe) i specjalne (czerwone, z licznikiem poleceń
 *    specjalnych) czekają na potwierdzenie (`confirm()`) – w tym czasie nie przyjmuje się innych poleceń (§13.8),
 *    a odwołać je można w każdej chwili (`cancel()`, §13.9).
 * Protokół prowadzi też okno komunikatów i alarmów (`EventLog`).
 */
import { EventLog } from './eventLog.js';

/** Poziomy poleceń: zwykłe, do potwierdzenia (fioletowe), specjalne (czerwone, licznik poleceń specjalnych). */
export const LEVEL = { normal: 'normal', confirm: 'confirm', special: 'special' };

/** Utwierdzony przebieg od sygnalizatora `id` (`{ id, route, state }`) albo null – nastawiany się nie liczy. */
const signalActive = (ilk, id) => { const set = ilk.routeFrom(id); return set && set.state !== 'setting' ? set : null; };

/**
 * Menu obiektów (kolejność jak w opisie SPE; bez poleceń, których gra nie ma – lista w docs/sources/stanowiska-komputerowe.md). `when` –
 * polecenie jest w menu tylko w stanie, w którym ma sens (w SPE dostępność zależy od stanu obiektu).
 */
export const MOR_MENUS = {
  signal: [
    { code: 'Stój', name: 'sygnał „Stój” bez zwalniania przebiegu', when: (ilk, id) => !!ilk.signals.get(id).route, cmd: (id) => ({ type: 'stop', signal: id }) },
    { code: 'Stop', name: 'zablokowanie sygnału zezwalającego (stopowanie)', when: (ilk, id) => !ilk.signals.get(id).stopped, cmd: (id) => ({ type: 'signal-stop', signal: id, on: true }) },
    { code: 'oStop', name: 'odwołanie stopowania', level: LEVEL.confirm, when: (ilk, id) => !!ilk.signals.get(id).stopped, cmd: (id) => ({ type: 'signal-stop', signal: id, on: false }) },
    { code: 'ZCZ', name: 'zwolnienie czasowe przebiegu', when: (ilk, id) => !!signalActive(ilk, id) && signalActive(ilk, id).state !== 'releasing', cmd: (id) => ({ type: 'release', signal: id, timed: true }) },
    { code: 'oZCZ', name: 'odwołanie zwolnienia czasowego', when: (ilk, id) => signalActive(ilk, id)?.state === 'releasing', cmd: (id) => ({ type: 'cancel-timed', signal: id }) },
    { code: 'SZ', name: 'sygnał zastępczy', level: LEVEL.special, when: (ilk, id) => ilk.signals.get(id).kind === 'semafor' && ilk.signals.get(id).canSubstitute, cmd: (id) => ({ type: 'substitute', signal: id }) },
    { code: 'ZD', name: 'natychmiastowe zwolnienie przebiegu', when: (ilk, id) => !!signalActive(ilk, id), cmd: (id) => ({ type: 'release', signal: id }), check: (ilk, id) => {
      const act = signalActive(ilk, id);
      return act && ilk.sections.get(act.route.approach)?.occupied ? `ZD ${id}: odcinek zbliżania zajęty – użyj ZCZ (zwolnienie czasowe)` : null;
    } },
  ],
  section: [
    { code: 'Zmk', name: 'zamknięcie toru', when: (ilk, id) => !ilk.sections.get(id).closed, cmd: (id) => ({ type: 'close-section', section: id, closed: true }) },
    { code: 'oZmk', name: 'otwarcie toru', level: LEVEL.confirm, when: (ilk, id) => !!ilk.sections.get(id).closed, cmd: (id) => ({ type: 'close-section', section: id, closed: false }) },
    { code: 'ZeroLO', name: 'zerowanie licznika osi (odcinek zajęty bez pociągu)', level: LEVEL.special, when: (ilk, id) => !!ilk.sections.get(id).axleFault && !ilk.sections.get(id).resetPending, cmd: (id) => ({ type: 'axle-reset', section: id }) },
  ],
  point: [
    { code: 'Plus', name: 'przestawienie w położenie „+”', cmd: (id, o) => (o.kind === 'derailer' ? { type: 'derailer', id, position: 'on' } : { type: 'point', id, position: '+' }) },
    { code: 'Minus', name: 'przestawienie w położenie „−”', cmd: (id, o) => (o.kind === 'derailer' ? { type: 'derailer', id, position: 'off' } : { type: 'point', id, position: '-' }) },
    { code: 'Stop', name: 'zablokowanie w ustalonym położeniu', when: (ilk, _id, o) => !el(ilk, o).individualLock, cmd: (id, o) => ({ type: 'lock', id, ...(o.kind === 'derailer' ? { derailer: true } : {}) }) },
    { code: 'oStop', name: 'odblokowanie', level: LEVEL.confirm, when: (ilk, _id, o) => !!el(ilk, o).individualLock, cmd: (id, o) => ({ type: 'lock', id, ...(o.kind === 'derailer' ? { derailer: true } : {}) }) },
  ],
  block: [
    { code: 'Wbl', name: 'żądanie pozwolenia na wyprawienie pociągu', block: 'Wbl', when: (b) => !b.auto && !b.fixed },
    { code: 'oWbl', name: 'odwołanie żądania / zwrot pozwolenia', block: 'oWbl', when: (b) => !b.auto && !b.fixed },
    { code: 'Poz', name: 'danie pozwolenia', block: 'Poz', when: (b) => !b.auto && !b.fixed },
    { code: 'Ko', name: 'zwolnienie bloku końcowego – pociąg przybył w całości', block: 'Ko', when: (b) => !b.auto },
    { code: 'Zk', name: 'zmiana kierunku blokady samoczynnej (prośba / zgoda)', block: 'Zk', when: (b) => !!b.auto },
    { code: 'dPo', name: 'doraźne zablokowanie bloku początkowego', block: 'dPo', level: LEVEL.special, when: (b) => !b.auto && b.fixed !== 'in' },
    { code: 'dKo', name: 'doraźne przygotowanie bloku końcowego', block: 'dKo', level: LEVEL.special, when: (b) => !b.auto && b.fixed !== 'out' },
  ],
};

function el(ilk, o) {
  return (o.kind === 'derailer' ? ilk.derailers : ilk.points).get(o.id);
}

const ROUTE_ITEMS = [{ code: 'Pociąg', kind: 'train', name: 'przebieg pociągowy' }, { code: 'Manewr', kind: 'shunt', name: 'przebieg manewrowy' }];
const same = (a, b) => !!a && !!b && a.kind === b.kind && (a.id ?? a.exit) === (b.id ?? b.exit);

export class MorProtocol {
  /**
   * @param ilk Interlocking; @param bus EventBus; @param opts { blocks: (exit) => LineBlock } – stan blokad do menu
   */
  constructor(ilk, bus, opts = {}) {
    this.ilk = ilk;
    this.bus = bus;
    this.blocks = opts.blocks || (() => null);
    this.sel = null;          // wybrany obiekt { kind, id }
    this.target = null;       // cel przebiegu (po wybraniu początku)
    this.pending = null;      // polecenie czekające na potwierdzenie { code, level, text, cmd }
    this.specialCount = 0;    // licznik poleceń specjalnych (żółty na niebieskim tle)
    this.log = new EventLog(ilk, bus);
  }

  /** Wybór (fioletowa obwódka): obiekt, ewentualnie cel przebiegu. */
  get armed() {
    if (!this.sel) return null;
    return { ...this.sel, role: this.target ? 'route' : 'object', selection: [this.sel, this.target].filter(Boolean), pending: this.pending ? { ...this.pending } : null };
  }

  /** Kliknięcie obiektu: po wybranym początku przebiegu – cel (menu przebiegu), inaczej nowy wybór (menu obiektu). */
  press(ref) {
    this.bus.emit('button', { ref, action: 'press' });
    const r = { kind: ref.kind, id: ref.id ?? ref.exit };
    if (this.pending) return this.ilk.refuse('Najpierw potwierdź albo odwołaj polecenie czekające na potwierdzenie');
    if (this.sel && !this.target && !same(r, this.sel) && this.#routesTo(this.#starts(this.sel), r).length) {
      this.target = r;
      this.#changed();
      return { ok: true, menu: 'route' };
    }
    this.sel = r; this.target = null;
    this.#changed();
    return { ok: true, menu: 'object' };
  }

  /** Przeciągnięcie prawym klawiszem kończy się na celu – jak kliknięcie celu. */
  pull(ref) { return this.press(ref); }
  pressCompound(ref) { return this.press(ref); }

  /** Odwołanie: polecenie czekające na potwierdzenie i wybór (§13.9 – w każdej chwili). */
  cancel() {
    const had = this.sel || this.pending;
    this.sel = null; this.target = null; this.pending = null;
    if (had) this.#changed();
  }

  tick() {}

  /** Pozycje menu dla wyboru: { code, name, level }. */
  menu() {
    if (!this.sel) return [];
    if (this.target) {
      const kinds = new Set(this.#routesTo(this.#starts(this.sel), this.target).map((r) => r.kind));
      return ROUTE_ITEMS.filter((it) => kinds.has(it.kind)).map(({ code, name }) => ({ code, name, level: LEVEL.normal }));
    }
    const o = this.sel;
    if (o.kind === 'end') {
      const exit = this.#exitOf(o.id);
      const b = exit && this.blocks(exit);
      return b ? MOR_MENUS.block.filter((it) => !it.when || it.when(b)).map((it) => ({ code: it.code, name: it.name, level: it.level || LEVEL.normal })) : [];
    }
    const kind = o.kind === 'derailer' ? 'point' : o.kind;
    return (MOR_MENUS[kind] || []).filter((it) => !it.when || it.when(this.ilk, o.id, o)).map((it) => ({ code: it.code, name: it.name, level: it.level || LEVEL.normal }));
  }

  /**
   * Wybór polecenia z menu. { ok, cmd } – do wykonania od razu; { ok, confirm } – czeka na potwierdzenie;
   * { ok: false, reason } – odmowa.
   */
  choose(code) {
    const ilk = this.ilk;
    if (this.pending) return ilk.refuse(`Polecenie ${this.pending.text} czeka na potwierdzenie – potwierdź albo odwołaj`);
    const item = this.menu().find((it) => it.code === code);
    if (!item || !this.sel) return this.#refuse(`${code}`, `Polecenie ${code} nie dotyczy wybranego obiektu`);
    const o = this.sel;
    let cmd, text;
    if (this.target) {
      const routes = this.#routesTo(this.#starts(o), this.target).filter((r) => r.kind === (code === 'Pociąg' ? 'train' : 'shunt'));
      cmd = { type: 'route', id: routes[0].id };
      text = `${code} ${routes[0].id}`;
    } else if (o.kind === 'end') {
      const def = MOR_MENUS.block.find((it) => it.code === code);
      cmd = { type: 'block', exit: this.#exitOf(o.id), btn: def.block };
      text = `${code} ${cmd.exit}`;
    } else {
      const def = MOR_MENUS[o.kind === 'derailer' ? 'point' : o.kind].find((it) => it.code === code);
      const problem = def.check?.(ilk, o.id);
      if (problem) return this.#refuse(`${code} ${o.id}`, problem);
      cmd = def.cmd(o.id, o);
      text = `${code} ${o.id}`;
    }
    if (item.level !== LEVEL.normal) {
      // Sz ocenia się w chwili wyboru: uzasadnienie usterką zapamiętane do potwierdzenia (docs/sources/sygnaly-i-blokada.md)
      if (cmd.type === 'substitute') cmd.justifiedAtChoice = ilk.faultOnPath(cmd.signal);
      this.pending = { code, level: item.level, text, cmd };
      this.#changed();
      return { ok: true, confirm: true, level: item.level, text };
    }
    this.log.note(ilk.time, text, 'cmd');
    this.sel = null; this.target = null;
    this.#changed();
    return { ok: true, cmd };
  }

  /** Potwierdzenie polecenia fioletowego / specjalnego (Ie-20 §13.7) – specjalne liczy licznik poleceń specjalnych. */
  confirm() {
    const p = this.pending;
    if (!p) return this.ilk.refuse('Brak polecenia do potwierdzenia');
    this.pending = null; this.sel = null; this.target = null;
    if (p.level === LEVEL.special) this.specialCount++;
    this.log.note(this.ilk.time, `${p.text} (potwierdzone)`, 'cmd');
    this.#changed();
    return { ok: true, cmd: p.cmd };
  }

  /* ---------------- okno komunikatów i alarmów (EventLog) ---------------- */
  get events() { return this.log.events; }
  alarmList() { return this.log.alarmList(); }
  ack(ids) { this.log.ack(ids); }
  ackAll() { this.log.ackAll(); }

  /* ---------------- pomocnicze ---------------- */

  #refuse(text, reason) {
    this.log.note(this.ilk.time, `${text} – ${reason}`, 'refused');
    return this.ilk.refuse(reason);
  }

  /**
   * Sygnalizatory początku przebiegu dla wybranego obiektu: sygnalizator; tor początkowy – sygnalizatory stojące przy
   * tym torze (tor jest ich odcinkiem zbliżania; który z nich zaczyna przebieg, wynika z celu); strzałka blokady przy
   * wjeździe – semafor wjazdowy.
   */
  #starts(o) {
    if (!o) return [];
    if (o.kind === 'signal') return [o.id];
    const routes = [...this.ilk.routes.values()];
    if (o.kind === 'section') return [...new Set(routes.filter((r) => r.approach === o.id).map((r) => r.start))];
    if (o.kind !== 'end') return [];
    const tile = this.ilk.topo.endButtons.get(o.id) || null;
    const exit = this.#exitOf(o.id);
    if (!tile || !exit) return [];
    const sec = tile.section;
    const entry = routes.find((r) => r.approach === sec && r.kind === 'train' && this.ilk.signals.get(r.start)?.tile.entry);
    return entry ? [entry.start] : [];
  }

  /** Przebiegi od sygnalizatorów `starts` do celu: sygnalizatora, trójkąta końca toru albo toru (ostatni odcinek przebiegu). */
  #routesTo(starts, t) {
    if (!starts.length || !t) return [];
    return [...this.ilk.routes.values()].filter((r) => starts.includes(r.start) && (
      (t.kind === 'signal' && r.end.type === 'signal' && r.end.id === t.id)
      || (t.kind === 'end' && r.endButton === t.id)
      || (t.kind === 'section' && r.sections.at(-1) === t.id)));
  }

  /** Wyjazd na szlak dla trójkąta końca toru przy wyjeździe. */
  #exitOf(name) {
    const exits = this.ilk.station?.exits || {};
    if (exits[name]) return name;
    const tile = this.ilk.topo.endButtons.get(name);
    if (!tile) return null;
    return Object.entries(exits).find(([, e]) => e.tile.x === tile.x && e.tile.y === tile.y)?.[0] ?? null;
  }

  #changed() {
    this.bus.emit('armed', this.armed);
    this.bus.emit('console', { what: 'selection' });
  }
}
