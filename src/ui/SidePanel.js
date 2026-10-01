import { CATEGORIES, brandOf, categoryLabel, relationOf, speedFor } from '../model/categories.js';
import { stockFor } from '../model/rollingStock.js';
import { faultAlarm, faultListText } from './faultText.js';
import { Clock } from '../core/Clock.js';
import { t } from '../i18n/index.js';
import { frontIcon, modeIcon, uiIcon } from './icons.js';
import { setHtmlIfChanged, escapeHtml } from './dom.js';

/**
 * Panel boczny: rozkład jazdy, komunikaty/dziennik, liczniki, ruch manewrowy.
 */
export class SidePanel {
  /**
   * opts: { tabsHost – element listwy narzędzi na zakładki panelu (jedyne zakładki; liczniki powiadomień i miganie tam),
   *         onToggle(collapsed) }
   */
  constructor(root, sim, opts = {}) {
    this.sim = sim;
    this.root = root;
    this.opts = opts;
    root.innerHTML = `
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
        <h4>${t('sp.pointsOnSite')}</h4>
        <div id="points-onsite"></div>
        <h4>${t('sp.blocks')}</h4>
        <div id="blocks"></div>
        <h4>${t('sp.routes')}</h4>
        <ul id="routes" class="plain"></ul>
        <h4>${t('sp.counters')}</h4>
        <div id="counters"></div>
      </section>
      <section class="tab hidden" id="tab-pociagi">
        <p class="muted small">${t('sp.trains.intro')}</p>
        <div id="trains"></div>
      </section>
      <section class="tab hidden" id="tab-zadania">
        <div class="tasks-head"><b id="tasks-scenario"></b><span id="tasks-progress" class="muted"></span></div>
        <p class="muted small" id="tasks-desc"></p>
        <div id="tasks"></div>
      </section>
      <section class="tab hidden" id="tab-rozkazy">
        <h4>${t('sp.order.title')}</h4>
        <form id="order-form" class="order-form">
          <label>${t('sp.order.train')} <select name="nr" id="order-train"></select></label>
          <label>${t('sp.order.signal')} <input name="signal" id="order-signal" readonly></label>
          <label>${t('sp.order.reason')} <input name="reason" id="order-reason" value="${t('sp.order.reasonDefault')}"></label>
          <label>${t('sp.order.text')} <textarea name="text" id="order-text" rows="6"></textarea></label>
          <div class="order-actions"><button type="submit" class="tb primary">${t('sp.order.issue')}</button> <span id="order-msg" class="order-msg"></span></div>
        </form>
        <p class="muted small">${t('sp.order.rules')}</p>
        <h4>${t('sp.order.issued')}</h4>
        <ol id="orders" class="orders"></ol>
      </section>
      <section class="tab hidden" id="tab-lacznosc">
        <label class="comms-notify"><input type="checkbox" id="comms-notify"> ${t('sp.comms.notify')}</label>
        <form id="comms-form" class="order-form">
          <label>${t('sp.comms.to')} <select id="comms-to"></select></label>
          <label>${t('sp.comms.formula')} <select id="comms-formula"></select></label>
          <label>${t('sp.comms.train')} <input id="comms-nr" inputmode="numeric"></label>
          <div class="order-actions"><button type="submit" class="tb primary">${t('sp.comms.send')}</button> <span id="comms-msg" class="order-msg"></span></div>
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
            <div class="order-actions"><button type="submit" class="tb primary">${t('sp.cmd.issue')}</button> <span id="cmd-msg" class="order-msg"></span></div>
          </form>
        </div>
        <p class="muted small" id="cmd-help"></p>
        <h4>${t('sp.cmd.list')}</h4>
        <div id="cmd-list"></div>
      </section>`;
    // powiadomienia z łączności (licznik i podświetlenie zakładki) – domyślnie włączone; można je wyłączyć, np. przy
    // automatycznych rozmowach, żeby nie odrywały od gry (zapamiętane w ustawieniach przez `onCommsNotify`)
    this.commsNotify = opts.commsNotify !== false;
    const notify = root.querySelector('#comms-notify');
    notify.checked = this.commsNotify;
    notify.addEventListener('change', () => {
      this.commsNotify = notify.checked;
      if (!this.commsNotify) { this.commsUnread = 0; this.#commsBadge(); this.tabs.querySelector('button[data-tab="lacznosc"]')?.classList.remove('flash'); }
      opts.onCommsNotify?.(this.commsNotify);
    });
    this.tbody = root.querySelector('.rj tbody');
    this.logEl = root.querySelector('#log');
    this.alertsEl = root.querySelector('#alerts');
    this.unread = 0;
    // zakładki panelu żyją w listwie narzędzi (nad panelem); bez hosta – zapasowo w samym panelu
    this.tabs = opts.tabsHost || root.insertBefore(document.createElement('nav'), root.firstChild);
    this.tabs.classList.add('panel-tabs');
    this.tabs.innerHTML = [['rj'], ['log', 'log-badge'], ['zadania', 'tasks-badge', !(sim.traffic.tasks || []).length], ['pociagi'], ['stan'], ['rozkazy'], ['lacznosc', 'comms-badge'], ['polecenia', 'cmd-badge', true]]
      .map(([id, badge, hidden]) => `<button type="button" class="tb${id === 'rj' ? ' active' : ''}${hidden ? ' hidden' : ''}" data-tab="${id}"${id === 'polecenia' ? ' id="tab-btn-polecenia"' : ''}><span class="tab-label">${t(`sp.tab.${id}`)}</span>${badge ? ` <span id="${badge}" class="badge hidden">0</span>` : ''}</button>`).join('');
    this.tabs.addEventListener('click', (ev) => {
      const b = ev.target.closest('button[data-tab]'); if (!b) return;
      this.collapse(false);
      this.showTab(b.dataset.tab);
    });
    sim.bus.on('log', (e) => this.addLog(e));
    sim.bus.on('timetable', () => { this.renderTimetable(); this.renderTrains(); }); // zmiana statusu pociągu (wjazd, postój, odjazd) od razu w „Pociągach”
    sim.bus.on('tick', () => this.#throttled());
    sim.bus.on('block', () => this.renderState());
    sim.bus.on('route', () => this.renderState());
    sim.bus.on('point', () => this.renderState());
    // zabezpieczenie zwrotnicy na miejscu – polecenie dla pracownika (nie przycisk pulpitu), wspólne dla stanowisk
    this.root.querySelector('#points-onsite').addEventListener('click', (ev) => {
      const b = ev.target.closest('button[data-point]');
      if (!b) return;
      const res = sim.execute({ type: 'point-secure', id: b.dataset.point, on: b.dataset.on === '1' });
      if (res && !res.ok) this.addLog({ time: sim.clock.time, level: 'warn', msg: res.reason });
      this.renderState();
    });
    sim.bus.on('alarm', (a) => this.alarm(a));
    this.renderTimetable();
    this.renderState();
    this.renderTrains();
    this.lastRender = 0;
    this.#initOrders();
    this.#initComms();
    this.#initCommands();
    this.#initTasks();
  }

  #initCommands() {
    const sim = this.sim;
    if (!sim.districts || sim.playerDistrict === 'both') return;
    this.tabs.querySelector('#tab-btn-polecenia').classList.remove('hidden');
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

  /** Zakładka „Zadania”: zadania manewrowe scenariusza (część misji) z postępem; powiadomienie, gdy zadanie zostanie wykonane lub przepadnie. */
  #initTasks() {
    const sim = this.sim;
    this.root.querySelector('#tasks-scenario').textContent = sim.scenario?.name || '';
    this.root.querySelector('#tasks-desc').textContent = sim.scenario?.description || '';
    this.tasksUnread = 0;
    this.renderTasks();
    sim.bus.on('tasks', () => {
      this.renderTasks();
      if (this.root.querySelector('#tab-zadania').classList.contains('hidden')) { this.tasksUnread++; this.#tasksBadge(); this.flash('zadania'); }
    });
  }

  renderTasks() {
    const tasks = this.sim.traffic.tasks || [];
    const now = this.sim.clock.time;
    this.root.querySelector('#tasks-progress').textContent = tasks.length ? t('sp.tasks.progress', { done: tasks.filter((x) => x.done).length, n: tasks.length }) : '';
    const host = this.root.querySelector('#tasks');
    const html = tasks.length ? tasks.map((x, i) => {
      const prev = x.afterTask ? tasks.find((y) => y.id === x.afterTask) : null;
      const waiting = !x.done && !x.failed && ((prev && !prev.done) || (x.afterTime && now < x.afterTime));
      const state = x.done ? 'done' : x.failed ? 'failed' : waiting ? 'waiting' : 'active';
      const status = x.done ? t(x.doneAt > x.deadlineTime ? 'sp.tasks.doneLate' : 'sp.tasks.done', { time: Clock.format(x.doneAt) })
        : x.failed ? t('sp.tasks.failed') : waiting ? t('sp.tasks.waiting') : t('sp.tasks.active');
      const meta = [x.unit ? t('sp.tasks.unit', { unit: x.unit }) : '', x.toTrack ? t('sp.tasks.track', { track: x.toTrack }) : '', x.after ? t('sp.tasks.from', { time: x.after }) : '', x.deadline ? t('sp.task.due', { time: x.deadline }) : '', prev ? t('sp.tasks.afterTask', { n: tasks.indexOf(prev) + 1 }) : ''].filter(Boolean).join(' · ');
      return `<div class="task-card ${state}" data-task="${escapeHtml(x.id)}"><span class="task-no">${i + 1}</span><span class="task-mark">${uiIcon(x.done ? 'check' : x.failed ? 'cross' : waiting ? 'wait' : 'todo', 13)}</span><div class="task-body"><div class="task-text">${escapeHtml(x.text)}</div><div class="task-meta muted">${meta}</div><div class="task-status">${status}</div></div></div>`;
    }).join('') : `<div class="muted">${t('sp.tasks.none')}</div>`;
    setHtmlIfChanged(host, html);
  }

  #tasksBadge() {
    const b = this.tabs.querySelector('#tasks-badge');
    b.textContent = String(this.tasksUnread);
    b.classList.toggle('hidden', this.tasksUnread === 0);
  }

  #cmdBadge() {
    const b = this.tabs.querySelector('#cmd-badge');
    b.textContent = String(this.cmdUnread);
    b.classList.toggle('hidden', this.cmdUnread === 0);
  }

  renderCommands() {
    const list = this.root.querySelector('#cmd-list');
    if (!list) return;
    const cmds = [...this.sim.commands].reverse();
    list.innerHTML = cmds.length ? cmds.map((c) => `<div class="cmd ${c.status}"><span class="t">${Clock.format(c.time)}</span> nr ${c.id} · ${c.from} → ${c.to}: ${escapeHtml(c.text)} ${uiIcon(c.status === 'done' ? 'check' : 'todo', 12)}</div>`).join('') : `<div class="muted">${t('sp.none')}</div>`;
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
      if (m.dir === 'in' && this.commsNotify && this.root.querySelector('#tab-lacznosc').classList.contains('hidden')) {
        this.commsUnread++; this.#commsBadge();
        if (m.kind === 'ask' || m.kind === 'radio') this.flash('lacznosc');
      }
      if (m.dir === 'in' && m.nr && !nrEl.value) nrEl.value = m.nr;
    });
  }

  #commsBadge() {
    const b = this.tabs.querySelector('#comms-badge');
    b.textContent = String(this.commsUnread);
    b.classList.toggle('hidden', this.commsUnread === 0);
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
      textEl.value = st?.signal ? this.sim.traffic.orderTemplate(st.nr, st.signal, reasonEl.value || undefined, st.behind) : '';
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
      const opts = standing.map((x) => `<option value="${x.nr}">${escapeHtml(String(x.label ?? x.nr))} ${escapeHtml(relationOf(x))} – ${t(x.behind ? 'sp.order.behind' : 'sp.order.before')} ${escapeHtml(x.signal ?? '–')}</option>`).join('');
      if (sel.innerHTML !== opts) { sel.innerHTML = opts || `<option value="">${t('sp.order.noTrains')}</option>`; if ([...sel.options].some((o) => o.value === cur)) sel.value = cur; fill(); }
    };
    this.refreshOrderTrains();
    this.renderOrders();
  }

  renderOrders() {
    const ol = this.root.querySelector('#orders');
    ol.innerHTML = this.sim.traffic.orders.slice().reverse().map((o) => `<li>${t('sp.order.item', { id: o.id, time: Clock.format(o.time), nr: o.nr, signal: o.signal })}<div class="order-text">${escapeHtml(o.text)}</div></li>`).join('') || `<li class="muted">${t('sp.none')}</li>`;
  }

  /** Zwija / rozwija panel; zakładki z licznikami powiadomień zostają w listwie narzędzi. */
  collapse(v) {
    if (this.collapsed === !!v) return; // bez zmiany stanu (np. kliknięcie zakładki przy rozwiniętym panelu) – nic się nie dzieje
    this.collapsed = !!v;
    document.getElementById('app').dataset.sideCollapsed = String(this.collapsed);
    this.opts.onToggle?.(this.collapsed);
  }

  showTab(id) {
    for (const b of this.tabs.querySelectorAll('button[data-tab]')) b.classList.toggle('active', b.dataset.tab === id);
    for (const s of this.root.querySelectorAll('.tab')) s.classList.toggle('hidden', s.id !== `tab-${id}`);
    if (id === 'log') { this.unread = 0; this.#badge(); }
    if (id === 'lacznosc') { this.commsUnread = 0; this.#commsBadge(); }
    if (id === 'polecenia') { this.cmdUnread = 0; this.#cmdBadge(); this.refreshCommandForm?.(); }
    if (id === 'zadania') { this.tasksUnread = 0; this.#tasksBadge(); this.renderTasks(); }
    if (id === 'pociagi') this.renderTrains();
    if (id === 'rozkazy') this.refreshOrderTrains?.();
  }

  #badge() {
    const b = this.tabs.querySelector('#log-badge');
    b.textContent = String(this.unread);
    b.classList.toggle('hidden', this.unread === 0);
  }

  #throttled() {
    const now = performance.now();
    if (now - this.lastRender < 500) return;
    this.lastRender = now;
    this.renderTimetable();
    this.renderState();
    if (!this.root.querySelector('#tab-zadania').classList.contains('hidden')) this.renderTasks();
    if (!this.root.querySelector('#tab-pociagi').classList.contains('hidden')) this.renderTrains();
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
      fault: () => faultAlarm(a.fault, this.sim),
      phone: () => t('sp.alarm.phone', { name: this.sim.blocks.get(a.exit).neighbour }),
      radio: () => t('sp.alarm.radio', { nr: a.nr }),
    };
    div.textContent = (texts[a.type] || (() => JSON.stringify(a)))();
    this.alertsEl.prepend(div);
    setTimeout(() => div.remove(), 30000);
    this.flash();
  }

  flash(tab = 'log') {
    const b = this.tabs.querySelector(`button[data-tab="${tab}"]`);
    b.classList.add('flash');
    setTimeout(() => b.classList.remove('flash'), 3000);
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
      // długość pociągu i (towarowy) masa brutto składu
      const consist = e.length ? ` · ${escapeHtml(t(e.mass ? 'sp.consistMass' : 'sp.consist', { length: e.length, mass: e.mass }))}` : '';
      // tabor (zespół trakcyjny albo lokomotywa) – losowany na zmianę, tylko do pokazania
      const stock = this.stockText(e);
      // podpowiedź o pociągu tylko na numerze pociągu (nie na całym wierszu – przeszkadzała przy godzinach i torze)
      const tip = `${cat.name}${brand ? ` „${brand}”` : ''} – ${escapeHtml(relationOf(e))} · ${speedFor(e)} km/h${consist}${stock ? ` · ${escapeHtml(stock)}` : ''}`;
      return `<tr class="${cls}">
        <td class="nr" title="${tip}"><span class="cat cat-${e.cat}">${escapeHtml(categoryLabel(e))}</span> ${e.nr}</td><td class="rel">${escapeHtml(relationOf(e))}${brand ? ` <i>„${brand}”</i>` : ''}<div class="via">${via}</div></td>
        <td>${e.arr ? (e.stop ? e.arr : `<i>${e.arr}</i>`) : '–'}${e.actualArr != null ? `<div class="act">${Clock.format(e.actualArr)}</div>` : ''}</td>
        <td>${e.dep ?? (e.terminates ? t('rp.endsHere') : '–')}${e.actualDep != null ? `<div class="act">${Clock.format(e.actualDep)}</div>` : ''}</td>
        <td>${e.track ?? ''}</td><td class="st">${e.status}${delay}</td></tr>`;
    });
    this.tbody.innerHTML = rows.join('');
    const s = this.sim.traffic.score;
    this.root.querySelector('#score').textContent = t('sp.score', { onTime: s.onTime, delayed: s.delayed, min: s.totalDelayMin, dPz: this.sim.ilk.counters.dPz, sz: this.sim.ilk.counters.Sz });
  }

  /** Tabor pociągu jako tekst („skład: 2 × EN57”, „lokomotywa ET22”) albo pusty, gdy katalog nie ma typu dla pociągu. */
  stockText(e) {
    const st = stockFor(e, this.sim.traffic.timetable(), this.sim.seed);
    return st ? t(st.unit ? 'sp.stock.unit' : 'sp.stock.loco', { set: st.label }) : '';
  }

  renderState() {
    const bl = [...this.sim.blocks.values()].map((b) => {
      const dir = b.direction === 'out' ? t('sp.blk.out') : b.direction === 'in' ? t('sp.blk.in') : '–';
      return `<div class="blk"><b>${b.def.label || b.neighbour}</b>${b.auto ? t('sp.blk.auto') : ''}: ${t('sp.blk.dir')} ${dir}${b.permission && !b.auto ? t('sp.blk.perm') : ''}${b.request === 'theirs' ? ` · <span class="warn">${t('sp.blk.request')}</span>` : b.request === 'ours' ? ` · ${t('sp.blk.requested')}` : ''}${b.occupied ? ` · <span class="warn">${t('sp.blk.occupied')}</span>` : ''}${b.koPending ? ` · <span class="warn">${t('sp.blk.ko')}</span>` : ''}</div>`;
    }).join('');
    this.root.querySelector('#blocks').innerHTML = bl;
    const faults = this.sim.faults?.active() || [];
    this.root.querySelector('#faults').innerHTML = faults.length ? faults.map((f) => `<div class="warn">${faultListText(f, this.sim)}</div>`).join('') : `<span class="muted">${t('sp.none')}</span>`;
    // zwrotnice bez kontroli położenia i zabezpieczone na miejscu (zamek trzpieniowy / spona)
    const pts = [...this.sim.ilk.points.values()].filter((p) => (!p.control && !p.moving) || p.secured || p.securing);
    setHtmlIfChanged(this.root.querySelector('#points-onsite'), pts.length ? pts.map((p) => {
      const state = p.secured ? t('sp.point.secured', { pos: p.position }) : p.securing ? t('sp.point.securing', { time: Clock.format(p.securing) }) : t('sp.point.noControl');
      const btn = p.secured || p.securing
        ? `<button type="button" class="tb" data-point="${escapeHtml(p.id)}" data-on="0">${t('sp.point.unsecure')}</button>`
        : `<button type="button" class="tb" data-point="${escapeHtml(p.id)}" data-on="1">${t('sp.point.secure')}</button>`;
      return `<div class="point-onsite${p.control ? '' : ' warn'}"><b>${t('sp.point.name', { id: escapeHtml(p.id) })}</b> · ${state} ${btn}</div>`;
    }).join('') : `<span class="muted">${t('sp.none')}</span>`);
    const routes = [...this.sim.ilk.active.values()].map((a) => `<li>${a.id} (${t(a.route.kind === 'train' ? 'sp.route.train' : 'sp.route.shunt')})${a.timedRelease ? t('sp.route.timed') : ''}${a.trainEntered ? t('sp.route.entered') : ''}</li>`)
      .concat(this.sim.ilk.pending.map((p) => `<li>${t('sp.route.setting', { id: p.route.id })}</li>`));
    this.root.querySelector('#routes').innerHTML = routes.join('') || `<li class="muted">${t('sp.none')}</li>`;
    const c = this.sim.ilk.counters;
    const blkCnt = [...this.sim.blocks.values()].filter((b) => b.counters.dPo || b.counters.dKo).map((b) => `${b.def.label || b.neighbour}: dPo ${b.counters.dPo} · dKo ${b.counters.dKo}`);
    this.root.querySelector('#counters').innerHTML = t('sp.counters.line', { dPz: c.dPz, sz: c.Sz, split: c.rozprucie }) + (blkCnt.length ? `<div class="muted">${blkCnt.join('<br>')}</div>` : `<div class="muted">${t('sp.counters.blk')}</div>`);
  }

  /** Zakładka „Pociągi”: każdy pociąg na posterunku ze stanem (jedzie / stoi i dlaczego, tor, czoło, tryb) i sterowaniem po zatrzymaniu. */
  renderTrains() {
    const sim = this.sim;
    const onStation = sim.traffic.timetable().filter((e) => e.train && e.train.entered && !e.train.finished);
    const host = this.root.querySelector('#trains');
    const html = onStation.length ? onStation.map((e) => {
      const tr = e.train;
      const tracks = [...new Set([...tr.occupiedSections()].map((id) => sim.ilk.sections.get(id)?.track).filter(Boolean))];
      const ended = e.terminates && tr.hasStopped && tr.mode === 'train';
      const where = tr.v > 0 ? t('sp.trains.moving', { v: Math.round(tr.v * 3.6) })
        : ended ? t('sp.trains.ended')
        : tr.state === 'dwell' ? t('sp.trains.dwell', { time: e.dep ?? '–' })
        : tr.stoppedAt?.kind === 'signal' ? t('sp.trains.atSignal', { signal: tr.stoppedAt.signal })
        : tr.stoppedAt?.kind === 'platform' ? t('sp.trains.atPlatform')
        : tr.stoppedAt?.kind === 'end' ? t('sp.trains.atEnd')
        : tr.stoppedAt?.kind === 'spad' ? t('sp.trains.afterSpad', { signal: tr.stoppedAt.signal }) : t('sp.trains.stopped');
      const meta = [`${modeIcon(tr.mode)} ${t(tr.mode === 'shunt' ? 'sp.shunt.modeShunt' : 'sp.shunt.modeTrain')}`, tracks.length ? t('sp.trains.track', { track: tracks.join(', ') }) : '', `${frontIcon(tr.direction)} ${t('sp.trains.front')}`].filter(Boolean).join(' · ');
      // dlaczego stoi (po godzinie odjazdu albo przed sygnalizatorem) – kod z modelu, tekst przez t()
      const why = sim.traffic.waitReason(e, sim.clock.time);
      const wait = why ? `<div class="train-wait">${escapeHtml(t(`sp.wait.${why.code}`, { signal: why.signal ?? '', neighbour: why.neighbour ?? '' }))}</div>` : '';
      const stock = this.stockText(e);
      const canControl = tr.v === 0;
      const cls = `train-card${tr.v > 0 ? ' moving' : ''}${tr.mode === 'shunt' ? ' shunt' : ''}`;
      return `<div class="${cls}" data-nr="${e.nr}">
        <div class="train-head"><span class="cat cat-${e.cat}">${escapeHtml(categoryLabel(e))}</span> ${e.nr}<span class="rel">${escapeHtml(relationOf(e))}</span>${e.delay > 0 ? ` <span class="delay">+${e.delay}</span>` : ''}</div>
        <div class="train-state"><b>${escapeHtml(where)}</b> · ${meta}${e.status && !where.toLowerCase().startsWith(e.status.toLowerCase()) ? ` · ${escapeHtml(e.status)}` : ''}</div>${wait}${stock ? `<div class="train-stock">${escapeHtml(stock)}</div>` : ''}
        <div class="train-actions">${canControl ? `<button type="button" class="tb" data-nr="${e.nr}" data-act="${tr.mode === 'shunt' ? 'train' : 'shunt'}">${t(tr.mode === 'shunt' ? 'sp.shunt.toTrain' : 'sp.shunt.toShunt')}</button><button type="button" class="tb" data-nr="${e.nr}" data-act="rev">${t('sp.shunt.reverse')}</button>` : ''}</div>
      </div>`;
    }).join('') : `<div class="muted">${t('sp.trains.none')}</div>`;
    if (!setHtmlIfChanged(host, html)) return; // bez zmian – nie przebudowuj DOM (stabilne przyciski)
    for (const b of host.querySelectorAll('button')) {
      b.addEventListener('click', () => {
        if (b.dataset.act === 'shunt') sim.traffic.toShunting(b.dataset.nr);
        else if (b.dataset.act === 'train') sim.traffic.toTrainMode(b.dataset.nr);
        else sim.traffic.reverseTrain(b.dataset.nr);
        this.renderTrains();
      });
    }
  }
}
