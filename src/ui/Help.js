import { viewHelp } from '../srk/views.js';
import { GLOSSARY } from '../data/glossary.js';
import { t } from '../i18n/index.js';
import { logoSvg } from './brand.js';
import { escapeHtml } from './dom.js';
import { initDialog, openDialog, closeDialog, isOpen } from './dialog.js';

/**
 * Instrukcja obsługi stanowiska (część zależna od systemu srk) i zasad ruchu – pełny ekran w tym samym układzie
 * co ustawienia i raport: nagłówek z logo, przycisk powrotu, treść na kartach.
 */
export class Help {
  constructor(root, sim) {
    this.root = root;
    this.sim = sim;
    initDialog(root, t('top.help'));
    root.innerHTML = `<div class="help-screen">
      <header class="st-hero">
        <div class="st-logo">${logoSvg()}</div>
        <div class="st-tagline">${t('top.help')}</div>
        <div class="st-sub">${escapeHtml(sim.station.name)} · ${escapeHtml(sim.srk.name)}</div>
        <button type="button" class="tb st-close close">${t('set.back')}</button>
      </header>
      <section class="help-section">
        ${viewHelp(sim.srk)}
        <p class="muted">${t('help.station', { station: sim.station.name, srk: sim.srk.name, info: sim.station.srkInfo || '' })}</p>
      </section>
      <section class="help-section">${t('help.body')}</section>
      <section class="help-section">
        <h3>${t('help.glossary')}</h3>
        <dl class="gloss">${Object.values(GLOSSARY).map((g) => `<dt>${g.name}</dt><dd>${g.text}</dd>`).join('')}</dl>
        <p class="muted">${t('help.footer')}</p>
      </section>
    </div>`;
    root.querySelector('.close').addEventListener('click', () => this.hide());
  }

  toggle() { if (isOpen(this.root)) this.hide(); else this.show(); }
  show() { openDialog(this.root); }
  hide() { closeDialog(this.root); }
}
