import { test, expect } from '@playwright/test';
import { openShift, tap, advance, pressBtn } from './helpers.js';

/* Misje wprowadzające (samouczki): każda na własnej stacji – Szkolna (monitor), Jodłowa (typ E), Zacisze (IZH-111) */

/** Przechodzi samouczek do kroku o podanym tytule: „Dalej” na krokach z opisem, „Pomiń krok” na zadaniach. */
async function goTo(page, title) {
  const box = page.locator('.tut-box');
  for (let i = 0; i < 40; i++) {
    if ((await box.locator('.tut-title').textContent()).includes(title)) return;
    const next = box.locator('.tut-next');
    await (await next.isVisible() ? next : box.locator('.tut-skip')).click();
  }
  throw new Error(`samouczek nie doszedł do kroku „${title}”`);
}

/** Przesuwa symulację, aż sąsiad zażąda pozwolenia na szlaku `exit` (misje zaczynają się kilka minut przed pierwszym pociągiem). */
async function untilRequest(page, exit) {
  await page.evaluate((x) => { const s = window.sim, c = s.clock, p = c.paused; c.paused = false; for (let i = 0; i < 2400 && s.blocks.get(x).request !== 'theirs'; i++) s.step(0.5); c.paused = p; }, exit);
  expect(await page.evaluate((x) => window.sim.blocks.get(x).request, exit)).toBe('theirs');
}

test('ekran startowy: przycisk samouczka uruchamia misję 1 na stacji Szkolna', async ({ page }) => {
  await page.goto('/', { waitUntil: 'load' });
  await expect(page.locator('.st-mission').first()).toContainText('Misja 1');
  await page.click('.st-mission[data-scenario="nauka-1"]');
  // etap 2: odprawa misji po prawej – bez parametrów zmiany, z liczbą kroków i przyciskiem startu
  await expect(page.locator('#st-briefing .st-bname')).toContainText('Misja 1');
  await expect(page.locator('#st-briefing .st-bdiff')).toContainText('kroków');
  await expect(page.locator('.st-form')).toBeHidden();
  await expect(page.locator('#st-go')).toHaveText('Rozpocznij misję');
  await page.click('#st-go');
  await page.waitForURL(/stacja=szkolna.*scenariusz=nauka-1/);
  await expect(page.locator('.tut-box')).toBeVisible();
  await expect(page.locator('.tut-step')).toHaveText(/Krok 1\//);
});

test('misja 1: kroki informacyjne zatrzymują zegar, dymek wskazuje blokadę, Poz z menu zalicza krok, pasek poleceń podświetlony, słownik po kliknięciu skrótu', async ({ page }) => {
  await openShift(page, 'szkolna', { params: { scenariusz: 'nauka-1' } });
  await page.waitForFunction(() => window.tutorial);
  const box = page.locator('.tut-box');
  await expect(box).toBeVisible();
  await expect(box.locator('.tut-title')).toContainText('Witaj');
  expect(await page.evaluate(() => window.sim.clock.paused)).toBe(true);
  // słownik: kliknięcie skrótu otwiera dymek z definicją
  await box.locator('abbr[data-term="Eap"]').click();
  await expect(page.locator('.tut-gloss')).toBeVisible();
  await expect(page.locator('.tut-gloss')).toContainText('jednotorow');
  await page.locator('.tut-gloss').click(); // każde kliknięcie zamyka słownik
  await expect(page.locator('.tut-gloss')).toBeHidden();
  await box.locator('.tut-next').click();
  await box.locator('.tut-next').click();
  // rozgrzewka – własne kroki tej misji: polecenia paska, których rozkład nie wymaga
  await expect(box.locator('.tut-title')).toContainText('Rozgrzewka');
  expect(await page.evaluate(() => window.sim.clock.time)).toBe(6 * 3600 + 54 * 60);
  await box.locator('.tut-next').click();
  const bar = (cmd) => page.click(`.scr-cmdbar button[data-cmd=${cmd}]`);
  await expect(box.locator('.tut-title')).toContainText('ZWROTNICA');
  await expect(page.locator('.scr-cmdbar button[data-cmd=zw]')).toHaveClass(/tut-hl/);
  await bar('zw'); await tap(page, 'Zw3'); await advance(page, 5);
  await expect(box.locator('.tut-title')).toContainText('Zz');
  await bar('zz'); await tap(page, 'Zw3'); await page.click('.scr-confirm button:has-text("WYKONAJ")');
  await expect(box.locator('.tut-title')).toContainText('OPS');
  await bar('zz'); await tap(page, 'Zw3'); await page.click('.scr-confirm button:has-text("OPS")');
  expect(await page.evaluate(() => window.sim.ilk.points.get('Zw3').individualLock)).toBe(true); // odwołane polecenie nic nie zmienia
  await bar('zz'); await tap(page, 'Zw3'); await page.click('.scr-confirm button:has-text("WYKONAJ")');
  await bar('zw'); await tap(page, 'Zw3'); await advance(page, 5);
  await expect(box.locator('.tut-title')).toContainText('Przebieg do ćwiczenia');
  await bar('train'); await tap(page, 'B'); await tap(page, 'C2'); await advance(page, 6);
  await expect(box.locator('.tut-title')).toContainText('STOP');
  await bar('stop'); await tap(page, 'B');
  await expect(box.locator('.tut-title')).toContainText('Zwolnienie przebiegu');
  await bar('pz'); await tap(page, 'B');
  await expect(box.locator('.tut-title')).toContainText('Blokada liniowa');
  expect(await page.evaluate(() => window.sim.ilk.active.size)).toBe(0);
  await expect(page.locator('.tut-hl')).toHaveCount(1); // pole blokady Lipno
  await box.locator('.tut-next').click();
  expect(await page.evaluate(() => window.sim.clock.paused)).toBe(false);
  await expect(box.locator('.tut-title')).toContainText('Danie pozwolenia');
  await untilRequest(page, 'W');
  // Poz z menu elementu (pole blokady)
  await page.locator(`.hit[data-ref*='"id":"kW"']`).dispatchEvent('pointerdown', { bubbles: true, button: 0, clientX: 60, clientY: 200 });
  await page.click('.scr-menu button:has-text("(Poz)")');
  await expect(box.locator('.tut-title')).toContainText('Przebieg wjazdowy');
  await expect(page.locator('.scr-cmdbar button[data-cmd=train]')).toHaveClass(/tut-hl/);
  // zły tor → komunikat; właściwy przebieg → następny krok
  await page.click('.scr-cmdbar button[data-cmd=train]');
  await tap(page, 'A'); await tap(page, 'D2');
  await advance(page, 6);
  await expect(box.locator('.tut-feedback')).toContainText('tor 2');
  await page.click('.scr-cmdbar button[data-cmd=pz]'); await tap(page, 'A');
  await advance(page, 2);
  await page.click('.scr-cmdbar button[data-cmd=train]');
  await tap(page, 'A'); await tap(page, 'D1');
  await advance(page, 6);
  await expect(box.locator('.tut-title')).toContainText('Pociąg wjeżdża');
  await expect(box.locator('.tut-feedback')).toBeHidden();
  // pominięcie kroku i zakończenie samouczka
  await box.locator('.tut-skip').click();
  await expect(box.locator('.tut-title')).toContainText('Ko');
  await box.locator('.tut-close').click();
  await expect(box).toBeHidden();
  await expect(page.locator('.tut-hl')).toHaveCount(0);
});

test('misja 2: inna stacja (Jodłowa, linia dwutorowa) na pulpicie typu E – rozgrzewka z przyciskami grupowymi, wjazd bez pozwolenia i Ko', async ({ page }) => {
  await openShift(page, 'jodlowa', { params: { scenariusz: 'nauka-2', srk: 'komputerowe' } });
  await page.waitForFunction(() => window.tutorial);
  await expect(page.locator('#desk svg.desk')).toHaveCount(1); // scenariusz wymusza pulpit mimo parametru URL
  await expect(page.locator('#station-name')).toContainText('Jodłowa');
  const box = page.locator('.tut-box');
  await expect(box.locator('.tut-body')).toContainText('dwuprzyciskowa');
  await expect(box.locator('.tut-body')).toContainText('linii dwutorowej');
  await goTo(page, 'Zwrotnica: Zw');
  await expect(page.locator(`.btn[data-ref='{"kind":"group","id":"Zw","role":"group-point"}']`)).toHaveClass(/tut-hl/);
  await pressBtn(page, { kind: 'group', id: 'Zw', role: 'group-point' });
  await pressBtn(page, { kind: 'point', id: 'Zw7' });
  await advance(page, 5);
  await expect(box.locator('.tut-title')).toContainText('Zamknięcie zwrotnicy');
  await pressBtn(page, { kind: 'group', id: 'Zz', role: 'point-lock' }); await pressBtn(page, { kind: 'point', id: 'Zw7' });
  await expect(box.locator('.tut-title')).toContainText('Otwarcie i powrót');
  await pressBtn(page, { kind: 'group', id: 'Zz', role: 'point-lock' }); await pressBtn(page, { kind: 'point', id: 'Zw7' });
  await pressBtn(page, { kind: 'group', id: 'Zw', role: 'group-point' }); await pressBtn(page, { kind: 'point', id: 'Zw7' });
  await advance(page, 5);
  await expect(box.locator('.tut-title')).toContainText('Przebieg do ćwiczenia');
  await pressBtn(page, { kind: 'signal', id: 'B', color: 'green' }); await pressBtn(page, { kind: 'signal', id: 'D1', color: 'green' });
  await advance(page, 6);
  await expect(box.locator('.tut-title')).toContainText('wyciągnięcie przycisku');
  // wyciągnięcie = prawy przycisk myszy
  await page.locator(`.btn[data-ref='{"kind":"signal","id":"B","color":"green"}']`).dispatchEvent('pointerdown', { bubbles: true, button: 2 });
  await page.locator(`.btn[data-ref='{"kind":"signal","id":"B","color":"green"}']`).dispatchEvent('pointerup', { bubbles: true, button: 2 });
  await expect(box.locator('.tut-title')).toContainText('Pz');
  await pressBtn(page, { kind: 'group', id: 'Pz', role: 'route-release' }); await pressBtn(page, { kind: 'signal', id: 'B', color: 'green' });
  await expect(box.locator('.tut-title')).toContainText('Blokada na linii dwutorowej');
  await box.locator('.tut-next').click();
  // pierwszy pociąg: bez pozwolenia – wjazd, po przyjeździe Ko
  await expect(box.locator('.tut-title')).toContainText('Wjazd bez pozwolenia');
  await expect(page.locator(`.btn[data-ref='{"kind":"signal","id":"A","color":"green"}']`)).toHaveClass(/tut-hl/);
  expect(await page.evaluate(() => window.sim.blocks.get('K2').fixed)).toBe('in');
  await pressBtn(page, { kind: 'signal', id: 'A', color: 'green' }); await pressBtn(page, { kind: 'signal', id: 'E2', color: 'green' });
  await advance(page, 6);
  await expect(box.locator('.tut-title')).toContainText('Potwierdzenie przyjazdu');
  await page.evaluate(() => { const s = window.sim, c = s.clock; c.paused = false; for (let i = 0; i < 3000 && !s.blocks.get('K2').koPending; i++) s.step(0.5); c.paused = true; });
  await pressBtn(page, { kind: 'block', exit: 'K2', btn: 'Ko' });
  await advance(page, 60); // pociąg dojeżdża do peronu – krok zalicza się po zatrzymaniu
  await expect(box.locator('.tut-title')).toContainText('Wyjazd bez pozwolenia');
});

test('instrukcja zawiera słownik skrótów, a przyciski paska poleceń mają podpowiedzi', async ({ page }) => {
  await openShift(page, 'szkolna', { params: { scenariusz: 'zmiana' } });
  await expect(page.locator('.scr-cmdbar button[data-cmd=pz]')).toHaveAttribute('title', /zwolnienie przebiegu/i);
  await page.click('#btn-help');
  await expect(page.locator('#help dl.gloss')).toContainText('Poz – danie pozwolenia');
});

test('dymek samouczka nie zasłania wskazywanego elementu, da się przeciągnąć za nagłówek i zostaje na miejscu do następnego kroku', async ({ page }) => {
  await openShift(page, 'szkolna', { params: { scenariusz: 'nauka-1' } });
  await page.waitForFunction(() => window.tutorial);
  const box = page.locator('.tut-box');
  await goTo(page, 'Danie pozwolenia');
  await untilRequest(page, 'W');
  // krok Poz: kotwica = strzałka szlaku Lipno; dymek nie nachodzi na nią
  const noOverlap = async () => page.evaluate(() => {
    const b = document.querySelector('.tut-box').getBoundingClientRect(), t = document.querySelector('.tut-hl').getBoundingClientRect();
    return b.right <= t.left || b.left >= t.right || b.bottom <= t.top || b.top >= t.bottom;
  });
  expect(await noOverlap()).toBe(true);
  // przeciągnięcie za nagłówek
  const head = box.locator('.tut-head');
  const h = await head.boundingBox();
  const before = await box.boundingBox();
  await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
  await page.mouse.down();
  await page.mouse.move(h.x + h.width / 2 + 200, h.y + h.height / 2 + 120, { steps: 8 });
  await page.mouse.up();
  const after = await box.boundingBox();
  expect(Math.round(after.x - before.x)).toBe(200);
  expect(Math.round(after.y - before.y)).toBe(120);
  await expect(box).toHaveAttribute('data-dragged', 'true');
  await advance(page, 2); // tick nie cofa ręcznego położenia
  const still = await box.boundingBox();
  expect(Math.round(still.x)).toBe(Math.round(after.x));
  // następny krok wraca do automatycznego położenia
  await page.locator(`.hit[data-ref*='"id":"kW"']`).dispatchEvent('pointerdown', { bubbles: true, button: 0, clientX: 60, clientY: 200 });
  await page.click('.scr-menu button:has-text("(Poz)")');
  await expect(box.locator('.tut-title')).toContainText('Przebieg wjazdowy');
  await expect(box).not.toHaveAttribute('data-dragged', 'true');
  expect(await noOverlap()).toBe(true);
  // słownik też da się przesunąć
  await box.locator('abbr[data-term]').first().click();
  const g = page.locator('.tut-gloss');
  const gb = await g.boundingBox();
  await page.mouse.move(gb.x + 20, gb.y + 8); await page.mouse.down(); await page.mouse.move(gb.x + 120, gb.y + 60, { steps: 5 }); await page.mouse.up();
  const gb2 = await g.boundingBox();
  expect(Math.round(gb2.x - gb.x)).toBe(100);
});

test('ekran startowy otwarty z menu w trakcie misji leży nad dymkami samouczka', async ({ page }) => {
  await openShift(page, 'szkolna', { params: { scenariusz: 'nauka-1' } });
  await page.waitForFunction(() => window.tutorial);
  await expect(page.locator('.tut-box')).toBeVisible();
  await page.click('#btn-menu');
  await page.click('#menu-new');
  await expect(page.locator('#start')).toBeVisible();
  // element na wierzchu w miejscu dymka to ekran startowy, nie dymek
  const top = await page.evaluate(() => { const r = document.querySelector('.tut-box').getBoundingClientRect(); const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!el?.closest('#start'); });
  expect(top).toBe(true);
  await page.click('#st-close');
  await expect(page.locator('#start')).toBeHidden();
});

test('misja: zmiana nie kończy się sama (raport dopiero po ostatnim kroku); zamknięcie samouczka przywraca automatyczny koniec', async ({ page }) => {
  await openShift(page, 'jodlowa', { params: { scenariusz: 'nauka-2' } });
  expect(await page.evaluate(() => window.sim.autoEnd)).toBe(false);
  await page.click('.tut-close');
  expect(await page.evaluate(() => window.sim.autoEnd)).toBe(true);
  await expect(page.locator('.tut-box')).toBeHidden();
});

test('misja 3: inna stacja (Zacisze, stacja krańcowa) na pulpicie IZH-111 – rozgrzewka z rozkazami, wjazd na tor czołowy, zły tor daje podpowiedź z Zcz', async ({ page }) => {
  await page.goto('/', { waitUntil: 'load' });
  await expect(page.locator('.st-mission')).toHaveCount(3);
  expect(await page.locator('.st-mission').evaluateAll((els) => els.map((e) => e.dataset.station))).toEqual(['szkolna', 'jodlowa', 'zacisze']);
  await page.click('.st-mission[data-scenario="nauka-3"]');
  await expect(page.locator('#st-briefing .st-bname')).toContainText('Misja 3');
  await expect(page.locator('#st-briefing .st-bmeta')).toContainText('Zacisze');
  await page.click('#st-go');
  await page.waitForURL(/stacja=zacisze.*scenariusz=nauka-3/);
  await page.waitForFunction(() => window.tutorial && window.sim);
  await page.evaluate(() => { window.sim.clock.paused = true; return document.fonts.ready; });
  await expect(page.locator('#desk svg.desk.izh')).toHaveCount(1);
  const box = page.locator('.tut-box');
  await expect(box.locator('.tut-body')).toContainText('IZH-111');
  // słownik zna pojęcia tego pulpitu i tej stacji
  await box.locator('abbr[data-term="przycisk adresowy"]').click();
  await expect(page.locator('.tut-gloss')).toContainText('wybiera ten element');
  await page.locator('.tut-gloss').click();
  await box.locator('abbr[data-term="stacja krańcowa"]').click();
  await expect(page.locator('.tut-gloss')).toContainText('linia się kończy');
  await page.locator('.tut-gloss').click();
  await box.locator('.tut-next').click();
  await expect(box.locator('.tut-body')).toContainText('ciemny powtarzacz oznacza');
  await box.locator('.tut-next').click();
  // rozgrzewka – własne kroki tej misji: zwrotnica 2 rozkazami −, STOP, Zw, + i zwolnienie czasowe Zcz
  await expect(box.locator('.tut-title')).toContainText('Rozgrzewka');
  expect(await page.evaluate(() => window.sim.clock.time)).toBe(6 * 3600 + 54 * 60);
  await expect(page.locator('.izh-orders')).toHaveClass(/tut-hl/);
  await box.locator('.tut-next').click();
  const order = (o) => page.click(`.izh-orders button[data-order="${o}"]`);
  const pointOrder = async (o) => { await pressBtn(page, { kind: 'point', id: 'Zw2' }); await order(o); };
  await expect(box.locator('.tut-title')).toContainText('rozkaz „−”');
  await expect(page.locator(`.btn[data-ref='{"kind":"point","id":"Zw2"}']`)).toHaveClass(/tut-hl/);
  await pointOrder('-'); await advance(page, 5);
  await expect(box.locator('.tut-title')).toContainText('STOP');
  await expect(page.locator('.izh-orders button[data-order="STOP"]')).toHaveClass(/tut-hl/);
  await pointOrder('STOP');
  await expect(box.locator('.tut-title')).toContainText('Odwołanie zamknięcia');
  await pointOrder('Zw');
  await expect(box.locator('.tut-title')).toContainText('rozkaz „+”');
  await pointOrder('+'); await advance(page, 5);
  await expect(box.locator('.tut-title')).toContainText('Przebieg do ćwiczenia');
  await pressBtn(page, { kind: 'signal', id: 'A' }); await pressBtn(page, { kind: 'end', id: 'kT3' }); await order('P');
  await advance(page, 6);
  await expect(box.locator('.tut-title')).toContainText('Zcz');
  await expect(page.locator(`.btn[data-ref='{"kind":"end","id":"kT3"}']`)).toHaveClass(/tut-hl/);
  await pressBtn(page, { kind: 'end', id: 'kT3' }); await order('Zcz');
  await expect(box.locator('.tut-title')).toContainText('Odliczanie');
  await advance(page, 122);
  await expect(box.locator('.tut-title')).toContainText('Blokada liniowa');
  expect(await page.evaluate(() => window.sim.ilk.active.size)).toBe(0);
  await box.locator('.tut-next').click();
  await untilRequest(page, 'W');
  await pressBtn(page, { kind: 'block', exit: 'W', btn: 'Poz' });
  await expect(box.locator('.tut-title')).toContainText('Wjazd na tor czołowy');
  await expect(box.locator('.tut-body')).toContainText('rozkaz P');
  await expect(page.locator(`.btn[data-ref='{"kind":"signal","id":"A"}']`)).toHaveClass(/tut-hl/);
  // zły tor: podpowiedź mówi, jak zwolnić przebieg na tym pulpicie
  await pressBtn(page, { kind: 'signal', id: 'A' }); await pressBtn(page, { kind: 'end', id: 'kT2' }); await order('P');
  await advance(page, 6);
  await expect(box.locator('.tut-feedback')).toContainText('rozkaz Zcz');
  await pressBtn(page, { kind: 'end', id: 'kT2' }); await order('Zcz');
  await advance(page, 122);
  expect(await page.evaluate(() => window.sim.ilk.active.has('A-kT2'))).toBe(false);
  await pressBtn(page, { kind: 'signal', id: 'A' }); await pressBtn(page, { kind: 'end', id: 'kT1' }); await order('P');
  await advance(page, 6);
  await expect(box.locator('.tut-title')).toContainText('Potwierdzenie przyjazdu');
  await expect(box.locator('.tut-feedback')).toBeHidden();
});

test('misja 2: usterka napędu zwrotnicy – alarm, zamknięcie zwrotnicy Zz, przyjęcie na inny tor bez punktów ujemnych', async ({ page }) => {
  await openShift(page, 'jodlowa', { params: { scenariusz: 'nauka-2' } });
  await page.waitForFunction(() => window.tutorial);
  const box = page.locator('.tut-box');
  await goTo(page, 'Usterka napędu zwrotnicy');
  await expect(box.locator('.tut-body')).toContainText('zwrotnicy z usterką się nie przestawia');
  await expect(page.locator(`.btn[data-ref='{"kind":"point","id":"Zw3"}']`)).toHaveClass(/tut-hl/);
  // stan jak po lekcjach: zwrotnica 3 na tor 3; zegar do chwili usterki, bez pociągów po drodze
  await page.evaluate(() => { const s = window.sim; s.traffic.entries.forEach((e) => { if (e.nr !== 3304) { e.requestAt = Infinity; e.neighbourDep = Infinity; } }); s.execute({ type: 'point', id: 'Zw3' }); s.clock.paused = false; while (s.clock.time < 8 * 3600 + 61) s.step(0.5); s.clock.paused = true; });
  expect(await page.evaluate(() => window.sim.ilk.points.get('Zw3').position)).toBe('-');
  await box.locator('.tut-next').click();
  await expect(box.locator('.tut-title')).toContainText('Zabezpieczenie zwrotnicy');
  // alarm jest w dzienniku, a usterka na liście w zakładce Urządzenia (dymek może zasłaniać zakładki – czytamy treść)
  await expect(page.locator('#log')).toContainText('USTERKA: zwrotnica Zw3');
  await expect(page.locator('#faults')).toContainText('Zw3');
  await pressBtn(page, { kind: 'group', id: 'Zz', role: 'point-lock' }); await pressBtn(page, { kind: 'point', id: 'Zw3' });
  await expect(box.locator('.tut-title')).toContainText('Przyjęcie na inny tor');
  // tor planowy wymaga przestawienia zamkniętej zwrotnicy – urządzenia odmawiają
  await pressBtn(page, { kind: 'signal', id: 'A', color: 'green' }); await pressBtn(page, { kind: 'signal', id: 'E2', color: 'green' });
  await expect(page.locator('#status')).toContainText('Zw3 zamknięta');
  await pressBtn(page, { kind: 'signal', id: 'A', color: 'green' }); await pressBtn(page, { kind: 'signal', id: 'E3', color: 'green' });
  await page.evaluate(() => { const s = window.sim, c = s.clock; c.paused = false; for (let i = 0; i < 4000 && !s.blocks.get('K2').koPending; i++) s.step(0.5); c.paused = true; });
  await pressBtn(page, { kind: 'block', exit: 'K2', btn: 'Ko' });
  await advance(page, 60);
  await expect(box.locator('.tut-title')).toContainText('Wyjazd z toru 3');
  const e = await page.evaluate(() => { const x = window.sim.traffic.timetable().find((t) => t.nr === 3304); return { track: String(x.actualTrack), wrong: window.sim.score.items.filter((i) => i.code === 'wrong-track').length }; });
  expect(e).toEqual({ track: '3', wrong: 0 });
});

test('misja 3: usterka obwodu torowego – tor świeci na czerwono bez pociągu, droga ułożona ręcznie i zamknięta, wjazd na Sz', async ({ page }) => {
  await openShift(page, 'zacisze', { params: { scenariusz: 'nauka-3' } });
  await page.waitForFunction(() => window.tutorial);
  const box = page.locator('.tut-box');
  const order = (o) => page.click(`.izh-orders button[data-order="${o}"]`);
  await goTo(page, 'Usterka obwodu torowego');
  await expect(box.locator('.tut-body')).toContainText('sam układa drogę');
  await page.evaluate(() => { const s = window.sim; s.traffic.entries.forEach((e) => { if (e.nr !== 7107 && e.nr !== 7108) { e.requestAt = Infinity; e.neighbourDep = Infinity; } }); s.clock.paused = false; while (s.clock.time < 8 * 3600 + 5 * 60 + 2) s.step(0.5); s.clock.paused = true; });
  await box.locator('.tut-next').click();
  await expect(box.locator('.tut-title')).toContainText('Ręczne ułożenie drogi');
  // pulpit ciemny: szczeliny toru 3 świecą na czerwono, choć pociągu nie ma
  expect(await page.evaluate(() => ({ forced: window.sim.ilk.sections.get('T3').forced, trains: window.sim.traffic.trains.length, red: window.desk.sectionRefs.get('T3').every((r) => r.el.classList.contains('lamp-red')) }))).toEqual({ forced: true, trains: 0, red: true });
  // przebieg na „zajęty” tor nie nastawi się
  await pressBtn(page, { kind: 'signal', id: 'A' }); await pressBtn(page, { kind: 'end', id: 'kT3' }); await order('P');
  await expect(page.locator('#status')).toContainText('T3 zajęty');
  for (const id of ['Zw1', 'Zw2']) { await pressBtn(page, { kind: 'point', id }); await order('-'); }
  await advance(page, 5);
  for (const id of ['Zw1', 'Zw2']) { await pressBtn(page, { kind: 'point', id }); await order('STOP'); }
  await expect(box.locator('.tut-title')).toContainText('Wjazd na sygnał zastępczy');
  await expect(page.locator('.izh-orders button[data-order="Sz"]')).toHaveClass(/tut-hl/);
  await untilRequest(page, 'W');
  await pressBtn(page, { kind: 'block', exit: 'W', btn: 'Poz' });
  await page.evaluate(() => { const s = window.sim, c = s.clock; c.paused = false; for (let i = 0; i < 4000 && s.traffic.timetable().find((t) => t.nr === 7107).train?.stoppedAt?.signal !== 'A'; i++) s.step(0.5); c.paused = true; });
  await pressBtn(page, { kind: 'signal', id: 'A' }); await order('Sz');
  await expect(box.locator('.tut-title')).toContainText('Po przyjeździe');
  await expect(page.locator('.izh-counter')).toHaveText('00001');
  await page.evaluate(() => { const s = window.sim, c = s.clock; c.paused = false; for (let i = 0; i < 1200 && s.traffic.timetable().find((t) => t.nr === 7107).actualArr == null; i++) s.step(0.5); c.paused = true; });
  const e = await page.evaluate(() => { const x = window.sim.traffic.timetable().find((t) => t.nr === 7107); return { track: String(x.actualTrack), status: x.status, negative: window.sim.score.items.filter((i) => i.points < 0).map((i) => i.msg) }; });
  expect(e).toEqual({ track: '3', status: 'zakończył bieg', negative: [] });
  await pressBtn(page, { kind: 'block', exit: 'W', btn: 'Ko' });
  for (const id of ['Zw1', 'Zw2']) { await pressBtn(page, { kind: 'point', id }); await order('Zw'); }
  await expect(box.locator('.tut-title')).toContainText('Odjazd 7108');
});
