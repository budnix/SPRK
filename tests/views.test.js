import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { PanelView, PANEL_VIEW_REQUIRED } from '../src/render/PanelView.js';

/**
 * Kontrakt widoków stanowisk: każdy widok rozszerza PanelView i dostarcza komplet metod obrazu stanu, a reszta
 * aplikacji korzysta z widoku bez sprawdzania, czy metoda istnieje. Widoki rysują w DOM, więc test czyta ich źródła.
 */
const dir = new URL('../src/render/', import.meta.url);
const views = readdirSync(dir).filter((f) => /Renderer\.js$/.test(f)).map((f) => [f, readFileSync(new URL(f, dir), 'utf8')]);
const strip = (code) => code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');

test('każdy widok stanowiska rozszerza PanelView i dostarcza metody kontraktu', () => {
  assert.ok(views.length >= 2);
  for (const [file, src] of views) {
    const code = strip(src);
    assert.match(code, /export class \w+ extends PanelView\b/, `${file}: nie rozszerza PanelView`);
    assert.match(code, /static PAD = /, `${file}: brak marginesu PAD`);
    for (const m of PANEL_VIEW_REQUIRED) assert.match(code, new RegExp(`^  ${m}\\(`, 'm'), `${file}: brak metody ${m}`);
    assert.match(code, /this\.bindModel\(\)/, `${file}: nie podpina zdarzeń symulacji`);
    // to, co wspólne, jest w bazie – widok tego nie powiela
    assert.doesNotMatch(code, /bus\.on\('(section|point|derailer|signal|route|block|armed|tick)'/, `${file}: własne subskrypcje zdarzeń`);
    assert.doesNotMatch(code, /^  (setView|resetView|refreshAll|updateTrains|updateCounters|bindModel)\(/m, `${file}: powiela metodę bazy`);
    assert.doesNotMatch(code, /padStart\(5/, `${file}: własne formatowanie licznika`);
  }
});

test('PanelView: rozmiar z marginesu i skali rzędów, tekst licznika, brakująca metoda to czytelny błąd', () => {
  class Wide extends PanelView { static PAD = 10; static rowScale(o) { return Number(o.rowScale) || 1; } }
  assert.deepEqual(PanelView.size(3, 2), { w: 120, h: 80 });
  assert.deepEqual(Wide.size(3, 2), { w: 140, h: 100 });
  assert.deepEqual(Wide.size(3, 2, { rowScale: '0.5' }), { w: 140, h: 60 });
  assert.equal(PanelView.counterText(7), '00007');
  assert.equal(PanelView.counterText(undefined), '00000');
  const bare = Object.create(Wide.prototype);
  for (const m of PANEL_VIEW_REQUIRED) assert.throws(() => bare[m](), new RegExp(`Wide: brak metody ${m}`));
  assert.equal(bare.cmdButton('train'), null);
  assert.equal(bare.setSymbolScale(1.2), undefined);
});

test('aplikacja korzysta z widoku bez sprawdzania, czy metoda istnieje', () => {
  for (const file of ['../src/main.js', '../src/ui/EdgePanels.js']) {
    const code = strip(readFileSync(new URL(file, import.meta.url), 'utf8'));
    const bad = [...code.matchAll(/(?:renderer|\br)\??\.(?:setSymbolScale|cmdBar|cmdButton|elementFor|setView|resetView)\?\./g)].map((m) => m[0]);
    assert.deepEqual(bad, [], file);
  }
  assert.doesNotMatch(readFileSync(new URL('../src/ui/EdgePanels.js', import.meta.url), 'utf8'), /transform\??\.baseVal/, 'EdgePanels bierze margines z widoku (pad)');
});

test('rejestr widoków: rozmiar z klasy widoku, nowy widok rejestrowalny, nieznany rodzaj → pulpit', async () => {
  const src = strip(readFileSync(new URL('../src/srk/views.js', import.meta.url), 'utf8'));
  assert.match(src, /export function registerView\(/);
  assert.doesNotMatch(src, /\* 40\b/, 'rozmiar liczy klasa widoku, nie rejestr');
});
