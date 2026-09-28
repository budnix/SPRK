import { Simulation } from './model/Simulation.js';
import { createView, viewSize, viewHint, armHint } from './srk/views.js';
import { planScreens, screenLabel } from './render/screens.js';
import { SidePanel } from './ui/SidePanel.js';
import { Help } from './ui/Help.js';
import { Settings } from './ui/Settings.js';
import { StartScreen } from './ui/StartScreen.js';
import { Report } from './ui/Report.js';
import { EdgePanels } from './ui/EdgePanels.js';
import { DeskViewport } from './ui/DeskViewport.js';
import { SideResizer } from './ui/SideResizer.js';
import { fitAxes, nextFitMode, startFitMode } from './render/zoom.js';
import { SettingsScreen } from './ui/SettingsScreen.js';
import { Clock } from './core/Clock.js';
import { getStation } from './stations/index.js';
import { Tutorial } from './tutorial/Tutorial.js';
import { getMission } from './tutorial/missions.js';
import { applyDom, detectLang, setLang, t } from './i18n/index.js';
import { logoSvg } from './ui/brand.js';
import { uiIcon } from './ui/icons.js';
import { installNoBounce } from './ui/noBounce.js';

const params = new URLSearchParams(location.search);
const station = getStation(params.get('stacja'));
let resizer = null; // przeciąganie granicy planu i panelu – tworzone niżej, ustawienia mogą się zmienić wcześniej
const settings = new Settings((key, value) => {
  if (key === 'rowScale' || key === 'lang') location.reload();
  else if (key === 'screens') planAll();
  else if (key === 'edgePanels') { edges.enabled = value === 'on'; edges.update(); refit(); syncFitButtons(); }
  else if (key === 'symScale') { for (const d of desks) d.renderer.setSymbolScale(value); }
  else { resizer?.apply(); requestAnimationFrame(refit); } // zmiana układu (panel, położenie pulpitu): ten sam tryb dopasowania co dotąd
});
// język interfejsu przed zbudowaniem jakiegokolwiek ekranu; 'auto' = wg przeglądarki
document.documentElement.lang = setLang(detectLang(settings.values.lang === 'auto' ? null : settings.values.lang));
document.title = t('app.title');
applyDom(document.body);
installNoBounce(document); // bez przesuwania strony i „pull to refresh” na tablecie
document.querySelector('#topbar .logo').innerHTML = logoSvg(22);
document.getElementById('btn-menu').innerHTML = uiIcon('menu', 14);
const viewOpts = () => ({ rowScale: settings.values.rowScale, symScale: settings.values.symScale });
const startScreen = new StartScreen(document.getElementById('start'), {
  station: params.get('stacja'), scenario: params.get('scenariusz'), level: params.get('zaklocenia'), district: params.get('okreg'),
});
if (!params.get('scenariusz')) startScreen.show();

const sim = new Simulation(station, {
  speed: 1,
  scenario: params.get('scenariusz') || undefined,
  disruptions: params.get('zaklocenia') || 'none',
  seed: params.get('seed') ? Number(params.get('seed')) : undefined,
  district: params.get('okreg') || undefined,
  srk: params.get('srk') || undefined, // tylko do testów/porównań; stanowisko zawsze wynika z definicji stacji lub scenariusza
});
if (!params.get('scenariusz')) sim.clock.paused = true;
document.getElementById('station-name').textContent = `${station.name} · ${sim.scenario.name}${sim.districts ? ` · ${sim.playerDistrict === 'both' ? t('top.bothDistricts') : sim.playerDistrict}` : ''}`;
document.title = `SPRK – ${station.name}`;
document.getElementById('hint').textContent = viewHint(sim.srk);
const report = new Report(document.getElementById('report'), sim, { onNew: () => startScreen.show() });
sim.bus.on('shift-end', () => report.show());

/* ---- pulpity: jeden lub po jednym na okręg nastawczy ---- */
// przyciski pulpitu (onPress / onPull / onCompound – protokół typu E) i polecenia wydawane wprost (onCommand, onCancel)
const handlers = {
  onPress: (ref) => sim.press(ref), onPull: (ref) => sim.pull(ref), onCompound: (ref) => sim.pressCompound(ref),
  onCommand: (cmd) => sim.execute(cmd), onCancel: () => sim.cancelSelection(),
};
const deskRoot = document.getElementById('desk');
const desks = [];
let activeDesk = null;
if (station.districts) {
  const tabs = document.getElementById('desk-tabs');
  tabs.classList.remove('hidden');
  for (const [id, d] of Object.entries(station.districts)) {
    const wrap = document.createElement('div');
    wrap.className = 'desk-district hidden'; wrap.dataset.district = id;
    deskRoot.appendChild(wrap);
    const mine = sim.playerControls(id);
    const r = createView(sim.srk, wrap, sim, handlers, { window: d.cols, readonly: !mine, title: d.short || id, cmdHost: document.getElementById('cmd-host'), ...viewOpts() });
    desks.push({ id, renderer: r, cols: d.cols[1] - d.cols[0] + 1, x0: d.cols[0], x1: d.cols[1], el: wrap, screens: [], screen: -1 });
    const b = document.createElement('button');
    b.innerHTML = `${d.short || id}${mine ? '' : `<span class="ai">${t('desk.auto')}</span>`}`;
    b.title = d.name;
    b.addEventListener('click', () => showDesk(id));
    tabs.appendChild(b);
  }
  showDesk(sim.playerDistrict === 'both' ? desks[0].id : sim.playerDistrict);
} else {
  desks.push({ id: null, renderer: createView(sim.srk, deskRoot, sim, handlers, { cmdHost: document.getElementById('cmd-host'), ...viewOpts() }), cols: station.desk.cols, x0: 0, x1: station.desk.cols - 1, el: deskRoot, screens: [], screen: -1 });
}
activeDesk = desks[0];
function showDesk(id) {
  for (const d of desks) { d.el.classList.toggle('hidden', d.id !== id); d.renderer.cmdBar && d.renderer.cmdBar.classList.toggle('hidden', d.id !== id); }
  for (const b of document.querySelectorAll('#desk-tabs button')) b.classList.toggle('active', b.textContent.startsWith(station.districts?.[id]?.short || id));
  activeDesk = desks.find((d) => d.id === id) || desks[0];
  requestAnimationFrame(() => planAll());
}

/* ---- ekrany pulpitu: podział szerokiej stacji na okna mieszczące się w oknie przeglądarki (jak monitory LCS) ---- */
const screenTabs = document.getElementById('screen-tabs');
const TARGET_CELL_PX = 30; // czytelne powiększenie: ~30 px na kostkę
function maxCols() { return Math.max(12, Math.floor((scroll.clientWidth - 8) / TARGET_CELL_PX)); }
function planAll() {
  for (const d of desks) {
    const scr = settings.values.screens === 'off' ? [{ x0: d.x0, x1: d.x1, from: d.x0, to: d.x1 }] : planScreens(station, [d.x0, d.x1], maxCols());
    if (JSON.stringify(scr) !== JSON.stringify(d.screens)) {
      d.screens = scr;
      d.screen = scr.length > 1 ? Math.max(0, Math.min(d.screen, scr.length - 1)) : -1;
    }
  }
  applyScreen(true); // zmiana rozmiaru okna / ustawienia: ten sam tryb dopasowania co dotąd
}
function currentScreen() {
  const d = activeDesk;
  return d && d.screen >= 0 && d.screens.length > 1 ? d.screens[d.screen] : null;
}
/** Buduje zakładki ekranów i ustawia widok; `keepMode` – zachowaj bieżący tryb dopasowania (zmiana układu), inaczej „całość” (nowy ekran). */
function applyScreen(keepMode = false) {
  const d = activeDesk; if (!d) return;
  const s = currentScreen();
  if (s) d.renderer.setView(s.x0, s.x1); else d.renderer.resetView();
  if (edges.svg !== d.renderer.svg) edges.attach(d.renderer);
  const n = d.screens.length;
  document.getElementById('screen-group').classList.toggle('hidden', n <= 1);
  // zakładki buduje się tylko po zmianie podziału – ponowne planowanie (rozmiar okna, start) nie wymienia przycisków
  const tabsKey = n > 1 ? JSON.stringify([d.id, d.screens]) : '';
  if (tabsKey !== screenTabs.dataset.key) {
    screenTabs.dataset.key = tabsKey;
    screenTabs.innerHTML = '';
    if (n > 1) {
      const mk = (label, idx, sub) => {
        const b = document.createElement('button'); b.type = 'button'; b.className = 'tb'; b.dataset.screen = idx;
        b.innerHTML = sub ? `${label}<small>${sub}</small>` : label;
        b.addEventListener('click', () => setScreen(idx)); screenTabs.appendChild(b);
      };
      mk(t('tools.whole'), -1);
      d.screens.forEach((sc, i) => mk(String(i + 1), i, screenLabel(station, sc, i, n)));
    }
  }
  for (const b of screenTabs.children) b.classList.toggle('active', Number(b.dataset.screen) === d.screen);
  if (keepMode) refit(); else fit();
}
function setScreen(i) {
  const d = activeDesk; if (!d) return;
  d.screen = Math.max(-1, Math.min(i, d.screens.length - 1));
  applyScreen();
}
function stepScreen(delta) {
  const d = activeDesk; if (!d || d.screens.length <= 1) return;
  if (d.screen < 0) { setScreen(delta > 0 ? 0 : d.screens.length - 1); return; }
  const next = d.screen + delta;
  if (next >= 0 && next < d.screens.length) setScreen(next);
}
const desk = desks[0].renderer;
const sideToggle = document.getElementById('side-toggle');
const side = new SidePanel(document.getElementById('side'), sim, {
  tabsHost: document.getElementById('panel-tabs'),
  onToggle: (collapsed) => {
    settings.set('sideCollapsed', collapsed);
    // ikona panelu: wypełniona część = panel widoczny; pusta = panel ukryty (etykieta dla czytników i podpowiedzi)
    sideToggle.classList.toggle('collapsed', collapsed);
    sideToggle.setAttribute('aria-pressed', String(!collapsed));
    sideToggle.setAttribute('aria-label', t(collapsed ? 'tools.showPanel' : 'tools.hidePanel'));
    sideToggle.title = t(collapsed ? 'tools.showSide' : 'tools.hideSide');
  },
});
sideToggle.addEventListener('click', () => side.collapse(!side.collapsed));
if (settings.values.sideCollapsed) side.collapse(true);
const help = new Help(document.getElementById('help'), sim);
document.getElementById('btn-help').addEventListener('click', () => help.toggle());

/* ---- menu i ustawienia ---- */
const menuEl = document.getElementById('menu');
const menuBtn = document.getElementById('btn-menu');
const settingsScreen = new SettingsScreen(document.getElementById('settings'), settings);
function toggleMenu(show = menuEl.classList.contains('hidden')) {
  menuEl.classList.toggle('hidden', !show);
  menuBtn.setAttribute('aria-expanded', String(show));
}
menuBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleMenu(); });
document.addEventListener('click', (e) => { if (!menuEl.contains(e.target)) toggleMenu(false); });
document.getElementById('menu-help').addEventListener('click', () => { toggleMenu(false); help.toggle(); });
document.getElementById('menu-settings').addEventListener('click', () => { toggleMenu(false); settingsScreen.show(); });
document.getElementById('menu-new').addEventListener('click', () => { toggleMenu(false); startScreen.show(); });
document.getElementById('menu-report').addEventListener('click', () => { toggleMenu(false); report.show(); });

/* ---- pasek stanu: uzbrojenie i ostatni komunikat ---- */
const statusEl = document.getElementById('status');
let statusTimer = null;
function setStatus(msg, level = 'info', ms = 6000) {
  statusEl.textContent = msg;
  statusEl.className = `status lv-${level}`;
  clearTimeout(statusTimer);
  if (ms) statusTimer = setTimeout(() => { statusEl.textContent = ''; statusEl.className = 'status'; }, ms);
}
sim.bus.on('armed', (a) => {
  if (!a) { if (statusEl.classList.contains('lv-armed')) setStatus('', 'info', 0); return; }
  const msg = armHint(sim.srk, a);
  if (msg) setStatus(msg, 'armed', 0);
});
sim.bus.on('log', (e) => { if (e.level !== 'info') setStatus(e.msg, e.level); });

/* ---- zegar / prędkość ---- */
const clockEl = document.getElementById('clock');
const speedEl = document.getElementById('speed');
const SPEEDS = [1, 2, 5, 10, 30];
for (const s of SPEEDS) {
  const b = document.createElement('button');
  b.className = 'tb speed-btn'; b.textContent = `${s}×`; b.dataset.speed = s;
  b.addEventListener('click', () => { sim.clock.speed = s; sim.clock.paused = false; updateSpeed(); });
  speedEl.appendChild(b);
}
const pauseBtn = document.getElementById('btn-pause');
pauseBtn.addEventListener('click', () => { sim.clock.paused = !sim.clock.paused; updateSpeed(); });
function updateSpeed() {
  for (const b of speedEl.querySelectorAll('.speed-btn')) b.classList.toggle('active', +b.dataset.speed === sim.clock.speed && !sim.clock.paused);
  pauseBtn.classList.toggle('active', sim.clock.paused);
  // ikona pokazuje, co zrobi przycisk: wznowienie (zegar stoi) albo pauza (zegar idzie)
  pauseBtn.innerHTML = uiIcon(sim.clock.paused ? 'play' : 'pause', 14);
  pauseBtn.setAttribute('aria-pressed', String(sim.clock.paused));
}
updateSpeed();
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { help.hide(); toggleMenu(false); report.hide(); if (params.get('scenariusz')) startScreen.hide(); return; }
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
  if (e.code === 'Space') { e.preventDefault(); pauseBtn.click(); }
});

/* ---- zoom pulpitu ---- */
const deskEl = document.getElementById('desk');
const scroll = document.getElementById('desk-scroll');
// stałe pola skrajne z blokadą liniową – widoczne, gdy powiększony pulpit nie mieści się na szerokość
const edges = new EdgePanels(scroll, deskEl, { enabled: settings.values.edgePanels === 'on' });
/** Ten sam tryb dopasowania co dotąd (zmiana układu okna, panelu, ekranu). „Całość” jest tylko bez przycisku „wysokość” –
 *  gdy przycisk jest, zamienia się w przycisk osi, która ogranicza plan (a „wysokość” bez przycisku – w całość). */
function refit() {
  const heightButton = settings.values.edgePanels === 'on';
  if ((viewport.fitMode === 'whole' && heightButton) || (viewport.fitMode === 'height' && !heightButton)) fit();
  else viewport.refit();
}
/** Nowy pulpit / ekran: cały plan w oknie – wciśnięty przycisk osi, która go ogranicza. */
function fit() { viewport.fit(startFitMode(deskSize(), { w: scroll.clientWidth, h: scroll.clientHeight }, settings.values.edgePanels === 'on')); }
function deskSize() {
  const s = currentScreen();
  const cols = s ? s.x1 - s.x0 + 1 : (activeDesk?.cols ?? station.desk.cols);
  return viewSize(sim.srk, cols, station.desk.rows, viewOpts());
}
const viewport = new DeskViewport(scroll, deskEl, { size: deskSize, onChange: () => edges.update(), onMode: () => syncFitButtons() });
/** Przyciski dopasowania są stanowe: wciśnięty = plan dopasowuje się na żywo do szerokości / wysokości obszaru. */
function syncFitButtons() {
  document.getElementById('zoom-fit-h').classList.toggle('hidden', settings.values.edgePanels !== 'on');
  const axes = fitAxes(viewport.fitMode);
  for (const [id, on] of [['zoom-fit', axes.w], ['zoom-fit-h', axes.h]]) {
    const b = document.getElementById(id);
    b.classList.toggle('active', on);
    b.setAttribute('aria-pressed', String(on));
  }
}
document.getElementById('zoom-in').addEventListener('click', () => viewport.step(1.2));
document.getElementById('zoom-out').addEventListener('click', () => viewport.step(1 / 1.2));
// „dopasuj”: do szerokości okna; „wysokość”: wypełnia okno w pionie, środek przewijany, pola skrajne przypięte
document.getElementById('zoom-fit').addEventListener('click', () => viewport.setMode(nextFitMode(viewport.fitMode, 'w')));
document.getElementById('zoom-fit-h').addEventListener('click', () => viewport.setMode(nextFitMode(viewport.fitMode, 'h')));
// obszar planu zmienia rozmiar (przeciągnięta granica panelu, zwinięcie panelu, okno): wciśnięte dopasowanie działa na żywo
if (typeof ResizeObserver === 'function') {
  let last = '';
  new ResizeObserver(() => {
    const key = `${scroll.clientWidth}x${scroll.clientHeight}`;
    if (key === last) return;
    last = key;
    if (viewport.fitMode) refit();
  }).observe(scroll);
}
resizer = new SideResizer({ main: document.getElementById('main'), side: document.getElementById('side'), grip: document.getElementById('side-grip'), settings, onEnd: () => onResize() });
syncFitButtons();
let replanTimer = null;
function onResize() { resizer.apply(); clearTimeout(replanTimer); replanTimer = setTimeout(planAll, 150); }
window.addEventListener('resize', onResize);
window.addEventListener('orientationchange', () => setTimeout(planAll, 300));
window.addEventListener('load', planAll);
requestAnimationFrame(planAll);
setTimeout(planAll, 250);
if (window.visualViewport) window.visualViewport.addEventListener('resize', onResize);
// przełączanie ekranów: strzałki ← → oraz przesunięcie palcem, gdy pulpit nie przewija się w poziomie
document.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
  if (e.key === 'ArrowRight') stepScreen(1);
  if (e.key === 'ArrowLeft') stepScreen(-1);
});
let swipe = null;
scroll.addEventListener('touchstart', (e) => { swipe = e.touches.length === 1 ? { x: e.touches[0].clientX, y: e.touches[0].clientY, sx: scroll.scrollLeft } : null; }, { passive: true });
scroll.addEventListener('touchend', (e) => {
  if (!swipe || e.changedTouches.length !== 1) return;
  const dx = e.changedTouches[0].clientX - swipe.x, dy = e.changedTouches[0].clientY - swipe.y;
  const noHScroll = scroll.scrollWidth <= scroll.clientWidth + 2;
  if (noHScroll && Math.abs(dx) > 70 && Math.abs(dy) < 50) stepScreen(dx < 0 ? 1 : -1);
  swipe = null;
}, { passive: true });

/* ---- pętla ---- */
let last = performance.now();
function frame(now) {
  const realDt = Math.min(0.25, (now - last) / 1000);
  last = now;
  sim.step(realDt);
  clockEl.textContent = Clock.format(sim.clock.time, true);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

/* ---- samouczek (misje wprowadzające): scenariusz z polem `tutorial` ---- */
let tutorial = null;
const mission = sim.scenario.tutorial ? getMission(sim.scenario.tutorial) : null;
if (mission && params.get('scenariusz')) {
  const anchorEl = (a) => {
    const r = (activeDesk || desks[0]).renderer;
    if (a.el) return document.querySelector(a.el);
    if (a.tab) { side.collapse(false); return document.querySelector(`#panel-tabs button[data-tab="${a.tab}"]`); }
    if (a.cmd) return r.cmdButton(a.cmd);
    if (a.block) return r.elementFor({ kind: 'blockpanel', exit: a.block });
    if (a.ref) return r.elementFor(a.ref);
    return null;
  };
  tutorial = new Tutorial(sim, { steps: mission.steps(), anchorEl, showTab: (id) => { side.collapse(false); side.showTab(id); }, onFinish: () => setStatus(t('status.tutorialDone'), 'info') });
  tutorial.start();
}

// Dla debugowania w konsoli
window.sim = sim; window.desk = desk; window.side = side; window.tutorial = tutorial; window.viewport = viewport;
