import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Granice warstw (docs/ARCHITECTURE.md, „Zasady”): logika symulacji nie zna DOM ani warstwy widoku,
 * a widoki stanowisk nie zależą od siebie nawzajem. Test czyta źródła – nie uruchamia ich.
 */
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'src');
const posix = (p) => p.split(sep).join('/');

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (name.endsWith('.js')) out.push(p);
  }
  return out;
}

/** Ścieżki importów pliku (statyczne `import … from`, `export … from`, `import '…'` i dynamiczne `import('…')`). */
function importsOf(code) {
  const out = [];
  const re = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)(['"])([^'"\n]+)\1/g;
  for (let m = re.exec(code); m; m = re.exec(code)) out.push(m[2]);
  return out;
}

/** Kod bez komentarzy i bez treści napisów – żeby słowo „window” w opisie nie liczyło się jako użycie DOM. */
function stripped(code) {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1')
    .replace(/'(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*"/g, "''");
}

/** Pliki logiki bez DOM: model, rdzeń, kostki i nie-widokowa część strategii srk. */
const LOGIC_DIRS = ['model', 'core', 'tiles'];
const logicFiles = [
  ...LOGIC_DIRS.flatMap((d) => walk(join(SRC, d))),
  ...walk(join(SRC, 'srk')).filter((f) => !f.endsWith(`${sep}views.js`)),
];
const allowedTarget = (rel) => LOGIC_DIRS.some((d) => rel.startsWith(`src/${d}/`)) || (rel.startsWith('src/srk/') && rel !== 'src/srk/views.js');

test('logika (model, core, tiles, srk bez views.js) importuje tylko logikę', () => {
  assert.ok(logicFiles.length > 10, 'znaleziono pliki logiki');
  const bad = [];
  for (const file of logicFiles) {
    for (const spec of importsOf(readFileSync(file, 'utf8'))) {
      if (!spec.startsWith('.')) { bad.push(`${posix(relative(ROOT, file))} → ${spec} (pakiet zewnętrzny)`); continue; }
      const target = posix(relative(ROOT, resolve(dirname(file), spec)));
      if (!allowedTarget(target)) bad.push(`${posix(relative(ROOT, file))} → ${target}`);
    }
  }
  assert.deepEqual(bad, [], `Logika nie może zależeć od widoku / UI:\n${bad.join('\n')}`);
});

test('logika nie używa globalnych obiektów przeglądarki', () => {
  const DOM = /(?<![.\w$])(document|window|localStorage|sessionStorage|navigator|location|requestAnimationFrame|matchMedia)\s*(?:\.|\?\.|\[|\()/;
  const bad = [];
  for (const file of logicFiles) {
    const lines = stripped(readFileSync(file, 'utf8')).split('\n');
    lines.forEach((line, i) => { const m = DOM.exec(line); if (m) bad.push(`${posix(relative(ROOT, file))}:${i + 1} – ${m[1]}`); });
  }
  assert.deepEqual(bad, [], `Logika nie może dotykać DOM:\n${bad.join('\n')}`);
});

test('widok nie zmienia stanu zależności ani blokad wprost (tylko przez polecenia symulacji)', () => {
  const viewFiles = [...['render', 'ui', 'tutorial'].flatMap((d) => walk(join(SRC, d))), join(SRC, 'main.js')];
  const WRITE = /\.(?:ilk|blocks\.get\([^)]*\))\??\.\w+\s*(?:=(?!=)|\+\+|--|[-+*/]=)/;
  const bad = [];
  for (const file of viewFiles) {
    const lines = stripped(readFileSync(file, 'utf8')).split('\n');
    lines.forEach((line, i) => { if (WRITE.test(line)) bad.push(`${posix(relative(ROOT, file))}:${i + 1}`); });
  }
  assert.deepEqual(bad, [], `Widok zmienia stan modelu wprost:\n${bad.join('\n')}`);
});

test('widoki stanowisk (src/render/*Renderer.js) nie importują się nawzajem', () => {
  const renderers = walk(join(SRC, 'render')).filter((f) => /Renderer\.js$/.test(f));
  assert.ok(renderers.length >= 2, 'znaleziono widoki stanowisk');
  const bad = [];
  for (const file of renderers) {
    for (const spec of importsOf(readFileSync(file, 'utf8'))) {
      if (/Renderer\.js$/.test(spec)) bad.push(`${posix(relative(ROOT, file))} → ${spec}`);
    }
  }
  assert.deepEqual(bad, [], `Wspólny kod widoków należy do osobnego modułu:\n${bad.join('\n')}`);
});
