import assert from 'node:assert/strict';
import { Interlocking } from '../src/model/Interlocking.js';

/**
 * Niezmienniki bezpieczeństwa – reguły zależności, które muszą być spełnione w każdym takcie, niezależnie od tego, kto
 * prowadzi ruch (gracz, automat, losowe przyciski) i jakie usterki są aktywne. Wspólne dla testów macierzowych,
 * testów usterek (`tests/faults-*.test.js`) i przeglądu zmian (`scripts/survey.mjs`).
 *
 * `violations(sim)` zwraca listę naruszeń (napisy), `safety(sim, where)` – to samo jako asercja.
 */
export function violations(sim) {
  const out = [];
  const ilk = sim.ilk;
  // 1. Dwa pociągi nigdy na tym samym odcinku (jazdy pociągowe)
  const occ = new Map();
  for (const tr of sim.traffic.trains) {
    if (tr.mode !== 'train' || tr.finished) continue;
    for (const s of tr.occupiedSections()) {
      if (occ.has(s) && occ.get(s) !== tr.nr) out.push(`pociągi ${occ.get(s)} i ${tr.nr} na odcinku ${s}`);
      occ.set(s, tr.nr);
    }
  }
  // 2. Odcinek utwierdzony najwyżej w jednym przebiegu (wyjątek: tor stacyjny kończący dwa przebiegi manewrowe, Ie-4 §43 ust. 5)
  const owners = new Map();
  for (const act of ilk.active.values()) for (const s of act.lockedSections) {
    if (act.released.has(s)) continue;
    const other = owners.get(s);
    if (other && !(other.sharedEnd && act.sharedEnd)) out.push(`odcinek ${s} w dwóch przebiegach (${other.id}, ${act.id})`);
    owners.set(s, act);
  }
  // 3. Semafor z sygnałem zezwalającym (poza Sz) ma utwierdzony przebieg; przed wjazdem pociągu odcinki przebiegu
  //    pociągowego są wolne (stała kontrola sygnału – poza nastawnią mechaniczną, gdzie sygnał trzyma dźwignia)
  for (const sig of ilk.signals.values()) {
    if (!sig.aspect || !Interlocking.isProceed(sig.aspect) || sig.aspect === 'Sz') continue;
    const act = ilk.active.get(sig.route);
    if (!act) { out.push(`${sig.id} pokazuje ${sig.aspect} bez przebiegu`); continue; }
    if (!act.trainEntered && act.route.kind === 'train' && !ilk.manualSignal) {
      for (const s of act.lockedSections) if (ilk.sections.get(s).occupied) out.push(`${sig.id} (${sig.aspect}) zezwala na zajęty odcinek ${s}`);
    }
  }
  // 4. Zwrotnica nie przestawia się na zajętym odcinku (także zajętym z usterki – urządzenie widzi tabor)
  for (const p of ilk.points.values()) {
    if (p.moving && ilk.sections.get(p.section)?.occupied) out.push(`zwrotnica ${p.id} przestawiana na zajętym odcinku ${p.section}`);
  }
  return out;
}

export function safety(sim, where = '') {
  const v = violations(sim);
  assert.deepEqual(v, [], `${where}: ${v.join('; ')}`);
}

/**
 * Zdarzenia, które nigdy nie powinny wystąpić: minięcie semafora „Stój” bez zezwolenia i rozprucie zwrotnicy.
 * `watchEvents(sim)` zbiera je z magistrali; zwraca tablicę (uzupełnianą na bieżąco).
 */
export function watchEvents(sim) {
  const bad = [];
  sim.bus.on('score', (i) => { if (i.code === 'spad' || i.code === 'rozprucie') bad.push(`${i.code}: ${i.msg}`); });
  return bad;
}
