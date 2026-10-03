import { test, expect } from '@playwright/test';
import { advance } from './helpers.js';

/* Służba o wybranej porze i długości: wybór na stronie posterunku → zmiana z rozkładem zbudowanym dla tej pory. */

const sim = (page) => page.evaluate(() => {
  const s = window.sim, tt = s.traffic.timetable();
  return { name: s.scenario.name, id: s.scenario.id, start: s.scenario.startTime, end: s.scenario.endTime, srk: s.srk?.id, n: tt.length, clock: Math.floor(s.clock.time),
    times: tt.map((e) => e.arr ?? e.dep), tow: tt.filter((e) => e.kind === 'tow').length, title: document.getElementById('station-name').textContent };
});
const ready = (page) => page.waitForFunction(() => window.sim && document.querySelector('#desk svg'));

test('strona posterunku: godzina startu i długość służby, opis pory z liczbą pociągów; start – zmiana z rozkładem tej pory; kafelek ostatniej zmiany', async ({ page }) => {
  await page.goto('/#/stacja/sopot', { waitUntil: 'load' });
  // zwykłe zmiany zastępuje służba; scenariusz z usterką zostaje; jedno stanowisko – bez wyboru stanowiska
  expect(await page.locator('#st-scenario option').allTextContents()).toEqual(['Służba – wybierz porę i długość', 'Usterka blokady od Gdańska']);
  await expect(page.locator('#st-srk-wrap')).toBeHidden();
  await expect(page.locator('#st-duty-start option')).toHaveCount(24);
  await expect(page.locator('#st-duty-start')).toHaveValue('6');
  await expect(page.locator('#st-duty-minutes button.active')).toHaveText('2 godz.');
  await expect(page.locator('#st-scenario-desc')).toContainText('Szczyt poranny');
  // każda długość od każdej godziny – służba może przejść przez północ
  await page.selectOption('#st-duty-start', '23');
  await expect(page.locator('#st-duty-minutes button:disabled')).toHaveCount(0);
  await expect(page.locator('#st-duty-minutes button.active')).toHaveText('2 godz.');
  await page.selectOption('#st-duty-start', '22');
  await page.click('#st-duty-minutes button[data-minutes="120"]');
  await expect(page.locator('#st-duty-minutes button[data-minutes="120"]')).toHaveAttribute('aria-pressed', 'true');
  // ziarno wpisane w „Zaawansowane” – opis pokazuje rozkład, który powstanie
  await page.locator('.st-adv summary').click();
  await page.fill('#st-seed', '5');
  const desc = await page.locator('#st-scenario-desc').textContent();
  expect(desc).toContain('Późny wieczór');
  const count = Number(/Pociągi w tej służbie: (\d+)/.exec(desc)[1]);
  expect(count).toBeGreaterThan(0);
  await page.selectOption('#st-level', 'none');
  await page.click('#st-go');
  await page.waitForURL(/scenariusz=sluzba/);
  const url = new URL(page.url());
  expect(Object.fromEntries(url.searchParams)).toMatchObject({ stacja: 'sopot', scenariusz: 'sluzba', start: '22', czas: '120', seed: '5', zaklocenia: 'none' });
  expect(url.searchParams.has('srk')).toBe(false);
  await ready(page);
  const s = await sim(page);
  expect(s).toMatchObject({ name: 'Służba 22:00–00:00', id: 'sluzba-120', start: '22:00', end: '24:00', n: count, title: 'Sopot · Służba 22:00–00:00' });
  expect(s.clock).toBeGreaterThanOrEqual(22 * 3600);
  expect(s.times.every((t) => t >= '22:03' && t <= '23:50')).toBe(true);
  expect(s.tow).toBeGreaterThan(0); // późnym wieczorem jadą już pociągi towarowe (Sopot we wzorcu nie ma żadnego)
  // koniec zmiany: wynik zapisany osobno dla długości służby; kafelek „Ostatnia zmiana” z godzinami służby
  await page.evaluate(() => window.sim.endShift());
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('sprk.progress')));
  expect(Object.keys(saved.stations.sopot)).toEqual(['sluzba-120']);
  await page.click('#rp-new');
  await page.click('#start .st-logo');
  await expect(page.locator('#st-last')).toContainText('Sopot');
  await expect(page.locator('#st-last')).toContainText('Służba 22:00–00:00');
  await page.click('#st-last');
  await page.waitForURL(/scenariusz=sluzba.*start=22/);
  await ready(page);
  expect((await sim(page)).times).toEqual(s.times); // to samo ziarno – ta sama służba
});

test('strona posterunku: stanowisko do wyboru (Rumia) dla służby i scenariusza specjalnego, scenariusz specjalny bez pory, krótka służba ma pociągi', async ({ page }) => {
  await page.goto('/#/stacja/rumia', { waitUntil: 'load' });
  await expect(page.locator('#st-srk-wrap')).toBeVisible();
  // scenariusz specjalny bez własnego stanowiska – wybór stanowiska zostaje i nie gubi się przy zmianie scenariusza
  await page.selectOption('#st-srk', 'komputerowe');
  await page.selectOption('#st-scenario', 'usterka-rd2');
  await expect(page.locator('#st-srk-wrap')).toBeVisible();
  await expect(page.locator('#st-duty')).toBeHidden();
  await page.selectOption('#st-scenario', 'sluzba');
  await expect(page.locator('#st-srk-wrap')).toBeVisible();
  await expect(page.locator('#st-srk')).toHaveValue('komputerowe');
  await page.selectOption('#st-duty-start', '1');
  // długość z klawiatury: fokus zostaje na wybranym przycisku (przyciski nie są rysowane od nowa)
  await page.focus('#st-duty-minutes button[data-minutes="60"]');
  await page.keyboard.press('Enter');
  await expect(page.locator('#st-duty-minutes button[data-minutes="60"]')).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => document.activeElement?.dataset.minutes)).toBe('60');
  await expect(page.locator('#st-scenario-desc')).toContainText('Noc');
  await page.click('#st-go');
  await page.waitForURL(/scenariusz=sluzba.*srk=komputerowe/);
  await ready(page);
  const s = await sim(page);
  expect(s).toMatchObject({ name: 'Służba 01:00–02:00', srk: 'komputerowe' });
  expect(s.tow).toBeGreaterThanOrEqual(s.n - 1); // w środku nocy pociągi towarowe (najwyżej jeden dalekobieżny)
  // scenariusz specjalny: bez wyboru pory, poziom zakłóceń wg scenariusza
  await page.goto('/#/stacja/sopot', { waitUntil: 'load' });
  await page.selectOption('#st-scenario', 'usterka-gd');
  await expect(page.locator('#st-duty')).toBeHidden();
  await expect(page.locator('#st-scenario-desc')).toContainText('zapowiadanie telefoniczne');
  await expect(page.locator('#st-level')).toBeDisabled();
  await page.selectOption('#st-scenario', 'sluzba');
  await expect(page.locator('#st-duty')).toBeVisible();
  await expect(page.locator('#st-level')).toBeEnabled();
  await page.selectOption('#st-scenario', 'usterka-gd');
  await page.click('#st-go');
  await page.waitForURL(/scenariusz=usterka-gd/);
  expect(new URL(page.url()).searchParams.has('start')).toBe(false);
  // Rumia: scenariusz specjalny na wybranym stanowisku – stanowisko w adresie, zmiana na monitorze; bez zmiany wyboru
  // – na stanowisku domyślnym (pulpit typu E)
  await page.goto('/#/stacja/rumia', { waitUntil: 'load' });
  await page.selectOption('#st-srk', 'komputerowe');
  await page.selectOption('#st-scenario', 'usterka-rd2');
  await page.click('#st-go');
  await page.waitForURL(/scenariusz=usterka-rd2.*srk=komputerowe/);
  expect(new URL(page.url()).searchParams.has('start')).toBe(false);
  await ready(page);
  expect(await sim(page)).toMatchObject({ id: 'usterka-rd2', srk: 'komputerowe' });
  await page.goto('/#/stacja/rumia', { waitUntil: 'load' });
  await page.selectOption('#st-scenario', 'usterka-rd2');
  await page.selectOption('#st-srk', 'E');
  await page.click('#st-go');
  await page.waitForURL(/scenariusz=usterka-rd2.*srk=E/);
  await ready(page);
  expect((await sim(page)).srk).toBe('E');
  // najkrótsza służba w szczycie (Pruszcz 06:00, 1 godz., ziarno 2) i najdłuższa (5 godz.): start działa
  await page.goto('/#/stacja/pruszcz-gdanski', { waitUntil: 'load' });
  await page.locator('.st-adv summary').click();
  await page.fill('#st-seed', '2');
  await expect(page.locator('#st-duty-minutes button')).toHaveText(['1 godz.', '2 godz.', '3 godz.', '5 godz.']);
  await page.click('#st-duty-minutes button[data-minutes="60"]');
  await expect(page.locator('#st-go')).toBeEnabled();
  await page.click('#st-duty-minutes button[data-minutes="300"]');
  await expect(page.locator('#st-go')).toBeEnabled();
});

test('służba przez północ (23:00, 3 godz.): rozkład i zegar pokazują 00:…, 01:…, zmiana trwa dalej i kończy się o 02:00', async ({ page }) => {
  await page.goto('/#/stacja/sopot', { waitUntil: 'load' });
  await page.selectOption('#st-duty-start', '23');
  await page.click('#st-duty-minutes button[data-minutes="180"]');
  await page.locator('.st-adv summary').click();
  await page.fill('#st-seed', '4');
  await page.selectOption('#st-level', 'none');
  await page.click('#st-go');
  await page.waitForURL(/scenariusz=sluzba.*start=23.*czas=180/);
  await ready(page);
  const s = await sim(page);
  expect(s).toMatchObject({ name: 'Służba 23:00–02:00', id: 'sluzba-180', start: '23:00', end: '26:00', title: 'Sopot · Służba 23:00–02:00' });
  // godziny w rozkładzie jak na zegarze (bez „24:…”), w kolejności jazdy: po 23:… idą 00:… i 01:…
  expect(s.times.every((t) => /^(23|00|01):\d\d$/.test(t))).toBe(true);
  const firstAfter = s.times.findIndex((t) => !t.startsWith('23'));
  expect(firstAfter).toBeGreaterThan(0);
  expect(s.times.slice(firstAfter).every((t) => !t.startsWith('23'))).toBe(true);
  await page.click('#panel-tabs button[data-tab=rj]');
  await expect(page.locator('table.rj')).toContainText('00:');
  await expect(page.locator('table.rj')).not.toContainText('24:');
  // zegar przechodzi przez północ, zmiana trwa dalej
  await page.evaluate(() => { window.sim.clock.paused = true; });
  await advance(page, 70 * 60);
  const after = await page.evaluate(() => ({ time: window.sim.clock.time, ended: window.sim.ended, clock: document.querySelector('#clock').textContent }));
  expect(after.time).toBeGreaterThan(24 * 3600);
  expect(after.ended).toBe(false);
  expect(after.clock).toMatch(/^00:1\d/);
});
