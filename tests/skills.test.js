import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Skille projektu (`.claude/skills/<nazwa>/SKILL.md`) i `CLAUDE.md` to instrukcje dla sesji AI: listy kroków ze
 * ścieżkami plików, poleceniami i nazwami innych skilli. Instrukcja, która wskazuje nieistniejący plik albo polecenie,
 * prowadzi w ślepą uliczkę – ten test pilnuje, żeby zmiana nazwy w kodzie pociągała poprawkę instrukcji.
 */
const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const SKILLS = join(ROOT, '.claude', 'skills');
const names = readdirSync(SKILLS).filter((d) => existsSync(join(SKILLS, d, 'SKILL.md'))).sort();
const docs = [...names.map((n) => [`.claude/skills/${n}/SKILL.md`, readFileSync(join(SKILLS, n, 'SKILL.md'), 'utf8')]), ['CLAUDE.md', readFileSync(join(ROOT, 'CLAUDE.md'), 'utf8')]];
const scripts = Object.keys(JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).scripts);

/** Napisy w odwrotnych apostrofach (także w blokach kodu – każdy wiersz osobno). */
const quoted = (text) => [...text.matchAll(/`([^`\n]+)`/g)].map((m) => m[1]);
/** Ścieżka pliku projektu: zaczyna się od katalogu projektu, bez miejsc do wypełnienia (`<id>`, `*`, `…`) i odstępów. */
const isPath = (s) => /^(src|tests|docs|scripts|\.claude)\/[\w./-]+$/.test(s) || /^(README|CLAUDE)\.md$/.test(s);

test('skille projektu: nagłówek z nazwą równą katalogowi i opisem, kiedy użyć', () => {
  assert.deepEqual(names, ['diagnoza-zatoru', 'nowa-stacja', 'nowe-stanowisko', 'nowy-scenariusz', 'posterunek-na-mapie', 'zasada-ze-zrodla']);
  for (const [file, text] of docs.slice(0, -1)) {
    const head = /^---\nname: ([\w-]+)\ndescription: (.+)\n---\n/.exec(text);
    assert.ok(head, `${file}: nagłówek „name” / „description”`);
    assert.equal(`.claude/skills/${head[1]}/SKILL.md`, file);
    assert.match(head[2], /Użyj/, `${file}: opis mówi, kiedy użyć skilla`);
    assert.ok(text.split('\n').length < 200, `${file}: lista kroków, nie podręcznik`);
  }
});

test('skille projektu i CLAUDE.md: wymienione pliki, polecenia npm i skille istnieją', () => {
  for (const [file, text] of docs) {
    const missing = [];
    for (const q of quoted(text)) {
      if (isPath(q) && !existsSync(join(ROOT, q))) missing.push(q);
    }
    for (const m of text.matchAll(/npm run ([\w:-]+)/g)) if (!scripts.includes(m[1])) missing.push(`npm run ${m[1]}`);
    for (const m of text.matchAll(/node ((?:scripts|\.claude)\/[\w./-]+\.mjs)/g)) if (!existsSync(join(ROOT, m[1]))) missing.push(`node ${m[1]}`);
    for (const m of text.matchAll(/skill(?:u|a|em|e)? `([\w-]+)`/g)) if (!names.includes(m[1])) missing.push(`skill ${m[1]}`);
    assert.deepEqual(missing, [], `${file}: nieistniejące odwołania`);
  }
  // CLAUDE.md jest czytany w każdej sesji – to on kieruje do skilli
  const claude = docs.at(-1)[1];
  for (const n of names) assert.ok(claude.includes(`\`${n}\``), `CLAUDE.md nie wspomina skilla ${n}`);
});

test('skrypt diagnozy zatoru (stan zmiany w wybranej chwili): pociąg, sygnał przed nim, przebiegi z przeszkodami, blokada, usterki', () => {
  const run = (...args) => execFileSync(process.execPath, [join(SKILLS, 'diagnoza-zatoru', 'scripts', 'stan-zmiany.mjs'), ...args], { cwd: ROOT, encoding: 'utf8' });
  const out = run('sopot:usterka-gd', '--at', '06:40', '--seed', '1');
  assert.match(out, /^sopot:usterka-gd „Usterka blokady od Gdańska” ziarno 1, poziom none, chwila 06:40:00/);
  assert.match(out, /Pociąg 5100 IC 5100: na szlaku; GD1 → OR1, tor 2/);
  assert.match(out, /sygnał przed pociągiem: A \(obraz \w+, przebieg A-H\)/);
  assert.match(out, /przebieg A-H \(train\): signal-busy:A-H/);
  assert.match(out, /blokada szlaku OR1: \{"id":"OR1"/);
  assert.match(out, /Przebiegi nastawione: .*A-H/);
  assert.match(out, /Usterki czynne: block-fail GD2 od 06:40:00/);
  // służba o wybranej porze i jeden pociąg
  const duty = run('sopot', '--start', '19', '--minutes', '120', '--seed', '3', '--level', 'none', '--at', '19:30');
  assert.match(duty, /^sopot:sluzba-120 „Służba 19:00–21:00” ziarno 3, poziom none, chwila 19:30:00/);
  // ślad pociągu: wiersz przy każdej zmianie stanu od `--from` do `--at`, potem zrzut
  const trace = run('sopot:usterka-gd', '--at', '06:44', '--from', '06:38', '--train', '5100', '--seed', '1');
  assert.match(trace, /^Ślad pociągu 5100 od 06:38:0\d:\n {2}06:38:0\d {2}.*sygnał .*\| postój .*\| automat .*\| przebiegi .*\| usterki /);
  assert.ok(trace.split('\n').filter((l) => /^ {2}06:\d\d:\d\d {2}/.test(l)).length >= 3, 'kilka zmian stanu w śladzie');
  assert.match(trace, /\nsopot:usterka-gd .* chwila 06:44:00\n\nPociąg 5100 /);
});
