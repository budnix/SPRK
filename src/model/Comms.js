import { Clock } from '../core/Clock.js';

/**
 * Łączność: telefonogramy do posterunków sąsiednich (wzory Ir-1, Dodatek 2) i radio z maszynistą.
 * Wiadomości przychodzące trafiają przez zdarzenie 'comms' na szynie; telefonogramy nadane automatycznie (rozmowy
 * przy sprawnej blokadzie w trybie `phoneRoutine: 'auto'`) – przez 'phone-out'.
 */
export const FORMULAS = [
  { id: 'ask-free', to: 'neighbour', text: (p) => `Czy droga dla pociągu nr ${p.nr} jest wolna?`, doc: 'Zapytanie o drogę przed wyprawieniem pociągu (wzór 1a)' },
  { id: 'free', to: 'neighbour', text: (p) => `Dla pociągu nr ${p.nr} droga jest wolna.`, doc: 'Pozwolenie – odpowiedź na zapytanie sąsiada (wzór 4a)' },
  { id: 'hold', to: 'neighbour', text: (p) => `Stój pociąg nr ${p.nr} – droga nie jest wolna.`, doc: 'Odmowa – wstrzymanie pociągu sąsiada (wzór 5a)' },
  { id: 'departed', to: 'neighbour', text: (p) => `Pociąg nr ${p.nr} odjechał o ${p.time}.`, doc: 'Zawiadomienie o odjeździe wyprawionego pociągu' },
  { id: 'arrived', to: 'neighbour', text: (p) => `Pociąg nr ${p.nr} przyjechał o ${p.time}.`, doc: 'Zawiadomienie o przyjeździe pociągu od sąsiada (wzór 14)' },
  { id: 'ask-arrived', to: 'neighbour', text: (p) => `Czy pociąg nr ${p.nr} przyjechał?`, doc: 'Pytanie o przyjazd naszego pociągu do sąsiada' },
  { id: 'driver-wait', to: 'driver', text: (p) => `Pociąg nr ${p.nr}, proszę czekać przed semaforem.`, doc: 'Radio: polecenie oczekiwania' },
  { id: 'shunt-permit', to: 'driver', text: (p) => `Skład nr ${p.nr}, zezwalam na jazdę manewrową – sygnalizator uszkodzony.`, doc: 'Radio: zezwolenie na jazdę manewrową obok uszkodzonego sygnalizatora (Ir-9 § 10 ust. 15)' },
];

/** Po ilu sekundach maszynista odpowiada na wezwanie radiowe (przyjęte). */
export const DRIVER_REPLY = 4;

export class Comms {
  constructor(sim) {
    this.sim = sim;
    this.bus = sim.bus;
    this.messages = [];
    this.time = 0;
    this.driverReported = new Set();
    this.bus.on('comms', (m) => this.#incoming(m));
    // polecenia dla maszynisty z zakładki Pociągi (tryb jazdy, zmiana czoła) – rozmowa radiowa (Traffic, zdarzenie 'driver')
    this.bus.on('driver', (d) => this.#driverTalk(d));
    // telefonogram nadany automatycznie (rozmowa przy sprawnej blokadzie) – do dziennika łączności
    this.bus.on('phone-out', (m) => {
      const msg = { dir: 'out', time: this.time, to: m.to, text: m.text, auto: true };
      this.messages.push(msg);
      this.bus.emit('comms-log', msg);
    });
  }

  #incoming(m) {
    const msg = { dir: 'in', time: m.time ?? this.time, from: m.from, kind: m.kind || 'info', text: m.text, exit: m.exit, nr: m.nr };
    if (msg.time > this.time) { (this.queue ??= []).push(msg); return; }
    this.messages.push(msg);
    this.bus.emit('comms-log', msg);
  }

  /** Wpis do dziennika łączności w chwili `msg.time` (teraz albo później – kolejka w `tick`, po kolei). */
  #at(msg) {
    if (msg.time > this.time || this.queue?.length) { (this.queue ??= []).push(msg); return; }
    this.messages.push(msg);
    this.bus.emit('comms-log', msg);
  }

  /**
   * Rozmowa radiowa dyżurnego z maszynistą przy poleceniu z zakładki Pociągi. Sposób prowadzenia rozmowy – Ir-5 (R-12)
   * §7–§8: wywołanie „Pociąg <nr>, tu <posterunek>”, „odbiór”, gdy oczekuje się odpowiedzi, „bez odbioru” na końcu,
   * meldunek potwierdzony słowami „meldunek zrozumiałem”. Treść poleceń i meldunku gotowości – przyjęta.
   */
  #driverTalk(d) {
    const st = this.sim.station.name, nr = d.nr, to = `maszynista poc. ${nr}`;
    const say = (text, after = 0) => this.#at({ dir: 'out', time: d.time + after, to, text, auto: after > 0, nr });
    const hear = (text, after, kind = 'info') => this.#at({ dir: 'in', time: d.time + after, from: to, kind, text, nr });
    if (d.order === 'shunt') {
      say(`Pociąg ${nr}, tu ${st}: koniec jazdy pociągowej, dalej jazda manewrowa – odbiór.`);
      hear(`Tu pociąg ${nr}, zrozumiałem – jazda manewrowa, bez odbioru.`, DRIVER_REPLY);
    } else if (d.order === 'train') {
      say(`Pociąg ${nr}, tu ${st}: koniec manewrów, dalej jazda pociągowa – odbiór.`);
      hear(`Tu pociąg ${nr}, zrozumiałem – jazda pociągowa, bez odbioru.`, DRIVER_REPLY);
    } else if (d.order === 'reverse') {
      say(`Pociąg ${nr}, tu ${st}: zmiana czoła, przejdź do drugiej kabiny i zgłoś gotowość – odbiór.`);
      hear(`Tu pociąg ${nr}, zrozumiałem – zmieniam kabinę, gotowość zgłoszę, bez odbioru.`, DRIVER_REPLY);
    } else if (d.order === 'ready') {
      const sig = d.signal ? this.sim.ilk.signals.get(d.signal) : null;
      const before = sig ? `, stoję przed ${sig.kind === 'semafor' ? 'semaforem' : 'tarczą manewrową'} ${sig.id}` : '';
      // meldunek gotowości – zakładka Łączność miga (rodzaj 'radio'), dyżurny potwierdza odbiór
      hear(`${st}, tu pociąg ${nr}: zmiana czoła zakończona${before}, gotów do jazdy – odbiór.`, 0, 'radio');
      say(`Tu ${st}, meldunek zrozumiałem.`, DRIVER_REPLY / 2);
    }
  }

  /** Formuły dostępne w tej chwili (parametry: kandydaci do numeru pociągu). */
  available() {
    return FORMULAS;
  }

  /** Wysłanie telefonogramu / komunikatu radiowego. */
  send(formulaId, params, opts = {}) {
    const f = FORMULAS.find((x) => x.id === formulaId);
    if (!f) return { ok: false, reason: 'Nieznana formuła' };
    const p = { ...params, time: Clock.format(this.time) };
    const text = f.text(p);
    const to = f.to === 'neighbour' ? this.sim.blocks.get(params.exit)?.neighbour : `maszynista poc. ${params.nr}`;
    this.messages.push({ dir: 'out', time: this.time, to, text, auto: !!opts.silent });
    this.bus.emit('comms-log', { dir: 'out', time: this.time, to, text, auto: !!opts.silent });
    const res = this.#handle(f, params);
    if (opts.silent) return res;
    if (!res.ok) {
      this.bus.emit('score', { time: this.time, code: 'comms-wrong', points: -5, msg: `Niewłaściwy telefonogram: „${text}” – ${res.reason}` });
      this.#incoming({ time: this.time + 3, from: to, kind: 'info', text: `Nie rozumiem. ${res.reason}.` });
    }
    return res;
  }

  #handle(f, p) {
    const b = this.sim.blocks.get(p.exit);
    const nr = String(p.nr);
    switch (f.id) {
      case 'ask-free': {
        if (!b) return { ok: false, reason: 'brak posterunku' };
        // pociąg do tej stacji sąsiedniej – także innym torem niż z rozkładu (jazda po torze lewym)
        const exits = this.sim.station.exits;
        const e = this.sim.traffic.timetable().find((x) => String(x.nr) === nr && x.to && (x.to === p.exit || exits[x.to]?.name === exits[p.exit]?.name) && x.train && !x.train.finished);
        if (!e) return { ok: false, reason: `pociąg nr ${nr} nie jest do wyprawienia do ${b.neighbour}` };
        return b.phoneAskNeighbour(nr);
      }
      case 'free': return b ? b.phoneAnswerFree(nr) : { ok: false, reason: 'brak posterunku' };
      case 'hold': return b ? b.phoneHold(nr) : { ok: false, reason: 'brak posterunku' };
      case 'departed': return b ? b.phoneReportDeparture(nr) : { ok: false, reason: 'brak posterunku' };
      case 'arrived': return b ? b.phoneReportArrival(nr) : { ok: false, reason: 'brak posterunku' };
      case 'ask-arrived': {
        if (!b) return { ok: false, reason: 'brak posterunku' };
        const r = b.phoneAskArrival(nr);
        if (!r.ok) return r;
        this.#incoming({ time: this.time + 6, from: b.neighbour, kind: 'info', text: r.arrived ? `Pociąg nr ${nr} przyjechał.` : `Pociąg nr ${nr} jeszcze nie przyjechał.` });
        return { ok: true };
      }
      case 'driver-wait': {
        const e = this.sim.traffic.timetable().find((x) => String(x.nr) === nr && x.train && !x.train.finished);
        if (!e) return { ok: false, reason: 'brak takiego pociągu' };
        this.#incoming({ time: this.time + 4, from: `maszynista poc. ${nr}`, kind: 'info', text: 'Zrozumiałem, czekam.' });
        return { ok: true };
      }
      case 'shunt-permit': return this.sim.traffic.shuntPermit(nr);
      default: return { ok: false, reason: 'formuła nieobsługiwana' };
    }
  }

  tick(time) {
    this.time = time;
    if (this.queue?.length) {
      const due = this.queue.filter((m) => m.time <= time);
      this.queue = this.queue.filter((m) => m.time > time);
      for (const m of due) { this.messages.push(m); this.bus.emit('comms-log', m); }
    }
    // Maszynista melduje przez radio po dłuższym postoju przed semaforem z usterką
    for (const e of this.sim.traffic.timetable()) {
      const tr = e.train;
      if (!tr || tr.finished || tr.v > 0 || !tr.stoppedAt || tr.stoppedAt.kind !== 'signal') continue;
      const sig = this.sim.ilk.signals.get(tr.stoppedAt.signal);
      if (!sig?.failed) continue;
      const key = `${e.nr}:${sig.id}`;
      if (this.driverReported.has(key)) continue;
      if (!tr.stoppedSince) tr.stoppedSince = time;
      if (time - tr.stoppedSince < 45) continue;
      this.driverReported.add(key);
      this.#incoming({ time, from: `maszynista poc. ${e.nr}`, kind: 'radio', nr: e.nr, text: `Stoję przed semaforem ${sig.id}, semafor wskazuje „Stój”. Proszę o sygnał zastępczy lub rozkaz pisemny.` });
      this.bus.emit('alarm', { type: 'radio', nr: e.nr });
    }
  }
}
