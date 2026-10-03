import { test } from 'node:test';
import assert from 'node:assert/strict';
import { choiceFromParams, choiceToParams, simulationOptions, dutyWindow, PARAMS } from '../src/model/shift/choice.js';
import { DUTY_ID, buildDuty } from '../src/model/duty.js';
import { Simulation } from '../src/model/Simulation.js';
import sopot from '../src/stations/sopot.js';
import rumia from '../src/stations/rumia.js';

/*
 * Wybór zmiany (`src/model/shift/choice.js`): ten sam opis zmiany w adresie gry, na stronie posterunku i w narzędziach.
 */

const params = (query) => new URLSearchParams(query);

test('adres → wybór zmiany: scenariusz stacji, służba (pora i długość poprawione do dozwolonych), brak scenariusza', () => {
  assert.deepEqual(choiceFromParams(params('stacja=sopot&scenariusz=usterka-gd&zaklocenia=high&seed=7')),
    { station: 'sopot', scenario: 'usterka-gd', duty: null, srk: null, seed: 7, level: 'high', district: null });
  assert.deepEqual(choiceFromParams(params('stacja=rumia&scenariusz=sluzba&start=22&czas=180&srk=komputerowe&okreg=GO')),
    { station: 'rumia', scenario: DUTY_ID, duty: { start: 22, minutes: 180 }, srk: 'komputerowe', seed: null, level: null, district: 'GO' });
  assert.deepEqual(choiceFromParams(params('stacja=rumia&scenariusz=sluzba&start=27&czas=45')).duty, { start: 6, minutes: 120 }, 'pora i długość spoza wyboru');
  assert.equal(choiceFromParams(params('stacja=sopot')).scenario, null, 'ekran wyboru');
  assert.equal(choiceFromParams(params('stacja=sopot&scenariusz=zmiana&seed=0')).seed, 0);
});

test('wybór zmiany → adres i z powrotem: te same parametry w stałej kolejności, bez pustych', () => {
  const duty = { station: 'rumia', scenario: DUTY_ID, duty: { start: 23, minutes: 60 }, srk: 'komputerowe', seed: 5, level: 'low', district: null };
  const pairs = choiceToParams(duty);
  assert.deepEqual(pairs, [['stacja', 'rumia'], ['scenariusz', 'sluzba'], ['zaklocenia', 'low'], ['start', '23'], ['czas', '60'], ['seed', '5'], ['srk', 'komputerowe']]);
  assert.deepEqual(choiceFromParams(new URLSearchParams(pairs)), duty);
  const special = { station: 'sopot', scenario: 'usterka-gd', duty: { start: 1, minutes: 60 }, srk: null, seed: null, level: 'none', district: null };
  assert.deepEqual(choiceToParams(special), [['stacja', 'sopot'], ['scenariusz', 'usterka-gd'], ['zaklocenia', 'none']], 'pora służby tylko przy służbie');
  assert.deepEqual(Object.values(PARAMS), ['stacja', 'scenariusz', 'zaklocenia', 'okreg', 'start', 'czas', 'seed', 'srk']);
});

test('opcje symulacji: scenariusz stacji wprost; służba zbudowana dla ziarna – podanego albo wylosowanego raz', () => {
  assert.deepEqual(simulationOptions(sopot, { scenario: 'usterka-gd', level: 'high', seed: null }),
    { scenario: 'usterka-gd', seed: undefined, disruptions: 'high', district: undefined, srk: undefined });
  const choice = { scenario: DUTY_ID, duty: { start: 22, minutes: 120 }, seed: 4, level: null };
  const opts = simulationOptions(sopot, choice);
  assert.deepEqual(opts.scenario, buildDuty(sopot, { start: 22, minutes: 120, seed: 4 }).scenario, 'ta sama służba co z modułu służby');
  assert.deepEqual([opts.seed, opts.disruptions], [4, 'none']);
  let drawn = 0;
  const random = simulationOptions(sopot, { ...choice, seed: null }, { randomSeed: () => { drawn++; return 123; } });
  assert.deepEqual([random.seed, drawn, random.scenario.timetable.length > 0], [123, 1, true]);
  assert.deepEqual(random.scenario, buildDuty(sopot, { start: 22, minutes: 120, seed: 123 }).scenario);
});

test('stanowisko wybrane przez gracza: w scenariuszu służby i w opcjach – zmiana gra się na nim', () => {
  const opts = simulationOptions(rumia, { scenario: DUTY_ID, duty: { start: 6, minutes: 60 }, seed: 1, srk: 'komputerowe' });
  assert.deepEqual([opts.scenario.srk, opts.srk], ['komputerowe', 'komputerowe']);
  assert.equal(new Simulation(rumia, opts).srk.id, 'komputerowe');
  assert.equal(new Simulation(rumia, simulationOptions(rumia, { scenario: 'usterka-rd2', srk: 'komputerowe' })).srk.id, 'komputerowe');
  assert.equal(new Simulation(rumia, simulationOptions(rumia, { scenario: 'usterka-rd2' })).srk.id, 'E');
  assert.deepEqual(dutyWindow({ start: 23, minutes: 180 }), { from: 23 * 3600, to: 26 * 3600 });
});
