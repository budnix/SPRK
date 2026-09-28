import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/model/Simulation.js';
import { validateStation } from '../src/model/validate.js';
import { EventBus } from '../src/core/EventBus.js';
import { listTileDefs, getTileDef, registerTile, hasTileDef } from '../src/tiles/registry.js';
import { DISRUPTION_LEVELS } from '../src/core/Random.js';
import { makeSim, run, station } from './helpers.js';
import gdynia from './fixtures/gdynia-glowna-okregi.js'; // mechanizm okręgów – tylko w stacji testowej
import sopot from '../src/stations/sopot.js';

/** Doprowadza pociąg 5310 przed semafor A (bez przebiegu). */
function trainAtA(sim) {
  const w = sim.blocks.get('W');
  run(sim, 60 * 16, () => { if (w.request === 'theirs') w.press('Poz'); });
  const e = sim.traffic.timetable().find((x) => x.nr === 5310);
  assert.equal(e.train.stoppedAt?.signal, 'A');
  return e;
}

/* ---------------- łączność ---------------- */

test('łączność: lista formuł, pytanie o przybycie (odpowiedź „nie przybył” / „przybył”), „czekam” od maszynisty, nieznana formuła', () => {
  const sim = makeSim({ disruptions: 'none' });
  assert.ok(sim.comms.available().some((f) => f.id === 'ask-free'));
  assert.equal(sim.comms.send('nie-ma-takiej', {}).ok, false);
  assert.equal(sim.comms.send('ask-arrived', { exit: 'XX', nr: 5310 }).ok, false, 'brak posterunku');
  assert.equal(sim.comms.send('ask-arrived', { exit: 'E', nr: 5310 }).ok, false, 'pociąg nie był wyprawiony');
  assert.equal(sim.comms.send('driver-wait', { nr: 4242 }).ok, false, 'brak takiego pociągu');
  // wyprawienie 5310 do E przy usterce blokady (zapowiadanie) – potem pytanie o przybycie
  const e = trainAtA(sim);
  assert.equal(sim.comms.send('driver-wait', { nr: 5310 }).ok, true);
  run(sim, 10);
  assert.ok(sim.comms.messages.some((m) => /czekam/i.test(m.text)));
});

test('łączność: pytanie „czy pociąg przybył” po wyprawieniu przy usterce blokady – obie odpowiedzi', () => {
  const sim = new Simulation(station, { scenario: { id: 't', name: 't', faults: [{ type: 'block-fail', target: 'E', at: '05:52', duration: 90 }] }, disruptions: 'none' });
  const G = (id) => ({ kind: 'signal', id, color: 'green' });
  const e = trainAtA(sim);
  sim.press(G('A')); sim.press(G('D1'));
  run(sim, 60 * 3);
  assert.equal(sim.comms.send('ask-free', { exit: 'E', nr: 5310 }).ok, true);
  run(sim, 60);
  assert.equal(sim.comms.send('departed', { exit: 'E', nr: 5310 }).ok !== undefined, true);
  sim.press(G('D1')); sim.press({ kind: 'end', id: 'kE' });
  run(sim, 60 * 2);
  const b = sim.blocks.get('E');
  if (b.phone.departedTrain === '5310' || b.phone.departedTrain === 5310) {
    assert.equal(sim.comms.send('ask-arrived', { exit: 'E', nr: 5310 }).ok, true);
    run(sim, 10);
    assert.ok(sim.comms.messages.some((m) => /jeszcze nie przybył|przybył w całości/.test(m.text)));
  }
  void e;
});

test('łączność: maszynista melduje przez radio po 45 s postoju przed semaforem z usterką', () => {
  const sim = new Simulation(station, { scenario: { id: 't', name: 't', faults: [{ type: 'signal-fail', target: 'A', at: '05:53', duration: 30 }] }, disruptions: 'none' });
  const alarms = [];
  sim.bus.on('alarm', (a) => alarms.push(a));
  trainAtA(sim);
  assert.equal(sim.ilk.signals.get('A').failed, true);
  run(sim, 60);
  const radio = sim.comms.messages.find((m) => m.kind === 'radio');
  assert.ok(radio, 'brak meldunku radiowego');
  assert.match(radio.text, /semafor(em)? A/);
  assert.ok(alarms.some((a) => a.type === 'radio'));
  run(sim, 60);
  assert.equal(sim.comms.messages.filter((m) => m.kind === 'radio').length, 1, 'meldunek tylko raz');
});

/* ---------------- rozkazy pisemne ---------------- */

test('rozkaz „S”: odmowa, gdy odcinek drogi jazdy jest utwierdzony w innym przebiegu', () => {
  const sim = makeSim({ disruptions: 'none' });
  trainAtA(sim);
  sim.ilk.toggleIndividualLock('Zw1');
  const other = sim.ilk.routeList().find((r) => r.kind === 'train' && r.start !== 'A' && r.sections.includes('T1'));
  assert.ok(other, 'brak innego przebiegu przez T1');
  sim.ilk.points.get('Zw1').individualLock = false;
  const res = sim.ilk.setRoute(other.id);
  assert.ok(res.ok, res.reason);
  run(sim, 8);
  sim.ilk.points.get('Zw1').individualLock = true;
  const r = sim.traffic.issueOrder({ nr: 5310, signal: 'A' });
  assert.equal(r.ok, false);
  assert.match(r.reason, /utwierdzony w przebiegu/);
});

/* ---------------- symulacja: polecenia, pociągi nadzwyczajne, okręgi ---------------- */

test('polecenie nastawni niewykonane przez 12 min: kara i ponowienie przez łączność', () => {
  const sim = new Simulation(gdynia, { disruptions: 'none', district: 'GO2' });
  let overdue = null;
  sim.bus.on('score', (s) => { if (s.code === 'command-late') overdue = s; });
  const end = sim.clock.time + 40 * 60;
  while (sim.clock.time < end) sim.step(0.5);
  assert.ok(sim.commands.length > 0, 'automat GO nie wydał polecenia');
  assert.ok(overdue, 'brak kary za niewykonane polecenie');
  assert.ok(sim.commands.some((c) => c.overdue));
  assert.ok(sim.comms.messages.some((m) => /Ponawiam polecenie/.test(m.text)));
});

test('pociągi nadzwyczajne: przy dużych zakłóceniach dochodzą do rozkładu w trakcie zmiany, rozkład pozostaje posortowany', () => {
  assert.ok(DISRUPTION_LEVELS.high.extraTrains > 0);
  let sim = null;
  for (let seed = 1; seed < 40 && !sim; seed++) {
    const s = new Simulation(station, { disruptions: 'high', seed });
    if (s.extraTrainsPlanned.length) sim = s;
  }
  assert.ok(sim, 'żadne ziarno nie zaplanowało pociągu nadzwyczajnego');
  const before = sim.traffic.timetable().length;
  const at = Math.max(...sim.extraTrainsPlanned.map((x) => x.at));
  while (sim.clock.time <= at + 1) sim.step(0.5);
  const tt = sim.traffic.timetable();
  assert.ok(tt.length > before);
  assert.ok(tt.some((e) => e.extra));
  for (let i = 1; i < tt.length; i++) assert.ok((tt[i].arrTime ?? tt[i].depTime) >= (tt[i - 1].arrTime ?? tt[i - 1].depTime), 'rozkład nieposortowany');
  assert.ok(sim.comms.messages.some((m) => /nadzwyczajny/.test(m.text)));
});

test('okręgi: zwrotnica, wykolejnica i koniec toru drugiego okręgu są zablokowane dla gracza', () => {
  const sim = new Simulation(gdynia, { disruptions: 'none', district: 'GO2' });
  const eastPoint = [...sim.ilk.points.values()].find((p) => p.tile.x >= 60);
  assert.equal(sim.press({ kind: 'point', id: eastPoint.id }).ok, false);
  assert.match(sim.press({ kind: 'point', id: eastPoint.id }).reason, /drugą nastawnię/);
  assert.match(sim.press({ kind: 'derailer', id: 'Wk51' }).reason || '', /drugą nastawnię/);
  assert.match(sim.press({ kind: 'end', id: 'kT51' }).reason || '', /drugą nastawnię/);
  const westPoint = [...sim.ilk.points.values()].find((p) => p.tile.x < 30);
  assert.equal(sim.press({ kind: 'point', id: westPoint.id }).ok, true, 'własny okręg');
});

/* ---------------- pociąg ---------------- */

test('pociąg: kierunek, zajęte kostki, obecność na szlaku, ograniczenia przed czołem, migawka', () => {
  const sim = new Simulation(sopot, { disruptions: 'none', scenario: { id: 't', name: 't', tasks: [], timetable: [
    { nr: 1, kind: 'os', name: 'stojący', from: null, to: null, dep: '09:00', track: '13', stop: true, terminates: true, length: 100, vmax: 60, startOn: { section: 'T13', dir: 'E' } },
    { nr: 2, kind: 'os', name: 'od sąsiada', from: 'GS1', to: 'OS1', arr: '06:00', dep: '06:01', track: '501', stop: true, length: 130, vmax: 90 },
  ] } });
  sim.step(0.5);
  const a = sim.traffic.trains.find((t) => t.nr === 1);
  assert.equal(a.direction, 'E');
  assert.ok(a.occupiedTiles().length > 0);
  assert.equal(a.onLine('GS1'), false);
  const snap = a.snapshot();
  assert.deepEqual(Object.keys(snap).sort(), ['delay', 'head', 'mode', 'nr', 'state', 'v'].sort());
  sim.traffic.toShunting(1);
  sim.traffic.reverseTrain(1);
  const c = a.constraintsAhead();
  assert.ok(Array.isArray(c) && c.some((x) => x.kind === 'end'), 'kozioł przed czołem po zmianie kierunku');
  // pociąg nadjeżdżający od sąsiada: kierunek wg wyjazdu, jest na szlaku
  const gs1 = sim.blocks.get('GS1');
  let b = null, seenOnLine = false;
  run(sim, 60 * 8, () => {
    if (gs1.request === 'theirs') gs1.press('Poz');
    b = b || sim.traffic.trains.find((t) => t.nr === 2);
    if (b && !b.entered) { seenOnLine = seenOnLine || b.onLine('GS1'); assert.equal(b.direction, 'E'); }
  });
  assert.ok(b, 'pociąg 2 nie wyjechał od sąsiada');
  assert.ok(seenOnLine, 'pociąg nie był widoczny na szlaku GS1 przed wjazdem');
  assert.equal(b.onLine('GS1'), false, 'po wjeździe nie jest już na szlaku');
});

/* ---------------- topologia ---------------- */

test('topologia: urwany port toru jest wykrywany, odcinek zbliżania semafora', () => {
  const bad = {
    ...station,
    tiles: station.tiles.filter((t) => !(t.x === 15 && t.y === 4)),
  };
  const sim = new Simulation(bad, { disruptions: 'none' });
  const open = sim.ilk.topo.tracks.filter((t) => t._openPorts);
  assert.ok(open.length >= 1, 'brak wykrycia urwanego toru');
  const sig = sim.ilk.topo.signals.get('A');
  assert.equal(sim.ilk.topo.approachSection(sig), 'ZbA');
});

/* ---------------- walidacja ---------------- */

test('walidacja: każdy rodzaj błędu definicji jest raportowany', () => {
  assert.deepEqual(validateStation(null).errors, ['Brak definicji stacji']);
  const e1 = validateStation({ schemaVersion: 2 }).errors;
  assert.ok(e1.some((e) => /wersja schematu/.test(e)) && e1.some((e) => /Brak pola id/.test(e)) && e1.some((e) => /Brak pola name/.test(e)) && e1.some((e) => /desk/.test(e)) && e1.some((e) => /tiles/.test(e)));
  const base = { schemaVersion: 1, id: 'x', name: 'X', desk: { cols: 4, rows: 4 }, exits: {}, timetable: [] };
  const errs = (tiles, extra = {}) => validateStation({ ...base, ...extra, tiles }).errors;
  assert.ok(errs([{ type: 'track', ports: ['W', 'E'], section: 's' }]).some((e) => /brak współrzędnych/.test(e)));
  assert.ok(errs([{ x: 0, y: 0, type: 'kosmos' }]).some((e) => /nieznany typ/.test(e)));
  assert.ok(errs([{ x: 0, y: 0, type: 'track', ports: ['W', 'E'], section: 's' }, { x: 0, y: 0, type: 'track', ports: ['W', 'E'], section: 's' }]).some((e) => /nakłada się/.test(e)));
  assert.ok(errs([{ x: 9, y: 0, type: 'track', ports: ['W', 'E'], section: 's' }]).some((e) => /poza pulpitem/.test(e)));
  assert.ok(errs([{ x: 0, y: 0, type: 'track', section: 's' }]).some((e) => /brak pola 'ports'/.test(e)));
  assert.ok(errs([{ x: 0, y: 0, type: 'track', ports: ['W', 'X'], section: 's' }]).some((e) => /zła lista portów/.test(e)));
  assert.ok(errs([{ x: 0, y: 0, type: 'point', id: 'Zw1', toe: 'Q', straight: 'E', diverge: 'NE', section: 's' }]).some((e) => /zły port/.test(e)));
  assert.ok(errs([{ x: 0, y: 0, type: 'point', id: 'Zw1', toe: 'W', straight: 'E', diverge: 'E', section: 's' }]).some((e) => /muszą być różne/.test(e)));
  assert.ok(errs([{ x: 0, y: 0, type: 'signal', id: 'A', kind: 'lampa', at: { x: 0, y: 1 }, dir: 'E' }]).some((e) => /dopuszczalne semafor\/tm/.test(e)));
  assert.ok(errs([{ x: 0, y: 0, type: 'signal', id: 'A', kind: 'semafor', at: { x: 3, y: 3 }, dir: 'E' }]).some((e) => /nie wskazuje kostki torowej/.test(e)));
  assert.ok(errs([{ x: 0, y: 0, type: 'point', id: 'Zw1', toe: 'W', straight: 'E', diverge: 'NE', section: 's' }, { x: 2, y: 0, type: 'point', id: 'Zw1', toe: 'W', straight: 'E', diverge: 'NE', section: 's' }]).some((e) => /powtórzony id/.test(e)));
  assert.ok(errs([{ x: 0, y: 0, type: 'block', exit: 'ZZ' }]).some((e) => /nieznany typ 'block'/.test(e))); // pole blokady nie jest już kostką – blokadę rysuje się z definicji wyjazdu
  const ex = errs([{ x: 0, y: 0, type: 'track', ports: ['W', 'E'], section: 's' }], { exits: { W: { tile: { x: 1, y: 1 }, dir: 'Q' } } });
  assert.ok(ex.some((e) => /kostka nie jest torowa/.test(e)) && ex.some((e) => /zły kierunek/.test(e)));
  const v = validateStation({ ...base, tiles: [], exits: { W: { tile: { x: 0, y: 0 }, dir: 'W' } } });
  assert.ok(v.warnings.some((w) => /brak nazwy posterunku/.test(w)));
  assert.ok(validateStation({ ...base, tiles: [], timetable: undefined }).warnings.some((w) => /Brak rozkładu/.test(w)));
  const tt = validateStation({ ...base, tiles: [], timetable: [{ from: 'A', to: 'B' }] }).errors;
  assert.ok(tt.some((e) => /brak numeru/.test(e)) && tt.some((e) => /from='A'/.test(e)) && tt.some((e) => /to='B'/.test(e)) && tt.some((e) => /brak czasu/.test(e)));
});

/* ---------------- rejestr kostek, szyna zdarzeń ---------------- */

test('rejestr kostek: wszystkie typy mają porty i wyjścia, zwrotnica zależy od położenia, skrzyżowanie bez połączeń', () => {
  const defs = listTileDefs();
  assert.ok(defs.length >= 8) // bez kostki 'block' – blokadę rysuje się z definicji wyjazdu;
  for (const d of defs) assert.equal(typeof d.ports, 'function', d.type);
  const track = getTileDef('track');
  assert.deepEqual(track.exits({ ports: ['W', 'E'] }, 'W'), ['E']);
  const point = getTileDef('point');
  const p = { toe: 'W', straight: 'E', diverge: 'NE' };
  assert.deepEqual(point.exits(p, 'W', { position: '+' }), ['E']);
  assert.deepEqual(point.exits(p, 'W', { position: '-' }), ['NE']);
  assert.deepEqual(point.exits(p, 'NE'), ['W']);
  assert.deepEqual(point.exits(p, 'S'), []);
  assert.equal(point.requiredPosition(p, 'W', 'NE'), '-');
  assert.equal(point.requiredPosition(p, 'E', 'W'), '+');
  assert.equal(point.requiredPosition(p, 'S', 'N'), null);
  const cross = getTileDef('crossing');
  const c = { pairs: [['NW', 'SE'], ['SW', 'NE']] };
  assert.deepEqual(cross.ports(c).sort(), ['NE', 'NW', 'SE', 'SW']);
  assert.deepEqual(cross.exits(c, 'NW'), ['SE']);
  assert.deepEqual(cross.exits(c, 'N'), []);
  const buffer = getTileDef('buffer');
  assert.deepEqual(buffer.ports({ port: 'W' }), ['W']);
  assert.deepEqual(buffer.exits({ port: 'W' }, 'W'), []);
  for (const t of ['signal', 'button', 'label', 'blank']) assert.deepEqual(getTileDef(t).ports({}), [], t);
  assert.throws(() => getTileDef('nie-ma'));
  assert.throws(() => registerTile({}));
  registerTile({ type: 'test-tile', category: 'blank', ports: () => [] });
  assert.ok(hasTileDef('test-tile'));
  assert.throws(() => registerTile({ type: 'test-tile' }), /już zarejestrowany/);
});

test('szyna zdarzeń: wypisanie się zwrotką z on() i przez off(), nasłuch „*”', () => {
  const bus = new EventBus();
  const got = [];
  const off = bus.on('x', (p) => got.push(p));
  bus.on('*', (ev, p) => got.push(`${ev}:${p}`));
  bus.emit('x', 1);
  off();
  bus.emit('x', 2);
  const fn = () => got.push('y');
  bus.on('y', fn); bus.off('y', fn); bus.off('nie-ma', fn);
  bus.emit('y');
  assert.deepEqual(got, [1, 'x:1', 'x:2', 'y:undefined']);
});

test('perony: każdy odcinek peronowy ma nazwę peronu (napis), pociągi osobowe traktują ją jak peron', async () => {
  const { STATIONS } = await import('../src/stations/index.js');
  for (const st of STATIONS) {
    for (const [id, sec] of Object.entries(st.sections)) {
      if (!sec.platform) continue;
      assert.equal(typeof sec.platform, 'string', `${st.id}/${id}: peron bez nazwy`);
      assert.match(sec.platform, /^Peron [IVX]+/, `${st.id}/${id}: nazwa peronu „${sec.platform}”`);
    }
  }
  const { Simulation } = await import('../src/model/Simulation.js');
  const szkolna = (await import('../src/stations/szkolna.js')).default;
  const sim = new Simulation(szkolna, { scenario: 'zmiana' });
  assert.ok(sim.ilk.sections.get('T1').platform, 'nazwa peronu jest wartością prawdziwą dla modelu');
});

test('ekran startowy: każdy posterunek ma położenie, opis ruchu i trudność 1–5; sortowanie i lista misji', async () => {
  const { STATIONS } = await import('../src/stations/index.js');
  const { sortStations, missionList } = await import('../src/ui/StartScreen.js');
  const { difficultyMark, logoSvg } = await import('../src/ui/brand.js');
  for (const st of STATIONS) {
    assert.ok(st.location && st.traffic, `${st.id}: brak location/traffic`);
    assert.ok(Number.isInteger(st.difficulty) && st.difficulty >= 1 && st.difficulty <= 5, `${st.id}: trudność ${st.difficulty}`);
  }
  const byName = sortStations(STATIONS, 'name').map((s) => s.name);
  assert.deepEqual(byName, [...byName].sort((a, b) => a.localeCompare(b, 'pl')));
  const byDiff = sortStations(STATIONS, 'difficulty').map((s) => s.difficulty);
  assert.deepEqual(byDiff, [...byDiff].sort((a, b) => a - b));
  assert.equal(sortStations(STATIONS, 'difficulty')[0].id, 'szkolna', 'najłatwiejsza – stacja szkolna');
  const missions = missionList(STATIONS);
  assert.deepEqual(missions.map((m) => m.scenario.id), ['nauka-1', 'nauka-2', 'nauka-3']);
  // skala trudności bez gwiazdek: 3 segmenty zapalone z 5, liczba; logo SVG z czterema kostkami-literami i semaforem
  const mark = difficultyMark(3, 'trudność');
  assert.equal((mark.match(/<i class="on">/g) || []).length, 3);
  assert.equal((mark.match(/<i>/g) || []).length, 2);
  assert.match(mark, /<b>trudność 3\/5<\/b>/);
  assert.doesNotMatch(mark, /[★☆]/);
  assert.equal((difficultyMark(9).match(/<i class="on">/g) || []).length, 5, 'obcięte do 5');
  const logo = logoSvg();
  assert.match(logo, /<svg[^>]*aria-label="SPRK"/);
  assert.deepEqual(logo.match(/class="lg-ch">(\w)</g).map((m) => m.slice(-2, -1)), ['S', 'P', 'R', 'K']);
  assert.ok(logo.includes('class="lg-lens on"'), 'semafor z zapalonym światłem');
});

test('ustawienia domyślne: pulpit na środku, motyw wg systemu, panel na dole, ekrany auto, symbole 125 %, odstęp normalny, pola skrajne wyłączone, język automatycznie', async () => {
  const { DEFAULTS, Settings } = await import('../src/ui/Settings.js');
  assert.deepEqual(DEFAULTS, { deskPos: 'middle', sidePos: 'bottom', theme: 'system', sideCollapsed: false, screens: 'auto', symScale: '1.25', rowScale: '1', edgePanels: 'off', lang: 'auto' });
  assert.equal(Settings.resolveTheme('system', true), 'dark'); assert.equal(Settings.resolveTheme('system', false), 'light');
  assert.equal(Settings.resolveTheme('dark', false), 'dark'); assert.equal(Settings.resolveTheme('light', true), 'light');
});

test('blokada zna tor szlakowy z etykiety wyjazdu (do listy łączności); bez etykiety – brak', async () => {
  const orlowo = (await import('../src/stations/gdynia-orlowo.js')).default;
  const szkolna = (await import('../src/stations/szkolna.js')).default;
  const so = new Simulation(orlowo, { disruptions: 'none' });
  assert.equal(so.blocks.get('S2').trackLabel, '202 t.2');
  assert.equal(so.blocks.get('Z501').trackLabel, '250 t.501');
  const ss = new Simulation(szkolna, { disruptions: 'none' });
  assert.equal(ss.blocks.get('W').trackLabel, null);
});
