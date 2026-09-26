import { Simulation } from './model/Simulation.js';
import { DeskRenderer } from './render/DeskRenderer.js';
import { SidePanel } from './ui/SidePanel.js';
import { Help } from './ui/Help.js';
import { Settings } from './ui/Settings.js';
import { StartScreen } from './ui/StartScreen.js';
import { Report } from './ui/Report.js';
import { Clock } from './core/Clock.js';
import { getStation } from './stations/index.js';

const params = new URLSearchParams(location.search);
const station = getStation(params.get('stacja'));
const startScreen = new StartScreen(document.getElementById('start'), {
  station: params.get('stacja'), scenario: params.get('scenariusz'), level: params.get('zaklocenia'),
});
if (!params.get('scenariusz')) startScreen.show();

const sim = new Simulation(station, {
  speed: 1,
  scenario: params.get('scenariusz') || undefined,
  disruptions: params.get('zaklocenia') || 'none',
  seed: params.get('seed') ? Number(params.get('seed')) : undefined,
});
if (!params.get('scenariusz')) sim.clock.paused = true;
document.getElementById('station-name').textContent = `${station.name} · ${sim.scenario.name}`;
document.title = `SPRK – ${station.name}`;
const report = new Report(document.getElementById('report'), sim);
sim.bus.on('shift-end', () => report.show());

const desk = new DeskRenderer(document.getElementById('desk'), sim, {
  onPress: (ref) => sim.press(ref),
  onPull: (ref) => sim.pull(ref),
});
const side = new SidePanel(document.getElementById('side'), sim);
const help = new Help(document.getElementById('help'), sim);
document.getElementById('btn-help').addEventListener('click', () => help.toggle());

/* ---- menu i ustawienia ---- */
const menuEl = document.getElementById('menu');
const menuBtn = document.getElementById('btn-menu');
const settings = new Settings(() => requestAnimationFrame(fit));
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
const ARM_HINT = {
  point: (a) => `Zwrotnica ${a.id} uzbrojona – naciśnij Zw (przestawienie) lub Zz (zamknięcie)`,
  derailer: (a) => `Wykolejnica ${a.id} uzbrojona – naciśnij Zw`,
  signal: (a) => `${a.color === 'white' ? 'Manewrowy' : 'Pociągowy'} początek przebiegu ${a.id} – naciśnij przycisk końca przebiegu`,
  group: (a) => ({
    'group-point': 'Zw – naciśnij przycisk zwrotnicy lub wykolejnicy',
    'point-lock': 'Zz – naciśnij przycisk zwrotnicy (zamknięcie/otwarcie)',
    'route-release': 'Pz – naciśnij przycisk sygnałowy przebiegu do zwolnienia',
    'emergency-release': 'dPz – naciśnij przycisk sygnałowy (zwolnienie doraźne, licznik!)',
    'substitute': 'Sz – naciśnij zielony przycisk semafora (sygnał zastępczy, licznik!)',
  })[a.role] || `${a.id} uzbrojony`,
};
sim.bus.on('armed', (a) => {
  if (!a) { if (statusEl.classList.contains('lv-armed')) setStatus('', 'info', 0); return; }
  setStatus(ARM_HINT[a.kind]?.(a) || '', 'armed', 0);
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
function fit() {
  const { cols, rows } = station.desk;
  const w = scroll.clientWidth - 8, h = scroll.clientHeight - 8;
  zoom = Math.max(0.3, Math.min(w / (cols * 40 + 44), h / (rows * 40 + 44)));
  applyZoom();
}
function applyZoom() {
  const { cols, rows } = station.desk;
  deskEl.style.width = `${(cols * 40 + 44) * zoom}px`;
  deskEl.style.height = `${(rows * 40 + 44) * zoom}px`;
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
