import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/*
 * Słownik pojęć (GLOSSARY.md): termin polski, opis po angielsku (`_English_`) i nazwa w kodzie (`_W kodzie_`).
 * Identyfikatory są po angielsku, a dokumentacja po polsku – słownik łączy jedno z drugim, więc nazwa w kodzie musi
 * istnieć (zmiana nazwy w kodzie bez słownika nie przechodzi), a każde nowe pojęcie dostaje oba wiersze.
 */

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const glossary = readFileSync(join(ROOT, 'GLOSSARY.md'), 'utf8');
const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? walk(join(dir, d.name)) : [join(dir, d.name)]));
const source = walk(join(ROOT, 'src')).filter((f) => f.endsWith('.js')).map((f) => readFileSync(f, 'utf8')).join('\n');

/** Pojęcia: `**Termin**:` i wiersze do pustego wiersza. */
const terms = glossary.split(/\n\s*\n/).map((block) => block.trim()).filter((b) => /^\*\*[^*]+\*\*:/.test(b))
  .map((b) => ({ name: b.match(/^\*\*([^*]+)\*\*:/)[1], lines: b.split('\n') }));
const field = (t, key) => t.lines.find((l) => l.startsWith(`_${key}_:`));

test('słownik: każde pojęcie ma opis po angielsku i nazwę w kodzie', () => {
  assert.ok(terms.length >= 30, `pojęć: ${terms.length}`);
  const missing = terms.filter((t) => !field(t, 'English') || !field(t, 'W kodzie')).map((t) => t.name);
  assert.deepEqual(missing, []);
});

test('słownik: każda nazwa w kodzie istnieje w src/ (identyfikator albo wartość w cudzysłowie)', () => {
  const absent = [];
  for (const t of terms) {
    for (const [, name] of field(t, 'W kodzie').matchAll(/`([^`]+)`/g)) {
      const found = name.startsWith("'") ? source.includes(name) : new RegExp(`\\b${name.replace(/\$/g, '\\$')}\\b`).test(source);
      if (!found) absent.push(`${t.name}: ${name}`);
    }
  }
  assert.deepEqual(absent, []);
});

test('słownik: odesłania `_Więcej_` wskazują istniejące pliki', () => {
  const bad = [];
  for (const t of terms) {
    const more = field(t, 'Więcej');
    if (!more) continue;
    for (const [, path] of more.matchAll(/`(docs\/[\w/.-]+\.md)`/g)) if (!existsSync(join(ROOT, path))) bad.push(`${t.name}: ${path}`);
  }
  assert.deepEqual(bad, []);
});
