import { Simulation } from './model/Simulation.js';
import { createView, viewSize, viewHint, armHint } from './srk/views.js';
import { planScreens, screenLabel } from './render/screens.js';
import { SidePanel } from './ui/SidePanel.js';
import { Help } from './ui/Help.js';
import { Settings } from './ui/Settings.js';
import { StartScreen } from './ui/StartScreen.js';
import { Report } from './ui/Report.js';
import { Clock } from './core/Clock.js';
import { getStation } from './stations/index.js';
import { Tutorial } from './tutorial/Tutorial.js';
import { getMission } from './tutorial/missions.js';

const params = new URLSearchParams(location.search);
const station = getStation(params.get('stacja'));
const settings = new Settings((key, value) => {
  if (key === 'srk' || key === 'rowScale') location.reload();
  else if (key === 'screens') planAll();
  else if (key === 'symScale') { for (const d of desks) d.renderer.setSymbolScale?.(value); }
  else requestAnimationFrame(fit);
});
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
  srk: settings.values.srk === 'auto' ? undefined : settings.values.srk,
});
if (!params.get('scenariusz')) sim.clock.paused = true;
document.getElementById('station-name').textContent = `${station.name} · ${sim.scenario.name}${sim.districts ? ` · ${sim.playerDistrict === 'both' ? 'oba okręgi' : sim.playerDistrict}` : ''}`;
document.title = `SPRK – ${station.name}`;
document.getElementById('hint').textContent = viewHint(sim.srk);
const report = new Report(document.getElementById('report'), sim);
sim.bus.on('shift-end', () => report.show());

/* ---- pulpity: jeden lub po jednym na okręg nastawczy ---- */
const handlers = { onPress: (ref) => sim.press(ref), onPull: (ref) => sim.pull(ref) };
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
    b.innerHTML = `${d.short || id}${mine ? '' : '<span class="ai">automat</span>'}`;
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
  for (const d of desks) { d.el.classList.toggle('hidden', d.id !== id); d.renderer.cmdBar?.classList.toggle('hidden', d.id !== id); }
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
  applyScreen();
}
function currentScreen() {
  const d = activeDesk;
  return d && d.screen >= 0 && d.screens.length > 1 ? d.screens[d.screen] : null;
}
function applyScreen() {
  const d = activeDesk; if (!d) return;
  const s = currentScreen();
  if (s) d.renderer.setView(s.x0, s.x1); else d.renderer.resetView();
  const n = d.screens.length;
  document.getElementById('screen-group').classList.toggle('hidden', n <= 1);
  screenTabs.innerHTML = '';
  if (n > 1) {
    const mk = (label, idx, sub) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = `tb${d.screen === idx ? ' active' : ''}`;
      b.innerHTML = sub ? `${label}<small>${sub}</small>` : label;
      b.addEventListener('click', () => setScreen(idx)); screenTabs.appendChild(b);
    };
    mk('całość', -1);
    d.screens.forEach((sc, i) => mk(String(i + 1), i, screenLabel(station, sc, i, n)));
  }
  fit();
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
  miniHost: document.getElementById('mini-tabs'),
  onToggle: (collapsed) => { settings.set('sideCollapsed', collapsed); sideToggle.textContent = collapsed ? 'pokaż' : 'ukryj'; },
});
sideToggle.addEventListener('click', () => side.collapse(!side.collapsed));
if (settings.values.sideCollapsed) side.collapse(true);
const help = new Help(document.getElementById('help'), sim);
document.getElementById('btn-help').addEventListener('click', () => help.toggle());

/* ---- menu i ustawienia ---- */
const menuEl = document.getElementById('menu');
const menuBtn = document.getElementById('btn-menu');
settings.bindMenu(menuEl);
function toggleMenu(show = menuEl.classList.contains('hidden')) {
  menuEl.classList.toggle('hidden', !show);
  menuBtn.setAttribute('aria-expanded', String(show));
}
menuBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleMenu(); });
document.addEventListener('click', (e) => { if (!menuEl.contains(e.target)) toggleMenu(false); });
document.getElementById('menu-help').addEventListener('click', () => { toggleMenu(false); help.toggle(); });
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
  pauseBtn.textContent = sim.clock.paused ? '▶' : '❚❚';
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
let zoom = 1;
function deskSize() {
  const s = currentScreen();
  const cols = s ? s.x1 - s.x0 + 1 : (activeDesk?.cols ?? station.desk.cols);
  return viewSize(sim.srk, cols, station.desk.rows, viewOpts());
}
function fit() {
  const { w: dw, h: dh } = deskSize();
  const w = scroll.clientWidth - 8, h = scroll.clientHeight - 8;
  zoom = Math.max(0.3, Math.min(w / dw, h / dh));
  applyZoom();
}
function applyZoom() {
  const { w, h } = deskSize();
  deskEl.style.width = `${w * zoom}px`;
  deskEl.style.height = `${h * zoom}px`;
}
/** Zmiana powiększenia wokół punktu (px, py) w układzie widocznego obszaru pulpitu. */
function zoomAt(factor, px, py) {
  const prev = zoom;
  zoom = Math.max(0.3, Math.min(4, zoom * factor));
  const k = zoom / prev;
  if (k === 1) return;
  const sx = scroll.scrollLeft, sy = scroll.scrollTop;
  applyZoom();
  // punkt pod palcami ma zostać w miejscu
  scroll.scrollLeft = (sx + px) * k - px;
  scroll.scrollTop = (sy + py) * k - py;
}
document.getElementById('zoom-in').addEventListener('click', () => zoomAt(1.2, scroll.clientWidth / 2, scroll.clientHeight / 2));
document.getElementById('zoom-out').addEventListener('click', () => zoomAt(1 / 1.2, scroll.clientWidth / 2, scroll.clientHeight / 2));

/* Pinch (dwa palce) – iPad/Android; jeden palec dalej przewija natywnie. */
let pinch = null;
scroll.addEventListener('touchstart', (e) => {
  if (e.touches.length !== 2) return;
  e.preventDefault();
  pinch = { d: dist(e.touches), zoom };
}, { passive: false });
scroll.addEventListener('touchmove', (e) => {
  if (!pinch || e.touches.length !== 2) return;
  e.preventDefault();
  const r = scroll.getBoundingClientRect();
  const mx = (e.touches[0].clientX + e.touches[1].clientX) / 2 - r.left;
  const my = (e.touches[0].clientY + e.touches[1].clientY) / 2 - r.top;
  const target = pinch.zoom * (dist(e.touches) / pinch.d);
  zoomAt(target / zoom, mx, my);
}, { passive: false });
const endPinch = (e) => { if (e.touches.length < 2) pinch = null; };
scroll.addEventListener('touchend', endPinch);
scroll.addEventListener('touchcancel', endPinch);
function dist(t) { return Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY); }
// Safari wysyła też zdarzenia gesture* – blokujemy powiększanie strony, obsługa jest w touch*
for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(ev, (e) => e.preventDefault(), { passive: false });
// Trackpad / ctrl+kółko na komputerze
scroll.addEventListener('wheel', (e) => {
  if (!e.ctrlKey && !e.metaKey) return;
  e.preventDefault();
  const r = scroll.getBoundingClientRect();
  zoomAt(Math.exp(-e.deltaY * 0.01), e.clientX - r.left, e.clientY - r.top);
}, { passive: false });
document.getElementById('zoom-fit').addEventListener('click', fit);
let replanTimer = null;
function onResize() { clearTimeout(replanTimer); replanTimer = setTimeout(planAll, 150); }
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
    const r = activeDesk?.renderer;
    if (a.el) return document.querySelector(a.el);
    if (a.tab) { side.collapse(false); return document.querySelector(`#side .tabs button[data-tab="${a.tab}"]`); }
    if (a.cmd) return r?.cmdButton?.(a.cmd) || null;
    if (a.block) return r?.elementFor?.({ kind: 'blockpanel', exit: a.block }) || null;
    if (a.ref) return r?.elementFor?.(a.ref) || null;
    return null;
  };
  tutorial = new Tutorial(sim, { steps: mission.steps(), anchorEl, showTab: (id) => { side.collapse(false); side.showTab(id); }, onFinish: () => setStatus('Samouczek zakończony', 'info') });
  tutorial.start();
}

// Dla debugowania w konsoli
window.sim = sim; window.desk = desk; window.side = side; window.tutorial = tutorial;
