import { ScreenBase } from './ScreenBase.js';
import { createConfirmBar } from './confirmBar.js';
import { t } from '../i18n/index.js';
import { escapeHtml } from '../ui/dom.js';
import { Clock } from '../core/Clock.js';
import { PanelView } from './PanelView.js';

/**
 * Stanowisko komputerowe MOR-3 z pulpitem MOR-1: obraz wg Ie-104 ze `ScreenBase`, obsługa menu obiektów (protokół
 * `src/srk/mor.js`).
 *
 *  - Kliknięcie obiektu (palec – dotknięcie) – fioletowa obwódka i menu poleceń; polecenia fioletowe wymagają
 *    potwierdzenia, czerwone są specjalne (potwierdzenie i licznik poleceń specjalnych – żółty na niebieskim tle).
 *  - Przebieg: kliknięcie sygnalizatora (albo strzałki blokady przy wjeździe), potem – zamiast polecenia z menu –
 *    kliknięcie celu: sygnalizatora, trójkąta końca toru albo toru; menu „Pociąg” / „Manewr”. Myszą można też
 *    przeciągnąć prawym klawiszem od początku do celu.
 *  - Pod obrazem okno komunikatów i alarmów (przełącznik); alarm potwierdza się dwuklikiem (biały na czerwonym →
 *    czerwony na niebieskim), a znika po potwierdzeniu i naprawie.
 */
export class MorRenderer extends ScreenBase {
  constructor(container, sim, handlers, opts = {}) {
    super(container, sim, handlers, opts);
    this.svg.classList.add('mor');
    this.cmdEls = new Map();
    this.tab = 'messages';
    this.addSectionHits(); // tor jako obiekt poleceń (Zmk / oZmk) i cel przebiegu
    this.menu = document.createElement('div');
    this.menu.className = 'scr-menu mor-menu hidden';
    document.body.appendChild(this.menu);
    this.confirmBar = createConfirmBar();
    if (!this.readonly) {
      this.#buildWindow(opts.cmdHost || container);
      this.#bind();
      sim.bus.on('console', () => this.#refreshWindow());
    }
    this.bindModel();
    this.refreshAll();
  }

  /** Elementy do wskazania w samouczku: 'messages', 'alarms' (przełącznik okna), 'counter'. */
  cmdButton(id) { return this.cmdEls.get(id) || null; }

  /* ---------------- okno komunikatów i alarmów ---------------- */

  /** Okno pod obrazem (za polem planu), z przełącznikiem komunikaty / alarmy i licznikiem poleceń specjalnych. */
  #buildWindow(host) {
    const w = document.createElement('div');
    w.className = 'mor-window';
    w.innerHTML = `<div class="mor-win-bar" role="tablist">
        <button type="button" class="mor-tab active" data-tab="messages" role="tab">${escapeHtml(t('mor.messages'))}</button>
        <button type="button" class="mor-tab" data-tab="alarms" role="tab">${escapeHtml(t('mor.alarms'))}</button>
        <span class="mor-hint">${escapeHtml(t('mor.ackHint'))}</span>
        <span class="mor-counter" title="${escapeHtml(t('mor.special'))}"><small>${escapeHtml(t('mor.special'))}</small> <b>00000</b></span>
      </div><div class="mor-list" role="log"></div>`;
    for (const b of w.querySelectorAll('.mor-tab')) {
      b.addEventListener('click', () => { this.tab = b.dataset.tab; this.#refreshWindow(); });
      this.cmdEls.set(b.dataset.tab, b);
    }
    this.cmdEls.set('counter', w.querySelector('.mor-counter'));
    w.querySelector('.mor-list').addEventListener('dblclick', (ev) => {
      const row = ev.target.closest('.mor-alarm');
      if (row) this.handlers.onAck([Number(row.dataset.id)]);
    });
    // okno pod obrazem (MOR-1: pod główną częścią ekranu); bez pola planu w dokumencie – w miejscu paska poleceń
    const scroll = host.parentElement?.querySelector(':scope > #desk-scroll');
    if (scroll) scroll.after(w); else host.appendChild(w);
    this.cmdBar = w;
    this.win = w;
  }

  #refreshWindow() {
    if (!this.win) return;
    const p = this.sim.input;
    const alarms = p.alarmList().filter((x) => !(x.acked && !x.active)); // potwierdzony i naprawiony – znika
    const unacked = alarms.filter((x) => !x.acked).length;
    for (const b of this.win.querySelectorAll('.mor-tab')) b.classList.toggle('active', b.dataset.tab === this.tab);
    const al = this.cmdEls.get('alarms');
    al.classList.toggle('alarm', unacked > 0);
    al.textContent = unacked ? `${t('mor.alarms')} (${unacked})` : t('mor.alarms');
    this.win.querySelector('.mor-counter b').textContent = PanelView.counterText(p.specialCount);
    this.win.querySelector('.mor-hint').classList.toggle('hidden', this.tab !== 'alarms');
    const list = this.win.querySelector('.mor-list');
    const fmt = (s) => Clock.format(s, true);
    if (this.tab === 'alarms') {
      list.innerHTML = alarms.length ? alarms.slice().reverse().map((x) => `<div class="mor-alarm${x.acked ? ' acked' : ''}" data-id="${x.id}"><time>${fmt(x.time)}</time> ${escapeHtml(x.text)}</div>`).join('')
        : `<div class="mor-empty">${escapeHtml(t('mor.noAlarms'))}</div>`;
    } else {
      list.innerHTML = p.events.slice(-40).reverse().map((e) => `<div class="mor-msg ${e.kind}"><time>${fmt(e.time)}</time> ${escapeHtml(e.text)}</div>`).join('')
        || `<div class="mor-empty">${escapeHtml(t('mor.noMessages'))}</div>`;
    }
  }

  /* ---------------- obsługa ---------------- */

  #bind() {
    let drag = null;
    const refOf = (target) => { const h = target?.closest?.('.hit'); return h ? JSON.parse(h.dataset.ref) : null; };
    this.svg.addEventListener('contextmenu', (ev) => ev.preventDefault());
    this.svg.addEventListener('pointerdown', (ev) => {
      this.#closeMenu();
      const ref = refOf(ev.target);
      if (!ref) { if (!this.sim.input.pending) this.handlers.onCancel(); return; }
      ev.preventDefault();
      if (ev.pointerType === 'mouse' && ev.button === 2) { drag = ref; return; } // przeciągnij-i-upuść prawym klawiszem
      this.#click(ref, ev);
    });
    this.svg.addEventListener('pointerup', (ev) => {
      if (!drag) return;
      const from = drag; drag = null;
      const to = refOf(document.elementFromPoint(ev.clientX, ev.clientY));
      if (!to) return;
      this.handlers.onCancel();
      this.handlers.onPress(from);
      if (to.kind !== from.kind || (to.id ?? to.exit) !== (from.id ?? from.exit)) this.#click(to, ev);
    });
    document.addEventListener('pointerdown', (ev) => { if (!this.menu.contains(ev.target) && !this.svg.contains(ev.target)) this.#closeMenu(); });
    document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') { this.#closeMenu(); this.confirmBar.hide(); this.handlers.onCancel(); } });
  }

  /** Kliknięcie obiektu: wybór albo cel przebiegu – potem menu obiektu / menu przebiegu. */
  #click(ref, ev) {
    const res = this.handlers.onPress(ref);
    if (res?.ok && res.menu) this.#openMenu(ev);
  }

  #openMenu(ev) {
    const items = this.sim.input.menu();
    if (!items.length) return;
    const a = this.sim.input.armed;
    this.menu.innerHTML = `<h5>${escapeHtml(a?.role === 'route' ? a.selection.map((r) => r.id).join(' → ') : a?.id ?? '')}</h5>`;
    for (const it of items) {
      const b = document.createElement('button');
      b.type = 'button'; b.dataset.code = it.code; b.className = it.level;
      b.innerHTML = `<b>${escapeHtml(it.code)}</b> <span>${escapeHtml(it.name)}</span>`;
      b.addEventListener('click', () => { this.#closeMenu(); this.#choose(it.code); });
      this.menu.appendChild(b);
    }
    this.menu.classList.remove('hidden');
    const mw = 280, mh = this.menu.offsetHeight || 160;
    this.menu.style.left = `${Math.max(8, Math.min(ev.clientX, window.innerWidth - mw - 8))}px`;
    this.menu.style.top = `${Math.max(8, Math.min(ev.clientY, window.innerHeight - mh - 8))}px`;
  }

  #closeMenu() { this.menu.classList.add('hidden'); }

  /** Polecenie z menu: zwykłe – od razu; fioletowe i specjalne – potwierdzenie (Ie-20 §13.7). */
  #choose(code) {
    const res = this.handlers.onChoose(code);
    if (!res?.confirm) return;
    this.confirmBar.show({
      text: t(res.level === 'special' ? 'mor.specialText' : 'mor.confirmText', { cmd: res.text }),
      ok: t('mor.confirm'), cancel: t('mor.cancel'),
      onOk: () => this.handlers.onConfirm(), onCancel: () => this.handlers.onCancel(),
    });
  }

  /* ---------------- obraz wyboru ---------------- */

  #elementsOf(ref) {
    if (!ref) return [];
    if (ref.kind === 'section') return this.sectionHits.get(ref.id) || [];
    const e = this.elementFor(ref);
    return e ? [e] : [];
  }

  /** Wybór MOR-1: fioletowa obwódka obiektu (i celu przebiegu). Baza woła to także na końcu odświeżania obrazu. */
  updateArmed(a) {
    for (const e of this.svg.querySelectorAll('.mor-sel, .selected')) e.classList.remove('mor-sel', 'selected');
    this.#refreshWindow();
    if (!a) return;
    for (const r of a.selection || [a]) for (const e of this.#elementsOf(r)) e.classList.add('mor-sel');
  }
}
