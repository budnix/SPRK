import { el, text, CELL } from './svg.js';
import { refKey } from './refKey.js';
import { PanelView } from './PanelView.js';
import * as art from './leverArt.js';
import { counterDevice } from './tileArt.js';
import { FRAME, setLamp, buildDesk, bindDeskButtons, updateBlockLamps, deskTrainLabel, placeDeskTrainLabel } from './deskParts.js';
import { leverFrame, leverStates } from './leverFrame.js';
import { Interlocking } from '../model/Interlocking.js';

/** Wysokość ławy (aparat blokowy, drążki, dźwignie) w rzędach kostek – pod planem świetlnym. */
export const LEVER_ROWS = 7;
/** Skala elementów ławy względem kostek planu – dźwignie i drążki muszą dać się trafić palcem. */
const K = 1.25;
/** Odchylenie trzonu dźwigni od pionu w obu skrajnych położeniach (rysunek z boku). */
const LEVER_TILT = 19;

/** Wzniesienie ramienia semafora kształtowego (Ie-1: 45° do poziomu); dolne ramię w spoczynku wisi wzdłuż słupa. */
const ARM_UP = -45;
const ARM_HANG = 90;
/** Spłaszczenie tarczy obróconej do poziomu (widać ją z boku – jako kreskę). */
const DISC_FLAT = 0.14;

/**
 * Położenie elementu jako transformacja CSS wokół punktu (px, py) – zmianę położenia animuje przejście CSS
 * (`transition: transform`), więc dźwignia, drążek, ramię semafora i tarcza przesuwają się, a nie przeskakują.
 */
const turn = (e, [px, py], deg) => { e.style.transform = `translate(${px}px,${py}px) rotate(${deg}deg) translate(${-px}px,${-py}px)`; };
const tilt = (e, [px, py], flat) => { e.style.transform = `translate(${px}px,${py}px) scale(1,${flat ? DISC_FLAT : 1}) translate(${-px}px,${-py}px)`; };

/**
 * Nastawnia mechaniczna scentralizowana (SVG): u góry plan świetlny (zajętość odcinków, powtarzacze semaforów
 * kształtowych i tarcz, przyciski blokady liniowej), pod nim ława: aparat blokowy z okienkami bloków przebiegowych utwierdzających
 * i zwalniaczami, drążki przebiegowe (w górę / w dół – dwa przebiegi) i dźwignie nastawcze – zwrotnicowe
 * i wykolejnicowe (niebieskie), semaforowe (czerwone), tarcz manewrowych (niebieskie z czerwoną obwódką).
 * Każdy element wydaje polecenie wprost (`handlers.onCommand` → `Simulation.execute`).
 */
export class LeverRenderer extends PanelView {
  static PAD = FRAME;

  static size(cols, rows, opts = {}) {
    const s = super.size(cols, rows, opts);
    return { w: s.w, h: s.h + LEVER_ROWS * CELL };
  }

  constructor(container, sim, handlers, opts = {}) {
    super(container, sim, handlers, opts, { className: 'desk mech' });
    this.frame = leverFrame(this.ilk);
    this.leverEls = new Map();   // id dźwigni -> { g, rod, knob, lock, fault }
    this.drazekEls = new Map();  // id drążka -> { knob, up, down, win }
    buildDesk(this, art);
    this.#buildBench();
    bindDeskButtons(this, { pull: false });
    this.bindModel();
    this.refreshAll();
  }

  /** Element obsługi ławy: klikalny, z klawiaturą i opisem dla czytnika ekranu. */
  #control(g, ref, label, command) {
    g.classList.add('mech-ctl');
    g.setAttribute('role', 'button');
    g.setAttribute('tabindex', '0');
    g.setAttribute('aria-label', label);
    g.dataset.ref = JSON.stringify(ref);
    const run = () => { if (!this.readonly) this.handlers.onCommand(command()); };
    g.addEventListener('click', run);
    g.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); run(); } });
    this.controlEls.set(refKey(ref), g);
    return g;
  }

  #buildBench() {
    // ława w skali K: współrzędne poniżej w jednostkach ławy (szerokość W = szerokość planu / K)
    const W = (this.cols * CELL) / K;
    const y0 = 0;
    const H = (LEVER_ROWS * CELL - 12) / K;
    const bench = el('g', { class: 'lever-bench', transform: `translate(0,${this.rows * CELL + 8}) scale(${K})` });
    bench.appendChild(el('rect', { class: 'bench-bg', x: 0, y: y0, width: W, height: H, rx: 3 }));
    bench.appendChild(el('rect', { class: 'bench-block', x: 6, y: y0 + 4, width: W - 12, height: 108, rx: 2 }));
    bench.appendChild(text(12, y0 + 12, 'APARAT BLOKOWY · DRĄŻKI PRZEBIEGOWE', { class: 'bench-title', 'text-anchor': 'start' }));
    bench.appendChild(text(12, y0 + 122, 'DŹWIGNIE NASTAWCZE', { class: 'bench-title', 'text-anchor': 'start' }));
    this.inner.insertBefore(bench, this.layerTrains);

    // drążki przebiegowe z blokiem przebiegowym utwierdzającym (przebiegi pociągowe) nad nimi
    const nd = this.frame.drazki.length;
    const sd = Math.min(84, (W * 0.66) / Math.max(nd, 1));
    this.frame.drazki.forEach((d, i) => bench.appendChild(this.#drazek(d, 26 + i * sd + sd / 2 - 20, y0)));

    // klawisze sygnału zastępczego i liczniki (Sz, zwalniacz) po prawej
    const sz = [...this.ilk.signals.values()].filter((s) => s.kind === 'semafor' && s.canSubstitute);
    let x = W - 16 - sz.length * 30 - 90;
    for (const s of sz) {
      const g = el('g', { class: 'sz-key' }, [
        el('rect', { class: 'key', x: x, y: y0 + 28, width: 22, height: 12, rx: 2 }),
        text(x + 11, y0 + 35, 'Sz', { class: 'key-text' }),
        text(x + 11, y0 + 50, s.id, { class: 'bench-label' }),
      ]);
      bench.appendChild(this.#control(g, { kind: 'sz', id: s.id }, `Sz ${s.id}`, () => ({ type: 'substitute', signal: s.id })));
      x += 30;
    }
    x += 8;
    for (const [id, label] of [['Sz', 'Sz'], ['dPz', 'zwalniacz']]) {
      const c = counterDevice(x, y0 + 24, 40, 26, label);
      bench.appendChild(c.g);
      this.counterRefs.set(id, c.t);
      x += 44;
    }

    // dźwignie nastawcze
    const nl = this.frame.levers.length;
    const sl = Math.min(50, (W * 0.8) / Math.max(nl, 1));
    this.frame.levers.forEach((l, i) => bench.appendChild(this.#lever(l, 26 + i * sl + sl / 2, y0 + 131)));
  }

  #drazek(d, cx, y0) {
    const g = el('g', { class: `drazek drazek-${d.kind}`, 'data-drazek': d.id });
    const ref = { kind: 'drazek', id: d.id };
    this.controlEls.set(refKey(ref), g);
    const refs = {};
    if (d.kind === 'train') {
      // okienko bloku przebiegowego utwierdzającego, klawisz i zwalniacz (plomba)
      refs.win = el('rect', { class: 'blk-window', x: cx - 9, y: y0 + 22, width: 18, height: 11, rx: 1.5 });
      g.appendChild(refs.win);
      g.appendChild(this.#control(el('g', { class: 'blk-key' }, [
        el('rect', { class: 'key', x: cx - 8, y: y0 + 36, width: 16, height: 9, rx: 1.5 }),
        el('rect', { class: 'hit', x: cx - 11, y: y0 + 34, width: 22, height: 13 }),
      ]), { kind: 'routeblock', id: d.start }, `Blok przebiegowy ${d.start}`, () => ({ type: 'route-block', signal: d.start })));
      g.appendChild(this.#control(el('g', { class: 'zwalniacz' }, [
        el('circle', { class: 'zw-seal', cx: cx + 14, cy: y0 + 40.5, r: 3 }),
        el('circle', { class: 'hit', cx: cx + 14, cy: y0 + 40.5, r: 6 }),
      ]), { kind: 'routerelease', id: d.start }, `Zwalniacz bloku przebiegowego ${d.start}`, () => ({ type: 'release', signal: d.start, emergency: true })));
    }
    // drążek: szczelina, gałka w górze / w środku / w dole; cel przebiegu przy położeniu
    g.appendChild(el('rect', { class: 'drazek-slot', x: cx - 2.5, y: y0 + 50, width: 5, height: 38, rx: 2.5 }));
    // rączka drążka: płaski uchwyt w poprzek szczeliny
    refs.knob = el('g', { class: 'drazek-knob' }, [
      el('rect', { class: 'drazek-grip', x: cx - 7, y: -2.5, width: 14, height: 5, rx: 2 }),
      el('circle', { class: 'drazek-pin', cx, cy: 0, r: 1.3 }),
    ]);
    g.appendChild(refs.knob);
    g.appendChild(text(cx, y0 + 97, d.id, { class: 'bench-label strong' }));
    refs.y = { up: y0 + 53, null: y0 + 69, down: y0 + 85 };
    for (const r of d.routes) {
      const up = r.pos === 'up';
      const half = el('g', { class: `drazek-pos drazek-${r.pos}` }, [
        el('rect', { class: 'hit', x: cx - 12, y: up ? y0 + 47 : y0 + 70, width: 40, height: 22 }),
        text(cx + 10, up ? y0 + 53 : y0 + 86, r.target, { class: 'bench-label target', 'text-anchor': 'start' }),
      ]);
      refs[r.pos] = half;
      g.appendChild(this.#control(half, { kind: 'route', id: r.id }, `Drążek ${d.id}: ${d.start} → ${r.target}`, () => {
        const sig = this.ilk.signals.get(d.start);
        return sig.route === r.id ? { type: 'release', signal: d.start } : { type: 'route', id: r.id };
      }));
    }
    this.drazekEls.set(d.id, refs);
    return g;
  }

  /**
   * Dźwignia nastawcza z boku (Ie-8 §6 ust. 3): koziołek z dwoma wycięciami (położenie zasadnicze i przełożone),
   * tarcza linkowa na osi, trzon w barwie rodzaju dźwigni, u góry rękojeść i uchwyt pręta zapadkowego. W położeniu
   * zasadniczym trzon odchyla się w lewo (do tyłu), przełożony – w prawo (do przodu).
   */
  #lever(l, cx, y1) {
    const g = el('g', { class: `lever lever-${l.kind}`, 'data-lever': l.id });
    const refs = {};
    const py = y1 + 50; // oś dźwigni
    // koziołek: wycinek z wycięciami na obu skrajnych położeniach
    const arc = (deg, r) => [cx + r * Math.sin((deg * Math.PI) / 180), py - r * Math.cos((deg * Math.PI) / 180)];
    const [ax, ay] = arc(-LEVER_TILT - 8, 15), [bx, by] = arc(LEVER_TILT + 8, 15);
    g.appendChild(el('path', { class: 'lever-sector', d: `M${cx - 9},${py + 6} L${ax},${ay} A15,15 0 0 1 ${bx},${by} L${cx + 9},${py + 6} Z` }));
    for (const deg of [-LEVER_TILT, LEVER_TILT]) { const [nx, ny] = arc(deg, 13.5); g.appendChild(el('circle', { class: 'lever-notch', cx: nx, cy: ny, r: 1.3 })); }
    // ramię: trzon, pręt zapadkowy, uchwyt zapadki i rękojeść – obracane wokół osi
    refs.arm = el('g', { class: 'lever-arm' }, [
      el('rect', { class: 'lever-rod', x: cx - 2.2, y: y1 + 6, width: 4.4, height: 44, rx: 1.2 }),
      el('path', { class: 'lever-catch-rod', d: `M${cx + 3.2},${y1 + 14} L${cx + 3.2},${py - 10}` }),
      el('rect', { class: 'lever-catch', x: cx + 1.8, y: y1 + 5, width: 3, height: 10, rx: 1.2 }),
      el('rect', { class: 'lever-grip', x: cx - 3.2, y: y1 - 3, width: 6.4, height: 13, rx: 2.6 }),
    ]);
    g.appendChild(refs.arm);
    g.appendChild(el('circle', { class: 'lever-drum', cx, cy: py, r: 6 }));
    g.appendChild(el('circle', { class: 'lever-axle', cx, cy: py, r: 1.6 }));
    // oznaczenia położeń po obu stronach koziołka: lewo – zasadnicze, prawo – przełożone (świeci to, w którym dźwignia stoi)
    // przy semaforze – małe ramię (poziomo: „Stój”, wzniesione: sygnał zezwalający), przy tarczy – tarcza M1 / M2
    const mark = (side, what) => {
      if (typeof what === 'string') return text(cx + side * (what.length > 1 ? 17 : 13), py - 1, what, { class: `lever-pos${what.length > 1 ? ' small' : ''}` });
      const x = cx + side * 15, y = py - 1;
      if (what.arm != null) {
        return el('g', { class: `lever-pos glyph ${what.cls}`, transform: `rotate(${what.arm} ${x - 4} ${y})` }, [
          el('path', { class: 'sem-arm-body', d: `M${x - 4},${y - 0.9} L${x + 1.6},${y - 0.9} L${x + 1.6},${y + 0.9} L${x - 4},${y + 0.9} Z` }),
          el('circle', { class: 'sem-arm-body', cx: x + 2.6, cy: y, r: 1.6 }),
        ]);
      }
      const h = 3;
      return el('path', { class: `lever-pos glyph ${what.cls} shunt-disc`, d: `M${x},${y - h * what.k} L${x + h},${y} L${x},${y + h * what.k} L${x - h},${y} Z` });
    };
    const marks = {
      point: ['+', '−'], derailer: ['nał.', 'zdj.'],
      signal: [{ arm: 0, cls: 'stop' }, { arm: ARM_UP, cls: 'go' }],
      shunt: [{ k: 1, cls: 'm1' }, { k: DISC_FLAT * 2, cls: 'm2' }],
    }[l.kind];
    refs.pos = { normal: mark(-1, marks[0]), reversed: mark(1, marks[1]) };
    g.append(refs.pos.normal, refs.pos.reversed);
    refs.lock = el('rect', { class: 'lever-lock', x: cx - 6, y: py + 8, width: 12, height: 3, rx: 1 });
    refs.fault = el('circle', { class: 'lever-fault', cx: cx + 8, cy: py - 3, r: 2 });
    refs.pivot = [cx, py];
    g.append(refs.lock, refs.fault);
    g.appendChild(el('rect', { class: 'lever-plate', x: cx - 9, y: y1 + 63, width: 18, height: 9, rx: 1 }));
    g.appendChild(text(cx, y1 + 67.5, String(l.no), { class: 'plate-text' }));
    g.appendChild(text(cx, y1 + 78, l.id, { class: 'bench-label strong' }));
    g.appendChild(el('rect', { class: 'hit', x: cx - 11, y: y1 - 5, width: 22, height: 87 }));
    this.leverEls.set(l.id, refs);
    const name = { point: 'zwrotnicowa', derailer: 'wykolejnicowa', signal: 'semaforowa', shunt: 'tarczy manewrowej' }[l.kind];
    return this.#control(g, { kind: 'lever', id: l.id }, `Dźwignia ${l.no} ${name} ${l.id}`, () => {
      if (l.kind === 'point') { const p = this.ilk.points.get(l.id); return { type: 'point', id: l.id, position: p.target === '+' ? '-' : '+' }; }
      if (l.kind === 'derailer') { const d = this.ilk.derailers.get(l.id); return { type: 'derailer', id: l.id, position: d.target === 'on' ? 'off' : 'on' }; }
      const s = this.ilk.signals.get(l.id);
      return s.route && this.ilk.active.get(s.route)?.lever ? { type: 'stop', signal: l.id } : { type: 'clear', signal: l.id };
    });
  }

  /** Położenia dźwigni i drążków, okienka bloków. */
  updateLevers() {
    if (!this.leverEls) return;
    const st = leverStates(this.ilk, this.frame);
    for (const [id, r] of this.leverEls) {
      const s = st.levers[id];
      const [px, py] = r.pivot;
      turn(r.arm, [px, py], s.down ? LEVER_TILT : -LEVER_TILT);
      r.arm.parentNode.classList.toggle('down', s.down);
      r.arm.parentNode.classList.toggle('moving', s.moving);
      r.lock.classList.toggle('on', s.locked);
      r.fault.classList.toggle('on', s.fault);
      r.pos.normal.classList.toggle('on', !s.down);
      r.pos.reversed.classList.toggle('on', s.down);
    }
    for (const [id, r] of this.drazekEls) {
      const s = st.drazki[id];
      r.knob.style.transform = `translate(0px,${r.y[s.pos]}px)`;
      r.up?.classList.toggle('set', s.pos === 'up');
      r.down?.classList.toggle('set', s.pos === 'down');
      if (r.win) r.win.classList.toggle('white', s.blocked);
    }
  }

  /** Semafor, tarcza, zwrotnica i wykolejnica mają tu dźwignię – ją wskazuje samouczek. */
  elementFor(ref) {
    if (['signal', 'point', 'derailer'].includes(ref.kind)) return this.controlEls.get(refKey({ kind: 'lever', id: ref.id })) || null;
    return super.elementFor(ref);
  }

  blockPanelElement(exit) {
    return this.layerTiles.querySelector(`.block-cluster[data-exit="${exit}"]`) || null;
  }

  /** Plan świetlny: tylko zajętość (czerwona) i tor zamknięty; utwierdzenia przebiegu plan nie pokazuje. */
  updateSection(id) {
    const sec = this.ilk.sections.get(id);
    if (!sec) return;
    const st = sec.occupied ? 'red' : sec.closed ? 'yellow blink' : 'off';
    for (const { el: e, tile } of this.sectionRefs.get(id) || []) {
      setLamp(e, st);
      for (const sc of this.tileRefs.get(tile._key)?.screws || []) sc.classList.toggle('lit', st !== 'off');
    }
    for (const [ex, r] of this.blockRefs) if (r.outSection === id || r.inSection === id) this.updateBlock(ex);
    for (const p of this.ilk.points.values()) if (p.section === id) this.updatePoint(p.id);
  }

  /**
   * Zwrotnica na planie: zajętość (czerwona), rozprucie, a położenie – przygaszonym żółtym na ramieniu, w które jest
   * ustawiona, i przerwą w szczelinie drugiego ramienia (zamiast latarni zwrotnicowej widocznej w rzeczywistości przez okno nastawni – uproszczenie gry).
   */
  updatePoint(id) {
    const p = this.ilk.points.get(id);
    const r = this.pointRefs.get(id);
    if (!p || !r) return;
    const occ = this.ilk.sections.get(p.section)?.occupied;
    const pos = occ ? 'red' : 'pos';
    const known = p.control && !p.moving;
    setLamp(r.toe, p.trailed ? 'red blink' : occ ? 'red' : 'off');
    setLamp(r.straight, known && p.position === '+' ? pos : 'off');
    setLamp(r.diverge, known && p.position === '-' ? pos : 'off');
    // ramię, w które zwrotnica nie jest ustawiona: przerwa w szczelinie – ciemny pasek nie udaje ciągłego toru
    r.straight.classList.toggle('cut', known && p.position === '-');
    r.diverge.classList.toggle('cut', known && p.position === '+');
    setLamp(r.lockLamp, 'off');
    this.updateLevers();
  }

  updateDerailer(id) {
    setLamp(this.derailerRefs.get(id)?.derailerLamp, 'off');
    this.updateLevers();
  }

  /**
   * Powtarzacz semafora kształtowego: ramię górne wzniesione przy Sr2 i Sr3, dolne – przy Sr3; latarnia Sz; tarcza
   * manewrowa (M2 – obrócona do poziomu); tarcza ostrzegawcza wjazdowego wg `warning` (Od2 / Ot2 – do poziomu, Ot3 –
   * strzała ukośnie). Obrazy świetlne (bez `shapedSignals`) pokazuje tak samo – według znaczenia obrazu.
   */
  updateSignal(id) {
    const s = this.ilk.signals.get(id);
    const r = this.signalRefs.get(id);
    if (!s || !r) return;
    const a = s.aspect;
    const shunt = Interlocking.isShuntProceed(a);
    if (r.disc) tilt(r.disc, r.pivots.disc, shunt);
    if (s.kind === 'semafor') {
      const up = Interlocking.isProceed(a) && !shunt && a !== 'Sz';
      const arms = s.arms ?? 2;
      r.lower.style.display = arms === 2 ? '' : 'none';
      turn(r.upper, r.pivots.upper, up ? ARM_UP : 0);
      turn(r.lower, r.pivots.lower, up && Interlocking.aspectSpeed(a) <= 40 ? ARM_UP : ARM_HANG);
      if (r.sz) setLamp(r.sz, a === 'Sz' ? 'white blink' : 'off');
      if (r.warn) {
        const w = s.warning ?? Interlocking.warningAspect(a, arms);
        tilt(r.warn, r.pivots.warn, w === 'Od2' || w === 'Ot2');
        r.warnArrow.style.display = w.startsWith('Ot') ? '' : 'none';
        turn(r.warnArrow, r.pivots.warnArrow, w === 'Ot3' ? -45 : 0);
        r.warn.dataset.aspect = w;
      }
    }
    r.pic.dataset.aspect = a;
    this.updateLevers();
  }

  updateBlock(exitId) {
    updateBlockLamps(this, exitId);
  }

  /** Nastawnia nie ma uzbrajania przycisków; baza woła to na końcu odświeżania – wtedy ława. */
  updateArmed() {
    this.updateLevers();
  }

  createTrainLabel(tr) {
    return deskTrainLabel(tr);
  }

  placeTrainLabel(label, headTile) {
    placeDeskTrainLabel(this, label, headTile);
  }
}
