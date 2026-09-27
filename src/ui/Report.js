import { Clock } from '../core/Clock.js';
import { stars } from './StartScreen.js';

const GRADE_STARS = { wzorowo: 5, dobrze: 4, dostatecznie: 3, niedostatecznie: 1 };
const END_REASON = { 'all-done': 'wszystkie pociągi obsłużone', time: 'koniec czasu zmiany', manual: 'zakończona przez samouczek' };

/**
 * Raport zmiany w motywie ekranu startowego: ocena z gwiazdkami i punktami, kafelki statystyk, tabela pociągów
 * (plan / rzeczywistość / tor / opóźnienie / wynik), zadania manewrowe, zdarzenia punktowane i ich bilans wg rodzaju.
 * Otwiera się sam po końcu zmiany (`shift-end`) i z menu w trakcie („Stan oceny”). `onNew` – powrót do ekranu startowego.
 */
export class Report {
  constructor(root, sim, { onNew = null } = {}) {
    this.root = root;
    this.sim = sim;
    this.onNew = onNew;
    root.addEventListener('click', (e) => {
      if (e.target === root || e.target.closest('.close')) this.hide();
      else if (e.target.closest('#rp-new')) { this.hide(); this.onNew?.(); }
      else if (e.target.closest('#rp-again')) location.reload();
    });
  }

  render() {
    const r = this.sim.report();
    const fmt = (t) => (t == null ? '–' : Clock.format(t));
    const hm = (t) => fmt(t).slice(0, 5);
    const c = r.counters || {};
    const ended = r.ended;
    const endLine = ended
      ? `Zmiana zakończona o ${hm(r.endedAt)} – ${END_REASON[r.endReason] || ''}${r.unfinished.length ? `; nieobsłużone: ${r.unfinished.map((u) => `${esc(u.label)} (${esc(u.status)})`).join(', ')}` : ''}`
      : `Zmiana trwa – stan na ${hm(r.now)}`;
    const tile = (k, v, s = '', cls = '') => `<div class="rp-tile ${cls}"><div class="k">${k}</div><div class="v">${v}</div><div class="s">${s}</div></div>`;
    const tasksDone = r.tasks.filter((t) => t.done).length;
    const wrongComms = r.byCode.find((b) => b.code === 'comms-wrong')?.n || 0;
    const tiles = [
      tile('Pociągi', `${r.done} / ${r.trains}`, 'obsłużone', r.done === r.trains ? 'good' : r.unfinished.length ? 'bad' : ''),
      tile('Punktualnie', String(r.onTime), 'do 2 min', r.onTime ? 'good' : ''),
      tile('Opóźnione', String(r.delayed), r.delayed ? `łącznie ${r.delayMinutes} min` : 'brak', r.delayed ? 'bad' : 'good'),
      r.tasks.length ? tile('Manewry', `${tasksDone} / ${r.tasks.length}`, 'zadania wykonane', tasksDone === r.tasks.length ? 'good' : r.tasks.some((t) => t.failed) ? 'bad' : '') : '',
      tile('Doraźne', `${(c.dPz || 0) + (c.dPo || 0) + (c.dKo || 0)}`, `dPz ${c.dPz || 0} · dPo ${c.dPo || 0} · dKo ${c.dKo || 0}`, (c.dPz || 0) + (c.dPo || 0) + (c.dKo || 0) ? 'bad' : 'good'),
      tile('Sygnał zastępczy', String(c.Sz || 0), 'Sz', ''),
      tile('Telefonogramy', String(wrongComms), wrongComms ? 'błędne' : 'bez błędów', wrongComms ? 'bad' : 'good'),
      tile('Rozprucia', String(c.rozprucie || 0), 'zwrotnic', c.rozprucie ? 'bad' : 'good'),
    ].join('');
    const trainRows = r.rows.map((t) => {
      const res = !t.done ? ['✘ nieobsłużony', 'rp-bad'] : t.delay > 2 ? [`⚠ +${t.delay} min`, 'rp-warn'] : ['✔ punktualnie', 'rp-ok'];
      const wrongTrack = t.actualTrack && t.track && String(t.actualTrack) !== String(t.track);
      return `<tr class="${t.done ? '' : 'undone'}">
        <td class="nr">${t.cat ? `<span class="cat cat-${t.cat}">${esc(t.cat)}</span> ` : ''}${t.nr}</td>
        <td class="rel">${esc(t.relation)}</td>
        <td>${t.arr ? (t.stop ? esc(t.arr) : `<i>${esc(t.arr)}</i>`) : '–'}<div class="act">${t.actualArr != null ? hm(t.actualArr) : ''}</div></td>
        <td>${t.dep ? esc(t.dep) : (t.to ? '–' : 'k.b.')}<div class="act">${t.actualDep != null ? hm(t.actualDep) : ''}</div></td>
        <td>${esc(t.track)}${wrongTrack ? `<div class="act rp-warn">→ ${esc(t.actualTrack)}</div>` : ''}</td>
        <td class="${res[1]}">${res[0]}${t.delayIn ? `<div class="act">od sąsiada +${t.delayIn}</div>` : ''}</td>
        <td class="st">${esc(t.status)}</td></tr>`;
    }).join('');
    const tasks = r.tasks.length ? `<ul class="rp-tasks">${r.tasks.map((t) => `<li class="${t.done ? 'rp-ok' : t.failed ? 'rp-bad' : ''}">${t.done ? '✔' : t.failed ? '✘' : '☐'} ${esc(t.text)} <span class="act">${t.done ? `wykonane ${hm(t.doneAt)}` : t.failed ? 'niewykonane w terminie' : `termin ${esc(t.deadline)}`}</span></li>`).join('')}</ul>` : '';
    const items = r.items.length
      ? r.items.map((i) => `<tr class="${i.points < 0 ? 'neg' : i.points > 0 ? 'pos' : ''}"><td>${hm(i.time)}</td><td>${esc(i.msg)}</td><td class="pts">${i.points > 0 ? '+' : ''}${i.points}</td></tr>`).join('')
      : '<tr><td colspan="3" class="muted">brak zdarzeń punktowanych</td></tr>';
    const chips = r.byCode.map((b) => `<span class="rp-chip ${b.points < 0 ? 'neg' : b.points > 0 ? 'pos' : ''}">${esc(b.code)} × ${b.n} <b>${b.points > 0 ? '+' : ''}${b.points}</b></span>`).join('');
    this.root.innerHTML = `<div class="report-screen">
      <header class="st-hero">
        <div class="st-logo">SPRK</div>
        <div class="st-tagline">${ended ? 'Raport zmiany' : 'Stan oceny – zmiana trwa'}</div>
        <div class="st-sub">${esc(r.station)}${r.district ? ` · ${esc(r.district)}` : ''} · ${esc(r.scenario)} · ${hm(r.startTime)}–${hm(ended ? r.endedAt : r.now)} · ${esc(r.srk)} · zakłócenia: ${esc(r.level)}</div>
        <button type="button" class="tb st-close close">‹ Wróć do pulpitu</button>
      </header>
      <div class="rp-grid">
        <section class="rp-grade grade-${r.grade}">
          <span class="st-kicker">Ocena służby</span>
          <div class="rp-gword">${esc(r.grade)}</div>
          <div class="rp-stars">${stars(GRADE_STARS[r.grade] ?? 0)}</div>
          <div class="rp-points">${r.total > 0 ? '+' : ''}${r.total} pkt</div>
          <div class="rp-end">${endLine}</div>
        </section>
        <section class="rp-stats">${tiles}</section>
      </div>
      <section class="rp-section">
        <h3><span class="st-kicker">Ruch</span>Pociągi</h3>
        <table class="rj rp-trains"><thead><tr><th>Nr</th><th>Relacja</th><th>Przyj.</th><th>Odj.</th><th>Tor</th><th>Wynik</th><th>Stan</th></tr></thead><tbody>${trainRows}</tbody></table>
      </section>
      ${tasks ? `<section class="rp-section"><h3><span class="st-kicker">Manewry</span>Zadania</h3>${tasks}</section>` : ''}
      <section class="rp-section">
        <h3><span class="st-kicker">Ocena</span>Zdarzenia punktowane</h3>
        <div class="rp-chips">${chips}</div>
        <table class="rj rp-items"><thead><tr><th>Czas</th><th>Zdarzenie</th><th>Pkt</th></tr></thead><tbody>${items}</tbody></table>
        <p class="muted small">Zasady: punktualne wyprawienie +5; przetrzymanie pociągu −1/min; przyjęcie na inny tor niż planowy −5;
        dPz −20; dPo/dKo bez uzasadnienia −15; Sz i rozkaz „S” bez usterki −5/−10; błędny telefonogram −5; rozprucie −100; pociąg nieobsłużony −10.
        Ocena: wzorowo ≥ 40 pkt, dobrze ≥ 10, dostatecznie ≥ −20.</p>
      </section>
      <div class="rp-actions">
        <button type="button" id="rp-new" class="tb primary st-go">Nowa zmiana…</button>
        <button type="button" id="rp-again" class="tb">Zagraj ponownie</button>
        <button type="button" class="tb close">${ended ? 'Obejrzyj pulpit' : 'Zamknij'}</button>
      </div>
    </div>`;
  }

  show() { this.render(); this.root.classList.remove('hidden'); }
  hide() { this.root.classList.add('hidden'); }
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
