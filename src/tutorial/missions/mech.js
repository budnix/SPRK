import { infoStep as info, actStep as act, entry, atNeighbour, arrived, blockFree, active } from '../lessons.js';
import { A } from '../phrases.js';

/**
 * Misja 4 – nastawnia mechaniczna na stacji Olszyny. Własny scenariusz i własne kroki: pełna kolejność obsługi (dźwignie zwrotnic → drążek przebiegowy → blok przebiegowy → dźwignia
 * sygnałowa, po przejeździe dźwignia i drążek z powrotem), krzyżowanie z wykolejnicą ochronną, zwalniacz przy bloku
 * niezwolnionym przez pociąg (Instrukcja E16 §8–9).
 */
const lever = (id) => ({ ref: { kind: 'lever', id } });
const drazek = (id) => ({ ref: { kind: 'route', id } });
const block = (start) => ({ ref: { kind: 'routeblock', id: start } });
const pt = (sim, id) => sim.ilk.points.get(id);
const wk = (sim) => sim.ilk.derailers.get('Wk1');
const settled = (x, pos) => x.position === pos && !x.moving;
const route = (sim, id) => sim.ilk.active.get(id) || null;
const B = (sim, exit) => sim.blocks.get(exit);
const departed = (sim, nr) => entry(sim, nr)?.actualDep != null || atNeighbour(sim, nr);
const WIE = 'Wierzbna', GRA = 'Grabowca';
/** Pełna kolejność dla przebiegu pociągowego – krótko, gdy gracz już ją zna. */
const full = (sig, d, target) => `drążek <b>${d}</b> ${target}, klawisz bloku nad nim, dźwignia semafora <b>${sig}</b>`;
const back = (sig, d) => `po przejeździe: dźwignia <b>${sig}</b> w górę („Stój”), potem drążek <b>${d}</b> z powrotem (kliknij go jeszcze raz)`;

export function steps() {
  return [
    /* ---------------- wprowadzenie ---------------- */
    info('intro', 'Witaj w nastawni mechanicznej', `Przed Tobą <b>nastawnia mechaniczna</b> stacji Olszyny. U góry jest ${A('plan świetlny')}: pokazuje zajętość torów (czerwone szczeliny), powtarzacze semaforów i przyciski blokady liniowej. Nie ma na nim przycisków przebiegów.<p>Pod planem jest <b>ława</b>. Na dole ${A('dźwignia nastawcza', 'dźwignie nastawcze')} z numerami: niebieskie przestawiają zwrotnice i wykolejnicę, czerwone podają sygnał na semaforze. Wyżej ${A('drążek przebiegowy', 'drążki przebiegowe')} i okienka ${A('blok przebiegowy', 'bloków przebiegowych')}.</p><p>Na krokach z opisem zegar stoi. Kliknij <b>Dalej</b>, gdy przeczytasz.</p>`),
    info('layout', 'Stacja i ława', `Olszyny leżą na linii jednotorowej: w lewo do Wierzbna, w prawo do Grabowca. Tor <b>1</b> jest główny zasadniczy, tor <b>2</b> – główny dodatkowy, oba przy peronie. Od zachodu z toru 2 odchodzi bocznica – tor <b>4</b> z ${A('wykolejnica', 'wykolejnicą')} <b>Wk1</b>.<p>Dźwignie: <b>1, 2, 3</b> – zwrotnice 1, 2, 3; <b>4</b> – wykolejnica Wk1; <b>5–10</b> – semafory A, B, C1, C2, D1, D2; <b>11</b> – tarcza Tm1. Dźwignia w górze stoi w położeniu zasadniczym, w dole – przełożona.</p><p>Drążek <b>a</b> należy do semafora A: w górę – przebieg na tor 1 (do D1), w dół – na tor 2 (do D2). Tak samo drążek <b>b</b> semafora B.</p>`, { el: '#desk .lever-bench' }),

    /* ---------------- pierwszy pociąg: pełna kolejność ---------------- */
    info('block-intro', 'Blokada liniowa i blok przebiegowy', `Kostki przy lewym i prawym krańcu planu to ${A('Eap', 'blokada liniowa Eap')}: ${A('Poz')} – pozwolenie dla sąsiada, ${A('Ko')} – potwierdzenie przyjazdu, ${A('Wbl')} – żądanie pozwolenia na wyjazd.<p>Nad każdym drążkiem pociągowym jest okienko <b>bloku przebiegowego</b>: czerwone w położeniu zasadniczym, białe po zablokowaniu. Zablokowany blok zamyka drążek – cofnie go dopiero pociąg, który przejedzie.</p>`, { block: 'W' }),
    act('poz-8401', 'Danie pozwolenia (Poz)', `Wierzbno <b>żąda pozwolenia</b> dla osobowego <b>8401</b> (tor 1, przyjazd 07:05) – miga lampka „żąd.”. Naciśnij przycisk <b>Poz</b> na kostkach blokady przy lewym krańcu.`, { block: 'W' },
      (sim) => B(sim, 'W').direction === 'in' || arrived(sim, 8401),
      { tip: 'Żądanie przychodzi ok. 07:01. Jeśli go nie ma, przyspiesz czas (5×) w nagłówku.' }),
    act('route-8401', '1. Drążek przebiegowy', `Przełóż <b>drążek a w górę</b> (kliknij górną połowę drążka, przy napisie „D1”) – to ${A('przebieg pociągowy')} od semafora A na tor 1.<p>Drążek przełoży się tylko wtedy, gdy zwrotnice stoją tak, jak wymaga przebieg – tu zwrotnica 1 stoi już na „+”. Przełożony drążek zamyka zwrotnice przebiegu: pod dźwignią 1 pojawi się ciemna listwa. Dopóki nie zablokujesz bloku przebiegowego, drążek można cofnąć (kliknij go jeszcze raz).</p>`, drazek('A-D1'),
      (sim) => active(sim, 'A-D1') || arrived(sim, 8401),
      { wrong: (sim) => (active(sim, 'A-D2') ? 'To tor 2 (drążek w dół). Pociąg 8401 ma tor 1 – cofnij drążek i przełóż go w górę.' : null) }),
    act('block-8401', '2. Blok przebiegowy', `Naciśnij <b>klawisz bloku</b> nad drążkiem a. Okienko zmieni się z czerwonego na <b>białe</b>. Od tej chwili drążka nie cofniesz – zwolni go pociąg po przejeździe.`, block('A'),
      (sim) => !!route(sim, 'A-D1')?.blocked || arrived(sim, 8401)),
    act('signal-8401', '3. Dźwignia sygnałowa', `Przełóż <b>dźwignię 5</b> (semafor A, czerwona). Powtarzacz A na planie pokaże sygnał zezwalający. Bez zablokowanego bloku dźwignia sygnałowa by się nie przełożyła.`, lever('A'),
      (sim) => !!route(sim, 'A-D1')?.lever || arrived(sim, 8401)),
    act('watch-8401', 'Pociąg wjeżdża', `Obserwuj plan: zajęte odcinki są czerwone. Za pociągiem semafor A sam pokaże „Stój”, a gdy pociąg wjedzie w całości na tor 1 – okienko bloku wróci na <b>czerwone</b>: pociąg zwolnił blok.`, { el: '#speed' },
      (sim) => !!route(sim, 'A-D1')?.passed || (arrived(sim, 8401) && !active(sim, 'A-D1'))),
    act('back-8401', 'Dźwignia i drążek z powrotem', `Teraz porządek w odwrotnej kolejności: <b>dźwignia 5</b> w górę (semafor na „Stój”), potem <b>drążek a</b> z powrotem. Drążka nie cofniesz, dopóki dźwignia sygnałowa jest przełożona.`, lever('A'),
      (sim) => arrived(sim, 8401) && !active(sim, 'A-D1')),
    act('ko-8401', 'Potwierdzenie przyjazdu (Ko)', `Pociąg 8401 stoi przy peronie – potwierdź przyjazd przyciskiem <b>Ko</b> na blokadzie do ${WIE}.`, { block: 'W' },
      (sim) => arrived(sim, 8401) && blockFree(B(sim, 'W'))),
    act('out-8401', 'Wyjazd do Grabowca', `8401 odjeżdża o 07:06. Najpierw <b>Wbl</b> na blokadzie do ${GRA} (prawy kraniec) i poczekaj na pozwolenie. Potem ta sama kolejność: ${full('D1', 'd1', 'w górę')}.`, drazek('D1-E'),
      (sim) => departed(sim, 8401),
      { wrong: (sim) => (B(sim, 'E').request === 'ours' ? `Żądanie wysłane – czekaj na odpowiedź ${GRA}.` : null) }),
    act('back-8401-out', 'Po odjeździe', `Gdy pociąg opuści stację: dźwignia <b>9</b> (D1) w górę i drążek <b>d1</b> z powrotem.`, lever('D1'),
      (sim) => atNeighbour(sim, 8401) && !active(sim, 'D1-E')),

    /* ---------------- pociąg z przeciwnej strony ---------------- */
    act('in-8402', 'Pociąg z Grabowca', `Grabowiec zgłosi osobowy <b>8402</b> (tor 1, przyjazd 07:16): <b>Poz</b> na blokadzie po prawej, potem ${full('B', 'b', 'w górę (na tor 1)')}.`, drazek('B-C1'),
      (sim) => arrived(sim, 8402),
      { wrong: (sim) => (active(sim, 'B-C2') ? 'To tor 2 (drążek b w dół). 8402 ma tor 1 – cofnij drążek (przed blokowaniem wolno).' : null) }),
    act('after-8402', 'Po wjeździe', `${back('B (dźwignia 6)', 'b')}. Potem <b>Ko</b> na blokadzie do ${GRA}.`, lever('B'),
      (sim) => arrived(sim, 8402) && !active(sim, 'B-C1') && blockFree(B(sim, 'E'))),
    act('out-8402', 'Wyjazd do Wierzbna', `8402 odjeżdża o 07:17: <b>Wbl</b> do ${WIE}, ${full('C1', 'c1', '')}; ${back('C1', 'c1')}.`, drazek('C1-W'),
      (sim) => atNeighbour(sim, 8402) && !active(sim, 'C1-W')),

    /* ---------------- krzyżowanie: tor 2 i wykolejnica ochronna ---------------- */
    info('cross-intro', 'Krzyżowanie na torach 1 i 2', `O 07:30 przyjedzie <b>8403</b> z Wierzbna na tor <b>2</b>, a o 07:31 <b>8404</b> z Grabowca na tor <b>1</b> – ${A('krzyżowanie')}.<p>Przebieg na tor 2 wymaga: zwrotnicy 1 na „−” (dźwignia 1 przełożona), zwrotnicy 3 na „+” i <b>nałożonej</b> wykolejnicy Wk1 – ona chroni tor 2 od bocznicy. Drążek a sprawdzi je wszystkie.</p><p>Drogi ochronne za semaforami D2 i C1 kończą się na osobnych odcinkach, więc oba wjazdy mogą być nastawione naraz.</p>`, { el: '#desk' }),
    act('cross-points', 'Dźwignia dla toru 2', `Przełóż <b>dźwignię 1</b> (zwrotnica 1 na tor 2): kliknij ją – przechyli się do przodu, jest <b>przełożona</b>. Zwrotnica przestawi się w ok. 2 s, w tym czasie rękojeść świeci na żółto. Zwrotnica 3 i wykolejnica stoją już dobrze.<p>Dźwigni zwrotnicowej nie przełożysz, gdy na zwrotnicy stoi tabor albo zamyka ją drążek przebiegowy.</p>`, lever('Zw1'),
      (sim) => settled(pt(sim, 'Zw1'), '-') || arrived(sim, 8403)),
    act('cross-in', 'Dwa wjazdy', `Gdy sąsiedzi zgłoszą pociągi, daj <b>Poz</b> na obu blokadach i nastaw oba wjazdy: ${full('A', 'a', '<b>w dół</b> (tor 2)')} oraz ${full('B', 'b', 'w górę (tor 1)')}. Kolejność dowolna.`, drazek('A-D2'),
      (sim) => arrived(sim, 8403) && arrived(sim, 8404),
      { wrong: (sim) => (active(sim, 'A-D1') ? '8403 ma tor 2 – drążek a w dół. Tor 1 jest dla 8404.' : null) }),
    act('cross-back', 'Porządek po wjazdach', `Oba pociągi stoją. Dla każdego: dźwignia semafora w górę, drążek z powrotem, a na blokadach <b>Ko</b>.`, lever('A'),
      (sim) => !active(sim, 'A-D2') && !active(sim, 'B-C1') && blockFree(B(sim, 'W')) && blockFree(B(sim, 'E'))),
    act('cross-out', 'Dwa wyjazdy', `8403 odjeżdża o 07:32 z toru 2 do ${GRA} (dźwignia 2 – zwrotnica 2 na „−”, drążek <b>d2</b>), 8404 o 07:33 z toru 1 do ${WIE} (najpierw dźwignia 1 z powrotem na „+”, drążek <b>c1</b>). Dla obu: Wbl, blok, dźwignia sygnałowa, a po odjeździe – dźwignia i drążek z powrotem.`, drazek('D2-E'),
      (sim) => atNeighbour(sim, 8403) && atNeighbour(sim, 8404) && !active(sim, 'D2-E') && !active(sim, 'C1-W')),

    /* ---------------- usterka: pociąg nie zwalnia bloku przebiegowego ---------------- */
    info('fault-intro', 'Usterka: blok się nie zwolni', `Od 07:45 urządzenie oddziaływania za semaforem A (czujnik, przez który pociąg zwalnia blok) jest uszkodzone. W dzienniku pojawi się alarm.<p>Po wjeździe osobowego <b>8405</b> okienko bloku drążka a <b>zostanie białe</b> i drążka nie cofniesz. Wtedy dyżurny sprawdza, że pociąg z sygnałem końcowym minął miejsce końca pociągu, i używa <b>zwalniacza</b> – plombowanego przycisku obok klawisza bloku. Licznik zwalniacza zapisze to użycie; uzasadnione usterką nie kosztuje punktów.</p>`, { el: '#desk' }),
    act('fault-in', 'Wjazd 8405', `8405 z Wierzbna na tor 1 (przyjazd 07:52): <b>Poz</b>, zwrotnica 1 na „+” (dźwignia 1 w górze), ${full('A', 'a', 'w górę')}.`, drazek('A-D1'),
      (sim) => arrived(sim, 8405)),
    act('fault-release', 'Zwalniacz', `Pociąg stoi na torze 1, semafor A pokazuje „Stój”, ale okienko bloku jest białe. Przełóż dźwignię 5 w górę, a potem naciśnij <b>zwalniacz</b> (czerwona plomba obok klawisza bloku drążka a). Przebieg się zwolni, a licznik „zwalniacz” pokaże 00001.`, { ref: { kind: 'routerelease', id: 'A' } },
      (sim) => arrived(sim, 8405) && !active(sim, 'A-D1') && sim.ilk.counters.dPz >= 1,
      { wrong: (sim) => (route(sim, 'A-D1')?.lever ? 'Najpierw dźwignia 5 w górę – semafor na „Stój”.' : null) }),
    act('out-8405', 'Odjazd 8405', `<b>Ko</b> do ${WIE}, potem wyjazd do ${GRA} o 07:53: Wbl, ${full('D1', 'd1', 'w górę')}; ${back('D1', 'd1')}.`, drazek('D1-E'),
      (sim) => atNeighbour(sim, 8405) && !active(sim, 'D1-E')),
    act('out-8406', 'Ostatni pociąg – samodzielnie', `Osobowy <b>8406</b> z Grabowca na tor 1 (przyjazd 08:05, odjazd 08:06 do ${WIE}). Poprowadź go sam: pozwolenie, wjazd, porządek po wjeździe, Ko, Wbl, wyjazd i porządek po odjeździe.`, drazek('B-C1'),
      (sim) => atNeighbour(sim, 8406) && !active(sim, 'C1-W') && !active(sim, 'B-C1')),

    info('end', 'Koniec misji', `To wszystko: dźwignie zwrotnic i wykolejnicy, drążek przebiegowy, blok przebiegowy, dźwignia sygnałowa, powrót po przejeździe, krzyżowanie z wykolejnicą ochronną i zwalniacz przy usterce. Po „Dalej” zmiana się zakończy i pokaże się <b>raport zmiany</b>.<p>Opis obsługi jest w instrukcji pod przyciskiem „?”.</p>`, { el: '#btn-menu' }),
  ];
}

export default { id: 'mech', name: 'Misja 4 – nastawnia mechaniczna', view: 'lever', station: 'olszyny', steps };
