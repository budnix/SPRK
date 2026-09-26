import { test, expect } from '@playwright/test';
import { openShift, btn, simState, advance } from './helpers.js';

/* Pulpit kostkowy (urządzenia typu E) – Stare Pustkowie */

test('ekran startowy bez parametrów: misje u góry, posterunki alfabetycznie / wg trudności, wybór posterunku rozwija parametry i startuje zmianę', async ({ page }) => {
  await page.goto('/', { waitUntil: 'networkidle' });
  await expect(page.locator('#start')).toBeVisible();
  // misje przed listą posterunków
  const order = await page.evaluate(() => [...document.querySelectorAll('.st-missions, .st-stations')].map((e) => e.className));
  expect(order).toEqual(['st-missions', 'st-stations']);
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
  await expect(page.locator('#st-briefing')).toBeHidden();
  expect(await page.locator('.st-card .st-thumb svg path').count()).toBeGreaterThan(0); // miniatury planów
  await page.click('.st-card[data-id=sopot]');
  await expect(page.locator('#st-briefing')).toBeVisible();
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
  expect(s.tiles).toBeGreaterThanOrEqual(s.defined); // każda kostka z definicji narysowana
});
