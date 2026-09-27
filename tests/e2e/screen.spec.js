import { test, expect } from '@playwright/test';
import { openShift, tap, hit, simState, advance } from './helpers.js';

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
  await page.click('.scr-menu button:has-text("przebiegu manewrowego")');
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
  expect(await page.locator('line.platform-edge').count()).toBe(2 * await page.locator('rect.platform.island').count() + await page.locator('rect.platform.side').count()); // krawędź peronowa – podwójna kreska
  await expect(page.locator('text.platform-label').first()).toHaveText(/Peron II|Peron I/); // nazwa peronu na prostokącie
  // numery torów w ramkach na linii toru, opisy „tor N” nie są dublowane
  expect((await page.locator('.trk-no .trk-no-text').allTextContents()).sort()).toEqual(['tor 1', 'tor 13', 'tor 1a', 'tor 2', 'tor 2a', 'tor 4', 'tor 4a', 'tor 4b', 'tor 501', 'tor 502', 'tor 6', 'tor 6a', 'tor 6b']);
  // ramka numeru toru i napis peronu wycentrowane: tekst w środku ramki / prostokąta (w układzie SVG)
  const centred = await page.evaluate(() => {
    const out = [];
    for (const g of document.querySelectorAll('.trk-no')) { const r = g.querySelector('rect').getBBox(), t = g.querySelector('text').getBBox(); out.push([Math.abs((r.x + r.width / 2) - (t.x + t.width / 2)), Math.abs((r.y + r.height / 2) - (t.y + t.height / 2))]); }
    const rects = [...document.querySelectorAll('rect.platform')], texts = [...document.querySelectorAll('text.platform-label')];
    rects.forEach((r, i) => { const rb = r.getBBox(), tb = texts[i].getBBox(); out.push([Math.abs((rb.x + rb.width / 2) - (tb.x + tb.width / 2)), Math.abs((rb.y + rb.height / 2) - (tb.y + tb.height / 2))]); });
    return out;
  });
  for (const [dx, dy] of centred) { expect(dx).toBeLessThan(2.5); expect(dy).toBeLessThan(2.5); } // tolerancja ~6 % kostki: obrys glifów a linia bazowa czcionki
  expect(await page.locator('.scr-label', { hasText: /^tor \d/ }).count()).toBe(0);
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

test('domyślna skala symboli monitora to 125 % (bez zapisanych ustawień), zapisane ustawienie ma pierwszeństwo', async ({ page }) => {
  await page.goto('/?stacja=szkolna&scenariusz=zmiana&zaklocenia=none', { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.removeItem('sprk.settings')); // nowy użytkownik – bez zapisanych ustawień
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.sim && document.querySelector('#desk svg'));
  expect(await page.evaluate(() => document.querySelector('.scr-el.signal').getAttribute('transform'))).toContain('scale(1.25)');
  await page.click('#btn-menu');
  await expect(page.locator('#symScale')).toHaveValue('1.25');
  await expect(page.locator('output[for=symScale]')).toHaveText('125%');
  // pozostałe domyślne: pulpit na środku, motyw wg systemu, podział na ekrany, odstęp normalny, stanowisko wg stacji, panel na dole
  await expect(page.locator('#app')).toHaveAttribute('data-side-pos', 'bottom');
  for (const [name, value] of [['deskPos', 'middle'], ['theme', 'system'], ['screens', 'auto'], ['rowScale', '1'], ['srk', 'auto'], ['sidePos', 'bottom']]) {
    await expect(page.locator(`input[name=${name}][value="${value}"]`), name).toBeChecked();
  }
  // motyw wg systemu: ciemny tryb systemu → ciemny, jasny → jasny (także na żywo, bez przeładowania)
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.check('input[name=theme][value=dark]');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  // użytkownik z zapisaną skalą 100 % zostaje przy swojej
  await openShift(page, 'szkolna', { params: { scenariusz: 'zmiana' }, settings: { symScale: '1' } });
  expect(await page.evaluate(() => document.querySelector('.scr-el.signal').getAttribute('transform'))).toContain('scale(1)');
});

test('monitor: semafor A i tarcza Tm1 w tym samym punkcie toru (Orłowo) są oba widoczne i klikalne – każdy otwiera własne menu', async ({ page }) => {
  await openShift(page, 'gdynia-orlowo', { settings: { screens: 'off' } });
  // rozkład: etykieta kategorii (IC/R/SKM…) przy numerze i pełna relacja, sąsiednie posterunki w drugiej linii
  await expect(page.locator('table.rj td.nr .cat').first()).toBeVisible();
  const icRow = page.locator('table.rj tr', { hasText: 'Kraków Gł. – Gdynia Gł.' }).first();
  await expect(icRow.locator('td.nr .cat')).toHaveText('IC');
  await expect(icRow.locator('td.rel .via')).toContainText('Sopot');
  for (const [id, title] of [['A', 'Semafor A'], ['Tm1', 'Tarcza manewrowa Tm1']]) {
    const box = await hit(page, id).boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2); // prawdziwe kliknięcie w środek symbolu, nie zdarzenie na elemencie
    await expect(page.locator('.scr-menu')).toBeVisible();
    await expect(page.locator('.scr-menu .scr-menu-title, .scr-menu h4, .scr-menu').first()).toContainText(title);
    await page.keyboard.press('Escape');
  }
});

test('komunikat stanu jest nakładką nad paskiem narzędzi: długi tekst nie zawija paska i nie przesuwa pulpitu', async ({ page }) => {
  await openShift(page, 'sopot', { settings: { sideCollapsed: true, screens: 'auto' } });
  const deskBefore = await page.locator('#desk').boundingBox();
  const toolsBefore = await page.locator('#desk-tools').boundingBox();
  await expect(page.locator('#status')).toBeHidden(); // pusty komunikat nie rysuje ramki
  await page.evaluate(() => window.sim.bus.emit('log', { time: 0, level: 'warn', msg: 'Sopot: pociąg 55102 opóźniony ok. 5 min – '.repeat(8) }));
  const status = page.locator('#status');
  await expect(status).toBeVisible();
  await expect(status).toHaveClass(/lv-warn/);
  const s = await status.boundingBox();
  const deskAfter = await page.locator('#desk').boundingBox();
  const toolsAfter = await page.locator('#desk-tools').boundingBox();
  expect(deskAfter).toEqual(deskBefore); // pulpit stoi w miejscu
  expect(toolsAfter.height).toBe(toolsBefore.height); // pasek nie urósł o wiersz
  expect(s.y + s.height).toBeLessThanOrEqual(toolsAfter.y + 1); // komunikat leży nad paskiem, w obszarze pulpitu
  expect(s.width).toBeLessThanOrEqual(toolsAfter.width);
  // uzbrojenie przebiegu też nie rusza pulpitu
  await page.click('.scr-cmdbar button[data-cmd=train]');
  await tap(page, 'A');
  await expect(status).toContainText('wskaż koniec przebiegu');
  expect(await page.locator('#desk').boundingBox()).toEqual(deskBefore);
});

test('łączność: lista „Do” rozróżnia tory szlakowe do tego samego posterunku (Orłowo: Sopot – 202 t.1 / t.2), bez powtórzonych wpisów', async ({ page }) => {
  await openShift(page, 'gdynia-orlowo');
  const texts = await page.locator('#comms-to option').allTextContents();
  expect(new Set(texts).size).toBe(texts.length);
  expect(texts).toContain('Sopot (posterunek) – 202 t.1');
  expect(texts).toContain('Sopot (posterunek) – 202 t.2');
  expect(texts).toContain('Gdynia Główna SKM (posterunek) – 250 t.501');
  expect(texts.at(-1)).toBe('maszynista (radio)');
});
