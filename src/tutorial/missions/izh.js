import { lessonSteps, withSteps, infoStep, actStep } from '../lessons.js';
import { A, DESK_BLOCK } from '../phrases.js';

/**
 * Misja 3 – pulpit ciemny urządzeń przekaźnikowych typu IZH-111: przycisk adresowy elementu i przycisk rozkazu.
 * Własny słownik tekstów i własna lista kroków: przed lekcjami rozkładu jest rozgrzewka z rozkazami, których rozkład
 * nie wymaga (+, −, STOP, Zw, Zcz). Scenariusz misji zaczyna się kilka minut wcześniej, żeby rozgrzewka zmieściła się
 * przed pierwszym pociągiem.
 */
export const phrases = {
  ...DESK_BLOCK,
  view: 'izh',
  // rozkaz Sz jest w grupie rozkazów; przebieg zaczyna się od przycisku adresowego na planie
  anchor: (cmdId, ref) => (cmdId === 'sz' ? { cmd: 'Sz' } : ref),
  signal: (id) => ({ ref: { kind: 'signal', id } }),
  release: (start, end) => `zwolnij przebieg (przycisk adresowy ${end} i rozkaz Zcz – zwolnienie trwa 120 s)`,
  releaseNames: 'STOP i Zcz',
  trainRoute: (s, e, what) => `naciśnij <b>przycisk adresowy</b> semafora <b>${s}</b>, potem ${what || `przycisk adresowy semafora <b>${e}</b>`}, a na końcu rozkaz <b>P</b> w grupie rozkazów nad planem – masz na to 10 s`,
  trainRouteMenu: (s, e) => `przycisk adresowy semafora <b>${s}</b>, przycisk adresowy semafora <b>${e}</b> i rozkaz <b>P</b>`,
  trainRouteMenuTitle: 'Przebieg wjazdowy od B',
  trainRouteMenuLead: '',
  exitEnd: (name) => `<b>przycisk adresowy końca toru</b> na kostce wyjazdu na szlak do ${name}`,
  shuntRoute: (s, e) => `naciśnij przycisk adresowy <b>${s}</b>, potem przycisk adresowy ${e}, a na końcu rozkaz <b>M</b>`,
  sz: (s) => `naciśnij przycisk adresowy semafora <b>${s}</b>, a potem rozkaz <b>Sz</b>`,
  colours: `To ${A('pulpit ciemny')}: w stanie zasadniczym lampki są zgaszone. Szczeliny toru świecą na <b>biało</b>, gdy odcinek jest utwierdzony w przebiegu, i na <b>czerwono</b>, gdy jest zajęty przez tabor. Położenie zwrotnicy widać po naciśnięciu jej przycisku adresowego. Powtarzacz semafora ma tylko lampkę zieloną i białą – <b>ciemny powtarzacz oznacza „Stój”</b>.`,
  intro: `Przed Tobą <b>pulpit urządzeń przekaźnikowych typu IZH-111</b>. Każdy element – semafor, tarcza, zwrotnica, koniec toru – ma jeden czarny ${A('przycisk adresowy')}, a nad planem jest grupa ${A('przycisk rozkazu', 'przycisków rozkazów')}: P, M, +, −, STOP, Zw, ${A('Zcz')}, Sz. Najpierw wskazujesz element przyciskiem adresowym (podświetli się), potem wybierasz rozkaz – masz na to 10 s. Ponowne naciśnięcie tego samego adresu odwołuje wybór.`,
  next: 'Teraz spróbuj pełnej zmiany na tym pulpicie: menu ☰ → Nowa zmiana → Szkolna → „Pełna zmiana – pulpit typu IZH-111”. Opis wszystkich rozkazów jest w instrukcji pod przyciskiem „?”.',
};

/** Zwrotnica do ćwiczeń: odgałęzienie toru 3 – do manewrów zdawczego nic przez nią nie jedzie. */
const POINT = 'Zw3';
const pointRef = { ref: { kind: 'point', id: POINT } };
const point = (sim) => sim.ilk.points.get(POINT);
/** Przebieg do ćwiczenia zwolnienia: wjazd od Dębna na tor 2 – pierwszy pociąg przyjeżdża od Lipna na tor 1. */
const ROUTE = 'B-C2';

/** Rozgrzewka: zwrotnica rozkazami „−”, STOP, Zw, „+” i zwolnienie czasowe przebiegu rozkazem Zcz. */
export function practiceSteps() {
  return [
    infoStep('izh-practice', 'Rozgrzewka przed pierwszym pociągiem', `Do pierwszego pociągu jest kilka minut. Przećwicz w tym czasie rozkazy, których sam rozkład nie wymaga: <b>−</b> i <b>+</b> (zwrotnica), <b>STOP</b> i <b>Zw</b> (zamknięcie zwrotnicy) oraz ${A('Zcz')} (zwolnienie przebiegu).<p>Ćwiczysz na <b>zwrotnicy 3</b> (odgałęzienie toru 3) i na wjeździe od Dębna. Pierwszy pociąg przyjedzie od Lipna na tor 1, więc niczemu to nie przeszkodzi. Po „Dalej” zegar ruszy.</p>`, { el: '.izh-orders' }),
    actStep('izh-point-minus', 'Zwrotnica: adres i rozkaz „−”', `Naciśnij <b>przycisk adresowy zwrotnicy 3</b> – szczeliny zaświecą i pokażą jej położenie (na pulpicie ciemnym widać je dopiero po wybraniu adresu). Potem naciśnij rozkaz <b>−</b>: zwrotnica przestawi się na tor zwrotny, trwa to ok. 4 s.<p>Rozkaz „+” ustawia położenie zasadnicze, „−” przełożone – podajesz położenie docelowe, a nie „przestaw”.</p>`, pointRef,
      (sim) => point(sim).position === '-' && !point(sim).moving),
    actStep('izh-point-stop', 'Zamknięcie zwrotnicy: STOP', `Przycisk adresowy zwrotnicy 3 i rozkaz <b>STOP</b>. Przy przycisku zapali się <b>czerwona lampka</b>, a szczeliny będą świecić na stałe. Zamkniętej zwrotnicy nie przestawi ani obsługa, ani przebieg.<p>Tak wybiera się też inny wariant drogi: zwrotnicę ustawia się i zamyka przed nastawieniem przebiegu.</p>`, { cmd: 'STOP' },
      (sim) => point(sim).individualLock),
    actStep('izh-point-zw', 'Odwołanie zamknięcia: Zw', `Przycisk adresowy zwrotnicy 3 i rozkaz <b>Zw</b>. Czerwona lampka zgaśnie, a szczeliny po chwili znów będą ciemne.`, { cmd: 'Zw' },
      (sim, ctx) => ctx.seen.has(`lock:${POINT}`) && !point(sim).individualLock,
      { wrong: (sim) => (point(sim).moving ? 'Zwrotnica jest zamknięta – rozkaz „+” i „−” nie zadziała, najpierw Zw.' : null) }),
    actStep('izh-point-plus', 'Z powrotem: rozkaz „+”', `Przywróć położenie zasadnicze: przycisk adresowy zwrotnicy 3 i rozkaz <b>+</b>.`, { cmd: '+' },
      (sim, ctx) => ctx.seen.has(`minus:${POINT}`) && point(sim).position === '+' && !point(sim).moving && !point(sim).individualLock),
    actStep('izh-zcz-route', 'Przebieg do ćwiczenia', `Teraz zwolnienie przebiegu. Najpierw nastaw przebieg, który zaraz zwolnisz – wjazd od Dębna na tor 2: ${phrases.trainRoute('B', 'C2')}.`, phrases.signal('B'),
      (sim, ctx) => sim.ilk.active.has(ROUTE) || ctx.seen.has(`route:${ROUTE}:released`),
      { wrong: (sim) => (sim.ilk.active.has('B-C1') ? 'To przebieg na tor 1 – będzie potrzebny pierwszemu pociągowi. Zwolnij go (przycisk adresowy C1 i rozkaz Zcz) i nastaw B → C2.' : null) }),
    actStep('izh-zcz', 'Zwolnienie czasowe: Zcz', `Naciśnij przycisk adresowy <b>semafora końcowego C2</b> i rozkaz <b>Zcz</b>. Uwaga: wskazujesz <b>koniec</b> przebiegu, nie początek.<p>Semafor B od razu zgaśnie, ale droga przebiegu zostanie utwierdzona jeszcze przez 120 s – tyle urządzenia dają pociągowi, który mógł już minąć semafor.</p>`, phrases.signal('C2'),
      (sim, ctx) => ctx.seen.has(`route:${ROUTE}:timed`) || ctx.seen.has(`route:${ROUTE}:released`)),
    actStep('izh-zcz-wait', 'Odliczanie 120 s', `Przy przycisku semafora C2 <b>miga biała lampka</b> – trwa zwalnianie czasowe. Odcinki drogi przebiegu nadal świecą na biało. Poczekaj, aż zgasną; możesz przyspieszyć czas przyciskiem <b>5×</b> w nagłówku.<p>Przebieg manewrowy zwalnia się inaczej: adres końca i rozkaz <b>Zw</b>, od razu.</p>`, { el: '#speed' },
      (sim, ctx) => ctx.seen.has(`route:${ROUTE}:released`) && !sim.ilk.active.has(ROUTE)),
  ];
}

export default {
  id: 'izh',
  name: 'Misja 3 – pulpit typu IZH-111',
  view: 'izh',
  phrases,
  /** Kroki tej misji – własny zestaw: rozgrzewka z rozkazami pulpitu, potem wspólne lekcje rozkładu. */
  steps() {
    return withSteps(lessonSteps(phrases), { after: { layout: practiceSteps() } });
  },
};
