import { test, expect } from '@playwright/test';
import { openShift } from './helpers.js';

test('język interfejsu: wybór w ustawieniach przeładowuje widok po angielsku i niemiecku; model (rozkład, statusy) zostaje po polsku', async ({ page }) => {
  await openShift(page, 'szkolna', { params: { scenariusz: 'zmiana' } });
  await expect(page.locator('html')).toHaveAttribute('lang', 'pl');
  await expect(page.locator('#menu-new')).toHaveText('Nowa zmiana…');
  await page.click('#btn-menu'); await page.click('#menu-settings');
  await expect(page.locator('#se-jezyk .se-otitle')).toContainText('Język interfejsu');
  await expect(page.locator('#settings select[name=lang]')).toHaveValue('auto'); // lista rozwijana, nie radia – zbiór języków może rosnąć
  await expect(page.locator('#settings select[name=lang] option')).toHaveCount(4);
  await page.selectOption('#settings select[name=lang]', 'en');
  await page.waitForLoadState('load');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('#menu-new')).toHaveText('New shift…');
  await expect(page.locator('#panel-tabs button[data-tab=rj]')).toHaveText('Timetable');
  await expect(page.locator('#panel-tabs button[data-tab=lacznosc]')).toContainText('Comms');
  await expect(page.locator('#zoom-fit')).toHaveAttribute('title', 'Fit to window width');
  await expect(page).toHaveTitle(/SPRK – Szkolna/);
  // rozkład: nazwy stacji i statusy modelu pozostają polskie
  await expect(page.locator('#tab-rj tbody tr').first()).toContainText('Lipno');
  // ekran startowy i raport po angielsku
  await page.click('#btn-menu'); await page.click('#menu-new');
  // „Nowa zmiana…” w trakcie zmiany – od razu lista posterunków; ekran tytułowy pod logo
  await expect(page.locator('#start .st-tagline')).toHaveText('Duty');
  await expect(page.locator('#st-search')).toHaveAttribute('placeholder', /^Search/);
  await page.click('#start .st-logo');
  await expect(page.locator('#start .st-tagline')).toHaveText('Railway Traffic Control Simulator');
  await page.click('#st-service');
  await expect(page.locator('#start .st-card .st-diff b').first()).toHaveText(/\/5$/);
  await page.click('#st-close');
  await page.evaluate(() => window.sim.endShift('all-done'));
  await expect(page.locator('#report .st-tagline')).toHaveText('Shift report');
  await expect(page.locator('#report .rp-gword')).toHaveText(/exemplary|good|satisfactory|unsatisfactory/);
  await page.click('#report .st-close');
  // niemiecki
  await page.click('#btn-menu'); await page.click('#menu-settings');
  await page.selectOption('#settings select[name=lang]', 'de');
  await page.waitForLoadState('load');
  await expect(page.locator('html')).toHaveAttribute('lang', 'de');
  await expect(page.locator('#menu-settings')).toHaveText('Einstellungen…');
  await expect(page.locator('#panel-tabs button[data-tab=rj]')).toHaveText('Fahrplan');
  await page.click('#btn-help');
  await expect(page.locator('#help h2').first()).toContainText('Bedienung');
});

test.describe('język automatyczny', () => {
  test.use({ locale: 'de-DE' });
  test('„auto” bierze język przeglądarki (niemiecki), a jawne ustawienie polskiego go nadpisuje', async ({ page }) => {
    await openShift(page, 'szkolna', { params: { scenariusz: 'zmiana' } });
    await expect(page.locator('html')).toHaveAttribute('lang', 'de');
    await expect(page.locator('#menu-new')).toHaveText('Neue Schicht…');
    await page.click('#btn-menu'); await page.click('#menu-settings');
    await page.selectOption('#settings select[name=lang]', 'pl');
    await page.waitForLoadState('load');
    await expect(page.locator('html')).toHaveAttribute('lang', 'pl');
    await expect(page.locator('#menu-new')).toHaveText('Nowa zmiana…');
  });
});
