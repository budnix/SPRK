import { test, expect } from '@playwright/test';
import { openShift } from './helpers.js';

/* Spójność interfejsu: ekrany pełne w obu motywach, wspólny układ okien, ikony SVG, dostępność */

/** Jasność barwy tła elementu (0 = czerń, 1 = biel). */
const lightness = (page, selector, prop = 'backgroundColor') => page.evaluate(([sel, p]) => {
  const c = getComputedStyle(document.querySelector(sel))[p].match(/[\d.]+/g).map(Number);
  return (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255;
}, [selector, prop]);

const SCREENS = [['#help', '#menu-help'], ['#settings', '#menu-settings'], ['#report', '#menu-report'], ['#start', '#menu-new']];

for (const theme of ['light', 'dark']) {
  test(`ekrany pełne (instrukcja, ustawienia, raport, start) są w motywie interfejsu: ${theme}`, async ({ page }) => {
    await openShift(page, 'szkolna', { settings: { theme } });
    const app = await lightness(page, '#topbar');
    for (const [screen, item] of SCREENS) {
      await page.click('#btn-menu'); await page.click(item);
      await expect(page.locator(screen)).toBeVisible();
      const bg = await lightness(page, screen), text = await lightness(page, `${screen} .st-tagline`, 'color');
      if (theme === 'light') { expect(bg, screen).toBeGreaterThan(0.8); expect(text, screen).toBeLessThan(0.3); expect(app).toBeGreaterThan(0.8); }
      else { expect(bg, screen).toBeLessThan(0.2); expect(text, screen).toBeGreaterThan(0.7); expect(app).toBeLessThan(0.3); }
      await page.keyboard.press('Escape');
      await expect(page.locator(screen)).toBeHidden();
    }
  });
}

test('okna mają wspólny układ (nagłówek z logo, przycisk powrotu), role okna dialogowego i fokus', async ({ page }) => {
  await openShift(page, 'szkolna');
  for (const [screen, item] of SCREENS) {
    await page.click('#btn-menu'); await page.click(item);
    const s = page.locator(screen);
    await expect(s).toHaveAttribute('role', 'dialog');
    await expect(s).toHaveAttribute('aria-modal', 'true');
    expect((await s.getAttribute('aria-label')).length).toBeGreaterThan(3);
    await expect(s.locator('.st-hero .st-logo-svg')).toHaveCount(1);
    await expect(s.locator('.st-hero .st-tagline')).not.toBeEmpty();
    await expect(s.locator('.st-hero button.st-close')).toHaveCount(1);
    expect(await page.evaluate((sel) => document.querySelector(sel).contains(document.activeElement), screen), `${screen}: fokus w oknie`).toBe(true);
    await s.locator('.st-hero button.st-close').click();
    await expect(s).toBeHidden();
  }
  // raport leży nad rozwijanym menu
  const z = await page.evaluate(() => ['#menu', '#report', '#help', '#settings', '#start'].map((q) => Number(getComputedStyle(document.querySelector(q)).zIndex)));
  expect(new Set(z).size).toBe(z.length);
  for (const v of z.slice(1)) expect(v).toBeGreaterThan(z[0]);
});

test('przyciski paska i okien mają ikony SVG z opisem zamiast znaków tekstowych; pauza zmienia ikonę', async ({ page }) => {
  await openShift(page, 'szkolna', { params: { scenariusz: 'nauka-1' } });
  for (const sel of ['#btn-pause', '#btn-menu', '.tut-close']) {
    const b = page.locator(sel).first();
    await expect(b.locator('svg')).toHaveCount(1);
    expect((await b.textContent()).trim(), sel).toBe('');
    expect(((await b.getAttribute('aria-label')) || '').length, sel).toBeGreaterThan(2);
  }
  await page.locator('.tut-close').click();
  const pause = page.locator('#btn-pause');
  const before = await pause.locator('svg').getAttribute('data-icon');
  await pause.click();
  const after = await pause.locator('svg').getAttribute('data-icon');
  expect(new Set([before, after])).toEqual(new Set(['play', 'pause']));
  await expect(pause).toHaveAttribute('aria-pressed', after === 'play' ? 'true' : 'false');
  // przyciski listwy i panelu mają tę samą wysokość
  await page.click('#panel-tabs button[data-tab=rozkazy]');
  const h = await page.evaluate(() => ['#zoom-in', '#side-toggle', '#btn-pause', '#btn-menu', '#tab-rozkazy .tb'].map((q) => document.querySelector(q).getBoundingClientRect().height));
  expect(h.every((v) => v > 0)).toBe(true);
  expect(new Set(h).size).toBe(1);
});

test('ograniczenie ruchu w systemie wyłącza animacje ozdobne, miganie sygnałów zostaje', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openShift(page, 'szkolna', { params: { scenariusz: 'nauka-1' } });
  await page.locator('.tut-next').click(); await page.locator('.tut-next').click();
  const hl = page.locator('.tut-hl').first();
  await expect(hl).toHaveCount(1);
  expect(await hl.evaluate((e) => getComputedStyle(e).animationName)).toBe('none');
  // wskazanie elementu na planie (SVG) ma własną animację poświaty – też wyłączoną
  expect(await page.evaluate(() => { const g = document.querySelector('svg.screen .scr-el'); g.classList.add('tut-hl'); const a = getComputedStyle(g).animationName; g.classList.remove('tut-hl'); return a; })).toBe('none');
  expect(await page.evaluate(() => { const e = document.createElement('i'); e.className = 'blink'; document.body.appendChild(e); const a = getComputedStyle(e).animationName; e.remove(); return a; })).toBe('blink');
});

test('zakładki ekranów nie są wymieniane przy ponownym planowaniu (start, zmiana rozmiaru okna) – przyciski zostają te same', async ({ page }) => {
  await openShift(page, 'gdynia-chylonia', { settings: { screens: 'auto', sideCollapsed: true } });
  const tabs = page.locator('#screen-tabs button');
  await expect(tabs).toHaveCount(4);
  await page.evaluate(() => { window.__tabs = [...document.querySelectorAll('#screen-tabs button')]; });
  // to samo okno: ponowne planowanie niczego nie zmienia
  await page.evaluate(() => window.dispatchEvent(new Event('resize')));
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => window.__tabs.every((b, i) => b.isConnected && b === document.querySelectorAll('#screen-tabs button')[i]))).toBe(true);
  // przełączenie ekranu zmienia tylko zaznaczenie
  await tabs.nth(2).click();
  await expect(tabs.nth(2)).toHaveClass(/active/);
  await expect(page.locator('#screen-tabs button.active')).toHaveCount(1);
  expect(await page.evaluate(() => window.__tabs.every((b) => b.isConnected))).toBe(true);
  // inna szerokość okna = inny podział = nowe zakładki
  await page.setViewportSize({ width: 900, height: 1024 });
  await expect.poll(() => page.evaluate(() => window.__tabs.some((b) => !b.isConnected))).toBe(true);
});

for (const [name, scenario, svgClass, station = 'szkolna'] of [['monitor', 'zmiana', 'screen'], ['pulpit kostkowy', 'zmiana-e', 'desk'], ['pulpit IZH-111', 'zmiana-izh', 'desk izh'], ['nastawnia mechaniczna', 'zmiana-mech', 'desk mech'], ['EBILock 950', 'zmiana-ebi', 'screen ebi'], ['MOR-3', 'zmiana', 'screen mor', 'kalinowo']]) {
  test(`widok stanowiska (${name}) spełnia kontrakt PanelView: rysunek, margines, wycinek, elementy obsługi, etykiety pociągów`, async ({ page }) => {
    await openShift(page, station, { params: { scenariusz: scenario } });
    const v = await page.evaluate(() => {
      // klasa widoku, ewentualnie wspólna baza stanowisk (ScreenBase) i PanelView (nazwy klas znikają w zbudowanej
      // paczce – liczy się, gdzie leżą metody)
      const d = window.desk;
      const own = (o, list) => list.filter((m) => Object.prototype.hasOwnProperty.call(o, m));
      const protos = []; for (let p = Object.getPrototypeOf(d); p && p !== Object.prototype; p = Object.getPrototypeOf(p)) protos.push(p);
      const base = protos.at(-1), viewSide = protos.slice(0, -1);
      const union = (list) => list.filter((m) => viewSide.some((o) => own(o, [m]).length));
      const chain = { depth: viewSide.length >= 1 && viewSide.length <= 2 ? 2 : viewSide.length + 1, base: own(base, ['bindModel', 'refreshAll', 'updateTrains', 'setView']), view: union(['updateSection', 'updateSignal', 'createTrainLabel', 'bindModel', 'refreshAll']) };
      const methods = ['setView', 'resetView', 'elementFor', 'refreshAll', 'cmdButton', 'setSymbolScale', 'updateTrains', 'bindModel'];
      const full = d.svg.getAttribute('viewBox');
      d.setView(2, 5); const part = d.svg.getAttribute('viewBox'); d.resetView();
      const pad = d.inner.transform.baseVal.getItem(0).matrix.e;
      return { chain, svgClass: d.svg.getAttribute('class'), missing: methods.filter((m) => typeof d[m] !== 'function'), full, part, back: d.svg.getAttribute('viewBox'), pad, ownPad: d.pad,
        size: d.constructor.size(d.cols, d.rows, { rowScale: d.ry }), signal: !!d.elementFor({ kind: 'signal', id: 'A' }), block: !!d.elementFor({ kind: 'blockpanel', exit: 'W' }),
        none: d.elementFor({ kind: 'point', id: 'nie-ma' }), cmd: !!d.cmdButton('train') };
    });
    expect(v.chain).toEqual({ depth: 2, base: ['bindModel', 'refreshAll', 'updateTrains', 'setView'], view: ['updateSection', 'updateSignal', 'createTrainLabel'] });
    expect(v.svgClass).toBe(svgClass);
    expect(v.missing).toEqual([]);
    expect(v.pad).toBe(v.ownPad);
    expect(v.full).toBe(`0 0 ${v.size.w} ${v.size.h}`);
    expect(v.part).toBe(`80 0 ${4 * 40 + 2 * v.pad} ${v.size.h}`);
    expect(v.back).toBe(v.full);
    expect(v.signal).toBe(true); expect(v.block).toBe(true); expect(v.none).toBe(null);
    expect(v.cmd).toBe(svgClass === 'screen'); // EBIScreen nie ma paska „train” – linia poleceń (cmdButton('line'))
    // etykieta pociągu pojawia się z pociągiem na planie i znika razem z nim
    await page.evaluate(() => { const s = window.sim; s.clock.paused = false; for (let i = 0; i < 4000 && !s.traffic.trains.some((t) => t.occupiedTiles().length); i++) { window.sim.press({ kind: 'block', exit: 'W', btn: 'Poz' }); s.step(0.5); } s.clock.paused = true; });
    const labels = await page.evaluate(() => ({ dom: document.querySelectorAll('#desk .layer-trains > g').length, map: window.desk.trainLabels.size, onPlan: window.sim.traffic.trains.filter((t) => t.occupiedTiles().length).length }));
    expect(labels.onPlan).toBeGreaterThan(0);
    expect(labels.dom).toBe(labels.onPlan); expect(labels.map).toBe(labels.onPlan);
  });
}

test('powiększenie pulpitu: tryb dopasowania wraca po zmianie okna, ręczne powiększenie zostaje; Ctrl + kółko trzyma punkt pod kursorem', async ({ page }) => {
  // mała stacja – dopasowanie do szerokości nie dochodzi do granic powiększenia
  await openShift(page, 'szkolna', { settings: { sideCollapsed: true } });
  const state = () => page.evaluate(() => { const d = document.getElementById('desk').getBoundingClientRect(), s = document.getElementById('desk-scroll'); return { w: d.width, h: d.height, cw: s.clientWidth, ch: s.clientHeight, left: s.scrollLeft, mode: window.viewport.fitMode, zoom: window.viewport.zoom }; });
  let st = await state();
  // na starcie cały plan w oknie; bez pól skrajnych nie ma przycisku „wysokość” – całość pokazuje wciśnięta „szerokość”
  expect(['width', 'whole']).toContain(st.mode);
  expect(st.w).toBeLessThanOrEqual(st.cw); expect(st.h).toBeLessThanOrEqual(st.ch);
  await expect(page.locator('#zoom-fit')).toHaveAttribute('aria-pressed', 'true');
  // ręcznie, potem „szerokość”: plan na całą szerokość
  await page.click('#zoom-in');
  await expect(page.locator('#zoom-fit')).toHaveAttribute('aria-pressed', 'false');
  await page.click('#zoom-fit');
  st = await state();
  expect(st.mode).toBe('width'); expect(Math.abs(st.w - (st.cw - 8))).toBeLessThan(1); expect(st.left).toBe(0);
  // zmiana okna: ten sam tryb, nowe powiększenie
  await page.setViewportSize({ width: 1100, height: 900 });
  await expect.poll(async () => { const s = await state(); return Math.abs(s.w - (s.cw - 8)) < 1 && s.cw < st.cw; }).toBe(true);
  expect((await state()).mode).toBe('width');
  // ręczne powiększenie: tryb dopasowania znika i nie wraca po zmianie okna
  await page.click('#zoom-in');
  const manual = await state();
  expect(manual.mode).toBe(null); expect(manual.zoom).toBeGreaterThan(st.zoom * 0.9);
  await page.setViewportSize({ width: 1200, height: 900 });
  await page.waitForTimeout(400);
  expect((await state()).zoom).toBe(manual.zoom);
  // Ctrl + kółko: punkt rysunku pod kursorem zostaje pod kursorem
  const at = { x: 300, y: 200 };
  const point = () => page.evaluate(([x, y]) => { const s = document.getElementById('desk-scroll'), v = window.viewport; return [(s.scrollLeft + x) / v.zoom, (s.scrollTop + y) / v.zoom]; }, [at.x, at.y]);
  await page.evaluate(() => { document.getElementById('desk-scroll').scrollLeft = 400; });
  const before = await point();
  await page.evaluate(([x, y]) => { const s = document.getElementById('desk-scroll'), r = s.getBoundingClientRect(); s.dispatchEvent(new WheelEvent('wheel', { deltaY: -40, ctrlKey: true, clientX: r.left + x, clientY: r.top + y, bubbles: true, cancelable: true })); }, [at.x, at.y]);
  const after = await point();
  expect((await state()).zoom).toBeGreaterThan(manual.zoom);
  expect(Math.abs(after[0] - before[0])).toBeLessThan(1.5);
});

test('ekran startowy: kartę posterunku wybiera się także z klawiatury (Enter, spacja)', async ({ page }) => {
  await openShift(page, 'szkolna');
  await page.click('#btn-menu'); await page.click('#menu-new');
  const card = page.locator('.st-card[data-id="sopot"]');
  await card.focus();
  await page.keyboard.press('Enter');
  await expect(card).toHaveClass(/active/);
  await expect(page.locator('#st-briefing .st-bname')).toHaveText('Sopot');
  const other = page.locator('.st-card[data-id="reda"]');
  await other.focus();
  await page.keyboard.press(' ');
  await expect(other).toHaveClass(/active/);
  await expect(card).not.toHaveClass(/active/);
});

test('przyciski grupowe rysuje stanowisko, nie definicja stacji: pulpit typu E ma Zw, Zz, Pz, dPz, Sz; monitor – liczniki; pulpit IZH-111 – puste pola', async ({ page }) => {
  await openShift(page, 'rumia', { settings: { sideCollapsed: true } });
  expect(await page.evaluate(() => window.sim.station.tiles.filter((t) => t.type === 'button').length)).toBe(0);
  const groups = await page.locator('#desk svg.desk .btn').evaluateAll((els) => els.map((e) => JSON.parse(e.dataset.ref)).filter((r) => r.kind === 'group'));
  expect(groups).toEqual([
    { kind: 'group', id: 'Zw', role: 'group-point' }, { kind: 'group', id: 'Zz', role: 'point-lock' }, { kind: 'group', id: 'Pz', role: 'route-release' },
    { kind: 'group', id: 'dPz', role: 'emergency-release' }, { kind: 'group', id: 'Sz', role: 'substitute' },
  ]);
  // miejsce wskazane przez stację: kolumna 44, drugi rząd
  const at = await page.locator('#desk svg.desk [data-control="Zw"]').getAttribute('transform');
  expect(at).toBe('translate(1760,40)');
  // przyciski działają: Zw + zwrotnica przestawia, dPz liczy
  const point = await page.evaluate(() => [...window.sim.ilk.points.keys()][0]);
  await page.locator(`.btn[data-ref='{"kind":"group","id":"Zw","role":"group-point"}']`).dispatchEvent('pointerdown', { bubbles: true, button: 0 });
  await page.locator(`.btn[data-ref='{"kind":"group","id":"Zw","role":"group-point"}']`).dispatchEvent('pointerup', { bubbles: true, button: 0 });
  await page.locator(`.btn[data-ref='{"kind":"point","id":"${point}"}']`).dispatchEvent('pointerdown', { bubbles: true, button: 0 });
  await page.locator(`.btn[data-ref='{"kind":"point","id":"${point}"}']`).dispatchEvent('pointerup', { bubbles: true, button: 0 });
  expect(await page.evaluate((id) => window.sim.ilk.points.get(id).moving, point)).toBe(true);
  await expect(page.locator('#desk svg.desk [data-control="dPz"] .counter-text')).toHaveText('00000');

  await openShift(page, 'rumia', { settings: { sideCollapsed: true }, params: { scenariusz: 'zmiana-lcs' } });
  await expect(page.locator('#desk svg.screen .scr-counter')).toHaveCount(2);
  await page.evaluate(() => { window.sim.execute({ type: 'substitute', signal: [...window.sim.ilk.signals.values()].find((s) => s.kind === 'semafor').id }); window.sim.step(0.5); });
  expect(await page.locator('#desk svg.screen .scr-counter .counter').allTextContents()).toEqual(['00000', '00001']);

  await openShift(page, 'szkolna', { params: { scenariusz: 'zmiana-izh' } });
  await expect(page.locator('#desk svg.desk [data-control]')).toHaveCount(5);
  await expect(page.locator('#desk svg.desk [data-control] .btn')).toHaveCount(0);
});

test('granica planu i panelu: przeciąganie uchwytem i krawędzią, rozmiar zapamiętany; wciśnięte dopasowanie działa na żywo, + / − je wyłącza', async ({ page }) => {
  await openShift(page, 'szkolna', { settings: { edgePanels: 'on' } });
  const st = () => page.evaluate(() => {
    const d = document.getElementById('desk').getBoundingClientRect(), s = document.getElementById('desk-scroll'), side = document.getElementById('side').getBoundingClientRect();
    const pressed = (id) => document.getElementById(id).getAttribute('aria-pressed') === 'true' && document.getElementById(id).classList.contains('active');
    return { side: side.height, w: d.width, h: d.height, cw: s.clientWidth, ch: s.clientHeight, zoom: window.viewport.zoom, mode: window.viewport.fitMode, fw: pressed('zoom-fit'), fh: pressed('zoom-fit-h') };
  });
  const drag = async (selector, dy) => {
    const b = await page.locator(selector).boundingBox();
    const x = b.x + b.width / 2, y = b.y + b.height / 2;
    await page.mouse.move(x, y); await page.mouse.down();
    await page.mouse.move(x, y + dy, { steps: 8 }); await page.mouse.up();
  };
  // na starcie cały plan w oknie: wciśnięty dokładnie jeden przycisk – osi, która ogranicza plan; kursor przy granicy
  // i na uchwycie pokazuje przeciąganie w pionie
  let s = await st();
  expect(s.fw !== s.fh).toBe(true);
  expect(s.mode).toBe(s.fw ? 'width' : 'height');
  expect(s.w).toBeLessThanOrEqual(s.cw); expect(s.h).toBeLessThanOrEqual(s.ch);
  // przeciąga się tylko za uchwyt – krawędź panelu nie jest uchwytem (pasek podświetlał się nad rozkładem)
  await expect(page.locator('#side .side-edge')).toHaveCount(0);
  expect(await page.locator('#side-grip').evaluate((e) => getComputedStyle(e).cursor)).toBe('ns-resize');
  // uchwyt w listwie (palec na tablecie): panel wyższy o tyle, o ile przesunięto; plan dopasował się do mniejszego obszaru
  await drag('#side-grip', -120);
  const up = await st();
  expect(Math.abs(up.side - s.side - 120)).toBeLessThan(4);
  // wciśnięta oś dopasowała się na żywo do nowego obszaru
  if (up.mode === 'width') expect(Math.abs(up.w - (up.cw - 8))).toBeLessThan(2);
  else expect(Math.abs(up.h - (up.ch - 8))).toBeLessThan(2);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('sprk.settings')).sideSize);
  expect(saved).toBeGreaterThan(0.3); expect(saved).toBeLessThan(0.8);
  await page.reload(); await page.waitForFunction(() => window.viewport);
  await expect.poll(async () => Math.abs((await st()).side - up.side) < 3).toBe(true);
  // przyciski się wykluczają: klik w drugi zwalnia pierwszy, klik w wciśnięty go zwalnia
  await page.click('#zoom-in');
  expect(await st()).toMatchObject({ mode: null, fw: false, fh: false });
  await page.click('#zoom-fit');
  expect(await st()).toMatchObject({ mode: 'width', fw: true, fh: false });
  await page.click('#zoom-fit-h');
  expect(await st()).toMatchObject({ mode: 'height', fw: false, fh: true });
  await page.click('#zoom-fit-h');
  expect(await st()).toMatchObject({ mode: null, fw: false, fh: false });
  await page.click('#zoom-fit-h');
  expect(await st()).toMatchObject({ mode: 'height', fw: false, fh: true });
  // uchwyt w drugą stronę: wysokość planu dopasowuje się na żywo
  await drag('#side-grip', 90);
  await expect.poll(async () => { const x = await st(); return Math.abs(x.h - (x.ch - 8)) < 2; }).toBe(true);
  // „+” wyłącza oba przyciski – po zmianie rozmiaru powiększenie zostaje
  await page.click('#zoom-in');
  const manual = await st();
  expect([manual.mode, manual.fw, manual.fh]).toEqual([null, false, false]);
  await drag('#side-grip', -60);
  await page.waitForTimeout(300);
  expect((await st()).zoom).toBe(manual.zoom);
  // „−” też zwalnia wciśnięty przycisk
  await page.click('#zoom-fit');
  expect(await st()).toMatchObject({ mode: 'width', fw: true, fh: false });
  await page.click('#zoom-out');
  expect(await st()).toMatchObject({ mode: null, fw: false, fh: false });
});

test('granica panelu z boku: uchwyt z kursorem ↔, przeciągnięcie w lewo poszerza panel po prawej', async ({ page }) => {
  await openShift(page, 'szkolna', { settings: { sidePos: 'right' } });
  await expect(page.locator('#side .side-edge')).toHaveCount(0);
  expect(await page.locator('#side-grip').evaluate((e) => getComputedStyle(e).cursor)).toBe('ew-resize');
  const w0 = (await page.locator('#side').boundingBox()).width;
  const b = await page.locator('#side-grip').boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2 - 100, b.y + b.height / 2, { steps: 6 }); await page.mouse.up();
  expect(Math.abs((await page.locator('#side').boundingBox()).width - w0 - 100)).toBeLessThan(4);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('sprk.settings')).sideWidth)).toBeGreaterThan(w0 + 90);
});

for (const pos of ['right', 'left']) {
  test(`panel ${pos === 'right' ? 'po prawej' : 'po lewej'}: zakładki pionowo, jedna pod drugą, na granicy planu i panelu; listwa narzędzi zostaje na dole`, async ({ page }) => {
    await openShift(page, 'szkolna', { settings: { sidePos: pos } });
    const g = await page.evaluate(() => {
      const r = (el) => el.getBoundingClientRect();
      const tabs = [...document.querySelectorAll('#panel-tabs button:not(.hidden)')].map(r);
      return {
        inRail: !!document.querySelector('#side-rail #panel-tabs'), groupHidden: document.querySelector('#desk-tools .tg-panel').classList.contains('hidden'),
        stacked: tabs.every((t, i) => i === 0 || t.top >= tabs[i - 1].bottom - 1) && tabs.every((t) => Math.abs(t.left - tabs[0].left) < 2), // aktywna o 1 px przy panelu
        buttonsInRail: !!document.querySelector('#side-rail #side-toggle') && !!document.querySelector('#side-rail #side-grip'),
        buttonsBottom: r(document.getElementById('side-grip')).top > r(document.querySelector('#panel-tabs')).bottom && r(document.getElementById('side-grip')).bottom <= r(document.getElementById('side-toggle')).top,
        // na tej samej linii co sekcja „wyrównanie”
        aligned: Math.abs(r(document.querySelector('#side-rail .tg-toggle')).bottom - r(document.querySelector('#desk-tools .tg-view')).bottom) < 1 && Math.abs(r(document.getElementById('side-toggle')).bottom - r(document.getElementById('zoom-in')).bottom) < 1,
        toolsButtons: [...document.querySelectorAll('#desk-tools button')].filter((b) => b.offsetParent).map((b) => b.id || b.dataset.screen),
        vertical: getComputedStyle(document.querySelector('#panel-tabs .tb .tab-label')).writingMode,
        upright: getComputedStyle(document.querySelector('#panel-tabs .tb .tab-label')).textOrientation,
        rail: r(document.getElementById('side-rail')), side: r(document.getElementById('side')), tools: r(document.getElementById('desk-tools')), desk: r(document.getElementById('desk-scroll')),
      };
    });
    expect(g.inRail).toBe(true); expect(g.groupHidden).toBe(true); expect(g.stacked).toBe(true);
    expect(g.vertical).toBe('vertical-rl');
    expect(g.upright).toBe('upright'); // litery stoją prosto – bez przechylania głowy
    // przyciski panelu na dole paska z zakładkami; w listwie na dole samo wyrównanie
    expect(g.buttonsInRail).toBe(true);
    expect(g.buttonsBottom).toBe(true);
    expect(g.aligned).toBe(true);
    expect(g.toolsButtons).toEqual(['zoom-out', 'zoom-fit', 'zoom-in']);
    if (pos === 'right') expect(Math.abs(g.rail.right - g.side.left)).toBeLessThan(2);
    else expect(Math.abs(g.rail.left - g.side.right)).toBeLessThan(2);
    expect(g.tools.top).toBeGreaterThan(g.desk.bottom - 1); // wyrównanie i reszta listwy – pod planem
    // zakładka działa; klikanie zakładek nie zmienia szerokości paska ani panelu (Safari dokładał piksel), zakładka wąska
    const widths = () => page.evaluate(() => [document.getElementById('side-rail').getBoundingClientRect().width, document.getElementById('side').getBoundingClientRect().width, document.querySelector('#panel-tabs .tb').getBoundingClientRect().width]);
    const w0 = await widths();
    for (const tab of ['log', 'pociagi', 'rj', 'rozkazy', 'log']) await page.click(`#panel-tabs button[data-tab=${tab}]`);
    expect(await widths()).toEqual(w0);
    expect(w0[2]).toBeLessThanOrEqual(34);
    await expect(page.locator('#tab-log')).toBeVisible();
    await page.click('#side-toggle');
    await expect(page.locator('#side')).toBeHidden();
    await expect(page.locator('#side-rail #panel-tabs')).toBeVisible();
    await page.click('#panel-tabs button[data-tab=rj]');
    await expect(page.locator('#side')).toBeVisible();
    // powrót panelu na dół – zakładki wracają do listwy
    await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('sprk.settings')); s.sidePos = 'bottom'; localStorage.setItem('sprk.settings', JSON.stringify(s)); });
    await page.reload(); await page.waitForFunction(() => window.viewport);
    expect(await page.evaluate(() => !!document.querySelector('#desk-tools .tg-panel #panel-tabs') && !!document.querySelector('#desk-tools #side-toggle'))).toBe(true);
  });
}

// Skróty klawiszowe zegara: spacja – pauza / wznowienie, 1–5 – prędkości z nagłówka po kolei (1×, 2×, 5×, 10×, 30×);
// przy pisaniu w polu tekstowym (linia poleceń EBILock) cyfra jest tekstem, nie zmienia prędkości
test('skróty klawiszowe: spacja – pauza, 1–5 – prędkości; w polu tekstowym cyfra nie zmienia prędkości', async ({ page }) => {
  await openShift(page, 'szkolna', { params: { scenariusz: 'zmiana-ebi' } });
  const clock = () => page.evaluate(() => ({ speed: window.sim.clock.speed, paused: window.sim.clock.paused }));
  for (const [key, speed] of [['3', 5], ['1', 1], ['5', 30], ['4', 10], ['2', 2]]) {
    await page.keyboard.press(key);
    expect(await clock(), `klawisz ${key}`).toEqual({ speed, paused: false });
    await expect(page.locator(`#speed .speed-btn[data-speed="${speed}"]`)).toHaveClass(/active/);
  }
  await page.keyboard.press('Space');
  expect((await clock()).paused).toBe(true);
  await page.keyboard.press('Space');
  expect((await clock()).paused).toBe(false);
  await expect(page.locator('#speed .speed-btn[data-speed="10"]')).toHaveAttribute('title', /klawisz 4/);
  const input = page.locator('input[type=text]:visible').first();
  await input.click();
  await page.keyboard.press('5');
  expect((await clock()).speed).toBe(2);
  await expect(input).toHaveValue(/5/);
});

// Łączność: przełącznik powiadomień – domyślnie licznik i podświetlenie zakładki przy nowej wiadomości; po wyłączeniu
// (np. przy automatycznych rozmowach) zakładka nie odrywa od gry; wybór zapamiętany
test('łączność: powiadomienia domyślnie włączone, przełącznik w zakładce je wyłącza i zostaje zapamiętany', async ({ page }) => {
  await openShift(page, 'szkolna', { params: { scenariusz: 'zmiana' } });
  const badge = page.locator('#comms-badge'), tab = page.locator('button[data-tab="lacznosc"]');
  const incoming = (text) => page.evaluate((x) => window.sim.bus.emit('comms', { time: window.sim.clock.time, from: 'Lipno', kind: 'radio', text: x }), text);
  const before = Number(await badge.textContent()) || 0; // na starcie zmiany sąsiad mógł już zadzwonić
  await incoming('test 1');
  await expect(badge).toBeVisible();
  await expect(badge).toHaveText(String(before + 1));
  await tab.click();
  await expect(page.locator('#comms-notify')).toBeChecked();
  await page.uncheck('#comms-notify');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('sprk.settings')).commsNotify)).toBe('off');
  await page.click('button[data-tab="rj"]');
  await incoming('test 2');
  await expect(badge).toBeHidden();
  await expect(tab).not.toHaveClass(/flash/);
  await page.reload(); await page.waitForFunction(() => window.sim);
  await page.click('button[data-tab="lacznosc"]');
  await expect(page.locator('#comms-notify')).not.toBeChecked();
});

// Oznaczenie kategorii w rozkładzie („R”, „TME”): litery na środku plakietki w pionie. Pomiar: linia bazowa tekstu
// w plakietce (pusty element wyrównany do linii bazowej) i wysokość liter z measureText – odstęp od góry i od dołu
// plakietki różni się najwyżej o 0,5 px (dawniej 0,8 px przy 100% – na ekranie Retina przy 110% widać to wyraźnie).
test('rozkład: litery kategorii pociągu na środku plakietki w pionie', async ({ page }) => {
  await openShift(page, 'tczew');
  const res = await page.locator('table.rj .cat').evaluateAll((els) => els.slice(0, 12).map((b) => {
    const cs = getComputedStyle(b);
    const probe = document.createElement('span');
    probe.style.cssText = 'display:inline-block;width:0;height:0;vertical-align:baseline';
    b.appendChild(probe);
    const base = probe.getBoundingClientRect().top;
    probe.remove();
    const ctx = document.createElement('canvas').getContext('2d');
    ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    const m = ctx.measureText(b.textContent.trim());
    const r = b.getBoundingClientRect();
    const top = base - m.actualBoundingBoxAscent - r.top, bottom = r.bottom - (base + m.actualBoundingBoxDescent);
    return { text: b.textContent.trim(), top: Math.round(top * 10) / 10, bottom: Math.round(bottom * 10) / 10 };
  }));
  expect(res.length).toBeGreaterThan(3);
  expect(res.filter((x) => Math.abs(x.top - x.bottom) > 0.5), JSON.stringify(res)).toEqual([]);
});

// Listwa narzędzi bez stałej podpowiedzi obsługi stanowiska – na szerokim oknie pokazywał się sam tekst („pasek poleceń
// lub menu elementu · …”), bez działania; podpowiedzi dają pasek stanu (uzbrojony element) i instrukcja „?”
test('listwa narzędzi bez stałej podpowiedzi obsługi także na szerokim oknie', async ({ page }) => {
  await page.setViewportSize({ width: 1800, height: 900 });
  await openShift(page, 'szkolna', { params: { scenariusz: 'zmiana' } });
  await expect(page.locator('#desk-tools #hint, #desk-tools .hint')).toHaveCount(0);
});

// Czytelność: treść zakładek panelu (rozkład, zadania…) o 1 px większa, przyciski paska poleceń monitora większe
// (czcionka 12 px, większe pole) – przy powiększeniu przeglądarki 110% dawne 12 / 11 px było za małe
test('panel i pasek poleceń: tekst rozkładu i zadań 13 px, przyciski paska poleceń 12 px', async ({ page }) => {
  await openShift(page, 'szkolna', { params: { scenariusz: 'zmiana' } });
  const fs = (sel) => page.locator(sel).first().evaluate((e) => parseFloat(getComputedStyle(e).fontSize));
  expect(await fs('table.rj td')).toBe(13);
  expect(await fs('.scr-cmdbar button')).toBe(12);
  expect((await page.locator('.scr-cmdbar button').first().boundingBox()).height).toBeGreaterThanOrEqual(24);
  await page.click('button[data-tab="zadania"]');
  expect(await fs('.task-card')).toBe(13);
  expect(await fs('.tasks-head')).toBe(14);
});

// Podpowiedź o pociągu w rozkładzie (rodzaj, relacja, prędkość, skład) tylko na numerze pociągu – dawniej na całym
// wierszu, więc wyskakiwała także nad godzinami przyjazdu / odjazdu i torem
test('rozkład: podpowiedź o pociągu tylko na komórce numeru, nie na wierszu', async ({ page }) => {
  await openShift(page, 'szkolna', { params: { scenariusz: 'zmiana' } });
  const row = page.locator('table.rj tbody tr', { hasText: '6101' }).first();
  expect(await row.getAttribute('title')).toBeNull();
  await expect(row.locator('td.nr')).toHaveAttribute('title', /km\/h/);
  expect(await row.locator('td:not(.nr)[title], td:not(.nr) [title]').count()).toBe(0);
});
