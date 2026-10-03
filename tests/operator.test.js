import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/model/Simulation.js';
import szkolna from '../src/stations/szkolna.js';
import { Interlocking } from '../src/model/Interlocking.js';
import { allArrived, Clock, play } from './helpers.js';
import sopot from '../src/stations/sopot.js';
import rumia from '../src/stations/rumia.js';
import olsztyn from '../src/stations/olsztyn-glowny.js';
import { checkShift } from '../scripts/lib/shift-report.mjs';
import { faultSim, runWithFault, stuck } from './fault-harness.js';
import { leftovers } from '../src/model/check/outcome.js';

/* Automat dyżurnego (AutoOperator) – decyzje, które nie mogą kończyć się zatorem. */

test('krzyżowanie na szlaku jednotorowym: tor planowy zajęty przez pociąg, który czeka na ten sam szlak – automat przyjmuje na inny tor', () => {
  // 1001 z Dębna stoi na torze 1 i odjedzie do Lipna; 1002 z Lipna ma w rozkładzie też tor 1. Dopóki 1002 stoi przed
  // semaforem A, szlak do Lipna jest zajęty i 1001 nie odjedzie – a 1002 nie wjedzie na zajęty tor 1.
  const sim = new Simulation(szkolna, { srk: 'E', disruptions: 'none', scenario: { id: 't', name: 't', endTime: '08:00', tasks: [], timetable: [
    { nr: 1001, kind: 'os', name: 'Osobowy', from: 'E', to: 'W', arr: '07:10', dep: '07:20', track: '1', stop: true, length: 130, vmax: 100, dwell: 60 },
    { nr: 1002, kind: 'os', name: 'Osobowy', from: 'W', to: 'E', arr: '07:14', dep: '07:16', track: '1', stop: true, length: 130, vmax: 100, dwell: 60 },
  ] } });
  const end = Clock.parse('09:00');
  play(sim).until(end, { stop: allArrived });
  const tt = sim.traffic.timetable();
  for (const e of tt) assert.equal(e.phase, 'at-neighbour', `${e.nr}: ${e.status}`);
  assert.equal(String(tt.find((e) => e.nr === 1001).actualTrack), '1');
  assert.equal(String(tt.find((e) => e.nr === 1002).actualTrack), '2', 'krzyżowanie na torze 2');
  assert.equal(sim.ilk.counters.rozprucie, 0);
  assert.deepEqual(sim.score.items.filter((i) => i.code === 'spad' || i.code === 'unfinished'), []);
});

test('krzyżowanie, gdy tor planowy ma dwa odcinki (Reda: peron I na T23, dalej T3) – pociąg czekający na szlak stoi na pierwszym', async () => {
  // 56710 do Helu stoi przy peronie I (odcinek T23 toru 3); 55711 z Helu ma w rozkładzie tor 3, a przebieg R-C2 kończy
  // się dalej, na T3. Automat sprawdzał tylko ostatni odcinek przebiegu – nie widział krzyżowania i 55711 czekał przed R
  // bez końca, a 56710 nie mógł wyjechać na zajęty szlak.
  const { default: reda } = await import('../src/stations/reda.js');
  const sim = new Simulation(reda, { srk: 'E', disruptions: 'none', scenario: { id: 't', name: 't', endTime: '08:30', tasks: [], timetable: [
    // 56710 przyjeżdża pierwszy i długo stoi; Puck zgłasza 55711, gdy 56710 już jest na torze 3 (tory 1, 2, 11 wolne – Poz)
    { nr: 56710, kind: 'os', name: 'Regio Gdynia Gł. – Hel', from: 'RM1', to: 'HL', arr: '07:05', dep: '07:35', track: '3', stop: true, length: 130, vmax: 100, dwell: 40 },
    { nr: 55711, kind: 'os', name: 'Regio Hel – Gdynia Gł.', from: 'HL', to: 'RM2', arr: '07:30', dep: '07:32', track: '3', stop: true, length: 130, vmax: 100, dwell: 40 },
  ] } });
  let met = false;
  play(sim).until('09:00', { stop: allArrived, each: () => {
    const [a, b] = [56710, 55711].map((nr) => sim.traffic.entry(nr).train);
    // krzyżowanie naprawdę zachodzi: 56710 stoi na T23, a 55711 jest już na szlaku od Helu
    if (a?.entered && a.v === 0 && a.occupiedSections().has('T23') && b && !b.entered) met = true;
  } });
  assert.ok(met, 'pociągi się krzyżują');
  const tt = sim.traffic.timetable();
  for (const e of tt) assert.equal(e.phase, 'at-neighbour', `${e.nr}: ${e.status}`);
  assert.equal(String(tt.find((e) => e.nr === 56710).actualTrack), '3');
  assert.notEqual(String(tt.find((e) => e.nr === 55711).actualTrack), '3', 'krzyżowanie na innym torze');
  assert.deepEqual(sim.score.items.filter((i) => i.code === 'spad' || i.code === 'unfinished'), []);
});

test('sygnał wyjazdowy już raz był podany (Pwl), a przebieg trzeba było nastawić od nowa: automat wyprawia pociąg na sygnał zastępczy', () => {
  const sim = new Simulation(szkolna, { scenario: 'zmiana-e', disruptions: 'none' });
  const e = sim.traffic.entry(6101);
  const end = Clock.parse('10:30');
  let cancelled = false;
  play(sim).until(end, { stop: allArrived, each: () => {
    // semafor wyjazdowy D1 podał sygnał dla 6101, pociąg jeszcze stoi – sygnał odwołany, przebieg zwolniony (raz)
    if (!cancelled && e.train && e.train.v === 0 && e.train.hasStopped && sim.ilk.signals.get('D1').route === 'D1-E' && Interlocking.isTrainProceed(sim.ilk.signals.get('D1').aspect)) {
      sim.ilk.cancelSignal('D1');
      assert.ok(sim.ilk.releaseRoute('D1', false).ok);
      cancelled = true;
      assert.equal(sim.blocks.get('E').pwl, true, 'przeciwwtórność – drugiego sygnału na to pozwolenie nie będzie');
    }
  } });
  assert.ok(cancelled, 'sygnał wyjazdowy był podany i odwołany');
  assert.equal(e.phase, 'at-neighbour', `6101: ${e.status}`);
  assert.ok(sim.ilk.counters.Sz >= 1, 'wyjazd na Sz');
  for (const x of sim.traffic.timetable()) assert.ok(x.phase === 'at-neighbour' || x.phase === 'ended' || x.phase === 'handed-over', `${x.nr}: ${x.status}`);
});

test('mijanka z dwoma torami (Olszyny): gdy z przeciwka nadjeżdża pociąg, automat nie zajmuje ostatniego wolnego toru pociągiem, który czeka na ten sam szlak', async () => {
  const { default: olszyny } = await import('../src/stations/olszyny.js');
  // 3001 stoi na torze 2 i odjedzie do Grabowca; 3002 jedzie z Grabowca (ma pozwolenie) na tor 1; 3003 z Wierzbna też
  // chce na tor 1 i też do Grabowca. Gdyby wjechał, oba tory zajęłyby pociągi czekające na szlak, z którego jedzie 3002.
  const sim = new Simulation(olszyny, { srk: 'E', disruptions: 'none', scenario: { id: 't', name: 't', endTime: '08:30', tasks: [], timetable: [
    { nr: 3001, kind: 'os', name: 'Osobowy', from: 'W', to: 'E', arr: '07:10', dep: '07:40', track: '2', stop: true, length: 100, vmax: 100, dwell: 60 },
    { nr: 3003, kind: 'os', name: 'Osobowy', from: 'W', to: 'E', arr: '07:20', dep: '07:44', track: '1', stop: true, length: 100, vmax: 100, dwell: 60 },
    { nr: 3002, kind: 'os', name: 'Osobowy', from: 'E', to: 'W', arr: '07:22', dep: '07:24', track: '1', stop: true, length: 100, vmax: 100, dwell: 60 },
  ] } });
  const end = Clock.parse('10:00');
  play(sim).until(end, { stop: allArrived });
  const tt = sim.traffic.timetable();
  for (const e of tt) assert.equal(e.phase, 'at-neighbour', `${e.nr}: ${e.status}`);
  const by = (nr) => tt.find((e) => e.nr === nr);
  assert.ok(by(3002).actualArr < by(3003).actualArr, 'najpierw wjeżdża pociąg z przeciwka');
  assert.equal(sim.ilk.counters.rozprucie, 0);
  assert.deepEqual(sim.score.items.filter((i) => i.code === 'spad' || i.code === 'unfinished'), []);
});

test('wjazd wieloetapowy przy usterce na drodze: po przyjeździe pociągu automat nastawia wyjazd (nie czeka na stopień wjazdu, którego nie nastawił)', () => {
  // Sopot: wjazd z Gdańska na tor 2 to kilka przebiegów po kolei (A → … → O). Fałszywa zajętość T2a wstrzymuje wjazd;
  // pociąg przyjeżdża po naprawie, a automat trzymał dalej listę stopni wjazdu do nastawienia i co takt wracał do niej
  // – wyjazdu nie nastawiał, pociąg stał przy peronie do końca zmiany (znalezione w służbie 19:00, poziom „duże”)
  const scenario = { id: 't', name: 't', startTime: '20:00', endTime: '21:00', tasks: [], disruptions: 'none',
    timetable: [{ nr: 55800, kind: 'os', name: 'Regio Gdańsk Gł. – Słupsk', from: 'GD1', to: 'OR1', arr: '20:15', dep: '20:16', track: '2', stop: true, length: 160, vmax: 120, dwell: 40 }],
    faults: [{ type: 'false-occupancy', target: 'T2a', at: '20:13', duration: 10 }] };
  const r = checkShift({ station: sopot, scenario, seed: 1, level: 'none', extra: 60 });
  assert.equal(r.error, undefined, r.error);
  assert.deepEqual(r.jam.map((j) => `${j.nr}: ${j.status}`), [], 'zator');
  assert.equal(r.trains[0].phase, 'at-neighbour');
  assert.equal(r.violations.count, 0);
});

// Sopot, wjazd z Gdańska na tor 2 w dwóch stopniach: A-H (tor 2a) i H-O (tor 2), wyjazd O-OR1
const sopotTrain = (nr, arr, dep, extra = {}) => ({ nr, kind: 'os', name: 'Regio', from: 'GD1', to: 'OR1', arr, dep, track: '2', stop: true, length: 160, vmax: 120, dwell: 40, ...extra });
/** Oba stopnie wjazdu pociągu `nr` nastawione, pociąg jeszcze przed semaforem wjazdowym A. */
const bothStagesBeforeA = (nr) => (sim) => {
  const tr = sim.traffic.entry(nr)?.train;
  return !!tr && Interlocking.routeAhead(sim.ilk.routeState('A-H')) && Interlocking.routeLocked(sim.ilk.routeState('H-O'));
};
/** Zmiana z usterką w chwili `when`; liczy nastawienia przebiegów i odmowy (polecenie wydane, urządzenia odmówiły). */
function entryFault(timetable, when, fault, each = null) {
  const sim = faultSim(sopot, { srk: 'komputerowe', startTime: '06:55', endTime: '08:10', timetable });
  const sets = [], refused = [];
  const setRoute = sim.ilk.setRoute.bind(sim.ilk);
  sim.ilk.setRoute = (id) => { const res = setRoute(id); (res.ok ? sets : refused).push(id); return res; };
  const r = runWithFault(sim, { when, fault, until: '08:10', each });
  return { ...r, sets, refused };
}

test('wjazd wieloetapowy: usterka gasi drugi stopień, gdy pociąg jest jeszcze przed semaforem wjazdowym – po naprawie automat nastawia go od nowa', () => {
  // Automat pamiętał zwolniony stopień tylko dla pociągu stojącego tuż przed jego semaforem. Pociąg przed A tracił H-O:
  // wjeżdżał na A-H, stawał przed H i stał do końca zmiany (a za nim następny przed A).
  for (const target of ['T2', 'E2a']) {
    const r = entryFault([sopotTrain(55104, '07:04', '07:06'), sopotTrain(55106, '07:30', '07:32')], bothStagesBeforeA(55104), { type: 'false-occupancy', target, duration: 1 });
    assert.equal(r.fired, true, `${target}: chwila nie nastąpiła`);
    assert.deepEqual(stuck(r.sim), [], `${target}: pociągi, które nie dojechały`);
    assert.deepEqual(r.violations, [], `${target}: niezmienniki`);
    assert.deepEqual(leftovers(r.sim), [], `${target}: stan po naprawie`);
    // H-O nastawiony trzy razy: dla 55104, od nowa po naprawie i dla 55106
    assert.equal(r.sets.filter((id) => id === 'H-O').length, 3, `${target}: nastawienia ${r.sets.join(', ')}`);
  }
});

test('wjazd wieloetapowy: usterka gasi tylko pierwszy stopień – po naprawie automat nie nastawia drugiego, który czeka, i pociąg bez postoju przejeżdża bez zatrzymania', () => {
  // Po naprawie automat nastawiał A-H od nowa i notował H-O „do nastawienia”, choć H-O czekał na pociąg: co takt
  // wydawał polecenie, któremu urządzenia odmawiały, i do przyjazdu pociągu nie zajmował się wyjazdem – pociąg bez
  // postoju stawał przed semaforem wyjazdowym O.
  let stoppedAtO = false;
  const each = (sim) => { const tr = sim.traffic.timetable()[0].train; if (tr && !tr.finished && tr.v === 0 && tr.nextSignal() === 'O') stoppedAtO = true; };
  const r = entryFault([sopotTrain(55104, '07:04', '07:04', { stop: false })], bothStagesBeforeA(55104), { type: 'false-occupancy', target: 'T2a', duration: 1 }, each);
  assert.equal(r.fired, true);
  assert.deepEqual(stuck(r.sim), []);
  assert.deepEqual(r.violations, []);
  assert.deepEqual(r.sets, ['A-H', 'H-O', 'A-H', 'O-OR1'], 'A-H od nowa po naprawie; H-O czekał – bez ponownego nastawiania');
  assert.deepEqual(r.refused.filter((id) => id === 'H-O'), [], 'polecenia nastawienia H-O, któremu urządzenia odmówiły');
  assert.equal(stoppedAtO, false, 'pociąg bez postoju stanął przed semaforem wyjazdowym O');
});

test('tor planowy zamknięty, wyjazd przez semafor pośredni (Rumia): automat przyjmuje tylko na tor z drogą wyjazdu z ominięciem zamknięcia – jak kontrola definicji', () => {
  // Rumia, tor 5 (SKM) zamknięty: SKM 93202 z Redy do Gdańska ma wyjazd na szlak GS2 tylko łańcuchem przebiegów przez
  // semafor pośredni (G311-GS2). Automat sprawdzał wyjazd tylko pojedynczym przebiegiem, a ten zaczyna się za torami –
  // zbiór torów z wyjazdem był pusty i filtr się wyłączał: przyjmował na tor 2, z którego droga do GS2 wiedzie przez
  // zamknięty tor 5 – pociąg stał tam do końca zmiany, a za nim cała stacja. Kontrola definicji mówiła „pójdzie na 3”.
  const scenario = { ...rumia.scenarios.find((s) => s.id === 'zmiana'), id: 'tor-5-zamkniety', closedSections: [{ section: 'T5' }] };
  const sim = new Simulation(rumia, { scenario, disruptions: 'none', seed: 1 });
  play(sim).until('06:40');
  const e = sim.traffic.entry(93202);
  assert.equal(e.actualTrack, '3', `93202 na torze ${e.actualTrack}`);
  assert.ok(e.train?.finished, `93202: ${e.status}`);
  // cała zmiana bez zatoru
  const r = checkShift({ station: rumia, scenario, seed: 1, level: 'none', extra: 120 });
  assert.deepEqual(r.jam.map((j) => `${j.nr}: ${j.status}`), [], 'zator');
  assert.equal(r.violations.count, 0);
});

test('wyjazd dwustopniowy zaczęty od nowa: drugi stopień nastawiony od dawnego semafora pośredniego automat zwalnia – nie trzyma szlaku', () => {
  // Olsztyn Główny, TLK 5400 z toru 2: pierwszy stopień H2 → M1 utknął na zwrotnicy 49a bez kontroli (usterka), a automat
  // zdążył nastawić drugi M1 → LE1. Wyjazd zaczął od nowa przez M2, a przebieg M1 → LE1 został bez pociągu do końca
  // zmiany – żaden pociąg nie wyjechał już do Łęgajn (8 w zatorze)
  const scenario = { ...olsztyn.scenarios.find((s) => s.id === 'zmiana'), id: 'usterka-49a', faults: [{ type: 'point-control', target: 'Zw49a', at: '06:30', duration: 12 }] };
  const r = checkShift({ station: olsztyn, scenario, seed: 1, level: 'none', extra: 120 });
  assert.deepEqual(r.jam.map((j) => `${j.nr}: ${j.status}`), [], 'zator');
  assert.equal(r.violations.count, 0);
});
