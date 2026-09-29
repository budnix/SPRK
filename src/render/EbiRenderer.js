import { el } from './svg.js';
import { ScreenBase } from './ScreenBase.js';
import { t } from '../i18n/index.js';
import { makeDraggable } from '../ui/drag.js';
import { escapeHtml } from '../ui/dom.js';
import { uiIcon } from '../ui/icons.js';
import { Clock } from '../core/Clock.js';

/** Przytrzymanie palca dłużej niż tyle [ms] działa jak prawy klawisz myszy (tablet). */
const LONG_PRESS = 450;

/**
 * Stanowisko komputerowe typu EBILock 950 z pulpitem EBIScreen 3: obraz wg Ie-104 ze `ScreenBase`, obsługa
 * tekstową linią poleceń (protokół `src/srk/ebilock.js`).
 *
 *  - Prawy klawisz na obiekcie (na tablecie: przytrzymanie) – zielona pulsująca ramka i menu poleceń; najechanie na
 *    polecenie pokazuje objaśnienie, kliknięcie wpisuje je do linii poleceń. Każde polecenie wysyła „Wykonaj”
 *    (albo Enter); F12 przechodzi do linii poleceń, „Wyczyść” / Esc / klik w puste pole odznacza.
 *  - Lewy klawisz na sygnalizatorze – początek przebiegu; prawy na końcu (sygnalizator, trójkąt końca toru) – koniec
 *    i menu przebiegu (POC, MAN, PZA); elementy pośrednie do wyboru – błękitna migająca ramka. Lewy klawisz na innym
 *    obiekcie działa jak prawy (ułatwienie gry – na tablecie nie ma prawego klawisza).
 *  - Polecenie inicjujące (SZI) markuje obiekt czerwonym tłem; polecenie wykonania (SZW) – po 5–30 s.
 *  - Okno zdarzeń i alarmów: zdarzenia u góry, alarmy u dołu (czerwony kwadrat – aktywny, zielony – nieaktywny,
 *    miganie – niepotwierdzony), „Potwierdź” i „Potwierdź wszystkie”.
 */
export class EbiRenderer extends ScreenBase {
  /** EBIScreen: sygnalizator w trakcie zwalniania czasowego rysowany na fioletowo (B2). */
  static TIMED_SIGNAL = true;

  constructor(container, sim, handlers, opts = {}) {
    super(container, sim, handlers, opts);
    this.svg.classList.add('ebi');
    this.cmdEls = new Map();
    this.menu = document.createElement('div');
    this.menu.className = 'scr-menu ebi-menu hidden';
    document.body.appendChild(this.menu);
    this.addSectionHits(); // tor jako obiekt poleceń (ITS / ITO)
    requestAnimationFrame(() => this.#stationHit());
    if (!this.readonly) {
      this.#buildCommandLine(opts.cmdHost || container);
      this.#buildLogWindow();
      this.#bind();
      sim.bus.on('console', (e) => this.#onEbi(e));
    }
    this.bindModel();
    this.refreshAll();
  }

  /** Elementy linii poleceń do wskazania w samouczku: 'line', 'exec', 'clear', 'log'. */
  cmdButton(id) { return this.cmdEls.get(id) || null; }

  /* ---------------- budowa ---------------- */

  /** Nazwa stacji na planie – obiekt poleceń ogólnych stacji (SSS, SSO, SZO). */
  #stationHit() {
    const title = this.layerMarks.querySelector('.scr-label.title');
    if (!title || this.stationHitEl) return;
    let b; try { b = title.getBBox(); } catch { return; }
    if (!b.width) return;
    const h = el('rect', { class: 'hit hit-station', x: b.x - 4, y: b.y - 2, width: b.width + 8, height: b.height + 4, rx: 2 });
    h.dataset.ref = JSON.stringify({ kind: 'station', id: this.station.id });
    this.layerMarks.appendChild(h);
    this.stationHitEl = h;
  }

  #buildCommandLine(host) {
    const bar = document.createElement('div');
    bar.className = 'scr-cmdbar ebi-bar';
    const label = document.createElement('label');
    label.className = 'ebi-label';
    label.textContent = t('ebi.line');
    const input = document.createElement('input');
    input.type = 'text'; input.className = 'ebi-line'; input.id = 'ebi-line';
    input.autocomplete = 'off'; input.spellcheck = false; input.setAttribute('autocapitalize', 'characters');
    input.placeholder = t('ebi.placeholder');
    label.htmlFor = input.id;
    const exec = this.#button(t('ebi.exec'), 'ebi-exec primary', () => this.#submit());
    const clear = this.#button(t('ebi.clear'), 'ebi-clear', () => this.#clear());
    const log = this.#button(t('ebi.log'), 'ebi-log', () => this.#toggleLog());
    this.info = document.createElement('span');
    this.info.className = 'scr-cmdinfo ebi-info';
    input.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') { ev.preventDefault(); this.#submit(); }
      if (ev.key === 'Escape') { ev.preventDefault(); this.#clear(); input.blur(); }
    });
    bar.append(label, input, exec, clear, log, this.info);
    host.appendChild(bar);
    this.cmdBar = bar;
    this.line = input;
    for (const [k, e] of [['line', input], ['exec', exec], ['clear', clear], ['log', log]]) this.cmdEls.set(k, e);
  }

  #button(label, cls, run) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = cls; b.textContent = label;
    b.addEventListener('click', run);
    return b;
  }

  /** Okno zdarzeń i alarmów (osobne okno EBIScreen): zdarzenia u góry, alarmy u dołu. */
  #buildLogWindow() {
    const w = document.createElement('div');
    w.className = 'ebi-win hidden';
    w.setAttribute('role', 'dialog');
    w.setAttribute('aria-label', t('ebi.log'));
    w.innerHTML = `<div class="ebi-win-head"><b>${escapeHtml(t('ebi.log'))}</b><button type="button" class="ebi-win-close" aria-label="${escapeHtml(t('ebi.closeLog'))}">${uiIcon('close', 14)}</button></div>
      <h6>${escapeHtml(t('ebi.events'))}</h6><div class="ebi-events"></div>
      <h6>${escapeHtml(t('ebi.alarms'))}</h6><div class="ebi-alarms"></div>
      <div class="ebi-win-actions"></div>`;
    const acts = w.querySelector('.ebi-win-actions');
    acts.append(
      this.#button(t('ebi.ack'), 'ebi-ack', () => { const ids = [...w.querySelectorAll('.ebi-alarm.picked')].map((e) => Number(e.dataset.id)); if (ids.length) this.handlers.onAck(ids); }),
      this.#button(t('ebi.ackAll'), 'ebi-ack-all', () => this.handlers.onAck('all')),
    );
    w.querySelector('.ebi-win-close').addEventListener('click', () => this.#toggleLog(false));
    w.querySelector('.ebi-alarms').addEventListener('click', (ev) => ev.target.closest('.ebi-alarm')?.classList.toggle('picked'));
    document.body.appendChild(w);
    makeDraggable(w, w.querySelector('.ebi-win-head'));
    this.logWin = w;
  }

  /* ---------------- obsługa ---------------- */

  #bind() {
    let hold = null;
    const refOf = (ev) => { const h = ev.target.closest('.hit'); return h ? JSON.parse(h.dataset.ref) : null; };
    this.svg.addEventListener('contextmenu', (ev) => ev.preventDefault());
    this.svg.addEventListener('pointerdown', (ev) => {
      this.#closeMenu();
      const ref = refOf(ev);
      if (!ref) { this.#clear(); return; }
      ev.preventDefault();
      if (ev.pointerType === 'mouse') { if (ev.button === 2) this.#right(ref, ev); else if (ev.button === 0) this.#left(ref, ev); return; }
      // palec / rysik: krótkie dotknięcie – lewy klawisz, przytrzymanie – prawy
      const at = { clientX: ev.clientX, clientY: ev.clientY };
      hold = { ref, fired: false, timer: setTimeout(() => { hold.fired = true; this.#right(ref, at); }, LONG_PRESS) };
    });
    const up = () => {
      if (!hold) return;
      clearTimeout(hold.timer);
      if (!hold.fired) this.#left(hold.ref, null);
      hold = null;
    };
    this.svg.addEventListener('pointerup', up);
    this.svg.addEventListener('pointercancel', () => { if (hold) clearTimeout(hold.timer); hold = null; });
    document.addEventListener('pointerdown', (ev) => { if (!this.menu.contains(ev.target) && !this.svg.contains(ev.target)) this.#closeMenu(); });
    document.addEventListener('keydown', (ev) => {
      if (ev.key === 'F12') { ev.preventDefault(); this.line.focus(); }
      else if (ev.key === 'Escape' && document.activeElement !== this.line) { this.#clear(); this.#closeMenu(); }
    });
  }

  /** Lewy klawisz: sygnalizator – początek przebiegu; trójkąt końca toru przy wybranym początku – koniec; inny
   *  obiekt – jak prawy klawisz. */
  #left(ref, ev) {
    const a = this.sim.input.armed;
    if (ref.kind === 'signal') { this.handlers.onPress(ref); return; }
    if (ref.kind === 'end' && a?.role === 'route' && a.selection.length === 1) { this.#right(ref, ev); return; }
    this.#right(ref, ev);
  }

  /** Prawy klawisz: koniec przebiegu, element pośredni albo obiekt polecenia; potem menu poleceń. */
  #right(ref, ev) {
    const res = this.handlers.onPull(ref);
    if (res?.ok && res.menu) this.#openMenu(ev);
  }

  #openMenu(ev) {
    const items = this.sim.input.menu();
    if (!items.length) return;
    const a = this.sim.input.armed;
    this.menu.innerHTML = `<h5>${escapeHtml(a?.role === 'route' ? a.selection.map((r) => r.id).join(' → ') : a?.id ?? '')}</h5>`;
    for (const it of items) {
      const b = document.createElement('button');
      b.type = 'button'; b.dataset.code = it.code;
      b.innerHTML = `<b>${escapeHtml(it.code)}</b> <span>${escapeHtml(it.name)}</span>`;
      b.addEventListener('pointerenter', () => { this.info.textContent = `${it.text} – ${it.name}`; });
      b.addEventListener('click', () => {
        this.line.value = it.text;
        this.info.textContent = `${it.text} – ${it.name} · ${t('ebi.pressExec')}`;
        this.cmdEls.get('exec').classList.add('ready');
        this.#closeMenu();
      });
      this.menu.appendChild(b);
    }
    this.menu.classList.remove('hidden');
    const r = ev ? { x: ev.clientX, y: ev.clientY } : this.#anchorOf(a);
    const mw = 280, mh = this.menu.offsetHeight || 160;
    this.menu.style.left = `${Math.max(8, Math.min(r.x, window.innerWidth - mw - 8))}px`;
    this.menu.style.top = `${Math.max(8, Math.min(r.y, window.innerHeight - mh - 8))}px`;
  }

  /** Miejsce menu, gdy wybór przyszedł bez zdarzenia wskaźnika (np. krótkie dotknięcie). */
  #anchorOf(a) {
    const e = a && this.#elementsOf(a.selection.at(-1))[0];
    const b = e?.getBoundingClientRect?.();
    return b ? { x: b.right, y: b.bottom } : { x: 40, y: 120 };
  }

  #closeMenu() { this.menu.classList.add('hidden'); }

  #submit() {
    const text = this.line.value.trim();
    const res = this.handlers.onSubmit(text);
    if (res?.ok) {
      this.info.textContent = res.marked ? t('ebi.marked', { cmd: text }) : '';
      this.line.value = '';
      this.cmdEls.get('exec').classList.remove('ready');
    }
    return res;
  }

  #clear() {
    if (this.line) this.line.value = '';
    if (this.info) this.info.textContent = '';
    this.cmdEls.get('exec')?.classList.remove('ready');
    this.#closeMenu();
    this.handlers.onCancel();
  }

  #toggleLog(show = this.logWin.classList.contains('hidden')) {
    this.logWin.classList.toggle('hidden', !show);
    this.cmdEls.get('log').classList.toggle('active', show);
    if (show) this.#renderLog();
  }

  #onEbi(e) {
    if (e.what === 'selection') this.#drawMarks();
    if (e.what === 'alarms') this.#alarmButton();
    if (!this.logWin.classList.contains('hidden') && (e.what === 'events' || e.what === 'alarms')) this.#renderLog();
  }

  /** Przycisk okna: miga na czerwono, gdy są niepotwierdzone alarmy. */
  #alarmButton() {
    const unacked = this.sim.input.alarmList().filter((x) => !x.acked).length;
    const b = this.cmdEls.get('log');
    b.classList.toggle('alarm', unacked > 0);
    b.textContent = unacked ? `${t('ebi.log')} (${unacked})` : t('ebi.log');
  }

  #renderLog() {
    const p = this.sim.input;
    const fmt = (s) => Clock.format(s);
    const ev = this.logWin.querySelector('.ebi-events');
    ev.innerHTML = p.events.slice(-60).reverse().map((e) => `<div class="ebi-event ${e.kind}"><time>${fmt(e.time)}</time> ${escapeHtml(e.text)}</div>`).join('');
    const al = this.logWin.querySelector('.ebi-alarms');
    const picked = new Set([...al.querySelectorAll('.ebi-alarm.picked')].map((e) => e.dataset.id));
    const list = p.alarmList().slice().reverse();
    al.innerHTML = list.length ? list.map((x) => `<div class="ebi-alarm${x.acked ? '' : ' unacked'}${picked.has(String(x.id)) ? ' picked' : ''}" data-id="${x.id}" role="button" tabindex="0"><i class="sq ${x.active ? 'on' : 'off'}" aria-hidden="true"></i><time>${fmt(x.time)}</time> ${escapeHtml(x.text)}</div>`).join('')
      : `<div class="ebi-empty">${escapeHtml(t('ebi.noAlarms'))}</div>`;
  }

  /* ---------------- obraz wyboru ---------------- */

  /** Elementy rysunku obiektu wyboru (sygnalizator, zwrotnica, koniec toru, tor, stacja). */
  #elementsOf(ref) {
    if (!ref) return [];
    if (ref.kind === 'section') return this.sectionHits.get(ref.id) || [];
    if (ref.kind === 'station') return this.stationHitEl ? [this.stationHitEl] : [];
    const e = this.elementFor(ref);
    return e ? [e] : [];
  }

  /** Wybór EBIScreen: zielona pulsująca ramka; elementy pośrednie – błękitna migająca ramka. */
  updateArmed(a) {
    for (const e of this.svg.querySelectorAll('.ebi-sel, .ebi-cand, .selected')) e.classList.remove('ebi-sel', 'ebi-cand', 'selected');
    this.#drawMarks(); // baza woła updateArmed także na końcu odświeżania całego obrazu
    this.svg.classList.remove('picking');
    if (!a) return;
    for (const r of a.selection || [a]) for (const e of this.#elementsOf(r)) e.classList.add('ebi-sel');
    for (const r of a.candidates || []) for (const e of this.#elementsOf(r)) e.classList.add('ebi-cand');
    this.svg.classList.toggle('picking', a.role === 'route');
  }

  /** Markowanie obiektów do polecenia specjalnego: tło w barwie polecenia inicjującego. */
  #drawMarks() {
    const marks = this.sim.input?.marks;
    if (!marks) return;
    for (const [id, r] of this.signalRefs) {
      const m = marks.get(`signal:${id}`);
      r.g.classList.toggle('ebi-mark', !!m);
      r.g.dataset.mark = m ? m.color : '';
    }
  }
}
