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
  await page.click('#btn-menu'); await page.click('#menu-settings');
  await expect(page.locator('#zoom-fit-h')).toBeHidden(); // przycisk „wysokość” tylko przy włączonych polach
  await page.check('#settings input[name=edgePanels][value=on]');
  await page.keyboard.press('Escape');
  await expect(left).toBeVisible(); await expect(right).toBeVisible();
  await expect(page.locator('#zoom-fit-h')).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('sprk.settings')).edgePanels)).toBe('on'); // zapamiętane
  const scroll = await page.locator('#desk-scroll').evaluate((s) => { const r = s.getBoundingClientRect(); return { x: r.x + s.clientLeft, y: r.y + s.clientTop, w: s.clientWidth, h: s.clientHeight }; });
  const l = await box(left), r = await box(right);
  expect(Math.abs(l.x - scroll.x)).toBeLessThan(0.5); // dokładnie przy lewej krawędzi widocznego obszaru
  expect(Math.abs(r.x + r.width - (scroll.x + scroll.w))).toBeLessThan(0.5); // i przy prawej (bez paska przewijania)
  expect(l.width).toBeGreaterThan(30); expect(l.width).toBeLessThan(scroll.w * 0.3);
  // pixel perfect: ten sam punkt rysunku (strzałka szlaku GD2) ma na polu i na pulpicie tę samą wysokość,
  // a przy przewinięciu 0 także tę samą pozycję poziomą (pole zlewa się z pulpitem pod nim)
  await page.evaluate(() => { document.getElementById('desk-scroll').scrollLeft = 0; });
  const same = await page.evaluate(() => {
    const hit = document.querySelector(`#desk .hit[data-ref*='"id":"kGD2"']`);
    const svg = hit.ownerSVGElement, panel = document.querySelector('.edge-panel.left');
    const bb = hit.getBBox();
    const m = svg.getScreenCTM().inverse().multiply(hit.getScreenCTM());
    const u = new DOMPoint(bb.x + bb.width / 2, bb.y + bb.height / 2).matrixTransform(m);
    const onDesk = u.matrixTransform(svg.getScreenCTM()), onPanel = u.matrixTransform(panel.getScreenCTM());
    const d = document.getElementById('desk').getBoundingClientRect(), pr = panel.getBoundingClientRect();
    return { dx: onPanel.x - onDesk.x, dy: onPanel.y - onDesk.y, top: pr.top - d.top, h: pr.height - d.height };
  });
  expect(Math.abs(same.dy)).toBeLessThan(0.5);
  expect(Math.abs(same.dx)).toBeLessThan(0.5);
  expect(Math.abs(same.top)).toBeLessThan(0.5);
  expect(Math.abs(same.h)).toBeLessThan(0.5);
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
  // „dopasuj” = do szerokości: pulpit mieści się na szerokość, pola znikają
  await page.click('#zoom-fit');
  await expect(left).toBeHidden(); await expect(right).toBeHidden();
  const sc = await page.locator('#desk-scroll').evaluate((s) => ({ w: s.clientWidth, h: s.clientHeight }));
  const d1 = await box(page.locator('#desk'));
  expect(Math.abs(d1.width - (sc.w - 8))).toBeLessThan(3);
  // „wysokość” = wypełnia okno w pionie: pulpit szerszy niż okno, pola przypięte, środek na środku
  await page.click('#zoom-fit-h');
  const d2 = await box(page.locator('#desk'));
  expect(Math.abs(d2.height - (sc.h - 8))).toBeLessThan(3);
  expect(d2.width).toBeGreaterThan(sc.w);
  await expect(left).toBeVisible(); await expect(right).toBeVisible();
  const sl = await page.locator('#desk-scroll').evaluate((s) => s.scrollLeft / Math.max(1, s.scrollWidth - s.clientWidth));
  expect(sl).toBeGreaterThan(0.4); expect(sl).toBeLessThan(0.6);
  // rozwinięcie panelu (test startuje ze zwiniętym): mniej miejsca w pionie – ten sam tryb („wysokość”) dopasowany na nowo, nie „całość”
  await page.click('#side-toggle');
  await page.waitForTimeout(150);
  const sc2 = await page.locator('#desk-scroll').evaluate((s) => ({ w: s.clientWidth, h: s.clientHeight }));
  expect(sc2.h).toBeLessThan(sc.h); // panel na dole dostał miejsce (dawniej powiększony pulpit wypychał go poza okno)
  const d3 = await box(page.locator('#desk'));
  expect(Math.abs(d3.height - (sc2.h - 8))).toBeLessThan(3);
  expect(d3.width).toBeGreaterThan(sc2.w);
  // kliknięcie zakładek przy rozwiniętym panelu nie zmienia widoku (dawniej resetowało do „całość”)
  await page.click('#panel-tabs button[data-tab=log]');
  await page.click('#panel-tabs button[data-tab=rj]');
  await page.waitForTimeout(150);
  const d4 = await box(page.locator('#desk'));
  expect(Math.abs(d4.height - d3.height)).toBeLessThan(1);
  expect(Math.abs(d4.width - d3.width)).toBeLessThan(1);
});

test('pulpit kostkowy: pola skrajne z kostkami blokady; naciśnięcie Wbl przez pole wysyła żądanie jak z pulpitu', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 700 });
  await openShift(page, 'szkolna', { settings: { sideCollapsed: true, edgePanels: 'on' }, params: { scenariusz: 'zmiana-e' } });
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
