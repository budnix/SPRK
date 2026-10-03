import { Train, cabChangeTime, driverFactor } from './Train.js';
import { Clock } from '../core/Clock.js';
import { mixSeed } from '../core/Random.js';
import { Interlocking } from './Interlocking.js';
import { platformRanges } from '../tiles/platforms.js';
import { rootOf, stockFor, stockPlan } from './rollingStock.js';
import { trainRouteChains, entryRoutes, trainTrack } from './trainPaths.js';
import { setPhase } from './timetable/phase.js';
import { FAULTS } from './faults/types.js';
import { createEntry, shownTime } from './timetable/entry.js';
import { taskWaits, taskAlive } from './tasks/order.js';

/**
 * Od planowego odjazdu (przejazdu) do zjazdu ze stacji – pociąg „odjechał”, obsłużony – mija 1–4 min (zmierzone automatem
 * na wszystkich stacjach): pociąg, który wg planu i opóźnienia wniesionego z zewnątrz nie ma tylu sekund do końca zmiany,
 * nie mieści się w zmianie. Ta sama granica w ocenie (`Simulation`: bez kary „nieobsłużony”), w kontroli definicji
 * (`scenarioCheck.js`) i w werdykcie przebiegu (`scripts/check-scenario.mjs`).
 */
export const LATE_SLACK = 4 * 60;

/** Rozrzut miejsca zatrzymania czoła przy peronie [m]: czoło staje od 0 do tylu metrów przed końcem peronu –
 *  maszynista nie staje co do metra (przyjęte). */
export const STOP_SCATTER = 10;

/**
 * O ile metrów przed końcem peronu staje czoło pociągu `nr` w zmianie o ziarnie `seed`: 0…STOP_SCATTER, stałe dla tej
 * samej zmiany (powtórka), różne dla pociągów i zmian. Z mieszania ziarna i numeru – nie z generatora zmiany, żeby nie
 * przesuwać losowania opóźnień i usterek.
 */
export function stopScatter(seed, nr) {
  let h = mixSeed(Number(seed), nr, 0x9e3779b9);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0;
  return ((h >>> 8) % 10001) / 10000 * STOP_SCATTER;
}

/**
 * Ruch pociągów: rozkład jazdy, posterunki sąsiednie (AI), wprowadzanie pociągów
 * na pulpit, zajętość odcinków, dziennik ruchu.
 */
export class Traffic {

  constructor(station, ilk, blocks, bus, opts = {}) {
    this.station = station;
    this.ilk = ilk;
    this.blocks = blocks;
    this.bus = bus;
    this.trains = [];
    this.time = 0;
    this.rng = opts.rng || null;
    this.seed = opts.seed ?? 0;
    this.level = opts.level || null;
    // zasięg peronów przy torach – z układu stacji (ten sam peron, który rysuje widok); miejsce zatrzymania czoła
    this.platforms = platformRanges(station);
    const tt = opts.timetable || station.timetable;
    // tabor pociągów – raz na zmianę, dla całego rozkładu (ten sam pokazuje panel i z nim jedzie pociąg)
    const stock = stockPlan(tt, this.seed);
    this.entries = tt.map((t, i) => this.#prepare(t, i, stock.get(t)));
    // rozkład w kolejności czasu (przyjazd, a dla pociągów zaczynających bieg – odjazd), niezależnie od kolejności
    // w definicji stacji (tam pociągi bywają pogrupowane liniami, np. SKM osobno od dalekobieżnych)
    this.entries.sort((a, b) => (a.arrTime ?? a.depTime) - (b.arrTime ?? b.depTime));
    this.#applyDisruptions();
    const taskDefs = opts.tasks || station.tasks || [];
    this.tasks = taskDefs
      .filter((t) => this.entries.some((e) => String(e.nr) === String(t.unit)))
      .map((t) => ({ ...t, deadlineTime: Clock.parse(t.deadline), afterTime: t.after ? Clock.parse(t.after) : 0, done: false, failed: false, doneAt: null }))
      // godziny po północy (zapis „24:30” w danych zmiany przez północ) pokazuje się jak na zegarze
      .map((t) => ({ ...t, deadline: shownTime(t.deadline), ...(t.after ? { after: shownTime(t.after) } : {}) }));
    this.journal = [];
    this.orders = [];
    this.score = { onTime: 0, delayed: 0, totalDelayMin: 0 };
  }

  /**
   * Stojące pociągi, którym można wydać rozkaz pisemny, wraz z semaforem: najbliższym przed czołem albo – gdy pociąg
   * stanął za semaforem miniętym na „Stój” (`behind`) – tym miniętym.
   */
  standingTrains() {
    return this.entries
      .filter((e) => e.train && !e.train.finished && e.train.entered && e.train.v === 0)
      .map((e) => {
        const behind = e.train.stoppedAt?.kind === 'spad';
        return { nr: e.nr, name: e.name, signal: behind ? e.train.stoppedAt.signal : e.train.nextSignal(), behind, entry: e };
      });
  }

  /**
   * Dlaczego stojący pociąg nie jedzie (zakładka Pociągi) – kod przyczyny, bez tekstu (tekst daje widok przez t()):
   * { code, signal, neighbour? } albo null, gdy pociąg jedzie, zakończył bieg, ma jeszcze planowy postój albo przed nim
   * jest sygnał zezwalający. Kody: 'signal-failed' (sygnalizator bez sygnału – Sz / rozkaz), 'signal-stopped'
   * (zastopowany, SSS), 'route-setting' (przebieg w nastawianiu), 'no-route' (brak przebiegu od sygnalizatora),
   * odmowa blokady szlaku przebiegu wyjazdowego – kod z `LineBlock.gate` ('phone-ask', 'phone-sz', 'pwl',
   * 'no-permission', 'po-blocked', 'line-occupied', 'line-inbound', 'sbl-direction'), 'signal-stop' (przebieg
   * nastawiony, sygnał „Stój” z innej przyczyny – zajętość, zwrotnica).
   */
  waitReason(e, time = this.time) {
    const tr = e?.train;
    if (!tr || tr.finished || !tr.entered || tr.v > 0) return null;
    // zmiana czoła w toku – także pociąg, który zakończył bieg (zmienia czoło właśnie wtedy)
    if (tr.cabChange) return { code: 'cab-change', left: Math.max(0, Math.ceil(tr.cabChange.until - time)) };
    if (e.terminates && tr.hasStopped && tr.mode === 'train') return null;
    if (tr.state === 'dwell' && e.depTime != null && time < e.depTime) return null; // planowy postój do godziny odjazdu
    if (tr.atHalt) return null; // postój na przystanku (`halts`) – krótki, sam się kończy
    const signal = tr.stoppedAt?.kind === 'spad' ? null : tr.nextSignal();
    const sig = signal ? this.ilk.signals.get(signal) : null;
    if (!sig) return null;
    const proceed = tr.mode === 'shunt' ? Interlocking.isProceed(sig.aspect) : Interlocking.isTrainProceed(sig.aspect);
    if (proceed) return null;
    if (sig.failed) return { code: 'signal-failed', signal };
    if (sig.stopped || this.ilk.allStop) return { code: 'signal-stopped', signal };
    const set = this.ilk.routeFrom(signal);
    if (set?.state === 'setting') return { code: 'route-setting', signal };
    if (!set) {
      // przebiegu wyjazdowego nie da się nastawić przez blokadę szlaku pociągu (np. bez łączności i bez zapytania) –
      // to jest przyczyna, nie sam brak przebiegu
      const b = e.to && [...this.ilk.routes.values()].some((r) => r.kind === 'train' && r.start === signal && r.exit === e.to) ? this.blocks.get(e.to) : null;
      const g = b?.gate('route');
      return g && !g.ok && g.code ? { code: g.code, signal, neighbour: b.neighbour } : { code: 'no-route', signal };
    }
    const b = set.route.exit ? this.blocks.get(set.route.exit) : null;
    const g = b?.gate('signal', set.id);
    if (g && !g.ok && g.code) return { code: g.code, signal, neighbour: b.neighbour };
    return { code: 'signal-stop', signal };
  }

  /**
   * Szablon treści rozkazu pisemnego „S” (wg wzoru Ir-1): pozwolenie na przejazd obok
   * semafora wskazującego sygnał „Stój” z prędkością do 40 km/h do następnego semafora.
   */
  orderTemplate(nr, signalId, reason = 'usterki urządzeń srk', behind = false) {
    const st = this.station.name;
    if (behind) {
      return `Rozkaz pisemny „S”. Do pociągu nr ${nr}. Pociąg nr ${nr} zatrzymał się za semaforem ${signalId} na stacji ${st}, który wskazał sygnał „Stój” z powodu ${reason}. `
        + `Pociąg nr ${nr} ma pozwolenie na dalszą jazdę do następnego semafora z prędkością nieprzekraczającą 40 km/h. `
        + `Droga przebiegu jest przygotowana, zwrotnice zamknięte.`;
    }
    return `Rozkaz pisemny „S”. Do pociągu nr ${nr}. Semafor ${signalId} na stacji ${st} wskazuje sygnał „Stój” z powodu ${reason}. `
      + `Pociąg nr ${nr} ma pozwolenie na przejechanie obok semafora ${signalId} wskazującego sygnał „Stój” i jazdę do następnego semafora `
      + `z prędkością nieprzekraczającą 40 km/h. Droga przebiegu jest przygotowana, zwrotnice zamknięte.`;
  }

  /**
   * Wydanie rozkazu pisemnego „S”. Warunki (Ir-1, uproszczone):
   *  - pociąg stoi na stacji przed semaforem `signalId` wskazującym „Stój” albo – po minięciu go na „Stój” (semafor
   *    zgasł tuż przed pociągiem) – stoi za nim; wtedy rozkaz pozwala jechać dalej do następnego semafora,
   *  - droga jazdy do następnego semafora: zwrotnice utwierdzone w przebiegu lub zamknięte indywidualnie (Zz),
   *    wykolejnice zdjęte, odcinki wolne i nieutwierdzone w innym przebiegu,
   *  - wyjazd na szlak tylko z pozwoleniem blokady liniowej.
   */
  /** Przesunięcie terminu zadania (także napisu `deadline`, który pokazuje panel) i wpis w dzienniku z przyczyną. */
  #shiftTask(task, sec, why) {
    if (!(sec > 0)) return;
    task.deadlineTime += sec;
    task.shift = (task.shift || 0) + sec;
    task.deadline = Clock.format(task.deadlineTime);
    if (why) this.bus.emit('log', { time: this.time, level: 'info', msg: `Termin zadania „${task.id}” przesunięty o ${Math.round(sec / 60)} min – ${why}; nowy termin ${task.deadline}` });
    this.bus.emit('tasks', this.tasks);
  }

  /**
   * Zadanie manewrowe zablokowane usterką bez obejścia: każda droga składu na tor docelowy ma na drodze odcinek zajęty
   * z usterki (fałszywa zajętość, licznik osi), pękniętą szynę albo zwrotnicę z usterką napędu, która nie da się ustawić
   * z kontrolą. Droga to łańcuch do 3 przebiegów manewrowych od miejsca, gdzie skład stoi (przebieg od odcinka pod
   * składem albo z jego toru), po którym skład mieści się na torze docelowym: długi skład za krótkim odcinkiem toru przed
   * sygnalizatorem potrzebuje dalszego przebiegu (Szkolna: Tm1 → Tm2 kończy się na T2e, 180 m składu – dalej Tm2 → C2
   * przez T2). Bez takiej drogi – każdy przebieg na tor docelowy, jak dotąd. Usterka sygnalizatora ma obejście –
   * zezwolenie dyżurnego (Ir-9 § 10 ust. 15) – więc terminu nie przesuwa.
   */
  #taskBlocked(task, tr) {
    const ilk = this.ilk, time = this.time;
    const trackOf = (sid) => String(ilk.sections.get(sid)?.track ?? '');
    const here = String(this.#trackOf(tr) ?? ''), goal = String(task.toTrack);
    const occ = tr.occupiedSections();
    // skład jeszcze nie stoi na torze stacyjnym (np. pociąg czeka przed semaforem wjazdowym) – to nie droga manewru;
    // cały na torze docelowym – zadanie zaraz zaliczone
    if (!here || [...occ].every((sid) => trackOf(sid) === goal)) return false;
    const shunts = ilk.routeList().filter((r) => r.kind === 'shunt' && r.sections.length);
    const into = shunts.filter((r) => trackOf(r.sections.at(-1)) === goal);
    // miejsce na torze docelowym na drodze łańcucha (odcinki toru docelowego, każdy raz)
    const room = (path) => [...new Set(path.flatMap((r) => r.sections))].filter((sid) => trackOf(sid) === goal)
      .reduce((m, sid) => m + (ilk.sections.get(sid)?.length ?? 0), 0);
    const starts = shunts.filter((r) => occ.has(r.approach) || trackOf(r.approach) === here);
    const ways = trainRouteChains(shunts, starts, (r, path) => trackOf(r.sections.at(-1)) === goal && room(path) >= tr.length);
    const candidates = ways.length ? ways : into.map((r) => [r]);
    if (!candidates.length) return false;
    const routeBlocked = (r) => r.sections.some((sid) => { if (occ.has(sid)) return false; const s = ilk.sections.get(sid); return !!(s?.forced || s?.axleFault || s?.defect); })
      || [...r.points, ...r.flank].some((q) => { const p = ilk.points.get(q.id); return p && p.faultUntil > time && (p.position !== q.position || !p.control); });
    return candidates.every((path) => path.some(routeBlocked));
  }

  /**
   * Usterka na drodze toru planowego pociągu `e`, czynna między zgłoszeniem pociągu a jego przyjazdem (dyżurny decyduje
   * o torze wcześniej, niż pociąg przyjedzie): odcinki toru, przebiegi na niego od strony wjazdu (także wieloetapowe),
   * przebiegi z niego w stronę wyjazdu – odcinki (zajętość z usterki, licznik osi, pęknięta szyna), zwrotnice (napęd),
   * semafory przebiegów (usterka semafora; bez semafora wjazdowego – ten jest wspólny dla wszystkich torów).
   */
  #plannedTrackFault(e, t) {
    const ilk = this.ilk, T = String(e.track);
    const trackOf = (sid) => String(ilk.sections.get(sid)?.track ?? '');
    const sections = new Set([...ilk.sections.values()].filter((s) => String(s.track) === T).map((s) => s.id));
    const points = new Set(), signals = new Set();
    const add = (r, withSignal) => { for (const sid of r.sections) sections.add(sid); for (const p of r.points) points.add(p.id); if (withSignal) signals.add(r.start); };
    const train = ilk.routeList().filter((r) => r.kind === 'train');
    // wjazd: łańcuchy przebiegów od strony `from` (do 3 stopni) kończące się na torze planowym
    // (łańcuchy wspólne z kontrolą scenariusza: src/model/trainPaths.js)
    for (const path of trainRouteChains(train, entryRoutes(ilk, e.from, train), (r) => trackOf(r.sections.at(-1)) === T)) path.forEach((r, i) => add(r, i > 0));
    // wyjazd: przebiegi z toru planowego w stronę wyjazdu z rozkładu (do 3 stopni)
    for (const path of trainRouteChains(train, train.filter((r) => trackOf(r.approach) === T), (r) => !!e.to && r.exit === e.to)) path.forEach((r) => add(r, true));
    for (const sid of sections) if (ilk.sections.get(sid)?.defect) return true;
    const from = e.requestAt ?? t - 20 * 60;
    return (this.faultList?.() ?? []).some((f) => {
      if (!(f.active || f.done)) return false;
      const since = f.since ?? f.at;
      if (since > t || since + f.duration < from) return false;
      // usterka na drodze pociągu (rodzaj usterki: `blocksPath`, element: `target`)
      const kind = FAULTS[f.type];
      if (!kind?.blocksPath) return false;
      return ({ section: sections, point: points, signal: signals })[kind.target]?.has(f.target) ?? false;
    });
  }

  /**
   * Zezwolenie dyżurnego na jazdę manewrową obok uszkodzonego sygnalizatora (Ir-9 § 10 ust. 15–16, § 6 ust. 2 pkt 2):
   * przebieg manewrowy od tego sygnalizatora nastawiony, sygnalizator nie daje Ms2 / M2 z powodu usterki – zezwolenie
   * ustne albo przez radiotelefon, dla tego jednego przebiegu, jazda z prędkością manewrową. Przy sprawnym sygnalizatorze
   * zezwolenie daje się sygnałem – odmowa.
   */
  shuntPermit(nr) {
    const e = this.entry(nr);
    const tr = e?.train;
    if (!tr || tr.finished || !tr.entered) return { ok: false, reason: `skład nr ${nr} nie stoi na stacji` };
    if (tr.mode !== 'shunt') return { ok: false, reason: `pociąg nr ${nr} nie jest w jeździe manewrowej` };
    if (tr.v > 0.05) return { ok: false, reason: `skład nr ${nr} jest w ruchu` };
    // przebieg manewrowy czekający na ten skład: od sygnalizatora przed nim albo takiego, przed którym skład stoi
    const occ = tr.occupiedSections(), next = tr.nextSignal();
    const act = this.ilk.routesSet().find((x) => x.route.kind === 'shunt' && Interlocking.routeAhead(x.state) && (x.route.start === next || occ.has(x.route.approach)));
    if (!act) return { ok: false, reason: `przed składem nr ${nr} nie ma nastawionego przebiegu manewrowego` };
    const sig = this.ilk.signals.get(act.route.start);
    if (!sig?.failed) return { ok: false, reason: `sygnalizator ${act.route.start} jest sprawny – zezwolenie daje się sygnałem na sygnalizatorze` };
    tr.shuntPermit = { signal: sig.id, route: act.id };
    this.bus.emit('log', { time: this.time, level: 'warn', msg: `Zezwolenie na jazdę manewrową składu ${nr} obok uszkodzonego sygnalizatora ${sig.id} (przebieg ${act.id}, Ir-9 § 10 ust. 15)` });
    this.bus.emit('comms', { time: this.time + 4, from: `maszynista poc. ${nr}`, kind: 'radio', nr, text: `Zezwolenie przyjąłem. Jadę obok sygnalizatora ${sig.id} z prędkością manewrową.` });
    return { ok: true, signal: sig.id, route: act.id };
  }

  issueOrder({ nr, signal, text, reason }) {
    const e = this.entry(nr);
    if (!e?.train || e.train.finished || !e.train.entered) return { ok: false, reason: `Pociąg ${nr} nie stoi na stacji` };
    const tr = e.train;
    // rozkaz „S” dotyczy pociągu; skład manewrowy mija uszkodzony sygnalizator na zezwolenie dyżurnego (Ir-9 § 10 ust. 15)
    if (tr.mode === 'shunt') return { ok: false, reason: `Skład ${nr} jest w jeździe manewrowej – rozkaz „S” dotyczy pociągu; obok uszkodzonego sygnalizatora skład jedzie na zezwolenie dyżurnego (Łączność)` };
    if (tr.v > 0) return { ok: false, reason: `Pociąg ${nr} jest w ruchu – rozkaz doręcza się na postoju` };
    const behind = tr.stoppedAt?.kind === 'spad' && tr.stoppedAt.signal === signal; // stoi za semaforem miniętym na „Stój”
    const next = tr.nextSignal();
    if (!behind && next !== signal) return { ok: false, reason: `Pociąg ${nr} stoi przed ${next ?? 'brakiem semafora'}, nie przed ${signal}` };
    const sig = this.ilk.signals.get(signal);
    if (!sig || sig.kind !== 'semafor') return { ok: false, reason: `${signal} nie jest semaforem` };
    if (!behind && !Interlocking.isStop(sig.aspect)) return { ok: false, reason: `Semafor ${signal} nie wskazuje „Stój” – rozkaz zbędny` };
    if (tr.hasOrderFor(signal)) return { ok: false, reason: `Pociąg ${nr} ma już rozkaz na ${signal}` };
    // Droga jazdy za semaforem do następnego semafora; pociąg stojący za semaforem – od jego czoła
    const problems = [];
    const at = behind ? tr.headTile() : null;
    const path = at ? this.ilk.pathFrom(at.tile, at.outPort, at.inPort) : this.ilk.pathBeyond(signal);
    const loose = new Set(this.ilk.loosePoints(path)); // ta sama reguła co przy Sz
    for (const { id, trailing } of path.points) {
      const p = this.ilk.points.get(id);
      if (loose.has(id)) problems.push(`zwrotnica ${id} niezamknięta (Zz) ani nieutwierdzona`);
      // zwrotnica bez kontroli – dopiero po zabezpieczeniu na miejscu (Ie-10 §32)
      if (p.moving || (!p.control && !p.secured)) problems.push(`zwrotnica ${id} bez kontroli${p.moving ? '' : ' – zabezpiecz ją na miejscu'}`);
      if (trailing) problems.push(`zwrotnica ${id} w położeniu na rozprucie`);
    }
    for (const id of path.derailers) if (this.ilk.derailers.get(id).position !== 'off') problems.push(`wykolejnica ${id} nałożona`);
    for (const sid of path.sections) {
      const s = this.ilk.sections.get(sid);
      // zajętość z usterki (fałszywa, licznik osi) dyżurny sprawdza na miejscu – nie przeszkadza, uzasadnia rozkaz;
      // pociąg stojący za semaforem sam zajmuje początek tej drogi
      if (behind ? this.occupiedByOther(sid, e.nr) : s.physical) problems.push(`odcinek ${sid} zajęty`);
      if (s.route) {
        const held = this.ilk.routeInfo(s.route);
        if (held && held.route.start !== signal) problems.push(`odcinek ${sid} utwierdzony w przebiegu ${s.route}`);
      }
    }
    if (path.exit) {
      const g = this.blocks.get(path.exit)?.gate('substitute');
      if (g && !g.ok) problems.push(g.reason);
    }
    if (problems.length) return { ok: false, reason: `Rozkaz dla ${nr} na ${signal}: ${problems.join('; ')}` };
    const order = {
      id: this.orders.length + 1, time: this.time, nr: e.nr, signal, type: 'S',
      text: text || this.orderTemplate(e.nr, signal, reason || undefined, behind), reason: reason || '',
    };
    this.orders.push(order);
    this.ilk.holdPath(signal, path, 'S'); // zwrotnice drogi zostają w położeniu, dopóki pociąg ich nie minie
    const faultSpad = behind && !!tr.spadByFault;
    if (behind) tr.resumeAfterStop();
    else tr.orders.push({ signal, used: false, id: order.id });
    // semafor zgasł przed pociągiem z przyczyny po stronie urządzeń – rozkaz uzasadniony
    const justified = this.ilk.faultOnPath(signal, path) || faultSpad || (behind && !!(sig.route && this.ilk.routeFaultDrop(sig.route)));
    this.bus.emit('score', { time: this.time, code: 'order', points: justified ? 0 : -10, nr: e.nr, signal, msg: `Rozkaz pisemny „S” dla ${e.nr}${justified ? ' (uzasadniony usterką)' : ' bez usterki urządzeń'}` });
    this.bus.emit('comms', { time: this.time + 8, from: `maszynista poc. ${e.nr}`, kind: 'radio', nr: e.nr, text: behind ? `Rozkaz „S” nr ${order.id} przyjąłem. Jadę dalej do następnego semafora z prędkością do 40 km/h.` : `Rozkaz „S” nr ${order.id} przyjąłem. Jadę obok semafora ${signal} z prędkością do 40 km/h.` });
    this.bus.emit('log', { time: this.time, level: 'warn', msg: behind ? `Rozkaz pisemny „S” nr ${order.id} dla pociągu ${e.nr}: dalsza jazda zza semafora ${signal} (40 km/h)` : `Rozkaz pisemny „S” nr ${order.id} dla pociągu ${e.nr}: przejazd obok ${signal} (40 km/h)` });
    this.bus.emit('orders', this.orders);
    return { ok: true, order };
  }

  #prepare(t, i, rollingStock = null, extra = false) {
    return createEntry(t, { idx: i, station: this.station, rollingStock, extra });
  }

  /** Losowe opóźnienia pociągów od sąsiadów (poziom zakłóceń). */
  #applyDisruptions() {
    if (!this.rng || !this.level || !this.level.delayChance) return;
    for (const e of this.entries) {
      if (!e.from || e.delayIn) continue;
      if (this.rng.chance(this.level.delayChance)) this.setInboundDelay(e, this.rng.int(3, this.level.delayMax));
    }
  }

  /** Opóźnienie pociągu jeszcze u sąsiada (minuty) – przesuwa jego wyprawienie. */
  setInboundDelay(e, minutes) {
    e.delayIn = minutes;
    e.neighbourDep += minutes * 60;
    e.requestAt += minutes * 60;
    e.delay = minutes;
  }

  /** Zbiór odcinków zajętych przez pociągi (bez usterek). */
  currentOccupancy() {
    const occ = new Set();
    this._occBy = new Map();
    for (const tr of this.trains) {
      for (const s of tr.occupiedSections()) {
        occ.add(s);
        if (!this._occBy.has(s)) this._occBy.set(s, new Set());
        this._occBy.get(s).add(tr.nr);
      }
    }
    return occ;
  }

  /** Czy odcinek zajmuje inny tabor niż pociąg `nr` (stan z ostatniego kroku). */
  /**
   * Odległość od wejścia na kostkę `tile` (portem `inPort`) do najbliższego końca innego taboru na tej kostce albo null –
   * dojazd do taboru na torze zajętym. `from` – liczy się tylko tabor dalej niż `from` od wejścia (tabor przed czołem
   * składu, który sam stoi na tej kostce).
   */
  stockAt(tile, inPort, self, from = 0) {
    let best = null;
    for (const tr of this.trains) {
      if (tr === self || tr.finished) continue;
      for (const seg of tr.trail) {
        if (seg.tile !== tile) continue;
        const a = Math.max(0, tr.tail - seg.start), b = Math.min(seg.len, tr.head - seg.start);
        if (a >= b) continue;
        const lo = seg.inPort === inPort ? a : seg.len - b; // ten sam kierunek jazdy albo przeciwny
        if (lo + (b - a) <= from) continue; // tabor za czołem
        const off = Math.max(lo, from);
        if (best == null || off < best) best = off;
      }
    }
    return best;
  }

  occupiedByOther(sectionId, nr) {
    const s = this._occBy?.get(sectionId);
    return !!s && (s.size > 1 || !s.has(nr));
  }

  /**
   * Opóźnienie (s) składu, z którego powstaje pociąg `e` (`unit`), bez winy dyżurnego: opóźnienie składu od sąsiada
   * i czas usterek bez obejścia na drodze jego zadań manewrowych; pociąg bez `unit` – 0.
   */
  unitLag(e) {
    if (e.unit == null) return 0;
    const u = this.entries.find((x) => String(x.nr) === String(e.unit));
    return (u?.delayIn || 0) * 60 + this.tasks.filter((k) => String(k.unit) === String(e.unit)).reduce((a, k) => a + (k.faultShift || 0), 0);
  }

  /** Opóźnienie (s), które pociąg wnosi bez winy dyżurnego: od sąsiada i ze składu, z którego powstaje. */
  inboundLag(e) {
    return (e.delayIn || 0) * 60 + this.unitLag(e);
  }

  /** Planowa obsługa pociągu (odjazd, a bez odjazdu przyjazd) przesunięta o opóźnienie wniesione; null – bez planu. */
  expectedDone(e) {
    const plan = e.depTime ?? e.arrTime;
    return plan == null ? null : plan + this.inboundLag(e);
  }

  /**
   * Pociąg, którego nie dało się obsłużyć do chwili `end` przez opóźnienie wniesione z zewnątrz: ma takie opóźnienie,
   * a jego planowa obsługa przesunięta o nie wypada mniej niż `LATE_SLACK` przed `end`. Bez kary „nieobsłużony”.
   */
  lateFromOutside(e, end) {
    const done = this.expectedDone(e);
    return this.inboundLag(e) > 0 && done != null && done > end - LATE_SLACK;
  }

  /** Dodanie pociągu do rozkładu w trakcie zmiany (pociąg nadzwyczajny). */
  addTrain(def) {
    // tabor: pociąg ze składu innego (`unit`) – jak tamten; inaczej własne losowanie (tabor rozkładu się nie zmienia)
    const root = rootOf(def, this.entries);
    const stock = root !== def && root.rollingStock !== undefined ? root.rollingStock : stockFor(def, [def], this.seed);
    const e = this.#prepare(def, this.entries.length, stock, true);
    this.entries.push(e);
    this.entries.sort((a, b) => (a.arrTime ?? a.depTime) - (b.arrTime ?? b.depTime));
    this.bus.emit('timetable', this.entries);
    return e;
  }

  /** Aktualny rozkład z stanami (dla panelu bocznego). */
  timetable() {
    return this.entries;
  }

  /** Wpis rozkładu pociągu `nr` (numer jako liczba albo napis) albo null. */
  entry(nr) {
    return this.entries.find((x) => String(x.nr) === String(nr)) ?? null;
  }

  start(time) {
    this.time = time;
    // Pociągi stojące na stacji na początku zmiany
    for (const e of this.entries) {
      if (!e.from && e.startOn) this.#spawnStanding(e);
    }
  }

  #spawnStanding(e) {
    const secTiles = this.ilk.sections.get(e.startOn.section)?.tiles;
    if (!secTiles) return;
    const dirE = e.startOn.dir === 'E';
    const tiles = [...secTiles].sort((a, b) => (dirE ? a.x - b.x : b.x - a.x));
    const train = this.#makeTrain(e);
    // wybierz tyle kostek, ile potrzeba na długość pociągu (od czoła)
    let len = 0; const use = [];
    for (let i = tiles.length - 1; i >= 0 && len < train.length; i--) { use.unshift(tiles[i]); len += tiles[i]._len; }
    train.placeOnTrack(use, e.startOn.dir);
    train.hasStopped = true;
    e.train = train; setPhase(e, 'at-station');
    this.trains.push(train);
  }

  #makeTrain(e) {
    const train = new Train(e, this.ilk.topo, this.ilk, {
      lineSpeed: this.station.exits[e.to]?.lineSpeed ?? this.station.exits[e.from]?.lineSpeed ?? 100,
      inLineSpeed: this.station.exits[e.from]?.lineSpeed,
      onExit: (exitId, tr) => this.#onExit(e, exitId, tr),
      onEvent: (ev, tr, arg) => this.#onTrainEvent(e, ev, tr, arg),
      blockedBy: (sectionId) => this.occupiedByOther(sectionId, train.nr), // train.nr zmienia się przy przekazaniu składu
      platforms: this.platforms,
      stopShort: stopScatter(this.seed, e.nr),
      driver: driverFactor(this.seed, e.nr), // maszynista: hamowanie planowane, inne w każdym pociągu (powtarzalne)
      stockAt: (tile, inPort, from) => this.stockAt(tile, inPort, train, from),
      // tabor wpisu (ten sam pokazuje panel) – daje pociągowi przyspieszenie, hamowanie i prędkość pojazdu
      stock: e.rollingStock,
    });
    return train;
  }

  /** Czy skład wpisu `u` ma zadanie manewrowe w toku (niewykonane, nie przepadło, a poprzednie – nie przepadło). */
  #openTask(u) {
    return this.tasks.some((x) => String(x.unit) === String(u.nr) && taskAlive(this.tasks, x));
  }

  #onTrainEvent(e, ev, tr, arg) {
    const t = this.time;
    switch (ev) {
      case 'enter':
        setPhase(e, 'entering');
        this.bus.emit('log', { time: t, level: 'info', nr: e.nr, msg: `Pociąg ${e.nr} wjeżdża na stację od ${this.station.exits[e.from]?.name}` });
        break;
      case 'fullyIn':
        if (e.from) this.blocks.get(e.from)?.neighbourTrainArrived(tr);
        break;
      case 'halt':
        this.bus.emit('log', { time: t, level: 'info', nr: e.nr, msg: `Pociąg ${e.nr} – postój na przystanku ${arg}` });
        break;
      case 'arrive': {
        e.actualArr = t; setPhase(e, e.terminates ? 'ended' : 'at-station');
        const track = this.#trackOf(tr);
        e.actualTrack = track;
        e.delay = e.arrTime != null ? Math.round((t - e.arrTime) / 60) || 0 : 0;
        this.#journal(e, 'przyjazd', t, track);
        this.bus.emit('log', { time: t, level: e.delay > 2 ? 'warn' : 'info', nr: e.nr, msg: `Pociąg ${e.nr} przyjazd tor ${track}${e.delay > 0 ? `, opóźnienie ${e.delay} min` : ''}` });
        if (track && e.track && String(track) !== String(e.track)) {
          this.bus.emit('log', { time: t, level: 'warn', nr: e.nr, msg: `Pociąg ${e.nr} przyjęty na tor ${track} zamiast ${e.track}` });
          const plannedClosed = [...this.ilk.sections.values()].some((s) => s.closed && String(s.track) === String(e.track));
          // usterka urządzeń na drodze toru planowego (jego odcinki, przebieg wjazdowy na niego, wyjazd z niego) uzasadnia
          // inny tor – jak przy Sz; usterka gdzie indziej na stacji – nie (przyjęte)
          const fault = this.#plannedTrackFault(e, t);
          if (fault) this.bus.emit('log', { time: t, level: 'info', nr: e.nr, msg: `Zmiana toru pociągu ${e.nr} uzasadniona usterką urządzeń` });
          if (!plannedClosed && !fault && e.stop) this.bus.emit('score', { time: t, code: 'wrong-track', points: -5, nr: e.nr, msg: `Pociąg ${e.nr} przyjęty na tor ${track} zamiast planowego ${e.track}` });
        }
        break;
      }
      case 'depart': {
        e.actualDep = t; setPhase(e, 'departing');
        this.#journal(e, 'odjazd', t, e.actualTrack);
        this.bus.emit('log', { time: t, level: 'info', nr: e.nr, msg: `Pociąg ${e.nr} odjazd` });
        // Opóźnienie zawinione na stacji: odjazd później niż max(plan, przyjazd + postój); pociąg ze składu innego pociągu –
        // także bez minut, które skład stracił bez winy dyżurnego (opóźnienie od sąsiada, manewry zablokowane usterką)
        let earliest = Math.max(e.depTime ?? 0, (e.actualArr ?? 0) + (e.dwell ?? 40));
        earliest += this.unitLag(e);
        const late = Math.round((t - earliest) / 60);
        if (late >= 2) this.bus.emit('score', { time: t, code: 'late-depart', points: -late, nr: e.nr, msg: `Pociąg ${e.nr} przetrzymany na stacji ${late} min` });
        else if (e.depTime != null && t - e.depTime <= 60) this.bus.emit('score', { time: t, code: 'punctual', points: 5, nr: e.nr, msg: `Pociąg ${e.nr} wyprawiony punktualnie` });
        break;
      }
      case 'entry-signal': {
        // przejazd „Stój” na semaforze wjazdowym z przyczyny po stronie urządzeń (jak przy karze za spad niżej)
        const sig = !arg.onSignal ? this.ilk.signals.get(arg.signal) : null;
        const faultDrop = !!sig?.route && this.ilk.routeFaultDrop(sig.route);
        const overrun = !!sig && !arg.byOrder && !Interlocking.isTrainProceed(sig.aspect) && (!!sig.failed || faultDrop);
        if (e.from) this.blocks.get(e.from)?.entryPassed(arg.onSignal, overrun);
        break;
      }
      case 'spad': {
        // pociąg przejechał semafor „Stój” – sygnał zmieniony bliżej niż droga hamowania (odwołanie, SSS; usterka semafora)
        const sig = this.ilk.signals.get(arg);
        this.bus.emit('log', { time: t, level: 'alarm', nr: e.nr, msg: `Pociąg ${e.nr} przejechał semafor ${arg} wskazujący „Stój” – hamowanie nagłe` });
        this.bus.emit('alarm', { type: 'spad', nr: e.nr, signal: arg });
        // bez kary, gdy semafor zgasł z przyczyny po stronie urządzeń: usterka semafora albo – przy nastawionym
        // przebiegu – zajętość odcinka bez taboru lub utrata kontroli zwrotnicy
        const faultDrop = !!sig?.route && this.ilk.routeFaultDrop(sig.route);
        tr.spadByFault = !!(sig?.failed || faultDrop); // rozkaz „S” zza semafora uzasadniony także po naprawie
        if (!sig?.failed && !faultDrop) this.bus.emit('score', { time: t, code: 'spad', points: -20, nr: e.nr, msg: `Sygnał „Stój” na ${arg} podany przed pociągiem ${e.nr} bliżej niż droga hamowania` });
        break;
      }
      case 'cab-ready':
        // maszynista w drugiej kabinie – meldunek gotowości radiem (Comms), z sygnalizatorem przed nowym czołem
        if (!arg?.quiet) this.bus.emit('driver', { time: t, nr: e.nr, order: 'ready', signal: tr.nextSignal() });
        break;
      case 'order-used':
        this.bus.emit('log', { time: t, level: 'info', nr: e.nr, msg: `Pociąg ${e.nr} minął semafor „Stój” na rozkaz pisemny (40 km/h)` });
        break;
      case 'stop':
        if (tr.stoppedAt?.kind === 'signal') {
          this.bus.emit('log', { time: t, level: 'info', nr: e.nr, msg: `Pociąg ${e.nr} zatrzymany przed ${tr.stoppedAt.signal}` });
          tr.stoppedSince = t;
        }
        break;
      case 'leave': {
        setPhase(e, 'departed');
        // blokada szlaku, na który pociąg wjechał – nie zawsze szlaku z rozkładu (np. jazda po torze lewym po Zk)
        const exitId = typeof arg === 'string' ? arg : e.to;
        e.actualExit = exitId;
        if (exitId) this.blocks.get(exitId)?.trainDeparted(tr);
        if (!e.stop && e.arrTime != null) {
          const late = Math.round((t - e.arrTime) / 60) - (e.delayIn || 0);
          if (late >= 3) this.bus.emit('score', { time: t, code: 'late-pass', points: -late, nr: e.nr, msg: `Pociąg ${e.nr} (przelot) opóźniony na stacji o ${late} min` });
          else this.bus.emit('score', { time: t, code: 'punctual', points: 5, nr: e.nr, msg: `Pociąg ${e.nr} przepuszczony punktualnie` });
        }
        if (!e.stop && e.arrTime != null && e.actualArr == null) {
          // przelot – czas przejazdu liczony przy wyjeździe
          e.actualArr = t; e.delay = Math.round((t - e.arrTime) / 60) || 0;
          this.#journal(e, 'przejazd', t, this.#trackOf(tr) || e.actualTrack);
        }
        break;
      }
      default:
    }
  }

  #trackOf(tr) {
    return trainTrack(this.ilk, tr);
  }

  #onExit(e, exitId, tr) {
    setPhase(e, 'at-neighbour');
    const delay = (e.depTime != null && e.actualDep != null ? Math.round((e.actualDep - e.depTime) / 60) : e.delay) || 0;
    e.delay = delay;
    if (delay <= 2) this.score.onTime++; else { this.score.delayed++; this.score.totalDelayMin += delay; }
    this.blocks.get(exitId)?.trainArrivedAtNeighbour(tr);
    this.trains = this.trains.filter((x) => x !== tr);
    this.bus.emit('log', { time: this.time, level: 'info', nr: e.nr, msg: `Pociąg ${e.nr} przybył do ${this.station.exits[exitId].name}` });
    this.bus.emit('timetable', this.entries);
  }

  #journal(e, kind, time, track) {
    this.journal.push({ nr: e.nr, kind, time, track, plan: kind === 'odjazd' ? e.depTime : e.arrTime });
    this.bus.emit('timetable', this.entries);
  }

  tick(dt, time) {
    this.time = time;
    // Sąsiedzi: żądania pozwolenia i wyprawianie pociągów
    for (const e of this.entries) {
      if (!e.from || e.dispatched) continue;
      const block = this.blocks.get(e.from);
      if (!block) continue;
      if (e.delayIn && !e.announced && time >= (e.arrTime ?? e.depTime) - 12 * 60) {
        e.announced = true;
        this.bus.emit('comms', { time, from: block.neighbour, kind: 'info', text: `Pociąg nr ${e.nr} opóźniony około ${e.delayIn} min.` });
        this.bus.emit('log', { time, level: 'warn', nr: e.nr, msg: `${block.neighbour}: pociąg ${e.nr} opóźniony ok. ${e.delayIn} min` });
      }
      // zgłoszenie przepadło przy zmianie trybu blokady (usterka / naprawa) – sąsiad zgłasza pociąg od nowa
      if (e.requested && !block.neighbourRequestAlive(e.nr)) { e.requested = false; e.waitLogged = false; setPhase(e, 'expected'); this.bus.emit('timetable', this.entries); }
      if (!e.requested && time >= e.requestAt) {
        // Jeden pociąg naraz na szlaku – żądanie, gdy blokada wolna
        const earlier = this.entries.some((o) => o !== e && o.from === e.from && !o.dispatched && o.requestAt < e.requestAt);
        if (!earlier && block.neighbourRequests(e.nr)) { e.requested = true; setPhase(e, 'permission-requested'); this.bus.emit('timetable', this.entries); }
      }
      if (e.requested && time >= e.neighbourDep && block.canNeighbourDispatch(e.nr)) {
        e.dispatched = true;
        const train = this.#makeTrain(e);
        train.placeOnLine(e.from, this.station.exits[e.from].lineLength ?? 3000);
        e.train = train; setPhase(e, 'on-line');
        this.trains.push(train);
        block.neighbourTrainEntered(train);
        this.bus.emit('timetable', this.entries);
      }
      if (e.requested && !e.dispatched && time > e.neighbourDep + 60 && !e.waitLogged) {
        e.waitLogged = true;
        this.bus.emit('log', { time, level: 'warn', nr: e.nr, msg: `${block.neighbour}: pociąg ${e.nr} czeka na pozwolenie na wyprawienie (Poz)` });
      }
    }
    // Pociągi tworzone ze składu innego pociągu (np. zdawczy powrotny)
    for (const e of this.entries) {
      if (!e.unit || e.train || e.attached) continue;
      if (time < e.depTime - 15 * 60) continue;
      const u = this.entries.find((x) => String(x.nr) === String(e.unit));
      const tr = u?.train;
      // przekazanie dopiero, gdy skład stoi w trybie jazdy pociągowej – nie w trakcie manewrów (nie wymuszamy trybu)
      if (!tr || tr.finished || !tr.entered || tr.v > 0 || tr.mode !== 'train') continue;
      // ani gdy skład ma jeszcze zadanie manewrowe (niewykonane, w terminie) – dyżurny najpierw je wykonuje albo zadanie
      // przepada; inaczej opóźniony skład przechodziłby w pociąg przy przyjeździe, zanim dyżurny zdąży go przestawić.
      // Zadanie wstrzymane usterką bez obejścia (termin się przesuwa) nie blokuje – inaczej skład czekałby bez końca
      if (!tr.faultBlocked && this.#openTask(u)) continue;
      // pociąg, który przyjeżdża ze szlaku, musi najpierw dojechać – postój przed semaforem wjazdowym to nie przyjazd
      if (u.from && u.actualArr == null) continue;
      e.attached = true; e.train = tr;
      setPhase(u, 'handed-over', { nr: e.nr }); u.train = null;
      tr.def = e; tr.nr = e.nr; tr.mode = 'train'; tr.hasStopped = true; tr.state = 'stopped';
      // nowy pociąg rusza dopiero na sygnał semafora przed sobą – nie na zezwoleniu pociągu, którym skład przyjechał
      tr.clearAuthority();
      tr.applyDynamics(e); tr.holdUntil = e.depTime; tr.orders = []; // tabor ten sam (skład), wpis nowy – np. inna masa
      tr.onExit = (exitId, t) => this.#onExit(e, exitId, t);
      tr.onEvent = (ev, t, ...rest) => this.#onTrainEvent(e, ev, t, ...rest);
      setPhase(e, 'at-station');
      this.bus.emit('log', { time, level: 'info', nr: e.nr, unit: u.nr, msg: `Skład pociągu ${u.nr} przekazany jako pociąg ${e.nr} (odjazd ${e.dep})` });
      this.bus.emit('timetable', this.entries);
    }
    // Pociągi
    for (const tr of this.trains) tr.tick(dt, time);
    // Zadania manewrowe
    for (const task of this.tasks) {
      if (task.done || task.failed) continue;
      // kolejność zadań (np. odstawić, potem podstawić): zadanie czeka na poprzednie, ale termin biegnie – zadanie po
      // poprzednim, które przepadło, też przepada (wcześniej zostawało w toku do końca zmiany)
      const waiting = taskWaits(this.tasks, task);
      const u = this.entries.find((x) => String(x.nr) === String(task.unit));
      const tr = u?.train || this.entries.find((x) => String(x.unit) === String(task.unit))?.train;
      // termin przesuwa się o czas, którego dyżurny nie mógł wykorzystać (przyjęte): opóźnienie składu od sąsiada
      // i usterka bez obejścia na drodze manewru (zwrotnica bez kontroli, zajętość z usterki, licznik osi, pęknięta szyna)
      // opóźnienie od sąsiada – termin przesuwa się, gdy sąsiad je zgłasza (12 min przed planowym przyjazdem), najpóźniej
      // przy przyjeździe; tylko w przód (dyżurny nie traci już podanego terminu)
      const known = u && (u.actualArr != null || time >= (u.arrTime ?? u.depTime) - 12 * 60);
      if (known && u.delayIn > (task.inboundShifted || 0)) {
        this.#shiftTask(task, (u.delayIn - (task.inboundShifted || 0)) * 60, `opóźnienie składu ${u.nr} od sąsiada`);
        task.inboundShifted = u.delayIn;
      }
      const blocked = !waiting && time >= task.afterTime && tr && !tr.finished && tr.entered && this.#taskBlocked(task, tr);
      if (tr && !waiting) tr.faultBlocked = !!blocked; // skład stoi przez usterkę bez obejścia – nie „przetrzymany”
      if (blocked) {
        task.blockedFor = (task.blockedFor || 0) + dt; task.faultShift = (task.faultShift || 0) + dt;
        this.#shiftTask(task, dt, null);
        // zadanie czekające na to (np. „podstaw” po „odstaw”) zaczyna się później o tyle samo
        for (const next of this.tasks) if (next.afterTask === task.id && !next.done && !next.failed) this.#shiftTask(next, dt, null);
      }
      else if (task.blockedFor) {
        this.bus.emit('log', { time, level: 'info', msg: `Termin zadania „${task.id}” przesunięty o ${Math.round(task.blockedFor / 60)} min – usterka bez obejścia na drodze manewru; nowy termin ${task.deadline}` });
        task.blockedFor = 0;
      }
      if (!waiting && time >= task.afterTime && tr && !tr.finished && tr.entered && tr.v === 0) {
        const secs = [...tr.occupiedSections()].map((sid) => this.ilk.sections.get(sid));
        if (secs.length && secs.every((sec) => String(sec.track) === String(task.toTrack))) {
          task.done = true; task.doneAt = time;
          const late = time > task.deadlineTime;
          this.bus.emit('score', { time, code: 'task', points: late ? 0 : 10, task: task.id, nr: task.unit, msg: `Zadanie manewrowe: ${task.text}${late ? ' (po terminie)' : ''}` });
          this.bus.emit('log', { time, level: 'info', nr: task.unit, msg: `Zadanie wykonane: skład ${task.unit} na torze ${task.toTrack}` });
          this.bus.emit('tasks', this.tasks);
        }
      }
      if (!task.done && time > task.deadlineTime + 10 * 60) {
        task.failed = true;
        this.bus.emit('score', { time, code: 'task-failed', points: -10, task: task.id, nr: task.unit, msg: `Zadanie manewrowe niewykonane w terminie: ${task.text}` });
        this.bus.emit('tasks', this.tasks);
      }
    }
    // Zajętość
    this.ilk.updateOccupancy(this.currentOccupancy());
    // Stan rozkładu
    for (const e of this.entries) {
      if (e.train && !e.train.finished) {
        if (e.phase === 'departed') continue; // na szlaku do sąsiada – etap zostaje (nie „jedzie”)
        if (!e.actualTrack || (e.unit && e.train.v === 0)) { const tr = this.#trackOf(e.train); if (tr) e.actualTrack = tr; }
        const st = e.train.state;
        const ended = e.terminates && e.actualArr != null; // pociąg zakończył bieg – dalej tylko manewry
        if (ended) setPhase(e, st === 'moving' ? 'shunting' : 'ended');
        else if (st === 'dwell') setPhase(e, e.train.atHalt ? 'at-halt' : 'dwell', { halt: e.train.atHalt });
        else if (st === 'stopped' && e.train.stoppedAt?.kind === 'signal') setPhase(e, 'held', { signal: e.train.stoppedAt.signal });
        else if (st === 'moving' && e.train.entered) setPhase(e, e.train.mode === 'shunt' ? 'shunting' : 'running');
        if (e.train.state === 'dwell' && !e.train.atHalt && e.depTime != null && time > e.depTime + 60) {
          e.delay = Math.round((time - e.depTime) / 60);
        }
        const waitingForDep = e.depTime != null && time < e.depTime + 240; // skład czeka na planowy odjazd – to nie przetrzymanie
        if (!ended && !waitingForDep && !e.train.faultBlocked && st === 'stopped' && e.train.stoppedAt?.kind === 'signal' && e.train.stoppedSince && !e.holdScored && time - e.train.stoppedSince > 240) {
          e.holdScored = true;
          this.bus.emit('score', { time, code: 'held', points: -5, nr: e.nr, signal: e.train.stoppedAt.signal, msg: `Pociąg ${e.nr} przetrzymany przed ${e.train.stoppedAt.signal} ponad 4 min` });
        }
      }
    }
  }

  /**
   * Stojący pociąg zakończony – przełącz w tryb manewrowy (jazda za Ms2). Polecenie i potwierdzenie maszynisty idą przez
   * radio (zdarzenie 'driver' → Comms); `quiet` – bez rozmowy (automat innego okręgu). W czasie zmiany czoła – false
   * (maszynisty nie ma w kabinie).
   */
  toShunting(nr, { quiet = false } = {}) {
    const e = this.entry(nr);
    if (!e?.train || e.train.cabChange) return false;
    if (e.train.v > 0) { this.bus.emit('log', { time: this.time, level: 'warn', msg: `Skład ${nr} jeszcze jedzie – tryb zmienia się po zatrzymaniu` }); return false; }
    if (e.train.mode !== 'shunt' && !quiet) this.bus.emit('driver', { time: this.time, nr: e.nr, order: 'shunt' });
    e.train.mode = 'shunt';
    e.train.clearAuthority();
    e.train.def.stopCancelled = true; // postój przy peronie już nie dotyczy składu w manewrach (definicja zostaje)
    e.train.state = 'moving';
    e.train.vmax = 25 / 3.6;
    return true;
  }

  /** Skład manewrowy z powrotem w tryb jazdy pociągowej (po podstawieniu na tor); radio i `quiet` – jak `toShunting`. */
  toTrainMode(nr, { quiet = false } = {}) {
    const e = this.entry(nr);
    if (!e?.train || e.train.cabChange) return false;
    if (e.train.v > 0) { this.bus.emit('log', { time: this.time, level: 'warn', msg: `Skład ${nr} jeszcze jedzie – tryb zmienia się po zatrzymaniu` }); return false; }
    if (e.train.mode !== 'train' && !quiet) this.bus.emit('driver', { time: this.time, nr: e.nr, order: 'train' });
    e.train.mode = 'train';
    e.train.clearAuthority(); // pociąg utworzony ze składu rusza dopiero na sygnał semafora
    e.train.applyDynamics(e);
    e.train.state = 'stopped';
    return true;
  }

  /**
   * Zmiana czoła stojącego składu: maszynista przechodzi do drugiej kabiny (`cabChangeTime`, 45–75 s) i melduje gotowość;
   * polecenie, odpowiedź i meldunek idą przez radio (zdarzenie 'driver' → Comms). `quiet` – bez rozmowy (automat innego
   * okręgu). False, gdy skład jedzie albo zmiana już trwa – bez nowego polecenia (automat pyta w każdym kroku).
   */
  reverseTrain(nr, { quiet = false } = {}) {
    const e = this.entry(nr);
    if (!e?.train) return false;
    const duration = cabChangeTime(this.seed, e.nr);
    if (!e.train.startCabChange(this.time, duration, quiet)) return false;
    if (!quiet) this.bus.emit('driver', { time: this.time, nr: e.nr, order: 'reverse', duration });
    return true;
  }
}
