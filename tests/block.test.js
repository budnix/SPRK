import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventBus } from '../src/core/EventBus.js';
import { LineBlock } from '../src/model/Block.js';

function mk() {
  const bus = new EventBus();
  const b = new LineBlock('W', { name: 'Lipowa', tile: { x: 0, y: 4 }, dir: 'W' }, bus);
  return { b, bus };
}

test('sąsiad żąda pozwolenia, Poz ustawia kierunek wjazdu, Ko po przyjeździe (po minięciu semafora wjazdowego)', () => {
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
  assert.equal(b.koPending, false, 'ogon zjechał ze szlaku, ale czoło jeszcze przed semaforem wjazdowym');
  b.entryPassed(true); // pociąg minął semafor wjazdowy na sygnał zezwalający – stwierdzenie przejazdu
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

// dKo i dPo nie kasują blokady (LIRK Eap): dKo przygotowuje blok końcowy przed wjazdem na Sz, dPo blokuje blok
// początkowy po wyjeździe na Sz / rozkaz. Dawniej oba zerowały blokadę także z pociągiem na szlaku.
test('dKo przygotowuje blok końcowy, dPo blokuje blok początkowy – żaden nie kasuje blokady; oba liczą', () => {
  const { b, bus } = mk();
  const score = []; bus.on('score', (s) => score.push(s));
  assert.equal(b.press('dKo').ok, false, 'dKo bez przyjmowanego pociągu');
  b.neighbourRequests(); b.press('Poz'); b.neighbourTrainEntered({ nr: 3 });
  assert.equal(b.press('dKo').ok, true);
  assert.equal(b.counters.dKo, 1);
  assert.equal(b.direction, 'in', 'dKo nie kasuje kierunku');
  assert.equal(b.occupied, true, 'dKo nie zwalnia toru szlakowego');
  assert.equal(score.at(-1).points, 0, 'przed wjazdem pociągu na Sz – uzasadnione');
  b.entryPassed(false); b.neighbourTrainArrived({ nr: 3 }); // bez stwierdzenia przejazdu (wjazd na Sz)
  assert.equal(b.press('Ko').ok, true, 'po dKo Ko działa bez stwierdzenia przejazdu');
  assert.equal(b.press('dPo').ok, false, 'dPo bez pociągu wyprawionego bez sygnału');
  assert.equal(b.counters.dPo, 0);
  b.press('Wbl'); b.tick(100);
  b.trainDeparted({ nr: 4, exitAuth: '*' }); // wyjazd na Sz
  assert.equal(b.poBlocked, false, 'Sz nie blokuje bloku początkowego');
  assert.equal(b.press('dPo').ok, true);
  assert.equal(b.counters.dPo, 1);
  assert.equal(b.poBlocked, true, 'dPo zablokował blok początkowy');
  assert.equal(b.occupied, true);
});

test('Ko bez stwierdzenia przejazdu (wjazd na Sz bez dKo) odmawia; spóźnione dKo – kara, potem Ko', () => {
  const { b, bus } = mk();
  const score = []; bus.on('score', (s) => score.push(s));
  b.neighbourRequests(); b.press('Poz'); b.neighbourTrainEntered({ nr: 5 });
  b.entryPassed(false); // Sz na semaforze wjazdowym
  b.neighbourTrainArrived({ nr: 5 });
  const ko = b.press('Ko');
  assert.equal(ko.ok, false);
  assert.match(ko.reason, /stwierdzenia przejazdu/);
  assert.equal(b.press('dKo').ok, true);
  assert.ok(score.at(-1).points < 0, 'dKo po wjeździe – spóźnione');
  assert.equal(b.press('Ko').ok, true);
  assert.equal(b.direction, null);
});

// Kierunek SBL zmienia się tylko za zgodą sąsiada (Ir-1 §30 ust. 2 pkt 1) – dawniej Zk działało od razu, a sąsiad sam
// przestawiał kierunek; odstęp po naszym pociągu zwalnia się bez potwierdzenia sąsiada (SBL nie ma Ko).
test('blokada samoczynna (SBL): bez pozwoleń i bez Ko, odstęp zwalnia się sam, zmiana kierunku Zk za zgodą sąsiada', () => {
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
  // jazda „pod prąd”: Zk to prośba – kierunek zmienia się po zgodzie sąsiada
  assert.equal(inn.gate().ok, false);
  assert.equal(inn.press('Zk').ok, true);
  assert.equal(inn.request, 'ours');
  assert.equal(inn.direction, 'in', 'bez zgody sąsiada kierunek bez zmian');
  inn.tick(100);
  assert.equal(inn.direction, 'out');
  assert.equal(inn.gate().ok, true);
  inn.commitOut();
  assert.equal(inn.neighbourRequests(14), true, 'sąsiad zgłasza pociąg');
  assert.equal(inn.request, null, 'nasz wyjazd nastawiony – sąsiad nie prosi o kierunek');
  inn.trainDeparted({ nr: 21 });
  assert.equal(inn.gate().ok, false);
  inn.trainArrivedAtNeighbour({ nr: 21 });
  assert.equal(inn.gate().ok, true, 'odstęp zwolniony, gdy pociąg go opuścił – bez Ko sąsiada');
  assert.equal(inn.direction, 'out', 'kierunek zostaje, dopóki ktoś go nie zmieni');
  // sąsiad z pociągiem prosi o kierunek przyjazdu i czeka na zgodę (Zk)
  assert.equal(inn.canNeighbourDispatch(15), false);
  assert.equal(inn.request, 'theirs');
  assert.equal(inn.direction, 'out');
  assert.equal(inn.press('Zk').ok, true, 'zgoda');
  assert.equal(inn.direction, 'in');
  assert.equal(inn.canNeighbourDispatch(15), true);
  // tor wyjazdowy: bez Wbl, po wyjeździe blok początkowy do potwierdzenia przyjazdu przez sąsiada
  assert.equal(out.gate().ok, true);
  out.trainDeparted({ nr: 22 });
  assert.equal(out.gate().ok, false);
  out.trainArrivedAtNeighbour({ nr: 22 });
  assert.equal(out.gate().ok, true);
  assert.equal(out.direction, 'out');
  // usterka: zapowiadanie telefoniczne – na torze właściwym linii dwutorowej sąsiad nie pyta o drogę, wyprawia po
  // potwierdzonym przyjeździe poprzedniego pociągu (Ir-1 §23 ust. 2–4; dawniej gra wymagała „Czy droga … wolna?”)
  inn.setFault(true);
  assert.equal(inn.press('Zk').ok, false);
  assert.equal(inn.neighbourRequests(13), true);
  assert.equal(inn.phoneAnswerFree(13).ok, false, 'sąsiad nie pytał');
  assert.equal(inn.canNeighbourDispatch(13), true);
  inn.neighbourTrainEntered({ nr: 13 }); inn.entryPassed(true); inn.neighbourTrainArrived({ nr: 13 });
  assert.equal(inn.koPending, true, 'przy usterce przyjazd potwierdza się telefonicznie');
  assert.equal(inn.phoneReportArrival(13).ok, true);
  assert.equal(inn.koPending, false, 'telefonogram zastępuje Ko (bez dKo)');
  assert.equal(inn.press('dKo').ok, false, 'SBL nie ma bloku końcowego');
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
  b.entryPassed(true); b.neighbourTrainArrived({ nr: 11 });
  assert.equal(b.lineTrain, null, 'po zjeździe w całości numer znika (Ko jeszcze do obsłużenia)');
  assert.equal(b.press('Ko').ok, true);
  b.press('Wbl'); b.tick(100);
  b.trainDeparted({ nr: 22 });
  assert.equal(b.lineTrain, 22);
  b.trainArrivedAtNeighbour({ nr: 22 }); b.tick(1000);
  assert.equal(b.lineTrain, null, 'po potwierdzeniu przyjazdu przez sąsiada');
  assert.equal(b.snapshot().lineTrain, null);
  // dPo nie kasuje blokady ani numeru (dawniej kasował) – blok początkowy blokuje, pociąg dalej na szlaku
  b.press('Wbl'); b.tick(2000); b.trainDeparted({ nr: 23, exitAuth: '*' });
  assert.equal(b.lineTrain, 23);
  b.press('dPo');
  assert.equal(b.lineTrain, 23);
  assert.equal(b.poBlocked, true);
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
  assert.equal(b.occupied, false, 'przy usterce tor wolny po telefonicznym potwierdzeniu przyjazdu');
  assert.equal(b.poBlocked, true, 'blok początkowy zablokowany do naprawy blokady');
  assert.equal(b.canNeighbourDispatch(55203), true, 'tor właściwy sąsiada – wyprawia po potwierdzonym przyjeździe, bez zapytania');
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
  b.neighbourTrainEntered({ nr: 55205 }); b.setFault(true); b.entryPassed(false); b.neighbourTrainArrived({ nr: 55205 });
  assert.equal(b.koPending, true);
  b.setFault(false);
  assert.equal(b.koPending, false);
  assert.equal(b.canNeighbourDispatch(5301), true);
});

test('SBL: sąsiad, który zgłosił pociąg przed naszym Zk, po zwolnieniu odstępu prosi o kierunek i wyprawia po zgodzie', () => {
  const bus = new EventBus();
  const b = new LineBlock('Z2', { name: 'Gdynia Główna', tile: { x: 69, y: 6 }, dir: 'E', direction: 'in', block: 'sbl' }, bus);
  assert.equal(b.neighbourRequests(55203), true);
  assert.equal(b.press('Zk').ok, true); b.tick(100);
  assert.equal(b.direction, 'out');
  b.commitOut();
  assert.equal(b.canNeighbourDispatch(55203), false, 'nasz wyjazd nastawiony – sąsiad czeka');
  b.trainDeparted({ nr: 88301 }); b.trainArrivedAtNeighbour({ nr: 88301 });
  assert.equal(b.direction, 'out');
  assert.equal(b.canNeighbourDispatch(55203), false, 'czeka na zgodę');
  assert.equal(b.request, 'theirs');
  b.press('Zk');
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

// Po naprawie blokady automatyk ustawia ją zgodnie ze stanem szlaku. Wcześniej numer „przybył” był wspólny dla obu
// kierunków i nadpisywał się – blok początkowy mógł zostać zablokowany na zawsze (Reda, usterka blokady od Helu).
test('usterka Eap: po naprawie blokada wg stanu szlaku – wolny: stan zasadniczy; nasz pociąg: Po do Ko sąsiada; pociąg sąsiada: wjazd', () => {
  const { b } = mk();
  b.press('Wbl'); b.tick(100); b.trainDeparted({ nr: 1 });
  assert.equal(b.poBlocked, true);
  b.setFault(true);
  b.trainArrivedAtNeighbour({ nr: 1 }); // przyjazd potwierdzony telefonicznie – Po zostaje zablokowany do naprawy
  assert.equal(b.poBlocked, true);
  assert.equal(b.occupied, false);
  // pociąg sąsiada na zapowiadanie
  assert.equal(b.phoneAskFromNeighbour(2), true);
  assert.equal(b.phoneAnswerFree(2).ok, true);
  b.neighbourTrainEntered({ nr: 2 }); b.entryPassed(true); b.neighbourTrainArrived({ nr: 2 });
  assert.equal(b.phoneReportArrival(2).ok, true);
  b.setFault(false);
  assert.deepEqual([b.poBlocked, b.direction, b.koPending], [false, null, false], 'wolny szlak – stan zasadniczy');
  b.press('Wbl'); b.tick(300);
  assert.equal(b.gate().ok, true);
  // nasz pociąg na szlaku w chwili naprawy
  b.trainDeparted({ nr: 3 }); b.setFault(true); b.setFault(false);
  assert.deepEqual([b.poBlocked, b.direction], [true, 'out']);
  b.trainArrivedAtNeighbour({ nr: 3 }); b.tick(1000);
  assert.deepEqual([b.poBlocked, b.occupied, b.direction], [false, false, null]);
  // pociąg sąsiada na szlaku w chwili naprawy – kierunek wjazdu, po przyjeździe zwykłe Ko
  b.setFault(true);
  assert.equal(b.phoneAskFromNeighbour(4), true); b.phoneAnswerFree(4);
  b.neighbourTrainEntered({ nr: 4 });
  b.setFault(false);
  assert.equal(b.direction, 'in');
  b.entryPassed(true); b.neighbourTrainArrived({ nr: 4 });
  assert.equal(b.press('Ko').ok, true);
  assert.equal(b.direction, null);
});

// SBL nie ma Ko ani bloku początkowego (Ir-1 §29 ust. 1–3) – komunikaty mówią o odstępie; zgoda na zmianę kierunku
// trafia do dziennika z godziną (Ir-1 §30 ust. 2 pkt 1).
test('SBL: komunikaty o odstępie (bez „Ko” i „bloku początkowego”), godzina zgody na zmianę kierunku w dzienniku', () => {
  const bus = new EventBus();
  const msgs = []; bus.on('log', (l) => msgs.push(l.msg));
  const b = new LineBlock('Z1', { name: 'Zalesie', tile: { x: 35, y: 4 }, dir: 'E', direction: 'out', block: 'sbl' }, bus);
  b.tick(6 * 3600);
  b.trainDeparted({ nr: 7 }); b.trainArrivedAtNeighbour({ nr: 7 });
  assert.equal(b.occupied, false, 'odstęp wolny od razu po zjeździe pociągu');
  b.canNeighbourDispatch(8); b.press('Zk');
  assert.ok(msgs.some((m) => /Zgoda na zmianę kierunku.*06:00.*dziennik ruchu/.test(m)), msgs.join('\n'));
  assert.ok(!msgs.some((m) => /\bKo\b|blok początkowy/.test(m)), msgs.join('\n'));
});
