import { STATIONS } from '../stations/index.js';
import { DISRUPTION_LEVELS } from '../core/Random.js';
import { difficultyMark, logoSvg, signalSvg } from './brand.js';
import { getSrk } from '../srk/registry.js';
import { stationThumbnail } from '../render/thumbnail.js';
import { getMission } from '../tutorial/missions.js';
import { REGIONS } from '../model/regions.js';
import { t } from '../i18n/index.js';
import { escapeHtml as esc } from './dom.js';
import { uiIcon } from './icons.js';
import { initDialog, openDialog, closeDialog, isOpen } from './dialog.js';
import {
  dutyStations, stationSrks, editionsOf, placesOf, searchStations, filterStations, regionCounts, erasOf, parseRoute, routeHash,
  parentRoute, bestResult, missionDone,
} from './catalog.js';
import { loadProgress, loadLastShift } from './progress.js';

export { dutyStations } from './catalog.js';

const SORT_KEY = 'sprk.startSort';

/** Posterunki w kolejności: alfabetycznie (domyślnie) lub wg trudności (skala 1–5), potem alfabetycznie. */
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

/** Nazwa misji bez numeru („Misja 1:”) i dopisku „(samouczek)” – numer dodaje ekran startowy. */
export function missionName(scenario) {
  return scenario.name.replace(/\s*\(samouczek\)/, '').replace(/^Misja\s+\d+:\s*/, '');
}

/** Stanowiska posterunku wg zmian bez samouczka (scenariusz może wymuszać swoje); pusta lista scenariuszy = stanowisko stacji. */
export function stationViews(station) {
  return [...new Set(stationSrks(station).map((id) => getSrk(id).view))];
}

/** Etykieta karty posterunku dla rodzaju stanowiska (`view` strategii srk). */
const VIEW_BADGE = { screen: 'start.srkScreen', desk: 'start.srkDesk', izh: 'start.srkIzh', lever: 'start.srkMech', ebi: 'start.srkEbi', mor: 'start.srkMor' };

/** Krótka etykieta rodzaju stanowiska (filtr, zakładka ery) dla systemu srk. */
export function srkLabel(srkId) {
  return t(VIEW_BADGE[getSrk(srkId).view] || VIEW_BADGE.desk);
}

/** Krótka etykieta stanowiska na karcie posterunku; przy różnych stanowiskach w zmianach – „do wyboru”. */
export function srkBadge(station) {
  const views = stationViews(station);
  if (views.length > 1) return t('start.srkBoth');
  return t(VIEW_BADGE[views[0]] || VIEW_BADGE.desk);
}

/**
 * Zakładki ery na stronie stacji (bez DOM – test w Node): jedna na edycję miejsca, „rok · stanowisko”, bieżąca
 * zaznaczona; przy jednej edycji – nic.
 */
export function eraTabs(editions, currentId) {
  if (editions.length < 2) return '';
  return `<nav class="st-eras" aria-label="${t('start.era')}">${editions.map((st) => {
    const cur = st.id === currentId;
    return `<a class="st-era${cur ? ' active' : ''}" href="${routeHash({ view: 'station', id: st.id })}" data-id="${esc(st.id)}"${cur ? ' aria-current="page"' : ''}><b>${st.era ?? t('start.eraToday')}</b> · ${esc(srkLabel(stationSrks(st)[0]))}</a>`;
  }).join('')}</nav>`;
}

/** Ocena jak mała pieczątka (karta, strona stacji) – barwa z oceny. */
function stamp(best, cls = '') {
  return best ? `<span class="st-stamp grade-${best.grade} ${cls}" title="${esc(t('start.best', { grade: t(`grade.${best.grade}`), pts: best.total }))}">${esc(t(`grade.${best.grade}`))}</span>` : '';
}

/**
 * Ekran wyboru jak w grze – kilka ekranów z własnymi adresami (`catalog.parseRoute`, przycisk „wstecz” przeglądarki):
 * tytuł (ostatnia zmiana, służba, szkolenie, ustawienia), szkolenie (misje na torze, odprawa), służba (lista posterunków
 * z wyszukiwarką i filtrami), region i strona stacji (zakładki ery, wybór zmiany, start). Uruchamia zmianę przez
 * parametry URL (bez części „#”).
 */
export class StartScreen {
  constructor(root, current = {}, { onSettings = null } = {}) {
    this.root = root;
    this.current = current;
    this.onSettings = onSettings;
    initDialog(root, t('app.tagline'));
    let sort = 'name';
    try { sort = localStorage.getItem(SORT_KEY) || 'name'; } catch { /* prywatny tryb */ }
    this.sort = sort === 'difficulty' ? 'difficulty' : 'name';
    this.missions = missionList(STATIONS);
    this.filters = { query: '', srk: [], difficulty: [], era: null, region: null, notPlayed: false };
    root.innerHTML = `<div class="start-screen">
      <header class="st-hero">
        <a class="st-logo" href="#/" aria-label="${t('start.home')}">${logoSvg()}</a>
        <div class="st-tagline" id="st-title" tabindex="-1">${t('app.tagline')}</div>
        <nav class="st-sub st-crumbs" id="st-crumbs" aria-label="${t('start.crumbs')}"></nav>
        <div class="st-heroact">
          <button type="button" class="tb st-up hidden" id="st-up">${t('start.up')}</button>
          ${current.scenario ? `<button type="button" class="tb st-close" id="st-close">${t('start.back')}</button>` : ''}
        </div>
      </header>
      <div id="st-view" class="st-view"></div>
    </div>`;
    this.view = root.querySelector('#st-view');
    root.querySelector('#st-close')?.addEventListener('click', () => this.hide());
    root.querySelector('#st-up').addEventListener('click', () => this.navigate(parentRoute(this.route, STATIONS)));
    // Esc: piętro wyżej (w trakcie zmiany Esc zamyka cały ekran – main.js); „/” – wyszukiwarka
    root.addEventListener('keydown', (ev) => {
      const inField = ev.target.closest?.('input, select, textarea');
      if (ev.key === 'Escape' && !inField && !this.current.scenario && this.route && this.route.view !== 'title') {
        ev.preventDefault(); this.navigate(parentRoute(this.route, STATIONS));
      } else if (ev.key === '/' && !inField && this.root.querySelector('#st-search')) {
        ev.preventDefault(); this.root.querySelector('#st-search').focus();
      }
    });
    // adres jest jedynym źródłem stanu ekranu: zmiana „#…” (klik, wstecz / dalej w przeglądarce) rysuje ekran
    window.addEventListener('hashchange', () => {
      const hash = location.hash;
      if (!hash || hash === '#') {
        if (isOpen(this.root) && this.current.scenario) this.hide();
        else if (isOpen(this.root)) this.render({ view: 'title' });
        return;
      }
      if (!isOpen(this.root)) this.show(parseRoute(hash));
      else this.render(parseRoute(hash));
    });
  }

  navigate(route) {
    const hash = routeHash(route);
    if (location.hash === hash) this.render(route); else location.hash = hash;
  }

  /** Rysuje ekran adresu `route`: nagłówek (tytuł, okruszki, „wstecz”) i treść. */
  render(route) {
    if (route.view === 'station' && !dutyStations(STATIONS).some((s) => s.id === route.id)) route = { view: 'service', mode: 'list' };
    if (route.view === 'service' && route.mode === 'map') route = { view: 'service', mode: 'list' }; // mapa – osobny krok
    this.route = route;
    this.progress = loadProgress();
    const crumbs = [];
    const home = { label: t('start.home'), route: { view: 'title' } };
    let title = t('app.tagline');
    switch (route.view) {
      case 'training':
        title = t('start.training');
        crumbs.push(home, { label: t('start.training'), route: { view: 'training' } });
        this.#renderTraining(route.mission);
        break;
      case 'service':
        title = t('start.duty');
        crumbs.push(home, { label: t('start.duty'), route });
        this.#renderService();
        break;
      case 'region':
        title = REGIONS[route.region];
        crumbs.push(home, { label: t('start.duty'), route: { view: 'service', mode: 'list' } }, { label: REGIONS[route.region], route });
        this.#renderRegion(route.region);
        break;
      case 'station': {
        const st = STATIONS.find((s) => s.id === route.id);
        title = st.name;
        crumbs.push(home, { label: t('start.duty'), route: { view: 'service', mode: 'list' } });
        if (st.region) crumbs.push({ label: REGIONS[st.region], route: { view: 'region', region: st.region } });
        crumbs.push({ label: st.name, route });
        this.#renderStation(st);
        break;
      }
      default:
        this.#renderTitle();
    }
    this.root.querySelector('#st-title').textContent = title;
    this.root.querySelector('#st-crumbs').innerHTML = route.view === 'title' ? esc(t('start.sub'))
      : crumbs.map((c, i) => (i === crumbs.length - 1 ? `<span aria-current="page">${esc(c.label)}</span>` : `<a href="${routeHash(c.route)}">${esc(c.label)}</a>`)).join('<span class="st-sep" aria-hidden="true">›</span>');
    this.root.querySelector('#st-up').classList.toggle('hidden', route.view === 'title');
    this.root.dataset.view = route.view;
    if (isOpen(this.root) && !this.root.contains(document.activeElement)) this.root.querySelector('#st-title').focus({ preventScroll: true });
    this.root.scrollTop = 0;
  }

  // --- tytuł ------------------------------------------------------------------------------------------------------

  #renderTitle() {
    const duty = dutyStations(STATIONS);
    const regions = Object.keys(regionCounts(duty)).map((r) => REGIONS[r]);
    const done = this.missions.filter((m) => missionDone(this.progress, m.station.id, m.scenario.id)).length;
    const last = this.#lastShift();
    const inner = (kicker, name, sub) => `<span class="st-tile-lamp" aria-hidden="true"></span><span class="st-kicker">${esc(kicker)}</span>
        <span class="st-tile-name">${esc(name)}</span><span class="st-tile-sub">${esc(sub)}</span>`;
    this.view.innerHTML = `<div class="st-title-screen">
      <nav class="st-menu" aria-label="${t('start.menu')}">
        ${last ? `<button type="button" class="st-tile st-tile-last" id="st-last">${inner(t('start.lastKicker'), last.name, last.sub)}</button>` : ''}
        <a class="st-tile primary" id="st-service" href="#/sluzba">${inner(t('start.duty'), t('start.stations'), t('start.serviceSub', { n: duty.length, regions: regions.join(', ') }))}</a>
        <a class="st-tile" id="st-training" href="#/szkolenie">${inner(t('start.training'), t('start.missions'), t('start.trainingSub', { done, n: this.missions.length }))}</a>
        <button type="button" class="st-tile" id="st-settings">${inner(t('start.settingsKicker'), t('start.settings'), t('start.settingsSub'))}</button>
      </nav>
      <div class="st-title-art" aria-hidden="true">${signalSvg('go', 150)}</div>
    </div>`;
    this.view.querySelector('#st-last')?.addEventListener('click', () => { location.href = location.pathname + last.search; });
    this.view.querySelector('#st-settings').addEventListener('click', () => this.onSettings?.());
  }

  /** Ostatnia zmiana z pamięci przeglądarki – nazwa posterunku i zmiany (pominięta, gdy stacji już nie ma). */
  #lastShift() {
    const last = loadLastShift(); if (!last) return null;
    const p = new URLSearchParams(last.search);
    const st = STATIONS.find((s) => s.id === p.get('stacja'));
    const sc = st?.scenarios?.find((x) => x.id === p.get('scenariusz'));
    if (!st || !sc) return null;
    const level = p.get('zaklocenia');
    const name = sc.tutorial ? t('start.mission', { n: this.missions.findIndex((m) => m.scenario === sc) + 1, name: missionName(sc) }) : st.name;
    const sub = sc.tutorial ? st.name : [sc.name, level && level !== 'none' ? `${t('start.levelShort')}: ${t(`level.${level}`)}` : ''].filter(Boolean).join(' · ');
    return { search: last.search, name, sub };
  }

  // --- szkolenie --------------------------------------------------------------------------------------------------

  #renderTraining(n) {
    this.mission = null;
    this.view.innerHTML = `<div class="st-layout">
        <nav class="st-left" aria-label="${t('start.nav')}">
          <section class="st-missions">
            <h3><span class="st-kicker">${t('start.training')}</span>${t('start.missions')}</h3>
            <div class="st-mission-list">${this.missions.map((m, i) => {
              const done = missionDone(this.progress, m.station.id, m.scenario.id);
              return `<button type="button" class="st-mission${done ? ' done' : ''}" data-station="${m.station.id}" data-scenario="${m.scenario.id}" data-idx="${i}">
                <span class="st-mthumb">${stationThumbnail(m.station, { w: 240, h: 90 })}<span class="st-no">${i + 1}</span></span>
                <span class="st-mbody"><span class="st-mtitle">${esc(t('start.mission', { n: i + 1, name: missionName(m.scenario) }))}</span><span class="st-mdesc">${esc(m.scenario.description || '')}</span>${done ? `<span class="st-done">${uiIcon('check', 12)} ${t('start.missionDone')}</span>` : ''}</span></button>`;
            }).join('')}</div>
          </section>
        </nav>
        <div class="st-arrow" aria-hidden="true"><span class="st-rail"></span>${signalSvg('stop', 54)}<span class="st-rail"></span></div>
        ${this.#briefingHtml()}
      </div>`;
    this.view.querySelector('.st-mission-list').addEventListener('click', (ev) => {
      const b = ev.target.closest('.st-mission'); if (!b) return;
      this.navigate({ view: 'training', mission: Number(b.dataset.idx) + 1 });
    });
    this.#bindGo();
    if (n && this.missions[n - 1]) this.#selectMission(n - 1);
  }

  /** Odprawa: miniatura, tytuł, opis i parametry zmiany (scenariusz, okręg, zakłócenia, ziarno) z przyciskiem startu. */
  #briefingHtml({ open = false, station = null } = {}) {
    return `<aside id="st-briefing" class="st-briefing${open ? ' open' : ''}">
        <div class="st-bplaceholder${open ? ' hidden' : ''}">${signalSvg('stop', 96)}<div>${t('start.placeholder')}</div></div>
        <div class="st-bcontent${open ? '' : ' hidden'}">
          <div class="st-bthumb"></div>
          <div class="st-btitle"><span class="st-bname"></span><span class="st-bdiff"></span></div>
          ${station ? eraTabs(editionsOf(STATIONS, station), station.id) : ''}
          <div class="st-bmeta"></div>
          <p class="muted st-bdesc" id="st-station-desc"></p>
          <div class="st-best"></div>
          <div id="st-params" class="st-params">
            <div class="st-form">
              <label id="st-district-wrap" class="hidden">${t('start.district')} <select id="st-district"></select></label>
              <p class="muted" id="st-district-desc"></p>
              <label>${t('start.scenario')} <select id="st-scenario"></select></label>
              <p class="muted" id="st-scenario-desc"></p>
              <label>${t('start.level')}
                <select id="st-level">${Object.keys(DISRUPTION_LEVELS).map((k) => `<option value="${k}">${t(`level.${k}`)}</option>`).join('')}</select>
              </label>
              <details class="st-adv"><summary>${t('start.advanced')}</summary>
                <label>${t('start.seed')} <input id="st-seed" inputmode="numeric" placeholder="${t('start.seedPh')}"></label>
              </details>
            </div>
            <div class="order-actions"><button type="button" id="st-go" class="tb primary st-go">${t('start.go')}</button></div>
          </div>
        </div>
      </aside>`;
  }

  #bindGo() {
    const root = this.view;
    root.querySelector('#st-level').value = this.current.level || 'low';
    root.querySelector('#st-go').addEventListener('click', () => {
      const scId = root.querySelector('#st-scenario').value;
      // odprawa misji: samouczek albo pełna zmiana tej stacji szkoleniowej na wybranym stanowisku
      if (this.mission && scId === this.mission.scenario.id) { this.#go(this.mission.station.id, scId, 'none'); return; }
      const extra = {};
      if (!root.querySelector('#st-district-wrap').classList.contains('hidden')) extra.okreg = root.querySelector('#st-district').value;
      const seed = root.querySelector('#st-seed').value.trim();
      if (seed) extra.seed = seed;
      this.#go(this.mission ? this.mission.station.id : this.selected, scId, root.querySelector('#st-level').value, extra);
    });
  }

  /** Odprawa misji wprowadzającej: opis, liczba kroków, wybór – samouczek albo pełna zmiana stacji szkoleniowej. */
  #selectMission(i) {
    const m = this.missions[i]; if (!m) return;
    this.mission = m; this.selected = null;
    for (const el of this.view.querySelectorAll('.st-mission')) el.classList.toggle('active', Number(el.dataset.idx) === i);
    const b = this.#openBriefing(m.station, t('start.mission', { n: i + 1, name: missionName(m.scenario) }));
    const btn = this.view.querySelector(`.st-mission[data-idx="${i}"]`);
    if (window.innerWidth < 900) { btn.after(b); b.scrollIntoView({ block: 'start', behavior: 'smooth' }); }
    const steps = getMission(m.scenario.tutorial)?.steps().length;
    b.querySelector('.st-bdiff').innerHTML = `${difficultyMark(1)} <small>${t('start.tutorial')}${steps ? ` · ${t('start.steps', { n: steps })}` : ''}</small>`;
    b.querySelector('.st-bmeta').innerHTML = `<div>${esc(m.station.name)} – ${esc(m.station.location || '')}</div>`;
    this.view.querySelector('#st-station-desc').textContent = m.scenario.description || '';
    // wybór zmiany: samouczek (domyślnie) albo pełna zmiana stacji szkoleniowej na tym samym pulpicie co misja – misja
    // nie zmienia pulpitu (stacje szkoleniowe nie są w „Służbie”, więc tu jest wejście do ich pełnej zmiany)
    const srkOf = (sc) => getSrk(sc.srk || m.station.srk).id; // jak Simulation: nieznane / brak → typ E
    const shifts = (m.station.scenarios || []).filter((sc) => !sc.tutorial && srkOf(sc) === srkOf(m.scenario));
    this.#scenarioChoice([{ ...m.scenario, name: t('start.missionOption', { name: missionName(m.scenario) }), description: '' }, ...shifts], m.scenario.id, (sc) => {
      const tut = sc.id === m.scenario.id;
      this.view.querySelector('#st-go').textContent = t(tut ? 'start.goMission' : 'start.go');
      this.view.querySelector('.st-adv').classList.toggle('hidden', tut);
    });
  }

  /** Lista scenariuszy w odprawie: opis wybranego, poziom zakłóceń (wymuszony przez scenariusz – zablokowany). */
  #scenarioChoice(scs, selected, onChange = () => {}) {
    const root = this.view;
    const scSel = root.querySelector('#st-scenario'), lvSel = root.querySelector('#st-level');
    scSel.innerHTML = scs.map((sc) => `<option value="${sc.id}">${esc(sc.name)}</option>`).join('');
    scSel.value = scs.some((sc) => sc.id === selected) ? selected : scs[0]?.id;
    const upd = () => {
      const sc = scs.find((x) => x.id === scSel.value);
      root.querySelector('#st-scenario-desc').textContent = sc?.description || '';
      lvSel.disabled = !!sc?.disruptions;
      if (sc?.disruptions) lvSel.value = sc.disruptions;
      if (sc) onChange(sc);
    };
    scSel.onchange = upd; upd();
  }

  /** Wspólna część odprawy: miniatura, tytuł; zwraca element odprawy. */
  #openBriefing(station, title) {
    const b = this.view.querySelector('#st-briefing');
    b.classList.add('open');
    b.querySelector('.st-bplaceholder').classList.add('hidden');
    b.querySelector('.st-bcontent').classList.remove('hidden');
    b.querySelector('.st-bthumb').innerHTML = stationThumbnail(station, { w: 640, h: 170 });
    b.querySelector('.st-bname').textContent = title;
    return b;
  }

  // --- służba: lista z wyszukiwarką i filtrami ---------------------------------------------------------------------

  #renderService() {
    const duty = dutyStations(STATIONS);
    const f = this.filters;
    const srks = [...new Set(duty.flatMap(stationSrks))];
    const diffs = [...new Set(duty.map((s) => s.difficulty))].sort((a, b) => a - b);
    const eras = erasOf(duty);
    const regions = Object.keys(regionCounts(duty)).sort((a, b) => REGIONS[a].localeCompare(REGIONS[b], 'pl'));
    const chip = (attr, value, label, on) => `<button type="button" class="st-chip" ${attr}="${esc(value)}" aria-pressed="${on}">${esc(label)}</button>`;
    this.view.innerHTML = `<div class="st-service">
      <div class="st-toolbar">
        <label class="st-search">${uiIcon('search', 15)}<input type="search" id="st-search" placeholder="${t('start.search')}" aria-label="${t('start.searchLabel')}" value="${esc(f.query)}" autocomplete="off"><kbd aria-hidden="true">/</kbd></label>
        <div class="st-filters">
          ${srks.length > 1 ? `<div class="st-fgroup" role="group" aria-label="${t('start.filterSrk')}"><span class="st-flabel">${t('start.filterSrk')}</span>${srks.map((id) => chip('data-srk', id, srkLabel(id), f.srk.includes(id))).join('')}</div>` : ''}
          <div class="st-fgroup" role="group" aria-label="${t('start.difficulty')}"><span class="st-flabel">${t('start.difficulty')}</span>${diffs.map((d) => chip('data-diff', d, String(d), f.difficulty.includes(d))).join('')}</div>
          ${eras.years.length + (eras.now ? 1 : 0) > 1 ? `<label class="st-fsel">${t('start.era')} <select id="st-era"><option value="">${t('start.eraAll')}</option>${eras.now ? `<option value="now">${t('start.eraToday')}</option>` : ''}${eras.years.map((y) => `<option value="${y}">${y}</option>`).join('')}</select></label>` : ''}
          ${regions.length > 1 ? `<label class="st-fsel">${t('start.filterRegion')} <select id="st-region"><option value="">${t('start.regionAll')}</option>${regions.map((r) => `<option value="${r}">${esc(REGIONS[r])}</option>`).join('')}</select></label>` : ''}
          <label class="st-check"><input type="checkbox" id="st-notplayed"${f.notPlayed ? ' checked' : ''}> ${t('start.notPlayed')}</label>
          <div class="seg st-sort" aria-label="${t('start.sortLabel')}"><button type="button" class="tb" data-sort="name">${t('start.sortName')}</button><button type="button" class="tb" data-sort="difficulty">${t('start.sortDiff')}</button></div>
        </div>
      </div>
      <div class="st-count" id="st-count" aria-live="polite"></div>
      <div id="st-list" class="st-list"></div>
    </div>`;
    const v = this.view;
    if (v.querySelector('#st-era')) v.querySelector('#st-era').value = f.era == null ? '' : String(f.era);
    if (v.querySelector('#st-region')) v.querySelector('#st-region').value = f.region || '';
    v.querySelector('#st-search').addEventListener('input', (ev) => { f.query = ev.target.value; this.#renderList(); });
    v.querySelector('#st-search').addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') { const first = v.querySelector('#st-list .st-card'); if (first) this.navigate({ view: 'station', id: first.dataset.id }); }
    });
    v.querySelector('.st-filters').addEventListener('click', (ev) => {
      const b = ev.target.closest('.st-chip, .st-sort button'); if (!b) return;
      if (b.dataset.sort) { this.#setSort(b.dataset.sort); return; }
      const [list, value] = b.dataset.srk ? [f.srk, b.dataset.srk] : [f.difficulty, Number(b.dataset.diff)];
      const i = list.indexOf(value);
      if (i >= 0) list.splice(i, 1); else list.push(value);
      b.setAttribute('aria-pressed', String(i < 0));
      this.#renderList();
    });
    v.querySelector('#st-era')?.addEventListener('change', (ev) => { const x = ev.target.value; f.era = x === '' ? null : x === 'now' ? 'now' : Number(x); this.#renderList(); });
    v.querySelector('#st-region')?.addEventListener('change', (ev) => { f.region = ev.target.value || null; this.#renderList(); });
    v.querySelector('#st-notplayed').addEventListener('change', (ev) => { f.notPlayed = ev.target.checked; this.#renderList(); });
    this.#bindCards(v.querySelector('#st-list'));
    this.#renderList();
  }

  #setSort(by) {
    this.sort = by === 'difficulty' ? 'difficulty' : 'name';
    try { localStorage.setItem(SORT_KEY, this.sort); } catch { /* ignoruj */ }
    this.#renderList();
  }

  /** Lista po filtrach: przy zapytaniu najtrafniejsze pierwsze, inaczej wybrana kolejność. */
  #renderList() {
    const v = this.view;
    for (const b of v.querySelectorAll('.st-sort button')) b.classList.toggle('active', b.dataset.sort === this.sort);
    const all = placesOf(STATIONS).map((eds) => eds[0]);
    const sorted = sortStations(all, this.sort);
    const { query, ...rest } = this.filters;
    const found = filterStations(query ? searchStations(sorted, query) : sorted, { ...rest, progress: this.progress });
    v.querySelector('#st-count').textContent = t('start.results', { n: found.length, total: all.length });
    v.querySelector('#st-list').innerHTML = found.length ? found.map((s) => this.#card(s)).join('')
      : `<div class="st-empty">${t('start.noResults')}</div>`;
  }

  /** Karta posterunku: miniatura, nazwa, trudność, położenie, stanowisko; najlepsza ocena jako pieczątka. */
  #card(s) {
    const eds = editionsOf(STATIONS, s).length;
    return `<div class="st-card" data-id="${s.id}" role="button" tabindex="0">
        <div class="st-thumb">${stationThumbnail(s, { w: 320, h: 100 })}</div>
        <div class="st-body">
          <div class="st-row"><span class="st-name">${esc(s.name)}</span>${difficultyMark(s.difficulty)}</div>
          <div class="st-loc">${esc(s.location || '')}</div>
          <div class="st-chips"><span class="st-srk${stationViews(s).length > 1 ? ' st-srk-both' : ''}">${srkBadge(s)}</span>${s.districts ? `<span class="st-srk">${t('start.twoDistricts')}</span>` : ''}<span class="st-srk">${t('start.scen', { n: (s.scenarios || []).filter((x) => !x.tutorial).length })}</span>${eds > 1 ? `<span class="st-srk">${t('start.eras', { n: eds })}</span>` : ''}</div>
          <div class="st-traffic">${esc(s.traffic || '')}</div>
        </div>
        ${stamp(bestResult(this.progress, s.id), 'st-card-stamp')}
      </div>`;
  }

  /** Karta działa jak przycisk (klik, Enter, spacja) – otwiera stronę stacji. */
  #bindCards(host) {
    host.addEventListener('click', (ev) => { const card = ev.target.closest('.st-card'); if (card) this.navigate({ view: 'station', id: card.dataset.id }); });
    host.addEventListener('keydown', (ev) => {
      if (ev.key !== 'Enter' && ev.key !== ' ') return;
      const card = ev.target.closest('.st-card'); if (!card) return;
      ev.preventDefault();
      this.navigate({ view: 'station', id: card.dataset.id });
    });
  }

  // --- region ---------------------------------------------------------------------------------------------------

  #renderRegion(region) {
    const list = sortStations(placesOf(STATIONS).map((eds) => eds[0]).filter((s) => s.region === region), this.sort);
    this.view.innerHTML = `<div class="st-region">
      <section class="st-rlist"><h3><span class="st-kicker">${t('start.duty')}</span>${t('start.regionStations', { n: list.length })}</h3>
        <div id="st-list" class="st-list">${list.map((s) => this.#card(s)).join('') || `<div class="st-empty">${t('start.noResults')}</div>`}</div></section>
    </div>`;
    this.#bindCards(this.view.querySelector('#st-list'));
  }

  // --- strona stacji ----------------------------------------------------------------------------------------------

  #renderStation(st) {
    this.mission = null; this.selected = st.id;
    this.view.innerHTML = `<div class="st-station">${this.#briefingHtml({ open: true, station: st })}</div>`;
    const b = this.#openBriefing(st, st.name);
    b.querySelector('.st-bdiff').innerHTML = difficultyMark(st.difficulty, t('start.difficulty'));
    b.querySelector('.st-bmeta').innerHTML = `<div>${esc(st.location || '')}</div><div>${esc(st.traffic || '')}</div>`;
    const best = bestResult(this.progress, st.id);
    b.querySelector('.st-best').innerHTML = best ? `${t('start.yourBest')} ${stamp(best)} <b>${best.total > 0 ? '+' : ''}${best.total} ${t('rp.pts')}</b>` : '';
    const v = this.view;
    this.#bindGo();
    v.querySelector('#st-station-desc').textContent = `${st.description || ''} ${t('start.srkInfo', { info: st.srkInfo || getSrk(st.srk).name })}`;
    const dw = v.querySelector('#st-district-wrap'), dSel = v.querySelector('#st-district');
    if (st.districts) {
      dw.classList.remove('hidden');
      dSel.innerHTML = Object.entries(st.districts).map(([did, d]) => `<option value="${did}">${esc(d.name)}</option>`).join('') + `<option value="both">${t('start.bothDistricts')}</option>`;
      if (this.current.district && this.current.station === st.id) dSel.value = this.current.district;
      const updD = () => {
        const d = st.districts[dSel.value];
        v.querySelector('#st-district-desc').textContent = t(!d ? 'start.bothDesc' : d.role === 'dysponująca' ? 'start.dispatcherDesc' : 'start.signalmanDesc');
      };
      dSel.onchange = updD; updD();
    }
    const scs = (st.scenarios || [{ id: 'zmiana', name: t('start.fullShift') }]).filter((sc) => !sc.tutorial);
    this.#scenarioChoice(scs, this.current.station === st.id ? this.current.scenario : null);
  }

  #go(station, scenario, level, extra = {}) {
    const p = new URLSearchParams();
    p.set('stacja', station); p.set('scenariusz', scenario); p.set('zaklocenia', level);
    for (const [k, val] of Object.entries(extra)) p.set(k, val);
    location.href = `${location.pathname}?${p}`; // bez „#…” – zmiana startuje z czystego adresu
  }

  /**
   * Otwarcie ekranu: adres `route` albo bieżący „#…” (inaczej tytuł). Parametry zmiany znikają z adresu (odświeżenie
   * zostaje na wyborze), powrót do zmiany je przywraca.
   */
  show(route = null) {
    if (location.search) this.savedSearch = location.search;
    const hash = route ? routeHash(route) : (location.hash && location.hash !== '#' ? location.hash : '#/');
    history.replaceState(null, '', location.pathname + hash);
    openDialog(this.root);
    this.render(parseRoute(hash));
  }

  hide() {
    history.replaceState(null, '', location.pathname + (this.savedSearch || location.search));
    this.savedSearch = null;
    closeDialog(this.root);
  }
}
