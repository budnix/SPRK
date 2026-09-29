import { test, expect } from '@playwright/test';
import { openShift, advance } from './helpers.js';

/* Zwrotnica bez kontroli: zakładka Urządzenia → „Zabezpiecz na miejscu” (polecenie dla pracownika, wspólne dla stanowisk). */
test('zwrotnica bez kontroli: zabezpieczenie na miejscu z zakładki Urządzenia, gotowe po czasie, zdjęcie', async ({ page }) => {
  await openShift(page, 'szkolna', { params: { scenariusz: 'zmiana-e' } });
  await page.evaluate(() => {
    const s = window.sim; s.ilk.points.get('Zw1').faultUntil = s.clock.time + 3600;
    s.execute({ type: 'point', id: 'Zw1' });
  });
  await advance(page, 10);
  const point = () => page.evaluate(() => { const p = window.sim.ilk.points.get('Zw1'); return { control: p.control, secured: p.secured, securing: !!p.securing }; });
  expect(await point()).toEqual({ control: false, secured: false, securing: false });
  await page.click('#panel-tabs button[data-tab=stan]');
  const row = page.locator('#points-onsite .point-onsite', { hasText: 'Zwrotnica Zw1' });
  await expect(row).toContainText('brak kontroli położenia');
  await row.locator('button', { hasText: 'Zabezpiecz na miejscu' }).click();
  expect(await point()).toEqual({ control: false, secured: false, securing: true });
  await expect(row).toContainText('pracownik zabezpiecza');
  await advance(page, 190);
  await page.waitForTimeout(700); // odświeżanie panelu jest dławione (500 ms)
  expect(await point()).toEqual({ control: false, secured: true, securing: false });
  await expect(row).toContainText('zabezpieczona na miejscu');
  await row.locator('button', { hasText: 'Zdejmij zabezpieczenie' }).click();
  expect((await point()).secured).toBe(false);
});
