import { STATIONS } from '../stations/index.js';
import { DISRUPTION_LEVELS } from '../core/Random.js';
import { Clock } from '../core/Clock.js';
import { difficultyMark, logoSvg, signalSvg } from './brand.js';
import { getSrk, listSrk } from '../srk/registry.js';
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
import { shiftChoices, srkChoosable } from '../model/shift/offers.js';
import { choiceFromParams, choiceToParams, dutyWindow } from '../model/shift/choice.js';
import { loadProgress, loadLastShift } from './progress.js';
import { DUTY_ID, DUTY_MINUTES, bandOf, buildDuty, normalizeDuty } from '../model/duty.js';
import { DAY_RULES, DAY_TYPES, MONTHS, SEASIDE_SEASON, normalizeCalendar, seasideTrain } from '../model/timetable/calendar.js';
import { regionBox } from './map/mapSvg.js';
import { MapView } from './map/MapView.js';

export { dutyStations } from './catalog.js';

const SORT_KEY = 'sprk.startSort';
/** Ostatnio oglądany ekran wyboru (mapa, lista, województwo, szkolenie) i widok mapy – „Nowa zmiana…” wraca tam. */
const LAST_VIEW_KEY = 'sprk.startLastView';
const MAP_VIEW_KEY = 'sprk.startMapView';
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* brak pamięci – pomijamy */ } },
};

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
    this.route = route;
    this.progress = loadProgress();
    if (['service', 'region', 'training'].includes(route.view)) store.set(LAST_VIEW_KEY, routeHash(route));
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
        this.#renderService(route.mode);
        break;
      case 'region':
        title = REGIONS[route.region];
        crumbs.push(home, { label: t('start.duty'), route: { view: 'service', mode: 'map' } }, { label: REGIONS[route.region], route });
        this.#renderRegion(route.region);
        break;
      case 'station': {
        const st = STATIONS.find((s) => s.id === route.id);
        title = st.name;
        crumbs.push(home, { label: t('start.duty'), route: { view: 'service', mode: 'map' } });
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
    const choice = choiceFromParams(new URLSearchParams(last.search));
    const st = STATIONS.find((s) => s.id === choice.station);
    let sc = st?.scenarios?.find((x) => x.id === choice.scenario);
    // służba o wybranej porze: nazwa z godzinami (jak w nagłówku zmiany)
    if (st && !sc && choice.duty) {
      const w = dutyWindow(choice.duty);
      sc = { name: t('start.dutyName', { from: Clock.format(w.from), to: Clock.format(w.to) }) };
    }
    if (!st || !sc) return null;
    const level = choice.level;
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
        ${this.#briefingHtml({ form: false })}
      </div>`;
    this.view.querySelector('.st-mission-list').addEventListener('click', (ev) => {
      const b = ev.target.closest('.st-mission'); if (!b) return;
      this.navigate({ view: 'training', mission: Number(b.dataset.idx) + 1 });
    });
    this.#bindGo();
    if (n && this.missions[n - 1]) this.#selectMission(n - 1);
  }

  /**
   * Odprawa: miniatura, tytuł, opis i parametry zmiany (scenariusz, okręg, zakłócenia, ziarno) z przyciskiem startu;
   * odprawa misji (`form: false`) – bez parametrów: misja zawsze bez zakłóceń, szkolenie to tylko misje.
   */
  #briefingHtml({ open = false, station = null, form = true } = {}) {
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
            ${form ? `<div class="st-form">
              <label id="st-district-wrap" class="hidden">${t('start.district')} <select id="st-district"></select></label>
              <p class="muted" id="st-district-desc"></p>
              <label id="st-srk-wrap" class="hidden">${t('start.srkChoice')} <select id="st-srk"></select></label>
              <label id="st-scenario-wrap">${t('start.scenario')} <select id="st-scenario"></select></label>
              <div id="st-duty" class="st-duty hidden">
                <label>${t('start.dutyStart')} <select id="st-duty-start"></select></label>
                <div class="st-duty-len" role="group" aria-label="${t('start.dutyLength')}"><span class="st-duty-lab">${t('start.dutyLength')}</span><span id="st-duty-minutes" class="st-duty-btns"></span></div>
                <div class="st-duty-when">
                  <label>${t('start.dutyMonth')} <select id="st-duty-month"></select></label>
                  <label>${t('start.dutyDay')} <select id="st-duty-day"></select></label>
                </div>
              </div>
              <p class="muted" id="st-scenario-desc"></p>
              <label>${t('start.level')}
                <select id="st-level">${Object.keys(DISRUPTION_LEVELS).map((k) => `<option value="${k}">${t(`level.${k}`)}</option>`).join('')}</select>
              </label>
              <details class="st-adv"><summary>${t('start.advanced')}</summary>
                <label>${t('start.seed')} <input id="st-seed" inputmode="numeric" placeholder="${t('start.seedPh')}"></label>
              </details>
            </div>` : ''}
            <div class="order-actions"><button type="button" id="st-go" class="tb primary st-go">${t('start.go')}</button></div>
          </div>
        </div>
      </aside>`;
  }

  #bindGo() {
    const root = this.view;
    if (root.querySelector('#st-level')) root.querySelector('#st-level').value = this.current.level || 'low';
    root.querySelector('#st-go').addEventListener('click', () => {
      // odprawa misji: zawsze samouczek, bez zakłóceń
      if (this.mission) { this.#go({ station: this.mission.station.id, scenario: this.mission.scenario.id, level: 'none' }); return; }
      const scenario = root.querySelector('#st-scenario').value, duty = scenario === DUTY_ID;
      const seed = root.querySelector('#st-seed').value.trim();
      // służba bez żadnego pociągu (nie zdarza się na posterunkach w grze – pilnują testy służby): zostajemy na stronie
      if (duty && !buildDuty(STATIONS.find((x) => x.id === this.selected), { start: this.duty.start, minutes: this.duty.minutes, month: this.duty.month, day: this.duty.day, seed: this.#dutySeed() }).stats.trains) {
        const desc = root.querySelector('#st-scenario-desc');
        desc.textContent = `${t(`start.bandDesc.${bandOf(this.duty.start * 3600).id}`)} ${t('start.duty.empty')}`;
        return;
      }
      this.#go({
        station: this.selected, scenario, level: root.querySelector('#st-level').value,
        district: root.querySelector('#st-district-wrap').classList.contains('hidden') ? null : root.querySelector('#st-district').value,
        // służba: pora, długość i ziarno, z którego powstał pokazany rozkład
        duty: duty ? { start: this.duty.start, minutes: this.duty.minutes, month: this.duty.month, day: this.duty.day } : null,
        seed: duty ? this.#dutySeed() : seed || null,
        // stanowisko wybrane przez gracza (pole widać, gdy stacja ma ich kilka, a scenariusz nie ma własnego)
        srk: root.querySelector('#st-srk-wrap').classList.contains('hidden') ? null : root.querySelector('#st-srk').value,
      });
    });
  }

  /** Odprawa misji wprowadzającej: opis, stacja, liczba kroków i start misji (bez parametrów zmiany). */
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
    this.view.querySelector('#st-go').textContent = t('start.goMission');
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

  #renderService(mode = 'map') {
    this.mode = mode;
    const duty = dutyStations(STATIONS);
    const f = this.filters;
    // wszystkie rodzaje stanowisk z rejestru (z liczbą posterunków – przybywa ich z każdym nowym stanowiskiem) i pełna
    // skala trudności 1–5 – filtr nie zmienia kształtu, gdy dochodzą posterunki
    const srkCount = (id) => duty.filter((s) => stationSrks(s).includes(id)).length;
    const srks = listSrk().map((x) => x.id);
    const diffs = [1, 2, 3, 4, 5];
    const eras = erasOf(duty);
    const regions = Object.keys(regionCounts(duty)).sort((a, b) => REGIONS[a].localeCompare(REGIONS[b], 'pl'));
    const chip = (attr, value, label, on) => `<button type="button" class="st-chip" ${attr}="${esc(value)}" aria-pressed="${on}">${esc(label)}</button>`;
    this.view.innerHTML = `<div class="st-service">
      <div class="st-toolbar">
        <div class="st-toprow">
          <label class="st-search">${uiIcon('search', 15)}<input type="search" id="st-search" placeholder="${t('start.search')}" aria-label="${t('start.searchLabel')}" value="${esc(f.query)}" autocomplete="off"><kbd aria-hidden="true">/</kbd></label>
          <nav class="seg st-mode" aria-label="${t('start.modeLabel')}"><a class="tb${mode === 'map' ? ' active' : ''}" href="#/sluzba" data-mode="map"${mode === 'map' ? ' aria-current="page"' : ''}>${t('start.modeMap')}</a><a class="tb${mode === 'list' ? ' active' : ''}" href="#/sluzba/lista" data-mode="list"${mode === 'list' ? ' aria-current="page"' : ''}>${t('start.modeList')}</a></nav>
        </div>
        <div class="st-filters">
          <label class="st-fsel">${t('start.filterSrk')} <select id="st-srk"><option value="">${t('start.srkAll')}</option>${srks.map((id) => `<option value="${esc(id)}">${esc(srkLabel(id))} (${srkCount(id)})</option>`).join('')}</select></label>
          <div class="st-fgroup st-fdiff" role="group" aria-label="${t('start.difficulty')}"><span class="st-flabel">${t('start.difficulty')}</span>${diffs.map((d) => chip('data-diff', d, String(d), f.difficulty.includes(d))).join('')}</div>
          ${eras.years.length + (eras.now ? 1 : 0) > 1 ? `<label class="st-fsel">${t('start.era')} <select id="st-era"><option value="">${t('start.eraAll')}</option>${eras.now ? `<option value="now">${t('start.eraToday')}</option>` : ''}${eras.years.map((y) => `<option value="${y}">${y}</option>`).join('')}</select></label>` : ''}
          ${regions.length > 1 ? `<label class="st-fsel">${t('start.filterRegion')} <select id="st-region"><option value="">${t('start.regionAll')}</option>${regions.map((r) => `<option value="${r}">${esc(REGIONS[r])}</option>`).join('')}</select></label>` : ''}
          <label class="st-check"><input type="checkbox" id="st-notplayed"${f.notPlayed ? ' checked' : ''}> ${t('start.notPlayed')}</label>
          <div class="seg st-sort${mode === 'map' ? ' hidden' : ''}" aria-label="${t('start.sortLabel')}"><button type="button" class="tb" data-sort="name">${t('start.sortName')}</button><button type="button" class="tb" data-sort="difficulty">${t('start.sortDiff')}</button></div>
        </div>
      </div>
      <div class="st-count" id="st-count" aria-live="polite"></div>
      ${mode === 'map' ? `<div class="st-mapwrap">${this.#mapFigure('st-map')}<aside class="st-mapside" id="st-mapside"></aside></div>` : '<div id="st-list" class="st-list"></div>'}
    </div>`;
    const v = this.view;
    v.querySelector('#st-srk').value = f.srk[0] || '';
    v.querySelector('#st-srk').addEventListener('change', (ev) => { f.srk = ev.target.value ? [ev.target.value] : []; this.#renderList(); });
    if (v.querySelector('#st-era')) v.querySelector('#st-era').value = f.era == null ? '' : String(f.era);
    if (v.querySelector('#st-region')) v.querySelector('#st-region').value = f.region || '';
    v.querySelector('#st-search').addEventListener('input', (ev) => { f.query = ev.target.value; this.#renderList(); });
    v.querySelector('#st-search').addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') { const first = this.#found()[0]; if (first) this.navigate({ view: 'station', id: first.id }); }
    });
    v.querySelector('.st-filters').addEventListener('click', (ev) => {
      const b = ev.target.closest('.st-chip, .st-sort button'); if (!b) return;
      if (b.dataset.sort) { this.#setSort(b.dataset.sort); return; }
      const [list, value] = [f.difficulty, Number(b.dataset.diff)];
      const i = list.indexOf(value);
      if (i >= 0) list.splice(i, 1); else list.push(value);
      b.setAttribute('aria-pressed', String(i < 0));
      this.#renderList();
    });
    v.querySelector('#st-era')?.addEventListener('change', (ev) => { const x = ev.target.value; f.era = x === '' ? null : x === 'now' ? 'now' : Number(x); this.#renderList(); });
    v.querySelector('#st-region')?.addEventListener('change', (ev) => { f.region = ev.target.value || null; this.#renderList(); });
    v.querySelector('#st-notplayed').addEventListener('change', (ev) => { f.notPlayed = ev.target.checked; this.#renderList(); });
    if (mode === 'list') this.#bindCards(v.querySelector('#st-list'));
    this.#renderList();
  }

  #setSort(by) {
    this.sort = by === 'difficulty' ? 'difficulty' : 'name';
    try { localStorage.setItem(SORT_KEY, this.sort); } catch { /* ignoruj */ }
    this.#renderList();
  }

  /** Posterunki po filtrach: przy zapytaniu najtrafniejsze pierwsze, inaczej wybrana kolejność. */
  #found() {
    const sorted = sortStations(placesOf(STATIONS).map((eds) => eds[0]), this.sort);
    const { query, ...rest } = this.filters;
    return filterStations(query ? searchStations(sorted, query) : sorted, { ...rest, progress: this.progress });
  }

  /** Wynik filtrów: lista kart albo mapa (województwa z liczbą pasujących, kropki stacji) z wynikami obok. */
  #renderList() {
    const v = this.view;
    for (const b of v.querySelectorAll('.st-sort button')) b.classList.toggle('active', b.dataset.sort === this.sort);
    const total = placesOf(STATIONS).length;
    const found = this.#found();
    v.querySelector('#st-count').textContent = t('start.results', { n: found.length, total });
    if (this.mode !== 'map') {
      v.querySelector('#st-list').innerHTML = found.length ? found.map((s) => this.#card(s)).join('')
        : `<div class="st-empty">${t('start.noResults')}</div>`;
      return;
    }
    const counts = regionCounts(found);
    // mapa zostaje w tym samym miejscu i przybliżeniu przy zmianie filtrów i po powrocie z gry („Nowa zmiana…”)
    const keep = this.mapView?.host?.isConnected ? this.mapView.view : store.get(MAP_VIEW_KEY);
    this.#mount(v.querySelector('#st-map .st-mapview'), found, { view: keep, remember: true });
    const f = this.filters;
    const filtered = f.query || f.srk.length || f.difficulty.length || f.era != null || f.region || f.notPlayed;
    // obok mapy: bez filtrów – województwa z posterunkami, z filtrami – pasujące posterunki
    v.querySelector('#st-mapside').innerHTML = filtered
      ? (found.length ? `<ul class="st-mini">${found.map((s) => `<li><a href="${routeHash({ view: 'station', id: s.id })}" data-id="${s.id}"><b>${esc(s.name)}</b>${difficultyMark(s.difficulty)}<span>${esc(REGIONS[s.region] || '')} · ${esc(srkBadge(s))}</span></a>${stamp(bestResult(this.progress, s.id))}</li>`).join('')}</ul>` : `<div class="st-empty">${t('start.noResults')}</div>`)
      : `<h3><span class="st-kicker">${t('start.duty')}</span>${t('start.regions')}</h3><ul class="st-mini">${Object.entries(counts).sort((a, b) => REGIONS[a[0]].localeCompare(REGIONS[b[0]], 'pl')).map(([r, n]) => `<li><a href="${routeHash({ view: 'region', region: r })}" data-region="${r}"><b>${esc(REGIONS[r])}</b><span>${t('start.regionCount', { n })}</span></a></li>`).join('')}</ul><p class="muted st-maphint">${t('start.mapHint')}</p>`;
  }

  /** Karta posterunku: miniatura, nazwa, trudność, położenie, stanowisko; najlepsza ocena jako pieczątka (wybór zmiany – na stronie stacji). */
  #card(s) {
    const eds = editionsOf(STATIONS, s).length;
    return `<div class="st-card" data-id="${s.id}" role="button" tabindex="0">
        <div class="st-thumb">${stationThumbnail(s, { w: 320, h: 100 })}</div>
        <div class="st-body">
          <div class="st-row"><span class="st-name">${esc(s.name)}</span>${difficultyMark(s.difficulty)}</div>
          <div class="st-loc">${esc(s.location || '')}</div>
          <div class="st-chips"><span class="st-srk${stationViews(s).length > 1 ? ' st-srk-both' : ''}">${srkBadge(s)}</span>${s.districts ? `<span class="st-srk">${t('start.twoDistricts')}</span>` : ''}${eds > 1 ? `<span class="st-srk">${t('start.eras', { n: eds })}</span>` : ''}</div>
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
    const mark = (st) => { const b = bestResult(this.progress, st.id); return b ? `played grade-${b.grade}` : ''; };
    this.view.innerHTML = `<div class="st-region">
      ${this.#mapFigure('st-rmapfig')}
      <section class="st-rlist"><h3><span class="st-kicker">${t('start.duty')}</span>${t('start.regionStations', { n: list.length })}</h3>
        <div id="st-list" class="st-list">${list.map((s) => this.#card(s)).join('') || `<div class="st-empty">${t('start.noResults')}</div>`}</div></section>
    </div>`;
    this.#bindCards(this.view.querySelector('#st-list'));
    // schemat województwa: ta sama mapa, przybliżona do wycinka posterunków (dalej da się przybliżać i oddalać)
    this.#mount(this.view.querySelector('#st-rmapfig .st-mapview'), list, { view: regionBox(region, list, { aspect: 0.5, min: { lat: 0.3, lon: 0.4 } }) });
  }

  /** Mapa z kartą posterunku (najechanie / fokus) i podpisem źródeł. */
  #mapFigure(id) {
    return `<figure class="st-rmap" id="${id}"><div class="st-mapview"></div><div class="st-rinfo" aria-live="polite"><span class="muted">${t('start.regionInfoHint')}</span></div><figcaption class="muted">${t('start.regionMapNote')}</figcaption></figure>`;
  }

  /** Przybliżana mapa (MapView) z posterunkami `stations`; `view` – początkowy wycinek (inaczej cała Polska). */
  #mount(host, stations, { view = null, remember = false } = {}) {
    const mark = (st) => { const b = bestResult(this.progress, st.id); return b ? `played grade-${b.grade}` : ''; };
    const card = host.parentElement.querySelector('.st-rinfo');
    this.mapView = new MapView(host, {
      stations, counts: regionCounts(stations), mark, view, label: (name, n) => t('start.mapRegion', { name, n }),
      labels: { in: t('start.zoomIn'), out: t('start.zoomOut'), home: t('start.zoomHome'), map: t('start.mapLabel') },
      onChange: remember ? (v) => { clearTimeout(this.saveView); this.saveView = setTimeout(() => store.set(MAP_VIEW_KEY, v), 300); } : null,
      // karta posterunku: nazwa, trudność, stanowisko, ocena
      onHover: (id) => {
        const st = STATIONS.find((x) => x.id === id); if (!st) return;
        card.innerHTML = `<span class="st-rinfo-name">${esc(st.name)}</span>${difficultyMark(st.difficulty)}<span class="st-rinfo-srk">${esc(srkBadge(st))}</span>${stamp(bestResult(this.progress, st.id))}`;
        card.classList.add('on');
      },
    });
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
    const choice = shiftChoices(st);
    if (!choice.duty) {
      const scs = choice.specials.length ? choice.specials : [{ id: 'zmiana', name: t('start.fullShift') }];
      this.#scenarioChoice(scs, this.current.station === st.id ? this.current.scenario : null);
      return;
    }
    this.#dutyChoice(st, choice);
  }

  /** Ziarno służby: wpisane w „Zaawansowane” albo wylosowane przy otwarciu strony posterunku (pokazany rozkład = grany). */
  #dutySeed() {
    const typed = this.view.querySelector('#st-seed').value.trim();
    return /^\d+$/.test(typed) ? Number(typed) : this.duty.seed;
  }

  /**
   * Służba o wybranej porze, długości i terminie (miesiąc, typ dnia – „losowo”: z ziarna; `model/duty.js`,
   * `model/timetable/calendar.js`) zamiast zwykłych zmian; scenariusze specjalne (usterka, zamknięcie toru ze scenariusza)
   * zostają na liście pod nią. Pod wyborem – opis pory doby i to, co zmienia wybrany termin (bez liczby pociągów –
   * rozkład to niespodzianka); służba bez pociągów nie daje się rozpocząć (#bindGo).
   */
  #dutyChoice(st, { srks, specials }) {
    const root = this.view;
    const same = this.current.station === st.id;
    const from = same && this.current.scenario === DUTY_ID ? normalizeDuty(this.current.start, this.current.minutes) : normalizeDuty(6, 120);
    const cal = same && this.current.scenario === DUTY_ID ? normalizeCalendar(this.current.month, this.current.day) : normalizeCalendar(null, null);
    this.duty = { ...from, ...cal, seed: Math.floor(Math.random() * 1e9) };
    const srkWrap = root.querySelector('#st-srk-wrap'), srkSel = root.querySelector('#st-srk');
    if (srks.length > 1) {
      srkSel.innerHTML = srks.map((id) => `<option value="${esc(id)}">${esc(getSrk(id).name)}</option>`).join('');
      if (same && srks.includes(this.current.srk)) srkSel.value = this.current.srk;
    }
    const startSel = root.querySelector('#st-duty-start'), lenBox = root.querySelector('#st-duty-minutes');
    startSel.innerHTML = Array.from({ length: 24 }, (_, h) => `<option value="${h}">${String(h).padStart(2, '0')}:00 – ${esc(t(`start.band.${bandOf(h * 3600).id}`))}</option>`).join('');
    startSel.value = String(this.duty.start);
    // termin: miesiąc i typ dnia, pierwsza pozycja – „losowo” (wartość pusta: termin losuje ziarno)
    const monthSel = root.querySelector('#st-duty-month'), daySel = root.querySelector('#st-duty-day');
    const random = `<option value="">${esc(t('start.random'))}</option>`;
    monthSel.innerHTML = random + MONTHS.map((_, i) => `<option value="${i + 1}">${esc(t(`start.month.${i + 1}`))}</option>`).join('');
    daySel.innerHTML = random + DAY_TYPES.map((d) => `<option value="${d}">${esc(t(`start.day.${d}`))}</option>`).join('');
    monthSel.value = this.duty.month == null ? '' : String(this.duty.month);
    daySel.value = this.duty.day ?? '';
    const seaside = (st.timetable || []).some(seasideTrain);
    const go = root.querySelector('#st-go'), desc = root.querySelector('#st-scenario-desc'), block = root.querySelector('#st-duty');
    // przyciski długości powstają raz – zmiana wyboru przełącza tylko stan (fokus klawiatury zostaje na przycisku)
    lenBox.innerHTML = DUTY_MINUTES.map((m) => `<button type="button" class="tb" data-minutes="${m}">${esc(t(`start.duty.${m}`))}</button>`).join('');
    const preview = () => {
      for (const b of lenBox.querySelectorAll('button[data-minutes]')) {
        const on = Number(b.dataset.minutes) === this.duty.minutes;
        b.classList.toggle('active', on);
        b.setAttribute('aria-pressed', String(on));
      }
      // tylko pora doby i to, co zmienia wybrany termin – ile i jakich pociągów się wylosuje, gracz poznaje dopiero w grze
      // (rozkład to niespodzianka); rozkładu tu nie budujemy (to trwa) – pustą służbę wykrywa start (#bindGo)
      const band = bandOf(this.duty.start * 3600).id, { month, day } = this.duty;
      const notes = [t(`start.bandDesc.${band}`)];
      const rule = day && DAY_RULES[day][band];
      if (rule) notes.push(t(rule === 'dzien' ? 'start.dayDesc.peak' : 'start.dayDesc.dawn'));
      if (month != null && !seaside) notes.push(t('start.monthNoEffect'));
      else if (month != null && SEASIDE_SEASON[month]) {
        const days = SEASIDE_SEASON[month];
        if (day == null) notes.push(t(days.length === DAY_TYPES.length ? 'start.seaside' : 'start.seasideWeekends'));
        else if (days.includes(day)) notes.push(t('start.seaside'));
      }
      desc.textContent = notes.join(' ');
      go.disabled = false;
    };
    const scs = [{ id: DUTY_ID, name: t('start.dutyPick') }, ...specials];
    root.querySelector('#st-scenario-wrap').classList.toggle('hidden', !specials.length);
    this.#scenarioChoice(scs, same ? this.current.scenario : null, (sc) => {
      const duty = sc.id === DUTY_ID;
      block.classList.toggle('hidden', !duty);
      // stanowisko wybiera się dla służby i dla scenariusza specjalnego bez własnego stanowiska w definicji
      srkWrap.classList.toggle('hidden', !srkChoosable({ srks }, duty ? null : sc));
      go.disabled = false;
      if (duty) preview();
    });
    startSel.onchange = () => { this.duty.start = Number(startSel.value); preview(); };
    monthSel.onchange = () => { this.duty.month = normalizeCalendar(monthSel.value, null).month; preview(); };
    daySel.onchange = () => { this.duty.day = normalizeCalendar(null, daySel.value).day; preview(); };
    lenBox.onclick = (ev) => { const b = ev.target.closest('button[data-minutes]'); if (!b) return; this.duty.minutes = Number(b.dataset.minutes); preview(); };
  }

  /** Start zmiany: wybór zmiany (src/model/shift/choice.js) → adres gry. */
  #go(choice) {
    const p = new URLSearchParams(choiceToParams(choice));
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

  /** Ostatnio oglądany ekran wyboru (zapamiętany przy rysowaniu), a bez niego – lista posterunków. */
  showLast() {
    const saved = store.get(LAST_VIEW_KEY);
    this.show(typeof saved === 'string' && saved.startsWith('#/') ? parseRoute(saved) : { view: 'service', mode: 'list' });
  }

  hide() {
    history.replaceState(null, '', location.pathname + (this.savedSearch || location.search));
    this.savedSearch = null;
    closeDialog(this.root);
  }
}
