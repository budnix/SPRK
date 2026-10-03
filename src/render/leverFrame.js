/**
 * Układ nastawnicy mechanicznej (bez DOM): dźwignie nastawcze, drążki przebiegowe i stan każdego elementu.
 *
 * Dźwignie (Ie-8 §6): zwrotnicowe i wykolejnicowe (trzon niebieski), semaforowe (czerwony), tarcz manewrowych
 * (niebieski z czerwoną obwódką); numeracja kolejna od lewej. Semafor rozprzężony – taki, z którego wychodzą
 * przebiegi na Sr2 i na Sr3 – ma dwie dźwignie sygnałowe (np. A¹ dla Sr2, A² dla Sr3); semafor jednoramienny
 * i sprzężony (tylko Sr1 / Sr3) – jedną. Drążek przebiegowy należy do sygnalizatora początkowego i obsługuje najwyżej
 * dwa przebiegi (położenia „w górę” i „w dół”) – założenie gry, docs/sources/pulpity.md; drążek przebiegów pociągowych ma
 * też położenia pośrednie (`half`), które zamykają zwrotnice do jazdy na sygnał zastępczy.
 */

const natural = (a, b) => a.localeCompare(b, 'pl', { numeric: true });

/** Rodzaj dźwigni sygnałowej: semafor – czerwona, tarcza manewrowa – niebieska z czerwoną obwódką. */
function signalLeverKind(sig) {
  return sig.kind === 'semafor' ? 'signal' : 'shunt';
}

/** Opis celu przebiegu na drążku: nazwa szlaku, semafor końcowy albo tor. */
export function routeTarget(route, station, sections) {
  if (route.exit) return station.exits?.[route.exit]?.name || route.exit;
  if (route.end.type === 'signal') return route.end.id;
  const last = route.sections[route.sections.length - 1] ?? route.approach;
  const track = sections?.get(last)?.track;
  return track != null ? `tor ${track}` : route.endButton;
}

/** Oznaczenie dźwigni semafora rozprzężonego: A¹ – jedno ramię (Sr2), A² – dwa ramiona (Sr3). */
const ARM_MARK = { Sr2: '¹', Sr3: '²' };

/** Obrazy, które semafor kształtowy podaje na swoich przebiegach pociągowych (Sr2, Sr3) – w tej kolejności. */
function signalAspects(ilk, sig) {
  if (!ilk.shapedSignals || sig.kind !== 'semafor') return [];
  const set = new Set(ilk.routeList().filter((r) => r.start === sig.id && r.kind === 'train').map((r) => ilk.shapedAspect(r)));
  return ['Sr2', 'Sr3'].filter((a) => set.has(a));
}

/**
 * Dźwignie i drążki nastawnicy dla zależności `ilk` (Interlocking). Dźwignia sygnałowa ma `signal` (sygnalizator)
 * i – na semaforze rozprzężonym – `aspect` (obraz, który podaje); jej `id` to wtedy oznaczenie z indeksem (A¹, A²).
 * @returns {{ levers: { no, kind, id, signal?, aspect? }[], drazki: { id, start, kind, routes: { id, pos, target }[] }[] }}
 */
export function leverFrame(ilk) {
  const levers = [];
  const add = (kind, id, extra = {}) => levers.push({ no: levers.length + 1, kind, id, ...extra });
  for (const id of [...ilk.points.keys()].sort(natural)) add('point', id);
  for (const id of [...ilk.derailers.keys()].sort(natural)) add('derailer', id);
  const sigs = [...ilk.signals.values()].sort((a, b) => (a.kind === 'semafor' ? 0 : 1) - (b.kind === 'semafor' ? 0 : 1) || natural(a.id, b.id));
  for (const s of sigs) {
    const aspects = signalAspects(ilk, s);
    if (aspects.length === 2) for (const a of aspects) add('signal', `${s.id}${ARM_MARK[a]}`, { signal: s.id, aspect: a });
    else add(signalLeverKind(s), s.id, { signal: s.id });
  }

  const drazki = [];
  const byStart = new Map();
  for (const r of ilk.routeList()) {
    const key = `${r.start}/${r.kind}`;
    if (!byStart.has(key)) byStart.set(key, []);
    byStart.get(key).push(r);
  }
  const order = [...byStart.keys()].sort((a, b) => {
    const [sa, ka] = a.split('/'), [sb, kb] = b.split('/');
    return (ka === 'train' ? 0 : 1) - (kb === 'train' ? 0 : 1) || natural(sa, sb);
  });
  for (const key of order) {
    const routes = byStart.get(key).sort((a, b) => natural(a.id, b.id));
    const [start, kind] = key.split('/');
    for (let i = 0; i < routes.length; i += 2) {
      const pair = routes.slice(i, i + 2);
      const base = `${start.toLowerCase()}${kind === 'shunt' ? 'm' : ''}`;
      drazki.push({
        id: i ? `${base}${i / 2 + 1}` : base, start, kind,
        routes: pair.map((r, j) => ({ id: r.id, pos: j ? 'down' : 'up', target: routeTarget(r, ilk.station, ilk.sections) })),
      });
    }
  }
  return { levers, drazki };
}

/** Dźwignie sygnałowe sygnalizatora `signalId`; przy dwóch – najpierw ta, której wymaga przebieg zamknięty drążkiem. */
export function signalLevers(ilk, frame, signalId) {
  const list = frame.levers.filter((l) => l.signal === signalId);
  const route = ilk.signals.get(signalId)?.route;
  const need = route ? ilk.shapedAspect(ilk.routes.get(route)) : null;
  return list.sort((a, b) => (a.aspect === need ? 0 : 1) - (b.aspect === need ? 0 : 1));
}

/**
 * Stan elementów nastawnicy (co pokazać): położenie dźwigni, zamknięcie drążkiem, położenie drążka, okienko bloku.
 * Dźwignia zwrotnicowa stoi tak, jak ją przełożono (cel zwrotnicy), a nie jak zwrotnica akurat dojechała.
 * Dźwignia semafora rozprzężonego jest zamknięta, gdy przebieg zamknięty drążkiem wymaga drugiej. Drążek w położeniu
 * pośrednim: `pos` jak przy przebiegu, `half: true`.
 */
export function leverStates(ilk, frame) {
  const levers = {};
  for (const l of frame.levers) {
    if (l.kind === 'point') {
      const p = ilk.points.get(l.id);
      levers[l.id] = { down: p.target === '-', locked: !!ilk.pointLockedByRoute(l.id) || p.individualLock, moving: p.moving, fault: p.trailed || (!p.control && !p.moving) };
    } else if (l.kind === 'derailer') {
      const d = ilk.derailers.get(l.id);
      levers[l.id] = { down: d.target === 'off', locked: !!ilk.derailerLockedByRoute(l.id) || d.individualLock, moving: d.moving, fault: false };
    } else {
      const s = ilk.signals.get(l.signal);
      const set = s.route ? ilk.routeInfo(s.route) : null;
      // przebieg manewrowy z semafora rozprzężonego – dźwignią pierwszą (uproszczenie gry)
      const mine = !!set && (!l.aspect || l.aspect === (set.route.kind === 'train' ? ilk.shapedAspect(set.route) : 'Sr2'));
      levers[l.id] = { down: mine && !!ilk.routeFrame(set.id)?.lever, locked: !mine, moving: false, fault: !!s.failed };
    }
  }
  const drazki = {};
  for (const d of frame.drazki) {
    const sig = ilk.signals.get(d.start);
    const halfId = sig.route ? null : ilk.half.get(d.start)?.id;
    const set = d.routes.find((r) => (sig.route ?? halfId) === r.id);
    const parts = set && !halfId ? ilk.routeFrame(set.id) : null;
    drazki[d.id] = {
      pos: set?.pos ?? null, route: set?.id ?? null, half: !!set && !!halfId,
      // okienko bloku przebiegowego: białe – zablokowany (wolno podać sygnał), czerwone – położenie zasadnicze
      blocked: !!parts?.blocked, passed: !!parts?.passed,
    };
  }
  return { levers, drazki };
}
