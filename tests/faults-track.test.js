import { test } from 'node:test';
import assert from 'node:assert/strict';
import szkolna from '../src/stations/szkolna.js';
import olszyny from '../src/stations/olszyny.js';
import kalinowo from '../src/stations/kalinowo.js';
import brzezina from '../src/stations/brzezina.js';
import jodlowa from '../src/stations/jodlowa.js';
import { Interlocking } from '../src/model/Interlocking.js';
import { EMERGENCY_BRAKE } from '../src/model/Train.js';
import { faultSim, runWithFault, at, target, stuck, entryActive, exitActive, entryRoutes, Clock } from './fault-harness.js';
import { unjustified, leftovers } from '../src/model/check/outcome.js';
import { autoDispatch } from './helpers.js';

/*
 * Usterki toru w wybranej chwili jazdy pociągu (podstawa: `tests/fault-harness.js`):
 *  - false-occupancy – zajętość bez pociągu: odcinek przebiegu wjazdowego i wyjazdowego przed pociągiem i pod nim (także
 *    naprawa w trakcie jazdy przez odcinek), tor planowy i droga wjazdu przed nastawieniem przebiegu, droga nastawionego
 *    wjazdu (także bliżej niż droga hamowania), tor pod stojącym pociągiem, odcinek przebiegu wyjazdowego – Sz w czasie
 *    usterki i Sz po Pwl (Szkolna – pięć stanowisk, Kalinowo – MOR-3; wyjazd także na blokadzie samoczynnej: Brzezina,
 *    EBILock, i na Eap jednokierunkowej: Jodłowa),
 *  - route-block – blok przebiegowy niezwolniony przez pociąg (nastawnia mechaniczna: Szkolna, Olszyny),
 *  - axle-counter – licznik osi myli się przy przejeździe (MOR-3, Kalinowo), także zerowanie ZeroLO i przejazd kontrolny,
 *  - track-defect – pęknięta szyna zgłoszona przez maszynistę; dyżurny zamyka tor (ITS / Zmk) (stanowiska komputerowe:
 *    Szkolna – komputerowe, EBILock; Kalinowo – MOR-3).
 * Ruch prowadzi automat; czynności, których automat nie wykonuje (Sz przy fałszywej zajętości, ZeroLO, ITS / ITO), wykonuje
 * tu „dyżurny” testu – przez `sim.execute`, przed automatem w tym samym takcie.
 */

const PANELS = ['E', 'komputerowe', 'izh111', 'mech', 'ebilock'];
/** Stanowiska z fałszywą zajętością: pięć na Szkolnej i MOR-3 na Kalinowie (węzeł trzech szlaków). */
const DESKS = [...PANELS.map((srk) => ['szkolna', srk]), ['kalinowo', 'mor3']];
/** Stanowiska z ciągłą kontrolą sygnału (semafor gaśnie przy zajętości; w nastawni mechanicznej sygnał trzyma dźwignia). */
const LIVE = DESKS.filter(([, srk]) => srk !== 'mech');
const TRACKS = ['1', '2'];
const os = (nr, from, to, track, arr, dep, length) => ({ nr, kind: 'os', name: 'Osobowy', from, to, arr, dep, track, stop: true, length, vmax: 100, dwell: 60 });
/** Pociągi wzorcowe stacji: [numer, skąd, dokąd] i wpis rozkładu na tor `track`; `tracks` – tory na kierunek, gdy nie 1 i 2. */
const LINES = {
  szkolna: { dirs: [[6101, 'W', 'E'], [6102, 'E', 'W']], train: (nr, from, to, track) => os(nr, from, to, track, '07:06', '07:08', 130) },
  olszyny: { dirs: [[8401, 'W', 'E'], [8402, 'E', 'W']], train: (nr, from, to, track) => os(nr, from, to, track, '07:05', '07:06', 120) },
  kalinowo: { dirs: [[7201, 'W', 'E'], [7202, 'E', 'W'], [7203, 'W', 'L'], [7205, 'L', 'W']], train: (nr, from, to, track) => os(nr, from, to, track, '07:06', '07:07', 110) },
  // linia dwutorowa z blokadą samoczynną: tor 2 / 4 na Klonów, tor 1 / 3 na Topolno
  brzezina: { dirs: [[9101, 'T2', 'K2'], [9102, 'K1', 'T1']], tracks: { 9101: ['2', '4'], 9102: ['1', '3'] }, train: (nr, from, to, track) => ({ ...os(nr, from, to, track, '07:06', '07:07', 120), vmax: 120 }) },
  // linia dwutorowa z Eap jednokierunkową: tor 2 na Zalesie, tor 1 na Krasne
  jodlowa: { dirs: [[3301, 'K2', 'Z2'], [3302, 'Z1', 'K1']], tracks: { 3301: ['2'], 3302: ['1'] }, train: (nr, from, to, track) => ({ ...os(nr, from, to, track, '07:05', '07:06', 130), dwell: 45 }) },
};
const STATIONS = { szkolna, olszyny, kalinowo, brzezina, jodlowa };
const tracksOf = (stationId, nr) => LINES[stationId].tracks?.[nr] ?? TRACKS;
/** Kombinacje: [stacja, stanowisko, [numer, skąd, dokąd], tor] dla stanowisk `desks`. */
const cases = (desks) => desks.flatMap(([st, srk]) => LINES[st].dirs.flatMap((dir) => tracksOf(st, dir[0]).map((track) => [st, srk, dir, track])));

/** Odległość czoła pociągu od semafora `sig` (m) albo undefined. */
const distTo = (tr, sig) => tr.constraintsAhead(1500, true).find((c) => c.signal === sig && (c.kind === 'signal' || c.kind === 'passed-signal'))?.dist;
/** Pociąg nie zatrzyma się przed semaforem nawet hamowaniem nagłym (z zapasem 40 m). */
const tooClose = (tr, sig) => { const d = tr && distTo(tr, sig); return d != null && d > 5 && d < (tr.v * tr.v) / (2 * EMERGENCY_BRAKE) - 40; };
/** Chwile jazdy (uzupełnienie `at` z fault-harness). */
const moments = {
  ...at,
  /** sąsiad ma pozwolenie (Eap), pociąg jeszcze u niego – przebieg wjazdowy ani nastawiony, ani w nastawianiu */
  permitted: (nr) => (sim) => { const e = entryOf(sim, nr); return !!e && !e.train && !entryActive(sim, nr) && sim.blocks.get(e.from)?.direction === 'in'; },
  /** przebieg wjazdowy nastawiony, pociąg bliżej semafora wjazdowego niż droga hamowania nagłego */
  entryTooClose: (nr) => (sim) => at.entrySet(nr)(sim) && tooClose(entryOf(sim, nr).train, entryActive(sim, nr).route.start),
};

/** Cele usterek toru względem pociągu `nr` (uzupełnienie `target` z fault-harness). */
const on = {
  sectionAhead: target.sectionAhead,
  track: target.track,
  entrySignal: target.entrySignal,
  exitSignal: target.exitSignal,
  /** odcinek zwrotnicowy przebiegu wjazdowego, na którym jest pociąg (nie ostatni) */
  underTrain: (nr) => (sim) => { const a = entryActive(sim, nr); return a?.lockedSections.find((s, i) => i < a.lockedSections.length - 1 && sim.ilk.sections.get(s).physical && sim.ilk.sections.get(s).track == null); },
  /** pierwszy odcinek nastawionego przebiegu wjazdowego */
  entryFirst: (nr) => (sim) => entryActive(sim, nr)?.route.sections[0],
  /** tor docelowy nastawionego przebiegu wjazdowego (ostatni odcinek) */
  dest: (nr) => (sim) => entryActive(sim, nr)?.route.sections.at(-1),
  /** pierwszy odcinek nastawionego przebiegu wyjazdowego (za semaforem wyjazdowym) */
  exitFirst: (nr) => (sim) => exitActive(sim, nr)?.route.sections[0],
  /** odcinek przebiegu wyjazdowego przed czołem wyjeżdżającego pociągu (nie ostatni – tor szlakowy) */
  exitAhead: (nr) => (sim) => { const a = exitActive(sim, nr); return a?.lockedSections.find((s, i) => i > (a.front ?? -1) && i < a.lockedSections.length - 1 && !sim.ilk.sections.get(s).physical); },
  /** odcinek przebiegu wyjazdowego pod wyjeżdżającym pociągiem (nie ostatni) */
  exitUnder: (nr) => (sim) => { const a = exitActive(sim, nr); return a?.lockedSections.find((s, i) => i < a.lockedSections.length - 1 && sim.ilk.sections.get(s).physical); },
  /** tor planowy pociągu – ostatni odcinek przebiegu wjazdowego na ten tor */
  planned: (nr) => (sim) => plannedRoute(sim, nr)?.sections.at(-1),
  /** pierwszy odcinek przebiegu wjazdowego na tor planowy (zwrotnice głowicy) */
  plannedFirst: (nr) => (sim) => plannedRoute(sim, nr)?.sections[0],
};
const entryOf = (sim, nr) => sim.traffic.timetable().find((e) => e.nr === nr);
const plannedRoute = (sim, nr) => entryRoutes(sim, nr).find((r) => String(sim.ilk.sections.get(r.sections.at(-1)).track) === String(entryOf(sim, nr).track));
const faultOf = (sim, type) => sim.faults.list.find((f) => f.type === type);
const scores = (sim, code) => sim.score.items.filter((i) => i.code === code);
const now = (sim) => Clock.format(sim.clock.time, true);

/** Wspólne asercje przypadku: chwila nastąpiła, niezmienniki, bez spadu i rozprucia, pociągi dojechały, bez kar, stan po naprawie. */
function check(r, msg) {
  assert.equal(r.fired, true, `${msg}: chwila nie nastąpiła (usterka nie wystąpiła)`);
  assert.deepEqual(r.violations, [], `${msg}: niezmienniki`);
  assert.deepEqual(r.events, [], `${msg}: spad / rozprucie`);
  assert.deepEqual(stuck(r.sim), [], `${msg}: pociągi, które nie dojechały`);
  assert.deepEqual(unjustified(r.sim), [], `${msg}: kary za czynności wymuszone usterką`);
  assert.deepEqual(leftovers(r.sim), [], `${msg}: stan po naprawie`);
}

/** Jeden przypadek: stacja, stanowisko, pociąg na tor `track`, usterka `type` na celu `tgt` w chwili `moment`. */
function one(stationId, srk, [nr, from, to], track, moment, type, tgt, duration, { timetable, dispatch, each, setup } = {}) {
  const line = LINES[stationId];
  const sim = faultSim(STATIONS[stationId], { srk, timetable: timetable ?? [line.train(nr, from, to, track)] });
  const ctx = setup?.(sim) ?? {};
  const r = runWithFault(sim, { when: moments[moment](nr), fault: { type, target: on[tgt](nr), duration }, ...(dispatch ? { dispatch } : {}), each: each ? (s) => each(s, ctx) : null });
  const msg = `${stationId} ${srk} ${nr} ${from}→${to} tor ${track} ${moment} ${type} ${tgt}=${r.fault?.target} ${duration} min`;
  return { r, sim, msg, ctx };
}

/**
 * Dyżurny testu przy usterce na drodze wjazdu (Ie-10 §35, Ir-1 §58): pociąg `nr` stoi przed semaforem wjazdowym na „Stój”,
 * a usterka `active(sim)` trwa – zwrotnice drogi w położenie przebiegu na tor planowy, zamknięcie Zz, dKo, Sz; po przyjeździe
 * pociągu zamknięcia zdjęte. `before(sim)` – inne czynności dyżurnego (np. ZeroLO). Potem automat.
 */
function szDispatcher(nr, active, before = null) {
  const st = { locked: [], sz: null };
  const fn = (sim) => {
    before?.(sim);
    const e = entryOf(sim, nr), tr = e?.train;
    if (st.sz && e.actualArr != null) for (const id of st.locked.splice(0)) sim.execute({ type: 'lock', id });
    const r = plannedRoute(sim, nr);
    if (!st.sz && tr && tr.v === 0 && tr.stoppedAt?.kind === 'signal' && tr.stoppedAt.signal === r.start && active(sim) && Interlocking.isStop(sim.ilk.signals.get(r.start).aspect)) {
      const pts = [...r.points, ...r.flank];
      let ready = true;
      for (const q of pts) {
        const p = sim.ilk.points.get(q.id);
        if (p.position === q.position && p.control && !p.moving) continue;
        ready = false;
        if (!p.moving && !p.individualLock) sim.execute({ type: 'point', id: q.id, position: q.position });
      }
      if (ready) {
        for (const q of pts) if (!sim.ilk.points.get(q.id).individualLock && !sim.ilk.pointLockedByRoute(q.id)) { sim.execute({ type: 'lock', id: q.id }); st.locked.push(q.id); }
        sim.execute({ type: 'block', exit: e.from, btn: 'dKo' });
        st.sz = { res: sim.execute({ type: 'substitute', signal: r.start }), fault: active(sim), at: Clock.format(sim.clock.time, true) };
      }
    }
    autoDispatch(sim);
  };
  fn.state = st;
  return fn;
}

/* ------------------------------------------------------------------ */
/* false-occupancy – zajętość bez pociągu (Szkolna, Kalinowo, Brzezina) */
/* ------------------------------------------------------------------ */

/**
 * Obserwator odcinka z usterką przed czołem pociągu w przebiegu `routeOf(sim)` (Ie-4: zajętość z usterki nie jest jazdą
 * pociągu): dopóki pociąg nie dojedzie do odcinka, przebieg się nie rozwiązuje, odcinek się nie zwalnia, a czoło pociągu
 * w przebiegu na niego nie przeskakuje.
 */
const aheadWatch = (routeOf) => ({
  setup: () => ({ bad: [], route: null, reached: false }),
  each: (sim, c) => {
    const f = faultOf(sim, 'false-occupancy');
    if (!f?.active || c.reached) return;
    const s = sim.ilk.sections.get(f.target);
    c.route ??= routeOf(sim);
    if (!c.route) { c.bad.push(`${now(sim)} brak przebiegu z odcinkiem ${f.target}`); c.reached = true; return; }
    if (s.physical) { c.reached = true; return; }
    const i = c.route.lockedSections.indexOf(f.target);
    if (!sim.ilk.active.has(c.route.id)) c.bad.push(`${now(sim)} przebieg ${c.route.id} rozwiązany przed dojazdem pociągu do ${f.target}`);
    else if (c.route.released.has(f.target) || c.route.front >= i) c.bad.push(`${now(sim)} ${f.target} zwolniony / czoło pociągu na nim bez pociągu`);
  },
});

/** Obserwator odcinka z usterką pod pociągiem: dopóki wskazuje zajętość, przebieg go nie zwalnia (także po zjeździe pociągu). */
const underWatch = (routeOf) => ({
  setup: () => ({ bad: [], route: null, endedUnder: null }),
  each: (sim, c) => {
    const f = faultOf(sim, 'false-occupancy');
    if (!f) return;
    const s = sim.ilk.sections.get(f.target);
    // koniec usterki: czy pociąg był jeszcze na odcinku (naprawa, zanim zjechał)
    if (f.done && c.endedUnder == null) c.endedUnder = !!s.physical;
    if (!f.active) return;
    c.route ??= routeOf(sim);
    if (c.route && sim.ilk.active.has(c.route.id) && c.route.released.has(f.target)) c.bad.push(`${now(sim)} ${f.target} zwolniony mimo zajętości`);
  },
});

/*
 * Odcinek przebiegu wjazdowego przed pociągiem, gdy pociąg jest już w przebiegu. Zajętość z usterki nie jest wjazdem
 * pociągu: czoło pociągu w przebiegu nie przeskakuje na ten odcinek, odcinek nie zwalnia się, przebieg się nie rozwiązuje,
 * dopóki pociąg tam nie dojedzie. Gdy pociąg przejedzie odcinek, który dalej wskazuje zajętość (Szkolna, od Dębna na tor
 * 2: T2b), przebieg się nie rozwiąże – doraźne zwolnienie jest uzasadnione usterką (0 pkt, docs/sources/jazda-pociagu.md).
 */
test('false-occupancy przed pociągiem w przebiegu wjazdowym: przebieg nie rozwiązuje się przed dojazdem pociągu', () => {
  for (const [st, srk, dir, track] of cases(DESKS)) for (const dur of [2, 12]) {
    const { r, msg, ctx } = one(st, srk, dir, track, 'entering', 'false-occupancy', 'sectionAhead', dur, aheadWatch((sim) => entryActive(sim, dir[0])));
    check(r, msg);
    assert.deepEqual(ctx.bad, [], `${msg}: zajętość z usterki nie jest wjazdem pociągu`);
  }
});

/*
 * Odcinek zwrotnicowy pod pociągiem w przebiegu wjazdowym: po zjeździe pociągu dalej wskazuje zajętość, więc nie zwalnia
 * się za pociągiem, a przebieg sam się nie rozwiąże – zostaje doraźne zwolnienie (dPz / zwalniacz), uzasadnione usterką.
 */
test('false-occupancy pod pociągiem w przebiegu wjazdowym: odcinek nie zwalnia się, doraźne zwolnienie bez kary', () => {
  for (const [st, srk, dir, track] of cases(DESKS)) for (const dur of [2, 12]) {
    const { r, sim, msg, ctx } = one(st, srk, dir, track, 'entering', 'false-occupancy', 'underTrain', dur, underWatch((s) => entryActive(s, dir[0])));
    check(r, msg);
    assert.deepEqual(ctx.bad, [], msg);
    assert.equal(ctx.endedUnder, false, `${msg}: usterka trwa po zjeździe pociągu z odcinka`);
    assert.ok(scores(sim, 'dPz').length >= 1, `${msg}: przebieg rozwiązał się bez doraźnego zwolnienia`);
    assert.ok(scores(sim, 'dPz').every((i) => i.points === 0), `${msg}: doraźne zwolnienie uzasadnione usterką`);
  }
});

/*
 * To samo w przebiegu wyjazdowym: pociąg wyjeżdża (minął semafor wyjazdowy), zajętość z usterki na odcinku przed nim
 * (głowica) nie przesuwa czoła i nie rozwiązuje przebiegu; odcinek pod nim nie zwalnia się, a przebieg, który po
 * przejeździe przy trwającej usterce sam się nie rozwiąże, zwalnia się doraźnie bez kary.
 */
test('false-occupancy w przebiegu wyjazdowym przed pociągiem i pod nim: przebieg nie „przejeżdża” sam, doraźne zwolnienie bez kary', () => {
  for (const [st, srk, dir, track] of cases(DESKS)) for (const dur of [2, 12]) {
    const x = one(st, srk, dir, track, 'leaving', 'false-occupancy', 'exitAhead', dur, aheadWatch((sim) => exitActive(sim, dir[0])));
    check(x.r, x.msg);
    assert.deepEqual(x.ctx.bad, [], `${x.msg}: zajętość z usterki nie jest jazdą pociągu`);
    const u = one(st, srk, dir, track, 'leaving', 'false-occupancy', 'exitUnder', dur, underWatch((sim) => exitActive(sim, dir[0])));
    check(u.r, u.msg);
    assert.deepEqual(u.ctx.bad, [], u.msg);
    assert.equal(u.ctx.endedUnder, false, `${u.msg}: usterka trwa po zjeździe pociągu z odcinka`);
    assert.ok(scores(u.sim, 'dPz').length >= 1 && scores(u.sim, 'dPz').every((i) => i.points === 0), `${u.msg}: doraźne zwolnienie uzasadnione usterką`);
  }
});

/*
 * Naprawa w trakcie jazdy przez odcinek. Usterka 3 s – minęła, zanim pociąg zjechał z odcinka: odcinek zwalnia się za
 * pociągiem jak zwykle, przebieg rozwiązuje się sam, doraźnego zwolnienia nie ma. Usterka 30 s – pociąg zjeżdża przy
 * trwającej usterce (5–23 s), naprawa przychodzi, zanim albo gdy przebieg czeka na doraźne zwolnienie: odcinek nie zwalnia
 * się, dopóki usterka trwa, a po naprawie przebieg nie zostaje (ani kary, ani wiszącego przebiegu). Wjazd i wyjazd.
 */
test('false-occupancy pod pociągiem naprawiona w trakcie jazdy: przebieg rozwiązuje się bez kary (naprawa przed zjazdem – sam)', () => {
  for (const [st, srk, dir, track] of cases(DESKS)) for (const [moment, tgt, routeOf] of [['entering', 'underTrain', entryActive], ['leaving', 'exitUnder', exitActive]]) for (const dur of [0.05, 0.5]) {
    const { r, sim, msg, ctx } = one(st, srk, dir, track, moment, 'false-occupancy', tgt, dur, underWatch((s) => routeOf(s, dir[0])));
    check(r, msg);
    assert.deepEqual(ctx.bad, [], msg);
    assert.equal(ctx.endedUnder, dur < 0.1, `${msg}: usterka minęła ${dur < 0.1 ? 'przed' : 'po'} zjeździe pociągu z odcinka`);
    if (ctx.endedUnder) assert.deepEqual(scores(sim, 'dPz').map((i) => i.msg), [], `${msg}: przebieg rozwiązał się sam`);
  }
});

/*
 * Zajętość toru planowego albo drogi wjazdu, zanim przebieg wjazdowy jest nastawiony (sąsiad ma pozwolenie, pociąg jeszcze
 * u niego): przebieg nie utwierdza się nad odcinkiem zajętym (także z usterki), a zwrotnic na nim się nie przestawia
 * (niezmiennik w `src/model/check/invariants.js`); wjazd po naprawie.
 */
test('false-occupancy toru planowego i drogi wjazdu przed nastawieniem: przebieg nie utwierdza się nad zajętym odcinkiem', () => {
  for (const [st, srk, dir, track] of cases(DESKS)) for (const tgt of ['planned', 'plannedFirst']) for (const dur of [2, 12]) {
    const { r, msg, ctx } = one(st, srk, dir, track, 'permitted', 'false-occupancy', tgt, dur, {
      setup: (sim) => {
        const c = { bad: [], preset: null };
        sim.bus.on('route', (x) => {
          const a = x.state === 'set' && sim.ilk.active.get(x.id), f = faultOf(sim, 'false-occupancy');
          if (a && f?.active && a.lockedSections.includes(f.target)) c.bad.push(`${now(sim)} ${x.id} utwierdzony nad zajętym ${f.target}`);
        });
        return c;
      },
      each: (sim, c) => { if (c.preset == null && faultOf(sim, 'false-occupancy')?.active) c.preset = entryActive(sim, dir[0])?.id ?? false; },
    });
    check(r, msg);
    assert.equal(ctx.preset, false, `${msg}: przebieg wjazdowy nastawiony przed usterką`);
    assert.deepEqual(ctx.bad, [], msg);
  }
});

/*
 * Nastawiony wjazd, pociąg jeszcze na szlaku: zajętość toru docelowego albo pierwszego odcinka drogi przebiegu. Stała
 * kontrola warunków sygnału (Ie-4 §30, §39) – semafor wjazdowy od razu na „Stój”, a usterka na jego drodze uzasadnia Sz
 * (`faultOnPath`); pociąg zatrzymuje się przed semaforem (bez minięcia go na „Stój”). Nastawnia mechaniczna: sygnał
 * trzyma dźwignia – obrazu się tu nie sprawdza.
 */
test('false-occupancy drogi nastawionego wjazdu: semafor na „Stój”, Sz uzasadniony, pociąg staje przed semaforem', () => {
  for (const [st, srk, dir, track] of cases(DESKS)) for (const tgt of ['dest', 'entryFirst']) for (const dur of [2, 12]) {
    const { r, msg, ctx } = one(st, srk, dir, track, 'entrySet', 'false-occupancy', tgt, dur, {
      setup: (sim) => { const c = { first: null, spad: [] }; sim.bus.on('alarm', (a) => { if (a.type === 'spad') c.spad.push(a.signal); }); return c; },
      each: (sim, c) => {
        const f = faultOf(sim, 'false-occupancy');
        if (!f?.active || c.first) return;
        const sig = entryActive(sim, dir[0])?.route.start;
        c.first = { sig, aspect: sim.ilk.signals.get(sig)?.aspect, justified: sim.ilk.faultOnPath(sig) };
      },
    });
    check(r, msg);
    assert.equal(ctx.first?.justified, true, `${msg}: usterka na drodze za ${ctx.first?.sig} uzasadnia Sz`);
    if (srk !== 'mech') assert.ok(Interlocking.isStop(ctx.first.aspect), `${msg}: ${ctx.first.sig} pokazuje ${ctx.first.aspect} nad zajętym odcinkiem`);
    assert.deepEqual(ctx.spad, [], `${msg}: pociąg na szlaku minął semafor na „Stój”`);
  }
});

/*
 * Semafor wjazdowy gaśnie z powodu zajętości z usterki bliżej niż droga hamowania nagłego: pociąg przejeżdża „Stój” bez
 * kary dla dyżurnego (przyczyna po stronie urządzeń – `faultDrop`, docs/sources/jazda-pociagu.md), staje za semaforem i jedzie dalej na
 * rozkaz „S” (0 pkt). Blokada Eap nie stwierdziła przejazdu, więc Ko wymaga dKo – a dKo po wjeździe kosztuje −10, choć
 * dyżurny nie miał kiedy użyć go przed wjazdem; ten sam błąd przy usterce semafora: `tests/faults-signals-points.test.js`.
 */
test('false-occupancy drogi wjazdu tuż przed pociągiem: przejazd „Stój” bez kary, rozkaz „S” i dKo bez kary', () => {
  for (const [st, srk, dir, track] of cases(LIVE)) for (const tgt of ['dest', 'entryFirst']) {
    const { r, sim, msg, ctx } = one(st, srk, dir, track, 'entryTooClose', 'false-occupancy', tgt, 12, {
      setup: (s) => { const c = { spad: [], sig: null }; s.bus.on('alarm', (a) => { if (a.type === 'spad') c.spad.push(a.signal); }); return c; },
      each: (s, c) => { c.sig ??= entryActive(s, dir[0])?.route.start ?? null; },
    });
    assert.equal(r.fired, true, `${msg}: chwila nie nastąpiła`);
    assert.deepEqual(ctx.spad, [ctx.sig], `${msg}: pociąg przejechał semafor wjazdowy na „Stój”`);
    assert.deepEqual(scores(sim, 'spad').map((i) => i.msg), [], `${msg}: przejazd „Stój” z usterki bez kary`);
    assert.deepEqual(scores(sim, 'order').map((i) => i.points), [0], `${msg}: rozkaz „S” zza semafora uzasadniony`);
    check(r, msg);
  }
});

/*
 * To samo z Sz: pociąg stoi przed semaforem wjazdowym, zajętość toru docelowego trwa (usterka długa), dyżurny ustawia
 * i zamyka (Zz) zwrotnice drogi, dKo i Sz. Sz uzasadniony usterką – 0 pkt, bez kary za zwrotnice; pociąg wjeżdża na tor planowy.
 */
test('false-occupancy toru docelowego: wjazd na Sz przy trwającej usterce – Sz bez kary, dKo przed Sz bez kary', () => {
  for (const [st, srk, dir, track] of cases(LIVE)) {
    const d = szDispatcher(dir[0], (sim) => !!faultOf(sim, 'false-occupancy')?.active);
    const { r, sim, msg } = one(st, srk, dir, track, 'entrySet', 'false-occupancy', 'dest', 12, { dispatch: d });
    check(r, msg);
    assert.equal(d.state.sz?.res.ok, true, `${msg}: Sz nie podany (${d.state.sz?.res.reason ?? 'pociąg nie stanął przed semaforem'})`);
    assert.equal(d.state.sz.fault, true, `${msg}: Sz podany w czasie usterki`);
    assert.deepEqual(scores(sim, 'Sz').map((i) => i.points), [0], `${msg}: Sz uzasadniony usterką`);
    assert.deepEqual(scores(sim, 'dKo').map((i) => i.points), [0], `${msg}: dKo przed wjazdem na Sz`);
    assert.equal(String(entryOf(sim, dir[0]).actualTrack), track, `${msg}: pociąg na torze planowym`);
  }
});

/*
 * Tor pod stojącym pociągiem: zajętość z usterki nie dotyczy przebiegu wyjazdowego (jego odcinki są za semaforem
 * wyjazdowym) – pociąg odjeżdża na sygnał zezwalający, bez Sz i rozkazu.
 */
test('false-occupancy toru pod stojącym pociągiem: wyjazd na sygnał zezwalający, bez Sz i rozkazu', () => {
  for (const [st, srk, dir, track] of cases(DESKS)) for (const dur of [2, 12]) {
    const { r, sim, msg } = one(st, srk, dir, track, 'standing', 'false-occupancy', 'track', dur);
    check(r, msg);
    assert.deepEqual([...scores(sim, 'Sz'), ...scores(sim, 'order')].map((i) => i.msg), [], `${msg}: wyjazd bez sygnału zezwalającego`);
  }
});

/*
 * Odcinek nastawionego przebiegu wyjazdowego, pociąg jeszcze stoi. Nastawnia mechaniczna: sygnał trzyma dźwignia, pociąg
 * odjeżdża; odcinek, który po przejeździe dalej wskazuje zajętość (usterka długa), zwalnia się zwalniaczem (0 pkt).
 */
test('false-occupancy przebiegu wyjazdowego, nastawnia mechaniczna: wyjazd bez kar, zwalniacz uzasadniony usterką', () => {
  for (const [st, srk, dir, track] of cases([['szkolna', 'mech']])) for (const dur of [2, 12]) {
    const { r, sim, msg } = one(st, srk, dir, track, 'exitSet', 'false-occupancy', 'exitFirst', dur);
    check(r, msg);
    assert.deepEqual([...scores(sim, 'Sz'), ...scores(sim, 'order')].map((i) => i.msg), [], `${msg}: wyjazd na sygnał zezwalający (dźwignia)`);
    if (dur === 12) assert.ok(scores(sim, 'dPz').length >= 1, `${msg}: przebieg nad odcinkiem z usterką zwolniony zwalniaczem`);
  }
});

/**
 * Dyżurny testu przy zajętości z usterki na drodze wyjazdu (Ie-10 §32 ust. 5, §35): semafor wyjazdowy zgasł, przebieg zostaje
 * utwierdzony (dyżurny go nie zwalnia – automat czeka), a gdy pociąg może odjechać, dyżurny w czasie usterki podaje Sz. Potem automat.
 */
function szExitDispatcher(nr) {
  const st = { sz: null };
  const fn = (sim) => {
    const e = entryOf(sim, nr), tr = e?.train, a = exitActive(sim, nr);
    if (!st.sz && tr && a && !a.trainEntered && a.faultDrop && faultOf(sim, 'false-occupancy')?.active) {
      if (tr.v > 0 || sim.clock.time < e.depTime) return; // przebieg trzyma dyżurny
      st.sz = { res: sim.execute({ type: 'substitute', signal: a.route.start }), at: now(sim) };
    }
    autoDispatch(sim);
  };
  fn.state = st;
  return fn;
}

/*
 * Stanowiska z ciągłą kontrolą sygnału: semafor wyjazdowy spada na „Stój” (usterka), dyżurny w czasie usterki wyprawia pociąg
 * na Sz – Sz uzasadniony usterką na drodze (0 pkt), blok początkowy doraźnie (dPo, 0 pkt), odcinek nad usterką zwalnia się
 * doraźnie (0 pkt).
 */
test('false-occupancy przebiegu wyjazdowego: Sz w czasie usterki bez kary, dPo bez kary', () => {
  for (const [st, srk, dir, track] of cases(LIVE)) {
    const d = szExitDispatcher(dir[0]);
    const { r, sim, msg } = one(st, srk, dir, track, 'exitSet', 'false-occupancy', 'exitFirst', 12, { dispatch: d });
    check(r, msg);
    assert.equal(d.state.sz?.res.ok, true, `${msg}: Sz nie podany (${d.state.sz?.res.reason ?? 'semafor nie zgasł z usterki'})`);
    assert.deepEqual(scores(sim, 'Sz').map((i) => i.points), [0], `${msg}: Sz uzasadniony usterką`);
    assert.deepEqual(scores(sim, 'dPo').map((i) => i.points), [0], `${msg}: dPo po wyjeździe na Sz`);
  }
});

/*
 * Blokada samoczynna (SBL) nie ma przeciwwtórności Pwl: po spadku sygnału wyjazdowego z usterki i naprawie przebieg
 * nastawia się od nowa i pociąg odjeżdża na sygnał zezwalający – bez Sz i rozkazu.
 */
test('false-occupancy przebiegu wyjazdowego na blokadzie samoczynnej (Brzezina, SBL): po naprawie sygnał zezwalający', () => {
  for (const [st, srk, dir, track] of cases([['brzezina', 'ebilock']])) for (const dur of [2, 12]) {
    const { r, sim, msg } = one(st, srk, dir, track, 'exitSet', 'false-occupancy', 'exitFirst', dur);
    check(r, msg);
    assert.deepEqual([...scores(sim, 'Sz'), ...scores(sim, 'order')].map((i) => i.msg), [], `${msg}: wyjazd na sygnał zezwalający`);
  }
});

/*
 * Blokada Eap (dwukierunkowa – Szkolna, Kalinowo; jednokierunkowa – Jodłowa): semafor wyjazdowy spada na „Stój” (usterka),
 * przebieg zwalnia się, a nowego sygnału na ten szlak już nie będzie (przeciwwtórność Pwl) – pociąg wyprawia się na Sz. Sz
 * jest wymuszony usterką (jak rozkaz „S” po spadku z usterki – `faultDrop` w `Traffic.issueOrder`), ale po jej ustaniu
 * `faultOnPath` go nie uzasadnia: −5 pkt „bez usterki urządzeń”.
 */
test('false-occupancy przebiegu wyjazdowego: Sz wymuszony przez Pwl po spadku sygnału z usterki – bez kary', () => {
  for (const [st, srk, dir, track] of cases([...LIVE, ['jodlowa', 'E']])) for (const dur of [2, 12]) {
    const { r, msg } = one(st, srk, dir, track, 'exitSet', 'false-occupancy', 'exitFirst', dur);
    check(r, msg);
  }
});

/* ------------------------------------------------------------------ */
/* route-block – nastawnia mechaniczna (Szkolna, Olszyny)               */
/* ------------------------------------------------------------------ */

/*
 * Urządzenie oddziaływania za semaforem nie zwalnia bloku przebiegowego (E16 §8 ust. 19): pociąg przejechał, a blok zostaje
 * zablokowany wtedy i tylko wtedy, gdy usterka trwa w chwili przejazdu; drążek cofa się tylko zwalniaczem – liczonym jak dPz,
 * uzasadnionym usterką (0 pkt). Przy sprawnym urządzeniu zwalniacza się nie używa.
 */
test('route-block: blok przebiegowy niezwolniony przez pociąg tylko przy usterce, zwalniacz bez kary', () => {
  for (const stationId of ['szkolna', 'olszyny']) for (const dir of LINES[stationId].dirs) for (const track of TRACKS)
    for (const [moment, tgt] of [['entrySet', 'entrySignal'], ['entering', 'entrySignal'], ['exitSet', 'exitSignal'], ['leaving', 'exitSignal']]) for (const dur of [1, 30]) {
      const { r, sim, msg, ctx } = one(stationId, 'mech', dir, track, moment, 'route-block', tgt, dur, {
        setup: (s) => {
          const c = { passes: [] };
          s.bus.on('route', (x) => {
            const a = x.state === 'passed' && s.ilk.active.get(x.id), f = faultOf(s, 'route-block');
            if (a && f && a.route.kind === 'train' && a.route.start === f.target) c.passes.push({ id: x.id, stuck: !!a.stuck, fault: f.active });
          });
          return c;
        },
      });
      check(r, msg);
      assert.ok(ctx.passes.length >= 1, `${msg}: pociąg nie przejechał przebiegu od ${r.fault?.target}`);
      for (const p of ctx.passes) assert.equal(p.stuck, p.fault, `${msg}: ${p.id} – blok ${p.stuck ? 'niezwolniony' : 'zwolniony'} przy ${p.fault ? 'usterce' : 'sprawnym urządzeniu'}`);
      if (dur === 30) assert.ok(ctx.passes.some((p) => p.stuck), `${msg}: przy trwającej usterce blok niezwolniony`);
      assert.equal(scores(sim, 'dPz').length, ctx.passes.filter((p) => p.stuck).length, `${msg}: zwalniacz tylko przy bloku niezwolnionym`);
      assert.equal(sim.ilk.counters.dPz, scores(sim, 'dPz').length, `${msg}: licznik zwalniacza`);
    }
});

/* ------------------------------------------------------------------ */
/* axle-counter – licznik osi (MOR-3, Kalinowo)                         */
/* ------------------------------------------------------------------ */

/** Chwile i cele usterki licznika osi: odcinek drogi wjazdu, odcinek przed pociągiem, tor docelowy, odcinek za semaforem wyjazdowym. */
const AXLE_CASES = [['entrySet', 'entryFirst'], ['entering', 'sectionAhead'], ['entering', 'dest'], ['exitSet', 'exitFirst']];

/*
 * Licznik osi myli się przy najbliższym przejeździe: usterka pojawia się dopiero, gdy pociąg zjedzie z odcinka (nie w chwili
 * dodania i nie pod pociągiem); bez zerowania usuwa ją automatyk po czasie usterki. Trzy linie węzła, oba tory.
 */
test('axle-counter: usterka po zjeździe pociągu z odcinka, po naprawie stan zasadniczy', () => {
  for (const dir of LINES.kalinowo.dirs) for (const track of TRACKS) for (const [moment, tgt] of AXLE_CASES) for (const dur of [3, 15]) {
    const { r, msg, ctx } = one('kalinowo', 'mor3', dir, track, moment, 'axle-counter', tgt, dur, {
      setup: () => ({ onset: null }),
      each: (sim, c) => {
        const f = faultOf(sim, 'axle-counter');
        if (!f?.active || c.onset) return;
        c.onset = { physical: !!sim.ilk.sections.get(f.target).physical, seen: !!f.trainSeen, occupied: sim.ilk.sections.get(f.target).occupied };
      },
    });
    check(r, msg);
    assert.deepEqual(ctx.onset, { physical: false, seen: true, occupied: true }, `${msg}: usterka po zjeździe pociągu – odcinek zajęty bez taboru`);
  }
});

/*
 * „Po zjeździe pociągu odcinek dalej wskazuje zajętość” (docs/sources/stanowiska-komputerowe.md, MOR-3): odcinek z usterką licznika ani na chwilę
 * nie pokazuje się wolny po zjeździe pociągu. Dziś usterka pojawia się takt później (`Faults.tick` biegnie przed ruchem
 * i zajętością), a w tym takcie odcinek jest wolny – przebieg zwalnia go jak po zwykłym przejeździe.
 */
test('axle-counter: odcinek nie pokazuje się wolny między zjazdem pociągu a usterką licznika', () => {
  for (const dir of LINES.kalinowo.dirs) for (const track of TRACKS) for (const [moment, tgt] of AXLE_CASES.slice(0, 2)) {
    const { r, msg, ctx } = one('kalinowo', 'mor3', dir, track, moment, 'axle-counter', tgt, 10, {
      setup: () => ({ bad: [], was: false }),
      each: (sim, c) => {
        const f = faultOf(sim, 'axle-counter');
        if (!f || f.done) return;
        const s = sim.ilk.sections.get(f.target);
        if (s.physical) c.was = true;
        else if (c.was && !s.occupied) c.bad.push(`${Clock.format(sim.clock.time, true)} ${f.target} wolny po zjeździe pociągu`);
      },
    });
    check(r, msg);
    assert.deepEqual(ctx.bad, [], msg);
  }
});

/*
 * Zerowanie licznika (ZeroLO) i przejazd kontrolny: pierwszy pociąg zostawia tor planowy „zajęty”; dyżurny zeruje licznik,
 * a następny pociąg na ten tor wjeżdża na Sz (zwrotnice ustawione i zamknięte Zz, dKo przed Sz). Sz uzasadniony usterką
 * licznika (0 pkt); usterkę kończy przejazd kontrolny (wjazd i wyjazd), nie automatyk.
 */
test('axle-counter: ZeroLO i przejazd kontrolny na Sz – Sz bez kary, usterka usunięta przejazdem', () => {
  for (const [first, second] of [[[7201, 'W', 'E'], [7202, 'E', 'W']], [[7202, 'E', 'W'], [7201, 'W', 'E']]]) for (const track of TRACKS) {
    const zeroLo = (sim) => {
      const f = faultOf(sim, 'axle-counter'), s = f?.active && sim.ilk.sections.get(f.target);
      if (s && !s.resetPending && !s.route && !s.physical) sim.execute({ type: 'axle-reset', section: f.target });
    };
    const d = szDispatcher(second[0], (sim) => !!faultOf(sim, 'axle-counter')?.active, zeroLo);
    const timetable = [LINES.kalinowo.train(...first, track), { ...LINES.kalinowo.train(...second, track), arr: '07:20', dep: '07:21' }];
    const { r, sim, msg } = one('kalinowo', 'mor3', first, track, 'entering', 'axle-counter', 'dest', 60, { timetable, dispatch: d });
    check(r, msg);
    assert.equal(d.state.sz?.res.ok, true, `${msg}: Sz dla ${second[0]} nie podany (${d.state.sz?.res.reason ?? 'pociąg nie stanął przed semaforem'})`);
    assert.deepEqual(scores(sim, 'Sz').map((i) => i.points), [0], `${msg}: Sz uzasadniony usterką licznika`);
    assert.equal(r.fault.pilot, 'done', `${msg}: usterkę usunął przejazd kontrolny`);
    assert.equal(String(entryOf(sim, second[0]).actualTrack), track, `${msg}: przejazd kontrolny torem planowym`);
  }
});

/* ------------------------------------------------------------------ */
/* track-defect – pęknięta szyna (stanowiska komputerowe)               */
/* ------------------------------------------------------------------ */

/** Stanowiska komputerowe, na których dyżurny zamyka tor dla ruchu (ITS / ITO; MOR-3: Zmk / oZmk). */
const ITS_DESKS = [['szkolna', 'komputerowe'], ['szkolna', 'ebilock'], ['kalinowo', 'mor3']];

/**
 * Dyżurny testu przy pękniętej szynie (docs/sources/stanowiska-komputerowe.md, EBILock): tor zamknąć (ITS) – najpierw zwolnić (Pz) przebieg, który
 * na niego prowadzi, a którym pociąg jeszcze nie jedzie; po naprawie otworzyć (ITO), gdy żaden pociąg nie jest w drodze na
 * stację. Potem automat (tor zamknięty – inny tor).
 */
function itsDispatcher(sim) {
  for (const f of sim.faults.list.filter((x) => x.type === 'track-defect')) {
    const s = sim.ilk.sections.get(f.target);
    if (f.active && !s.closed) {
      const act = s.route && sim.ilk.active.get(s.route);
      if (act && !act.trainEntered) sim.execute({ type: 'release', signal: act.route.start });
      sim.execute({ type: 'close-section', section: f.target, closed: true });
    }
    const coming = sim.traffic.timetable().some((e) => e.train && !e.train.finished && e.from && e.actualArr == null);
    if (f.done && s.closedByOrder && !coming) sim.execute({ type: 'close-section', section: f.target, closed: false });
  }
  autoDispatch(sim);
}

/*
 * Pęknięta szyna na torze planowym pociągu, który jedzie do stacji (przebieg jeszcze nienastawiony albo nastawiony):
 * po zamknięciu toru (ITS) pociąg wjeżdża na inny tor – bez jazdy po torze z usterką i bez kary za zmianę toru.
 */
test('track-defect na torze planowym: tor zamknięty (ITS), pociąg na innym torze, bez kar', () => {
  for (const [st, srk, dir, track] of cases(ITS_DESKS)) for (const moment of ['onLineIn', 'entrySet']) for (const dur of [4, 20]) {
    const { r, sim, msg } = one(st, srk, dir, track, moment, 'track-defect', 'planned', dur, { dispatch: itsDispatcher });
    check(r, msg);
    assert.deepEqual([...scores(sim, 'track-defect'), ...scores(sim, 'wrong-track')].map((i) => i.msg), [], `${msg}: jazda po torze z usterką / kara za zmianę toru`);
    assert.notEqual(String(entryOf(sim, dir[0]).actualTrack), track, `${msg}: pociąg przyjęty na inny tor`);
    assert.ok(![...sim.ilk.sections.values()].some((s) => s.closedByOrder), `${msg}: tor otwarty po naprawie (ITO)`);
  }
});

/*
 * Usterkę zgłasza maszynista pociągu stojącego na torze: ten pociąg zjeżdża bez kary; następny pociąg planowo na ten tor
 * (z przeciwnego kierunku) wjeżdża po zamknięciu toru na inny tor albo – po naprawie i ITO – na tor planowy.
 */
test('track-defect pod stojącym pociągiem: zgłaszający zjeżdża bez kary, następny pociąg omija tor zamknięty', () => {
  for (const [st, srk] of ITS_DESKS) for (const track of TRACKS) for (const dur of [4, 20]) {
    const [a, b] = LINES[st].dirs;
    const timetable = [LINES[st].train(...a, track), { ...LINES[st].train(...b, track), arr: '07:17', dep: '07:19' }];
    const { r, sim, msg } = one(st, srk, a, track, 'standing', 'track-defect', 'track', dur, { timetable, dispatch: itsDispatcher });
    check(r, msg);
    assert.deepEqual([...scores(sim, 'track-defect'), ...scores(sim, 'wrong-track')].map((i) => i.msg), [], `${msg}: jazda po torze z usterką / kara za zmianę toru`);
    if (dur === 20) assert.notEqual(String(entryOf(sim, b[0]).actualTrack), track, `${msg}: ${b[0]} przyjęty na inny tor`);
  }
});

/*
 * Semafor wjazdowy gaśnie z powodu zajętości z usterki bliżej niż droga hamowania, a usterka mija, zanim dyżurny wypisze
 * rozkaz „S” na dalszą jazdę zza semafora. Na drodze nie ma już usterki (`faultOnPath` – nie), ale przebieg zgasł z przyczyny
 * po stronie urządzeń (`faultDrop`) – rozkaz wymuszony przejazdem „Stój” z usterki jest uzasadniony (0 pkt).
 */
test('false-occupancy drogi wjazdu tuż przed pociągiem, naprawiona przed rozkazem: rozkaz „S” zza semafora bez kary (faultDrop)', () => {
  for (const [st, srk, dir, track] of cases(LIVE)) for (const tgt of ['dest', 'entryFirst']) {
    // automat wypisuje rozkaz dopiero po naprawie: póki pociąg stoi za semaforem, a usterka trwa – czeka
    const writing = (s) => s.traffic.trains.some((tr) => tr.stoppedAt?.kind === 'spad') && !!faultOf(s, 'false-occupancy')?.active;
    const { r, sim, msg, ctx } = one(st, srk, dir, track, 'entryTooClose', 'false-occupancy', tgt, 1, {
      dispatch: (s) => { if (!writing(s)) autoDispatch(s); },
      setup: (s) => { const c = { spad: [], faultAtOrder: null }; s.bus.on('alarm', (a) => { if (a.type === 'spad') c.spad.push(a.signal); }); s.bus.on('score', (i) => { if (i.code === 'order') c.faultAtOrder ??= !!faultOf(s, 'false-occupancy')?.active; }); return c; },
    });
    assert.equal(r.fired, true, `${msg}: chwila nie nastąpiła`);
    assert.equal(ctx.spad.length, 1, `${msg}: pociąg przejechał semafor wjazdowy na „Stój”`);
    assert.equal(ctx.faultAtOrder, false, `${msg}: rozkaz wypisany po naprawie`);
    assert.deepEqual(scores(sim, 'spad').map((i) => i.msg), [], `${msg}: przejazd „Stój” z usterki bez kary`);
    assert.deepEqual(scores(sim, 'order').map((i) => i.points), [0], `${msg}: rozkaz „S” zza semafora uzasadniony (faultDrop)`);
    assert.deepEqual(stuck(sim), [], `${msg}: pociągi, które nie dojechały`);
  }
});
