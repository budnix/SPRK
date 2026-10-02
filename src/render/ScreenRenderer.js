import { refKey } from './refKey.js';
import { ScreenBase } from './ScreenBase.js';
import { monitorMenu, MODE_KINDS } from '../srk/monitor.js';
import { tip } from '../data/glossary.js';
import { createConfirmBar } from './confirmBar.js';
import { escapeHtml } from '../ui/dom.js';

/**
 * Stanowisko komputerowe (monitor dyżurnego ruchu): obraz wg Ie-104 ze `ScreenBase`, obsługa paskiem poleceń
 * i menu elementu.
 *
 *  Polecenia (skróty wg Ie-104.1 §12): pasek poleceń u góry (PRZEBIEG POCIĄGOWY, PRZEBIEG MANEWROWY, ZCZ – zwolnienie
 *  przebiegu, ZD – doraźne: ZDP pociągowego / ZDM manewrowego, Plus / Minus – zwrotnica, Zmk / oZmk – zamknięcie
 *  zwrotnicy, SZ, Stój, Stop / oStop – zastopowanie sygnalizatora, OPS – odwołanie polecenia) + menu elementu.
 *  Polecenie = rodzaj → element początkowy → element końcowy. Polecenia specjalne (ZDP, SZ, dPo, dKo) wg
 *  Ie-104.1 §11: inicjowanie (element zamarkowany na
 *  pomarańczowo, przed Sz szare tło obrazu), WYKONAJ najwcześniej po 5 s, samoczynne odwołanie po 60 s, w tym czasie
 *  inne polecenia zablokowane – logika i czas w `src/srk/special.js` (Simulation.initiateSpecial / confirmSpecial).
 */
export class ScreenRenderer extends ScreenBase {
  constructor(container, sim, handlers, opts = {}) {
    super(container, sim, handlers, opts);
    this.pending = null;          // trwający przebieg: { id, color }
    this.mode = null;             // wybrane polecenie z paska: 'train'|'shunt'|'pz'|'dpz'|'zw'|'zz'|'sz'|'stop'

    this.menu = document.createElement('div');
    this.menu.className = 'scr-menu hidden';
    document.body.appendChild(this.menu);
    this.confirmBar = createConfirmBar();
    if (!this.readonly) this.#buildCmdBar(opts.cmdHost || container);

    this.#bind();
    this.bindModel();
    this.refreshAll();
    sim.bus.on('special', (st) => this.#showSpecial(st)); // także co krok symulacji w trakcie polecenia (odliczanie)
  }

  /** Przycisk paska poleceń (np. 'train') – do wskazywania w samouczku. */
  cmdButton(id) { return this.cmdButtons?.get(id) || null; }

  /** Pasek poleceń (skróty wg Ie-104.1 §12): rodzaj polecenia → element(y). OPS odwołuje polecenie. */
  #buildCmdBar(container) {
    const bar = document.createElement('div');
    bar.className = 'scr-cmdbar';
    const CMDS = [
      ['train', 'PRZEBIEG POCIĄGOWY'], ['shunt', 'PRZEBIEG MANEWROWY'], ['pz', 'ZCZ'], ['dpz', 'ZD', true],
      ['zw', 'Plus / Minus'], ['zz', 'Zmk / oZmk'], ['sz', 'SZ', true], ['stop', 'Stój'], ['sstop', 'Stop / oStop'], ['ops', 'OPS'],
    ];
    this.cmdButtons = new Map();
    for (const [id, label, special] of CMDS) {
      const b = document.createElement('button');
      b.type = 'button'; b.textContent = label; b.dataset.cmd = id;
      b.title = tip({ train: 'przebieg pociągowy', shunt: 'przebieg manewrowy', pz: 'ZCZ', dpz: 'ZD', zw: 'Plus / Minus', zz: 'Zmk', sz: 'Sz', stop: 'STOP', sstop: 'STOP', ops: 'OPS' }[id]);
      if (special) b.classList.add('special');
      b.addEventListener('click', () => this.#setMode(id === 'ops' ? null : id, id === 'ops'));
      bar.appendChild(b); this.cmdButtons.set(id, b);
    }
    this.cmdInfo = document.createElement('span');
    this.cmdInfo.className = 'scr-cmdinfo';
    bar.appendChild(this.cmdInfo);
    container.appendChild(bar);
    this.cmdBar = bar;
  }

  #setMode(mode, cancelAll = false) {
    if (cancelAll) { this.#cancelPending(); if (this.sim.special?.pending) this.handlers.onSpecialCancel?.(); this.confirmBar.hide(); }
    this.mode = mode;
    for (const [id, b] of this.cmdButtons) b.classList.toggle('active', id === mode);
    const INFO = {
      train: 'wskaż semafor początkowy, potem semafor końcowy lub szlak', shunt: 'wskaż sygnalizator początkowy, potem końcowy / koniec toru',
      pz: 'ZCZ – wskaż sygnalizator początkowy przebiegu do zwolnienia', dpz: 'ZD – wskaż sygnalizator początkowy (ZDP pociągowego – polecenie specjalne, ZDM manewrowego)', zw: 'Plus / Minus – wskaż zwrotnicę lub wykolejnicę',
      zz: 'Zmk / oZmk – wskaż zwrotnicę (zamknięcie / odwołanie)', sz: 'SZ – polecenie specjalne, wskaż semafor', stop: 'Stój – wskaż sygnalizator (sygnał „Stój”, przebieg zostaje)',
      sstop: 'Stop / oStop – wskaż sygnalizator (zastopowanie / odwołanie)',
    };
    this.cmdInfo.textContent = mode ? INFO[mode] : '';
    this.svg.classList.toggle('picking', !!mode || !!this.pending);
  }

  /* ---------------- obsługa ---------------- */
  #bind() {
    this.svg.addEventListener('pointerdown', (ev) => {
      const h = ev.target.closest('.hit');
      if (!h) { this.#closeMenu(); return; }
      ev.preventDefault();
      if (this.readonly) return;
      this.#click(JSON.parse(h.dataset.ref), ev);
    });
    this.svg.addEventListener('contextmenu', (ev) => { ev.preventDefault(); this.#setMode(null, true); this.#closeMenu(); });
    document.addEventListener('pointerdown', (ev) => { if (!this.menu.contains(ev.target) && !this.svg.contains(ev.target)) this.#closeMenu(); });
    document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') { this.#setMode(null, true); this.#closeMenu(); } });
  }

  #click(ref, ev) {
    if (this.pending) {
      if (ref.kind === 'signal' || ref.kind === 'end') {
        const endRef = ref.kind === 'signal' ? { kind: 'signal', id: ref.id, color: this.pending.color } : ref;
        // koniec może być za semaforem pośrednim – przebieg złożony (łańcuch przebiegów), jak w komputerowych srk
        (this.handlers.onCompound || this.handlers.onPress)(endRef);
        this.#endPending();
        return;
      }
      this.#cancelPending();
    }
    if (this.mode) { this.#runMode(ref); return; }
    this.#openMenu(ref, ev);
  }

  /** Polecenie z paska zastosowane do wskazanego elementu. */
  #runMode(ref) {
    const cmd = this.#commands(ref);
    // polecenie paska → rodzaje elementów, których dotyczy; pozycję menu elementu wskazuje jej `mode`
    const kinds = MODE_KINDS[this.mode];
    if (!kinds || !kinds.includes(ref.kind)) { this.sim.bus.emit('log', { time: this.ilk.time, level: 'warn', msg: 'Polecenie nie dotyczy wskazanego elementu' }); return; }
    const item = cmd?.items.find((it) => it.mode === this.mode);
    if (!item) return;
    const keep = this.mode === 'train' || this.mode === 'shunt';
    this.#act(item);
    if (!keep) this.#setMode(null);
    else if (!this.pending) this.#setMode(null);
  }

  /** Menu elementu (`src/srk/monitor.js` – polecenia jako dane). */
  #commands(ref) {
    return monitorMenu(this.sim, ref);
  }

  /** Wykonanie pozycji menu: początek przebiegu (koniec wskazuje gracz), polecenie specjalne albo polecenie wprost. */
  #act(item) {
    const H = this.handlers;
    if (item.route) {
      const res = H.onPress({ kind: 'signal', id: item.signal, color: item.route });
      if (res?.ok) this.#beginPending(item.signal, item.route);
      return res;
    }
    if (item.special) return this.#confirm(item);
    return item.cmd ? H.onCommand(item.cmd) : { ok: false };
  }

  #openMenu(ref, ev) {
    const cmd = this.#commands(ref);
    if (!cmd) return;
    this.menu.innerHTML = `<h5>${cmd.title}</h5>`;
    for (const it of cmd.items) {
      if (it.sep) { this.menu.appendChild(document.createElement('hr')); continue; }
      if (it.lineTrains) {
        const d = document.createElement('div'); d.className = 'menu-trains';
        if (!it.lineTrains.length) d.textContent = '–';
        for (const t of it.lineTrains) { const sp = document.createElement('span'); sp.className = `menu-train${t.on ? '' : ' queued'}`; sp.textContent = t.nr; sp.title = t.title; d.appendChild(sp); }
        this.menu.appendChild(d); continue;
      }
      const b = document.createElement('button');
      b.type = 'button'; b.textContent = it.label; if (it.special) b.classList.add('special');
      b.addEventListener('click', () => { this.#closeMenu(); this.#act(it); });
      this.menu.appendChild(b);
    }
    this.menu.classList.remove('hidden');
    // rzeczywisty rozmiar menu (szerokość wg treści, do 480 px) – menu przy prawej / dolnej krawędzi nie wychodzi z okna
    const mw = this.menu.offsetWidth || 260, mh = this.menu.offsetHeight || 160;
    this.menu.style.left = `${Math.min(ev.clientX, window.innerWidth - mw - 8)}px`;
    this.menu.style.top = `${Math.min(ev.clientY, window.innerHeight - mh - 8)}px`;
  }

  #closeMenu() { this.menu.classList.add('hidden'); }

  /** Polecenie specjalne – inicjowanie (Ie-104.1 §11); potwierdzenie WYKONAJ po zwłoce, OPS odwołuje. */
  #confirm(item) {
    const res = this.handlers.onSpecial?.(item.cmd, { label: item.label, target: item.target });
    if (res && !res.ok) this.sim.bus.emit('log', { time: this.ilk.time, level: 'warn', msg: res.reason });
  }

  /** Stan polecenia specjalnego: pasek z odliczaniem, pomarańczowe tło elementu, szare tło obrazu przed Sz. */
  #showSpecial(st) {
    this.#markSpecial(st?.target ?? null);
    this.svg.classList.toggle('special-sz', st?.cmd?.type === 'substitute');
    if (!st) { this.confirmBar.hide(); this.specialShown = false; return; }
    const html = `Polecenie specjalne: <b>${escapeHtml(st.label)}</b> – ${st.ready ? `potwierdź WYKONAJ (odwołanie samoczynne za ${st.left} s)` : `potwierdzenie możliwe za ${st.wait} s`}; rejestrowane w liczniku.`;
    if (!this.specialShown) {
      this.specialShown = true;
      this.confirmBar.show({ html, ok: 'WYKONAJ', cancel: 'OPS – odwołaj', disabled: !st.ready,
        onOk: () => { const r = this.handlers.onSpecialConfirm?.(); if (r && !r.ok) this.sim.bus.emit('log', { time: this.ilk.time, level: 'warn', msg: r.reason }); },
        onCancel: () => this.handlers.onSpecialCancel?.() });
    } else this.confirmBar.set({ html, disabled: !st.ready });
  }

  /** Markowanie elementu polecenia specjalnego – pomarańczowe tło pod symbolem. */
  #markSpecial(target) {
    const key = target ? JSON.stringify(target) : null;
    if (key === this.specialKey) return;
    this.specialKey = key;
    this.svg.querySelectorAll('.special-bg').forEach((e) => e.remove());
    const g = target ? this.elementFor(target) : null;
    if (!g?.getBBox) return;
    const bb = g.getBBox();
    const r = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    for (const [k, v] of Object.entries({ class: 'special-bg', x: bb.x - 2, y: bb.y - 2, width: bb.width + 4, height: bb.height + 4, rx: 2 })) r.setAttribute(k, v);
    g.insertBefore(r, g.firstChild);
  }


  #beginPending(id, color) {
    this.pending = { id, color };
    this.svg.classList.add('picking');
  }
  #endPending() { this.pending = null; this.svg.classList.toggle('picking', !!this.mode); this.#setMode(null); }
  #cancelPending() {
    if (!this.pending) return;
    this.handlers.onCancel();
    this.#endPending();
  }

  /** Wybór elementu (G4) – po zdjęciu wyboru kończy się też wskazywanie końca przebiegu. */
  updateArmed(a) {
    super.updateArmed(a);
    if (!a && this.pending) this.#endPending();
  }
}
