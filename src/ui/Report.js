import { Clock } from '../core/Clock.js';
import { logoSvg } from './brand.js';
import { t } from '../i18n/index.js';
import { escapeHtml as esc } from './dom.js';
import { uiIcon } from './icons.js';
import { initDialog, openDialog, closeDialog } from './dialog.js';

const tr = t;

/**
 * Raport zmiany w motywie ekranu startowego: ocena słowna i punkty, kafelki statystyk, tabela pociągów
 * (plan / rzeczywistość / tor / opóźnienie / wynik), zadania manewrowe, zdarzenia punktowane i ich bilans wg rodzaju.
 * Otwiera się sam po końcu zmiany (`shift-end`) i z menu w trakcie („Stan oceny”). `onNew` – powrót do ekranu startowego.
 */
export class Report {
  constructor(root, sim, { onNew = null } = {}) {
    this.root = root;
    this.sim = sim;
    this.onNew = onNew;
    initDialog(root, t('rp.title'));
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
      ? t('rp.ended', { time: hm(r.endedAt), reason: t(`rp.end.${r.endReason}`) }) + (r.unfinished.length ? t('rp.unfinished', { list: r.unfinished.map((u) => `${esc(u.label)} (${esc(u.status)})`).join(', ') }) : '')
      : t('rp.live', { time: hm(r.now) });
    const tile = (k, v, s = '', cls = '') => `<div class="rp-tile ${cls}"><div class="k">${k}</div><div class="v">${v}</div><div class="s">${s}</div></div>`;
    const tasksDone = r.tasks.filter((t) => t.done).length;
    const wrongComms = r.byCode.find((b) => b.code === 'comms-wrong')?.n || 0;
    const tiles = [
      tile(t('rp.t.trains'), `${r.done} / ${r.trains}`, t('rp.t.trains.s'), r.done === r.trains ? 'good' : r.unfinished.length ? 'bad' : ''),
      tile(t('rp.t.onTime'), String(r.onTime), t('rp.t.onTime.s'), r.onTime ? 'good' : ''),
      tile(t('rp.t.delayed'), String(r.delayed), r.delayed ? t('rp.t.delayed.s', { n: r.delayMinutes }) : t('rp.t.none'), r.delayed ? 'bad' : 'good'),
      r.tasks.length ? tile(t('rp.t.tasks'), `${tasksDone} / ${r.tasks.length}`, t('rp.t.tasks.s'), tasksDone === r.tasks.length ? 'good' : r.tasks.some((t) => t.failed) ? 'bad' : '') : '',
      tile(t('rp.t.emergency'), `${(c.dPz || 0) + (c.dPo || 0) + (c.dKo || 0)}`, `dPz ${c.dPz || 0} · dPo ${c.dPo || 0} · dKo ${c.dKo || 0}`, (c.dPz || 0) + (c.dPo || 0) + (c.dKo || 0) ? 'bad' : 'good'),
      tile(t('rp.t.sz'), String(c.Sz || 0), 'Sz', ''),
      tile(t('rp.t.comms'), String(wrongComms), t(wrongComms ? 'rp.t.comms.bad' : 'rp.t.comms.ok'), wrongComms ? 'bad' : 'good'),
      tile(t('rp.t.split'), String(c.rozprucie || 0), t('rp.t.split.s'), c.rozprucie ? 'bad' : 'good'),
    ].join('');
    const trainRows = r.rows.map((t) => {
      const res = !t.done ? [tr('rp.res.undone'), 'rp-bad'] : t.delay > 2 ? [tr('rp.res.late', { n: t.delay }), 'rp-warn'] : [tr('rp.res.ok'), 'rp-ok'];
      const wrongTrack = t.actualTrack && t.track && String(t.actualTrack) !== String(t.track);
      return `<tr class="${t.done ? '' : 'undone'}">
        <td class="nr">${t.cat ? `<span class="cat cat-${t.cat}">${esc(t.catLabel ?? t.cat)}</span> ` : ''}${t.nr}</td>
        <td class="rel">${esc(t.relation)}</td>
        <td>${t.arr ? (t.stop ? esc(t.arr) : `<i>${esc(t.arr)}</i>`) : '–'}<div class="act">${t.actualArr != null ? hm(t.actualArr) : ''}</div></td>
        <td>${t.dep ? esc(t.dep) : (t.to ? '–' : tr('rp.endsHere'))}<div class="act">${t.actualDep != null ? hm(t.actualDep) : ''}</div></td>
        <td>${esc(t.track)}${wrongTrack ? `<div class="act rp-warn">→ ${esc(t.actualTrack)}</div>` : ''}</td>
        <td class="${res[1]}">${res[0]}${t.delayIn ? `<div class="act">${tr('rp.fromNeighbour', { n: t.delayIn })}</div>` : ''}</td>
        <td class="st">${esc(t.status)}</td></tr>`;
    }).join('');
    const tasks = r.tasks.length ? `<ul class="rp-tasks">${r.tasks.map((t) => `<li class="${t.done ? 'rp-ok' : t.failed ? 'rp-bad' : ''}">${uiIcon(t.done ? 'check' : t.failed ? 'cross' : 'todo', 13)} ${esc(t.text)} <span class="act">${t.done ? tr('rp.task.done', { time: hm(t.doneAt) }) : t.failed ? tr('rp.task.failed') : tr('rp.task.due', { time: esc(t.deadline) })}</span></li>`).join('')}</ul>` : '';
    const items = r.items.length
      ? r.items.map((i) => `<tr class="${i.points < 0 ? 'neg' : i.points > 0 ? 'pos' : ''}"><td>${hm(i.time)}</td><td>${esc(i.msg)}</td><td class="pts">${i.points > 0 ? '+' : ''}${i.points}</td></tr>`).join('')
      : `<tr><td colspan="3" class="muted">${t('rp.noItems')}</td></tr>`;
    const chips = r.byCode.map((b) => `<span class="rp-chip ${b.points < 0 ? 'neg' : b.points > 0 ? 'pos' : ''}">${esc(b.code)} × ${b.n} <b>${b.points > 0 ? '+' : ''}${b.points}</b></span>`).join('');
    this.root.innerHTML = `<div class="report-screen">
      <header class="st-hero">
        <div class="st-logo">${logoSvg()}</div>
        <div class="st-tagline">${t(ended ? 'rp.title' : 'rp.titleLive')}</div>
        <div class="st-sub">${esc(r.station)}${r.district ? ` · ${esc(r.district)}` : ''} · ${esc(r.scenario)} · ${hm(r.startTime)}–${hm(ended ? r.endedAt : r.now)} · ${esc(r.srk)} · ${t('rp.level')}: ${esc(r.level)}</div>
        <button type="button" class="tb st-close close">${t('rp.back')}</button>
      </header>
      <div class="rp-grid">
        <section class="rp-grade grade-${r.grade}">
          <span class="st-kicker">${t('rp.grade')}</span>
          <div class="rp-gword">${esc(t(`grade.${r.grade}`))}</div>
          <div class="rp-points">${r.total > 0 ? '+' : ''}${r.total} ${t('rp.pts')}</div>
          <div class="rp-end">${endLine}</div>
        </section>
        <section class="rp-stats">${tiles}</section>
      </div>
      <section class="rp-section">
        <h3><span class="st-kicker">${t('rp.h.traffic')}</span>${t('rp.h.trains')}</h3>
        <table class="rj rp-trains"><thead><tr><th>${t('rp.col.nr')}</th><th>${t('rp.col.rel')}</th><th>${t('rp.col.arr')}</th><th>${t('rp.col.dep')}</th><th>${t('rp.col.track')}</th><th>${t('rp.col.result')}</th><th>${t('rp.col.state')}</th></tr></thead><tbody>${trainRows}</tbody></table>
      </section>
      ${tasks ? `<section class="rp-section"><h3><span class="st-kicker">${t('rp.h.shunt')}</span>${t('rp.h.tasks')}</h3>${tasks}</section>` : ''}
      <section class="rp-section">
        <h3><span class="st-kicker">${t('rp.h.score')}</span>${t('rp.h.items')}</h3>
        <div class="rp-chips">${chips}</div>
        <table class="rj rp-items"><thead><tr><th>${t('rp.col.time')}</th><th>${t('rp.col.event')}</th><th>${t('rp.col.pts')}</th></tr></thead><tbody>${items}</tbody></table>
        <p class="muted small">${t('rp.rules')}</p>
      </section>
      <div class="rp-actions">
        <button type="button" id="rp-new" class="tb primary st-go">${t('rp.new')}</button>
        <button type="button" id="rp-again" class="tb">${t('rp.again')}</button>
        <button type="button" class="tb close">${t(ended ? 'rp.viewDesk' : 'rp.close')}</button>
      </div>
    </div>`;
  }

  show() { this.render(); openDialog(this.root); }
  hide() { closeDialog(this.root); }
}
