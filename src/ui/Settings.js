/**
 * Ustawienia interfejsu (zapisywane w localStorage):
 *  - deskPos: położenie pulpitu w pionie ('top' | 'middle' | 'bottom')
 *  - sidePos: położenie panelu bocznego ('right' | 'left' | 'bottom')
 *  - theme: motyw interfejsu ('dark' | 'light'); kostki pulpitu są niezależne od motywu
 *  - symScale: skala symboli i napisów monitora ('1'…'1.5'), rowScale: odstęp rzędów monitora ('1' | '0.7')
 *  - screens: podział szerokiego pulpitu na ekrany wg szerokości okna ('auto' | 'off')
 *  - sideCollapsed: panel boczny zwinięty (pulpit na całym ekranie, powiadomienia w listwie narzędzi)
 *  - srk: stanowisko obsługi ('auto' = wg definicji stacji | id strategii z src/srk/registry.js)
 */
const KEY = 'sprk.settings';
const DEFAULTS = { deskPos: 'middle', sidePos: 'right', theme: 'dark', srk: 'auto', sideCollapsed: false, screens: 'auto', symScale: '1', rowScale: '1' };

export class Settings {
  constructor(onChange) {
    this.onChange = onChange;
    this.values = { ...DEFAULTS, ...Settings.load() };
    this.apply();
  }

  static load() {
    try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; }
  }

  save() {
    try { localStorage.setItem(KEY, JSON.stringify(this.values)); } catch { /* prywatny tryb – ignoruj */ }
  }

  set(key, value) {
    if (!(key in DEFAULTS)) return;
    this.values[key] = value;
    this.save();
    this.apply();
    this.onChange?.(key, value);
  }

  apply() {
    const app = document.getElementById('app');
    app.dataset.deskPos = this.values.deskPos;
    app.dataset.sidePos = this.values.sidePos;
    app.dataset.sideCollapsed = String(!!this.values.sideCollapsed);
    document.documentElement.dataset.theme = this.values.theme;
  }

  /** Podpina menu (radia) pod ustawienia. */
  bindMenu(menuEl) {
    for (const input of menuEl.querySelectorAll('input[type=radio]')) {
      input.checked = String(this.values[input.name]) === input.value;
      input.addEventListener('change', () => { if (input.checked) this.set(input.name, input.value); });
    }
    for (const input of menuEl.querySelectorAll('input[type=range]')) {
      const out = menuEl.querySelector(`output[for="${input.id}"]`);
      const show = () => { if (out) out.textContent = `${Math.round(Number(input.value) * 100)}%`; };
      input.value = this.values[input.name]; show();
      input.addEventListener('input', () => { show(); this.set(input.name, input.value); });
    }
  }
}
