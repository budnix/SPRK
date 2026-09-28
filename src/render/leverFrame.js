/**
 * Układ nastawnicy mechanicznej (bez DOM): dźwignie nastawcze, drążki przebiegowe i stan każdego elementu.
 *
 * Dźwignie (Ie-8 §6): zwrotnicowe i wykolejnicowe (trzon niebieski), semaforowe (czerwony), tarcz manewrowych
 * (niebieski z czerwoną obwódką); numeracja kolejna od lewej. Drążek przebiegowy należy do sygnalizatora
 * początkowego i obsługuje najwyżej dwa przebiegi (położenia „w górę” i „w dół”) – założenie gry, docs/SOURCES.md.
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

/**
 * Dźwignie i drążki nastawnicy dla zależności `ilk` (Interlocking).
 * @returns {{ levers: { no, kind, id }[], drazki: { id, start, kind, routes: { id, pos, target }[] }[] }}
 */
export function leverFrame(ilk) {
  const levers = [];
  const add = (kind, id) => levers.push({ no: levers.length + 1, kind, id });
  for (const id of [...ilk.points.keys()].sort(natural)) add('point', id);
  for (const id of [...ilk.derailers.keys()].sort(natural)) add('derailer', id);
  const sigs = [...ilk.signals.values()].sort((a, b) => (a.kind === 'semafor' ? 0 : 1) - (b.kind === 'semafor' ? 0 : 1) || natural(a.id, b.id));
  for (const s of sigs) add(signalLeverKind(s), s.id);

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

/**
 * Stan elementów nastawnicy (co pokazać): położenie dźwigni, zamknięcie drążkiem, położenie drążka, okienko bloku.
 * Dźwignia zwrotnicowa stoi tak, jak ją przełożono (cel zwrotnicy), a nie jak zwrotnica akurat dojechała.
 */
export function leverStates(ilk, frame) {
  const lockedPoints = new Set();
  for (const act of ilk.active.values()) for (const id of act.lockedPoints) lockedPoints.add(id);
  const lockedDerailers = new Set();
  for (const act of ilk.active.values()) for (const id of act.lockedDerailers) lockedDerailers.add(id);
  const levers = {};
  for (const l of frame.levers) {
    if (l.kind === 'point') {
      const p = ilk.points.get(l.id);
      levers[l.id] = { down: p.target === '-', locked: lockedPoints.has(l.id) || p.individualLock, moving: p.moving, fault: p.trailed || (!p.control && !p.moving) };
    } else if (l.kind === 'derailer') {
      const d = ilk.derailers.get(l.id);
      levers[l.id] = { down: d.target === 'off', locked: lockedDerailers.has(l.id) || d.individualLock, moving: d.moving, fault: false };
    } else {
      const s = ilk.signals.get(l.id);
      const act = s.route ? ilk.active.get(s.route) : null;
      levers[l.id] = { down: !!act?.lever, locked: !act, moving: false, fault: !!s.failed };
    }
  }
  const drazki = {};
  for (const d of frame.drazki) {
    const sig = ilk.signals.get(d.start);
    const set = d.routes.find((r) => sig.route === r.id);
    const act = set ? ilk.active.get(set.id) : null;
    drazki[d.id] = {
      pos: set?.pos ?? null, route: set?.id ?? null,
      // okienko bloku przebiegowego: białe – zablokowany (wolno podać sygnał), czerwone – położenie zasadnicze
      blocked: !!act?.blocked, passed: !!act?.passed,
    };
  }
  return { levers, drazki };
}
