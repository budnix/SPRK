import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setHtmlIfChanged } from '../src/ui/dom.js';

test('setHtmlIfChanged: ta sama treść nie rusza DOM (przyciski zostają), inna – przebudowuje', () => {
  let writes = 0;
  const host = { dataset: {}, set innerHTML(v) { writes++; this._html = v; }, get innerHTML() { return this._html; } };
  assert.equal(setHtmlIfChanged(host, '<b>a</b>'), true);
  assert.equal(setHtmlIfChanged(host, '<b>a</b>'), false);
  assert.equal(setHtmlIfChanged(host, '<b>a</b>'), false);
  assert.equal(writes, 1, 'jedna podmiana mimo trzech wywołań');
  assert.equal(setHtmlIfChanged(host, '<b>b</b>'), true);
  assert.equal(writes, 2); assert.equal(host.innerHTML, '<b>b</b>');
});

test('escapeHtml: znaki HTML i cudzysłów zamienione, null i liczby bezpieczne', async () => {
  const { escapeHtml } = await import('../src/ui/dom.js');
  assert.equal(escapeHtml('<b a="1">Tom & Jerry</b>'), '&lt;b a=&quot;1&quot;&gt;Tom &amp; Jerry&lt;/b&gt;');
  assert.equal(escapeHtml(null), ''); assert.equal(escapeHtml(undefined), ''); assert.equal(escapeHtml(5), '5');
});
