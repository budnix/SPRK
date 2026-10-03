import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeSim, run, routeViews } from './helpers.js';
import { POINT_SWITCH_TIME } from '../src/model/Interlocking.js';

/**
 * Macierz zgodności przebiegów: dla każdej uporządkowanej pary (r1, r2)
 * nastawiamy r1, próbujemy r2 i porównujemy z wyrocznią wyliczoną z danych przebiegów.
 */
function grantBlocks(sim) {
  for (const b of sim.blocks.values()) { b.press('Wbl'); }
  run(sim, 40);
}

/** Czy przebieg `b` jest kontynuacją przebiegu `a` (oba pociągowe, `b` zaczyna się na semaforze końcowym `a`). */
const continues = (a, b) => a.kind === 'train' && b.kind === 'train' && a.end.type === 'signal' && a.end.id === b.start;

/**
 * Tor stacyjny będący ostatnim odcinkiem dwóch przebiegów manewrowych nie czyni ich sprzecznymi (Ie-4 §43 ust. 5);
 * każdy musi mieć przed nim odcinek głowicy. Stacja testowa takiej pary nie ma – sprawdza je tests/shared-track.test.js.
 */
const sharedEndTrack = (sim, r1, r2, s) => r1.kind === 'shunt' && r2.kind === 'shunt' && sim.ilk.sections.get(s).kind === 'station'
  && r1.sections.length > 1 && r2.sections.length > 1 && r1.sections.at(-1) === s && r2.sections.at(-1) === s;

function conflicts(r1, r2, sim) {
  if (r1.start === r2.start) return 'ten sam semafor';
  const s1 = new Set(r1.sections), s2 = new Set(r2.sections);
  for (const s of s2) if (s1.has(s) && !sharedEndTrack(sim, r1, r2, s)) return `wspólny odcinek ${s}`;
  const pos = new Map();
  for (const p of [...r1.points, ...r1.flank]) pos.set(p.id, p.position);
  for (const p of [...r2.points, ...r2.flank]) if (pos.has(p.id) && pos.get(p.id) !== p.position) return `zwrotnica ${p.id} w różnych położeniach`;
  // kontynuacją przebiegu pociągowego jest tylko przebieg pociągowy – manewr z semafora końcowego nie zastępuje drogi
  // ochronnej (Ms2 dla pociągu znaczy „Stój”)
  const r2ContinuesR1 = continues(r1, r2); // przelot: droga ochronna r1 zbędna
  const r1ContinuesR2 = continues(r2, r1); // r2 kończy się tam, gdzie zaczyna r1
  if (!r2ContinuesR1) for (const s of r2.sections) if (r1.overlap.includes(s)) return `odcinek ${s} w drodze ochronnej r1`;
  if (!r1ContinuesR2) for (const s of r2.overlap) if (s1.has(s)) return `droga ochronna r2 utwierdzona w r1`;
  const d1 = new Map([...r1.derailers.onRoute, ...r1.derailers.protect].map((d) => [d.id, d.position]));
  for (const d of [...r2.derailers.onRoute, ...r2.derailers.protect]) if (d1.has(d.id) && d1.get(d.id) !== d.position) return `wykolejnica ${d.id}`;
  // zwrotnice drogi ochronnej r1 są utwierdzone w bieżącym położeniu – r2 może ich wymagać w innym
  return null;
}

test('macierz par przebiegów: zgodność z wyrocznią i brak podwójnego utwierdzenia', () => {
  const base = makeSim();
  const routes = base.ilk.routeList();
  let pairs = 0, allowed = 0;
  for (const r1 of routes) {
    for (const r2 of routes) {
      if (r1.id === r2.id) continue;
      const sim = makeSim();
      grantBlocks(sim);
      const a = sim.ilk.setRoute(r1.id);
      assert.equal(a.ok, true, `r1 ${r1.id}: ${a.reason}`);
      run(sim, POINT_SWITCH_TIME + 1);
      assert.ok(sim.ilk.routeIsSet(r1.id), `r1 ${r1.id} nie utwierdzony`);
      const expectConflict = conflicts(r1, r2, sim);
      // zwrotnice drogi ochronnej r1 utwierdzone w bieżącym położeniu
      const act1 = sim.ilk.routeProgress(r1.id);
      let overlapPointConflict = null;
      if (!continues(r1, r2)) for (const p of [...r2.points, ...r2.flank]) {
        const op = act1.overlapPoints.find((q) => q.id === p.id);
        if (op && op.position !== p.position) overlapPointConflict = `zwrotnica ${p.id} w drodze ochronnej r1`;
      }
      const b = sim.ilk.setRoute(r2.id);
      run(sim, POINT_SWITCH_TIME + 1);
      const set2 = sim.ilk.routeIsSet(r2.id);
      pairs++;
      const conflict = expectConflict || overlapPointConflict;
      if (conflict) {
        assert.equal(b.ok, false, `${r1.id} + ${r2.id}: powinien być konflikt (${conflict})`);
        assert.equal(set2, false);
      } else {
        assert.equal(b.ok && set2, true, `${r1.id} + ${r2.id}: powinny być zgodne: ${b.reason}`);
        allowed++;
        // niezmiennik: żaden odcinek nie jest utwierdzony w dwóch przebiegach (poza wspólnym torem docelowym manewrów)
        const owners = new Map();
        for (const act of routeViews(sim.ilk)) for (const s of act.sections) {
          assert.ok(!owners.has(s) || sharedEndTrack(sim, r1, r2, s), `odcinek ${s} utwierdzony podwójnie`);
          owners.set(s, act.id);
        }
        // niezmiennik: zwrotnica w obu przebiegach ma to samo położenie
        for (const p of [...r1.points, ...r2.points]) assert.equal(sim.ilk.points.get(p.id).position, p.position);
      }
    }
  }
  assert.ok(pairs > 100 && allowed > 5, `sprawdzono ${pairs} par, zgodnych ${allowed}`);
});

test('każdy przebieg pociągowy: przejazd pociągu zwalnia odcinki po kolei i rozwiązuje przebieg', () => {
  const base = makeSim();
  for (const r of base.ilk.routeList().filter((x) => x.kind === 'train')) {
    const sim = makeSim();
    grantBlocks(sim);
    assert.equal(sim.ilk.setRoute(r.id).ok, true, r.id);
    run(sim, POINT_SWITCH_TIME + 1);
    assert.ok(sim.ilk.routeIsSet(r.id), `${r.id} nie utwierdzony`);
    const sig = sim.ilk.signals.get(r.start);
    assert.notEqual(sig.aspect, 'S1', `${r.id}: semafor nie pokazuje jazdy`);
    // pociąg: kolejno zajmuje odcinki (zawsze dwa naraz: bieżący i poprzedni)
    const seq = [r.approach, ...r.sections];
    const occ = (a, b) => { sim.ilk.updateOccupancy(new Set([a, b].filter(Boolean))); sim.ilk.tick(sim.ilk.time + 0.5); };
    occ(seq[0]);
    for (let i = 1; i < seq.length; i++) {
      occ(seq[i - 1], seq[i]);
      if (i === 1) assert.equal(sig.aspect, 'S1', `${r.id}: semafor nie padł po minięciu`);
      occ(seq[i]);
      if (i >= 2) assert.equal(sim.ilk.sections.get(seq[i - 1]).route, null, `${r.id}: odcinek ${seq[i - 1]} nie zwolniony po opuszczeniu`);
    }
    if (r.end.type === 'exit') { occ(null); }
    sim.ilk.tick(sim.ilk.time + 0.5);
    assert.ok(!sim.ilk.routeIsSet(r.id), `${r.id}: przebieg nie rozwiązany`);
    for (const p of r.points) assert.equal(sim.ilk.pointLockedByRoute(p.id), null, `${r.id}: zwrotnica ${p.id} nadal utwierdzona`);
  }
});

test('każdy przebieg: Pz zwalnia przed pociągiem, zwalnianie czasowe przy zbliżaniu, dPz zawsze', () => {
  const base = makeSim();
  for (const r of base.ilk.routeList()) {
    for (const variant of ['pz', 'timed', 'dpz']) {
      const sim = makeSim();
      grantBlocks(sim);
      assert.equal(sim.ilk.setRoute(r.id).ok, true, r.id);
      run(sim, POINT_SWITCH_TIME + 1);
      assert.ok(sim.ilk.routeIsSet(r.id), r.id);
      if (variant === 'timed') sim.ilk.updateOccupancy(new Set([r.approach]));
      const res = sim.ilk.releaseRoute(r.start, variant === 'dpz');
      assert.equal(res.ok, true, `${r.id} ${variant}: ${res.reason}`);
      if (variant === 'timed') {
        assert.ok(sim.ilk.routeIsSet(r.id), `${r.id}: powinien czekać na zwolnienie czasowe`);
        run(sim, r.kind === 'train' ? 95 : 35);
      }
      assert.ok(!sim.ilk.routeIsSet(r.id), `${r.id} ${variant}: nie zwolniony`);
      for (const s of r.sections) assert.equal(sim.ilk.sections.get(s).route, null);
      assert.equal(sim.ilk.signals.get(r.start).aspect, sim.ilk.signals.get(r.start).kind === 'semafor' ? 'S1' : 'Ms1');
    }
  }
});
