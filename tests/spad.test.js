import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/model/Simulation.js';
import szkolna from '../src/stations/szkolna.js';
import { Clock, grant } from './helpers.js';

/*
 * Pociąg, który minął semafor na „Stój”, bo sygnał zgasł tuż przed nim. Dwie sprawy:
 *  - przyczyna po stronie urządzeń (zajętość odcinka bez taboru) nie obciąża dyżurnego,
 *  - pociąg stoi za semaforem bez zezwolenia; dalej pojedzie na rozkaz pisemny „S” – do następnego semafora, do 40 km/h.
 *    Wcześniej nie dało się go ruszyć wcale, gdy między nim a następnym semaforem była zwrotnica.
 */

/**
 * Osobowy 6101 jedzie od Lipna na przebieg `route`; gdy do semafora A zostaje `d` m, `drop(sim)` gasi sygnał.
 * A-D1 (tor prosty): pociąg jedzie szybko i staje dopiero na torze 1. A-D2 (na zwrotny, 40 km/h): staje tuż za
 * semaforem, przed zwrotnicami drogi przebiegu.
 */
function overrun(drop, route = 'A-D1', d = route === 'A-D1' ? 60 : 8) {
  const sim = new Simulation(szkolna, { scenario: 'zmiana-e', disruptions: 'none' });
  const e = sim.traffic.timetable().find((x) => x.nr === 6101);
  let set = false, dropped = false;
  for (let i = 0; i < 6000 && !(dropped && e.train?.v === 0); i++) {
    sim.step(0.5);
    grant('W')(sim);
    if (!set && e.train) { set = sim.ilk.setRoute(route).ok; }
    if (set && !dropped && e.train) {
      // sygnał gaśnie o krok symulacji (0,5 s) wcześniej: zmiana obrazu działa w następnym kroku, gdy do A zostaje
      // najwyżej `d` m (dojazd zależy od maszynisty – bez tego pociąg bywał już przy A i mijał go na sygnał zezwalający)
      const x = e.train.constraintsAhead(3000, true).find((c) => c.signal === 'A')?.dist;
      const next = x != null ? x - e.train.v * 0.5 : null;
      if (next != null && next > 0 && next <= d && e.train.v > 8) { drop(sim); dropped = true; }
    }
  }
  assert.ok(dropped, 'pociąg nie dojechał do A');
  return { sim, e, tr: e.train };
}
const force = (sim, id, on) => { sim.ilk.sections.get(id).forced = on; sim.ilk.updateOccupancy(sim.traffic.currentOccupancy()); };
const falseOccupancy = (sim) => force(sim, 'T1', true);
const items = (sim, code) => sim.score.items.filter((i) => i.code === code);

test('semafor zgasł przed pociągiem przez usterkę obwodu torowego: pociąg mija „Stój”, ale bez kary dla dyżurnego; przy odwołaniu sygnału przez dyżurnego kara zostaje', () => {
  const fault = overrun(falseOccupancy);
  assert.equal(fault.tr.stoppedAt?.kind, 'spad', 'pociąg stanął za semaforem A');
  assert.equal(fault.tr.stoppedAt.signal, 'A');
  assert.deepEqual(items(fault.sim, 'spad'), [], 'usterka urządzeń – bez kary');
  const own = overrun((sim) => sim.execute({ type: 'signal-stop', signal: 'A', on: true }));
  assert.equal(own.tr.stoppedAt?.kind, 'spad');
  assert.equal(items(own.sim, 'spad').length, 1);
  assert.equal(items(own.sim, 'spad')[0].points, -20);
});

test('pociąg stojący za semaforem miniętym na „Stój” rusza dopiero na rozkaz pisemny „S” i jedzie do następnego semafora do 40 km/h', () => {
  // przebieg A-D2, usterka obwodu toru 2: pociąg staje tuż za semaforem A, przed zwrotnicami – przebieg zostaje utwierdzony
  const { sim, e, tr } = overrun((s) => force(s, 'T2', true), 'A-D2');
  assert.equal(tr.stoppedAt?.kind, 'spad');
  assert.ok(sim.ilk.routeIsSet('A-D2'), 'pociąg stoi w przebiegu');
  assert.ok(!tr.occupiedSections().has('T2'), 'do toru 2 nie dojechał');
  const head = tr.head;
  for (let i = 0; i < 240; i++) sim.step(0.5);
  assert.equal(tr.head, head, 'bez rozkazu stoi');
  // na liście pociągów do rozkazu jest z semaforem, który minął
  const st = sim.traffic.standingTrains().find((x) => x.nr === 6101);
  assert.deepEqual([st.signal, st.behind], ['A', true]);
  assert.match(sim.traffic.orderTemplate(6101, 'A', undefined, true), /zatrzymał się za semaforem A.*dalszą jazdę do następnego semafora/);
  // rozkaz na inny semafor – odmowa; na miniony – zgoda, uzasadniony usterką (0 pkt)
  assert.equal(sim.traffic.issueOrder({ nr: 6101, signal: 'B' }).ok, false);
  const res = sim.traffic.issueOrder({ nr: 6101, signal: 'A', reason: 'usterki obwodu torowego' });
  assert.ok(res.ok, res.reason);
  assert.deepEqual(items(sim, 'order').map((i) => i.points), [0]);
  assert.equal(tr.stoppedAt, null);
  let vmax = 0;
  for (let i = 0; i < 1200 && e.actualArr == null; i++) { sim.step(0.5); vmax = Math.max(vmax, tr.v * 3.6); }
  assert.ok(e.actualArr != null, `pociąg dojechał do peronu (${e.status})`);
  assert.equal(String(e.actualTrack), '2');
  assert.ok(vmax > 5 && vmax <= 40.5, `prędkość po rozkazie ${vmax.toFixed(1)} km/h`);
  assert.equal(sim.ilk.counters.rozprucie, 0);
  // drugi raz ten sam rozkaz nie przejdzie – pociąg nie stoi już za semaforem A
  assert.equal(sim.traffic.issueOrder({ nr: 6101, signal: 'A' }).ok, false);
  assert.ok(Clock.format(sim.clock.time) > '07:00');
});

test('rozkaz dla pociągu stojącego za semaforem wymaga zamkniętych zwrotnic: po zwolnieniu przebiegu – odmowa, po zamknięciu zwrotnicy (Zz) – zgoda', () => {
  const { sim, tr } = overrun((s) => s.execute({ type: 'signal-stop', signal: 'A', on: true }), 'A-D2');
  assert.ok(sim.ilk.routeIsSet('A-D2'));
  const ahead = () => { const at = tr.headTile(); return sim.ilk.pathFrom(at.tile, at.outPort, at.inPort); };
  assert.ok(ahead().points.length > 0, 'przed czołem pociągu są zwrotnice');
  // dyżurny zwolnił przebieg doraźnie – zwrotnice przed pociągiem nie są już utwierdzone
  assert.ok(sim.ilk.releaseRoute('A', true).ok);
  const no = sim.traffic.issueOrder({ nr: 6101, signal: 'A' });
  assert.equal(no.ok, false);
  assert.match(no.reason, /niezamknięta/);
  for (const { id } of ahead().points) assert.ok(sim.execute({ type: 'lock', id }).ok);
  const yes = sim.traffic.issueOrder({ nr: 6101, signal: 'A' });
  assert.ok(yes.ok, yes.reason);
  assert.deepEqual(items(sim, 'order').map((i) => i.points), [-10], 'sygnał odwołał dyżurny – rozkaz bez usterki urządzeń');
  assert.equal(tr.authority, true);
});
