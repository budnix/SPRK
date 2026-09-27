import { viewHelp } from '../srk/views.js';
import { GLOSSARY } from '../data/glossary.js';
import { t } from '../i18n/index.js';

/** Okno pomocy – instrukcja obsługi stanowiska (część zależna od systemu srk) i zasad ruchu. */
export class Help {
  constructor(root, sim) {
    this.root = root;
    this.sim = sim;
    root.innerHTML = `<div class="modal-box">
      <button class="close" aria-label="${t('help.close')}">×</button>
      ${viewHelp(sim.srk)}
      <p class="muted">${t('help.station', { station: sim.station.name, srk: sim.srk.name, info: sim.station.srkInfo || '' })}</p>
      ${t('help.body')}
      <h3>${t('help.glossary')}</h3>
      <dl class="gloss">${Object.values(GLOSSARY).map((g) => `<dt>${g.name}</dt><dd>${g.text}</dd>`).join('')}</dl>
      <p class="muted">${t('help.footer')}</p>
    </div>`;
    root.querySelector('.close').addEventListener('click', () => this.hide());
    root.addEventListener('click', (e) => { if (e.target === root) this.hide(); });
  }

  toggle() { this.root.classList.toggle('hidden'); }
  hide() { this.root.classList.add('hidden'); }
}
