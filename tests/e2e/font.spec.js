import { test, expect } from '@playwright/test';
import { openShift } from './helpers.js';

/* Jedna czcionka aplikacji (Inter, dołączona do strony) – ten sam wygląd w każdym systemie */

const family = (page, selector) => page.evaluate((sel) => getComputedStyle(document.querySelector(sel)).fontFamily.split(',')[0].trim().replace(/["']/g, ''), selector);

test('czcionka aplikacji jest wczytana z pliku strony i używana w interfejsie, na monitorze i na pulpicie kostkowym', async ({ page }) => {
  const fonts = [];
  page.on('response', (r) => { if (/\.woff2(\?|$)/.test(r.url())) fonts.push({ url: r.url(), ok: r.ok() }); });
  await openShift(page, 'sopot');
  // plik czcionki pochodzi z tej samej strony (nie z zewnętrznego serwera) i obejmuje polskie znaki
  expect(fonts.length).toBeGreaterThan(0);
  for (const f of fonts) { expect(f.ok).toBe(true); expect(new URL(f.url).origin).toBe(new URL(page.url()).origin); }
  expect(await page.evaluate(() => document.fonts.check('600 14px Inter', 'Zażółć gęślą jaźń'))).toBe(true);
  for (const sel of ['body', '#btn-menu', '#clock', '.scr-cmdbar button', 'svg.screen', 'svg.screen text', '#side table.rj']) {
    expect(await family(page, sel), sel).toBe('Inter');
  }
  // kontrolki formularzy i ekrany pełne
  await page.click('#btn-menu'); await page.click('#menu-settings');
  for (const sel of ['#settings .se-select', '#settings .se-cat', '#settings .st-tagline']) expect(await family(page, sel), sel).toBe('Inter');

  await openShift(page, 'szkolna', { params: { scenariusz: 'zmiana-e' } });
  for (const sel of ['svg.desk', 'svg.desk text', 'svg.desk .counter-text']) expect(await family(page, sel), sel).toBe('Inter');
});
