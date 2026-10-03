import { Clock } from '../core/Clock.js';
import { Interlocking } from './Interlocking.js';
import { entryPath, routeEndTrack, exitApproach, entryRoutes, trainTrack } from './trainPaths.js';

/**
 * Wynik kroku automatu przy pociągu, który kończy jego czynności na ten takt: `step` – krok, `reason` – kod powodu
 * (dane, nie tekst), `acted` – krok wydał polecenie, reszta – szczegóły (np. `route`). Krok bez nic do zrobienia
 * zwraca null i kolejka idzie dalej.
 */
const done = (step, reason, acted = false, extra = {}) => ({ step, stop: true, acted, reason, ...extra });
/** Wynik kroku, który wydał polecenie, ale nie kończy czynności przy pociągu (Sz przy wyjeździe, prośba o szlak). */
const noted = (step, reason, extra = {}) => ({ step, stop: false, acted: true, reason, ...extra });

/**
 * Plan automatu przy pociągu – jego własne notatki, nie pola wpisu rozkładu: `entry` – dalsze stopnie wjazdu
 * wieloetapowego przed pociągiem (id przebiegów), `via` – semafor pośredni wyjazdu dwustopniowego, `accept` –
 * wykonywane polecenie dyżurnego „przyjąć pociąg”. Jeden plan na pociąg (kluczem jest wpis rozkładu), wspólny dla
 * automatów tej samej zmiany: na stacji z okręgami pociąg przechodzi od automatu do automatu.
 */
const PLANS = new WeakMap();
const planOf = (e) => { let plan = PLANS.get(e); if (!plan) PLANS.set(e, plan = { entry: null, via: null, accept: null }); return plan; };

/**
 * Automatyczny operator okręgu nastawczego (nastawniczy / dyżurny ruchu sterowany przez program).
 *
 * Obsługuje w swoim okręgu: pozwolenia i bloki końcowe, zapowiadanie telefoniczne przy usterce,
 * przebiegi wjazdowe i wyjazdowe, zadania manewrowe, składy przekazane.
 *
 * Tryby:
 *  - `district: null`      – cała stacja (dyżurny automatyczny, używany w testach),
 *  - `role: 'executive'`   – nastawnia wykonawcza: wykonuje tylko polecenia dyżurnego (gracza) z `sim.commands`,
 *  - `role: 'dispatcher'`  – dyżurny dysponujący (automat): sam decyduje w swoim okręgu i wydaje polecenia graczowi
 *                            (nastawni wykonawczej) dla ruchu w jego okręgu.
 */
export class AutoOperator {
  constructor(sim, { district = null, role = 'full', playerDistrict = null, delay = 0, trackFor = null } = {}) {
    this.sim = sim;
    this.trackFor = trackFor;      // opcjonalny wybór toru wjazdu (testy)
    this.district = district;
    this.role = role;
    this.playerDistrict = playerDistrict;
    this.delay = delay;            // opóźnienie reakcji (s) – realizm
    this.lastAction = -Infinity;
    this.issued = new Set();       // polecenia wydane graczowi (klucze)
    this.stuckSince = new Map();   // przebieg, który nie rozwiązał się za pociągiem → od kiedy
    this.reports = new Map();      // numer pociągu → wynik ostatniego taktu przy tym pociągu (`report`)
  }

  /**
   * Co automat zrobił przy pociągu `nr` w ostatnim swoim takcie – do diagnozy i testów: `{ step, stop, acted, reason,
   * … }` ostatniego kroku, który miał coś do powiedzenia, albo null (nic do zrobienia, pociągu jeszcze nie ma).
   * Kroki (`step`): written-order, exit-substitute, entry-stage, entry, shunt, line-request, exit. Powody (`reason`):
   * route-set, refused (z `route`), on-its-way, train-ahead, no-command, opposing-train, no-route, in-place, no-path,
   * reverse, to-train-mode, too-early, staged, line-block (z `code`), no-block, order-issued, substitute-signal,
   * line-asked. To dane dla narzędzi – działanie gry od nich nie zależy.
   */
  report(nr) {
    return this.reports.get(String(nr)) ?? null;
  }

  /** Plan automatu przy pociągu `nr` – do diagnozy i testów: `{ entry, via, accept }` (kopia) albo null. */
  plan(nr) {
    const e = this.sim.traffic.timetable().find((x) => String(x.nr) === String(nr));
    if (!e) return null;
    const plan = planOf(e);
    return { entry: plan.entry ? [...plan.entry] : null, via: plan.via, accept: plan.accept ? { kind: plan.accept.kind, track: plan.accept.track ?? null } : null };
  }

  /** Rozmowa radiowa z maszynistą przy zmianie trybu i czoła: automat okręgu obok gracza rozmawia bez dziennika gracza. */
  get #talk() {
    return { quiet: !!this.district };
  }

  #inDistrict(signalId) {
    if (!this.district) return true;
    return this.sim.districtOf(signalId) === this.district;
  }

  #exitInDistrict(exitId) {
    if (!this.district) return true;
    return this.sim.exitDistrict(exitId) === this.district;
  }

  /** Polecenie gracza (tryb wykonawczy) dla pociągu: { kind: 'accept', track } lub { kind: 'dispatch', exit }. */
  #command(e, kind) {
    return (this.sim.commands || []).find((c) => String(c.nr) === String(e.nr) && c.kind === kind && c.status === 'pending');
  }

  #complete(cmd, msg) {
    if (this.sim.playerDistrict === this.district) return; // operator zastępuje gracza (testy): wykonanie wykrywa symulacja
    cmd.status = 'done'; cmd.doneAt = this.sim.clock.time;
    this.sim.bus.emit('comms', { time: this.sim.clock.time, from: this.district, kind: 'info', text: msg });
    this.sim.bus.emit('commands', this.sim.commands);
  }

  /** Wydanie polecenia graczowi (tryb dyżurnego-automatu). */
  #order(e, kind, extra, text) {
    const key = `${e.nr}:${kind}`;
    if (this.issued.has(key)) return;
    this.issued.add(key);
    this.sim.issueCommand({ kind, nr: e.nr, ...extra, from: this.district, to: this.playerDistrict, text });
  }

  /**
   * Nastawienie przebiegu. Nastawnia mechaniczna (opcje zależności `manualPoints`, `manualSignal`, `routeBlock`):
   * najpierw dźwignie zwrotnic i wykolejnic (przebieg w następnym takcie), po zamknięciu przebiegu blok przebiegowy
   * i dźwignia sygnałowa.
   */
  #setRoute(id) {
    const ilk = this.sim.ilk;
    const res = ilk.setRoute(id);
    const levers = new Set(['point-position', 'derailer-position']);
    if (!res.ok && res.codes?.length && res.codes.every((c) => levers.has(c))) {
      const r = ilk.routes.get(id);
      for (const q of [...r.points, ...r.flank]) { const p = ilk.points.get(q.id); if (p.position !== q.position && !p.moving) ilk.switchPoint(q.id, q.position); }
      for (const q of [...r.derailers.onRoute, ...r.derailers.protect]) { const d = ilk.derailers.get(q.id); if (d && d.position !== q.position && !d.moving) ilk.switchDerailer(q.id, q.position); }
      return res;
    }
    if (res.ok && ilk.manualSignal) {
      const r = ilk.routes.get(id);
      if (ilk.routeBlock && r.kind === 'train') ilk.blockRoute(r.start);
      ilk.clearSignal(r.start);
    }
    return res;
  }

  /*
   * Trzy pytania automatu o przebieg (stan z `Interlocking.routeState`) – różne, nie do zamiany jedno na drugie:
   *  - `Interlocking.routeAhead(stan)` – przebieg jest przed pociągiem (utwierdzony, pociąg nie wjechał): zajmuje tor
   *    i szlak, a jego sygnalizator może wymagać Sz;
   *  - `#onItsWay(stan)` – przebieg dla pociągu jest utwierdzony przed nim albo właśnie się nastawia: drugiego nie
   *    nastawiać. Liczy się także przebieg z sygnałem na „Stój” i zwalniany czasowo – utwierdzenie trwa, polecenie
   *    dostałoby odmowę (zwalnianie czasowe po usterce: polecenie co takt aż do zwolnienia);
   *  - `#carries(stan)` – zaplanowany stopień poprowadzi pociąg taki, jaki jest: czeka z sygnałem albo się nastawia.
   *    Stopień z sygnałem na „Stój” albo zwalniany nie poprowadzi – trzeba go nastawić od nowa (w nastawni
   *    mechanicznej sygnał trzyma dźwignia, więc każdy przebieg przed pociągiem się liczy).
   */
  #onItsWay(state) {
    return Interlocking.routeAhead(state) || state === 'setting';
  }

  #carries(state) {
    return state === 'waiting' || state === 'setting' || (this.sim.ilk.manualSignal && Interlocking.routeAhead(state));
  }

  /** Nastawnia mechaniczna: po przejeździe dźwignia sygnałowa na „Stój” i drążek w położenie zasadnicze. */
  #releasePassed() {
    const ilk = this.sim.ilk;
    for (const { id, route } of ilk.routesSet()) {
      if (!ilk.routeFrame(id)?.passed || !this.#inDistrict(route.start)) continue;
      ilk.cancelSignal(route.start);
      // blok niezwolniony przez pociąg (usterka) – zwalniacz
      if (!ilk.releaseRoute(route.start).ok && ilk.routeFrame(id)?.blocked) ilk.releaseRoute(route.start, true);
    }
  }

  /**
   * Droga manewrowa składu na tor `target`: najkrótszy (w liczbie przebiegów) ciąg przebiegów manewrowych, także ze
   * zmianami kierunku (BFS, do 6 przebiegów). Zwraca listę przebiegów albo null.
   * `at` – skąd skład rusza: `{ occ, next, head, length }` (odcinki pod składem, sygnalizator przed nim, kierunek jazdy
   * 'E'/'W', długość); `now` – pierwszy przebieg ma się dać nastawić teraz (dla składu, który stoi; bez `now` – czy
   * droga w ogóle istnieje, np. z toru, na który pociąg dopiero wjedzie).
   *  - pierwszy przebieg zaczyna się od sygnalizatora, przed którym skład stoi (zajmuje odcinek przed nim, ale żadnego
   *    odcinka przebiegu) – w kierunku jazdy albo po zmianie kierunku; bez takiego – od sygnalizatora przed czołem,
   *  - dalej: od sygnalizatora końcowego poprzedniego przebiegu (ten sam kierunek), od sygnalizatora zwróconego
   *    w drugą stronę w tym samym miejscu (manewr „za rozjazdy i z powrotem”) albo – po zmianie kierunku – od
   *    sygnalizatora, którego odcinek przed nim skład zajmie, stojąc na końcu poprzedniego przebiegu,
   *  - poprzedni przebieg, na którego końcu skład stoi, trzyma swoje zwrotnice ochronne i zwrotnice pod składem –
   *    następny nie może ich potrzebować w innym położeniu (inaczej skład utknie w połowie drogi, np. na torze do
   *    szlaku); przebiegi przez odcinek zamknięty odpadają.
   */
  #shuntPath(at, target, routes, routeTrack, now) {
    const ilk = this.sim.ilk, topo = ilk.topo;
    const shunts = routes.filter((x) => x.kind === 'shunt' && !x.sections.some((sid) => ilk.sections.get(sid)?.closed));
    const dir = (x) => topo.signals.get(x.start)?.dir;
    const opposite = (sigId) => { const s = topo.signals.get(sigId); return s && [...topo.signals.values()].find((o) => o.kind === 'tm' && o.at.x === s.at.x && o.at.y === s.at.y && o.dir !== s.dir); };
    // odcinki pod składem stojącym na końcu przebiegu (od końca, na długość składu)
    const tail = (x) => { const out = new Set(); let len = 0; for (let i = x.sections.length - 1; i >= 0 && len < at.length; i--) { out.add(x.sections[i]); len += ilk.sections.get(x.sections[i])?.length ?? 0; } return out; };
    const held = (x, under) => [...x.flank, ...x.points.filter((q) => under.has(ilk.points.get(q.id)?.section))];
    const clash = (a, b) => a.some((q) => b.some((w) => w.id === q.id && w.position !== q.position));
    // teraz: bez przeszkód poza zajętością przez sam skład (dźwignie zwrotnic nastawni mechanicznej automat przekłada)
    const settable = (x) => ilk.routeProblems(x).every((q) => q.occupancy || q.code === 'point-position' || q.code === 'derailer-position')
      && !x.sections.some((sid) => ilk.sections.get(sid).occupied && !at.occ.has(sid));
    // przebieg od sygnalizatora, przed którym skład stoi: skład zajmuje odcinek przed nim, a żadnego odcinka przebiegu
    // (skład stojący czołem tuż za tarczą ruszy dopiero w przebiegu od niej); bez takiego – od sygnalizatora przed czołem
    const behind = (x) => at.occ.has(x.approach) && !x.sections.some((sid) => at.occ.has(sid));
    const near = shunts.filter((x) => dir(x) === at.head && behind(x));
    const same = near.length ? near : shunts.filter((x) => dir(x) === at.head && x.start === at.next);
    const first = [...same, ...shunts.filter((x) => dir(x) !== at.head && behind(x))].filter((x) => !now || settable(x))
      // bez zmiany kierunku najpierw, krótsze najpierw
      .sort((a, b) => (dir(a) !== at.head) - (dir(b) !== at.head) || a.sections.length - b.sections.length);
    const queue = first.map((x) => [x]);
    const seen = new Set(first.map((x) => x.id));
    while (queue.length) {
      const path = queue.shift();
      const last = path[path.length - 1];
      if (routeTrack(last) === target) return path;
      if (path.length >= 6) continue;
      const end = last.end.type === 'signal' ? last.end.id : null, back = end && opposite(end), under = tail(last), kept = held(last, under);
      for (const y of shunts) {
        if (seen.has(y.id)) continue;
        const ok = (end && y.start === end && dir(y) === dir(last)) || (back && y.start === back.id)
          || (dir(y) !== dir(last) && under.has(y.approach) && !y.sections.some((sid) => under.has(sid)));
        if (!ok || clash(kept, [...y.points, ...y.flank])) continue;
        seen.add(y.id);
        queue.push([...path, y]);
      }
    }
    return null;
  }

  /**
   * Przebiegi, które po usterce same nie wrócą do pracy:
   *  - semafor zgasł przed pociągiem, bo odcinek drogi przebiegu wykazał zajętość albo zwrotnica straciła kontrolę –
   *    sygnał sam nie wraca; automat zwalnia przebieg (Pz) i nastawia go od nowa, gdy droga będzie sprawna
   *    (urządzenia przekaźnikowe i komputerowe; w nastawni mechanicznej sygnał trzyma dźwignia),
   *  - pociąg przejechał, a przebieg się nie rozwiązał (`Interlocking.routeStuck`) – doraźne zwolnienie po chwili
   *    (w nastawni mechanicznej: dźwignia sygnałowa na „Stój” i zwalniacz).
   */
  #recoverRoutes() {
    const sim = this.sim, ilk = sim.ilk, t = sim.clock.time;
    for (const id of this.stuckSince.keys()) if (!Interlocking.routeLocked(ilk.routeState(id))) this.stuckSince.delete(id);
    for (const { id, route } of ilk.routesSet()) {
      const state = ilk.routeState(id); // stan w tej chwili – zwolnienie wcześniejszego przebiegu w tej pętli mogło go zmienić
      if (!Interlocking.routeLocked(state)) continue;
      if (!this.#inDistrict(route.start) || state === 'releasing' || ilk.signals.get(route.start).substitute) continue;
      if (Interlocking.routeAhead(state)) {
        if (ilk.manualSignal) continue; // nastawnia mechaniczna: sygnał trzyma dźwignia – sam nie gaśnie
        if (route.kind === 'train' && state === 'signal-off' && ilk.releaseRoute(route.start, false).ok) this.#forgetRoute(route);
        continue;
      }
      if (state !== 'stuck') { this.stuckSince.delete(id); continue; }
      if (!this.stuckSince.has(id)) { this.stuckSince.set(id, t); continue; }
      if (t - this.stuckSince.get(id) < 20) continue;
      if (ilk.manualSignal) ilk.cancelSignal(route.start); // dźwignia sygnałowa na „Stój” przed zwalniaczem
      ilk.releaseRoute(route.start, true);
    }
  }

  /** Przebieg zwolniony przed pociągiem: pociąg, który na niego czekał, dostanie go od nowa. */
  #forgetRoute(route) {
    for (const e of this.sim.traffic.timetable()) {
      const tr = e.train;
      if (!tr || tr.finished || tr.nextSignal() !== route.start) continue;
      // pierwszy stopień wyjazdu dwustopniowego – wyjazd zacznie się od nowa
      const plan = planOf(e);
      if (plan.via && route.end.type === 'signal' && route.end.id === plan.via) { plan.via = null; continue; }
      // kolejny stopień wjazdu wieloetapowego (pociąg minął już semafor wjazdowy) – wraca do planu, jeśli go w nim nie ma
      if (e.from && !tr.entryPending && !route.exit && !plan.entry?.includes(route.id)) plan.entry = [route.id, ...(plan.entry || [])];
    }
  }

  /**
   * Takt automatu. Kolejność jest częścią reguł: zwolnienie przebiegów po przejeździe (nastawnia mechaniczna) i po
   * usterkach, blokady liniowe, a potem każdy pociąg rozkładu przez kroki w `#serve` – krok, który kończy czynności przy
   * pociągu na ten takt, zwraca wynik ze `stop: true` (`done`), a następne kroki się nie wykonują.
   */
  tick() {
    const sim = this.sim;
    const t = sim.clock.time;
    if (t - this.lastAction < this.delay) return;
    this.lastAction = t;
    if (sim.ilk.holdRoute) this.#releasePassed();
    this.#recoverRoutes();
    const ctx = this.#context(t);
    this.#lineBlocks(ctx);
    for (const e of sim.traffic.timetable()) this.reports.set(String(e.nr), this.#serve(e, ctx));
  }

  /** Dane i pomocnicze pytania jednego taktu – wspólne dla kroków (przebiegi stacji liczone raz na takt). */
  #context(t) {
    const sim = this.sim, ilk = sim.ilk, topo = ilk.topo;
    const routes = ilk.routeList();
    const trackOf = (tr) => trainTrack(ilk, tr);
    const fullyOn = (tr, track) => { const secs = [...tr.occupiedSections()].map((s) => ilk.sections.get(s)); return secs.length && secs.every((s) => String(s.track) === String(track)); };
    const routeTrack = (r) => routeEndTrack(ilk, r);

    // Szlak jednotorowy: czy pociąg sąsiada miałby gdzie wjechać. Nie, gdy każdy tor, na który prowadzi wjazd z tego
    // szlaku, zajmuje (albo ma już nastawiony wjazd) pociąg, który sam czeka na ten szlak – po Poz żaden by nie ruszył.
    // Wtedy automat wstrzymuje pociąg sąsiada („Stój pociąg nr …”) i najpierw wyprawia swój.
    const deadEnd = (b) => {
      if (!b.singleTrack || this.role === 'executive') return false;
      const tracks = new Set(entryRoutes(ilk, b.id, routes).map(routeTrack).filter(Boolean));
      if (!tracks.size) return false;
      const claimed = new Set();
      for (const o of sim.traffic.timetable()) {
        const tr = o.train;
        if (o.to !== b.id || !tr || tr.finished) continue;
        if (tr.exitAuth != null && (tr.exitAuth !== '*' || !tr.nextSignal())) continue; // już wyjeżdża
        if (tr.entered && !tr.entryPending) { const tk = trackOf(tr); if (tk) claimed.add(tk); continue; }
        const ahead = ilk.routesSet().find((x) => x.route.kind === 'train' && Interlocking.routeAhead(x.state) && x.route.approach === (o.from ? exitApproach(ilk, o.from) : null));
        if (ahead) { const tk = routeTrack(ahead.route); if (tk) claimed.add(tk); }
      }
      return [...tracks].every((tk) => claimed.has(tk));
    };

    // zadanie czekające na poprzednie (`afterTask`) jeszcze nie jest do wykonania – niezależnie od kolejności na liście
    const ready = (x) => !x.afterTask || sim.traffic.tasks.find((y) => y.id === x.afterTask)?.done;
    return { sim, t, ilk, topo, routes, trackOf, fullyOn, routeTrack, deadEnd, ready };
  }

  /**
   * Blokady liniowe szlaków w okręgu automatu: prośby sąsiada, czynności, na które blokada czeka (dPo, zawiadomienie
   * o odjeździe, Ko), rozmowy przy usterce. Blokada sama mówi, o co prosi sąsiad i czego od dyżurnego czeka
   * (`neighbourAsk`, `duties`); automat decyduje tylko, czy wstrzymać pociąg sąsiada (`deadEnd`) i czy wolno mu przyjąć
   * (nastawnia wykonawcza – z polecenia).
   */
  #lineBlocks(ctx) {
    const { sim, deadEnd } = ctx;
    for (const b of sim.blocks.values()) {
      if (!this.#exitInDistrict(b.id)) continue;
      const owed = (duty) => b.duties().find((d) => d.duty === duty);
      // pociąg wyprawiony bez sygnału zezwalającego (Sz, rozkaz, zapowiadanie) – doraźne zablokowanie bloku początkowego
      if (owed('dPo')) b.press('dPo');
      const ask = b.neighbourAsk();
      if (b.fault) {
        if (ask && this.#mayAccept(b, ask)) sim.comms.send(deadEnd(b) ? 'hold' : 'free', { exit: b.id, nr: ask.nr }, { silent: true });
        // przyjazd pociągu sąsiada: telefonogram zastępuje Ko
        const ko = owed('Ko');
        if (ko?.how === 'phone') sim.comms.send('arrived', { exit: b.id, nr: ko.nr }, { silent: true });
        const report = owed('departure-report');
        if (report) sim.comms.send('departed', { exit: b.id, nr: report.nr }, { silent: true });
        continue;
      }
      // prośba sąsiada: Eap – pozwolenie (Poz), SBL – zgoda na zmianę kierunku (Zk)
      if (ask && this.#mayAccept(b, ask) && deadEnd(b)) {
        sim.comms.send('hold', { exit: b.id, nr: ask.nr ?? this.#pendingArrivalNr(b) }, { silent: true });
      } else if (ask && this.#mayAccept(b, ask) && !ask.wait) {
        // tryb ręczny rozmów: automat też nadaje 4a przed Poz (kary za pominięcie nie mogą trafić do gracza)
        if (ask.talkFirst) sim.comms.send('free', { exit: b.id, nr: ask.nr }, { silent: true });
        b.press(ask.answer);
      }
      // zawiadomienie o odjeździe przy sprawnej blokadzie czeka tylko w trybie ręcznym rozmów
      const report = owed('departure-report');
      if (report) sim.comms.send('departed', { exit: b.id, nr: report.nr }, { silent: true });
      const ko = owed('Ko');
      if (ko) { if (ko.prepare) b.press('dKo'); b.press('Ko'); }
    }
  }

  /**
   * Czynności automatu przy jednym pociągu w tym takcie – kroki po kolei; pierwszy, który kończy czynności (`stop`),
   * zamyka kolejkę. Zwraca wynik tego kroku albo null, gdy żaden nie miał nic do zrobienia.
   */
  #serve(e, ctx) {
    const tr = e.train;
    this.#playerOrders(e, tr, ctx);
    if (!tr || tr.finished) return null;
    let out = this.#writtenOrder(e, tr, ctx), note = null;
    if (out?.stop) return out;
    // pociąg ma wyjazd za sobą, gdy minął semafor wyjazdowy: zezwolenie na ten szlak albo – po Sz / rozkazie – brak
    // kolejnego semafora przed granicą stacji
    const leaving = tr.exitAuth != null && (tr.exitAuth !== '*' || !tr.nextSignal());
    note = this.#exitSubstitute(e, tr, leaving, ctx) ?? note;
    if ((out = this.#entryStages(e, tr, ctx))?.stop) return out;
    if ((out = this.#entry(e, tr, ctx))?.stop) return out;
    if ((out = this.#shunting(e, tr, ctx))?.stop) return out;
    note = this.#lineRequest(e, tr, ctx) ?? note;
    return this.#exit(e, tr, leaving, ctx) ?? note;
  }

  #playerOrders(e, tr, ctx) {
    const { sim, t, ilk, topo, routes, trackOf, fullyOn, routeTrack, ready } = ctx;
    // ---- dyżurny-automat wydaje polecenia graczowi (dla ruchu w okręgu gracza) ----
    if (this.role === 'dispatcher' && this.playerDistrict) {
      if (e.from && !e.dispatched && !tr && sim.exitDistrict(e.from) === this.playerDistrict && t >= e.requestAt - 60) {
        this.#order(e, 'accept', { track: e.track }, `Przyjąć pociąg nr ${e.nr} od ${sim.station.exits[e.from].name} na tor ${e.track}.`);
      }
      if (e.to && tr && !tr.finished && tr.entered && sim.exitDistrict(e.to) === this.playerDistrict && (tr.hasStopped || !e.stop || e.unit) && t >= (e.depTime ?? 0) - 6 * 60) {
        this.#order(e, 'dispatch', { exit: e.to }, `Wyprawić pociąg nr ${e.nr} z toru ${trackOf(tr) ?? e.track} do ${sim.station.exits[e.to].name} (${sim.station.exits[e.to].label || e.to}).`);
      }
    }
  }

  #writtenOrder(e, tr, ctx) {
    const { sim, t, ilk, topo, routes, trackOf, fullyOn, routeTrack, ready } = ctx;
    // ---- pociąg stanął za semaforem, który zgasł tuż przed nim: rozkaz pisemny na dalszą jazdę ----
    // (rozkaz wydaje dyżurny ruchu – nastawnia wykonawcza czeka na gracza)
    if (this.role !== 'executive' && tr.stoppedAt?.kind === 'spad' && tr.v === 0 && this.#inDistrict(tr.stoppedAt.signal)) {
      sim.traffic.issueOrder({ nr: e.nr, signal: tr.stoppedAt.signal });
      return done('written-order', 'order-issued', true);
    }
    return null;
  }

  #exitSubstitute(e, tr, leaving, ctx) {
    const { sim, t, ilk, topo, routes, trackOf, fullyOn, routeTrack, ready } = ctx;
    // ---- wyjazd przy blokadzie bez łączności: przebieg nastawiony, semafor na „Stój” (pozwolenie u sąsiada) – Sz ----
    // (nie kończy czynności przy pociągu – po Sz automat zajmuje się nim dalej)
    // tak samo, gdy blokada daje drogę, ale sygnału już nie (Pwl: sygnał wyjazdowy był raz podany i odwołany)
    const xb = e.to ? sim.blocks.get(e.to) : null;
    if (xb && tr.v === 0 && !leaving && (e.depTime == null || t >= e.depTime)) {
      const ahead = ilk.routesSet().find((x) => x.route.exit === e.to && x.route.kind === 'train' && Interlocking.routeAhead(x.state));
      const sig = ahead && ilk.signals.get(ahead.route.start);
      const noSignal = xb.fault || (xb.gate('route').ok && !xb.gate('signal', ahead?.id).ok);
      if (sig && noSignal && this.#inDistrict(sig.id) && tr.nextSignal() === sig.id && !Interlocking.isTrainProceed(sig.aspect)) {
        ilk.substituteSignal(sig.id);
        return noted('exit-substitute', 'substitute-signal', { signal: sig.id });
      }
    }
    return null;
  }

  #entryStages(e, tr, ctx) {
    const { sim, t, ilk, topo, routes, trackOf, fullyOn, routeTrack, ready } = ctx;
    // ---- wjazd (kolejne stopnie przebiegu wieloetapowego, np. A → H → O) ----
    // `plan.entry` to plan: stopnie drogi wjazdu przed pociągiem. Czy stopień trzeba nastawić, mówią urządzenia, nie
    // notatka: stopień, w którym pociąg już jest (wjechał albo minął jego semafor na Sz / rozkaz), i wcześniejsze
    // schodzą z planu; stopień, który czeka na pociąg (nastawiony albo w nastawianiu, semafor nie zgasł), zostaje
    // w planie – gdy usterka go zgasi, a automat zwolni (`#recoverRoutes`), będzie nastawiony od nowa, także dla
    // pociągu, który nie minął jeszcze semafora wjazdowego. Polecenie dostaje tylko pierwszy stopień, którego nie ma.
    // Gdy wszystkie czekają, automat idzie dalej (wyjazd pociągu bez postoju) – plan nie wstrzymuje innych czynności.
    const plan = planOf(e);
    if (plan.entry?.length && e.actualArr != null) plan.entry = null; // pociąg przyjechał – wjazd skończony
    if (plan.entry?.length) {
      const occ = tr.occupiedSections();
      const inside = plan.entry.findLastIndex((id) => ilk.routes.get(id)?.sections.some((sid) => occ.has(sid)));
      if (inside >= 0) plan.entry = plan.entry.slice(inside + 1);
      const next = plan.entry.find((id) => !this.#carries(ilk.routeState(id)));
      if (next) { const res = this.#setRoute(next); return done('entry-stage', res.ok ? 'route-set' : 'refused', !!res.ok, { route: next }); }
    }
    return null;
  }

  #entry(e, tr, ctx) {
    const { sim, t, ilk, topo, routes, trackOf, fullyOn, routeTrack, ready } = ctx;
    // ---- wjazd ----
    // Przebiegu wjazdowego potrzebuje pociąg, który nie minął jeszcze semafora wjazdowego (`entryPending`), i to ten,
    // który jedzie pierwszy: na szlaku z blokadą samoczynną jedzie ich kilka, a po opóźnieniach nie w kolejności
    // rozkładu. Przebieg nastawiony „dla” dalszego pociągu zabrałby go pierwszy – na cudzy tor – a automat czekałby
    // potem bez końca na wjazd, który już się odbył.
    if (e.from && tr.entryPending && this.#exitInDistrict(e.from)) {
      const ahead = sim.traffic.timetable().some((o) => o !== e && o.from === e.from && o.train && !o.train.finished && o.train.entryPending && o.train.head > tr.head);
      if (ahead) return done('entry', 'train-ahead');
      let want = this.trackFor ? this.trackFor(e) : e.track;
      if (this.role === 'executive') { const c = this.#command(e, 'accept'); if (!c) return done('entry', 'no-command'); want = c.track; planOf(e).accept = c; }
      const cands = entryRoutes(ilk, e.from, routes);
      // przebieg od semafora wjazdowego już czeka na ten pociąg (nastawiony albo w nastawianiu)
      if (cands.some((r) => this.#onItsWay(ilk.routeState(r.id)))) return done('entry', 'on-its-way');
      // Ścieżka przebiegów do toru docelowego (BFS po przebiegach pociągowych, do 3 stopni) – dla stacji,
      // na których tor peronowy leży za semaforem pośrednim (np. Sopot: A → H → O).
      // (wspólne z kontrolą scenariusza: src/model/trainPaths.js)
      const path = entryPath(ilk, routes, cands, want);
      // Pociąg kończący bieg z zadaniem manewrowym: inny tor tylko taki, z którego da się to zadanie wykonać – skład
      // stojący na torze bez drogi manewrowej do celu zostałby na nim do końca zmiany.
      const job = !e.to && !this.district ? (sim.traffic.tasks || []).find((x) => !x.done && !x.failed && ready(x) && String(x.unit) === String(e.nr)) : null;
      const reach = (r) => {
        if (!job) return true;
        const occ = new Set(); let len = 0;
        for (let i = r.sections.length - 1; i >= 0 && len < (e.length ?? 100); i--) { occ.add(r.sections[i]); len += ilk.sections.get(r.sections[i])?.length ?? 0; }
        const at = { occ, next: r.end.type === 'signal' ? r.end.id : null, head: topo.signals.get(r.start).dir, length: e.length ?? 100 };
        return !!this.#shuntPath(at, String(job.toTrack), routes, routeTrack, false);
      };
      // kolejność prób: tor planowy, potem inne tory peronowe, na końcu pozostałe (np. tor planowy zamknięty); przy
      // zadaniu – tory, z których zadanie da się wykonać, przed pozostałymi
      const rank = (r) => (routeTrack(r) === String(want) ? 0 : (ilk.sections.get(r.sections.at(-1))?.platform ? 1 : 3) + (reach(r) ? 0 : 1));
      let order = [...(path ? [path[0]] : []), ...[...cands].sort((a, b) => rank(a) - rank(b)).filter((r) => r !== path?.[0])];
      // pociąg jadący dalej – tylko tory, z których jest przebieg wyjazdowy na jego szlak (na torze bez wyjazdu utknąłby)
      const exitTracks = e.to ? new Set(routes.filter((x) => x.kind === 'train' && x.exit === e.to).map((x) => ilk.sections.get(x.approach)?.track).filter((k) => k != null).map(String)) : null;
      if (exitTracks?.size) order = order.filter((r) => r === path?.[0] || ilk.sections.get(r.sections.at(-1))?.kind !== 'station' || exitTracks.has(String(routeTrack(r))));
      // skoro jest inny tor, z którego zadanie da się wykonać, na tor bez drogi do celu nie przyjmować – raczej czekać
      if (job && cands.some((r) => routeTrack(r) !== String(want) && reach(r))) order = order.filter((r) => routeTrack(r) === String(want) || reach(r));
      // Krzyżowanie na szlaku jednotorowym: tor planowy zajmuje stojący pociąg, który odjedzie dopiero na szlak, z którego
      // ten pociąg nadjeżdża – żaden nie ruszy, dopóki ten nie wjedzie na inny tor
      // (nastawnia wykonawcza przyjmuje na tor z polecenia dyżurnego – toru sama nie zmienia)
      // (pociąg stoi na którymkolwiek odcinku przebiegu – tor bywa podzielony, np. Reda: peron I na T23, dalej T3)
      const crossing = (r) => {
        if (this.role === 'executive') return false;
        return sim.traffic.timetable().some((o) => o !== e && o.to === e.from && o.train && !o.train.finished && o.train.v === 0
          && r.sections.some((sid) => o.train.occupiedSections().has(sid)));
      };
      // Ten pociąg odjedzie na szlak jednotorowy, z którego nadjeżdża inny (sąsiad ma pozwolenie albo pociąg już jedzie).
      // Wjazd na tor `r` jest zły, gdy potem pociąg z przeciwka nie miałby gdzie wjechać: każdy inny tor dostępny z tego
      // szlaku zajmuje pociąg, który też czeka na ten szlak (albo skład bez dalszej jazdy). Wtedy najpierw wjeżdża
      // pociąg z przeciwka – ten czeka przed semaforem wjazdowym.
      const meetsOpposing = (r) => {
        const xb = e.to ? sim.blocks.get(e.to) : null;
        if (!xb || !xb.singleTrack || this.role === 'executive') return false;
        if (!xb.neighbourTrainComing()) return false;
        const tk = routeTrack(r);
        const theirs = [...new Set(entryRoutes(ilk, e.to, routes).map(routeTrack).filter(Boolean))];
        if (!theirs.includes(tk)) return false; // na ten tor pociąg z przeciwka i tak nie wjeżdża
        const held = (t) => sim.traffic.timetable().some((o) => o !== e && (o.to === e.to || o.to == null) && o.train && !o.train.finished
          && o.train.entered && !o.train.entryPending && trackOf(o.train) === t);
        return !theirs.some((t) => t !== tk && !held(t));
      };
      // Tor zajmuje skład, który z niego już nie odjedzie: zakończył bieg, nie ma zadań manewrowych i nie powstanie z niego
      // pociąg – czekanie nic nie da (Tczew: 44631 kończy bieg na torze 15 planowym dla opóźnionego 44611)
      const stays = (r) => sim.traffic.timetable().some((o) => o !== e && !o.to && o.train && !o.train.finished && o.train.entered && o.train.v === 0
        && r.sections.some((sid) => o.train.occupiedSections().has(sid))
        && !(sim.traffic.tasks || []).some((x) => !x.done && !x.failed && String(x.unit) === String(o.nr))
        && !sim.traffic.timetable().some((x) => String(x.unit) === String(o.nr) && x.actualDep == null));
      let closed = false, outcome = done('entry', 'no-route');
      for (const pick of order) {
        if (meetsOpposing(pick)) { outcome = done('entry', 'opposing-train'); break; }
        const res = this.#setRoute(pick.id);
        outcome = done('entry', res.ok ? 'route-set' : 'refused', !!res.ok, { route: pick.id });
        // inny tor tylko przy torze zamkniętym, przy krzyżowaniu albo gdy tor zajmuje skład, który już nie odjedzie;
        // chwilowo zajęty/utwierdzony tor planowy – czekać
        if (!res.ok) { if (res.codes?.includes('section-closed') || crossing(pick) || stays(pick)) closed = true; if (closed) continue; break; }
        // plan dalszych stopni – zawsze od nowa: po zmianie toru stary plan nie może zostać przy pociągu
        planOf(e).entry = path && pick === path[0] && path.length > 1 ? path.slice(1).map((r) => r.id) : null;
        if (planOf(e).accept) this.#complete(planOf(e).accept, `Droga przebiegu dla pociągu nr ${e.nr} na tor ${routeTrack(pick) ?? want} przygotowana, semafor ${pick.start} otwarty.`);
        break;
      }
      return outcome;
    }
    return null;
  }

  #shunting(e, tr, ctx) {
    const { sim, t, ilk, topo, routes, trackOf, fullyOn, routeTrack, ready } = ctx;
    // ---- zadania manewrowe (tylko operator całej stacji) ----
    const task = !this.district ? (sim.traffic.tasks || []).find((x) => !x.done && !x.failed && t >= x.afterTime && ready(x) && (String(x.unit) === String(e.nr) || String(x.unit) === String(e.unit))) : null;
    // Skład, z którego powstanie pociąg (`unit`), stoi bez zadań na torze, z którego nie wychodzi żaden przebieg
    // pociągowy (tor odstawczy – np. „podstaw” przepadło w trakcie odstawiania): automat podstawia go na tor
    // odjazdu tego pociągu, zanim skład przejdzie w jazdę pociągową i zostanie przekazany. Zadanie, które czeka na
    // swoją porę albo na poprzednie, też jest zadaniem – wtedy skład stoi; zadanie po poprzednim, które przepadło,
    // już się nie wykona.
    const alive = (x) => !x.done && !x.failed && (!x.afterTask || !sim.traffic.tasks.find((y) => y.id === x.afterTask)?.failed);
    const open = (sim.traffic.tasks || []).some((x) => alive(x) && String(x.unit) === String(e.nr));
    const heir = !task && !open && !this.district && !e.to && tr.entered ? sim.traffic.timetable().find((x) => String(x.unit) === String(e.nr) && !x.attached) : null;
    const stranded = heir && !routes.some((r) => r.kind === 'train' && tr.occupiedSections().has(r.approach));
    const target = task ? task.toTrack : stranded ? heir.track : null;
    if (target != null && tr.entered && tr.v === 0) {
      if (fullyOn(tr, target)) return done('shunt', 'in-place');
      if (tr.mode !== 'shunt') sim.traffic.toShunting(e.nr, this.#talk);
      const occ = tr.occupiedSections();
      // przebieg dla tego składu już czeka – skład zaraz ruszy; sygnalizator uszkodzony (nie da Ms2) – zezwolenie radiem
      const mine = (x) => x.kind === 'shunt' && (x.start === tr.nextSignal() || occ.has(x.approach));
      const waiting = routes.find((x) => mine(x) && Interlocking.routeAhead(ilk.routeState(x.id)));
      if (waiting && ilk.signals.get(waiting.start)?.failed && !tr.shuntPermit && tr.v === 0) sim.comms.send('shunt-permit', { nr: e.nr }, { silent: true });
      if (routes.some((x) => mine(x) && this.#onItsWay(ilk.routeState(x.id)))) return done('shunt', 'on-its-way');
      const head = ['E', 'NE', 'SE'].includes(tr.direction) ? 'E' : 'W';
      const r = this.#shuntPath({ occ, next: tr.nextSignal(), head, length: tr.length }, String(target), routes, routeTrack, true)?.[0];
      // pierwszy przebieg drogi w drugą stronę – najpierw zmiana kierunku jazdy; bez drogi (albo pierwszy przebieg
      // zajęty) – czekać, nie zmieniać kierunku w kółko
      if (r && topo.signals.get(r.start).dir !== head) { sim.traffic.reverseTrain(e.nr, this.#talk); return done('shunt', 'reverse', true); }
      if (r) { const res = this.#setRoute(r.id); return done('shunt', res.ok ? 'route-set' : 'refused', !!res.ok, { route: r.id }); }
      return done('shunt', 'no-path');
    }
    // skład po manewrach (bez zadań) wraca w tryb jazdy pociągowej – dopiero wtedy przejmie go pociąg powrotny
    if (!task && !e.to && tr.mode === 'shunt' && tr.v === 0 && sim.traffic.timetable().some((x) => String(x.unit) === String(e.nr))) { sim.traffic.toTrainMode(e.nr, this.#talk); return done('shunt', 'to-train-mode', true); }
    return null;
  }

  #lineRequest(e, tr, ctx) {
    const { sim, t, ilk, topo, routes, trackOf, fullyOn, routeTrack, ready } = ctx;
    // ---- wyjazd ----
    // Pozwolenie na wyjazd (Wbl) na szlak dwukierunkowy zawczasu – 6 min przed planowym odjazdem, gdy pociąg już jedzie
    // do nas albo stoi na stacji: kto pierwszy zażąda kierunku, ten go dostaje, a sąsiad z pociągiem w tę stronę poczeka
    if (e.to && tr && !tr.finished && e.actualDep == null && e.depTime != null && t >= e.depTime - 6 * 60 && this.#exitInDistrict(e.to) && this.role !== 'executive') {
      // zawczasu tylko szlak jednotorowy z Eap (wyjazd na szlak o stałym kierunku albo z blokadą samoczynną – przy wyjeździe)
      const b = sim.blocks.get(e.to);
      const step = b?.singleTrack ? b.lineStep(e.nr) : null;
      if (step) { this.#takeLine(b, step, e.nr); return noted('line-request', 'line-asked', { exit: e.to }); }
    }
    return null;
  }

  #exit(e, tr, leaving, ctx) {
    const { sim, t, ilk, topo, routes, trackOf, fullyOn, routeTrack, ready } = ctx;
    // Wyjazd: przebieg nastawiany dopiero na ~2 min przed planowym odjazdem (nie blokować głowicy stojącym składem)
    // Czy wyjazd jest już nastawiony, wynika ze stanu urządzeń, a nie z notatek automatu: przebieg w nastawianiu może
    // przepaść (zwrotnica bez kontroli), a nastawiony – zostać zwolniony po usterce. Pociąg ma wyjazd za sobą, gdy minął
    // semafor wyjazdowy (`leaving`).
    // Pociąg ze składu innego pociągu (`unit`) wchodzi tu od przekazania (do 15 min przed odjazdem): zmiana czoła trwa do
    // CAB_CHANGE_MAX s, więc maszynista dostaje ją zawczasu, a przebieg – jak zawsze ok. 2 min przed odjazdem.
    if (e.to && tr.entered && !leaving && (tr.hasStopped || !e.stop) && (e.depTime == null || t >= e.depTime - (e.unit ? 15 * 60 : 120)) && this.#exitInDistrict(e.to)) {
      let exitId = e.to;
      let cmd = null;
      if (this.role === 'executive') { cmd = this.#command(e, 'dispatch'); if (!cmd) return done('exit', 'no-command'); exitId = cmd.exit || e.to; }
      if (tr.mode === 'shunt') { if (tr.v === 0) sim.traffic.toTrainMode(e.nr, this.#talk); return done('exit', 'to-train-mode'); }
      const cur = trackOf(tr);
      const b = sim.blocks.get(exitId);
      if (!b) return done('exit', 'no-block');
      let cands = routes.filter((r) => r.kind === 'train' && r.exit === exitId && String(ilk.sections.get(r.approach)?.track) === String(cur));
      // Wyjazd dwustopniowy: brak przebiegu wprost na szlak – najpierw do semafora pośredniego (np. G502 → A502 → szlak),
      // potem od niego na szlak.
      let staged = false;
      const waiting = (pred) => ilk.routesSet().some((x) => this.#onItsWay(x.state) && pred(x.route));
      // pierwszy stopień wyjazdu przepadł, zanim pociąg ruszył – wyjazd zaczyna się od nowa
      const plan = planOf(e);
      if (plan.via && tr.nextSignal() !== plan.via && !waiting((r) => r.kind === 'train' && r.end.type === 'signal' && r.end.id === plan.via)) plan.via = null;
      if (plan.via) cands = routes.filter((r) => r.kind === 'train' && r.exit === exitId && r.start === plan.via);
      else if (!cands.length) {
        const toExit = new Set(routes.filter((r) => r.kind === 'train' && r.exit === exitId).map((r) => r.start));
        cands = routes.filter((r) => r.kind === 'train' && r.end.type === 'signal' && toExit.has(r.end.id) && String(ilk.sections.get(r.approach)?.track) === String(cur));
        staged = cands.length > 0;
      }
      if (!cands.length) return done('exit', 'no-route');
      if (e.unit && tr.v === 0) {
        const ahead = tr.nextSignal();
        const facing = cands.filter((r) => r.start === ahead);
        if (!facing.length) { sim.traffic.reverseTrain(e.nr, this.#talk); return done('exit', 'reverse', true); }
        cands = facing;
      }
      if (e.depTime != null && t < e.depTime - 120) return done('exit', 'too-early'); // skład gotowy (czoło w stronę wyjazdu) – przebieg później
      const step = b.lineStep(e.nr);
      if (step) this.#takeLine(b, step, e.nr);
      if (staged) {
        for (const r of cands) if (waiting((x) => x === r) || this.#setRoute(r.id).ok) { plan.via = r.end.id; break; }
        return done('exit', 'staged');
      }
      if (waiting((r) => cands.includes(r))) return done('exit', 'on-its-way'); // przebieg wyjazdowy czeka na pociąg
      const gate = b.gate();
      if (!gate.ok) return done('exit', 'line-block', false, { code: gate.code ?? null });
      for (const r of cands) if (this.#setRoute(r.id).ok) {
        if (cmd) this.#complete(cmd, `Droga przebiegu dla pociągu nr ${e.nr} do ${b.neighbour} przygotowana, semafor ${r.start} otwarty.`);
        return done('exit', 'route-set', true, { route: r.id });
      }
      return done('exit', 'refused', false, { route: cands[0].id });
    }
    return null;
  }

  /**
   * Krok blokady po szlak dla pociągu `nr` (`LineBlock.lineStep`): zapytanie telefoniczne, Zk albo Wbl – w trybie ręcznym
   * rozmów najpierw zapytanie 1a (automat nie może zostawić kary graczowi).
   */
  #takeLine(b, step, nr) {
    if (step.action === 'Zk') { b.press('Zk'); return; }
    if (step.action === 'ask-free' || step.talkFirst) this.sim.comms.send('ask-free', { exit: b.id, nr }, { silent: true });
    if (step.action === 'Wbl') b.press('Wbl');
  }

  /** Czy nastawnia wykonawcza może odpowiedzieć na prośbę sąsiada `ask`: tylko gdy dyżurny polecił przyjąć ten pociąg. */
  #mayAccept(b, ask) {
    if (this.role !== 'executive') return true;
    const nr = ask.by === 'block' ? this.#pendingArrivalNr(b) : ask.nr;
    if (!nr) return false;
    return (this.sim.commands || []).some((c) => String(c.nr) === String(nr) && c.kind === 'accept' && c.status === 'pending');
  }

  #pendingArrivalNr(b) {
    const e = this.sim.traffic.timetable().find((x) => x.from === b.id && x.requested && !x.dispatched);
    return e?.nr ?? null;
  }
}
