import { refKey } from './refKey.js';
import { ScreenBase } from './ScreenBase.js';
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
    const kinds = { train: ['signal'], shunt: ['signal'], pz: ['signal'], dpz: ['signal'], zw: ['point', 'derailer'], zz: ['point', 'derailer'], sz: ['signal'], stop: ['signal'], sstop: ['signal'] }[this.mode];
    if (!kinds || !kinds.includes(ref.kind)) { this.sim.bus.emit('log', { time: this.ilk.time, level: 'warn', msg: 'Polecenie nie dotyczy wskazanego elementu' }); return; }
    const item = cmd?.items.find((it) => it.mode === this.mode);
    if (!item) return;
    const keep = this.mode === 'train' || this.mode === 'shunt';
    if (item.special) this.#confirm(item); else item.run();
    if (!keep) this.#setMode(null);
    else if (!this.pending) this.#setMode(null);
  }

  /** Lista poleceń dla elementu (menu). */
  #commands(ref) {
    const H = this.handlers;
    // polecenia wydawane wprost (Simulation.execute) – monitor nie ma przycisków grupowych
    const exec = (cmd) => () => H.onCommand(cmd);
    if (ref.kind === 'signal') {
      const s = this.ilk.signals.get(ref.id);
      const sigRef = (color) => ({ kind: 'signal', id: ref.id, color });
      const startRoute = (color) => () => {
        const res = H.onPress(sigRef(color));
        if (res?.ok) this.#beginPending(ref.id, color);
        return res;
      };
      const items = [];
      if (s.kind === 'semafor') items.push({ mode: 'train', label: `Nastawienie przebiegu pociągowego od ${ref.id} …`, run: startRoute('green') });
      if (s.kind === 'tm' || s.shunting) items.push({ mode: 'shunt', label: `Nastawienie przebiegu manewrowego od ${ref.id} …`, run: startRoute('white') });
      items.push({ mode: 'stop', label: 'Sygnał „Stój” – przebieg pozostaje utwierdzony (Stój)', run: exec({ type: 'stop', signal: ref.id }) });
      items.push(s.stopped
        ? { mode: 'sstop', label: 'Odwołanie zastopowania sygnalizatora (oStop)', run: exec({ type: 'signal-stop', signal: ref.id, on: false }) }
        : { mode: 'sstop', label: 'Zastopowanie sygnalizatora (Stop)', run: exec({ type: 'signal-stop', signal: ref.id, on: true }) });
      items.push({ mode: 'pz', label: 'Zwolnienie przebiegu (ZCZ)', run: exec({ type: 'release', signal: ref.id }) });
      // ZDP – przebiegu pociągowego: polecenie specjalne; ZDM – manewrowego: zwykłe (Ie-104.1 §12)
      if (this.ilk.routeInfo(s.route)?.route.kind === 'shunt') items.push({ mode: 'dpz', label: 'Zwolnienie doraźne przebiegu manewrowego (ZDM)', run: exec({ type: 'release', signal: ref.id, emergency: true }) });
      else items.push({ mode: 'dpz', label: 'Zwolnienie doraźne przebiegu pociągowego (ZDP)', special: true, target: ref, cmd: { type: 'release', signal: ref.id, emergency: true } });
      if (s.kind === 'semafor') items.push({ mode: 'sz', label: 'Sygnał zastępczy (SZ)', special: true, target: ref, cmd: { type: 'substitute', signal: ref.id } });
      return { title: `${s.kind === 'tm' ? 'Tarcza manewrowa' : 'Semafor'} ${ref.id}`, items };
    }
    if (ref.kind === 'point') {
      const p = this.ilk.points.get(ref.id);
      return { title: `Zwrotnica ${p?.label || ref.id}`, items: [
        { mode: 'zw', label: p?.position === '+' ? 'Przestawienie zwrotnicy w położenie minus (Minus)' : 'Przestawienie zwrotnicy w położenie plus (Plus)', run: exec({ type: 'point', id: ref.id }) },
        { mode: 'zz', label: p?.individualLock ? 'Odwołanie zamknięcia zwrotnicy (oZmk)' : 'Zamknięcie zwrotnicy (Zmk)', run: exec({ type: 'lock', id: ref.id }) },
      ] };
    }
    if (ref.kind === 'derailer') {
      const d = this.ilk.derailers.get(ref.id);
      return { title: `Wykolejnica ${ref.id}`, items: [
        { mode: 'zw', label: d?.position === 'on' ? 'Zdjęcie wykolejnicy (Minus)' : 'Nałożenie wykolejnicy (Plus)', run: exec({ type: 'derailer', id: ref.id }) },
        { mode: 'zz', label: d?.individualLock ? 'Odwołanie zamknięcia wykolejnicy (oZmk)' : 'Zamknięcie wykolejnicy (Zmk)', run: exec({ type: 'lock', id: ref.id, derailer: true }) },
      ] };
    }
    if (ref.kind === 'blockpanel') return this.#blockMenu(ref.exit);
    if (ref.kind === 'end') {
      const t = this.topo.endButtons.get(ref.id);
      const ex = t ? this.exitAt(t) : null;
      if (ex) return this.#blockMenu(ex[0]);
      return { title: 'Koniec toru', items: [{ label: 'Wskaż najpierw sygnalizator początku przebiegu', run: () => ({ ok: false }) }] };
    }
    return null;
  }

  /** Polecenia blokady liniowej szlaku: Eap (Wbl, Poz, Ko), samoczynna (Zk), doraźne dPo / dKo. */
  #blockMenu(exit) {
    const b = this.sim.blocks.get(exit);
    const press = (btn) => () => this.handlers.onCommand({ type: 'block', exit, btn });
    const items = [];
    if (b?.auto) items.push({ label: b.request === 'theirs' ? 'Zgoda na zmianę kierunku blokady – prośba sąsiada (Zk)' : `Prośba o zmianę kierunku blokady (Zk) – obecnie ${b.direction === 'out' ? 'odjazd' : 'przyjazd'}`, run: press('Zk') });
    else {
      if (!b?.fixed) items.push({ label: 'Żądanie pozwolenia na wyprawienie pociągu (Wbl)', run: press('Wbl') },
        { label: 'Odwołanie żądania / zwrot pozwolenia (oWbl)', run: press('oWbl') },
        { label: 'Danie pozwolenia na wyprawienie pociągu (Poz)', run: press('Poz') });
      items.push({ label: 'Zwolnienie bloku końcowego – pociąg przybył w całości (Ko)', run: press('Ko') });
    }
    // SBL nie ma bloków Po / Ko – bez poleceń doraźnych
    const blk = { kind: 'blockpanel', exit };
    if (!b?.auto && b?.fixed !== 'in') items.push({ label: 'Doraźne zablokowanie bloku początkowego – po wyjeździe na Sz (dPo)', special: true, target: blk, cmd: { type: 'block', exit, btn: 'dPo' } });
    if (!b?.auto && b?.fixed !== 'out') items.push({ label: 'Doraźne przygotowanie bloku końcowego – przed wjazdem na Sz (dKo)', special: true, target: blk, cmd: { type: 'block', exit, btn: 'dKo' } });
    // pod separatorem: numery pociągów na tym torze szlakowym jako czerwone kasetki (jak na planie) – najpierw
    // pociąg na szlaku, potem w kolejce pociągi zgłoszone przez sąsiada i czekające na wyprawienie (kontur)
    items.push({ sep: true }, { trains: this.lineTrains(exit) });
    return { title: `Szlak ${b?.def?.label || b?.neighbour || exit} – blokada ${b?.auto ? 'samoczynna' : 'Eap'}`, items };
  }

  #openMenu(ref, ev) {
    const cmd = this.#commands(ref);
    if (!cmd) return;
    this.menu.innerHTML = `<h5>${cmd.title}</h5>`;
    for (const it of cmd.items) {
      if (it.sep) { this.menu.appendChild(document.createElement('hr')); continue; }
      if (it.trains) {
        const d = document.createElement('div'); d.className = 'menu-trains';
        if (!it.trains.length) d.textContent = '–';
        for (const t of it.trains) { const sp = document.createElement('span'); sp.className = `menu-train${t.on ? '' : ' queued'}`; sp.textContent = t.nr; sp.title = t.title; d.appendChild(sp); }
        this.menu.appendChild(d); continue;
      }
      const b = document.createElement('button');
      b.type = 'button'; b.textContent = it.label; if (it.special) b.classList.add('special');
      b.addEventListener('click', () => { this.#closeMenu(); if (it.special) this.#confirm(it); else it.run(); });
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
