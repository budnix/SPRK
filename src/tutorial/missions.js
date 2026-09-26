/**
 * Misje wprowadzające (samouczek) – definicje kroków, bez DOM.
 *
 * Krok: { id, title, text (HTML; skróty jako <abbr data-term="Poz">Poz</abbr>), anchor, info?, done?, wrong?, tip? }
 *  - `info`  – krok informacyjny: zegar stoi, gracz klika „Dalej”;
 *  - `done(sim, ctx)` – warunek zaliczenia kroku (stan symulacji + ctx.seen ze zdarzeń szyny);
 *  - `wrong(sim, ctx)` – komunikat, gdy gracz zrobił coś innego (opcjonalnie);
 *  - `anchor` – gdzie wskazać dymkiem: { ref } (element pulpitu/monitora), { block:'W' }, { cmd:'train' } (pasek poleceń),
 *               { el:'#css' } (element strony), { tab:'stan' } (zakładka panelu bocznego).
 *
 * Ta sama lista kroków obsługuje dwa stanowiska (`view`: 'monitor' | 'pulpit') – różnią się tylko teksty
 * i miejsca wskazywane.
 */

const A = (term, label = term) => `<abbr data-term="${term}">${label}</abbr>`;
const sig = (id, color = 'green') => ({ ref: { kind: 'signal', id, color } });

function entry(sim, nr) { return sim.traffic.timetable().find((e) => String(e.nr) === String(nr)); }
function atNeighbour(sim, nr) { return entry(sim, nr)?.status === 'na następnym posterunku'; }
function arrived(sim, nr) { const e = entry(sim, nr); return !!e && e.actualArr != null; }
function blockFree(b) { return !b.koPending && !b.occupied && b.direction == null && !b.poBlocked; }
function active(sim, id) { return sim.ilk.active.has(id); }

/** Teksty zależne od stanowiska. */
function phrases(view) {
  const m = view === 'monitor';
  return {
    view: m ? 'monitor' : 'pulpit',
    // `name` w dopełniaczu („Lipna”, „Dębna”)
    blockPress: (exit, name, btn) => m
      ? `kliknij <b>strzałkę szlaku do ${name}</b> na krańcu toru i wybierz <b>${btn}</b>`
      : `naciśnij przycisk <b>${btn}</b> na kostkach blokady przy końcu toru szlakowego do <b>${name}</b> (lewy / prawy kraniec pulpitu)`,
    trainRoute: (s, e, what) => m
      ? `na pasku poleceń wybierz <b>PRZEBIEG POCIĄGOWY</b>, kliknij semafor <b>${s}</b>, a potem ${what || `semafor <b>${e}</b>`}`
      : `naciśnij <b>zielony przycisk</b> semafora <b>${s}</b>, a w ciągu 6 s ${what || `zielony przycisk semafora <b>${e}</b>`}`,
    trainRouteMenu: (s, e) => m
      ? `kliknij semafor <b>${s}</b> – otworzy się menu elementu – wybierz „Nastawienie przebiegu pociągowego od ${s} …”, a potem kliknij semafor <b>${e}</b>`
      : `naciśnij zielony przycisk semafora <b>${s}</b>, potem zielony przycisk semafora <b>${e}</b>`,
    req: (name) => `gdy ${name} zgłosi pociąg – zamiga ${m ? 'napis' : 'lampka'} „żąd.”`,
    exitEnd: (name) => m ? `<b>strzałkę szlaku do ${name}</b> na krańcu toru` : `<b>zielony przycisk końca przebiegu</b> na kostce wyjazdu na szlak do ${name}`,
    shuntRoute: (s, e) => m
      ? `<b>PRZEBIEG MANEWROWY</b> → semafor <b>${s}</b> (ma Ms2) → <b>${e}</b>`
      : `naciśnij <b>biały przycisk</b> semafora <b>${s}</b>, potem <b>biały przycisk</b> ${e}`,
    sz: (s) => m ? `wybierz <b>Sz</b>, kliknij semafor <b>${s}</b> i potwierdź <b>WYKONAJ</b>` : `naciśnij przycisk grupowy <b>Sz</b>, a potem zielony przycisk semafora <b>${s}</b>`,
    dpo: (name) => m ? `kliknij strzałkę szlaku do <b>${name}</b> → <b>dPo</b> → <b>WYKONAJ</b>` : `naciśnij <b>dPo</b> na kostce licznika blokady do <b>${name}</b>`,
    colours: m
      ? `Odcinki toru: <b>szary</b> – wolny, <b>zielony</b> – utwierdzony w przebiegu pociągowym, <b>żółty</b> – w przebiegu manewrowym, <b>czerwony</b> – zajęty przez tabor, <b>fioletowy</b> – zwalnianie czasowe. Semafor: podwójny grot; zielony – sygnał zezwalający, czerwony – początek/koniec utwierdzonego przebiegu. Zwrotnica: pole „Z” z kreską pokazującą położenie iglic, „+” przy torze zasadniczym.`
      : `Lampki na kostkach: <b>białe</b> – odcinek utwierdzony w przebiegu, <b>czerwone</b> – zajęty przez tabor, <b>żółte</b> przy zwrotnicy – jej położenie. Semafor to powtarzacz z przyciskiem zielonym (przebieg pociągowy) i białym (manewrowy). Przyciski grupowe u góry: Zw, Zz, Pz, dPz, Sz działają razem z drugim przyciskiem (obsługa dwuprzyciskowa).`,
    intro: m
      ? `Przed Tobą <b>stanowisko komputerowe</b> – monitor z planem stacji (zobrazowanie wg ${A('Ie104', 'Ie-104')}, jak na stanowiskach EbiScreen / ISKRA). Polecenia wydajesz z <b>paska poleceń</b> nad planem (rodzaj polecenia, potem element) albo z <b>menu elementu</b> po kliknięciu semafora, zwrotnicy lub pola blokady.`
      : `Przed Tobą <b>pulpit kostkowy</b> urządzeń przekaźnikowych typu E. Wszystko robi się przyciskami na kostkach: <b>naciśnięcie</b> = kliknięcie, <b>wyciągnięcie</b> = przytrzymanie pół sekundy lub prawy przycisk myszy. Większość operacji jest <b>dwuprzyciskowa</b>: pierwszy przycisk „uzbraja” (podświetla się), drugi wykonuje – masz na to 6 s.`,
  };
}

/**
 * Kroki misji dla stacji Szkolna. `view`: 'monitor' (misja 1) lub 'pulpit' (misja 2).
 */
export function missionSteps(view) {
  const P = phrases(view);
  const m = view === 'monitor';
  const cmd = (id, ref) => (m ? { cmd: id } : ref);
  const LIP = 'Lipno', DEB = 'Dębno';            // mianownik: „Lipno żąda…”
  const LIPa = 'Lipna', DEBa = 'Dębna';           // dopełniacz: „od Lipna”, „do Dębna”, „z Lipna”, „dla Dębna”
  const blockW = { block: 'W' }, blockE = { block: 'E' };
  const steps = [];
  const info = (id, title, text, anchor = null) => steps.push({ id, title, text, anchor, info: true });
  const act = (id, title, text, anchor, done, extra = {}) => steps.push({ id, title, text, anchor, done, ...extra });

  /* ---------------- wprowadzenie ---------------- */
  info('intro', 'Witaj na stacji Szkolna', `${P.intro}<p>Jesteś <b>dyżurnym ruchu</b>: przyjmujesz i wyprawiasz pociągi tak, by jechały bezpiecznie i punktualnie. Linia jest <b>jednotorowa</b> – w obie strony jeździ się tym samym ${A('tor szlakowy', 'torem szlakowym')}, dlatego z sąsiadami (${LIP} na zachodzie, ${DEB} na wschodzie) uzgadnia się każdy pociąg przez ${A('Eap', 'blokadę liniową Eap')}.</p><p>Na krokach z opisem zegar stoi. Kliknij <b>Dalej</b>, gdy przeczytasz. Skróty z kropkowanym podkreśleniem mają wyjaśnienie – kliknij je.</p>`);
  info('layout', 'Plan stacji', `Tor <b>1</b> i <b>2</b> mają perony (szare prostokąty), tor <b>3</b> to bocznica z kozłem oporowym i ${A('wykolejnica', 'wykolejnicą')} Wk1. ${A('semafor', 'Semafory')} wjazdowe: <b>A</b> (od ${LIPa}) i <b>B</b> (od ${DEBa}); wyjazdowe: <b>C1, C2</b> (na zachód) i <b>D1, D2</b> (na wschód). <b>Tm1, Tm2</b> to ${A('Tm', 'tarcze manewrowe')}.<p>${P.colours}</p>`, { el: '#desk' });
  info('block-intro', 'Blokada liniowa', `${m
    ? `Stan ${A('Eap', 'blokady liniowej Eap')} do ${LIPa} i do ${DEBa} jest przy wyjazdach na szlak, na krańcach toru: <b>strzałka szlaku</b> (czerwona – odstęp zajęty przez pociąg), nad torem <b>strzałka kierunku</b> (w stronę sąsiada – mamy pozwolenie na wyjazd; do nas – sąsiad ma pozwolenie) oraz napis: <b>żąd.</b> – sąsiad żąda pozwolenia, <b>Wbl</b> – czekamy na pozwolenie, <b>Ko</b> – pociąg sąsiada przybył, trzeba potwierdzić.`
    : `Kostki przy obu krańcach toru szlakowego to ${A('Eap', 'blokada liniowa Eap')} do ${LIPa} i do ${DEBa}. Na kostkach toru są strzałki z lampkami: <b>wyjazd</b> – mamy pozwolenie / nasz pociąg jest na szlaku, <b>wjazd</b> – sąsiad ma pozwolenie / jego pociąg jedzie do nas. Nad torem kostki przycisków z lampkami: <b>żąd.</b> – sąsiad żąda pozwolenia, <b>Ko</b> – pociąg sąsiada przybył, trzeba potwierdzić; wyżej liczniki doraźne.`}<p>${m ? 'Na monitorze nie ma przycisków – <b>kliknij strzałkę szlaku</b>, a otworzy się menu z poleceniami' : 'Przyciski na kostkach obok toru'}: ${A('Wbl')} – żądanie pozwolenia dla naszego pociągu, ${A('Poz')} – danie pozwolenia sąsiadowi, ${A('Ko')} – zwolnienie bloku końcowego po przyjeździe pociągu w całości; ${A('dPo')} i ${A('dKo')} – doraźne zwolnienia (tylko przy usterce, ${m ? 'potwierdzane WYKONAJ, ' : ''}liczniki).</p><p>Po „Dalej” zegar ruszy – ${LIP} zaraz zgłosi pierwszy pociąg.</p>`, blockW);

  /* ---------------- pociąg 1: 6101 z Lipna, tor 1, dalej do Dębna ---------------- */
  act('poz-6101', 'Danie pozwolenia (Poz)', `${LIP} <b>żąda pozwolenia</b> na wyprawienie pociągu <b>6101</b> (osobowy, planowo tor 1, przyjazd 07:06) – miga ${m ? 'napis' : 'lampka'} „żąd.”, w dzienniku jest komunikat. Daj pozwolenie: ${P.blockPress('W', LIPa, 'Poz')}.<p>To jest właśnie ${A('Poz')}: dopiero po nim sąsiad może wyprawić pociąg w naszą stronę. Kierunek blokady ustawia się na <b>wjazd</b>.</p>`, blockW,
    (sim) => sim.blocks.get('W').direction === 'in' || arrived(sim, 6101), { tip: 'Żądanie pojawia się chwilę po starcie zegara. Jeśli go nie widać – odczekaj kilka sekund.' });
  act('route-6101', 'Przebieg wjazdowy na tor 1', `Pociąg jest w drodze. Nastaw ${A('przebieg pociągowy')} od semafora wjazdowego <b>A</b> na tor 1, czyli do semafora wyjazdowego <b>D1</b>: ${P.trainRoute('A', 'D1')}.<p>Zwrotnica 1 ustawi się sama, odcinki zostaną ${A('utwierdzenie', 'utwierdzone')} i semafor A poda sygnał zezwalający.</p>`, cmd('train', sig('A')),
    (sim) => active(sim, 'A-D1') || arrived(sim, 6101),
    { wrong: (sim) => (active(sim, 'A-D2') ? 'To przebieg na tor 2. Pociąg 6101 ma tor 1 – zwolnij przebieg (ZWOLNIJ PRZEBIEG / Pz + A) i nastaw A → D1.' : null) });
  act('watch-6101', 'Pociąg wjeżdża', `Obserwuj: zajęte odcinki są <b>czerwone</b>, a za pociągiem przebieg rozwiązuje się odcinkowo. Pociąg zatrzyma się przy peronie toru 1 (przyjazd planowy 07:06). Możesz przyspieszyć czas przyciskami <b>2×</b>, <b>5×</b> w nagłówku.`, { el: '#speed' },
    (sim) => arrived(sim, 6101));
  act('ko-6101', 'Zwolnienie bloku końcowego (Ko)', `Pociąg 6101 jest w całości na stacji – na blokadzie do ${LIPa} miga ${m ? 'napis' : 'lampka'} <b>Ko</b>. Zwolnij blok końcowy, potwierdzając sąsiadowi przyjazd: ${P.blockPress('W', LIPa, 'Ko')}.<p>${A('Ko')} zwalnia blokadę: szlak do ${LIPa} jest znów wolny dla następnych pociągów.</p>`, blockW,
    (sim) => blockFree(sim.blocks.get('W')));
  act('wbl-6101', 'Żądanie pozwolenia (Wbl)', `6101 odjeżdża o 07:08 do ${DEBa}. Zanim nastawisz przebieg wyjazdowy, musisz mieć <b>pozwolenie</b> od ${DEBa}: ${P.blockPress('E', DEBa, 'Wbl')}. Sąsiad odpowie po kilkunastu sekundach – ${m ? 'nad torem pojawi się strzałka kierunku w stronę ' + DEB : 'pole <b>wyjazd</b> zaświeci'}.<p>To jest ${A('Wbl')} – lustrzane odbicie Poz, które dawałeś przed chwilą.</p>`, blockE,
    (sim) => { const b = sim.blocks.get('E'); return (b.direction === 'out' && b.permission) || atNeighbour(sim, 6101); },
    { wrong: (sim) => (sim.blocks.get('E').request === 'ours' ? 'Żądanie wysłane – czekaj na odpowiedź Dębna.' : null) });
  act('out-6101', 'Przebieg wyjazdowy na szlak', `Masz pozwolenie. Nastaw ${A('przebieg pociągowy')} wyjazdowy: ${P.trainRoute('D1', null, P.exitEnd(DEBa))}.<p>Przebieg wyjazdowy kończy się na szlaku, nie na semaforze – dlatego wskazujesz kraniec toru.</p>`, cmd('train', sig('D1')),
    (sim) => active(sim, 'D1-E') || atNeighbour(sim, 6101));
  act('depart-6101', 'Odjazd i blok początkowy', `Semafor D1 pokazuje sygnał zezwalający; pociąg odjedzie o 07:08. Po wyjeździe na szlak ${A('Po', 'blok początkowy')} zablokuje się (${m ? 'strzałka szlaku czerwona' : 'strzałka „wyjazd” czerwona'}), aż ${DEB} potwierdzi przyjazd. Poczekaj, aż 6101 dojedzie do następnego posterunku – szlak zwolni się sam.`, blockE,
    (sim) => atNeighbour(sim, 6101) && !sim.blocks.get('E').occupied);

  /* ---------------- pociąg 2: 6102 z Dębna, tor 1, dalej do Lipna (menu elementu) ---------------- */
  act('poz-6102', 'Pociąg z drugiej strony', `Zaraz ${DEB} zażąda pozwolenia dla pociągu <b>6102</b> (tor 1, przyjazd 07:17) – zamiga ${m ? 'napis' : 'lampka'} „żąd.”. Wtedy: ${P.blockPress('E', DEBa, 'Poz')}.`, blockE,
    (sim) => sim.blocks.get('E').direction === 'in' || arrived(sim, 6102));
  act('route-6102', m ? 'Przebieg z menu elementu' : 'Przebieg wjazdowy od B', `Wjazd od ${DEBa} prowadzi semafor <b>B</b>, tor 1 kończy semafor <b>C1</b>. ${m ? 'Tym razem użyj menu elementu: ' : ''}${P.trainRouteMenu('B', 'C1')}.`, sig('B'),
    (sim) => active(sim, 'B-C1') || arrived(sim, 6102),
    { wrong: (sim) => (active(sim, 'B-C2') ? 'To tor 2. Zwolnij przebieg B i nastaw B → C1.' : null) });
  act('ko-6102', 'Ko i Wbl w drugim kierunku', `Po przyjeździe 6102: zwolnij blok końcowy (${P.blockPress('E', DEBa, 'Ko')}), a potem zażądaj pozwolenia od ${LIPa} (${P.blockPress('W', LIPa, 'Wbl')}) – odjazd 07:19.`, blockE,
    (sim) => { const w = sim.blocks.get('W'); return blockFree(sim.blocks.get('E')) && w.direction === 'out' && w.permission; });
  act('out-6102', 'Wyjazd do Lipna', `${P.trainRoute('C1', null, P.exitEnd(LIPa))}. Poczekaj na odjazd i dojazd do ${LIPa}.`, cmd('train', sig('C1')),
    (sim) => atNeighbour(sim, 6102) && !sim.blocks.get('W').occupied);

  /* ---------------- pociąg 3: 42101 przelot ---------------- */
  act('passing-42101', 'Przelot towarowego', `Pociąg towarowy <b>42101</b> jedzie z ${LIPa} do ${DEBa} <b>bez zatrzymania</b> (${A('przelot')}, 07:29). Przygotuj całą drogę zawczasu: <b>Poz</b> dla ${LIPa} (${P.req(LIP)}), <b>Wbl</b> do ${DEBa}, przebieg <b>A → D1</b> i przebieg <b>D1 → szlak do ${DEBa}</b>.<p>Gdy oba przebiegi są nastawione, semafor A pokaże sygnał zezwalający bez ograniczeń (S2), a nie „następny semafor Stój” (S5) – pociąg nie będzie zwalniał.</p>`, blockW,
    (sim, ctx) => (active(sim, 'A-D1') && active(sim, 'D1-E')) || atNeighbour(sim, 42101) || ctx.seen.has('step:passing-42101'),
    { tip: 'Kolejność: Poz (Lipno) → A → D1, potem Wbl (Dębno) → D1 → szlak do Dębna.' });
  act('after-42101', 'Ko po przelocie', `Gdy 42101 minie stację w całości: ${P.blockPress('W', LIPa, 'Ko')}. Poczekaj, aż dojedzie do ${DEBa}.`, blockW,
    (sim) => atNeighbour(sim, 42101) && blockFree(sim.blocks.get('W')) && !sim.blocks.get('E').occupied);

  /* ---------------- krzyżowanie: 6103 (tor 2) i 6104 (tor 1) ---------------- */
  info('crossing-intro', 'Krzyżowanie', `Zaraz przyjadą dwa pociągi naprzeciw siebie: <b>6103</b> z ${LIPa} (07:40, tor <b>2</b>) i <b>6104</b> z ${DEBa} (07:41, tor <b>1</b>). To ${A('krzyżowanie')} – każdy musi stanąć na innym torze, bo dalej pojadą tym samym torem szlakowym.<p>Zwrotnica 1 dla 6103 ustawi się na tor zwrotny (prędkość 40 km/h). Obsłuż oba pozwolenia i oba przebiegi – drugi dopiero, gdy pierwszy pociąg minie zwrotnicę 1.</p>`, { el: '#desk' });
  act('cross-poz', 'Dwa pozwolenia', `Daj ${A('Poz')} na obu blokadach: ${LIP} i ${DEB} – każdemu, gdy zgłosi swój pociąg (miga ${m ? 'napis' : 'lampka'} „żąd.”).`, blockW,
    (sim) => (sim.blocks.get('W').direction === 'in' || arrived(sim, 6103)) && (sim.blocks.get('E').direction === 'in' || arrived(sim, 6104)));
  act('cross-routes', 'Dwa przebiegi', `Nastaw <b>A → D2</b> (6103 na tor 2). Przebieg <b>B → C1</b> (6104 na tor 1) urządzenia odrzucą, dopóki zwrotnica 1 jest utwierdzona w przebiegu na tor 2: ${A('droga ochronna')} za semaforem C1 leży właśnie na zwrotnicy 1. Nastaw go, gdy 6103 minie zwrotnicę i odcinek Iz1 się zwolni – 6104 chwilę poczeka przed semaforem B, to normalne przy krzyżowaniu.`, sig('A'),
    (sim, ctx) => (ctx.seen.has('route:A-D2:set') || arrived(sim, 6103)) && (ctx.seen.has('route:B-C1:set') || arrived(sim, 6104)),
    { wrong: (sim) => (active(sim, 'A-D1') ? '6103 ma jechać na tor 2 (A → D2) – tor 1 potrzebny dla 6104.' : null) });
  act('cross-out', 'Wyprawienie obu pociągów', `Po przyjeździe obu: <b>Ko</b> na obu blokadach, <b>Wbl</b> w obu kierunkach, przebiegi <b>D2 → szlak do ${DEBa}</b> (odjazd 07:43) i <b>C1 → szlak do ${LIPa}</b> (07:44). Pamiętaj: Wbl da się dopiero, gdy szlak jest wolny i blokada nie ma kierunku – najpierw Ko.`, blockE,
    (sim) => atNeighbour(sim, 6103) && atNeighbour(sim, 6104) && !sim.blocks.get('W').occupied && !sim.blocks.get('E').occupied);

  /* ---------------- 90201 zdawczy: kończy bieg, manewry na tor 3, powrót jako 90202 ---------------- */
  info('shunt-intro', 'Pociąg zdawczy', `O 07:52 przyjedzie ${A('pociąg zdawczy')} <b>90201</b> z ${LIPa} na tor <b>2</b> i tam <b>zakończy bieg</b>. Jego skład trzeba odstawić manewrami na tor 3, a o 08:12 wyprawić z powrotem do ${LIPa} jako pociąg <b>90202</b>. Zadania są w zakładce <b>Stan</b>.`, { tab: 'stan' });
  act('in-90201', 'Przyjęcie zdawczego', `Gdy ${LIP} zgłosi zdawczy (zamiga ${m ? 'napis' : 'lampka'} „żąd.”): <b>Poz</b>, przebieg <b>A → D2</b>, po przyjeździe <b>Ko</b>.`, blockW,
    (sim) => arrived(sim, 90201) && blockFree(sim.blocks.get('W')),
    { tip: `${LIP} zażąda pozwolenia dopiero, gdy 6104 tam dojedzie i szlak się zwolni – kilka minut po jego odjeździe. Do tego czasu Poz nie zadziała.`,
      wrong: (sim) => (active(sim, 'A-D1') ? 'Zdawczy ma tor 2 (A → D2).' : null) });
  act('shunt-mode', 'Jazda manewrowa', `Skład stoi na torze 2 i zakończył bieg. Przełącz go w ${A('jazda manewrowa', 'jazdę manewrową')}: zakładka <b>Stan</b> → Manewry → przycisk <b>„jazda manewrowa”</b> przy pociągu 90201.`, { tab: 'stan' },
    (sim) => entry(sim, 90201)?.train?.mode === 'shunt');
  act('shunt-route', 'Przebieg manewrowy na tor 3', `Nastaw ${A('przebieg manewrowy')} z semafora <b>D2</b> (ma ${A('Ms2')}) na koniec toru 3: ${P.shuntRoute('D2', m ? 'koniec toru 3 (kT3, kółko przy koźle)' : 'końca toru 3 (kT3 przy koźle)')}. Zwrotnica 3 ustawi się na tor 3, ${A('wykolejnica')} Wk1 zdejmie się sama, odcinki ${m ? 'zżółkną' : 'zaświecą'}, a D2 pokaże Ms2. Skład ruszy sam.`, cmd('shunt', sig('D2', 'white')),
    (sim) => active(sim, 'D2-kT3m') || sim.traffic.tasks.find((t) => t.id === 'odstaw-90201')?.done);
  act('shunt-task1', 'Skład na torze 3', `Poczekaj, aż cały skład stanie na torze 3 – zadanie w zakładce Stan zostanie odhaczone.`, { tab: 'stan' },
    (sim) => !!sim.traffic.tasks.find((t) => t.id === 'odstaw-90201')?.done);
  act('shunt-reverse', 'Zmiana czoła', `Skład ma wrócić na tor 2 w drugą stronę: zakładka <b>Stan</b> → <b>„zmiana czoła”</b> przy 90201 (${A('zmiana czoła')}).`, { tab: 'stan' },
    (sim) => { const tr = entry(sim, 90201)?.train; return !!tr && tr.v === 0 && ['W', 'NW', 'SW'].includes(tr.direction); });
  act('shunt-back', 'Powrót na tor 2 – w dwóch etapach', `${P.shuntRoute('Tm1', m ? 'tarczę Tm2' : 'tarczy Tm2')} – ${A('przebieg manewrowy')} z tarczy <b>Tm1</b> na tor 2. Skład (180 m) jest dłuższy niż miejsce przed <b>Tm2</b>, więc od razu nastaw też drugi etap: ${P.shuntRoute('Tm2', m ? 'semafor C2' : 'semafora C2')}. Skład przejedzie do C2 i stanie czołem na zachód – gotowy do odjazdu.`, cmd('shunt', sig('Tm1', 'white')),
    (sim, ctx) => (ctx.seen.has('route:Tm1-Tm2:set') && active(sim, 'Tm2-C2')) || !!sim.traffic.tasks.find((t) => t.id === 'podstaw-90202')?.done);
  act('shunt-task2', 'Skład podstawiony', `Poczekaj, aż skład stanie w całości na torze 2 – zadanie 2 odhaczy się w zakładce Stan – i przełącz go na <b>„jazda pociągowa”</b> (zakładka Stan, kolejność dowolna). Od 07:57 skład będzie w rozkładzie jako pociąg <b>90202</b>.`, { tab: 'stan' },
    (sim) => { const t = sim.traffic.tasks.find((x) => x.id === 'podstaw-90202'); const tr = entry(sim, 90202)?.train || entry(sim, 90201)?.train; return !!t?.done && !!tr && tr.mode === 'train'; });
  act('out-90202', 'Wyprawienie 90202', `<b>Wbl</b> do ${LIPa}, przebieg <b>C2 → szlak do ${LIPa}</b>. Pociąg odjedzie o 08:12.`, blockW,
    (sim) => atNeighbour(sim, 90202) && !sim.blocks.get('W').occupied);

  /* ---------------- usterka semafora A → Sz ---------------- */
  info('fault-intro', 'Usterka semafora', `O 08:15 semafor <b>A</b> ulegnie usterce (obwód świateł): przebieg wjazdowy da się nastawić i utwierdzić jak zwykle, ale semafor <b>nie wyświetli sygnału zezwalającego</b> i zostanie na „Stój”. O 08:22 od ${LIPa} przyjedzie <b>6105</b> na tor 1 i zatrzyma się przed A.<p>W takiej sytuacji dyżurny podaje ${A('Sz', 'sygnał zastępczy Sz')}: białe migające światło, na które maszynista mija semafor z prędkością do 20 km/h. Warunek: droga przebiegu utwierdzona i sprawdzona. Każde użycie Sz jest liczone.</p>`, sig('A'));
  act('in-6105-route', 'Przebieg mimo usterki', `Gdy ${LIP} zgłosi 6105 (zamiga ${m ? 'napis' : 'lampka'} „żąd.”): <b>Poz</b> i przebieg <b>A → D1</b>. Zwróć uwagę: odcinki są utwierdzone, ale A dalej pokazuje „Stój”.`, blockW,
    (sim) => (active(sim, 'A-D1') && sim.ilk.signals.get('A').failed) || arrived(sim, 6105));
  act('sz-6105', 'Sygnał zastępczy', `Gdy pociąg stanie przed A (albo od razu, gdy droga jest utwierdzona): ${P.sz('A')}. Semafor pokaże <b>białe migające</b> światło (${A('Sz')}) – maszynista może jechać z prędkością do 20 km/h. Licznik Sz wzrośnie o 1 – każde użycie jest rejestrowane.`, cmd('sz', { ref: { kind: 'group', id: 'Sz', role: 'substitute' } }),
    (sim, ctx) => ctx.seen.has('sz:A') || arrived(sim, 6105));
  act('out-6105', 'Reszta jak zwykle', `Po przyjeździe 6105: <b>Ko</b> (${LIP}), <b>Wbl</b> (${DEB}), przebieg <b>D1 → szlak do ${DEBa}</b>. Odjazd 08:24.`, blockE,
    (sim) => atNeighbour(sim, 6105) && !sim.blocks.get('E').occupied);

  /* ---------------- usterka blokady do Lipna → zapowiadanie telefoniczne ---------------- */
  info('phone-intro', 'Blokada bez łączności', `O 08:26 blokada do ${LIPa} traci łączność. Pociąg <b>6106</b> z ${DEBa} (08:33, tor 1) ma jechać dalej do ${LIPa} – nie da się użyć Wbl. Ruch prowadzi się wtedy przez ${A('zapowiadanie telefoniczne')}: telefonogramy w zakładce <b>Łączność</b>, formuły wg Ir-1.`, { tab: 'lacznosc' });
  act('in-6106', 'Przyjęcie 6106 od Dębna', `Blokada do ${DEBa} działa normalnie – gdy ${DEB} zgłosi 6106 (zamiga ${m ? 'napis' : 'lampka'} „żąd.”): <b>Poz</b>, przebieg <b>B → C1</b>, po przyjeździe <b>Ko</b>.`, blockE,
    (sim) => arrived(sim, 6106) && blockFree(sim.blocks.get('E')));
  act('phone-ask', 'Pytanie o drogę', `Zakładka <b>Łączność</b>: Do: <b>${LIP}</b>, telefonogram <b>„Czy droga dla pociągu nr … wolna?”</b>, numer <b>6106</b>, <b>Nadaj</b>. ${LIP} odpowie „Droga … wolna” – to zastępuje pozwolenie z blokady.`, { tab: 'lacznosc' },
    (sim) => String(sim.blocks.get('W').phone.permissionFor) === '6106' || atNeighbour(sim, 6106),
    { wrong: (sim) => (sim.blocks.get('W').neighbourReply?.phoneFor ? 'Pytanie nadane – czekaj na odpowiedź Lipna.' : null) });
  act('phone-route', 'Wyjazd na zapowiadanie', `Przebieg <b>C1 → szlak do ${LIPa}</b>. Odjazd 08:35.`, cmd('train', sig('C1')),
    (sim) => active(sim, 'C1-W') || atNeighbour(sim, 6106) || sim.blocks.get('W').occupied);
  act('phone-departed', 'Zawiadomienie o odjeździe', `Gdy 6106 wyjedzie na szlak, nadaj do ${LIPa}: <b>„Pociąg nr … odjechał o …”</b> (numer 6106). Brak zawiadomienia jest punktowany ujemnie.`, { tab: 'lacznosc' },
    (sim) => { const b = sim.blocks.get('W'); return String(b.phone.departedTrain) === '6106' && b.phone.departedReported; });
  act('phone-dpo', 'Doraźne zwolnienie bloku (dPo)', `Blok początkowy do ${LIPa} pozostaje zablokowany, bo blokada nie odbierze potwierdzenia. Gdy ${LIP} zawiadomi telefonicznie <b>„Pociąg nr 6106 przybył o …”</b> (zakładka Łączność), zwolnij blok doraźnie: ${P.dpo(LIPa)}. Uzasadnione usterką ${A('dPo')} nie kosztuje punktów.`, blockW,
    (sim) => sim.blocks.get('W').counters.dPo >= 1 && !sim.blocks.get('W').poBlocked,
    { wrong: (sim) => { const b = sim.blocks.get('W'); return b.poBlocked && String(b.phone.arrivalConfirmed) !== '6106' ? 'Poczekaj na telefoniczne potwierdzenie przyjazdu 6106 – dPo przed nim to −15 pkt.' : null; } });

  info('end', 'Koniec misji', `To wszystko: pozwolenia, przebiegi, przelot, krzyżowanie, STOP i Pz, zwrotnice, manewry, Sz i zapowiadanie telefoniczne. Raport zmiany: menu ☰ → <b>Raport zmiany</b>.<p>${m ? 'Misja 2 pokazuje tę samą stację na <b>pulpicie kostkowym</b> urządzeń typu E (menu ☰ → Nowa zmiana → Szkolna → Misja 2).' : 'Teraz spróbuj prawdziwych stacji: Stare Pustkowie (typ E) albo Sopot i Gdynia (stanowiska komputerowe) – menu ☰ → Nowa zmiana.'}</p>`, { el: '#btn-menu' });
  return steps;
}

/** Rejestr misji: id z pola `tutorial` scenariusza → definicja. */
export const MISSIONS = {
  monitor: { id: 'monitor', name: 'Misja 1 – stanowisko komputerowe', view: 'monitor', steps: () => missionSteps('monitor') },
  pulpit: { id: 'pulpit', name: 'Misja 2 – pulpit kostkowy', view: 'pulpit', steps: () => missionSteps('pulpit') },
};

export function getMission(id) {
  return MISSIONS[id] || null;
}
