/**
 * Tablica zależności – przebiegi stacji wyprowadzone z planu (`Topology`): z każdego semafora przebiegi pociągowe, z tarcz
 * manewrowych i semaforów z sygnałem manewrowym – manewrowe; dla każdego droga, odcinki do utwierdzenia, odcinek
 * zbliżania, zwrotnice drogi i ochrony bocznej, wykolejnice, droga ochronna, wyjazd na szlak i szybkość. Liczona raz,
 * przy budowie zależności. Definicja stacji może wyłączyć przebieg (`routes.disable`) albo nadpisać jego pola
 * (`routes.override`). Moduł logiki: bez DOM.
 */

/**
 * Przebiegi stacji `station` na planie `topo`: Map id → przebieg. Id: `<sygnalizator>-<koniec>`, przebieg manewrowy
 * z semafora – z przyrostkiem `m`, kolejne drogi do tego samego końca – `#2`, `#3`.
 */
export function deriveRoutes(station, topo) {
  const routes = new Map();
  const disabled = new Set(station.routes?.disable || []);
  for (const sig of topo.signals.values()) {
    const kinds = [];
    if (sig.kind === 'semafor') kinds.push('train');
    if (sig.kind === 'tm' || sig.shunting) kinds.push('shunt');
    for (const kind of kinds) {
      const paths = topo.pathsFrom(sig, kind);
      const seen = new Map();
      for (const p of paths) {
        if (p.end.type === 'exit' && kind === 'shunt') continue; // manewry nie wyjeżdżają na szlak
        // przebiegi pociągowe kończą się na semaforze, szlaku albo kozle toru stacyjnego (tor peronowy czołowy)
        if (kind === 'train' && p.end.type !== 'exit' && p.end.type !== 'signal' && !stationBuffer(station, topo, p.end)) continue;
        const endBtn = endButtonFor(station, topo, p.end);
        let id = `${sig.id}-${p.end.id}`;
        if (kind === 'shunt' && sig.kind === 'semafor') id += 'm';
        const n = (seen.get(id) || 0) + 1; seen.set(id, n);
        if (n > 1) id += `#${n}`;
        if (disabled.has(id)) continue;
        const lockedSections = p.sections.slice(1).filter((s, i, a) => a.indexOf(s) === i && s !== p.sections[0]);
        const route = {
          id, kind, start: sig.id, end: p.end, endButton: endBtn,
          steps: p.steps, sections: lockedSections, approach: p.sections[0],
          points: p.points, flank: topo.flankProtection(p),
          derailers: topo.derailersFor(p),
          // droga ochronna za semaforem końcowym, chyba że semafor jej nie ma (`overlap: false` na planie)
          overlap: (kind === 'train' && p.end.type === 'signal' && topo.signals.get(p.end.id).overlap !== false)
            ? topo.overlapSections(topo.signals.get(p.end.id)) : [],
          exit: p.end.type === 'exit' ? p.end.id : null,
          speed: routeSpeed(station, topo, p),
          ...(station.routes?.override?.[id] || {}),
        };
        routes.set(id, route);
      }
    }
  }
  return routes;
}

/** Kozioł toru stacyjnego (peron czołowy): przebieg pociągowy może się na nim kończyć; kozły bocznic – tylko manewry. */
function stationBuffer(station, topo, end) {
  if (end.type !== 'buffer') return false;
  const tile = topo.endButtons.get(end.id);
  return !!tile && station.sections[tile.section]?.kind === 'station';
}

/** Przycisk końca przebiegu: semafor końcowy, przycisk przy szlaku (kostka skrajna) albo przycisk przy kozle. */
function endButtonFor(station, topo, end) {
  if (end.type === 'signal') return end.id;
  if (end.type === 'exit') {
    const e = station.exits[end.id];
    const t = topo.trackAt(e.tile.x, e.tile.y);
    return t?.endButton?.id || end.id;
  }
  return end.id; // buffer / endButton – id przycisku końca przebiegu
}

/** Szybkość przebiegu: najmniejsza szybkość na zwrotnicach przełożonych na kierunek zwrotny (domyślnie 40 km/h). */
function routeSpeed(station, topo, p) {
  let v = Infinity;
  for (const pt of p.points) {
    if (pt.position === '-') {
      const t = topo.points.get(pt.id);
      v = Math.min(v, t.speedDiverging ?? station.points?.[pt.id]?.speedDiverging ?? 40);
    }
  }
  return v;
}
