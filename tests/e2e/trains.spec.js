import { test, expect } from '@playwright/test';
import { openShift, btn, advance } from './helpers.js';

test('zakładka „Pociągi”: pociąg na posterunku ze stanem, torem i czołem; sterowanie trybem jazdy i czołem po zatrzymaniu; „Stan” bez sekcji manewrów', async ({ page }) => {
  await openShift(page, 'szkolna', { params: { srk: 'E' } });
  const tab = page.locator('#panel-tabs button[data-tab=pociagi]');
  await expect(tab).toHaveText('Pociągi');
  await tab.click();
  await expect(page.locator('#trains')).toContainText('brak pociągów na posterunku');
  await advance(page, 30); // Lipno zgłasza 6101
  await btn(page, { kind: 'block', exit: 'W', btn: 'Poz' }).click();
  await btn(page, { kind: 'signal', id: 'A', color: 'green' }).click();
  await btn(page, { kind: 'signal', id: 'D1', color: 'green' }).click();
  // pociąg wjeżdża: karta pojawia się od razu (zdarzenie rozkładu), w ruchu bez przycisków sterowania
  const card = page.locator('#trains .train-card[data-nr="6101"]');
  const entered = () => page.evaluate(() => !!window.sim.traffic.timetable().find((x) => x.nr === 6101)?.train?.entered);
  for (let i = 0; i < 20 && !(await entered()); i++) await advance(page, 20);
  await expect(card).toBeVisible();
  await expect(card).toHaveClass(/moving/);
  await expect(card.locator('.train-state')).toContainText('jedzie');
  await expect(card.locator('.train-actions button')).toHaveCount(0);
  const stopped = () => page.evaluate(() => { const e = window.sim.traffic.timetable().find((x) => x.nr === 6101); return e.train.v === 0 && e.train.hasStopped; });
  for (let i = 0; i < 30 && !(await stopped()); i++) await advance(page, 10);
  await advance(page, 1);
  await expect(card).not.toHaveClass(/moving/);
  await expect(card.locator('.train-state')).toContainText(/postój|stoi/);
  await expect(card.locator('.train-state')).toContainText('tor 1');
  await expect(card.locator('.train-state')).toContainText('pociągowy');
  await expect(card.locator('.train-state .ic-front')).toHaveAttribute('data-dir', 'E'); // sylwetka lokomotywy zwrócona w prawo
  await expect(card.locator('.train-state .ic-mode')).toHaveAttribute('data-mode', 'train');
  expect(await card.locator('.train-state .ic-mode .lamp.on').count()).toBe(3); // Pc1: trzy światła
  await expect(card.locator('button[data-act=shunt]')).toHaveText('jazda manewrowa');
  // status rozkładu nie dubluje opisu stanu („postój, odjazd …” już zawiera „postój”); przyciski w standardzie panelu (.tb, 28 px jak „Nadaj”)
  const stateText = await card.locator('.train-state').textContent();
  expect((stateText.match(/postój|stoi/g) || []).length).toBe(1);
  const h = await card.locator('button[data-act=shunt]').evaluate((el) => el.getBoundingClientRect().height);
  await page.click('#panel-tabs button[data-tab=lacznosc]');
  const h2 = await page.locator('#comms-form button[type=submit]').evaluate((el) => el.getBoundingClientRect().height);
  expect(Math.round(h)).toBe(28); expect(Math.round(h2)).toBe(28);
  await page.click('#panel-tabs button[data-tab=pociagi]');
  // sterowanie: tryb manewrowy, zmiana czoła
  await card.locator('button[data-act=shunt]').click();
  expect(await page.evaluate(() => window.sim.traffic.timetable().find((x) => x.nr === 6101).train.mode)).toBe('shunt');
  await expect(card).toHaveClass(/shunt/);
  await expect(card.locator('.train-state')).toContainText('manewrowy');
  await expect(card.locator('.train-state .ic-mode')).toHaveAttribute('data-mode', 'shunt');
  expect(await card.locator('.train-state .ic-mode .lamp.on').count()).toBe(1); // manewry: jedno światło
  await expect(card.locator('button[data-act=train]')).toHaveText('jazda pociągowa');
  await card.locator('button[data-act=rev]').click();
  await expect(card.locator('.train-state .ic-front')).toHaveAttribute('data-dir', 'W');
  // „Stan” nie ma już sekcji Manewry
  await page.click('#panel-tabs button[data-tab=stan]');
  await expect(page.locator('#tab-stan')).not.toContainText('Manewry');
  expect(await page.locator('#tab-stan #shunt').count()).toBe(0);
});

test('strona nie przesuwa się ani nie odświeża gestem: touchmove poza przewijalną treścią jest blokowany, przewijanie panelu działa', async ({ page }) => {
  await openShift(page, 'szkolna');
  const html = await page.evaluate(() => [getComputedStyle(document.documentElement).overscrollBehaviorY, getComputedStyle(document.body).overflowY]);
  expect(html).toEqual(['none', 'hidden']);
  const gesture = (sel, dy) => page.evaluate(([sel, dy]) => {
    const el = document.querySelector(sel);
    const r = el.getBoundingClientRect();
    const mk = (type, y) => new TouchEvent(type, { bubbles: true, cancelable: true, touches: [new Touch({ identifier: 1, target: el, clientX: r.x + 10, clientY: y })] });
    el.dispatchEvent(mk('touchstart', r.y + 10));
    const mv = mk('touchmove', r.y + 10 + dy);
    el.dispatchEvent(mv);
    el.dispatchEvent(new TouchEvent('touchend', { bubbles: true, cancelable: true, touches: [] }));
    return mv.defaultPrevented;
  }, [sel, dy]);
  expect(await gesture('#topbar', 40)).toBe(true); // pasek górny: nic nie przewija → pull to refresh zablokowany
  expect(await gesture('#topbar', -40)).toBe(true);
  // panel z długim rozkładem: w górę (treść w dół) przechodzi, w dół na samej górze – blokowany (to byłby bounce)
  await page.click('#panel-tabs button[data-tab=rj]');
  const scrollable = await page.evaluate(() => { const s = document.getElementById('tab-rj'); return s.scrollHeight > s.clientHeight + 1; });
  expect(scrollable).toBe(true);
  expect(await gesture('#tab-rj table', -40)).toBe(false);
  expect(await gesture('#tab-rj table', 40)).toBe(true);
});
