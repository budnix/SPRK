import { test, expect } from '@playwright/test';
import { openShift, simState, advance } from './helpers.js';

/* Stanowisko komputerowe MOR-3 (pulpit MOR-1): menu obiektów, przebieg kliknięciem celu, polecenia z potwierdzeniem,
   okno komunikatów i alarmów (Szkolna, zmiana-mor). */

const open = (page) => openShift(page, 'szkolna', { params: { scenariusz: 'zmiana-mor' } });
const hit = (page, kind, id) => page.locator(`#desk .hit[data-ref*='"kind":"${kind}","id":"${id}"']`).first();
const codes = (page) => page.locator('.mor-menu button').evaluateAll((b) => b.map((x) => x.dataset.code));

test('przebieg: kliknięcie semafora – fioletowa obwódka i menu, kliknięcie celu – „Pociąg”; zwrotnica z menu', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await open(page);
  await expect(page.locator('#desk svg.screen.mor')).toHaveCount(1);
  await expect(page.locator('#hint')).toContainText('kliknij obiekt');
  await hit(page, 'signal', 'A').click();
  await expect(page.locator('#desk .scr-el.signal.mor-sel')).toHaveCount(1);
  expect(await codes(page)).toEqual(['Stop', 'SZ']);
  await hit(page, 'signal', 'D1').click();
  expect(await codes(page)).toEqual(['Pociąg']);
  await expect(page.locator('#status')).toContainText('Przebieg A → D1');
  await page.locator('.mor-menu button[data-code="Pociąg"]').click();
  await advance(page, 8);
  expect((await simState(page)).active).toContain('A-D1');
  await expect(page.locator('#desk .mor-sel')).toHaveCount(0);
  // zwrotnica: Minus od razu, bez potwierdzenia
  await hit(page, 'point', 'Zw4').click();
  await page.locator('.mor-menu button[data-code="Minus"]').click();
  await advance(page, 6);
  expect((await simState(page)).points.Zw4).toBe('-');
  // komunikaty: polecenia w oknie pod obrazem
  await expect(page.locator('.mor-list')).toContainText('Pociąg A-D1');
  expect(errors).toEqual([]);
});

test('polecenie specjalne SZ: potwierdzenie, w tym czasie inne polecenia wstrzymane; licznik poleceń specjalnych', async ({ page }) => {
  await open(page);
  await hit(page, 'signal', 'B').click();
  await expect(page.locator('.mor-menu button[data-code="SZ"]')).toHaveClass(/special/);
  await page.locator('.mor-menu button[data-code="SZ"]').click();
  await expect(page.locator('.scr-confirm')).toBeVisible();
  await expect(page.locator('.scr-confirm')).toContainText('SZ B');
  expect((await simState(page)).signals.B).toBe('S1');
  await hit(page, 'point', 'Zw1').click();
  await expect(page.locator('.mor-menu')).toBeHidden(); // polecenie czeka – nowy wybór odrzucony
  await page.locator('.scr-confirm .tb.warn').click();
  expect((await simState(page)).signals.B).toBe('Sz');
  await expect(page.locator('.mor-counter b')).toHaveText('00001');
  // fioletowe oStop – potwierdzenie bez licznika
  await hit(page, 'signal', 'A').click();
  await page.locator('.mor-menu button[data-code="Stop"]').click();
  await hit(page, 'signal', 'A').click();
  await expect(page.locator('.mor-menu button[data-code="oStop"]')).toHaveClass(/confirm/);
  await page.locator('.mor-menu button[data-code="oStop"]').click();
  await page.locator('.scr-confirm .tb.warn').click();
  expect(await page.evaluate(() => window.sim.ilk.signals.get('A').stopped)).toBe(false);
  await expect(page.locator('.mor-counter b')).toHaveText('00001');
});

test('tablet: dotknięcie początku i dotknięcie celu (bez przeciągania) dają menu przebiegu', async ({ page }) => {
  await open(page);
  const tap = (loc) => loc.dispatchEvent('pointerdown', { bubbles: true, button: 0, pointerType: 'touch', clientX: 300, clientY: 300 });
  await tap(hit(page, 'signal', 'A'));
  await tap(hit(page, 'signal', 'D2'));
  expect(await codes(page)).toEqual(['Pociąg']);
  // tor jako cel przebiegu i obiekt poleceń (Zmk)
  await page.keyboard.press('Escape');
  const sec = await page.evaluate(() => window.sim.ilk.routes.get('A-D1').sections.at(-1));
  await tap(hit(page, 'signal', 'A'));
  await tap(hit(page, 'section', sec));
  expect(await codes(page)).toEqual(['Pociąg']);
});

test('alarm: przełącznik okna miga, dwuklik potwierdza (czerwony na niebieskim), po naprawie znika', async ({ page }) => {
  await open(page);
  await page.evaluate(() => { const s = window.sim; s.faults.list.push({ type: 'signal-fail', target: 'A', at: s.clock.time + 1, duration: 60 }); });
  await advance(page, 3);
  await expect(page.locator('.mor-tab[data-tab="alarms"].alarm')).toHaveCount(1);
  await page.locator('.mor-tab[data-tab="alarms"]').click();
  await expect(page.locator('.mor-alarm:not(.acked)')).toHaveCount(1);
  await page.locator('.mor-alarm').dblclick();
  await expect(page.locator('.mor-alarm.acked')).toHaveCount(1);
  await expect(page.locator('.mor-tab[data-tab="alarms"].alarm')).toHaveCount(0);
  await advance(page, 70);
  await expect(page.locator('.mor-alarm')).toHaveCount(0);
});

test('mysz: przeciągnięcie prawym klawiszem od semafora do celu daje menu przebiegu', async ({ page }) => {
  await open(page);
  const a = await hit(page, 'signal', 'A').boundingBox(), d = await hit(page, 'signal', 'D2').boundingBox();
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(d.x + d.width / 2, d.y + d.height / 2, { steps: 5 });
  await page.mouse.up({ button: 'right' });
  expect(await codes(page)).toEqual(['Pociąg']);
  expect(await page.evaluate(() => window.sim.input.armed.selection.map((r) => r.id))).toEqual(['A', 'D2']);
});
