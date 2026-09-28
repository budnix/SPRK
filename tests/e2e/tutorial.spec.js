import { test, expect } from '@playwright/test';
import { openShift, tap, advance, pressBtn } from './helpers.js';

/* Misje wprowadzające (samouczki): każda na własnej stacji – Szkolna (monitor), Jodłowa (typ E), Zacisze (IZH-111),
   Olszyny (nastawnia mechaniczna) */

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

/**
 * Zostawia w rozkładzie tylko pociągi `keep` (lekcja usterki): pozostałe nie zgłoszą się ani nie wyjadą; żądania
 * pozwolenia, które już zgłosiły, są wycofane, a pociągi już na szlaku – zdjęte (misja zaczyna się o 07:00, pierwszy
 * sąsiad pyta albo wyprawia pociąg od razu).
 */
async function onlyTrains(page, keep) {
  await page.evaluate((nrs) => {
    const s = window.sim;
    for (const e of s.traffic.entries) {
      if (nrs.includes(e.nr)) continue;
      const b = e.from ? s.blocks.get(e.from) : null;
      // pociąg już na szlaku (wyjechał od sąsiada przy starcie zmiany) – zdejmij go ze szlaku
      if (e.dispatched && e.train && !e.train.entered) {
        s.traffic.trains = s.traffic.trains.filter((t) => t !== e.train);
        e.train = null; e.dispatched = false;
        if (b) { b.occupied = false; b.lineTrain = null; }
      }
      if (e.dispatched) continue;
      e.requestAt = Infinity; e.neighbourDep = Infinity;
      if (e.requested) { e.requested = false; if (b?.request === 'theirs') b.request = null; }
    }
  }, keep);
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
  // bez rozgrzewki: po planie stacji od razu blokada i pierwszy pociąg; misja zaczyna się o 07:00
  await expect(box.locator('.tut-title')).toContainText('Blokada liniowa');
  expect(await page.evaluate(() => window.sim.clock.time)).toBe(7 * 3600);
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

test('misja 2: inna stacja (Jodłowa, linia dwutorowa) na pulpicie typu E – wjazd bez pozwolenia i Ko', async ({ page }) => {
  await openShift(page, 'jodlowa', { params: { scenariusz: 'nauka-2', srk: 'komputerowe' } });
  await page.waitForFunction(() => window.tutorial);
  await expect(page.locator('#desk svg.desk')).toHaveCount(1); // scenariusz wymusza pulpit mimo parametru URL
  await expect(page.locator('#station-name')).toContainText('Jodłowa');
  const box = page.locator('.tut-box');
  await expect(box.locator('.tut-body')).toContainText('dwuprzyciskowa');
  await expect(box.locator('.tut-body')).toContainText('linii dwutorowej');
  await goTo(page, 'Blokada na linii dwutorowej');
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

test('misja 3: inna stacja (Zacisze, stacja krańcowa) na pulpicie IZH-111 – wjazd na tor czołowy, zły tor daje podpowiedź z Zcz', async ({ page }) => {
  await page.goto('/', { waitUntil: 'load' });
  await expect(page.locator('.st-mission')).toHaveCount(4);
  expect(await page.locator('.st-mission').evaluateAll((els) => els.map((e) => e.dataset.station))).toEqual(['szkolna', 'jodlowa', 'zacisze', 'olszyny']);
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
  const order = (o) => page.click(`.izh-orders button[data-order="${o}"]`);
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
  await onlyTrains(page, [3304]);
  await page.evaluate(() => { const s = window.sim; s.execute({ type: 'point', id: 'Zw3' }); s.clock.paused = false; while (s.clock.time < 8 * 3600 + 61) s.step(0.5); s.clock.paused = true; });
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
  await onlyTrains(page, [7107, 7108]);
  await page.evaluate(() => { const s = window.sim; s.clock.paused = false; while (s.clock.time < 8 * 3600 + 5 * 60 + 2) s.step(0.5); s.clock.paused = true; });
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

for (const [station, scenario] of [['szkolna', 'nauka-1'], ['jodlowa', 'nauka-2'], ['zacisze', 'nauka-3'], ['olszyny', 'nauka-4']]) {
  test(`dymek samouczka nie zasłania zakładek panelu, paska poleceń ani wskazywanego elementu (${station}, każdy krok misji)`, async ({ page }) => {
    await openShift(page, station, { params: { scenariusz: scenario } });
    await page.waitForFunction(() => window.tutorial);
    const box = page.locator('.tut-box');
    const steps = await page.evaluate(() => window.tutorial.progress.steps.length);
    const covered = [];
    // zakładkę panelu da się kliknąć przy otwartym dymku (na początku misji: ostatni krok kończy zmianę i otwiera raport)
    await page.click('#panel-tabs button[data-tab=log]');
    await expect(page.locator('#tab-log')).toBeVisible();
    for (let i = 0; i < steps; i++) {
      const found = await page.evaluate(() => {
        const b = document.querySelector('.tut-box').getBoundingClientRect();
        const hits = (el) => { const q = el.getBoundingClientRect(); return q.width > 0 && q.height > 0 && Math.min(b.right, q.right) - Math.max(b.left, q.left) > 1 && Math.min(b.bottom, q.bottom) - Math.max(b.top, q.top) > 1; };
        const controls = [...document.querySelectorAll('#panel-tabs button:not(.hidden), #cmd-host button, #desk-tools .tb:not(.hidden), #topbar .tb, .tut-hl')];
        return { step: window.tutorial.progress.step?.id, box: [Math.round(b.left), Math.round(b.top), Math.round(b.right), Math.round(b.bottom)], over: controls.filter(hits).map((e) => e.id || e.dataset.tab || e.dataset.cmd || e.dataset.order || e.className.baseVal || e.className), inWindow: b.left >= 0 && b.top >= 0 && b.right <= innerWidth && b.bottom <= innerHeight };
      });
      if (found.over.length || !found.inWindow) covered.push(found);
      if (i < steps - 1) { const next = box.locator('.tut-next'); await (await next.isVisible() ? next : box.locator('.tut-skip')).click(); }
    }
    expect(covered).toEqual([]);
  });
}

test('misja 4: nastawnia mechaniczna w Olszynach – pełna kolejność kliknięciami dla pierwszego pociągu', async ({ page }) => {
  await page.goto('/', { waitUntil: 'load' });
  await page.click('.st-mission[data-scenario="nauka-4"]');
  await expect(page.locator('#st-briefing .st-bname')).toContainText('Misja 4: nastawnia mechaniczna');
  await expect(page.locator('#st-briefing .st-bmeta')).toContainText('Olszyny');
  await page.click('#st-go');
  await page.waitForURL(/stacja=olszyny.*scenariusz=nauka-4/);
  await page.waitForFunction(() => window.tutorial && window.sim);
  await page.evaluate(() => { window.sim.clock.paused = true; return document.fonts.ready; });
  await expect(page.locator('#desk svg.desk.mech')).toHaveCount(1);
  const box = page.locator('.tut-box');
  const title = box.locator('.tut-title');
  const ctl = (kind, id) => page.locator(`#desk .mech-ctl[data-ref='${JSON.stringify({ kind, id })}']`);
  await goTo(page, 'Blokada liniowa i blok przebiegowy');
  await box.locator('.tut-next').click();
  await untilRequest(page, 'W');
  await page.evaluate(() => window.sim.press({ kind: 'block', exit: 'W', btn: 'Poz' }));
  await expect(title).toContainText('1. Drążek przebiegowy');
  await ctl('route', 'A-D1').click();
  await expect(title).toContainText('2. Blok przebiegowy');
  await expect(ctl('routeblock', 'A')).toHaveClass(/tut-hl/);
  await ctl('routeblock', 'A').click();
  await expect(title).toContainText('3. Dźwignia sygnałowa');
  await ctl('lever', 'A').click();
  await expect(title).toContainText('Pociąg wjeżdża');
  expect(await page.evaluate(() => window.sim.ilk.signals.get('A').aspect)).not.toBe('S1');
});
