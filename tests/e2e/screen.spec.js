import { test, expect } from '@playwright/test';
import { openShift, tap, simState, advance } from './helpers.js';

/* Stanowisko komputerowe (monitor, Ie-104) – Sopot */

test('pasek poleceń: PRZEBIEG POCIĄGOWY → semafor początkowy → końcowy; niebieska ramka selekcji; H czerwony jako koniec', async ({ page }) => {
  await openShift(page, 'sopot');
  await page.click('.scr-cmdbar button[data-cmd=train]');
  await expect(page.locator('.scr-cmdinfo')).toContainText('wskaż semafor początkowy');
  await tap(page, 'A');
  await expect(page.locator('#status')).toContainText('wskaż koniec przebiegu');
  await expect(page.locator(`.scr-el.signal.selected`)).toHaveCount(1);
  await tap(page, 'H');
  await advance(page, 10);
  const st = await simState(page);
  expect(st.active).toContain('A-H');
  expect(st.signals.A).not.toBe('S1');
  await expect(page.locator('.seg.rt-train')).not.toHaveCount(0);
  const hBody = page.locator('.scr-el.signal', { has: page.locator('text=H') }).first().locator('.sig-body');
  await expect(hBody).toHaveClass(/st-locked/);
});

test('menu elementu: przebieg manewrowy na tor 13 (żółty), STOP gasi, polecenie specjalne Sz z potwierdzeniem i licznikiem, OPS odwołuje', async ({ page }) => {
  await openShift(page, 'sopot');
  await tap(page, 'L501');
  await expect(page.locator('.scr-menu')).toBeVisible();
  await page.click('.scr-menu button:has-text("Przebieg manewrowy")');
  await tap(page, 'kT13');
  await advance(page, 8);
  let st = await simState(page);
  expect(st.active).toContain('L501-kT13m');
  expect(st.signals.L501).toBe('Ms2');
  await expect(page.locator('.seg.rt-shunt')).not.toHaveCount(0);
  // STOP z paska
  await page.click('.scr-cmdbar button[data-cmd=stop]');
  await tap(page, 'L501');
  st = await simState(page);
  expect(st.signals.L501).not.toBe('Ms2');
  // Sz: inicjalizacja, odwołanie OPS, potem WYKONAJ
  await page.click('.scr-cmdbar button[data-cmd=sz]');
  await tap(page, 'B');
  await expect(page.locator('.scr-confirm')).toBeVisible();
  await page.click('.scr-confirm button:has-text("OPS")');
  await expect(page.locator('.scr-confirm')).toBeHidden();
  expect((await simState(page)).counters.Sz).toBe(0);
  await page.click('.scr-cmdbar button[data-cmd=sz]');
  await tap(page, 'B');
  await page.click('.scr-confirm button:has-text("WYKONAJ")');
  st = await simState(page);
  expect(st.signals.B).toBe('Sz');
  expect(st.counters.Sz).toBe(1);
});

test('ekrany: podział wg szerokości, strzałki, przebieg zaczęty na ekranie 1 i zakończony na innym', async ({ page }) => {
  await openShift(page, 'gdynia-chylonia', { settings: { screens: 'auto', sideCollapsed: true } });
  const tabs = page.locator('#screen-tabs button');
  await expect(tabs).toHaveCount(4); // całość + 3 ekrany
  await expect(tabs.nth(1)).toHaveClass(/active/);
  await expect(tabs.nth(1)).toContainText('zachód');
  await expect(tabs.nth(3)).toContainText('wschód');
  const vb1 = await page.getAttribute('#desk svg', 'viewBox');
  await page.keyboard.press('ArrowRight');
  await expect(tabs.nth(2)).toHaveClass(/active/);
  expect(await page.getAttribute('#desk svg', 'viewBox')).not.toBe(vb1);
  await page.keyboard.press('ArrowLeft');
  await page.click('.scr-cmdbar button[data-cmd=train]');
  await tap(page, 'C');
  await page.keyboard.press('ArrowRight');
  await tap(page, 'M2');
  await advance(page, 10);
  expect((await simState(page)).active).toContain('C-M2');
  // wyłączenie podziału w ustawieniach
  await page.click('#btn-menu');
  await page.check('input[name=screens][value=off]');
  await page.keyboard.press('Escape');
  await expect(page.locator('#screen-group')).toBeHidden();
});

test('skala symboli działa na żywo, opisy szlaków i symbole mieszczą się w obrazie, perony narysowane', async ({ page }) => {
  await openShift(page, 'sopot', { settings: { symScale: '1.4', rowScale: '0.7', sideCollapsed: true } });
  const inside = await page.evaluate(() => {
    const svg = document.querySelector('#desk svg');
    const vb = svg.viewBox.baseVal;
    const texts = [...svg.querySelectorAll('.scr-el.end text')];
    return texts.every((t) => { const b = t.getBBox(); const m = t.getCTM(); const x0 = m.a * b.x + m.e, x1 = m.a * (b.x + b.width) + m.e; return x0 >= vb.x && x1 <= vb.x + vb.width; });
  });
  expect(inside).toBe(true);
  expect(await page.locator('rect.platform').count()).toBeGreaterThan(0);
  const before = await page.evaluate(() => document.querySelector('.scr-el.signal').getAttribute('transform'));
  expect(before).toContain('scale(1.4)');
  await page.click('#btn-menu');
  await page.evaluate(() => { const i = document.getElementById('symScale'); i.value = '1'; i.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.keyboard.press('Escape');
  await expect.poll(() => page.evaluate(() => document.querySelector('.scr-el.signal').getAttribute('transform'))).toContain('scale(1)');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('sprk.settings')).symScale)).toBe('1');
});

test('okręgi na monitorze: zakładki GO/GO2, okręg automatu tylko do podglądu, instrukcja opisuje zobrazowanie Ie-104', async ({ page }) => {
  await openShift(page, 'gdynia-glowna', { params: { okreg: 'GO' } });
  await expect(page.locator('#desk-tabs button')).toHaveCount(2);
  await page.click('#desk-tabs button:has-text("GO2")');
  await expect(page.locator('.desk-district[data-district=GO2] svg.screen.readonly')).toBeVisible();
  await expect(page.locator('.desk-district[data-district=GO2] .scr-banner')).toContainText('druga nastawnia');
  await page.click('#btn-help');
  await expect(page.locator('#help')).toContainText('Ie-104');
  await expect(page.locator('#help')).toContainText('Ebilock');
});

test('sygnalizatory na linii toru: symbol w punkcie, gdzie semafor stoi (krawędź kostki w kierunku jazdy), tarcza w Ms1 szara', async ({ page }) => {
  await openShift(page, 'szkolna', { params: { scenariusz: 'zmiana' } });
  const pos = await page.evaluate(() => {
    const st = window.sim.station;
    const CELL = 40;
    const out = {};
    for (const t of st.tiles.filter((x) => x.type === 'signal')) {
      const g = [...document.querySelectorAll('#desk .scr-el.signal')].find((el) => el.querySelector('.sig-label')?.textContent === t.id);
      const m = /translate\(([-\d.]+),([-\d.]+)\)/.exec(g.getAttribute('transform'));
      const expX = t.at.x * CELL + (t.dir === 'E' ? CELL : 0), expY = t.at.y * CELL + CELL / 2;
      out[t.id] = { dx: Math.abs(+m[1] - expX), dy: Math.abs(+m[2] - expY), body: g.querySelector('.sig-body').getAttribute('class'), labelBelow: +g.querySelector('.sig-label').getAttribute('y') > 0, dir: t.dir, kind: t.kind };
    }
    return out;
  });
  for (const [id, p] of Object.entries(pos)) {
    expect(p.dx, `${id}: x`).toBeLessThan(0.01);
    expect(p.dy, `${id}: y na linii toru`).toBeLessThan(0.01);
    expect(p.labelBelow, `${id}: nazwa po prawej stronie w kierunku jazdy`).toBe(p.dir === 'E');
    if (p.kind === 'tm') expect(p.body, `${id}: Ms1 = stan podstawowy`).toContain('st-base');
  }
});

test('blokada na krańcu toru: Eap (Szkolna) – menu Wbl/Poz/Ko, napis „żąd.” i strzałka kierunku; samoczynna (Sopot) – menu Zk bez pozwoleń, liczniki w zakładce Stan', async ({ page }) => {
  await openShift(page, 'szkolna', { params: { scenariusz: 'zmiana' } });
  await expect(page.locator('#desk .scr-el.block')).toHaveCount(0); // brak skrzynki Eap na monitorze
  const exitW = page.locator(`.hit[data-ref*='"id":"kW"']`);
  await advance(page, 3);
  expect(await page.evaluate(() => window.sim.blocks.get('W').request)).toBe('theirs');
  await expect(page.locator('.scr-el.exit').first().locator('.blk-status')).toHaveText('żąd.');
  await exitW.dispatchEvent('pointerdown', { bubbles: true, button: 0, clientX: 60, clientY: 200 });
  await expect(page.locator('.scr-menu h5')).toContainText('Eap');
  await expect(page.locator('.scr-menu button:has-text("(Zk)")')).toHaveCount(0);
  await page.click('.scr-menu button:has-text("(Poz)")');
  expect(await page.evaluate(() => window.sim.blocks.get('W').direction)).toBe('in');
  await expect(page.locator('.scr-el.exit').first().locator('.blk-status')).toHaveText('');
  const dirs = await page.evaluate(() => [...document.querySelector(`.hit[data-ref*='"id":"kW"']`).closest('.scr-el').querySelectorAll('.blk-dir')].map((e) => e.getAttribute('class')));
  expect(dirs[0]).toContain('off'); // strzałka „wyjazd” zgaszona
  expect(dirs[1]).not.toContain('off'); // strzałka „wjazd” świeci po Poz
  // Sopot: linia 202 z blokadą samoczynną
  await openShift(page, 'sopot', { params: { scenariusz: 'zmiana' } });
  await page.locator(`.hit[data-ref*='"id":"kOR1"']`).dispatchEvent('pointerdown', { bubbles: true, button: 0, clientX: 300, clientY: 300 });
  await expect(page.locator('.scr-menu h5')).toContainText('samoczynna');
  await expect(page.locator('.scr-menu button:has-text("(Poz)")')).toHaveCount(0);
  await expect(page.locator('.scr-menu button:has-text("(Zk)")')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await page.click('#side .tabs button[data-tab=stan]');
  await expect(page.locator('#counters')).toContainText('dPo');
});
