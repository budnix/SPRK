import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventBus } from '../src/core/EventBus.js';
import { LineBlock } from '../src/model/Block.js';

function mk() {
  const bus = new EventBus();
  const b = new LineBlock('W', { name: 'Lipowa', tile: { x: 0, y: 4 }, dir: 'W' }, bus);
  return { b, bus };
}

test('sąsiad żąda pozwolenia, Poz ustawia kierunek wjazdu, Ko po przyjeździe', () => {
  const { b } = mk();
  assert.equal(b.press('Poz').ok, false, 'bez żądania Poz nie działa');
  assert.equal(b.neighbourRequests(), true);
  assert.equal(b.request, 'theirs');
  assert.equal(b.press('Wbl').ok, false, 'nie można żądać, gdy sąsiad żąda');
  assert.equal(b.press('Poz').ok, true);
  assert.equal(b.direction, 'in');
  assert.equal(b.canNeighbourDispatch(), true);
  b.neighbourTrainEntered({ nr: 1 });
  assert.equal(b.occupied, true);
  assert.equal(b.press('Ko').ok, false, 'Ko przed przyjazdem w całości');
  b.neighbourTrainArrived({ nr: 1 });
  assert.equal(b.koPending, true);
  assert.equal(b.press('Ko').ok, true);
  assert.equal(b.direction, null);
});

test('żądanie Wbl, odpowiedź sąsiada, wyjazd i potwierdzenie przyjazdu', () => {
  const { b } = mk();
  assert.equal(b.gate().ok, false);
  b.press('Wbl');
  assert.equal(b.request, 'ours');
  b.tick(100);
  assert.equal(b.direction, 'out');
  assert.equal(b.gate().ok, true);
  b.trainDeparted({ nr: 2 });
  assert.equal(b.poBlocked, true);
  assert.equal(b.gate().ok, false);
  b.trainArrivedAtNeighbour({ nr: 2 });
  b.tick(200);
  assert.equal(b.occupied, false);
  assert.equal(b.direction, null);
});

test('dKo i dPo zwalniają doraźnie i liczą', () => {
  const { b } = mk();
  b.neighbourRequests(); b.press('Poz'); b.neighbourTrainEntered({ nr: 3 });
  b.press('dKo');
  assert.equal(b.counters.dKo, 1);
  assert.equal(b.direction, null);
  b.press('dPo');
  assert.equal(b.counters.dPo, 1);
});

test('blokada samoczynna (SBL): bez pozwoleń i bez Ko, odstęp zwalnia się sam, zmiana kierunku Zk przy wolnym odstępie', () => {
  const bus = new EventBus();
  const inn = new LineBlock('Z1', { name: 'Zalesie', tile: { x: 35, y: 4 }, dir: 'E', direction: 'in', block: 'sbl' }, bus);
  const out = new LineBlock('Z2', { name: 'Zalesie', tile: { x: 35, y: 6 }, dir: 'E', direction: 'out', block: 'sbl' }, bus);
  assert.equal(inn.auto, true);
  // tor wjazdowy: sąsiad wyprawia bez pozwolenia, po przyjeździe w całości odstęp wolny bez Ko
  assert.equal(inn.press('Poz').ok, false);
  assert.equal(inn.neighbourRequests(11), true);
  assert.equal(inn.canNeighbourDispatch(11), true);
  inn.neighbourTrainEntered({ nr: 11 });
  assert.equal(inn.occupied, true);
  assert.equal(inn.press('Zk').ok, false, 'zmiana kierunku przy zajętym odstępie');
  assert.equal(inn.canNeighbourDispatch(12), false, 'jeden pociąg w odstępie');
  inn.neighbourTrainArrived({ nr: 11 });
  assert.equal(inn.occupied, false);
  assert.equal(inn.koPending, false, 'SBL nie wymaga Ko');
  assert.equal(inn.press('Ko').ok, false, 'Ko nie stosuje się');
  assert.equal(inn.canNeighbourDispatch(12), true);
  assert.equal(inn.direction, 'in', 'kierunek zasadniczy');
  // jazda „pod prąd”: Zk zmienia kierunek, wyjazd możliwy, sąsiad nie zmieni kierunku pod naszym pociągiem
  assert.equal(inn.gate().ok, false);
  assert.equal(inn.press('Zk').ok, true);
  assert.equal(inn.direction, 'out');
  assert.equal(inn.gate().ok, true);
  assert.equal(inn.neighbourRequests(14), false, 'kierunek zajęty przez nas');
  inn.trainDeparted({ nr: 21 });
  assert.equal(inn.gate().ok, false);
  inn.trainArrivedAtNeighbour({ nr: 21 }); inn.tick(1000);
  assert.equal(inn.gate().ok, true, 'odstęp zwolniony po potwierdzeniu');
  assert.equal(inn.direction, 'out', 'kierunek zostaje, dopóki ktoś go nie zmieni');
  assert.equal(inn.neighbourRequests(15), true, 'sąsiad sam zmienia kierunek, gdy odstęp wolny');
  assert.equal(inn.direction, 'in');
  // tor wyjazdowy: bez Wbl, po wyjeździe blok początkowy do potwierdzenia przyjazdu przez sąsiada
  assert.equal(out.gate().ok, true);
  out.trainDeparted({ nr: 22 });
  assert.equal(out.gate().ok, false);
  out.trainArrivedAtNeighbour({ nr: 22 }); out.tick(1000);
  assert.equal(out.gate().ok, true);
  assert.equal(out.direction, 'out');
  // usterka: zapowiadanie telefoniczne i dKo jak w Eap
  inn.setFault(true);
  assert.equal(inn.press('Zk').ok, false);
  assert.equal(inn.neighbourRequests(13), true);
  assert.equal(inn.phoneAnswerFree(13).ok, true);
  inn.neighbourTrainEntered({ nr: 13 }); inn.neighbourTrainArrived({ nr: 13 });
  assert.equal(inn.koPending, true, 'przy usterce zwolnienie doraźne dKo po zawiadomieniu');
  assert.equal(inn.phoneReportArrival(13).ok, true);
  assert.equal(inn.press('dKo').ok, true);
  assert.equal(inn.koPending, false);
  // Eap: Zk nie działa
  const eap = new LineBlock('W', { name: 'Lipowa', tile: { x: 0, y: 4 }, dir: 'W' }, bus);
  assert.equal(eap.press('Zk').ok, false);
});

test('walidacja: blokada sbl wymaga stałego kierunku, nieznany rodzaj blokady to błąd', async () => {
  const { validateStation } = await import('../src/model/validate.js');
  const station = (await import('./fixtures/stare-pustkowie.js')).default;
  const bad = { ...station, exits: { ...station.exits, W: { ...station.exits.W, block: 'sbl' }, E: { ...station.exits.E, block: 'xyz' } } };
  const errs = validateStation(bad).errors;
  assert.ok(errs.some((e) => /sbl.*kierunku/.test(e)), errs.join('\n'));
  assert.ok(errs.some((e) => /nieznany rodzaj blokady/.test(e)), errs.join('\n'));
});

test('numer pociągu na torze szlakowym (lineTrain): nasz od wyjazdu do potwierdzenia przyjazdu, sąsiada od wyprawienia do zjazdu w całości', () => {
  const { b } = mk();
  assert.equal(b.lineTrain, null);
  b.neighbourRequests(11); b.press('Poz');
  b.neighbourTrainEntered({ nr: 11 });
  assert.equal(b.lineTrain, 11);
  b.neighbourTrainArrived({ nr: 11 });
  assert.equal(b.lineTrain, null, 'po zjeździe w całości numer znika (Ko jeszcze do obsłużenia)');
  b.press('Ko');
  b.press('Wbl'); b.tick(100);
  b.trainDeparted({ nr: 22 });
  assert.equal(b.lineTrain, 22);
  b.trainArrivedAtNeighbour({ nr: 22 }); b.tick(1000);
  assert.equal(b.lineTrain, null, 'po potwierdzeniu przyjazdu przez sąsiada');
  assert.equal(b.snapshot().lineTrain, null);
  // dPo kasuje numer razem z blokiem
  b.press('Wbl'); b.tick(2000); b.trainDeparted({ nr: 23 });
  assert.equal(b.lineTrain, 23);
  b.press('dPo');
  assert.equal(b.lineTrain, null);
});

test('SBL: koniec usterki po telefonicznie potwierdzonym przyjazdie zwalnia blok początkowy sam (bez dPo); sąsiad odzyskuje kierunek i wyprawia', () => {
  const bus = new EventBus();
  const b = new LineBlock('Z2', { name: 'Gdynia Główna', tile: { x: 69, y: 6 }, dir: 'E', direction: 'in', block: 'sbl' }, bus);
  b.tick(100);
  assert.equal(b.neighbourRequests(55203), true, 'sąsiad zgłasza pociąg – kierunek wjazdowy');
  assert.equal(b.press('Zk').ok, true, 'jazda po torze lewym: przełożenie kierunku na wyjazd');
  b.trainDeparted({ nr: 88301 });
  b.setFault(true);
  b.tick(200);
  b.trainArrivedAtNeighbour({ nr: 88301 });
  assert.equal(b.occupied, true, 'przy usterce blok czeka na dPo po telefonicznym potwierdzeniu');
  assert.equal(b.canNeighbourDispatch(55203), false);
  b.setFault(false);
  b.tick(210);
  assert.equal(b.occupied, false, 'blokada sprawna: blok początkowy zwolniony po potwierdzonym przyjeździe');
  assert.equal(b.poBlocked, false);
  assert.equal(b.lineTrain, null);
  assert.equal(b.canNeighbourDispatch(55203), true, 'sąsiad z pociągiem do wyprawienia sam odzyskuje kierunek');
  assert.equal(b.direction, 'in');
  // usterka kończy się, gdy nasz pociąg jeszcze jedzie – zwolnienie po zwykłym potwierdzeniu przyjazdu
  assert.equal(b.press('Zk').ok, true);
  b.trainDeparted({ nr: 88303 }); b.setFault(true); b.setFault(false);
  assert.equal(b.occupied, true, 'pociąg wciąż na szlaku');
  b.trainArrivedAtNeighbour({ nr: 88303 }); b.tick(1000);
  assert.equal(b.occupied, false);
  // SBL wjazdowa: pociąg sąsiada zjechał w całości przy usterce (dKo), usterka mija – odstęp zwalnia się sam
  assert.equal(b.canNeighbourDispatch(55205), true);
  b.neighbourTrainEntered({ nr: 55205 }); b.setFault(true); b.neighbourTrainArrived({ nr: 55205 });
  assert.equal(b.koPending, true);
  b.setFault(false);
  assert.equal(b.koPending, false);
  assert.equal(b.canNeighbourDispatch(5301), true);
});

test('SBL: sąsiad, który zgłosił pociąg przed naszym Zk, wyprawia go po zwolnieniu odstępu bez powtórnego zgłoszenia', () => {
  const bus = new EventBus();
  const b = new LineBlock('Z2', { name: 'Gdynia Główna', tile: { x: 69, y: 6 }, dir: 'E', direction: 'in', block: 'sbl' }, bus);
  assert.equal(b.neighbourRequests(55203), true);
  assert.equal(b.press('Zk').ok, true);
  b.commitOut();
  assert.equal(b.canNeighbourDispatch(55203), false, 'nasz wyjazd nastawiony – sąsiad czeka');
  b.trainDeparted({ nr: 88301 }); b.trainArrivedAtNeighbour({ nr: 88301 }); b.tick(1000);
  assert.equal(b.direction, 'out');
  assert.equal(b.canNeighbourDispatch(55203), true);
  assert.equal(b.direction, 'in');
});

test('walidacja rozkładu: wyjazd torem wjazdowym (direction in) i wjazd torem wyjazdowym (direction out) to błąd definicji', async () => {
  const { validateStation } = await import('../src/model/validate.js');
  const orlowo = (await import('../src/stations/gdynia-orlowo.js')).default;
  assert.deepEqual(validateStation(orlowo).errors, []);
  const bad = { ...orlowo, timetable: [
    { nr: 1, kind: 'os', name: 'x', from: null, to: 'Z2', dep: '07:05', track: '6' },
    { nr: 2, kind: 'os', name: 'x', from: 'Z1', to: 'S2', arr: '07:05', track: '1' },
  ] };
  const errs = validateStation(bad).errors;
  assert.ok(errs.some((e) => /Rozkład 1: wyjazd do Gdynia Główna torem wjazdowym 'Z2'/.test(e)), errs.join('\n'));
  assert.ok(errs.some((e) => /Rozkład 2: wjazd od Gdynia Główna torem wyjazdowym 'Z1'/.test(e)), errs.join('\n'));
});
