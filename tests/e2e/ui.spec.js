import { test, expect } from '@playwright/test';
import { openShift } from './helpers.js';

/* Spójność interfejsu: ekrany pełne w obu motywach, wspólny układ okien, ikony SVG, dostępność */

test('zakładki ekranów nie są wymieniane przy ponownym planowaniu (start, zmiana rozmiaru okna) – przyciski zostają te same', async ({ page }) => {
  await openShift(page, 'gdynia-chylonia', { settings: { screens: 'auto', sideCollapsed: true } });
  const tabs = page.locator('#screen-tabs button');
  await expect(tabs).toHaveCount(4);
  await page.evaluate(() => { window.__tabs = [...document.querySelectorAll('#screen-tabs button')]; });
  // to samo okno: ponowne planowanie niczego nie zmienia
  await page.evaluate(() => window.dispatchEvent(new Event('resize')));
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => window.__tabs.every((b, i) => b.isConnected && b === document.querySelectorAll('#screen-tabs button')[i]))).toBe(true);
  // przełączenie ekranu zmienia tylko zaznaczenie
  await tabs.nth(2).click();
  await expect(tabs.nth(2)).toHaveClass(/active/);
  await expect(page.locator('#screen-tabs button.active')).toHaveCount(1);
  expect(await page.evaluate(() => window.__tabs.every((b) => b.isConnected))).toBe(true);
  // inna szerokość okna = inny podział = nowe zakładki
  await page.setViewportSize({ width: 900, height: 1024 });
  await expect.poll(() => page.evaluate(() => window.__tabs.some((b) => !b.isConnected))).toBe(true);
});
