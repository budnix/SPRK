import { test, expect } from '@playwright/test';
import { openShift } from './helpers.js';

/*
 * Ekrany wyboru jak w grze (src/ui/StartScreen.js, logika – tests/catalog.test.js): tytuł, służba (wyszukiwarka,
 * filtry), region, strona stacji, szkolenie; adresy #/… z przyciskiem „wstecz” przeglądarki; Esc – piętro wyżej;
 * postęp gracza (pieczątka oceny, misja ukończona, ostatnia zmiana); ustawienia otwierane z ekranu tytułowego.
 */

const ids = (page) => page.locator('#st-list .st-card').evaluateAll((els) => els.map((e) => e.dataset.id));

test('wyszukiwarka: bez polskich znaków, nazwa w całości pierwsza, Enter otwiera pierwszy wynik; „/” przenosi do pola; brak wyników', async ({ page }) => {
  await page.goto('/#/sluzba/lista', { waitUntil: 'load' });
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

test('filtry: stanowisko (lista), trudność 1–5, tylko niegrane – łączą się; drugie kliknięcie wyłącza', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('sprk.progress', JSON.stringify({ stations: { sopot: { zmiana: { grade: 'dobrze', total: 20 } } } })));
  await page.goto('/#/sluzba/lista', { waitUntil: 'load' });
  const all = await ids(page);
  // stanowisko: lista wszystkich rodzajów z rejestru z liczbą posterunków (rodzajów przybywa – lista, nie przyciski)
  const opts = await page.locator('#st-srk option').allTextContents();
  expect(opts).toHaveLength(7);
  expect(opts).toContain('typ E · pulpit kostkowy (2)');
  expect(opts).toContain('IZH-111 · pulpit ciemny (0)');
  await page.selectOption('#st-srk', 'E');
  await expect.poll(() => ids(page)).toEqual(['reda', 'rumia']);
  await page.selectOption('#st-srk', '');
  await expect.poll(() => ids(page)).toEqual(all);
  // trudność: zawsze pełna skala 1–5 (także stopnie bez posterunków)
  expect(await page.locator('.st-fdiff .st-chip').allTextContents()).toEqual(['1', '2', '3', '4', '5']);
  await page.click('.st-chip[data-diff="1"]');
  await expect(page.locator('#st-list .st-empty')).toBeVisible();
  await page.click('.st-chip[data-diff="1"]');
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
  await page.click('.mp-region[data-region=pomorskie]'); // mapa → województwo → karta
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
  await expect(page.locator('#st-list')).toBeVisible();
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

test('ustawienia z ekranu tytułowego leżą nad nim, przycisk „Wróć do menu”; zamknięcie wraca na tytuł; z menu zmiany – „Wróć do zmiany”', async ({ page }) => {
  await page.goto('/', { waitUntil: 'load' });
  await page.click('#st-settings');
  await expect(page.locator('#settings')).toBeVisible();
  await expect(page.locator('#se-close')).toHaveText('‹ Wróć do menu'); // nie „do zmiany” – zmiany jeszcze nie ma
  const top = await page.evaluate(() => { const r = document.querySelector('#settings .se-cat').getBoundingClientRect(); return !!document.elementFromPoint(r.left + 5, r.top + 5)?.closest('#settings'); });
  expect(top).toBe(true);
  await page.click('#se-close');
  await expect(page.locator('#settings')).toBeHidden();
  await expect(page.locator('#st-service')).toBeVisible();
  await openShift(page, 'szkolna');
  await page.click('#btn-menu'); await page.click('#menu-settings');
  await expect(page.locator('#se-close')).toHaveText('‹ Wróć do zmiany');
});

test('wejście bez zmiany w adresie: pulpit ukryty od pierwszej klatki (bez mignięcia przed ekranem tytułowym); ze zmianą – widoczny', async ({ page }) => {
  // bez skryptu gry widać to, co przeglądarka pokazuje przed jego załadowaniem
  await page.route(/\/src\/main\.js|\/assets\/index-[^/]*\.js/, (route) => route.abort());
  await page.goto('/', { waitUntil: 'load' });
  expect(await page.evaluate(() => [document.documentElement.classList.contains('boot-start'), getComputedStyle(document.getElementById('app')).visibility])).toEqual([true, 'hidden']);
  await page.goto('/?stacja=szkolna&scenariusz=zmiana', { waitUntil: 'load' });
  expect(await page.evaluate(() => [document.documentElement.classList.contains('boot-start'), getComputedStyle(document.getElementById('app')).visibility])).toEqual([false, 'visible']);
  await page.unroute(/\/src\/main\.js|\/assets\/index-[^/]*\.js/);
  // z grą: ekran startowy otwarty, klasa zdjęta
  await page.goto('/', { waitUntil: 'load' });
  await expect(page.locator('#start')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.classList.contains('boot-start'))).toBe(false);
});

test('mapa: województwa z liczbą posterunków, klik – region z rzeczywistym przebiegiem linii, przystanek – strona stacji; wyszukiwanie obok mapy', async ({ page }) => {
  await page.goto('/#/sluzba', { waitUntil: 'load' });
  await expect(page.locator('.st-mode a[data-mode=map]')).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('#st-map .mp-region')).toHaveCount(16);
  await expect(page.locator('#st-map .mp-region.has')).toHaveCount(1);
  await expect(page.locator('#st-map .mp-region[data-region=pomorskie] .mp-count text')).toHaveText('9');
  await expect(page.locator('#st-map .mp-dot')).toHaveCount(9);
  // obok mapy: województwa; wyszukiwanie – pasujące posterunki, Enter otwiera pierwszy
  await expect(page.locator('#st-mapside a[data-region=pomorskie]')).toBeVisible();
  await page.fill('#st-search', 'tczew');
  await expect(page.locator('#st-mapside a[data-id]')).toHaveCount(1);
  await expect(page.locator('#st-map .mp-dot')).toHaveCount(1);
  await page.fill('#st-search', '');
  // klik w województwo (odnośnik SVG) – schemat regionu
  await page.click('#st-map .mp-region[data-region=pomorskie]');
  await expect(page).toHaveURL(/#\/sluzba\/pomorskie$/);
  await expect(page.locator('.rm-region .rm-stop')).toHaveCount(9);
  expect(await page.locator('.rm-region .rm-rail[data-line="202"]').count()).toBeGreaterThan(0);
  await expect(page.locator('.st-rmap figcaption')).toContainText('OpenStreetMap');
  await page.click('.rm-region .rm-stop[data-id=tczew]');
  await expect(page).toHaveURL(/#\/stacja\/tczew$/);
  await expect(page.locator('#st-briefing .st-bname')).toHaveText('Tczew');
  // przełącznik widoku: lista i z powrotem mapa
  await page.goto('/#/sluzba', { waitUntil: 'load' });
  await page.click('.st-mode a[data-mode=list]');
  await expect(page.locator('#st-list .st-card')).toHaveCount(9);
  await page.click('.st-mode a[data-mode=map]');
  await expect(page.locator('#st-map svg')).toBeVisible();
});
