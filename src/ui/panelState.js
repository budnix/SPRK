/**
 * Co widzi dyżurny w panelu bocznym – stan jako dane i kody, bez DOM i bez tekstów (teksty przez `t()` dobiera widok,
 * `src/ui/SidePanel.js`). Jedno miejsce, z którego panel czyta model: zadania manewrowe, pociągi na posterunku,
 * pociągi do polecenia dla drugiego okręgu, blokady szlaków. Testy w Node: `tests/panel-state.test.js`.
 */
import { taskState } from '../model/tasks/order.js';

/**
 * Zadania manewrowe zmiany: `{ done, total, cards }`; karta – `{ id, no, text, state, late, doneAt, unit, toTrack,
 * after, deadline, afterTaskNo }` (`state`: 'done' | 'failed' | 'waiting' | 'active', `late` – wykonane po terminie,
 * `afterTaskNo` – numer zadania, na które czeka, albo null).
 */
export function taskCards(sim) {
  const tasks = sim.traffic.tasks || [];
  const now = sim.clock.time;
  const cards = tasks.map((x, i) => {
    const prev = x.afterTask ? tasks.find((y) => y.id === x.afterTask) : null;
    return {
      id: x.id, no: i + 1, text: x.text, state: taskState(tasks, x, now), late: x.done && x.doneAt > x.deadlineTime, doneAt: x.doneAt,
      unit: x.unit ?? null, toTrack: x.toTrack ?? null, after: x.after ?? null, deadline: x.deadline ?? null, afterTaskNo: prev ? tasks.indexOf(prev) + 1 : null,
    };
  });
  return { done: tasks.filter((x) => x.done).length, total: tasks.length, cards };
}

/**
 * Gdzie jest i co robi pociąg stojący albo jadący przez posterunek: `{ code, v, signal, time }` – kod: 'moving' (`v`
 * km/h), 'ended', 'halt' (`halt` – przystanek), 'dwell' (`time` – odjazd), 'at-signal' / 'after-spad' (`signal`),
 * 'at-platform', 'at-end', 'stopped'.
 */
function whereOf(e) {
  const tr = e.train;
  if (tr.v > 0) return { code: 'moving', v: Math.round(tr.v * 3.6) };
  if (e.terminates && tr.hasStopped && tr.mode === 'train') return { code: 'ended' };
  if (tr.atHalt) return { code: 'halt', halt: tr.atHalt };
  if (tr.state === 'dwell') return { code: 'dwell', time: e.dep ?? '–' };
  const at = tr.stoppedAt?.kind;
  if (at === 'signal') return { code: 'at-signal', signal: tr.stoppedAt.signal };
  if (at === 'platform') return { code: 'at-platform' };
  if (at === 'end') return { code: 'at-end' };
  if (at === 'spad') return { code: 'after-spad', signal: tr.stoppedAt.signal };
  return { code: 'stopped' };
}

/**
 * Pociągi na posterunku (wjechały, nie skończyły jazdy): karta – `{ e, where, mode, tracks, direction, moving, wait,
 * canControl }`: `mode` – 'train' / 'shunt', `tracks` – tory pod pociągiem, `direction` – kierunek czoła, `wait` – kod
 * przyczyny postoju z ruchu (`Traffic.waitReason`) albo null, `canControl` – można wydać polecenie (stoi, maszynista
 * w kabinie: nie trwa zmiana czoła).
 */
export function trainCards(sim) {
  return sim.traffic.timetable().filter((e) => e.train && e.train.entered && !e.train.finished).map((e) => {
    const tr = e.train;
    return {
      e, where: whereOf(e), mode: tr.mode, direction: tr.direction, moving: tr.v > 0,
      tracks: [...new Set([...tr.occupiedSections()].map((id) => sim.ilk.sections.get(id)?.track).filter(Boolean))],
      wait: sim.traffic.waitReason(e, sim.clock.time), canControl: tr.v === 0 && !tr.cabChange,
    };
  });
}

/**
 * Pociągi, dla których dyżurny dysponujący może wydać polecenie nastawni drugiego okręgu `other`: `{ e, kind }` –
 * 'accept' (przyjąć pociąg z szlaku tamtego okręgu: jeszcze nie wjechał, polecenia nie było) albo 'dispatch' (wyprawić
 * na szlak tamtego okręgu pociąg, który jest na stacji; polecenia nie było).
 */
export function commandCandidates(sim, other) {
  const issued = (e, kind) => sim.commands.some((c) => String(c.nr) === String(e.nr) && c.kind === kind);
  const out = [];
  for (const e of sim.traffic.timetable()) {
    const arriving = e.from && sim.exitDistrict(e.from) === other && !issued(e, 'accept') && !(e.train && e.train.entered);
    const departing = e.to && sim.exitDistrict(e.to) === other && e.train && !e.train.finished && e.train.entered && !issued(e, 'dispatch');
    if (arriving) out.push({ e, kind: 'accept' });
    else if (departing) out.push({ e, kind: 'dispatch' });
  }
  return out;
}

/**
 * Blokady szlaków do pokazania: `{ id, label, auto, direction, permission, request, occupied, ko, dPo, dKo }` (`ko` –
 * przyjazd pociągu sąsiada czeka na Ko, `dPo` / `dKo` – liczniki przycisków doraźnych).
 */
export function blockCards(sim) {
  return [...sim.blocks.values()].map((b) => ({
    id: b.id, label: b.def.label || b.neighbour, auto: b.auto, direction: b.direction, permission: b.permission, request: b.request,
    occupied: b.occupied, ko: b.duties().some((d) => d.duty === 'Ko'), dPo: b.counters.dPo, dKo: b.counters.dKo,
  }));
}
