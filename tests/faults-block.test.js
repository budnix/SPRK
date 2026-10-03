import { test } from 'node:test';
import assert from 'node:assert/strict';
import szkolna from '../src/stations/szkolna.js';
import kalinowo from '../src/stations/kalinowo.js';
import jodlowa from '../src/stations/jodlowa.js';
import brzezina from '../src/stations/brzezina.js';
import { EventBus } from '../src/core/EventBus.js';
import { LineBlock } from '../src/model/Block.js';
import { Interlocking } from '../src/model/Interlocking.js';
import { faultSim, runWithFault, at, target, stuck, exitActive, Clock } from './fault-harness.js';
import { unjustified, leftovers } from '../src/model/check/outcome.js';
import { autoDispatch, routeViews } from './helpers.js';

/*
 * Usterka blokady liniowej (block-fail: brak łączności elektrycznej – zapowiadanie telefoniczne) w stałych chwilach jazdy
 * pociągu: przyjeżdżającego (przed zgłoszeniem, przy żądaniu pozwolenia, po Poz, na szlaku, przy wjeździe, przy Ko)
 * i odjeżdżającego (przed Wbl, po Wbl, z pozwoleniem, przy przebiegu wyjazdowym, w przebiegu, na szlaku, u sąsiada przed
 * jego Ko). Każda chwila w wariantach: usterka do końca jazdy, naprawa w następnej chwili (w trakcie procedury) i – dla
 * chwil przed wyjazdem na szlak – naprawa, gdy pociąg jest już na szlaku. Rodzaje blokad: Eap dwukierunkowa (Szkolna – pięć
 * stanowisk, Kalinowo – MOR-3), Eap jednokierunkowa (Jodłowa), samoczynna SBL (Brzezina); do tego krzyżowanie na szlaku
 * jednotorowym, dwa pociągi po sobie i przelot (pociąg bez postoju jedzie na sygnał zezwalający semafora wyjazdowego).
 *
 * Poza niezmiennikami stacji (`violations`) sprawdzany jest szlak, którego te nie widzą: najwyżej jeden pociąg na torze
 * szlakowym, blokada zajęta, gdy jest na nim pociąg, nasz pociąg nie wjeżdża na szlak, na który sąsiad ma pozwolenie albo
 * „droga wolna”. Reguły przy zapowiadaniu (docs/sources/sygnaly-i-blokada.md, „Blokada liniowa Eap”): sygnał zezwalający na szlak
 * dwukierunkowy tylko z niewykorzystanym pozwoleniem sprzed utraty łączności (stan blokady tuż przed usterką zapamiętuje
 * test, nie silnik), poza tym Sz; po wyjeździe bez blokady – dPo (0 pkt); przyjazd potwierdza telefonogram (dKo się nie
 * używa); przyjazd i odjazd nie giną.
 */

const ALL = ['eap2', 'eap1', 'sbl'];
const EAP = ['eap2', 'eap1'];
const LONG = 20; // min – usterka trwa do końca jazdy pociągu
const entry = (sim, nr) => sim.traffic.timetable().find((e) => e.nr === nr);
const lineIn = (sim, nr) => sim.blocks.get(entry(sim, nr).from);
const lineOut = (sim, nr) => sim.blocks.get(entry(sim, nr).to);
/** rodzaj blokady wyjazdu `exitId`: Eap dwukierunkowa, Eap jednokierunkowa, SBL */
const kindOf = (station, exitId) => (station.exits[exitId].block === 'sbl' ? 'sbl' : station.exits[exitId].direction ? 'eap1' : 'eap2');

/** Pociąg wyjeżdża: minął semafor wyjazdowy, jeszcze nie na szlaku. */
const inExitRoute = (nr) => (sim) => { const a = exitActive(sim, nr); return !!a?.entered && !lineOut(sim, nr).occupied; };
/** Nasz pociąg na torze szlakowym (blokada zajęta tym pociągiem). */
const onLineOut = (nr) => (sim) => { const b = lineOut(sim, nr); return b.occupied && b.lineOurs && String(b.lineTrain) === String(nr); };
const ON_LINE_IN = ['pociąg na szlaku', (nr) => at.onLineIn(nr)];
const ON_LINE_OUT = ['pociąg na szlaku', onLineOut];

/**
 * Chwile pociągu przyjeżdżającego (usterka na szlaku, z którego przyjeżdża): `when` – początek usterki, `fix` – chwila
 * naprawy w wariancie „w trakcie”, `mid` – naprawa, gdy pociąg jest już na szlaku, `kinds` – rodzaje blokad, na których
 * ta chwila istnieje.
 */
const IN = [
  { name: 'przed zgłoszeniem pociągu', kinds: ALL, mid: ON_LINE_IN,
    when: (nr) => (sim) => { const e = entry(sim, nr); return !e.requested && sim.clock.time >= e.requestAt - 30; },
    fix: ['sąsiad zgłosił pociąg', (nr) => (sim) => entry(sim, nr).requested] },
  { name: 'żądanie pozwolenia, przed Poz', kinds: ['eap2'], mid: ON_LINE_IN, when: (nr) => (sim) => lineIn(sim, nr).request === 'theirs',
    fix: ['droga wolna dana telefonicznie', (nr) => (sim) => lineIn(sim, nr).phone.clearedFor != null] },
  { name: 'po Poz, przed wyprawieniem', kinds: ALL,
    when: (nr) => (sim) => { const e = entry(sim, nr); return e.requested && !e.dispatched && lineIn(sim, nr).request !== 'theirs'; },
    fix: ON_LINE_IN },
  { name: 'pociąg na szlaku', kinds: ALL, when: (nr) => at.onLineIn(nr),
    fix: ['czoło na stacji', (nr) => (sim) => !!entry(sim, nr).train?.entered] },
  { name: 'czoło na stacji, ogon na szlaku', kinds: ALL, when: (nr) => (sim) => { const tr = entry(sim, nr).train; return !!tr && tr.entered && !tr.fullyIn; },
    fix: ['pociąg zjechał ze szlaku', (nr) => (sim) => !!entry(sim, nr).train?.fullyIn] },
  { name: 'Ko do obsłużenia', kinds: EAP, when: (nr) => (sim) => lineIn(sim, nr).koPending,
    fix: ['pociąg przy peronie', (nr) => (sim) => entry(sim, nr).actualArr != null] },
];

/**
 * Chwile pociągu odjeżdżającego (usterka na szlaku, na który odjeżdża). `auth` – czym pociąg wyjedzie, gdy usterka trwa
 * do jego wyjazdu na szlak: '*' – Sz (pozwolenie było u sąsiada), 'signal' – sygnał zezwalający (pozwolenie było u nas
 * albo tor ma stały kierunek), brak – wyjechał przed usterką.
 */
const OUT = [
  { name: 'przed Wbl', kinds: ALL, auth: { eap2: '*', eap1: 'signal', sbl: 'signal' }, mid: ON_LINE_OUT,
    when: (nr) => (sim) => { const e = entry(sim, nr), b = lineOut(sim, nr); return !!e.train && e.actualDep == null && !exitActive(sim, nr) && !b.request && (b.fixed != null || !b.direction); },
    fix: ['zapowiedź telefoniczna albo przebieg wyjazdowy', (nr) => (sim) => lineOut(sim, nr).phone.permissionFor != null || at.exitSet(nr)(sim)] },
  { name: 'Wbl wysłane, przed Poz sąsiada', kinds: ['eap2'], auth: { eap2: '*' }, mid: ON_LINE_OUT, when: (nr) => (sim) => lineOut(sim, nr).request === 'ours',
    fix: ['przebieg wyjazdowy', (nr) => at.exitSet(nr)] },
  { name: 'pozwolenie, przed przebiegiem', kinds: ['eap2'], auth: { eap2: 'signal' }, mid: ON_LINE_OUT, when: (nr) => (sim) => lineOut(sim, nr).permission && !exitActive(sim, nr),
    fix: ['przebieg wyjazdowy', (nr) => at.exitSet(nr)] },
  { name: 'przebieg wyjazdowy, pociąg stoi', kinds: ALL, auth: { eap2: 'signal', eap1: 'signal', sbl: 'signal' }, mid: ON_LINE_OUT, when: (nr) => at.exitSet(nr),
    fix: ['pociąg minął semafor wyjazdowy', inExitRoute] },
  { name: 'pociąg w przebiegu wyjazdowym', kinds: ALL, auth: { eap2: 'signal', eap1: 'signal', sbl: 'signal' }, when: inExitRoute,
    fix: ON_LINE_OUT },
  { name: 'pociąg na szlaku', kinds: ALL, auth: {}, when: onLineOut,
    fix: ['pociąg u sąsiada', (nr) => (sim) => !!entry(sim, nr).train?.finished] },
  { name: 'u sąsiada, przed jego Ko', kinds: EAP, auth: {}, when: (nr) => (sim) => lineOut(sim, nr).pendingArrivalAck != null,
    fix: ['przyjazd zawiadomiony telefonicznie', (nr) => (sim) => lineOut(sim, nr).phone.arrivalConfirmed != null] },
];

/** Automat z jedną zwłoką: w chwili `when` reaguje o takt (2 s) później – usterka zdąży się zacząć przed Poz / Ko. */
function lazy(when) {
  let seen = false;
  return (sim) => { if (!seen && when(sim)) { seen = true; return; } autoDispatch(sim); };
}

/**
 * Naprawa w chwili `pred` zamiast po stałym czasie: czynna usterka blokady kończy się w najbliższym takcie. `Faults` nie ma
 * publicznego „usuń usterkę”, więc skraca się jej czas trwania (liczony od `since`). `done` – naprawa nastąpiła.
 */
function repairAt(pred) {
  const fn = (sim) => {
    if (fn.done) return;
    const f = sim.faults.list.find((x) => x.type === 'block-fail' && x.active);
    if (f && pred(sim)) { f.duration = sim.clock.time - f.since; fn.done = true; }
  };
  fn.done = false;
  return fn;
}

/**
 * Szlak – niewidoczny dla niezmienników stacji: na torze szlakowym najwyżej jeden pociąg, pociąg na szlaku – blokada
 * zajęta, nasz pociąg nie wjeżdża na szlak, na który sąsiad ma pozwolenie (sprawna Eap) albo „droga wolna” (zapowiadanie).
 * Przy usterce Eap dwukierunkowej sygnał zezwalający (nie Sz) na wyjazd tylko z pozwoleniem, które było u nas tuż przed
 * utratą łączności i którego nie wykorzystał żaden pociąg (Ir-1 §28 ust. 16 pkt 2, ust. 18; Ie-10 §33 ust. 5). Stan sprzed
 * usterki zapamiętuje `mem` (takt przed usterką), a nie pole silnika.
 */
function lineWatch(sim, out, mem) {
  const t = Clock.format(sim.clock.time, true);
  const warn = (msg) => { if (out.length < 5) out.push(`${t} ${msg}`); };
  for (const [id, b] of sim.blocks) {
    const on = sim.traffic.trains.filter((tr) => !tr.finished && tr.onLine(id)).map((tr) => tr.nr);
    if (on.length > 1) warn(`szlak ${id}: pociągi ${on.join(' i ')}`);
    else if (on.length && !b.occupied) warn(`szlak ${id}: pociąg ${on[0]} na szlaku, blokada wolna`);
    const m = mem[id] ??= { perm: false, used: false, seen: new Set() };
    if (!b.fault) { m.perm = b.direction === 'out' && b.permission; m.used = false; }
    for (const e of sim.traffic.timetable()) {
      if (e.to !== id || !e.train || e.train.finished || !e.train.onLine(id) || m.seen.has(e.nr)) continue;
      m.seen.add(e.nr); // nasz pociąg wjechał na szlak
      if (b.fault) m.used = true;
      if (b.auto || b.fixed) continue;
      if (b.fault ? b.phone.clearedFor != null : b.direction === 'in') warn(`szlak ${id}: pociąg ${e.nr} wjechał na szlak, na który ${b.fault ? `dana droga wolna dla ${b.phone.clearedFor}` : 'sąsiad ma pozwolenie'}`);
    }
  }
  for (const act of routeViews(sim.ilk)) {
    const b = act.route.exit ? sim.blocks.get(act.route.exit) : null;
    if (!b?.fault || b.auto || b.fixed || act.entered) continue;
    const m = mem[b.id], asp = sim.ilk.signals.get(act.route.start).aspect;
    if (Interlocking.isProceed(asp) && asp !== 'Sz' && (!m.perm || m.used)) warn(`${act.route.start} (${asp}) na szlak ${b.id} bez łączności – ${m.perm ? 'pozwolenie sprzed usterki już wykorzystane' : 'bez pozwolenia sprzed usterki'}`);
  }
}

/**
 * Jedna zmiana z usterką blokady. Zwraca wynik `runWithFault` oraz: `lines` – naruszenia na szlaku, `repaired` – naprawa
 * w chwili `fix` nastąpiła, `dep` – wyjazd pociągu `nr` na szlak (usterka w tej chwili, zezwolenie: '*' – Sz / rozkaz),
 * `confirmed` – sąsiad potwierdził telefonicznie przyjazd pociągu `nr`, `sent` – nasze telefonogramy przyjęte przez sąsiada.
 * `watch(sim, sent)` – dodatkowa obserwacja w każdym takcie.
 */
function runCase(station, { srk, timetable, nr, when, target: tgt, fix = null, duration = LONG, watch = null }) {
  const sim = faultSim(station, { srk, timetable });
  const sent = [];
  const send = sim.comms.send.bind(sim.comms);
  sim.comms.send = (id, p, o) => { const res = send(id, p, o); if (res.ok) sent.push(`${id} ${p.nr}`); return res; };
  const lines = [], mem = {};
  const repair = fix ? repairAt(fix) : null;
  let dep = null, confirmed = false;
  const each = (s) => {
    lineWatch(s, lines, mem);
    repair?.(s);
    const e = nr != null && entry(s, nr), b = e?.to && s.blocks.get(e.to);
    if (b && !dep && e.train?.onLine(e.to)) dep = { fault: b.fault, auth: e.train.exitAuth === '*' ? '*' : 'signal' };
    if (b && String(b.phone.arrivalConfirmed) === String(nr)) confirmed = true;
    watch?.(s, sent);
  };
  const r = runWithFault(sim, { when, fault: { type: 'block-fail', target: tgt, duration }, dispatch: lazy(when), each });
  return { ...r, lines, repaired: repair?.done ?? null, dep, confirmed, sent };
}

const counter = (sim, key) => [...sim.blocks.values()].reduce((n, b) => n + (b.counters?.[key] ?? 0), 0);
/** kary za pominięte czynności zapowiadania: brak dPo do przyjazdu, brak zawiadomienia o odjeździe */
const missed = (sim) => sim.score.items.filter((i) => ['no-dpo', 'no-depart-report'].includes(i.code)).map((i) => `${i.code} ${i.points}: ${i.msg}`);

/** Asercje wspólne: chwila nastąpiła, bez naruszeń i kar, wszystkie pociągi dojechały, stan po naprawie czysty. */
function check(r, where) {
  const { sim } = r;
  assert.equal(r.fired, true, `${where}: chwila nie nastąpiła`);
  assert.deepEqual([...r.violations, ...r.lines], [], `${where}: naruszenia`);
  assert.deepEqual(r.events, [], `${where}: minięcie „Stój” / rozprucie`);
  assert.deepEqual(unjustified(sim), [], `${where}: kary za czynności wymuszone usterką`);
  assert.deepEqual(missed(sim), [], `${where}: pominięte czynności zapowiadania`);
  assert.equal(counter(sim, 'dKo'), 0, `${where}: dKo przy zapowiadaniu (przyjazd potwierdza telefonogram)`);
  assert.deepEqual(stuck(sim), [], `${where}: pociągi, które nie dojechały`);
  assert.deepEqual(leftovers(sim), [], `${where}: stan po naprawie`);
}

/**
 * Wyjazd przy usterce: zezwolenie wg chwili; blok początkowy doraźnie dPo (Eap) – gdy usterka trwa do przyjazdu (przy naprawie
 * w chwili wjazdu na szlak dPo zastępuje automatyk).
 */
function checkDeparture(r, where, auth, kind, dpo = true) {
  assert.deepEqual(r.dep, { fault: true, auth }, `${where}: wyjazd przy usterce (Sz = '*')`);
  if (dpo) assert.equal(counter(r.sim, 'dPo'), kind === 'sbl' ? 0 : 1, `${where}: dPo po wyjeździe bez blokady`);
}

/**
 * Przypadki macierzy: stanowiska × pociągi × strona (wjazd / wyjazd) × chwila × wariant (usterka do końca jazdy, naprawa
 * w następnej chwili, naprawa z pociągiem na szlaku). W wariancie długim także reguły zapowiadania: przyjazd pociągu
 * sąsiada zawiadomiony telefonicznie; nasz pociąg wyjeżdża na Sz albo na sygnał zgodnie z tym, gdzie było pozwolenie, blok
 * początkowy doraźnie dPo (Eap), odjazd zawiadomiony, przyjazd potwierdzony przez sąsiada telefonicznie. `run(opts)` –
 * asercje; `opts.arrival: false` pomija zawiadomienie o przyjeździe (sprawdza je osobny test dla SBL).
 */
function cases(label, station, srks, trains) {
  const out = [];
  for (const srk of srks) for (const def of trains) for (const side of ['in', 'out']) {
    const exitId = side === 'in' ? def.from : def.to;
    const kind = kindOf(station, exitId);
    for (const m of side === 'in' ? IN : OUT) {
      if (!m.kinds.includes(kind)) continue;
      for (const variant of ['long', 'fix', ...(m.mid ? ['mid'] : [])]) {
        const fix = variant === 'long' ? null : m[variant];
        const where = `${label} (${srk}), pociąg ${def.nr} ${def.from}→${def.to} tor ${def.track}, ${side === 'in' ? 'wjazd' : 'wyjazd'}: ${m.name}; block-fail ${exitId} (${kind}) ${fix ? `naprawa: ${fix[0]}` : `${LONG} min`}`;
        out.push({ side, variant, kind, where, run: ({ arrival = true } = {}) => {
          const r = runCase(station, { srk, timetable: [def], nr: def.nr, when: m.when(def.nr), target: side === 'in' ? target.lineIn(def.nr) : target.lineOut(def.nr), fix: fix?.[1](def.nr) });
          check(r, arrival ? where : `${where} (bez zawiadomienia o przyjeździe – osobny test)`);
          if (fix) {
            assert.equal(r.repaired, true, `${where}: naprawa w tej chwili nie nastąpiła`);
            if (variant === 'mid' && side === 'out') checkDeparture(r, where, m.auth[kind], kind, false);
            return;
          }
          if (side === 'in') { if (arrival) assert.ok(r.sent.includes(`arrived ${def.nr}`), `${where}: przyjazd niezawiadomiony telefonicznie (${r.sent.join(', ')})`); return; }
          const auth = m.auth[kind];
          assert.equal(r.confirmed, true, `${where}: sąsiad nie potwierdził przyjazdu telefonicznie`);
          if (auth == null) { assert.equal(r.dep?.fault, false, `${where}: pociąg wyjechał przed usterką`); return; }
          checkDeparture(r, where, auth, kind);
          assert.ok(r.sent.includes(`departed ${def.nr}`), `${where}: odjazd niezawiadomiony telefonicznie (${r.sent.join(', ')})`);
        } });
      }
    }
  }
  return out;
}
/** Wszystkie przypadki (każdy do końca – także po pierwszym błędzie); zwraca ich liczbę. */
function runAll(list, opts = () => ({})) {
  const bad = [];
  for (const c of list) {
    try { c.run(opts(c)); } catch (err) { bad.push(`${err.message.split('\n')[0]}${Array.isArray(err.actual) && err.actual.length ? ` – ${err.actual.slice(0, 2).join('; ')}` : ''}`); }
  }
  assert.deepEqual(bad, [], `${bad.length} z ${list.length} przypadków`);
  return list.length;
}

const osS = (nr, from, to, arr, dep, track) => ({ nr, kind: 'os', name: 'Osobowy', from, to, arr, dep, track, stop: true, length: 130, vmax: 100, dwell: 60 });
const osK = (nr, from, to, arr, dep, track) => ({ nr, kind: 'os', name: 'Osobowy', from, to, arr, dep, track, stop: true, length: 110, vmax: 100, dwell: 60 });
const osB = (nr, from, to, arr, dep, track) => ({ nr, kind: 'os', name: 'Osobowy', from, to, arr, dep, track, stop: true, length: 120, vmax: 120, dwell: 60 });

test('block-fail na Eap dwukierunkowej (Szkolna, pięć stanowisk): każda chwila wjazdu i wyjazdu, usterka do końca jazdy albo naprawa w trakcie', () => {
  const all = [osS(6101, 'W', 'E', '07:16', '07:18', '1'), osS(6102, 'E', 'W', '07:16', '07:18', '2'), osS(6103, 'W', 'E', '07:16', '07:18', '2'), osS(6104, 'E', 'W', '07:16', '07:18', '1')];
  const n = runAll(cases('Szkolna', szkolna, ['E', 'komputerowe'], all)) + runAll(cases('Szkolna', szkolna, ['izh111', 'mech', 'ebilock'], all.slice(0, 2)));
  assert.equal(n, 448);
});

test('block-fail na Eap dwukierunkowej w węźle trzech szlaków (Kalinowo, MOR-3)', () => {
  const n = runAll(cases('Kalinowo', kalinowo, ['mor3'], [osK(7201, 'W', 'E', '07:16', '07:18', '1'), osK(7202, 'E', 'W', '07:16', '07:18', '2'), osK(7203, 'W', 'L', '07:16', '07:18', '2'), osK(7205, 'L', 'W', '07:16', '07:18', '1')]));
  assert.equal(n, 128);
});

test('block-fail na Eap jednokierunkowej linii dwutorowej (Jodłowa): tor wjazdowy i wyjazdowy', () => {
  const n = runAll(cases('Jodłowa', jodlowa, ['E', 'komputerowe'], [osS(3301, 'K2', 'Z2', '07:16', '07:18', '2'), osS(3302, 'Z1', 'K1', '07:16', '07:18', '1')]));
  assert.equal(n, 92);
});

// SBL: przyjazd krótkiego pociągu sąsiada przy usterce – zawiadomienie sprawdza osobny test niżej;
// pozostałe asercje tych przypadków (bezpieczeństwo, kary, stan po naprawie) sprawdza test główny
const SBL = cases('Brzezina', brzezina, ['ebilock'], [osB(9101, 'T2', 'K2', '07:16', '07:18', '2'), osB(9102, 'K1', 'T1', '07:16', '07:18', '1'), osB(9103, 'T2', 'K2', '07:16', '07:18', '4'), osB(9104, 'K1', 'T1', '07:16', '07:18', '3')]);
const sblArrivalLost = (c) => c.side === 'in' && c.variant === 'long';

test('block-fail na samoczynnej blokadzie liniowej SBL (Brzezina, EBILock 950)', () => {
  assert.equal(runAll(SBL, (c) => ({ arrival: !sblArrivalLost(c) })), 76);
});

test('SBL przy usterce: przyjazd pociągu sąsiada zawiadomiony telefonicznie (usterka do końca jazdy)', () => {
  assert.equal(runAll(SBL.filter(sblArrivalLost)), 16);
});

/**
 * Krzyżowanie na szlaku jednotorowym E: A jedzie W→E, B – E→W, oba spotykają się na stacji; usterka szlaku E w każdej chwili
 * B (wjeżdża z E) i A (wyjeżdża na E), do końca jazdy albo z naprawą w trakcie. Dwa rozkłady: B przyjeżdża minutę po A
 * (A na tor 1, B na 2) – B ma kierunek, zanim A wjedzie, więc chwili „przed Wbl” dla A nie ma – i minutę przed A (tory
 * zamienione). W obu B jedzie po szlaku przed A; odwrotna kolejność – niżej (A wyjeżdża, zanim B zostanie wyprawiony).
 */
test('krzyżowanie na szlaku jednotorowym z Eap: usterka w każdej chwili obu pociągów (Szkolna – E, komputerowe; Kalinowo – MOR-3)', () => {
  const list = [];
  for (const [label, station, srk, mk, a, b] of [['Szkolna', szkolna, 'E', osS, 6101, 6102], ['Szkolna', szkolna, 'komputerowe', osS, 6101, 6102], ['Kalinowo', kalinowo, 'mor3', osK, 7201, 7202]]) {
    for (const [ta, tb, arrA, depA, arrB, depB] of [['1', '2', '07:16', '07:18', '07:17', '07:19'], ['2', '1', '07:17', '07:19', '07:16', '07:18']]) {
      const timetable = [mk(a, 'W', 'E', arrA, depA, ta), mk(b, 'E', 'W', arrB, depB, tb)];
      const moments = [...IN.map((m) => [b, 'wjazd', m]), ...OUT.map((m) => [a, 'wyjazd', m])].filter(([, , m]) => !(m.name === 'przed Wbl' && arrB > arrA));
      for (const [nr, side, m] of moments) for (const short of [false, true]) {
        const where = `${label} (${srk}), krzyżowanie ${a} W→E tor ${ta} (odjazd ${depA}) i ${b} E→W tor ${tb} (przyjazd ${arrB}), ${side} ${nr}: ${m.name}; block-fail E ${short ? `naprawa: ${m.fix[0]}` : `${LONG} min`}`;
        list.push({ run: () => {
          const r = runCase(station, { srk, timetable, when: m.when(nr), target: 'E', fix: short ? m.fix[1](nr) : null });
          check(r, where);
          if (short) assert.equal(r.repaired, true, `${where}: naprawa w tej chwili nie nastąpiła`);
        } });
      }
    }
  }
  assert.equal(runAll(list), 150);
});

/**
 * Krzyżowanie, w którym nasz A wyjeżdża pierwszy, a sąsiad zgłasza B później: usterka w chwilach, gdy pozwolenie jest już
 * u nas (pozwolenie, przebieg, pociąg w przebiegu / na szlaku, u sąsiada) – sąsiad nie dostaje drogi, dopóki A nie
 * dojedzie. `fixes` – warianty naprawy (null – usterka 30 min); domyślnie 30 min i naprawa w następnej chwili. Usterka
 * w stanie zasadniczym (przed pozwoleniem) i naprawa, gdy A minął semafor wyjazdowy – testy niżej.
 */
const IN_EXIT = ['pociąg minął semafor wyjazdowy', inExitRoute];
const EXIT_STANDING = 'przebieg wyjazdowy, pociąg stoi';
const A_FIRST = ['pozwolenie, przed przebiegiem', 'pociąg w przebiegu wyjazdowym', 'pociąg na szlaku', 'u sąsiada, przed jego Ko'];
function aFirst([label, station, srk, mk, a, b, arrB0], moments, { arrB = arrB0, fixes = null } = {}) {
  const timetable = [mk(a, 'W', 'E', '07:16', '07:19', '1'), mk(b, 'E', 'W', arrB, '07:34', '2')];
  return OUT.filter((m) => moments.includes(m.name)).flatMap((m) => (fixes ?? [null, m.fix]).map((fix) => {
    const where = `${label} (${srk}), krzyżowanie ${a} W→E (odjazd 07:19) i ${b} E→W (przyjazd ${arrB}), wyjazd ${a}: ${m.name}; block-fail E ${fix ? `naprawa: ${fix[0]}` : '30 min'}`;
    return { run: () => {
      const r = runCase(station, { srk, timetable, when: m.when(a), target: 'E', fix: fix?.[1](a), duration: 30 });
      if (fix) assert.equal(r.repaired, true, `${where}: naprawa w tej chwili nie nastąpiła`);
      check(r, where);
    } };
  }));
}
const CROSS_A = [['Szkolna', szkolna, 'E', osS, 6101, 6102, '07:24:00'], ['Szkolna', szkolna, 'komputerowe', osS, 6101, 6102, '07:24:00'], ['Kalinowo', kalinowo, 'mor3', osK, 7201, 7202, '07:23:45']];

test('krzyżowanie przy usterce, nasz pociąg wyjeżdża pierwszy (pozwolenie u nas): sąsiad nie dostaje drogi przed przyjazdem naszego', () => {
  assert.equal(runAll(CROSS_A.flatMap((c) => [...aFirst(c, A_FIRST), ...aFirst(c, [EXIT_STANDING], { fixes: [null] })])), 27);
});

/**
 * Dwa pociągi po sobie w tę samą stronę: usterka przy pierwszym (na szlaku przyjazdu albo odjazdu), naprawa, gdy drugi jest
 * na szlaku / ma przebieg wyjazdowy, albo usterka do końca – zgłoszenie i przyjazd drugiego nie mogą przepaść. Przy odjeździe
 * pozwolenie sprzed usterki wykorzystał pierwszy pociąg – drugi wyjeżdża na Sz (test niżej).
 */
function followers(side) {
  const out = [];
  for (const srk of ['E', 'komputerowe']) for (const [from, to] of [['W', 'E'], ['E', 'W']]) for (const [t2, arr2] of [['1', '07:26'], ['2', '07:22']]) {
    const timetable = [osS(6101, from, to, '07:16', '07:18', '1'), osS(6103, from, to, arr2, arr2.replace(/\d$/, (d) => String(+d + 2)), t2)];
    const plan = side === 'wjazd' ? [
      [IN.find((m) => m.name === 'pociąg na szlaku'), from, ['drugi na szlaku', at.onLineIn(6103)]],
      [IN.find((m) => m.name === 'Ko do obsłużenia'), from, ['drugi zgłoszony', (sim) => entry(sim, 6103).requested]],
    ] : [
      [OUT.find((m) => m.name === 'pociąg na szlaku'), to, ['drugi ma przebieg wyjazdowy', at.exitSet(6103)]],
      [OUT.find((m) => m.name === 'u sąsiada, przed jego Ko'), to, ['drugi na szlaku', onLineOut(6103)]],
    ];
    for (const [m, exitId, fix] of plan) for (const short of [false, true]) {
      const where = `Szkolna (${srk}), 6101 i 6103 ${from}→${to} tor 1 i ${t2}, ${side} 6101: ${m.name}; block-fail ${exitId} ${short ? `naprawa: ${fix[0]}` : '30 min'}`;
      out.push({ run: () => {
        const r = runCase(szkolna, { srk, timetable, nr: 6103, when: m.when(6101), target: exitId, fix: short ? fix[1] : null, duration: 30 });
        if (side === 'wyjazd' && r.dep?.fault) assert.equal(r.dep.auth, '*', `${where}: 6103 wyjechał przy usterce na sygnał zezwalający, choć pozwolenie sprzed usterki wykorzystał 6101`);
        check(r, where);
        if (short) assert.equal(r.repaired, true, `${where}: naprawa w tej chwili nie nastąpiła`);
      } });
    }
  }
  return out;
}

test('dwa pociągi po sobie: usterka przy wjeździe pierwszego, naprawa przy drugim – żadne zgłoszenie ani przyjazd nie ginie (Szkolna)', () => {
  assert.equal(runAll(followers('wjazd')), 32);
});

test('dwa pociągi po sobie: usterka, gdy pierwszy jest na szlaku odjazdu – drugi wyjeżdża na Sz, pozwolenie sprzed usterki już wykorzystane (Szkolna)', () => {
  assert.equal(runAll(followers('wyjazd')), 32);
});

/**
 * Przelot: pociąg bez postoju jedzie na sygnał zezwalający semafora wyjazdowego (pozwolenie było u nas przed usterką).
 * Usterka, gdy semafor wyjazdowy właśnie zezwala, a pociąg jest daleko – sygnał gaśnie do zapowiedzi telefonicznej (pociąg
 * zdąży przed nim zahamować), potem wraca i pociąg wyjeżdża na sygnał. Usterka tuż przed semaforem (czoło na ostatniej
 * kostce, bliżej niż droga hamowania) – test niżej.
 */
const exitProceed = (nr) => (sim) => { const a = exitActive(sim, nr), tr = entry(sim, nr)?.train; if (!a || a.entered || !tr || tr.v < 5) return false; const asp = sim.ilk.signals.get(a.route.start).aspect; return Interlocking.isProceed(asp) && asp !== 'Sz'; };
const atExitSignal = (nr) => (sim) => { if (!exitProceed(nr)(sim)) return false; const a = exitActive(sim, nr), h = entry(sim, nr).train.headTile(); return !!h && sim.ilk.topo.signalsAt(h.tile, h.outPort).some((sg) => sg.id === a.route.start); };
function throughCases(when, moment) {
  const out = [];
  const pass = (nr, from, to, track, len) => ({ nr, kind: 'os', name: 'Osobowy', from, to, arr: '07:16', dep: '07:16', track, stop: false, length: len, vmax: 100, dwell: 60 });
  for (const [label, station, srk, base, len] of [['Szkolna', szkolna, 'E', 6105, 130], ['Szkolna', szkolna, 'komputerowe', 6105, 130], ['Szkolna', szkolna, 'izh111', 6105, 130], ['Szkolna', szkolna, 'mech', 6105, 130], ['Szkolna', szkolna, 'ebilock', 6105, 130], ['Kalinowo', kalinowo, 'mor3', 7207, 110]]) {
    for (const [i, from, to, track] of [[0, 'W', 'E', '1'], [1, 'E', 'W', '2'], [2, 'W', 'E', '2'], [3, 'E', 'W', '1']]) {
      const def = pass(base + i, from, to, track, len);
      const where = `${label} (${srk}), przelot ${def.nr} ${from}→${to} tor ${track}, ${moment}; block-fail ${to} ${LONG} min`;
      out.push({ run: () => {
        const r = runCase(station, { srk, timetable: [def], nr: def.nr, when: when(def.nr), target: to });
        check(r, where);
        checkDeparture(r, where, 'signal', 'eap2');
        assert.equal(r.confirmed, true, `${where}: sąsiad nie potwierdził przyjazdu telefonicznie`);
        assert.ok(r.sent.includes(`departed ${def.nr}`), `${where}: odjazd niezawiadomiony telefonicznie (${r.sent.join(', ')})`);
      } });
    }
  }
  return out;
}

test('przelot: usterka blokady, gdy semafor wyjazdowy zezwala, a pociąg jest daleko – bez minięcia „Stój”, wyjazd na sygnał po zapowiedzi', () => {
  assert.equal(runAll(throughCases(exitProceed, 'sygnał wyjazdowy podany, pociąg w drodze')), 24);
});

test('przelot: usterka blokady tuż przed semaforem wyjazdowym nie kończy się minięciem „Stój” z karą (pozwolenie było u nas)', () => {
  assert.equal(runAll(throughCases(atExitSignal, 'czoło na ostatniej kostce przed semaforem wyjazdowym')), 24);
});

/* ---- błędy silnika znalezione tymi testami (poprawione w src/model/Block.js – testy pilnują, żeby nie wróciły) ---- */

const T0 = 7 * 3600;
/** Blokada Eap szlaku jednotorowego (jak Szkolna – Dębno), sprawna. */
const eapBlock = () => { const b = new LineBlock('E', { name: 'Dębno', tile: { x: 31, y: 4 }, dir: 'E' }, new EventBus()); b.tick(T0); return b; };
/** Ta sama blokada bez łączności (usterka w stanie zasadniczym). */
function faultyBlock() {
  const b = eapBlock();
  b.setFault(true);
  return b;
}

test('bez łączności: po „droga wolna” dla naszego pociągu sąsiad nie dostaje drogi dla swojego (obie strony nie mogą wyprawić naraz)', () => {
  const b = faultyBlock();
  assert.equal(b.phoneAskNeighbour(6101).ok, true);
  b.tick(T0 + 60); // sąsiad: „Dla pociągu nr 6101 droga jest wolna.”
  assert.equal(b.gate('substitute').ok, true, 'nasz 6101 ma drogę (Sz)');
  const asked = b.phoneAskFromNeighbour(6102);
  const answered = b.phoneAnswerFree(6102).ok;
  assert.ok(!(b.gate('substitute').ok && b.canNeighbourDispatch(6102)), `obie strony mogą wyprawić pociąg na szlak jednotorowy (sąsiad zapytał o 6102: ${asked}, odpowiedź „droga wolna”: ${answered})`);
});

test('bez łączności: pozwolenie sprzed usterki wykorzystał pociąg, który już wyjechał – następny wyjeżdża na Sz, nie na sygnał', () => {
  const b = eapBlock();
  b.press('Wbl');
  b.tick(T0 + 30); // Dębno daje pozwolenie (Poz)
  assert.equal(b.permission, true);
  b.trainDeparted({ nr: 6101, exitAuth: 'E' }); // 6101 wyjeżdża na sygnał – blok początkowy zablokowany
  b.setFault(true);
  b.trainArrivedAtNeighbour({ nr: 6101 }); // Dębno zawiadamia o przyjeździe telefonicznie
  assert.equal(b.phoneAskNeighbour(6103).ok, true);
  b.tick(T0 + 90); // „Dla pociągu nr 6103 droga jest wolna.”
  assert.equal(b.gate('substitute').ok, true, '6103 po zapowiedzi – Sz');
  assert.equal(b.gate('signal', 'D1-E').ok, false, 'sygnał zezwalający dla 6103 bez pozwolenia przeniesionego przez blokadę (blok początkowy zablokowany)');
});

test('bez łączności: sąsiad nie daje „droga wolna” dla naszego pociągu, dopóki jego pociąg stoi przed semaforem wjazdowym', () => {
  const b = faultyBlock();
  assert.equal(b.phoneAskFromNeighbour(6102), true);
  assert.equal(b.phoneAnswerFree(6102).ok, true);
  b.neighbourTrainEntered({ nr: 6102 });
  b.neighbourTrainArrived({ nr: 6102 }); // zjechał ze szlaku, semafora wjazdowego jeszcze nie minął
  assert.equal(b.awaitingEntry, true);
  b.phoneAskNeighbour(6101);
  b.tick(T0 + 60);
  assert.equal(b.phone.permissionFor, null, '„droga wolna” dla 6101, gdy 6102 stoi przed semaforem wjazdowym');
  assert.equal(b.gate('substitute').ok, false, 'Sz na szlak, z którego pociąg sąsiada jeszcze nie wjechał');
});

/**
 * Krzyżowanie, w którym sąsiad zgłasza swój pociąg (B) dopiero po naszej zapowiedzi dla A: usterka w stanie zasadniczym
 * (przed Wbl albo po Wbl, przed Poz), do końca. A ma „droga wolna”, B dostaje „droga wolna” od nas – sąsiad wyprawia B,
 * gdy A już ma Sz.
 */
for (const c of CROSS_A) {
  test(`krzyżowanie przy usterce (${c[0]}, ${c[2]}): sąsiad pyta o swój pociąg po naszej zapowiedzi – na szlak nie wjeżdżają dwa pociągi`, () => {
    assert.equal(runAll(aFirst(c, ['przed Wbl', 'Wbl wysłane, przed Poz sąsiada'], { fixes: [null] })), 2);
  });
}

/**
 * Naprawa, gdy nasz pociąg minął semafor wyjazdowy, a jeszcze nie wjechał na szlak – na sygnał (pozwolenie było u nas przed
 * usterką) albo na Sz (usterka w stanie zasadniczym, zapowiedź telefoniczna; B przyjeżdża później, sąsiad zgłasza go
 * w czasie usterki): automatyk przywraca stan zasadniczy, sąsiad żąda pozwolenia i dostaje je, choć nasz pociąg za chwilę
 * wjedzie na szlak.
 */
for (const [c, arrSz] of [[CROSS_A[0], '07:26'], [CROSS_A[1], '07:26'], [CROSS_A[2], '07:25:45']]) {
  test(`naprawa blokady, gdy nasz pociąg jest w przebiegu wyjazdowym (${c[0]}, ${c[2]}) – sąsiad nie dostaje pozwolenia na szlak, na który wjeżdża nasz pociąg`, () => {
    assert.equal(runAll([...aFirst(c, ['pozwolenie, przed przebiegiem', EXIT_STANDING], { fixes: [IN_EXIT] }), ...aFirst(c, ['przed Wbl'], { arrB: arrSz, fixes: [IN_EXIT] })]), 3);
  });
}

/**
 * SBL przy usterce: dwa pociągi z Topolna po sobie. Przy zapowiadaniu na torze właściwym linii dwutorowej sąsiad wyprawia
 * następny pociąg po potwierdzeniu przyjazdu poprzedniego (Ir-1 §23 ust. 2–4) – tu wyprawia go, zanim pierwszy minie
 * semafor wjazdowy, a przyjazd pierwszego nie jest zawiadamiany wcale.
 */
test('SBL przy usterce: sąsiad wyprawia następny pociąg dopiero po telefonicznym potwierdzeniu przyjazdu poprzedniego', () => {
  const timetable = [osB(9101, 'T2', 'K2', '07:16', '07:18', '2'), osB(9105, 'T2', 'K2', '07:18', '07:20', '4')];
  const m = IN.find((x) => x.name === 'pociąg na szlaku');
  const early = [];
  const watch = (sim, sent) => { if (!early.length && entry(sim, 9105).dispatched && !sent.includes('arrived 9101')) early.push(Clock.format(sim.clock.time, true)); };
  const r = runCase(brzezina, { srk: 'ebilock', timetable, nr: 9101, when: m.when(9101), target: 'T2', watch });
  const where = `Brzezina (ebilock), 9101 i 9105 T2→K2, wjazd 9101: ${m.name}; block-fail T2 ${LONG} min`;
  check(r, where);
  assert.deepEqual(early, [], `${where}: 9105 wyprawiony przed zawiadomieniem o przyjeździe 9101`);
});

test('naprawa w trakcie naszego zapytania o drogę: spóźniona odpowiedź sąsiada nie zostawia zapowiedzi na następną usterkę', () => {
  const b = faultyBlock();
  b.phoneAskNeighbour(6101);
  b.setFault(false); // naprawa przed odpowiedzią sąsiada
  b.tick(T0 + 60);
  b.setFault(true); // kolejna usterka – zapowiedź trzeba uzyskać od nowa
  assert.equal(b.gate('substitute').ok, false, 'Sz na szlak bez zapytania o drogę w tej usterce');
});

test('naprawa, gdy pociąg sąsiada stoi przed semaforem wjazdowym: przy kolejnej usterce jego przyjazd da się zawiadomić telefonicznie', () => {
  const b = faultyBlock();
  b.phoneAskFromNeighbour(6102); b.phoneAnswerFree(6102);
  b.neighbourTrainEntered({ nr: 6102 });
  b.neighbourTrainArrived({ nr: 6102 }); // stoi przed semaforem wjazdowym
  b.setFault(false);
  b.setFault(true);
  b.entryPassed(true);
  assert.equal(b.koPending, true);
  assert.equal(b.phoneReportArrival(6102).ok, true, 'telefonogram „Pociąg nr 6102 przyjechał” odrzucony');
});
