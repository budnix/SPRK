import { test, expect } from '@playwright/test';
import { openShift, btn, simState, advance, hit } from './helpers.js';

/* Pulpit kostkowy (urządzenia typu E) – Stare Pustkowie */

test('ekran startowy bez parametrów: tytuł → Służba (lista alfabetycznie / wg trudności) → strona stacji → start zmiany', async ({ page }) => {
  await page.goto('/', { waitUntil: 'load' });
  await expect(page.locator('#start')).toBeVisible();
  expect(await page.locator('#start .st-logo-svg').count()).toBe(1); // logo SVG zamiast napisu
  // ekran tytułowy: służba, szkolenie, ustawienia (ostatniej zmiany jeszcze nie ma); bez list misji i posterunków
  await expect(page.locator('#st-service')).toBeVisible();
  await expect(page.locator('#st-training')).toBeVisible();
  await expect(page.locator('#st-settings')).toBeVisible();
  await expect(page.locator('#st-last')).toHaveCount(0);
  await expect(page.locator('.st-card, .st-mission')).toHaveCount(0);
  await page.click('#st-service');
  await expect(page).toHaveURL(/#\/sluzba$/); // służba zaczyna się od mapy – lista obok
  await page.click('.st-mode a[data-mode=list]');
  await expect(page).toHaveURL(/#\/sluzba\/lista$/);
  // domyślnie alfabetycznie
  const names = await page.locator('.st-card .st-name').allTextContents();
  expect(names.length).toBeGreaterThanOrEqual(9);
  expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, 'pl')));
  expect(await page.locator('.st-card .st-diff').first()).toBeVisible();
  // wg trudności: skala 1–5 niemalejąco, wybór zapamiętany po przeładowaniu (adres #/sluzba/lista zostaje)
  await page.click('.st-sort button[data-sort=difficulty]');
  const diffList = await page.locator('.st-card .st-diff b').allTextContents();
  const counts = diffList.map((s) => Number(s.split('/')[0]));
  expect(counts.every((c) => c >= 1 && c <= 5)).toBe(true);
  expect(counts).toEqual([...counts].sort((a, b) => a - b));
  await page.reload({ waitUntil: 'load' });
  await expect(page.locator('.st-sort button[data-sort=difficulty]')).toHaveClass(/active/);
  expect(await page.locator('.st-card .st-thumb svg path').count()).toBeGreaterThan(0); // miniatury planów
  // stacje szkoleniowe są tylko w misjach – wśród posterunków ich nie ma
  for (const id of ['szkolna', 'jodlowa', 'zacisze', 'olszyny']) await expect(page.locator(`.st-card[data-id=${id}]`)).toHaveCount(0);
  // Rumia: zmiana na pulpicie typu E i na monitorze – karta „stanowisko do wyboru”, chip jak pozostałe (szary)
  await expect(page.locator('.st-card[data-id=rumia] .st-srk-both')).toHaveText('stanowisko do wyboru');
  const chips = await page.locator('.st-card[data-id=rumia] .st-srk, .st-card[data-id=sopot] .st-srk').evaluateAll((els) => els.map((e) => getComputedStyle(e).color + '|' + getComputedStyle(e).borderTopColor));
  expect(new Set(chips).size).toBe(1);
  await expect(page.locator('.st-card[data-id=sopot] .st-srk').first()).toHaveText('komputerowe · monitor');
  // karta otwiera stronę stacji z parametrami zmiany
  await page.click('.st-card[data-id=rumia]');
  await expect(page).toHaveURL(/#\/stacja\/rumia$/);
  const opts = await page.locator('#st-scenario option').allTextContents();
  expect(opts).toEqual(['Pełna zmiana – pulpit kostkowy typu E (05:55–08:15)', 'Pełna zmiana – stanowisko komputerowe (05:55–08:15)', 'Usterka blokady od Redy', 'Szczyt z zakłóceniami']);
  expect(opts.some((o) => /samouczek/i.test(o))).toBe(false);
  // „wstecz” – do regionu stacji, przeglądarka – z powrotem na listę
  await page.click('#st-up');
  await expect(page).toHaveURL(/#\/sluzba\/pomorskie$/);
  await page.goBack(); await page.goBack();
  await expect(page).toHaveURL(/#\/sluzba\/lista$/);
  await page.click('.st-card[data-id=sopot]');
  await expect(page.locator('#st-briefing')).toHaveClass(/open/);
  await expect(page.locator('#st-params')).toBeVisible();
  await expect(page.locator('#st-briefing .st-bname')).toHaveText('Sopot');
  await expect(page.locator('#st-station-desc')).toContainText('Ebilock');
  await page.selectOption('#st-level', 'none');
  await page.click('#st-go');
  await page.waitForURL(/stacja=sopot.*zaklocenia=none/);
  expect(new URL(page.url()).hash).toBe(''); // zmiana startuje bez adresu ekranu wyboru
  await expect(page.locator('#station-name')).toContainText('Sopot');
});

test('przebieg pociągowy dwoma przyciskami, wyciągnięcie gasi sygnał, Zw + zwrotnica przestawia', async ({ page }) => {
  await openShift(page, 'szkolna', { params: { scenariusz: 'zmiana-e' } });
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

test('lampki pulpitu typu E: powtarzacz – czerwona przy „Stój”, sama zielona przy sygnale zezwalającym; wykolejnica – żółta tylko zdjęta; przyciski grupowe czarne', async ({ page }) => {
  await openShift(page, 'sopot', { params: { srk: 'E' } });
  const lamps = (id) => page.evaluate((i) => Object.fromEntries(Object.entries(window.desk.signalRefs.get(i).lamps)
    .map(([c, e]) => [c, e.classList.contains('on') ? e.getAttribute('class').match(/lamp-(\w+)/)?.[1] : null])), id);
  const sig = await page.evaluate(() => [...window.sim.ilk.signals.values()].find((s) => s.kind === 'semafor' && !s.shunting && s.aspect === 'S1' && window.desk.signalRefs.has(s.id)).id);
  expect(Object.keys(await lamps(sig)).sort()).toEqual(['green', 'red', 'white']);
  expect(await lamps(sig)).toEqual({ green: null, red: 'red', white: null });
  // S1 → sygnał zezwalający (jakikolwiek: S2, S5, S10…): świeci tylko zielona
  await page.evaluate((i) => { const s = window.sim.ilk.signals.get(i); s.aspect = 'S12'; window.desk.updateSignal(i); }, sig);
  expect(await lamps(sig)).toEqual({ green: 'green', red: null, white: null });
  // wykolejnica nałożona – lampka zgaszona; Zw + Wk zdejmuje – żółta
  const wk = (await page.evaluate(() => [...window.sim.ilk.derailers.values()].find((d) => d.position === 'on' && window.desk.derailerRefs.has(d.id))?.id));
  expect(wk).toBeTruthy();
  const wkLamp = () => page.evaluate((i) => { const e = window.desk.derailerRefs.get(i).derailerLamp; return e.classList.contains('on') ? e.getAttribute('class') : 'off'; }, wk);
  expect(await wkLamp()).toBe('off');
  await btn(page, { kind: 'group', id: 'Zw', role: 'group-point' }).click();
  await btn(page, { kind: 'derailer', id: wk }).click();
  await advance(page, 8);
  expect(await page.evaluate((i) => window.sim.ilk.derailers.get(i).position, wk)).toBe('off');
  expect(await wkLamp()).toMatch(/lamp-yellow/);
  // przyciski grupowe – wszystkie czarne
  const groupColors = await page.locator('#desk .btn[data-ref*=\'"kind":"group"\']').evaluateAll((els) => els.map((e) => [...e.classList].find((c) => /^btn-/.test(c))));
  expect(groupColors.length).toBeGreaterThanOrEqual(5);
  expect(new Set(groupColors)).toEqual(new Set(['btn-black']));
});

test('blokada liniowa: kostki przy końcu toru (strzałki na torze, Ko|Poz|Wbl obok, liczniki wyżej); Wbl wysyła żądanie, po odpowiedzi sąsiada pozwolenie', async ({ page }) => {
  await openShift(page, 'szkolna', { params: { scenariusz: 'zmiana-e' } });
  // brak osobnego pola blokady; kostki blokady leżą w rzędach 2–3 przy prawym krańcu, strzałki na dwóch skrajnych kostkach toru
  expect(await page.locator('#desk .t-block').count()).toBe(0);
  const cluster = page.locator('#desk .block-cluster[data-exit=E]');
  expect(await cluster.locator('.t-blockdev').count()).toBe(5);
  const cells = await cluster.locator('.t-blockdev').evaluateAll((els) => els.map((g) => /translate\((-?[\d.]+),(-?[\d.]+)\)/.exec(g.getAttribute('transform')).slice(1).map((v) => +v / 40)));
  expect(cells).toEqual([[31, 3], [30, 3], [29, 3], [31, 2], [30, 2]]);
  const arrows = await page.locator('#desk .t-track .arrow-lamp').evaluateAll((els) => els.length);
  expect(arrows).toBe(4); // dwa krańce × (przyjazd + odjazd)
  const labelsByCol = await page.locator('#desk .t-track:has(.blk-arrow-label)').evaluateAll((els) => Object.fromEntries(els.map((g) => [+/translate\((-?[\d.]+)/.exec(g.getAttribute('transform'))[1] / 40, g.querySelector('.blk-arrow-label').textContent])));
  // opisy jak na pulpitach typu E (ISDR tabl. 2.3.12): „odjazd” na kostce skrajnej (grot ku krawędzi), „przyjazd” na następnej
  expect(labelsByCol).toEqual({ 0: 'odjazd', 1: 'przyjazd', 30: 'przyjazd', 31: 'odjazd' });
  // nazwa sąsiedniego posterunku zostaje na kostce skrajnej (nad torem); rysowana w warstwie ponad kostkami (.tile-over)
  const names = await page.locator('#desk .t-track:has(text.small), #desk .tile-over:has(text.small)').evaluateAll((els) => Object.fromEntries(els.map((g) => [g.querySelector('text.small').textContent, +/translate\((-?[\d.]+)/.exec(g.getAttribute('transform'))[1] / 40])));
  const exits = await page.evaluate(() => { const st = window.sim.station; const txt = (id) => st.tiles.find((t) => t.x === st.exits[id].tile.x && t.y === st.exits[id].tile.y).text; return { W: txt('W'), E: txt('E') }; }); // napis z kostki wyjazdu (może być skrócony)
  expect(names[exits.W]).toBe(0);
  expect(names[exits.E]).toBe(31);
  // zajętość odcinka pod kostką strzałki: strzałka świeci na czerwono (kostka nie ma paska świetlnego)
  const red = await page.evaluate(() => {
    const st = window.sim.station, ex = st.exits.E.tile;
    const sid = st.tiles.find((t) => t.x === ex.x && t.y === ex.y).section;
    const sec = window.sim.ilk.sections.get(sid);
    const arrow = [...document.querySelectorAll('#desk .t-track')].find((g) => /translate\(1240,/.test(g.getAttribute('transform'))).querySelector('.arrow-lamp');
    const before = arrow.classList.contains('lamp-red');
    sec.occupied = true; window.sim.bus.emit('section', sec);
    const during = arrow.classList.contains('lamp-red') && arrow.classList.contains('on');
    sec.occupied = false; window.sim.bus.emit('section', sec);
    return { before, during, after: arrow.classList.contains('lamp-red') };
  });
  expect(red).toEqual({ before: false, during: true, after: false });
  await btn(page, { kind: 'block', exit: 'E', btn: 'Wbl' }).click();
  const req = await page.evaluate(() => window.sim.blocks.get('E').request);
  expect(req).toBe('ours');
  // wyciągnięcie Wbl (prawy przycisk) odwołuje żądanie – bez licznika (oWbl)
  await btn(page, { kind: 'block', exit: 'E', btn: 'Wbl' }).click({ button: 'right' });
  expect(await page.evaluate(() => { const b = window.sim.blocks.get('E'); return [b.request, b.counters.dPo + b.counters.dKo]; })).toEqual([null, 0]);
  await btn(page, { kind: 'block', exit: 'E', btn: 'Wbl' }).click();
  expect(await page.evaluate(() => window.sim.blocks.get('E').request)).toBe('ours');
  // nasze żądanie: strzałka „odjazd” miga na biało, dopóki sąsiad nie odpowie (bez osobnej lampki przy Wbl)
  const outArrow = page.locator('#desk .t-track[transform^="translate(1240,"] .arrow-lamp');
  await expect(outArrow).toHaveClass(/blink/);
  await advance(page, 40);
  const perm = await page.evaluate(() => { const b = window.sim.blocks.get('E'); return b.permission || b.direction; });
  expect(perm).toBeTruthy();
  await expect(outArrow).not.toHaveClass(/blink/);
  // sygnał wyjazdowy podany – czerwona lampka Pwl na kostce Wbl; Ko świeci światłem ciągłym (nie miga)
  const pwl = cluster.locator('.t-blockdev').nth(2).locator('.lamp');
  await expect(pwl).not.toHaveClass(/\bon\b/);
  await page.evaluate(() => window.sim.ilk.setRoute('D1-E'));
  await advance(page, 8);
  await expect(pwl).toHaveClass(/lamp-red/);
  await expect(pwl).toHaveClass(/\bon\b/);
});

test('etykieta numeru pociągu leży wewnątrz kostki czoła pociągu (nie zasłania przycisków w sąsiednim rzędzie)', async ({ page }) => {
  await openShift(page, 'szkolna', { params: { scenariusz: 'zmiana-e' } });
  await advance(page, 30); // Lipno zgłasza 6101
  await btn(page, { kind: 'block', exit: 'W', btn: 'Poz' }).click();
  await btn(page, { kind: 'signal', id: 'A', color: 'green' }).click();
  await btn(page, { kind: 'signal', id: 'D1', color: 'green' }).click();
  await advance(page, 300); // 6101 wjeżdża na stację
  const labels = await page.locator('#desk .train-label').evaluateAll((els) => els.filter((e) => e.style.display !== 'none').map((e) => {
    const ty = +/,(-?[\d.]+)\)/.exec(e.getAttribute('transform'))[1];
    const r = e.querySelector('rect'); const top = ty + +r.getAttribute('y'), bottom = top + +r.getAttribute('height');
    const rowTop = Math.floor(ty / 40) * 40;
    return { nr: e.textContent.trim(), inside: top >= rowTop && bottom <= rowTop + 40 };
  }));
  expect(labels.length).toBeGreaterThan(0);
  for (const l of labels) expect(l.inside, `${l.nr}: etykieta wychodzi poza rząd kostki`).toBe(true);
});

// Kierunek SBL zmienia się za zgodą sąsiada (Ir-1 §30 ust. 2 pkt 1) – Zk to prośba, dawniej działało od razu; SBL nie ma
// liczników doraźnych (dawniej rysowane przy Zk).
test('blokada samoczynna na pulpicie kostkowym: kostka Zk – prośba o zmianę kierunku, po zgodzie sąsiada kierunek zmieniony', async ({ page }) => {
  await openShift(page, 'sopot', { params: { srk: 'E' } });
  const before = await page.evaluate(() => window.sim.blocks.get('OR1').direction);
  await btn(page, { kind: 'block', exit: 'OR1', btn: 'Zk' }).click();
  await advance(page, 2);
  expect(await page.evaluate(() => [window.sim.blocks.get('OR1').direction, window.sim.blocks.get('OR1').request])).toEqual([before, 'ours']);
  await advance(page, 30);
  const after = await page.evaluate(() => window.sim.blocks.get('OR1').direction);
  expect(after).not.toBe(before);
  expect(await page.locator('#desk .block-cluster[data-exit=OR1] .t-blockdev').count()).toBe(1); // tylko Zk
});

test('ustawienia: motyw i położenie panelu są zapamiętane po przeładowaniu; ukryty panel pokazuje licznik dziennika', async ({ page }) => {
  await openShift(page, 'szkolna', { settings: { theme: 'dark', sidePos: 'right' }, params: { scenariusz: 'zmiana-e' } });
  await page.click('#btn-menu');
  await page.click('#menu-settings');
  await expect(page.locator('#settings')).toBeVisible();
  await page.check('#settings input[name=theme][value=light]');
  await page.check('#settings input[name=sidePos][value=bottom]');
  await page.keyboard.press('Escape');
  await expect(page.locator('#settings')).toBeHidden();
  await page.reload({ waitUntil: 'load' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page.locator('#app')).toHaveAttribute('data-side-pos', 'bottom');
  await page.click('#side-toggle');
  await expect(page.locator('#app')).toHaveAttribute('data-side-collapsed', 'true');
  await expect(page.locator('#side-toggle')).toHaveAttribute('aria-label', 'Pokaż panel'); // ikona panelu: część boczna pusta
  await expect(page.locator('#side-toggle')).toHaveClass(/collapsed/);
  await page.evaluate(() => window.sim.bus.emit('log', { time: window.sim.clock.time, level: 'warn', msg: 'Test ostrzeżenia' }));
  await expect(page.locator('#panel-tabs button[data-tab=log] .badge')).toHaveText('1');
  await page.click('#panel-tabs button[data-tab=log]');
  await expect(page.locator('#app')).toHaveAttribute('data-side-collapsed', 'false');
  await expect(page.locator('#panel-tabs button.active')).toContainText('Dziennik');
  await expect(page.locator('#log li').first()).toContainText('Test ostrzeżenia');
});

test('struktura pulpitu: każdy sygnalizator, zwrotnica, wykolejnica, koniec przebiegu i blokada ma przycisk (regresja renderera)', async ({ page }) => {
  await openShift(page, 'szkolna', { params: { scenariusz: 'zmiana-e' } });
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
    }
    // blokada liniowa: kostki przy końcu toru szlakowego (z definicji wyjazdu, nie z kostek stacji)
    for (const [id, e] of Object.entries(st.exits)) {
      const want = e.block === 'sbl' ? ['Zk'] : e.direction === 'in' ? ['Ko', 'dKo'] : e.direction === 'out' ? ['dPo'] : ['Wbl', 'Poz', 'Ko', 'dPo', 'dKo'];
      for (const b of want) if (!has((r) => r.kind === 'block' && r.exit === id && r.btn === b)) missing.push(`block ${id} ${b}`);
    }
    return {
      missing, refs: refs.length, unique: new Set(refs.map((r) => JSON.stringify(r))).size,
      tiles: document.querySelectorAll('#desk .tile').length, defined: st.tiles.length,
    };
  });
  expect(s.missing).toEqual([]);
  expect(s.unique).toBe(s.refs); // brak zdublowanych przycisków
  // na kostce wyjazdu opis strzałki (pod torem) i nazwa sąsiada (nad torem, obok przycisku) nie nachodzą na przycisk końca przebiegu (nad torem, od krawędzi pulpitu)
  const overlaps = await page.evaluate(() => {
    const out = [];
    const hit = (a, b) => !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom);
    for (const b of document.querySelectorAll(`#desk .btn[data-ref*='"kind":"end"']`)) {
      const tile = b.closest('.tile'); const box = tile?.querySelector('.arrow-lamp'), lbl = tile?.querySelector('.blk-arrow-label'), name = tile?.querySelector('text.small'); if (!box) continue;
      const rb = b.querySelector('.btn-ring').getBoundingClientRect(); // widoczny przycisk (bez niewidocznego pola trafienia)
      out.push([lbl.textContent, [box, lbl, name].filter(Boolean).some((e) => hit(rb, e.getBoundingClientRect()))]);
    }
    return out;
  });
  expect(overlaps.length).toBeGreaterThan(0);
  // semafor z sygnałem manewrowym: biały przycisk nie zasłania opisu pociągowego, a pola trafienia obu przycisków
  // się nie nakładają (dotknięcie zielonego nie może trafić w biały – to blokowało nastawienie przebiegu pociągowego)
  const sigOverlaps = await page.evaluate(() => {
    const hit = (a, b) => !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom);
    return [...document.querySelectorAll('#desk .t-signal')].filter((t) => t.querySelectorAll('.btn').length === 2).map((t) => {
      const [lblGreen] = t.querySelectorAll('text.sig-label');
      const white = t.querySelector('.btn-white .btn-ring');
      const hitG = t.querySelector('.btn-green .btn-hit').getBoundingClientRect(), hitW = t.querySelector('.btn-white .btn-hit').getBoundingClientRect();
      return [lblGreen.textContent, hit(white.getBoundingClientRect(), lblGreen.getBoundingClientRect()), hit(hitG, hitW)];
    });
  });
  expect(sigOverlaps.length).toBeGreaterThan(0);
  for (const [id, ov, hits] of sigOverlaps) { expect(ov, `${id}: biały przycisk zasłania opis`).toBe(false); expect(hits, `${id}: pola trafienia przycisków nakładają się`).toBe(false); }
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

test('motyw interfejsu: akcent niebieski (aktywna prędkość, zakładki), logo SVG na pasku górnym, popupy z niebieską ramką', async ({ page }) => {
  await openShift(page, 'szkolna', { params: { scenariusz: 'zmiana' } });
  expect(await page.locator('#topbar .logo .st-logo-svg').count()).toBe(1);
  await expect(page.locator('#topbar .logo')).not.toHaveText(/SPRK/); // napis zastąpiony grafiką (aria-label zostaje)
  const bg = await page.locator('.speed-btn.active').evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(['rgb(63, 140, 255)', 'rgb(31, 111, 224)']).toContain(bg); // ciemny / jasny motyw
  // listwa: zakładki panelu (zielona etykieta, bez ramki grupy) na początku, potem szara grupa „ekran” z ekranami, podpisem „wyrównanie” i zoomem
  const col = (sel) => page.locator(sel).first().evaluate((el) => getComputedStyle(el).color);
  const panelCol = await col('.tg-panel .lbl'), viewCol = await col('.tg-view .lbl');
  await expect(page.locator('.tg-view .lbl').first()).toHaveText('ekran');
  await expect(page.locator('.tg-view .lbl-align')).toHaveText('wyrównanie');
  expect(['rgb(111, 191, 143)', 'rgb(46, 154, 92)']).toContain(panelCol);
  expect(viewCol).not.toBe(panelCol);
  expect(await page.locator('.tg-panel').evaluate((el) => getComputedStyle(el).borderTopStyle)).toBe('none');
  const groups = await page.locator('#desk-tools .tool-group').evaluateAll((els) => els.map((e) => e.className));
  expect(groups[0]).toContain('tg-panel'); expect(groups[1]).toContain('tg-view');
  // „widok” wyrównany do prawej (obok przycisku panelu) i w pionie na środku listwy – tak jak ten przycisk
  const tools = await page.locator('#desk-tools').boundingBox(), view = await page.locator('.tg-view').boundingBox(), tog = await page.locator('#side-toggle').boundingBox();
  expect(view.x + view.width).toBeGreaterThan(tools.x + tools.width / 2);
  expect(view.x + view.width).toBeLessThan(tog.x);
  expect(Math.abs((view.y - tools.y) - (tools.y + tools.height - view.y - view.height))).toBeLessThanOrEqual(1);
  expect(await page.locator('#side nav, #side .tabs').count()).toBe(0); // zakładki tylko w listwie
  const active = page.locator('#panel-tabs .tb.active');
  await expect(active).toHaveText('Rozkład');
  expect(await active.evaluate((el) => getComputedStyle(el).borderTopColor)).toBe(panelCol);
  // stabilność: zmiana zakładki ani licznik powiadomień nie przesuwają sąsiednich kart; przyciski „widok” jednej wysokości
  const boxes = async () => page.locator('#panel-tabs .tb').evaluateAll((els) => els.map((e) => [e.getBoundingClientRect().x, e.getBoundingClientRect().width]));
  const before = await boxes();
  await page.click('#panel-tabs button[data-tab=stan]');
  expect(await boxes()).toEqual(before);
  await page.evaluate(() => window.sim.bus.emit('log', { time: window.sim.clock.time, level: 'warn', msg: 'test' }));
  await expect(page.locator('#panel-tabs button[data-tab=log] .badge')).toBeVisible();
  expect(await boxes()).toEqual(before);
  const heights = await page.locator('.tg-view .tb:not(.hidden)').evaluateAll((els) => [...new Set(els.map((e) => Math.round(e.getBoundingClientRect().height)))]);
  expect(heights).toHaveLength(1);
  await page.click('#btn-menu');
  const border = await page.locator('#menu').evaluate((el) => getComputedStyle(el).borderTopColor);
  expect(border).not.toBe('rgb(68, 68, 68)'); // nie szara ramka – domieszka akcentu
  const radius = await page.locator('#menu').evaluate((el) => getComputedStyle(el).borderTopLeftRadius);
  expect(radius).toBe('4px');
});

test('grupa „ekran”: etykiety i przyciski w jednej osi, numer ekranu tym samym krojem co podpis', async ({ page }) => {
  await openShift(page, 'gdynia-chylonia', { settings: { screens: 'auto', sideCollapsed: true } });
  // wnętrze grupy „ekran” w jednej osi: etykiety i przyciski mają ten sam środek w pionie (±1 px), numer ekranu tym samym krojem co reszta
  await expect(page.locator('#screen-group')).toBeVisible();
  const mids = await page.locator('.tg-view .lbl, .tg-view .tb:not(.hidden)').evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return r.y + r.height / 2; }));
  expect(Math.max(...mids) - Math.min(...mids)).toBeLessThanOrEqual(1);
  const fonts = await page.locator('#screen-tabs .tb, #screen-tabs .tb small').evaluateAll((els) => [...new Set(els.map((e) => `${getComputedStyle(e).fontFamily}|${getComputedStyle(e).fontSize}|${getComputedStyle(e).fontWeight}`))]);
  expect(fonts).toHaveLength(1);
  // bez podziału na ekrany znika też etykieta „ekran” – zostaje samo „wyrównanie” z przyciskami
  await page.click('#btn-menu'); await page.click('#menu-settings');
  await page.check('#settings input[name=screens][value=off]');
  await page.keyboard.press('Escape');
  await expect(page.locator('#screen-group')).toBeHidden();
  await expect(page.locator('.tg-view .lbl:not(.lbl-align)')).toBeHidden();
  await expect(page.locator('.tg-view .lbl-align')).toBeVisible();
});

test('„Nowa zmiana…” czyści parametry URL (odświeżenie zostaje na wyborze scenariusza), „Wróć do zmiany” je przywraca', async ({ page }) => {
  await openShift(page, 'szkolna', { params: { scenariusz: 'zmiana-e' } });
  expect(new URL(page.url()).search).toContain('stacja=szkolna');
  await page.click('#btn-menu'); await page.click('#menu-new');
  await expect(page.locator('#start')).toBeVisible();
  expect(new URL(page.url()).search).toBe('');
  await page.click('#st-close');
  await expect(page.locator('#start')).toBeHidden();
  expect(new URL(page.url()).search).toContain('scenariusz=zmiana-e'); // powrót do tej samej zmiany – odświeżenie ją wczyta
  await page.click('#btn-menu'); await page.click('#menu-new');
  await page.reload({ waitUntil: 'load' });
  await expect(page.locator('#start')).toBeVisible();
  expect(new URL(page.url()).search).toBe('');
});

test('Rumia: karta „stanowisko do wyboru” (typ E i komputerowe); pulpit kostkowy rysuje stację z blokadami, stanowisko komputerowe – semafory dwustopniowego wyjazdu', async ({ page }) => {
  await page.goto('/#/sluzba/lista', { waitUntil: 'load' });
  await expect(page.locator('.st-card[data-id=rumia] .st-name')).toHaveText('Rumia');
  await expect(page.locator('.st-card[data-id=rumia] .st-srk-both')).toHaveText('stanowisko do wyboru');
  await openShift(page, 'rumia', { settings: { sideCollapsed: true } });
  await expect(page.locator('#desk svg')).toBeVisible();
  expect(await page.evaluate(() => ({ srk: window.sim.srk.view, blocks: [...window.sim.blocks.keys()] }))).toEqual({ srk: 'desk', blocks: ['GC2', 'GC1', 'GS2', 'GS1', 'RD2', 'RD1'] });
  await expect(page.locator('#desk svg text', { hasText: 'RUMIA' })).toBeVisible();
  await openShift(page, 'rumia', { settings: { sideCollapsed: true }, params: { scenariusz: 'zmiana-lcs' } });
  expect(await page.evaluate(() => window.sim.srk.view)).toBe('screen');
  for (const id of ['C', 'G311', 'E', 'D312']) await expect(hit(page, id)).toBeAttached();
});

test('Reda: karta „stanowisko do wyboru”; pulpit z blokadą dwukierunkową do Helu, stanowisko komputerowe – semafory R, P, Szn1, S', async ({ page }) => {
  await page.goto('/#/sluzba/lista', { waitUntil: 'load' });
  await expect(page.locator('.st-card[data-id=reda] .st-name')).toHaveText('Reda');
  await expect(page.locator('.st-card[data-id=reda] .st-srk-both')).toHaveText('stanowisko do wyboru');
  await openShift(page, 'reda', { settings: { sideCollapsed: true } });
  await expect(page.locator('#desk svg')).toBeVisible();
  expect(await page.evaluate(() => ({ srk: window.sim.srk.view, blocks: [...window.sim.blocks.values()].map((b) => `${b.id}:${b.fixed || 'both'}`) })))
    .toEqual({ srk: 'desk', blocks: ['RM2:out', 'RM1:in', 'WJ2:in', 'WJ1:out', 'HL:both'] });
  await expect(page.locator('#desk svg text', { hasText: 'REDA' })).toBeVisible();
  await openShift(page, 'reda', { settings: { sideCollapsed: true }, params: { scenariusz: 'zmiana-lcs' } });
  expect(await page.evaluate(() => window.sim.srk.view)).toBe('screen');
  for (const id of ['R', 'P', 'Szn1', 'S', 'Tm20']) await expect(hit(page, id)).toBeAttached();
});

test('Tczew: karta „komputerowe”; stanowisko komputerowe z blokadami czterech linii i semaforami wjazdowymi A1, E1, U, S, P, Z', async ({ page }) => {
  await page.goto('/#/sluzba/lista', { waitUntil: 'load' });
  await expect(page.locator('.st-card[data-id=tczew] .st-name')).toHaveText('Tczew');
  await expect(page.locator('.st-card[data-id=tczew] .st-srk').first()).toHaveText('komputerowe · monitor');
  await expect(page.locator('.st-card[data-id=tczew] .st-srk-both')).toHaveCount(0);
  await openShift(page, 'tczew', { settings: { sideCollapsed: true } });
  expect(await page.evaluate(() => ({ srk: window.sim.srk.view, blocks: [...window.sim.blocks.values()].map((b) => `${b.id}:${b.auto ? 'sbl' : b.fixed || 'both'}`) })))
    .toEqual({ srk: 'screen', blocks: ['GK2:sbl', 'GK1:sbl', 'SZ2:sbl', 'SZ1:sbl', 'ML2:in', 'ML1:out', 'PS2:sbl', 'PS1:sbl', 'ZA2:in', 'ZA1:out', 'ZB:both'] });
  for (const id of ['A1', 'E1', 'U', 'S', 'P', 'Z', 'K1', 'M15']) await expect(hit(page, id)).toBeAttached();
});

test('Pruszcz Gdański: karta „komputerowe”; monitor z blokadami linii 9 (SBL), 260, 229 i 226 (Eap jednotorowe) i semaforami wjazdowymi C, D, P, S, R', async ({ page }) => {
  await page.goto('/#/sluzba/lista', { waitUntil: 'load' });
  await expect(page.locator('.st-card[data-id=pruszcz-gdanski] .st-name')).toHaveText('Pruszcz Gdański');
  await expect(page.locator('.st-card[data-id=pruszcz-gdanski] .st-srk').first()).toHaveText('komputerowe · monitor');
  await expect(page.locator('.st-card[data-id=pruszcz-gdanski] .st-srk-both')).toHaveCount(0);
  await openShift(page, 'pruszcz-gdanski', { settings: { sideCollapsed: true } });
  expect(await page.evaluate(() => ({ srk: window.sim.srk.view, blocks: [...window.sim.blocks.values()].map((b) => `${b.id}:${b.auto ? 'sbl' : b.fixed || 'both'}`) })))
    .toEqual({ srk: 'screen', blocks: ['SP:both', 'PS2:sbl', 'PS1:sbl', 'ZT:both', 'GD2:sbl', 'GD1:sbl', 'GP:both'] });
  for (const id of ['C', 'D', 'P', 'S', 'R', 'E3', 'G7']) await expect(hit(page, id)).toBeAttached();
});

test('Gdańsk Główny: karta „komputerowe”; monitor z blokadami SBL (9, Śródmieście, 202, 250) i Eap (227, 249), semafory wjazdowe B, A501, G, N, H, M i kozły torów czołowych', async ({ page }) => {
  await page.goto('/#/sluzba/lista', { waitUntil: 'load' });
  await expect(page.locator('.st-card[data-id=gdansk-glowny] .st-name')).toHaveText('Gdańsk Główny');
  await expect(page.locator('.st-card[data-id=gdansk-glowny] .st-srk').first()).toHaveText('komputerowe · monitor');
  await expect(page.locator('.st-card[data-id=gdansk-glowny] .st-srk-both')).toHaveCount(0);
  await openShift(page, 'gdansk-glowny', { settings: { sideCollapsed: true } });
  expect(await page.evaluate(() => ({ srk: window.sim.srk.view, blocks: [...window.sim.blocks.values()].map((b) => `${b.id}:${b.auto ? 'sbl' : b.fixed || 'both'}`) })))
    .toEqual({ srk: 'screen', blocks: ['GP2:sbl', 'GP1:sbl', 'SR2:sbl', 'SR1:sbl', 'ZT:both', 'WR2:sbl', 'WR1:sbl', 'SK2:sbl', 'SK1:sbl', 'BR:both'] });
  for (const id of ['B', 'A501', 'G', 'N', 'H', 'M', 'F7', 'E502']) await expect(hit(page, id)).toBeAttached();
});

test('nazwy szlaków na pulpitach nie są zakryte przez sąsiednią kostkę (dłuższe nazwy wychodzą poza swoją kostkę)', async ({ page }) => {
  const covered = [];
  for (const [station, scenario] of [['szkolna', 'zmiana-e'], ['jodlowa', 'zmiana'], ['zacisze', 'zmiana'], ['zacisze', 'zmiana-e'], ['reda', 'zmiana'], ['rumia', 'zmiana'], ['olszyny', 'zmiana-e'], ['olszyny', 'zmiana']]) {
    await openShift(page, station, { params: { scenariusz: scenario } });
    covered.push(...await page.evaluate((where) => {
      const faces = [...document.querySelectorAll('#desk rect.face')];
      const overlap = (p, q) => Math.min(p.right, q.right) - Math.max(p.left, q.left) > 1 && Math.min(p.bottom, q.bottom) - Math.max(p.top, q.top) > 1;
      // płytka kostki narysowana później (wyżej w SVG) i nachodząca na napis zakrywa go
      return [...document.querySelectorAll('#desk .tile-text.small')].flatMap((t) => {
        const b = t.getBoundingClientRect();
        return faces.filter((f) => t.compareDocumentPosition(f) & Node.DOCUMENT_POSITION_FOLLOWING && overlap(b, f.getBoundingClientRect())).map(() => `${where}: „${t.textContent}”`);
      });
    }, `${station}/${scenario}`));
  }
  expect(covered).toEqual([]);
});

test('zajęty odcinek zwrotnicowy świeci tylko na drodze, w którą leży zwrotnica – łącznica obok ciemna (wszystkie stanowiska)', async ({ page }) => {
  // Olszyny: Iz1 = tor przed ostrzem Zw1 (4,4), zwrotnica 1 i łącznica do toru 2 (6,5), (7,6)
  for (const scenariusz of ['zmiana', 'zmiana-e', 'zmiana-izh', 'zmiana-lcs']) {
    await openShift(page, 'olszyny', { params: { scenariusz } });
    const lit = () => page.evaluate(() => {
      const refs = window.desk.sectionRefs.get('Iz1');
      const on = (k) => refs.filter((r) => (r.tile ?? r._tile)?._key === k).map((r) => (r.el ?? r).getAttribute('class')).join(' ');
      return { toe: on('4,4'), link: on('6,5') };
    });
    await page.evaluate(() => { window.sim.ilk.updateOccupancy(new Set(['Iz1'])); });
    const straight = await lit();
    expect(straight.toe, scenariusz).toMatch(/lamp-red|occ/);
    expect(straight.link, scenariusz).not.toMatch(/lamp-red|occ/);
    // zwrotnica przełożona na łącznicę – łącznica świeci zajętość
    await page.evaluate(() => { const s = window.sim; s.ilk.updateOccupancy(new Set()); s.ilk.points.get('Zw1').position = '-'; s.ilk.points.get('Zw1').target = '-'; s.bus.emit('point', s.ilk.points.get('Zw1')); s.ilk.updateOccupancy(new Set(['Iz1'])); });
    expect((await lit()).link, scenariusz).toMatch(/lamp-red|occ/);
  }
});

test('etykieta pociągu wjeżdżającego ze szlaku nie zasłania nazwy szlaku na kostce skrajnej (typ E, IZH-111, mechaniczna)', async ({ page }) => {
  for (const scenariusz of ['zmiana-e', 'zmiana-izh', 'zmiana']) {
    await openShift(page, 'olszyny', { params: { scenariusz } });
    // 8401 z Wierzbna (kostka skrajna x = 0) i 8402 z Grabowca (x = 29): czoło do czwartej kostki od krańca –
    // w każdym kroku nazwa szlaku odkryta
    const res = await page.evaluate(() => {
      const s = window.sim, c = s.clock; c.paused = false;
      const out = { seen: 0, hits: [] };
      for (const [nr, line, inside] of [[8401, 'Wierzbno', (x) => x >= 4], [8402, 'Grabowiec', (x) => x <= 25]]) {
        const e = s.traffic.timetable().find((x) => x.nr === nr);
        const name = [...document.querySelectorAll('#desk .tile-over text')].find((t) => t.textContent === line).getBoundingClientRect();
        for (let i = 0; i < 8000; i++) {
          s.step(0.5);
          for (const ex of ['W', 'E']) { const b = s.blocks.get(ex); if (b.request === 'theirs') b.press('Poz'); }
          if (!e.train?.entered) continue;
          window.desk.updateTrains();
          const lab = [...document.querySelectorAll('#desk .train-label')].find((l) => l.textContent.trim() === String(nr) && l.style.display !== 'none');
          if (!lab) continue;
          const r = lab.querySelector('rect').getBoundingClientRect();
          const x = e.train.trail[e.train.trail.length - 1].tile?.x ?? 0;
          out.seen++;
          if (r.right > name.left && r.left < name.right && r.bottom > name.top && r.top < name.bottom) out.hits.push(`${nr}@${x}`);
          // koniec: czoło w głębi stacji albo pociąg stanął (przed semaforem wjazdowym – bez przebiegu dalej nie pojedzie,
          // a etykieta stojącego już się nie przesuwa; dawniej „■” przy stojącym pomijał go w wyszukiwaniu etykiety)
          if (inside(x) || (e.train.v === 0 && e.train.stoppedAt)) break;
        }
      }
      c.paused = true;
      return out;
    });
    expect(res.seen, scenariusz).toBeGreaterThan(6);
    expect(res.hits, `${scenariusz}: etykieta na nazwie szlaku`).toEqual([]);
  }
});
