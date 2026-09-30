import { el, text, CELL } from './svg.js';
import { refKey } from './refKey.js';
import { PanelView } from './PanelView.js';
import * as art from './leverArt.js';
import { counterDevice } from './tileArt.js';
import { FRAME, setLamp, buildDesk, bindDeskButtons, updateBlockLamps, deskTrainLabel, placeDeskTrainLabel } from './deskParts.js';
import { leverFrame, leverStates, signalLevers } from './leverFrame.js';
import { Interlocking } from '../model/Interlocking.js';

/** Wysokość ławy (aparat blokowy, drążki, dźwignie) w rzędach kostek – pod planem świetlnym. */
export const LEVER_ROWS = 8;
/** Skala elementów ławy względem kostek planu – dźwignie i drążki muszą dać się trafić palcem. */
const K = 1.25;
/**
 * Dźwignia nastawcza z boku: w położeniu zasadniczym jest górna, nachylona o 38° od pionu; przełożona obraca się
 * o 180° i zwisa w dół (transportszynowy.pl „Urządzenia mechaniczne scentralizowane”; Ie-8 §6).
 */
const LEVER_TILT = 38;
const LEVER_NORMAL = -LEVER_TILT;
const LEVER_REVERSED = 180 - LEVER_TILT;
/** Oś dźwigni i długość ramienia (oś – koniec rękojeści) w jednostkach ławy. */
const LEVER_AXIS = 180;
const LEVER_LEN = 49;
/** Położenia rączki drążka przebiegowego w szczelinie: skrajne, pośrednie (w połowie drogi) i zasadnicze. */
const DRAZEK_Y = { up: 61, 'up-half': 70.5, null: 80, 'down-half': 89.5, down: 99 };

/**
 * Wzniesienie ramienia semafora kształtowego (Ie-1: 45° do poziomu); dolne ramię w spoczynku stoi pionowo w górę od
 * swojej osi (rysunki Sr1 / Sr2 semafora dwuramiennego), przy Sr3 obraca się o 45°.
 */
const ARM_UP = -45;
const ARM_REST = -90;
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
    bench.appendChild(el('rect', { class: 'bench-block', x: 6, y: y0 + 4, width: W - 12, height: 116, rx: 2 }));
    bench.appendChild(text(12, y0 + 11, 'APARAT BLOKOWY · DRĄŻKI PRZEBIEGOWE', { class: 'bench-title', 'text-anchor': 'start' }));
    bench.appendChild(text(12, y0 + 130, 'DŹWIGNIE NASTAWCZE', { class: 'bench-title', 'text-anchor': 'start' }));
    this.inner.insertBefore(bench, this.layerTrains);

    // drążki przebiegowe z blokiem przebiegowym utwierdzającym (przebiegi pociągowe) nad nimi
    const nd = this.frame.drazki.length;
    const sd = Math.min(84, (W * 0.66) / Math.max(nd, 1));
    this.frame.drazki.forEach((d, i) => bench.appendChild(this.#drazek(d, 26 + i * sd + sd / 2 - 14, y0)));

    // klawisze sygnału zastępczego i liczniki (Sz, zwalniacz) po prawej
    const sz = [...this.ilk.signals.values()].filter((s) => s.kind === 'semafor' && s.canSubstitute);
    let x = W - 16 - sz.length * 30 - 90;
    for (const s of sz) {
      const g = el('g', { class: 'sz-key' }, [
        el('rect', { class: 'key', x: x, y: y0 + 28, width: 22, height: 12, rx: 2 }),
        text(x + 11, y0 + 35, 'Sz', { class: 'key-text' }),
        text(x + 11, y0 + 50, s.id, { class: 'bench-label' }),
        el('rect', { class: 'hit', x: x - 2, y: y0 + 26, width: 26, height: 30 }), // klawisz razem z podpisem
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
    this.frame.levers.forEach((l, i) => bench.appendChild(this.#lever(l, 32 + i * sl + sl / 2, y0 + LEVER_AXIS)));
  }

  #drazek(d, cx, y0) {
    const g = el('g', { class: `drazek drazek-${d.kind}`, 'data-drazek': d.id });
    const ref = { kind: 'drazek', id: d.id };
    this.controlEls.set(refKey(ref), g);
    const refs = {};
    const train = d.kind === 'train';
    if (train) {
      // blok przebiegowy utwierdzający (Ie-8 §9 ust. 3): klawisz na górnej płaszczyźnie skrzyni, na ścianie czołowej
      // pod nim okienko, obok okienka zwalniacz z plombą, pod okienkiem tabliczka z nazwą bloku
      g.appendChild(this.#control(el('g', { class: 'blk-key' }, [
        el('rect', { class: 'key', x: cx - 8, y: y0 + 19, width: 16, height: 9, rx: 1.5 }),
        el('rect', { class: 'hit', x: cx - 11, y: y0 + 17, width: 22, height: 13 }),
      ]), { kind: 'routeblock', id: d.start }, `Blok przebiegowy ${d.start}`, () => ({ type: 'route-block', signal: d.start })));
      refs.win = el('rect', { class: 'blk-window', x: cx - 9, y: y0 + 32, width: 18, height: 11, rx: 1.5 });
      g.appendChild(refs.win);
      g.appendChild(el('rect', { class: 'blk-plate', x: cx - 9, y: y0 + 45, width: 18, height: 7, rx: 0.8 }));
      g.appendChild(text(cx, y0 + 48.6, d.start, { class: 'plate-text small' }));
      g.appendChild(this.#control(el('g', { class: 'zwalniacz' }, [
        el('circle', { class: 'zw-seal', cx: cx + 15, cy: y0 + 37.5, r: 3 }),
        el('circle', { class: 'hit', cx: cx + 15, cy: y0 + 37.5, r: 6 }),
      ]), { kind: 'routerelease', id: d.start }, `Zwalniacz bloku przebiegowego ${d.start}`, () => ({ type: 'release', signal: d.start, emergency: true })));
    }
    // drążek: szczelina; rączka w górze / w dole (przebieg), w połowie drogi (położenie pośrednie) albo na środku
    g.appendChild(el('rect', { class: 'drazek-slot', x: cx - 2.5, y: y0 + 58, width: 5, height: 44, rx: 2.5 }));
    // rączka drążka: płaski uchwyt w poprzek szczeliny
    refs.knob = el('g', { class: 'drazek-knob' }, [
      el('rect', { class: 'drazek-grip', x: cx - 7, y: -2.5, width: 14, height: 5, rx: 2 }),
      el('circle', { class: 'drazek-pin', cx, cy: 0, r: 1.3 }),
    ]);
    g.appendChild(text(cx, y0 + 111, d.id, { class: 'bench-label strong' }));
    refs.y = Object.fromEntries(Object.entries(DRAZEK_Y).map(([k, v]) => [k, y0 + v]));
    for (const r of d.routes) {
      const up = r.pos === 'up';
      // przełożenie do końca: prawa strona szczeliny, przy nazwie celu
      const full = el('g', { class: `drazek-pos drazek-${r.pos}` }, [
        el('rect', { class: 'hit', x: cx - 3, y: y0 + (up ? 55 : 82), width: 36, height: 23 }),
        text(cx + 10, y0 + DRAZEK_Y[r.pos], r.target, { class: 'bench-label target', 'text-anchor': 'start' }),
      ]);
      refs[r.pos] = full;
      g.appendChild(this.#control(full, { kind: 'route', id: r.id }, `Drążek ${d.id}: ${d.start} → ${r.target}`, () => {
        const sig = this.ilk.signals.get(d.start);
        return sig.route === r.id ? { type: 'release', signal: d.start } : { type: 'route', id: r.id };
      }));
      if (!train) continue;
      // położenie pośrednie (Ie-8 §21 ust. 14–15): lewa strona szczeliny, kreska w połowie drogi rączki
      const hy = y0 + DRAZEK_Y[`${r.pos}-half`];
      const half = el('g', { class: `drazek-half drazek-${r.pos}-half` }, [
        el('rect', { class: 'hit', x: cx - 25, y: y0 + (up ? 58 : 82), width: 22, height: 20 }),
        el('path', { class: 'half-tick', d: `M${cx - 9},${hy} L${cx - 3.5},${hy}` }),
        text(cx - 15, hy, '½', { class: 'bench-label half-mark' }),
      ]);
      refs[`${r.pos}-half`] = half;
      g.appendChild(this.#control(half, { kind: 'routehalf', id: r.id }, `Drążek ${d.id} w położenie pośrednie: ${d.start} → ${r.target} (zamyka zwrotnice, bez sygnału)`, () => (
        this.ilk.half.get(d.start)?.id === r.id ? { type: 'release', signal: d.start } : { type: 'route-half', id: r.id })));
    }
    g.appendChild(refs.knob); // rączka nad polami trafienia i kreskami
    this.drazekEls.set(d.id, refs);
    return g;
  }

  /**
   * Dźwignia nastawcza z boku (Ie-8 §6 ust. 3): koziołek z dwoma wycięciami (położenie zasadnicze i przełożone),
   * tarcza linkowa na osi, trzon w barwie rodzaju dźwigni, na końcu rękojeść i uchwyt pręta zapadkowego. W położeniu
   * zasadniczym dźwignia jest górna (nachylona w lewo), przełożona – obrócona o 180°, zwisa w dół. (cx, py) – oś.
   */
  #lever(l, cx, py) {
    const g = el('g', { class: `lever lever-${l.kind}`, 'data-lever': l.id });
    const refs = {};
    // koziołek: tarcza z wycięciami zapadki w obu skrajnych położeniach
    const arc = (deg, r) => [cx + r * Math.sin((deg * Math.PI) / 180), py - r * Math.cos((deg * Math.PI) / 180)];
    g.appendChild(el('circle', { class: 'lever-sector', cx, cy: py, r: 11 }));
    for (const deg of [LEVER_NORMAL, LEVER_REVERSED]) { const [nx, ny] = arc(deg, 9.2); g.appendChild(el('circle', { class: 'lever-notch', cx: nx, cy: ny, r: 1.3 })); }
    // ramię narysowane pionowo w górę od osi: trzon, pręt zapadkowy, uchwyt zapadki i rękojeść – obracane wokół osi
    const top = py - LEVER_LEN;
    refs.arm = el('g', { class: 'lever-arm' }, [
      el('rect', { class: 'lever-rod', x: cx - 2.2, y: top + 9, width: 4.4, height: LEVER_LEN - 9, rx: 1.2 }),
      el('path', { class: 'lever-catch-rod', d: `M${cx + 3.2},${top + 17} L${cx + 3.2},${py - 10}` }),
      el('rect', { class: 'lever-catch', x: cx + 1.8, y: top + 8, width: 3, height: 10, rx: 1.2 }),
      el('rect', { class: 'lever-grip', x: cx - 3.2, y: top, width: 6.4, height: 13, rx: 2.6 }),
    ]);
    g.appendChild(refs.arm);
    g.appendChild(el('circle', { class: 'lever-drum', cx, cy: py, r: 6 }));
    g.appendChild(el('circle', { class: 'lever-axle', cx, cy: py, r: 1.6 }));
    // oznaczenia położeń po obu stronach koziołka: lewo – zasadnicze, prawo – przełożone (świeci to, w którym dźwignia stoi)
    // przy semaforze – małe ramię (poziomo: „Stój”, wzniesione: sygnał zezwalający), przy tarczy – tarcza M1 / M2
    const mark = (side, what) => {
      if (typeof what === 'string') return text(cx + side * (what.length > 1 ? 19 : 16), py - 1, what, { class: `lever-pos${what.length > 1 ? ' small' : ''}` });
      const x = cx + side * 17, y = py - 1;
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
    // zamknięcie dźwigni drążkiem – ciemna listwa nad tabliczką; usterka – czerwona kropka przy osi
    refs.lock = el('rect', { class: 'lever-lock', x: cx - 6, y: py + 39.5, width: 12, height: 3, rx: 1 });
    refs.fault = el('circle', { class: 'lever-fault', cx: cx + 10, cy: py - 11, r: 2 });
    refs.pivot = [cx, py];
    g.append(refs.lock, refs.fault);
    g.appendChild(el('rect', { class: 'lever-plate', x: cx - 9, y: py + 44, width: 18, height: 9, rx: 1 }));
    g.appendChild(text(cx, py + 48.5, String(l.no), { class: 'plate-text' }));
    g.appendChild(text(cx, py + 59.5, l.id, { class: 'bench-label strong' }));
    g.appendChild(el('rect', { class: 'hit', x: cx - 13, y: py - LEVER_LEN - 1, width: 26, height: LEVER_LEN + 65 }));
    this.leverEls.set(l.id, refs);
    const name = { point: 'zwrotnicowa', derailer: 'wykolejnicowa', signal: 'semaforowa', shunt: 'tarczy manewrowej' }[l.kind];
    return this.#control(g, { kind: 'lever', id: l.id }, `Dźwignia ${l.no} ${name} ${l.id}${l.aspect ? ` (${l.aspect})` : ''}`, () => {
      if (l.kind === 'point') { const p = this.ilk.points.get(l.id); return { type: 'point', id: l.id, position: p.target === '+' ? '-' : '+' }; }
      if (l.kind === 'derailer') { const d = this.ilk.derailers.get(l.id); return { type: 'derailer', id: l.id, position: d.target === 'on' ? 'off' : 'on' }; }
      // dźwignia przełożona – na „Stój”; inaczej sygnał zezwalający (semafor rozprzężony: obraz tej dźwigni)
      const down = leverStates(this.ilk, this.frame).levers[l.id].down;
      return down ? { type: 'stop', signal: l.signal } : { type: 'clear', signal: l.signal, ...(l.aspect ? { aspect: l.aspect } : {}) };
    });
  }

  /** Położenia dźwigni i drążków, okienka bloków. */
  updateLevers() {
    if (!this.leverEls) return;
    const st = leverStates(this.ilk, this.frame);
    for (const [id, r] of this.leverEls) {
      const s = st.levers[id];
      const [px, py] = r.pivot;
      turn(r.arm, [px, py], s.down ? LEVER_REVERSED : LEVER_NORMAL);
      r.arm.parentNode.classList.toggle('down', s.down);
      r.arm.parentNode.classList.toggle('moving', s.moving);
      r.lock.classList.toggle('on', s.locked);
      r.fault.classList.toggle('on', s.fault);
      r.pos.normal.classList.toggle('on', !s.down);
      r.pos.reversed.classList.toggle('on', s.down);
    }
    for (const [id, r] of this.drazekEls) {
      const s = st.drazki[id];
      const where = s.pos && s.half ? `${s.pos}-half` : s.pos;
      r.knob.style.transform = `translate(0px,${r.y[where]}px)`;
      r.knob.dataset.pos = String(where);
      for (const k of ['up', 'down', 'up-half', 'down-half']) r[k]?.classList.toggle('set', where === k);
      if (r.win) r.win.classList.toggle('white', s.blocked);
    }
  }

  /**
   * Semafor, tarcza, zwrotnica i wykolejnica mają tu dźwignię – ją wskazuje samouczek. Semafor rozprzężony ma dwie:
   * wskazywana jest ta, której wymaga przebieg zamknięty drążkiem (bez przebiegu – pierwsza).
   */
  elementFor(ref) {
    const lever = (id) => this.controlEls.get(refKey({ kind: 'lever', id })) || null;
    if (ref.kind === 'signal' || (ref.kind === 'lever' && !lever(ref.id))) {
      const l = signalLevers(this.ilk, this.frame, ref.id)[0];
      if (l) return lever(l.id);
    }
    if (['point', 'derailer'].includes(ref.kind)) return lever(ref.id);
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
      const lit = sec.occupied && !this.ilk.onSetBranch(tile) ? 'off' : st; // łącznica poza drogą – ciemna
      setLamp(e, lit);
      for (const sc of this.tileRefs.get(tile._key)?.screws || []) sc.classList.toggle('lit', lit !== 'off');
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
      r.lower.style.display = r.lowerHub.style.display = arms === 2 ? '' : 'none';
      turn(r.upper, r.pivots.upper, up ? ARM_UP : 0);
      turn(r.lower, r.pivots.lower, up && Interlocking.aspectSpeed(a) <= 40 ? ARM_UP : ARM_REST);
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
