import { lessonSteps } from '../lessons.js';
import { colouredSignal, RELEASE_E, DESK_BLOCK } from '../phrases.js';

/**
 * Misja 2 – pulpit kostkowy urządzeń przekaźnikowych typu E: obsługa dwuprzyciskowa, przyciski grupowe.
 * Własny słownik tekstów i własna lista kroków – zmiana tutaj nie dotyka innych misji.
 */
export const phrases = {
  ...DESK_BLOCK,
  view: 'pulpit',
  anchor: (cmdId, ref) => ref,
  signal: colouredSignal,
  release: RELEASE_E,
  releaseNames: 'STOP i Pz',
  trainRoute: (s, e, what) => `naciśnij <b>zielony przycisk</b> semafora <b>${s}</b>, a w ciągu 6 s ${what || `zielony przycisk semafora <b>${e}</b>`}`,
  trainRouteMenu: (s, e) => `naciśnij zielony przycisk semafora <b>${s}</b>, potem zielony przycisk semafora <b>${e}</b>`,
  trainRouteMenuTitle: 'Przebieg wjazdowy od B',
  trainRouteMenuLead: '',
  exitEnd: (name) => `<b>zielony przycisk końca przebiegu</b> na kostce wyjazdu na szlak do ${name}`,
  shuntRoute: (s, e) => `naciśnij <b>biały przycisk</b> semafora <b>${s}</b>, potem <b>biały przycisk</b> ${e}`,
  sz: (s) => `naciśnij przycisk grupowy <b>Sz</b>, a potem zielony przycisk semafora <b>${s}</b>`,
  colours: `Lampki na kostkach: <b>białe</b> – odcinek utwierdzony w przebiegu, <b>czerwone</b> – zajęty przez tabor, <b>żółte</b> przy zwrotnicy – jej położenie. Semafor to powtarzacz z przyciskiem zielonym (przebieg pociągowy) i białym (manewrowy). Przyciski grupowe u góry: Zw, Zz, Pz, dPz, Sz działają razem z drugim przyciskiem (obsługa dwuprzyciskowa).`,
  intro: `Przed Tobą <b>pulpit kostkowy</b> urządzeń przekaźnikowych typu E. Wszystko robi się przyciskami na kostkach: <b>naciśnięcie</b> = kliknięcie, <b>wyciągnięcie</b> = przytrzymanie pół sekundy lub prawy przycisk myszy. Większość operacji jest <b>dwuprzyciskowa</b>: pierwszy przycisk „uzbraja” (podświetla się), drugi wykonuje – masz na to 6 s.`,
  next: 'Teraz spróbuj prawdziwych stacji: Stare Pustkowie (typ E) albo Sopot i Gdynia (stanowiska komputerowe) – menu ☰ → Nowa zmiana.',
};

export default {
  id: 'pulpit',
  name: 'Misja 2 – pulpit kostkowy',
  view: 'pulpit',
  phrases,
  /** Kroki tej misji – własny zestaw: wspólne lekcje rozkładu i to, co misja dokłada lub zmienia. */
  steps() {
    return lessonSteps(phrases);
  },
};
