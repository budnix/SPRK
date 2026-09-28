import { infoStep as info, actStep as act, entry, atNeighbour, arrived, blockFree, active } from '../lessons.js';
import { A } from '../phrases.js';

/**
 * Misja 3 – pulpit ciemny urządzeń przekaźnikowych typu IZH-111 na stacji krańcowej Zacisze.
 * Własny scenariusz i własne kroki: rozgrzewka z rozkazami pulpitu (+, −, STOP, Zw, Zcz), wjazd na tor czołowy,
 * zmiana czoła i odjazd z powrotem, dwa składy na stacji jednocześnie.
 */
const adr = (id) => ({ ref: { kind: 'signal', id } });
const end = (id) => ({ ref: { kind: 'end', id } });
const POINT = 'Zw2';                     // rozjazd torów 2 i 3 – pierwszy pociąg jedzie na tor 1
const point = (sim) => sim.ilk.points.get(POINT);
const TRY = 'A-kT3';                     // przebieg do ćwiczenia zwolnienia: wjazd na tor 3
const W = (sim) => sim.blocks.get('W');
const consist = (sim, ...nrs) => nrs.map((nr) => entry(sim, nr)?.train).find(Boolean);
const facingWest = (sim, ...nrs) => { const tr = consist(sim, ...nrs); return !!tr && tr.v === 0 && ['W', 'NW', 'SW'].includes(tr.direction); };
const route = (s, e, order = 'P') => `naciśnij <b>przycisk adresowy</b> semafora <b>${s}</b>, potem <b>przycisk adresowy</b> ${e}, a na końcu rozkaz <b>${order}</b> w grupie rozkazów nad planem – masz na to 10 s`;
const trackEnd = (n) => `końca toru ${n} (przy koźle)`;
const lineEnd = 'końca toru szlakowego do Modrzewia (skrajna lewa kostka)';

export function steps() {
  return [
    /* ---------------- wprowadzenie ---------------- */
    info('intro', 'Witaj na stacji Zacisze', `Przed Tobą <b>pulpit urządzeń przekaźnikowych typu IZH-111</b>. Każdy element – semafor, zwrotnica, koniec toru – ma jeden czarny ${A('przycisk adresowy')}, a nad planem jest grupa ${A('przycisk rozkazu', 'przycisków rozkazów')}: P, M, +, −, STOP, Zw, ${A('Zcz')}, Sz. Najpierw wskazujesz element przyciskiem adresowym (podświetli się), potem wybierasz rozkaz – masz na to 10 s. Ponowne naciśnięcie tego samego adresu odwołuje wybór.<p>Zacisze to ${A('stacja krańcowa')}: linia z Modrzewia tu się kończy. Każdy pociąg kończy bieg, zmienia czoło i wraca.</p><p>Na krokach z opisem zegar stoi. Kliknij <b>Dalej</b>, gdy przeczytasz.</p>`),
    info('layout', 'Plan stacji', `Jedyny szlak prowadzi w lewo, do Modrzewia. Tory <b>1</b>, <b>2</b> i <b>3</b> to ${A('tor czołowy', 'tory czołowe')} zakończone kozłami: 1 i 2 przy peronie I, 3 przy peronie II.<p>${A('semafor', 'Semafor')} <b>A</b> jest wjazdowy. <b>B1, B2, B3</b> to semafory wyjazdowe – stoją na zachodnim końcu każdego toru, bo stąd pociągi odjeżdżają tam, skąd przyjechały.</p><p>To ${A('pulpit ciemny')}: w stanie zasadniczym lampki są zgaszone. Szczeliny toru świecą na <b>biało</b>, gdy odcinek jest utwierdzony, i na <b>czerwono</b>, gdy jest zajęty. Powtarzacz semafora ma tylko lampkę zieloną i białą – <b>ciemny powtarzacz oznacza „Stój”</b>.</p>`, { el: '#desk' }),

    /* ---------------- rozgrzewka: rozkazy pulpitu ---------------- */
    info('izh-practice', 'Rozgrzewka przed pierwszym pociągiem', `Do pierwszego pociągu jest kilka minut. Przećwicz rozkazy: <b>−</b> i <b>+</b> (zwrotnica), <b>STOP</b> i <b>Zw</b> (zamknięcie zwrotnicy) oraz ${A('Zcz')} (zwolnienie przebiegu).<p>Ćwiczysz na <b>zwrotnicy 2</b> i na wjeździe na tor 3. Pierwszy pociąg pojedzie na tor 1. Po „Dalej” zegar ruszy.</p>`, { el: '.izh-orders' }),
    act('izh-point-minus', 'Zwrotnica: adres i rozkaz „−”', `Naciśnij <b>przycisk adresowy zwrotnicy 2</b> – szczeliny zaświecą i pokażą jej położenie (na pulpicie ciemnym widać je dopiero po wybraniu adresu). Potem naciśnij rozkaz <b>−</b>: zwrotnica przestawi się na tor zwrotny, trwa to ok. 4 s.<p>Rozkaz „+” ustawia położenie zasadnicze, „−” przełożone – podajesz położenie docelowe, a nie „przestaw”.</p>`, { ref: { kind: 'point', id: POINT } },
      (sim) => point(sim).position === '-' && !point(sim).moving),
    act('izh-point-stop', 'Zamknięcie zwrotnicy: STOP', `Przycisk adresowy zwrotnicy 2 i rozkaz <b>STOP</b>. Przy przycisku zapali się <b>czerwona lampka</b>, a szczeliny będą świecić na stałe. Zamkniętej zwrotnicy nie przestawi ani obsługa, ani przebieg.`, { cmd: 'STOP' },
      (sim) => point(sim).individualLock),
    act('izh-point-zw', 'Odwołanie zamknięcia: Zw', `Przycisk adresowy zwrotnicy 2 i rozkaz <b>Zw</b>. Czerwona lampka zgaśnie, a szczeliny po chwili znów będą ciemne.`, { cmd: 'Zw' },
      (sim, ctx) => ctx.seen.has(`lock:${POINT}`) && !point(sim).individualLock),
    act('izh-point-plus', 'Z powrotem: rozkaz „+”', `Przywróć położenie zasadnicze: przycisk adresowy zwrotnicy 2 i rozkaz <b>+</b>.`, { cmd: '+' },
      (sim, ctx) => ctx.seen.has(`minus:${POINT}`) && point(sim).position === '+' && !point(sim).moving && !point(sim).individualLock),
    act('izh-zcz-route', 'Przebieg do ćwiczenia', `Teraz zwolnienie przebiegu. Najpierw nastaw ${A('przebieg pociągowy')}, który zaraz zwolnisz – wjazd na tor 3: ${route('A', trackEnd(3))}.<p>Na stacji krańcowej wjazd kończy się na koźle, więc końcem przebiegu jest przycisk przy końcu toru.</p>`, adr('A'),
      (sim, ctx) => active(sim, TRY) || ctx.seen.has(`route:${TRY}:released`),
      { wrong: (sim) => (active(sim, 'A-kT1') || active(sim, 'A-kT2') ? 'To nie tor 3. Zwolnij ten przebieg (przycisk adresowy jego końca i rozkaz Zcz) i nastaw wjazd na tor 3.' : null) }),
    act('izh-zcz', 'Zwolnienie czasowe: Zcz', `Naciśnij przycisk adresowy <b>końca toru 3</b> i rozkaz <b>Zcz</b>. Uwaga: wskazujesz <b>koniec</b> przebiegu, nie początek.<p>Semafor A od razu zgaśnie, ale droga przebiegu zostanie utwierdzona jeszcze przez 120 s – tyle urządzenia dają pociągowi, który mógł już minąć semafor.</p>`, end('kT3'),
      (sim, ctx) => ctx.seen.has(`route:${TRY}:timed`) || ctx.seen.has(`route:${TRY}:released`)),
    act('izh-zcz-wait', 'Odliczanie 120 s', `Trwa zwalnianie czasowe: odcinki drogi przebiegu nadal świecą na biało. Poczekaj, aż zgasną; możesz przyspieszyć czas przyciskiem <b>5×</b> w nagłówku.<p>Przebieg manewrowy zwalnia się inaczej: adres końca i rozkaz <b>Zw</b>, od razu.</p>`, { el: '#speed' },
      (sim, ctx) => ctx.seen.has(`route:${TRY}:released`) && !active(sim, TRY)),

    /* ---------------- pierwszy pociąg: przyjazd, zmiana czoła, odjazd ---------------- */
    info('block-intro', 'Blokada liniowa', `Kostki przy lewym krańcu toru to ${A('Eap', 'blokada liniowa Eap')} do Modrzewia. Linia jest jednotorowa, więc każdy pociąg uzgadnia się z sąsiadem: ${A('Poz')} – dajesz pozwolenie na przyjazd, ${A('Ko')} – potwierdzasz przyjazd, ${A('Wbl')} – żądasz pozwolenia na wyjazd.<p>Strzałki na kostkach toru: <b>wjazd</b> – sąsiad ma pozwolenie albo jego pociąg jedzie do nas, <b>wyjazd</b> – mamy pozwolenie albo nasz pociąg jest na szlaku.</p>`, { block: 'W' }),
    act('poz-7101', 'Danie pozwolenia (Poz)', `Modrzew <b>żąda pozwolenia</b> na wyprawienie osobowego <b>7101</b> (tor 1, przyjazd 07:04) – miga lampka „żąd.”. Naciśnij przycisk <b>Poz</b> na kostkach blokady.`, { block: 'W' },
      (sim) => W(sim).direction === 'in' || arrived(sim, 7101),
      { tip: 'Jeśli żądania jeszcze nie ma, odczekaj chwilę – przychodzi kilka minut przed przyjazdem.' }),
    act('route-7101', 'Wjazd na tor czołowy', `Nastaw wjazd na tor 1: ${route('A', trackEnd(1))}.`, adr('A'),
      (sim) => active(sim, 'A-kT1') || arrived(sim, 7101),
      { wrong: (sim) => (active(sim, 'A-kT2') || active(sim, 'A-kT3') ? 'Pociąg 7101 ma tor 1. Zwolnij ten przebieg (adres jego końca i rozkaz Zcz) i nastaw wjazd na tor 1.' : null) }),
    act('ko-7101', 'Potwierdzenie przyjazdu (Ko)', `Pociąg stanął przy peronie i <b>zakończył bieg</b>. Potwierdź przyjazd: przycisk <b>Ko</b> na kostkach blokady. Szlak do Modrzewia jest znów wolny.`, { block: 'W' },
      (sim) => arrived(sim, 7101) && blockFree(W(sim))),
    act('reverse-7101', 'Zmiana czoła', `Skład stoi czołem do kozła. Żeby wrócić do Modrzewia, musi zmienić czoło: zakładka <b>Pociągi</b> → <b>„zmiana czoła”</b> przy 7101 (${A('zmiana czoła')}).<p>Skład odjedzie jako nowy pociąg <b>7102</b> o 07:14.</p>`, { tab: 'pociagi' },
      (sim) => facingWest(sim, 7101, 7102) || atNeighbour(sim, 7102)),
    act('wbl-7102', 'Żądanie pozwolenia (Wbl)', `Przed odjazdem potrzebujesz pozwolenia od Modrzewia: przycisk <b>Wbl</b> na kostkach blokady. Sąsiad odpowie po kilkunastu sekundach – strzałka „wyjazd” zaświeci na biało.`, { block: 'W' },
      (sim) => (W(sim).direction === 'out' && W(sim).permission) || atNeighbour(sim, 7102),
      { wrong: (sim) => (W(sim).request === 'ours' ? 'Żądanie wysłane – czekaj na odpowiedź Modrzewia.' : null) }),
    act('out-7102', 'Wyjazd z toru czołowego', `Masz pozwolenie. Nastaw wyjazd z toru 1: ${route('B1', lineEnd)}. Pociąg odjedzie o 07:14. Poczekaj, aż dojedzie do Modrzewia.`, adr('B1'),
      (sim) => atNeighbour(sim, 7102) && !W(sim).occupied),

    /* ---------------- dwa składy na stacji ---------------- */
    info('two-intro', 'Dwa składy naraz', `Teraz przyjadą dwa pociągi jeden po drugim: <b>7103</b> na tor <b>2</b> (07:26) i <b>7105</b> na tor <b>1</b> (07:40). Pierwszy odjedzie dopiero o 07:50 jako 7104, drugi o 08:02 jako 7106.<p>Szlak jest jeden, więc kolejność ma znaczenie: nie wyprawisz pociągu, dopóki drugi jest na szlaku, i nie przyjmiesz drugiego na tor, na którym stoi pierwszy.</p>`, { el: '#desk' }),
    act('in-7103', 'Przyjęcie 7103 na tor 2', `Gdy Modrzew zgłosi 7103: <b>Poz</b>, wjazd ${route('A', trackEnd(2))}. Po przyjeździe <b>Ko</b> i <b>zmiana czoła</b> w zakładce Pociągi.`, adr('A'),
      (sim) => arrived(sim, 7103) && blockFree(W(sim)) && facingWest(sim, 7103, 7104),
      { wrong: (sim) => (active(sim, 'A-kT1') && !arrived(sim, 7103) ? '7103 ma tor 2 – tor 1 będzie potrzebny dla następnego pociągu.' : null) }),
    act('in-7105', 'Przyjęcie 7105 na tor 1', `Modrzew zgłosi 7105 – tor 2 jest zajęty, więc pociąg jedzie na tor <b>1</b>: <b>Poz</b>, wjazd <b>A → koniec toru 1</b>, po przyjeździe <b>Ko</b>.`, adr('A'),
      (sim) => arrived(sim, 7105) && blockFree(W(sim)),
      { wrong: (sim) => (active(sim, 'A-kT3') ? '7105 ma tor 1. Zwolnij ten przebieg i nastaw wjazd na tor 1.' : null) }),
    act('out-7104', 'Odjazd 7104 z toru 2', `O 07:50 odjeżdża <b>7104</b> z toru 2: <b>Wbl</b>, potem wyjazd ${route('B2', lineEnd)}. Poczekaj, aż dojedzie do Modrzewia.`, adr('B2'),
      (sim) => atNeighbour(sim, 7104) && !W(sim).occupied,
      { wrong: (sim) => (active(sim, 'B1-W') ? 'To wyjazd z toru 1. Najpierw odjeżdża 7104 z toru 2 – zwolnij przebieg i nastaw wyjazd od B2.' : null) }),
    act('out-7106', 'Odjazd 7106 z toru 1 – samodzielnie', `Został skład na torze 1. Odjeżdża o 08:02 jako <b>7106</b>: <b>zmiana czoła</b>, <b>Wbl</b>, wyjazd <b>B1 → szlak do Modrzewia</b>.`, adr('B1'),
      (sim) => atNeighbour(sim, 7106)),

    info('end', 'Koniec misji', `To wszystko: przyciski adresowe i rozkazy, zwrotnica rozkazem + i −, STOP, Zw i Zcz, wjazd na tor czołowy, zmiana czoła i odjazd z powrotem. Po „Dalej” zmiana się zakończy i pokaże się <b>raport zmiany</b>.<p>Opis wszystkich rozkazów jest w instrukcji pod przyciskiem „?”. Pełną zmianę na tej stacji znajdziesz w menu → Nowa zmiana → Zacisze.</p>`, { el: '#btn-menu' }),
  ];
}

export default { id: 'izh', name: 'Misja 3 – pulpit typu IZH-111', view: 'izh', station: 'zacisze', steps };
