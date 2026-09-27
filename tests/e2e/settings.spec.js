import { test, expect } from '@playwright/test';
import { openShift } from './helpers.js';

/* Ekran ustawień: osobna strona z kategoriami i opisami, w motywie ekranu startowego */

test('menu ≡ ma tylko akcje; „Ustawienia…” otwiera pełny ekran z kategoriami, opisami i kontrolkami; wybór działa od razu i jest zapamiętany; Escape zamyka', async ({ page }) => {
  await openShift(page, 'sopot', { settings: { theme: 'dark' } });
  await page.click('#btn-menu');
  await expect(page.locator('#menu input')).toHaveCount(0); // ustawienia nie siedzą już w rozwijanym menu
  await expect(page.locator('#menu .menu-actions button')).toHaveCount(4);
  await page.click('#menu-settings');
  const se = page.locator('#settings');
  await expect(se).toBeVisible();
  await expect(se.locator('.st-tagline')).toHaveText('Ustawienia');
  await expect(se.locator('.se-cat')).toHaveCount(5);
  await expect(se.locator('.se-section')).toHaveCount(5);
  await expect(se.locator('.se-option')).toHaveCount(8);
  await expect(se.locator('.se-option[data-key=edgePanels] .se-desc')).toContainText('przypięte');
  await expect(se.locator('.se-option[data-key=srk] .se-tag')).toHaveText('przeładowuje widok');
  await expect(se.locator('input[name=theme][value=dark]')).toBeChecked();
  // kategoria po lewej przewija do sekcji i zaznacza się
  await se.locator('.se-cat[data-cat=panel]').click();
  await expect(se.locator('.se-cat[data-cat=panel]')).toHaveClass(/active/);
  // wybór działa natychmiast i zapisuje się
  await page.check('#settings input[name=theme][value=light]');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('sprk.settings')).theme)).toBe('light');
  // suwak symboli z wartością procentową
  await expect(se.locator('.se-range output')).toHaveText(/%$/);
  await page.keyboard.press('Escape');
  await expect(se).toBeHidden();
  await page.click('#btn-menu'); await page.click('#menu-settings');
  await se.locator('#se-close').click();
  await expect(se).toBeHidden();
});
