import { STATIONS } from '../stations/index.js';
import { DISRUPTION_LEVELS } from '../core/Random.js';
import { getSrk } from '../srk/registry.js';

const SORT_KEY = 'sprk.startSort';

/** Posterunki w kolejności: alfabetycznie (domyślnie) lub wg trudności (gwiazdki), potem alfabetycznie. */
export function sortStations(stations, by) {
  const byName = (a, b) => a.name.localeCompare(b.name, 'pl');
  return [...stations].sort(by === 'difficulty' ? (a, b) => (a.difficulty || 0) - (b.difficulty || 0) || byName(a, b) : byName);
}

/** Misje wprowadzające: scenariusze z polem `tutorial`, w kolejności definicji. */
export function missionList(stations) {
  const out = [];
  for (const st of stations) for (const sc of st.scenarios || []) if (sc.tutorial) out.push({ station: st, scenario: sc });
  return out;
}

/** Krótka etykieta stanowiska na karcie posterunku. */
export function srkBadge(srkId) {
  return getSrk(srkId).view === 'screen' ? 'komputerowe · monitor' : 'typ E · pulpit kostkowy';
}

export function stars(d) {
  const n = Math.max(0, Math.min(5, Number(d) || 0));
  return '★'.repeat(n) + '☆'.repeat(5 - n);
}

function esc(s) { return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

/**
 * Ekran startowy: misje wprowadzające (liniowe) u góry, niżej lista posterunków z opisem położenia, ruchu
 * i trudnością (gwiazdki), sortowana alfabetycznie lub wg trudności. Kliknięcie posterunku rozwija parametry
 * zmiany (okręg, scenariusz, zakłócenia, ziarno). Uruchamia zmianę przez parametry URL.
 */
export class StartScreen {
  constructor(root, current = {}) {
    this.root = root;
    this.current = current;
    let sort = 'name';
    try { sort = localStorage.getItem(SORT_KEY) || 'name'; } catch { /* prywatny tryb */ }
    this.sort = sort === 'difficulty' ? 'difficulty' : 'name';
    const missions = missionList(STATIONS);
    root.innerHTML = `<div class="modal-box start">
      <h2>SPRK – nowa zmiana</h2>
      <section class="st-missions">
        <h3>Misje wprowadzające</h3>
        <p class="muted">Samouczek krok po kroku: liniowy rozkład, dymki przy elementach, każdy skrót (Poz, Wbl, Ko, Pz, Sz…) do kliknięcia. Zacznij tu, jeśli nie prowadziłeś ruchu.</p>
        <div class="st-mission-list">${missions.map((m, i) => `<button type="button" class="st-mission" data-station="${m.station.id}" data-scenario="${m.scenario.id}">
            <span class="st-no">${i + 1}</span><span class="st-mtitle">${esc(m.scenario.name)}</span><span class="st-mdesc">${esc(m.scenario.description || '')}</span></button>`).join('')}</div>
      </section>
      <section class="st-stations">
        <div class="st-head"><h3>Posterunki</h3>
          <div class="seg st-sort" aria-label="Kolejność posterunków"><button type="button" class="tb" data-sort="name">alfabetycznie</button><button type="button" class="tb" data-sort="difficulty">wg trudności</button></div></div>
        <div id="st-list" class="st-list"></div>
      </section>
      <div id="st-params" class="st-params hidden">
        <p class="muted" id="st-station-desc"></p>
        <label id="st-district-wrap" class="hidden">Okręg nastawczy (stanowisko) <select id="st-district"></select></label>
        <p class="muted" id="st-district-desc"></p>
        <label>Scenariusz <select id="st-scenario"></select></label>
        <p class="muted" id="st-scenario-desc"></p>
        <label>Zakłócenia (opóźnienia, usterki)
          <select id="st-level">${Object.entries(DISRUPTION_LEVELS).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('')}</select>
        </label>
        <label>Ziarno losowe (puste = losowe) <input id="st-seed" inputmode="numeric" placeholder="np. 42"></label>
        <div class="order-actions"><button type="button" id="st-go" class="tb primary">Rozpocznij zmianę</button></div>
      </div>
    </div>`;
    this.params = root.querySelector('#st-params');
    this.list = root.querySelector('#st-list');
    root.querySelector('#st-level').value = current.level || 'low';
    root.querySelector('.st-mission-list').addEventListener('click', (ev) => {
      const b = ev.target.closest('.st-mission'); if (!b) return;
      this.#go(b.dataset.station, b.dataset.scenario, 'none');
    });
    for (const b of root.querySelectorAll('.st-sort button')) b.addEventListener('click', () => this.setSort(b.dataset.sort));
    this.list.addEventListener('click', (ev) => {
      const card = ev.target.closest('.st-card'); if (!card || ev.target.closest('#st-params')) return;
      this.select(card.dataset.id);
    });
    root.querySelector('#st-go').addEventListener('click', () => {
      const p = new URLSearchParams();
      p.set('stacja', this.selected); p.set('scenariusz', root.querySelector('#st-scenario').value); p.set('zaklocenia', root.querySelector('#st-level').value);
      if (!root.querySelector('#st-district-wrap').classList.contains('hidden')) p.set('okreg', root.querySelector('#st-district').value);
      const seed = root.querySelector('#st-seed').value.trim();
      if (seed) p.set('seed', seed);
      location.search = p.toString();
    });
    this.renderList();
    if (current.station && STATIONS.some((s) => s.id === current.station)) this.select(current.station, false);
  }

  setSort(by) {
    this.sort = by === 'difficulty' ? 'difficulty' : 'name';
    try { localStorage.setItem(SORT_KEY, this.sort); } catch { /* ignoruj */ }
    this.renderList();
    if (this.selected) this.select(this.selected, false);
  }

  renderList() {
    for (const b of this.root.querySelectorAll('.st-sort button')) b.classList.toggle('active', b.dataset.sort === this.sort);
    this.list.innerHTML = sortStations(STATIONS, this.sort).map((s) => `<div class="st-card" data-id="${s.id}" role="button" tabindex="0">
        <div class="st-row"><span class="st-name">${esc(s.name)}</span><span class="st-srk">${srkBadge(s.srk)}</span><span class="st-stars" title="trudność ${s.difficulty || '?'}/5">${stars(s.difficulty)}</span></div>
        <div class="st-loc">${esc(s.location || '')}</div>
        <div class="st-traffic">${esc(s.traffic || '')}</div>
      </div>`).join('');
  }

  /** Zaznacza posterunek i rozwija pod nim parametry zmiany. */
  select(id, scroll = true) {
    const st = STATIONS.find((s) => s.id === id); if (!st) return;
    this.selected = id;
    const root = this.root;
    for (const c of this.list.querySelectorAll('.st-card')) c.classList.toggle('active', c.dataset.id === id);
    const card = this.list.querySelector(`.st-card[data-id="${id}"]`);
    card.appendChild(this.params);
    this.params.classList.remove('hidden');
    root.querySelector('#st-station-desc').textContent = `${st.description || ''} Urządzenia srk: ${st.srkInfo || getSrk(st.srk).name}`;
    const dw = root.querySelector('#st-district-wrap'), dSel = root.querySelector('#st-district');
    if (st.districts) {
      dw.classList.remove('hidden');
      dSel.innerHTML = Object.entries(st.districts).map(([did, d]) => `<option value="${did}">${esc(d.name)}</option>`).join('') + '<option value="both">oba okręgi jednoosobowo (bez poleceń)</option>';
      if (this.current.district && this.current.station === id) dSel.value = this.current.district;
      const updD = () => {
        const d = st.districts[dSel.value];
        root.querySelector('#st-district-desc').textContent = !d ? 'Obsługujesz oba pulpity sam.'
          : d.role === 'dysponująca' ? 'Jesteś dyżurnym ruchu dysponującym: obsługujesz ten pulpit i wydajesz polecenia nastawni wykonawczej (automat), która przyjmuje i wyprawia pociągi po swojej stronie tylko na Twoje polecenie.'
          : 'Jesteś nastawniczym: obsługujesz ten pulpit i wykonujesz polecenia dyżurnego ruchu (automat) – pozwolenia, przebiegi wjazdowe i wyjazdowe po swojej stronie.';
      };
      dSel.onchange = updD; updD();
    } else { dw.classList.add('hidden'); root.querySelector('#st-district-desc').textContent = ''; }
    const scSel = root.querySelector('#st-scenario'), lvSel = root.querySelector('#st-level');
    const scs = st.scenarios || [{ id: 'zmiana', name: 'Pełna zmiana' }];
    scSel.innerHTML = scs.map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join('');
    if (this.current.scenario && this.current.station === id && scs.some((s) => s.id === this.current.scenario)) scSel.value = this.current.scenario;
    else { const first = scs.find((s) => !s.tutorial); if (first) scSel.value = first.id; }
    const upd = () => {
      const sc = scs.find((s) => s.id === scSel.value);
      root.querySelector('#st-scenario-desc').textContent = sc?.description || '';
      lvSel.disabled = !!sc?.disruptions;
      if (sc?.disruptions) lvSel.value = sc.disruptions;
    };
    scSel.onchange = upd; upd();
    if (scroll) card.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  #go(station, scenario, level) {
    const p = new URLSearchParams();
    p.set('stacja', station); p.set('scenariusz', scenario); p.set('zaklocenia', level);
    location.search = p.toString();
  }

  show() { this.root.classList.remove('hidden'); }
  hide() { this.root.classList.add('hidden'); }
}
