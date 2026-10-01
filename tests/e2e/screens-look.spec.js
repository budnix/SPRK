import { test, expect } from '@playwright/test';
import { openShift } from './helpers.js';

/*
 * Wygląd ekranów pełnych ze świata nastawni (start, raport, ustawienia): semafor „Stój” → „wolna droga” po wyborze,
 * misje jako przystanki na torze, tablica stacyjna w odprawie, pieczątka oceny i liczniki w raporcie, lampki kontrolne
 * w ustawieniach. Barwy porównywane z wartościami zmiennych `--sc-*` (oba motywy mają własne).
 */

/** Barwa zmiennej CSS w postaci obliczonej (rgb…), do porównania z getComputedStyle. */
const rgbOf = (page, v) => page.evaluate((name) => {
  const d = document.createElement('i'); d.style.color = `var(${name})`; document.body.append(d);
  const c = getComputedStyle(d).color; d.remove(); return c;
}, v);
const fill = (loc) => loc.evaluate((e) => getComputedStyle(e).fill);

for (const theme of ['dark', 'light']) {
  test(`ekran startowy (${theme}): semafor między misjami a odprawą – „Stój”, po wyborze „wolna droga”; misja zapala przystanek; nazwa na tablicy`, async ({ page }) => {
    await page.addInitScript((th) => localStorage.setItem('sprk.settings', JSON.stringify({ theme: th })), theme);
    await page.goto('/#/szkolenie', { waitUntil: 'load' });
    await expect(page.locator('#start .st-arrow .sg-svg')).toBeVisible();
    const [green, red, off] = [await rgbOf(page, '--sc-lamp-green'), await rgbOf(page, '--sc-lamp-red'), await rgbOf(page, '--sc-lens-off')];
    const arrow = (cls) => page.locator(`#start .st-arrow .sg-lens.${cls}`);
    expect([await fill(arrow('sg-r')), await fill(arrow('sg-g'))]).toEqual([red, off]);
    // pusta odprawa: ten sam semafor zamiast znaku tekstowego
    await expect(page.locator('#st-briefing .st-bplaceholder .sg-svg')).toBeVisible();
    // misja: znacznik przystanku na torze, po wyborze zapalony na zielono, semafor – „wolna droga”
    const no = page.locator('#start .st-mission[data-idx="0"] .st-no');
    expect(await no.evaluate((e) => getComputedStyle(e).borderRadius)).toBe('50%');
    await page.click('#start .st-mission[data-idx="0"]');
    await expect.poll(async () => [await fill(arrow('sg-r')), await fill(arrow('sg-g'))]).toEqual([off, green]);
    await expect.poll(() => no.evaluate((e) => getComputedStyle(e).backgroundColor)).toBe(green);
    // tablica stacyjna: granatowe tło, biała litera (odprawa misji i strona stacji)
    const plate = () => page.locator('#st-briefing .st-bname').evaluate((e) => [getComputedStyle(e).backgroundColor, getComputedStyle(e).color]);
    const colours = [await rgbOf(page, '--sc-plate'), await rgbOf(page, '--sc-plate-text')];
    expect(await plate()).toEqual(colours);
    await page.goto('/#/sluzba/lista', { waitUntil: 'load' });
    // trudność – okrągłe lampki
    expect(await page.locator('#start .st-card .st-diff i').first().evaluate((e) => getComputedStyle(e).borderRadius)).toBe('50%');
    await page.click('#start .st-card[data-id=sopot]');
    expect(await plate()).toEqual(colours);
  });
}

test('telefon: nagłówek ekranów pełnych mieści się w szerokości – logo nad tytułem', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/', { waitUntil: 'load' });
  await expect(page.locator('#start .st-tagline')).toBeVisible();
  // dawniej logo i tytuł w jednym wierszu – „SYMULATOR PROWADZENIA…” wychodził poza ekran
  const r = await page.locator('#start .st-tagline').evaluate((e) => { const b = e.getBoundingClientRect(); return { right: b.right, top: b.top, scroll: e.scrollWidth - e.clientWidth }; });
  expect(r.right).toBeLessThanOrEqual(390);
  expect(r.scroll).toBe(0);
  const logo = await page.locator('#start .st-logo').boundingBox();
  expect(logo.y + logo.height).toBeLessThanOrEqual(r.top + 1);
  expect(await page.evaluate(() => document.querySelector('#start').scrollWidth <= document.querySelector('#start').clientWidth)).toBe(true);
});

test('raport: ocena jako pieczątka (podwójna ramka, skos), liczniki z lampką stanu; „ogranicz ruch” – bez odbicia pieczątki', async ({ page }) => {
  await openShift(page, 'szkolna');
  await page.evaluate(() => document.getElementById('menu-report').click());
  const word = page.locator('#report .rp-gword');
  await expect(word).toBeVisible();
  const st = await word.evaluate((e) => ({ border: getComputedStyle(e).borderTopStyle, transform: getComputedStyle(e).transform, anim: getComputedStyle(e).animationName }));
  expect(st.border).toBe('double');
  expect(st.transform).not.toBe('none');
  expect(st.anim).toBe('rp-stamp');
  // licznik: cyfry w ciemnym okienku; lampka w rogu kafelka
  const v = page.locator('#report .rp-tile .v').first();
  expect(await v.evaluate((e) => getComputedStyle(e).backgroundColor)).toBe(await rgbOf(page, '--sc-counter'));
  const good = page.locator('#report .rp-tile.good').first();
  expect(await good.evaluate((e) => getComputedStyle(e, '::after').backgroundColor)).toBe(await rgbOf(page, '--sc-lamp-green'));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(await word.evaluate((e) => getComputedStyle(e).animationName)).toBe('none');
});

test('ustawienia: wybrana opcja ma zapaloną lampkę kontrolną, pole wyboru nadal działa (klik, klawiatura)', async ({ page }) => {
  await openShift(page, 'szkolna');
  await page.evaluate(() => document.getElementById('menu-settings').click());
  const on = page.locator('#settings input[name=theme][value=light]');
  await expect(on).toBeChecked(); // środowisko testów: motyw jasny
  const green = await rgbOf(page, '--sc-lamp-green');
  expect(await on.evaluate((e) => getComputedStyle(e).backgroundColor)).toBe(green);
  const dark = page.locator('#settings input[name=theme][value=dark]');
  expect(await dark.evaluate((e) => getComputedStyle(e).backgroundColor)).not.toBe(green);
  await page.check('#settings input[name=theme][value=dark]');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  // lampka zapala się przejściem (0,2 s) – czekamy na barwę końcową motywu ciemnego
  const greenDark = await rgbOf(page, '--sc-lamp-green');
  await expect.poll(() => dark.evaluate((e) => getComputedStyle(e).backgroundColor)).toBe(greenDark);
  // klawiatura: strzałka przenosi wybór na sąsiednią opcję
  await dark.focus();
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('#settings input[name=theme]:checked')).not.toHaveValue('dark');
});

test('ekrany pełne: przyciski na końcu nie dotykają dolnej krawędzi – zapas co najmniej 40 px po przewinięciu do końca', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 700 }); // tablet w poziomie – raport dłuższy niż ekran
  await openShift(page, 'szkolna');
  await page.evaluate(() => document.getElementById('menu-report').click());
  const gap = await page.evaluate(() => {
    const r = document.querySelector('#report'); r.scrollTop = r.scrollHeight;
    const btn = [...r.querySelectorAll('.rp-actions .tb')].at(-1).getBoundingClientRect();
    return r.getBoundingClientRect().bottom - btn.bottom;
  });
  expect(gap).toBeGreaterThanOrEqual(40);
  // lista posterunków na niskim ekranie: ostatnia karta też z zapasem
  await page.click('#report .st-close');
  await page.click('#btn-menu'); await page.click('#menu-new');
  await page.setViewportSize({ width: 1024, height: 420 });
  const gap2 = await page.evaluate(() => {
    const r = document.querySelector('#start'); r.scrollTop = r.scrollHeight;
    const last = [...r.querySelectorAll('#st-list .st-card')].at(-1).getBoundingClientRect();
    return r.getBoundingClientRect().bottom - last.bottom;
  });
  expect(gap2).toBeGreaterThanOrEqual(40);
});
