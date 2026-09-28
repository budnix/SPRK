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
  await page.click('#btn-menu'); await page.click('#menu-settings');
  await page.check('#settings input[name=screens][value=off]');
  await page.keyboard.press('Escape');
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

test('Gdynia Główna: jedno stanowisko na całą stację – bez zakładek okręgów, bez wyboru okręgu, bez zakładki „Polecenia”; instrukcja opisuje zobrazowanie Ie-104', async ({ page }) => {
  await openShift(page, 'gdynia-glowna');
  await expect(page.locator('#desk-tabs')).toBeHidden();
  expect(await page.locator('#desk svg.screen').count()).toBe(1);
  expect(await page.locator('#desk svg.screen.readonly').count()).toBe(0);
  await expect(page.locator('#panel-tabs button[data-tab=polecenia]')).toBeHidden();
  await expect(page.locator('#station-name')).not.toContainText('GO');
  await page.click('#btn-help');
  await expect(page.locator('#help')).toContainText('Ie-104');
  await expect(page.locator('#help')).toContainText('Ebilock');
  await expect(page.locator('#help')).not.toContainText('Okręgi nastawcze');
  await page.keyboard.press('Escape');
  await page.click('#btn-menu'); await page.click('#menu-new');
  await page.click('.st-card[data-id=gdynia-glowna]');
  await expect(page.locator('#st-district-wrap')).toBeHidden();
  await expect(page.locator('.st-card[data-id=gdynia-glowna] .st-srk', { hasText: 'dwa okręgi' })).toHaveCount(0);
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
  await page.click('#panel-tabs button[data-tab=stan]');
  await expect(page.locator('#counters')).toContainText('dPo');
});

test('domyślna skala symboli monitora to 125 % (bez zapisanych ustawień), zapisane ustawienie ma pierwszeństwo', async ({ page }) => {
  await page.goto('/?stacja=szkolna&scenariusz=zmiana&zaklocenia=none', { waitUntil: 'load' });
  await page.evaluate(() => localStorage.removeItem('sprk.settings')); // nowy użytkownik – bez zapisanych ustawień
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.sim && document.querySelector('#desk svg'));
  expect(await page.evaluate(() => document.querySelector('.scr-el.signal').getAttribute('transform'))).toContain('scale(1.25)');
  await page.click('#btn-menu'); await page.click('#menu-settings');
  await expect(page.locator('#symScale')).toHaveValue('1.25');
  await expect(page.locator('output[for=symScale]')).toHaveText('125%');
  // pozostałe domyślne: pulpit na środku, motyw wg systemu, podział na ekrany, odstęp normalny, panel na dole
  await expect(page.locator('#app')).toHaveAttribute('data-side-pos', 'bottom');
  for (const [name, value] of [['deskPos', 'middle'], ['theme', 'system'], ['screens', 'auto'], ['rowScale', '1'], ['sidePos', 'bottom']]) {
    await expect(page.locator(`#settings input[name=${name}][value="${value}"]`), name).toBeChecked();
  }
  // motyw wg systemu: ciemny tryb systemu → ciemny, jasny → jasny (także na żywo, bez przeładowania)
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.check('#settings input[name=theme][value=dark]');
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
  await expect(icRow.locator('td.rel .via')).toContainText('Sopot – 202 t.1 → Gdynia Gł. – 202 t.1'); // tory szlakowe z etykiet wyjazdów
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

test('monitor: menu strzałki szlaku ma pod separatorem czerwone kasetki numerów – pociąg na szlaku, dalej kolejka zgłoszonych u sąsiada', async ({ page }) => {
  await openShift(page, 'gdynia-orlowo', { settings: { sideCollapsed: true } });
  const open = async (id) => { await page.keyboard.press('Escape'); await tap(page, `k${id}`); await expect(page.locator('.scr-menu')).toBeVisible(); };
  const badges = page.locator('.scr-menu .menu-train');
  await open('S501');
  // start zmiany: sąsiad już zgłosił pierwszy SKM (kolejka – kontur), na szlaku nikogo nie ma
  await expect(badges).toHaveText(['92101']);
  await expect(badges.first()).toHaveClass(/queued/);
  expect(await page.locator('.scr-menu > *').last().getAttribute('class')).toBe('menu-trains'); // kasetki na końcu, polecenia wyżej
  expect(await page.locator('.scr-menu hr').count()).toBe(1);
  await open('Z1'); // tor wyjazdowy do Gdyni: nikt
  await expect(badges).toHaveCount(0);
  await expect(page.locator('.scr-menu .menu-trains')).toHaveText('–');
  // pierwszy pociąg od Sopotu – krokujemy, aż sąsiad go wyprawi
  const exit = await page.evaluate(() => {
    const s = window.sim; s.clock.paused = false; s.clock.speed = 1;
    for (let i = 0; i < 4000; i++) { s.step(0.5); for (const b of s.blocks.values()) if (b.lineTrain != null) { s.clock.paused = true; return { id: b.id, nr: String(b.lineTrain) }; } }
    return null;
  });
  expect(exit).not.toBeNull();
  await open(exit.id);
  await expect(badges.first()).toHaveText(exit.nr);
  await expect(badges.first()).not.toHaveClass(/queued/); // pełna czerwona kasetka = na szlaku
  await expect(badges.first()).toHaveAttribute('title', /na szlaku.*do nas/);
  await expect(page.locator('.scr-menu button').first()).toContainText('(Zk)'); // polecenia zostają u góry
  await expect(page.locator('.scr-el.exit .scr-train')).toHaveCount(0); // bez kasetki przy strzałce na ekranie
  // po zjeździe pociągu w całości znika z kasetek
  await page.evaluate((id) => { const s = window.sim; s.clock.paused = false; for (let i = 0; i < 4000 && s.blocks.get(id).lineTrain != null; i++) s.step(0.5); s.clock.paused = true; }, exit.id);
  await open(exit.id);
  await expect(page.locator('.scr-menu .menu-train:not(.queued)')).toHaveCount(0);
});

test('monitor: przebieg złożony – semafor początkowy i strzałka szlaku za semaforem pośrednim (Chylonia G502 → Cisowa) nastawiają oba przebiegi', async ({ page }) => {
  await openShift(page, 'gdynia-chylonia', { settings: { sideCollapsed: true } });
  await page.click('.scr-cmdbar button[data-cmd=train]');
  await tap(page, 'G502');
  await expect(page.locator('#status')).toContainText('wskaż koniec przebiegu');
  await tap(page, 'kRS1');
  await advance(page, 60);
  const st = await simState(page);
  expect(st.active).toContain('G502-A502');
  expect(st.active).toContain('A502-RS1');
  expect(st.signals.G502).not.toBe('S1');
  expect(st.signals.A502).not.toBe('S1');
});

test('monitor wydaje polecenia wprost: Zw, Zz, Pz i blokada z menu nie naciskają przycisków grupowych pulpitu typu E', async ({ page }) => {
  await openShift(page, 'szkolna');
  await page.evaluate(() => { window.__buttons = []; window.sim.bus.on('button', (e) => window.__buttons.push(e.ref.kind)); });
  // przebieg z menu elementu, potem zwolnienie (Pz) z paska poleceń
  await tap(page, 'A');
  await page.click('.scr-menu button:has-text("przebiegu pociągowego")');
  await tap(page, 'D1');
  await advance(page, 8);
  expect((await simState(page)).active).toContain('A-D1');
  await page.click('.scr-cmdbar button[data-cmd=pz]');
  await tap(page, 'A');
  expect((await simState(page)).active).not.toContain('A-D1');
  // zwrotnica: przestawienie (Zw) z paska, zamknięcie indywidualne (Zz) z menu z potwierdzeniem
  const before = (await simState(page)).points.Zw1;
  await page.click('.scr-cmdbar button[data-cmd=zw]');
  await tap(page, 'Zw1');
  await advance(page, 6);
  expect((await simState(page)).points.Zw1).not.toBe(before);
  await tap(page, 'Zw1');
  await page.click('.scr-menu button:has-text("(Zz)")');
  await page.click('.scr-confirm button:has-text("WYKONAJ")');
  expect(await page.evaluate(() => window.sim.ilk.points.get('Zw1').individualLock)).toBe(true);
  // blokada liniowa z menu strzałki szlaku
  await tap(page, 'kE');
  await page.click('.scr-menu button:has-text("(Wbl)")');
  expect(await page.evaluate(() => window.sim.blocks.get('E').request)).toBe('ours');
  // jedyne „przyciski” to wskazanie początku i końca przebiegu (semafory) – żadnego grupowego
  const kinds = await page.evaluate(() => window.__buttons);
  expect(kinds).not.toContain('group');
  expect(kinds.filter((k) => k === 'signal').length).toBe(2);
  expect((await simState(page)).armed).toBe(null);
});

test('pasek polecenia specjalnego mieści się na tablecie: przyciski w jednej linii, napisy w przyciskach, pasek w oknie', async ({ page }) => {
  for (const size of [{ width: 820, height: 1180 }, { width: 1024, height: 1366 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(size);
    await openShift(page, 'szkolna', { params: { scenariusz: 'zmiana' } });
    await page.click('.scr-cmdbar button[data-cmd=zz]');
    await tap(page, 'Zw3');
    const bar = page.locator('.scr-confirm');
    await expect(bar).toBeVisible();
    const m = await bar.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const buttons = [...el.querySelectorAll('button')].map((b) => {
        const q = b.getBoundingClientRect(), range = document.createRange();
        range.selectNodeContents(b);
        const tx = range.getBoundingClientRect(), c = getComputedStyle(b);
        return { text: b.textContent, height: Math.round(q.height), lines: Math.round(tx.height / parseFloat(c.lineHeight) || tx.height / (parseFloat(c.fontSize) * 1.2)), padLeft: Math.round(tx.left - q.left), padRight: Math.round(q.right - tx.right), top: Math.round(q.top) };
      });
      return { inWindow: r.left >= 8 && r.right <= innerWidth - 8 && r.bottom <= innerHeight, buttons };
    });
    expect(m.inWindow, JSON.stringify(size)).toBe(true);
    for (const b of m.buttons) {
      expect(b.lines, `${b.text} @${size.width}`).toBeLessThanOrEqual(1);
      expect(b.padLeft, `${b.text} @${size.width}`).toBeGreaterThanOrEqual(10);
      expect(b.padRight, `${b.text} @${size.width}`).toBeGreaterThanOrEqual(10);
      expect(b.height, `${b.text} @${size.width}`).toBeGreaterThanOrEqual(32); // wygodny cel dla palca
    }
    expect(m.buttons[0].top).toBe(m.buttons[1].top);
    expect(m.buttons[0].height).toBe(m.buttons[1].height);
  }
});
