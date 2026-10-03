import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dutyVariety, jaccard, meetingOverlap, meetings, slotOverlap, compareVariety } from '../scripts/lib/duty-variety.mjs';
import { formatVariety, parseArgs } from '../scripts/duty-variety.mjs';

/*
 * Różnorodność służb (`scripts/lib/duty-variety.mjs`, `npm run duty-variety`): ile mają wspólnego rozkłady dwóch ziaren
 * tej samej służby. Służba ma się nie nudzić – dwa ziarna nie mogą dawać prawie tego samego rozkładu.
 */

const e = (nr, time, track, from, to) => ({ nr, arr: time, track, from, to });

test('miary: miejsca w rozkładzie (bez numerów) i spotkania linii w odstępie do 3 min', () => {
  assert.equal(jaccard([], []), 1);
  assert.equal(jaccard(['a', 'b'], ['b', 'c']), 1 / 3);
  const a = [e(1, '06:00', '1', 'A', 'B'), e(2, '06:02', '2', 'B', 'A'), e(3, '06:30', '1', 'A', 'B')];
  // te same miejsca, inne numery – to samo
  assert.equal(slotOverlap(a, a.map((x) => ({ ...x, nr: x.nr + 100 }))), 1);
  // jedna linia o 2 min później: wspólne 1 miejsce z 5; spotkanie 06:00/06:02 zostaje (06:02/06:02)
  const b = [e(1, '06:02', '1', 'A', 'B'), e(2, '06:02', '2', 'B', 'A'), e(3, '06:32', '1', 'A', 'B')];
  assert.equal(slotOverlap(a, b), 1 / 5);
  assert.deepEqual(meetings(a), ['1|A|B~2|B|A']);
  assert.equal(meetingOverlap(a, b), 1);
  // druga linia o 5 min później – spotkania już nie ma
  const c = [e(1, '06:00', '1', 'A', 'B'), e(2, '06:07', '2', 'B', 'A'), e(3, '06:30', '1', 'A', 'B')];
  assert.deepEqual(meetings(c), []);
  assert.equal(meetingOverlap(a, c), 0);
});

test('służby dwóch ziaren się różnią: mało wspólnych miejsc i spotkań; pociągi zostają, pierwszy w ciągu 20 min', () => {
  // przed przesunięciem linii, pociągiem towarowym w luce i przejazdami służbowymi: miejsca 55–68 % na każdym posterunku,
  // spotkania 50 % razem, 14,9 pociągu na służbę; po nich: miejsca do 14 %, spotkania 34 %, 16,1 pociągu
  const r = dutyVariety({ starts: [6, 10, 19, 23], minutes: [120], seeds: [1, 2, 3, 4] });
  for (const [id, x] of Object.entries(r)) {
    assert.ok(x.slots <= 0.25, `${id}: wspólne miejsca ${x.slots}`);
    assert.equal(x.late, 0, `${id}: pierwszy pociąg później niż 20 min po starcie`);
  }
  assert.ok(r.ALL.meetings <= 0.42, `wspólne spotkania ${r.ALL.meetings}`);
  assert.ok(r.ALL.trains >= 15, `${r.ALL.trains} pociągów na służbę`);
  assert.ok(r.ALL.duties >= 9 * 16, `${r.ALL.duties} służb`);
});

test('wiersz poleceń: stacje, ziarna, zapis i porównanie z wcześniejszym wynikiem', () => {
  assert.deepEqual(parseArgs(['reda', '--seeds', '1-3', '--json', 'a.json', '--compare=b.json']), { targets: ['reda'], seeds: [1, 2, 3], json: 'a.json', compare: 'b.json', help: false });
  assert.equal(parseArgs(['-h']).help, true);
  assert.throws(() => parseArgs(['--seeds', '2']), /co najmniej dwa ziarna/);
  assert.throws(() => parseArgs(['--x']), /Nieznana opcja/);
  const before = { reda: { duties: 4, trains: 10, late: 1, slots: 0.6, meetings: 0.5 } };
  const after = { reda: { duties: 4, trains: 11, late: 0, slots: 0.1, meetings: 0.3 }, sopot: { duties: 4, trains: 9, late: 0, slots: 0.2, meetings: 0.4 } };
  assert.deepEqual(compareVariety(before, after), { reda: { trains: 1, late: -1, slots: -0.5, meetings: -0.2 } });
  const text = formatVariety(after, before);
  assert.match(text, /reda .* miejsca 10 % \(było 60 %\) .* spotkania 30 % \(było 50 %\)/);
  assert.doesNotMatch(text.split('\n')[1], /było/);
});
