import { infoStep as info, actStep as act, entry, atNeighbour, arrived, blockFree, active } from '../lessons.js';
import { A } from '../phrases.js';

/**
 * Misja 3 – pulpit ciemny urządzeń przekaźnikowych typu IZH-111 na stacji krańcowej Zacisze.
 * Własny scenariusz i własne kroki: wjazd na tor czołowy,
 * zmiana czoła i odjazd z powrotem, dwa składy na stacji jednocześnie.
 */
const adr = (id) => ({ ref: { kind: 'signal', id } });
const W = (sim) => sim.blocks.get('W');
const consist = (sim, ...nrs) => nrs.map((nr) => entry(sim, nr)?.train).find(Boolean);
const facingWest = (sim, ...nrs) => { const tr = consist(sim, ...nrs); return !!tr && tr.v === 0 && ['W', 'NW', 'SW'].includes(tr.direction); };
// zmiana czoła wydana: maszynista idzie do drugiej kabiny albo już tam jest
const turning = (sim, ...nrs) => !!consist(sim, ...nrs)?.cabChange || facingWest(sim, ...nrs);
const route = (s, e, order = 'P') => `naciśnij <b>przycisk adresowy</b> semafora <b>${s}</b>, potem <b>przycisk adresowy</b> ${e}, a na końcu rozkaz <b>${order}</b> w grupie rozkazów nad planem – masz na to 10 s`;
const trackEnd = (n) => `końca toru ${n} (przy koźle)`;
const lineEnd = 'końca toru szlakowego do Modrzewia (skrajna lewa kostka)';

export function steps() {
  return [
    /* ---------------- wprowadzenie ---------------- */
    info('intro', 'Witaj na stacji Zacisze', `Przed Tobą <b>pulpit urządzeń przekaźnikowych typu IZH-111</b>. Każdy element – semafor, zwrotnica, koniec toru – ma jeden czarny ${A('przycisk adresowy')}, a nad planem jest grupa ${A('przycisk rozkazu', 'przycisków rozkazów')}: P, M, +, −, STOP, Zw, ${A('Zcz')}, Sz. Najpierw wskazujesz element przyciskiem adresowym (podświetli się), potem wybierasz rozkaz – masz na to 10 s. Ponowne naciśnięcie tego samego adresu odwołuje wybór.<p>Zacisze to ${A('stacja krańcowa')}: linia z Modrzewia tu się kończy. Każdy pociąg kończy bieg, zmienia czoło i wraca.</p><p>Na krokach z opisem zegar stoi. Kliknij <b>Dalej</b>, gdy przeczytasz.</p>`),
    info('layout', 'Plan stacji', `Jedyny szlak prowadzi w lewo, do Modrzewia. Tory <b>1</b>, <b>2</b> i <b>3</b> to ${A('tor czołowy', 'tory czołowe')} zakończone kozłami: 1 i 2 przy peronie I, 3 przy peronie II.<p>${A('semafor', 'Semafor')} <b>A</b> jest wjazdowy. <b>B1, B2, B3</b> to semafory wyjazdowe – stoją na zachodnim końcu każdego toru, bo stąd pociągi odjeżdżają tam, skąd przyjechały.</p><p>To ${A('pulpit ciemny')}: w stanie zasadniczym lampki są zgaszone. Szczeliny toru świecą na <b>biało</b>, gdy odcinek jest utwierdzony, i na <b>czerwono</b>, gdy jest zajęty. Powtarzacz semafora ma tylko lampkę zieloną i białą – <b>ciemny powtarzacz oznacza „Stój”</b>.</p>`, { el: '#desk' }),

    /* ---------------- pierwszy pociąg: przyjazd, zmiana czoła, odjazd ---------------- */
    info('block-intro', 'Blokada liniowa', `Kostki przy lewym krańcu toru to ${A('Eap', 'blokada liniowa Eap')} do Modrzewia. Linia jest jednotorowa, więc każdy pociąg uzgadnia się z sąsiadem: ${A('Poz')} – dajesz pozwolenie na przyjazd, ${A('Ko')} – potwierdzasz przyjazd, ${A('Wbl')} – żądasz pozwolenia na wyjazd.<p>Strzałki na kostkach toru: <b>przyjazd</b> – sąsiad żąda pozwolenia (miga na biało), ma pozwolenie albo jego pociąg jedzie do nas, <b>odjazd</b> – mamy pozwolenie albo nasz pociąg jest na szlaku.</p>`, { block: 'W' }),
    act('poz-7101', 'Danie pozwolenia (Poz)', `Modrzew <b>żąda pozwolenia</b> na wyprawienie osobowego <b>7101</b> (tor 1, przyjazd 07:04) – miga na biało strzałka „przyjazd”. Naciśnij przycisk <b>Poz</b> na kostkach blokady.`, { block: 'W' },
      (sim) => W(sim).direction === 'in' || arrived(sim, 7101),
      { tip: 'Jeśli żądania jeszcze nie ma, odczekaj chwilę – przychodzi kilka minut przed przyjazdem.' }),
    act('route-7101', 'Wjazd na tor czołowy', `Nastaw wjazd na tor 1: ${route('A', trackEnd(1))}.`, adr('A'),
      (sim) => active(sim, 'A-kT1') || arrived(sim, 7101),
      { wrong: (sim) => (active(sim, 'A-kT2') || active(sim, 'A-kT3') ? 'Pociąg 7101 ma tor 1. Zwolnij ten przebieg (adres jego końca i rozkaz Zcz) i nastaw wjazd na tor 1.' : null) }),
    act('ko-7101', 'Potwierdzenie przyjazdu (Ko)', `Pociąg stanął przy peronie i <b>zakończył bieg</b>. Potwierdź przyjazd: przycisk <b>Ko</b> na kostkach blokady. Szlak do Modrzewia jest znów wolny.`, { block: 'W' },
      (sim) => arrived(sim, 7101) && blockFree(W(sim))),
    act('reverse-7101', 'Zmiana czoła', `Skład stoi czołem do kozła. Żeby wrócić do Modrzewia, musi zmienić czoło: zakładka <b>Pociągi</b> → <b>„zmiana czoła”</b> przy 7101 (${A('zmiana czoła')}).<p>Maszynista potwierdzi przez radio i przejdzie do kabiny na drugim końcu – to trwa około minuty, a gotowość zgłosi w zakładce <b>Łączność</b>. W tym czasie możesz działać dalej. Skład odjedzie jako nowy pociąg <b>7102</b> o 07:14.</p>`, { tab: 'pociagi' },
      (sim) => turning(sim, 7101, 7102) || atNeighbour(sim, 7102)),
    act('wbl-7102', 'Żądanie pozwolenia (Wbl)', `Przed odjazdem potrzebujesz pozwolenia od Modrzewia: przycisk <b>Wbl</b> na kostkach blokady. Sąsiad odpowie po kilkunastu sekundach – strzałka „odjazd” zaświeci na biało.`, { block: 'W' },
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

    /* ---------------- usterka: odcinek pokazuje zajętość bez pociągu ---------------- */
    info('fault-intro', 'Usterka obwodu torowego', `O 08:05 <b>tor 3</b> zacznie pokazywać zajętość, choć nic na nim nie stoi – szczeliny toru zaświecą na czerwono, w dzienniku będzie alarm. To usterka obwodu torowego.<p>Urządzenia wierzą lampce: na „zajęty” tor <b>nie nastawią przebiegu</b>. Tymczasem o 08:14 ma tu wjechać <b>7107</b>, a tory 1 i 2 zostawiamy wolne dla innych pociągów.</p><p>W takiej sytuacji dyżurny najpierw upewnia się, że tor jest naprawdę wolny, potem <b>sam układa drogę</b>: ustawia zwrotnice, zamyka je i podaje ${A('Sz', 'sygnał zastępczy Sz')}. Pociąg wjeżdża z prędkością do 40 km/h.</p>`, { el: '#desk' }),
    act('fault-points', 'Ręczne ułożenie drogi', `Poczekaj na alarm. Potem ustaw drogę na tor 3: <b>zwrotnica 1</b> rozkazem <b>−</b> i <b>zwrotnica 2</b> rozkazem <b>−</b>. Gdy obie się przestawią, zamknij każdą rozkazem <b>STOP</b>.<p>Zamknięcie zastępuje utwierdzenie, którego normalnie pilnuje przebieg: nikt nie przestawi zwrotnicy pod pociągiem.</p>`, { ref: { kind: 'point', id: 'Zw1' } },
      (sim) => !!sim.ilk.sections.get('T3').forced && ['Zw1', 'Zw2'].every((id) => { const p = sim.ilk.points.get(id); return p.position === '-' && !p.moving && p.individualLock; }),
      { tip: 'Przycisk adresowy zwrotnicy, potem rozkaz. Najpierw „−”, po ok. 4 s STOP.' }),
    act('fault-dko', 'Przygotowanie bloku końcowego (dKo)', `Gdy Modrzew zgłosi 7107, daj <b>Poz</b>. Pociąg wjedzie na sygnał zastępczy, a wtedy blokada nie stwierdzi jego przejazdu przy semaforze A – Ko by nie zadziałało. Dlatego <b>przed</b> Sz przygotuj blok końcowy: przycisk <b>dKo</b> na kostce licznika blokady do Modrzewia. Przy wjeździe na Sz to uzasadnione ${A('dKo')} – licznik rośnie, punktów nie tracisz.`, { block: 'W' },
      (sim) => sim.blocks.get('W').koPrepared || arrived(sim, 7107)),
    act('fault-sz', 'Wjazd na sygnał zastępczy', `Pociąg 7107 zatrzyma się przed semaforem A, bo przebiegu nie ma. Wtedy: przycisk adresowy semafora <b>A</b> i rozkaz <b>Sz</b>. Lampka biała na powtarzaczu zamiga, a pociąg wjedzie na tor 3.<p>Każde użycie Sz liczy licznik obok rozkazu. Uzasadnione usterką nie kosztuje punktów.</p>`, { cmd: 'Sz' },
      (sim, ctx) => ctx.seen.has('sz:A') || arrived(sim, 7107),
      { wrong: (sim) => (active(sim, 'A-kT1') || active(sim, 'A-kT2') ? 'Można też przyjąć pociąg na inny tor, ale tory 1 i 2 mają zostać wolne. Zwolnij przebieg (adres końca i Zcz) i podaj Sz.' : null) }),
    act('fault-ko', 'Po przyjeździe', `Gdy 7107 stanie przy peronie: <b>Ko</b> na blokadzie. Potem odwołaj zamknięcia obu zwrotnic rozkazem <b>Zw</b> – droga jest już niepotrzebna.`, { cmd: 'Zw' },
      (sim) => arrived(sim, 7107) && blockFree(W(sim)) && ['Zw1', 'Zw2'].every((id) => !sim.ilk.points.get(id).individualLock)),
    act('out-7108', 'Odjazd 7108 z toru 3', `Skład wraca o 08:26 jako <b>7108</b>: <b>zmiana czoła</b>, <b>Wbl</b>, wyjazd <b>B3 → szlak do Modrzewia</b>. Wyjazd nastawi się normalnie – tor, z którego pociąg rusza, może być zajęty.`, adr('B3'),
      (sim) => atNeighbour(sim, 7108)),

    info('end', 'Koniec misji', `To wszystko: przyciski adresowe i rozkazy, zwrotnica rozkazem + i −, STOP, Zw i Zcz, wjazd na tor czołowy, zmiana czoła, odjazd z powrotem i wjazd na sygnał zastępczy przy usterce toru. Po „Dalej” zmiana się zakończy i pokaże się <b>raport zmiany</b>.<p>Opis wszystkich rozkazów jest w instrukcji pod przyciskiem „?”.</p><p>Misja 4 pokazuje nastawnię mechaniczną w Olszynach (menu → Nowa zmiana → Misja 4).</p>`, { el: '#btn-menu' }),
  ];
}

export default { id: 'izh', name: 'Misja 3 – pulpit typu IZH-111', view: 'izh', station: 'zacisze', steps };
