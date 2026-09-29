/**
 * Protokół obsługi komputerowych urządzeń stacyjnych typu EBILock 950 z pulpitem EBIScreen 3 (bez DOM).
 *
 * Źródło: „Obsługa komputerowych urządzeń stacyjnych typu EBILock 950 z pulpitem komputerowym EBIScreen 3”
 * (P. Okrzesik, LIRK WIL PK, 2021) – opis dla symulatora, z uproszczeniami względem systemu rzeczywistego;
 * szczegóły i założenia – docs/SOURCES.md.
 *
 * Każde polecenie przechodzi przez tekstową linię poleceń i „Wykonaj” (`submit(text)`): nazwa polecenia, potem
 * nazwy obiektów, rozdzielone spacjami („POC A D1”, „ZWP Zw3”). Linię wypełnia menu poleceń wybranego obiektu albo
 * klawiatura. Wybór myszą:
 *  - prawy klawisz na obiekcie (`pull`) – obiekt do polecenia (zielona pulsująca ramka) i menu jego poleceń,
 *  - lewy klawisz na sygnalizatorze (`press`) – początek przebiegu, potem prawy klawisz na końcu przebiegu
 *    (sygnalizator albo trójkąt końca toru); gdy między nimi jest kilka dróg, możliwe elementy pośrednie
 *    (zwrotnice leżące tylko na drogach alternatywnych) świecą błękitną ramką (`candidates`) i prawym klawiszem
 *    wybiera się jeden; bez wyboru – droga zasadnicza (pierwsza w tablicy przebiegów; założenie gry),
 *  - „Wyczyść” / klik w puste pole (`cancel`) – odznaczenie.
 * Polecenia specjalne mają dwa polecenia składowe: inicjujące markuje obiekt (tło w barwie polecenia), a polecenie
 * wykonania jest przyjmowane od 5 do 30 s po nim (`SPECIAL_WINDOW`).
 *
 * `submit` zwraca polecenie dla `Simulation.execute` (`cmd`) albo odmowę; wykonuje je `Simulation.submitCommand`.
 * Treść linii poleceń trzyma widok (pole tekstowe); `menu()` podaje gotowe treści poleceń dla wyboru.
 * Protokół prowadzi też okno zdarzeń i alarmów: zdarzenia (dziennik i wysłane polecenia) oraz alarmy (usterki,
 * rozprucie) – aktywne / nieaktywne, potwierdzone / niepotwierdzone (`ack`, `ackAll`).
 */

import { EventLog } from './eventLog.js';

/** Okno czasu na polecenie wykonania po poleceniu inicjującym [s] (instrukcja: od 5 s do 30 s). */
export const SPECIAL_WINDOW = { min: 5, max: 30 };

/**
 * Wykaz poleceń. `args` – rodzaje obiektów kolejnych argumentów ('route' = początek i koniec przebiegu,
 * opcjonalnie element pośredni); `init` – polecenie inicjujące (markuje obiekt `mark`), `exec` – polecenie
 * wykonania do inicjującego `exec`. `block` – polecenia blokady liniowej (przyjęte: skróty przycisków blokady).
 */
export const EBI_COMMANDS = [
  { code: 'ITS', args: ['section'], name: 'zamknięcie ruchowe toru' },
  { code: 'ITO', args: ['section'], name: 'odwołanie zamknięcia ruchowego toru' },
  { code: 'ZWP', args: ['point'], name: 'przestawienie do położenia „+”' },
  { code: 'ZWM', args: ['point'], name: 'przestawienie do położenia „−”' },
  { code: 'ZWS', args: ['point'], name: 'stopowanie (zamknięcie przeciw przestawianiu)' },
  { code: 'ZWO', args: ['point'], name: 'odwołanie stopowania' },
  { code: 'SES', args: ['signal'], name: 'stopowanie – sygnał „Stój”' },
  { code: 'SEO', args: ['signal'], name: 'odwołanie stopowania' },
  { code: 'PZW', args: ['signal'], name: 'ręczne zwolnienie przebiegu' },
  { code: 'KZW', args: ['signal'], name: 'odwołanie ręcznego zwolnienia przebiegu (czasowego)' },
  { code: 'SZI', args: ['signal'], name: 'inicjacja wyświetlenia sygnału zastępczego', init: true, mark: 'red' },
  { code: 'SZW', args: ['signal'], name: 'wyświetlenie sygnału zastępczego', exec: 'SZI' },
  { code: 'POC', args: ['route'], name: 'nastawienie przebiegu pociągowego' },
  { code: 'MAN', args: ['route'], name: 'nastawienie przebiegu manewrowego' },
  { code: 'PZA', args: ['route'], name: 'ręczne awaryjne zwolnienie przebiegu' },
  { code: 'SSS', args: ['station'], name: 'stopowanie i sygnał „Stój” na wszystkich sygnalizatorach' },
  { code: 'SSO', args: ['station'], name: 'odwołanie polecenia SSS' },
  { code: 'SZO', args: ['station'], name: 'wygaszenie sygnałów zastępczych lub odwołanie SZI' },
  { code: 'WBL', args: ['block'], name: 'żądanie pozwolenia na wyprawienie pociągu', block: 'Wbl' },
  { code: 'OWBL', args: ['block'], name: 'odwołanie żądania pozwolenia albo zwrot niewykorzystanego pozwolenia', block: 'oWbl' },
  { code: 'POZ', args: ['block'], name: 'danie pozwolenia na wyprawienie pociągu', block: 'Poz' },
  { code: 'KO', args: ['block'], name: 'zwolnienie bloku końcowego – pociąg przybył w całości', block: 'Ko' },
  { code: 'ZK', args: ['block'], name: 'zmiana kierunku blokady samoczynnej', block: 'Zk' },
  { code: 'DPO', args: ['block'], name: 'doraźne zablokowanie bloku początkowego (po wyjeździe na Sz / rozkaz)', block: 'dPo' },
  { code: 'DKO', args: ['block'], name: 'doraźne przygotowanie bloku końcowego (przed wjazdem na Sz / rozkaz)', block: 'dKo' },
];

const byCode = new Map(EBI_COMMANDS.map((c) => [c.code, c]));
const same = (a, b) => !!a && !!b && a.kind === b.kind && a.id === b.id;

export class EbiLockProtocol {
  /**
   * @param ilk Interlocking (stan stacji, `time`, `refuse`)
   * @param bus EventBus (`armed`, `log`, `alarm`, `ebi` – zmiana linii, znaczników, alarmów)
   */
  constructor(ilk, bus) {
    this.ilk = ilk;
    this.bus = bus;
    this.stationNames = [ilk.station?.id, ilk.station?.name].filter(Boolean).map((s) => String(s).toUpperCase());
    // nazwy obiektów bez względu na wielkość liter (linia poleceń pisze wielkimi, np. „KK2”) → identyfikator ze stacji
    const names = (ids) => new Map([...ids].map((id) => [String(id).toUpperCase(), id]));
    this.names = {
      signal: names(ilk.signals.keys()), point: names(ilk.points.keys()), derailer: names(ilk.derailers.keys()),
      section: names(ilk.sections.keys()), end: names(ilk.topo.endButtons.keys()), exit: names(Object.keys(ilk.station?.exits || {})),
    };
    this.sel = { start: null, end: null, via: null, object: null, candidates: [] };
    this.marks = new Map();   // 'signal:A' -> { code: 'SZI', at, color }
    this.log = new EventLog(ilk, bus); // okno zdarzeń i alarmów
  }

  /* ---------------- wybór myszą ---------------- */

  /**
   * Wybrane obiekty (ramki): początek przebiegu jako pierwszy – jak `armed` innych stanowisk. `role`: 'route' – wybór
   * przebiegu (początek, koniec, element pośredni), 'object' – obiekt polecenia.
   */
  get armed() {
    const { start, end, via, object } = this.sel;
    const selection = [start, end, via, object].filter(Boolean);
    if (!selection.length) return null;
    return { ...selection[0], role: start ? 'route' : 'object', selection, candidates: [...this.sel.candidates] };
  }

  /** Lewy klawisz: sygnalizator – początek przebiegu (poprzedni wybór znika). */
  press(ref) {
    this.bus.emit('button', { ref, action: 'press' });
    if (ref.kind !== 'signal') return this.ilk.refuse('Lewym klawiszem wskazuje się sygnalizator początku przebiegu');
    this.sel = { start: { kind: 'signal', id: ref.id }, end: null, via: null, object: null, candidates: [] };
    this.#changed();
    return { ok: true, armed: true };
  }

  /** Prawy klawisz: koniec przebiegu (po początku), element pośredni (spośród wskazanych) albo obiekt polecenia. */
  pull(ref) {
    this.bus.emit('button', { ref, action: 'pull' });
    const r = { kind: ref.kind, id: ref.id ?? ref.exit };
    const s = this.sel;
    if (s.start && !s.end && (r.kind === 'signal' || r.kind === 'end')) {
      s.end = r;
      const routes = this.#routes(s.start.id, r.id);
      if (!routes.length) { this.cancel(); return this.ilk.refuse(`Brak przebiegu od ${s.start.id} do ${r.id}`); }
      s.candidates = routes.length > 1 ? this.#distinguishing(routes) : [];
      this.#changed();
      return { ok: true, menu: true };
    }
    if (s.start && s.end && s.candidates.some((c) => same(c, r))) {
      s.via = r; s.candidates = [];
      this.#changed();
      return { ok: true, menu: true };
    }
    this.sel = { start: null, end: null, via: null, object: r, candidates: [] };
    this.#changed();
    return { ok: true, menu: true };
  }

  pressCompound(ref) {
    return this.pull(ref);
  }

  /** „Wyczyść” / klik w puste pole: odznaczenie obiektów (linię poleceń czyści widok). */
  cancel() {
    const had = this.sel.start || this.sel.object;
    this.sel = { start: null, end: null, via: null, object: null, candidates: [] };
    if (had) this.#changed();
  }

  /** Znaczniki poleceń inicjujących wygasają po 30 s. */
  tick(time) {
    for (const [k, m] of this.marks) if (time - m.at > SPECIAL_WINDOW.max) { this.marks.delete(k); this.#changed(); }
  }

  /** Polecenia dla bieżącego wyboru – do menu: { code, text (treść linii), name }. */
  menu() {
    const s = this.sel;
    if (s.start && s.end) {
      const parts = [s.start.id, s.end.id, ...(s.via ? [s.via.id] : [])].join(' ');
      const kinds = new Set(this.#routes(s.start.id, s.end.id, s.via?.id).map((r) => r.kind));
      const out = [];
      if (kinds.has('train')) out.push('POC');
      if (kinds.has('shunt')) out.push('MAN');
      out.push('PZA');
      return out.map((code) => ({ code, text: `${code} ${parts}`, name: byCode.get(code).name }));
    }
    const o = s.object;
    if (!o) return [];
    const kind = o.kind === 'derailer' ? 'point' : o.kind === 'end' ? 'block' : o.kind;
    if (kind === 'block' && !this.#exitOf(o.id)) return [];
    return EBI_COMMANDS.filter((c) => c.args[0] === kind && this.#applies(c, o)).map((c) => ({ code: c.code, text: `${c.code} ${o.id}`, name: c.name }));
  }

  /* ---------------- linia poleceń ---------------- */

  /**
   * Przyjęcie linii poleceń („Wykonaj” / Enter). Wynik: { ok, cmd } – polecenie dla `Simulation.execute`;
   * { ok, marked } – polecenie inicjujące; { ok, noop } – nic do zrobienia; { ok: false, reason } – odmowa.
   */
  submit(text) {
    const src = String(text).trim();
    const [codeRaw, ...args] = src.split(/\s+/);
    const code = (codeRaw || '').toUpperCase();
    const def = byCode.get(code);
    const refuse = (reason) => { this.log.note(this.ilk.time, `${src} – ${reason}`, 'refused'); return this.ilk.refuse(reason); };
    if (!src) return refuse('Linia poleceń jest pusta');
    if (!def) return refuse(`Nieznane polecenie ${codeRaw}`);
    const res = this.#build(def, args, refuse);
    if (res.ok) {
      this.log.note(this.ilk.time, src, 'cmd');
      this.sel = { start: null, end: null, via: null, object: null, candidates: [] };
      this.#changed();
    }
    return res;
  }

  #build(def, args, refuse) {
    const ilk = this.ilk;
    if (def.args[0] === 'route') {
      const [start, end, via] = [this.#id('signal', args[0]), this.#id('signal', args[1]) ?? this.#id('end', args[1]), this.#id('point', args[2])];
      if (!args[0] || !args[1]) return refuse(`${def.code}: podaj początek i koniec przebiegu`);
      if (!start) return refuse(`${def.code}: nieznany sygnalizator ${args[0]}`);
      if (!end) return refuse(`${def.code}: nieznany koniec przebiegu ${args[1]}`);
      if (args[2] && !via) return refuse(`${def.code}: nieznany element pośredni ${args[2]}`);
      if (def.code === 'PZA') {
        const act = [...ilk.active.values()].find((a) => a.route.start === start && (a.route.end.id === end || a.route.endButton === end));
        if (!act) return refuse(`PZA: brak nastawionego przebiegu od ${start} do ${end}`);
        return { ok: true, cmd: { type: 'release', signal: start, emergency: true } };
      }
      const kind = def.code === 'POC' ? 'train' : 'shunt';
      const routes = this.#routes(start, end, via).filter((r) => r.kind === kind);
      if (!routes.length) return refuse(`${def.code}: brak przebiegu ${kind === 'train' ? 'pociągowego' : 'manewrowego'} od ${start} do ${end}${via ? ` przez ${via}` : ''}`);
      // bez elementu pośredniego (albo gdy wskazuje kilka dróg) – droga zasadnicza: pierwsza w tablicy przebiegów
      return { ok: true, cmd: { type: 'route', id: routes[0].id } };
    }
    const [name] = args;
    if (!name) return refuse(`${def.code}: podaj nazwę obiektu`);
    const obj = this.#resolve(def.args[0], name);
    if (!obj) return refuse(`${def.code}: nieznany obiekt ${name}`);
    if (!this.#applies(def, obj)) return refuse(`${def.code} nie dotyczy obiektu ${name}`);
    switch (def.code) {
      case 'ITS': case 'ITO': return { ok: true, cmd: { type: 'close-section', section: obj.id, closed: def.code === 'ITS' } };
      case 'ZWP': case 'ZWM': {
        const plus = def.code === 'ZWP';
        return obj.kind === 'derailer'
          ? { ok: true, cmd: { type: 'derailer', id: obj.id, position: plus ? 'on' : 'off' } }
          : { ok: true, cmd: { type: 'point', id: obj.id, position: plus ? '+' : '-' } };
      }
      case 'ZWS': case 'ZWO': {
        const el = (obj.kind === 'derailer' ? ilk.derailers : ilk.points).get(obj.id);
        if (!!el.individualLock === (def.code === 'ZWS')) return { ok: true, noop: true };
        return { ok: true, cmd: { type: 'lock', id: obj.id, ...(obj.kind === 'derailer' ? { derailer: true } : {}) } };
      }
      case 'SES': case 'SEO': return { ok: true, cmd: { type: 'signal-stop', signal: obj.id, on: def.code === 'SES' } };
      case 'PZW': return { ok: true, cmd: { type: 'release', signal: obj.id } };
      case 'KZW': return { ok: true, cmd: { type: 'cancel-timed', signal: obj.id } };
      case 'SZI': {
        const sig = ilk.signals.get(obj.id);
        if (!sig.canSubstitute) return refuse(`Semafor ${obj.id} nie ma sygnału zastępczego`);
        this.marks.set(`signal:${obj.id}`, { code: 'SZI', at: ilk.time, color: def.mark });
        return { ok: true, marked: true };
      }
      case 'SZW': {
        const key = `signal:${obj.id}`;
        const m = this.marks.get(key);
        if (!m || m.code !== def.exec) return refuse(`SZW: najpierw polecenie inicjujące SZI ${obj.id}`);
        const age = ilk.time - m.at;
        if (age < SPECIAL_WINDOW.min) return refuse(`SZW: sprawdź zamarkowany obiekt – polecenie wykonania najwcześniej ${SPECIAL_WINDOW.min} s po SZI`);
        if (age > SPECIAL_WINDOW.max) { this.marks.delete(key); return refuse(`SZW: minęło ${SPECIAL_WINDOW.max} s od SZI – wyślij polecenie inicjujące ponownie`); }
        this.marks.delete(key);
        return { ok: true, cmd: { type: 'substitute', signal: obj.id } };
      }
      case 'SSS': case 'SSO': return { ok: true, cmd: { type: 'all-stop', on: def.code === 'SSS' } };
      case 'SZO': {
        const had = [...this.marks.keys()].filter((k) => this.marks.get(k).code === 'SZI');
        for (const k of had) this.marks.delete(k);
        return { ok: true, cmd: { type: 'substitute-off' } };
      }
      default:
        if (def.block) return { ok: true, cmd: { type: 'block', exit: this.#exitOf(obj.id), btn: def.block } };
        return refuse(`${def.code}: brak funkcji`);
    }
  }

  /** Czy polecenie dotyczy obiektu (np. SZI i SZW – tylko semafor). */
  #applies(def, obj) {
    if (def.args[0] === 'point') return obj.kind === 'point' || obj.kind === 'derailer';
    if (def.args[0] === 'signal') {
      const s = this.ilk.signals.get(obj.id);
      if (!s) return false;
      if (def.code === 'SZI' || def.code === 'SZW') return s.kind === 'semafor';
      return true;
    }
    return def.args[0] === obj.kind || (def.args[0] === 'block' && obj.kind === 'end');
  }

  /** Identyfikator obiektu rodzaju `kind` ze stacji dla nazwy wpisanej dowolną wielkością liter (albo undefined). */
  #id(kind, name) {
    return name == null ? undefined : this.names[kind].get(String(name).toUpperCase());
  }

  /** Nazwa z linii poleceń → obiekt oczekiwanego rodzaju (z identyfikatorem ze stacji). */
  #resolve(kind, name) {
    const as = (k, id) => (id ? { kind: k, id } : null);
    if (kind === 'section') return as('section', this.#id('section', name));
    if (kind === 'point') return as('point', this.#id('point', name)) || as('derailer', this.#id('derailer', name));
    if (kind === 'signal') return as('signal', this.#id('signal', name));
    if (kind === 'station') return this.stationNames.includes(name.toUpperCase()) ? { kind: 'station', id: name } : null;
    if (kind === 'block') return as('block', this.#id('end', name) ?? this.#id('exit', name));
    return null;
  }

  /** Wyjazd na szlak dla obiektu blokady: trójkąt końca toru na wyjeździe (np. kW) albo sam identyfikator wyjazdu. */
  #exitOf(name) {
    const exits = this.ilk.station?.exits || {};
    if (exits[name]) return name;
    const tile = this.ilk.topo.endButtons.get(name);
    if (!tile) return null;
    return Object.entries(exits).find(([, e]) => e.tile.x === tile.x && e.tile.y === tile.y)?.[0] ?? null;
  }

  /** Przebiegi od `start` do `end` (sygnalizator albo trójkąt końca toru), opcjonalnie przez zwrotnicę `via`. */
  #routes(start, end, via = null) {
    return [...this.ilk.routes.values()].filter((r) => r.start === start && (r.end.id === end || r.endButton === end)
      && (!via || r.points.some((p) => p.id === via)));
  }

  /** Elementy pośrednie: zwrotnice, które leżą tylko na części dróg – wskazanie jednej wybiera drogę alternatywną. */
  #distinguishing(routes) {
    const ids = [...new Set(routes.flatMap((r) => r.points.map((p) => p.id)))];
    return ids.filter((id) => routes.some((r) => !r.points.some((p) => p.id === id))).map((id) => ({ kind: 'point', id }));
  }

  /* ---------------- zdarzenia i alarmy (EventLog) ---------------- */

  get events() { return this.log.events; }
  alarmList() { return this.log.alarmList(); }
  ack(ids) { this.log.ack(ids); }
  ackAll() { this.log.ackAll(); }

  #changed() {
    this.bus.emit('armed', this.armed);
    this.bus.emit('console', { what: 'selection' });
  }
}
