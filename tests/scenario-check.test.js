import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkScenario, hasErrors, nearestKey, levelSlackMin, LATE_SLACK, SCENARIO_KEYS } from '../src/model/scenarioCheck.js';
import { Simulation } from '../src/model/Simulation.js';
import { validateStation, validateTimetable } from '../src/model/validate.js';
import { DISRUPTION_LEVELS } from '../src/core/Random.js';
import { STATIONS } from '../src/stations/index.js';
import { MISSIONS } from '../src/tutorial/missions.js';
import { parseArgs, listChecks, checkShift, verdict, scenarioStatus, deterministicWarnings, plural, main, LEVELS } from '../scripts/check-scenario.mjs';
import szkolna from '../src/stations/szkolna.js';
import okregi from './fixtures/gdynia-glowna-okregi.js';
import { entryPath, trainRouteChains, routeEndTrack } from '../src/model/trainPaths.js';

/**
 * Automat sprawdzający scenariusze: (a) statyczne sprawdzenie definicji (`checkScenario`) na celowo zepsutych
 * wariantach scenariusza Szkolnej – każdy kod błędu ma tu swój przypadek, (b) przebieg zmiany z raportem i werdyktem
 * (`scripts/check-scenario.mjs`), ocena scenariusza, wiersz poleceń. Każdy scenariusz każdej stacji: definicja tutaj,
 * przebieg – `tests/scenario-check-run-*.test.js` (podział na pliki, żeby `npm test` liczył je równolegle).
 */

const missions = Object.keys(MISSIONS);
const base = szkolna.scenarios.find((s) => s.id === 'zmiana');
const tt = (nr) => szkolna.timetable.find((t) => t.nr === nr);
const withTT = (map) => szkolna.timetable.map((e) => (map[e.nr] ? { ...e, ...map[e.nr] } : e));
const [odstaw, podstaw] = szkolna.tasks;
const check = (sc, station = szkolna, opts = {}) => checkScenario(station, sc, { missions, ...opts });
const codesAt = (level) => (findings) => new Set(findings.filter((f) => f.level === level).map((f) => f.code));
const errorCodes = codesAt('error');
const warningCodes = codesAt('warning');
const infoCodes = codesAt('info');
const startOn7001 = (over = {}) => ({ nr: 7001, kind: 'os', name: 'Osobowy', from: null, to: 'E', dep: '07:30', track: '1', stop: true, startOn: { section: 'T1', dir: 'E' }, ...over });

/** Przebiegi manewrowe Szkolnej – do wariantu stacji bez dróg manewrowych. */
const shuntIds = new Simulation(szkolna, { scenario: 'zmiana', disruptions: 'none', seed: 1 }).ilk.routeList().filter((r) => r.kind === 'shunt').map((r) => r.id);

/**
 * Błędy definicji: kod → wariant (scenariusz albo `{ station, ref }`). Każdy wariant musi dać swój kod, a scenariusz
 * bazowy (`szkolna:zmiana`) – żadnego błędu; dzięki temu test nie przejdzie bez danej kontroli.
 */
const ERRORS = {
  'station-invalid': { station: { ...szkolna, timetable: withTT({ 6101: { from: 'X' } }) }, ref: 'zmiana' },
  'sc-unknown-id': { ref: 'nie-ma-takiego' },
  'sc-dup-id': { station: { ...szkolna, scenarios: [...szkolna.scenarios, { ...base }] }, ref: 'zmiana' },
  'sc-unknown-key': { ...base, fautls: [{ type: 'signal-fail', target: 'A', at: '07:30' }] },
  'sc-shape': { ...base, trains: 6101 },
  'sc-disruptions': { ...base, disruptions: 'hihg' },
  'sc-tutorial': { ...base, tutorial: 'nie-ma-takiej-misji' },
  'sc-srk': { ...base, srk: 'XYZ' },
  'sc-time': { ...base, startTime: '7.00' },
  'sc-window': { ...base, startTime: '07:00', endTime: '06:30' },
  'sc-trains-ignored': { ...base, trains: [6101], timetable: [tt(6101)] },
  'sc-trains-unknown': { ...base, trains: [6101, '6102', 9999] },
  'sc-timetable-invalid': { ...base, timetable: [{ ...tt(6101), from: 'X' }] },
  'sim-throws': { ...base, faults: [null] },
  'tt-empty': { ...base, trains: [] },
  'tt-time': { ...base, tasks: [], timetable: [{ ...tt(6101), arr: '7.06' }] },
  'tt-dep-before-arr': { ...base, tasks: [], timetable: [{ ...tt(6101), dep: '07:01' }] },
  'tt-no-spawn': { ...base, tasks: [], timetable: [startOn7001({ startOn: undefined })] },
  'tt-startOn-section': { ...base, tasks: [], timetable: [startOn7001({ startOn: { section: 'T9', dir: 'E' } })] },
  'tt-startOn-dir': { ...base, tasks: [], timetable: [startOn7001({ startOn: { section: 'T1', dir: 'N' } })] },
  'tt-startOn-dir-exit': { ...base, tasks: [], timetable: [startOn7001({ startOn: { section: 'T1', dir: 'W' } })] },
  'tt-startOn-twice': { ...base, tasks: [], timetable: [startOn7001(), startOn7001({ nr: 7002 })] },
  'tt-turnback': { ...base, tasks: [], timetable: [{ ...tt(6101), to: 'W' }] },
  'tt-before-start': { ...base, startTime: '07:10' },
  'tt-never-done': { ...base, tasks: [], timetable: [{ ...tt(6103), to: null }] },
  'tt-unit-missing': { ...base, trains: [6101, 90202] },
  'tt-unit-late': { ...base, tasks: [], timetable: [{ ...tt(90201), arr: '08:20' }, tt(90202)] },
  'tt-unit-twice': { ...base, tasks: [], timetable: [tt(90201), tt(90202), { ...tt(90202), nr: 90204, dep: '08:30' }] },
  'tt-dup-nr': { ...base, tasks: [], timetable: [tt(6101), tt(6101)] },
  'tt-track-unknown': { ...base, tasks: [], timetable: [{ ...tt(6101), track: '7' }] },
  'tt-no-entry-route': { ...base, tasks: [], timetable: [{ ...tt(6101), track: '3' }] },
  'tt-no-exit-route': { ...base, tasks: [], timetable: [{ ...tt(6101), track: '3' }] },
  'tt-after-end': { ...base, endTime: '08:00' },
  'task-dup-id': { ...base, tasks: [odstaw, odstaw] },
  'task-unit-missing': { ...base, tasks: [{ ...odstaw, unit: 12345 }] },
  'task-time': { ...base, tasks: [{ ...odstaw, deadline: undefined }] },
  'task-after-missing': { ...base, tasks: [odstaw, { ...podstaw, afterTask: 'nie-ma' }] },
  'task-track-unknown': { ...base, tasks: [{ ...odstaw, toTrack: '9' }] },
  'task-after-gt-deadline': { ...base, tasks: [{ ...odstaw, after: '08:10' }] },
  'task-before-start': { ...base, tasks: [{ ...odstaw, deadline: '06:30' }] },
  'task-impossible': { ...base, tasks: [{ ...odstaw, deadline: '07:30' }] },
  'task-unit-leaves': { ...base, tasks: [{ ...odstaw, unit: 6103 }] },
  'task-no-shunt-path': { station: { ...szkolna, routes: { ...szkolna.routes, disable: [...(szkolna.routes?.disable || []), ...shuntIds] } }, ref: 'zmiana' },
  'task-succ-track': { ...base, tasks: [odstaw, { ...podstaw, toTrack: '3' }] },
  'closed-task-track': { ...base, closedSections: [{ section: 'T3', from: '07:00' }, { section: 'T3w', from: '07:00' }] },
  'fault-type': { ...base, faults: [{ type: 'signal-failure', target: 'A', at: '07:30' }] },
  'fault-target': { ...base, faults: [{ type: 'signal-fail', target: 'Q', at: '07:30' }] },
  'fault-time': { ...base, faults: [{ type: 'signal-fail', target: 'A', at: '7.30' }] },
  'fault-duration': { ...base, faults: [{ type: 'signal-fail', target: 'A', at: '07:30', duration: 0 }] },
  'fault-after-end': { ...base, faults: [{ type: 'signal-fail', target: 'A', at: '09:20' }] },
  'fault-srk': { ...base, faults: [{ type: 'route-block', target: 'A', at: '07:30' }] },
  'closed-section': { ...base, closedSections: [{ section: 'T7', from: '07:00', to: '07:30' }] },
  'closed-time': { ...base, closedSections: [{ section: 'T1', from: '5.52' }] },
  'closed-window': { ...base, closedSections: [{ section: 'T1', from: '08:00', to: '07:00' }] },
  'closed-blocks-train': { ...base, closedSections: [{ section: 'Iz1', from: '07:00' }] },
};

test('definicja: scenariusz bazowy Szkolnej bez błędów i uwag', () => {
  const f = check('zmiana');
  assert.deepEqual(f.filter((x) => x.level !== 'info'), []);
  assert.equal(hasErrors(f), false);
  for (const x of f) {
    assert.ok(['error', 'warning', 'info'].includes(x.level));
    assert.match(x.code, /^[a-z-]+$/);
    assert.ok(x.msg.length > 10);
  }
});

for (const [code, v] of Object.entries(ERRORS)) {
  test(`definicja: błąd ${code} wykryty`, () => {
    const station = v.station ?? szkolna;
    const ref = 'ref' in v ? v.ref : v;
    const f = check(ref, station);
    assert.ok(errorCodes(f).has(code), `oczekiwany błąd ${code}, jest: ${f.map((x) => `${x.level}:${x.code} ${x.msg}`).join('\n')}`);
    assert.ok(!errorCodes(check('zmiana')).has(code), 'scenariusz bazowy nie ma tego błędu');
    assert.equal(hasErrors(f), true);
  });
}

test('definicja: komunikaty wskazują pociąg, tor, godzinę i treść błędu', () => {
  const late = check({ ...base, endTime: '08:00' }).find((f) => f.code === 'tt-after-end' && f.train === 6105);
  assert.match(late.msg, /Pociąg 6105: 08:24 nie przed końcem zmiany 08:00/);
  const track = check(ERRORS['tt-track-unknown']).find((f) => f.code === 'tt-track-unknown');
  assert.match(track.msg, /tor „7” nie istnieje/);
  const typo = check(ERRORS['sc-trains-unknown']).filter((f) => f.code === 'sc-trains-unknown');
  assert.deepEqual(typo.map((f) => f.train), ['6102', 9999], 'napis zamiast liczby i numer spoza rozkładu');
  assert.match(typo[0].msg, /numer jest liczbą/);
  // stacja niepoprawna: pełna treść błędu walidacji, nie sam nagłówek
  const st = check('zmiana', ERRORS['station-invalid'].station).filter((f) => f.code === 'station-invalid');
  assert.equal(st.length, 1);
  assert.match(st[0].msg, /Rozkład 6101: nieznany wyjazd from='X'/);
  const cat = check('zmiana', { ...szkolna, timetable: withTT({ 6102: { cat: 'XYZ' } }) }).find((f) => f.code === 'station-invalid');
  assert.match(cat.msg, /6102: nieznana kategoria cat='XYZ'/);
  // wyjątek symulacji – cała treść w jednym wierszu
  assert.doesNotMatch(check(ERRORS['sim-throws']).find((f) => f.code === 'sim-throws').msg, /\n|:$/);
  // literówka w polu: podpowiedź najbliższego pola
  assert.match(check(ERRORS['sc-unknown-key']).find((f) => f.code === 'sc-unknown-key').msg, /„fautls” – literówka\? chodzi o „faults”/);
  assert.deepEqual(['fautls', 'endtime', 'closedSection', 'Tasks', 'zupelnieinne'].map(nearestKey), ['faults', 'endTime', 'closedSections', 'tasks', null]);
  // kierunek jazdy, pociąg sprzed startu (opóźnienie bez kary za przetrzymanie), liczba w at usterki
  assert.match(check(ERRORS['tt-turnback']).find((f) => f.code === 'tt-turnback').msg, /Lipno \(W\).*po tej samej stronie.*nie zmienia czoła/);
  assert.match(check(ERRORS['tt-startOn-dir-exit']).find((f) => f.code === 'tt-startOn-dir-exit').msg, /startOn\.dir: 'E'/);
  assert.match(check(ERRORS['tt-before-start']).find((f) => f.code === 'tt-before-start' && f.train === 6101).msg, /przyjedzie ok\. \d+ min po planie \(wypadnie z punktualności/);
  assert.match(check({ ...base, faults: [{ type: 'signal-fail', target: 'A', at: 450 }] }).find((f) => f.code === 'fault-time').msg, /sekundy od północy: 00:07:30/);
});

test('definicja: koniec zmiany – ta sama granica co w przebiegu (odjazd co najmniej LATE_SLACK przed końcem)', () => {
  assert.equal(LATE_SLACK, 4 * 60);
  // 6106 odjeżdża 08:35: koniec 08:37 – za mało na wyjazd ze stacji (błąd), 08:39 – wystarczy
  const tight = check({ ...base, endTime: '08:37' }).find((f) => f.code === 'tt-after-end');
  assert.equal(tight?.train, 6106);
  assert.match(tight.msg, /2 min to za mało na wyjazd ze stacji \(potrzeba co najmniej 4 min\)/);
  assert.ok(!errorCodes(check({ ...base, endTime: '08:39' })).has('tt-after-end'));
  // pociąg kończący bieg wystarczy, że przyjedzie przed końcem
  assert.ok(!errorCodes(check({ ...base, trains: [90201], tasks: [], endTime: '07:54' })).has('tt-after-end'));
});

test('definicja: godziny w nazwie zmiany zgadzają się z oknem (startTime / endTime) – inaczej uwaga; wszystkie stacje bez niej', () => {
  const code = (sc) => check(sc).filter((f) => f.code === 'sc-name-window');
  assert.deepEqual(code(base), [], 'Szkolna: „(07:00–08:50)” i koniec 08:50');
  const bad = code({ ...base, endTime: '08:55' });
  assert.deepEqual(bad.map((f) => f.level), ['warning']);
  assert.match(bad[0].msg, /podaje godziny 07:00–08:50, a zmiana trwa 07:00–08:55/);
  assert.equal(code({ ...base, startTime: '07:10' }).length, 1, 'inny start');
  assert.deepEqual(code({ ...base, name: 'Zmiana bez godzin', endTime: '08:55' }), [], 'nazwa bez godzin – bez uwagi');
  // Gdynia Gł.: nazwa podawała 08:15 przy końcu 08:20
  for (const st of STATIONS) for (const sc of st.scenarios || []) {
    assert.deepEqual(check(sc.id, st).filter((f) => f.code === 'sc-name-window').map((f) => f.msg), [], `${st.id}:${sc.id}`);
  }
});

test('definicja: godziny po 24:00 tylko w zmianie przez północ (endTime po 24:00) – w zwykłej zmianie to błąd zapisu', () => {
  const codes = (sc) => check(sc).filter((f) => f.level === 'error').map((f) => f.code);
  // literówka „26:15” zamiast „06:15” w zwykłej zmianie – błąd formatu, nie „następna doba”
  assert.ok(codes({ ...base, timetable: withTT({ 6101: { arr: '26:15' } }) }).includes('tt-time'));
  assert.ok(codes({ ...base, faults: [{ type: 'signal-fail', target: 'A', at: '27:10', duration: 5 }] }).includes('fault-time'));
  assert.ok(codes({ ...base, startTime: '25:00' }).includes('sc-time'));
  assert.ok(codes({ ...base, tasks: [{ ...odstaw, deadline: '26:15' }] }).includes('task-time'));
  // zmiana przez północ: endTime po 24:00, pociąg i termin zadania po północy
  const night = { id: 'noc', name: 'Noc (23:00–01:00)', startTime: '23:00', endTime: '25:00', tasks: [],
    timetable: [{ ...tt(6101), arr: '23:20', dep: '23:22' }, { ...tt(6102), arr: '24:20', dep: '24:22' }] };
  assert.deepEqual(codes(night), []);
  assert.deepEqual(check(night).filter((f) => f.code === 'sc-name-window'), [], 'godziny w nazwie jak na zegarze');
  // koniec wcześniejszy niż start – błąd z podpowiedzią zapisu po 24:00
  const wrong = check({ ...night, endTime: '01:00' }).find((f) => f.code === 'sc-window');
  assert.match(wrong.msg, /zmiana przez północ ma godziny następnej doby po 24:00 \(01:00 → endTime: '25:00'\)/);
});

test('definicja: scenariusz z listą trains – błąd zapisu godziny wskazuje pociąg, który go ma (definicja z wpisu, nie z indeksu w rozkładzie stacji)', () => {
  const station = { ...szkolna, timetable: szkolna.timetable.map((e) => (e.nr === 6102 ? { ...e, arr: '26:15' } : e)) };
  const timeErrors = (sc) => check(sc, station).filter((f) => f.code === 'tt-time').map((f) => f.train);
  assert.deepEqual(timeErrors({ ...base, trains: [6102, 6103] }), [6102]);
  assert.deepEqual(timeErrors({ ...base, trains: [6101, 6103] }), [], 'pociąg z błędem nie jedzie w tej zmianie');
});

test('scenariusze „szczyt” (wymuszony poziom high): koniec zmiany co najmniej 44 min po ostatnim pociągu – opóźniony od sąsiada zdąży', () => {
  // przy opóźnieniu od sąsiada do 40 min krótszy zapas dawał karę „nieobsłużony” (−10) bez winy dyżurnego
  const forced = STATIONS.flatMap((st) => (st.scenarios || []).filter((sc) => sc.disruptions === 'high').map((sc) => [st, sc]));
  assert.ok(forced.length >= 9, `scenariusze z wymuszonym poziomem high: ${forced.length}`);
  for (const [st, sc] of forced) {
    const slack = check(sc.id, st).filter((f) => f.code === 'sc-slack').map((f) => f.msg);
    assert.deepEqual(slack, [], `${st.id}:${sc.id} (koniec ${sc.endTime})`);
  }
});

test('definicja: zapas na opóźnienia od sąsiada – poziom gracza: informacja, poziom wymuszony: uwaga, ta sama liczba', () => {
  for (const l of ['low', 'high']) assert.equal(levelSlackMin(l), DISRUPTION_LEVELS[l].delayMax + LATE_SLACK / 60);
  // Szkolna: 15 min zapasu – bez zakłóceń w porządku, przy low (19 min) i high (44 min) informacja o odporności
  assert.ok(!check('zmiana').some((f) => f.code === 'sc-slack'));
  const both = check('zmiana', szkolna, { levels: ['none', 'low', 'high'] }).filter((f) => f.code === 'sc-slack');
  assert.deepEqual(both.map((f) => f.level), ['info', 'info']);
  assert.match(both[0].msg, /przy poziomie low.*potrzeba 19 min/);
  assert.match(both[1].msg, /przy poziomie high.*potrzeba 44 min/);
  // scenariusz wymusza poziom – zapas należy do zamysłu autora (uwaga)
  assert.ok(warningCodes(check({ ...base, disruptions: 'low' })).has('sc-slack'));
  assert.ok(!check({ ...base, disruptions: 'low', endTime: '08:55' }).some((f) => f.code === 'sc-slack'), '20 min ≥ 19 min');
  // pociąg nadzwyczajny mieści się w zmianie (generator) – w pełnej zmianie bez informacji; gdy żaden pociąg rozkładu
  // stacji się nie mieści (zmiana krótsza niż zapowiedź + przesunięcie + zapas), poziom high idzie bez nadzwyczajnego
  for (const f of [check('zmiana'), check({ ...base, disruptions: 'high' }), check('zmiana', szkolna, { level: 'high' })]) {
    assert.ok(!f.some((x) => x.code.startsWith('extra-')), 'pełna zmiana Szkolnej: nadzwyczajny się mieści');
  }
  const short = { ...base, id: 'krotka', startTime: '07:00', endTime: '07:30', trains: [6101, 6102] };
  const none = check({ ...short, disruptions: 'high' }).filter((x) => x.code === 'extra-none');
  assert.deepEqual(none.map((x) => x.level), ['info']);
  assert.match(none[0].msg, /25…70 min nie mieści się w zmianie 07:00–07:30.*bez pociągu nadzwyczajnego/);
  assert.ok(!check(short).some((x) => x.code === 'extra-none'), 'bez zakłóceń nie ma pociągów nadzwyczajnych');
});

test('definicja: uwagi – okno startu, odziedziczone zadania, gęsty szlak (wjazdy i wyjazdy), zadania, usterki, własny rozkład', () => {
  assert.ok(SCENARIO_KEYS.includes('endTime'));
  // pociąg 6101 (przyjazd 07:06) przy starcie 07:05 – sąsiad musiałby go wyprawić przed startem
  assert.ok(warningCodes(check({ ...base, startTime: '07:05' })).has('tt-tight-start'));
  // podzbiór pociągów bez składu 90201 – zadania stacji odpadają (uwaga, nie błąd)
  const sub = check({ ...base, trains: [6101, 6102, 6105, 6106] });
  assert.ok(warningCodes(sub).has('task-unit-missing') && !errorCodes(sub).has('task-unit-missing'));
  // dwa pociągi tym samym szlakiem w odstępie krótszym niż jazda po szlaku: wjazdy od sąsiada i wyjazdy do sąsiada
  const dense = check({ ...base, tasks: [], timetable: [tt(6101), { ...tt(6103), nr: 6107, arr: '07:07', dep: '07:09' }] });
  assert.ok(warningCodes(dense).has('line-headway'), dense.map((f) => f.code).join());
  const out = check({ ...base, tasks: [], startTime: '06:50', timetable: [{ ...tt(6103), nr: 6107, arr: '07:00', dep: '07:09' }, tt(6101)] }).find((f) => f.code === 'line-headway-out');
  assert.equal(out?.train, 6107);
  assert.match(out.msg, /6107 odjeżdża 07:09, zanim 6101 \(odjazd 07:08\) zwolni szlak/);
  assert.ok(!check('zmiana').some((f) => f.code === 'line-headway-out'));
  // zadania: tor przyjazdu (bez manewrów), termin po odjeździe następcy, skład zostawiony na innym torze niż następca
  assert.ok(warningCodes(check({ ...base, tasks: [{ ...odstaw, toTrack: '2' }] })).has('task-trivial'));
  assert.ok(warningCodes(check({ ...base, tasks: [odstaw, { ...podstaw, deadline: '08:20' }] })).has('task-after-succ-dep'));
  const other = check({ ...base, tasks: [odstaw, { ...podstaw, toTrack: '1' }] });
  assert.ok(warningCodes(other).has('task-succ-track') && !errorCodes(other).has('task-succ-track'), 'z toru 1 jest przebieg na W – uwaga');
  // usterka semafora na tarczy manewrowej; licznik osi po końcu zmiany (gracz zeruje sam) bez fault-past-end
  assert.ok(warningCodes(check({ ...base, faults: [{ type: 'signal-fail', target: 'Tm1', at: '07:20' }] })).has('fault-shunt-signal'));
  assert.ok(!check({ ...base, faults: [{ type: 'axle-counter', target: 'T2', at: '08:40', duration: 30 }] }).some((f) => f.code === 'fault-past-end'));
  assert.ok(warningCodes(check({ ...base, faults: [{ type: 'signal-fail', target: 'A', at: '08:40', duration: 30 }] })).has('fault-past-end'));
  // uwaga walidacji wpisu własnego rozkładu (pociąg dłuższy niż tor) – z numerem pociągu
  const long = check({ ...base, timetable: withTT({ 6103: { length: 600 } }) }).find((f) => f.code === 'sc-timetable-warning');
  assert.equal(long?.train, 6103);
  assert.match(long.msg, /600 m dłuższy niż tor 2/);
});

test('walidacja rozkładu (validateTimetable): rozkład stacji jak w validateStation, `only` – uwagi tylko wybranych wpisów', () => {
  const st = { ...szkolna, timetable: withTT({ 6103: { length: 600 }, 6104: { length: 700 } }) };
  const all = validateTimetable(st);
  assert.deepEqual(all.warnings.filter((w) => /dłuższy/.test(w)).length, 2);
  assert.ok(all.warnings.every((w) => validateStation(st).warnings.includes(w)));
  const only = validateTimetable(szkolna, st.timetable, new Set([st.timetable.find((e) => e.nr === 6104)]));
  assert.deepEqual(only.warnings, ['Rozkład 6104: pociąg 700 m dłuższy niż tor 1 (640 m)']);
  assert.deepEqual(validateTimetable(szkolna), { errors: [], warnings: [] });
});

test('definicja: wariant scenariusza z dokumentacji (inny start, krótsza zmiana, podzbiór pociągów) – bez błędów i uwag', () => {
  // docs/STATION-FORMAT.md, „Wariant scenariusza i automat sprawdzający”
  const v = { ...base, id: 'krotka', name: 'Krótka zmiana (07:30–08:35)', startTime: '07:30', endTime: '08:35', trains: [6103, 6104, 90201, 90202] };
  assert.deepEqual(check(v, szkolna, { levels: ['none', 'low'] }).filter((f) => f.level !== 'info' || f.code === 'sc-slack'), []);
});

test('drogi pociągu (trainPaths, wspólne z automatem i ruchem): wjazd wieloetapowy za semaforem pośrednim, wyjazd na szlak', () => {
  const sopot = STATIONS.find((s) => s.id === 'sopot');
  const sim = new Simulation(sopot, { scenario: 'zmiana', disruptions: 'none', seed: 1 });
  const ilk = sim.ilk, routes = ilk.routeList(), train = routes.filter((r) => r.kind === 'train');
  const app = (x) => ilk.topo.trackAt(sopot.exits[x].tile.x, sopot.exits[x].tile.y).section;
  // Sopot: tor 2 za semaforem pośrednim H (A → H → O)
  const p = entryPath(ilk, routes, train.filter((r) => r.approach === app('GD1')), '2');
  assert.deepEqual(p.map((r) => r.id), ['A-H', 'H-O']);
  assert.equal(routeEndTrack(ilk, p.at(-1)), '2');
  assert.equal(entryPath(ilk, routes, train.filter((r) => r.approach === app('GD1')), '2', 1), null, 'głębokość 1 – bez drogi');
  // wyjazd: łańcuchy z toru 2 kończące się na szlaku pociągu 55100
  const e = sim.traffic.timetable().find((x) => x.nr === 55100);
  const outs = trainRouteChains(train, train.filter((r) => String(ilk.sections.get(r.approach)?.track) === '2'), (r) => r.exit === e.to);
  assert.ok(outs.length && outs.every((c) => c.at(-1).exit === e.to && c.length <= 3));
});

test('definicja: każdy scenariusz każdej stacji bez błędów (nowy scenariusz jest sprawdzany sam)', () => {
  const bad = [];
  let n = 0;
  for (const st of STATIONS) for (const sc of st.scenarios || []) {
    n++;
    for (const f of check(sc.id, st, { level: 'high' })) if (f.level === 'error') bad.push(`${st.id}:${sc.id} ${f.code}: ${f.msg}`);
  }
  assert.ok(n >= 50, `scenariusze: ${n}`);
  assert.deepEqual(bad, []);
});

// ————————————————————————————————————— przebieg i werdykt —————————————————————————————————————

test('przebieg: Szkolna bez zakłóceń – OK, raport z planem i rzeczywistością pociągów, zadania, koniec zmiany', () => {
  const r = checkShift({ stationId: 'szkolna', scenarioId: 'zmiana', seed: 1, level: 'none' });
  assert.equal(r.status, 'ok', r.findings.map((f) => f.msg).join('\n'));
  assert.deepEqual(r.findings, []);
  assert.equal(r.endReason, 'all-done');
  assert.equal(r.baseLevel, 'none');
  assert.equal(r.faultProbe, false);
  assert.ok(r.endTime - r.endedAt >= 5 * 60, 'zapas do końca zmiany');
  assert.equal(r.trains.length, szkolna.timetable.length);
  for (const t of r.trains) {
    assert.ok(t.done, `${t.nr}: ${t.status}`);
    assert.ok(Number.isFinite(t.doneAt));
    assert.equal(t.stationMin, 0);
    assert.equal(t.lagMin, 0);
  }
  const t6101 = r.trains.find((t) => t.nr === 6101);
  assert.equal(t6101.arr, '07:06');
  assert.ok(Number.isFinite(t6101.actualArr) && Number.isFinite(t6101.actualDep) && t6101.actualTrack === '1');
  assert.deepEqual(r.tasks.map((k) => [k.id, k.done, k.failed]), [['odstaw-90201', true, false], ['podstaw-90202', true, false]]);
  assert.deepEqual([r.jam, r.unfinished, r.events, r.forced, r.leftovers], [[], [], [], [], []]);
  assert.equal(r.violations.count, 0);
  assert.ok(r.until < r.endTime + 120 * 60, 'reguła wcześniejszego końca: po końcu zmiany wszystko obsłużone');
  // raport przechodzi między wątkami i do JSON bez strat
  assert.deepEqual(structuredClone(r), r);
  assert.deepEqual(JSON.parse(JSON.stringify(r)), r);
});

test('przebieg: stacja jako obiekt (np. nowa, spoza listy stacji) – także stacja z okręgami', () => {
  assert.ok(!STATIONS.some((s) => s.id === okregi.id));
  assert.deepEqual(check('zmiana', okregi).filter((f) => f.level === 'error'), []);
  const r = checkShift({ station: okregi, scenarioId: 'zmiana', seed: 1, level: 'none' });
  assert.equal(r.station, 'gdynia-glowna-okregi');
  assert.deepEqual(r.jam, []);
  assert.equal(r.violations.count, 0);
  assert.deepEqual(r.findings.filter((f) => f.level === 'error'), []);
  assert.throws(() => checkShift({ stationId: 'nie-ma', scenarioId: 'zmiana' }), /Nieznana stacja/);
});

test('przebieg: pociąg nieobsłużony bez zakłóceń (tor zamknięty) – BŁĄD z planem, miejscem, przyczyną i przeszkodą', () => {
  const sc = { ...base, id: 'zamkniety', trains: [6101, 6103], closedSections: [{ section: 'Iz1', from: '07:00', to: '08:50' }] };
  assert.ok(errorCodes(check(sc)).has('closed-blocks-train'), 'definicja już to wykrywa');
  const r = checkShift({ stationId: 'szkolna', scenario: sc, seed: 1, level: 'none' });
  assert.equal(r.status, 'error');
  assert.equal(r.endReason, 'time');
  assert.deepEqual(r.jam, [], 'po otwarciu toru pociągi przejeżdżają w zapasie');
  const u = r.unfinished.find((x) => x.nr === 6101);
  assert.equal(u.reason.code, 'no-route');
  assert.equal(u.reason.signal, 'A');
  assert.equal(u.where.at, 'station');
  assert.ok(u.blockers.some((b) => b.code === 'section-closed' && b.section === 'Iz1'), JSON.stringify(u.blockers));
  assert.ok(u.log.some((l) => /zatrzymany przed A/.test(l.msg)), 'ostatnie wpisy dziennika pociągu');
  // bez zakłóceń każdy nieobsłużony pociąg to wada planu albo automatu – błąd, także ten czekający w kolejce
  const f = r.findings.find((x) => x.code === 'unfinished-plan' && x.train === 6101);
  assert.match(f.msg, /przed A/);
  assert.match(f.msg, /plan: przyjazd 07:06, odjazd 07:08, koniec 08:50/);
  assert.ok(r.findings.some((x) => x.code === 'unfinished-plan' && x.train === 6103));
});

test('przebieg: zator (tor zamknięty na stałe) – BŁĄD dla każdego pociągu, który nie dojechał', () => {
  const sc = { ...base, id: 'zator', trains: [6101, 6102], closedSections: [{ section: 'Iz1', from: '07:00' }] };
  const r = checkShift({ stationId: 'szkolna', scenario: sc, seed: 1, level: 'none', extra: 10 });
  assert.equal(r.status, 'error');
  assert.ok(r.jam.some((j) => j.nr === 6101 && j.reason?.code === 'no-route'));
  assert.ok(r.findings.some((x) => x.code === 'jam' && x.train === 6101));
});

test('przebieg: usterka bez wpływu w scenariuszu z wymuszonym poziomem – sonda usterek bez zakłóceń daje BŁĄD', () => {
  const sc = { ...base, id: 'usterka-low', disruptions: 'low', faults: [{ type: 'false-occupancy', target: 'T3', at: '07:20', duration: 10 }] };
  const r = checkShift({ stationId: 'szkolna', scenario: sc, seed: 1, level: 'none', forceLevel: 'none' });
  assert.equal(r.effectiveLevel, 'none');
  assert.equal(r.baseLevel, 'low');
  assert.equal(r.faultProbe, true);
  assert.deepEqual(r.findings.map((f) => `${f.level}:${f.code}`), ['error:fault-no-effect'], 'sonda ocenia tylko wpływ usterek');
  // lista zmian dokłada sondę, gdy scenariusz z usterkami nie ma przebiegu bez zakłóceń
  assert.deepEqual(listChecks({ targets: ['tczew:usterka-zb'], levels: ['low'], seeds: [1, 2] }).jobs.map((j) => `${j.level}:${j.seed}:${j.forceLevel ?? '-'}`), ['low:1:-', 'low:2:-', 'none:1:none']);
  assert.ok(!listChecks({ targets: ['tczew:usterka-zb'], seeds: [1] }).jobs.some((j) => j.forceLevel), 'z poziomem none – bez sondy');
  assert.ok(!listChecks({ targets: ['tczew:zmiana'], levels: ['low'], seeds: [1] }).jobs.some((j) => j.forceLevel), 'bez usterek – bez sondy');
});

/** Najmniejszy raport zmiany bez zastrzeżeń – do sprawdzania reguł werdyktu (poziom low wybrany przez gracza). */
function shift(over = {}) {
  return {
    station: 's', scenario: 'z', seed: 1, level: 'low', effectiveLevel: 'low', baseLevel: 'none', faultProbe: false, hasEndTime: true, autoEnd: true,
    startTime: 7 * 3600, endTime: 9 * 3600, endedAt: 8.5 * 3600, endReason: 'all-done', until: 8.6 * 3600, allDoneAt: 8.5 * 3600,
    trains: [train()],
    unfinished: [], jam: [], tasks: [], faults: [], violations: { count: 0, ticks: 0, first: [] }, events: [], forced: [], leftovers: [], duties: [], wrongTrack: [],
    ...over,
  };
}
function train(over = {}) {
  return { nr: 1, label: 'R 1', arr: '07:58', dep: '08:00', arrTime: 7.97 * 3600, depTime: 8 * 3600, extra: false, unit: null, delayIn: 0, delay: 0, lagMin: 0, unitLagMin: 0, stationMin: 0, lineMin: 0, obsLateMin: 0, depObserved: false, actualDep: 8 * 3600, held: false, faultMin: 0, faults: [], waits: [], episodes: [], ...over };
}
const codesOf = (r) => verdict(r).findings.map((f) => `${f.level}:${f.code}`);
const atNone = { level: 'none', effectiveLevel: 'none' };

test('werdykt: reguły BŁĘDÓW, UWAG i INFORMACJI', () => {
  assert.deepEqual(verdict(shift()), { status: 'ok', findings: [] });
  assert.deepEqual(codesOf(shift({ trains: [] })), ['error:no-traffic']);
  assert.deepEqual(codesOf(shift({ violations: { count: 1, ticks: 3, first: [{ time: '07:30:00', msg: 'pociągi 1 i 2 na odcinku T1' }] } })), ['error:violation']);
  assert.deepEqual(codesOf(shift({ events: [{ code: 'spad', time: 27000, msg: 'spad', nr: 1 }] })), ['error:spad']);
  // jazda po pękniętej szynie z usterki ze scenariusza na tym odcinku – ograniczenie automatu (informacja); bez takiej
  // usterki albo na innym odcinku – błąd
  const defect = { events: [{ code: 'track-defect', time: 27000, msg: 'Jazda po torze z usterką', nr: 1, section: 'T1' }] };
  const scripted = (target) => [{ type: 'track-defect', target, scripted: true, at: 27000, since: 27000, min: 30, trains: ['1'] }];
  assert.deepEqual(codesOf(shift(defect)), ['error:track-defect']);
  assert.deepEqual(codesOf(shift({ ...defect, faults: scripted('T1') })), ['info:automat-limit']);
  assert.deepEqual(codesOf(shift({ ...defect, faults: scripted('T2') })), ['error:track-defect']);
  assert.deepEqual(codesOf(shift({ forced: ['Sz -5: …'] })), ['error:forced']);
  assert.deepEqual(codesOf(shift({ leftovers: ['przebieg A-D1 czynny'] })), ['error:leftovers']);
  assert.deepEqual(codesOf(shift({ jam: [{ nr: 1, status: 'stoi przed A', where: { at: 'station', track: null, sections: ['ZbA'], nextSignal: 'A' }, reason: { code: 'no-route', signal: 'A' }, blockers: [], log: [] }] })), ['error:jam']);
  // zapas do końca zmiany (m:ss, bez zaokrąglania w górę): na poziomie scenariusza uwaga, przy zakłóceniach gracza informacja
  const margin = verdict(shift({ ...atNone, endedAt: 9 * 3600 - 293 })).findings;
  assert.deepEqual(margin.map((f) => `${f.level}:${f.code}`), ['warning:margin']);
  assert.match(margin[0].msg, /Zapas do końca zmiany 4:53 \(< 5 min\)/);
  assert.deepEqual(codesOf(shift({ endedAt: 9 * 3600 - 120 })), ['info:margin']);
  assert.deepEqual(codesOf(shift({ autoEnd: false, endedAt: 9 * 3600, allDoneAt: 8.5 * 3600 })), []);
  // zadania: przepadło bez usterki – błąd; z usterką – uwaga / informacja; po końcu zmiany (bez kary w grze) – uwaga
  const task = { id: 'k', unit: 1, toTrack: '3', deadline: 8 * 3600, shiftMin: 0, faultShiftMin: 0, done: false, doneAt: null, failed: true, late: false };
  assert.deepEqual(codesOf(shift({ tasks: [task] })), ['error:task-failed']);
  assert.deepEqual(codesOf(shift({ ...atNone, tasks: [{ ...task, faultShiftMin: 4 }] })), ['warning:task-failed-fault']);
  assert.deepEqual(codesOf(shift({ ...atNone, tasks: [{ ...task, failed: false, done: true, late: true, doneAt: 8.2 * 3600 }] })), ['warning:task-late']);
  assert.deepEqual(codesOf(shift({ ...atNone, tasks: [{ ...task, deadline: 8.9 * 3600 }] })), ['warning:task-after-end']);
  assert.deepEqual(codesOf(shift({ ...atNone, tasks: [{ ...task, deadline: 8.9 * 3600, failed: false }] })), ['warning:task-after-end']);
  assert.deepEqual(codesOf(shift({ ...atNone, tasks: [{ ...task, deadline: 8.5 * 3600, failed: false }] })), ['warning:task-open']);
  // usterka ze scenariusza bez wpływu: bez zakłóceń błąd, przy wymuszonym poziomie uwaga, przy poziomie gracza informacja
  const quiet = { faults: [{ type: 'block-fail', target: 'W', scripted: true, at: 27000, since: 27000, min: 20, trains: [] }] };
  assert.deepEqual(codesOf(shift({ ...quiet, ...atNone })), ['error:fault-no-effect']);
  assert.deepEqual(codesOf(shift({ ...quiet, baseLevel: 'low' })), ['warning:fault-no-effect']);
  assert.deepEqual(codesOf(shift(quiet)), ['info:fault-no-effect']);
  assert.deepEqual(codesOf(shift({ faults: [{ ...quiet.faults[0], trains: ['1'] }] })), []);
  assert.deepEqual(codesOf(shift({ duties: [{ code: 'no-dpo', time: 27000, msg: 'Blok początkowy', nr: 1 }] })), ['warning:block-duty']);
  // zator składu w manewrach: czy graf przebiegów manewrowych uznaje tor docelowy zadania za osiągalny
  const shunting = (reachable) => ({ nr: 1, status: 'manewruje', where: { at: 'station', track: '6', sections: ['T6'], nextSignal: 'F', mode: 'shunt' }, since: 27000, reason: { code: 'no-route', signal: 'F' }, blockers: [], log: [], task: { id: 'k', toTrack: '8', reachable } });
  assert.match(verdict(shift({ jam: [shunting(true)] })).findings[0].msg, /zadanie „k” na tor 8 – graf przebiegów manewrowych uznaje tor za osiągalny.*\(automat-limit\?\)/);
  assert.match(verdict(shift({ jam: [shunting(false)] })).findings[0].msg, /toru nie da się osiągnąć przebiegami manewrowymi/);
  // pociąg w ruchu: „w ruchu” raz (miejsce), bez powtórzenia jako przyczyny
  const moving = verdict(shift({ jam: [{ nr: 1, status: 'wjeżdża', where: { at: 'station', track: '1', sections: ['T1'], nextSignal: 'D1', moving: true }, since: null, reason: null, blockers: [], log: [] }] })).findings[0].msg;
  assert.equal(moving.match(/w ruchu/g).length, 1, moving);
  // sonda usterek: tylko wpływ usterek i bezpieczeństwo
  assert.deepEqual(codesOf(shift({ ...atNone, faultProbe: true, baseLevel: 'high', endedAt: 9 * 3600 - 60, trains: [train({ stationMin: 3 })] })), []);
});

test('werdykt: inny tor – kto zajmował tor planowy i czy plan sam go dzieli', () => {
  const w = { code: 'wrong-track', time: 27000, msg: 'Pociąg 1 przyjęty na tor 2 zamiast planowego 1', nr: 1 };
  const t2 = train({ nr: 2, label: 'R 2' });
  const byTrain = verdict(shift({ trains: [train(), t2], wrongTrack: [{ ...w, holder: { train: 2 }, planClash: [] }] })).findings[0];
  assert.equal(byTrain.code, 'wrong-track');
  assert.match(byTrain.msg, /tor planowy zajmował R 2; plan nie dzieli toru/);
  assert.equal(byTrain.brief, 'R 1 (tor zajmował R 2)');
  assert.match(verdict(shift({ trains: [train(), t2], wrongTrack: [{ ...w, holder: null, planClash: [2] }] })).findings[0].msg, /plan kładzie na ten tor w tym czasie także R 2/);
});

test('werdykt: pociąg nieobsłużony na koniec zmiany – plan, opóźnienie wniesione, nadzwyczajny, usterka, kaskada, wina stacji', () => {
  const end = { endReason: 'time', endedAt: 9 * 3600 };
  const stuck = (over = {}) => ({ nr: 1, status: 'stoi przed A', expectedDone: 8 * 3600, where: { at: 'station', track: null, sections: ['ZbA'], nextSignal: 'A' }, since: 8 * 3600, reason: { code: 'no-route', signal: 'A' }, faults: [], faultsNow: [], blockers: [], log: [], ...over });
  const own = { waits: [{ code: 'no-route', signal: 'A', min: 60, faultMin: 0, from: 8 * 3600, to: 9 * 3600 }] };
  const trainsWith = (over = {}) => [train({ ...own, ...over })];
  assert.deepEqual(codesOf(shift({ ...end, trains: trainsWith(), unfinished: [stuck()] })), ['error:unfinished']);
  // bez zakłóceń każdy nieobsłużony pociąg (bez usterki) to błąd planu albo automatu – także bez postoju z winy stacji
  assert.deepEqual(codesOf(shift({ ...end, ...atNone, trains: [train()], unfinished: [stuck({ reason: { code: 'neighbour-wait', neighbour: 'Lipno' } })] })), ['error:unfinished-plan']);
  // nie zdąży wg planu: z opóźnieniem wniesionym – uwaga przy wymuszonym poziomie, informacja przy poziomie gracza;
  // bez opóźnienia – plan za ciasny (błąd)
  const late = { ...end, trains: trainsWith({ delayIn: 40, lagMin: 40 }), unfinished: [stuck({ expectedDone: 8.98 * 3600 })] };
  assert.deepEqual(codesOf(shift(late)), ['info:late-inbound']);
  assert.deepEqual(codesOf(shift({ ...late, baseLevel: 'low' })), ['warning:late-inbound']);
  assert.match(verdict(shift(late)).findings[0].msg, /potrzeba co najmniej 4 min.*R 1 \(\+40 min od sąsiada, obsługa ok\. 08:58\).*zapas planu 19 min/);
  assert.deepEqual(codesOf(shift({ ...end, trains: trainsWith(), unfinished: [stuck({ expectedDone: 8.98 * 3600 })] })), ['error:plan-tight']);
  // pociąg ze składu: opóźnienie odziedziczone po składzie, nie „+0 min od sąsiada”
  const fromUnit = verdict(shift({ ...end, trains: [train({ nr: 2, label: 'R 2', unit: 1, lagMin: 26, unitLagMin: 26 }), train({ delayIn: 26, lagMin: 26 })], unfinished: [stuck({ nr: 2, expectedDone: 8.98 * 3600 })] })).findings[0];
  assert.match(fromUnit.msg, /R 2 \(skład z R 1, \+26 min, obsługa ok\. 08:58\)/);
  // pociąg nadzwyczajny – planowany w zmianie, nie zdążył przez opóźnienie w ruchu (informacja, bez rady o endTime)
  const extra = verdict(shift({ ...end, trains: [train(), train({ nr: 2, label: 'R 2', extra: true })], unfinished: [stuck({ nr: 2, expectedDone: 9.2 * 3600 })] })).findings;
  assert.deepEqual(extra.map((f) => `${f.level}:${f.code}`), ['info:extra-after-end']);
  assert.match(extra[0].msg, /R 2 \(nadzwyczajny, obsługa ok\. 09:12\).*co najmniej 10 min przed końcem.*opóźnienie w ruchu/);
  assert.doesNotMatch(extra[0].msg, /wydłuż endTime|generator silnika/);
  // usterka teraz na drodze – automat czeka na naprawę; licznik osi / nawierzchnia – automat jej nie usuwa
  assert.deepEqual(codesOf(shift({ ...end, trains: trainsWith(), unfinished: [stuck({ faults: [{ type: 'signal-fail', target: 'A' }], faultsNow: [{ type: 'signal-fail', target: 'A' }] })] })), ['info:fault-wait']);
  assert.deepEqual(codesOf(shift({ ...end, trains: trainsWith(), unfinished: [stuck({ faults: [{ type: 'axle-counter', target: 'T2' }], faultsNow: [{ type: 'axle-counter', target: 'T2' }] })] })), ['info:automat-limit']);
  // usterka dotknęła pociągu wcześniej, ale teraz stoi z winy stacji – błąd
  assert.deepEqual(codesOf(shift({ ...end, trains: trainsWith(), unfinished: [stuck({ faults: [{ type: 'block-fail', target: 'W' }] })] })), ['error:unfinished']);
  // 6 min przy usterce, a potem 60 min z winy stacji – błąd, nie „automat czeka na naprawę”
  assert.deepEqual(codesOf(shift({ ...end, trains: trainsWith({ faultMin: 6, faults: [{ type: 'signal-fail', target: 'A' }] }), unfinished: [stuck({ faults: [{ type: 'signal-fail', target: 'A' }] })] })), ['error:unfinished']);
  // czeka na szlak – kaskada (przy poziomie gracza informacja)
  assert.deepEqual(codesOf(shift({ ...end, trains: trainsWith({ waits: [{ code: 'neighbour-wait', signal: null, min: 60, faultMin: 0 }] }), unfinished: [stuck({ reason: { code: 'neighbour-wait', neighbour: 'Lipno' } })] })), ['info:cascade']);
  // blokuje pociąg opóźniony od sąsiada – kaskada; blokuje pociąg opóźniony na tej stacji (konflikt) – błąd
  const blocked = (nr) => ({ episodes: [{ code: 'no-route', signal: 'A', blockers: [{ route: 'A-D1', code: 'section-occupied', msg: 'Odcinek T1 zajęty', section: 'T1', train: nr }] }] });
  const t2 = (over) => train({ nr: 2, label: 'R 2', ...over });
  assert.deepEqual(codesOf(shift({ ...end, trains: [...trainsWith(blocked(2)), t2({ delayIn: 20, delay: 20, lagMin: 20 })], unfinished: [stuck({ blockers: blocked(2).episodes[0].blockers })] })), ['info:cascade']);
  assert.deepEqual(codesOf(shift({ ...end, trains: [...trainsWith(blocked(2)), t2({ delay: 10 })], unfinished: [stuck({ blockers: blocked(2).episodes[0].blockers })] })), ['error:unfinished']);
  // przeszkoda od cudzego przebiegu bez ustalonego pociągu – konflikt, nie wina stacji
  const byRoute = { episodes: [{ code: 'no-route', signal: 'A', blockers: [{ route: 'A-D1', code: 'section-locked', msg: 'Odcinek T1 utwierdzony w przebiegu B-D1', section: 'T1', by: 'B-D1' }] }] };
  assert.deepEqual(codesOf(shift({ ...end, trains: trainsWith(byRoute), unfinished: [stuck()] })), ['info:cascade']);
});

test('werdykt: pociąg obsłużony – kara na stacji wg przyczyny; bez zakłóceń każda kara, od 15 min błąd', () => {
  const t = (over, more = {}) => shift({ ...more, trains: [train(over)] });
  assert.deepEqual(codesOf(t({ stationMin: 4 })), [], 'przy zakłóceniach 4 min – bez uwagi');
  assert.deepEqual(codesOf(t({ stationMin: 2 }, atNone)), ['warning:automat-delay'], 'bez zakłóceń każda kara');
  assert.match(verdict(t({ stationMin: 2 }, atNone)).findings[0].msg, /bez postoju w danych – przyczyna nieznana/);
  assert.deepEqual(codesOf(t({ stationMin: 16, waits: [{ code: 'line-occupied', signal: 'D1', neighbour: 'Dębno', min: 16, faultMin: 0, from: 0, to: 0 }] }, atNone)), ['error:line-capacity']);
  const line = verdict(t({ stationMin: 6, lineMin: 6, waits: [{ code: 'line-occupied', signal: 'D1', neighbour: 'Dębno', min: 6, faultMin: 0, from: 0, to: 0 }] })).findings[0];
  assert.equal(line.code, 'line-capacity');
  assert.match(line.msg, /kara za opóźnienie na stacji 6 min \(w tym czekanie na szlak 6 min\)/);
  // konflikt z pociągiem (pierwszy blokujący w skrócie) albo z cudzym przebiegiem
  const conflict = verdict(t({ held: true, waits: [{ code: 'no-route', signal: 'A', min: 6, faultMin: 0, from: 0, to: 0 }], episodes: [{ code: 'no-route', signal: 'A', blockers: [{ route: 'A-D1', code: 'section-occupied', msg: 'Odcinek T1 zajęty', train: 2 }] }] })).findings[0];
  assert.equal(conflict.code, 'track-conflict');
  assert.match(conflict.brief, /z poc\. 2/);
  assert.deepEqual(codesOf(t({ stationMin: 6, waits: [{ code: 'no-route', signal: 'A', min: 6, faultMin: 0, from: 0, to: 0 }], episodes: [{ code: 'no-route', signal: 'A', blockers: [{ route: 'A-D1', code: 'section-pending', msg: 'Odcinek T1 w nastawianym przebiegu G1-G2', by: 'G1-G2' }] }] })), ['warning:track-conflict']);
  // przeszkoda z zewnątrz bez pociągu – na stacji; tylko położenie własnych zwrotnic (ustawia je dyżurny) – zwłoka automatu
  assert.deepEqual(codesOf(t({ stationMin: 7, waits: [{ code: 'no-route', signal: 'A', min: 7, faultMin: 0, from: 0, to: 0 }], episodes: [{ code: 'no-route', signal: 'A', blockers: [{ route: 'A-D1', code: 'section-closed', msg: 'Odcinek Iz1 zamknięty' }] }] })), ['warning:station-delay']);
  assert.deepEqual(codesOf(t({ stationMin: 7, waits: [{ code: 'no-route', signal: 'C', min: 7, faultMin: 0, from: 0, to: 0 }], episodes: [{ code: 'no-route', signal: 'C', blockers: [{ route: 'C-W', code: 'point-position', msg: 'Zwrotnica Zw5 w położeniu +', point: 'Zw5', own: true }] }] })), ['info:automat-delay']);
  // cały postój przy usterce: informacja „automat czeka na naprawę”, bez opóźnienia z winy stacji i bez przetrzymania
  const f = verdict(t({ stationMin: 7, held: true, faultMin: 7, faults: [{ type: 'signal-fail', target: 'A', scripted: false }], waits: [{ code: 'signal-failed', signal: 'A', min: 7, faultMin: 7, from: 0, to: 0 }] })).findings;
  assert.deepEqual(f.map((x) => `${x.level}:${x.code}`), ['info:fault-wait']);
  assert.match(f[0].msg, /losowa usterka semafora A \(poziom low\)/);
  // pociąg stojący od początku zmiany: odjazd przed planem (informacja), po planie bez kary w grze (uwaga bez zakłóceń)
  const early = { depObserved: true, depTime: 8 * 3600, actualDep: 8 * 3600 - 120 };
  assert.deepEqual(codesOf(t(early, atNone)), ['info:early-depart']);
  assert.deepEqual(codesOf(t({ ...early, actualDep: 8 * 3600 + 240, obsLateMin: 4 }, atNone)), ['warning:automat-delay']);
});

test('ocena scenariusza: definicja i poziom scenariusza; poziomy gracza – odporność; wymuszony poziom – uwagi powtarzalne', () => {
  const s = (over) => ({ effectiveLevel: 'none', baseLevel: 'none', faultProbe: false, seed: 1, status: 'ok', findings: [], ...over });
  const w = (code) => ({ level: 'warning', code, msg: '…' });
  assert.deepEqual(scenarioStatus([], [s()]), { status: 'ok', repeated: [], robustness: {} });
  // uwaga przy zakłóceniach gracza nie zmienia oceny
  const low = s({ effectiveLevel: 'low', status: 'warn', findings: [w('wrong-track')] });
  const r = scenarioStatus([], [s(), low]);
  assert.equal(r.status, 'ok');
  assert.deepEqual(r.robustness, { low: { shifts: 1, warned: 1, codes: { 'wrong-track': 1 } } });
  // uwaga bez zakłóceń, uwaga definicji – UWAGI; błąd na dowolnym poziomie – BŁĘDY
  assert.equal(scenarioStatus([], [s({ status: 'warn', findings: [w('margin')] })]).status, 'warn');
  assert.equal(scenarioStatus([w('sc-slack')], [s()]).status, 'warn');
  assert.equal(scenarioStatus([], [s(), { ...low, status: 'error', findings: [{ level: 'error', code: 'jam', msg: '…' }] }]).status, 'error');
  assert.equal(scenarioStatus([{ level: 'error', code: 'tt-empty', msg: '…' }], [s()]).status, 'error');
  assert.equal(scenarioStatus([{ level: 'info', code: 'sc-slack', msg: '…' }], [s()]).status, 'ok');
  // wymuszony poziom high: liczy się rodzaj uwagi powtarzający się we wszystkich ziarnach
  const high = (seed, codes) => s({ effectiveLevel: 'high', baseLevel: 'high', seed, status: codes.length ? 'warn' : 'ok', findings: codes.map(w) });
  assert.deepEqual(scenarioStatus([], [high(1, ['late-inbound', 'margin']), high(2, ['late-inbound'])]), { status: 'warn', repeated: ['late-inbound'], robustness: {} });
  assert.equal(scenarioStatus([], [high(1, ['margin']), high(2, [])]).status, 'ok');
  // uwagi powtarzalne do listy przyjętych: definicja + przebieg bez zakłóceń
  const run = s({ findings: [{ ...w('track-conflict'), train: 93107 }, { level: 'info', code: 'early-depart', msg: '…', train: 1 }] });
  assert.deepEqual(deterministicWarnings([{ ...w('line-headway'), train: 5305 }, w('sc-slack'), { level: 'info', code: 'extra-outside', msg: '…' }], run), ['line-headway:5305', 'sc-slack', 'track-conflict:93107']);
  assert.deepEqual(deterministicWarnings([], s({ effectiveLevel: 'high', baseLevel: 'high', findings: [w('margin')] })), [], 'poziom losowy – bez przebiegu');
});

// ————————————————————————————————————— wiersz poleceń —————————————————————————————————————

test('wiersz poleceń: służba o wybranej porze (--start, --minutes) – rozkład budowany dla każdego ziarna', () => {
  assert.equal(parseArgs([]).duty, null);
  assert.deepEqual(parseArgs(['sopot', '--start', '22', '--minutes=120']).duty, { start: 22, minutes: 120 });
  assert.deepEqual(parseArgs(['--start', '23', '--minutes', '180']).duty, { start: 23, minutes: 180 }, 'służba przez północ');
  assert.throws(() => parseArgs(['--start', '23', '--minutes', '90']), /--minutes: do wyboru 30, 60, 120, 180, jest „90”/);
  assert.throws(() => parseArgs(['--start', '24', '--minutes', '60']), /--start: pełna godzina 0–23/);
  assert.throws(() => parseArgs(['--minutes', '60']), /--start: pełna godzina 0–23 \(wymagana razem z --minutes\)/);
  assert.throws(() => parseArgs(['--start', '6']), /--minutes: .*wymagane razem z --start/);
  // rozkład służby zależy od ziarna: służba każdego ziarna to osobny scenariusz – definicja i przebieg tego samego rozkładu
  const one = listChecks({ targets: ['sopot'], seeds: [1, 2], levels: ['none'], duty: { start: 22, minutes: 120 } });
  assert.deepEqual(one.scenarios.map((x) => [x.station.id, x.scenario.id, x.scenario.name]), [['sopot', 'sluzba-120#1', 'Służba 22:00–00:00'], ['sopot', 'sluzba-120#2', 'Służba 22:00–00:00']]);
  assert.deepEqual(one.jobs.map((j) => [j.stationId, j.scenarioId, j.seed, j.level, j.duty]), [['sopot', 'sluzba-120#1', 1, 'none', { start: 22, minutes: 120 }], ['sopot', 'sluzba-120#2', 2, 'none', { start: 22, minutes: 120 }]]);
  assert.notDeepEqual(one.scenarios[0].scenario.timetable.map((e) => e.nr), one.scenarios[1].scenario.timetable.map((e) => e.nr), 'inne ziarno – inny rozkład');
  // stacja z kilkoma stanowiskami: każde stanowisko osobno
  const two = listChecks({ targets: ['rumia'], seeds: [1], levels: ['none'], duty: { start: 6, minutes: 60 } });
  assert.deepEqual(two.scenarios.map((x) => [x.scenario.id, x.scenario.srk ?? null]), [['sluzba-60#1', null], ['sluzba-60-komputerowe#1', 'komputerowe']]);
  const played = checkShift(two.jobs[1]);
  assert.deepEqual([played.scenario, played.srk, played.error], ['sluzba-60-komputerowe#1', 'komputerowe', undefined]);
  // bez celów – wszystkie posterunki do służby (bez stacji szkoleniowych)
  const all = listChecks({ seeds: [1], levels: ['none'], duty: { start: 6, minutes: 60 } }).scenarios.map((x) => x.station.id);
  assert.ok(all.includes('tczew') && all.includes('rumia') && !all.includes('szkolna') && all.length >= 9);
  assert.throws(() => listChecks({ targets: ['nieznana'], duty: { start: 6, minutes: 60 } }), /Nieznana stacja/);
  // zmiana grana z rozkładem służby dla ziarna zmiany
  const r = checkShift({ stationId: 'sopot', duty: { start: 22, minutes: 60 }, seed: 3, level: 'none', extra: 60 });
  assert.equal(r.error, undefined);
  assert.ok(r.trains.length > 0 && r.trains.every((x) => (x.arr ?? x.dep) >= '22:03'), r.trains.map((x) => x.arr ?? x.dep).join(' '));
});

test('wiersz poleceń: opcje, cele, lista zmian', () => {
  const o = parseArgs([]);
  assert.deepEqual(o.levels, ['none', 'low', 'high']);
  assert.deepEqual(o.levels, LEVELS);
  assert.deepEqual(o.seeds, [1, 2, 3]);
  assert.equal(o.extra, 120);
  assert.equal(o.strict, false);
  assert.deepEqual(o.targets, []);
  const p = parseArgs(['tczew', 'szkolna:zmiana', '--seeds=1-2', '--level', 'low', '--extra', '30', '--tutorial', '--verbose', '--strict', '--workers', '2', '--json', 'a.json']);
  assert.deepEqual([p.targets, p.seeds, p.levels, p.extra, p.tutorial, p.verbose, p.strict, p.workers, p.json], [['tczew', 'szkolna:zmiana'], [1, 2], ['low'], 30, true, true, true, 2, 'a.json']);
  assert.deepEqual(parseArgs(['--level', 'all']).levels, ['none', 'low', 'high'], 'all = wszystkie trzy poziomy');
  assert.throws(() => parseArgs(['--level', 'x']), /poziom/);
  assert.throws(() => parseArgs(['--seeds', '0']), /od 1/);
  assert.throws(() => parseArgs(['--strict=1']), /nie przyjmuje wartości/);
  assert.throws(() => parseArgs(['--nieznana']), /Nieznana opcja/);
  // stacja – wszystkie scenariusze bez samouczków (nowy wariant dochodzi sam); scenariusz wskazany wprost – także samouczek
  const all = listChecks({ targets: ['szkolna'], levels: ['none', 'low'], seeds: [1] });
  const expected = szkolna.scenarios.filter((s) => !s.tutorial).map((s) => s.id);
  assert.ok(expected.includes('zmiana') && !expected.includes('nauka-1'));
  assert.deepEqual(all.scenarios.map((s) => s.scenario.id), expected);
  assert.equal(all.jobs.length, expected.length * 2);
  assert.deepEqual(listChecks({ targets: ['szkolna:nauka-1'], seeds: [1, 2] }).jobs.map((j) => `${j.scenarioId}:${j.level}:${j.seed}`), ['nauka-1:none:1', 'nauka-1:none:2'], 'samouczek wskazany wprost, na swoim poziomie');
  assert.ok(listChecks({ targets: ['szkolna'], tutorial: true, seeds: [1] }).scenarios.some((s) => s.scenario.id === 'nauka-1'));
  // scenariusz z własnym poziomem – raz na ziarno
  assert.deepEqual(listChecks({ targets: ['gdynia-orlowo:szczyt'], seeds: [1] }).jobs.map((j) => j.level), ['high']);
  assert.throws(() => listChecks({ targets: ['nie-ma'] }), /Nieznana stacja/);
  assert.throws(() => listChecks({ targets: ['szkolna:nie-ma'] }), /Nieznany scenariusz.*zmiana-e/);
  assert.equal(listChecks({}).scenarios.length, STATIONS.reduce((a, s) => a + s.scenarios.filter((c) => !c.tutorial).length, 0), 'bez celów – wszystkie stacje');
  assert.deepEqual([1, 2, 5, 12, 22, 25].map((n) => plural(n, 'uwaga', 'uwagi', 'uwag')), ['1 uwaga', '2 uwagi', '5 uwag', '12 uwag', '22 uwagi', '25 uwag']);
});

test('wiersz poleceń: raport w terminalu i kod wyjścia (--strict: także uwagi)', async () => {
  const out = [];
  const { log, error } = console;
  console.log = (...a) => out.push(a.join(' '));
  console.error = (...a) => out.push(a.join(' '));
  try {
    assert.equal(await main(['szkolna:zmiana', '--seeds', '1', '--level', 'none', '--workers', '1']), 0, out.join('\n'));
    const text = out.join('\n');
    assert.match(text, /━━ szkolna:zmiana {2}OK/);
    assert.match(text, /Definicja: bez błędów/);
    assert.match(text, /none +ziarno 1 +OK +koniec 08:\d\d:\d\d – wszystko obsłużone, zapas \d+ min/);
    assert.match(text, /PODSUMOWANIE\n {2}scenariusze: 1 \(OK 1, UWAGI 0, BŁĘDY 0\); błędy definicji: 0; uwagi powtarzalne \(definicja i przebieg bez zakłóceń\): 0\n {2}zmiany: 1 \(OK 1, UWAGI 0, BŁĘDY 0\)/);
    // tczew:zmiana bez zakłóceń ma uwagi powtarzalne (przyjęte w tests/scenario-accepted.js): kod 0, ze --strict – 1
    out.length = 0;
    assert.equal(await main(['tczew:zmiana', '--seeds', '1', '--level', 'none', '--workers', '1']), 0);
    assert.match(out.join('\n'), /━━ tczew:zmiana {2}UWAGI/);
    assert.equal(await main(['tczew:zmiana', '--seeds', '1', '--level', 'none', '--workers', '1', '--strict']), 1);
    out.length = 0;
    assert.equal(await main(['nie-ma']), 2);
    assert.match(out.join('\n'), /Nieznana stacja/);
    assert.equal(await main(['--level', 'x']), 2);
    assert.equal(await main(['--help']), 0);
  } finally {
    console.log = log; console.error = error;
  }
});

test('przebiegi wszystkich scenariuszy: każda część ma swój plik testów, każdy scenariusz jest w jednej części, listy wyjątków aktualne', async () => {
  const { readdirSync } = await import('node:fs');
  const { SHARDS, allScenarios, KNOWN } = await import('./scenario-runs.js');
  const { ACCEPTED } = await import('./scenario-accepted.js');
  const files = readdirSync(new URL('.', import.meta.url)).filter((f) => /^scenario-check-run-\d+\.test\.js$/.test(f)).sort();
  assert.deepEqual(files, Array.from({ length: SHARDS }, (_, i) => `scenario-check-run-${i + 1}.test.js`));
  const keys = allScenarios().map(({ station, scenario }) => `${station.id}:${scenario.id}`);
  assert.equal(new Set(keys).size, keys.length);
  assert.ok(keys.length >= 58);
  for (const k of Object.keys(KNOWN)) assert.ok(keys.includes(k), `wyjątek dla nieistniejącego scenariusza ${k}`);
  for (const [k, list] of Object.entries(ACCEPTED)) {
    assert.ok(keys.includes(k), `przyjęte uwagi nieistniejącego scenariusza ${k}`);
    assert.deepEqual(list, [...new Set(list)].sort(), `${k}: lista posortowana, bez powtórzeń`);
  }
});
