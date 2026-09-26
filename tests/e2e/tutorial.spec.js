import { test, expect } from '@playwright/test';
import { openShift, tap, advance, pressBtn } from './helpers.js';

/* Misje wprowadzające (samouczek) – stacja Szkolna */

test('ekran startowy: przycisk samouczka uruchamia misję 1 na stacji Szkolna', async ({ page }) => {
  await page.goto('/', { waitUntil: 'networkidle' });
  await expect(page.locator('#st-tutorial')).toBeVisible();
  await page.click('#st-tutorial');
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
  await expect(box.locator('.tut-title')).toContainText('Pozwolenie dla Lipna');
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
  await openShift(page, 'szkolna', { params: { scenariusz: 'nauka-2' }, settings: { srk: 'komputerowe' } });
  await page.waitForFunction(() => window.tutorial);
  await expect(page.locator('#desk svg.desk')).toHaveCount(1); // scenariusz wymusza pulpit mimo ustawienia
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
  await expect(page.locator('#help dl.gloss')).toContainText('Poz – pozwolenie');
});
