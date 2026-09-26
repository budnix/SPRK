import { Clock } from '../core/Clock.js';

/** Raport zmiany – ocena i lista zdarzeń punktowanych. */
export class Report {
  constructor(root, sim) {
    this.root = root;
    this.sim = sim;
    root.addEventListener('click', (e) => { if (e.target === root || e.target.classList.contains('close')) this.hide(); });
  }

  render() {
    const r = this.sim.score.report(this.sim.traffic);
    const ended = this.sim.ended;
    const items = r.items.length
      ? r.items.map((i) => `<tr class="${i.points < 0 ? 'neg' : i.points > 0 ? 'pos' : ''}"><td>${Clock.format(i.time)}</td><td>${escape(i.msg)}</td><td class="pts">${i.points > 0 ? '+' : ''}${i.points}</td></tr>`).join('')
      : '<tr><td colspan="3" class="muted">brak zdarzeń punktowanych</td></tr>';
    const delays = r.delays.length ? r.delays.map((d) => `${d.nr}: +${d.delay} min${d.delayIn ? ` (od sąsiada +${d.delayIn})` : ''}`).join(', ') : 'brak';
    this.root.innerHTML = `<div class="modal-box report">
      <button class="close" aria-label="Zamknij">×</button>
      <h2>${ended ? 'Raport zmiany' : 'Stan oceny (zmiana trwa)'}</h2>
      <p class="grade grade-${r.grade}">Ocena: <b>${r.grade}</b> · punkty: <b>${r.total}</b></p>
      <p>Pociągi: ${r.done} / ${r.trains} obsłużone · opóźnienia: ${escape(delays)}</p>
      <table class="rj"><thead><tr><th>Czas</th><th>Zdarzenie</th><th>Pkt</th></tr></thead><tbody>${items}</tbody></table>
      <p class="muted small">Zasady: punktualne wyprawienie +5; przetrzymanie pociągu −1/min; przyjęcie na inny tor niż planowy −5;
      dPz −20; dPo/dKo bez uzasadnienia −15; Sz i rozkaz „S” bez usterki −5/−10; błędny telefonogram −5; rozprucie −100.</p>
    </div>`;
  }

  show() { this.render(); this.root.classList.remove('hidden'); }
  hide() { this.root.classList.add('hidden'); }
}

function escape(s) {
  return String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}
