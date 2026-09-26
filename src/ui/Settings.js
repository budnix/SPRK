/**
 * Ustawienia interfejsu (zapisywane w localStorage):
 *  - deskPos: położenie pulpitu w pionie ('top' | 'middle' | 'bottom')
 *  - sidePos: położenie panelu bocznego ('right' | 'left' | 'bottom')
 *  - theme: motyw interfejsu ('dark' | 'light'); kostki pulpitu są niezależne od motywu
 */
const KEY = 'sprk.settings';
const DEFAULTS = { deskPos: 'middle', sidePos: 'right', theme: 'dark' };

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
    document.documentElement.dataset.theme = this.values.theme;
  }

  /** Podpina menu (radia) pod ustawienia. */
  bindMenu(menuEl) {
    for (const input of menuEl.querySelectorAll('input[type=radio]')) {
      input.checked = this.values[input.name] === input.value;
      input.addEventListener('change', () => { if (input.checked) this.set(input.name, input.value); });
    }
  }
}
