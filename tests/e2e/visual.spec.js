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

test('wygląd pulpitu typu IZH-111 (Szkolna): przebieg utwierdzony, wybrany adres zwrotnicy, grupa rozkazów', async ({ page }) => {
  await openShift(page, 'szkolna', { settings: { sideCollapsed: true }, params: { scenariusz: 'zmiana-izh' } });
  await page.evaluate(() => {
    const s = window.sim;
    s.press({ kind: 'signal', id: 'A' }); s.press({ kind: 'signal', id: 'D2' }); s.press({ kind: 'order', id: 'P' });
    for (let i = 0; i < 20; i++) s.step(0.5);
    s.press({ kind: 'point', id: 'Zw4' });
  });
  await page.waitForTimeout(200);
  expect(await shot(page, '#desk', 1000, 640)).toMatchSnapshot('desk-izh-szkolna.png');
  expect(await shot(page, '.izh-orders', 1000, 38)).toMatchSnapshot('izh-orders.png');
});

test('wygląd nastawni mechanicznej (Szkolna): dźwignie przełożone, drążek, blok zablokowany, sygnał zezwalający', async ({ page }) => {
  await openShift(page, 'szkolna', { settings: { sideCollapsed: true }, params: { scenariusz: 'zmiana-mech' } });
  await page.evaluate(() => {
    const s = window.sim;
    s.clock.paused = false; // kroki symulacji idą tylko przy puszczonym zegarze
    const r = s.ilk.routes.get('A-D2');
    for (const q of [...r.points, ...r.flank]) s.execute({ type: 'point', id: q.id, position: q.position });
    for (let i = 0; i < 6; i++) s.step(0.5);
    s.execute({ type: 'route', id: 'A-D2' }); s.execute({ type: 'route-block', signal: 'A' }); s.execute({ type: 'clear', signal: 'A' });
    for (let i = 0; i < 4; i++) s.step(0.5);
    s.clock.paused = true;
    return { route: !!s.ilk.active.get('A-D2')?.lever, aspect: s.ilk.signals.get('A').aspect };
  }).then((st) => expect(st.route && st.aspect !== 'S1').toBe(true));
  await page.waitForTimeout(200);
  expect(await shot(page, '#desk', 1000, 640)).toMatchSnapshot('desk-mech-szkolna.png');
});
