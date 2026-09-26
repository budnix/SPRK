import { Clock } from '../core/Clock.js';

/**
 * Panel boczny: rozkład jazdy, komunikaty/dziennik, liczniki, ruch manewrowy.
 */
export class SidePanel {
  constructor(root, sim) {
    this.sim = sim;
    this.root = root;
    root.innerHTML = `
      <nav class="tabs">
        <button data-tab="rj" class="active">Rozkład jazdy</button>
        <button data-tab="log">Dziennik <span id="log-badge" class="badge hidden">0</span></button>
        <button data-tab="stan">Stan</button>
        <button data-tab="rozkazy">Rozkazy</button>
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
        <h4>Blokady liniowe</h4>
        <div id="blocks"></div>
        <h4>Przebiegi nastawione</h4>
        <ul id="routes" class="plain"></ul>
        <h4>Liczniki</h4>
        <div id="counters"></div>
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
      </section>`;
    this.tbody = root.querySelector('.rj tbody');
    this.logEl = root.querySelector('#log');
    this.alertsEl = root.querySelector('#alerts');
    this.unread = 0;
    for (const b of root.querySelectorAll('.tabs button')) {
      b.addEventListener('click', () => this.showTab(b.dataset.tab));
    }
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
      const opts = standing.map((t) => `<option value="${t.nr}">${t.nr} ${t.name} – przed ${t.signal ?? '–'}</option>`).join('');
      if (sel.innerHTML !== opts) { sel.innerHTML = opts || '<option value="">brak stojących pociągów</option>'; if ([...sel.options].some((o) => o.value === cur)) sel.value = cur; fill(); }
    };
    this.refreshOrderTrains();
    this.renderOrders();
  }

  renderOrders() {
    const ol = this.root.querySelector('#orders');
    ol.innerHTML = this.sim.traffic.orders.slice().reverse().map((o) => `<li><b>Nr ${o.id}</b> · ${Clock.format(o.time)} · pociąg ${o.nr} · semafor ${o.signal}<div class="order-text">${escapeHtml(o.text)}</div></li>`).join('') || '<li class="muted">brak</li>';
  }

  showTab(id) {
    for (const b of this.root.querySelectorAll('.tabs button')) b.classList.toggle('active', b.dataset.tab === id);
    for (const s of this.root.querySelectorAll('.tab')) s.classList.toggle('hidden', s.id !== `tab-${id}`);
    if (id === 'log') { this.unread = 0; this.#badge(); }
    if (id === 'rozkazy') this.refreshOrderTrains?.();
  }

  #badge() {
    const b = this.root.querySelector('#log-badge');
    b.textContent = String(this.unread);
    b.classList.toggle('hidden', this.unread === 0);
  }

  #throttled() {
    const now = performance.now();
    if (now - this.lastRender < 500) return;
    this.lastRender = now;
    this.renderTimetable();
    this.renderState();
    this.refreshOrderTrains?.();
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
    div.textContent = a.type === 'request'
      ? `${this.sim.blocks.get(a.exit).neighbour} żąda pozwolenia na wyprawienie pociągu – naciśnij Poz na blokadzie.`
      : a.type === 'rozprucie' ? `ROZPRUCIE zwrotnicy ${a.id}!` : JSON.stringify(a);
    this.alertsEl.prepend(div);
    setTimeout(() => div.remove(), 30000);
    this.flash();
  }

  flash() {
    const b = this.root.querySelector('[data-tab="log"]');
    b.classList.add('flash');
    setTimeout(() => b.classList.remove('flash'), 3000);
  }

  renderTimetable() {
    const ex = this.sim.station.exits;
    const rows = this.sim.traffic.timetable().map((e) => {
      const rel = `${e.from ? ex[e.from].name : this.sim.station.name} → ${e.to ? ex[e.to].name : this.sim.station.name}`;
      const cls = e.status === 'odjechał' || e.status === 'zakończył bieg' ? 'done' : (e.train ? 'active' : '');
      const delay = e.delay > 0 ? ` <span class="delay">+${e.delay}</span>` : '';
      return `<tr class="${cls}" title="${e.name} ${e.nr}">
        <td class="nr">${e.nr}</td><td class="rel">${rel}</td>
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
      return `<div class="blk"><b>${b.neighbour}</b>: kierunek ${dir}${b.permission ? ' (pozwolenie)' : ''}${b.request === 'theirs' ? ' · <span class="warn">żądanie pozwolenia!</span>' : b.request === 'ours' ? ' · żądanie wysłane' : ''}${b.occupied ? ' · <span class="warn">szlak zajęty</span>' : ''}${b.koPending ? ' · <span class="warn">obsłuż Ko</span>' : ''}</div>`;
    }).join('');
    this.root.querySelector('#blocks').innerHTML = bl;
    const routes = [...this.sim.ilk.active.values()].map((a) => `<li>${a.id} (${a.route.kind === 'train' ? 'pociągowy' : 'manewrowy'})${a.timedRelease ? ' – zwalnianie czasowe' : ''}${a.trainEntered ? ' – pociąg w przebiegu' : ''}</li>`)
      .concat(this.sim.ilk.pending.map((p) => `<li>${p.route.id} – nastawianie…</li>`));
    this.root.querySelector('#routes').innerHTML = routes.join('') || '<li class="muted">brak</li>';
    const c = this.sim.ilk.counters;
    this.root.querySelector('#counters').innerHTML = `dPz: ${c.dPz} · Sz: ${c.Sz} · rozprucia: ${c.rozprucie}`;
    const standing = this.sim.traffic.timetable().filter((e) => e.train && !e.train.finished && e.train.v === 0 && e.train.entered);
    this.root.querySelector('#shunt').innerHTML = standing.length
      ? standing.map((e) => `<div class="shunt-row">Pociąg ${e.nr} (${e.train.mode === 'shunt' ? 'manewrowy' : 'pociągowy'}) <button data-nr="${e.nr}" data-act="shunt">jazda manewrowa</button> <button data-nr="${e.nr}" data-act="rev">zmiana czoła</button></div>`).join('')
      : '<div class="muted">brak stojących pociągów</div>';
    for (const b of this.root.querySelectorAll('#shunt button')) {
      b.addEventListener('click', () => {
        if (b.dataset.act === 'shunt') this.sim.traffic.toShunting(b.dataset.nr);
        else this.sim.traffic.reverseTrain(b.dataset.nr);
        this.renderState();
      });
    }
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}
