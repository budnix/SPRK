import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeSim, run, Clock, autoDispatch, play } from './helpers.js';
import { safety } from './invariants.js';

/** Dyżurny automatyczny z wyborem toru dla danego pociągu. */
function dispatcher(sim, trackFor) {
  const ilk = sim.ilk;
  for (const b of sim.blocks.values()) { if (b.request === 'theirs') b.press('Poz'); if (b.koPending) b.press('Ko'); }
  for (const e of sim.traffic.timetable()) {
    const track = trackFor(e);
    if (e.train && !e.train.finished && e.from && !e.entryRouteSet) {
      const sig = e.from === 'W' ? 'A' : 'B';
      const end = e.from === 'W' ? (track === '2' ? 'D2' : 'D1') : (track === '2' ? 'C2' : 'C1');
      if (ilk.requestRoute({ kind: 'signal', id: sig, color: 'green' }, { kind: 'end', id: end }).ok) e.entryRouteSet = true;
    }
    if (e.train && !e.train.finished && e.to && e.train.entered && !e.exitRouteSet) {
      const b = sim.blocks.get(e.to);
      const startSig = e.to === 'E' ? (track === '2' ? 'D2' : 'D1') : (track === '2' ? 'C2' : 'C1');
      if (!b.direction && !b.request && !b.occupied) b.press('Wbl');
      if (b.direction === 'out' && b.permission) {
        if (ilk.requestRoute({ kind: 'signal', id: startSig, color: 'green' }, { kind: 'end', id: e.to === 'E' ? 'kE' : 'kW' }).ok) e.exitRouteSet = true;
      }
    }
  }
}

test('każdy pociąg na tor planowy i na tor zamienny: przyjazd, postój, odjazd, bez naruszeń bezpieczeństwa', () => {
  for (const variant of ['plan', 'swap']) {
    const sim = makeSim();
    const trackFor = (e) => (variant === 'plan' || e.terminates || e.unit ? e.track : (e.track === '1' ? '2' : '1'));
    const end = Clock.parse('08:40');
    const seen = new Set();
    play(sim, (s) => autoDispatch(s, trackFor)).until(end, { each: () => {
      safety(sim, `${variant} ${Clock.format(sim.clock.time, true)}`);
      for (const tr of sim.traffic.trains) for (const s of tr.occupiedSections()) seen.add(s);
    } });
    for (const e of sim.traffic.timetable()) {
      const want = trackFor(e);
      if (e.terminates) { assert.ok(e.status.startsWith('przekazany'), `${variant} ${e.nr}: ${e.status}`); assert.equal(e.actualTrack, want); continue; }
      assert.equal(e.status, 'na następnym posterunku', `${variant} ${e.nr}: ${e.status}`);
      if (e.from) assert.equal(String(e.actualTrack), want, `${variant} ${e.nr}: tor ${e.actualTrack} zamiast ${want}`);
      assert.ok(e.delay <= 3, `${variant} ${e.nr}: opóźnienie ${e.delay}`);
    }
    for (const t of sim.traffic.tasks) assert.equal(t.done, true, `${variant}: zadanie ${t.id} niewykonane`);
    assert.equal(sim.ilk.counters.rozprucie, 0);
  }
});

test('bez pozwolenia pociąg nie wyjeżdża od sąsiada; bez przebiegu staje przed semaforem i nie wjeżdża dalej', () => {
  const sim = makeSim();
  const w = sim.blocks.get('W');
  run(sim, 60 * 12);
  assert.equal(w.request, 'theirs');
  assert.equal(sim.traffic.trains.length, 0, 'pociąg wyprawiony bez pozwolenia');
  w.press('Poz');
  run(sim, 60 * 8);
  const tr = sim.traffic.trains.find((t) => t.nr === 5310);
  assert.ok(tr);
  assert.equal(tr.v, 0);
  assert.equal(tr.stoppedAt?.signal, 'A');
  for (const s of tr.occupiedSections()) assert.equal(s, 'ZbA', `pociąg minął semafor A: ${s}`);
});

test('losowe naciskanie przycisków przez całą zmianę nie łamie niezmienników bezpieczeństwa', () => {
  let seed = 12345;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const sim = makeSim();
  const refs = [];
  for (const s of sim.ilk.signals.values()) {
    if (s.kind === 'semafor') refs.push({ kind: 'signal', id: s.id, color: 'green' });
    if (s.kind === 'tm' || s.shunting) refs.push({ kind: 'signal', id: s.id, color: 'white' });
  }
  for (const id of ['kW', 'kE', 'kT3']) refs.push({ kind: 'end', id });
  for (const p of sim.ilk.points.keys()) refs.push({ kind: 'point', id: p });
  for (const d of sim.ilk.derailers.keys()) refs.push({ kind: 'derailer', id: d });
  refs.push({ kind: 'group', id: 'Zw', role: 'group-point' }, { kind: 'group', id: 'Zz', role: 'point-lock' }, { kind: 'group', id: 'Pz', role: 'route-release' });
  for (const ex of ['W', 'E']) for (const btn of ['Wbl', 'Poz', 'Ko']) refs.push({ kind: 'block', exit: ex, btn });
  const end = Clock.parse('07:30');
  let presses = 0;
  while (sim.clock.time < end) {
    sim.step(0.5);
    if (rnd() < 0.3) { const r = refs[Math.floor(rnd() * refs.length)]; if (rnd() < 0.15) sim.pull(r); else sim.press(r); presses++; }
    safety(sim, Clock.format(sim.clock.time, true));
  }
  assert.ok(presses > 500);
  assert.equal(sim.ilk.counters.rozprucie, 0, 'losowa obsługa doprowadziła do rozprucia');
});
