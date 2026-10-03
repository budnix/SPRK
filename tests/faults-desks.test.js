import { test } from 'node:test';
import assert from 'node:assert/strict';
import szkolna from '../src/stations/szkolna.js';
import kalinowo from '../src/stations/kalinowo.js';
import olszyny from '../src/stations/olszyny.js';
import { Interlocking } from '../src/model/Interlocking.js';
import { Simulation } from '../src/model/Simulation.js';
import { autoDispatch, run } from './helpers.js';
import { faultSim, runWithFault, at, target, entryActive, exitActive, entryRoutes, stuck, Clock } from './fault-harness.js';
import { unjustified, leftovers } from '../src/model/check/outcome.js';

/*
 * Usterki obsługiwane przez protokół obsługi stanowiska (podstawa: `tests/fault-harness.js`). Pozostałe testy usterek
 * (`tests/faults-*.test.js`) wydają Sz i inne polecenia wprost (`sim.execute`); tu „dyżurny” testu robi to tak jak gracz
 * na danym pulpicie, w tym samym takcie przed automatem:
 *  - długa usterka semafora wjazdowego A (Szkolna; MOR-3 – Kalinowo), pociąg stoi przed nim przy nastawionym przebiegu:
 *    dKo i Sz przez pulpit – typu E: przycisk grupowy Sz i przycisk sygnałowy; IZH-111: adres semafora i rozkaz Sz;
 *    EBILock: SZI, po 5–30 s SZW; MOR-3: SZ z menu semafora (polecenie specjalne) i potwierdzenie; monitor: polecenie
 *    specjalne z odliczaniem (potwierdzenie najwcześniej po 5 s, `src/srk/special.js`); nastawnia mechaniczna: klawisz Sz.
 *    Sz liczony raz, 0 pkt, liczniki zależności i raportu, pociąg mija semafor na Sz, następny po naprawie na sygnale,
 *  - semafor naprawiony, gdy SZ czeka na potwierdzenie (MOR-3 – bez odliczania, monitor – z odliczaniem): wynik utrwalony,
 *  - nastawnia mechaniczna: zajętość toru docelowego z usterki – drążek w położeniu pośrednim, dKo, Sz; usterka semafora
 *    i bloku przebiegowego tego samego semafora – Sz i zwalniacz; usterka napędu zwrotnicy w Olszynach – drążek nie
 *    zamyka przebiegu przez zwrotnicę bez kontroli.
 */

const LENGTH = { szkolna: 130, kalinowo: 110, olszyny: 120 };
const os = (st, nr, from, to, arr, dep, track) => ({ nr, kind: 'os', name: 'Osobowy', from, to, arr, dep, track, stop: true, length: LENGTH[st.id], vmax: 100, dwell: 60 });
const DIRS = [['W', 'E'], ['E', 'W']];
const entryOf = (sim, nr) => sim.traffic.timetable().find((e) => e.nr === nr);
const faultOf = (sim, type) => sim.faults.list.find((f) => f.type === type);
const scores = (sim, code) => sim.score.items.filter((i) => i.code === code).map((i) => i.points);
const now = (sim) => Clock.format(sim.clock.time, true);
const trackOf = (sim, sid) => String(sim.ilk.sections.get(sid)?.track);
/** Przebiegi pociągu `nr` na tor planowy: wjazdowe (od semafora wjazdowego) i wyjazdowe (z toru planowego na szlak). */
const plannedEntry = (sim, nr) => entryRoutes(sim, nr).filter((r) => trackOf(sim, r.sections.at(-1)) === String(entryOf(sim, nr).track));
const plannedExit = (sim, nr) => { const e = entryOf(sim, nr); return sim.ilk.routeList().filter((r) => r.kind === 'train' && r.exit === e.to && trackOf(sim, r.approach) === String(e.track)); };

/* ---------------- stanowiska: protokół obsługi ---------------- */

/** Polecenie specjalne monitora: inicjowanie, po 6 s potwierdzenie (najwcześniej po 5 s, Ie-104.1 §11 ust. 13–16). */
const special = (cmd, meta) => [(sim) => sim.initiateSpecial(cmd, meta), 6, (sim) => sim.confirmSpecial()];

/**
 * Stanowiska i czynności dyżurnego przez ich protokół obsługi. Krok: funkcja (sim) => wynik polecenia, liczba – zwłoka
 * w sekundach przed następnym krokiem, { until } – czekanie na warunek. `dKo(exit)` – doraźne przygotowanie bloku
 * końcowego, `Sz(sig)` – sygnał zastępczy (ostatni krok wyświetla Sz), `cancel` – odwołanie polecenia czekającego (OPS).
 */
const DESKS = [
  {
    st: szkolna, srk: 'E',
    dKo: (exit) => [(sim) => sim.press({ kind: 'block', exit, btn: 'dKo' })],
    // przycisk grupowy Sz i przycisk sygnałowy semafora (src/srk/buttons.js)
    Sz: (sig) => [(sim) => sim.press({ kind: 'group', id: 'Sz', role: 'substitute' }), (sim) => sim.press({ kind: 'signal', id: sig, color: 'green' })],
  },
  {
    st: szkolna, srk: 'izh111',
    dKo: (exit) => [(sim) => sim.press({ kind: 'block', exit, btn: 'dKo' })],
    // przycisk adresowy semafora i przycisk rozkazu Sz (src/srk/address.js)
    Sz: (sig) => [(sim) => sim.press({ kind: 'signal', id: sig }), (sim) => sim.press({ kind: 'order', id: 'Sz' })],
  },
  {
    st: szkolna, srk: 'ebilock',
    dKo: (exit) => [(sim) => sim.submitCommand(`DKO ${exit}`)],
    // polecenie specjalne dwuczęściowe: SZI markuje semafor, SZW przyjmowane od 5 do 30 s po SZI (src/srk/ebilock.js)
    Sz: (sig) => [(sim) => sim.submitCommand(`SZI ${sig}`), 6, (sim) => sim.submitCommand(`SZW ${sig}`)],
    twoStep: true,
  },
  {
    st: kalinowo, srk: 'mor3',
    // strzałka blokady / semafor – menu obiektu – polecenie czerwone (specjalne) – potwierdzenie (src/srk/mor.js);
    // MOR-3 nie ma odliczania: polecenie czeka na potwierdzenie bez zwłoki i bez wygasania (docs/sources/stanowiska-komputerowe.md)
    dKo: (exit) => [(sim) => { sim.cancelSelection(); return sim.press({ kind: 'end', id: `k${exit}` }); }, (sim) => sim.chooseCommand('dKo'), 2, (sim) => sim.confirmCommand()],
    Sz: (sig) => [(sim) => { sim.cancelSelection(); return sim.press({ kind: 'signal', id: sig }); }, (sim) => sim.chooseCommand('SZ'), 2, (sim) => sim.confirmCommand()],
    cancel: (sim) => { sim.cancelSelection(); return { ok: sim.input.pending == null }; },
    twoStep: true,
  },
  {
    st: szkolna, srk: 'komputerowe',
    // menu elementu monitora – polecenie specjalne (src/render/ScreenRenderer.js: onSpecial / onSpecialConfirm)
    dKo: (exit) => special({ type: 'block', exit, btn: 'dKo' }, { label: 'dKo', target: { kind: 'block', exit } }),
    Sz: (sig) => special({ type: 'substitute', signal: sig }, { label: 'Sygnał zastępczy (SZ)', target: { kind: 'signal', id: sig } }),
    cancel: (sim) => sim.cancelSpecial(),
    twoStep: true,
  },
  {
    st: szkolna, srk: 'mech',
    dKo: (exit) => [(sim) => sim.press({ kind: 'block', exit, btn: 'dKo' })],
    // klawisz Sz na ławie dźwigniowej (src/render/LeverRenderer.js – polecenie wprost, jak każdy element ławy)
    Sz: (sig) => [(sim) => sim.execute({ type: 'substitute', signal: sig })],
  },
];

/** Kroki dyżurnego po kolei (`job.steps`); wyniki poleceń w `job.done`. */
function runSteps(sim, job) {
  while (job.steps.length) {
    const s = job.steps[0];
    if (typeof s === 'number') { job.wait = sim.clock.time + s; job.steps.shift(); continue; }
    if (sim.clock.time < job.wait) return;
    if (typeof s === 'object') { if (!s.until(sim)) return; job.steps.shift(); continue; }
    job.steps.shift();
    job.done.push({ at: now(sim), res: s(sim) });
  }
}
const newJob = (steps) => ({ steps, wait: 0, done: [] });
/** Polecenia odrzucone przez pulpit albo zależności – do asercji (wszystkie kroki mają przejść). */
const refused = (job) => job.done.filter((d) => !d.res?.ok).map((d) => `${d.at} ${d.res?.reason}`);
/** Krok `fn` ze zdjęciem stanu przed nim (`rec[key]`) i po nim (`rec[key].after`) – chwila polecenia. */
const tap = (fn, rec, key, snap) => (sim) => { rec[key] = snap(sim); const res = fn(sim); Object.assign(rec[key], { res, after: snap(sim) }); return res; };

/** Semafor z usterką, przed którym pociąg `nr` stoi przy nastawionym przebiegu (jeszcze nie wjechał) – albo null. */
function waitingAt(sim, nr) {
  const tr = entryOf(sim, nr)?.train;
  if (!tr || tr.v > 0 || !tr.entryPending || tr.stoppedAt?.kind !== 'signal') return null;
  const sig = sim.ilk.signals.get(tr.nextSignal());
  return sig?.failed && sig.route && !sim.ilk.active.get(sig.route)?.trainEntered ? sig : null;
}

/**
 * Dyżurny przy semaforze wjazdowym z usterką: gdy pociąg `nr` stoi przed nim przy nastawionym przebiegu – kroki
 * `steps(sig)` przez pulpit (dKo, Sz), potem automat. `state.at` – stan w chwilach kroków ze zdjęciem (`tap`).
 */
function deskDispatcher(nr, steps) {
  const state = { sig: null, job: null, at: {} };
  const fn = (sim) => {
    if (!state.job) {
      const sig = waitingAt(sim, nr);
      if (sig) { state.sig = sig.id; state.job = newJob(steps(sig.id, state.at, sim)); }
    }
    if (state.job) runSteps(sim, state.job);
    autoDispatch(sim);
  };
  fn.state = state;
  return fn;
}

/**
 * Minięcia semaforów: jak pociąg minął semafor („sygnał”, „Sz”, „rozkaz”, „Stój …”). Obraz to ostatni sygnał semafora
 * sprzed ruchu pociągu – z poprzedniego taktu i z tego taktu przed przejazdem (naprawa w tym samym takcie).
 */
function passWatch(sim) {
  const prev = new Map(), passes = [];
  let seen = new Map();
  sim.bus.on('signal', (s) => seen.get(s.id)?.push(s.aspect));
  const each = (s) => {
    for (const tr of s.traffic.trains) {
      if (tr.finished || tr.mode !== 'train') { prev.delete(tr.nr); continue; }
      const next = tr.nextSignal();
      const p = prev.get(tr.nr);
      if (p && p.sig !== next) {
        const aspect = [p.aspect, ...(seen.get(p.sig) ?? [])].findLast((a) => Interlocking.isTrainProceed(a)) ?? p.aspect;
        const how = p.order ? 'rozkaz' : aspect === 'Sz' ? 'Sz' : Interlocking.isTrainProceed(aspect) ? 'sygnał' : `Stój (${aspect})`;
        passes.push({ nr: tr.nr, sig: p.sig, how });
      }
      const sig = next && s.ilk.signals.get(next);
      if (sig) prev.set(tr.nr, { sig: next, aspect: sig.aspect, order: tr.hasOrderFor(next) }); else prev.delete(tr.nr);
    }
    seen = new Map([...prev.values()].map((p) => [p.sig, []]));
  };
  return { each, passes };
}
/** Minięcia semafora `sig` jako „numer: sposób”; sposoby minięć pociągu `nr` (wszystkie semafory, po kolei). */
const passesAt = (w, sig) => w.passes.filter((p) => p.sig === sig).map((p) => `${p.nr}: ${p.how}`);
const passesOf = (w, nr) => w.passes.filter((p) => p.nr === nr).map((p) => p.how);

/** Wspólne asercje przypadku: chwila nastąpiła, niezmienniki, bez spadu i rozprucia, pociągi dojechały, bez kar, stan po naprawie. */
function check(r, msg) {
  assert.equal(r.fired, true, `${msg}: chwila nie nastąpiła (usterka nie wystąpiła)`);
  assert.deepEqual(r.violations, [], `${msg}: niezmienniki`);
  assert.deepEqual(r.events, [], `${msg}: spad / rozprucie`);
  assert.deepEqual(stuck(r.sim), [], `${msg}: pociągi, które nie dojechały`);
  assert.deepEqual(unjustified(r.sim), [], `${msg}: kary za czynności wymuszone usterką`);
  assert.deepEqual(leftovers(r.sim), [], `${msg}: stan po naprawie`);
}
const label = (st, srk, nr, from, to, track, what, r) => `${st.name} ${srk}, pociąg ${nr} ${from}→${to} tor ${track}, ${what}, ${r.fault?.type} ${r.fault?.target} ${Math.round((r.fault?.duration ?? 0) / 6) / 10} min`;

/* ---------------- P8: Sz przez protokół stanowiska ---------------- */

// Pociąg 2: sąsiad zgłasza go o 07:00, przebieg wjazdowy nastawiony ok. 07:02 – wtedy semafor A gaśnie na 20 min; pociąg
// staje przed nim ok. 07:05. Pociąg 3 (07:26) dojeżdża po naprawie.
const p8Timetable = (st) => [os(st, 2, 'W', 'E', '07:06', '07:08', '1'), os(st, 3, 'W', 'E', '07:26', '07:28', '1')];
/** Stan semafora i usterki w chwili polecenia. */
const sigState = (sig) => (sim) => {
  const f = faultOf(sim, 'signal-fail'), s = sim.ilk.signals.get(sig), act = s.route && sim.ilk.active.get(s.route);
  return { failed: !!s.failed, fault: !!f?.active, aspect: s.aspect, passed: !entryOf(sim, 2).train.entryPending, entered: !!act?.trainEntered };
};

test('długa usterka semafora wjazdowego: dKo i Sz przez protokół stanowiska – Sz raz, 0 pkt, liczniki; pociąg mija semafor na Sz, następny po naprawie na sygnale zezwalającym', () => {
  for (const desk of DESKS) {
    const { st, srk } = desk;
    const sim = faultSim(st, { srk, timetable: p8Timetable(st) });
    const w = passWatch(sim);
    // ostatni krok Sz (wyświetlenie sygnału) ze zdjęciem stanu: semafor z usterką, usterka trwa
    const d = deskDispatcher(2, (sig, rec) => {
      const sz = desk.Sz(sig);
      return [...desk.dKo('W'), ...sz.slice(0, -1), tap(sz.at(-1), rec, 'Sz', sigState(sig))];
    });
    const r = runWithFault(sim, { when: at.entrySet(2), fault: { type: 'signal-fail', target: target.entrySignal(2), duration: 20 }, dispatch: d, each: w.each, until: '09:00' });
    const msg = label(st, srk, 2, 'W', 'E', '1', 'pociąg stoi przed semaforem z usterką, Sz przez pulpit', r);
    check(r, msg);
    assert.equal(r.fault.target, 'A', `${msg}: semafor wjazdowy`);
    assert.ok(d.state.at.Sz, `${msg}: pociąg nie stanął przed semaforem z usterką przy nastawionym przebiegu (Sz nie podany)`);
    assert.deepEqual(refused(d.state.job), [], `${msg}: polecenia odrzucone przez pulpit`);
    assert.deepEqual([d.state.at.Sz.failed, d.state.at.Sz.fault, d.state.at.Sz.passed], [true, true, false], `${msg}: Sz w czasie usterki, przed wjazdem`);
    assert.equal(d.state.at.Sz.after.aspect, 'Sz', `${msg}: Sz wyświetlony`);
    assert.deepEqual(scores(sim, 'Sz'), [0], `${msg}: Sz`);
    assert.equal(sim.ilk.counters.Sz, 1, `${msg}: licznik Sz zależności`);
    assert.equal(sim.report().counters.Sz, 1, `${msg}: licznik Sz w raporcie`);
    assert.deepEqual(scores(sim, 'dKo'), [0], `${msg}: dKo przed wjazdem na Sz`);
    assert.deepEqual(scores(sim, 'order'), [], `${msg}: bez rozkazu „S”`);
    assert.deepEqual(passesAt(w, 'A'), ['2: Sz', '3: sygnał'], `${msg}: minięcia A`);
    if (srk === 'mor3') {
      assert.deepEqual(d.state.job.done.map((x) => x.res.level).filter(Boolean), ['special', 'special'], `${msg}: dKo i SZ – polecenia specjalne`);
      assert.equal(sim.input.specialCount, 2, `${msg}: licznik poleceń specjalnych MOR-1 (dKo, SZ)`);
    }
  }
});

/*
 * Semafor naprawiony, gdy SZ czeka na potwierdzenie (zainicjowane ok. 3 s przed naprawą, w czasie usterki). Po naprawie
 * semafor od razu daje sygnał zezwalający na nastawionym przebiegu, pociąg rusza w tym samym takcie.
 *  - potwierdzenie po naprawie (MOR-3, monitor; EBILock – SZW po SZI) – Sz wyświetla się na semaforze, za który czoło
 *    pociągu już wjechało. Sz ocenia się w chwili wyboru polecenia (docs/sources/sygnaly-i-blokada.md): dyżurny zdecydował w czasie
 *    usterki, potwierdzenie to krok bezpieczeństwa urządzenia – bez kary (dawniej −5, uzasadnienie z chwili wykonania),
 *  - odwołanie (OPS, Ie-20 §13 ust. 9) po zobaczeniu sygnału zezwalającego – bez Sz i bez kary.
 */
test('MOR-3, monitor, EBILock: semafor naprawiony, gdy SZ czeka na potwierdzenie – Sz oceniany w chwili wyboru (bez kary), odwołanie: bez Sz', () => {
  for (const desk of DESKS.filter((x) => x.twoStep)) for (const end of desk.cancel ? ['potwierdzenie', 'odwołanie'] : ['potwierdzenie']) {
    const { st, srk } = desk;
    const sim = faultSim(st, { srk, timetable: p8Timetable(st) });
    const w = passWatch(sim);
    const left = (s) => { const f = faultOf(s, 'signal-fail'); return f.since + f.duration - s.clock.time; };
    const d = deskDispatcher(2, (sig, rec) => {
      const sz = desk.Sz(sig);
      const init = sz.slice(0, -1), last = init.findLastIndex((x) => typeof x === 'function');
      init[last] = tap(init[last], rec, 'init', sigState(sig));
      return [...desk.dKo('W'), { until: (s) => left(s) <= 3 }, ...init, { until: (s) => faultOf(s, 'signal-fail').done },
        tap(end === 'potwierdzenie' ? sz.at(-1) : desk.cancel, rec, 'end', sigState(sig))];
    });
    const r = runWithFault(sim, { when: at.entrySet(2), fault: { type: 'signal-fail', target: target.entrySignal(2), duration: 5 }, dispatch: d, each: w.each, until: '09:00' });
    const msg = label(st, srk, 2, 'W', 'E', '1', `SZ zainicjowane w czasie usterki, naprawa przed potwierdzeniem, ${end}`, r);
    const { init, end: fin } = d.state.at;
    assert.equal(r.fired, true, `${msg}: chwila nie nastąpiła`);
    assert.ok(init && fin, `${msg}: SZ nie zainicjowane albo niezakończone (${JSON.stringify(d.state.at)})`);
    assert.deepEqual(refused(d.state.job), [], `${msg}: polecenia odrzucone`);
    assert.deepEqual([init.failed, init.fault, init.passed], [true, true, false], `${msg}: SZ zainicjowane w czasie usterki, pociąg przed semaforem`);
    assert.deepEqual([fin.failed, fin.fault, fin.passed], [false, false, true], `${msg}: przy ${end} usterka naprawiona, pociąg już minął semafor`);
    assert.deepEqual(r.violations, [], `${msg}: niezmienniki`);
    assert.deepEqual(r.events, [], `${msg}: spad / rozprucie`);
    assert.deepEqual(stuck(sim), [], `${msg}: pociągi, które nie dojechały`);
    assert.deepEqual(leftovers(sim), [], `${msg}: stan po naprawie`);
    assert.deepEqual(passesAt(w, 'A'), ['2: sygnał', '3: sygnał'], `${msg}: minięcia A – pociąg ruszył na sygnale zezwalającym po naprawie`);
    assert.deepEqual(scores(sim, 'dKo'), [0], `${msg}: dKo przed wjazdem`);
    if (end === 'potwierdzenie') {
      assert.equal(fin.after.aspect, 'Sz', `${msg}: Sz wyświetlony`);
      assert.equal(fin.entered, true, `${msg}: Sz przyjęty na semaforze, którego przebieg zajmuje już pociąg`);
      assert.deepEqual(scores(sim, 'Sz'), [0], `${msg}: Sz wybrany w czasie usterki – uzasadniony, choć potwierdzony po naprawie`);
      assert.deepEqual(unjustified(sim), [], `${msg}: kary`);
      assert.equal(sim.ilk.counters.Sz, 1, `${msg}: licznik Sz`);
      assert.equal(sim.report().counters.Sz, 1, `${msg}: licznik Sz w raporcie`);
    } else {
      assert.deepEqual(scores(sim, 'Sz'), [], `${msg}: Sz odwołany`);
      assert.deepEqual(unjustified(sim), [], `${msg}: kary`);
      assert.equal(sim.ilk.counters.Sz, 0, `${msg}: licznik Sz`);
      assert.equal(sim.report().counters.Sz, 0, `${msg}: licznik Sz w raporcie`);
    }
    if (srk === 'mor3') assert.equal(sim.input.specialCount, end === 'potwierdzenie' ? 2 : 1, `${msg}: licznik poleceń specjalnych MOR-1`);
    if (srk === 'komputerowe') assert.equal(sim.special.pending, null, `${msg}: polecenie specjalne zakończone`);
  }
});

/*
 * Druga strona oceny w chwili wyboru: Sz wybrany bez usterki kosztuje −5 także po potwierdzeniu (protokół zapamiętał
 * brak uzasadnienia), a usterka, która zaczęła się przed potwierdzeniem, go uzasadnia (polecenie sprawdza się przed
 * potwierdzeniem, Ie-20 §13 ust. 7).
 */
test('MOR-3, monitor, EBILock: Sz wybrany bez usterki – −5 po potwierdzeniu; usterka przed potwierdzeniem – bez kary', () => {
  const TWO = {
    ebilock: { choose: (sim) => sim.submitCommand('SZI A'), confirm: (sim) => sim.submitCommand('SZW A') },
    mor3: { choose: (sim) => { sim.press({ kind: 'signal', id: 'A' }); return sim.chooseCommand('SZ'); }, confirm: (sim) => sim.confirmCommand() },
    komputerowe: { choose: (sim) => sim.initiateSpecial({ type: 'substitute', signal: 'A' }, { label: 'Sz A' }), confirm: (sim) => sim.confirmSpecial() },
  };
  for (const [srk, d] of Object.entries(TWO)) for (const faultBefore of [false, true]) {
    const sim = new Simulation(szkolna, { srk, scenario: { id: 't', name: 't', endTime: '09:00', trains: [] }, disruptions: 'none' });
    const msg = `${srk}, ${faultBefore ? 'usterka semafora A między wyborem a potwierdzeniem' : 'bez usterki'}`;
    assert.ok(d.choose(sim).ok, `${msg}: wybór Sz`);
    if (faultBefore) sim.faults.add({ type: 'signal-fail', target: 'A', duration: 5 });
    run(sim, 6);
    assert.ok(d.confirm(sim).ok, `${msg}: potwierdzenie`);
    assert.equal(sim.ilk.signals.get('A').aspect, 'Sz', `${msg}: Sz wyświetlony`);
    assert.deepEqual(scores(sim, 'Sz'), [faultBefore ? 0 : -5], msg);
  }
});

/* ---------------- P10: nastawnia mechaniczna ---------------- */

/** Dźwignie zwrotnic i wykolejnic w położenia przebiegu `r`; true, gdy wszystkie już stoją (bez przestawiania). */
function levers(sim, r) {
  let ready = true;
  for (const q of [...r.points, ...r.flank]) {
    const p = sim.ilk.points.get(q.id);
    if (p.position === q.position && !p.moving) continue;
    ready = false;
    if (!p.moving) sim.execute({ type: 'point', id: q.id, position: q.position });
  }
  for (const q of [...r.derailers.onRoute, ...r.derailers.protect]) {
    const x = sim.ilk.derailers.get(q.id);
    if (!x || (x.position === q.position && !x.moving)) continue;
    ready = false;
    if (!x.moving) sim.execute({ type: 'derailer', id: q.id, position: q.position });
  }
  return ready;
}

/** Sąsiad ma pozwolenie (Eap), pociąg jeszcze u niego – przebieg wjazdowy nienastawiony. */
const permitted = (nr) => (sim) => { const e = entryOf(sim, nr); return !!e && !e.train && !entryActive(sim, nr) && sim.blocks.get(e.from)?.direction === 'in'; };

/**
 * Dyżurny nastawni mechanicznej przy zajętości z usterki na torze docelowym (Ie-8 §21 ust. 14–15): pociąg stoi przed
 * semaforem wjazdowym, drążka nie da się przełożyć do końca – dźwignie zwrotnic, drążek w położenie pośrednie, dKo, klawisz
 * Sz; drążek wraca po przyjeździe pociągu i zgaśnięciu Sz. Potem automat (automat położenia pośredniego nie używa).
 */
function halfDesk(nr) {
  const st = { phase: 'czeka' };
  const fn = (sim) => {
    const e = entryOf(sim, nr), tr = e?.train, f = faultOf(sim, 'false-occupancy');
    const r = plannedEntry(sim, nr)[0];
    if (st.phase === 'czeka' && tr?.entryPending && tr.v === 0 && tr.stoppedAt?.kind === 'signal' && tr.stoppedAt.signal === r.start && f?.active && levers(sim, r)) {
      const pts = [...r.points, ...r.flank];
      st.sig = r.start;
      st.occupied = Interlocking.faultOccupied(sim.ilk.sections.get(f.target));
      st.full = sim.execute({ type: 'route', id: r.id });
      st.half = sim.execute({ type: 'route-half', id: r.id });
      st.unlocked = pts.filter((q) => !sim.ilk.pointLockedByRoute(q.id)).map((q) => q.id);
      st.moved = pts.filter((q) => sim.execute({ type: 'point', id: q.id, position: q.position === '+' ? '-' : '+' }).ok).map((q) => q.id);
      st.dKo = sim.press({ kind: 'block', exit: e.from, btn: 'dKo' });
      st.sz = sim.execute({ type: 'substitute', signal: r.start });
      st.szFault = f.active && Interlocking.faultOccupied(sim.ilk.sections.get(f.target));
      st.early = sim.execute({ type: 'release', signal: r.start });
      st.phase = 'Sz';
    }
    if (st.phase === 'Sz' && e.actualArr != null && !sim.ilk.signals.get(st.sig).substitute) {
      st.back = sim.execute({ type: 'release', signal: st.sig });
      st.phase = 'koniec';
    }
    autoDispatch(sim);
  };
  fn.state = st;
  return fn;
}

test('nastawnia mechaniczna: zajętość toru docelowego z usterki – drążek w położeniu pośrednim zamyka zwrotnice, dKo i Sz bez kary (także bez kary za zwrotnice); drążek nie wraca, dopóki świeci Sz', () => {
  for (const [from, to] of DIRS) for (const track of ['1', '2']) {
    const sim = faultSim(szkolna, { srk: 'mech', timetable: [os(szkolna, 2, from, to, '07:06', '07:08', track)] });
    const w = passWatch(sim);
    const d = halfDesk(2);
    const r = runWithFault(sim, { when: permitted(2), fault: { type: 'false-occupancy', target: (s) => plannedEntry(s, 2)[0]?.sections.at(-1), duration: 20 }, dispatch: d, each: w.each, until: '09:00' });
    const msg = label(szkolna, 'mech', 2, from, to, track, 'zajętość toru docelowego przed nastawieniem wjazdu', r);
    const s = d.state;
    check(r, msg);
    assert.equal(s.phase, 'koniec', `${msg}: dyżurny nie doszedł do końca (${s.phase})`);
    assert.equal(s.occupied, true, `${msg}: tor docelowy zajęty z usterki przy nastawianiu`);
    assert.deepEqual(s.full.codes, ['section-occupied'], `${msg}: drążek do końca – odmowa tylko z powodu zajętości`);
    assert.deepEqual(s.half, { ok: true, half: true }, `${msg}: położenie pośrednie`);
    assert.deepEqual(s.unlocked, [], `${msg}: zwrotnice zamknięte drążkiem`);
    assert.deepEqual(s.moved, [], `${msg}: zwrotnicy zamkniętej drążkiem nie da się przestawić`);
    assert.equal(s.dKo.ok, true, `${msg}: dKo (${s.dKo.reason})`);
    assert.equal(s.sz.ok, true, `${msg}: Sz (${s.sz.reason})`);
    assert.equal(s.szFault, true, `${msg}: Sz w czasie usterki`);
    assert.equal(s.early.ok, false, `${msg}: drążek wrócił, choć świeci Sz`);
    assert.match(s.early.reason, /sygnał zastępczy/, msg);
    assert.equal(s.back.ok, true, `${msg}: drążek z położenia pośredniego po zgaśnięciu Sz (${s.back.reason})`);
    assert.equal(sim.ilk.half.size, 0, `${msg}: drążek w położeniu zasadniczym`);
    assert.deepEqual(scores(sim, 'Sz'), [0], `${msg}: Sz`);
    assert.deepEqual(scores(sim, 'Sz-points'), [], `${msg}: kara za zwrotnice niezamknięte`);
    assert.deepEqual(scores(sim, 'dKo'), [0], `${msg}: dKo`);
    assert.equal(sim.ilk.counters.Sz, 1, `${msg}: licznik Sz`);
    assert.deepEqual(passesOf(w, 2), ['Sz', 'sygnał'], `${msg}: minięcia semaforów`);
    assert.equal(String(entryOf(sim, 2).actualTrack), track, `${msg}: tor przyjazdu`);
  }
});

/**
 * Dyżurny nastawni mechanicznej przy usterce semafora (i bloku przebiegowego) z nastawionym przebiegiem: pociąg stoi
 * przed semaforem – dKo, klawisz Sz; po przejeździe (przebieg `passed`) dźwignia sygnałowa na „Stój” (pierwsze
 * przełożenie gasi Sz, jeśli jeszcze świeci – `cancelSignal`), drążek, a gdy blok przebiegowy nie zwolnił się – zwalniacz.
 * Wszystko w takcie przejazdu, przed automatem (inaczej zwalniacz użyłby automat).
 */
function blockDesk(nr) {
  const st = { sz: null, pass: null };
  const fn = (sim) => {
    const e = entryOf(sim, nr), tr = e?.train, rb = faultOf(sim, 'route-block');
    if (!st.sz && faultOf(sim, 'signal-fail')?.active && tr?.entryPending && tr.v === 0 && tr.stoppedAt?.kind === 'signal') {
      const sig = sim.ilk.signals.get(tr.nextSignal()), act = sig?.route && sim.ilk.active.get(sig.route);
      if (sig?.failed && act) {
        st.sz = { sig: sig.id, route: act.id, aspect: sig.aspect, lever: act.lever, blocked: act.blocked, block: !!rb?.active };
        st.sz.dKo = sim.press({ kind: 'block', exit: e.from, btn: 'dKo' });
        st.sz.res = sim.execute({ type: 'substitute', signal: sig.id });
      }
    }
    const act = st.sz && !st.pass && sim.ilk.active.get(st.sz.route);
    if (act?.passed) {
      st.pass = { stuck: !!act.stuck, blocked: act.blocked, block: !!rb?.active, stops: 0 };
      while (act.lever && st.pass.stops < 3) { sim.execute({ type: 'stop', signal: st.sz.sig }); st.pass.stops++; }
      st.pass.lever = act.lever;
      st.pass.plain = sim.execute({ type: 'release', signal: st.sz.sig });
      st.pass.zw = sim.ilk.active.has(act.id) ? sim.execute({ type: 'release', signal: st.sz.sig, emergency: true }) : null;
    }
    autoDispatch(sim);
  };
  fn.state = st;
  return fn;
}

test('nastawnia mechaniczna: usterka semafora i bloku przebiegowego tego samego semafora – Sz i zwalniacz, oba 0 pkt; przy samej usterce semafora blok zwalnia pociąg', () => {
  for (const [from, to] of DIRS) for (const track of ['1', '2']) for (const withBlock of [true, false]) {
    const sim = faultSim(szkolna, { srk: 'mech', timetable: [os(szkolna, 2, from, to, '07:06', '07:08', track), os(szkolna, 3, from, to, '07:36', '07:38', track)] });
    const w = passWatch(sim);
    const d = blockDesk(2);
    // usterka bloku przebiegowego tego samego semafora – dopisana w takcie, w którym zaczyna się usterka semafora
    const second = (s) => { const f = faultOf(s, 'signal-fail'); if (withBlock && f?.since != null && !faultOf(s, 'route-block')) s.faults.add({ type: 'route-block', target: f.target, duration: 20 }); };
    const r = runWithFault(sim, { when: at.entrySet(2), fault: { type: 'signal-fail', target: target.entrySignal(2), duration: 20 }, dispatch: d, each: (s) => { second(s); w.each(s); }, until: '09:00' });
    const msg = label(szkolna, 'mech', 2, from, to, track, `przebieg wjazdowy nastawiony${withBlock ? ', także usterka bloku przebiegowego' : ''}`, r);
    const { sz, pass } = d.state;
    check(r, msg);
    assert.ok(sz, `${msg}: pociąg nie stanął przed semaforem z usterką`);
    assert.deepEqual([sz.lever, sz.blocked, Interlocking.isStop(sz.aspect)], [true, true, true], `${msg}: dźwignia i blok w położeniu przebiegu, semafor na „Stój” (${sz.aspect})`);
    assert.equal(sz.block, withBlock, `${msg}: usterka bloku w chwili Sz`);
    assert.equal(sz.dKo.ok && sz.res.ok, true, `${msg}: dKo / Sz (${sz.dKo.reason ?? sz.res.reason})`);
    assert.deepEqual(scores(sim, 'Sz'), [0], `${msg}: Sz`);
    assert.equal(sim.ilk.counters.Sz, 1, `${msg}: licznik Sz`);
    assert.deepEqual(passesAt(w, sz.sig), ['2: Sz', '3: sygnał'], `${msg}: minięcia ${sz.sig}`);
    assert.ok(pass, `${msg}: przebieg ${sz.route} nie przejechany`);
    assert.equal(pass.lever, false, `${msg}: dźwignia sygnałowa na „Stój”`);
    assert.deepEqual([pass.block, pass.stuck, pass.blocked], [withBlock, withBlock, withBlock], `${msg}: blok przebiegowy po przejeździe (usterka, niezwolniony, zablokowany)`);
    if (withBlock) {
      assert.equal(pass.plain.ok, false, `${msg}: drążek wrócił bez zwalniacza`);
      assert.match(pass.plain.reason, /blok przebiegowy utwierdzający zablokowany/, msg);
      assert.equal(pass.zw?.ok, true, `${msg}: zwalniacz (${pass.zw?.reason})`);
      assert.deepEqual(scores(sim, 'dPz'), [0], `${msg}: zwalniacz uzasadniony usterką`);
      assert.equal(sim.ilk.counters.dPz, 1, `${msg}: licznik zwalniacza`);
    } else {
      assert.equal(pass.plain.ok, true, `${msg}: drążek po przejeździe (${pass.plain.reason})`);
      assert.equal(pass.zw, null, `${msg}: zwalniacz niepotrzebny`);
      assert.deepEqual(scores(sim, 'dPz'), [], `${msg}: bez zwalniacza`);
      assert.equal(sim.ilk.counters.dPz, 0, `${msg}: licznik zwalniacza`);
    }
  }
});

/**
 * Obserwacja usterki napędu zwrotnicy (nastawnia mechaniczna): zwrotnica w położeniu przebiegu bez kontroli w czasie
 * usterki (`lost`), próba przełożenia drążka w tej chwili (`probe`), pierwsza chwila nastawionego przebiegu (`setAt`),
 * przebieg utwierdzony przy zwrotnicy bez kontroli (`noControl`).
 */
function pointWatch(nr, entry) {
  const st = { lost: false, probe: null, setAt: null, noControl: [] };
  const each = (sim) => {
    const f = faultOf(sim, 'point-control');
    st.setAt ??= (entry ? entryActive(sim, nr) : exitActive(sim, nr)) ? sim.clock.time : null;
    for (const a of sim.ilk.active.values()) for (const pid of a.lockedPoints) {
      const p = sim.ilk.points.get(pid);
      if (!p.control && !p.moving && st.noControl.length < 5) st.noControl.push(`${now(sim)} przebieg ${a.id} utwierdzony przy zwrotnicy ${pid} bez kontroli`);
    }
    if (!f?.active) return;
    const route = (entry ? plannedEntry(sim, nr) : plannedExit(sim, nr)).find((x) => x.points.some((q) => q.id === f.target));
    const p = sim.ilk.points.get(f.target), q = route?.points.find((x) => x.id === f.target);
    if (!q || p.position !== q.position || p.moving || p.control) return;
    st.lost = true;
    if (!st.probe && !sim.ilk.active.has(route.id)) st.probe = { route: route.id, at: now(sim), res: sim.execute({ type: 'route', id: route.id }) };
  };
  return { st, each };
}

// Tor 1 Olszyn jest na wprost (przebieg bez przestawiania zwrotnic – usterka napędu się nie objawia), więc tylko tor 2.
// Szkolna: tests/faults-signals-points.test.js.
test('Olszyny (nastawnia mechaniczna): usterka napędu zwrotnicy przebiegu wjazdowego i wyjazdowego – drążek nie zamyka przebiegu przez zwrotnicę bez kontroli, sygnał zezwalający dopiero po naprawie', () => {
  for (const [from, to] of DIRS) for (const kind of ['wjazd', 'wyjazd']) {
    const entry = kind === 'wjazd';
    const sim = faultSim(olszyny, { srk: 'mech', timetable: [os(olszyny, 2, from, to, '07:06', entry ? '07:08' : '07:10', '2')] });
    const w = passWatch(sim);
    const o = pointWatch(2, entry);
    const toMove = (s) => (entry ? plannedEntry(s, 2) : plannedExit(s, 2)).flatMap((x) => x.points).find((q) => s.ilk.points.get(q.id).position !== q.position)?.id;
    const r = runWithFault(sim, { when: entry ? at.announced(2) : at.standing(2), fault: { type: 'point-control', target: toMove, duration: 12 }, each: (s) => { o.each(s); w.each(s); }, until: '09:00' });
    const msg = label(olszyny, 'mech', 2, from, to, '2', `zwrotnica przebiegu ${entry ? 'wjazdowego (pociąg zgłoszony)' : 'wyjazdowego (pociąg przy peronie)'}`, r);
    const end = r.fault ? r.fault.since + r.fault.duration : null;
    check(r, msg);
    assert.equal(o.st.lost, true, `${msg}: zwrotnica w położeniu przebiegu bez kontroli w czasie usterki`);
    assert.ok(o.st.probe, `${msg}: drążka nie próbowano przełożyć przy zwrotnicy bez kontroli`);
    assert.equal(o.st.probe.res.ok, false, `${msg}: drążek ${o.st.probe.route} zamknął przebieg przy zwrotnicy bez kontroli (${o.st.probe.at})`);
    assert.deepEqual(o.st.probe.res.codes, ['point'], `${msg}: przeszkoda – zwrotnica (${o.st.probe.res.reason})`);
    assert.match(o.st.probe.res.reason, /bez kontroli/, msg);
    assert.ok(o.st.setAt != null && o.st.setAt >= end, `${msg}: przebieg utwierdzony o ${Clock.format(o.st.setAt ?? 0, true)}, usterka do ${Clock.format(end ?? 0, true)}`);
    assert.deepEqual(o.st.noControl, [], `${msg}: przebieg przy zwrotnicy bez kontroli`);
    assert.equal(String(entryOf(sim, 2).actualTrack), '2', `${msg}: tor przyjazdu`);
    // automat: nie zabezpiecza zwrotnicy na miejscu i nie daje Sz / rozkazu – pociąg czeka na naprawę (kary za opóźnienie
    // z czekania się tu nie sprawdza) i jedzie na sygnale zezwalającym
    assert.deepEqual(passesOf(w, 2), ['sygnał', 'sygnał'], `${msg}: minięcia semaforów`);
    assert.deepEqual([...scores(sim, 'Sz'), ...scores(sim, 'order')], [], `${msg}: Sz / rozkaz`);
  }
});
