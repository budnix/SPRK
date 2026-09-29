/**
 * Okno zdarzeń i alarmów stanowiska komputerowego (bez DOM) – wspólne dla protokołów obsługi, które je mają
 * (EBILock 950: osobne okno, MOR-3: okno pod obrazem). Zdarzenia: wpisy dziennika i polecenia wysłane albo odrzucone;
 * alarmy: usterki urządzeń (aktywne, dopóki trwają) i rozprucie zwrotnicy (dopóki zwrotnica nie odzyska kontroli),
 * potwierdzane przez dyżurnego. Zmiana listy – zdarzenie `console` na szynie ({ what: 'events' | 'alarms' }).
 */
const MAX_EVENTS = 200;

export class EventLog {
  #nextAlarm = 1;
  #lastAlarmText = '';

  constructor(ilk, bus) {
    this.ilk = ilk;
    this.bus = bus;
    this.events = [];   // { time, text, kind: 'log' | 'cmd' | 'refused' }
    this.alarms = [];   // { id, time, text, acked, active() }
    bus.on('log', (e) => {
      if (e.level === 'alarm') this.#lastAlarmText = e.msg;
      this.note(e.time, e.msg, 'log');
    });
    bus.on('alarm', (a) => this.#alarm(a));
  }

  /** Wpis zdarzenia (np. polecenie wysłane albo odrzucone). */
  note(time, text, kind) {
    this.events.push({ time, text, kind });
    if (this.events.length > MAX_EVENTS) this.events.shift();
    this.bus.emit('console', { what: 'events' });
  }

  #alarm(a) {
    let active;
    if (a.type === 'fault') active = () => !!a.fault.active;
    else if (a.type === 'rozprucie') active = () => this.ilk.alarms.has(`rozprucie:${a.id}`);
    else return; // żądanie blokady, łączność – zdarzenia, nie alarmy urządzeń
    this.alarms.push({ id: this.#nextAlarm++, time: this.ilk.time, text: this.#lastAlarmText || a.type, acked: false, active });
    this.bus.emit('console', { what: 'alarms' });
  }

  /** Lista alarmów do okna: aktywne / ustąpione, potwierdzone / niepotwierdzone. */
  alarmList() {
    return this.alarms.map((x) => ({ id: x.id, time: x.time, text: x.text, acked: x.acked, active: x.active() }));
  }

  ack(ids) {
    const set = new Set([ids].flat());
    for (const x of this.alarms) if (set.has(x.id)) x.acked = true;
    this.bus.emit('console', { what: 'alarms' });
  }

  ackAll() {
    for (const x of this.alarms) x.acked = true;
    this.bus.emit('console', { what: 'alarms' });
  }
}
