import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/*
 * Dokumentacja architektury: krótki indeks (`docs/ARCHITECTURE.md` – mapa modułów, zasady, tabela obszarów) i plik
 * na obszar w `docs/architecture/`. Sesja czyta indeks i jeden plik obszaru, nie całość – pliki muszą być w tabeli
 * i zostać małe.
 */

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const index = readFileSync(join(ROOT, 'docs', 'ARCHITECTURE.md'), 'utf8');
const areas = readdirSync(join(ROOT, 'docs', 'architecture')).filter((f) => f.endsWith('.md')).sort();
/** Granica długości pliku obszaru – dłuższy dzieli się na dwa (tak jak kod: małe pliki szybciej się czyta i poprawia). */
const MAX_LINES = 400;

test('każdy plik obszaru jest w tabeli indeksu, a każdy wiersz tabeli wskazuje istniejący plik', () => {
  const linked = [...index.matchAll(/\]\(architecture\/([\w-]+\.md)\)/g)].map((m) => m[1]).sort();
  assert.deepEqual(linked, areas);
  for (const f of linked) assert.ok(existsSync(join(ROOT, 'docs', 'architecture', f)), f);
  assert.ok(areas.length >= 6);
});

test('indeks i pliki obszarów są krótkie; plik obszaru zaczyna się tytułem i odsyła do indeksu', () => {
  assert.ok(index.split('\n').length <= 200, `docs/ARCHITECTURE.md: ${index.split('\n').length} wierszy – szczegóły do pliku obszaru`);
  for (const f of areas) {
    const text = readFileSync(join(ROOT, 'docs', 'architecture', f), 'utf8');
    assert.ok(text.split('\n').length <= MAX_LINES, `${f}: ${text.split('\n').length} wierszy (najwyżej ${MAX_LINES}) – podziel obszar`);
    assert.match(text, /^# .+\n\nCzęść dokumentacji architektury – indeks i zasady: \[`docs\/ARCHITECTURE\.md`\]\(\.\.\/ARCHITECTURE\.md\)\./, f);
  }
});

test('odwołania do sekcji architektury w kodzie, testach i skillach wskazują plik, w którym ta sekcja jest', () => {
  const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? walk(join(dir, d.name)) : [join(dir, d.name)]));
  const files = ['src', 'scripts', 'tests', '.claude', 'docs'].flatMap((d) => walk(join(ROOT, d))).concat([join(ROOT, 'CLAUDE.md'), join(ROOT, 'README.md')])
    .filter((f) => /\.(m?js|md)$/.test(f));
  const sections = new Map(); // tytuł sekcji → plik
  for (const f of ['ARCHITECTURE.md', ...areas.map((a) => `architecture/${a}`)]) {
    for (const m of readFileSync(join(ROOT, 'docs', f), 'utf8').matchAll(/^## (.+)$/gm)) sections.set(m[1].replace(/\s*\(.*$/, '').trim(), `docs/${f}`);
  }
  const bad = [];
  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    for (const m of text.matchAll(/(docs\/(?:ARCHITECTURE|architecture\/[\w-]+)\.md)`?,?\s*\(?„([^”]+)”/g)) {
      const where = sections.get(m[2].trim());
      if (where && where !== m[1]) bad.push(`${file.slice(ROOT.length + 1)}: „${m[2]}” jest w ${where}, nie w ${m[1]}`);
    }
  }
  assert.deepEqual(bad, []);
});
