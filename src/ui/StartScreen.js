import { STATIONS } from '../stations/index.js';
import { DISRUPTION_LEVELS } from '../core/Random.js';

/** Ekran startowy: wybór stacji, scenariusza i poziomu zakłóceń. Uruchamia zmianę przez parametry URL. */
export class StartScreen {
  constructor(root, current = {}) {
    this.root = root;
    const stationId = current.station || STATIONS[0].id;
    root.innerHTML = `<div class="modal-box start">
      <h2>SPRK – nowa zmiana</h2>
      <label>Stacja
        <select id="st-station">${STATIONS.map((s) => `<option value="${s.id}">${s.name}</option>`).join('')}</select>
      </label>
      <p class="muted" id="st-station-desc"></p>
      <label>Scenariusz <select id="st-scenario"></select></label>
      <p class="muted" id="st-scenario-desc"></p>
      <label>Zakłócenia (opóźnienia, usterki)
        <select id="st-level">${Object.entries(DISRUPTION_LEVELS).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('')}</select>
      </label>
      <label>Ziarno losowe (puste = losowe) <input id="st-seed" inputmode="numeric" placeholder="np. 42"></label>
      <div class="order-actions"><button type="button" id="st-go">Rozpocznij zmianę</button></div>
    </div>`;
    const stSel = root.querySelector('#st-station');
    const scSel = root.querySelector('#st-scenario');
    const lvSel = root.querySelector('#st-level');
    const fill = () => {
      const st = STATIONS.find((s) => s.id === stSel.value);
      root.querySelector('#st-station-desc').textContent = st.description || '';
      const scs = st.scenarios || [{ id: 'zmiana', name: 'Pełna zmiana' }];
      scSel.innerHTML = scs.map((s) => `<option value="${s.id}">${s.name}</option>`).join('');
      if (current.scenario && scs.some((s) => s.id === current.scenario)) scSel.value = current.scenario;
      const upd = () => {
        const sc = scs.find((s) => s.id === scSel.value);
        root.querySelector('#st-scenario-desc').textContent = sc?.description || '';
        lvSel.disabled = !!sc?.disruptions;
        if (sc?.disruptions) lvSel.value = sc.disruptions;
      };
      scSel.onchange = upd; upd();
    };
    stSel.value = stationId;
    stSel.addEventListener('change', fill);
    fill();
    lvSel.value = current.level || 'low';
    root.querySelector('#st-go').addEventListener('click', () => {
      const p = new URLSearchParams();
      p.set('stacja', stSel.value); p.set('scenariusz', scSel.value); p.set('zaklocenia', lvSel.value);
      const seed = root.querySelector('#st-seed').value.trim();
      if (seed) p.set('seed', seed);
      location.search = p.toString();
    });
  }

  show() { this.root.classList.remove('hidden'); }
  hide() { this.root.classList.add('hidden'); }
}
