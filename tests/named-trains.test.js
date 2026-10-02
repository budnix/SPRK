import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseList, parseRoute, parseStops, buildList, moduleText } from '../scripts/named-trains.mjs';
import { NAMED_TRAINS } from '../src/model/data/namedTrains.js';
import { cityOf, namedTrainsVia, namedTrainTitle } from '../src/model/namedTrains.js';

/*
 * Pociągi z nazwami: generator listy (`scripts/named-trains.mjs` – odczyt stron źródła i budowa pliku danych), sama
 * lista (`src/model/data/namedTrains.js`) i dobór pociągu do relacji (`src/model/namedTrains.js`).
 */

const LIST = `<tr onclick="x" class='tr_razeni'> <td class=cislo><a href="vlak.php?zeme=PKPIC&kategorie=IC&cislo=1510/1&nazev=Lazur&rok=2026">IC <b>1510/1</b></a>&nbsp; </td>
 <td class=nazev><b><i>Lazur</i></b>&nbsp; </td> <td class=maly>Łódź Fabr. 05:31 - Łódź Widzew - Koluszki - ... - Gdańsk Gł. - Gdynia Gł. 10:40</td></tr>
<tr class='tr_razeni'> <td class=cislo><a href="vlak.php?zeme=PKPIC&kategorie=IC&cislo=1601&nazev=&rok=2026">IC <b>1601</b></a> </td> <td class=nazev> </td> <td class=maly>Warszawa Wsch. 06:00 - Lublin Gł. 08:10</td></tr>`;

test('lista kategorii: numer, kategoria, nazwa, adres strony pociągu i trasa skrócona; pociąg bez nazwy ma pustą nazwę', () => {
  const rows = parseList(LIST);
  assert.deepEqual(rows.map((r) => [r.cat, r.nr, r.name]), [['IC', '1510/1', 'Lazur'], ['IC', '1601', '']]);
  assert.match(rows[0].href, /^vlak\.php\?.*cislo=1510\/1&nazev=Lazur/);
  assert.equal(rows[0].short, 'Łódź Fabr. 05:31 - Łódź Widzew - Koluszki - ... - Gdańsk Gł. - Gdynia Gł. 10:40');
});

test('strona pociągu: pole „Trasa”; brak pola – null', () => {
  assert.equal(parseRoute('<div><b>Trasa</b></div><div> Łódź Fabr. 05:31 - Koluszki - Gdynia Gł. 10:40 </div><i>Kursuje</i>'), 'Łódź Fabr. 05:31 - Koluszki - Gdynia Gł. 10:40');
  assert.equal(parseRoute('<p>error code: 1015</p>'), null);
});

test('trasa → stacje po kolei: bez godzin, „...” i CMK; usterki zapisu w źródle (sklejone stacje, godzina przy nazwie, łącznik bez odstępu)', () => {
  assert.deepEqual(parseStops('Łódź Fabr. 05:31 - Łódź Widzew - Koluszki - Warszawa Centr. - Iława Gł. - Gdańsk Gł. - Gdynia Gł. 10:40'),
    { stops: ['Łódź Fabr.', 'Łódź Widzew', 'Koluszki', 'Warszawa Centr.', 'Iława Gł.', 'Gdańsk Gł.', 'Gdynia Gł.'], dep: '05:31', arr: '10:40' });
  assert.deepEqual(parseStops('Kraków Gł. 04:30 - CMK - Warszawa Zach. - ... - Słupsk - Koszalin - Kołobrzeg 13:34').stops, ['Kraków Gł.', 'Warszawa Zach.', 'Słupsk', 'Koszalin', 'Kołobrzeg']);
  assert.deepEqual(parseStops('Warszawa Zach. 07:09 - Warszawa Cent. Warszawa Wsch. - Gdańsk Gł. - Hel 12:41').stops, ['Warszawa Zach.', 'Warszawa Cent.', 'Warszawa Wsch.', 'Gdańsk Gł.', 'Hel']);
  assert.deepEqual(parseStops('Praha hl.n. 10:49 - Gdańsk Gł. - Gdynia Gł.15:52'), { stops: ['Praha hl.n.', 'Gdańsk Gł.', 'Gdynia Gł.'], dep: '10:49', arr: '15:52' });
  assert.deepEqual(parseStops('Przemyśl Gł. 17:00 - Gliwice 22:24-22:29 -Kędzierzyn-Koźle - Bielsko-Biała Gł. - Bohumín 23:59').stops, ['Przemyśl Gł.', 'Gliwice', 'Kędzierzyn-Koźle', 'Bielsko-Biała Gł.', 'Bohumín']);
  assert.deepEqual(parseStops('Lębork 18:05 - Łeba 18:46'), { stops: ['Lębork', 'Łeba'], dep: '18:05', arr: '18:46' });
});

test('lista: tylko pociągi z nazwą, jeden na (kategoria, nazwa, początek, koniec), trasa pełna albo skrócona (partial); plik modułu', () => {
  const rows = [
    { cat: 'IC', nr: '1510/1', name: 'Lazur', route: 'Łódź Fabr. 5:31 - Koluszki - Gdynia Gł. 10:40' },
    { cat: 'IC', nr: '1552/3', name: 'Lazur', route: 'Łódź Fabr. 05:31 - Koluszki - Gdynia Gł. 10:40' }, // ten sam pociąg w innym terminie
    { cat: 'TLK', nr: '54102/3', name: 'Flisak', short: 'Gdynia Gł. 08:53 - Gdańsk Gł. - ... - Katowice 19:26' },
    { cat: 'IC', nr: '1601', name: '', short: 'Warszawa Wsch. 06:00 - Lublin Gł. 08:10' },
  ];
  const list = buildList(rows);
  assert.deepEqual(list.map((t) => [t.cat, t.name, t.nr, t.stops.join('>'), t.dep, t.arr, !!t.partial]), [
    ['TLK', 'Flisak', '54102/3', 'Gdynia Gł.>Gdańsk Gł.>Katowice', '08:53', '19:26', true],
    ['IC', 'Lazur', '1510/1', 'Łódź Fabr.>Koluszki>Gdynia Gł.', '05:31', '10:40', false],
  ]);
  const text = moduleText(list, { year: '2026', date: '2026-10-02' });
  assert.match(text, /plik generowany: node scripts\/named-trains\.mjs/);
  assert.match(text, /\{ cat: 'IC', nr: '1510\/1', name: 'Lazur', dep: '05:31', arr: '10:40', stops: \['Łódź Fabr\.', 'Koluszki', 'Gdynia Gł\.'\] \},/);
  assert.match(text, /name: 'Flisak', dep: '08:53', arr: '19:26', partial: true, stops:/);
});

test('lista pociągów z nazwami: cała Polska, trasy po kolei, dobór po miastach relacji', () => {
  assert.ok(NAMED_TRAINS.length > 200, `pociągi: ${NAMED_TRAINS.length}`);
  for (const t of NAMED_TRAINS) {
    assert.ok(['EIP', 'EIC', 'IC', 'TLK'].includes(t.cat) && t.name && t.stops.length >= 2, JSON.stringify(t));
    assert.ok(t.stops.every((x) => x && x !== '...' && x !== 'CMK' && !/\d\d:\d\d/.test(x)), `${t.name}: ${t.stops.join(' | ')}`);
    for (const k of ['dep', 'arr']) if (t[k] != null) assert.match(t[k], /^\d\d:\d\d$/, `${t.name}: ${k}`);
  }
  assert.ok(new Set(NAMED_TRAINS.map((t) => t.name)).size > 100, 'różne nazwy');
  assert.deepEqual(['Kraków Gł.', 'Warszawa Zach.', 'Warszawa Centr.', 'Łódź Fabr.', 'Praha hl.n.', 'Berlin Hbf', 'Bielsko-Biała Gł.', 'Hel'].map(cityOf), ['Kraków', 'Warszawa', 'Warszawa', 'Łódź', 'Praha', 'Berlin', 'Bielsko-Biała', 'Hel']);
  const names = (a, b) => namedTrainsVia(a, b).map((t) => t.name);
  assert.ok(names('Kraków Gł.', 'Gdynia Gł.').includes('Neptun') && names('Kraków Gł.', 'Gdynia Gł.').includes('Posejdon'));
  assert.ok(!names('Gdynia Gł.', 'Kraków Gł.').some((n) => namedTrainsVia('Gdynia Gł.', 'Kraków Gł.').find((t) => t.name === n).stops[0].startsWith('Kraków')), 'kierunek się liczy');
  assert.ok(names('Hel', 'Warszawa Wsch.').includes('Jantar'));
  assert.deepEqual(names('Krasne', 'Zalesie'), []);
  assert.deepEqual(names('Gdynia Gł.', 'Gdynia Gł.'), []);
  assert.equal(namedTrainTitle({ cat: 'IC', name: 'Lazur', stops: ['Łódź Fabr.', 'Koluszki', 'Gdynia Gł.'] }), 'IC „Lazur” Łódź Fabr. – Gdynia Gł.');
});
