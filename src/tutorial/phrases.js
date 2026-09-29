/**
 * Wspólne cegiełki tekstów samouczków (bez DOM). Każda misja ma własny słownik tekstów w swoim pliku
 * (`src/tutorial/missions/`); tu jest tylko to, co kilka misji bierze bez zmian.
 */

/** Skrót z wyjaśnieniem ze słownika (`src/data/glossary.js`) – w dymku klikalny. */
export const A = (term, label = term) => `<abbr data-term="${term}">${label}</abbr>`;

/** Przycisk sygnałowy pulpitu typu E i element monitora: sygnalizator z kolorem przycisku (rodzajem przebiegu). */
export const colouredSignal = (id, color) => ({ ref: { kind: 'signal', id, color } });

/** Zwolnienie błędnie nastawionego przebiegu na pulpicie typu E i na monitorze. */
export const RELEASE_E = (start) => `zwolnij przebieg (ZWOLNIJ PRZEBIEG / Pz + ${start})`;

/** Kostki blokady liniowej i wskazania wspólne dla pulpitów kostkowych (typ E, IZH-111). */
export const DESK_BLOCK = {
  indicator: 'lampka',
  blockPress: (exit, name, btn) => `naciśnij przycisk <b>${btn}</b> na kostkach blokady przy końcu toru szlakowego do <b>${name}</b> (lewy / prawy kraniec pulpitu)`,
  dpo: (name) => `naciśnij <b>dPo</b> na kostce licznika blokady do <b>${name}</b>`,
  dko: (name) => `naciśnij <b>dKo</b> na kostce licznika blokady do <b>${name}</b>`,
  permissionGiven: () => 'pole <b>wyjazd</b> zaświeci',
  lineOccupied: 'strzałka „wyjazd” czerwona',
  blockIntro: (n) => `Kostki przy obu krańcach toru szlakowego to ${A('Eap', 'blokada liniowa Eap')} do ${n.LIPa} i do ${n.DEBa}. Na kostkach toru są strzałki z lampkami: <b>wyjazd</b> – mamy pozwolenie / nasz pociąg jest na szlaku, <b>wjazd</b> – sąsiad ma pozwolenie / jego pociąg jedzie do nas. Nad torem kostki przycisków z lampkami: <b>żąd.</b> – sąsiad żąda pozwolenia, <b>Ko</b> – pociąg sąsiada przybył, trzeba potwierdzić; wyżej liczniki doraźne.`,
  blockCommands: 'Przyciski na kostkach obok toru',
  blockSpecial: '',
  sectionsLocked: 'zaświecą',
  shuntEndTrack3: 'końca toru 3 (kT3 przy koźle)',
  shuntEndTm2: 'tarczy Tm2',
  shuntEndC2: 'semafora C2',
};
