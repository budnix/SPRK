import { refKey } from './refKey.js';
import { PanelView } from './PanelView.js';
import * as art from './tileArt.js';
import { FRAME, setLamp, sectionLamp, buildDesk, bindDeskButtons, updateBlockLamps, updateSectionLamps, deskTrainLabel, placeDeskTrainLabel } from './deskParts.js';
import { repeaterLamps } from '../tiles/repeater.js';

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
    // lampka położenia świeci tylko przy wykolejnicy zdjętej, na żółto (ISDR 2.3.2.2.1.2) – biel na pulpicie to utwierdzenie
    setLamp(r.derailerLamp, !d.moving && d.position === 'off' ? 'yellow' : 'off');
    r.derailerBtn?.classList.toggle('locked', d.individualLock);
  }

  updateSignal(id) {
    const s = this.ilk.signals.get(id);
    const r = this.signalRefs.get(id);
    if (!s || !r) return;
    const a = s.aspect;
    // powtarzacz typowy dla pulpitów typu E: jedna zielona lampka dla sygnałów zezwalających (src/tiles/repeater.js)
    const m = repeaterLamps(a, s.kind);
    for (const [c, e] of Object.entries(r.lamps)) setLamp(e, m[c] || 'off');
    if (s.kind === 'tm') {
      r.btnWhite?.classList.toggle('active', a === 'Ms2');
      return;
    }
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
