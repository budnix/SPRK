import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeSim, run, grant } from './helpers.js';
import { Simulation } from '../src/model/Simulation.js';
import sopot from '../src/stations/sopot.js';
import { monitorMenu, lineTrains, MODE_KINDS } from '../src/srk/monitor.js';

/*
 * Polecenia stanowiska komputerowego (`src/srk/monitor.js`): menu elementu jako dane – co monitor pozwala zrobić
 * z sygnalizatorem, zwrotnicą, wykolejnicą i blokadą szlaku, które polecenia są specjalne (Ie-104.1 §11–12).
 * Widok tylko rysuje menu i wykonuje wybraną pozycję (tests/e2e/screen.spec.js).
 */

const sim = () => makeSim({ disruptions: 'none', srk: 'komputerowe' });
const modes = (menu) => menu.items.filter((i) => i.mode).map((i) => `${i.mode}${i.special ? '!' : ''}`);

test('semafor: przebieg pociągowy (i manewrowy, gdy semafor ma sygnały manewrowe), Stój, zastopowanie, ZCZ, ZDP i SZ jako polecenia specjalne', () => {
  const s = sim();
  const a = monitorMenu(s, { kind: 'signal', id: 'A' });
  assert.equal(a.title, 'Semafor A');
  assert.deepEqual(modes(a), ['train', 'stop', 'sstop', 'pz', 'dpz!', 'sz!']);
  assert.deepEqual(a.items[0], { mode: 'train', label: 'Nastawienie przebiegu pociągowego od A …', route: 'green', signal: 'A' });
  assert.deepEqual(a.items.find((i) => i.mode === 'sz'), { mode: 'sz', label: 'Sygnał zastępczy (SZ)', special: true, target: { kind: 'signal', id: 'A' }, cmd: { type: 'substitute', signal: 'A' } });
  assert.deepEqual(a.items.find((i) => i.mode === 'pz').cmd, { type: 'release', signal: 'A' });
  assert.deepEqual(modes(monitorMenu(s, { kind: 'signal', id: 'D2' })), ['train', 'shunt', 'stop', 'sstop', 'pz', 'dpz!', 'sz!']);
  const tm = monitorMenu(s, { kind: 'signal', id: 'Tm1' });
  assert.equal(tm.title, 'Tarcza manewrowa Tm1');
  assert.deepEqual(modes(tm), ['shunt', 'stop', 'sstop', 'pz', 'dpz!'], 'tarcza: bez przebiegu pociągowego i bez SZ');
});

test('zwolnienie doraźne: przebiegu manewrowego zwykłe (ZDM), pociągowego specjalne (ZDP); zastopowanie przełącza na odwołanie', () => {
  const s = sim();
  s.ilk.setRoute('D2-kT3m');
  run(s, 10);
  const dpz = monitorMenu(s, { kind: 'signal', id: 'D2' }).items.find((i) => i.mode === 'dpz');
  assert.deepEqual(dpz, { mode: 'dpz', label: 'Zwolnienie doraźne przebiegu manewrowego (ZDM)', cmd: { type: 'release', signal: 'D2', emergency: true } });
  s.execute({ type: 'signal-stop', signal: 'A', on: true });
  assert.deepEqual(monitorMenu(s, { kind: 'signal', id: 'A' }).items.find((i) => i.mode === 'sstop').cmd, { type: 'signal-stop', signal: 'A', on: false });
});

test('zwrotnica i wykolejnica: przestawienie w drugie położenie i zamknięcie – napisy wg stanu', () => {
  const s = sim();
  const p = monitorMenu(s, { kind: 'point', id: 'Zw1' });
  assert.deepEqual(p.items.map((i) => [i.mode, i.cmd]), [['zw', { type: 'point', id: 'Zw1' }], ['zz', { type: 'lock', id: 'Zw1' }]]);
  assert.match(p.items[0].label, /położenie minus/);
  s.execute({ type: 'lock', id: 'Zw1' });
  assert.match(monitorMenu(s, { kind: 'point', id: 'Zw1' }).items[1].label, /Odwołanie zamknięcia/);
  const wk = monitorMenu(s, { kind: 'derailer', id: 'Wk1' });
  assert.deepEqual(wk.items.map((i) => i.cmd), [{ type: 'derailer', id: 'Wk1' }, { type: 'lock', id: 'Wk1', derailer: true }]);
  for (const [mode, kinds] of Object.entries(MODE_KINDS)) assert.ok(kinds.every((k) => ['signal', 'point', 'derailer'].includes(k)), mode);
});

test('blokada szlaku: Eap – Wbl, oWbl, Poz, Ko i doraźne dPo / dKo jako specjalne; przycisk końca przy szlaku otwiera to samo menu; koniec toru – wskazówka', () => {
  const s = sim();
  const m = monitorMenu(s, { kind: 'blockpanel', exit: 'W' });
  assert.match(m.title, /blokada Eap$/);
  assert.deepEqual(m.items.filter((i) => i.cmd).map((i) => `${i.cmd.btn}${i.special ? '!' : ''}`), ['Wbl', 'oWbl', 'Poz', 'Ko', 'dPo!', 'dKo!']);
  assert.deepEqual(m.items.slice(-2), [{ sep: true }, { lineTrains: [] }]);
  assert.deepEqual(monitorMenu(s, { kind: 'end', id: 'kW' }), m);
  assert.deepEqual(monitorMenu(s, { kind: 'end', id: 'kT3' }).items, [{ label: 'Wskaż najpierw sygnalizator początku przebiegu' }]);
  assert.equal(monitorMenu(s, { kind: 'label', id: 'x' }), null);
});

test('blokada samoczynna (Sopot): prośba o zmianę kierunku (Zk), bez bloków Po / Ko; pod blokadą pociągi szlaku – na szlaku i zgłoszone', () => {
  const s = new Simulation(sopot, { disruptions: 'none', srk: 'komputerowe' });
  const sbl = Object.keys(sopot.exits).find((id) => s.blocks.get(id).auto);
  const m = monitorMenu(s, { kind: 'blockpanel', exit: sbl });
  assert.match(m.title, /blokada samoczynna$/);
  assert.deepEqual(m.items.filter((i) => i.cmd).map((i) => i.cmd.btn), ['Zk']);
  // pociąg zgłoszony przez sąsiada i czekający – kasetka w konturze; na szlaku – pełna
  const eap = makeSim({ disruptions: 'none' });
  run(eap, 8 * 60, grant('E'));
  const trains = [...lineTrains(eap, 'E'), ...lineTrains(eap, 'W')];
  assert.ok(trains.length > 0, 'żaden pociąg na szlaku ani zgłoszony');
  assert.ok(trains.every((t) => typeof t.nr === 'string' && typeof t.on === 'boolean' && /na szlaku|zgłoszony/.test(t.title)), JSON.stringify(trains));
  assert.deepEqual(lineTrains(eap, 'XX'), []);
});
