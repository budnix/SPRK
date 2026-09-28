/** Wspólne narzędzia testów e2e: uruchomienie zmiany z ustawieniami, klikanie elementów pulpitu i monitora. */
export const DEFAULT_SETTINGS = { deskPos: 'middle', sidePos: 'bottom', theme: 'light', sideCollapsed: false, screens: 'off', symScale: '1', rowScale: '1' };

export async function openShift(page, station, { settings = {}, params = {} } = {}) {
  const s = { ...DEFAULT_SETTINGS, ...settings };
  // tylko przy pierwszym wejściu – po przeładowaniu (reload) ustawienia zmienione w teście mają zostać
  await page.addInitScript((v) => {
    if (sessionStorage.getItem('sprk.e2e-init')) return;
    sessionStorage.setItem('sprk.e2e-init', '1');
    localStorage.setItem('sprk.settings', JSON.stringify(v));
  }, s);
  const q = new URLSearchParams({ stacja: station, scenariusz: 'zmiana', zaklocenia: 'none', ...params });
  await page.goto(`/?${q}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.sim && document.querySelector('#desk svg'));
  await page.evaluate(() => { window.sim.clock.paused = true; });
  await page.evaluate(() => document.fonts.ready); // czcionka aplikacji wczytana – stały wygląd zrzutów i pomiarów
}

/** Element monitora (ScreenRenderer) po id z data-ref. */
export function hit(page, id) {
  return page.locator(`.hit[data-ref*='"id":"${id}"']`).first();
}

/** Kliknięcie elementu monitora (pointerdown na obszarze dotyku). */
export async function tap(page, id) {
  await hit(page, id).dispatchEvent('pointerdown', { bubbles: true, button: 0, clientX: 10, clientY: 10 });
}

/** Przycisk pulpitu kostkowego (DeskRenderer) po ref. */
export function btn(page, ref) {
  const key = JSON.stringify(ref);
  return page.locator(`.btn[data-ref='${key}']`).first();
}

/** Stan symulacji do asercji. */
export async function simState(page) {
  return page.evaluate(() => ({
    active: [...window.sim.ilk.active.keys()],
    pending: window.sim.ilk.pending.map((p) => p.route.id),
    armed: window.sim.ilk.armed ? { kind: window.sim.ilk.armed.kind, id: window.sim.ilk.armed.id } : null,
    signals: Object.fromEntries([...window.sim.ilk.signals.values()].map((s) => [s.id, s.aspect])),
    points: Object.fromEntries([...window.sim.ilk.points.values()].map((p) => [p.id, p.position])),
    counters: { ...window.sim.ilk.counters },
  }));
}

/** Przesuwa symulację o `seconds` sekund (bez czekania w czasie rzeczywistym); zegar zostaje zatrzymany. */
export async function advance(page, seconds) {
  await page.evaluate((s) => {
    const c = window.sim.clock; const paused = c.paused, speed = c.speed;
    c.paused = false; c.speed = 1;
    for (let i = 0; i < s * 2; i++) window.sim.step(0.5);
    c.paused = paused; c.speed = speed;
  }, seconds);
}

/** Naciśnięcie przycisku pulpitu kostkowego zdarzeniami wskaźnika (bez testu trafienia – dymek samouczka może leżeć obok). */
export async function pressBtn(page, ref) {
  const b = btn(page, ref);
  await b.dispatchEvent('pointerdown', { bubbles: true, button: 0 });
  await b.dispatchEvent('pointerup', { bubbles: true, button: 0 });
}
