import { test, expect } from '@playwright/test';
import { openShift, advance } from './helpers.js';

/* Symbole i barwy monitora wg Ie-104.1 (audyt realizmu, grupa 5: K5–K17, B2). */

const sig = (page, id) => page.locator(`#desk .scr-el.signal[data-signal="${id}"]`);

test('sygnalizatory: semafor – pełny trójkąt, z sygnalizacją manewrową – + otwarty grot, tarcza – otwarty grot z turkusowym numerem; bez trójkątów końca przy zwykłych (K5, K7, K12, K14)', async ({ page }) => {
  await openShift(page, 'szkolna', { params: { scenariusz: 'zmiana' } });
  const shape = (id) => sig(page, id).evaluate((g) => ({
    filled: g.querySelectorAll('.sig-body path:not(.open)').length, open: g.querySelectorAll('.sig-body path.open').length,
    end: g.querySelectorAll('.sig-end').length, label: g.querySelector('.sig-label').textContent, tm: g.querySelector('.sig-label').classList.contains('tm'),
  }));
  expect(await shape('A')).toEqual({ filled: 1, open: 0, end: 0, label: 'A', tm: false });
  expect(await shape('D2')).toEqual({ filled: 1, open: 1, end: 0, label: 'D2', tm: false }); // D2 z sygnałem Ms2
  expect(await shape('Tm1')).toEqual({ filled: 0, open: 1, end: 0, label: '1', tm: true });
  const tmColour = await sig(page, 'Tm1').locator('.sig-label').evaluate((t) => getComputedStyle(t).fill);
  expect(tmColour).toBe('rgb(64, 224, 208)');
});

test('zastopowany semafor w utwierdzonym przebiegu: symbol czerwony, opis różowy (K9); zwalnianie czasowe – różowe, EBIScreen: sygnalizator fioletowy (K8, B2)', async ({ page }) => {
  await openShift(page, 'szkolna', { params: { scenariusz: 'zmiana' } });
  await page.evaluate(() => { const s = window.sim; s.ilk.setRoute('A-D1'); });
  await advance(page, 8);
  await page.evaluate(() => window.sim.execute({ type: 'signal-stop', signal: 'A', on: true }));
  await expect(sig(page, 'A').locator('.sig-body')).toHaveClass(/st-locked/);
  await expect(sig(page, 'A').locator('.sig-label')).toHaveClass(/stopped/);
  // zwalnianie czasowe (pociąg w zbliżaniu symulowany zajętością odcinka zbliżania)
  const timed = async () => page.evaluate(() => {
    const s = window.sim; s.ilk.sections.get('ZbA').forced = true; s.ilk.refreshOccupancy();
    s.execute({ type: 'signal-stop', signal: 'A', on: false }); s.ilk.releaseRoute('A', false);
  });
  await timed();
  await advance(page, 1);
  const seg = await page.evaluate(() => { const e = window.desk.sectionRefs.get('T1')[0]; return [e.getAttribute('class'), getComputedStyle(e.querySelector('.trk')).stroke]; });
  expect(seg[0]).toContain('timed');
  expect(seg[1]).toBe('rgb(255, 0, 255)'); // jeden róż Ie-104 (dawniej fiolet)
  await expect(sig(page, 'A').locator('.sig-body')).toHaveClass(/st-locked/); // stanowisko komputerowe – czerwony
  await openShift(page, 'szkolna', { params: { scenariusz: 'zmiana-ebi' } });
  await page.evaluate(() => window.sim.ilk.setRoute('A-D1'));
  await advance(page, 8);
  await timed();
  await advance(page, 1);
  await expect(sig(page, 'A').locator('.sig-body')).toHaveClass(/st-timed/); // EBIScreen – fioletowy
});

test('tor zamknięty i zajęty – podwójna czerwona linia (K10); zwrotnica: pole Z puste w ruchu, białe / czerwone migające, róż tylko w polu Z (K6)', async ({ page }) => {
  await openShift(page, 'szkolna', { params: { scenariusz: 'zmiana' } });
  await page.evaluate(() => { const s = window.sim; s.execute({ type: 'close-section', section: 'T3', closed: true }); const t3 = s.ilk.sections.get('T3'); t3.forced = true; s.ilk.refreshOccupancy(); });
  const t3 = await page.evaluate(() => window.desk.sectionRefs.get('T3')[0].getAttribute('class'));
  expect(t3).toMatch(/occ/); expect(t3).toMatch(/closed/);
  const z = () => page.evaluate(() => { const r = window.desk.pointRefs.get('Zw1'); return { d: r.zField.getAttribute('d'), z: r.zField.getAttribute('class'), toe: r.toe.getAttribute('class') }; });
  await page.evaluate(() => window.sim.execute({ type: 'point', id: 'Zw1' }));
  expect((await z()).d).toBe(''); // w czasie przestawiania pole Z puste
  await advance(page, 6);
  await page.evaluate(() => window.sim.execute({ type: 'lock', id: 'Zw1' }));
  let st = await z();
  expect(st.z).toContain('locked'); expect(st.toe).not.toContain('locked'); // róż tylko w polu Z
  await page.evaluate(() => { const s = window.sim; s.execute({ type: 'lock', id: 'Zw1' }); const p = s.ilk.points.get('Zw1'); p.control = false; s.bus.emit('point', p); });
  st = await z();
  expect(st.z).toContain('nocontrol');
  await page.evaluate(() => { const s = window.sim; s.ilk.trailPoint('Zw1'); });
  expect((await z()).z).toContain('trailed');
});

test('wykolejnica jako pole Z (K11), kozioł w kształcie T i koniec przebiegu manewrowego jako półkole (K16), numer pociągu w osi toru (K15)', async ({ page }) => {
  await openShift(page, 'szkolna', { params: { scenariusz: 'zmiana' } });
  const wk = () => page.evaluate(() => { const r = window.desk.derailerRefs.get('Wk1'); return [r.mark.getAttribute('d'), r.mark.getAttribute('class')]; });
  expect(await wk()).toEqual(['M0,-5 L0,5', 'wk-z']); // nałożona – kreska przez tor
  await page.evaluate(() => window.sim.execute({ type: 'lock', id: 'Wk1', derailer: true }));
  expect((await wk())[1]).toContain('locked');
  const end = await page.evaluate(() => { const g = document.querySelector(`.hit[data-ref*='"id":"kT3"']`).closest('.scr-el'); return g.querySelector('.end-mark').tagName; });
  expect(end).toBe('path'); // kT3 – koniec przebiegu manewrowego (półkole)
  // numer pociągu w osi toru: kasetka na wysokości środka kostki czoła
  await page.evaluate(() => { const s = window.sim; s.blocks.get('W').press('Poz'); });
  await page.evaluate(() => { const s = window.sim; s.clock.paused = false; for (let i = 0; i < 4000 && !s.traffic.trains.some((t) => t.entered); i++) s.step(0.5); s.clock.paused = true; });
  await page.waitForTimeout(100);
  const axis = await page.evaluate(() => {
    const tr = window.sim.traffic.trains.find((t) => t.entered);
    const label = [...document.querySelectorAll('.scr-train')].find((g) => g.textContent === String(tr.nr));
    const y = +/translate\([-\d.]+,([-\d.]+)\)/.exec(label.getAttribute('transform'))[1];
    const tile = tr.occupiedTiles().at(-1);
    return { y, axis: (tile.y * 40 + 20) * window.desk.ry };
  });
  expect(Math.abs(axis.y - axis.axis)).toBeLessThan(0.5);
});

test('miganie synchroniczne 1 Hz na całym obrazie: bez osobnych animacji, wspólna faza (K17)', async ({ page }) => {
  await openShift(page, 'szkolna', { params: { scenariusz: 'zmiana' } });
  await page.evaluate(() => window.sim.execute({ type: 'substitute', signal: 'A' }));
  const anim = await sig(page, 'A').locator('.sig-body path').first().evaluate((p) => getComputedStyle(p).animationName);
  expect(anim).toBe('none');
  const phases = await page.evaluate(async () => { const svg = document.querySelector('#desk svg.screen'); const a = svg.classList.contains('ph'); await new Promise((r) => setTimeout(r, 600)); return [a, svg.classList.contains('ph')]; });
  expect(phases[0]).not.toBe(phases[1]); // faza przełącza się co 0,5 s
});
