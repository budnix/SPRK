import { lessonSteps } from '../lessons.js';
import { A, colouredSignal, RELEASE_E } from '../phrases.js';

/**
 * Misja 1 – stanowisko komputerowe (monitor wg Ie-104): polecenia z paska poleceń i z menu elementu.
 * Własny słownik tekstów i własna lista kroków – zmiana tutaj nie dotyka innych misji.
 */
export const phrases = {
  view: 'monitor',
  anchor: (cmdId) => ({ cmd: cmdId }),
  signal: colouredSignal,
  release: RELEASE_E,
  releaseNames: 'Stój i ZCZ',
  indicator: 'napis',
  blockPress: (exit, name, btn) => `kliknij <b>strzałkę szlaku do ${name}</b> na krańcu toru i wybierz <b>${btn}</b>`,
  trainRoute: (s, e, what) => `na pasku poleceń wybierz <b>PRZEBIEG POCIĄGOWY</b>, kliknij semafor <b>${s}</b>, a potem ${what || `semafor <b>${e}</b>`}`,
  trainRouteMenu: (s, e) => `kliknij semafor <b>${s}</b> – otworzy się menu elementu – wybierz „Nastawienie przebiegu pociągowego od ${s} …”, a potem kliknij semafor <b>${e}</b>`,
  trainRouteMenuTitle: 'Przebieg z menu elementu',
  trainRouteMenuLead: 'Tym razem użyj menu elementu: ',
  exitEnd: (name) => `<b>strzałkę szlaku do ${name}</b> na krańcu toru`,
  shuntRoute: (s, e) => `<b>PRZEBIEG MANEWROWY</b> → semafor <b>${s}</b> (ma Ms2) → <b>${e}</b>`,
  shuntEndTrack3: 'koniec toru 3 (kT3, kółko przy koźle)',
  shuntEndTm2: 'tarczę Tm2',
  shuntEndC2: 'semafor C2',
  sectionsLocked: 'zżółkną',
  sz: (s) => `wybierz <b>Sz</b>, kliknij semafor <b>${s}</b> (tło obrazu poszarzeje, semafor dostanie pomarańczowe tło) i po 5 s potwierdź <b>WYKONAJ</b>`,
  dpo: (name) => `kliknij strzałkę szlaku do <b>${name}</b> → <b>dPo</b> → po 5 s <b>WYKONAJ</b>`,
  dko: (name) => `kliknij strzałkę szlaku do <b>${name}</b> → <b>dKo</b> → po 5 s <b>WYKONAJ</b>`,
  permissionGiven: (neighbour) => `nad torem pojawi się strzałka kierunku w stronę ${neighbour}`,
  lineOccupied: 'strzałka szlaku czerwona',
  blockIntro: (n) => `Stan ${A('Eap', 'blokady liniowej Eap')} do ${n.LIPa} i do ${n.DEBa} jest przy wyjazdach na szlak, na krańcach toru: <b>strzałka szlaku</b> (czerwona – odstęp zajęty przez pociąg), nad torem <b>strzałka kierunku</b> (w stronę sąsiada – mamy pozwolenie na wyjazd; do nas – sąsiad ma pozwolenie) oraz napis: <b>żąd.</b> – sąsiad żąda pozwolenia, <b>Wbl</b> – czekamy na pozwolenie, <b>Ko</b> – pociąg sąsiada przybył, trzeba potwierdzić.`,
  blockCommands: 'Na monitorze nie ma przycisków – <b>kliknij strzałkę szlaku</b>, a otworzy się menu z poleceniami',
  blockSpecial: 'potwierdzane WYKONAJ po 5 s, ',
  colours: `Odcinki toru: <b>szary</b> – wolny, <b>zielony</b> – utwierdzony w przebiegu pociągowym, <b>żółty</b> – w przebiegu manewrowym, <b>czerwony</b> – zajęty przez tabor, <b>różowy</b> – zwalnianie czasowe. Semafor: trójkąt (tarcza – otwarty grot); zielony – sygnał zezwalający, czerwony – początek/koniec utwierdzonego przebiegu. Zwrotnica: pole „Z” z kreską pokazującą położenie iglic, „+” przy torze zasadniczym.`,
  intro: `Przed Tobą <b>stanowisko komputerowe</b> – monitor z planem stacji (zobrazowanie wg ${A('Ie104', 'Ie-104')}, jak na stanowiskach EbiScreen / ISKRA). Polecenia wydajesz z <b>paska poleceń</b> nad planem (rodzaj polecenia, potem element) albo z <b>menu elementu</b> po kliknięciu semafora, zwrotnicy lub pola blokady.`,
  next: 'Misja 2 pokazuje inną stację – na linii dwutorowej – i pulpit kostkowy urządzeń typu E (menu ☰ → Nowa zmiana → Misja 2).',
};

export default {
  id: 'monitor',
  name: 'Misja 1 – stanowisko komputerowe',
  view: 'monitor',
  station: 'szkolna',
  phrases,
  /** Kroki tej misji: lekcje rozkładu stacji Szkolna – polecenia pojawiają się wtedy, gdy są potrzebne. */
  steps() {
    return lessonSteps(phrases);
  },
};
