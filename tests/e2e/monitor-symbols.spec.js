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
  // faza przełącza się co 0,5 s – czekamy na pierwszą zmianę (stałe odczekanie mogłoby trafić w dwie zmiany)
  const initial = await page.evaluate(() => document.querySelector('#desk svg.screen').classList.contains('ph'));
  await page.waitForFunction((a) => document.querySelector('#desk svg.screen').classList.contains('ph') !== a, initial, { timeout: 1500 });
});

// Symbol blokady na wyjeździe wg Ie-104.1 §8 pkt 20–22: strzałki kierunkowe – obraz A (stan neutralny / usterka: grot, prostokąt,
// grot), B (PRZYJAZD – jedna strzałka do stacji), C (WYJAZD – jedna strzałka w stronę szlaku), grot „a” i trzon „b” w barwach
// z tabel; przy Eap symbol Ko/dKo nad strzałkami. Dawniej dwie strzałki kierunku leżały w tym samym miejscu – szara „wjazd”
// zasłaniała żółtą „wyjazd” (Szkolna, wyjazd Dębno po prawej: z żółtej widać było tylko rogi) – a stan pokazywały własne
// napisy („żąd.”, „Wbl”, „Ko”, „tel.”, „Pwl”), których przepisy nie znają; napis „żąd.” migał przy tym dwoma zegarami naraz.
const BASE = { direction: null, request: null, permission: false, occupied: false, poBlocked: false, koPending: false, zpg: false, koPrepared: false, pwl: false, fault: false };
// [nazwa, stan, obraz, barwa a (albo całego obrazu A), barwa b, Ko/dKo]; barwy migające: [faza jasna, faza ciemna]
const Y = 'yellow', R = 'red', D = 'dark', YB = [Y, D], F = ['white', R], OFF = 'none', G = 'green', KYB = [Y, OFF];
const EAP = [
  ['neutralny', {}, 'A', D, D, OFF],
  ['żądanie sąsiada', { request: 'theirs' }, 'B', YB, Y, OFF],
  ['PRZYJAZD', { direction: 'in' }, 'B', Y, Y, OFF],
  ['PRZYJAZD wykorzystany', { direction: 'in', occupied: true }, 'B', R, R, OFF],
  ['przyjazd do Ko', { direction: 'in', koPending: true, zpg: true }, 'B', R, R, G],
  ['dKo przed wjazdem na Sz', { direction: 'in', koPrepared: true }, 'B', Y, Y, KYB],
  ['Wbl', { request: 'ours' }, 'C', YB, Y, OFF],
  ['WYJAZD', { direction: 'out', permission: true }, 'C', Y, Y, OFF],
  ['sygnał wyjazdowy (Pwl)', { direction: 'out', permission: true, pwl: true }, 'C', Y, R, OFF],
  ['WYJAZD wykorzystany', { direction: 'out', permission: true, poBlocked: true, occupied: true }, 'C', R, R, OFF],
  ['usterka', { fault: true }, 'A', F, F, OFF],
];
const SBL = [
  ['żądanie sąsiada', { direction: 'out', request: 'theirs' }, 'B', YB, Y, null],
  ['Zk', { direction: 'in', request: 'ours' }, 'C', YB, Y, null],
  ['PRZYJAZD, odstęp zajęty', { direction: 'in', occupied: true }, 'B', Y, Y, null],
  ['WYJAZD, pociąg na szlaku', { direction: 'out', poBlocked: true, occupied: true }, 'C', Y, Y, null],
  ['WYJAZD, sygnał wyjazdowy', { direction: 'out', pwl: true }, 'C', Y, Y, null],
  ['usterka', { direction: 'out', fault: true }, 'A', F, F, null],
];
const RGB = { yellow: 'rgb(255, 210, 31)', red: 'rgb(255, 36, 25)', white: 'rgb(255, 255, 255)', dark: 'rgb(74, 84, 93)', green: 'rgb(33, 208, 74)', none: 'none' };

for (const [station, params, table] of [
  ['szkolna', { scenariusz: 'zmiana' }, EAP], ['szkolna', { scenariusz: 'zmiana-ebi' }, EAP],
  ['kalinowo', { scenariusz: 'zmiana' }, EAP], ['sopot', { scenariusz: 'zmiana' }, SBL],
]) {
  test(`blokada na monitorze (${station}, ${params.scenariusz}): strzałki kierunkowe i Ko/dKo wg Ie-104.1 – obraz A / B / C, barwy segmentów, miganie wspólną fazą, bez napisów i nakładania`, async ({ page }) => {
    await openShift(page, station, { params });
    const res = await page.evaluate(([BASE, table, RGB]) => {
      const bad = [], seen = new Set();
      const svg = document.querySelector('#desk svg.screen');
      if (window.desk.blinkTimer) { clearInterval(window.desk.blinkTimer); window.desk.blinkTimer = null; }
      const box = (e) => { const b = e.getBoundingClientRect(); return { x0: b.left, x1: b.right, y0: b.top, y1: b.bottom, cx: (b.left + b.right) / 2 }; };
      const apart = (a, b) => a.x1 <= b.x0 + 0.01 || b.x1 <= a.x0 + 0.01 || a.y1 <= b.y0 + 0.01 || b.y1 <= a.y0 + 0.01;
      const fill = (e) => { const f = getComputedStyle(e).fill; return f === 'none' || f === 'rgba(0, 0, 0, 0)' ? 'none' : f; };
      const phases = (c) => (Array.isArray(c) ? c : [c, c]).map((x) => RGB[x]);
      // grot: tuż przy skrajnym punkcie na osi – w strzałce, nad i pod osią – już nie
      const pointed = (e, end) => { const b = e.getBBox(), y = b.y + b.height / 2, h = b.height * 0.3, x = end > 0 ? b.x + b.width - 0.4 : b.x + 0.4; const at = (yy) => e.isPointInFill(new DOMPoint(x, yy)); return at(y) && !at(y - h) && !at(y + h); };
      for (const [ex, r] of window.desk.blockRefs) {
        const b = window.sim.blocks.get(ex);
        const right = window.sim.station.exits[ex].dir === 'E';
        seen.add(right ? 'E' : 'W');
        const toLine = right ? 1 : -1;   // kierunek „w stronę szlaku” na ekranie
        const saved = Object.fromEntries(Object.keys(BASE).map((k) => [k, b[k]]));
        if (r.g.querySelector('.blk-status')) bad.push(`${ex}: napis stanu blokady`);
        for (const [name, st, pic, ca, cb, ko] of table) {
          const tag = `${ex} ${name}`;
          Object.assign(b, BASE, st);
          window.desk.updateBlock(ex);
          const shown = [...r.g.querySelectorAll('.blk-pic')].filter((g) => getComputedStyle(g).display !== 'none');
          if (shown.length !== 1 || shown[0].dataset.pic !== pic) { bad.push(`${tag}: obraz ${shown.map((g) => g.dataset.pic).join('+')} zamiast ${pic}`); continue; }
          const parts = [...shown[0].querySelectorAll('.blk-seg')];
          const seg = (n) => parts.find((p) => p.dataset.seg === n);
          const others = [r.exitArrow, r.ko, ...r.g.querySelectorAll('text')].filter(Boolean);
          for (const p of parts) {
            if (p.getAnimations().length || getComputedStyle(p).animationName !== 'none') bad.push(`${tag}: własna animacja`);
            for (const o of others) if (!apart(box(p), box(o))) bad.push(`${tag}: ${p.dataset.seg} nachodzi na ${o.getAttribute('class') || o.tagName}`);
          }
          for (let i = 0; i < parts.length; i++) for (let j = i + 1; j < parts.length; j++) if (!apart(box(parts[i]), box(parts[j]))) bad.push(`${tag}: ${parts[i].dataset.seg} / ${parts[j].dataset.seg} nachodzą`);
          if (pic === 'A') {
            if (parts.length !== 3) bad.push(`${tag}: obraz A ma ${parts.length} części`);
            if (!pointed(seg('line'), toLine) || !pointed(seg('station'), -toLine)) bad.push(`${tag}: obraz A bez grotów na zewnątrz`);
            if (Math.sign(box(seg('line')).cx - box(seg('box')).cx) !== toLine) bad.push(`${tag}: grot „szlak” nie od strony szlaku`);
          } else {
            // B – strzałka do stacji, C – w stronę szlaku: grot a po tej stronie trzonu b, zaostrzony
            const way = pic === 'C' ? toLine : -toLine;
            if (Math.sign(box(seg('a')).cx - box(seg('b')).cx) !== way || !pointed(seg('a'), way)) bad.push(`${tag}: strzałka ${pic} w złą stronę`);
          }
          for (const ph of [false, true]) {
            // faza: klasa rysunku i atrybut grupy planu (reguły CSS migania zaczynają się od grupy – pola skrajne)
            svg.classList.toggle('ph', ph); window.desk.inner.setAttribute('data-ph', ph ? '1' : '0');
            const i = ph ? 1 : 0;
            for (const p of parts) {
              const want = phases(p.dataset.seg === 'b' ? cb : ca)[i];
              if (fill(p) !== want) bad.push(`${tag}${ph ? ' (ph)' : ''}: ${p.dataset.seg} ${fill(p)} zamiast ${want}`);
            }
            if (ko === null) { if (r.ko) bad.push(`${tag}: Ko/dKo na blokadzie samoczynnej`); }
            else if (!r.ko) bad.push(`${tag}: brak Ko/dKo`);
            else if (fill(r.ko) !== phases(ko)[i]) bad.push(`${tag}${ph ? ' (ph)' : ''}: Ko ${fill(r.ko)} zamiast ${phases(ko)[i]}`);
            if (r.ko && (r.ko.getAnimations().length || box(r.ko).y1 > Math.min(...parts.map((p) => box(p).y0)))) bad.push(`${tag}: Ko nie nad strzałkami albo z animacją`);
          }
          svg.classList.remove('ph'); window.desk.inner.setAttribute('data-ph', '0');
        }
        Object.assign(b, saved);
        window.desk.updateBlock(ex);
      }
      return { bad, seen: [...seen].sort().join('') };
    }, [BASE, table, RGB]);
    expect(res.bad).toEqual([]);
    expect(res.seen).toBe('EW'); // wyjazdy po obu stronach (głowica prawa – lustrzane odbicie lewej)
  });
}
