import { relationOf } from '../model/categories.js';

/**
 * Polecenia stanowiska komputerowego (monitor, `srk: 'komputerowe'`; obraz wg Ie-104): co można zrobić z elementem
 * wskazanym na schemacie – menu elementu i blokady szlaku jako dane. Widok (`src/render/ScreenRenderer.js`) rysuje
 * menu i wykonuje wybraną pozycję; reguły (które polecenia, które specjalne, jakie numery pociągów pod blokadą) są tu
 * i testuje je Node (`tests/monitor-menu.test.js`) – tak jak protokoły MOR-3 (`mor.js`) i EBILock (`ebilock.js`).
 * Moduł logiki: bez DOM.
 */

/** Polecenie z paska → rodzaje elementów, których dotyczy (pozycję menu wskazuje jej `mode`). */
export const MODE_KINDS = Object.freeze({
  train: ['signal'], shunt: ['signal'], pz: ['signal'], dpz: ['signal'], zw: ['point', 'derailer'], zz: ['point', 'derailer'],
  sz: ['signal'], stop: ['signal'], sstop: ['signal'],
});

/**
 * Menu elementu wskazanego na monitorze (`ref`: sygnalizator, zwrotnica, wykolejnica, panel blokady, przycisk końca)
 * – `{ title, items }` albo null. Pozycja menu to dane: `{ mode, label, cmd }` – polecenie wydawane wprost
 * (`Simulation.execute`, monitor nie ma przycisków grupowych), `special: true` z `target` – polecenie specjalne
 * z potwierdzeniem (Ie-104.1 §11), `route` ('green' | 'white') z `signal` – początek przebiegu (koniec wskazuje gracz),
 * `{ sep: true }` – separator, `{ lineTrains }` – pociągi toru szlakowego, `{ label }` bez polecenia – wskazówka.
 * `mode` łączy pozycję menu z poleceniem z paska (`MODE_KINDS`).
 */
export function monitorMenu(sim, ref) {
  const ilk = sim.ilk;
  if (ref.kind === 'signal') {
    const s = ilk.signals.get(ref.id);
    const items = [];
    if (s.kind === 'semafor') items.push({ mode: 'train', label: `Nastawienie przebiegu pociągowego od ${ref.id} …`, route: 'green', signal: ref.id });
    if (s.kind === 'tm' || s.shunting) items.push({ mode: 'shunt', label: `Nastawienie przebiegu manewrowego od ${ref.id} …`, route: 'white', signal: ref.id });
    items.push({ mode: 'stop', label: 'Sygnał „Stój” – przebieg pozostaje utwierdzony (Stój)', cmd: { type: 'stop', signal: ref.id } });
    items.push(s.stopped
      ? { mode: 'sstop', label: 'Odwołanie zastopowania sygnalizatora (oStop)', cmd: { type: 'signal-stop', signal: ref.id, on: false } }
      : { mode: 'sstop', label: 'Zastopowanie sygnalizatora (Stop)', cmd: { type: 'signal-stop', signal: ref.id, on: true } });
    items.push({ mode: 'pz', label: 'Zwolnienie przebiegu (ZCZ)', cmd: { type: 'release', signal: ref.id } });
    // ZDP – przebiegu pociągowego: polecenie specjalne; ZDM – manewrowego: zwykłe (Ie-104.1 §12)
    if (ilk.routeInfo(s.route)?.route.kind === 'shunt') items.push({ mode: 'dpz', label: 'Zwolnienie doraźne przebiegu manewrowego (ZDM)', cmd: { type: 'release', signal: ref.id, emergency: true } });
    else items.push({ mode: 'dpz', label: 'Zwolnienie doraźne przebiegu pociągowego (ZDP)', special: true, target: ref, cmd: { type: 'release', signal: ref.id, emergency: true } });
    if (s.kind === 'semafor') items.push({ mode: 'sz', label: 'Sygnał zastępczy (SZ)', special: true, target: ref, cmd: { type: 'substitute', signal: ref.id } });
    return { title: `${s.kind === 'tm' ? 'Tarcza manewrowa' : 'Semafor'} ${ref.id}`, items };
  }
  if (ref.kind === 'point') {
    const p = ilk.points.get(ref.id);
    return { title: `Zwrotnica ${p?.label || ref.id}`, items: [
      { mode: 'zw', label: p?.position === '+' ? 'Przestawienie zwrotnicy w położenie minus (Minus)' : 'Przestawienie zwrotnicy w położenie plus (Plus)', cmd: { type: 'point', id: ref.id } },
      { mode: 'zz', label: p?.individualLock ? 'Odwołanie zamknięcia zwrotnicy (oZmk)' : 'Zamknięcie zwrotnicy (Zmk)', cmd: { type: 'lock', id: ref.id } },
    ] };
  }
  if (ref.kind === 'derailer') {
    const d = ilk.derailers.get(ref.id);
    return { title: `Wykolejnica ${ref.id}`, items: [
      { mode: 'zw', label: d?.position === 'on' ? 'Zdjęcie wykolejnicy (Minus)' : 'Nałożenie wykolejnicy (Plus)', cmd: { type: 'derailer', id: ref.id } },
      { mode: 'zz', label: d?.individualLock ? 'Odwołanie zamknięcia wykolejnicy (oZmk)' : 'Zamknięcie wykolejnicy (Zmk)', cmd: { type: 'lock', id: ref.id, derailer: true } },
    ] };
  }
  if (ref.kind === 'blockpanel') return blockMenu(sim, ref.exit);
  if (ref.kind === 'end') {
    // przycisk końca przy szlaku – menu blokady tego szlaku
    const t = ilk.topo.endButtons.get(ref.id);
    const ex = t ? Object.entries(sim.station.exits || {}).find(([, e]) => e.tile.x === t.x && e.tile.y === t.y) : null;
    if (ex) return blockMenu(sim, ex[0]);
    return { title: 'Koniec toru', items: [{ label: 'Wskaż najpierw sygnalizator początku przebiegu' }] };
  }
  return null;
}

/** Polecenia blokady liniowej szlaku: Eap (Wbl, Poz, Ko), samoczynna (Zk), doraźne dPo / dKo. */
function blockMenu(sim, exit) {
  const b = sim.blocks.get(exit);
  const press = (btn) => ({ type: 'block', exit, btn });
  const items = [];
  if (b?.auto) items.push({ label: b.request === 'theirs' ? 'Zgoda na zmianę kierunku blokady – prośba sąsiada (Zk)' : `Prośba o zmianę kierunku blokady (Zk) – obecnie ${b.direction === 'out' ? 'odjazd' : 'przyjazd'}`, cmd: press('Zk') });
  else {
    if (!b?.fixed) items.push({ label: 'Żądanie pozwolenia na wyprawienie pociągu (Wbl)', cmd: press('Wbl') },
      { label: 'Odwołanie żądania / zwrot pozwolenia (oWbl)', cmd: press('oWbl') },
      { label: 'Danie pozwolenia na wyprawienie pociągu (Poz)', cmd: press('Poz') });
    items.push({ label: 'Zwolnienie bloku końcowego – pociąg przybył w całości (Ko)', cmd: press('Ko') });
  }
  // SBL nie ma bloków Po / Ko – bez poleceń doraźnych
  const blk = { kind: 'blockpanel', exit };
  if (!b?.auto && b?.fixed !== 'in') items.push({ label: 'Doraźne zablokowanie bloku początkowego – po wyjeździe na Sz (dPo)', special: true, target: blk, cmd: { type: 'block', exit, btn: 'dPo' } });
  if (!b?.auto && b?.fixed !== 'out') items.push({ label: 'Doraźne przygotowanie bloku końcowego – przed wjazdem na Sz (dKo)', special: true, target: blk, cmd: { type: 'block', exit, btn: 'dKo' } });
  // pod separatorem: numery pociągów na tym torze szlakowym jako czerwone kasetki (jak na planie) – najpierw
  // pociąg na szlaku, potem w kolejce pociągi zgłoszone przez sąsiada i czekające na wyprawienie (kontur)
  items.push({ sep: true }, { lineTrains: lineTrains(sim, exit) });
  return { title: `Szlak ${b?.def?.label || b?.neighbour || exit} – blokada ${b?.auto ? 'samoczynna' : 'Eap'}`, items };
}

/** Pociągi toru szlakowego `exit` w kolejności: na szlaku (`on: true`), potem zgłoszone u sąsiada i czekające. */
export function lineTrains(sim, exit) {
  const b = sim.blocks.get(exit);
  if (!b) return [];
  const tt = sim.traffic.timetable();
  const out = [];
  if (b.lineTrain != null) {
    const e = sim.traffic.entry(b.lineTrain);
    out.push({ nr: String(b.lineTrain), on: true, title: `${e ? `${e.label} ${relationOf(e)}` : `pociąg nr ${b.lineTrain}`} – na szlaku, ${b.poBlocked ? `od nas do ${b.neighbour}` : `od ${b.neighbour} do nas`}` });
  }
  for (const e of tt.filter((x) => x.from === exit && x.requested && !x.dispatched)) out.push({ nr: String(e.nr), on: false, title: `${e.label} ${relationOf(e)} – zgłoszony przez ${b.neighbour}, czeka na wyprawienie` });
  return out;
}
