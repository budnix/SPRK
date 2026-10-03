import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/model/Simulation.js';
import olsztyn from '../src/stations/olsztyn-glowny.js';
import { validateStation } from '../src/model/validate.js';
import { trainTrack } from '../src/model/trainPaths.js';
import { allArrived, play } from './helpers.js';

test('Olsztyn Główny: definicja poprawna, brak urwanych torów, przebiegi linii 353, 216, 220 i 219 zgodne z planem; tylko stanowisko komputerowe', () => {
  assert.deepEqual(validateStation(olsztyn).errors, []);
  const sim = new Simulation(olsztyn, { disruptions: 'none' });
  assert.equal(sim.ilk.topo.tracks.filter((t) => t._openPorts).length, 0, 'urwane porty toru');
  const ends = (start) => [...new Set(sim.ilk.routeList().filter((r) => r.start === start && r.kind === 'train').map((r) => r.end.id))].sort();
  // wjazdy od zachodu (A Gutkowo, B i C Kortowo, D Kortowo/Olsztynek) na każdy tor peronowy i tory 10, 12, 14
  for (const s of ['A', 'B', 'C', 'D']) assert.deepEqual(ends(s), ['H1', 'H14', 'H2', 'H3', 'H4', 'H5', 'H6', 'H8', 'M10', 'M12'], s);
  // od wschodu: Y (353 od Łęgajn) na tory 2c, 6c, 8c; X (jazda po torze lewym) także na 1c i przelotem po 10 / 12;
  // T (219 od Marcinkowa) tylko na tor 5c
  assert.deepEqual(ends('Y'), ['K2', 'K6', 'K8']);
  assert.deepEqual(ends('X'), ['F10', 'F12', 'K1', 'K2', 'K6', 'K8']);
  assert.deepEqual(ends('T'), ['K5']);
  // wyjazdy na zachód z każdego toru na 220, 353 (tor 2. – ruch prawostronny) i 216; na wschód tylko po 353 tor 1.
  // i 219 (z toru 5); grupa towarowa tylko przez semafory grupowe P w stronę Korsz
  for (const s of ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F8', 'F10', 'F12', 'F14']) assert.deepEqual(ends(s), ['GU', 'KD', 'KO2'], s);
  for (const s of ['M1', 'M2', 'M6', 'M8', 'M10', 'M12', 'P210', 'P212', 'P214', 'P216']) assert.deepEqual(ends(s), ['LE1'], s);
  assert.deepEqual(ends('M5'), ['MA']);
  assert.deepEqual(ends('H14'), ['P210', 'P212', 'P214', 'P216']);
  for (const r of sim.ilk.routeList()) {
    if (r.exit) assert.equal(sim.station.exits[r.exit].dir, sim.ilk.signals.get(r.start).dir, `przebieg ${r.id} zawraca`);
  }
  // SBL na dwutorowej 353, Eap na jednotorowych 216, 220, 219
  for (const id of ['KO1', 'KO2', 'LE1', 'LE2']) assert.ok(sim.blocks.get(id).auto, `${id}: SBL`);
  for (const id of ['GU', 'KD', 'MA']) assert.ok(!sim.blocks.get(id).auto && !sim.blocks.get(id).fixed, `${id}: Eap`);
  // przystanki w obrębie stacji: Olsztyn Zachodni na odcinkach zbliżania wszystkich czterech linii od zachodu,
  // Olsztyn Śródmieście na liniach 220 i 216
  const halts = (name) => Object.entries(olsztyn.sections).filter(([, s]) => s.halt === name).map(([id]) => id).sort();
  assert.deepEqual(halts('Olsztyn Zachodni'), ['ZbGU', 'ZbKD', 'ZbKO1', 'ZbKO2']);
  assert.equal(halts('Olsztyn Śródmieście').length, 2);
  assert.equal(olsztyn.srk, 'komputerowe');
  for (const sc of olsztyn.scenarios) assert.equal(new Simulation(olsztyn, { scenario: sc.id }).srk.view, 'screen', sc.id);
});

test('Olsztyn Główny: pełna zmiana – Regio w czterech kierunkach, IC, TLK, towarowe przelotem i z grupy – bez kolizji i przetrzymań, każdy pociąg na swoim torze', () => {
  const sim = new Simulation(olsztyn, { scenario: 'zmiana', disruptions: 'none', seed: 1 });
  const visited = new Map();
  play(sim).until('08:45', { stop: allArrived, each: (_, { steps }) => {
    for (const tr of sim.traffic.trains) {
      const tk = trainTrack(sim.ilk, tr);
      if (tk) visited.set(tr.nr, new Set([...(visited.get(tr.nr) ?? []), tk]));
    }
    if (steps % 20 === 0) {
      const occ = new Map();
      for (const tr of sim.traffic.trains) {
        if (tr.mode !== 'train') continue;
        for (const s of tr.occupiedSections()) { assert.ok(!occ.has(s) || occ.get(s) === tr.nr, `kolizja na ${s}`); occ.set(s, tr.nr); }
      }
    }
  } });
  const tt = sim.traffic.timetable();
  assert.equal(tt.length, 28);
  for (const e of tt) {
    const next = tt.some((x) => x.unit === e.nr);
    assert.equal(e.phase, e.to ? 'at-neighbour' : next ? 'handed-over' : 'ended', `${e.nr}: ${e.status}`);
    // pociąg ze składu innego pociągu (`unit`) stoi od początku na torze poprzednika – tor sprawdza poprzednik
    if (e.unit == null) assert.ok(visited.get(e.nr)?.has(String(e.track)), `${e.nr}: tory ${[...(visited.get(e.nr) ?? [])]} bez planowego ${e.track}`);
    // przyjazd do grupy towarowej (44603 na tor 214) – ok. 3,5 km od granicy pulpitu przez głowicę i drabinkę grupy
    // na obrazie „40”, a sąsiad wyprawia pociąg z zapasem na jazdę od granicy do toru stałym dla każdej stacji (90 s):
    // przyjazd ok. 4 min po planie, bez kary (kara jest za przelot, odjazd i przetrzymanie)
    assert.ok(e.delay <= (/^21\d$/.test(String(e.track)) ? 5 : 3), `${e.nr}: opóźnienie ${e.delay}`);
  }
  assert.ok(!sim.score.items.some((i) => i.code === 'held'), 'przetrzymania: ' + sim.score.items.filter((i) => i.code === 'held').map((i) => i.msg).join('; '));
  assert.ok(!sim.score.items.some((i) => i.code === 'late-pass'), 'przeloty opóźnione na stacji');
  assert.ok(sim.ended, 'zmiana zakończona');
});
