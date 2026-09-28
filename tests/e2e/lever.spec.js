import { test, expect } from '@playwright/test';
import { openShift, simState, advance } from './helpers.js';

/* Nastawnia mechaniczna (Szkolna): plan świetlny, aparat blokowy, drążki przebiegowe, dźwignie nastawcze */

const ctl = (page, kind, id) => page.locator(`#desk .mech-ctl[data-ref='${JSON.stringify({ kind, id })}']`);
const open = (page) => openShift(page, 'szkolna', { params: { scenariusz: 'zmiana-mech' } });
const route = (page, id) => page.evaluate((r) => { const a = window.sim.ilk.active.get(r); return a ? { lever: a.lever, blocked: a.blocked, passed: a.passed } : null; }, id);

test('ława dźwigniowa: dźwignie z numerami i barwami wg rodzaju, drążki z celami przebiegów; na planie tylko przyciski blokady', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await open(page);
  await expect(page.locator('#desk svg.desk.mech')).toHaveCount(1);
  const levers = await page.locator('#desk .lever').evaluateAll((els) => els.map((g) => `${g.querySelector('.plate-text').textContent}:${g.dataset.lever}:${[...g.classList].find((c) => c.startsWith('lever-'))}`));
  expect(levers).toEqual(['1:Zw1:lever-point', '2:Zw3:lever-point', '3:Zw4:lever-point', '4:Wk1:lever-derailer', '5:A:lever-signal', '6:B:lever-signal',
    '7:C1:lever-signal', '8:C2:lever-signal', '9:D1:lever-signal', '10:D2:lever-signal', '11:Tm1:lever-shunt', '12:Tm2:lever-shunt']);
  // trzony: zwrotnicowe niebieskie, semaforowe czerwone (Ie-8 §6 ust. 4)
  const fill = (id) => page.locator(`#desk .lever[data-lever="${id}"] .lever-rod`).evaluate((e) => getComputedStyle(e).fill);
  expect(await fill('Zw1')).not.toEqual(await fill('A'));
  expect(await page.locator('#desk .drazek').evaluateAll((els) => els.map((g) => g.dataset.drazek))).toEqual(['a', 'b', 'c1', 'c2', 'd1', 'd2', 'd2m', 'tm1m', 'tm2m']);
  await expect(page.locator('#desk .blk-window')).toHaveCount(6); // blok przebiegowy – tylko przebiegi pociągowe
  const buttons = await page.locator('#desk .btn').evaluateAll((els) => [...new Set(els.map((e) => JSON.parse(e.dataset.ref).kind))]);
  expect(buttons).toEqual(['block']);
  await expect(page.locator('#hint')).toContainText('dźwignie zwrotnic');
  await page.click('#btn-help');
  await expect(page.locator('#help h2').first()).toContainText('nastawni mechanicznej');
  expect(errors).toEqual([]);
});

test('nastawnia mechaniczna: dźwignia zwrotnicy → drążek → blok → dźwignia sygnałowa; potem na „Stój”, zwalniacz liczy', async ({ page }) => {
  await open(page);
  const need = await page.evaluate(() => window.sim.ilk.routes.get('A-D2').points.find((q) => q.position === '-').id);
  // drążek przy złym położeniu zwrotnicy: odmowa, przebiegu nie ma
  await ctl(page, 'route', 'A-D2').click();
  expect(await route(page, 'A-D2')).toBe(null);
  await expect(page.locator('#status')).toContainText(need);
  // dźwignia zwrotnicowa: przełożona od razu, zwrotnica po 2 s
  expect(await page.evaluate((id) => { const r = window.desk.pointRefs.get(id); return [...r.straight.classList].includes('lamp-pos'); }, need)).toBe(true); // na planie: położenie zasadnicze
  await ctl(page, 'lever', need).click();
  await expect(page.locator(`#desk .lever[data-lever="${need}"]`)).toHaveClass(/down/);
  // oznaczenia położeń: przy dźwigni zwrotnicowej „+” po lewej, „−” po prawej; świeci bieżące
  const pos = await page.locator(`#desk .lever[data-lever="${need}"] .lever-pos`).evaluateAll((els) => els.map((e) => ({ t: e.textContent, on: e.classList.contains('on'), x: e.getBoundingClientRect().x })));
  expect(pos.map((p) => p.t)).toEqual(['+', '−']);
  expect(pos[0].x).toBeLessThan(pos[1].x);
  expect(pos.map((p) => p.on)).toEqual([false, true]);
  // plan świetlny: położenie zwrotnicy przygaszonym żółtym na ramieniu zwrotnym (po dojechaniu)
  await advance(page, 3);
  const bars = () => page.evaluate((id) => { const r = window.desk.pointRefs.get(id); return ['straight', 'diverge'].map((k) => [...r[k].classList].find((c) => c.startsWith('lamp-')) || 'off'); }, need);
  expect(await bars()).toEqual(['off', 'lamp-pos']);
  // drugie ramię z przerwą w szczelinie – ciemny pasek nie wygląda jak tor, którym idzie jazda
  const cut = () => page.evaluate((id) => { const r = window.desk.pointRefs.get(id); return ['straight', 'diverge'].map((k) => r[k].classList.contains('cut')); }, need);
  expect(await cut()).toEqual([true, false]);
  await advance(page, 3);
  expect((await simState(page)).points[need]).toBe('-');
  await ctl(page, 'route', 'A-D2').click();
  expect(await route(page, 'A-D2')).toEqual({ lever: false, blocked: false, passed: false });
  await expect(page.locator('#desk .drazek[data-drazek="a"] .drazek-down')).toHaveClass(/set/);
  await expect(page.locator(`#desk .lever[data-lever="${need}"] .lever-lock`)).toHaveClass(/on/);
  // dźwignia sygnałowa przed blokiem – odmowa; klawisz bloku – okienko białe; dźwignia – sygnał zezwalający
  await ctl(page, 'lever', 'A').click();
  expect((await simState(page)).signals.A).toBe('Sr1');
  await ctl(page, 'routeblock', 'A').click();
  await expect(page.locator('#desk .drazek[data-drazek="a"] .blk-window')).toHaveClass(/white/);
  await ctl(page, 'lever', 'A').click();
  expect((await simState(page)).signals.A).not.toBe('Sr1');
  await expect(page.locator('#desk .lever[data-lever="A"]')).toHaveClass(/down/);
  // z klawiatury: dźwignia na „Stój”
  await ctl(page, 'lever', 'A').focus();
  await page.keyboard.press('Enter');
  expect((await simState(page)).signals.A).toBe('Sr1');
  // drążek zamknięty blokiem – tylko zwalniacz (licznik)
  await ctl(page, 'route', 'A-D2').click();
  expect(await route(page, 'A-D2')).not.toBe(null);
  await ctl(page, 'routerelease', 'A').click();
  expect(await route(page, 'A-D2')).toBe(null);
  await expect(page.locator('#desk .counter-text').last()).toHaveText('00001');
  await expect(page.locator('#desk .drazek[data-drazek="a"] .blk-window')).not.toHaveClass(/white/);
});

test('semafory kształtowe na planie: ramiona Sr1 / Sr2 / Sr3, tarcza ostrzegawcza, tarcza manewrowa; ruch animowany', async ({ page }) => {
  await open(page);
  const sem = (id) => page.evaluate((i) => {
    const r = window.desk.signalRefs.get(i);
    const ang = (e) => { const m = new DOMMatrix(getComputedStyle(e).transform); return Math.round((Math.atan2(m.b, m.a) * 180) / Math.PI); };
    return { aspect: r.pic.dataset.aspect, upper: ang(r.upper), lower: ang(r.lower), lowerShown: getComputedStyle(r.lower).display !== 'none', warn: r.warn?.dataset.aspect ?? null };
  }, id);
  await page.evaluate(() => document.querySelectorAll('#desk .sem-arm, #desk .sem-disc, #desk .sem-arrow').forEach((e) => { e.style.transition = 'none'; }));
  // zasadniczo: ramię poziomo, dolne (semafor dwuramienny A) wzdłuż słupa; tarcza ostrzegawcza trzystawna Ot1
  expect(await sem('A')).toEqual({ aspect: 'Sr1', upper: 0, lower: 90, lowerShown: true, warn: 'Ot1' });
  const one = await page.evaluate(() => [...window.sim.ilk.signals.values()].find((s) => s.arms === 1).id);
  expect((await sem(one)).lowerShown).toBe(false);
  const setRoute = async (id) => {
    await page.evaluate((rid) => { const s = window.sim; const r = s.ilk.routes.get(rid); for (const q of [...r.points, ...r.flank]) s.execute({ type: 'point', id: q.id, position: q.position }); }, id);
    await advance(page, 3);
    await page.evaluate((rid) => { const s = window.sim; const r = s.ilk.routes.get(rid); s.execute({ type: 'route', id: rid }); if (r.kind === 'train') s.execute({ type: 'route-block', signal: r.start }); s.execute({ type: 'clear', signal: r.start }); }, id);
  };
  await setRoute('A-D1');
  expect(await sem('A')).toEqual({ aspect: 'Sr2', upper: -45, lower: 90, lowerShown: true, warn: 'Ot2' });
  // przy dźwigni świeci małe ramię wzniesione
  await expect(page.locator('#desk .lever[data-lever="A"] .lever-pos.go')).toHaveClass(/on/);
  await ctl(page, 'lever', 'A').click();
  await ctl(page, 'routerelease', 'A').click();
  await setRoute('A-D2');
  expect(await sem('A')).toEqual({ aspect: 'Sr3', upper: -45, lower: -45, lowerShown: true, warn: 'Ot3' });
  // tarcza manewrowa kształtowa: M2 – tarcza obrócona do poziomu (spłaszczona)
  const tm = await page.evaluate(() => [...window.sim.ilk.routes.values()].find((r) => r.kind === 'shunt' && window.sim.ilk.signals.get(r.start).kind === 'tm').id);
  await setRoute(tm);
  const flat = await page.evaluate((rid) => new DOMMatrix(getComputedStyle(window.desk.signalRefs.get(window.sim.ilk.routes.get(rid).start).disc).transform).d, tm);
  expect(flat).toBeLessThan(0.3);
  // ramiona i tarcze obracają się (przejście CSS), przy „ogranicz ruch” – od razu
  await page.evaluate(() => document.querySelectorAll('#desk .sem-arm').forEach((e) => { e.style.transition = ''; }));
  const dur = () => page.evaluate(() => ['.sem-arm', '.lever-arm', '.drazek-knob'].map((c) => parseFloat(getComputedStyle(document.querySelector(`#desk ${c}`)).transitionDuration)));
  expect((await dur()).every((d) => d > 0)).toBe(true);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(await dur()).toEqual([0, 0, 0]);
});
