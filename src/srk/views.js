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
    size: (cols, rows) => ({ w: cols * 40 + 24, h: rows * 40 + 24 + 30 }), // +30 px na pasek poleceń
    hint: 'pasek poleceń lub menu elementu · przebieg: początek, potem koniec · OPS / Esc = odwołaj',
    armHint: {
      point: () => '',
      derailer: () => '',
      signal: (a) => `${a.color === 'white' ? 'Przebieg manewrowy' : 'Przebieg pociągowy'} od ${a.id} – wskaż koniec przebiegu (semafor, tarczę lub szlak)`,
      group: () => '',
    },
    help: `<h2>Obsługa stanowiska komputerowego (zobrazowanie wg Ie-104)</h2>
      <p>Odcinki toru: <span class="sw g"></span> szary – wolny, <span class="sw grn"></span> zielony – utwierdzony w przebiegu pociągowym,
      <span class="sw y"></span> żółty – w przebiegu manewrowym, <span class="sw r"></span> czerwony – zajęty, <span class="sw v"></span> fioletowy – zwalnianie czasowe,
      podwójna szara linia – tor zamknięty. Zwrotnica: pole „Z” pokazuje położenie iglic (kreska przerywana, migająca – brak kontroli), „+” przy ramieniu zasadniczym,
      <span class="sw p"></span> różowy numer – zamknięcie indywidualne. Semafor: podwójny grot (tarcza manewrowa – pojedynczy): szary – stan podstawowy,
      zielony – sygnał zezwalający dla pociągu, żółty – zezwalający na manewry, czerwony – początek lub koniec utwierdzonego przebiegu, biały migający – sygnał zastępczy.
      Numery pociągów w czerwonych kasetkach. Niebieska ramka – element wybrany do polecenia, czerwona migająca – alarm.</p>
      <p><b>Polecenia</b>: pasek u góry ekranu – wybierz rodzaj (PRZEBIEG POCIĄGOWY, PRZEBIEG MANEWROWY, ZWOLNIJ PRZEBIEG, ZWROTNICA, STOP …), potem wskaż element(y):
      przebieg = sygnalizator początkowy, potem końcowy lub szlak. To samo daje menu po kliknięciu elementu. Polecenia specjalne (dPz, Sz, Zz, dPo, dKo) są inicjowane,
      potwierdzane „WYKONAJ” i rejestrowane w licznikach; <b>OPS</b>, Esc lub prawy przycisk odwołuje polecenie. Blokada liniowa: kliknij pole szlaku (Wbl, Poz, Ko, dPo, dKo).</p>`,
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
