import { refKey } from './refKey.js';
import { ScreenBase } from './ScreenBase.js';
import { tip } from '../data/glossary.js';
import { makeDraggable } from '../ui/drag.js';

/**
 * Stanowisko komputerowe (monitor dyżurnego ruchu): obraz wg Ie-104 ze `ScreenBase`, obsługa paskiem poleceń
 * i menu elementu.
 *
 *  Polecenia: pasek poleceń u góry (PRZEBIEG POCIĄGOWY, PRZEBIEG MANEWROWY, ZWOLNIJ, dPz, ZWROTNICA, Zz,
 *  Sz, STOP, OPS – odwołanie polecenia) + menu elementu. Polecenie = rodzaj → element początkowy → element
 *  końcowy. Polecenia specjalne (dPz, Sz, Zz, dPo, dKo) są inicjowane, potwierdzane „WYKONAJ” i rejestrowane.
 */
export class ScreenRenderer extends ScreenBase {
  constructor(container, sim, handlers, opts = {}) {
    super(container, sim, handlers, opts);
    this.pending = null;          // trwający przebieg: { id, color }
    this.mode = null;             // wybrane polecenie z paska: 'train'|'shunt'|'pz'|'dpz'|'zw'|'zz'|'sz'|'stop'

    this.menu = document.createElement('div');
    this.menu.className = 'scr-menu hidden';
    document.body.appendChild(this.menu);
    this.confirmBar = document.createElement('div');
    this.confirmBar.className = 'scr-confirm hidden';
    document.body.appendChild(this.confirmBar);
    makeDraggable(this.confirmBar, null);
    if (!this.readonly) this.#buildCmdBar(opts.cmdHost || container);

    this.#bind();
    this.bindModel();
    this.refreshAll();
  }

  /** Przycisk paska poleceń (np. 'train') – do wskazywania w samouczku. */
  cmdButton(id) { return this.cmdButtons?.get(id) || null; }

  /** Pasek poleceń (obsługa własna gry, w duchu Ie-104.2): rodzaj polecenia → element(y). OPS odwołuje polecenie. */
  #buildCmdBar(container) {
    const bar = document.createElement('div');
    bar.className = 'scr-cmdbar';
    const CMDS = [
      ['train', 'PRZEBIEG POCIĄGOWY'], ['shunt', 'PRZEBIEG MANEWROWY'], ['pz', 'ZWOLNIENIE PRZEBIEGU'], ['dpz', 'dPz', true],
      ['zw', 'ZWROTNICA'], ['zz', 'Zz', true], ['sz', 'Sz', true], ['stop', 'STOP'], ['ops', 'OPS'],
    ];
    this.cmdButtons = new Map();
    for (const [id, label, special] of CMDS) {
      const b = document.createElement('button');
      b.type = 'button'; b.textContent = label; b.dataset.cmd = id;
      b.title = tip({ train: 'przebieg pociągowy', shunt: 'przebieg manewrowy', pz: 'Pz', dpz: 'dPz', zw: 'Zw', zz: 'Zz', sz: 'Sz', stop: 'STOP', ops: 'OPS' }[id]);
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
    if (cancelAll) { this.#cancelPending(); this.confirmBar.classList.add('hidden'); }
    this.mode = mode;
    for (const [id, b] of this.cmdButtons) b.classList.toggle('active', id === mode);
    const INFO = {
      train: 'wskaż semafor początkowy, potem semafor końcowy lub szlak', shunt: 'wskaż sygnalizator początkowy, potem końcowy / koniec toru',
      pz: 'wskaż semafor początkowy przebiegu do zwolnienia', dpz: 'polecenie specjalne – wskaż semafor początkowy', zw: 'wskaż zwrotnicę lub wykolejnicę',
      zz: 'polecenie specjalne – wskaż zwrotnicę (zamknięcie / otwarcie)', sz: 'polecenie specjalne – wskaż semafor', stop: 'wskaż sygnalizator do wygaszenia',
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
    const kinds = { train: ['signal'], shunt: ['signal'], pz: ['signal'], dpz: ['signal'], zw: ['point', 'derailer'], zz: ['point', 'derailer'], sz: ['signal'], stop: ['signal'] }[this.mode];
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
      items.push({ mode: 'stop', label: 'Wygaszenie sygnału – STOP (przebieg pozostaje utwierdzony)', run: exec({ type: 'stop', signal: ref.id }) });
      items.push({ mode: 'pz', label: 'Zwolnienie przebiegu (Pz)', run: exec({ type: 'release', signal: ref.id }) });
      items.push({ mode: 'dpz', label: 'Doraźne zwolnienie przebiegu (dPz)', special: true, run: exec({ type: 'release', signal: ref.id, emergency: true }) });
      if (s.kind === 'semafor') items.push({ mode: 'sz', label: 'Podanie sygnału zastępczego (Sz)', special: true, run: exec({ type: 'substitute', signal: ref.id }) });
      return { title: `${s.kind === 'tm' ? 'Tarcza manewrowa' : 'Semafor'} ${ref.id}`, items };
    }
    if (ref.kind === 'point') {
      const p = this.ilk.points.get(ref.id);
      return { title: `Zwrotnica ${p?.label || ref.id}`, items: [
        { mode: 'zw', label: 'Przestawienie zwrotnicy (Zw)', run: exec({ type: 'point', id: ref.id }) },
        { mode: 'zz', label: p?.individualLock ? 'Otwarcie zamknięcia indywidualnego (Zz)' : 'Zamknięcie indywidualne zwrotnicy (Zz)', special: true, run: exec({ type: 'lock', id: ref.id }) },
      ] };
    }
    if (ref.kind === 'derailer') {
      const d = this.ilk.derailers.get(ref.id);
      return { title: `Wykolejnica ${ref.id}`, items: [
        { mode: 'zw', label: d?.position === 'on' ? 'Zdjęcie wykolejnicy (Zw)' : 'Nałożenie wykolejnicy (Zw)', run: exec({ type: 'derailer', id: ref.id }) },
        { mode: 'zz', label: d?.individualLock ? 'Otwarcie zamknięcia indywidualnego (Zz)' : 'Zamknięcie indywidualne wykolejnicy (Zz)', special: true, run: exec({ type: 'lock', id: ref.id, derailer: true }) },
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
    if (b?.auto) items.push({ label: `Zmiana kierunku blokady (Zk) – obecnie ${b.direction === 'out' ? 'wyjazd' : 'wjazd'}`, run: press('Zk') });
    else {
      if (!b?.fixed) items.push({ label: 'Żądanie pozwolenia na wyprawienie pociągu (Wbl)', run: press('Wbl') }, { label: 'Danie pozwolenia na wyprawienie pociągu (Poz)', run: press('Poz') });
      items.push({ label: 'Zwolnienie bloku końcowego – pociąg przybył w całości (Ko)', run: press('Ko') });
    }
    items.push({ label: 'Doraźne zwolnienie bloku początkowego (dPo)', special: true, run: press('dPo') });
    items.push({ label: 'Doraźne zwolnienie bloku końcowego (dKo)', special: true, run: press('dKo') });
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
    const mw = 260, mh = this.menu.offsetHeight || 160;
    this.menu.style.left = `${Math.min(ev.clientX, window.innerWidth - mw - 8)}px`;
    this.menu.style.top = `${Math.min(ev.clientY, window.innerHeight - mh - 8)}px`;
  }

  #closeMenu() { this.menu.classList.add('hidden'); }

  /** Polecenie specjalne – inicjalizacja, potwierdzenie WYKONAJ, rejestracja (licznik). OPS odwołuje. */
  #confirm(item) {
    this.confirmBar.innerHTML = `<span>Polecenie specjalne: <b>${item.label}</b> – rejestrowane w liczniku.</span>`;
    const ok = document.createElement('button'); ok.type = 'button'; ok.className = 'tb warn'; ok.textContent = 'WYKONAJ';
    const no = document.createElement('button'); no.type = 'button'; no.className = 'tb'; no.textContent = 'OPS – odwołaj';
    ok.addEventListener('click', () => { this.confirmBar.classList.add('hidden'); item.run(); });
    no.addEventListener('click', () => this.confirmBar.classList.add('hidden'));
    // przyciski trzymają się razem: na wąskim ekranie schodzą pod opis jako para
    const actions = document.createElement('div'); actions.className = 'confirm-actions';
    actions.append(ok, no);
    this.confirmBar.append(actions);
    this.confirmBar.classList.remove('hidden');
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
