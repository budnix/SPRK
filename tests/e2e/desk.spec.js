import { test, expect } from '@playwright/test';
import { openShift, btn, simState, advance } from './helpers.js';

/* Pulpit kostkowy (urządzenia typu E) – Stare Pustkowie */

test('ekran startowy bez parametrów: misje u góry, posterunki alfabetycznie / wg trudności, wybór posterunku rozwija parametry i startuje zmianę', async ({ page }) => {
  await page.goto('/', { waitUntil: 'networkidle' });
  await expect(page.locator('#start')).toBeVisible();
  // lista po lewej: misje przed posterunkami; odprawa (etap 2) po prawej z podpowiedzią
  const order = await page.evaluate(() => [...document.querySelectorAll('.st-left .st-missions, .st-left .st-stations')].map((e) => e.className));
  expect(order).toEqual(['st-missions', 'st-stations']);
  await expect(page.locator('#st-briefing .st-bplaceholder')).toBeVisible();
  await expect(page.locator('.st-arrow')).toBeVisible();
  expect(await page.locator('.st-mission').count()).toBeGreaterThanOrEqual(2);
  // domyślnie alfabetycznie
  const names = await page.locator('.st-card .st-name').allTextContents();
  expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, 'pl')));
  expect(await page.locator('.st-card .st-stars').first()).toBeVisible();
  // wg trudności: gwiazdki niemalejąco, wybór zapamiętany po przeładowaniu
  await page.click('.st-sort button[data-sort=difficulty]');
  const starsList = await page.locator('.st-card .st-stars').allTextContents();
  const counts = starsList.map((s) => (s.match(/★/g) || []).length);
  expect(counts).toEqual([...counts].sort((a, b) => a - b));
  await page.reload({ waitUntil: 'networkidle' });
  await expect(page.locator('.st-sort button[data-sort=difficulty]')).toHaveClass(/active/);
  // wybór posterunku: parametry pod kartą
  await expect(page.locator('#st-params')).toBeHidden();
  expect(await page.locator('.st-card .st-thumb svg path').count()).toBeGreaterThan(0); // miniatury planów
  await page.click('.st-card[data-id=sopot]');
  await expect(page.locator('#st-params')).toBeVisible();
  await expect(page.locator('#st-briefing')).toHaveClass(/open/);
  await expect(page.locator('.st-card[data-id=sopot]')).toHaveClass(/active/);
  await expect(page.locator('#st-briefing .st-bname')).toHaveText('Sopot');
  await expect(page.locator('#st-station-desc')).toContainText('Ebilock');
  await page.selectOption('#st-level', 'none');
  await page.click('#st-go');
  await page.waitForURL(/stacja=sopot.*zaklocenia=none/);
  await expect(page.locator('#station-name')).toContainText('Sopot');
});

test('przebieg pociągowy dwoma przyciskami, wyciągnięcie gasi sygnał, Zw + zwrotnica przestawia', async ({ page }) => {
  await openShift(page, 'stare-pustkowie');
  const G = (id) => ({ kind: 'signal', id, color: 'green' });
  await btn(page, G('A')).click();
  expect((await simState(page)).armed).toEqual({ kind: 'signal', id: 'A' });
  await expect(btn(page, G('A'))).toHaveClass(/armed/);
  await btn(page, G('D1')).click();
  await advance(page, 8);
  let st = await simState(page);
  expect(st.active).toContain('A-D1');
  expect(st.signals.A).not.toBe('S1');
  // wyciągnięcie (prawy przycisk) gasi sygnał, przebieg zostaje
  await btn(page, G('A')).click({ button: 'right' });
  st = await simState(page);
  expect(st.signals.A).toBe('S1');
  expect(st.active).toContain('A-D1');
  // Zw + przycisk zwrotnicy poza przebiegiem
  const free = await page.evaluate(() => [...window.sim.ilk.points.values()].find((p) => window.sim.ilk.canSwitchPoint(p.id).ok).id);
  expect(free).toBeTruthy();
  const before = (await simState(page)).points[free];
  await btn(page, { kind: 'group', id: 'Zw', role: 'group-point' }).click();
  await btn(page, { kind: 'point', id: free }).click();
  await advance(page, 6);
  expect((await simState(page)).points[free]).not.toBe(before);
});

test('blokada liniowa: Wbl wysyła żądanie, lampka „wyjazd” miga, po odpowiedzi sąsiada pozwolenie', async ({ page }) => {
  await openShift(page, 'stare-pustkowie');
  await btn(page, { kind: 'block', exit: 'E', btn: 'Wbl' }).click();
  const req = await page.evaluate(() => window.sim.blocks.get('E').request);
  expect(req).toBe('ours');
  await advance(page, 40);
  const perm = await page.evaluate(() => { const b = window.sim.blocks.get('E'); return b.permission || b.direction; });
  expect(perm).toBeTruthy();
});

test('ustawienia: motyw i położenie panelu są zapamiętane po przeładowaniu; ukryty panel pokazuje licznik dziennika', async ({ page }) => {
  await openShift(page, 'stare-pustkowie', { settings: { theme: 'dark', sidePos: 'right' } });
  await page.click('#btn-menu');
  await page.check('input[name=theme][value=light]');
  await page.check('input[name=sidePos][value=bottom]');
  await page.keyboard.press('Escape');
  await page.reload({ waitUntil: 'networkidle' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page.locator('#app')).toHaveAttribute('data-side-pos', 'bottom');
  await page.click('#side-toggle');
  await expect(page.locator('#app')).toHaveAttribute('data-side-collapsed', 'true');
  await expect(page.locator('#side-toggle')).toHaveText('pokaż');
  await page.evaluate(() => window.sim.bus.emit('log', { time: window.sim.clock.time, level: 'warn', msg: 'Test ostrzeżenia' }));
  await expect(page.locator('#mini-tabs button[data-tab=log] .badge')).toHaveText('1');
  await page.click('#mini-tabs button[data-tab=log]');
  await expect(page.locator('#app')).toHaveAttribute('data-side-collapsed', 'false');
  await expect(page.locator('.tabs button.active')).toContainText('Dziennik');
  await expect(page.locator('#log li').first()).toContainText('Test ostrzeżenia');
});

test('struktura pulpitu: każdy sygnalizator, zwrotnica, wykolejnica, koniec przebiegu i blokada ma przycisk (regresja renderera)', async ({ page }) => {
  await openShift(page, 'stare-pustkowie');
  const s = await page.evaluate(() => {
    const st = window.sim.station;
    const refs = [...document.querySelectorAll('#desk .btn')].map((b) => JSON.parse(b.dataset.ref));
    const has = (f) => refs.some(f);
    const missing = [];
    for (const t of st.tiles) {
      if (t.type === 'signal' && !has((r) => r.kind === 'signal' && r.id === t.id)) missing.push(`signal ${t.id}`);
      if (t.type === 'point' && !has((r) => r.kind === 'point' && r.id === t.id)) missing.push(`point ${t.id}`);
      if (t.derailer && !has((r) => r.kind === 'derailer' && r.id === t.derailer)) missing.push(`derailer ${t.derailer}`);
      if (t.endButton && !has((r) => r.kind === 'end' && r.id === t.endButton.id)) missing.push(`end ${t.endButton.id}`);
      if (t.type === 'button' && !has((r) => r.kind === 'group' && r.id === t.id)) missing.push(`group ${t.id}`);
      if (t.type === 'block') for (const b of ['Wbl', 'Poz', 'Ko', 'dPo', 'dKo']) if (!has((r) => r.kind === 'block' && r.exit === t.exit && r.btn === b)) missing.push(`block ${t.exit} ${b}`);
    }
    return {
      missing, refs: refs.length, unique: new Set(refs.map((r) => JSON.stringify(r))).size,
      tiles: document.querySelectorAll('#desk .tile').length, defined: st.tiles.length,
    };
  });
  expect(s.missing).toEqual([]);
  expect(s.unique).toBe(s.refs); // brak zdublowanych przycisków
  // nazwa sąsiedniego posterunku na kostce wyjazdu nie nachodzi na przycisk końca przebiegu
  const overlaps = await page.evaluate(() => {
    const out = [];
    for (const b of document.querySelectorAll(`#desk .btn[data-ref*='"kind":"end"']`)) {
      const tile = b.closest('.tile'); const t = tile?.querySelector('text.tile-text.small'); if (!t) continue;
      const rb = b.getBoundingClientRect(), rt = t.getBoundingClientRect();
      out.push([t.textContent, !(rb.right <= rt.left || rb.left >= rt.right || rb.bottom <= rt.top || rb.top >= rt.bottom)]);
    }
    return out;
  });
  expect(overlaps.length).toBeGreaterThan(0);
  // peron na pulpicie: przerywany obrys z nazwą; nazwy sygnalizatorów ciemne (nie żółte jak na monitorze)
  await expect(page.locator('#desk .desk-platform .platform-label')).toHaveText(['Peron I']);
  expect(await page.locator('#desk .desk-platform line.platform-edge').count()).toBe(2); // peron wyspowy: podwójna kreska na obu krawędziach peronowych
  // opisy torów: sam napis nad paskiem toru, na kostce toru (wiersz toru), bez własnej płytki; własna kostka pusta
  const trackLabelY = await page.locator('#desk .t-label text.track-label').evaluateAll((els) => Object.fromEntries(els.map((e) => [e.textContent, +e.getAttribute('y')])));
  expect(trackLabelY).toEqual({ 'tor 1': 7, 'tor 2': 7, 'tor 3': 7 });
  expect(await page.locator('#desk .t-label:has(text.track-label) rect.face').count()).toBe(0);
  expect(await page.locator('#desk .t-blank').count()).toBeGreaterThan(0);
  const trkFont = await page.locator('#desk .t-label text.track-label').first().evaluate((e) => parseFloat(getComputedStyle(e).fontSize));
  const stFont = await page.locator('#desk .t-label text.label:not(.track-label)').first().evaluate((e) => parseFloat(getComputedStyle(e).fontSize));
  expect(trkFont).toBeLessThan(stFont);
  const trkRow = await page.locator('#desk .t-label:has(text.track-label)').evaluateAll((els) => els.map((g) => [g.querySelector('text').textContent, +/,(\d+)\)/.exec(g.getAttribute('transform'))[1] / 40]));
  expect(Object.fromEntries(trkRow)).toEqual({ 'tor 1': 4, 'tor 2': 6, 'tor 3': 8 }); // wiersze torów 1, 2, 3
  expect(trackLabelY['tor 3']).toBeLessThan(12);
  const sigFill = await page.evaluate(() => getComputedStyle(document.querySelector('#desk text.sig-label')).fill);
  expect(sigFill).toBe('rgb(31, 35, 37)');
  for (const [name, ov] of overlaps) expect(ov, `${name} zasłonięte przyciskiem`).toBe(false);
  expect(s.tiles).toBeGreaterThanOrEqual(s.defined); // każda kostka z definicji narysowana
});
