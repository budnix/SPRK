import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeSim, run } from './helpers.js';
import { POINT_SWITCH_TIME, TIMED_RELEASE } from '../src/model/Interlocking.js';

const G = (id) => ({ kind: 'signal', id, color: 'green' });
const W = (id) => ({ kind: 'signal', id, color: 'white' });
const ZW = { kind: 'group', id: 'Zw', role: 'group-point' };

test('przestawienie zwrotnicy wymaga przycisku grupowego Zw i trwa w czasie', () => {
  const sim = makeSim();
  const p = sim.ilk.points.get('Zw1');
  assert.equal(p.position, '+');
  sim.press({ kind: 'point', id: 'Zw1' }); // samo naciśnięcie – tylko uzbraja
  run(sim, 1);
  assert.equal(p.moving, false);
  sim.press(ZW);
  assert.equal(p.moving, true, 'kolejność odwrotna też działa');
  assert.equal(p.control, false);
  run(sim, POINT_SWITCH_TIME + 0.5);
  assert.equal(p.position, '-');
  assert.equal(p.control, true);
});

test('nastawienie przebiegu pociągowego: zwrotnice, utwierdzenie, obraz sygnałowy', () => {
  const sim = makeSim();
  const res = sim.press(G('A'));
  assert.equal(res.armed, true);
  sim.press(G('D2'));
  assert.equal(sim.ilk.pending.length, 1);
  run(sim, POINT_SWITCH_TIME + 1);
  assert.ok(sim.ilk.active.has('A-D2'));
  assert.equal(sim.ilk.points.get('Zw1').position, '-');
  assert.equal(sim.ilk.sections.get('Iz1').route, 'A-D2');
  assert.equal(sim.ilk.sections.get('T2').route, 'A-D2');
  // D2 pokazuje Stój -> A: S13 (40 km/h, następny semafor Stój)
  assert.equal(sim.ilk.signals.get('A').aspect, 'S13');
  // zwrotnica utwierdzona – nie można przestawić
  sim.press(ZW); const r2 = sim.press({ kind: 'point', id: 'Zw1' });
  assert.equal(r2.ok, false);
});

test('przebiegi sprzeczne są odrzucane', () => {
  const sim = makeSim();
  sim.press(G('A')); sim.press(G('D1'));
  run(sim, 1);
  assert.ok(sim.ilk.active.has('A-D1'));
  sim.press(G('B')); const r = sim.press(G('C1'));
  assert.equal(r.ok, false);
  assert.match(r.reason, /T1|Iz4/);
  // wjazd od B na tor 2 blokuje droga ochronna przebiegu A-D1 (Iz4)
  sim.press(G('B')); const r2 = sim.press(G('C2'));
  assert.equal(r2.ok, false);
  assert.match(r2.reason, /drodze ochronnej/);
});

test('wyciągnięcie przycisku gasi sygnał, Pz zwalnia przebieg', () => {
  const sim = makeSim();
  sim.press(G('A')); sim.press(G('D1'));
  run(sim, 1);
  assert.equal(sim.ilk.signals.get('A').aspect, 'S5');
  sim.pull(G('A'));
  assert.equal(sim.ilk.signals.get('A').aspect, 'S1');
  assert.ok(sim.ilk.active.has('A-D1'), 'przebieg pozostaje utwierdzony');
  sim.press({ kind: 'group', id: 'Pz', role: 'route-release' });
  sim.press(G('A'));
  assert.ok(!sim.ilk.active.has('A-D1'));
  assert.equal(sim.ilk.sections.get('T1').route, null);
});

test('zwalnianie czasowe przy zajętym odcinku zbliżania, dPz natychmiast z licznikiem', () => {
  const sim = makeSim();
  sim.press(G('A')); sim.press(G('D1'));
  run(sim, 1);
  sim.ilk.updateOccupancy(new Set(['ZbA']));
  sim.press({ kind: 'group', id: 'Pz', role: 'route-release' });
  const r = sim.press(G('A'));
  assert.equal(r.timed, true);
  assert.ok(sim.ilk.active.has('A-D1'));
  run(sim, TIMED_RELEASE / 2);
  assert.ok(sim.ilk.active.has('A-D1'));
  sim.press({ kind: 'group', id: 'dPz', role: 'emergency-release' });
  sim.press(G('A'));
  assert.ok(!sim.ilk.active.has('A-D1'));
  assert.equal(sim.ilk.counters.dPz, 1);
});

test('zwalnianie odcinkowe po przejeździe pociągu', () => {
  const sim = makeSim();
  sim.press(G('A')); sim.press(G('D1'));
  run(sim, 1);
  const occ = (...s) => { sim.ilk.updateOccupancy(new Set(s)); sim.ilk.tick(sim.ilk.time + 0.1); };
  occ('ZbA', 'Iz1');
  assert.equal(sim.ilk.signals.get('A').aspect, 'S1', 'semafor pada po minięciu');
  occ('Iz1', 'T1');
  occ('T1');
  assert.equal(sim.ilk.sections.get('Iz1').route, null, 'Iz1 zwolniony');
  assert.ok(!sim.ilk.active.has('A-D1'), 'przebieg rozwiązany po wjeździe na tor docelowy');
});

test('sygnał zastępczy Sz z licznikiem i czasem', () => {
  const sim = makeSim();
  sim.press({ kind: 'group', id: 'Sz', role: 'substitute' });
  sim.press(G('A'));
  assert.equal(sim.ilk.signals.get('A').aspect, 'Sz');
  assert.equal(sim.ilk.counters.Sz, 1);
  run(sim, 95);
  assert.equal(sim.ilk.signals.get('A').aspect, 'S1');
});

test('przebieg manewrowy i wykolejnica', () => {
  const sim = makeSim();
  sim.press(W('D2')); sim.press({ kind: 'end', id: 'kT3' });
  run(sim, POINT_SWITCH_TIME + 1);
  assert.ok(sim.ilk.active.has('D2-kT3m'));
  assert.equal(sim.ilk.derailers.get('Wk1').position, 'off');
  assert.equal(sim.ilk.signals.get('D2').aspect, 'Ms2');
  // wyjazd D2-E wymaga nałożonej wykolejnicy – w konflikcie z manewrem
  sim.press(G('D2')); const r = sim.press({ kind: 'end', id: 'kE' });
  assert.equal(r.ok, false);
  // zwolnienie: wyciągnięcie białego przycisku
  sim.pull(W('D2'));
  assert.ok(!sim.ilk.active.has('D2-kT3m'));
});

test('zamknięcie indywidualne zwrotnicy blokuje przestawianie i przebiegi', () => {
  const sim = makeSim();
  sim.press({ kind: 'group', id: 'Zz', role: 'point-lock' });
  sim.press({ kind: 'point', id: 'Zw1' });
  assert.equal(sim.ilk.points.get('Zw1').individualLock, true);
  sim.press(G('A')); const r = sim.press(G('D2'));
  assert.equal(r.ok, false);
  assert.match(r.reason, /zamknięta/);
});

test('wyjazd na szlak wymaga pozwolenia blokady Eap', () => {
  const sim = makeSim();
  sim.press(G('D1')); const r = sim.press({ kind: 'end', id: 'kE' });
  assert.equal(r.ok, false);
  assert.match(r.reason, /pozwolenia/);
  sim.press({ kind: 'block', exit: 'E', btn: 'Wbl' });
  run(sim, 40);
  assert.equal(sim.blocks.get('E').direction, 'out');
  sim.press(G('D1')); const r2 = sim.press({ kind: 'end', id: 'kE' });
  assert.equal(r2.ok, true);
});

test('migawka stanu jest serializowalna', () => {
  const sim = makeSim();
  const snap = sim.snapshot();
  assert.ok(JSON.stringify(snap).length > 100);
  assert.equal(snap.interlocking.points.length, 3);
});

test('krzyżowanie: przebieg B→C1 czeka, dopóki zwrotnica 1 (droga ochronna za C1) jest utwierdzona w przebiegu A→D2', () => {
  const sim = makeSim();
  sim.press(G('A')); sim.press(G('D2'));
  run(sim, 10);
  assert.equal(sim.ilk.signals.get('A').route, 'A-D2');
  assert.equal(sim.ilk.sections.get('Iz1').route, 'A-D2');
  const msgs = []; sim.bus.on('log', (e) => msgs.push(e.msg));
  sim.press(G('B')); sim.press(G('C1'));
  run(sim, 10);
  assert.equal(sim.ilk.signals.get('B').route, null, 'B→C1 nie może być nastawiony – droga ochronna na Iz1');
  assert.ok(msgs.some((m) => /Droga ochronna: odcinek Iz1 utwierdzony w przebiegu A-D2/.test(m)), msgs.join(' | '));
  // w odwrotnej kolejności tak samo: Iz1 leży w drodze ochronnej B→C1, więc A→D2 nie przejdzie
  const sim2 = makeSim();
  sim2.press(G('B')); sim2.press(G('C1'));
  run(sim2, 10);
  const msgs2 = []; sim2.bus.on('log', (e) => msgs2.push(e.msg));
  sim2.press(G('A')); sim2.press(G('D2'));
  run(sim2, 10);
  assert.equal(sim2.ilk.signals.get('A').route, null);
  assert.ok(msgs2.some((m) => /Odcinek Iz1 w drodze ochronnej przebiegu B-C1/.test(m)), msgs2.join(' | '));
  // po zwolnieniu przebiegu A→D2 (Pz) droga ochronna jest wolna i B→C1 przechodzi
  sim.press({ kind: 'group', id: 'Pz', role: 'route-release' }); sim.press(G('A'));
  run(sim, 100);
  sim.press(G('B')); sim.press(G('C1'));
  run(sim, 10);
  assert.equal(sim.ilk.signals.get('B').route, 'B-C1');
});

test('przebieg złożony (stanowisko komputerowe): koniec za semaforem pośrednim nastawia łańcuch przebiegów; ogniwo nastawione liczy się jako gotowe; blokada ogniwa odrzuca całość', async () => {
  const { Simulation } = await import('../src/model/Simulation.js');
  const chylonia = (await import('../src/stations/gdynia-chylonia.js')).default;
  const sopot = (await import('../src/stations/sopot.js')).default;
  const run = (s, n) => { for (let i = 0; i < n; i++) s.step(0.5); };
  // Chylonia: G502 → szlak na Cisową idzie przez semafor A502 – bezpośredniego przebiegu nie ma
  const sim = new Simulation(chylonia, { disruptions: 'none' });
  assert.equal(sim.press({ kind: 'signal', id: 'G502', color: 'green' }).ok, true);
  const direct = sim.press({ kind: 'end', id: 'kRS1' });
  assert.equal(direct.ok, false); assert.match(direct.reason, /Brak przebiegu pociągowego G502 → kRS1/);
  sim.press({ kind: 'signal', id: 'G502', color: 'green' });
  const r = sim.pressCompound({ kind: 'end', id: 'kRS1' });
  assert.deepEqual(r.chain, ['G502-A502', 'A502-RS1']);
  run(sim, 120);
  assert.deepEqual([...sim.ilk.active.keys()], ['G502-A502', 'A502-RS1']);
  assert.notEqual(sim.ilk.signals.get('G502').aspect, 'S1'); assert.notEqual(sim.ilk.signals.get('A502').aspect, 'S1');
  // bez uzbrojonego semafora – odmowa; przebieg bezpośredni przez pressCompound działa jak zwykły
  assert.equal(sim.pressCompound({ kind: 'end', id: 'kRS1' }).ok, false);
  const s1 = new Simulation(chylonia, { disruptions: 'none' });
  s1.press({ kind: 'signal', id: 'G502', color: 'green' });
  const d = s1.pressCompound({ kind: 'signal', id: 'A502', color: 'green' });
  assert.equal(d.ok, true); assert.equal(d.chain, undefined, 'bezpośredni przebieg – bez łańcucha');
  // ogniwo już nastawione: najpierw A502 → szlak, potem G502 → szlak nastawia tylko brakujące G502-A502
  const s4 = new Simulation(chylonia, { disruptions: 'none' });
  s4.press({ kind: 'signal', id: 'A502', color: 'green' }); assert.equal(s4.press({ kind: 'end', id: 'kRS1' }).ok, true);
  run(s4, 120);
  s4.press({ kind: 'signal', id: 'G502', color: 'green' });
  const f = s4.pressCompound({ kind: 'end', id: 'kRS1' });
  assert.equal(f.ok, true, f.reason); assert.deepEqual(f.set, ['G502-A502']);
  run(s4, 120);
  assert.deepEqual([...s4.ilk.active.keys()].sort(), ['A502-RS1', 'G502-A502']);
  // Sopot: trzy ogniwa A → H → O → szlak; potem blokada ogniwa (kierunek SBL na wjazd) odrzuca całość bez nastawienia czegokolwiek
  const s2 = new Simulation(sopot, { disruptions: 'none' });
  s2.press({ kind: 'signal', id: 'A', color: 'green' });
  assert.deepEqual(s2.pressCompound({ kind: 'end', id: 'kOR1' }).chain, ['A-H', 'H-O', 'O-OR1']);
  run(s2, 120);
  assert.deepEqual([...s2.ilk.active.keys()], ['A-H', 'H-O', 'O-OR1']);
  const s3 = new Simulation(sopot, { disruptions: 'none' });
  assert.equal(s3.blocks.get('OR1').press('Zk').ok, true); // prośba o zmianę kierunku – tor 1 na przyjazd, wyjazd niemożliwy
  run(s3, 60); // zgoda sąsiada (Ir-1 §30 ust. 2 pkt 1)
  assert.equal(s3.blocks.get('OR1').direction, 'in');
  s3.press({ kind: 'signal', id: 'A', color: 'green' });
  const bad = s3.pressCompound({ kind: 'end', id: 'kOR1' });
  assert.equal(bad.ok, false);
  assert.match(bad.reason, /Przebieg złożony A → kOR1: ogniwo O-OR1: .*blokady samoczynnej/);
  assert.equal(s3.ilk.pending.length, 0, 'nic nie nastawione');
  assert.equal(s3.ilk.active.size, 0);
});

test('zwalnianie odcinkowe jest odporne na przeskoczenie krótkiego odcinka między krokami (odcinek nigdy nie zajęty albo zwolniony razem z poprzednim)', async () => {
  const { Simulation } = await import('../src/model/Simulation.js');
  const chylonia = (await import('../src/stations/gdynia-chylonia.js')).default;
  const setup = () => {
    const sim = new Simulation(chylonia, { disruptions: 'none' });
    sim.press(G('G502')); sim.press(G('A502'));
    run(sim, POINT_SWITCH_TIME + 2);
    const act = sim.ilk.active.get('G502-A502');
    assert.ok(act, 'przebieg G502-A502 utwierdzony');
    let t = sim.clock.time;
    const occ = (ids) => { sim.ilk.updateOccupancy(new Set(ids)); sim.ilk.tick(t += 1); };
    return { sim, act, secs: [...act.lockedSections], occ };
  };
  const { sim, act, secs, occ } = setup();
  assert.ok(secs.length >= 5, secs.join(','));
  occ([secs[0]]);
  assert.equal(act.trainEntered, true);
  occ([secs[0], secs[1]]);
  assert.equal(act.released.size, 0, 'nic przed czołem ani pod pociągiem');
  occ([secs[3]]); // ogon zszedł z 0 i 1 naraz, odcinek 2 (zwrotnica) przeskoczony bez zajęcia – pociąg już na 3
  assert.deepEqual([...act.released].sort(), [secs[0], secs[1], secs[2]].sort());
  for (let i = 4; i < secs.length; i++) occ([secs[i]]);
  assert.ok(!sim.ilk.active.has('G502-A502'), 'przebieg rozwiązany po wjeździe na tor docelowy');
  // sam pierwszy odcinek przeskoczony: pociąg pojawia się od razu na drugim – wjazd rozpoznany, przebieg się rozwiązuje
  const b = setup();
  b.occ([b.secs[1]]);
  assert.equal(b.act.trainEntered, true, 'wjazd rozpoznany po zajęciu drugiego odcinka');
  assert.ok(b.act.released.has(b.secs[0]));
  for (let i = 2; i < b.secs.length; i++) b.occ([b.secs[i]]);
  assert.ok(!b.sim.ilk.active.has('G502-A502'));
  // tabor stojący na torze docelowym PRZED nastawieniem (jazda manewrowa na Ms2 na tor zajęty) nie liczy się jako
  // wjazd pociągu ani nie zwalnia odcinków przed czołem
  const c = new Simulation(chylonia, { disruptions: 'none' });
  const dest = c.ilk.routes.get('G502-A502m').sections.at(-1);
  let ct = c.clock.time;
  const ctick = (ids) => { c.ilk.updateOccupancy(new Set(ids)); c.ilk.tick(ct += 0.5); };
  ctick([dest]);
  c.ilk.press(W('G502')); c.ilk.press(W('A502'));
  for (let i = 0; i < (POINT_SWITCH_TIME + 2) * 2; i++) ctick([dest]);
  const cact = c.ilk.active.get('G502-A502m');
  assert.ok(cact, 'przebieg manewrowy G502-A502m na tor zajęty');
  assert.equal(cact.trainEntered, false, 'zajętość toru docelowego to nie wjazd pociągu');
  assert.equal(cact.released.size, 0);
  const cs = [...cact.lockedSections];
  ctick([cs[0], dest]); ctick([cs[1], dest]);
  assert.equal(cact.trainEntered, true);
  assert.deepEqual([...cact.released], [cs[0]], 'zwolniony tylko odcinek za czołem');
});
