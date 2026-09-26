import { test, expect } from '@playwright/test';
import { openShift } from './helpers.js';

/* Regresja wizualna: wzorce w tests/e2e/__screenshots__; aktualizacja: npm run test:e2e:update */

test('wygląd pulpitu kostkowego (Stare Pustkowie) po nastawieniu przebiegu', async ({ page }) => {
  await openShift(page, 'stare-pustkowie', { settings: { sideCollapsed: true } });
  await page.evaluate(() => { window.sim.press({ kind: 'signal', id: 'A', color: 'green' }); window.sim.press({ kind: 'signal', id: 'D1', color: 'green' }); for (let i = 0; i < 20; i++) window.sim.step(0.5); });
  await page.waitForTimeout(200);
  await expect(page.locator('#desk')).toHaveScreenshot('desk-stare-pustkowie.png');
});

test('wygląd monitora (Sopot, ekran zachodni) z przebiegiem pociągowym i manewrowym', async ({ page }) => {
  await openShift(page, 'sopot', { settings: { sideCollapsed: true, screens: 'auto' } });
  await page.evaluate(() => {
    const s = window.sim;
    s.press({ kind: 'signal', id: 'A', color: 'green' }); s.press({ kind: 'signal', id: 'H', color: 'green' });
    s.press({ kind: 'signal', id: 'L501', color: 'white' }); s.press({ kind: 'end', id: 'kT13' });
    for (let i = 0; i < 20; i++) s.step(0.5);
  });
  await page.waitForTimeout(200);
  await expect(page.locator('#desk')).toHaveScreenshot('screen-sopot-zachod.png');
  await expect(page.locator('#desk-tools')).toHaveScreenshot('toolbar.png');
});
