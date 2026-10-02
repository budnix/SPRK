import { Clock } from '../../src/core/Clock.js';
import { DISRUPTION_LEVELS } from '../../src/core/Random.js';
import { EXTRA_TRAIN } from '../../src/model/Simulation.js';
import { hasErrors, LATE_SLACK, TASK_GRACE, levelSlackMin } from '../../src/model/scenarioCheck.js';
import pl from '../../src/i18n/pl.js';
import { FAULTS } from '../../src/model/faults/types.js';

/**
 * Werdykt zmiany zagranej automatem (`verdict`): ustalenia BŁĄD / uwaga / informacja z raportu zmiany
 * (`shift-report.mjs`, `checkShift`) wg reguł z docs/architecture/testy-i-narzedzia.md („Automat sprawdzający scenariusze”), ocena
 * scenariusza z definicji i zmian (`scenarioStatus`), uwagi powtarzalne (`deterministicWarnings`) i teksty ustaleń
 * (po polsku, jak komunikaty modelu; przyczyny postoju – z tekstów panelu `sp.wait.*`). Czyste funkcje: bez wątków
 * i wyjścia – testuje je tests/scenario-check.test.js. Tu zmienia się reguły oceny, nie w skrypcie.
 */

const MARGIN_MIN = 5;
const NOTABLE_MIN = 5;
const PLAN_DELAY_ERROR_MIN = 15;
export const LINE_CODES = new Set(['line-occupied', 'no-permission', 'po-blocked', 'line-inbound', 'sbl-direction', 'neighbour-wait']);
/** Nazwa rodzaju usterki w dopełniaczu („usterka semafora”) – z opisu rodzaju (src/model/faults/types.js). */
const FAULT_NAMES = Object.fromEntries(Object.entries(FAULTS).map(([type, f]) => [type, f.name]));
const WORKAROUND = 'gracz użyłby sygnału zastępczego / rozkazu „S”, zerowania licznika albo innego toru';

const same = (a, b) => String(a) === String(b);

export const hm = (s) => (s == null || !Number.isFinite(s) ? '—' : Clock.format(s));
export const hms = (s) => (s == null || !Number.isFinite(s) ? '—' : Clock.format(s, true));
/** Minuty i sekundy (m:ss) – zapas bez zaokrąglania w górę. */
const mmss = (s) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.floor(Math.max(0, s) % 60)).padStart(2, '0')}`;

/** Liczebnik: `plural(1, 'uwaga', 'uwagi', 'uwag')` → „1 uwaga”, 2 → „2 uwagi”, 5 → „5 uwag”. */
export function plural(n, one, few, many) {
  const a = Math.abs(n) % 100, b = a % 10;
  return `${n} ${n === 1 ? one : b >= 2 && b <= 4 && (a < 12 || a > 14) ? few : many}`;
}

/** Nazwa pociągu z rozkładu; dopiski (nadzwyczajny, obsługa …) w jednym nawiasie. */
function trainName(r, nr, notes = []) {
  const tr = r.trains.find((x) => same(x.nr, nr));
  const all = [...(tr?.extra ? ['nadzwyczajny'] : []), ...notes].filter(Boolean);
  return `${tr ? tr.label : `poc. ${nr}`}${all.length ? ` (${all.join(', ')})` : ''}`;
}

const fill = (tpl, r) => tpl.replace(/\{(\w+)\}/g, (_, k) => r[k] ?? '?');

/** Przyczyna postoju słowami (teksty zakładki „Pociągi”) z kodem. */
export function reasonText(r, where = null) {
  if (!r) {
    if (where?.moving) return 'w ruchu';
    if (where?.proceed) return `sygnał zezwalający na ${where.nextSignal} – rusza`;
    if (where?.state === 'dwell') return 'postój handlowy przy peronie';
    if (where?.at === 'line') return 'jedzie po szlaku do stacji';
    return 'bez przyczyny postoju w danych';
  }
  if (r.code === 'neighbour-wait') {
    const why = r.requested === true ? 'zgłoszony, bez pozwolenia albo szlak zajęty' : r.requested === false ? 'jeszcze niezgłoszony – szlak zajęty albo wcześniejszy pociąg w kolejce' : 'szlak zajęty, brak pozwolenia albo wcześniejszy pociąg w kolejce';
    return `czeka u sąsiada (${r.neighbour}) na wyprawienie – ${why} (neighbour-wait)`;
  }
  if (r.code === 'unit-wait') return `skład pociągu ${r.unit} nie przekazany – manewry albo zadanie w toku (unit-wait)`;
  const tpl = pl[`sp.wait.${r.code}`];
  return `${tpl ? fill(tpl, r) : r.code} (${r.code}${r.signal ? `@${r.signal}` : ''})`;
}

/** Przeszkoda przebiegu słowami: komunikat zależności + kto ją powoduje. */
export function blockerText(b) {
  const who = b.train != null ? ` – poc. ${b.train}` : b.fault ? ` – usterka ${FAULT_NAMES[b.fault] ?? b.fault}` : b.own ? ' – położenie ustawia dyżurny' : '';
  return `${b.route}: ${b.msg}${who}`;
}

function whereText(w, since) {
  if (!w) return '';
  const from = since != null ? ` od ${hms(since)}` : '';
  switch (w.at) {
    case 'neighbour': return `u sąsiada (${w.neighbour})${from}`;
    case 'line': return `na szlaku od ${w.exit}${from}`;
    case 'gone': return 'poza stacją';
    case 'station': return `${w.track ? `tor ${w.track}` : 'głowica'} (${w.sections.join(', ')})${w.nextSignal ? `, przed ${w.nextSignal}` : ''}${w.moving ? ', w ruchu' : `, stoi${from}`}${w.mode === 'shunt' ? ' (manewry)' : ''}`;
    default: return 'bez składu';
  }
}

/** Miejsce i przyczyna postoju pociągu nieobsłużonego – bez powtórzenia „w ruchu” (mówi je już miejsce). */
function standText(r, u) {
  const where = whereText(u.where, u.since);
  const why = !u.reason && u.where?.moving ? '' : reasonText(u.reason, u.where);
  const line = u.lineTrain != null ? `; szlak zajmuje ${trainName(r, u.lineTrain)}` : '';
  return [where, why].filter(Boolean).join('; ') + line;
}

/**
 * Pociąg opóźniony z zewnątrz (blokujący inny pociąg – kaskada): nadzwyczajny, z opóźnieniem od sąsiada albo ze
 * składu, który przyszedł z opóźnieniem, albo czekający co najmniej 2 min na szlak (przepustowość, nie układ stacji).
 * Opóźnienie przez konflikt z innym pociągiem na stacji to nie jest opóźnienie z zewnątrz.
 */
const isLate = (r, nr) => {
  const tr = r.trains.find((x) => same(x.nr, nr));
  return !!tr && (tr.extra || tr.delayIn > 0 || tr.unitLagMin > 0 || tr.waits.some((w) => LINE_CODES.has(w.code) && w.min >= 2));
};

/**
 * Zapas do końca zmiany (s) przy zmianie zakończonej obsłużeniem wszystkiego, inaczej null. Samouczek kończy się
 * dopiero o `endTime` – zapas od chwili, gdy wszystko było obsłużone.
 */
export function marginOf(r) {
  if (!r.hasEndTime || r.endReason !== 'all-done') return null;
  const done = r.autoEnd === false ? r.allDoneAt ?? r.endedAt : r.endedAt;
  return done == null ? null : r.endTime - done;
}

/** Przeszkody z zewnątrz (bez położenia zwrotnic własnego przebiegu). */
const external = (bs) => (bs || []).filter((b) => !b.own);

/**
 * Postoje pociągu z winy stacji (min): bez postojów przez szlak (`LINE_CODES`), bez minut przy usterce, bez postojów,
 * w których diagnozie blokuje pociąg opóźniony z zewnątrz (kaskada) albo cudzy przebieg bez ustalonego pociągu.
 */
function ownWaits(r, tr) {
  let min = 0;
  for (const w of tr?.waits || []) {
    if (LINE_CODES.has(w.code)) continue;
    const ep = tr.episodes.find((x) => x.code === w.code && x.signal === w.signal);
    if (external(ep?.blockers).some((b) => (b.train != null && isLate(r, b.train)) || (b.by && b.train == null))) continue;
    min += Math.max(0, w.min - w.faultMin);
  }
  return { min };
}

/** Usterki słowami: „usterka semafora A”, losowa poziomu – „losowa usterka semafora A (poziom high)”. */
const faultsText = (fs, level) => fs.map((f) => `${f.scripted === false ? 'losowa usterka' : 'usterka'} ${FAULT_NAMES[f.type] ?? f.type} ${f.target}${f.scripted === false ? ` (poziom ${level})` : ''}`).join(', ');

/** Kto zajmował tor planowy pociągu przyjętego na inny tor. */
function holderText(r, w) {
  const h = w.holder;
  const parts = [];
  if (h?.train != null) parts.push(`tor planowy zajmował ${trainName(r, h.train)}${h.route ? ` (przebieg ${h.route})` : ''}`);
  else if (h?.route) parts.push(`na torze planowym przebieg ${h.route}`);
  else if (h?.closed) parts.push('tor planowy zamknięty');
  parts.push(w.planClash?.length ? `plan kładzie na ten tor w tym czasie także ${w.planClash.map((n) => trainName(r, n)).join(', ')}` : 'plan nie dzieli toru – tor zajęty przez opóźnienie albo decyzję automatu');
  return parts.join('; ');
}

/**
 * Werdykt zmiany z raportu `checkShift` (czysta funkcja): `{ status: 'ok' | 'warn' | 'error', findings }`, gdzie
 * `findings` – `{ level: 'error' | 'warning' | 'info', code, msg, train?, brief? }` (`info` nie zmienia statusu).
 * Poziom scenariusza (`baseLevel`: none albo wymuszony `disruptions`) jest jego zamysłem – tam uwagi są uwagami; na
 * poziomie wybieranym przez gracza część z nich to informacja o odporności (pociągi za końcem zmiany przez opóźnienie
 * od sąsiada). Pełna lista reguł: docs/architecture/testy-i-narzedzia.md („Automat sprawdzający scenariusze”).
 */
export function verdict(r) {
  const findings = [];
  const add = (level, code, msg, train, brief) => findings.push({ level, code, msg, ...(train != null ? { train } : {}), ...(brief ? { brief } : {}) });
  const error = (code, msg, train, brief) => add('error', code, msg, train, brief);
  const warn = (code, msg, train, brief) => add('warning', code, msg, train, brief);
  const info = (code, msg, train, brief) => add('info', code, msg, train, brief);
  const base = r.effectiveLevel === (r.baseLevel ?? 'none');
  const none = r.effectiveLevel === 'none';
  // zależne od poziomu: na poziomie scenariusza uwaga, na poziomie gracza – informacja o odporności
  const note = base ? warn : info;
  const T = (nr, notes) => trainName(r, nr, notes);
  if (r.error) {
    error('exception', `Przebieg przerwany wyjątkiem: ${String(r.error).split('\n').filter((l) => !/^\s+at /.test(l)).join('; ')}`);
    return { status: 'error', findings };
  }
  if (!r.trains.some((t) => !t.extra)) error('no-traffic', 'Zmiana bez ani jednego pociągu rozkładu – scenariusz niczego nie sprawdza');
  // bezpieczeństwo
  if (r.violations?.count) error('violation', `Naruszenia zależności: ${r.violations.count} (${r.violations.first.map((v) => `${v.time} ${v.msg}`).join('; ')}${r.violations.count > r.violations.first.length ? '; …' : ''})`);
  // jazda po pękniętej szynie z usterki ze scenariusza na tym odcinku: automat nie zamyka toru (ITS) – ograniczenie
  // automatu, nie scenariusza; bez takiej usterki (track-defect bywa tylko w scenariuszu) – zabezpieczenie: błąd
  const automatDefect = (ev) => r.faults.some((f) => f.scripted && f.type === 'track-defect' && (ev.section == null || f.target === ev.section));
  for (const ev of r.events) {
    if (ev.code === 'track-defect' && automatDefect(ev)) info('automat-limit', `${hms(ev.time)} ${ev.msg} – automat nie zamyka toru z usterką nawierzchni; gracz zamknąłby tor (ITS) i poprowadził ruch innym`, ev.nr ?? undefined, ev.nr != null ? `${T(ev.nr)} po pękniętej szynie${ev.section ? ` ${ev.section}` : ''}` : 'jazda po pękniętej szynie');
    else error(ev.code, `${hms(ev.time)} ${ev.msg}`, ev.nr ?? undefined);
  }
  // zator po zapasie
  for (const j of r.jam) {
    const hint = j.task ? `; zadanie „${j.task.id}” na tor ${j.task.toTrack}${j.task.reachable ? ' – graf przebiegów manewrowych uznaje tor za osiągalny, możliwe ograniczenie automatu (automat-limit?)' : ' – toru nie da się osiągnąć przebiegami manewrowymi'}` : '';
    error('jam', `${T(j.nr)} nie dojechał do ${hms(r.until)} (koniec zmiany + zapas) – ${j.status}; ${standText(r, j)}${hint}`, j.nr);
  }
  // pociągi nieobsłużone w chwili końca zmiany
  const jammed = new Set(r.jam.map((j) => String(j.nr)));
  const lateIn = [], tight = [], extras = [];
  for (const u of r.unfinished) {
    const tr = r.trains.find((x) => same(x.nr, u.nr));
    if (tr?.extra) { extras.push(u); continue; }
    // nie zdąży wg planu i opóźnienia wniesionego (od sąsiada, ze składu): bez opóźnienia – plan za ciasny (błąd, jak
    // tt-after-end w definicji), z opóźnieniem – kara „nieobsłużony” bez winy dyżurnego
    if (u.expectedDone == null || u.expectedDone > r.endTime - LATE_SLACK) { ((tr?.lagMin ?? 0) > 0 ? lateIn : tight).push(u); continue; }
    if (jammed.has(String(u.nr))) continue; // zator – już błąd
    const own = ownWaits(r, tr);
    // stoi teraz przez usterkę albo przez usterki stał co najmniej 5 min, a z winy stacji mniej niż 5 min
    if (u.faultsNow?.length || (own.min < NOTABLE_MIN && (tr?.faultMin ?? 0) >= NOTABLE_MIN)) {
      const fs = u.faultsNow?.length ? u.faultsNow : u.faults;
      const cannot = fs.length && fs.every((f) => FAULTS[f.type]?.automat === false);
      info(cannot ? 'automat-limit' : 'fault-wait', `${T(u.nr)} nieobsłużony na koniec zmiany – ${faultsText(fs, r.effectiveLevel)} na jego drodze; ${cannot ? 'automat jej nie usuwa' : 'automat czeka na naprawę'} (${WORKAROUND})`, u.nr, `${T(u.nr)} nieobsłużony – ${faultsText(fs, r.effectiveLevel)}`);
      continue;
    }
    const by = external(u.blockers).filter((b) => b.train != null);
    const why = `${standText(r, u)}${by.length ? `; blokuje ${[...new Set(by.map((b) => T(b.train)))].join(', ')}` : ''}${tr?.waits.length ? `; postoje: ${tr.waits.slice(0, 3).map((w) => `${w.code}${w.signal ? `@${w.signal}` : ''} ${w.min} min`).join(', ')}` : ''}`;
    const plan = `plan: ${tr?.arr ? `przyjazd ${tr.arr}, ` : ''}${tr?.dep ? `odjazd ${tr.dep}` : `przyjazd ${tr?.arr ?? '—'}`}, koniec ${hm(r.endTime)}`;
    if (none) error('unfinished-plan', `${T(u.nr)} nieobsłużony na koniec zmiany bez zakłóceń (poziom none) – przyczyną jest plan albo automat; ${plan}; ${why}`, u.nr);
    else if (own.min >= NOTABLE_MIN) error('unfinished', `${T(u.nr)} nieobsłużony na koniec zmiany ${hm(r.endTime)}, choć wg planu i opóźnienia od sąsiada zdążyłby (${hm(u.expectedDone)}); postój z winy stacji ${own.min} min – ${why}`, u.nr);
    else note('cascade', `${T(u.nr)} nieobsłużony na koniec zmiany ${hm(r.endTime)} (wg planu ${hm(u.expectedDone)}) przez opóźnienie innego pociągu z zewnątrz, szlak albo czas przejazdu – ${why}`, u.nr, `${T(u.nr)} nieobsłużony`);
  }
  for (const u of tight) {
    const tr = r.trains.find((x) => same(x.nr, u.nr));
    error('plan-tight', `${T(u.nr)} nieobsłużony na koniec zmiany: plan – ${tr?.dep ? `odjazd ${tr.dep}` : `przyjazd ${tr?.arr ?? '—'}`}, koniec ${hm(r.endTime)}; mniej niż ${LATE_SLACK / 60} min na wyjazd ze stacji (bez opóźnienia od sąsiada) – wydłuż endTime albo usuń pociąg`, u.nr);
  }
  if (lateIn.length) {
    const list = lateIn.map((u) => {
      const tr = r.trains.find((x) => same(x.nr, u.nr));
      const src = tr?.unit != null && tr.unitLagMin > 0 ? `skład z ${T(tr.unit)}, +${tr.unitLagMin} min` : `+${tr?.delayIn ?? 0} min od sąsiada`;
      return T(u.nr, [src, `obsługa ok. ${hm(u.expectedDone)}`]);
    });
    const lv = r.effectiveLevel;
    const slack = DISRUPTION_LEVELS[lv]?.delayMax ? ` Przy poziomie ${lv} zapas planu ${levelSlackMin(lv)} min (uwaga sc-slack definicji).` : '';
    const short = lateIn.map((u) => { const tr = r.trains.find((x) => same(x.nr, u.nr)); return `${T(u.nr)} +${tr?.lagMin ?? 0} min`; });
    note('late-inbound', `${plural(lateIn.length, 'pociąg', 'pociągi', 'pociągów')} nie zdąży przed końcem zmiany ${hm(r.endTime)} przez opóźnienie wniesione (potrzeba co najmniej ${LATE_SLACK / 60} min na wyjazd ze stacji): ${list.join(', ')} – bez kary (opóźnienie z zewnątrz), ale zmiana kończy się bez ich obsługi.${slack}`, undefined, `${lateIn.length} poc.: ${short.join(', ')}`);
  }
  if (extras.length) {
    info('extra-after-end', `Pociągi nadzwyczajne bez obsługi do końca zmiany ${hm(r.endTime)}: ${extras.map((u) => T(u.nr, [`obsługa ok. ${hm(u.expectedDone)}`])).join(', ')} – planowane tak, żeby mieściły się w zmianie (ostatnie zdarzenie co najmniej ${EXTRA_TRAIN.endSlack / 60} min przed końcem); nie zdążyły przez opóźnienie w ruchu`, undefined, `${extras.length} poc.: ${extras.map((u) => `${T(u.nr)} ok. ${hm(u.expectedDone)}`).join(', ')}`);
  }
  // czynności wymuszone usterką i stan po zmianie
  for (const f of r.forced) error('forced', `Kara za czynność, której nie wymusiła usterka: ${f}`);
  for (const l of r.leftovers) error('leftovers', `Stan urządzeń po zmianie: ${l}`);
  // zadania manewrowe: po końcu zmiany gra już nie karze – przepadłe / otwarte po endTime to uwaga (jak task-after-end
  // w definicji), nie błąd
  for (const k of r.tasks) {
    const exposed = k.faultShiftMin > 0 || r.faults.some((f) => f.trains.includes(String(k.unit)));
    const afterEnd = r.hasEndTime && k.deadline + TASK_GRACE > r.endTime;
    if (k.failed && afterEnd) note('task-after-end', `Zadanie „${k.id}” (skład ${k.unit} na tor ${k.toTrack}) przepadło po końcu zmiany – termin ${hm(k.deadline)} + 10 min po ${hm(r.endTime)}, bez kary w grze`, k.unit);
    else if (k.failed) (exposed ? note : error)(exposed ? 'task-failed-fault' : 'task-failed', `Zadanie „${k.id}” (skład ${k.unit} na tor ${k.toTrack}) przepadło – termin ${hm(k.deadline)}${exposed ? ', na drodze usterka' : ''}`, k.unit);
    else if (k.late) note('task-late', `Zadanie „${k.id}” wykonane po terminie ${hm(k.deadline)} (${hms(k.doneAt)}) – bez punktów`, k.unit);
    else if (!k.done) note(afterEnd ? 'task-after-end' : 'task-open', `Zadanie „${k.id}” ani wykonane, ani przepadłe do ${hms(r.until)} – termin ${hm(k.deadline)}${afterEnd ? ` + 10 min po końcu zmiany ${hm(r.endTime)}, bez kary w grze` : ' za blisko końca zmiany'}`, k.unit);
  }
  // usterki ze scenariusza bez wpływu na ruch: bez zakłóceń (powtarzalnie) – błąd; przy zakłóceniach – informacja
  for (const f of r.faults) {
    if (!f.scripted || f.trains.length) continue;
    const msg = `Usterka ${FAULT_NAMES[f.type] ?? f.type} ${f.target} (${hm(f.at)}, ${f.min} min) nie dotknęła żadnego pociągu${f.since == null ? ' – nie wystąpiła' : ''} – scenariusz jej nie sprawdza; przesuń ją na czas ruchu`;
    (none ? error : base ? warn : info)('fault-no-effect', msg, undefined, `${FAULT_NAMES[f.type] ?? f.type} ${f.target}`);
  }
  // zapas do końca zmiany
  const margin = marginOf(r);
  if (margin != null && margin < MARGIN_MIN * 60) {
    note('margin', `Zapas do końca zmiany ${mmss(margin)} (< ${MARGIN_MIN} min) – wszystko obsłużone o ${hms(r.endTime - margin)}, koniec ${hm(r.endTime)}; mały postój da kary „nieobsłużony”`);
  }
  // pociągi obsłużone: opóźnienie na stacji (kara late-depart / late-pass), przetrzymanie, długi postój – bez zakłóceń
  // każda kara (powtarzalna, z planu albo automatu), przy zakłóceniach od 5 min
  const unfinished = new Set(r.unfinished.map((u) => String(u.nr)));
  for (const tr of r.trains) {
    if (unfinished.has(String(tr.nr))) continue;
    if (tr.depObserved && tr.depTime != null && tr.actualDep < tr.depTime - 30) {
      info('early-depart', `${T(tr.nr)}: stoi od początku zmiany i ruszył ${hms(tr.actualDep)}, przed planowym odjazdem ${tr.dep} – silnik nie trzyma takiego pociągu do odjazdu, a automat podaje wyjazd od razu`, tr.nr, `${T(tr.nr)} ${hm(tr.actualDep)} zamiast ${tr.dep}`);
    }
    const own = Math.max(0, tr.stationMin - tr.faultMin);
    const obs = tr.obsLateMin >= 2 ? tr.obsLateMin : 0;
    const top = tr.waits.map((w) => ({ ...w, own: w.min - w.faultMin })).filter((w) => w.own >= 1).sort((a, b) => b.own - a.own)[0];
    if (tr.faultMin >= NOTABLE_MIN) info('fault-wait', `${T(tr.nr)}: automat czekał ${tr.faultMin} min na naprawę – ${faultsText(tr.faults, r.effectiveLevel)} (${WORKAROUND})`, tr.nr, `${T(tr.nr)} ${tr.faultMin} min – ${faultsText(tr.faults, r.effectiveLevel)}`);
    // kara „przetrzymany” (ponad 4 min przed semaforem) z postoju przy usterce – nie wina stacji
    const held = tr.held && tr.faultMin < 4;
    const notable = none ? 1 : NOTABLE_MIN;
    if (!(own >= notable || obs >= notable || held || (top && top.own >= NOTABLE_MIN))) continue;
    const ep = top && tr.episodes.find((x) => x.code === top.code && x.signal === top.signal && x.blockers.length);
    const ext = external(ep?.blockers);
    const conflict = ext.filter((b) => b.train != null || b.by);
    // bez przeszkody z zewnątrz, a pociągu dotknęła usterka (np. łączność blokady) – skutek usterki, nie planu
    const code = top && LINE_CODES.has(top.code) ? 'line-capacity' : conflict.length ? 'track-conflict' : ext.length ? 'station-delay' : tr.faults.length ? 'fault-wait' : 'automat-delay';
    const parts = [];
    if (own) parts.push(`kara za opóźnienie na stacji ${own} min${tr.lineMin ? ` (w tym czekanie na szlak ${tr.lineMin} min)` : ''}`);
    if (obs) parts.push(`odjazd ok. ${obs} min po planie (pociąg stojący od początku zmiany – silnik nie liczy mu kary)`);
    if (held) parts.push('przetrzymany przed semaforem ponad 4 min');
    if (top) parts.push(`czekał ${top.own} min (${hms(top.from)}–${hms(top.to)}): ${reasonText(top)}`);
    if (ep?.blockers.length) parts.push(`przeszkody: ${ep.blockers.slice(0, 3).map(blockerText).join('; ')}`);
    if (code === 'automat-delay') parts.push(top ? 'bez przeszkody z zewnątrz w danych – zwłoka automatu' : 'bez postoju w danych – przyczyna nieznana (jazda na sygnale ograniczającym?)');
    if (code === 'fault-wait') parts.push(`pociąg dotknęła ${faultsText(tr.faults, r.effectiveLevel)} – opóźnienie przy jej obsłudze`);
    const first = conflict.find((b) => b.train != null);
    const brief = `${T(tr.nr)} ${[own ? `−${own} min` : '', obs ? `+${obs} min` : '', top ? `${top.code}${top.signal ? `@${top.signal}` : ''} ${top.own} min` : '', first ? `z ${T(first.train)}` : conflict[0]?.by ? `z przebiegiem ${conflict[0].by}` : '', held ? 'przetrzymany' : ''].filter(Boolean).join(', ')}`;
    // bez zakłóceń kwadrans opóźnienia to wada planu (albo automatu) – błąd
    const lvl = code === 'fault-wait' ? info : none && own + obs >= PLAN_DELAY_ERROR_MIN ? error : code === 'automat-delay' && !base ? info : warn;
    lvl(code, `${T(tr.nr)}: ${parts.join('; ')}`, tr.nr, brief);
  }
  for (const w of r.wrongTrack) warn('wrong-track', `${hms(w.time)} ${w.msg} – ${holderText(r, w)}`, w.nr ?? undefined, w.nr != null ? T(w.nr, [w.holder?.train != null ? `tor zajmował ${trainName(r, w.holder.train)}` : '', w.planClash?.length ? 'tak w planie' : '']) : null);
  for (const d of r.duties) warn('block-duty', `${hms(d.time)} ${d.msg}`, d.nr ?? undefined);
  // sonda usterek (poziom scenariusza zastąpiony przez none): liczy się tylko wpływ usterek i bezpieczeństwo
  const kept = r.faultProbe ? findings.filter((f) => f.code === 'fault-no-effect' || f.level === 'error' && ['violation', 'spad', 'rozprucie', 'exception', 'jam'].includes(f.code)) : findings;
  const status = kept.some((f) => f.level === 'error') ? 'error' : kept.some((f) => f.level === 'warning') ? 'warn' : 'ok';
  return { status, findings: kept };
}

/**
 * Ocena scenariusza (czysta funkcja) z definicji (`checkScenario`) i zmian (`checkShift`): BŁĘDY – błąd definicji
 * albo zmiana z błędem na dowolnym poziomie; UWAGI – uwaga w definicji albo w zmianie na poziomie scenariusza: bez
 * zakłóceń (none – powtarzalna) każda, przy poziomie wymuszonym (`disruptions`, np. szczyt = high) – rodzaj uwagi
 * powtarzający się we wszystkich ziarnach (`repeated`); inaczej OK. Uwagi z poziomów wybieranych przez gracza to
 * odporność (`robustness`: poziom → { shifts, warned, codes }), bez wpływu na ocenę.
 */
export function scenarioStatus(staticFindings, shifts) {
  const isBase = (s) => !s.faultProbe && s.effectiveLevel === (s.baseLevel ?? 'none');
  const warnCodes = (s) => new Set(s.findings.filter((f) => f.level === 'warning').map((f) => f.code));
  const base = shifts.filter((s) => isBase(s) && !s.error);
  let repeated = [];
  if (base.some((s) => s.effectiveLevel === 'none')) repeated = [...new Set(base.flatMap((s) => [...warnCodes(s)]))];
  else if (base.length) {
    const sets = base.map(warnCodes);
    repeated = [...sets[0]].filter((c) => sets.every((x) => x.has(c)));
  }
  let status = hasErrors(staticFindings) || shifts.some((s) => s.status === 'error') ? 'error' : 'ok';
  if (status === 'ok' && (staticFindings.some((f) => f.level === 'warning') || repeated.length)) status = 'warn';
  const robustness = {};
  for (const s of shifts) {
    if (isBase(s) || s.faultProbe || s.error) continue;
    const x = (robustness[s.effectiveLevel] ??= { shifts: 0, warned: 0, codes: {} });
    x.shifts++;
    const ws = warnCodes(s);
    if (ws.size) x.warned++;
    for (const c of ws) x.codes[c] = (x.codes[c] || 0) + 1;
  }
  return { status, repeated, robustness };
}

/**
 * Uwagi powtarzalne scenariusza jako klucze „kod” albo „kod:pociąg” (posortowane, bez powtórzeń): uwagi definicji
 * i uwagi przebiegu na poziomie scenariusza, gdy ten jest bez zakłóceń (none – praktycznie powtarzalny). Do listy
 * przyjętych uwag w `npm test` (tests/scenario-accepted.js).
 */
export function deterministicWarnings(staticFindings, shift = null) {
  const keys = staticFindings.filter((f) => f.level === 'warning').map((f) => (f.train != null ? `${f.code}:${f.train}` : f.code));
  if (shift && !shift.faultProbe && shift.effectiveLevel === 'none' && (shift.baseLevel ?? 'none') === 'none') {
    for (const f of shift.findings) if (f.level === 'warning') keys.push(f.train != null ? `${f.code}:${f.train}` : f.code);
  }
  return [...new Set(keys)].sort();
}
