import { Simulation } from './model/Simulation.js';
import { DeskRenderer } from './render/DeskRenderer.js';
import { SidePanel } from './ui/SidePanel.js';
import { Help } from './ui/Help.js';
import { Clock } from './core/Clock.js';
import { getStation } from './stations/index.js';

const params = new URLSearchParams(location.search);
const station = getStation(params.get('stacja'));

const sim = new Simulation(station, { speed: 1 });
document.getElementById('station-name').textContent = station.name;

const desk = new DeskRenderer(document.getElementById('desk'), sim, {
  onPress: (ref) => sim.press(ref),
  onPull: (ref) => sim.pull(ref),
});
const side = new SidePanel(document.getElementById('side'), sim);
const help = new Help(document.getElementById('help'), sim);
document.getElementById('btn-help').addEventListener('click', () => help.toggle());

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
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  if (e.code === 'Space') { e.preventDefault(); pauseBtn.click(); }
  if (e.key === 'Escape') help.hide();
});

/* ---- zoom pulpitu ---- */
const deskEl = document.getElementById('desk');
const scroll = document.getElementById('desk-scroll');
let zoom = 1;
function fit() {
  const { cols, rows } = station.desk;
  const w = scroll.clientWidth - 8, h = scroll.clientHeight - 8;
  zoom = Math.max(0.3, Math.min(w / (cols * 40), h / (rows * 40)));
  applyZoom();
}
function applyZoom() {
  const { cols, rows } = station.desk;
  deskEl.style.width = `${cols * 40 * zoom}px`;
  deskEl.style.height = `${rows * 40 * zoom}px`;
}
document.getElementById('zoom-in').addEventListener('click', () => { zoom = Math.min(3, zoom * 1.2); applyZoom(); });
document.getElementById('zoom-out').addEventListener('click', () => { zoom = Math.max(0.3, zoom / 1.2); applyZoom(); });
document.getElementById('zoom-fit').addEventListener('click', fit);
window.addEventListener('resize', fit);
requestAnimationFrame(fit);

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
