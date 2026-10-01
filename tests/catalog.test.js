import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STATIONS } from '../src/stations/index.js';
import { REGIONS, isRegion, inPoland } from '../src/model/regions.js';
import { validateStation } from '../src/model/validate.js';
import {
  normalize, isTraining, dutyStations, stationSrks, editionsOf, placesOf, matchesQuery, searchStations, filterStations, regionCounts, erasOf,
  parseRoute, routeHash, parentRoute, lineOrder, regionLayout, GRADES, better, recordResult, bestResult, played, missionDone,
} from '../src/ui/catalog.js';

/*
 * Katalog posterunków dla ekranów wyboru (src/ui/catalog.js): miejsca i edycje (era), wyszukiwanie, filtry, adresy
 * ekranów, schemat regionu, postęp gracza. Dane stacji: województwo, linie, jedno stanowisko na posterunek.
 */

const duty = dutyStations(STATIONS);
const fake = (id, extra = {}) => ({ id, name: id, scenarios: [{ id: 'zmiana', name: 'Pełna zmiana' }], srk: 'komputerowe', ...extra });

test('posterunki do służby mają województwo i linie; nowy posterunek ma jedno stanowisko (wyjątki: Rumia, Reda)', () => {
  assert.ok(duty.length >= 9);
  for (const st of duty) {
    assert.ok(isRegion(st.region), `${st.id}: województwo ${st.region}`);
    assert.ok(Array.isArray(st.lines) && st.lines.length, `${st.id}: linie`);
    // numery linii z pola `lines` są też w opisie położenia (to samo źródło)
    for (const l of st.lines) assert.match(`${st.location} ${st.description}`, new RegExp(`\\b${l}\\b`), `${st.id}: linia ${l} w opisie`);
    assert.deepEqual(validateStation(st).errors, [], st.id);
  }
  // każda nowa stacja działa na jednym rodzaju stanowiska; Rumia i Reda (pulpit E i komputerowe po modernizacji 202)
  // zostają na razie z dwoma – lista wyjątków się nie powiększa
  const multi = duty.filter((st) => stationSrks(st).length > 1).map((st) => st.id).sort();
  assert.deepEqual(multi, ['reda', 'rumia']);
  // stacje szkoleniowe nie są na mapie (fikcyjne) – bez województwa i współrzędnych
  for (const st of STATIONS.filter(isTraining)) assert.ok(st.region == null && st.geo == null, `${st.id}: szkoleniowa bez miejsca na mapie`);
});

test('walidacja pól miejsca: place, era, region, geo, lines', () => {
  const base = STATIONS.find((s) => s.id === 'sopot');
  const errs = (extra) => validateStation({ ...base, ...extra }).errors.filter((e) => /^(place|era|region|geo|lines):/.test(e));
  assert.deepEqual(errs({ place: 'gdynia-glowna', era: 2014, region: 'pomorskie', geo: [54.52, 18.53], lines: [202, 250] }), []);
  assert.equal(errs({ place: 'Gdynia Gł.' }).length, 1);
  assert.equal(errs({ era: 1700 }).length, 1);
  assert.equal(errs({ era: '2014' }).length, 1);
  assert.equal(errs({ region: 'pomorze' }).length, 1);
  assert.equal(errs({ geo: [52.0, 13.0] }).length, 1, 'Berlin – poza Polską');
  assert.equal(errs({ geo: [18.53, 54.52] }).length, 1, 'zamienione współrzędne');
  assert.equal(errs({ lines: [] }).length, 1);
  assert.equal(errs({ lines: [202, 202] }).length, 1);
  assert.equal(errs({ lines: ['202'] }).length, 1);
  assert.equal(Object.keys(REGIONS).length, 16);
  assert.ok(inPoland([54.35, 18.65]) && !inPoland([48.2, 16.4]));
});

test('wyszukiwanie bez polskich znaków: nazwa, linia, stanowisko, województwo', () => {
  assert.equal(normalize('Gdańsk Główny – ŁÓDŹ'), 'gdansk glowny – lodz');
  const ids = (q) => duty.filter((st) => matchesQuery(st, q)).map((st) => st.id).sort();
  assert.ok(ids('gdansk').includes('gdansk-glowny'));
  assert.ok(ids('GDAŃ').includes('gdansk-glowny'), 'z polskimi znakami i wielkimi literami');
  // wszystkie słowa naraz; Gdynię Główną wspominają też opisy Chyloni i Orłowa – nazwa pasująca w całości pierwsza
  assert.ok(ids('gdynia glowna').includes('gdynia-glowna') && !ids('gdynia glowna').includes('sopot'));
  assert.equal(searchStations(duty, 'gdynia glowna')[0].id, 'gdynia-glowna');
  assert.equal(searchStations(duty, 'glow')[0].name.split(' ').at(-1).startsWith('Głów'), true);
  assert.ok(ids('213').includes('reda') && !ids('213').includes('sopot'), 'numer linii');
  assert.ok(ids('przekaznikowe').includes('rumia'), 'rodzaj urządzeń');
  assert.equal(ids('pomorskie').length, duty.length, 'województwo');
  assert.deepEqual(ids('xyzzy'), []);
  assert.equal(ids('').length, duty.length, 'puste zapytanie – wszystko');
});

test('filtry: stanowisko, trudność, era, województwo, niegrane', () => {
  const f = (opts) => filterStations(duty, opts).map((st) => st.id).sort();
  assert.ok(f({ srk: ['E'] }).every((id) => ['rumia', 'reda'].includes(id)));
  assert.ok(f({ srk: ['komputerowe'] }).includes('rumia'), 'Rumia ma też zmianę na stanowisku komputerowym');
  assert.ok(filterStations(duty, { difficulty: [5] }).every((st) => st.difficulty === 5));
  assert.equal(f({ era: 'now' }).length, duty.length, 'obecne posterunki – stan dzisiejszy');
  assert.deepEqual(f({ era: 2014 }), []);
  assert.equal(f({ region: 'pomorskie' }).length, duty.length);
  assert.deepEqual(f({ region: 'slaskie' }), []);
  const progress = recordResult({}, { station: 'sopot', scenario: 'zmiana', grade: 'dobrze', total: 20 });
  assert.ok(!f({ notPlayed: true, progress }).includes('sopot') && f({ notPlayed: true, progress }).includes('reda'));
  assert.deepEqual(regionCounts(duty), { pomorskie: duty.length });
});

test('miejsca i edycje: jedno miejsce z kilkoma latami – najnowsza edycja pierwsza, stan dzisiejszy przed latami', () => {
  const now = fake('gdynia-glowna', { place: 'gdynia-glowna' });
  const old = fake('gdynia-glowna-2010', { place: 'gdynia-glowna', era: 2010, srk: 'E' });
  const mid = fake('gdynia-glowna-2014', { place: 'gdynia-glowna', era: 2014 });
  const other = fake('sopot');
  const all = [old, other, now, mid];
  assert.deepEqual(editionsOf(all, old).map((s) => s.id), ['gdynia-glowna', 'gdynia-glowna-2014', 'gdynia-glowna-2010']);
  assert.deepEqual(placesOf(all).map((eds) => eds.map((s) => s.id)), [['gdynia-glowna', 'gdynia-glowna-2014', 'gdynia-glowna-2010'], ['sopot']]);
  assert.deepEqual(erasOf(all), { years: [2014, 2010], now: true });
  assert.deepEqual(filterStations(all, { era: 2010 }).map((s) => s.id), ['gdynia-glowna-2010']);
  assert.ok(matchesQuery(old, '2010'), 'rok edycji w wyszukiwaniu');
  // obecne posterunki: każdy to osobne miejsce z jedną edycją
  assert.deepEqual(placesOf(STATIONS).map((eds) => eds.length), duty.map(() => 1));
});

test('adresy ekranów: tytuł, szkolenie, służba (mapa / lista / region), stacja – w obie strony; ekran nadrzędny', () => {
  const routes = [
    [{ view: 'title' }, '#/'],
    [{ view: 'training' }, '#/szkolenie'],
    [{ view: 'training', mission: 3 }, '#/szkolenie/3'],
    [{ view: 'service', mode: 'map' }, '#/sluzba'],
    [{ view: 'service', mode: 'list' }, '#/sluzba/lista'],
    [{ view: 'region', region: 'pomorskie' }, '#/sluzba/pomorskie'],
    [{ view: 'station', id: 'gdynia-glowna' }, '#/stacja/gdynia-glowna'],
  ];
  for (const [route, hash] of routes) {
    assert.equal(routeHash(route), hash);
    assert.deepEqual(parseRoute(hash), route, hash);
  }
  for (const bad of ['', '#', '#/nieznane', '#/sluzba/pomorze', '#/szkolenie/0', '#/szkolenie/x']) {
    const r = parseRoute(bad);
    assert.ok(['title', 'service', 'training'].includes(r.view) && !r.mission && !r.region, `${bad}: ${JSON.stringify(r)}`);
  }
  assert.deepEqual(parentRoute({ view: 'station', id: 'sopot' }, STATIONS), { view: 'region', region: 'pomorskie' });
  assert.deepEqual(parentRoute({ view: 'station', id: 'nieznana' }, STATIONS), { view: 'service', mode: 'map' });
  assert.deepEqual(parentRoute({ view: 'region', region: 'pomorskie' }), { view: 'service', mode: 'map' });
  assert.deepEqual(parentRoute({ view: 'training', mission: 2 }), { view: 'training' });
  assert.deepEqual(parentRoute({ view: 'service', mode: 'list' }), { view: 'title' });
});

test('schemat regionu: stacje w kolejności wzdłuż linii, odcinek wspólny kilku linii jeden', () => {
  // linia prosta ukośnie, punkty pomieszane
  const pts = [{ id: 'c', x: 2, y: 2 }, { id: 'a', x: 0, y: 0 }, { id: 'd', x: 3, y: 3.1 }, { id: 'b', x: 1, y: 0.9 }];
  const order = lineOrder(pts).map((p) => p.id);
  assert.ok(order.join('') === 'abcd' || order.join('') === 'dcba', order.join(''));
  const project = ([lat, lon]) => [lon * 10, -lat * 10];
  const st = (id, geo, lines) => ({ id, geo, lines });
  const lay = regionLayout([
    st('gdansk', [54.35, 18.64], [9, 202, 250]), st('sopot', [54.44, 18.56], [202, 250]), st('gdynia', [54.52, 18.53], [202, 250]),
    st('reda', [54.6, 18.35], [202]), st('tczew', [54.09, 18.8], [9]), st('bez-geo', null, [202]),
  ], project);
  assert.deepEqual(lay.nodes.map((n) => n.id), ['gdansk', 'sopot', 'gdynia', 'reda', 'tczew']);
  const seg = (a, b) => lay.segments.find((s) => (s.a === a && s.b === b) || (s.a === b && s.b === a));
  assert.deepEqual(seg('gdansk', 'sopot').lines, [202, 250]);
  assert.deepEqual(seg('gdynia', 'reda').lines, [202]);
  assert.deepEqual(seg('gdansk', 'tczew').lines, [9]);
  assert.equal(seg('gdansk', 'gdynia'), undefined, 'nie przez Sopot – kolejne stacje linii');
  assert.equal(lay.segments.length, 4);
});

test('postęp: najlepsza ocena na zmianę (ocena, potem punkty), misje ukończone, wejście bez zmian', () => {
  assert.deepEqual(GRADES, ['niedostatecznie', 'dostatecznie', 'dobrze', 'wzorowo']);
  assert.deepEqual(better({ grade: 'dobrze', total: 30 }, { grade: 'wzorowo', total: 40 }), { grade: 'wzorowo', total: 40 });
  assert.deepEqual(better({ grade: 'dobrze', total: 30 }, { grade: 'dobrze', total: 12 }), { grade: 'dobrze', total: 30 });
  const p0 = {};
  let p = recordResult(p0, { station: 'sopot', scenario: 'zmiana', grade: 'dostatecznie', total: -5 });
  p = recordResult(p, { station: 'sopot', scenario: 'szczyt', grade: 'dobrze', total: 15 });
  p = recordResult(p, { station: 'sopot', scenario: 'zmiana', grade: 'niedostatecznie', total: -40 });
  assert.deepEqual(p0, {}, 'wejście bez zmian');
  assert.deepEqual(p.stations.sopot.zmiana, { grade: 'dostatecznie', total: -5 }, 'słabszy wynik nie nadpisuje');
  assert.deepEqual(bestResult(p, 'sopot'), { grade: 'dobrze', total: 15 });
  assert.equal(bestResult(p, 'reda'), null);
  assert.ok(played(p, 'sopot') && !played(p, 'reda') && !played(null, 'sopot'));
  p = recordResult(p, { station: 'szkolna', scenario: 'samouczek', grade: 'dobrze', total: 0, mission: true });
  assert.ok(missionDone(p, 'szkolna', 'samouczek') && !missionDone(p, 'jodlowa', 'samouczek'));
  assert.ok(!played(p, 'szkolna'), 'misja to nie zmiana na posterunku');
});
