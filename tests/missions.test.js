import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Simulation } from '../src/model/Simulation.js';
import { validateStation } from '../src/model/validate.js';
import { Clock } from '../src/core/Clock.js';
import { MissionProgress } from '../src/tutorial/progress.js';
import { MISSIONS, MISSION_VIEWS, PHRASES, getMission, missionSteps } from '../src/tutorial/missions.js';
import { lessonSteps, withSteps, infoStep, actStep, LESSON_PHRASES } from '../src/tutorial/lessons.js';
import { GLOSSARY } from '../src/data/glossary.js';
import { ORDERS } from '../src/srk/address.js';
import { STATIONS, getStation } from '../src/stations/index.js';
import { autoDispatch, allArrived } from './helpers.js';

/* Samouczki: każda misja to własny plik, własne kroki i własny scenariusz (stacja, układ torów, rozkład) */

const scenarioOf = (id) => { const st = getStation(MISSIONS[id].station); return { st, sc: st.scenarios.find((x) => x.tutorial === id) }; };

test('każda misja ma własny plik, własną stację i własny rozkład – samouczki nie powtarzają scenariusza', async () => {
  assert.deepEqual(MISSION_VIEWS, ['monitor', 'pulpit', 'izh', 'mech']);
  const stations = new Set(), layouts = new Set(), timetables = new Set();
  for (const id of MISSION_VIEWS) {
    const mod = await import(`../src/tutorial/missions/${id}.js`);
    assert.equal(mod.default, MISSIONS[id]);
    assert.equal(getMission(id), MISSIONS[id]);
    const { st, sc } = scenarioOf(id);
    assert.equal(st.id, MISSIONS[id].station, `${id}: stacja`);
    assert.ok(sc, `${id}: stacja ${st.id} nie ma scenariusza tej misji`);
    assert.equal(sc.disruptions, 'none');
    assert.deepEqual(validateStation(st).errors, []);
    stations.add(st.id);
    layouts.add(JSON.stringify([st.desk, Object.keys(st.exits), st.tiles.filter((t) => t.type === 'signal').map((t) => t.id).sort()]));
    const sim = new Simulation(st, { scenario: sc.id });
    timetables.add(sim.traffic.timetable().map((e) => e.nr).join());
    assert.equal(sim.autoEnd, false, `${id}: misja kończy się ostatnim krokiem`);
  }
  assert.equal(stations.size, 4, 'cztery różne stacje');
  assert.equal(layouts.size, 4, 'cztery różne układy torów i semaforów');
  assert.equal(timetables.size, 4, 'cztery różne rozkłady');
  // stanowisko misji wynika ze scenariusza
  assert.deepEqual(MISSION_VIEWS.map((id) => new Simulation(scenarioOf(id).st, { scenario: scenarioOf(id).sc.id }).srk.id), ['komputerowe', 'E', 'izh111', 'mech']);
  assert.throws(() => missionSteps('kluczowy'), /Brak tekstów misji dla widoku 'kluczowy'/);
  assert.equal(getMission('kluczowy'), null);
});

test('kroki każdej misji są spójne: unikalne id, teksty, warunki, skróty ze słownika, kotwice wskazują istniejące elementy', () => {
  for (const id of MISSION_VIEWS) {
    const { st, sc } = scenarioOf(id);
    const sim = new Simulation(st, { scenario: sc.id });
    const steps = missionSteps(id);
    assert.ok(steps.length >= 20, `${id}: za mało kroków (${steps.length})`);
    assert.equal(new Set(steps.map((s) => s.id)).size, steps.length, `${id}: powtórzone id kroku`);
    assert.equal(steps[0].info, true); assert.equal(steps.at(-1).id, 'end');
    const trains = new Set(sim.traffic.timetable().map((e) => String(e.nr)));
    for (const s of steps) {
      const where = `${id}/${s.id}`;
      assert.ok(s.title && s.text, `${where}: brak tytułu lub tekstu`);
      assert.ok(s.info || typeof s.done === 'function', `${where}: krok bez warunku`);
      for (const [, term] of `${s.text} ${s.tip || ''}`.matchAll(/data-term="([^"]+)"/g)) assert.ok(GLOSSARY[term], `${where}: brak w słowniku: ${term}`);
      // numery pociągów w tekście są z rozkładu tej misji
      for (const [, nr] of s.text.matchAll(/<b>(?:IC )?(\d{4,5})<\/b>/g)) assert.ok(trains.has(nr), `${where}: pociąg ${nr} spoza rozkładu misji`);
      const a = s.anchor;
      if (!a) continue;
      if (a.block) assert.ok(sim.blocks.has(a.block), `${where}: nie ma szlaku ${a.block}`);
      if (a.tab) assert.ok(['rj', 'log', 'zadania', 'pociagi', 'stan', 'rozkazy', 'lacznosc'].includes(a.tab), `${where}: zakładka ${a.tab}`);
      if (a.cmd && id === 'izh') assert.ok(ORDERS.some((o) => o.id === a.cmd), `${where}: rozkaz ${a.cmd}`);
      if (a.cmd && id === 'pulpit') assert.fail(`${where}: pulpit typu E nie ma paska poleceń`);
      if (a.ref) {
        const r = a.ref, topo = sim.ilk.topo;
        // nastawnia mechaniczna: dźwignia (zwrotnica, wykolejnica, sygnalizator), drążek (przebieg), klawisz bloku i zwalniacz (semafor)
        const exists = r.kind === 'signal' || r.kind === 'routeblock' || r.kind === 'routerelease' ? topo.signals.has(r.id) : r.kind === 'point' ? topo.points.has(r.id) : r.kind === 'end' ? topo.endButtons.has(r.id)
          : r.kind === 'lever' ? topo.points.has(r.id) || topo.derailers.has(r.id) || topo.signals.has(r.id) : r.kind === 'route' ? sim.ilk.routes.has(r.id) : r.kind === 'group';
        assert.ok(exists, `${where}: nie ma elementu ${r.kind} ${r.id}`);
        if (r.kind === 'signal') assert.equal(r.color === undefined, id === 'izh', `${where}: kolor ma tylko przycisk sygnałowy typu E i monitora`);
      }
    }
    // warunki „done” i „wrong” działają na świeżej symulacji tej stacji (nie odwołują się do elementów innej)
    const ctx = { seen: new Set(), sim };
    for (const s of steps) { if (s.done) assert.equal(typeof s.done(sim, ctx), 'boolean', `${id}/${s.id}: done`); s.wrong?.(sim, ctx); }
  }
  // teksty nie mieszają stanowisk
  for (const s of missionSteps('pulpit')) assert.ok(!/PRZEBIEG POCIĄGOWY|WYKONAJ|przycisk adresowy|rozkaz <b>/.test(s.text), `pulpit/${s.id}: tekst innego stanowiska`);
  for (const s of missionSteps('izh')) assert.ok(!/PRZEBIEG POCIĄGOWY|WYKONAJ|zielony przycisk|biały przycisk|przycisk grupowy|\bPz\b|dwuprzyciskow/.test(`${s.text} ${s.tip || ''}`), `izh/${s.id}: tekst innego stanowiska`);
  for (const s of missionSteps('monitor')) assert.ok(!/przycisk adresowy|zielony przycisk|przycisk grupowy/.test(s.text), `monitor/${s.id}: tekst innego stanowiska`);
  for (const s of missionSteps('mech')) assert.ok(!/przycisk adresowy|PRZEBIEG POCIĄGOWY|WYKONAJ|zielony przycisk|przycisk grupowy|rozkaz <b>/.test(`${s.text} ${s.tip || ''}`), `mech/${s.id}: tekst innego stanowiska`);
  // dźwignie rysowane z boku: zasadnicza odchylona w lewo, przełożona w prawo – nie „w górze” / „w dole” (to drążki)
  for (const s of missionSteps('mech')) assert.doesNotMatch(`${s.text} ${s.tip || ''} ${s.wrong?.toString() || ''}`, /dźwigni\S*\s+(?:<b>)?\d*(?:<\/b>)?[^.;,]{0,25}\b(w górze|w dole|w górę|w dół)/i, `mech/${s.id}: położenie dźwigni`);
});

test('misje bez rozgrzewki: po planie stacji od razu blokada i pierwszy pociąg – polecenia wtedy, gdy są potrzebne', () => {
  for (const id of MISSION_VIEWS) {
    const ids = missionSteps(id).map((s) => s.id);
    assert.equal(ids[ids.indexOf('layout') + 1], 'block-intro', `${id}: po planie stacji ćwiczenia bez potrzeby`);
    assert.ok(!ids.some((x) => /^(m|e|izh|l)-/.test(x) || /practice/.test(x)), `${id}: krok rozgrzewki`);
  }
  // misja 1 = wspólne lekcje rozkładu Szkolnej w niezmienionej kolejności
  const lessons = lessonSteps(MISSIONS.monitor.phrases).map((s) => s.id);
  assert.equal(lessons.length, 40);
  assert.deepEqual(missionSteps('monitor').map((s) => s.id), lessons);
  assert.deepEqual(Object.keys(PHRASES), ['monitor'], 'ze wspólnych lekcji korzysta misja 1');
  for (const k of LESSON_PHRASES) assert.ok(k in PHRASES.monitor, `brak tekstu ${k}`);
  const { sz, ...partial } = PHRASES.monitor;
  assert.throws(() => lessonSteps(partial), /brak sz/);
  // lekcje nie rozgałęziają się po stanowisku – różnice są w słowniku tekstów
  const src = readFileSync(new URL('../src/tutorial/lessons.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src.slice(src.indexOf('export function lessonSteps')), /view === |\bm \? /);
});

test('składanie samouczka: własne kroki przed i po lekcji, podmiana, pominięcie; literówka to błąd', () => {
  const base = [infoStep('a', 'A', 'a'), actStep('b', 'B', 'b', null, () => true), infoStep('c', 'C', 'c')];
  const x = infoStep('x', 'X', 'x'), y = infoStep('y', 'Y', 'y'), b2 = infoStep('b', 'B2', 'b2');
  assert.deepEqual(withSteps(base, { before: { a: [x] }, after: { b: [y] }, replace: { b: b2 }, omit: ['c'] }).map((s) => s.title), ['X', 'A', 'B2', 'Y']);
  assert.deepEqual(withSteps(base).map((s) => s.id), ['a', 'b', 'c']);
  assert.throws(() => withSteps(base, { after: { nie: [x] } }), /nie ma kroku 'nie'/);
  assert.throws(() => withSteps(base, { after: { a: [infoStep('c', 'C', 'c')] } }), /powtórzony krok 'c'/);
  assert.equal(base.length, 3, 'lista bazowa bez zmian');
});

/* ---------------- uczniowie: wykonują polecenia dymków tak, jak na stanowisku ---------------- */

function common(sim) {
  const press = (ref) => sim.press(ref);
  const B = (exit) => sim.blocks.get(exit);
  const e = (nr) => sim.traffic.timetable().find((x) => String(x.nr) === String(nr));
  const act = (id) => sim.ilk.active.has(id) || sim.ilk.pending.some((p) => p.route.id === id);
  const blk = (exit, btn) => press({ kind: 'block', exit, btn });
  const once = new Set();
  return {
    press, B, e, act, blk,
    one: (k, f) => { if (!once.has(k)) { once.add(k); f(); } },
    poz: (exit) => { if (B(exit).request === 'theirs') blk(exit, 'Poz'); },
    ko: (exit) => { if (B(exit).koPending) blk(exit, 'Ko'); },
    wbl: (exit) => { const b = B(exit); if (!b.direction && !b.request && !b.occupied && !b.koPending) blk(exit, 'Wbl'); },
    standing: (nr) => { const tr = e(nr)?.train; return tr && tr.entered && tr.v === 0 ? tr : null; },
  };
}

/** Misja 2 – pulpit typu E (Jodłowa): przyciski dwuprzyciskowe i grupowe. */
function studentE(sim) {
  const c = common(sim), { press, B, e, act, poz, ko, wbl, one } = c;
  const G = (id) => ({ kind: 'signal', id, color: 'green' });
  const K = (id) => ({ kind: 'end', id });
  const group = (id, role) => press({ kind: 'group', id, role });
  const route = (a, b, id) => { if (!act(id) && !sim.ilk.armed) { press(G(a)); press(b.kind ? b : G(b)); } };
  const p = () => sim.ilk.points.get('Zw7');
  const pt = (id, role) => { if (!sim.ilk.armed && !p().moving) { group(id, role); press({ kind: 'point', id: 'Zw7' }); } };
  const out = (nr, a, end, exit, id) => { const en = e(nr); if (en?.train && en.actualArr != null && en.status !== 'na następnym posterunku' && B(exit).gate().ok) route(a, K(end), id); };
  return {
    'in-3301': () => route('A', 'E2', 'A-E2'),
    'ko-3301': () => ko('K2'),
    'out-3301': () => out(3301, 'E2', 'kZ2', 'Z2', 'E2-Z2'),
    'train-3302': () => { if (!e(3302).train && !act('B-D1')) route('B', 'D1', 'B-D1'); ko('Z1'); out(3302, 'D1', 'kK1', 'K1', 'D1-K1'); },
    'in-42801': () => route('A', 'E3', 'A-E3'),
    'ko-42801': () => ko('K2'),
    'pass-5501': () => { if (!e(5501).actualArr) route('A', 'E2', 'A-E2'); if (act('A-E2') && B('Z2').gate().ok) route('E2', K('kZ2'), 'E2-Z2'); },
    'after-5501': () => { ko('K2'); if (e(5501).status === 'na następnym posterunku') out(42801, 'E3', 'kZ2', 'Z2', 'E3-Z2'); },
    'in-6612': () => { if (!e(6612).actualArr) route('A', 'E3', 'A-E3'); ko('K2'); },
    'wbl-6612': () => wbl('B'),
    'out-6612': () => { if (B('B').direction === 'out' && B('B').permission) route('E3', K('kB'), 'E3-B'); },
    'train-6611': () => { poz('B'); if (B('B').direction === 'in' && !e(6611).actualArr) route('C', 'D3', 'C-D3'); ko('B'); out(6611, 'D3', 'kK1', 'K1', 'D3-K1'); },
    // usterka napędu zwrotnicy 3: zamknięcie, przyjęcie na tor 3 zamiast planowego 2
    'fault-lock': () => { const z = sim.ilk.points.get('Zw3'); if (z.faultUntil > sim.clock.time && !z.individualLock && !sim.ilk.armed) { group('Zz', 'point-lock'); press({ kind: 'point', id: 'Zw3' }); } },
    'fault-in': () => { if (!e(3304).actualArr) route('A', 'E3', 'A-E3'); ko('K2'); },
    'fault-out': () => out(3304, 'E3', 'kZ2', 'Z2', 'E3-Z2'),
  };
}

/** Misja 3 – pulpit IZH-111 (Zacisze): przyciski adresowe i rozkazy. */
function studentIzh(sim) {
  const c = common(sim), { press, B, e, act, poz, ko, wbl, one } = c;
  const S = (id) => ({ kind: 'signal', id }), K = (id) => ({ kind: 'end', id });
  const order = (id) => press({ kind: 'order', id });
  const route = (a, b, id) => { if (!act(id) && !sim.ilk.armed) { press(S(a)); press(b); order('P'); } };
  const p = () => sim.ilk.points.get('Zw2');
  const pt = (o) => { if (!sim.ilk.armed && !p().moving) { press({ kind: 'point', id: 'Zw2' }); order(o); } };
  const consist = (...nrs) => nrs.map((nr) => e(nr)?.train).find(Boolean);
  const reverse = (...nrs) => { const tr = consist(...nrs); if (tr && tr.entered && tr.v === 0 && !['W', 'NW', 'SW'].includes(tr.direction)) sim.traffic.reverseTrain(tr.nr); };
  const arrive = (nr, end, id) => { poz('W'); if (B('W').direction === 'in' && !e(nr).actualArr) route('A', K(end), id); ko('W'); };
  const depart = (nr, sig, id) => { if (!e(nr).train || e(nr).status === 'na następnym posterunku') return; if (B('W').direction === 'out' && B('W').permission) route(sig, K('kW'), id); else wbl('W'); };
  return {
    'poz-7101': () => poz('W'),
    'route-7101': () => route('A', K('kT1'), 'A-kT1'),
    'ko-7101': () => ko('W'),
    'reverse-7101': () => reverse(7101, 7102),
    'wbl-7102': () => wbl('W'),
    'out-7102': () => depart(7102, 'B1', 'B1-W'),
    'in-7103': () => { arrive(7103, 'kT2', 'A-kT2'); if (e(7103).actualArr != null) reverse(7103, 7104); },
    'in-7105': () => arrive(7105, 'kT1', 'A-kT1'),
    'out-7104': () => depart(7104, 'B2', 'B2-W'),
    'out-7106': () => { reverse(7105, 7106); depart(7106, 'B1', 'B1-W'); },
    // fałszywa zajętość toru 3: droga ułożona ręcznie i zamknięta, wjazd na Sz
    'fault-points': () => {
      if (!sim.ilk.sections.get('T3').forced || sim.ilk.armed) return;
      for (const id of ['Zw1', 'Zw2']) {
        const z = sim.ilk.points.get(id);
        if (z.moving) return;
        if (z.position !== '-') { press({ kind: 'point', id }); order('-'); return; }
        if (!z.individualLock) { press({ kind: 'point', id }); order('STOP'); return; }
      }
    },
    'fault-sz': () => { poz('W'); const tr = e(7107).train; if (tr && tr.v === 0 && tr.stoppedAt?.signal === 'A' && sim.ilk.signals.get('A').aspect !== 'Sz' && !sim.ilk.armed) { press(S('A')); order('Sz'); } },
    'fault-ko': () => { ko('W'); if (e(7107).actualArr != null && !sim.ilk.armed) for (const id of ['Zw1', 'Zw2']) if (sim.ilk.points.get(id).individualLock) { press({ kind: 'point', id }); order('Zw'); return; } },
    'out-7108': () => { reverse(7107, 7108); depart(7108, 'B3', 'B3-W'); },
  };
}

/** Misja 4 – nastawnia mechaniczna (Olszyny): dźwignie, drążki, bloki przebiegowe, zwalniacz. */
function studentMech(sim) {
  const c = common(sim), { B, e, poz, ko, wbl } = c;
  const x = (cmd) => sim.execute(cmd);
  const ilk = sim.ilk;
  const P = (id) => ilk.points.get(id), W = () => ilk.derailers.get('Wk1');
  const set = (id, pos) => { const p = P(id); if (p.target !== pos && !p.moving) x({ type: 'point', id, position: pos }); };
  const wkSet = (pos) => { if (W().target !== pos && !W().moving) x({ type: 'derailer', id: 'Wk1', position: pos }); };
  /** Pełna kolejność: dźwignie zwrotnic i wykolejnicy → drążek → blok → dźwignia sygnałowa. */
  const route = (id) => {
    const r = ilk.routes.get(id);
    const a = ilk.active.get(id);
    if (a) { if (a.passed) return; if (r.kind === 'train' && !a.blocked) x({ type: 'route-block', signal: r.start }); if (!a.lever) x({ type: 'clear', signal: r.start }); return; }
    if (ilk.signals.get(r.start).route) return;
    for (const q of [...r.points, ...r.flank]) set(q.id, q.position);
    for (const q of [...r.derailers.onRoute, ...r.derailers.protect]) wkSet(q.position);
    x({ type: 'route', id });
  };
  /** Po przejeździe: dźwignia sygnałowa na „Stój” i drążek z powrotem. */
  const back = (id) => { const a = ilk.active.get(id); if (a?.passed && !a.stuck) { x({ type: 'stop', signal: a.route.start }); x({ type: 'release', signal: a.route.start }); } };
  const arrive = (nr, exit, id) => { poz(exit); if (B(exit).direction === 'in' && e(nr).actualArr == null) route(id); back(id); if (e(nr).actualArr != null) ko(exit); };
  const depart = (nr, exit, id) => { if (e(nr).actualArr == null || e(nr).status === 'na następnym posterunku') { back(id); return; } const b = B(exit); if (b.direction === 'out' && b.permission) route(id); else if (!ilk.active.has(id)) wbl(exit); back(id); };
  return {
    'poz-8401': () => poz('W'),
    'route-8401': () => { if (!ilk.active.has('A-D1')) x({ type: 'route', id: 'A-D1' }); },
    'block-8401': () => x({ type: 'route-block', signal: 'A' }),
    'signal-8401': () => x({ type: 'clear', signal: 'A' }),
    'watch-8401': () => {},
    'back-8401': () => { if (ilk.active.get('A-D1')?.passed) x({ type: 'stop', signal: 'A' }); },
    'back-8401-drazek': () => back('A-D1'),
    'ko-8401': () => ko('W'),
    'out-8401': () => depart(8401, 'E', 'D1-E'),
    'back-8401-out': () => back('D1-E'),
    'in-8402': () => arrive(8402, 'E', 'B-C1'),
    'after-8402': () => { back('B-C1'); ko('E'); },
    'out-8402': () => depart(8402, 'W', 'C1-W'),
    'cross-points': () => set('Zw1', '-'),
    'cross-in': () => { arrive(8403, 'W', 'A-D2'); arrive(8404, 'E', 'B-C1'); },
    'cross-back': () => { back('A-D2'); back('B-C1'); ko('W'); ko('E'); },
    'cross-out': () => { depart(8403, 'E', 'D2-E'); depart(8404, 'W', 'C1-W'); },
    'fault-in': () => arrive(8405, 'W', 'A-D1'),
    // blok niezwolniony przez pociąg: dźwignia na „Stój”, potem zwalniacz
    'fault-release': () => { const a = ilk.active.get('A-D1'); if (a?.passed) { x({ type: 'stop', signal: 'A' }); x({ type: 'release', signal: 'A', emergency: true }); } },
    'out-8405': () => { ko('W'); depart(8405, 'E', 'D1-E'); },
    'out-8406': () => { arrive(8406, 'E', 'B-C1'); depart(8406, 'W', 'C1-W'); },
  };
}

for (const [id, student, firstTrain, until, fault] of [['pulpit', studentE, 3301, '08:40', { nr: 3304, track: '3', planned: '2', sz: 0 }], ['izh', studentIzh, 7101, '08:50', { nr: 7107, track: '3', planned: '3', sz: 1 }], ['mech', studentMech, 8401, '08:40', { nr: 8405, track: '1', planned: '1', sz: 0, dPz: 1 }]]) {
  test(`misja „${id}” (${MISSIONS[id].station}): uczeń wykonujący polecenia dymków przechodzi wszystkie kroki po kolei, pociągi jadą o czasie`, () => {
    const { st, sc } = scenarioOf(id);
    const sim = new Simulation(st, { scenario: sc.id, seed: 7 });
    assert.equal(Clock.format(sim.clock.time), '07:00', 'misja zaczyna się o 07:00 – bez rozgrzewki');
    const steps = missionSteps(id);
    const order = [];
    const progress = new MissionProgress(sim, steps, { onStep: (s) => order.push(s.id) });
    const script = student(sim);
    for (const s of steps) if (!s.info) assert.ok(script[s.id], `uczeń nie umie kroku ${s.id}`);
    progress.start();
    assert.equal(sim.clock.paused, true, 'krok informacyjny zatrzymuje zegar');
    const end = Clock.parse(until);
    let n = 0, lastIdx = -1, since = sim.clock.time;
    while (!progress.finished && sim.clock.time < end) {
      if (progress.step?.info) { progress.next(); continue; }
      sim.step(0.5);
      if (n++ % 2 === 0) script[progress.step.id]?.();
      if (progress.index !== lastIdx) { lastIdx = progress.index; since = sim.clock.time; }
      assert.ok(sim.clock.time - since < 20 * 60, `krok ${progress.step?.id} nie kończy się (od ${Clock.format(since)})`);
      const occ = new Map();
      for (const tr of sim.traffic.trains) for (const sec of tr.occupiedSections()) { assert.ok(!occ.has(sec) || occ.get(sec) === tr.nr, `kolizja na ${sec}`); occ.set(sec, tr.nr); }
    }
    assert.ok(progress.finished, `misja nieukończona – utknęła na kroku ${progress.step?.id} o ${Clock.format(sim.clock.time)}`);
    assert.deepEqual(order, steps.map((s) => s.id), 'kroki w kolejności definicji');
    for (const e of sim.traffic.timetable()) {
      assert.ok(e.status === 'na następnym posterunku' || e.status === 'zakończył bieg' || e.status.startsWith('przekazany'), `${e.nr}: ${e.status}`);
      if (e.from && e.stop && e.nr !== fault.nr) assert.equal(String(e.actualTrack), String(e.track), `${e.nr}: tor ${e.actualTrack} zamiast ${e.track}`);
      assert.ok(e.delay <= 2, `${e.nr}: opóźnienie ${e.delay} min`);
    }
    // pociąg prowadzony przy usterce: tor wg lekcji, sygnał zastępczy tylko tam, gdzie lekcja go wymaga
    const hit = sim.traffic.timetable().find((e) => e.nr === fault.nr);
    assert.equal(String(hit.track), fault.planned); assert.equal(String(hit.actualTrack), fault.track);
    assert.equal(sim.ilk.counters.Sz, fault.sz);
    assert.equal(sim.faults.list.filter((f) => f.scripted).length, 1, 'misja ma jedną usterkę ze scenariusza');
    assert.ok([...sim.ilk.points.values()].every((p) => p.control && !p.trailed), 'zwrotnice z kontrolą położenia');
    assert.equal(sim.traffic.timetable()[0].nr, firstTrain);
    assert.equal(sim.ilk.counters.rozprucie, 0);
    assert.equal(sim.ilk.counters.dPz, fault.dPz ?? 0, 'zwalniacz / dPz tylko tam, gdzie lekcja usterki go wymaga');
    assert.equal(sim.score.items.filter((i) => i.points < 0).length, 0, sim.score.items.filter((i) => i.points < 0).map((i) => i.msg).join('; '));
  });
}

test('nowe stacje treningowe: pełna zmiana z automatem na każdym stanowisku – pociągi o czasie, bez kolizji', () => {
  for (const id of ['jodlowa', 'zacisze', 'olszyny']) {
    const st = STATIONS.find((s) => s.id === id);
    assert.deepEqual(st.scenarios.filter((s) => !s.tutorial).map((s) => s.srk).sort(), ['E', 'izh111', 'komputerowe', 'mech'], `${id}: zmiana na każdym stanowisku`);
    for (const sc of st.scenarios.filter((s) => !s.tutorial)) {
      const sim = new Simulation(st, { scenario: sc.id, disruptions: 'none', seed: 5 });
      assert.equal(sim.ilk.topo.tracks.filter((t) => t._openPorts).length, 0, `${id}: urwane porty toru`);
      let n = 0;
      while (sim.clock.time < Clock.parse('09:10') && !allArrived(sim) && !sim.ended) {
        sim.step(0.5); if (n++ % 4 === 0) autoDispatch(sim);
        const occ = new Map();
        for (const tr of sim.traffic.trains) for (const sec of tr.occupiedSections()) { assert.ok(!occ.has(sec) || occ.get(sec) === tr.nr, `${id}: kolizja na ${sec}`); occ.set(sec, tr.nr); }
      }
      for (const e of sim.traffic.timetable()) {
        assert.ok(/na następnym posterunku|odjechał|przekazany|zakończył bieg/.test(e.status), `${id}/${sc.id} ${e.nr}: ${e.status}`);
        if (e.from && e.stop) assert.equal(String(e.actualTrack), String(e.track), `${id} ${e.nr}: tor`);
        assert.ok(e.delay <= 2, `${id}/${sc.id} ${e.nr}: opóźnienie ${e.delay}`);
      }
      assert.equal(sim.ilk.counters.rozprucie, 0);
    }
  }
  // Zacisze: stacja krańcowa – wjazdy kończą się na kozłach torów stacyjnych, wyjazdy wracają na ten sam szlak
  const z = new Simulation(STATIONS.find((s) => s.id === 'zacisze'), { disruptions: 'none' });
  assert.deepEqual(z.ilk.routeList().map((r) => r.id).sort(), ['A-kT1', 'A-kT2', 'A-kT3', 'B1-W', 'B2-W', 'B3-W']);
  assert.deepEqual(Object.keys(z.station.exits), ['W']);
  // Jodłowa: tory szlakowe linii dwutorowej bez pozwoleń, odgałęzienie z Eap
  const j = new Simulation(STATIONS.find((s) => s.id === 'jodlowa'), { disruptions: 'none' });
  assert.equal(j.blocks.get('K1').gate().ok, true); assert.equal(j.blocks.get('K2').gate().ok, false); assert.equal(j.blocks.get('B').gate().ok, false);
});

test('każda misja uczy radzenia sobie z inną usterką', () => {
  const faults = MISSION_VIEWS.map((id) => scenarioOf(id).sc.faults.map((f) => f.type));
  assert.deepEqual(faults, [['signal-fail', 'block-fail'], ['point-control'], ['false-occupancy'], ['route-block']]);
  assert.equal(new Set(faults.flat()).size, 5, 'pięć rodzajów usterek, żadna się nie powtarza');
  for (const id of MISSION_VIEWS) {
    const ids = missionSteps(id).map((s) => s.id);
    assert.ok(ids.includes('fault-intro'), `${id}: krok wprowadzający usterkę`);
    assert.ok(ids.indexOf('fault-intro') > ids.indexOf('block-intro'), `${id}: usterka po lekcjach zwykłego ruchu`);
  }
});

test('zmiana toru wymuszona usterką urządzeń nie kosztuje punktów; bez usterki kosztuje', () => {
  const st = STATIONS.find((s) => s.id === 'jodlowa');
  const run = (faults) => {
    const sim = new Simulation(st, { scenario: { id: 't', name: 't', trains: [3301], endTime: '07:30', faults }, disruptions: 'none', seed: 1 });
    for (let i = 0; i < 2 * 60 * 20 && sim.traffic.timetable()[0].actualArr == null; i++) {
      sim.step(0.5);
      if (!sim.ilk.active.has('A-E3') && !sim.ilk.pending.length) sim.execute({ type: 'route', start: 'A', end: 'E3', kind: 'train' });
    }
    const e = sim.traffic.timetable()[0];
    assert.equal(String(e.actualTrack), '3'); assert.equal(String(e.track), '2');
    return sim.score.items.filter((i) => i.code === 'wrong-track').length;
  };
  assert.equal(run([]), 1, 'bez usterki: tor inny niż planowy jest błędem');
  assert.equal(run([{ type: 'point-control', target: 'Zw5', at: '07:00', duration: 30 }]), 0, 'usterka zwrotnicy');
  assert.equal(run([{ type: 'false-occupancy', target: 'T2', at: '07:00', duration: 30 }]), 0, 'fałszywa zajętość toru planowego');
});
