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

/**
 * Rola każdego katalogu w src/ – granice warstw sprawdza się po katalogach, więc nowy katalog musi tu trafić, inaczej
 * test przestałby go sprawdzać po cichu. Nowa funkcja (vertical slice) w logice: podkatalog katalogu logiki, np.
 * src/model/timetable/; widok tej funkcji – w src/render albo src/ui.
 */
const FOLDER_ROLES = {
  logic: [...LOGIC_DIRS, 'srk'],          // bez DOM, testowane w Node (srk/views.js – widok)
  view: ['render', 'ui', 'tutorial'],      // DOM, zmiany stanu tylko przez polecenia symulacji
  data: ['stations', 'i18n', 'data', 'fonts'], // definicje stacji, teksty, słownik, pliki czcionek
};

test('każdy katalog w src/ ma rolę w granicach warstw (logika, widok, dane) – nowy katalog trzeba tu przypisać', () => {
  const known = Object.values(FOLDER_ROLES).flat();
  const dirs = readdirSync(SRC).filter((name) => statSync(join(SRC, name)).isDirectory());
  assert.deepEqual(dirs.filter((d) => !known.includes(d)), [], 'katalog bez roli w tests/layers.test.js (FOLDER_ROLES)');
  assert.deepEqual(known.filter((d) => !dirs.includes(d)), [], 'rola dla katalogu, którego nie ma');
  assert.equal(new Set(known).size, known.length, 'katalog w dwóch rolach');
});

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
  const viewFiles = [...FOLDER_ROLES.view.flatMap((d) => walk(join(SRC, d))), join(SRC, 'main.js')];
  const WRITE = /\.(?:ilk|blocks\.get\([^)]*\))\??\.\w+\s*(?:=(?!=)|\+\+|--|[-+*/]=)/;
  const bad = [];
  for (const file of viewFiles) {
    const lines = stripped(readFileSync(file, 'utf8')).split('\n');
    lines.forEach((line, i) => { if (WRITE.test(line)) bad.push(`${posix(relative(ROOT, file))}:${i + 1}`); });
  }
  assert.deepEqual(bad, [], `Widok zmienia stan modelu wprost:\n${bad.join('\n')}`);
});

test('zapisu przebiegu w zależnościach nie czyta nikt poza zależnościami – inne moduły i narzędzia pytają o stan przebiegu', () => {
  // `Interlocking.active` / `pending` i pola zapisu przebiegu to implementacja zależności (docs/ARCHITECTURE.md,
  // „O stan przebiegu pyta się zależności”): routeState, routesSet, routeFrom, routeInfo, routeFaultDrop, routeFrame
  const walkAll = (dir) => readdirSync(dir).flatMap((name) => { const f = join(dir, name); return statSync(f).isDirectory() ? walkAll(f) : /\.(js|mjs)$/.test(name) ? [f] : []; });
  const files = [...walk(SRC), ...walkAll(join(ROOT, 'scripts')), ...walkAll(join(ROOT, '.claude', 'skills'))]
    .filter((f) => posix(relative(ROOT, f)) !== 'src/model/Interlocking.js');
  const RECORD = /\bilk\??\.(?:active|pending)\b|\.(?:trainEntered|signalOff|faultDrop|lockedSections|lockedPoints|lockedDerailers|timedRelease)\b/;
  const bad = [];
  for (const file of files) {
    const lines = stripped(readFileSync(file, 'utf8')).split('\n');
    lines.forEach((line, i) => { if (RECORD.test(line)) bad.push(`${posix(relative(ROOT, file))}:${i + 1}: ${line.trim().slice(0, 90)}`); });
  }
  assert.deepEqual(bad, [], `Zapis przebiegu czytany poza zależnościami – zapytaj o stan (Interlocking.routeState …):\n${bad.join('\n')}`);
  assert.ok(files.length > 80 && files.some((f) => f.endsWith('check-scenario.mjs')) && files.some((f) => f.endsWith('stan-zmiany.mjs')), 'test przegląda źródła, skrypty i skrypty skilli');
});

test('o etap pociągu pyta się kodu etapu – kod gry i narzędzi nie porównuje napisu dla człowieka (status)', () => {
  // napis etapu (`e.status`, po polsku) powstaje w src/model/timetable/phase.js i służy tylko do pokazania (CLAUDE.md:
  // działanie nie może zależeć od treści komunikatu); decyzje – na `e.phase`, `isHandled`, `isFinished`
  const walkAll = (dir) => readdirSync(dir).flatMap((name) => { const f = join(dir, name); return statSync(f).isDirectory() ? walkAll(f) : /\.(js|mjs)$/.test(name) ? [f] : []; });
  const files = [...walk(SRC), ...walkAll(join(ROOT, 'scripts')), ...walkAll(join(ROOT, '.claude', 'skills'))]
    .filter((f) => posix(relative(ROOT, f)) !== 'src/model/timetable/phase.js' && !posix(relative(ROOT, f)).startsWith('src/i18n/'));
  const TEXTS = ['oczekiwany', 'oczekuje na skład', 'żądanie pozwolenia', 'na szlaku', 'wjeżdża', 'jedzie', 'postój', 'na stacji', 'manewruje',
    'odjeżdża', 'odjechał', 'na następnym posterunku', 'zakończył bieg'];
  const literal = new RegExp(`(['"\`])(?:${TEXTS.join('|')})\\1|(['"\`])(?:przekazany|stoi przed)`);
  const compare = /\.status\s*[!=]==|\.status\??\.(?:startsWith|includes|endsWith|match)\(|\.test\([^)]*\.status\)/;
  const bad = [];
  for (const file of files) {
    const code = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
    code.split('\n').forEach((line, i) => {
      // polecenia dyżurnego (`c.status`: pending / done) i wyniki zmian automatu (`s.status`: ok / warn / error) to inne pola
      const own = line.replace(/\b(?:c|cmd|s|r|shift)\.status\s*[!=]==\s*'(?:pending|done|ok|warn|error)'/g, '');
      if (literal.test(own) || compare.test(own)) bad.push(`${posix(relative(ROOT, file))}:${i + 1}: ${line.trim().slice(0, 90)}`);
    });
  }
  assert.deepEqual(bad, [], `Decyzja na podstawie napisu etapu pociągu – użyj e.phase / isHandled / isFinished:\n${bad.join('\n')}`);
});

test('przebieg zmiany we wpisie rozkładu zmienia tylko ruch (Traffic) – inne moduły i narzędzia go czytają', () => {
  // wpis rozkładu (src/model/timetable/entry.js): definicja tylko do odczytu, plan i przebieg zmiany – zapis w Traffic
  const walkAll = (dir) => readdirSync(dir).flatMap((name) => { const f = join(dir, name); return statSync(f).isDirectory() ? walkAll(f) : /\.(js|mjs)$/.test(name) ? [f] : []; });
  const owners = new Set(['src/model/Traffic.js', 'src/model/timetable/entry.js', 'src/model/timetable/phase.js']);
  const files = [...walk(SRC), ...walkAll(join(ROOT, 'scripts')), ...walkAll(join(ROOT, '.claude', 'skills'))].filter((f) => !owners.has(posix(relative(ROOT, f))));
  const LIVE = ['phase', 'heldAt', 'handedTo', 'status', 'train', 'requested', 'dispatched', 'announced', 'delayIn', 'delay', 'actualArr', 'actualDep',
    'actualTrack', 'actualExit', 'attached', 'waitLogged', 'holdScored', 'stopCancelled', 'arrTime', 'depTime', 'neighbourDep', 'requestAt', 'rollingStock', 'extra'];
  // wpis rozkładu w kodzie to zwykle `e`, `entry`, `u` albo wynik timetable().find(…)
  const WRITE = new RegExp(`(?:\\b(?:e|entry|u)|\\.find\\([^)]*\\))\\.(?:${LIVE.join('|')})\\s*(?:=(?!=)|\\+=|-=|\\+\\+|--)`);
  const bad = [];
  for (const file of files) {
    stripped(readFileSync(file, 'utf8')).split('\n').forEach((line, i) => { if (WRITE.test(line)) bad.push(`${posix(relative(ROOT, file))}:${i + 1}: ${line.trim().slice(0, 90)}`); });
  }
  assert.deepEqual(bad, [], `Zapis przebiegu zmiany we wpisie rozkładu poza Traffic:\n${bad.join('\n')}`);
});

test('zależności w jedną stronę: źródła i skrypty nie importują niczego z tests/ (wspólna logika – src/model/check/, narzędzia – scripts/lib/)', () => {
  const walkAll = (dir) => readdirSync(dir).flatMap((name) => { const f = join(dir, name); return statSync(f).isDirectory() ? walkAll(f) : /\.(js|mjs)$/.test(name) ? [f] : []; });
  const files = [...walk(SRC), ...walkAll(join(ROOT, 'scripts')), ...walkAll(join(ROOT, '.claude', 'skills'))];
  const bad = [];
  for (const file of files) {
    const code = readFileSync(file, 'utf8');
    const specs = [...importsOf(code), ...[...code.matchAll(/root\((['"])([^'"]+)\1\)/g)].map((m) => `/${m[2]}`)];
    for (const spec of specs) {
      const target = spec.startsWith('/') ? spec.slice(1) : posix(relative(ROOT, resolve(dirname(file), spec)));
      if (target.startsWith('tests/')) bad.push(`${posix(relative(ROOT, file))} → ${target}`);
    }
  }
  assert.deepEqual(bad, [], `Import z tests/ w kodzie gry albo narzędzi:\n${bad.join('\n')}`);
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
