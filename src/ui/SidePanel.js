import { CATEGORIES, brandOf, relationOf, speedFor } from '../model/categories.js';
import { Clock } from '../core/Clock.js';
import { t } from '../i18n/index.js';

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
        <button data-tab="rj" class="active">${t('sp.tab.rj')}</button>
        <button data-tab="log">${t('sp.tab.log')} <span id="log-badge" class="badge hidden">0</span></button>
        <button data-tab="stan">${t('sp.tab.stan')}</button>
        <button data-tab="rozkazy">${t('sp.tab.rozkazy')}</button>
        <button data-tab="lacznosc">${t('sp.tab.lacznosc')} <span id="comms-badge" class="badge hidden">0</span></button>
        <button data-tab="polecenia" id="tab-btn-polecenia" class="hidden">${t('sp.tab.polecenia')} <span id="cmd-badge" class="badge hidden">0</span></button>
        <button type="button" class="collapse-btn" title="${t('sp.collapse')}" aria-label="${t('sp.collapseShort')}">⇥</button>
      </nav>
      <section class="tab" id="tab-rj">
        <table class="rj"><thead><tr><th>${t('sp.col.nr')}</th><th>${t('sp.col.rel')}</th><th>${t('sp.col.arr')}</th><th>${t('sp.col.dep')}</th><th>${t('sp.col.track')}</th><th>${t('sp.col.state')}</th></tr></thead><tbody></tbody></table>
        <div class="score" id="score"></div>
      </section>
      <section class="tab hidden" id="tab-log">
        <div class="alerts" id="alerts"></div>
        <ul class="log" id="log"></ul>
      </section>
      <section class="tab hidden" id="tab-stan">
        <h4>${t('sp.faults')}</h4>
        <div id="faults" class="muted">${t('sp.none')}</div>
        <h4>${t('sp.blocks')}</h4>
        <div id="blocks"></div>
        <h4>${t('sp.routes')}</h4>
        <ul id="routes" class="plain"></ul>
        <h4>${t('sp.counters')}</h4>
        <div id="counters"></div>
        <h4>${t('sp.tasks')}</h4>
        <div id="tasks" class="muted">${t('sp.none')}</div>
        <h4>${t('sp.shunt')}</h4>
        <div id="shunt"></div>
      </section>
      <section class="tab hidden" id="tab-rozkazy">
        <h4>${t('sp.order.title')}</h4>
        <form id="order-form" class="order-form">
          <label>${t('sp.order.train')} <select name="nr" id="order-train"></select></label>
          <label>${t('sp.order.signal')} <input name="signal" id="order-signal" readonly></label>
          <label>${t('sp.order.reason')} <input name="reason" id="order-reason" value="${t('sp.order.reasonDefault')}"></label>
          <label>${t('sp.order.text')} <textarea name="text" id="order-text" rows="6"></textarea></label>
          <div class="order-actions"><button type="submit">${t('sp.order.issue')}</button> <span id="order-msg" class="order-msg"></span></div>
        </form>
        <p class="muted small">${t('sp.order.rules')}</p>
        <h4>${t('sp.order.issued')}</h4>
        <ol id="orders" class="orders"></ol>
      </section>
      <section class="tab hidden" id="tab-lacznosc">
        <form id="comms-form" class="order-form">
          <label>${t('sp.comms.to')} <select id="comms-to"></select></label>
          <label>${t('sp.comms.formula')} <select id="comms-formula"></select></label>
          <label>${t('sp.comms.train')} <input id="comms-nr" inputmode="numeric"></label>
          <div class="order-actions"><button type="submit">${t('sp.comms.send')}</button> <span id="comms-msg" class="order-msg"></span></div>
        </form>
        <p class="muted small">${t('sp.comms.rules')}</p>
        <h4>${t('sp.comms.log')}</h4>
        <ul class="log comms" id="comms-log"></ul>
      </section>
      <section class="tab hidden" id="tab-polecenia">
        <div id="cmd-form-wrap">
          <h4>${t('sp.cmd.title')}</h4>
          <form id="cmd-form" class="order-form">
            <label>${t('sp.cmd.train')} <select id="cmd-train"></select></label>
            <label id="cmd-track-wrap">${t('sp.cmd.track')} <select id="cmd-track"></select></label>
            <label id="cmd-exit-wrap">${t('sp.cmd.to')} <select id="cmd-exit"></select></label>
            <div class="order-actions"><button type="submit">${t('sp.cmd.issue')}</button> <span id="cmd-msg" class="order-msg"></span></div>
          </form>
        </div>
        <p class="muted small" id="cmd-help"></p>
        <h4>${t('sp.cmd.list')}</h4>
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
      ? t('sp.cmd.helpDispatcher', { other })
      : t('sp.cmd.helpSignalman', { other });
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
      trSel.innerHTML = c.map(({ e, kind }) => `<option value="${e.nr}" data-kind="${kind}">${e.label} ${relationOf(e)} – ${kind === 'accept' ? t('sp.cmd.accept', { name: sim.station.exits[e.from].name }) : t('sp.cmd.dispatch', { name: sim.station.exits[e.to].name })}</option>`).join('') || `<option value="">${t('sp.cmd.noTrains')}</option>`;
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
      if (!opt || !trSel.value) { msg.textContent = t('sp.cmd.noTrain'); msg.className = 'order-msg err'; return; }
      const kind = opt.dataset.kind;
      sim.issueCommand({ kind, nr: Number(trSel.value), track: kind === 'accept' ? tkSel.value : undefined, exit: kind === 'dispatch' ? exSel.value : undefined, from: sim.playerDistrict, to: other });
      msg.textContent = t('sp.cmd.issued'); msg.className = 'order-msg ok';
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
    list.innerHTML = cmds.length ? cmds.map((c) => `<div class="cmd ${c.status}"><span class="t">${Clock.format(c.time)}</span> nr ${c.id} · ${c.from} → ${c.to}: ${escapeHtml(c.text)} ${c.status === 'done' ? '✔' : '☐'}</div>`).join('') : `<div class="muted">${t('sp.none')}</div>`;
  }

  #initComms() {
    const toSel = this.root.querySelector('#comms-to');
    const fSel = this.root.querySelector('#comms-formula');
    const nrEl = this.root.querySelector('#comms-nr');
    const msg = this.root.querySelector('#comms-msg');
    const logEl = this.root.querySelector('#comms-log');
    const exits = [...this.sim.blocks.values()];
    toSel.innerHTML = exits.map((b) => `<option value="${b.id}">${b.neighbour} (${t('sp.comms.post')})${b.trackLabel ? ` – ${b.trackLabel}` : ''}</option>`).join('') + `<option value="driver">${t('sp.comms.driver')}</option>`;
    const fillFormulas = () => {
      const to = toSel.value === 'driver' ? 'driver' : 'neighbour';
      fSel.innerHTML = this.sim.comms.available().filter((f) => f.to === to).map((f) => `<option value="${f.id}">${f.text({ nr: '…', time: '…' })}</option>`).join('');
    };
    toSel.addEventListener('change', fillFormulas); fillFormulas();
    this.root.querySelector('#comms-form').addEventListener('submit', (ev) => {
      ev.preventDefault();
      const r = this.sim.comms.send(fSel.value, { exit: toSel.value, nr: nrEl.value.trim() });
      msg.textContent = r.ok ? t('sp.comms.sent') : (r.reason || t('sp.comms.error'));
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
      msg.textContent = r.ok ? t('sp.order.ok', { id: r.order.id }) : r.reason;
      msg.className = `order-msg ${r.ok ? 'ok' : 'err'}`;
      this.renderOrders();
    });
    this.sim.bus.on('orders', () => this.renderOrders());
    this.refreshOrderTrains = () => {
      const standing = this.sim.traffic.standingTrains();
      const cur = sel.value;
      const opts = standing.map((x) => `<option value="${x.nr}">${x.label ?? x.nr} ${relationOf(x)} – ${t('sp.order.before')} ${x.signal ?? '–'}</option>`).join('');
      if (sel.innerHTML !== opts) { sel.innerHTML = opts || `<option value="">${t('sp.order.noTrains')}</option>`; if ([...sel.options].some((o) => o.value === cur)) sel.value = cur; fill(); }
    };
    this.refreshOrderTrains();
    this.renderOrders();
  }

  renderOrders() {
    const ol = this.root.querySelector('#orders');
    ol.innerHTML = this.sim.traffic.orders.slice().reverse().map((o) => `<li>${t('sp.order.item', { id: o.id, time: Clock.format(o.time), nr: o.nr, signal: o.signal })}<div class="order-text">${escapeHtml(o.text)}</div></li>`).join('') || `<li class="muted">${t('sp.none')}</li>`;
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
      request: () => t('sp.alarm.request', { name: this.sim.blocks.get(a.exit).neighbour }),
      rozprucie: () => t('sp.alarm.split', { id: a.id }),
      fault: () => t('sp.alarm.fault', { what: a.fault.type === 'signal-fail' ? t('sp.alarm.fault.signal', { id: a.fault.target }) : a.fault.type === 'point-control' ? t('sp.alarm.fault.point', { id: a.fault.target }) : a.fault.type === 'false-occupancy' ? t('sp.alarm.fault.section', { id: a.fault.target }) : t('sp.alarm.fault.block', { name: this.sim.blocks.get(a.fault.target)?.neighbour }) }),
      phone: () => t('sp.alarm.phone', { name: this.sim.blocks.get(a.exit).neighbour }),
      radio: () => t('sp.alarm.radio', { nr: a.nr }),
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
      // skąd → dokąd z torem szlakowym (etykieta wyjazdu, np. „Gdynia Gł. – 202 t.2”): kolumna „tor” to tor stacyjny,
      // tu widać, którym torem szlakowym pociąg przyjeżdża i wyjeżdża
      const side = (id) => (id ? (ex[id].label || ex[id].name) : this.sim.station.name);
      const via = `${side(e.from)} → ${side(e.to)}`;
      const cls = e.status === 'odjechał' || e.status === 'zakończył bieg' ? 'done' : (e.train ? 'active' : '');
      const delay = e.delay > 0 ? ` <span class="delay">+${e.delay}</span>` : '';
      const cat = CATEGORIES[e.cat], brand = brandOf(e);
      return `<tr class="${cls}" title="${cat.name}${brand ? ` „${brand}”` : ''} – ${escapeHtml(relationOf(e))} · ${speedFor(e)} km/h">
        <td class="nr"><span class="cat cat-${e.cat}">${cat.label}</span> ${e.nr}</td><td class="rel">${escapeHtml(relationOf(e))}${brand ? ` <i>„${brand}”</i>` : ''}<div class="via">${via}</div></td>
        <td>${e.arr ? (e.stop ? e.arr : `<i>${e.arr}</i>`) : '–'}${e.actualArr != null ? `<div class="act">${Clock.format(e.actualArr)}</div>` : ''}</td>
        <td>${e.dep ?? (e.terminates ? t('rp.endsHere') : '–')}${e.actualDep != null ? `<div class="act">${Clock.format(e.actualDep)}</div>` : ''}</td>
        <td>${e.track ?? ''}</td><td class="st">${e.status}${delay}</td></tr>`;
    });
    this.tbody.innerHTML = rows.join('');
    const s = this.sim.traffic.score;
    this.root.querySelector('#score').textContent = t('sp.score', { onTime: s.onTime, delayed: s.delayed, min: s.totalDelayMin, dPz: this.sim.ilk.counters.dPz, sz: this.sim.ilk.counters.Sz });
  }

  renderState() {
    const bl = [...this.sim.blocks.values()].map((b) => {
      const dir = b.direction === 'out' ? t('sp.blk.out') : b.direction === 'in' ? t('sp.blk.in') : '–';
      return `<div class="blk"><b>${b.def.label || b.neighbour}</b>${b.auto ? t('sp.blk.auto') : ''}: ${t('sp.blk.dir')} ${dir}${b.permission && !b.auto ? t('sp.blk.perm') : ''}${b.request === 'theirs' ? ` · <span class="warn">${t('sp.blk.request')}</span>` : b.request === 'ours' ? ` · ${t('sp.blk.requested')}` : ''}${b.occupied ? ` · <span class="warn">${t('sp.blk.occupied')}</span>` : ''}${b.koPending ? ` · <span class="warn">${t('sp.blk.ko')}</span>` : ''}</div>`;
    }).join('');
    this.root.querySelector('#blocks').innerHTML = bl;
    const faults = this.sim.faults?.active() || [];
    this.root.querySelector('#faults').innerHTML = faults.length ? faults.map((f) => `<div class="warn">${t(`sp.fault.${f.type}`)} ${f.type === 'block-fail' ? this.sim.blocks.get(f.target)?.neighbour : f.target}</div>`).join('') : `<span class="muted">${t('sp.none')}</span>`;
    const routes = [...this.sim.ilk.active.values()].map((a) => `<li>${a.id} (${t(a.route.kind === 'train' ? 'sp.route.train' : 'sp.route.shunt')})${a.timedRelease ? t('sp.route.timed') : ''}${a.trainEntered ? t('sp.route.entered') : ''}</li>`)
      .concat(this.sim.ilk.pending.map((p) => `<li>${t('sp.route.setting', { id: p.route.id })}</li>`));
    this.root.querySelector('#routes').innerHTML = routes.join('') || `<li class="muted">${t('sp.none')}</li>`;
    const c = this.sim.ilk.counters;
    const blkCnt = [...this.sim.blocks.values()].filter((b) => b.counters.dPo || b.counters.dKo).map((b) => `${b.def.label || b.neighbour}: dPo ${b.counters.dPo} · dKo ${b.counters.dKo}`);
    this.root.querySelector('#counters').innerHTML = t('sp.counters.line', { dPz: c.dPz, sz: c.Sz, split: c.rozprucie }) + (blkCnt.length ? `<div class="muted">${blkCnt.join('<br>')}</div>` : `<div class="muted">${t('sp.counters.blk')}</div>`);
    const tasks = this.sim.traffic.tasks || [];
    this.root.querySelector('#tasks').innerHTML = tasks.length
      ? tasks.map((x) => `<div class="task ${x.done ? 'done' : x.failed ? 'failed' : ''}">${x.done ? '✔' : x.failed ? '✘' : '☐'} ${escapeHtml(x.text)} <span class="muted">${t('sp.task.due', { time: x.deadline })}</span></div>`).join('')
      : `<span class="muted">${t('sp.none')}</span>`;
    const standing = this.sim.traffic.timetable().filter((e) => e.train && !e.train.finished && e.train.v === 0 && e.train.entered);
    this.root.querySelector('#shunt').innerHTML = standing.length
      ? standing.map((e) => `<div class="shunt-row">${t('sp.shunt.row', { nr: e.nr, mode: t(e.train.mode === 'shunt' ? 'sp.shunt.modeShunt' : 'sp.shunt.modeTrain'), arrow: ['E', 'NE', 'SE'].includes(e.train.direction) ? '→' : '←' })} <button data-nr="${e.nr}" data-act="${e.train.mode === 'shunt' ? 'train' : 'shunt'}">${t(e.train.mode === 'shunt' ? 'sp.shunt.toTrain' : 'sp.shunt.toShunt')}</button> <button data-nr="${e.nr}" data-act="rev">${t('sp.shunt.reverse')}</button></div>`).join('')
      : `<div class="muted">${t('sp.shunt.none')}</div>`;
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
