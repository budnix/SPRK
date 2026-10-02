#!/usr/bin/env node
/**
 * Pociągi dalekobieżne z nazwami (PKP Intercity: EIP, EIC, IC, TLK) – nazwa, kategoria, numer i trasa (ważniejsze
 * stacje po kolei) – do pliku `src/model/data/namedTrains.js`. Z tej listy gra bierze nazwy i relacje pociągów
 * dalekobieżnych w służbie o wybranej porze (`src/model/duty.js`): nazwa jest przypisana do swojej trasy.
 *
 * Źródło: zestawienia pociągów vagonweb.cz (rozkład roczny PKP Intercity; trasa orientacyjna) – lista kategorii
 * i strona pociągu z polem „Trasa”. Serwer ogranicza liczbę zapytań, więc strony pociągów pobiera się z przerwą
 * (`--delay`, domyślnie 6 s) i zapisuje w katalogu podręcznym (`--cache`, domyślnie w katalogu tymczasowym systemu) –
 * przerwane pobieranie da się wznowić.
 *
 *   node scripts/named-trains.mjs --year 2026 --cache /tmp/sprk-named-trains
 *   node scripts/named-trains.mjs --offline --cache …   # tylko z katalogu podręcznego (bez sieci)
 *
 * Opis danych i zasady: docs/SOURCES.md („Pociągi z nazwami”).
 */
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { executedDirectly } from './shift.mjs';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const BASE = 'https://www.vagonweb.cz/razeni/';
export const CATEGORIES = ['EIP', 'EIC', 'IC', 'TLK'];

const unescape = (s) => s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const text = (s) => unescape(s.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();

/** Wiersze listy kategorii: `{ cat, nr, name, href, short }` (`short` – trasa skrócona z „...”). */
export function parseList(html) {
  const out = [];
  const re = /<td class=cislo>\s*<a href="(vlak\.php\?[^"]+)">\s*(\w+)\s*<b>([^<]+)<\/b>\s*<\/a>\s*<\/td>\s*<td class=nazev>([\s\S]*?)<\/td>\s*<td class=maly>([\s\S]*?)<\/td>/g;
  for (const m of unescape(html).matchAll(re)) out.push({ href: m[1], cat: m[2], nr: m[3].trim(), name: text(m[4]), short: text(m[5]) });
  return out;
}

/** Pole „Trasa” ze strony pociągu albo null. */
export function parseRoute(html) {
  const m = /Trasa\s*<\/[^>]+>\s*(?:<[^>]+>\s*)*([^<]{10,3000})/.exec(unescape(html).replace(/\s+/g, ' '));
  return m ? m[1].trim() : null;
}

/**
 * Trasa „Łódź Fabr. 05:31 - Koluszki - … - Gdynia Gł. 10:40” → `{ stops, dep, arr }`: stacje po kolei bez godzin,
 * bez „...” i bez „CMK” (linia, nie stacja); dwie stacje sklejone w źródle („Warszawa Cent. Warszawa Wsch.”) rozdzielone.
 */
export function parseStops(route) {
  const times = [...String(route).matchAll(/\d{1,2}:\d{2}/g)].map((m) => m[0]);
  // godziny (także „22:24-22:29” i przyklejone do nazwy: „Gdynia Gł.15:52”) poza nazwami; łącznik stacji to „-” z odstępem
  // z co najmniej jednej strony („Gliwice -Kędzierzyn-Koźle”) – łącznik w nazwie („Bielsko-Biała”) zostaje
  const parts = String(route).replace(/\s*\d{1,2}:\d{2}(-\d{1,2}:\d{2})?/g, ' ').split(/\s+-\s*|\s*-\s+/).map((x) => x.trim()).filter(Boolean);
  const stops = [];
  for (const name of parts) {
    if (name === '...' || name === 'CMK') continue;
    for (const one of name.split(/(?<=\b(?:Cent|Centr|Wsch|Zach|Gł)\.)\s+(?=\p{Lu})/u)) if (stops.at(-1) !== one) stops.push(one);
  }
  return { stops, dep: times[0] ?? null, arr: times.length > 1 ? times.at(-1) : null };
}

const pad = (h) => (h && h.length === 4 ? `0${h}` : h);

/** Lista pociągów z nazwami: jedna pozycja na (kategoria, nazwa, początek, koniec); posortowana. */
export function buildList(rows) {
  const seen = new Set(), out = [];
  for (const r of rows) {
    const { stops, dep, arr } = parseStops(r.route ?? r.short);
    if (!r.name || stops.length < 2) continue;
    const key = `${r.cat}|${r.name}|${stops[0]}|${stops.at(-1)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ cat: r.cat, nr: r.nr, name: r.name, stops, dep: pad(dep), arr: pad(arr), ...(r.route ? {} : { partial: true }) });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name, 'pl') || a.stops[0].localeCompare(b.stops[0], 'pl') || a.cat.localeCompare(b.cat));
}

export function moduleText(list, { year, date }) {
  const q = (s) => `'${String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
  const row = (t) => `  { cat: ${q(t.cat)}, nr: ${q(t.nr)}, name: ${q(t.name)},${t.dep ? ` dep: ${q(t.dep)},` : ''}${t.arr ? ` arr: ${q(t.arr)},` : ''}${t.partial ? ' partial: true,' : ''} stops: [${t.stops.map(q).join(', ')}] },`;
  return `/**
 * Pociągi dalekobieżne z nazwami (PKP Intercity) – plik generowany: node scripts/named-trains.mjs (nie edytuj ręcznie).
 * Rozkład roczny ${year}, stan z ${date}; źródło: zestawienia pociągów vagonweb.cz (trasa orientacyjna – ważniejsze stacje).
 * \`cat\` kategoria, \`nr\` numer, \`name\` nazwa, \`stops\` stacje po kolei (pierwsza – początek, ostatnia – koniec relacji),
 * \`dep\` / \`arr\` odjazd ze stacji początkowej i przyjazd do końcowej, \`partial\` – trasa skrócona (bez stacji pośrednich).
 * Opis i zasady użycia: docs/SOURCES.md („Pociągi z nazwami”).
 */
export const NAMED_TRAINS = [
${list.map(row).join('\n')}
];
`;
}

const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));
const cacheName = (r) => `t_${`${r.cat}_${r.nr}_${r.name}`.replace(/[^0-9A-Za-z]+/g, '_')}.html`;

async function get(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (SPRK named-trains)' } });
  const body = await res.text();
  if (!res.ok || body.length < 3000) throw new Error(`${res.status} ${body.slice(0, 40)}`);
  return body;
}

export async function main(argv = process.argv.slice(2)) {
  const opt = { year: '2026', cache: join(tmpdir(), 'sprk-named-trains'), delay: 6000, offline: false, out: join(ROOT, 'src', 'model', 'data', 'namedTrains.js') };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--offline') opt.offline = true;
    else if (['--year', '--cache', '--delay', '--out'].includes(argv[i])) opt[argv[i].slice(2)] = argv[i] === '--delay' ? Number(argv[++i]) : argv[++i];
    else { console.error(`Nieznana opcja: ${argv[i]}`); return 2; }
  }
  mkdirSync(opt.cache, { recursive: true });
  const rows = [];
  for (const cat of CATEGORIES) {
    const file = join(opt.cache, `${cat}.html`);
    if (!existsSync(file) && !opt.offline) { writeFileSync(file, await get(`${BASE}razeni.php?rok=${opt.year}&zeme=PKPIC&kategorie=${cat}&lang=pl`)); await sleep(opt.delay); }
    if (existsSync(file)) rows.push(...parseList(readFileSync(file, 'utf8')).filter((r) => r.name));
  }
  const unique = [...new Map(rows.map((r) => [`${r.cat}|${r.nr}|${r.name}`, r])).values()];
  console.log(`Pociągi z nazwami na listach: ${unique.length}`);
  let fetched = 0, failed = 0;
  for (const [i, r] of unique.entries()) {
    const file = join(opt.cache, cacheName(r));
    if ((!existsSync(file) || statSync(file).size < 3000) && !opt.offline) {
      const params = new URLSearchParams(r.href.split('?')[1]);
      try { writeFileSync(file, await get(`${BASE}vlak.php?${params}&lang=pl`)); fetched++; } catch (e) { failed++; console.log(`  ${r.cat} ${r.nr} ${r.name}: ${e.message}`); if (failed > 5) { console.log('Serwer odmawia – przerwane; uruchom ponownie później (pobrane strony są w katalogu podręcznym).'); break; } }
      await sleep(opt.delay);
      if (fetched % 20 === 0) console.log(`  pobrane strony: ${fetched}, pociąg ${i + 1} z ${unique.length}`);
    }
    if (existsSync(file) && statSync(file).size >= 3000) r.route = parseRoute(readFileSync(file, 'utf8'));
  }
  const list = buildList(unique);
  writeFileSync(opt.out, moduleText(list, { year: opt.year, date: new Date().toISOString().slice(0, 10) }));
  console.log(`Zapisano ${list.length} pociągów (z pełną trasą ${list.filter((t) => !t.partial).length}) do ${opt.out}`);
  return 0;
}

if (executedDirectly(import.meta.url)) process.exitCode = await main();
