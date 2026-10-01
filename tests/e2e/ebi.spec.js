import { test, expect } from '@playwright/test';
import { openShift, simState, advance } from './helpers.js';

/* Stanowisko komputerowe EBILock 950 (EBIScreen): linia poleceń, prawy klawisz – menu, „Wykonaj”, polecenia specjalne,
   okno zdarzeń i alarmów (Szkolna, zmiana-ebi). */

const open = (page, extra = {}) => openShift(page, 'szkolna', { params: { scenariusz: 'zmiana-ebi' }, ...extra });
const hit = (page, kind, id) => page.locator(`#desk .hit[data-ref*='"kind":"${kind}","id":"${id}"']`).first();

test('przebieg: lewy klawisz na początku, prawy na końcu, POC z menu do linii poleceń, dopiero „Wykonaj” nastawia', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await open(page);
  await expect(page.locator('#desk svg.screen.ebi')).toHaveCount(1);
  await hit(page, 'signal', 'A').click();
  await expect(page.locator('#status')).toContainText('Początek przebiegu A');
  await expect(page.locator('#desk .scr-el.signal.ebi-sel')).toHaveCount(1);
  await hit(page, 'signal', 'D1').click({ button: 'right' });
  await expect(page.locator('.ebi-menu')).toBeVisible();
  expect(await page.locator('.ebi-menu button').evaluateAll((b) => b.map((x) => x.dataset.code))).toEqual(['POC', 'PZA']);
  await page.locator('.ebi-menu button[data-code="POC"]').click();
  await expect(page.locator('#ebi-line')).toHaveValue('POC A D1');
  expect((await simState(page)).active.concat((await simState(page)).pending)).toEqual([]);
  await page.locator('.ebi-exec').click();
  await advance(page, 8);
  expect((await simState(page)).active).toContain('A-D1');
  await expect(page.locator('#ebi-line')).toHaveValue('');
  await expect(page.locator('#desk .ebi-sel')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('linia poleceń z klawiatury (F12, Enter); prawy klawisz na zwrotnicy – menu, ZWM; Wyczyść odznacza', async ({ page }) => {
  await open(page);
  await page.keyboard.press('F12');
  await expect(page.locator('#ebi-line')).toBeFocused();
  await page.keyboard.type('zwm Zw1');
  await page.keyboard.press('Enter');
  await advance(page, 6);
  expect((await simState(page)).points.Zw1).toBe('-');
  await hit(page, 'point', 'Zw1').click({ button: 'right' });
  expect(await page.locator('.ebi-menu button').evaluateAll((b) => b.map((x) => x.dataset.code))).toEqual(['ZWP', 'ZWM', 'ZWS', 'ZWO']);
  await page.locator('.ebi-menu button[data-code="ZWP"]').hover();
  await expect(page.locator('.ebi-info')).toContainText('przestawienie do położenia');
  await page.locator('.ebi-menu button[data-code="ZWP"]').click();
  await page.locator('.ebi-clear').click();
  await expect(page.locator('#ebi-line')).toHaveValue('');
  await expect(page.locator('#desk .ebi-sel')).toHaveCount(0);
  expect((await simState(page)).points.Zw1, 'bez „Wykonaj” zwrotnica stoi').toBe('-');
  // tor: prawy klawisz na linii toru – ITS
  const sec = await page.evaluate(() => window.sim.ilk.routes.get('A-D1').sections.find((x) => window.sim.ilk.sections.get(x).kind === 'station'));
  await hit(page, 'section', sec).dispatchEvent('pointerdown', { bubbles: true, button: 2, pointerType: 'mouse', clientX: 400, clientY: 300 });
  await page.locator('.ebi-menu button[data-code="ITS"]').click();
  await page.locator('.ebi-exec').click();
  expect(await page.evaluate((id) => window.sim.ilk.sections.get(id).closed, sec)).toBe(true);
});

test('tablet: krótkie dotknięcie sygnalizatora – początek, przytrzymanie końca – menu przebiegu', async ({ page }) => {
  await open(page);
  const touch = async (loc, hold) => {
    await loc.dispatchEvent('pointerdown', { bubbles: true, button: 0, pointerType: 'touch', clientX: 300, clientY: 300 });
    if (hold) await page.waitForTimeout(600);
    await loc.dispatchEvent('pointerup', { bubbles: true, button: 0, pointerType: 'touch', clientX: 300, clientY: 300 });
  };
  await touch(hit(page, 'signal', 'A'), false);
  expect(await page.evaluate(() => window.sim.input.armed?.selection.map((r) => r.id))).toEqual(['A']);
  await touch(hit(page, 'signal', 'D1'), true);
  await expect(page.locator('.ebi-menu')).toBeVisible();
  expect(await page.evaluate(() => window.sim.input.armed?.selection.map((r) => r.id))).toEqual(['A', 'D1']);
});

test('sygnał zastępczy: SZI markuje semafor czerwonym tłem, SZW po 5 s; okno zdarzeń i alarmów z potwierdzaniem', async ({ page }) => {
  await open(page, { params: { scenariusz: 'zmiana-ebi' } });
  await hit(page, 'signal', 'B').click({ button: 'right' });
  await page.locator('.ebi-menu button[data-code="SZI"]').click();
  await page.locator('.ebi-exec').click();
  await expect(page.locator('#desk .scr-el.signal.ebi-mark[data-mark="red"]')).toHaveCount(1);
  await expect(page.locator('.ebi-info')).toContainText('zamarkowany');
  await page.locator('#ebi-line').fill('SZW B');
  await page.locator('.ebi-exec').click();
  expect((await simState(page)).signals.B).toBe('S1'); // za wcześnie – odmowa
  await advance(page, 6);
  await page.locator('#ebi-line').fill('SZW B');
  await page.locator('.ebi-exec').click();
  expect((await simState(page)).signals.B).toBe('Sz');
  await expect(page.locator('#desk .ebi-mark')).toHaveCount(0);
  // usterka semafora – alarm: przycisk okna miga, alarm czerwony i niepotwierdzony, potem potwierdzony
  await page.evaluate(() => { const s = window.sim; s.faults.list.push({ type: 'signal-fail', target: 'A', at: s.clock.time + 1, duration: 60 }); });
  await advance(page, 3);
  await expect(page.locator('.ebi-log.alarm')).toHaveCount(1);
  await page.locator('.ebi-log').click();
  await expect(page.locator('.ebi-win')).toBeVisible();
  await expect(page.locator('.ebi-events')).toContainText('SZW B');
  await expect(page.locator('.ebi-alarm.unacked .sq.on')).toHaveCount(1);
  await page.locator('.ebi-win .ebi-ack-all').click();
  await expect(page.locator('.ebi-alarm.unacked')).toHaveCount(0);
  await expect(page.locator('.ebi-log.alarm')).toHaveCount(0);
  await page.locator('.ebi-win-close').click();
  await expect(page.locator('.ebi-win')).toBeHidden();
});
