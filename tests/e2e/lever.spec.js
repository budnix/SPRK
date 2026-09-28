import { test, expect } from '@playwright/test';
import { openShift, simState, advance } from './helpers.js';

/* Nastawnia mechaniczna (Szkolna): plan świetlny, aparat blokowy, drążki przebiegowe, dźwignie nastawcze */

const ctl = (page, kind, id) => page.locator(`#desk .mech-ctl[data-ref='${JSON.stringify({ kind, id })}']`);
const open = (page) => openShift(page, 'szkolna', { params: { scenariusz: 'zmiana-mech' } });
const route = (page, id) => page.evaluate((r) => { const a = window.sim.ilk.active.get(r); return a ? { lever: a.lever, blocked: a.blocked, passed: a.passed } : null; }, id);

test('ława dźwigniowa: dźwignie z numerami i barwami wg rodzaju, drążki z celami przebiegów; na planie tylko przyciski blokady', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await open(page);
  await expect(page.locator('#desk svg.desk.mech')).toHaveCount(1);
  const levers = await page.locator('#desk .lever').evaluateAll((els) => els.map((g) => `${g.querySelector('.plate-text').textContent}:${g.dataset.lever}:${[...g.classList].find((c) => c.startsWith('lever-'))}`));
  expect(levers).toEqual(['1:Zw1:lever-point', '2:Zw3:lever-point', '3:Zw4:lever-point', '4:Wk1:lever-derailer', '5:A:lever-signal', '6:B:lever-signal',
    '7:C1:lever-signal', '8:C2:lever-signal', '9:D1:lever-signal', '10:D2:lever-signal', '11:Tm1:lever-shunt', '12:Tm2:lever-shunt']);
  // trzony: zwrotnicowe niebieskie, semaforowe czerwone (Ie-8 §6 ust. 4)
  const fill = (id) => page.locator(`#desk .lever[data-lever="${id}"] .lever-rod`).evaluate((e) => getComputedStyle(e).fill);
  expect(await fill('Zw1')).not.toEqual(await fill('A'));
  expect(await page.locator('#desk .drazek').evaluateAll((els) => els.map((g) => g.dataset.drazek))).toEqual(['a', 'b', 'c1', 'c2', 'd1', 'd2', 'd2m', 'tm1m', 'tm2m']);
  await expect(page.locator('#desk .blk-window')).toHaveCount(6); // blok przebiegowy – tylko przebiegi pociągowe
  const buttons = await page.locator('#desk .btn').evaluateAll((els) => [...new Set(els.map((e) => JSON.parse(e.dataset.ref).kind))]);
  expect(buttons).toEqual(['block']);
  await expect(page.locator('#hint')).toContainText('dźwignie zwrotnic');
  await page.click('#btn-help');
  await expect(page.locator('#help h2').first()).toContainText('nastawni mechanicznej');
  expect(errors).toEqual([]);
});

test('nastawnia mechaniczna: dźwignia zwrotnicy → drążek → blok → dźwignia sygnałowa; potem na „Stój”, zwalniacz liczy', async ({ page }) => {
  await open(page);
  const need = await page.evaluate(() => window.sim.ilk.routes.get('A-D2').points.find((q) => q.position === '-').id);
  // drążek przy złym położeniu zwrotnicy: odmowa, przebiegu nie ma
  await ctl(page, 'route', 'A-D2').click();
  expect(await route(page, 'A-D2')).toBe(null);
  await expect(page.locator('#status')).toContainText(need);
  // dźwignia zwrotnicowa: przełożona od razu, zwrotnica po 2 s
  await ctl(page, 'lever', need).click();
  await expect(page.locator(`#desk .lever[data-lever="${need}"]`)).toHaveClass(/down/);
  await advance(page, 3);
  expect((await simState(page)).points[need]).toBe('-');
  await ctl(page, 'route', 'A-D2').click();
  expect(await route(page, 'A-D2')).toEqual({ lever: false, blocked: false, passed: false });
  await expect(page.locator('#desk .drazek[data-drazek="a"] .drazek-down')).toHaveClass(/set/);
  await expect(page.locator(`#desk .lever[data-lever="${need}"] .lever-lock`)).toHaveClass(/on/);
  // dźwignia sygnałowa przed blokiem – odmowa; klawisz bloku – okienko białe; dźwignia – sygnał zezwalający
  await ctl(page, 'lever', 'A').click();
  expect((await simState(page)).signals.A).toBe('S1');
  await ctl(page, 'routeblock', 'A').click();
  await expect(page.locator('#desk .drazek[data-drazek="a"] .blk-window')).toHaveClass(/white/);
  await ctl(page, 'lever', 'A').click();
  expect((await simState(page)).signals.A).not.toBe('S1');
  await expect(page.locator('#desk .lever[data-lever="A"]')).toHaveClass(/down/);
  // z klawiatury: dźwignia na „Stój”
  await ctl(page, 'lever', 'A').focus();
  await page.keyboard.press('Enter');
  expect((await simState(page)).signals.A).toBe('S1');
  // drążek zamknięty blokiem – tylko zwalniacz (licznik)
  await ctl(page, 'route', 'A-D2').click();
  expect(await route(page, 'A-D2')).not.toBe(null);
  await ctl(page, 'routerelease', 'A').click();
  expect(await route(page, 'A-D2')).toBe(null);
  await expect(page.locator('#desk .counter-text').last()).toHaveText('00001');
  await expect(page.locator('#desk .drazek[data-drazek="a"] .blk-window')).not.toHaveClass(/white/);
});
