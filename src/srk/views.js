/**
 * Warstwa UI strategii srk: dla każdego rodzaju stanowiska (`view` w rejestrze) – fabryka widoku,
 * rozmiar obrazu, podpowiedzi i fragment instrukcji. Rejestr (registry.js) nie zna DOM, więc
 * widoki są tu, a nie tam.
 */
import { DeskRenderer } from '../render/DeskRenderer.js';
import { ScreenRenderer } from '../render/ScreenRenderer.js';
import { getSrk } from './registry.js';

const VIEWS = {
  desk: {
    create: (container, sim, handlers, opts) => new DeskRenderer(container, sim, handlers, opts),
    size: (cols, rows) => ({ w: cols * 40 + 44, h: rows * 40 + 44 }),
    hint: 'kliknij = naciśnij · przytrzymaj / prawy przycisk = wyciągnij',
    armHint: {
      point: (a) => `Zwrotnica ${a.id} uzbrojona – naciśnij Zw (przestawienie) lub Zz (zamknięcie)`,
      derailer: (a) => `Wykolejnica ${a.id} uzbrojona – naciśnij Zw`,
      signal: (a) => `${a.color === 'white' ? 'Manewrowy' : 'Pociągowy'} początek przebiegu ${a.id} – naciśnij przycisk końca przebiegu`,
      group: (a) => ({
        'group-point': 'Zw – naciśnij przycisk zwrotnicy lub wykolejnicy',
        'point-lock': 'Zz – naciśnij przycisk zwrotnicy (zamknięcie/otwarcie)',
        'route-release': 'Pz – naciśnij przycisk sygnałowy przebiegu do zwolnienia',
        'emergency-release': 'dPz – naciśnij przycisk sygnałowy (zwolnienie doraźne, licznik!)',
        'substitute': 'Sz – naciśnij zielony przycisk semafora (sygnał zastępczy, licznik!)',
      })[a.role] || `${a.id} uzbrojony`,
    },
    help: `<h2>Obsługa pulpitu kostkowego (urządzenia typu E)</h2>
      <p><b>Naciśnięcie</b> przycisku – kliknięcie / dotknięcie. <b>Wyciągnięcie</b> – przytrzymanie (0,5 s) lub prawy przycisk myszy.
      Operacje dwuprzyciskowe: naciśnij pierwszy przycisk, a w ciągu 6 s drugi (przycisk „uzbrojony” jest podświetlony).</p>`,
  },
  screen: {
    create: (container, sim, handlers, opts) => new ScreenRenderer(container, sim, handlers, opts),
    size: (cols, rows) => ({ w: cols * 40 + 24, h: rows * 40 + 24 }),
    hint: 'kliknij element = menu poleceń · przebieg: początek, potem koniec · Esc / prawy przycisk = anuluj',
    armHint: {
      point: () => '',
      derailer: () => '',
      signal: (a) => `${a.color === 'white' ? 'Przebieg manewrowy' : 'Przebieg pociągowy'} od ${a.id} – wskaż koniec przebiegu (semafor, tarczę lub szlak)`,
      group: () => '',
    },
    help: `<h2>Obsługa stanowiska komputerowego</h2>
      <p>Obraz stanu na monitorze: tor <span class="sw g"></span> szary – wolny, <span class="sw grn"></span> zielony – utwierdzony w przebiegu pociągowym,
      <span class="sw y"></span> żółty – w przebiegu manewrowym, <span class="sw r"></span> czerwony – zajęty, niebieski przerywany – zamknięty.
      Zwrotnica: jasny leg = położenie, numer obok; kwadrat przy numerze = zamknięcie indywidualne. Semafor: kółko w kolorze sygnału, grot = kierunek jazdy.</p>
      <p><b>Polecenia</b> wydaje się z menu elementu (kliknięcie). Przebieg: „Przebieg pociągowy od A …”, potem kliknij semafor końcowy lub strzałkę szlaku.
      Polecenia specjalne (dPz, Sz, Zz, dPo, dKo) wymagają potwierdzenia „Wykonaj” i są rejestrowane w licznikach – tak jak plombowane przyciski na pulpicie.
      Blokada liniowa: kliknij pole szlaku (Wbl, Poz, Ko, dPo, dKo). Esc lub prawy przycisk anuluje rozpoczęte polecenie.</p>`,
  },
};

function viewOf(srk) {
  return VIEWS[srk?.view] || VIEWS.desk;
}

/** Tworzy widok stanowiska dla strategii (pulpit kostkowy lub monitor). */
export function createView(srk, container, sim, handlers, opts = {}) {
  return viewOf(srk).create(container, sim, handlers, opts);
}

export function viewSize(srk, cols, rows) {
  return viewOf(srk).size(cols, rows);
}

export function viewHint(srk) {
  return viewOf(srk).hint;
}

export function armHint(srk, a) {
  return viewOf(srk).armHint[a.kind]?.(a) ?? '';
}

export function viewHelp(srk) {
  return viewOf(srk).help;
}

/** Lista strategii do menu ustawień. */
export { getSrk };
