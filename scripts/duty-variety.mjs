#!/usr/bin/env node
/**
 * Różnorodność służb: ile mają wspólnego rozkłady dwóch ziaren tej samej służby (miary – `scripts/lib/duty-variety.mjs`).
 * Przed zmianą budowy służby i po niej: `--json przed.json`, potem `--compare przed.json`.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { executedDirectly, parseSeeds } from './lib/cli.mjs';
import { compareVariety, dutyStations, dutyVariety } from './lib/duty-variety.mjs';
import { DAY_TYPES, normalizeCalendar } from '../src/model/timetable/calendar.js';

export const HELP = `Użycie: npm run duty-variety -- [stacja…] [opcje]

  Dla każdej stacji, godziny startu (0–23) i długości służby – rozkłady kilku ziaren. Wypisuje: liczbę służb, średnią
  liczbę pociągów, służby z pierwszym pociągiem później niż 20 min po starcie i podobieństwo par ziaren (0 – nic
  wspólnego, 1 – to samo): miejsca w rozkładzie (godzina, tor, wjazd, wyjazd) i spotkania (pary linii na stacji
  w odstępie do 3 min – kolejność pociągów).

  --seeds <lista>    ziarna (domyślnie 1-4; przykłady: 1-8, 1,3,5)
  --month <1–12>     stały miesiąc służby (domyślnie losuje ziarno, jak „losowo” w grze)
  --day <typ>        stały typ dnia: ${DAY_TYPES.join(', ')} (domyślnie losuje ziarno)
  --json <plik>      zapisz wynik do pliku
  --compare <plik>   porównaj z wynikiem zapisanym wcześniej (np. sprzed zmiany)
  --help             ta pomoc`;

/** Opcje z wiersza poleceń (`argv` bez `node` i nazwy skryptu); przy błędzie wyjątek z komunikatem. */
export function parseArgs(argv) {
  const opts = { targets: [], seeds: [1, 2, 3, 4], month: null, day: null, json: null, compare: null, help: false };
  for (let i = 0; i < argv.length; i++) {
    const [name, eq] = argv[i].split(/=(.*)/s);
    const value = () => { const v = eq ?? argv[++i]; if (v == null) throw new Error(`${name}: brak wartości`); return v; };
    if (name === '--help' || name === '-h') opts.help = true;
    else if (name === '--seeds') opts.seeds = parseSeeds(value());
    else if (name === '--month') { const v = value(); opts.month = normalizeCalendar(v, null).month; if (opts.month == null) throw new Error(`--month: miesiąc 1–12, jest „${v}”`); }
    else if (name === '--day') { const v = value(); opts.day = normalizeCalendar(null, v).day; if (opts.day == null) throw new Error(`--day: ${DAY_TYPES.join(', ')}, jest „${v}”`); }
    else if (name === '--json') opts.json = value();
    else if (name === '--compare') opts.compare = value();
    else if (!name.startsWith('-')) opts.targets.push(name);
    else throw new Error(`Nieznana opcja: ${argv[i]}`);
  }
  if (opts.seeds.length < 2) throw new Error('--seeds: co najmniej dwa ziarna (podobieństwo liczy się parami)');
  return opts;
}

const pct = (x) => `${Math.round(x * 100)} %`;

/** Tabela wyniku (z porównaniem, gdy podano `before`). */
export function formatVariety(result, before = null) {
  const diff = before ? compareVariety(before, result) : {};
  const was = (id, k, f) => (before?.[id] ? ` (było ${f(before[id][k])})` : '');
  return Object.entries(result).map(([id, r]) => [
    id.padEnd(18), `${r.duties} służb`.padEnd(11), `${r.trains} poc.${was(id, 'trains', String)}`.padEnd(22),
    `późno ${r.late}${was(id, 'late', String)}`.padEnd(18),
    `miejsca ${pct(r.slots)}${was(id, 'slots', pct)}`.padEnd(26), `spotkania ${pct(r.meetings)}${was(id, 'meetings', pct)}`,
  ].join(' ')).join('\n') + (before && !Object.keys(diff).length ? '\n(brak wspólnych stacji do porównania)' : '');
}

if (executedDirectly(import.meta.url)) {
  try {
    const opts = parseArgs(process.argv.slice(2));
    if (opts.help) { console.log(HELP); process.exit(0); }
    const all = dutyStations();
    const unknown = opts.targets.filter((id) => !all.some((st) => st.id === id));
    if (unknown.length) throw new Error(`Nieznana stacja albo bez służby: ${unknown.join(', ')}`);
    const stations = opts.targets.length ? all.filter((st) => opts.targets.includes(st.id)) : all;
    const result = dutyVariety({ stations, seeds: opts.seeds, month: opts.month, day: opts.day });
    const before = opts.compare ? JSON.parse(readFileSync(opts.compare, 'utf8')) : null;
    console.log(formatVariety(result, before));
    if (opts.json) writeFileSync(opts.json, JSON.stringify(result, null, 2));
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
