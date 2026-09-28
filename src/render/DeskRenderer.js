import { refKey } from './refKey.js';
import { PanelView } from './PanelView.js';
import * as art from './tileArt.js';
import { FRAME, setLamp, sectionLamp, buildDesk, bindDeskButtons, updateBlockLamps, updateSectionLamps, deskTrainLabel, placeDeskTrainLabel } from './deskParts.js';

/**
 * Pulpit kostkowy urządzeń przekaźnikowych typu E (SVG): plan półciemny – żółte szczeliny pokazują położenie
 * zwrotnic także w stanie zasadniczym, powtarzacze sygnalizatorów mają lampkę sygnału „Stój”, przyciski sygnałowe
 * zielone i białe. Buduje grafikę raz, potem zmienia tylko lampki i przyciski po zdarzeniach z symulacji.
 */
export class DeskRenderer extends PanelView {
  static PAD = FRAME;

  /**
   * @param container element DOM
   * @param sim Simulation
   * @param handlers { onPress(ref), onPull(ref) }
   */
  constructor(container, sim, handlers, opts = {}) {
    super(container, sim, handlers, opts, { className: 'desk' });
    this.FRAME = FRAME;
    buildDesk(this, art);
    bindDeskButtons(this, { pull: true });
    this.bindModel();
    this.refreshAll();
  }

  /** Kostki blokady liniowej szlaku – grupa do wskazania w samouczku. */
  blockPanelElement(exit) {
    return this.layerTiles.querySelector(`.block-cluster[data-exit="${exit}"]`) || null;
  }

  updateSection(id) {
    updateSectionLamps(this, id);
  }

  updatePoint(id) {
    const p = this.ilk.points.get(id);
    const r = this.pointRefs.get(id);
    if (!p || !r) return;
    const base = sectionLamp(this.ilk.sections.get(p.section));
    const state = base === 'off' ? 'yellow' : base;
    const lit = base !== 'off';
    if (p.moving || !p.control) {
      setLamp(r.toe, p.trailed ? 'red blink' : 'off');
      setLamp(r.straight, 'off'); setLamp(r.diverge, 'off');
    } else {
      // ostrze świeci tylko w przebiegu/zajętości; leg w położeniu – żółty (lub biały/czerwony)
      setLamp(r.toe, lit ? state : 'off');
      setLamp(r.straight, p.position === '+' ? state : 'off');
      setLamp(r.diverge, p.position === '-' ? state : 'off');
    }
    setLamp(r.lockLamp, p.individualLock ? 'white' : 'off');
  }

  updateDerailer(id) {
    const d = this.ilk.derailers.get(id);
    const r = this.derailerRefs.get(id);
    if (!d || !r) return;
    setLamp(r.derailerLamp, d.moving ? 'off' : (d.position === 'on' ? 'yellow' : 'white'));
    r.derailerBtn?.classList.toggle('locked', d.individualLock);
  }

  updateSignal(id) {
    const s = this.ilk.signals.get(id);
    const r = this.signalRefs.get(id);
    if (!s || !r) return;
    const a = s.aspect;
    if (s.kind === 'tm') {
      setLamp(r.lamps.blue, a === 'Ms2' ? 'off' : 'blue');
      setLamp(r.lamps.white, a === 'Ms2' ? 'white' : 'off');
      r.btnWhite?.classList.toggle('active', a === 'Ms2');
      return;
    }
    // Powtarzacz: lampki pomarańczowa / zielona / czerwona / biała (obrazy dwuświatłowe – uproszczenie)
    const map = {
      S1: { red: 'red' }, S2: { green: 'green' }, S3: { green: 'green blink' }, S4: { orange: 'orange blink' }, S5: { orange: 'orange' },
      S10: { orange: 'orange', green: 'green' }, S11: { orange: 'orange', green: 'green blink' }, S12: { orange: 'orange blink', green: 'green' },
      S13: { orange: 'orange' }, Sz: { red: 'red', white: 'white blink' }, Ms2: { white: 'white' },
    };
    const m = map[a] || {};
    for (const [c, e] of Object.entries(r.lamps)) setLamp(e, m[c] || 'off');
    r.btnGreen?.classList.toggle('active', s.route != null && a !== 'S1' && a !== 'Ms2');
    r.btnWhite?.classList.toggle('active', a === 'Ms2');
  }

  updateBlock(exitId) {
    updateBlockLamps(this, exitId);
  }

  updateArmed(a) {
    for (const e of this.controlEls.values()) e.classList.remove('armed');
    if (!a) return;
    this.controlEls.get(refKey(a))?.classList.add('armed');
  }

  createTrainLabel(tr) {
    return deskTrainLabel(tr);
  }

  placeTrainLabel(label, headTile) {
    placeDeskTrainLabel(this, label, headTile);
  }
}
