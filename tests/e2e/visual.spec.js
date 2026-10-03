import { test, expect } from '@playwright/test';
import { openShift, advance } from './helpers.js';

/* Regresja wizualna: wzorce w tests/e2e/__screenshots__; aktualizacja: npm run test:e2e:update – na komputerze
   (macOS, Linux, Windows), bez kontenera. Zrzuty mają stałe wymiary (wycinek strony od lewego górnego rogu elementu).
   Litery są na zrzucie przezroczyste (miejsce zostaje): ta sama czcionka (Inter z src/fonts) jest rasteryzowana inaczej
   na każdym systemie (CoreText / FreeType / DirectWrite), a układ, kształty i barwy – tak samo. Treść napisów
   sprawdzają asercje toHaveText w testach zachowania. */

/** Litery przezroczyste – tekst HTML, pola i napisy SVG; ramki, tła, ikony (currentColor) zostają. */
const HIDE_GLYPHS = `* { -webkit-text-fill-color: transparent !important; text-shadow: none !important; caret-color: transparent !important; }
  ::placeholder { color: transparent !important; }
  svg text, svg tspan { fill: transparent !important; stroke: transparent !important; }`;

async function shot(page, selector, width, height) {
  await page.waitForFunction(() => !document.getElementById('boot')); // ekran wczytywania zdjęty
  await page.addStyleTag({ content: HIDE_GLYPHS });
  // miganie monitora to przełączana klasa (wspólna faza, Ie-104.1 §4 ust. 17) – zatrzymana w fazie jasnej przed zrzutem
  await page.evaluate(() => { if (window.desk?.blinkTimer) { clearInterval(window.desk.blinkTimer); window.desk.blinkTimer = null; } document.querySelector('#desk svg')?.classList.remove('ph'); window.desk?.inner?.setAttribute('data-ph', '0'); });
  const r = await page.locator(selector).boundingBox();
  return page.screenshot({ clip: { x: Math.round(r.x), y: Math.round(r.y), width, height } });
}

test('wygląd pulpitu kostkowego (Szkolna, typ E) po nastawieniu przebiegu', async ({ page }) => {
  await openShift(page, 'szkolna', { settings: { sideCollapsed: true }, params: { scenariusz: 'zmiana-e' } });
  await page.evaluate(() => { window.sim.press({ kind: 'signal', id: 'A', color: 'green' }); window.sim.press({ kind: 'signal', id: 'D1', color: 'green' }); });
  // zegar zatrzymany (openShift) – krok symulacji przez advance, inaczej przebieg zostaje w nastawianiu
  await advance(page, 10);
  expect(await page.evaluate(() => [window.sim.ilk.routeIsSet('A-D1'), window.sim.ilk.signals.get('A').aspect])).toEqual([true, 'S5']);
  await page.waitForTimeout(200);
  expect(await shot(page, '#desk', 1000, 640)).toMatchSnapshot('desk-szkolna.png');
});

test('wygląd monitora (Sopot, ekran zachodni) z przebiegiem pociągowym i manewrowym', async ({ page }) => {
  await openShift(page, 'sopot', { settings: { sideCollapsed: true, screens: 'auto' } });
  await page.evaluate(() => {
    const s = window.sim;
    s.press({ kind: 'signal', id: 'A', color: 'green' }); s.press({ kind: 'signal', id: 'H', color: 'green' });
    s.press({ kind: 'signal', id: 'L501', color: 'white' }); s.press({ kind: 'end', id: 'kT13' });
  });
  // zegar zatrzymany (openShift) – kroki symulacji przez advance, inaczej przebiegi zostają w nastawianiu
  await advance(page, 10);
  expect(await page.evaluate(() => window.sim.ilk.routesSet().filter((x) => x.state !== 'setting').length)).toBe(2);
  await page.waitForTimeout(200);
  expect(await shot(page, '#desk', 1000, 640)).toMatchSnapshot('screen-sopot-zachod.png');
  expect(await shot(page, '#desk-tools', 1000, 40)).toMatchSnapshot('toolbar.png');
});

test('wygląd pulpitu typu IZH-111 (Szkolna): przebieg utwierdzony, wybrany adres zwrotnicy, grupa rozkazów', async ({ page }) => {
  await openShift(page, 'szkolna', { settings: { sideCollapsed: true }, params: { scenariusz: 'zmiana-izh' } });
  await page.evaluate(() => {
    const s = window.sim;
    s.press({ kind: 'signal', id: 'A' }); s.press({ kind: 'signal', id: 'D2' }); s.press({ kind: 'order', id: 'P' });
  });
  await advance(page, 10); // zegar zatrzymany – kroki przez advance, inaczej przebieg zostaje w nastawianiu
  expect(await page.evaluate(() => [window.sim.ilk.routeIsSet('A-D2'), window.sim.ilk.signals.get('A').aspect !== 'S1'])).toEqual([true, true]);
  await page.evaluate(() => window.sim.press({ kind: 'point', id: 'Zw4' }));
  await page.waitForTimeout(200);
  expect(await shot(page, '#desk', 1000, 640)).toMatchSnapshot('desk-izh-szkolna.png');
  expect(await shot(page, '.izh-orders', 1000, 38)).toMatchSnapshot('izh-orders.png');
});

test('wygląd nastawni mechanicznej (Szkolna): dźwignie przełożone, drążek, blok zablokowany, sygnał zezwalający', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 960 }); // ława z dźwigniami (8 rzędów pod planem) mieści się w kadrze
  await openShift(page, 'szkolna', { settings: { sideCollapsed: true }, params: { scenariusz: 'zmiana-mech' } });
  await page.evaluate(() => {
    const s = window.sim;
    s.clock.paused = false; // kroki symulacji idą tylko przy puszczonym zegarze
    const r = s.ilk.routes.get('A-D2');
    for (const q of [...r.points, ...r.flank]) s.execute({ type: 'point', id: q.id, position: q.position });
    for (let i = 0; i < 6; i++) s.step(0.5);
    s.execute({ type: 'route', id: 'A-D2' }); s.execute({ type: 'route-block', signal: 'A' }); s.execute({ type: 'clear', signal: 'A', aspect: 'Sr3' });
    s.execute({ type: 'route-half', id: 'B-C1' }); // drążek b w położeniu pośrednim
    for (let i = 0; i < 4; i++) s.step(0.5);
    s.clock.paused = true;
    return { route: !!s.ilk.routeFrame('A-D2')?.lever, aspect: s.ilk.signals.get('A').aspect };
  }).then((st) => expect(st.route && st.aspect === 'Sr3').toBe(true));
  await page.waitForTimeout(200);
  expect(await shot(page, '#desk', 1000, 800)).toMatchSnapshot('desk-mech-szkolna.png');
});

test('wygląd stanowiska EBILock 950 (Szkolna): przebieg nastawiony z linii poleceń, semafor zamarkowany SZI, wybrana zwrotnica', async ({ page }) => {
  await openShift(page, 'szkolna', { settings: { sideCollapsed: true }, params: { scenariusz: 'zmiana-ebi' } });
  await page.evaluate(() => {
    const s = window.sim;
    s.clock.paused = false;
    s.submitCommand('POC A D2');
    for (let i = 0; i < 16; i++) s.step(0.5);
    s.submitCommand('SZI C1');
    s.pull({ kind: 'point', id: 'Zw1' });
    s.clock.paused = true;
  });
  await page.waitForTimeout(200);
  // w kadrze: przebieg A → D2, czerwone tło SZI pod C1, zielona ramka wyboru zwrotnicy 1
  await expect(page.locator('#desk .scr-el.signal.ebi-mark[data-mark="red"]')).toHaveCount(1);
  await expect(page.locator('#desk .scr-el.point.ebi-sel')).toHaveCount(1);
  expect(await shot(page, '#desk', 1000, 640)).toMatchSnapshot('desk-ebi-szkolna.png');
});

test('wygląd stanowiska MOR-3 (Kalinowo): przebieg nastawiony z menu, wybrany semafor z fioletową obwódką', async ({ page }) => {
  await openShift(page, 'kalinowo', { settings: { sideCollapsed: true }, params: { scenariusz: 'zmiana' } });
  await page.evaluate(() => {
    const s = window.sim;
    s.clock.paused = false;
    s.press({ kind: 'signal', id: 'A' }); s.press({ kind: 'signal', id: 'E2' }); s.chooseCommand('Pociąg');
    for (let i = 0; i < 16; i++) s.step(0.5);
    s.press({ kind: 'signal', id: 'D1' });
    s.clock.paused = true;
  });
  await page.waitForTimeout(200);
  await expect(page.locator('#desk .scr-el.signal.mor-sel')).toHaveCount(1);
  expect(await shot(page, '#desk', 1000, 640)).toMatchSnapshot('desk-mor-kalinowo.png');
});

// karta pociągu na zakładce „Pociągi”: kategoria, numer, relacja, stan, przyczyna postoju i tabor (zespoły trakcyjne)
test('wygląd karty pociągu na zakładce „Pociągi” (Szkolna): postój po godzinie odjazdu, przyczyna i tabor', async ({ page }) => {
  await openShift(page, 'szkolna', { params: { scenariusz: 'zmiana', seed: '7' } });
  await expect.poll(() => page.evaluate(() => window.sim.blocks.get('W').request)).toBe('theirs');
  await page.evaluate(() => {
    const sim = window.sim, c = sim.clock;
    const e = sim.traffic.timetable().find((x) => x.nr === 6101);
    sim.press({ kind: 'block', exit: 'W', btn: 'Poz' });
    c.paused = false; c.speed = 1;
    for (let i = 0; i < 4800; i++) {
      sim.step(0.5);
      const tr = sim.traffic.trains.find((x) => String(x.nr) === '6101');
      if (tr?.entered && tr.v === 0 && tr.hasStopped && c.time >= e.depTime + 60) break;
      if (!tr?.entered && !sim.ilk.routesSet().length) sim.execute({ type: 'route', start: 'A', end: 'D1', kind: 'train' });
    }
    c.paused = true;
  });
  await page.click('#panel-tabs button[data-tab=pociagi]');
  const card = page.locator('#trains .train-card[data-nr="6101"]');
  await expect(card.locator('.train-wait')).toHaveCount(1);
  await expect(card.locator('.train-stock')).toHaveCount(1);
  await page.waitForTimeout(200);
  // panel pod pulpitem – karta na całą szerokość, przyciski trybu jazdy i zmiany czoła z prawej
  expect(await shot(page, '#trains .train-card[data-nr="6101"]', 1350, 100)).toMatchSnapshot('train-card-szkolna.png');
});

// ekrany wyboru (StartScreen): tytuł, lista posterunków, mapa Polski i schemat regionu jako tablica dyspozytorska
async function startWithProgress(page, hash) {
  await page.addInitScript(() => {
    localStorage.setItem('sprk.settings', JSON.stringify({ theme: 'dark' }));
    localStorage.setItem('sprk.progress', JSON.stringify({ stations: { sopot: { zmiana: { grade: 'dobrze', total: 24 } } }, missions: { 'szkolna/nauka-1': true } }));
    localStorage.setItem('sprk.lastShift', JSON.stringify({ search: '?stacja=gdynia-glowna&scenariusz=zmiana&zaklocenia=low' }));
  });
  await page.goto(`/${hash}`, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(200);
}

test('wygląd ekranu tytułowego: ostatnia zmiana, służba, szkolenie, ustawienia, semafor', async ({ page }) => {
  await startWithProgress(page, '#/');
  await expect(page.locator('#st-last')).toBeVisible();
  expect(await shot(page, '#start .start-screen', 1280, 600)).toMatchSnapshot('start-title.png');
});

test('wygląd listy posterunków: wyszukiwarka, filtry, karty z trudnością i pieczątką oceny', async ({ page }) => {
  await startWithProgress(page, '#/sluzba/lista');
  await expect(page.locator('.st-card[data-id=sopot] .st-stamp')).toBeVisible();
  expect(await shot(page, '#start .start-screen', 1280, 720)).toMatchSnapshot('start-list.png');
});

test('wygląd mapy Polski: tablica z siatką, sieć kolejowa, województwo z posterunkami i liczbą, lampki stacji, przyciski przybliżania', async ({ page }) => {
  await startWithProgress(page, '#/sluzba');
  await expect(page.locator('#st-map path.mp-shape.has')).toHaveCount(1);
  expect(await shot(page, '#st-map', 900, 700)).toMatchSnapshot('start-map.png');
});

test('wygląd schematu regionu: tory z podkładami (OSM), lampki przystanków, tablice z nazwami, karta posterunku', async ({ page }) => {
  await startWithProgress(page, '#/sluzba/pomorskie');
  await page.locator('.rm-stop[data-id=sopot]').focus();
  await expect(page.locator('#st-rmapfig .st-rinfo')).toHaveClass(/on/);
  expect(await shot(page, '#st-rmapfig', 1200, 720)).toMatchSnapshot('start-region.png');
});

test('wygląd strony posterunku (Rumia): scenariusz, stanowisko, godzina startu i długość służby, opis pory, zakłócenia', async ({ page }) => {
  await startWithProgress(page, '#/stacja/rumia');
  // ziarno wpisane – opis (liczba pociągów) i jego układ są wtedy stałe
  await page.locator('.st-adv summary').click();
  await page.fill('#st-seed', '5');
  await page.selectOption('#st-duty-start', '22');
  await page.click('#st-duty-minutes button[data-minutes="180"]');
  await expect(page.locator('#st-srk-wrap')).toBeVisible();
  await expect(page.locator('#st-scenario-desc')).toContainText('Pociągi w tej służbie');
  await page.locator('#st-seed').blur();
  expect(await shot(page, '#start .start-screen', 1280, 800)).toMatchSnapshot('start-station.png');
});
