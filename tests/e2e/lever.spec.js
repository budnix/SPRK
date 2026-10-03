import { test, expect } from '@playwright/test';
import { openShift, simState, advance } from './helpers.js';

/* Nastawnia mechaniczna (Szkolna): plan świetlny, aparat blokowy, drążki przebiegowe, dźwignie nastawcze */

const ctl = (page, kind, id) => page.locator(`#desk .mech-ctl[data-ref='${JSON.stringify({ kind, id })}']`);
const open = (page) => openShift(page, 'szkolna', { params: { scenariusz: 'zmiana-mech' } });
const route = (page, id) => page.evaluate((r) => { const a = window.sim.ilk.routeFrame(r); return a ? { lever: a.lever, blocked: a.blocked, passed: a.passed } : null; }, id);

test('ława dźwigniowa: dźwignie z numerami i barwami wg rodzaju, drążki z celami przebiegów; na planie tylko przyciski blokady', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await open(page);
  await expect(page.locator('#desk svg.desk.mech')).toHaveCount(1);
  const levers = await page.locator('#desk .lever').evaluateAll((els) => els.map((g) => `${g.querySelector('.plate-text').textContent}:${g.dataset.lever}:${[...g.classList].find((c) => c.startsWith('lever-'))}`));
  // semafory rozprzężone A i B (przebiegi na Sr2 i na Sr3) mają po dwie dźwignie: A¹ / A², B¹ / B²
  expect(levers).toEqual(['1:Zw1:lever-point', '2:Zw3:lever-point', '3:Zw4:lever-point', '4:Wk1:lever-derailer', '5:A¹:lever-signal', '6:A²:lever-signal',
    '7:B¹:lever-signal', '8:B²:lever-signal', '9:C1:lever-signal', '10:C2:lever-signal', '11:D1:lever-signal', '12:D2:lever-signal', '13:Tm1:lever-shunt', '14:Tm2:lever-shunt']);
  // trzony: zwrotnicowe niebieskie, semaforowe czerwone (Ie-8 §6 ust. 4)
  const fill = (id) => page.locator(`#desk .lever[data-lever="${id}"] .lever-rod`).evaluate((e) => getComputedStyle(e).fill);
  expect(await fill('Zw1')).not.toEqual(await fill('A¹'));
  expect(await page.locator('#desk .drazek').evaluateAll((els) => els.map((g) => g.dataset.drazek))).toEqual(['a', 'b', 'c1', 'c2', 'd1', 'd2', 'd2m', 'tm1m', 'tm2m']);
  await expect(page.locator('#desk .blk-window')).toHaveCount(6); // blok przebiegowy – tylko przebiegi pociągowe
  // aparat blokowy: klawisz na górze skrzyni, pod nim okienko, pod okienkiem tabliczka; zwalniacz z plombą obok okienka
  const blk = await page.locator('#desk .drazek[data-drazek="a"]').evaluate((g) => {
    const box = (sel) => { const r = g.querySelector(sel).getBoundingClientRect(); return { top: r.top, bottom: r.bottom, mid: (r.top + r.bottom) / 2 }; };
    return { key: box('.blk-key .key'), win: box('.blk-window'), plate: box('.blk-plate'), seal: box('.zw-seal'), name: g.querySelector('.blk-plate + text').textContent };
  });
  expect(blk.key.bottom).toBeLessThanOrEqual(blk.win.top);
  expect(blk.win.bottom).toBeLessThanOrEqual(blk.plate.top);
  expect(blk.seal.mid).toBeGreaterThan(blk.win.top); expect(blk.seal.mid).toBeLessThan(blk.win.bottom);
  expect(blk.name).toBe('A');
  // drążek pociągowy ma dwa położenia pośrednie, manewrowy – żadnego
  await expect(page.locator('#desk .drazek[data-drazek="a"] .drazek-half')).toHaveCount(2);
  await expect(page.locator('#desk .drazek[data-drazek="d2m"] .drazek-half')).toHaveCount(0);
  const buttons = await page.locator('#desk .btn').evaluateAll((els) => [...new Set(els.map((e) => JSON.parse(e.dataset.ref).kind))]);
  expect(buttons).toEqual(['block']);
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
  // dźwignia w położeniu zasadniczym jest górna, nachylona o 38°; przełożona obraca się o 180° i zwisa pod osią
  const arm = () => page.locator(`#desk .lever[data-lever="${need}"]`).evaluate((g) => {
    const e = g.querySelector('.lever-arm'); const t = e.style.transition; e.style.transition = 'none';
    const m = new DOMMatrix(getComputedStyle(e).transform); const grip = g.querySelector('.lever-grip').getBoundingClientRect(); const axle = g.querySelector('.lever-axle').getBoundingClientRect();
    e.style.transition = t;
    return { deg: Math.round((Math.atan2(m.b, m.a) * 180) / Math.PI), above: grip.bottom < axle.top, below: grip.top > axle.bottom };
  });
  expect(await arm()).toEqual({ deg: -38, above: true, below: false });
  await ctl(page, 'lever', need).click();
  await expect(page.locator(`#desk .lever[data-lever="${need}"]`)).toHaveClass(/down/);
  expect(await arm()).toEqual({ deg: 142, above: false, below: true });
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
  await ctl(page, 'lever', 'A²').click();
  expect((await simState(page)).signals.A).toBe('Sr1');
  await ctl(page, 'routeblock', 'A').click();
  await expect(page.locator('#desk .drazek[data-drazek="a"] .blk-window')).toHaveClass(/white/);
  // przebieg na tor 2 wymaga Sr3: dźwignia A¹ (Sr2) jest zamknięta drążkiem, A² podaje sygnał
  await expect(page.locator('#desk .lever[data-lever="A¹"] .lever-lock')).toHaveClass(/on/);
  await expect(page.locator('#desk .lever[data-lever="A²"] .lever-lock')).not.toHaveClass(/on/);
  await ctl(page, 'lever', 'A¹').click();
  expect((await simState(page)).signals.A).toBe('Sr1');
  await expect(page.locator('#status')).toContainText('Sr3');
  await ctl(page, 'lever', 'A²').click();
  expect((await simState(page)).signals.A).toBe('Sr3');
  await expect(page.locator('#desk .lever[data-lever="A²"]')).toHaveClass(/down/);
  await expect(page.locator('#desk .lever[data-lever="A¹"]')).not.toHaveClass(/down/);
  // samouczek wskazuje dźwignię, której wymaga przebieg
  expect(await page.evaluate(() => window.desk.elementFor({ kind: 'lever', id: 'A' }).dataset.lever)).toBe('A²');
  // z klawiatury: dźwignia na „Stój”
  await ctl(page, 'lever', 'A²').focus();
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

test('drążek w położeniu pośrednim: kliknięcie „½” zamyka zwrotnice bez sygnału (do jazdy na Sz), dalej do końca albo z powrotem', async ({ page }) => {
  await open(page);
  const knob = () => page.locator('#desk .drazek[data-drazek="a"] .drazek-knob').evaluate((e) => e.dataset.pos);
  const y = () => page.locator('#desk .drazek[data-drazek="a"] .drazek-knob').evaluate((e) => new DOMMatrix(e.style.transform).f);
  expect(await knob()).toBe('null');
  const mid = await y();
  // tor 1 z usterką kontroli zajętości: do końca drążek nie idzie, do położenia pośredniego – tak
  await page.evaluate(() => { const s = window.sim; const sec = s.ilk.sections.get(s.ilk.routes.get('A-D1').sections.at(-1)); sec.forced = true; s.ilk.updateOccupancy(s.traffic.currentOccupancy()); });
  await ctl(page, 'route', 'A-D1').click();
  expect(await knob()).toBe('null');
  await ctl(page, 'routehalf', 'A-D1').click();
  expect(await knob()).toBe('up-half');
  const half = await y();
  expect(half).toBeLessThan(mid);
  await expect(page.locator('#desk .drazek[data-drazek="a"] .drazek-up-half')).toHaveClass(/set/);
  expect(await page.evaluate(() => [...window.sim.ilk.half.values()].map((h) => h.id))).toEqual(['A-D1']);
  expect((await simState(page)).active).toEqual([]);
  // zwrotnice drogi zamknięte (listwa przy dźwigni), obie dźwignie semafora A zamknięte
  const pt = await page.evaluate(() => window.sim.ilk.routes.get('A-D1').points[0].id);
  await expect(page.locator(`#desk .lever[data-lever="${pt}"] .lever-lock`)).toHaveClass(/on/);
  await ctl(page, 'lever', 'A¹').click();
  expect((await simState(page)).signals.A).toBe('Sr1');
  // Sz bez kary za niezamknięte zwrotnice
  await ctl(page, 'sz', 'A').click();
  expect((await simState(page)).signals.A).toBe('Sz');
  expect(await page.evaluate(() => window.sim.score.items.filter((i) => i.code === 'Sz-points').length)).toBe(0);
  // po zgaśnięciu Sz drążek wraca kliknięciem w to samo położenie
  await advance(page, 95);
  await ctl(page, 'routehalf', 'A-D1').click();
  expect(await knob()).toBe('null');
  // droga wolna: z położenia pośredniego drążek idzie dalej do końca
  await page.evaluate(() => { const s = window.sim; const sec = s.ilk.sections.get(s.ilk.routes.get('A-D1').sections.at(-1)); sec.forced = false; s.ilk.updateOccupancy(s.traffic.currentOccupancy()); });
  await ctl(page, 'routehalf', 'A-D1').click();
  await ctl(page, 'route', 'A-D1').click();
  expect(await knob()).toBe('up');
  expect(await y()).toBeLessThan(half);
  expect((await simState(page)).active).toEqual(['A-D1']);
});

test('semafory kształtowe na planie: ramiona Sr1 / Sr2 / Sr3, tarcza ostrzegawcza, tarcza manewrowa; ruch animowany', async ({ page }) => {
  await open(page);
  const sem = (id) => page.evaluate((i) => {
    const r = window.desk.signalRefs.get(i);
    const ang = (e) => { const m = new DOMMatrix(getComputedStyle(e).transform); return Math.round((Math.atan2(m.b, m.a) * 180) / Math.PI); };
    return { aspect: r.pic.dataset.aspect, upper: ang(r.upper), lower: ang(r.lower), lowerShown: getComputedStyle(r.lower).display !== 'none', warn: r.warn?.dataset.aspect ?? null };
  }, id);
  await page.evaluate(() => document.querySelectorAll('#desk .sem-arm, #desk .sem-disc, #desk .sem-arrow').forEach((e) => { e.style.transition = 'none'; }));
  // zasadniczo: ramię poziomo, dolne (semafor dwuramienny A) pionowo w górę od swojej osi, tarczką pod górnym ramieniem;
  // tarcza ostrzegawcza trzystawna Ot1
  expect(await sem('A')).toEqual({ aspect: 'Sr1', upper: 0, lower: -90, lowerShown: true, warn: 'Ot1' });
  const geo = await page.evaluate(() => {
    const r = window.desk.signalRefs.get('A'); const box = (e) => e.getBoundingClientRect();
    const rings = [...r.warn.querySelectorAll('circle')].map((c) => [c.getAttribute('class'), Number(c.getAttribute('r'))]);
    return { lowerTop: box(r.lower).top, lowerBottom: box(r.lower).bottom, upperTop: box(r.upper).top, upperBottom: box(r.upper).bottom, hub: box(r.lowerHub).top, rings };
  });
  expect(geo.lowerTop).toBeGreaterThanOrEqual(geo.upperBottom - 1); // dolne ramię pod górnym, nie nachodzi
  expect(geo.lowerTop - geo.upperBottom).toBeLessThan(4);           // tarczka tuż pod górnym ramieniem
  expect(geo.lowerBottom).toBeLessThanOrEqual(geo.hub + 6);         // ramię stoi w górę od osi, nie zwisa pod nią
  // tarcza ostrzegawcza od zewnątrz: biała obwódka, przylegający do niej czarny pierścień, pomarańczowy środek
  expect(geo.rings.map((x) => x[0])).toEqual(['warn-edge', 'warn-ring', 'warn-face']);
  expect(geo.rings[0][1]).toBeGreaterThan(geo.rings[1][1]); expect(geo.rings[1][1]).toBeGreaterThan(geo.rings[2][1]);
  const one = await page.evaluate(() => [...window.sim.ilk.signals.values()].find((s) => s.arms === 1).id);
  expect((await sem(one)).lowerShown).toBe(false);
  const setRoute = async (id) => {
    await page.evaluate((rid) => { const s = window.sim; const r = s.ilk.routes.get(rid); for (const q of [...r.points, ...r.flank]) s.execute({ type: 'point', id: q.id, position: q.position }); }, id);
    await advance(page, 3);
    await page.evaluate((rid) => { const s = window.sim; const r = s.ilk.routes.get(rid); s.execute({ type: 'route', id: rid }); if (r.kind === 'train') s.execute({ type: 'route-block', signal: r.start }); s.execute({ type: 'clear', signal: r.start }); }, id);
  };
  await setRoute('A-D1');
  expect(await sem('A')).toEqual({ aspect: 'Sr2', upper: -45, lower: -90, lowerShown: true, warn: 'Ot2' });
  // przy dźwigni świeci małe ramię wzniesione
  await expect(page.locator('#desk .lever[data-lever="A¹"] .lever-pos.go')).toHaveClass(/on/);
  await expect(page.locator('#desk .lever[data-lever="A²"] .lever-pos.go')).not.toHaveClass(/on/);
  await ctl(page, 'lever', 'A¹').click();
  await ctl(page, 'routerelease', 'A').click();
  await setRoute('A-D2');
  expect(await sem('A')).toEqual({ aspect: 'Sr3', upper: -45, lower: -45, lowerShown: true, warn: 'Ot3' });
  // tarcza manewrowa kształtowa: M2 – tarcza obrócona do poziomu (spłaszczona); najpierw zwolnienie A-D2 – przebiegi od
  // tarcz Szkolnej prowadzą przez tor 2 (Tm2-C2: T2) albo drogę ochronną A-D2 (Tm1-Tm2: T2e)
  await ctl(page, 'lever', 'A²').click();
  await ctl(page, 'routerelease', 'A').click();
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
