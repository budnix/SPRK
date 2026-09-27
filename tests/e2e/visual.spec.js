import { test, expect } from '@playwright/test';
import { openShift } from './helpers.js';

/* Regresja wizualna: wzorce w tests/e2e/__screenshots__; aktualizacja: npm run test:e2e:update.
   Zrzuty mają stałe wymiary (wycinek strony od lewego górnego rogu elementu) – wysokość nagłówka różni się
   o piksel między środowiskami, a porównanie obrazów o różnych wymiarach zawsze pada. */

async function shot(page, selector, width, height) {
  const r = await page.locator(selector).boundingBox();
  return page.screenshot({ clip: { x: Math.round(r.x), y: Math.round(r.y), width, height } });
}

test('wygląd pulpitu kostkowego (Szkolna, typ E) po nastawieniu przebiegu', async ({ page }) => {
  await openShift(page, 'szkolna', { settings: { sideCollapsed: true }, params: { scenariusz: 'zmiana-e' } });
  await page.evaluate(() => { window.sim.press({ kind: 'signal', id: 'A', color: 'green' }); window.sim.press({ kind: 'signal', id: 'D1', color: 'green' }); for (let i = 0; i < 20; i++) window.sim.step(0.5); });
  await page.waitForTimeout(200);
  expect(await shot(page, '#desk', 1000, 640)).toMatchSnapshot('desk-szkolna.png');
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
  expect(await shot(page, '#desk', 1000, 640)).toMatchSnapshot('screen-sopot-zachod.png');
  expect(await shot(page, '#desk-tools', 1000, 40)).toMatchSnapshot('toolbar.png');
});
