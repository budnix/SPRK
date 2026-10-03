import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/model/Simulation.js';
import { AutoOperator } from '../src/model/Operator.js';
import { LineBlock } from '../src/model/Block.js';
import { EventBus } from '../src/core/EventBus.js';
import sopot from '../src/stations/sopot.js';
import { violations } from '../src/model/check/invariants.js';
import { Clock } from './helpers.js';

/*
 * Jazda po torze lewym na szlaku z blokadą samoczynną dwukierunkową (Sopot → Gdańsk Oliwa): po zgodzie sąsiada (Zk)
 * pociąg wyjeżdża torem 1 zamiast toru 2 z rozkładu – zwykła odpowiedź na usterkę toru właściwego.
 */

test('jazda po torze lewym: zajęty jest szlak, na który pociąg naprawdę wjechał, nie szlak z rozkładu – sąsiad nie wyśle pociągu naprzeciw', () => {
  // wcześniej odjazd zajmował blokadę szlaku z rozkładu (GD2): tor 1 (GD1) pod pociągiem był „wolny”, sąsiad mógł dostać
  // kierunek i wyprawić pociąg naprzeciw, a GD2 zostawał zajęty na zawsze
  const sim = new Simulation(sopot, { disruptions: 'none', scenario: { id: 't', name: 't', endTime: '09:00', srk: 'komputerowe', tasks: [], timetable: [
    { nr: 9001, kind: 'os', name: 'Osobowy', from: 'OR2', to: 'GD2', arr: '07:02', dep: '07:06', track: '1', stop: true, length: 130, vmax: 100, dwell: 60 },
    { nr: 55104, kind: 'os', name: 'Osobowy', from: 'GD1', to: 'OR1', arr: '07:12', dep: '07:13', track: '2', stop: true, length: 130, vmax: 100, dwell: 60 },
  ] } });
  const op = new AutoOperator(sim, { district: null, role: 'full' });
  const e = sim.traffic.entry(9001);
  const gd1 = sim.blocks.get('GD1'), gd2 = sim.blocks.get('GD2');
  // automat przyjmuje 9001 na tor 1; potem dyżurny: Zk na GD1 i przebieg złożony na tor lewy
  let n = 0;
  while (sim.clock.time < Clock.parse('07:04') && !(e.actualArr != null && e.train.v === 0)) { sim.step(0.5); if (n++ % 4 === 0) op.tick(); }
  assert.ok(e.actualArr != null, '9001 przy peronie');
  assert.ok(sim.execute({ type: 'block', exit: 'GD1', btn: 'Zk' }).ok);
  while (sim.clock.time < Clock.parse('07:05')) sim.step(0.5);
  assert.equal(gd1.direction, 'out', 'sąsiad zgodził się na zmianę kierunku');
  const res = sim.execute({ type: 'route', start: e.train.nextSignal(), end: sim.ilk.routes.get('C-GD1').endButton, kind: 'train', compound: true });
  assert.ok(res.ok, res.reason);
  let onLine = 0, refused = 0, routeSet = false;
  // własna pętla, nie `play`: automat wraca dopiero po przyjeździe 9001 i liczy rytm od tej chwili (wspólne `n`)
  while (sim.clock.time < Clock.parse('07:30')) {
    sim.step(0.5);
    routeSet ||= sim.ilk.routeIsSet('C-GD1');
    if (e.phase === 'at-neighbour' && n++ % 4 === 0) op.tick(); // dalej znów automat (wjazd 55104)
    // sąsiad chce wysłać 55104 torem 1 – od nastawienia naszego przebiegu dyżurny próbuje dać zgodę na każdą prośbę;
    // blokada odmawia: najpierw przez nastawiony przebieg, potem przez zajęty tor
    if (routeSet && gd1.request === 'theirs' && !sim.execute({ type: 'block', exit: 'GD1', btn: 'Zk' }).ok) refused++;
    if (e.train && sim.traffic.trains.includes(e.train) && e.train.onLine('GD1')) { // w drodze (po przyjeździe pociąg znika z ruchu)
      onLine++;
      assert.equal(gd1.occupied, true, 'tor 1 zajęty pod pociągiem');
      assert.equal(gd2.occupied, false, 'tor 2 z rozkładu wolny');
    }
    assert.deepEqual(violations(sim), [], Clock.format(sim.clock.time, true));
  }
  assert.ok(onLine > 0, '9001 jechał torem 1');
  assert.equal(e.actualExit, 'GD1');
  assert.equal(e.phase, 'at-neighbour');
  assert.deepEqual([gd1.occupied, gd2.occupied, gd2.poBlocked], [false, false, false], 'oba tory wolne po przyjeździe');
  assert.equal(sim.traffic.entry(55104).phase, 'at-neighbour', '55104 przyjechał po zwolnieniu toru 1');
  assert.ok(refused > 0, 'zgoda na zmianę kierunku odmówiona, dopóki tor 1 był nasz');
});

test('SBL: zgoda na zmianę kierunku (Zk) odmówiona, gdy nasz przebieg wyjazdowy na ten tor jest nastawiony; po jego zwolnieniu – można', () => {
  // wcześniej zgoda przechodziła: kierunek wracał do sąsiada, sygnał wyjazdowy gasł, a pociąg, który minął już semafor,
  // jechał naprzeciw pociągu sąsiada
  const b = new LineBlock('GD1', { name: 'Gdańsk Oliwa', tile: { x: 0, y: 6 }, dir: 'W', direction: 'in', block: 'sbl' }, new EventBus());
  b.tick(25200);
  assert.ok(b.press('Zk').ok);
  b.tick(25240);
  assert.equal(b.direction, 'out');
  b.neighbourRequests(5100);
  assert.equal(b.request, 'theirs', 'sąsiad prosi o kierunek');
  b.commitOut(); // nasz przebieg wyjazdowy nastawiony
  assert.equal(b.press('Zk').ok, false);
  assert.equal(b.direction, 'out');
  assert.equal(b.gate('signal', 'C-GD1').ok, true, 'sygnał wyjazdowy zostaje');
  b.releaseCommit(); // przebieg zwolniony bez wyjazdu
  assert.equal(b.press('Zk').ok, true);
  assert.equal(b.direction, 'in');
});

test('SBL bez łączności, tor zwykle wjazdowy: po „droga wolna” dla naszego pociągu (albo po Zk na nasz kierunek) sąsiad nie wyprawia swojego', () => {
  // wcześniej przy usterce tor o kierunku zasadniczym „wjazd” był dla sąsiada wolny, gdy nie był zajęty – mimo naszej
  // zapowiedzi pociągu po torze lewym; sąsiad wyprawiał swój pociąg naprzeciw
  const sbl = () => { const b = new LineBlock('GD1', { name: 'Gdańsk Oliwa', tile: { x: 0, y: 6 }, dir: 'W', direction: 'in', block: 'sbl' }, new EventBus()); b.tick(25200); return b; };
  const a = sbl();
  a.setFault(true);
  assert.ok(a.phoneAskNeighbour(9001).ok);
  a.tick(25260);
  assert.equal(a.phone.permissionFor, 9001, '„droga wolna” dla 9001');
  assert.equal(a.gate('substitute').ok, true, 'nasz pociąg może jechać na Sz');
  assert.equal(a.neighbourRequests(5100), false);
  assert.equal(a.canNeighbourDispatch(5100), false, 'sąsiad nie wyprawia 5100 naprzeciw');
  // kierunek zmieniony na nasz (Zk) przed usterką
  const b = sbl();
  assert.ok(b.press('Zk').ok);
  b.tick(25240);
  assert.equal(b.direction, 'out');
  b.setFault(true);
  assert.equal(b.canNeighbourDispatch(5100), false, 'kierunek nasz – sąsiad nie wyprawia');
  // bez naszej zapowiedzi i przy kierunku zasadniczym sąsiad wyprawia jak dotąd (po potwierdzeniu przyjazdu)
  const c = sbl();
  c.setFault(true);
  assert.equal(c.canNeighbourDispatch(5100), true);
});
