import { test, expect } from '@playwright/test';
import { openShift } from './helpers.js';

/* Raport zmiany – pełny ekran w motywie ekranu startowego, po końcu zmiany i z menu w trakcie */

test('raport po końcu zmiany: ocena z gwiazdkami, kafelki, tabela pociągów, zadania, zdarzenia; „Nowa zmiana…” otwiera ekran startowy', async ({ page }) => {
  await openShift(page, 'szkolna', { params: { scenariusz: 'zmiana' } });
  await expect(page.locator('#report')).toBeHidden();
  const n = await page.evaluate(() => { window.sim.endShift('all-done'); return window.sim.traffic.timetable().length; });
  const rep = page.locator('#report');
  await expect(rep).toBeVisible();
  await expect(rep.locator('.st-tagline')).toHaveText('Raport zmiany');
  await expect(rep.locator('.st-sub')).toContainText('Szkolna');
  await expect(rep.locator('.rp-gword')).toHaveText(/wzorowo|dobrze|dostatecznie|niedostatecznie/);
  await expect(rep.locator('.rp-stars')).toHaveText(/★/);
  await expect(rep.locator('.rp-points')).toHaveText(/pkt$/);
  await expect(rep.locator('.rp-end')).toContainText('wszystkie pociągi obsłużone');
  expect(await rep.locator('.rp-tile').count()).toBeGreaterThanOrEqual(6);
  await expect(rep.locator('.rp-trains tbody tr')).toHaveCount(n);
  await expect(rep.locator('.rp-trains tbody tr').first().locator('.cat')).toBeVisible();
  await expect(rep.locator('.rp-tasks li')).toHaveCount(2);
  await expect(rep.locator('.rp-items')).toBeVisible();
  await expect(rep.locator('.rp-chip')).toHaveCount(await page.evaluate(() => window.sim.report().byCode.length));
  await page.click('#rp-new');
  await expect(rep).toBeHidden();
  await expect(page.locator('#start')).toBeVisible();
});

test('raport z menu w trakcie zmiany: „Stan oceny – zmiana trwa”, przycisk „Zamknij” wraca do pulpitu', async ({ page }) => {
  await openShift(page, 'szkolna', { params: { scenariusz: 'zmiana' } });
  await page.click('#btn-menu');
  await page.click('#menu-report');
  const rep = page.locator('#report');
  await expect(rep).toBeVisible();
  await expect(rep.locator('.st-tagline')).toContainText('zmiana trwa');
  await expect(rep.locator('.rp-end')).toContainText('Zmiana trwa');
  await rep.locator('.rp-actions .close').click();
  await expect(rep).toBeHidden();
});
