import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/model/Simulation.js';
import { Clock } from '../src/core/Clock.js';
import { STATIONS } from '../src/stations/index.js';

/* Przekazanie składu: pociąg kończący bieg staje się pociągiem powrotnym (pole `unit` rozkładu) */

test('skład staje się pociągiem powrotnym dopiero po przyjeździe – nie wtedy, gdy stoi przed semaforem wjazdowym', () => {
  const st = STATIONS.find((s) => s.id === 'zacisze');
  const sim = new Simulation(st, { scenario: { id: 't', name: 't', trains: [7107, 7108], startTime: '08:00', endTime: '08:50' }, disruptions: 'none', seed: 7 });
  const [arriving, returning] = sim.traffic.timetable();
  // pozwolenie dane, ale przebiegu wjazdowego nie ma: pociąg staje przed A w chwili, gdy do odjazdu 7108 zostało mniej niż 15 min
  for (let i = 0; i < 2 * 60 * 16; i++) { sim.step(0.5); if (sim.blocks.get('W').request === 'theirs') sim.press({ kind: 'block', exit: 'W', btn: 'Poz' }); }
  assert.equal(arriving.train?.stoppedAt?.signal, 'A', 'pociąg stoi przed semaforem wjazdowym');
  assert.ok(sim.clock.time > Clock.parse('08:11'), 'okno przekazania składu otwarte');
  assert.equal(arriving.actualArr, null);
  assert.equal(returning.train, null, 'skład nieprzekazany – pociąg jeszcze nie przyjechał');
  assert.equal(arriving.phase === 'handed-over', false);
  // po wjeździe i zatrzymaniu przy peronie skład jest przekazywany jak dotąd
  sim.execute({ type: 'route', start: 'A', end: 'kT3', kind: 'train' });
  for (let i = 0; i < 2 * 60 * 6 && !returning.train; i++) sim.step(0.5);
  assert.ok(arriving.actualArr != null);
  assert.deepEqual([arriving.phase, String(arriving.handedTo)], ['handed-over', '7108']);
  assert.equal(String(arriving.actualTrack), '3');
});
