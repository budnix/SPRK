import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/*
 * Dokumentacja dzielona na obszary: krótki indeks i plik na obszar. Architektura – `docs/ARCHITECTURE.md` (mapa modułów,
 * zasady, tabela obszarów) i `docs/architecture/`; opis źródeł – `docs/SOURCES.md` (materiały, zasady zapisu, tabela
 * obszarów) i `docs/sources/`. Sesja czyta indeks i jeden plik obszaru, nie całość – pliki muszą być w tabeli i zostać
 * małe, a odwołanie do sekcji (`docs/<plik>.md „Sekcja”`) musi wskazywać plik, w którym ta sekcja jest.
 */

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
/** Granica długości pliku obszaru – dłuższy dzieli się na dwa (tak jak kod: małe pliki szybciej się czyta i poprawia). */
const MAX_LINES = 400;
const SETS = [
  { index: 'ARCHITECTURE.md', dir: 'architecture', minAreas: 6, header: 'Część dokumentacji architektury – indeks i zasady: [`docs/ARCHITECTURE.md`](../ARCHITECTURE.md).' },
  { index: 'SOURCES.md', dir: 'sources', minAreas: 6, header: 'Część opisu źródeł – indeks i zasady zapisu: [`docs/SOURCES.md`](../SOURCES.md).' },
].map((s) => ({
  ...s,
  text: readFileSync(join(ROOT, 'docs', s.index), 'utf8'),
  areas: readdirSync(join(ROOT, 'docs', s.dir)).filter((f) => f.endsWith('.md')).sort(),
}));
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Tytuł sekcji z odwołania: bez łamania wiersza komentarza (` * `, `// `), z domkniętym cudzysłowem wewnętrznym („S”). */
const titleOf = (raw) => {
  const t = raw.replace(/\s*\n\s*(?:\*|\/\/)?\s*/g, ' ').replace(/\s+/g, ' ').trim();
  return t.includes('„') && !t.includes('”') ? `${t}”` : t;
};

for (const s of SETS) {
  test(`${s.index}: każdy plik obszaru w docs/${s.dir}/ jest w tabeli indeksu, a każdy wiersz tabeli wskazuje istniejący plik`, () => {
    const linked = [...s.text.matchAll(new RegExp(`\\]\\(${s.dir}\\/([\\w-]+\\.md)\\)`, 'g'))].map((m) => m[1]).sort();
    assert.deepEqual(linked, s.areas);
    for (const f of linked) assert.ok(existsSync(join(ROOT, 'docs', s.dir, f)), f);
    assert.ok(s.areas.length >= s.minAreas);
  });

  test(`${s.index}: indeks i pliki obszarów są krótkie; plik obszaru zaczyna się tytułem i odsyła do indeksu`, () => {
    const n = s.text.split('\n').length;
    assert.ok(n <= 200, `docs/${s.index}: ${n} wierszy – szczegóły do pliku obszaru`);
    for (const f of s.areas) {
      const text = readFileSync(join(ROOT, 'docs', s.dir, f), 'utf8');
      assert.ok(text.split('\n').length <= MAX_LINES, `${f}: ${text.split('\n').length} wierszy (najwyżej ${MAX_LINES}) – podziel obszar`);
      assert.match(text, new RegExp(`^# .+\\n\\n${escape(s.header)}`), f);
    }
  });
}

test('odwołania do sekcji dokumentacji w kodzie, testach, skillach i dokumentach wskazują plik, w którym ta sekcja jest', () => {
  const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? walk(join(dir, d.name)) : [join(dir, d.name)]));
  const files = ['src', 'scripts', 'tests', '.claude', 'docs'].flatMap((d) => walk(join(ROOT, d))).concat([join(ROOT, 'CLAUDE.md'), join(ROOT, 'README.md')])
    .filter((f) => /\.(m?js|md)$/.test(f));
  const sections = new Map(); // tytuł sekcji → plik
  for (const s of SETS) {
    for (const f of [s.index, ...s.areas.map((a) => `${s.dir}/${a}`)]) {
      for (const m of readFileSync(join(ROOT, 'docs', f), 'utf8').matchAll(/^##+ (.+)$/gm)) sections.set(m[1].replace(/\s*\(.*$/, '').trim(), `docs/${f}`);
    }
  }
  const bad = [];
  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    for (const m of text.matchAll(/(docs\/(?:ARCHITECTURE|architecture\/[\w-]+|SOURCES|sources\/[\w-]+)\.md)`?,?\s*\(?(?:sekcja\s*)?„([^”]+)”/g)) {
      const where = sections.get(titleOf(m[2]));
      if (where && where !== m[1]) bad.push(`${file.slice(ROOT.length + 1)}: „${m[2]}” jest w ${where}, nie w ${m[1]}`);
    }
  }
  assert.deepEqual(bad, []);
});

test('opis źródeł: sekcja o temacie z odwołania istnieje (odwołanie z nazwą sekcji, której nie ma, to literówka albo stara nazwa)', () => {
  const titles = new Set();
  for (const f of readdirSync(join(ROOT, 'docs', 'sources'))) {
    for (const m of readFileSync(join(ROOT, 'docs', 'sources', f), 'utf8').matchAll(/^##+ (.+)$/gm)) titles.add(m[1].replace(/\s*\(.*$/, '').trim());
  }
  const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? walk(join(dir, d.name)) : [join(dir, d.name)]));
  const missing = [];
  for (const file of ['src', 'scripts', 'tests', '.claude', 'docs'].flatMap((d) => walk(join(ROOT, d))).filter((f) => /\.(m?js|md)$/.test(f))) {
    for (const m of readFileSync(file, 'utf8').matchAll(/docs\/sources\/[\w-]+\.md`?,?\s*\(?(?:sekcja\s*)?„([^”]+)”/g)) {
      const title = titleOf(m[1]);
      if (!titles.has(title)) missing.push(`${file.slice(ROOT.length + 1)}: „${title}”`);
    }
  }
  assert.deepEqual(missing, []);
});
