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
