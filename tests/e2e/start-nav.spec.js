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
  await page.click('#st-mapside a[data-region=pomorskie]'); // mapa (lista województw obok) → województwo → karta
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

test('mapa: województwa z liczbą posterunków, sieć kolejowa, klik w województwo przybliża, przystanek – strona stacji; wyszukiwanie obok mapy', async ({ page }) => {
  await page.goto('/#/sluzba', { waitUntil: 'load' });
  await expect(page.locator('.st-mode a[data-mode=map]')).toHaveAttribute('aria-current', 'page');
  const svg = page.locator('#st-map .mv-svg');
  await expect(svg).toHaveAttribute('data-level', 'country');
  await expect(page.locator('#st-map path.mp-shape')).toHaveCount(16);
  await expect(page.locator('#st-map path.mp-shape.has')).toHaveCount(2);
  await expect(page.locator('#st-map .mv-rlabel[data-region=pomorskie] .mp-count text')).toHaveText('9');
  await expect(page.locator('#st-map .mv-rlabel[data-region=warminsko-mazurskie] .mp-count text')).toHaveText('1');
  await expect(page.locator('#st-map .mv-stop')).toHaveCount(10);
  await expect(page.locator('#st-map .mv-overview')).toHaveCount(1);
  // obok mapy: województwa; wyszukiwanie – pasujące posterunki (i tylko one na mapie)
  await expect(page.locator('#st-mapside a[data-region=pomorskie]')).toBeVisible();
  await page.fill('#st-search', 'tczew');
  await expect(page.locator('#st-mapside a[data-id]')).toHaveCount(1);
  await expect(page.locator('#st-map .mv-stop')).toHaveCount(1);
  await page.fill('#st-search', '');
  // klik w województwo w widoku kraju – przybliżenie do posterunków (bez zmiany ekranu), potem tablice z nazwami
  // klik w punkt etykiety województwa (wewnątrz obszaru; etykieta przepuszcza kliknięcie)
  const lab = await page.locator('#st-map .mv-rlabel[data-region=pomorskie] .mp-name').boundingBox();
  await page.mouse.click(lab.x + lab.width / 2, lab.y - 6);
  await expect(svg).toHaveAttribute('data-level', 'detail');
  await expect(page).toHaveURL(/#\/sluzba$/);
  await expect(page.locator('#st-map .mv-stop[data-id=tczew] .rm-plate')).toBeVisible();
  expect(await page.locator('#st-map .rm-rail[data-line="202"]').count()).toBeGreaterThan(0);
  await expect(page.locator('#st-map figcaption')).toContainText('OpenStreetMap');
  // najechanie – karta posterunku; klik – strona stacji
  await page.locator('#st-map .mv-stop[data-id=tczew] .rm-lamp').hover();
  await expect(page.locator('#st-map .st-rinfo')).toContainText('Tczew');
  await page.locator('#st-map .mv-stop[data-id=tczew] .rm-lamp').click();
  await expect(page).toHaveURL(/#\/stacja\/tczew$/);
  // przełącznik widoku: lista i z powrotem mapa
  await page.goto('/#/sluzba', { waitUntil: 'load' });
  await page.click('.st-mode a[data-mode=list]');
  await expect(page.locator('#st-list .st-card')).toHaveCount(10);
  await page.click('.st-mode a[data-mode=map]');
  await expect(page.locator('#st-map .mv-svg')).toBeVisible();
});

test('mapa przybliżana jak mapa w przeglądarce: kółko i szczypanie na gładziku przybliżają mapę, nie stronę; przyciski +/−/cała Polska; przeciąganie; dwa palce', async ({ page }) => {
  await page.goto('/#/sluzba', { waitUntil: 'load' });
  const svg = page.locator('#st-map .mv-svg');
  const zoom = async () => Number(await svg.getAttribute('data-zoom'));
  const vb = async () => (await svg.getAttribute('viewBox')).split(' ').map(Number);
  const z0 = await zoom();
  const box = await svg.boundingBox();
  const lamp = async (id) => { const r = await page.locator(`#st-map .mv-stop[data-id=${id}] .rm-lamp`).boundingBox(); return [r.x + r.width / 2, r.y + r.height / 2]; };
  // kółko myszy nad mapą: przybliża wokół kursora (Gdańsk zostaje pod kursorem), strona bez przybliżenia
  const [gx, gy] = await lamp('gdansk-glowny');
  await page.mouse.move(gx, gy);
  for (let i = 0; i < 3; i++) await page.mouse.wheel(0, -240);
  await expect.poll(zoom).toBeGreaterThan(z0 * 2);
  const [gx2, gy2] = await lamp('gdansk-glowny');
  expect(Math.hypot(gx2 - gx, gy2 - gy)).toBeLessThan(4);
  expect(await page.evaluate(() => [window.visualViewport?.scale ?? 1, window.scrollY, document.querySelector('#start').scrollTop])).toEqual([1, 0, 0]);
  // szczypanie na gładziku (Chrome: kółko z Ctrl) – też mapa
  const z1 = await zoom();
  await page.keyboard.down('Control'); await page.mouse.wheel(0, -40); await page.keyboard.up('Control');
  await expect.poll(zoom).toBeGreaterThan(z1);
  // przyciski: + (dwa razy bliżej), − , cała Polska
  const z2 = await zoom();
  await page.click('#st-map .mv-btn[data-zoom=in]');
  await expect.poll(zoom).toBeCloseTo(z2 * 2, 1);
  await page.click('#st-map .mv-btn[data-zoom=out]');
  await expect.poll(zoom).toBeCloseTo(z2, 1);
  await page.click('#st-map .mv-btn[data-zoom=home]');
  await expect.poll(zoom).toBeCloseTo(z0, 1);
  await expect(page.locator('#st-map .mv-btn[data-zoom=out]')).toBeDisabled(); // dalej się nie da
  // przeciąganie przesuwa mapę; klik po przeciągnięciu nie otwiera posterunku
  await page.click('#st-map .mv-btn[data-zoom=in]'); await page.click('#st-map .mv-btn[data-zoom=in]');
  await expect.poll(zoom).toBeCloseTo(z0 * 4, 1); // dwa kliknięcia w trakcie animacji – cztery razy bliżej
  // animacja przybliżenia (380 ms) skończona – widok stoi; data-zoom ma dwa miejsca po przecinku, więc sam warunek wyżej
  // przechodzi jeszcze w ostatnich klatkach animacji, a przeciąganie zmierzyłoby resztę jej ruchu (wolny komputer, CI)
  const still = async () => { const a = (await vb()).join(' '); await page.waitForTimeout(60); return a === (await vb()).join(' '); };
  await expect.poll(still).toBe(true);
  const before = await vb();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 - 120, box.y + box.height / 2 - 60, { steps: 6 });
  await page.mouse.up();
  const after = await vb();
  expect(after[0]).toBeGreaterThan(before[0]);
  expect(after[1]).toBeGreaterThan(before[1]);
  expect(after[2]).toBeCloseTo(before[2], 5);
  // dwa palce (zdarzenia wskaźnika dotykowego): rozsunięcie palców przybliża
  const z3 = await zoom();
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  const touch = (type, id, x, y) => svg.dispatchEvent(type, { pointerId: id, pointerType: 'touch', isPrimary: id === 1, clientX: x, clientY: y, button: 0, bubbles: true });
  await touch('pointerdown', 1, cx - 40, cy); await touch('pointerdown', 2, cx + 40, cy);
  for (let k = 1; k <= 5; k++) { await touch('pointermove', 1, cx - 40 - k * 16, cy); await touch('pointermove', 2, cx + 40 + k * 16, cy); }
  await touch('pointerup', 1, cx - 120, cy); await touch('pointerup', 2, cx + 120, cy);
  await expect.poll(zoom).toBeGreaterThan(z3 * 2.5);
  // klawiatura na mapie z fokusem: 0 – cała Polska
  await svg.focus(); await page.keyboard.press('0');
  await expect.poll(zoom).toBeCloseTo(z0, 1);
});

test('ekran województwa: ta sama mapa przybliżona do posterunków – tablice z nazwami od razu, dalej można oddalić', async ({ page }) => {
  await page.goto('/#/sluzba/pomorskie', { waitUntil: 'load' });
  const svg = page.locator('#st-rmapfig .mv-svg');
  await expect(svg).toHaveAttribute('data-level', 'detail');
  for (const id of ['reda', 'sopot', 'tczew']) await expect(page.locator(`#st-rmapfig .mv-stop[data-id=${id}] .rm-plate`)).toBeVisible();
  await page.click('#st-rmapfig .mv-btn[data-zoom=home]');
  await expect(svg).toHaveAttribute('data-level', 'country');
  await expect(page.locator('#st-rmapfig .mv-stop[data-id=sopot] .rm-plate')).toBeHidden();
});


test('ekran wczytywania: od pierwszej klatki (bez skryptu gry widać semafor i napis), co najmniej 1 s, po zbudowaniu pulpitu znika', async ({ page }) => {
  await page.route(/\/src\/main\.js|\/assets\/index-[^/]*\.js/, (route) => route.abort());
  await page.goto('/?stacja=sopot&scenariusz=zmiana', { waitUntil: 'load' });
  await expect(page.locator('#boot')).toBeVisible();
  await expect(page.locator('#boot-text')).toHaveText('Wczytywanie posterunku…');
  await expect(page.locator('#boot .boot-sig .sg-lens')).toHaveCount(3);
  await page.goto('/', { waitUntil: 'load' });
  await expect(page.locator('#boot-text')).toHaveText('Wczytywanie…');
  await page.unroute(/\/src\/main\.js|\/assets\/index-[^/]*\.js/);
  await page.goto('/?stacja=sopot&scenariusz=zmiana', { waitUntil: 'load' });
  await page.waitForFunction(() => window.sim && document.querySelector('#desk svg'));
  // widoczny co najmniej 1 s od początku wczytywania (bez mignięcia), potem zdjęty (nie zasłania gry)
  expect(await page.evaluate(() => [!!document.getElementById('boot'), performance.now() < 900])).not.toEqual([false, true]);
  await expect(page.locator('#boot')).toHaveCount(0);
  expect(await page.evaluate(() => performance.now())).toBeGreaterThan(1000);
});

test('„Nowa zmiana…” wraca do ostatnio oglądanego ekranu wyboru – mapy w tym samym przybliżeniu (bez zapisu – lista)', async ({ page }) => {
  await page.goto('/#/sluzba', { waitUntil: 'load' });
  const svg = page.locator('#st-map .mv-svg');
  await page.click('#st-map .mv-btn[data-zoom=in]'); await page.click('#st-map .mv-btn[data-zoom=in]');
  await expect.poll(async () => Number(await svg.getAttribute('data-zoom'))).toBeGreaterThan(2);
  await page.waitForTimeout(400); // zapis widoku mapy (po 0,3 s spokoju)
  const zoomed = Number(await svg.getAttribute('data-zoom'));
  // z mapy przez stronę stacji do zmiany
  await page.goto('/#/stacja/sopot', { waitUntil: 'load' });
  await page.click('#st-go');
  await page.waitForURL(/stacja=sopot/);
  await page.waitForFunction(() => window.sim && document.querySelector('#desk svg'));
  await page.click('#btn-menu'); await page.click('#menu-new');
  await expect(page).toHaveURL(/#\/sluzba$/);
  await expect(svg).toBeVisible();
  expect(Number(await svg.getAttribute('data-zoom'))).toBeCloseTo(zoomed, 0);
  // szkolenie: ostatnio oglądana misja
  await page.goto('/#/szkolenie/3', { waitUntil: 'load' });
  await openShift(page, 'szkolna', { params: { scenariusz: 'nauka-3' } });
  await page.click('#btn-menu'); await page.click('#menu-new');
  await expect(page).toHaveURL(/#\/szkolenie\/3$/);
  await expect(page.locator('#st-briefing .st-bname')).toContainText('Misja 3');
});
