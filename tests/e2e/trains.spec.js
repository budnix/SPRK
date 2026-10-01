import { test, expect } from '@playwright/test';
import { openShift, btn, advance } from './helpers.js';

test('zakładka „Pociągi”: pociąg na posterunku ze stanem, torem i czołem; sterowanie trybem jazdy i czołem po zatrzymaniu; „Stan” bez sekcji manewrów', async ({ page }) => {
  await openShift(page, 'szkolna', { params: { scenariusz: 'zmiana-e' } });
  const tab = page.locator('#panel-tabs button[data-tab=pociagi]');
  await expect(tab).toHaveText('Pociągi');
  await tab.click();
  await expect(page.locator('#trains')).toContainText('brak pociągów na posterunku');
  await advance(page, 30); // Lipno zgłasza 6101
  await btn(page, { kind: 'block', exit: 'W', btn: 'Poz' }).click();
  await btn(page, { kind: 'signal', id: 'A', color: 'green' }).click();
  await btn(page, { kind: 'signal', id: 'D1', color: 'green' }).click();
  // pociąg wjeżdża: karta pojawia się od razu (zdarzenie rozkładu), w ruchu bez przycisków sterowania
  const card = page.locator('#trains .train-card[data-nr="6101"]');
  const entered = () => page.evaluate(() => !!window.sim.traffic.timetable().find((x) => x.nr === 6101)?.train?.entered);
  for (let i = 0; i < 20 && !(await entered()); i++) await advance(page, 20);
  await expect(card).toBeVisible();
  await expect(card).toHaveClass(/moving/);
  await expect(card.locator('.train-state')).toContainText('jedzie');
  await expect(card.locator('.train-actions button')).toHaveCount(0);
  const stopped = () => page.evaluate(() => { const e = window.sim.traffic.timetable().find((x) => x.nr === 6101); return e.train.v === 0 && e.train.hasStopped; });
  for (let i = 0; i < 30 && !(await stopped()); i++) await advance(page, 10);
  await advance(page, 1);
  await page.waitForTimeout(700); // odświeżanie panelu na takcie jest dławione (500 ms) – karta ma dogonić stan po zatrzymaniu, zanim zaczniemy mierzyć
  await expect(card).not.toHaveClass(/moving/);
  await expect(card.locator('.train-state')).toContainText(/postój|stoi/);
  await expect(card.locator('.train-state')).toContainText('tor 1');
  await expect(card.locator('.train-state')).toContainText('pociągowy');
  await expect(card.locator('.train-state .ic-front')).toHaveAttribute('data-dir', 'E'); // sylwetka lokomotywy zwrócona w prawo
  await expect(card.locator('.train-state .ic-mode')).toHaveAttribute('data-mode', 'train');
  expect(await card.locator('.train-state .ic-mode .lamp.on').count()).toBe(3); // Pc1: trzy światła
  await expect(card.locator('button[data-act=shunt]')).toHaveText('jazda manewrowa');
  // status rozkładu nie dubluje opisu stanu („postój, odjazd …” już zawiera „postój”); przyciski w standardzie panelu (.tb, 28 px jak „Nadaj”)
  const stateText = await card.locator('.train-state').textContent();
  expect((stateText.match(/postój|stoi/g) || []).length).toBe(1);
  const h = await card.locator('button[data-act=shunt]').evaluate((el) => el.getBoundingClientRect().height);
  await page.click('#panel-tabs button[data-tab=lacznosc]');
  const h2 = await page.locator('#comms-form button[type=submit]').evaluate((el) => el.getBoundingClientRect().height);
  expect(Math.round(h)).toBe(28); expect(Math.round(h2)).toBe(28);
  // ikony i tekst wiersza stanu w jednej osi: środki ikon w pionie równe środkowi tekstu (±1.5 px)
  await page.click('#panel-tabs button[data-tab=pociagi]');
  const centres = await card.locator('.train-state').evaluate((el) => {
    const mid = (r) => r.y + r.height / 2;
    const text = document.createRange(); text.selectNodeContents(el.querySelector('b'));
    return [mid(text.getBoundingClientRect()), ...[...el.querySelectorAll('svg')].map((s) => mid(s.getBoundingClientRect()))];
  });
  for (const c of centres.slice(1)) expect(Math.abs(c - centres[0])).toBeLessThanOrEqual(1.5);
  await page.click('#panel-tabs button[data-tab=pociagi]');
  // sterowanie: tryb manewrowy, zmiana czoła
  await card.locator('button[data-act=shunt]').click();
  expect(await page.evaluate(() => window.sim.traffic.timetable().find((x) => x.nr === 6101).train.mode)).toBe('shunt');
  await expect(card).toHaveClass(/shunt/);
  await expect(card.locator('.train-state')).toContainText('manewrowy');
  await expect(card.locator('.train-state .ic-mode')).toHaveAttribute('data-mode', 'shunt');
  expect(await card.locator('.train-state .ic-mode .lamp.on').count()).toBe(1); // manewry: jedno światło
  await expect(card.locator('button[data-act=train]')).toHaveText('jazda pociągowa');
  // zmiana czoła trwa: maszynista przechodzi do drugiej kabiny – odliczanie w karcie, bez przycisków do końca zmiany
  await card.locator('button[data-act=rev]').click();
  await expect(card.locator('.train-wait')).toContainText('maszynista przechodzi do drugiej kabiny');
  await expect(card.locator('.train-actions button')).toHaveCount(0);
  await expect(card.locator('.train-state .ic-front')).toHaveAttribute('data-dir', 'E');
  await advance(page, 80);
  await page.waitForTimeout(700); // dławione odświeżanie panelu
  await expect(card.locator('.train-state .ic-front')).toHaveAttribute('data-dir', 'W');
  await expect(card.locator('button[data-act=rev]')).toBeVisible();
  // polecenia i meldunek gotowości – rozmowa radiowa w zakładce Łączność
  await page.click('#panel-tabs button[data-tab=lacznosc]');
  const comms = page.locator('#comms-log');
  await expect(comms).toContainText('Pociąg 6101, tu Szkolna: koniec jazdy pociągowej, dalej jazda manewrowa – odbiór.');
  await expect(comms).toContainText('Tu pociąg 6101, zrozumiałem – zmieniam kabinę');
  await expect(comms).toContainText('Szkolna, tu pociąg 6101: zmiana czoła zakończona');
  await expect(comms).toContainText('Tu Szkolna, meldunek zrozumiałem.');
  // „Stan” nie ma już sekcji Manewry
  await page.click('#panel-tabs button[data-tab=stan]');
  await expect(page.locator('#tab-stan')).not.toContainText('Manewry');
  expect(await page.locator('#tab-stan #shunt').count()).toBe(0);
});

test('strona nie przesuwa się ani nie odświeża gestem: touchmove poza przewijalną treścią jest blokowany, przewijanie panelu działa', async ({ page }) => {
  await openShift(page, 'szkolna');
  const html = await page.evaluate(() => [getComputedStyle(document.documentElement).overscrollBehaviorY, getComputedStyle(document.body).overflowY]);
  expect(html).toEqual(['none', 'hidden']);
  const gesture = (sel, dy) => page.evaluate(([sel, dy]) => {
    const el = document.querySelector(sel);
    const r = el.getBoundingClientRect();
    const mk = (type, y) => new TouchEvent(type, { bubbles: true, cancelable: true, touches: [new Touch({ identifier: 1, target: el, clientX: r.x + 10, clientY: y })] });
    el.dispatchEvent(mk('touchstart', r.y + 10));
    const mv = mk('touchmove', r.y + 10 + dy);
    el.dispatchEvent(mv);
    el.dispatchEvent(new TouchEvent('touchend', { bubbles: true, cancelable: true, touches: [] }));
    return mv.defaultPrevented;
  }, [sel, dy]);
  expect(await gesture('#topbar', 40)).toBe(true); // pasek górny: nic nie przewija → pull to refresh zablokowany
  expect(await gesture('#topbar', -40)).toBe(true);
  // panel z długim rozkładem: w górę (treść w dół) przechodzi, w dół na samej górze – blokowany (to byłby bounce)
  await page.click('#panel-tabs button[data-tab=rj]');
  const scrollable = await page.evaluate(() => { const s = document.getElementById('tab-rj'); return s.scrollHeight > s.clientHeight + 1; });
  expect(scrollable).toBe(true);
  expect(await gesture('#tab-rj table', -40)).toBe(false);
  expect(await gesture('#tab-rj table', 40)).toBe(true);
});

test('rozkaz pisemny dla pociągu, który stanął za semaforem miniętym na „Stój”: lista podaje „za A”, treść mówi o dalszej jeździe, po wydaniu pociąg rusza', async ({ page }) => {
  await openShift(page, 'szkolna', { params: { scenariusz: 'zmiana-e' } });
  // pociąg 6101 jedzie na przebieg A-D2; tuż przed semaforem A obwód toru 2 wykazuje zajętość – semafor gaśnie, pociąg go mija
  const stopped = await page.evaluate(() => {
    const sim = window.sim, c = sim.clock, e = sim.traffic.timetable().find((x) => x.nr === 6101);
    c.paused = false; c.speed = 1;
    let set = false, dropped = false;
    for (let i = 0; i < 6000 && !(dropped && e.train?.v === 0); i++) {
      sim.step(0.5);
      const b = sim.blocks.get('W');
      if (b.request === 'theirs') b.press('Poz');
      if (!set && e.train) set = sim.ilk.setRoute('A-D2').ok;
      if (set && !dropped && e.train) {
        // sygnał gaśnie o krok symulacji wcześniej – zmiana działa w następnym kroku, gdy do A zostaje najwyżej 8 m
        // (dojazd zależy od maszynisty; bez tego pociąg bywał już przy A i mijał go na sygnał zezwalający)
        const x = e.train.constraintsAhead(3000, true).find((q) => q.signal === 'A')?.dist;
        const next = x != null ? x - e.train.v * 0.5 : null;
        if (next != null && next > 0 && next <= 8 && e.train.v > 8) { sim.ilk.sections.get('T2').forced = true; sim.ilk.updateOccupancy(sim.traffic.currentOccupancy()); dropped = true; }
      }
    }
    c.paused = true;
    return { kind: e.train.stoppedAt?.kind, signal: e.train.stoppedAt?.signal, spad: sim.score.items.filter((i) => i.code === 'spad').length };
  });
  expect(stopped).toEqual({ kind: 'spad', signal: 'A', spad: 0 }); // usterka urządzeń – bez kary
  await page.click('#panel-tabs button[data-tab=pociagi]');
  await expect(page.locator('#trains')).toContainText('stoi za semaforem A');
  await page.click('#panel-tabs button[data-tab=rozkazy]');
  await expect(page.locator('#order-train option').first()).toContainText('za A');
  await expect(page.locator('#order-signal')).toHaveValue('A');
  await expect(page.locator('#order-text')).toHaveValue(/zatrzymał się za semaforem A.*dalszą jazdę do następnego semafora/);
  await page.locator('#order-form button[type=submit], #order-form .tb.primary').first().click();
  await expect(page.locator('#order-msg')).toHaveClass(/ok/);
  await expect(page.locator('#orders li').first()).toContainText('6101');
  await advance(page, 40);
  expect(await page.evaluate(() => { const tr = window.sim.traffic.timetable().find((x) => x.nr === 6101).train; return [tr.authority, tr.stoppedAt?.kind ?? null, tr.v > 0 || tr.hasStopped]; })).toEqual([true, null, true]);
});

test('Łączność: „Stój pociąg nr …” wstrzymuje pociąg, o który pyta sąsiad – żądanie pozwolenia znika z blokady', async ({ page }) => {
  await openShift(page, 'szkolna', { params: { scenariusz: 'zmiana-e' } });
  await advance(page, 60); // Lipno żąda pozwolenia dla 6101
  expect(await page.evaluate(() => window.sim.blocks.get('W').request)).toBe('theirs');
  await page.click('#panel-tabs button[data-tab=lacznosc]');
  const formulas = await page.locator('#comms-formula option').allTextContents();
  expect(formulas).toContain('Stój pociąg nr … – droga nie jest wolna.');
  await page.selectOption('#comms-to', 'W');
  await page.selectOption('#comms-formula', 'hold');
  await page.fill('#comms-nr', '6101');
  await page.locator('#comms-form button[type=submit]').click();
  await expect(page.locator('#comms-msg')).toHaveClass(/ok/);
  expect(await page.evaluate(() => window.sim.blocks.get('W').request)).toBe(null);
  await expect(page.locator('#comms-log li').first()).toContainText('Stój pociąg nr 6101');
  // kierunek wolny – działa nasze Wbl
  expect(await page.evaluate(() => window.sim.blocks.get('W').press('Wbl').ok)).toBe(true);
});

test('Łączność: zezwolenie na jazdę manewrową obok uszkodzonego sygnalizatora (Ir-9 § 10 ust. 15) – skład rusza w nastawionym przebiegu', async ({ page }) => {
  await openShift(page, 'szkolna', { params: { scenariusz: 'zmiana-e' } });
  await advance(page, 30); // Lipno zgłasza 6101
  await btn(page, { kind: 'block', exit: 'W', btn: 'Poz' }).click();
  await btn(page, { kind: 'signal', id: 'A', color: 'green' }).click();
  await btn(page, { kind: 'signal', id: 'D2', color: 'green' }).click(); // przyjęcie na tor 2
  const stopped = () => page.evaluate(() => { const e = window.sim.traffic.timetable().find((x) => x.nr === 6101); return !!e.train && e.train.v === 0 && e.train.hasStopped; });
  for (let i = 0; i < 40 && !(await stopped()); i++) await advance(page, 20);
  // skład manewrowy przed D2, semafor D2 uszkodzony (nie da Ms2), przebieg manewrowy D2 → tor 3 nastawiony
  await page.evaluate(() => { window.sim.traffic.toShunting(6101); window.sim.faults.add({ type: 'signal-fail', target: 'D2', duration: 30 }); });
  await advance(page, 1);
  await page.evaluate(() => window.sim.ilk.setRoute('D2-kT3m'));
  for (let i = 0; i < 10 && !(await page.evaluate(() => window.sim.ilk.active.has('D2-kT3m'))); i++) await advance(page, 2);
  await advance(page, 20);
  const head = () => page.evaluate(() => window.sim.traffic.timetable().find((x) => x.nr === 6101).train.head);
  const before = await head();
  // radio do maszynisty: zezwolenie na jazdę manewrową
  await page.click('#panel-tabs button[data-tab=lacznosc]');
  await page.selectOption('#comms-to', 'driver');
  const formulas = await page.locator('#comms-formula option').allTextContents();
  expect(formulas).toContain('Skład nr …, zezwalam na jazdę manewrową – sygnalizator uszkodzony.');
  await page.selectOption('#comms-formula', 'shunt-permit');
  await page.fill('#comms-nr', '6101');
  await page.locator('#comms-form button[type=submit]').click();
  await expect(page.locator('#comms-msg')).toHaveClass(/ok/);
  await advance(page, 30);
  expect(await head()).toBeGreaterThan(before + 10);
  // zezwolenie przy uszkodzonym sygnalizatorze – bez kary za telefonogram (kara „tor inny niż planowy” pochodzi z przyjęcia
  // 6101 na tor 2, potrzebnego tylko do ustawienia sytuacji)
  expect(await page.evaluate(() => window.sim.score.items.filter((i) => i.code === 'comms-wrong').length)).toBe(0);
  await expect(page.locator('#comms-log')).toContainText('Zezwolenie przyjąłem');
});

// Przyczyna postoju w karcie pociągu (kod z Traffic.waitReason – logika w tests/waitReason.test.js – i tekst przez t()):
// np. 6106 po godzinie odjazdu przed C1 przy usterce blokady do Lipna; dawniej karta mówiła tylko „postój, odjazd …”
test('zakładka „Pociągi”: przyczyna postoju w karcie pociągu', async ({ page }) => {
  await openShift(page, 'szkolna', { params: { scenariusz: 'zmiana' } });
  await expect.poll(() => page.evaluate(() => window.sim.blocks.get('W').request)).toBe('theirs');
  await page.evaluate(() => {
    const sim = window.sim, c = sim.clock;
    sim.press({ kind: 'block', exit: 'W', btn: 'Poz' });
    c.paused = false; c.speed = 1;
    for (let i = 0; i < 2400; i++) {
      sim.step(0.5);
      if (!sim.ilk.active.size && !sim.ilk.pending.length) sim.execute({ type: 'route', start: 'A', end: 'D1', kind: 'train' });
      const tr = sim.traffic.trains.find((x) => String(x.nr) === '6101');
      if (tr?.entered && tr.v === 0 && tr.hasStopped) break;
    }
    c.paused = true;
    sim.traffic.waitReason = (e) => (e.nr === 6101 ? { code: 'phone-sz', signal: 'D1', neighbour: 'Dębno' } : null);
  });
  await page.click('#panel-tabs button[data-tab=pociagi]');
  const card = page.locator('#trains .train-card[data-nr="6101"]');
  await expect(card.locator('.train-wait')).toHaveText('blokada do Dębno bez łączności – po „droga wolna” sygnał zastępczy Sz na D1 albo rozkaz „S”');
  expect(await page.locator('#trains .train-wait').count()).toBe(1);
});

test('tabor pociągu: podpowiedź numeru w rozkładzie i karta na zakładce „Pociągi” pokazują zespół trakcyjny albo lokomotywę', async ({ page }) => {
  await openShift(page, 'szkolna', { params: { scenariusz: 'zmiana', seed: '7' } });
  await page.click('#panel-tabs button[data-tab=rj]');
  const tip = (nr) => page.locator('table.rj tbody td.nr', { hasText: new RegExp(`\\b${nr}$`) }).getAttribute('title');
  // osobowy 130 m – zespoły trakcyjne; towarowy TME – lokomotywa elektryczna, po długości i masie składu
  const t6101 = await tip(6101);
  expect(t6101).toMatch(/ · skład: 2 × [\w ]+$/);
  const t42101 = await tip(42101);
  expect(t42101).toContain('do krajowych przewozów masowych');
  expect(t42101).toContain('długość 380 m, masa brutto 2000 t · lokomotywa ');
  // pociąg utworzony ze składu 90201 ma jego tabor
  const set = (t) => t.slice(t.lastIndexOf(' · ') + 3);
  expect(set(await tip(90202))).toBe(set(await tip(90201)));
  // to samo ziarno – ten sam tabor po ponownym uruchomieniu zmiany
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.sim && document.querySelector('#desk svg'));
  await page.evaluate(() => { window.sim.clock.paused = true; });
  await page.click('#panel-tabs button[data-tab=rj]');
  expect(await tip(6101)).toBe(t6101);
  // karta pociągu na posterunku: ten sam tabor co w podpowiedzi
  await page.evaluate(() => {
    const sim = window.sim, c = sim.clock;
    sim.press({ kind: 'block', exit: 'W', btn: 'Poz' });
    c.paused = false; c.speed = 1;
    for (let i = 0; i < 2400; i++) {
      sim.step(0.5);
      if (!sim.ilk.active.size && !sim.ilk.pending.length) sim.execute({ type: 'route', start: 'A', end: 'D1', kind: 'train' });
      if (sim.traffic.trains.find((x) => String(x.nr) === '6101')?.entered) break;
    }
    c.paused = true;
  });
  await page.click('#panel-tabs button[data-tab=pociagi]');
  await expect(page.locator('#trains .train-card[data-nr="6101"] .train-stock')).toHaveText(set(t6101));
});

test('podpowiedź rozkładu: tabor zapisany w modelu i prędkość z taborem; nazwa handlowa jako tekst, nie znaczniki', async ({ page }) => {
  await openShift(page, 'reda', { params: { scenariusz: 'zmiana', seed: '3' } });
  await page.click('#panel-tabs button[data-tab=rj]');
  const tip = (nr) => page.locator('table.rj tbody td.nr', { hasText: new RegExp(`\\b${nr}$`) }).getAttribute('title');
  // TLK Hel – Warszawa z lokomotywą 754 (100 km/h): pociąg TLK (140 km/h) jedzie i jest opisany z prędkością lokomotywy
  const t5301 = await tip(5301);
  expect(t5301).toContain(' · 100 km/h');
  expect(t5301).toMatch(/ · lokomotywa 754 Nurek$/);
  // każdy wiersz: tabor = tabor wpisu w modelu (e.rollingStock), nie liczony w panelu od nowa
  const model = await page.evaluate(() => window.sim.traffic.timetable().map((e) => [e.nr, e.rollingStock?.label ?? null]));
  expect(model.every(([, label]) => label)).toBe(true);
  for (const [nr, label] of model) expect((await tip(nr)).endsWith(` ${label}`), `${nr}: ${label}`).toBe(true);
  // nazwa handlowa z danych trafia do podpowiedzi i wiersza jako tekst
  await page.evaluate(() => {
    const base = window.sim.traffic.timetable().find((e) => e.nr === 5301);
    window.sim.traffic.addTrain({ nr: 99001, kind: 'os', name: 'TLK Hel – Warszawa Wsch.', brand: 'A<b>B</b>"C', from: base.from, to: base.to, arr: '07:40', dep: '07:42', track: '3', stop: true, length: 300 });
  });
  const row = page.locator('table.rj tbody tr', { has: page.locator('td.nr', { hasText: /\b99001$/ }) });
  await expect(row).toHaveCount(1);
  expect(await tip(99001)).toContain('„A<b>B</b>"C”');
  await expect(row.locator('td.rel i')).toHaveText('„A<b>B</b>"C”');
  await expect(row.locator('td.rel b')).toHaveCount(0);
});

// Ie-104.1 „Wyświetlacz numeru pociągu”: w kasetce sam numer (znaki dodatkowe tylko „*” i „!”); dawniej stojący pociąg
// miał dopisany „■”, który gracze brali za oznaczenie czoła
test('numer pociągu na monitorze i pulpicie bez dopisków – także pociąg stojący', async ({ page }) => {
  for (const scenario of ['zmiana', 'zmiana-e']) {
    await openShift(page, 'szkolna', { params: { scenariusz: scenario } });
    await expect.poll(() => page.evaluate(() => window.sim.blocks.get('W').request)).toBe('theirs');
    await page.evaluate(() => {
      const sim = window.sim, c = sim.clock;
      sim.press({ kind: 'block', exit: 'W', btn: 'Poz' });
      c.paused = false;
      for (let i = 0; i < 2400; i++) {
        sim.step(0.5);
        if (!sim.ilk.active.size && !sim.ilk.pending.length) sim.execute({ type: 'route', start: 'A', end: 'D1', kind: 'train' });
        const tr = sim.traffic.trains.find((x) => String(x.nr) === '6101');
        if (tr?.entered && tr.v === 0 && tr.hasStopped) break;
      }
      c.paused = true;
    });
    await page.waitForTimeout(300);
    await expect(page.locator('#desk .scr-train-nr, #desk .train-nr, #desk text', { hasText: /^6101/ }).first()).toHaveText('6101');
    expect(await page.evaluate(() => document.querySelector('#desk').textContent.includes('■'))).toBe(false);
  }
});
