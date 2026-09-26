import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/model/Simulation.js';
import { getSrk, hasSrk, listSrk, registerSrk } from '../src/srk/registry.js';
import { validateStation } from '../src/model/validate.js';
import sopot from '../src/stations/sopot.js';
import starePustkowie from '../src/stations/stare-pustkowie.js';
import { run } from './helpers.js';

test('rejestr srk: typ E domyślny, komputerowe z dłuższym czasem na drugie wskazanie, nowe strategie rejestrowalne', () => {
  assert.equal(getSrk(undefined).id, 'E');
  assert.equal(getSrk('nie-ma-takiego').id, 'E');
  assert.equal(getSrk('komputerowe').view, 'screen');
  assert.ok(getSrk('komputerowe').model.armTimeout > getSrk('E').model.armTimeout);
  assert.ok(listSrk().length >= 2);
  registerSrk({ id: 'test-mech', name: 'Mechaniczne (test)', view: 'desk', model: { armTimeout: 3 } });
  assert.ok(hasSrk('test-mech'));
  assert.equal(getSrk('test-mech').model.armTimeout, 3);
});

test('stacja deklaruje srk; nieznany system jest błędem walidacji; opcja gracza nadpisuje stację', () => {
  assert.equal(sopot.srk, 'komputerowe');
  assert.equal(new Simulation(sopot, { disruptions: 'none' }).srk.id, 'komputerowe');
  assert.equal(new Simulation(sopot, { disruptions: 'none', srk: 'E' }).srk.id, 'E');
  assert.equal(new Simulation(starePustkowie, { disruptions: 'none' }).srk.id, 'E');
  const bad = { ...starePustkowie, srk: 'iltor-x' };
  assert.ok(validateStation(bad).errors.some((e) => /srk/.test(e)));
});

test('czas uzbrojenia zależy od strategii: pulpit E 6 s, stanowisko komputerowe 60 s', () => {
  const e = new Simulation(starePustkowie, { disruptions: 'none' });
  const sig = [...e.ilk.signals.values()].find((s) => s.kind === 'semafor');
  e.press({ kind: 'signal', id: sig.id, color: 'green' });
  assert.ok(e.ilk.armed);
  run(e, 8);
  assert.ok(!e.ilk.armed || e.ilk.armed.until < e.ilk.time, 'na pulpicie E uzbrojenie wygasa po 6 s');

  const k = new Simulation(sopot, { disruptions: 'none' });
  k.press({ kind: 'signal', id: 'A', color: 'green' });
  run(k, 8);
  assert.ok(k.ilk.armed && k.ilk.armed.until >= k.ilk.time, 'na stanowisku komputerowym polecenie czeka na wskazanie końca');
  const res = k.press({ kind: 'signal', id: 'H', color: 'green' });
  assert.ok(res.ok, JSON.stringify(res));
  run(k, 10);
  assert.ok(k.ilk.active.has('A-H'));
});

test('polecenia stanowiska komputerowego to te same operacje zależnościowe: Zw+zwrotnica, Sz z licznikiem, blokada', () => {
  const k = new Simulation(sopot, { disruptions: 'none' });
  const p = k.ilk.points.get('Zw1');
  const before = p.position;
  k.press({ kind: 'group', id: 'Zw', role: 'group-point' });
  k.press({ kind: 'point', id: 'Zw1' });
  run(k, 6);
  assert.notEqual(p.position, before);
  k.press({ kind: 'group', id: 'Sz', role: 'substitute' });
  const r = k.press({ kind: 'signal', id: 'B', color: 'green' });
  assert.ok(r.ok, JSON.stringify(r));
  assert.equal(k.ilk.signals.get('B').aspect, 'Sz');
  assert.equal(k.ilk.counters.Sz, 1);
  const b = k.press({ kind: 'block', exit: 'OR1', btn: 'Wbl' });
  assert.ok(b.ok !== undefined);
});
