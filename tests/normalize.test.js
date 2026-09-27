import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitCrossovers, normalizeStation } from '../src/model/normalize.js';
import { Simulation } from '../src/model/Simulation.js';
import { STATIONS } from '../src/stations/index.js';
import orlowo from '../src/stations/gdynia-orlowo.js';
import sopot from '../src/stations/sopot.js';
import gdynia from '../src/stations/gdynia-glowna.js';
import szkolna from '../src/stations/szkolna.js';

const G = (id) => ({ kind: 'signal', id, color: 'green' });
const run = (sim, s) => { for (let i = 0; i < s * 2; i++) sim.step(0.5); };

test('łącznica dzieli się na dwa odcinki izolowane – po jednym na zwrotnicę; definicja wejściowa bez zmian', () => {
  const before = JSON.stringify(orlowo.tiles);
  const n = splitCrossovers(orlowo);
  assert.equal(JSON.stringify(orlowo.tiles), before, 'oryginał nietknięty');
  const sec = (id) => n.tiles.filter((t) => t.section === id).map((t) => t.id || `${t.x},${t.y}`).sort();
  assert.deepEqual(sec('IzS1'), ['9,13', 'ZwS1']); // zwrotnica S1 (numer odcinka) + skos
  assert.deepEqual(sec('IzS2'), ['ZwS2']);
  assert.equal(n.sections.IzS1.length + n.sections.IzS2.length, orlowo.sections.IzS1.length);
  assert.equal(n.sections.IzS2.kind, 'point');
  assert.deepEqual(sec('Iz1'), ['8,7', 'Zw1']); assert.deepEqual(sec('Iz2'), ['Zw2']);
  assert.deepEqual(sec('IzS51'), ['57,13', 'ZwS51']); assert.deepEqual(sec('IzS52'), ['ZwS52']);
  // Gdynia Główna: odcinek Iz3 zawiera Zw4 i Zw3 – zostaje Zw3 (numer odcinka), Zw4 dostaje Iz4
  const g = splitCrossovers(gdynia);
  assert.ok(g.tiles.find((t) => t.id === 'Zw3').section === 'Iz3' && g.tiles.find((t) => t.id === 'Zw4').section === 'Iz4');
  // długi skos (Sopot Iz1: Zw1, trzy kostki skośne, Zw2): kostka przy Zw1 zostaje, reszta idzie do Iz2
  // (rzędy po odbiciu bloku 202 w pionie: Zw1 na torze 1 w rzędzie 2, Zw2 na torze 2 w rzędzie 6)
  const s = splitCrossovers(sopot);
  assert.deepEqual(s.tiles.filter((t) => t.section === 'Iz1').map((t) => `${t.x},${t.y}`).sort(), ['7,2', '8,3']);
  assert.deepEqual(s.tiles.filter((t) => t.section === 'Iz2').map((t) => `${t.x},${t.y}`).sort(), ['10,5', '11,6', '9,4']);
  // stacje bez łącznic (jedna zwrotnica w odcinku) – bez zmian; normalizacja jest idempotentna
  assert.deepEqual(splitCrossovers(szkolna)._split, []);
  assert.equal(normalizeStation(n), n);
  for (const st of STATIONS) {
    const x = splitCrossovers(st);
    for (const t of x.tiles) if (t.section) assert.ok(x.sections[t.section], `${st.id}: kostka (${t.x},${t.y}) w nieznanym odcinku ${t.section}`);
    for (const sid of Object.keys(x.sections)) if (/^Iz/.test(sid)) assert.ok(x.tiles.filter((t) => t.section === sid && t.type === 'point').length <= 1, `${st.id}: ${sid} ma więcej niż jedną zwrotnicę po podziale`);
  }
});

test('przebiegi równoległe przez łącznicę utwierdzają się jednocześnie (Orłowo i Sopot: wjazd na 501 i wyjazd z 502)', () => {
  const sim = new Simulation(orlowo, { disruptions: 'none' });
  assert.equal(sim.station.tiles.find((t) => t.id === 'ZwS2').section, 'IzS2');
  // linia 250 SKM od Sopotu: tor 501 wjazdowy (kierunek zasadniczy), tor 502 wyjazdowy
  sim.press(G('A501')); sim.press(G('T501')); run(sim, 10); // wjazd od Sopotu na tor 501 (kończy się na sygnalizatorze T501)
  assert.equal(sim.ilk.signals.get('A501').route, 'A501-T501');
  assert.equal(sim.ilk.sections.get('IzS1').route, 'A501-T501');
  assert.equal(sim.ilk.sections.get('IzS2').route, null, 'zwrotnica S2 (tor 502) wolna');
  sim.press(G('D502')); sim.press({ kind: 'end', id: 'kS502' }); run(sim, 10);
  assert.equal(sim.ilk.signals.get('D502').route, 'D502-S502', 'wyjazd z 502 do Sopotu równolegle do wjazdu na 501');
  // pełne krzyżowanie ruchu SKM: przelot po 501 dalej do Gdyni (T501 → Z501) i jednocześnie wjazd od Gdyni na 502 (P → D502)
  sim.press(G('T501')); sim.press({ kind: 'end', id: 'kZ501' }); run(sim, 10);
  assert.equal(sim.ilk.signals.get('T501').route, 'T501-Z501');
  sim.press(G('P')); sim.press(G('D502')); run(sim, 10);
  assert.equal(sim.ilk.signals.get('P').route, 'P-D502', 'wjazd od Gdyni na 502 równolegle do wyjazdu z 501 do Gdyni');
  assert.deepEqual(['IzS51', 'IzS52', 'IzS53', 'IzS54'].map((id) => sim.ilk.sections.get(id).route), ['P-D502', 'T501-Z501', 'T501-Z501', 'P-D502']);
  // Sopot, linia 250 od Gdańska: tor 501 wjazdowy, tor 502 wyjazdowy – wjazd na 501 i wyjazd z 502 jednocześnie
  const s2 = new Simulation(sopot, { disruptions: 'none' });
  s2.press(G('A501')); s2.press(G('R501')); run(s2, 10);
  assert.equal(s2.ilk.signals.get('A501').route, 'A501-R501');
  s2.press(G('L502')); s2.press({ kind: 'end', id: 'kGS2' }); run(s2, 10);
  assert.equal(s2.ilk.signals.get('L502').route, 'L502-GS2', 'Sopot: wyjazd z 502 równolegle do wjazdu na 501');
  for (const sid of ['Iz36', 'Iz37', 'Iz38', 'Iz40']) assert.ok(s2.ilk.sections.get(sid), `odcinek ${sid} po podziale łącznic`);
});

test('grupa zwrotnic ze skrzyżowaniem (Chylonia Iz21, Iz35) dzieli się na odcinek na zwrotnicę i na skrzyżowanie; długości po równo', async () => {
  const chylonia = (await import('../src/stations/gdynia-chylonia.js')).default;
  const s = splitCrossovers(chylonia);
  const secOf = (id) => s.tiles.find((t) => t.id === id).section;
  assert.equal(secOf('Zw21'), 'Iz21'); assert.equal(secOf('Zw24'), 'Iz24'); assert.equal(secOf('Zw22'), 'Iz22');
  assert.equal(secOf('Zw26'), 'Iz26'); assert.equal(secOf('Zw25'), 'Iz25'); assert.equal(secOf('Zw23'), 'Iz23');
  const cross = s.tiles.find((t) => t.type === 'crossing' && t.x === 76);
  assert.equal(cross.section, 'Iz21x', 'skrzyżowanie ma własny odcinek');
  assert.equal(s.tiles.find((t) => t.x === 74 && t.y === 13).section, 'Iz24', 'skos przy Zw24 idzie do Zw24');
  const ids = ['Iz21', 'Iz24', 'Iz22', 'Iz26', 'Iz25', 'Iz23', 'Iz21x'];
  assert.equal(ids.reduce((a, id) => a + s.sections[id].length, 0), chylonia.sections.Iz21.length, 'suma długości = długość pierwotna');
  // Iz35: 35, 37, 38a, 36 + skrzyżowanie; Iz38 (Zw38b) istniał wcześniej – nowy odcinek dla Zw38a to Iz38a
  assert.equal(secOf('Zw38a'), 'Iz38a'); assert.equal(secOf('Zw38b'), 'Iz38'); assert.equal(secOf('Zw36'), 'Iz36');
  assert.equal(s.tiles.find((t) => t.type === 'crossing' && t.x === 87).section, 'Iz35x');
  assert.ok(s._split.some((x) => x.from === 'Iz21' && x.to === 'Iz21x'));
});
