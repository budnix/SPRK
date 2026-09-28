import { test, expect } from '@playwright/test';
import { openShift, tap, advance, pressBtn } from './helpers.js';

/* Misje wprowadzające (samouczek) – stacja Szkolna */

test('ekran startowy: przycisk samouczka uruchamia misję 1 na stacji Szkolna', async ({ page }) => {
  await page.goto('/', { waitUntil: 'load' });
  await expect(page.locator('.st-mission').first()).toContainText('Misja 1');
  await page.click('.st-mission[data-scenario="nauka-1"]');
  // etap 2: odprawa misji po prawej – bez parametrów zmiany, z liczbą kroków i przyciskiem startu
  await expect(page.locator('#st-briefing .st-bname')).toContainText('Misja 1');
  await expect(page.locator('#st-briefing .st-bdiff')).toContainText('kroków');
  await expect(page.locator('.st-form')).toBeHidden();
  await expect(page.locator('#st-go')).toHaveText('Rozpocznij misję');
  await page.click('#st-go');
  await page.waitForURL(/stacja=szkolna.*scenariusz=nauka-1/);
  await expect(page.locator('.tut-box')).toBeVisible();
  await expect(page.locator('.tut-step')).toHaveText(/Krok 1\//);
});

test('misja 1: kroki informacyjne zatrzymują zegar, dymek wskazuje blokadę, Poz z menu zalicza krok, pasek poleceń podświetlony, słownik po kliknięciu skrótu', async ({ page }) => {
  await openShift(page, 'szkolna', { params: { scenariusz: 'nauka-1' } });
  await page.waitForFunction(() => window.tutorial);
  const box = page.locator('.tut-box');
  await expect(box).toBeVisible();
  await expect(box.locator('.tut-title')).toContainText('Witaj');
  expect(await page.evaluate(() => window.sim.clock.paused)).toBe(true);
  // słownik: kliknięcie skrótu otwiera dymek z definicją
  await box.locator('abbr[data-term="Eap"]').click();
  await expect(page.locator('.tut-gloss')).toBeVisible();
  await expect(page.locator('.tut-gloss')).toContainText('jednotorow');
  await page.locator('.tut-gloss').click(); // każde kliknięcie zamyka słownik
  await expect(page.locator('.tut-gloss')).toBeHidden();
  await box.locator('.tut-next').click();
  await box.locator('.tut-next').click();
  await expect(box.locator('.tut-title')).toContainText('Blokada liniowa');
  await expect(page.locator('.tut-hl')).toHaveCount(1); // pole blokady Lipno
  await box.locator('.tut-next').click();
  expect(await page.evaluate(() => window.sim.clock.paused)).toBe(false);
  await expect(box.locator('.tut-title')).toContainText('Danie pozwolenia');
  await advance(page, 3);
  expect(await page.evaluate(() => window.sim.blocks.get('W').request)).toBe('theirs');
  // Poz z menu elementu (pole blokady)
  await page.locator(`.hit[data-ref*='"id":"kW"']`).dispatchEvent('pointerdown', { bubbles: true, button: 0, clientX: 60, clientY: 200 });
  await page.click('.scr-menu button:has-text("(Poz)")');
  await expect(box.locator('.tut-title')).toContainText('Przebieg wjazdowy');
  await expect(page.locator('.scr-cmdbar button[data-cmd=train]')).toHaveClass(/tut-hl/);
  // zły tor → komunikat; właściwy przebieg → następny krok
  await page.click('.scr-cmdbar button[data-cmd=train]');
  await tap(page, 'A'); await tap(page, 'D2');
  await advance(page, 6);
  await expect(box.locator('.tut-feedback')).toContainText('tor 2');
  await page.click('.scr-cmdbar button[data-cmd=pz]'); await tap(page, 'A');
  await advance(page, 2);
  await page.click('.scr-cmdbar button[data-cmd=train]');
  await tap(page, 'A'); await tap(page, 'D1');
  await advance(page, 6);
  await expect(box.locator('.tut-title')).toContainText('Pociąg wjeżdża');
  await expect(box.locator('.tut-feedback')).toBeHidden();
  // pominięcie kroku i zakończenie samouczka
  await box.locator('.tut-skip').click();
  await expect(box.locator('.tut-title')).toContainText('Ko');
  await box.locator('.tut-close').click();
  await expect(box).toBeHidden();
  await expect(page.locator('.tut-hl')).toHaveCount(0);
});

test('misja 2: ta sama stacja na pulpicie kostkowym, dymek podświetla przycisk semafora, obsługa dwuprzyciskowa zalicza krok', async ({ page }) => {
  await openShift(page, 'szkolna', { params: { scenariusz: 'nauka-2', srk: 'komputerowe' } });
  await page.waitForFunction(() => window.tutorial);
  await expect(page.locator('#desk svg.desk')).toHaveCount(1); // scenariusz wymusza pulpit mimo parametru URL
  const box = page.locator('.tut-box');
  await expect(box.locator('.tut-body')).toContainText('dwuprzyciskowa');
  for (let i = 0; i < 3; i++) await box.locator('.tut-next').click();
  await advance(page, 3);
  await pressBtn(page, { kind: 'block', exit: 'W', btn: 'Poz' });
  await expect(box.locator('.tut-title')).toContainText('Przebieg wjazdowy');
  await expect(page.locator(`.btn[data-ref='{"kind":"signal","id":"A","color":"green"}']`)).toHaveClass(/tut-hl/);
  await pressBtn(page, { kind: 'signal', id: 'A', color: 'green' });
  await pressBtn(page, { kind: 'signal', id: 'D1', color: 'green' });
  await advance(page, 6);
  await expect(box.locator('.tut-title')).toContainText('Pociąg wjeżdża');
});

test('instrukcja zawiera słownik skrótów, a przyciski paska poleceń mają podpowiedzi', async ({ page }) => {
  await openShift(page, 'szkolna', { params: { scenariusz: 'zmiana' } });
  await expect(page.locator('.scr-cmdbar button[data-cmd=pz]')).toHaveAttribute('title', /zwolnienie przebiegu/i);
  await page.click('#btn-help');
  await expect(page.locator('#help dl.gloss')).toContainText('Poz – danie pozwolenia');
});

test('dymek samouczka nie zasłania wskazywanego elementu, da się przeciągnąć za nagłówek i zostaje na miejscu do następnego kroku', async ({ page }) => {
  await openShift(page, 'szkolna', { params: { scenariusz: 'nauka-1' } });
  await page.waitForFunction(() => window.tutorial);
  const box = page.locator('.tut-box');
  for (let i = 0; i < 3; i++) await box.locator('.tut-next').click();
  await advance(page, 3);
  // krok Poz: kotwica = strzałka szlaku Lipno; dymek nie nachodzi na nią
  const noOverlap = async () => page.evaluate(() => {
    const b = document.querySelector('.tut-box').getBoundingClientRect(), t = document.querySelector('.tut-hl').getBoundingClientRect();
    return b.right <= t.left || b.left >= t.right || b.bottom <= t.top || b.top >= t.bottom;
  });
  expect(await noOverlap()).toBe(true);
  // przeciągnięcie za nagłówek
  const head = box.locator('.tut-head');
  const h = await head.boundingBox();
  const before = await box.boundingBox();
  await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
  await page.mouse.down();
  await page.mouse.move(h.x + h.width / 2 + 200, h.y + h.height / 2 + 120, { steps: 8 });
  await page.mouse.up();
  const after = await box.boundingBox();
  expect(Math.round(after.x - before.x)).toBe(200);
  expect(Math.round(after.y - before.y)).toBe(120);
  await expect(box).toHaveAttribute('data-dragged', 'true');
  await advance(page, 2); // tick nie cofa ręcznego położenia
  const still = await box.boundingBox();
  expect(Math.round(still.x)).toBe(Math.round(after.x));
  // następny krok wraca do automatycznego położenia
  await page.locator(`.hit[data-ref*='"id":"kW"']`).dispatchEvent('pointerdown', { bubbles: true, button: 0, clientX: 60, clientY: 200 });
  await page.click('.scr-menu button:has-text("(Poz)")');
  await expect(box.locator('.tut-title')).toContainText('Przebieg wjazdowy');
  await expect(box).not.toHaveAttribute('data-dragged', 'true');
  expect(await noOverlap()).toBe(true);
  // słownik też da się przesunąć
  await box.locator('abbr[data-term]').first().click();
  const g = page.locator('.tut-gloss');
  const gb = await g.boundingBox();
  await page.mouse.move(gb.x + 20, gb.y + 8); await page.mouse.down(); await page.mouse.move(gb.x + 120, gb.y + 60, { steps: 5 }); await page.mouse.up();
  const gb2 = await g.boundingBox();
  expect(Math.round(gb2.x - gb.x)).toBe(100);
});

test('ekran startowy otwarty z menu w trakcie misji leży nad dymkami samouczka', async ({ page }) => {
  await openShift(page, 'szkolna', { params: { scenariusz: 'nauka-1' } });
  await page.waitForFunction(() => window.tutorial);
  await expect(page.locator('.tut-box')).toBeVisible();
  await page.click('#btn-menu');
  await page.click('#menu-new');
  await expect(page.locator('#start')).toBeVisible();
  // element na wierzchu w miejscu dymka to ekran startowy, nie dymek
  const top = await page.evaluate(() => { const r = document.querySelector('.tut-box').getBoundingClientRect(); const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!el?.closest('#start'); });
  expect(top).toBe(true);
  await page.click('#st-close');
  await expect(page.locator('#start')).toBeHidden();
});

test('misja: zmiana nie kończy się sama (raport dopiero po ostatnim kroku); zamknięcie samouczka przywraca automatyczny koniec', async ({ page }) => {
  await openShift(page, 'szkolna', { params: { scenariusz: 'nauka-2' } });
  expect(await page.evaluate(() => window.sim.autoEnd)).toBe(false);
  await page.click('.tut-close');
  expect(await page.evaluate(() => window.sim.autoEnd)).toBe(true);
  await expect(page.locator('.tut-box')).toBeHidden();
});

test('misja 3: pulpit typu IZH-111 – dymek wskazuje przycisk adresowy semafora, adres + adres + rozkaz P zalicza krok, zły tor daje podpowiedź z Zcz', async ({ page }) => {
  await page.goto('/', { waitUntil: 'load' });
  await expect(page.locator('.st-mission')).toHaveCount(3);
  await page.click('.st-mission[data-scenario="nauka-3"]');
  await expect(page.locator('#st-briefing .st-bname')).toContainText('Misja 3');
  await page.click('#st-go');
  await page.waitForURL(/stacja=szkolna.*scenariusz=nauka-3/);
  await page.waitForFunction(() => window.tutorial && window.sim);
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator('#desk svg.desk.izh')).toHaveCount(1);
  const box = page.locator('.tut-box');
  await expect(box.locator('.tut-body')).toContainText('IZH-111');
  // słownik zna pojęcia tego pulpitu
  await box.locator('abbr[data-term="przycisk adresowy"]').click();
  await expect(page.locator('.tut-gloss')).toContainText('wybiera ten element');
  await page.locator('.tut-gloss').click();
  await box.locator('.tut-next').click();
  await expect(box.locator('.tut-body')).toContainText('ciemny powtarzacz oznacza');
  for (let i = 0; i < 2; i++) await box.locator('.tut-next').click();
  await advance(page, 3);
  await pressBtn(page, { kind: 'block', exit: 'W', btn: 'Poz' });
  await expect(box.locator('.tut-title')).toContainText('Przebieg wjazdowy');
  await expect(box.locator('.tut-body')).toContainText('rozkaz P');
  await expect(page.locator(`.btn[data-ref='{"kind":"signal","id":"A"}']`)).toHaveClass(/tut-hl/);
  // zły tor: podpowiedź mówi, jak zwolnić przebieg na tym pulpicie
  await pressBtn(page, { kind: 'signal', id: 'A' });
  await pressBtn(page, { kind: 'signal', id: 'D2' });
  await page.click('.izh-orders button[data-order="P"]');
  await advance(page, 6);
  await expect(box.locator('.tut-feedback')).toContainText('rozkaz Zcz');
  await pressBtn(page, { kind: 'signal', id: 'D2' });
  await page.click('.izh-orders button[data-order="Zcz"]');
  await advance(page, 122);
  expect(await page.evaluate(() => window.sim.ilk.active.has('A-D2'))).toBe(false);
  await pressBtn(page, { kind: 'signal', id: 'A' });
  await pressBtn(page, { kind: 'signal', id: 'D1' });
  await page.click('.izh-orders button[data-order="P"]');
  await advance(page, 6);
  await expect(box.locator('.tut-title')).toContainText('Pociąg wjeżdża');
  await expect(box.locator('.tut-feedback')).toBeHidden();
  // krok z sygnałem zastępczym wskazuje rozkaz Sz w grupie rozkazów
  const anchor = await page.evaluate(() => window.tutorial.progress.steps.find((s) => s.id === 'sz-6105').anchor);
  expect(anchor).toEqual({ cmd: 'Sz' });
  expect(await page.evaluate(() => window.desk.cmdButton('Sz')?.dataset.order)).toBe('Sz');
});
