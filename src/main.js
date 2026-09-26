import { Simulation } from './model/Simulation.js';
import { createView, viewSize, viewHint, armHint } from './srk/views.js';
import { SidePanel } from './ui/SidePanel.js';
import { Help } from './ui/Help.js';
import { Settings } from './ui/Settings.js';
import { StartScreen } from './ui/StartScreen.js';
import { Report } from './ui/Report.js';
import { Clock } from './core/Clock.js';
import { getStation } from './stations/index.js';

const params = new URLSearchParams(location.search);
const station = getStation(params.get('stacja'));
const settings = new Settings((key) => { if (key === 'srk') location.reload(); else requestAnimationFrame(fit); });
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
    const r = createView(sim.srk, wrap, sim, handlers, { window: d.cols, readonly: !mine, title: d.short || id });
    desks.push({ id, renderer: r, cols: d.cols[1] - d.cols[0] + 1, el: wrap });
    const b = document.createElement('button');
    b.innerHTML = `${d.short || id}${mine ? '' : '<span class="ai">automat</span>'}`;
    b.title = d.name;
    b.addEventListener('click', () => showDesk(id));
    tabs.appendChild(b);
  }
  showDesk(sim.playerDistrict === 'both' ? desks[0].id : sim.playerDistrict);
} else {
  desks.push({ id: null, renderer: createView(sim.srk, deskRoot, sim, handlers), cols: station.desk.cols, el: deskRoot });
}
activeDesk = desks[0];
function showDesk(id) {
  for (const d of desks) d.el.classList.toggle('hidden', d.id !== id);
  for (const b of document.querySelectorAll('#desk-tabs button')) b.classList.toggle('active', b.textContent.startsWith(station.districts?.[id]?.short || id));
  activeDesk = desks.find((d) => d.id === id) || desks[0];
  requestAnimationFrame(() => fit());
}
const desk = desks[0].renderer;
const side = new SidePanel(document.getElementById('side'), sim);
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
  const cols = activeDesk?.cols ?? station.desk.cols;
  return viewSize(sim.srk, cols, station.desk.rows);
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
window.addEventListener('resize', fit);
window.addEventListener('orientationchange', () => setTimeout(fit, 300));
window.addEventListener('load', fit);
requestAnimationFrame(fit);
setTimeout(fit, 250);
if (window.visualViewport) window.visualViewport.addEventListener('resize', fit);

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

// Dla debugowania w konsoli
window.sim = sim; window.desk = desk; window.side = side;
