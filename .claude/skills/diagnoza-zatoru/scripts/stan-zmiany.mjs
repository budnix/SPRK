#!/usr/bin/env node
/**
 * Stan zmiany w wybranej chwili: zmiana grana automatem dyżurnego (jak w `npm run check`) do godziny `--at`, potem
 * zrzut tego, czego raport automatu nie pokazuje – pociąg (stan, sygnał przed nim, przyczyna postoju), przebiegi od
 * tego sygnału z przeszkodami, przebiegi nastawione, blokady szlaków, usterki czynne. Do diagnozy zatoru.
 *
 *   node .claude/skills/diagnoza-zatoru/scripts/stan-zmiany.mjs <stacja>[:<scenariusz>] --at GG:MM [--train <nr>]
 *        [--seed 1] [--level none|low|high] [--start <godzina> --minutes <30|60|120|180>] [--from GG:MM]
 *
 * Uruchamiaj z katalogu projektu. `--start` / `--minutes` – służba o wybranej porze zamiast scenariusza stacji.
 * Bez `--train`: wszystkie pociągi, które są na stacji albo stoją przed nią.
 * `--from GG:MM` (z `--train`): ślad pociągu od tej godziny do `--at` – wiersz przy każdej zmianie stanu (status,
 * sygnał przed pociągiem i jego obraz, przyczyna postoju, notatki automatu, przebiegi nastawione, usterki czynne).
 * Ślad pokazuje chwilę, w której coś poszło nie tak – zrzut na końcu pokazuje tylko skutek.
 */
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = (p) => import(pathToFileURL(join(process.cwd(), p)).href);
const { STATIONS } = await root('src/stations/index.js');
const { playShift } = await root('scripts/shift.mjs');
const { Clock } = await root('src/core/Clock.js');
const { buildDuty } = await root('src/model/duty.js');

const argv = process.argv.slice(2);
const opt = { seed: 1, level: 'none' };
let target = null;
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a.startsWith('--')) opt[a.slice(2)] = argv[++i];
  else target = a;
}
if (!target || !opt.at) { console.error('Użycie: stan-zmiany.mjs <stacja>[:<scenariusz>] --at GG:MM [--train nr] [--seed n] [--level none|low|high] [--start h --minutes m]'); process.exit(2); }
const [stationId, scenarioId] = target.split(':');
const station = STATIONS.find((s) => s.id === stationId);
if (!station) { console.error(`Nieznana stacja: ${stationId} (${STATIONS.map((s) => s.id).join(', ')})`); process.exit(2); }
const seed = Number(opt.seed);
const scenario = opt.start != null
  ? buildDuty(station, { start: Number(opt.start), minutes: Number(opt.minutes ?? 120), seed }).scenario
  : (station.scenarios || []).find((s) => s.id === (scenarioId ?? 'zmiana')) ?? (station.scenarios || [])[0];
if (!scenario) { console.error(`Nieznany scenariusz: ${target}`); process.exit(2); }
// godzina po północy w zmianie przez północ: „00:40” rozumiane jako ciąg dalszy zmiany
let at = Clock.parse(opt.at);
if (at < Clock.parse(scenario.startTime ?? station.startTime ?? '00:00')) at += 24 * 3600;

const plain = (o) => Object.fromEntries(Object.entries(o ?? {}).filter(([, v]) => v == null || ['string', 'number', 'boolean'].includes(typeof v)));
const hm = (s) => (Number.isFinite(s) ? Clock.format(s, true) : '–');
let from = opt.from != null ? Clock.parse(opt.from) : null;
if (from != null && from < Clock.parse(scenario.startTime ?? station.startTime ?? '00:00')) from += 24 * 3600;
let done = false, last = null, header = false;
/** Stan pociągu w jednym wierszu – do śladu (wypisywany tylko, gdy się zmienił). */
const line = (sim, e) => {
  const tr = e.train, signal = tr && !tr.finished ? tr.nextSignal?.() : null, sig = signal ? sim.ilk.signals.get(signal) : null;
  const robot = Object.fromEntries(Object.entries(e).filter(([k, v]) => k.startsWith('_') && v != null && typeof v !== 'function'));
  const faults = (sim.faults?.active?.() ?? []).map((f) => `${f.type} ${f.target ?? ''}`.trim());
  // bez listy zajętych odcinków – zmienia się co sekundę jazdy i zagłusza ślad (jest w zrzucie na końcu)
  return [e.status, tr ? `${tr.mode}/${tr.state}` : '–', `sygnał ${signal ?? '–'}${sig ? `=${sig.aspect}` : ''}`,
    `postój ${sim.traffic.waitReason(e)?.code ?? '–'}`, `automat ${JSON.stringify(robot)}`, `przebiegi ${sim.ilk.routesSet().filter((x) => x.state !== 'setting').map((x) => x.id).join(',') || '–'}`,
    `usterki ${faults.join(',') || '–'}`].join(' | ');
};
playShift({ station, scenario, seed, level: opt.level, extra: 0, onTick: (sim) => {
  if (done) return;
  if (from != null && opt.train != null && sim.clock.time >= from && sim.clock.time < at) {
    const e = sim.traffic.timetable().find((x) => String(x.nr) === String(opt.train));
    if (!header) { header = true; console.log(`Ślad pociągu ${opt.train} od ${hm(sim.clock.time)}:`); }
    const now = e ? line(sim, e) : 'pociągu nie ma w rozkładzie zmiany';
    if (now !== last) { last = now; console.log(`  ${hm(sim.clock.time)}  ${now}`); }
  }
  if (sim.clock.time < at) return;
  done = true;
  if (header) console.log('');
  const ilk = sim.ilk, tt = sim.traffic.timetable();
  console.log(`${station.id}:${scenario.id} „${scenario.name}” ziarno ${seed}, poziom ${opt.level}, chwila ${hm(sim.clock.time)}`);
  const want = opt.train != null ? tt.filter((e) => String(e.nr) === String(opt.train)) : tt.filter((e) => e.train && !e.train.finished);
  if (!want.length) console.log(opt.train != null ? `Pociągu ${opt.train} nie ma w rozkładzie zmiany: ${tt.map((e) => e.nr).join(', ')}` : 'Na stacji nie ma pociągów.');
  for (const e of want) {
    const tr = e.train;
    console.log(`\nPociąg ${e.nr} ${e.label ?? ''}: ${e.status}; ${e.from ?? '(stoi)'} → ${e.to ?? '(kończy bieg)'}, tor ${e.track} (jest: ${e.actualTrack ?? '–'})`);
    console.log(`  plan: przyj. ${hm(e.arrTime)} odj. ${hm(e.depTime)}; było: przyj. ${hm(e.actualArr)} odj. ${hm(e.actualDep)}; opóźnienie od sąsiada ${e.delayIn ?? 0} s`);
    if (!tr) { console.log('  jeszcze nie wjechał (albo już zniknął z pulpitu)'); continue; }
    const signal = tr.nextSignal?.();
    const sig = signal ? ilk.signals.get(signal) : null;
    console.log(`  skład: v=${tr.v?.toFixed?.(1)} m/s, tryb ${tr.mode}, stan ${tr.state}, odcinki [${[...tr.occupiedSections()].join(', ')}]`);
    console.log(`  sygnał przed pociągiem: ${signal ?? '–'}${sig ? ` (obraz ${sig.aspect}, przebieg ${sig.route ?? '–'}${sig.failed ? ', usterka' : ''}${sig.stopped ? ', zastopowany' : ''})` : ''}`);
    console.log(`  przyczyna postoju (Traffic.waitReason): ${JSON.stringify(sim.traffic.waitReason(e))}`);
    if (signal) {
      for (const r of ilk.routeList().filter((x) => x.start === signal)) {
        const problems = ilk.routeProblems(r).map((p) => `${p.code}${p.section ?? p.point ?? p.route ? `:${p.section ?? p.point ?? p.route}` : ''}`);
        console.log(`  przebieg ${r.id} (${r.kind}${r.exit ? `, szlak ${r.exit}` : ''}): ${problems.length ? problems.join(', ') : 'do nastawienia'}`);
      }
    }
    const b = e.to ? sim.blocks.get(e.to) : null;
    if (b) console.log(`  blokada szlaku ${e.to}: ${JSON.stringify(plain(b))}; zgoda na przebieg: ${JSON.stringify(b.gate?.('route'))}`);
    // pola robocze automatu (zaczynają się od „_”) – tu widać, na co automat czeka
    const robot = Object.fromEntries(Object.entries(e).filter(([k, v]) => k.startsWith('_') && v != null && typeof v !== 'function'));
    console.log(`  notatki automatu przy pociągu: ${JSON.stringify(robot)}`);
  }
  const set = ilk.routesSet();
  console.log(`\nPrzebiegi nastawione: ${set.filter((x) => x.state !== 'setting').map((x) => `${x.id} (${x.state})`).join(', ') || '–'}; w nastawianiu: ${set.filter((x) => x.state === 'setting').map((x) => x.id).join(', ') || '–'}`);
  console.log(`Odcinki zajęte: ${[...ilk.sections.entries()].filter(([, s]) => s.occupied).map(([id]) => id).join(', ') || '–'}`);
  const faults = (sim.faults?.active?.() ?? []).map((f) => `${f.type} ${f.target ?? ''} od ${hm(f.at)}`);
  console.log(`Usterki czynne: ${faults.join('; ') || '–'}`);
} });
if (!done) console.log(`Zmiana skończyła się przed ${opt.at} – podaj wcześniejszą godzinę.`);
