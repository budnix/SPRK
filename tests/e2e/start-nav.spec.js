import { test, expect } from '@playwright/test';
import { openShift } from './helpers.js';

/*
 * Ekrany wyboru jak w grze (src/ui/StartScreen.js, logika – tests/catalog.test.js): tytuł, służba (wyszukiwarka,
 * filtry), region, strona stacji, szkolenie; adresy #/… z przyciskiem „wstecz” przeglądarki; Esc – piętro wyżej;
 * postęp gracza (pieczątka oceny, misja ukończona, ostatnia zmiana); ustawienia otwierane z ekranu tytułowego.
 */

const ids = (page) => page.locator('#st-list .st-card').evaluateAll((els) => els.map((e) => e.dataset.id));

test('wyszukiwarka: bez polskich znaków, nazwa w całości pierwsza, Enter otwiera pierwszy wynik; „/” przenosi do pola; brak wyników', async ({ page }) => {
  await page.goto('/#/sluzba', { waitUntil: 'load' });
  const all = (await ids(page)).length;
  await expect(page.locator('#st-count')).toHaveText(`${all} z ${all} posterunków`);
  await page.locator('#st-title').focus();
  await page.keyboard.press('/');
  await expect(page.locator('#st-search')).toBeFocused();
  await page.keyboard.type('gdansk');
  await expect.poll(() => ids(page)).toEqual(['gdansk-glowny', ...(await ids(page)).slice(1)]);
  expect((await ids(page))[0]).toBe('gdansk-glowny');
  await page.fill('#st-search', '213');
  await expect.poll(() => ids(page)).toEqual(['reda']);
  await page.fill('#st-search', 'xyzzy');
  await expect(page.locator('#st-list .st-empty')).toBeVisible();
  await expect(page.locator('#st-count')).toHaveText(`0 z ${all} posterunków`);
  await page.fill('#st-search', 'gdynia glowna');
  await page.press('#st-search', 'Enter');
  await expect(page).toHaveURL(/#\/stacja\/gdynia-glowna$/);
  // powrót przeglądarką: lista z tym samym zapytaniem
  await page.goBack();
  await expect(page.locator('#st-search')).toHaveValue('gdynia glowna');
});

test('filtry: stanowisko, trudność, tylko niegrane – łączą się; drugie kliknięcie wyłącza', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('sprk.progress', JSON.stringify({ stations: { sopot: { zmiana: { grade: 'dobrze', total: 20 } } } })));
  await page.goto('/#/sluzba', { waitUntil: 'load' });
  const all = await ids(page);
  await page.click('.st-chip[data-srk="E"]');
  await expect(page.locator('.st-chip[data-srk="E"]')).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => ids(page)).toEqual(['reda', 'rumia']);
  await page.click('.st-chip[data-srk="E"]');
  await expect.poll(() => ids(page)).toEqual(all);
  await page.click('.st-chip[data-diff="3"]');
  await expect.poll(() => ids(page)).toEqual(['gdynia-orlowo']);
  await page.click('.st-chip[data-diff="4"]');
  expect(await ids(page)).toContain('sopot');
  await page.check('#st-notplayed');
  expect(await ids(page)).not.toContain('sopot');
  expect(await ids(page)).toContain('gdynia-orlowo');
  // ocena z pamięci: pieczątka na karcie Sopotu
  await page.uncheck('#st-notplayed');
  await expect(page.locator('.st-card[data-id=sopot] .st-stamp')).toHaveText('dobrze');
  await expect(page.locator('.st-card[data-id=reda] .st-stamp')).toHaveCount(0);
});

test('adresy i „wstecz”: tytuł → służba → strona stacji; okruszki; Esc piętro wyżej; nieznana stacja – lista', async ({ page }) => {
  await page.goto('/', { waitUntil: 'load' });
  await expect(page).toHaveURL(/#\/$/);
  await expect(page.locator('#st-up')).toBeHidden();
  await page.click('#st-service');
  await page.click('.st-card[data-id=tczew]');
  await expect(page.locator('#st-crumbs')).toHaveText(/Start\s*›\s*Służba\s*›\s*pomorskie\s*›\s*Tczew/);
  // okruszek województwa – region z posterunkami
  await page.click('#st-crumbs a[href="#/sluzba/pomorskie"]');
  await expect(page.locator('#st-title')).toHaveText('pomorskie');
  expect((await ids(page)).length).toBeGreaterThanOrEqual(9);
  // Esc (bez trwającej zmiany): region → służba → tytuł
  await page.locator('#st-title').focus();
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(/#\/sluzba$/);
  await expect(page.locator('#st-title')).toHaveText('Służba'); // ekran narysowany (hashchange idzie po zmianie adresu)
  await page.locator('#st-title').focus();
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(/#\/$/);
  await expect(page.locator('#st-service')).toBeVisible();
  // przeglądarka: wstecz przechodzi po odwiedzonych ekranach
  await page.goBack();
  await expect(page).toHaveURL(/#\/sluzba$/);
  await page.goto('/#/stacja/nie-ma-takiej', { waitUntil: 'load' });
  await expect(page.locator('#st-search')).toBeVisible();
  // stacja szkoleniowa nie ma strony w służbie – tylko w szkoleniu
  await page.goto('/#/stacja/szkolna', { waitUntil: 'load' });
  await expect(page.locator('#st-search')).toBeVisible();
});

test('postęp: koniec zmiany zapisuje ocenę (pieczątka na karcie i stronie stacji) i ostatnią zmianę (kafelek na tytule)', async ({ page }) => {
  await openShift(page, 'sopot', { params: { scenariusz: 'zmiana', zaklocenia: 'none' } });
  await page.evaluate(() => window.sim.endShift());
  await expect(page.locator('#report')).toBeVisible();
  const grade = await page.evaluate(() => window.sim.report().grade);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('sprk.progress')));
  expect(saved.stations.sopot.zmiana.grade).toBe(grade);
  // „Nowa zmiana…” z raportu: lista z pieczątką; strona stacji – najlepszy wynik
  await page.click('#rp-new');
  await expect(page.locator('.st-card[data-id=sopot] .st-stamp')).toHaveClass(new RegExp(`grade-${grade}`));
  await page.click('.st-card[data-id=sopot]');
  await expect(page.locator('#st-briefing .st-best .st-stamp')).toBeVisible();
  // ekran tytułowy: ostatnia zmiana uruchamia tę samą zmianę ponownie
  await page.click('#start .st-logo');
  await expect(page.locator('#st-last')).toContainText('Sopot');
  await page.click('#st-last');
  await page.waitForURL(/stacja=sopot.*scenariusz=zmiana/);
  await page.waitForFunction(() => window.sim && document.querySelector('#desk svg'));
  expect(new URL(page.url()).hash).toBe('');
});

test('misja ukończona: znacznik na linii szkoleniowej i licznik na ekranie tytułowym', async ({ page }) => {
  await openShift(page, 'szkolna', { params: { scenariusz: 'nauka-1' } });
  await page.evaluate(() => window.sim.endShift());
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('sprk.progress')).missions)).toEqual({ 'szkolna/nauka-1': true });
  await page.goto('/#/szkolenie', { waitUntil: 'load' });
  await expect(page.locator('.st-mission[data-scenario="nauka-1"]')).toHaveClass(/done/);
  await expect(page.locator('.st-mission[data-scenario="nauka-1"] .st-done')).toHaveText(/ukończona/);
  await expect(page.locator('.st-mission[data-scenario="nauka-2"] .st-done')).toHaveCount(0);
  await page.goto('/', { waitUntil: 'load' });
  await expect(page.locator('#st-training')).toContainText('Ukończone misje: 1 z 6');
});

test('ustawienia z ekranu tytułowego leżą nad nim; zamknięcie wraca na tytuł', async ({ page }) => {
  await page.goto('/', { waitUntil: 'load' });
  await page.click('#st-settings');
  await expect(page.locator('#settings')).toBeVisible();
  const top = await page.evaluate(() => { const r = document.querySelector('#settings .se-cat').getBoundingClientRect(); return !!document.elementFromPoint(r.left + 5, r.top + 5)?.closest('#settings'); });
  expect(top).toBe(true);
  await page.click('#se-close');
  await expect(page.locator('#settings')).toBeHidden();
  await expect(page.locator('#st-service')).toBeVisible();
});
