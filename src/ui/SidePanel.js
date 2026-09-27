import { CATEGORIES, brandOf, relationOf, speedFor } from '../model/categories.js';
import { Clock } from '../core/Clock.js';

/**
 * Panel boczny: rozkład jazdy, komunikaty/dziennik, liczniki, ruch manewrowy.
 */
export class SidePanel {
  /**
   * opts: { miniHost – element listwy narzędzi na mini-zakładki po zwinięciu panelu, onToggle(collapsed) }
   */
  constructor(root, sim, opts = {}) {
    this.sim = sim;
    this.root = root;
    this.opts = opts;
    root.innerHTML = `
      <nav class="tabs">
        <button data-tab="rj" class="active">Rozkład</button>
        <button data-tab="log">Dziennik <span id="log-badge" class="badge hidden">0</span></button>
        <button data-tab="stan">Stan</button>
        <button data-tab="rozkazy">Rozkazy</button>
        <button data-tab="lacznosc">Łączność <span id="comms-badge" class="badge hidden">0</span></button>
        <button data-tab="polecenia" id="tab-btn-polecenia" class="hidden">Polecenia <span id="cmd-badge" class="badge hidden">0</span></button>
        <button type="button" class="collapse-btn" title="Zwiń panel (pulpit na całym ekranie)" aria-label="Zwiń panel">⇥</button>
      </nav>
      <section class="tab" id="tab-rj">
        <table class="rj"><thead><tr><th>Nr</th><th>Relacja</th><th>Przyj.</th><th>Odj.</th><th>Tor</th><th>Stan</th></tr></thead><tbody></tbody></table>
        <div class="score" id="score"></div>
      </section>
      <section class="tab hidden" id="tab-log">
        <div class="alerts" id="alerts"></div>
        <ul class="log" id="log"></ul>
      </section>
      <section class="tab hidden" id="tab-stan">
        <h4>Usterki</h4>
        <div id="faults" class="muted">brak</div>
        <h4>Blokady liniowe</h4>
        <div id="blocks"></div>
        <h4>Przebiegi nastawione</h4>
        <ul id="routes" class="plain"></ul>
        <h4>Liczniki</h4>
        <div id="counters"></div>
        <h4>Zadania manewrowe</h4>
        <div id="tasks" class="muted">brak</div>
        <h4>Manewry</h4>
        <div id="shunt"></div>
      </section>
      <section class="tab hidden" id="tab-rozkazy">
        <h4>Rozkaz pisemny „S” – przejazd obok semafora „Stój”</h4>
        <form id="order-form" class="order-form">
          <label>Pociąg nr <select name="nr" id="order-train"></select></label>
          <label>Semafor <input name="signal" id="order-signal" readonly></label>
          <label>Z powodu <input name="reason" id="order-reason" value="usterki urządzeń srk"></label>
          <label>Treść rozkazu <textarea name="text" id="order-text" rows="6"></textarea></label>
          <div class="order-actions"><button type="submit">Wydaj rozkaz</button> <span id="order-msg" class="order-msg"></span></div>
        </form>
        <p class="muted small">Warunki (Ir-1): pociąg stoi przed semaforem, zwrotnice w drodze jazdy zamknięte (Zz) lub utwierdzone, wykolejnice zdjęte, odcinki wolne, przy wyjeździe – pozwolenie blokady. Pociąg jedzie do następnego semafora z prędkością do 20 km/h.</p>
        <h4>Wydane rozkazy</h4>
        <ol id="orders" class="orders"></ol>
      </section>
      <section class="tab hidden" id="tab-lacznosc">
        <form id="comms-form" class="order-form">
          <label>Do <select id="comms-to"></select></label>
          <label>Telefonogram / komunikat <select id="comms-formula"></select></label>
          <label>Pociąg nr <input id="comms-nr" inputmode="numeric"></label>
          <div class="order-actions"><button type="submit">Nadaj</button> <span id="comms-msg" class="order-msg"></span></div>
        </form>
        <p class="muted small">Telefonogramy wg Ir-1 stosuje się przy usterce blokady liniowej (zapowiadanie telefoniczne). Błędna formuła jest punktowana ujemnie.</p>
        <h4>Rozmowy</h4>
        <ul class="log comms" id="comms-log"></ul>
      </section>
      <section class="tab hidden" id="tab-polecenia">
        <div id="cmd-form-wrap">
          <h4>Polecenie dla nastawni wykonawczej</h4>
          <form id="cmd-form" class="order-form">
            <label>Pociąg <select id="cmd-train"></select></label>
            <label id="cmd-track-wrap">Na tor <select id="cmd-track"></select></label>
            <label id="cmd-exit-wrap">Do <select id="cmd-exit"></select></label>
            <div class="order-actions"><button type="submit">Wydaj polecenie</button> <span id="cmd-msg" class="order-msg"></span></div>
          </form>
        </div>
        <p class="muted small" id="cmd-help"></p>
        <h4>Polecenia</h4>
        <div id="cmd-list"></div>
      </section>`;
    this.tbody = root.querySelector('.rj tbody');
    this.logEl = root.querySelector('#log');
    this.alertsEl = root.querySelector('#alerts');
    this.unread = 0;
    for (const b of root.querySelectorAll('.tabs button[data-tab]')) {
      b.addEventListener('click', () => this.showTab(b.dataset.tab));
    }
    root.querySelector('.collapse-btn').addEventListener('click', () => this.collapse(true));
    this.mini = opts.miniHost || null;
    if (this.mini) {
      this.mini.addEventListener('click', (ev) => {
        const b = ev.target.closest('button'); if (!b) return;
        this.collapse(false);
        if (b.dataset.tab) this.showTab(b.dataset.tab);
      });
    }
    this.#syncMini();
    sim.bus.on('log', (e) => this.addLog(e));
    sim.bus.on('timetable', () => this.renderTimetable());
    sim.bus.on('tick', () => this.#throttled());
    sim.bus.on('block', () => this.renderState());
    sim.bus.on('route', () => this.renderState());
    sim.bus.on('alarm', (a) => this.alarm(a));
    this.renderTimetable();
    this.renderState();
    this.lastRender = 0;
    this.#initOrders();
    this.#initComms();
    this.#initCommands();
  }

  #initCommands() {
    const sim = this.sim;
    if (!sim.districts || sim.playerDistrict === 'both') return;
    this.root.querySelector('#tab-btn-polecenia').classList.remove('hidden');
    const mine = sim.districts[sim.playerDistrict];
    const isDispatcher = mine.role === 'dysponująca';
    const other = Object.keys(sim.districts).find((id) => id !== sim.playerDistrict);
    const formWrap = this.root.querySelector('#cmd-form-wrap');
    this.root.querySelector('#cmd-help').textContent = isDispatcher
      ? `Nastawnia ${other} przyjmuje i wyprawia pociągi po swojej stronie wyłącznie na Twoje polecenie (Ir-1). Melduje wykonanie przez łączność.`
      : `Polecenia dyżurnego ruchu (${other}). Wykonaj je na swoim pulpicie: daj pozwolenie sąsiadowi, nastaw przebieg na wskazany tor lub wypraw pociąg na wskazany szlak.`;
    if (!isDispatcher) { formWrap.classList.add('hidden'); }
    const trSel = this.root.querySelector('#cmd-train');
    const tkSel = this.root.querySelector('#cmd-track');
    const exSel = this.root.querySelector('#cmd-exit');
    const msg = this.root.querySelector('#cmd-msg');
    const platformTracks = [...new Set([...sim.ilk.sections.values()].filter((x) => x.kind === 'station' && x.track).map((x) => String(x.track)))];
    const candidates = () => sim.traffic.timetable().filter((e) => {
      const done = (k) => sim.commands.some((c) => String(c.nr) === String(e.nr) && c.kind === k);
      const arriving = e.from && sim.exitDistrict(e.from) === other && !done('accept') && e.status !== 'na następnym posterunku';
      const departing = e.to && sim.exitDistrict(e.to) === other && e.train && !e.train.finished && e.train.entered && !done('dispatch');
      return arriving || departing;
    }).map((e) => {
      const arriving = e.from && sim.exitDistrict(e.from) === other && !sim.commands.some((c) => String(c.nr) === String(e.nr) && c.kind === 'accept') && !(e.train && e.train.entered);
      return { e, kind: arriving ? 'accept' : 'dispatch' };
    });
    const fill = () => {
      const c = candidates();
      const cur = trSel.value;
      trSel.innerHTML = c.map(({ e, kind }) => `<option value="${e.nr}" data-kind="${kind}">${e.label} ${relationOf(e)} – ${kind === 'accept' ? `przyjąć od ${sim.station.exits[e.from].name}` : `wyprawić do ${sim.station.exits[e.to].name}`}</option>`).join('') || '<option value="">brak pociągów do polecenia</option>';
      if ([...trSel.options].some((o) => o.value === cur)) trSel.value = cur;
      upd();
    };
    const upd = () => {
      const opt = trSel.selectedOptions[0];
      const kind = opt?.dataset.kind;
      const e = sim.traffic.timetable().find((x) => String(x.nr) === trSel.value);
      this.root.querySelector('#cmd-track-wrap').classList.toggle('hidden', kind !== 'accept');
      this.root.querySelector('#cmd-exit-wrap').classList.toggle('hidden', kind !== 'dispatch');
      if (kind === 'accept') { tkSel.innerHTML = platformTracks.map((t) => `<option value="${t}">${t}</option>`).join(''); if (e) tkSel.value = String(e.track); }
      if (kind === 'dispatch') { exSel.innerHTML = Object.entries(sim.station.exits).filter(([id]) => sim.exitDistrict(id) === other).map(([id, ex]) => `<option value="${id}">${ex.label || ex.name}</option>`).join(''); if (e) exSel.value = e.to; }
    };
    trSel.addEventListener('change', upd);
    this.root.querySelector('#cmd-form').addEventListener('submit', (ev) => {
      ev.preventDefault();
      const opt = trSel.selectedOptions[0];
      if (!opt || !trSel.value) { msg.textContent = 'Brak pociągu'; msg.className = 'order-msg err'; return; }
      const kind = opt.dataset.kind;
      sim.issueCommand({ kind, nr: Number(trSel.value), track: kind === 'accept' ? tkSel.value : undefined, exit: kind === 'dispatch' ? exSel.value : undefined, from: sim.playerDistrict, to: other });
      msg.textContent = 'Polecenie wydane.'; msg.className = 'order-msg ok';
      fill(); this.renderCommands();
    });
    this.cmdUnread = 0;
    sim.bus.on('commands', () => { this.renderCommands(); if (!isDispatcher) this.#cmdBadge(); });
    sim.bus.on('comms', (m) => { if (m.kind === 'order' && !isDispatcher && this.root.querySelector('#tab-polecenia').classList.contains('hidden')) { this.cmdUnread++; this.#cmdBadge(); this.flash('polecenia'); } });
    this.refreshCommandForm = isDispatcher ? fill : () => {};
    fill(); this.renderCommands();
  }

  #cmdBadge() {
    const b = this.root.querySelector('#cmd-badge');
    if (!b) return;
    b.textContent = String(this.cmdUnread);
    b.classList.toggle('hidden', this.cmdUnread === 0);
    this.#syncMini();
  }

  renderCommands() {
    const list = this.root.querySelector('#cmd-list');
    if (!list) return;
    const cmds = [...this.sim.commands].reverse();
    list.innerHTML = cmds.length ? cmds.map((c) => `<div class="cmd ${c.status}"><span class="t">${Clock.format(c.time)}</span> nr ${c.id} · ${c.from} → ${c.to}: ${escapeHtml(c.text)} ${c.status === 'done' ? '✔' : '☐'}</div>`).join('') : '<div class="muted">brak</div>';
  }

  #initComms() {
    const toSel = this.root.querySelector('#comms-to');
    const fSel = this.root.querySelector('#comms-formula');
    const nrEl = this.root.querySelector('#comms-nr');
    const msg = this.root.querySelector('#comms-msg');
    const logEl = this.root.querySelector('#comms-log');
    const exits = [...this.sim.blocks.values()];
    toSel.innerHTML = exits.map((b) => `<option value="${b.id}">${b.neighbour} (posterunek)${b.trackLabel ? ` – ${b.trackLabel}` : ''}</option>`).join('') + '<option value="driver">maszynista (radio)</option>';
    const fillFormulas = () => {
      const to = toSel.value === 'driver' ? 'driver' : 'neighbour';
      fSel.innerHTML = this.sim.comms.available().filter((f) => f.to === to).map((f) => `<option value="${f.id}">${f.text({ nr: '…', time: '…' })}</option>`).join('');
    };
    toSel.addEventListener('change', fillFormulas); fillFormulas();
    this.root.querySelector('#comms-form').addEventListener('submit', (ev) => {
      ev.preventDefault();
      const r = this.sim.comms.send(fSel.value, { exit: toSel.value, nr: nrEl.value.trim() });
      msg.textContent = r.ok ? 'Nadano.' : (r.reason || 'Błąd');
      msg.className = `order-msg ${r.ok ? 'ok' : 'err'}`;
    });
    this.commsUnread = 0;
    this.sim.bus.on('comms-log', (m) => {
      const li = document.createElement('li');
      li.className = m.dir === 'out' ? 'out' : `in kind-${m.kind}`;
      li.innerHTML = `<span class="t">${Clock.format(m.time)}</span> <b>${escapeHtml(m.dir === 'out' ? `→ ${m.to}` : m.from)}</b>: ${escapeHtml(m.text)}`;
      logEl.prepend(li);
      if (m.dir === 'in' && this.root.querySelector('#tab-lacznosc').classList.contains('hidden')) {
        this.commsUnread++; this.#commsBadge();
        if (m.kind === 'ask' || m.kind === 'radio') this.flash('lacznosc');
      }
      if (m.dir === 'in' && m.nr && !nrEl.value) nrEl.value = m.nr;
    });
  }

  #commsBadge() {
    const b = this.root.querySelector('#comms-badge');
    b.textContent = String(this.commsUnread);
    b.classList.toggle('hidden', this.commsUnread === 0);
    this.#syncMini();
  }

  #initOrders() {
    const form = this.root.querySelector('#order-form');
    const sel = this.root.querySelector('#order-train');
    const sigEl = this.root.querySelector('#order-signal');
    const reasonEl = this.root.querySelector('#order-reason');
    const textEl = this.root.querySelector('#order-text');
    const msg = this.root.querySelector('#order-msg');
    const fill = () => {
      const nr = sel.value;
      const st = this.sim.traffic.standingTrains().find((t) => String(t.nr) === nr);
      sigEl.value = st?.signal ?? '';
      textEl.value = st?.signal ? this.sim.traffic.orderTemplate(st.nr, st.signal, reasonEl.value) : '';
    };
    sel.addEventListener('change', fill);
    reasonEl.addEventListener('input', fill);
    form.addEventListener('submit', (ev) => {
      ev.preventDefault();
      const r = this.sim.traffic.issueOrder({ nr: sel.value, signal: sigEl.value, text: textEl.value, reason: reasonEl.value });
      msg.textContent = r.ok ? `Rozkaz nr ${r.order.id} wydany.` : r.reason;
      msg.className = `order-msg ${r.ok ? 'ok' : 'err'}`;
      this.renderOrders();
    });
    this.sim.bus.on('orders', () => this.renderOrders());
    this.refreshOrderTrains = () => {
      const standing = this.sim.traffic.standingTrains();
      const cur = sel.value;
      const opts = standing.map((t) => `<option value="${t.nr}">${t.label ?? t.nr} ${relationOf(t)} – przed ${t.signal ?? '–'}</option>`).join('');
      if (sel.innerHTML !== opts) { sel.innerHTML = opts || '<option value="">brak stojących pociągów</option>'; if ([...sel.options].some((o) => o.value === cur)) sel.value = cur; fill(); }
    };
    this.refreshOrderTrains();
    this.renderOrders();
  }

  renderOrders() {
    const ol = this.root.querySelector('#orders');
    ol.innerHTML = this.sim.traffic.orders.slice().reverse().map((o) => `<li><b>Nr ${o.id}</b> · ${Clock.format(o.time)} · pociąg ${o.nr} · semafor ${o.signal}<div class="order-text">${escapeHtml(o.text)}</div></li>`).join('') || '<li class="muted">brak</li>';
  }

  /** Zwija / rozwija panel; po zwinięciu zakładki z licznikami powiadomień są w listwie narzędzi pulpitu. */
  collapse(v) {
    this.collapsed = !!v;
    document.getElementById('app').dataset.sideCollapsed = String(this.collapsed);
    this.#syncMini();
    this.opts.onToggle?.(this.collapsed);
  }

  /** Mini-zakładki: kopia przycisków panelu z aktualnymi licznikami (Dziennik, Łączność, Polecenia). */
  #syncMini() {
    if (!this.mini) return;
    const parts = [];
    for (const b of this.root.querySelectorAll('.tabs button[data-tab]')) {
      if (b.classList.contains('hidden')) continue;
      const badge = b.querySelector('.badge');
      const n = badge && !badge.classList.contains('hidden') ? `<span class="badge">${badge.textContent}</span>` : '';
      parts.push(`<button type="button" class="tb${b.classList.contains('flash') ? ' flash' : ''}" data-tab="${b.dataset.tab}">${b.firstChild.textContent.trim()}${n}</button>`);
    }
    this.mini.innerHTML = parts.join('');
  }

  showTab(id) {
    for (const b of this.root.querySelectorAll('.tabs button[data-tab]')) b.classList.toggle('active', b.dataset.tab === id);
    for (const s of this.root.querySelectorAll('.tab')) s.classList.toggle('hidden', s.id !== `tab-${id}`);
    if (id === 'log') { this.unread = 0; this.#badge(); }
    if (id === 'lacznosc') { this.commsUnread = 0; this.#commsBadge(); }
    if (id === 'polecenia') { this.cmdUnread = 0; this.#cmdBadge(); this.refreshCommandForm?.(); }
    if (id === 'rozkazy') this.refreshOrderTrains?.();
  }

  #badge() {
    const b = this.root.querySelector('#log-badge');
    b.textContent = String(this.unread);
    b.classList.toggle('hidden', this.unread === 0);
    this.#syncMini();
  }

  #throttled() {
    const now = performance.now();
    if (now - this.lastRender < 500) return;
    this.lastRender = now;
    this.renderTimetable();
    this.renderState();
    this.refreshOrderTrains?.();
    if (!this.root.querySelector('#tab-polecenia').classList.contains('hidden')) this.refreshCommandForm?.();
  }

  addLog(e) {
    const li = document.createElement('li');
    li.className = `lv-${e.level}`;
    li.innerHTML = `<span class="t">${Clock.format(e.time, true)}</span> ${escapeHtml(e.msg)}`;
    this.logEl.prepend(li);
    while (this.logEl.children.length > 200) this.logEl.lastChild.remove();
    if (!this.root.querySelector('#tab-log').classList.contains('hidden')) return;
    if (e.level !== 'info') { this.unread++; this.#badge(); }
  }

  alarm(a) {
    const div = document.createElement('div');
    div.className = `alert alert-${a.type}`;
    const texts = {
      request: () => `${this.sim.blocks.get(a.exit).neighbour} żąda pozwolenia na wyprawienie pociągu – daj pozwolenie (Poz) na blokadzie.`,
      rozprucie: () => `ROZPRUCIE zwrotnicy ${a.id}!`,
      fault: () => `USTERKA: ${a.fault.type === 'signal-fail' ? `semafor ${a.fault.target}` : a.fault.type === 'point-control' ? `zwrotnica ${a.fault.target}` : a.fault.type === 'false-occupancy' ? `odcinek ${a.fault.target}` : `blokada ${this.sim.blocks.get(a.fault.target)?.neighbour}`}`,
      phone: () => `Telefon od ${this.sim.blocks.get(a.exit).neighbour} – odpowiedz w zakładce Łączność.`,
      radio: () => `Radio: maszynista pociągu ${a.nr} melduje – zakładka Łączność.`,
    };
    div.textContent = (texts[a.type] || (() => JSON.stringify(a)))();
    this.alertsEl.prepend(div);
    setTimeout(() => div.remove(), 30000);
    this.flash();
  }

  flash(tab = 'log') {
    const b = this.root.querySelector(`[data-tab="${tab}"]`);
    b.classList.add('flash');
    this.#syncMini();
    setTimeout(() => { b.classList.remove('flash'); this.#syncMini(); }, 3000);
  }

  renderTimetable() {
    const ex = this.sim.station.exits;
    const rows = this.sim.traffic.timetable().map((e) => {
      const via = `${e.from ? ex[e.from].name : this.sim.station.name} → ${e.to ? ex[e.to].name : this.sim.station.name}`;
      const cls = e.status === 'odjechał' || e.status === 'zakończył bieg' ? 'done' : (e.train ? 'active' : '');
      const delay = e.delay > 0 ? ` <span class="delay">+${e.delay}</span>` : '';
      const cat = CATEGORIES[e.cat], brand = brandOf(e);
      return `<tr class="${cls}" title="${cat.name}${brand ? ` „${brand}”` : ''} – ${escapeHtml(relationOf(e))} · ${speedFor(e)} km/h">
        <td class="nr"><span class="cat cat-${e.cat}">${cat.label}</span> ${e.nr}</td><td class="rel">${escapeHtml(relationOf(e))}${brand ? ` <i>„${brand}”</i>` : ''}<div class="via">${via}</div></td>
        <td>${e.arr ? (e.stop ? e.arr : `<i>${e.arr}</i>`) : '–'}${e.actualArr != null ? `<div class="act">${Clock.format(e.actualArr)}</div>` : ''}</td>
        <td>${e.dep ?? (e.terminates ? 'k.b.' : '–')}${e.actualDep != null ? `<div class="act">${Clock.format(e.actualDep)}</div>` : ''}</td>
        <td>${e.track ?? ''}</td><td class="st">${e.status}${delay}</td></tr>`;
    });
    this.tbody.innerHTML = rows.join('');
    const s = this.sim.traffic.score;
    this.root.querySelector('#score').textContent = `Wyprawione punktualnie: ${s.onTime} · opóźnione: ${s.delayed} (${s.totalDelayMin} min) · dPz: ${this.sim.ilk.counters.dPz} · Sz: ${this.sim.ilk.counters.Sz}`;
  }

  renderState() {
    const bl = [...this.sim.blocks.values()].map((b) => {
      const dir = b.direction === 'out' ? 'wyjazd' : b.direction === 'in' ? 'wjazd' : '–';
      return `<div class="blk"><b>${b.def.label || b.neighbour}</b>${b.auto ? ' (samoczynna)' : ''}: kierunek ${dir}${b.permission && !b.auto ? ' (pozwolenie)' : ''}${b.request === 'theirs' ? ' · <span class="warn">żądanie pozwolenia!</span>' : b.request === 'ours' ? ' · żądanie wysłane' : ''}${b.occupied ? ' · <span class="warn">szlak zajęty</span>' : ''}${b.koPending ? ' · <span class="warn">zwolnić blok końcowy (Ko)</span>' : ''}</div>`;
    }).join('');
    this.root.querySelector('#blocks').innerHTML = bl;
    const faults = this.sim.faults?.active() || [];
    const fname = { 'signal-fail': 'semafor', 'point-control': 'zwrotnica (napęd)', 'false-occupancy': 'fałszywa zajętość', 'block-fail': 'blokada bez łączności' };
    this.root.querySelector('#faults').innerHTML = faults.length ? faults.map((f) => `<div class="warn">${fname[f.type]} ${f.type === 'block-fail' ? this.sim.blocks.get(f.target)?.neighbour : f.target}</div>`).join('') : '<span class="muted">brak</span>';
    const routes = [...this.sim.ilk.active.values()].map((a) => `<li>${a.id} (${a.route.kind === 'train' ? 'pociągowy' : 'manewrowy'})${a.timedRelease ? ' – zwalnianie czasowe' : ''}${a.trainEntered ? ' – pociąg w przebiegu' : ''}</li>`)
      .concat(this.sim.ilk.pending.map((p) => `<li>${p.route.id} – nastawianie…</li>`));
    this.root.querySelector('#routes').innerHTML = routes.join('') || '<li class="muted">brak</li>';
    const c = this.sim.ilk.counters;
    const blkCnt = [...this.sim.blocks.values()].filter((b) => b.counters.dPo || b.counters.dKo).map((b) => `${b.def.label || b.neighbour}: dPo ${b.counters.dPo} · dKo ${b.counters.dKo}`);
    this.root.querySelector('#counters').innerHTML = `dPz: ${c.dPz} · Sz: ${c.Sz} · rozprucia: ${c.rozprucie}` + (blkCnt.length ? `<div class="muted">${blkCnt.join('<br>')}</div>` : '<div class="muted">dPo / dKo: 0</div>');
    const tasks = this.sim.traffic.tasks || [];
    this.root.querySelector('#tasks').innerHTML = tasks.length
      ? tasks.map((t) => `<div class="task ${t.done ? 'done' : t.failed ? 'failed' : ''}">${t.done ? '✔' : t.failed ? '✘' : '☐'} ${escapeHtml(t.text)} <span class="muted">do ${t.deadline}</span></div>`).join('')
      : '<span class="muted">brak</span>';
    const standing = this.sim.traffic.timetable().filter((e) => e.train && !e.train.finished && e.train.v === 0 && e.train.entered);
    this.root.querySelector('#shunt').innerHTML = standing.length
      ? standing.map((e) => `<div class="shunt-row">Pociąg ${e.nr} (${e.train.mode === 'shunt' ? 'manewrowy' : 'pociągowy'}, czoło ${['E', 'NE', 'SE'].includes(e.train.direction) ? '→' : '←'}) <button data-nr="${e.nr}" data-act="${e.train.mode === 'shunt' ? 'train' : 'shunt'}">${e.train.mode === 'shunt' ? 'jazda pociągowa' : 'jazda manewrowa'}</button> <button data-nr="${e.nr}" data-act="rev">zmiana czoła</button></div>`).join('')
      : '<div class="muted">brak stojących pociągów</div>';
    for (const b of this.root.querySelectorAll('#shunt button')) {
      b.addEventListener('click', () => {
        if (b.dataset.act === 'shunt') this.sim.traffic.toShunting(b.dataset.nr);
        else if (b.dataset.act === 'train') this.sim.traffic.toTrainMode(b.dataset.nr);
        else this.sim.traffic.reverseTrain(b.dataset.nr);
        this.renderState();
      });
    }
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}
