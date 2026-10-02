#!/usr/bin/env node
/**
 * Automat sprawdzający scenariusze: gra każdą zmianę dyżurnym automatycznym w przyspieszonym cyklu (bez widoku) od
 * startu do końca zmiany plus zapas i mówi, czy scenariusz jest w porządku – do szybkiego dodawania wariantów (inna
 * długość, inny start, podzbiór pociągów, usterki) istniejących i nowych stacji.
 *
 *   npm run check -- tczew                       # wszystkie scenariusze stacji: poziomy none/low/high, ziarna 1–3
 *   npm run check -- tczew:zmiana --seeds 1 --level low --verbose
 *   npm run check                                # wszystkie stacje
 *
 * Dla każdego scenariusza:
 *  1. definicja – `validateStation` (raz na stację) i `checkScenario` (src/model/scenarioCheck.js): błędy widoczne bez
 *     grania (okno zmiany, pociągi nie do obsłużenia, kierunek jazdy, zadania, usterki, zamknięcia, rozkład za gęsty),
 *  2. przebiegi – raport zmiany (`checkShift`, scripts/lib/shift-report.mjs; pętla zmiany `playShift` wspólna z przeglądem silnika, src/model/check/play.js): co takt automatu próbka
 *     przyczyn postoju pociągów (`Traffic.waitReason`), przy postoju ponad 5 min – przeszkody przebiegu
 *     (`Interlocking.routeProblems`) z przypisaniem do pociągu albo usterki; migawka pociągów nieobsłużonych w chwili
 *     końca zmiany; po zapasie – zator, naruszenia zależności, spad / rozprucie, kary wymuszone usterką, stan urządzeń,
 *  3. werdykt zmiany (`verdict`, scripts/lib/verdict.mjs): BŁĘDY / UWAGI / OK (+ informacje bez wpływu na ocenę) wg reguł z docs/architecture/testy-i-narzedzia.md
 *     („Automat sprawdzający scenariusze”),
 *  4. ocena scenariusza: definicja, przebiegi na poziomie scenariusza (bez zakłóceń albo wymuszonym `disruptions`)
 *     i błędy z każdego poziomu; uwagi z poziomów wybieranych przez gracza – osobno, jako odporność.
 *
 * Kod wyjścia: 1 – scenariusz z oceną BŁĘDY (z `--strict` także UWAGI); 0 – inaczej; 2 – błędne opcje, nieznana
 * stacja / scenariusz. Ten plik to wiersz poleceń: opcje (`parseArgs`), lista sprawdzeń (`listChecks`), wątki i wydruk;
 * raport zmiany i reguły oceny są w scripts/lib/ (`shift-report.mjs`, `verdict.mjs`) – testuje je
 * `tests/scenario-check.test.js`.
 */
import { writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { validateStation } from '../src/model/validate.js';
import { DUTY_MINUTES, hasDuty } from '../src/model/duty.js';
import { isTraining, shiftChoices } from '../src/model/shift/offers.js';
import { checkScenario } from '../src/model/scenarioCheck.js';
import { STATIONS } from '../src/stations/index.js';
import { MISSIONS } from '../src/tutorial/missions.js';
import { checkShift, same, dutyScenario } from './lib/shift-report.mjs';
import { verdict, scenarioStatus, deterministicWarnings, plural, hm, hms, marginOf, blockerText } from './lib/verdict.mjs';
import { defaultWorkers, runJobs, serveJobs } from './lib/workers.mjs';
import { parseCli, executedDirectly } from './lib/cli.mjs';

const WORKER_ROLE = 'sprk-check-worker';
export const LEVELS = ['none', 'low', 'high'];


export const USAGE = `Użycie: npm run check -- [stacja[:scenariusz] …] [opcje]

  bez stacji                  wszystkie stacje; „stacja” – wszystkie jej scenariusze (bez samouczków)
  --level none|low|high|all   poziom zakłóceń (domyślnie all = none, low i high – inaczej niż w survey);
                              scenariusz z własnym poziomem (np. szczyt = high) idzie tylko na nim
  --seeds 1-3 | 1,2           ziarna losowania (domyślnie 1-3)
  --extra <min>               zapas po końcu zmiany na dojazd opóźnionych pociągów (domyślnie 120); przebieg kończy się
                              wcześniej, gdy po końcu zmiany wszystko jest obsłużone
  --tutorial                  także samouczki (scenariusz wskazany wprost – zawsze)
  --strict                    kod wyjścia 1 także przy uwagach w definicji i na poziomie scenariusza (powtarzalnych)
  --verbose                   wszystkie uwagi, tabela pociągów, zadania i usterki każdej zmiany, dziennik nieobsłużonych
  --workers <n>               liczba wątków (domyślnie rdzenie - 1)
  --start <godz.> --minutes <n>  służba o wybranej porze zamiast scenariuszy stacji: pełna godzina 0–23 i długość
                              30 / 60 / 120 / 180 min (także przez północ); rozkład budowany z wzorca stacji
                              dla każdego ziarna (src/model/duty.js); cele – stacje, bez celów wszystkie posterunki
  --json <plik>               pełne raporty do pliku JSON
  --help                      ta pomoc

Ocena scenariusza: definicja + przebiegi na poziomie scenariusza (none albo wymuszony disruptions) + błędy z każdego
poziomu. Uwagi z poziomów wybieranych przez gracza (low, high) – wiersz „odporność”; informacje (info) – bez wpływu.`;


// ————————————————————————————————————— lista sprawdzeń —————————————————————————————————————

/**
 * Opcje wiersza poleceń (`argv` bez `node` i nazwy skryptu); `--opcja wartość` i `--opcja=wartość`, cele bez `--`.
 * Zwraca `{ targets, levels, seeds, extra, tutorial, verbose, strict, workers, json, help }`; przy błędzie wyjątek.
 */
export function parseArgs(argv = []) {
  const opts = { targets: [], levels: [...LEVELS], seeds: [1, 2, 3], extra: 120, tutorial: false, verbose: false, strict: false, workers: defaultWorkers(), json: null, help: false, duty: null };
  let start = null, minutes = null;
  parseCli(argv, opts, {
    levels: { all: LEVELS, allowed: LEVELS },
    positional: (raw) => opts.targets.push(raw),
    custom: (name, { flag, value }) => {
      if (name === '--verbose' || name === '-v') { opts.verbose = flag(); return true; }
      if (name === '--strict') { opts.strict = flag(); return true; }
      if (name === '--start') { start = Number(value()); return true; }
      if (name === '--minutes') { minutes = Number(value()); return true; }
      return false;
    },
  });
  // służba o wybranej porze: pełna godzina startu i długość z dozwolonych (służba może przejść przez północ)
  if (start != null || minutes != null) {
    if (!Number.isInteger(start) || start < 0 || start > 23) throw new Error(`--start: pełna godzina 0–23${start == null ? ' (wymagana razem z --minutes)' : `, jest „${start}”`}`);
    if (!DUTY_MINUTES.includes(minutes)) throw new Error(`--minutes: do wyboru ${DUTY_MINUTES.join(', ')}${minutes == null ? ' (wymagane razem z --start)' : `, jest „${minutes}”`}`);
    opts.duty = { start, minutes };
  }
  return opts;
}

/**
 * Scenariusze i zmiany do sprawdzenia. Cele: „stacja” (wszystkie scenariusze, samouczki tylko z `tutorial`),
 * „stacja:scenariusz” (ten jeden, także samouczek); bez celów – wszystkie stacje. Nieznana stacja / scenariusz –
 * wyjątek. Scenariusz z własnym poziomem zakłóceń idzie raz na ziarno, na swoim poziomie. Scenariusz z usterkami bez
 * przebiegu na poziomie none (wymuszony inny poziom albo `levels` bez none) dostaje sondę usterek: jeden przebieg
 * z poziomem zastąpionym przez none (`forceLevel`), tylko do oceny wpływu usterek.
 * Zwraca `{ scenarios: [{ station, scenario }], jobs: [{ stationId, scenarioId, seed, level, extra, stationIndex, forceLevel? }] }`.
 */
export function listChecks({ targets = [], levels = [...LEVELS], seeds = [1, 2, 3], extra = 120, tutorial = false, duty = null } = {}) {
  if (duty) return listDutyChecks({ targets, levels, seeds, extra, duty });
  const scenarios = [];
  const seen = new Set();
  const push = (station, scenario) => { const k = `${station.id}:${scenario.id}`; if (!seen.has(k)) { seen.add(k); scenarios.push({ station, scenario }); } };
  const all = (station) => { for (const sc of station.scenarios || []) if (tutorial || !sc.tutorial) push(station, sc); };
  if (!targets.length) STATIONS.forEach(all);
  for (const t of targets) {
    const [sid, scid] = String(t).split(':');
    const station = STATIONS.find((s) => s.id === sid);
    if (!station) throw new Error(`Nieznana stacja: „${sid}” (stacje: ${STATIONS.map((s) => s.id).join(', ')})`);
    if (scid == null || scid === '') { all(station); continue; }
    const sc = (station.scenarios || []).find((s) => s.id === scid);
    if (!sc) throw new Error(`Nieznany scenariusz: „${sid}:${scid}” (scenariusze stacji: ${(station.scenarios || []).map((s) => s.id).join(', ')})`);
    push(station, sc);
  }
  const jobs = [];
  for (const { station, scenario } of scenarios) {
    const stationIndex = STATIONS.indexOf(station);
    const lv = scenario.disruptions ? [scenario.disruptions] : LEVELS.filter((l) => levels.includes(l));
    for (const level of lv) for (const seed of seeds) jobs.push({ stationId: station.id, scenarioId: scenario.id, seed, level, extra, stationIndex });
    if (scenario.faults?.length && !lv.includes('none') && seeds.length) jobs.push({ stationId: station.id, scenarioId: scenario.id, seed: seeds[0], level: 'none', extra, stationIndex, forceLevel: 'none' });
  }
  return { scenarios, jobs };
}

/**
 * Służba o wybranej porze (`duty`: { start, minutes }) na stacjach z `targets` (bez celów – wszystkie posterunki do
 * służby). Rozkład zależy od ziarna, więc służba każdego ziarna to osobny scenariusz (identyfikator z „#ziarno”) –
 * definicja i przebiegi dotyczą tego samego rozkładu. Stacja z kilkoma stanowiskami – każde stanowisko osobno.
 */
function listDutyChecks({ targets, levels, seeds, extra, duty }) {
  const stations = targets.length ? targets.map((t) => {
    const station = STATIONS.find((s) => s.id === String(t).split(':')[0]);
    if (!station) throw new Error(`Nieznana stacja: „${t}” (stacje: ${STATIONS.map((s) => s.id).join(', ')})`);
    if (!hasDuty(station)) throw new Error(`Stacja „${station.id}” nie ma rozkładu, z którego da się zbudować służbę`);
    return station;
  }) : STATIONS.filter((s) => hasDuty(s) && !isTraining(s));
  const scenarios = [], jobs = [];
  for (const station of stations) {
    const srks = shiftChoices(station).srks;
    for (const srk of srks.length ? srks : [null]) for (const seed of seeds) {
      const own = srk && srk !== station.srk ? { ...duty, srk } : duty;
      const built = dutyScenario(station, own, seed);
      const scenario = { ...built, id: `${built.id}${own.srk ? `-${own.srk}` : ''}#${seed}` };
      scenarios.push({ station, scenario, duty: own });
      for (const level of LEVELS.filter((l) => levels.includes(l))) jobs.push({ stationId: station.id, scenarioId: scenario.id, seed, level, extra, stationIndex: STATIONS.indexOf(station), duty: own });
    }
  }
  return { scenarios, jobs };
}

function runCheckSafe(job) {
  try {
    return checkShift(job);
  } catch (e) {
    const r = { station: job.stationId, scenario: job.scenarioId, seed: job.seed, level: job.level, effectiveLevel: job.forceLevel ?? job.level, faultProbe: !!job.forceLevel, error: String(e?.stack || e) };
    return { ...r, ...verdict(r) };
  }
}

/** Sprawdzenie listy zmian: w jednym wątku albo w `workers` wątkach (najpierw duże stacje); wyniki w kolejności `jobs`. */
export function runAll(jobs, workers, onProgress) {
  return runJobs(jobs, { workers, url: new URL(import.meta.url), role: WORKER_ROLE, run: runCheckSafe, onProgress });
}

// ————————————————————————————————————— wydruk —————————————————————————————————————

const STATUS = { ok: 'OK', warn: 'UWAGI', error: 'BŁĘDY' };
const tag = (f) => (f.level === 'error' ? 'BŁĄD ' : f.level === 'warning' ? 'uwaga' : 'info ');

function endText(r) {
  if (r.error) return 'przebieg przerwany';
  const margin = marginOf(r);
  const m = margin != null ? `, zapas ${Math.floor(margin / 60)} min` : '';
  if (r.endReason === 'all-done' && !r.autoEnd) return `koniec ${hm(r.endTime)} (samouczek) – wszystko obsłużone o ${hms(r.allDoneAt)}${m}`;
  if (r.endReason === 'all-done') return `koniec ${hms(r.endedAt)} – wszystko obsłużone${m}`;
  if (r.endReason === 'time') return `koniec ${hm(r.endTime)} o czasie – ${r.unfinished.length ? `${plural(r.unfinished.length, 'pociąg nieobsłużony', 'pociągi nieobsłużone', 'pociągów nieobsłużonych')}` : 'wszystko obsłużone'}`;
  return `zmiana bez końca do ${hms(r.until)} (brak endTime)`;
}

/** Wiersze jednej zmiany. */
export function formatShift(r, { verbose = false } = {}) {
  const lv = r.faultProbe ? `${r.effectiveLevel}†` : r.effectiveLevel && r.effectiveLevel !== r.level ? `${r.effectiveLevel}*` : r.level;
  const out = [`    ${String(lv).padEnd(5)} ziarno ${String(r.seed).padEnd(2)} ${STATUS[r.status].padEnd(5)}  ${endText(r)}${r.error ? '' : `; wynik ${r.score.atEnd} (${r.score.grade}), punktualnie ${r.punctuality.onTime}, opóźnione ${r.punctuality.delayed}`}${r.faultProbe ? ' – sonda usterek (poziom scenariusza zastąpiony przez none)' : ''}`];
  const byNr = (list, nr) => list?.find((x) => same(x.nr, nr));
  // uwagi i informacje o pojedynczych pociągach bez --verbose – jeden wiersz na kod
  const grouped = new Map();
  for (const f of r.findings) {
    if (!verbose && f.level !== 'error' && f.brief) { const k = `${tag(f)}|${f.code}`; if (!grouped.has(k)) grouped.set(k, []); grouped.get(k).push(f); continue; }
    out.push(`        ${tag(f)}  ${f.code.padEnd(14)} ${f.msg}`);
    // szczegóły pociągu nieobsłużonego / w zatorze: przeszkody i dziennik (przy błędzie zawsze, inaczej z --verbose)
    const u = f.train != null && (f.code === 'jam' ? byNr(r.jam, f.train) : ['unfinished', 'unfinished-plan', 'cascade', 'fault-wait', 'automat-limit'].includes(f.code) ? byNr(r.unfinished, f.train) : null);
    if (u && (verbose || f.level === 'error')) {
      for (const b of u.blockers.slice(0, 4)) out.push(`                         przeszkoda: ${blockerText(b)}`);
      for (const l of u.log) out.push(`                         ${hms(l.time)} ${l.msg}`);
    }
  }
  for (const [k, list] of grouped) {
    const [t, code] = k.split('|');
    const more = list.some((f) => /przeszkody:/.test(f.msg)) ? ' (--verbose: przeszkody)' : '';
    out.push(`        ${t}  ${code.padEnd(14)} ${list.every((f) => f.train != null) ? `${list.length} poc.: ` : ''}${list.map((f) => f.brief).join('; ')}${more}`);
  }
  if (verbose && !r.error) out.push(...formatDetails(r));
  return out;
}

/** Tabela pociągów, zadania, usterki (--verbose). */
function formatDetails(r) {
  const out = ['        pociągi (plan przyjazd/odjazd tor → rzeczywiście; wniesione / kara na stacji; postoje):'];
  for (const t of r.trains) {
    const plan = `${t.arr ?? '—'}/${t.dep ?? '—'} t${t.track ?? '?'}`;
    const real = `${hm(t.actualArr)}/${hm(t.actualDep)}${t.depObserved ? '*' : ''} t${t.actualTrack ?? '?'}`;
    const waits = t.waits.slice(0, 2).map((w) => `${w.code}${w.signal ? `@${w.signal}` : ''} ${w.min} min`).join(', ');
    out.push(`          ${t.label.padEnd(14)} ${`${t.from ?? '·'}→${t.to ?? '·'}`.padEnd(9)} ${plan.padEnd(17)} → ${real.padEnd(19)} +${t.lagMin ?? t.delayIn}/${t.stationMin} min  ${t.status}${waits ? `  [${waits}]` : ''}`);
  }
  for (const k of r.tasks) out.push(`        zadanie ${k.id}: skład ${k.unit} na tor ${k.toTrack}, termin ${hm(k.deadline)}${k.shiftMin ? ` (przesunięty o ${k.shiftMin} min)` : ''} – ${k.done ? `wykonane ${hms(k.doneAt)}${k.late ? ' po terminie' : ''}` : k.failed ? 'przepadło' : 'w toku'}`);
  for (const f of r.faults) out.push(`        usterka ${f.scripted ? 'ze scenariusza' : 'losowa'} ${f.type} ${f.target}: ${hms(f.since ?? f.at)}, ${f.min} min${f.since == null ? ' (nie wystąpiła)' : ''} – pociągi: ${f.trains.join(', ') || 'żaden'}`);
  for (const x of r.extraTrains) out.push(`        pociąg nadzwyczajny ${x.nr}: przyjazd ${x.arr ?? '—'}${x.added ? '' : ' (nie dodany)'}`);
  return out;
}

/** Wiersze definicji scenariusza (`checkScenario`): błędy zawsze, uwagi – do 6, informacje – do 3 bez `verbose`. */
export function formatStatic(findings, { verbose = false } = {}) {
  const errors = findings.filter((f) => f.level === 'error');
  const warns = findings.filter((f) => f.level === 'warning');
  const infos = findings.filter((f) => f.level === 'info');
  const counts = [errors.length ? plural(errors.length, 'błąd', 'błędy', 'błędów') : 'bez błędów', warns.length ? plural(warns.length, 'uwaga', 'uwagi', 'uwag') : '', infos.length ? plural(infos.length, 'informacja', 'informacje', 'informacji') : ''];
  const out = [`  Definicja: ${counts.filter(Boolean).join(', ')}`];
  const shownW = verbose ? warns : warns.slice(0, 6);
  const shownI = verbose ? infos : infos.slice(0, 3);
  for (const f of [...errors, ...shownW, ...shownI]) out.push(`    ${tag(f)}  ${f.code.padEnd(18)} ${f.msg}`);
  const hidden = warns.length - shownW.length + infos.length - shownI.length;
  if (hidden) out.push(`    … i ${hidden} więcej (--verbose)`);
  return out;
}

/** Wiersz odporności scenariusza (uwagi z poziomów wybieranych przez gracza). */
function robustnessText(rob) {
  const parts = LEVELS.filter((l) => rob[l]).map((l) => {
    const x = rob[l];
    const codes = Object.entries(x.codes).sort((a, b) => b[1] - a[1]).map(([c, n]) => `${c} ${n}`).join(', ');
    return `${l} – ${x.warned}/${plural(x.shifts, 'zmiana', 'zmiany', 'zmian')} z uwagami${codes ? ` (${codes})` : ''}`;
  });
  return parts.length ? `  Odporność (poziomy gracza, bez wpływu na ocenę): ${parts.join('; ')}` : null;
}

function tally(list) {
  const m = new Map();
  for (const x of list) m.set(x, (m.get(x) || 0) + 1);
  return [...m].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(', ');
}

/** Wiersz poleceń; zwraca kod wyjścia. */
export async function main(argv) {
  let opts, plan;
  try { opts = parseArgs(argv); } catch (e) { console.error(e.message); console.error(USAGE); return 2; }
  if (opts.help) { console.log(USAGE); return 0; }
  try { plan = listChecks(opts); } catch (e) { console.error(e.message); return 2; }
  if (!plan.jobs.length) { console.error('Brak scenariuszy do sprawdzenia.'); return 2; }
  const missions = Object.keys(MISSIONS);
  // stacja: raz, z pełną treścią błędów; przy błędach jej zmiany nie są grane (symulacja by nie wystartowała)
  const invalid = new Set();
  for (const station of new Set(plan.scenarios.map((s) => s.station))) {
    const v = validateStation(station);
    if (v.errors.length) {
      invalid.add(station.id);
      console.log(`Stacja ${station.id}: definicja niepoprawna (${plural(v.errors.length, 'błąd', 'błędy', 'błędów')}) – przebiegi pominięte:`);
      for (const e of v.errors) console.log(`    BŁĄD   ${e}`);
    }
    if (v.warnings.length) {
      console.log(`Stacja ${station.id}: ${plural(v.warnings.length, 'uwaga', 'uwagi', 'uwag')} walidacji:`);
      for (const w of v.warnings) console.log(`    uwaga  ${w}`);
    }
  }
  const jobs = plan.jobs.filter((j) => !invalid.has(j.stationId));
  const statics = plan.scenarios.map(({ station, scenario, duty }) => checkScenario(station, duty ? scenario : scenario.id, { missions, levels: opts.levels }));
  const workers = Math.max(1, Math.min(opts.workers, jobs.length));
  console.log(`Sprawdzanie scenariuszy: ${plural(plan.scenarios.length, 'scenariusz', 'scenariusze', 'scenariuszy')}, ${plural(jobs.length, 'zmiana', 'zmiany', 'zmian')} (poziomy ${opts.levels.join(', ')}; ziarna ${opts.seeds.join(', ')}; zapas ${opts.extra} min), wątki: ${workers}`);
  const tty = process.stderr.isTTY;
  const progress = tty ? (d, all) => process.stderr.write(`\r  ${d}/${all}`) : null;
  const t0 = performance.now();
  const results = jobs.length ? await runAll(jobs, workers, progress) : [];
  const seconds = (performance.now() - t0) / 1000;
  if (tty) process.stderr.write('\r\x1b[K');
  const scenarioStatuses = [];
  const out = [];
  let detWarnings = 0;
  plan.scenarios.forEach(({ station, scenario }, i) => {
    const shifts = results.filter((r) => r.station === station.id && r.scenario === scenario.id)
      .sort((a, b) => (a.faultProbe ? 1 : 0) - (b.faultProbe ? 1 : 0) || LEVELS.indexOf(a.effectiveLevel) - LEVELS.indexOf(b.effectiveLevel) || a.seed - b.seed);
    const st = statics[i];
    const { status, repeated, robustness } = scenarioStatus(st, shifts);
    scenarioStatuses.push(status);
    const baseShift = shifts.find((s) => !s.faultProbe && !s.error && s.effectiveLevel === s.baseLevel);
    detWarnings += deterministicWarnings(st, baseShift).length;
    const first = shifts.find((s) => !s.error);
    const window = `${hm(first?.startTime)}–${first?.hasEndTime ? hm(first.endTime) : '?'}`;
    const rob = Object.values(robustness);
    const robNote = rob.length ? ` (uwagi przy zakłóceniach: ${rob.reduce((a, x) => a + x.warned, 0)}/${plural(rob.reduce((a, x) => a + x.shifts, 0), 'zmiana', 'zmiany', 'zmian')})` : '';
    console.log(`\n━━ ${station.id}:${scenario.id}  ${STATUS[status]}${robNote}  „${scenario.name ?? scenario.id}” – ${window}${first ? `, ${plural(first.trains.filter((t) => !t.extra).length, 'pociąg', 'pociągi', 'pociągów')}, srk ${first.srk}` : ''}`);
    for (const l of formatStatic(st, opts)) console.log(l);
    if (invalid.has(station.id)) console.log('  Przebiegi: pominięte – definicja stacji niepoprawna');
    else console.log('  Przebiegi:');
    for (const r of shifts) for (const l of formatShift(r, opts)) console.log(l);
    const forcedBase = shifts.filter((x) => !x.faultProbe && x.effectiveLevel === x.baseLevel && x.baseLevel !== 'none');
    if (forcedBase.length > 1) console.log(`  Poziom scenariusza ${forcedBase[0].baseLevel}: ${repeated.length ? `we wszystkich ziarnach powtarza się ${repeated.join(', ')}` : 'żaden rodzaj uwagi nie powtarza się we wszystkich ziarnach'}`);
    const rt = robustnessText(robustness);
    if (rt) console.log(rt);
    out.push({ station: station.id, scenario: scenario.id, status, repeated, robustness, static: st, shifts });
  });
  const shiftStatus = results.map((r) => r.status);
  const count = (list, s) => list.filter((x) => x === s).length;
  const isBase = (r) => !r.faultProbe && r.effectiveLevel === r.baseLevel;
  console.log('\nPODSUMOWANIE');
  console.log(`  scenariusze: ${plan.scenarios.length} (OK ${count(scenarioStatuses, 'ok')}, UWAGI ${count(scenarioStatuses, 'warn')}, BŁĘDY ${count(scenarioStatuses, 'error')}); błędy definicji: ${statics.reduce((a, s) => a + s.filter((f) => f.level === 'error').length, 0)}; uwagi powtarzalne (definicja i przebieg bez zakłóceń): ${detWarnings}`);
  console.log(`  zmiany: ${results.length} (OK ${count(shiftStatus, 'ok')}, UWAGI ${count(shiftStatus, 'warn')}, BŁĘDY ${count(shiftStatus, 'error')})`);
  const codes = (list, level) => tally(list.flatMap((r) => [...new Set(r.findings.filter((f) => f.level === level).map((f) => f.code))]));
  if (codes(results, 'error')) console.log(`  błędy w zmianach (liczba zmian): ${codes(results, 'error')}`);
  if (codes(results.filter(isBase), 'warning')) console.log(`  uwagi na poziomie scenariusza (liczba zmian): ${codes(results.filter(isBase), 'warning')}`);
  if (codes(results.filter((r) => !isBase(r)), 'warning')) console.log(`  odporność – uwagi przy zakłóceniach gracza (liczba zmian): ${codes(results.filter((r) => !isBase(r)), 'warning')}`);
  if (codes(results, 'info')) console.log(`  informacje (liczba zmian): ${codes(results, 'info')}`);
  console.log('  Automat wydaje polecenia zależnościom wprost – sprawdza rozkład i zależności, nie obsługę pulpitu.');
  console.log(`  Czas: ${seconds.toFixed(1)} s`);
  if (opts.json) {
    writeFileSync(opts.json, JSON.stringify({ tool: 'scripts/check-scenario.mjs', created: new Date().toISOString(), options: { targets: opts.targets, levels: opts.levels, seeds: opts.seeds, extra: opts.extra, tutorial: opts.tutorial, duty: opts.duty, strict: opts.strict }, scenarios: out }, null, 1) + '\n');
    console.log(`  Zapisano: ${opts.json}`);
  }
  return scenarioStatuses.includes('error') || (opts.strict && scenarioStatuses.includes('warn')) ? 1 : 0;
}

// Wątek: zmiany z kolejki wątku głównego, jedna po drugiej.
serveJobs(WORKER_ROLE, runCheckSafe);

if (executedDirectly(import.meta.url)) {
  main(process.argv.slice(2)).then((code) => { process.exitCode = code; }, (e) => { console.error(e?.stack || e); process.exitCode = 1; });
}
