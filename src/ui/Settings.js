/**
 * Ustawienia interfejsu (zapisywane w localStorage):
 *  - deskPos: położenie pulpitu w pionie ('top' | 'middle' | 'bottom')
 *  - sidePos: położenie panelu bocznego ('right' | 'left' | 'bottom', domyślnie 'bottom')
 *  - theme: motyw interfejsu ('system' = wg systemu operacyjnego | 'dark' | 'light'); kostki pulpitu są niezależne od motywu
 *  - symScale: skala symboli i napisów monitora ('1'…'1.5', domyślnie '1.25'), rowScale: odstęp rzędów monitora ('1' | '0.7')
 *  - screens: podział szerokiego pulpitu na ekrany wg szerokości okna ('auto' | 'off')
 *  - sideCollapsed: panel boczny zwinięty (pulpit na całym ekranie, powiadomienia w listwie narzędzi)
 *  - edgePanels: stałe pola skrajne z blokadą po powiększeniu pulpitu ('on' | 'off', domyślnie 'off')
 *  - lang: język interfejsu ('auto' = wg przeglądarki | 'pl' | 'en' | 'de'); zmiana przeładowuje widok
 */
const KEY = 'sprk.settings';
/** Ustawienia domyślne (nowy użytkownik): pulpit na środku, motyw wg systemu, panel na dole, podział na ekrany, symbole 125 %. Stanowisko (srk) nie jest ustawieniem – wynika z definicji stacji/scenariusza. */
export const DEFAULTS = { deskPos: 'middle', sidePos: 'bottom', theme: 'system', sideCollapsed: false, screens: 'auto', symScale: '1.25', rowScale: '1', edgePanels: 'off', lang: 'auto' };

export class Settings {
  constructor(onChange) {
    this.onChange = onChange;
    this.values = { ...DEFAULTS, ...Settings.load() };
    this.apply();
    // motyw „wg systemu”: reaguj na zmianę trybu jasny/ciemny w systemie
    const mq = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null;
    mq?.addEventListener?.('change', () => { if (this.values.theme === 'system') this.apply(); });
  }

  /** Motyw do zastosowania: jawny lub wg systemu operacyjnego. */
  static resolveTheme(theme, prefersDark = typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches) {
    return theme === 'dark' || theme === 'light' ? theme : (prefersDark ? 'dark' : 'light');
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
    document.documentElement.dataset.theme = Settings.resolveTheme(this.values.theme);
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
