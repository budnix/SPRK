import { logoSvg } from './brand.js';
import { settingsCategories } from './settingsSchema.js';
import { t } from '../i18n/index.js';

function esc(s) { return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

/**
 * Ekran ustawień (pełny ekran w motywie ekranu startowego): kategorie po lewej, po prawej opcje z opisem działania.
 * Kontrolki (radia, suwak) podpina `Settings.bindMenu`, więc zmiana działa i zapisuje się natychmiast jak w dawnym menu.
 */
export class SettingsScreen {
  constructor(root, settings) {
    this.root = root;
    this.settings = settings;
    const cats = settingsCategories();
    this.cats = cats;
    root.innerHTML = `<div class="settings-screen">
      <header class="st-hero">
        <div class="st-logo">${logoSvg()}</div>
        <div class="st-tagline">${t('set.title')}</div>
        <div class="st-sub">${t('set.sub')}</div>
        <button type="button" class="tb st-close" id="se-close">${t('set.back')}</button>
      </header>
      <div class="se-layout">
        <nav class="se-nav" aria-label="${t('set.nav')}">
          ${cats.map((c, i) => `<button type="button" class="se-cat${i === 0 ? ' active' : ''}" data-cat="${c.id}"><span class="st-kicker">${esc(c.kicker)}</span>${esc(c.title)}</button>`).join('')}
        </nav>
        <div class="se-content">
          ${cats.map((c) => `<section class="se-section" id="se-${c.id}" data-cat="${c.id}">
            <h3><span class="st-kicker">${esc(c.kicker)}</span>${esc(c.title)}</h3>
            <p class="se-intro">${esc(c.intro)}</p>
            ${c.options.map((o) => `<div class="se-option" data-key="${o.key}">
              <div class="se-otitle">${esc(o.title)}${o.reload ? ` <span class="se-tag">${t('set.reload')}</span>` : ''}</div>
              <p class="se-desc">${esc(o.description)}</p>
              ${o.type === 'range'
                ? `<label class="range se-range"><input type="range" id="${o.key}" name="${o.key}" min="${o.range.min}" max="${o.range.max}" step="${o.range.step}"> <output for="${o.key}">100%</output></label>`
                : o.type === 'select'
                ? `<select class="se-select" id="${o.key}" name="${o.key}" aria-label="${esc(o.title)}">${o.choices.map((ch) => `<option value="${esc(ch.value)}">${esc(ch.label)}${ch.hint ? ` – ${esc(ch.hint)}` : ''}</option>`).join('')}</select>`
                : `<div class="se-choices">${o.choices.map((ch) => `<label class="se-choice"><input type="radio" name="${o.key}" value="${esc(ch.value)}"><span class="se-clabel">${esc(ch.label)}</span>${ch.hint ? `<span class="se-chint">${esc(ch.hint)}</span>` : ''}</label>`).join('')}</div>`}
            </div>`).join('')}
          </section>`).join('')}
        </div>
      </div>
    </div>`;
    settings.bindMenu(root);
    root.querySelector('#se-close').addEventListener('click', () => this.hide());
    root.addEventListener('click', (e) => { if (e.target === root) this.hide(); });
    const content = root.querySelector('.se-content');
    for (const b of root.querySelectorAll('.se-cat')) {
      b.addEventListener('click', () => {
        const sec = root.querySelector(`#se-${b.dataset.cat}`);
        this.pinnedUntil = Date.now() + 800; // wybór z listy ma pierwszeństwo, dopóki przewijanie nie ustanie
        content.scrollTo({ top: sec.offsetTop - content.offsetTop, behavior: 'smooth' });
        this.#activate(b.dataset.cat);
      });
    }
    content.addEventListener('scroll', () => {
      if (Date.now() < (this.pinnedUntil || 0)) return;
      const top = content.scrollTop + 40;
      let cur = cats[0].id;
      for (const s of root.querySelectorAll('.se-section')) if (s.offsetTop - content.offsetTop <= top) cur = s.dataset.cat;
      this.#activate(cur);
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !root.classList.contains('hidden')) this.hide(); });
  }

  #activate(id) { for (const b of this.root.querySelectorAll('.se-cat')) b.classList.toggle('active', b.dataset.cat === id); }

  show() { this.root.classList.remove('hidden'); }
  hide() { this.root.classList.add('hidden'); }
  toggle() { this.root.classList.toggle('hidden'); }
}
