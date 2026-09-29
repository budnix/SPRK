import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * Spójność wyglądu interfejsu: kolory, promienie i warstwy przez zmienne CSS, oba motywy mają komplet barw,
 * bez martwych reguł. Barwy pulpitu kostkowego i monitora (wygląd urządzeń, Ie-104) są poza tym testem.
 */
const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
/** Reguły najniższego poziomu: [selektor, deklaracje] (także wewnątrz @media). */
const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => [m[1].trim(), m[2].trim()]);
const decls = (body) => body.split(';').map((d) => d.trim()).filter(Boolean).map((d) => { const i = d.indexOf(':'); return [d.slice(0, i).trim(), d.slice(i + 1).trim()]; });
const block = (selector) => Object.fromEntries(rules.filter(([s]) => s === selector).flatMap(([, b]) => decls(b)));

test('warstwy (z-index) i promienie (border-radius) tylko ze zmiennych', () => {
  const bad = [];
  for (const [sel, body] of rules) {
    for (const [prop, value] of decls(body)) {
      if (prop === 'z-index' && !/^var\(--z-[\w-]+\)$/.test(value)) bad.push(`${sel} { z-index: ${value} }`);
      if (prop === 'border-radius' && !value.split(/\s+/).every((v) => /^(var\(--radius[\w-]*\)|0|50%)$/.test(v))) bad.push(`${sel} { border-radius: ${value} }`);
    }
  }
  assert.deepEqual(bad, []);
});

test('każda warstwa ma własną wartość, ekrany pełne leżą nad menu i dymkami', () => {
  const root = block(':root');
  const z = Object.fromEntries(Object.entries(root).filter(([k]) => k.startsWith('--z-')).map(([k, v]) => [k, Number(v)]));
  const values = Object.values(z);
  assert.ok(values.length >= 8);
  assert.equal(new Set(values).size, values.length, 'powtórzona wartość z-index');
  for (const screen of ['--z-help', '--z-report', '--z-settings', '--z-start']) {
    assert.ok(z[screen] > z['--z-menu'], `${screen} nad menu`);
    assert.ok(z[screen] > z['--z-tutorial'], `${screen} nad samouczkiem`);
  }
  assert.ok(z['--z-start'] > z['--z-report'] && z['--z-start'] > z['--z-settings']);
});

test('motyw jasny ma komplet barw interfejsu (także ekranów pełnych)', () => {
  const dark = block(':root'), light = block(':root[data-theme="light"]');
  // barwy urządzeń (pulpit, monitor) i wartości niezależne od motywu
  const themed = Object.keys(dark).filter((k) => !/^--(desk|slit|joint|mon|z|radius|font|ctl|sc-thumb)/.test(k));
  assert.ok(themed.includes('--sc-bg') && themed.includes('--bg'));
  const missing = themed.filter((k) => !(k in light));
  assert.deepEqual(missing, []);
  assert.notEqual(light['--sc-bg'], dark['--sc-bg']);
});

test('interfejs nie ma barw wpisanych na sztywno', () => {
  const UI = /(^|[\s,>+~(])(\.(st|rp|se|tut|help|task|order|cmd)-|\.train-card\b|\.(report|start|settings|help)-screen|\.scr-(cmdbar|menu|confirm|cmdinfo)|\.(menu|modal|tb|badge|alert|logo|status|hint|tool-group|panel-tabs|edge-panel)\b|#(topbar|desk-tools|desk-tabs|side|start|report|settings|help)\b)/;
  const bad = [];
  for (const [sel, body] of rules) {
    if (sel.startsWith(':root') || !UI.test(sel)) continue;
    for (const [prop, value] of decls(body)) {
      if (prop.startsWith('--')) continue;
      if (/#[0-9a-f]{3,8}\b|rgba?\(/i.test(value)) bad.push(`${sel} { ${prop}: ${value} }`);
    }
  }
  assert.deepEqual(bad, []);
});

test('bez martwych reguł i z ograniczeniem animacji ozdobnych', () => {
  for (const dead of ['.tg-screens', '.modal-box.start', '.menu label', '.menu fieldset', '.menu legend', '.menu input']) {
    assert.ok(!rules.some(([s]) => s.includes(dead)), `martwa reguła ${dead}`);
  }
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /:focus-visible/);
});

// Ie-104.1 §4 ust. 17: miganie synchroniczne na całym obrazie monitora, 1 Hz, 50/50 – wspólna faza (klasa `ph`), bez
// osobnych animacji o różnych okresach i fazach (dawniej 0,5–1 s, każda animacja startowała osobno). Wyjątek: EBIScreen.
test('monitor: elementy obrazu migają wspólną fazą – bez własnych animacji', () => {
  const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
  const monitor = /\.(z-field|sig-body|blk-status|pt-label|sel-frame|wk-z|end-mark|blk-dir|exit-arrow|seg)\b/;
  const bad = [];
  for (const m of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    const [, sel, body] = m;
    if (!/animation\s*:/.test(body) || !monitor.test(sel) || /\.ebi\b|ebi-/.test(sel) || /\.bar\b|svg\.desk/.test(sel)) continue;
    bad.push(sel.trim());
  }
  assert.deepEqual(bad, []);
  assert.match(css, /svg\.screen\.ph [^{]*\.z-field\.nocontrol/);
});
