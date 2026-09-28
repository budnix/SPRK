import { lessonSteps, withSteps, infoStep, actStep } from '../lessons.js';
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
  releaseNames: 'STOP i Pz',
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
  sz: (s) => `wybierz <b>Sz</b>, kliknij semafor <b>${s}</b> i potwierdź <b>WYKONAJ</b>`,
  dpo: (name) => `kliknij strzałkę szlaku do <b>${name}</b> → <b>dPo</b> → <b>WYKONAJ</b>`,
  permissionGiven: (neighbour) => `nad torem pojawi się strzałka kierunku w stronę ${neighbour}`,
  lineOccupied: 'strzałka szlaku czerwona',
  blockIntro: (n) => `Stan ${A('Eap', 'blokady liniowej Eap')} do ${n.LIPa} i do ${n.DEBa} jest przy wyjazdach na szlak, na krańcach toru: <b>strzałka szlaku</b> (czerwona – odstęp zajęty przez pociąg), nad torem <b>strzałka kierunku</b> (w stronę sąsiada – mamy pozwolenie na wyjazd; do nas – sąsiad ma pozwolenie) oraz napis: <b>żąd.</b> – sąsiad żąda pozwolenia, <b>Wbl</b> – czekamy na pozwolenie, <b>Ko</b> – pociąg sąsiada przybył, trzeba potwierdzić.`,
  blockCommands: 'Na monitorze nie ma przycisków – <b>kliknij strzałkę szlaku</b>, a otworzy się menu z poleceniami',
  blockSpecial: 'potwierdzane WYKONAJ, ',
  colours: `Odcinki toru: <b>szary</b> – wolny, <b>zielony</b> – utwierdzony w przebiegu pociągowym, <b>żółty</b> – w przebiegu manewrowym, <b>czerwony</b> – zajęty przez tabor, <b>fioletowy</b> – zwalnianie czasowe. Semafor: podwójny grot; zielony – sygnał zezwalający, czerwony – początek/koniec utwierdzonego przebiegu. Zwrotnica: pole „Z” z kreską pokazującą położenie iglic, „+” przy torze zasadniczym.`,
  intro: `Przed Tobą <b>stanowisko komputerowe</b> – monitor z planem stacji (zobrazowanie wg ${A('Ie104', 'Ie-104')}, jak na stanowiskach EbiScreen / ISKRA). Polecenia wydajesz z <b>paska poleceń</b> nad planem (rodzaj polecenia, potem element) albo z <b>menu elementu</b> po kliknięciu semafora, zwrotnicy lub pola blokady.`,
  next: 'Misja 2 pokazuje inną stację – na linii dwutorowej – i pulpit kostkowy urządzeń typu E (menu ☰ → Nowa zmiana → Misja 2).',
};

/** Zwrotnica do ćwiczeń: odgałęzienie toru 3 – pierwszy pociąg jedzie torem 1. */
const POINT = 'Zw3';
const point = (sim) => sim.ilk.points.get(POINT);
/** Przebieg do ćwiczeń: wjazd od Dębna na tor 2 – pierwszy pociąg przyjeżdża od Lipna na tor 1. */
const ROUTE = 'B-C2';
const bar = (cmd) => ({ cmd });

/** Rozgrzewka: polecenia paska, których rozkład nie wymaga – ZWROTNICA, Zz, STOP, ZWOLNIENIE PRZEBIEGU, OPS. */
export function practiceSteps() {
  return [
    infoStep('m-practice', 'Rozgrzewka przed pierwszym pociągiem', `Do pierwszego pociągu jest kilka minut. Przećwicz polecenia z paska, których sam rozkład nie wymaga: <b>ZWROTNICA</b>, ${A('Zz')}, ${A('STOP')}, <b>ZWOLNIENIE PRZEBIEGU</b> (${A('Pz')}) i ${A('OPS')}.<p>Ćwiczysz na <b>zwrotnicy 3</b> (odgałęzienie toru 3) i na wjeździe od Dębna. Pierwszy pociąg przyjedzie od Lipna na tor 1. Po „Dalej” zegar ruszy.</p>`, { el: '.scr-cmdbar' }),
    actStep('m-point', 'Polecenie ZWROTNICA', `Na pasku poleceń wybierz <b>ZWROTNICA</b>, a potem kliknij <b>zwrotnicę 3</b> na planie. Pole „Z” zamiga (brak kontroli w czasie przestawiania) i po ok. 4 s pokaże nowe położenie.<p>To samo da się zrobić z menu: kliknij zwrotnicę i wybierz „Przestawienie zwrotnicy”.</p>`, bar('zw'),
      (sim) => point(sim).position === '-' && !point(sim).moving),
    actStep('m-lock', 'Polecenie specjalne: Zz', `Wybierz <b>Zz</b>, kliknij zwrotnicę 3 i potwierdź <b>WYKONAJ</b>. Numer zwrotnicy zrobi się <b>różowy</b> – zwrotnica jest zamknięta indywidualnie i nie przestawi jej ani obsługa, ani przebieg.<p>Polecenia specjalne (pomarańczowe na pasku) zawsze wymagają potwierdzenia i są rejestrowane.</p>`, bar('zz'),
      (sim) => point(sim).individualLock),
    actStep('m-ops', 'Odwołanie polecenia: OPS', `Wybierz <b>Zz</b> i kliknij zwrotnicę 3, ale zamiast WYKONAJ kliknij <b>OPS – odwołaj</b>. Nic się nie zmieni: zwrotnica zostaje zamknięta. OPS (albo klawisz Esc) odwołuje każde rozpoczęte polecenie.<p>Potem otwórz zamknięcie naprawdę: <b>Zz</b> → zwrotnica 3 → <b>WYKONAJ</b>, i przywróć położenie zasadnicze poleceniem <b>ZWROTNICA</b>.</p>`, bar('ops'),
      (sim, ctx) => ctx.seen.has(`lock:${POINT}`) && !point(sim).individualLock && point(sim).position === '+' && !point(sim).moving),
    actStep('m-route', 'Przebieg do ćwiczenia', `Nastaw przebieg, na którym przećwiczysz STOP i zwolnienie – wjazd od Dębna na tor 2: ${phrases.trainRoute('B', 'C2')}. Odcinki zrobią się <b>zielone</b>.`, bar('train'),
      (sim, ctx) => sim.ilk.active.has(ROUTE) || ctx.seen.has(`route:${ROUTE}:released`),
      { wrong: (sim) => (sim.ilk.active.has('B-C1') ? 'To przebieg na tor 1 – będzie potrzebny pierwszemu pociągowi. Zwolnij go (ZWOLNIENIE PRZEBIEGU → B) i nastaw B → C2.' : null) }),
    actStep('m-stop', 'Polecenie STOP', `Wybierz <b>STOP</b> i kliknij semafor <b>B</b>. Semafor wróci na „Stój”, ale przebieg <b>zostaje utwierdzony</b> – odcinki nadal są zielone. Tak zatrzymuje się pociąg przed semaforem bez rozbierania drogi.`, bar('stop'),
      (sim, ctx) => !!sim.ilk.active.get(ROUTE)?.signalOff || ctx.seen.has(`route:${ROUTE}:released`)),
    actStep('m-pz', 'Zwolnienie przebiegu', `Wybierz <b>ZWOLNIENIE PRZEBIEGU</b> i kliknij semafor <b>B</b>. Odcinki wrócą do szarego.<p>Gdyby pociąg był już na odcinku zbliżania, zwolnienie trwałoby 90 s, a odcinki byłyby w tym czasie <b>fioletowe</b>. Natychmiast zwalnia tylko ${A('dPz')} – polecenie specjalne na wypadek usterki, liczone i punktowane ujemnie.</p>`, bar('pz'),
      (sim, ctx) => ctx.seen.has(`route:${ROUTE}:released`) && !sim.ilk.active.has(ROUTE)),
  ];
}

export default {
  id: 'monitor',
  name: 'Misja 1 – stanowisko komputerowe',
  view: 'monitor',
  station: 'szkolna',
  phrases,
  /** Kroki tej misji – własny zestaw: rozgrzewka z poleceniami paska, potem lekcje rozkładu stacji Szkolna. */
  steps() {
    return withSteps(lessonSteps(phrases), { after: { layout: practiceSteps() } });
  },
};
