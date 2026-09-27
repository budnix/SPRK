import { test, expect } from '@playwright/test';
import { openShift } from './helpers.js';

/* Stałe pola skrajne z blokadą liniową: przypięte do krawędzi okna, gdy powiększony pulpit nie mieści się na szerokość */

const box = (loc) => loc.boundingBox();

test('monitor: po powiększeniu skrajne kolumny ze strzałkami szlaku są przypięte po obu stronach, środek się przewija; dotknięcie na polu otwiera menu szlaku; „dopasuj” chowa pola', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 700 });
  await openShift(page, 'sopot', { settings: { sideCollapsed: true, screens: 'off' } });
  const left = page.locator('.edge-panel.left'), right = page.locator('.edge-panel.right');
  await expect(left).toBeHidden(); // pulpit dopasowany do okna (1400 px mieści Sopot przy minimalnym powiększeniu) – bez pól
  for (let i = 0; i < 3; i++) await page.click('#zoom-in');
  await expect(left).toBeHidden(); // opcja domyślnie wyłączona
  await page.click('#btn-menu');
  await page.check('input[name=edgePanels][value=on]');
  await page.keyboard.press('Escape');
  await expect(left).toBeVisible(); await expect(right).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('sprk.settings')).edgePanels)).toBe('on'); // zapamiętane
  const scroll = await box(page.locator('#desk-scroll'));
  const l = await box(left), r = await box(right);
  expect(Math.abs(l.x - scroll.x)).toBeLessThan(10); // przy lewej krawędzi okna (padding 4 px)
  expect(Math.abs(r.x + r.width - (scroll.x + scroll.width - 4))).toBeLessThan(20); // prawa krawędź (minus ewentualny pasek przewijania)
  expect(l.width).toBeGreaterThan(30); expect(l.width).toBeLessThan(scroll.width * 0.3);
  // żywa kopia pulpitu: <use> wskazuje grupę aktywnego pulpitu; pole ma styl monitora
  const href = await left.locator('use').getAttribute('href');
  expect(href).toMatch(/^#desk-inner-/);
  await expect(left).toHaveClass(/screen/);
  // przewinięcie środka nie rusza pól
  await page.evaluate(() => { document.getElementById('desk-scroll').scrollLeft = 500; });
  await page.waitForTimeout(100);
  const l2 = await box(left), r2 = await box(right);
  expect(Math.abs(l2.x - l.x)).toBeLessThan(2); expect(Math.abs(r2.x - r.x)).toBeLessThan(2);
  // dotknięcie strzałki szlaku GD2 na lewym polu → menu blokady tego szlaku
  await page.evaluate(() => {
    const panel = document.querySelector('.edge-panel.left');
    const hit = document.querySelector(`#desk .hit[data-ref*='"id":"kGD2"']`);
    const svg = hit.ownerSVGElement;
    const bb = hit.getBBox();
    const m = svg.getScreenCTM().inverse().multiply(hit.getScreenCTM());
    const c = new DOMPoint(bb.x + bb.width / 2, bb.y + bb.height / 2).matrixTransform(m); // jednostki rysunku
    const p = c.matrixTransform(panel.getScreenCTM()); // punkt na ekranie w obrębie pola
    panel.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0, clientX: p.x, clientY: p.y, pointerId: 1, pointerType: 'touch', isPrimary: true }));
  });
  await expect(page.locator('.scr-menu')).toBeVisible();
  await expect(page.locator('.scr-menu h5')).toContainText('Szlak Gdańsk Oliwa – 202 t.2');
  await page.keyboard.press('Escape');
  await page.click('#zoom-fit');
  await expect(left).toBeHidden(); await expect(right).toBeHidden();
});

test('pulpit kostkowy: pola skrajne z kostkami blokady; naciśnięcie Wbl przez pole wysyła żądanie jak z pulpitu', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 700 });
  await openShift(page, 'szkolna', { settings: { sideCollapsed: true, srk: 'E', edgePanels: 'on' } });
  const right = page.locator('.edge-panel.right');
  for (let i = 0; i < 4; i++) await page.click('#zoom-in');
  await expect(right).toBeVisible();
  await expect(right).toHaveClass(/desk/);
  const ok = await page.evaluate(() => {
    const panel = document.querySelector('.edge-panel.right');
    const b = document.querySelector(`#desk .btn[data-ref*='"exit":"E","btn":"Wbl"']`);
    if (!b) return 'brak przycisku';
    const svg = b.ownerSVGElement; const bb = b.getBBox();
    const m = svg.getScreenCTM().inverse().multiply(b.getScreenCTM());
    const c = new DOMPoint(bb.x + bb.width / 2, bb.y + bb.height / 2).matrixTransform(m);
    const p = c.matrixTransform(panel.getScreenCTM());
    const init = { bubbles: true, cancelable: true, button: 0, clientX: p.x, clientY: p.y, pointerId: 1, pointerType: 'touch', isPrimary: true };
    panel.dispatchEvent(new PointerEvent('pointerdown', init));
    panel.dispatchEvent(new PointerEvent('pointerup', init));
    return 'ok';
  });
  expect(ok).toBe('ok');
  await expect.poll(() => page.evaluate(() => window.sim.blocks.get('E').request)).toBe('ours');
});
