import { refKey } from './refKey.js';
import { PanelView } from './PanelView.js';
import * as art from './izhArt.js';
import { FRAME, setLamp, sectionLamp, buildDesk, bindDeskButtons, updateBlockLamps, updateSectionLamps, deskTrainLabel, placeDeskTrainLabel } from './deskParts.js';
import { ORDERS } from '../srk/address.js';

/**
 * Pulpit urządzeń przekaźnikowych typu IZH-111 (SVG): pulpit ciemny – lampki kontrolne w stanie zasadniczym są
 * wygaszone. Szczeliny zwrotnic świecą po wybraniu przycisku adresowego, przy zamknięciu zwrotnicy oraz przy
 * utwierdzeniu lub zajętości odcinka; powtarzacz bez lampki „Stój” – ciemny znaczy sygnał zabraniający.
 * Obsługa: przycisk adresowy elementu i przycisk rozkazu (grupa rozkazów poza obrazem układu torowego).
 *
 * Przyjęte (źródła nie podają): barwa szczelin zwrotnicy pokazującej położenie – biała; sygnał zastępczy – biała
 * lampka migająca.
 */
export class IzhRenderer extends PanelView {
  static PAD = FRAME;

  constructor(container, sim, handlers, opts = {}) {
    super(container, sim, handlers, opts, { className: 'desk izh' });
    this.orderButtons = new Map();
    buildDesk(this, art);
    if (!this.readonly) this.#buildOrders(opts.cmdHost || container);
    bindDeskButtons(this, { pull: false });
    this.bindModel();
    this.refreshAll();
  }

  /** Grupa przycisków rozkazów; rozkaz z licznikiem (Sz) pokazuje jego stan. */
  #buildOrders(host) {
    const bar = document.createElement('div');
    bar.className = 'izh-orders';
    for (const o of ORDERS) {
      const b = document.createElement('button');
      b.type = 'button'; b.dataset.order = o.id; b.textContent = o.id === '-' ? '−' : o.id;
      b.title = o.name;
      b.setAttribute('aria-label', `${o.id} – ${o.name}`);
      b.addEventListener('click', () => this.handlers.onPress({ kind: 'order', id: o.id }));
      bar.appendChild(b);
      this.orderButtons.set(o.id, b);
      if (o.counter) {
        const c = document.createElement('span');
        c.className = 'izh-counter'; c.dataset.counter = o.id;
        bar.appendChild(c);
        this.counterRefs.set(o.id, c);
      }
    }
    host.appendChild(bar);
    this.cmdBar = bar;
  }

  /** Przycisk rozkazu (np. 'P') – do wskazywania w samouczku. */
  cmdButton(id) {
    return this.orderButtons.get(id) || null;
  }

  blockPanelElement(exit) {
    return this.layerTiles.querySelector(`.block-cluster[data-exit="${exit}"]`) || null;
  }

  #selected(kind, id) {
    return !!this.ilk.armed?.selection?.some((r) => r.kind === kind && r.id === id);
  }

  updateSection(id) {
    updateSectionLamps(this, id);
  }

  updatePoint(id) {
    const p = this.ilk.points.get(id);
    const r = this.pointRefs.get(id);
    if (!p || !r) return;
    const base = sectionLamp(this.ilk.sections.get(p.section));
    const lit = base !== 'off';
    // pulpit ciemny: położenie widać po wybraniu adresu, przy zamknięciu oraz przy utwierdzeniu lub zajętości
    const show = lit || p.individualLock || this.#selected('point', id);
    const state = lit ? base : 'white';
    if (p.trailed) {
      for (const leg of [r.toe, r.straight, r.diverge]) setLamp(leg, 'red blink');      // rozprucie
    } else if (p.moving) {
      for (const leg of [r.toe, r.straight, r.diverge]) setLamp(leg, 'off');
    } else if (!p.control) {
      setLamp(r.toe, 'off'); setLamp(r.straight, 'white blink'); setLamp(r.diverge, 'white blink'); // niespodziewany brak kontroli
    } else {
      setLamp(r.toe, lit ? state : 'off');
      setLamp(r.straight, show && p.position === '+' ? state : 'off');
      setLamp(r.diverge, show && p.position === '-' ? state : 'off');
    }
    setLamp(r.lockLamp, p.individualLock ? 'red' : 'off'); // zamknięcie przyciskiem STOP
  }

  updateDerailer(id) {
    const d = this.ilk.derailers.get(id);
    const r = this.derailerRefs.get(id);
    if (!d || !r) return;
    const show = d.individualLock || this.#selected('derailer', id) || sectionLamp(this.ilk.sections.get(d.section)) !== 'off';
    setLamp(r.derailerLamp, d.moving || !show ? 'off' : (d.position === 'on' ? 'yellow' : 'white'));
    r.derailerBtn?.classList.toggle('locked', d.individualLock);
  }

  updateSignal(id) {
    const s = this.ilk.signals.get(id);
    const r = this.signalRefs.get(id);
    if (!s || !r) return;
    const a = s.aspect;
    const stop = a === 'S1' || a === 'Ms1';
    setLamp(r.lamps.green, !stop && a !== 'Ms2' && a !== 'Sz' ? 'green' : 'off');
    setLamp(r.lamps.white, a === 'Ms2' ? 'white' : a === 'Sz' ? 'white blink' : 'off');
    // lampka kontrolna przy przycisku sygnalizatora końcowego miga podczas zwalniania czasowego przebiegu
    const timed = [...this.ilk.active.values()].some((act) => act.timedRelease && act.route.endButton === id);
    // sygnalizator zamknięty rozkazem STOP – lampka miga na czerwono (do odwołania rozkazem Zw)
    setLamp(r.ctl, s.stopped ? 'red blink' : timed ? 'white blink' : 'off');
    r.btn.classList.toggle('active', !stop);
  }

  updateBlock(exitId) {
    updateBlockLamps(this, exitId);
  }

  /** Wybrane przyciski adresowe (jeden albo dwa – początek i koniec przebiegu). */
  updateArmed(a) {
    for (const e of this.controlEls.values()) e.classList.remove('armed');
    for (const ref of a?.selection || []) this.controlEls.get(refKey(ref))?.classList.add('armed');
    for (const id of this.pointRefs.keys()) this.updatePoint(id);
    for (const id of this.derailerRefs.keys()) this.updateDerailer(id);
    this.cmdBar?.classList.toggle('ready', !!a);
  }

  createTrainLabel(tr) {
    return deskTrainLabel(tr);
  }

  placeTrainLabel(label, headTile) {
    placeDeskTrainLabel(this, label, headTile);
  }
}
