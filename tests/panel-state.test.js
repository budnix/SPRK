import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/model/Simulation.js';
import { taskCards, trainCards, commandCandidates, blockCards } from '../src/ui/panelState.js';
import { makeSim, run, trainAtA, grant } from './helpers.js';
import szkolna from '../src/stations/szkolna.js';
import gdynia from './fixtures/gdynia-glowna-okregi.js';

/*
 * Co widzi dyżurny w panelu bocznym (src/ui/panelState.js) – dane i kody bez DOM: zadania, pociągi na posterunku,
 * kandydaci do polecenia dla drugiego okręgu, blokady. Panel (SidePanel) dobiera do nich teksty i HTML; tu – w Node,
 * bez przeglądarki.
 */

test('zadania: stan karty (czeka na poprzednie / w toku), numer zadania, na które czeka, postęp', () => {
  const sim = new Simulation(szkolna, { scenario: 'zmiana', disruptions: 'none', seed: 1 });
  const { done, total, cards } = taskCards(sim);
  assert.ok(total >= 2 && done === 0);
  const after = cards.find((c) => c.afterTaskNo != null);
  assert.ok(after, 'zadanie czekające na poprzednie');
  assert.equal(after.state, 'waiting');
  assert.equal(cards[after.afterTaskNo - 1].no, after.afterTaskNo);
  assert.deepEqual(cards.map((c) => c.no), cards.map((_, i) => i + 1));
});

test('pociągi: tylko te na posterunku; kod miejsca, tory pod pociągiem, czy można wydać polecenie', () => {
  const sim = makeSim({ disruptions: 'none', seed: 1 });
  assert.deepEqual(trainCards(sim), [], 'nikogo jeszcze nie ma');
  trainAtA(sim); // 5310 na odcinku zbliżania, przed semaforem wjazdowym A – już na rysunku posterunku
  const [held] = trainCards(sim);
  assert.deepEqual([held.e.nr, held.where, held.moving, held.canControl], [5310, { code: 'at-signal', signal: 'A' }, false, true]);
  assert.ok(sim.execute({ type: 'route', start: 'A', end: 'D1', kind: 'train' }).ok);
  run(sim, 4 * 60, grant('W'));
  const [card] = trainCards(sim);
  assert.equal(card.e.nr, 5310);
  assert.deepEqual([card.mode, card.tracks, card.moving, card.canControl], ['train', ['1'], false, true], 'stoi na torze 1');
  assert.ok(['dwell', 'at-platform', 'at-signal'].includes(card.where.code), card.where.code);
});

test('polecenia dla drugiego okręgu: przyjąć – pociąg jeszcze nie wjechał; wyprawić – pociąg na stacji, na szlak tamtego okręgu', () => {
  const sim = new Simulation(gdynia, { district: 'GO', disruptions: 'none', seed: 1 });
  run(sim, 30 * 60);
  const cands = commandCandidates(sim, 'GO2');
  assert.ok(cands.length > 0);
  for (const { e, kind } of cands) {
    if (kind === 'accept') assert.ok(sim.exitDistrict(e.from) === 'GO2' && !e.train?.entered, `${e.nr}: przyjąć tylko przed wjazdem`);
    else assert.ok(kind === 'dispatch' && sim.exitDistrict(e.to) === 'GO2' && e.train?.entered && !e.train.finished, `${e.nr}: wyprawić tylko ze stacji na szlak GO2`);
  }
  // pociąg, który wjechał z okręgu GO2 i nie odjeżdża na jego szlak, nie jest kandydatem (dawniej trafiał jako „wyprawić”)
  for (const e of sim.traffic.timetable().filter((x) => x.train?.entered && sim.exitDistrict(x.from) === 'GO2' && sim.exitDistrict(x.to) !== 'GO2')) {
    assert.ok(!cands.some((c) => c.e === e), `${e.nr}`);
  }
});

test('blokady: kierunek, prośba sąsiada, Ko do obsłużenia, liczniki – z pytań blokady', () => {
  const sim = makeSim({ disruptions: 'none', seed: 1 });
  run(sim, 12 * 60);
  const w = blockCards(sim).find((b) => b.id === 'W');
  assert.deepEqual([w.label, w.auto, w.request, w.ko, w.dPo, w.dKo], [sim.blocks.get('W').def.label || sim.blocks.get('W').neighbour, false, 'theirs', false, 0, 0]);
  grant('W')(sim);
  assert.equal(blockCards(sim).find((b) => b.id === 'W').direction, 'in');
});
