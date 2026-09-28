import { test, expect } from '@playwright/test';
import { openShift } from './helpers.js';

/* Spójność interfejsu: ekrany pełne w obu motywach, wspólny układ okien, ikony SVG, dostępność */

/** Jasność barwy tła elementu (0 = czerń, 1 = biel). */
const lightness = (page, selector, prop = 'backgroundColor') => page.evaluate(([sel, p]) => {
  const c = getComputedStyle(document.querySelector(sel))[p].match(/[\d.]+/g).map(Number);
  return (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255;
}, [selector, prop]);

const SCREENS = [['#help', '#menu-help'], ['#settings', '#menu-settings'], ['#report', '#menu-report'], ['#start', '#menu-new']];

for (const theme of ['light', 'dark']) {
  test(`ekrany pełne (instrukcja, ustawienia, raport, start) są w motywie interfejsu: ${theme}`, async ({ page }) => {
    await openShift(page, 'szkolna', { settings: { theme } });
    const app = await lightness(page, '#topbar');
    for (const [screen, item] of SCREENS) {
      await page.click('#btn-menu'); await page.click(item);
      await expect(page.locator(screen)).toBeVisible();
      const bg = await lightness(page, screen), text = await lightness(page, `${screen} .st-tagline`, 'color');
      if (theme === 'light') { expect(bg, screen).toBeGreaterThan(0.8); expect(text, screen).toBeLessThan(0.3); expect(app).toBeGreaterThan(0.8); }
      else { expect(bg, screen).toBeLessThan(0.2); expect(text, screen).toBeGreaterThan(0.7); expect(app).toBeLessThan(0.3); }
      await page.keyboard.press('Escape');
      await expect(page.locator(screen)).toBeHidden();
    }
  });
}

test('okna mają wspólny układ (nagłówek z logo, przycisk powrotu), role okna dialogowego i fokus', async ({ page }) => {
  await openShift(page, 'szkolna');
  for (const [screen, item] of SCREENS) {
    await page.click('#btn-menu'); await page.click(item);
    const s = page.locator(screen);
    await expect(s).toHaveAttribute('role', 'dialog');
    await expect(s).toHaveAttribute('aria-modal', 'true');
    expect((await s.getAttribute('aria-label')).length).toBeGreaterThan(3);
    await expect(s.locator('.st-hero .st-logo-svg')).toHaveCount(1);
    await expect(s.locator('.st-hero .st-tagline')).not.toBeEmpty();
    await expect(s.locator('.st-hero button.st-close')).toHaveCount(1);
    expect(await page.evaluate((sel) => document.querySelector(sel).contains(document.activeElement), screen), `${screen}: fokus w oknie`).toBe(true);
    await s.locator('.st-hero button.st-close').click();
    await expect(s).toBeHidden();
  }
  // raport leży nad rozwijanym menu
  const z = await page.evaluate(() => ['#menu', '#report', '#help', '#settings', '#start'].map((q) => Number(getComputedStyle(document.querySelector(q)).zIndex)));
  expect(new Set(z).size).toBe(z.length);
  for (const v of z.slice(1)) expect(v).toBeGreaterThan(z[0]);
});

test('przyciski paska i okien mają ikony SVG z opisem zamiast znaków tekstowych; pauza zmienia ikonę', async ({ page }) => {
  await openShift(page, 'szkolna', { params: { scenariusz: 'nauka-1' } });
  for (const sel of ['#btn-pause', '#btn-menu', '.tut-close']) {
    const b = page.locator(sel).first();
    await expect(b.locator('svg')).toHaveCount(1);
    expect((await b.textContent()).trim(), sel).toBe('');
    expect(((await b.getAttribute('aria-label')) || '').length, sel).toBeGreaterThan(2);
  }
  await page.locator('.tut-close').click();
  const pause = page.locator('#btn-pause');
  const before = await pause.locator('svg').getAttribute('data-icon');
  await pause.click();
  const after = await pause.locator('svg').getAttribute('data-icon');
  expect(new Set([before, after])).toEqual(new Set(['play', 'pause']));
  await expect(pause).toHaveAttribute('aria-pressed', after === 'play' ? 'true' : 'false');
  // przyciski listwy i panelu mają tę samą wysokość
  await page.click('#panel-tabs button[data-tab=rozkazy]');
  const h = await page.evaluate(() => ['#zoom-in', '#side-toggle', '#btn-pause', '#btn-menu', '#tab-rozkazy .tb'].map((q) => document.querySelector(q).getBoundingClientRect().height));
  expect(h.every((v) => v > 0)).toBe(true);
  expect(new Set(h).size).toBe(1);
});

test('ograniczenie ruchu w systemie wyłącza animacje ozdobne, miganie sygnałów zostaje', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openShift(page, 'szkolna', { params: { scenariusz: 'nauka-1' } });
  await page.locator('.tut-next').click(); await page.locator('.tut-next').click();
  const hl = page.locator('.tut-hl').first();
  await expect(hl).toHaveCount(1);
  expect(await hl.evaluate((e) => getComputedStyle(e).animationName)).toBe('none');
  expect(await page.evaluate(() => { const e = document.createElement('i'); e.className = 'blink'; document.body.appendChild(e); const a = getComputedStyle(e).animationName; e.remove(); return a; })).toBe('blink');
});

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

for (const [name, scenario, svgClass] of [['monitor', 'zmiana', 'screen'], ['pulpit kostkowy', 'zmiana-e', 'desk']]) {
  test(`widok stanowiska (${name}) spełnia kontrakt PanelView: rysunek, margines, wycinek, elementy obsługi, etykiety pociągów`, async ({ page }) => {
    await openShift(page, 'szkolna', { params: { scenariusz: scenario } });
    const v = await page.evaluate(() => {
      // klasa widoku i jej baza (nazwy klas znikają w zbudowanej paczce – liczy się, gdzie leżą metody)
      const d = window.desk; const view = Object.getPrototypeOf(d), base = Object.getPrototypeOf(view);
      const own = (o, list) => list.filter((m) => Object.prototype.hasOwnProperty.call(o, m));
      const chain = { depth: Object.getPrototypeOf(base) === Object.prototype ? 2 : 0, base: own(base, ['bindModel', 'refreshAll', 'updateTrains', 'setView']), view: own(view, ['updateSection', 'updateSignal', 'createTrainLabel', 'bindModel', 'refreshAll']) };
      const methods = ['setView', 'resetView', 'elementFor', 'refreshAll', 'cmdButton', 'setSymbolScale', 'updateTrains', 'bindModel'];
      const full = d.svg.getAttribute('viewBox');
      d.setView(2, 5); const part = d.svg.getAttribute('viewBox'); d.resetView();
      const pad = d.inner.transform.baseVal.getItem(0).matrix.e;
      return { chain, svgClass: d.svg.getAttribute('class'), missing: methods.filter((m) => typeof d[m] !== 'function'), full, part, back: d.svg.getAttribute('viewBox'), pad, ownPad: d.pad,
        size: d.constructor.size(d.cols, d.rows, { rowScale: d.ry }), signal: !!d.elementFor({ kind: 'signal', id: 'A' }), block: !!d.elementFor({ kind: 'blockpanel', exit: 'W' }),
        none: d.elementFor({ kind: 'point', id: 'nie-ma' }), cmd: !!d.cmdButton('train') };
    });
    expect(v.chain).toEqual({ depth: 2, base: ['bindModel', 'refreshAll', 'updateTrains', 'setView'], view: ['updateSection', 'updateSignal', 'createTrainLabel'] });
    expect(v.svgClass).toBe(svgClass);
    expect(v.missing).toEqual([]);
    expect(v.pad).toBe(v.ownPad);
    expect(v.full).toBe(`0 0 ${v.size.w} ${v.size.h}`);
    expect(v.part).toBe(`80 0 ${4 * 40 + 2 * v.pad} ${v.size.h}`);
    expect(v.back).toBe(v.full);
    expect(v.signal).toBe(true); expect(v.block).toBe(true); expect(v.none).toBe(null);
    expect(v.cmd).toBe(svgClass === 'screen');
    // etykieta pociągu pojawia się z pociągiem na planie i znika razem z nim
    await page.evaluate(() => { const s = window.sim; s.clock.paused = false; for (let i = 0; i < 4000 && !s.traffic.trains.some((t) => t.occupiedTiles().length); i++) { window.sim.press({ kind: 'block', exit: 'W', btn: 'Poz' }); s.step(0.5); } s.clock.paused = true; });
    const labels = await page.evaluate(() => ({ dom: document.querySelectorAll('#desk .layer-trains > g').length, map: window.desk.trainLabels.size, onPlan: window.sim.traffic.trains.filter((t) => t.occupiedTiles().length).length }));
    expect(labels.onPlan).toBeGreaterThan(0);
    expect(labels.dom).toBe(labels.onPlan); expect(labels.map).toBe(labels.onPlan);
  });
}

test('powiększenie pulpitu: tryb dopasowania wraca po zmianie okna, ręczne powiększenie zostaje; Ctrl + kółko trzyma punkt pod kursorem', async ({ page }) => {
  // mała stacja – dopasowanie do szerokości nie dochodzi do granic powiększenia
  await openShift(page, 'szkolna', { settings: { sideCollapsed: true } });
  const state = () => page.evaluate(() => { const d = document.getElementById('desk').getBoundingClientRect(), s = document.getElementById('desk-scroll'); return { w: d.width, h: d.height, cw: s.clientWidth, ch: s.clientHeight, left: s.scrollLeft, mode: window.viewport.fitMode, zoom: window.viewport.zoom }; });
  let st = await state();
  expect(st.mode).toBe('whole');
  expect(st.w).toBeLessThanOrEqual(st.cw); expect(st.h).toBeLessThanOrEqual(st.ch);
  await page.click('#zoom-fit');
  st = await state();
  expect(st.mode).toBe('width'); expect(Math.abs(st.w - (st.cw - 8))).toBeLessThan(1); expect(st.left).toBe(0);
  // zmiana okna: ten sam tryb, nowe powiększenie
  await page.setViewportSize({ width: 1100, height: 900 });
  await expect.poll(async () => { const s = await state(); return Math.abs(s.w - (s.cw - 8)) < 1 && s.cw < st.cw; }).toBe(true);
  expect((await state()).mode).toBe('width');
  // ręczne powiększenie: tryb dopasowania znika i nie wraca po zmianie okna
  await page.click('#zoom-in');
  const manual = await state();
  expect(manual.mode).toBe(null); expect(manual.zoom).toBeGreaterThan(st.zoom * 0.9);
  await page.setViewportSize({ width: 1200, height: 900 });
  await page.waitForTimeout(400);
  expect((await state()).zoom).toBe(manual.zoom);
  // Ctrl + kółko: punkt rysunku pod kursorem zostaje pod kursorem
  const at = { x: 300, y: 200 };
  const point = () => page.evaluate(([x, y]) => { const s = document.getElementById('desk-scroll'), v = window.viewport; return [(s.scrollLeft + x) / v.zoom, (s.scrollTop + y) / v.zoom]; }, [at.x, at.y]);
  await page.evaluate(() => { document.getElementById('desk-scroll').scrollLeft = 400; });
  const before = await point();
  await page.evaluate(([x, y]) => { const s = document.getElementById('desk-scroll'), r = s.getBoundingClientRect(); s.dispatchEvent(new WheelEvent('wheel', { deltaY: -40, ctrlKey: true, clientX: r.left + x, clientY: r.top + y, bubbles: true, cancelable: true })); }, [at.x, at.y]);
  const after = await point();
  expect((await state()).zoom).toBeGreaterThan(manual.zoom);
  expect(Math.abs(after[0] - before[0])).toBeLessThan(1.5);
});

test('ekran startowy: kartę posterunku wybiera się także z klawiatury (Enter, spacja)', async ({ page }) => {
  await openShift(page, 'szkolna');
  await page.click('#btn-menu'); await page.click('#menu-new');
  const card = page.locator('.st-card[data-id="sopot"]');
  await card.focus();
  await page.keyboard.press('Enter');
  await expect(card).toHaveClass(/active/);
  await expect(page.locator('#st-briefing .st-bname')).toHaveText('Sopot');
  const other = page.locator('.st-card[data-id="reda"]');
  await other.focus();
  await page.keyboard.press(' ');
  await expect(other).toHaveClass(/active/);
  await expect(card).not.toHaveClass(/active/);
});
