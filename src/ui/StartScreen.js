import { STATIONS } from '../stations/index.js';
import { DISRUPTION_LEVELS } from '../core/Random.js';
import { difficultyMark, logoSvg } from './brand.js';
import { getSrk } from '../srk/registry.js';
import { stationThumbnail } from '../render/thumbnail.js';
import { getMission } from '../tutorial/missions.js';
import { t } from '../i18n/index.js';
import { escapeHtml as esc } from './dom.js';
import { initDialog, openDialog, closeDialog } from './dialog.js';

const SORT_KEY = 'sprk.startSort';

/** Posterunki w kolejności: alfabetycznie (domyślnie) lub wg trudności (skala 1–5), potem alfabetycznie. */
export function sortStations(stations, by) {
  const byName = (a, b) => a.name.localeCompare(b.name, 'pl');
  return [...stations].sort(by === 'difficulty' ? (a, b) => (a.difficulty || 0) - (b.difficulty || 0) || byName(a, b) : byName);
}

/** Posterunki do służby: bez stacji szkoleniowych (tych, które mają misję) – te są tylko w misjach wprowadzających. */
export function dutyStations(stations) {
  return stations.filter((st) => !(st.scenarios || []).some((sc) => sc.tutorial));
}

/** Misje wprowadzające: scenariusze z polem `tutorial`, w kolejności definicji. */
export function missionList(stations) {
  const out = [];
  for (const st of stations) for (const sc of st.scenarios || []) if (sc.tutorial) out.push({ station: st, scenario: sc });
  return out;
}

/** Nazwa misji bez numeru („Misja 1:”) i dopisku „(samouczek)” – numer dodaje ekran startowy. */
export function missionName(scenario) {
  return scenario.name.replace(/\s*\(samouczek\)/, '').replace(/^Misja\s+\d+:\s*/, '');
}

/** Stanowiska posterunku wg zmian bez samouczka (scenariusz może wymuszać swoje); pusta lista scenariuszy = stanowisko stacji. */
export function stationViews(station) {
  const scs = (station.scenarios || []).filter((sc) => !sc.tutorial);
  return [...new Set((scs.length ? scs.map((sc) => sc.srk || station.srk) : [station.srk]).map((id) => getSrk(id).view))];
}

/** Etykieta karty posterunku dla rodzaju stanowiska (`view` strategii srk). */
const VIEW_BADGE = { screen: 'start.srkScreen', desk: 'start.srkDesk', izh: 'start.srkIzh', lever: 'start.srkMech', ebi: 'start.srkEbi' };

/** Krótka etykieta stanowiska na karcie posterunku; przy różnych stanowiskach w zmianach – „do wyboru”. */
export function srkBadge(station) {
  const views = stationViews(station);
  if (views.length > 1) return t('start.srkBoth');
  return t(VIEW_BADGE[views[0]] || VIEW_BADGE.desk);
}

/**
 * Ekran startowy: misje wprowadzające (liniowe) u góry, niżej lista posterunków z opisem położenia, ruchu
 * i trudnością (skala 1–5), sortowana alfabetycznie lub wg trudności. Kliknięcie posterunku rozwija parametry
 * zmiany (okręg, scenariusz, zakłócenia, ziarno). Uruchamia zmianę przez parametry URL.
 */
export class StartScreen {
  constructor(root, current = {}) {
    this.root = root;
    this.current = current;
    initDialog(root, t('app.tagline'));
    let sort = 'name';
    try { sort = localStorage.getItem(SORT_KEY) || 'name'; } catch { /* prywatny tryb */ }
    this.sort = sort === 'difficulty' ? 'difficulty' : 'name';
    const missions = missionList(STATIONS);
    root.innerHTML = `<div class="start-screen">
      <header class="st-hero">
        <div class="st-logo">${logoSvg()}</div>
        <div class="st-tagline">${t('app.tagline')}</div>
        <div class="st-sub">${t('start.sub')}</div>
        ${current.scenario ? `<button type="button" class="tb st-close" id="st-close">${t('start.back')}</button>` : ''}
      </header>
      <div class="st-layout">
        <nav class="st-left" aria-label="${t('start.nav')}">
          <section class="st-missions">
            <h3><span class="st-kicker">${t('start.training')}</span>${t('start.missions')}</h3>
            <div class="st-mission-list">${missions.map((m, i) => `<button type="button" class="st-mission" data-station="${m.station.id}" data-scenario="${m.scenario.id}" data-idx="${i}">
                <span class="st-mthumb">${stationThumbnail(m.station, { w: 240, h: 90 })}<span class="st-no">${i + 1}</span></span>
                <span class="st-mbody"><span class="st-mtitle">${esc(t('start.mission', { n: i + 1, name: missionName(m.scenario) }))}</span><span class="st-mdesc">${esc(m.scenario.description || '')}</span></span></button>`).join('')}</div>
          </section>
          <section class="st-stations">
            <div class="st-head"><h3><span class="st-kicker">${t('start.duty')}</span>${t('start.stations')}</h3>
              <div class="seg st-sort" aria-label="${t('start.sortLabel')}"><button type="button" class="tb" data-sort="name">${t('start.sortName')}</button><button type="button" class="tb" data-sort="difficulty">${t('start.sortDiff')}</button></div></div>
            <div id="st-list" class="st-list"></div>
          </section>
        </nav>
        <div class="st-arrow" aria-hidden="true"><span class="st-rail"></span><span class="st-chev">›</span><span class="st-rail"></span></div>
        <aside id="st-briefing" class="st-briefing">
          <div class="st-bplaceholder"><div class="st-bpicon">‹</div><div>${t('start.placeholder')}</div></div>
          <div class="st-bcontent hidden">
            <div class="st-bthumb"></div>
            <div class="st-btitle"><span class="st-bname"></span><span class="st-bdiff"></span></div>
            <div class="st-bmeta"></div>
            <div id="st-params" class="st-params">
              <p class="muted" id="st-station-desc"></p>
              <div class="st-form">
                <label id="st-district-wrap" class="hidden">${t('start.district')} <select id="st-district"></select></label>
                <p class="muted" id="st-district-desc"></p>
                <label>${t('start.scenario')} <select id="st-scenario"></select></label>
                <p class="muted" id="st-scenario-desc"></p>
                <label>${t('start.level')}
                  <select id="st-level">${Object.keys(DISRUPTION_LEVELS).map((k) => `<option value="${k}">${t(`level.${k}`)}</option>`).join('')}</select>
                </label>
                <label>${t('start.seed')} <input id="st-seed" inputmode="numeric" placeholder="${t('start.seedPh')}"></label>
              </div>
              <div class="order-actions"><button type="button" id="st-go" class="tb primary st-go">${t('start.go')}</button></div>
            </div>
          </div>
        </aside>
      </div>
    </div>`;
    this.params = root.querySelector('#st-params');
    this.briefing = root.querySelector('#st-briefing');
    this.list = root.querySelector('#st-list');
    root.querySelector('#st-level').value = current.level || 'low';
    root.querySelector('#st-close')?.addEventListener('click', () => this.hide());
    this.missions = missions;
    root.querySelector('.st-mission-list').addEventListener('click', (ev) => {
      const b = ev.target.closest('.st-mission'); if (!b) return;
      this.selectMission(Number(b.dataset.idx));
    });
    // karta posterunku ma rolę przycisku – działa też z klawiatury (Enter, spacja)
    this.list.addEventListener('keydown', (ev) => {
      if (ev.key !== 'Enter' && ev.key !== ' ') return;
      const card = ev.target.closest('.st-card'); if (!card) return;
      ev.preventDefault();
      this.select(card.dataset.id);
    });
    for (const b of root.querySelectorAll('.st-sort button')) b.addEventListener('click', () => this.setSort(b.dataset.sort));
    this.list.addEventListener('click', (ev) => {
      const card = ev.target.closest('.st-card'); if (!card) return;
      this.select(card.dataset.id);
    });
    root.querySelector('#st-go').addEventListener('click', () => {
      if (this.mission) { this.#go(this.mission.station.id, this.mission.scenario.id, 'none'); return; }
      const p = new URLSearchParams();
      p.set('stacja', this.selected); p.set('scenariusz', root.querySelector('#st-scenario').value); p.set('zaklocenia', root.querySelector('#st-level').value);
      if (!root.querySelector('#st-district-wrap').classList.contains('hidden')) p.set('okreg', root.querySelector('#st-district').value);
      const seed = root.querySelector('#st-seed').value.trim();
      if (seed) p.set('seed', seed);
      location.search = p.toString();
    });
    this.renderList();
    if (current.station && dutyStations(STATIONS).some((s) => s.id === current.station)) this.select(current.station, false);
  }

  setSort(by) {
    this.sort = by === 'difficulty' ? 'difficulty' : 'name';
    try { localStorage.setItem(SORT_KEY, this.sort); } catch { /* ignoruj */ }
    this.renderList();
    if (this.selected) this.select(this.selected, false);
  }

  renderList() {
    for (const b of this.root.querySelectorAll('.st-sort button')) b.classList.toggle('active', b.dataset.sort === this.sort);
    this.list.innerHTML = sortStations(dutyStations(STATIONS), this.sort).map((s) => `<div class="st-card" data-id="${s.id}" role="button" tabindex="0">
        <div class="st-thumb">${stationThumbnail(s, { w: 320, h: 100 })}</div>
        <div class="st-body">
          <div class="st-row"><span class="st-name">${esc(s.name)}</span>${difficultyMark(s.difficulty)}</div>
          <div class="st-loc">${esc(s.location || '')}</div>
          <div class="st-chips"><span class="st-srk${stationViews(s).length > 1 ? ' st-srk-both' : ''}">${srkBadge(s)}</span>${s.districts ? `<span class="st-srk">${t('start.twoDistricts')}</span>` : ''}<span class="st-srk">${t('start.scen', { n: (s.scenarios || []).filter((x) => !x.tutorial).length })}</span></div>
          <div class="st-traffic">${esc(s.traffic || '')}</div>
        </div>
      </div>`).join('');
  }

  /** Odprawa misji wprowadzającej: opis, liczba kroków, przycisk startu (bez parametrów zmiany). */
  selectMission(i) {
    const m = this.missions[i]; if (!m) return;
    this.mission = m; this.selected = null;
    this.#mark('.st-mission', (el) => Number(el.dataset.idx) === i);
    const b = this.#openBriefing(m.station, t('start.mission', { n: i + 1, name: missionName(m.scenario) }));
    const btn = this.root.querySelector(`.st-mission[data-idx="${i}"]`);
    if (window.innerWidth < 900) { btn.after(b); b.scrollIntoView({ block: 'start', behavior: 'smooth' }); } else this.root.querySelector('.st-layout').appendChild(b);
    const steps = getMission(m.scenario.tutorial)?.steps().length;
    b.querySelector('.st-bdiff').innerHTML = `${difficultyMark(1)} <small>${t('start.tutorial')}${steps ? ` · ${t('start.steps', { n: steps })}` : ''}</small>`;
    b.querySelector('.st-bmeta').innerHTML = `<div>${esc(m.station.name)} – ${esc(m.station.location || '')}</div>`;
    this.root.querySelector('#st-station-desc').textContent = m.scenario.description || '';
    this.root.querySelector('.st-form').classList.add('hidden');
    this.root.querySelector('#st-go').textContent = t('start.goMission');
  }

  /** Zaznacza posterunek i pokazuje odprawę (briefing) z parametrami zmiany. */
  select(id, scroll = true) {
    const st = STATIONS.find((s) => s.id === id); if (!st) return;
    this.selected = id; this.mission = null;
    const root = this.root;
    this.#mark('.st-card', (el) => el.dataset.id === id);
    const card = this.list.querySelector(`.st-card[data-id="${id}"]`);
    const b = this.#openBriefing(st, st.name);
    b.querySelector('.st-bdiff').innerHTML = difficultyMark(st.difficulty, t('start.difficulty'));
    b.querySelector('.st-bmeta').innerHTML = `<div>${esc(st.location || '')}</div><div>${esc(st.traffic || '')}</div>`;
    root.querySelector('.st-form').classList.remove('hidden');
    root.querySelector('#st-go').textContent = t('start.go');
    const narrow = window.innerWidth < 900;
    root.querySelector('#st-station-desc').textContent = `${st.description || ''} ${t('start.srkInfo', { info: st.srkInfo || getSrk(st.srk).name })}`;
    const dw = root.querySelector('#st-district-wrap'), dSel = root.querySelector('#st-district');
    if (st.districts) {
      dw.classList.remove('hidden');
      dSel.innerHTML = Object.entries(st.districts).map(([did, d]) => `<option value="${did}">${esc(d.name)}</option>`).join('') + `<option value="both">${t('start.bothDistricts')}</option>`;
      if (this.current.district && this.current.station === id) dSel.value = this.current.district;
      const updD = () => {
        const d = st.districts[dSel.value];
        root.querySelector('#st-district-desc').textContent = t(!d ? 'start.bothDesc' : d.role === 'dysponująca' ? 'start.dispatcherDesc' : 'start.signalmanDesc');
      };
      dSel.onchange = updD; updD();
    } else { dw.classList.add('hidden'); root.querySelector('#st-district-desc').textContent = ''; }
    const scSel = root.querySelector('#st-scenario'), lvSel = root.querySelector('#st-level');
    // samouczki są na liście misji u góry – w wyborze scenariusza tylko zmiany
    const scs = (st.scenarios || [{ id: 'zmiana', name: t('start.fullShift') }]).filter((sc) => !sc.tutorial);
    scSel.innerHTML = scs.map((sc) => `<option value="${sc.id}">${esc(sc.name)}</option>`).join('');
    if (this.current.scenario && this.current.station === id && scs.some((sc) => sc.id === this.current.scenario)) scSel.value = this.current.scenario;
    else if (scs[0]) scSel.value = scs[0].id;
    const upd = () => {
      const sc = scs.find((x) => x.id === scSel.value);
      root.querySelector('#st-scenario-desc').textContent = sc?.description || '';
      lvSel.disabled = !!sc?.disruptions;
      if (sc?.disruptions) lvSel.value = sc.disruptions;
    };
    scSel.onchange = upd; upd();
    // na wąskim ekranie odprawa staje pod wybraną kartą; na szerokim – w swojej kolumnie obok listy
    if (narrow) card.after(this.briefing); else root.querySelector('.st-layout').appendChild(this.briefing);
    if (scroll && narrow) this.briefing.scrollIntoView({ block: 'start', behavior: 'smooth' });
    else if (scroll) card.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  #mark(selector, isActive) {
    for (const el of this.root.querySelectorAll('.st-mission, .st-card')) el.classList.toggle('active', el.matches(selector) && isActive(el));
  }

  /** Wspólna część odprawy: miniatura, tytuł; zwraca element odprawy. */
  #openBriefing(station, title) {
    const b = this.briefing;
    b.classList.add('open');
    b.querySelector('.st-bplaceholder').classList.add('hidden');
    b.querySelector('.st-bcontent').classList.remove('hidden');
    b.querySelector('.st-bthumb').innerHTML = stationThumbnail(station, { w: 480, h: 150 });
    b.querySelector('.st-bname').textContent = title;
    return b;
  }

  #go(station, scenario, level) {
    const p = new URLSearchParams();
    p.set('stacja', station); p.set('scenariusz', scenario); p.set('zaklocenia', level);
    location.search = p.toString();
  }

  /** Otwarcie ekranu czyści parametry URL (odświeżenie strony zostaje na wyborze scenariusza); powrót do zmiany je przywraca. */
  show() {
    if (location.search) { this.savedSearch = location.search; history.replaceState(null, '', location.pathname); }
    openDialog(this.root);
  }
  hide() {
    if (this.savedSearch && !location.search) history.replaceState(null, '', location.pathname + this.savedSearch);
    this.savedSearch = null;
    closeDialog(this.root);
  }
}
