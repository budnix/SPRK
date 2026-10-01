import { test, expect } from '@playwright/test';
import { openShift, btn, pressBtn, simState, advance } from './helpers.js';

/* Pulpit urządzeń przekaźnikowych typu IZH-111 (Szkolna): przycisk adresowy + przycisk rozkazu, pulpit ciemny */

const A = (kind, id) => ({ kind, id });
const order = (page, id) => page.click(`.izh-orders button[data-order="${id}"]`);
const lit = (page, selector) => page.evaluate((sel) => [...document.querySelectorAll(sel)].filter((e) => e.classList.contains('on')).map((e) => [...e.classList].find((c) => c.startsWith('lamp-'))), selector);
const open = (page, extra = {}) => openShift(page, 'szkolna', { params: { scenariusz: 'zmiana-izh' }, ...extra });

test('IZH-111: grupa rozkazów nad planem, jeden czarny przycisk adresowy na element, bez przycisków grupowych typu E', async ({ page }) => {
  await open(page);
  await expect(page.locator('#desk svg.desk.izh')).toHaveCount(1);
  expect(await page.locator('.izh-orders button').evaluateAll((els) => els.map((e) => e.dataset.order))).toEqual(['P', 'M', '+', '-', 'STOP', 'Zw', 'Zcz', 'Sz']);
  await expect(page.locator('.izh-counter')).toHaveText('00000');
  const refs = await page.locator('svg.desk .btn').evaluateAll((els) => els.map((e) => JSON.parse(e.dataset.ref)));
  expect(refs.filter((r) => r.kind === 'group')).toEqual([]);
  expect(refs.filter((r) => r.kind === 'signal').every((r) => r.color === undefined)).toBe(true);
  expect(refs.filter((r) => r.kind === 'signal').map((r) => r.id).sort()).toEqual(['A', 'B', 'C1', 'C2', 'D1', 'D2', 'Tm1', 'Tm2']);
  const colours = await page.locator('svg.desk .btn').evaluateAll((els) => [...new Set(els.filter((e) => JSON.parse(e.dataset.ref).kind !== 'block').map((e) => [...e.classList].find((c) => c.startsWith('btn-'))))]);
  expect(colours).toEqual(['btn-black']);
  // instrukcja opisuje to stanowisko
  await page.click('#btn-help');
  await expect(page.locator('#help h2').first()).toContainText('IZH-111');
});

test('IZH-111: pulpit ciemny – lampki wygaszone w stanie zasadniczym; położenie zwrotnicy widać po wybraniu adresu', async ({ page }) => {
  await open(page);
  expect(await lit(page, 'svg.desk .bar, svg.desk .layer-tiles .t-signal .lamp, svg.desk .t-point .lamp')).toEqual([]);
  await expect(page.locator('svg.desk .t-signal .lamp')).toHaveCount(8 + 8 + 6); // zielona + biała na semaforach (6), biała na tarczach (2), lampki kontrolne (8)
  await pressBtn(page, A('point', 'Zw1'));
  await expect(btn(page, A('point', 'Zw1'))).toHaveClass(/armed/);
  expect(await lit(page, 'svg.desk .t-point .bar')).toEqual(['lamp-white']);
  await expect(page.locator('#status')).toContainText('Zw1');
  // ten sam adres drugi raz odwołuje wybór
  await pressBtn(page, A('point', 'Zw1'));
  expect(await lit(page, 'svg.desk .t-point .bar')).toEqual([]);
  expect((await simState(page)).armed).toBe(null);
});

test('IZH-111: przebieg adresami początku i końca z rozkazem P; STOP gasi; Zcz zwalnia po 120 s z migającą lampką', async ({ page }) => {
  await open(page);
  await pressBtn(page, A('signal', 'A'));
  await pressBtn(page, A('signal', 'D1'));
  await expect(page.locator('svg.desk .btn.armed')).toHaveCount(2);
  await expect(page.locator('#status')).toContainText('A → D1');
  await order(page, 'P');
  await expect(page.locator('svg.desk .btn.armed')).toHaveCount(0);
  await advance(page, 6);
  let st = await simState(page);
  expect(st.active).toContain('A-D1');
  expect(st.signals.A).not.toBe('S1');
  expect(await lit(page, 'svg.desk [data-tile] .lamp')).toContain('lamp-green');
  // sygnał zezwalający pokazuje tylko lampka powtarzacza – przycisk adresowy semafora nie świeci
  await expect(btn(page, A('signal', 'A'))).not.toHaveClass(/active/);
  await pressBtn(page, A('signal', 'D1'));
  await order(page, 'Zcz');
  st = await simState(page);
  expect(st.signals.A).toBe('S1');
  expect(st.active).toContain('A-D1');
  const ctl = await page.evaluate(() => window.desk.signalRefs.get('D1').ctl.getAttribute('class'));
  expect(ctl).toMatch(/on/); expect(ctl).toMatch(/blink/);
  await advance(page, 118);
  expect((await simState(page)).active).toContain('A-D1');
  await advance(page, 4);
  expect((await simState(page)).active).not.toContain('A-D1');
  expect(await page.evaluate(() => window.desk.signalRefs.get('D1').ctl.classList.contains('on'))).toBe(false);
});

test('IZH-111: zwrotnica rozkazem „−”, zamknięcie STOP z czerwoną lampką, Sz z licznikiem w grupie rozkazów, blokada', async ({ page }) => {
  await open(page);
  await pressBtn(page, A('point', 'Zw1'));
  await order(page, '-');
  await advance(page, 6);
  expect((await simState(page)).points.Zw1).toBe('-');
  await pressBtn(page, A('point', 'Zw1'));
  await order(page, 'STOP');
  expect(await page.evaluate(() => window.sim.ilk.points.get('Zw1').individualLock)).toBe(true);
  expect(await page.evaluate(() => window.desk.pointRefs.get('Zw1').lockLamp.getAttribute('class'))).toMatch(/on lamp-red/);
  expect(await lit(page, 'svg.desk .t-point .bar')).toEqual(['lamp-white']); // zamknięta zwrotnica pokazuje położenie na stałe
  await pressBtn(page, A('signal', 'B'));
  await order(page, 'Sz');
  expect((await simState(page)).signals.B).toBe('Sz');
  await expect(page.locator('.izh-counter')).toHaveText('00001');
  await pressBtn(page, { kind: 'block', exit: 'E', btn: 'Wbl' });
  expect(await page.evaluate(() => window.sim.blocks.get('E').request)).toBe('ours');
  // odmowa trafia do paska stanu
  await order(page, 'P');
  await expect(page.locator('#status')).toContainText('przycisk adresowy');
});

// JZH-111: STOP z adresem sygnalizatora zamyka go – lampka miga na czerwono, Zw odwołuje zamknięcie (bsk.isdr.pl).
test('IZH-111: STOP zamyka sygnalizator (czerwona migająca lampka), Zw odwołuje zamknięcie', async ({ page }) => {
  await open(page);
  await pressBtn(page, A('signal', 'A'));
  await order(page, 'STOP');
  expect(await page.evaluate(() => window.sim.ilk.signals.get('A').stopped)).toBe(true);
  const ctl = await page.evaluate(() => window.desk.signalRefs.get('A').ctl.getAttribute('class'));
  expect(ctl).toMatch(/lamp-red/); expect(ctl).toMatch(/blink/);
  await pressBtn(page, A('signal', 'A'));
  await order(page, 'Zw');
  expect(await page.evaluate(() => window.sim.ilk.signals.get('A').stopped)).toBe(false);
  expect(await page.evaluate(() => window.desk.signalRefs.get('A').ctl.classList.contains('on'))).toBe(false);
});
