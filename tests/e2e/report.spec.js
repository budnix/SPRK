import { test, expect } from '@playwright/test';
import { openShift } from './helpers.js';

/* Raport zmiany – pełny ekran w motywie ekranu startowego, po końcu zmiany i z menu w trakcie */

test('raport po końcu zmiany: ocena słowna bez gwiazdek, kafelki, tabela pociągów, zadania, zdarzenia; „Nowa zmiana…” otwiera ekran startowy', async ({ page }) => {
  await openShift(page, 'szkolna', { params: { scenariusz: 'zmiana' } });
  await expect(page.locator('#report')).toBeHidden();
  // rozkład w panelu: towarowy z oznaczeniem PKP PLK (TME), nie „TOW”; pociąg kończący bieg to osobowy (zespół trakcyjny)
  await page.click('#panel-tabs button[data-tab=rj]');
  const cats = await page.locator('table.rj tbody tr').evaluateAll((rows) => Object.fromEntries(rows.map((r) => { const c = r.querySelector('.cat'); return [r.querySelector('.nr').textContent.replace(c.textContent, '').trim(), c.textContent]; })));
  expect(cats['42101']).toBe('TME');
  expect(cats['90201']).toBe('R');
  expect(Object.values(cats)).not.toContain('TOW');
  const n = await page.evaluate(() => { window.sim.endShift('all-done'); return window.sim.traffic.timetable().length; });
  const rep = page.locator('#report');
  await expect(rep).toBeVisible();
  await expect(rep.locator('.st-tagline')).toHaveText('Raport zmiany');
  await expect(rep.locator('.st-sub')).toContainText('Szkolna');
  await expect(rep.locator('.rp-gword')).toHaveText(/wzorowo|dobrze|dostatecznie|niedostatecznie/);
  await expect(rep.locator('.rp-stars')).toHaveCount(0);
  await expect(rep.locator('.rp-grade')).not.toContainText('★');
  await expect(rep.locator('.rp-points')).toHaveText(/pkt$/);
  await expect(rep.locator('.rp-end')).toContainText('wszystkie pociągi obsłużone');
  expect(await rep.locator('.rp-tile').count()).toBeGreaterThanOrEqual(6);
  await expect(rep.locator('.rp-trains tbody tr')).toHaveCount(n);
  await expect(rep.locator('.rp-trains tbody tr').first().locator('.cat')).toBeVisible();
  // raport pokazuje etykietę kategorii (TME), a nie klucz z pliku stacji (TOW)
  expect(await rep.locator('.rp-trains tbody tr .cat').allTextContents()).toContain('TME');
  expect(await rep.locator('.rp-trains tbody tr .cat').allTextContents()).not.toContain('TOW');
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
