import { infoStep as info, actStep as act, entry, atNeighbour, arrived } from '../lessons.js';
import { A } from '../phrases.js';

/**
 * Misja 5 – stanowisko komputerowe EBILock 950 (pulpit EBIScreen) na stacji Brzezina, linia dwutorowa z blokadą
 * samoczynną. Własny scenariusz i własne kroki: menu pod prawym klawiszem i linia poleceń z „Wykonaj”, polecenie
 * wpisane z klawiatury, wyprzedzanie towarowego na torze 4, okno zdarzeń i alarmów, zamknięcie toru z pękniętą szyną
 * (ITS / ITO) i przyjęcie pociągu na tor 3.
 */
const sig = (id) => ({ ref: { kind: 'signal', id, color: 'green' } });
const line = { cmd: 'line' };
const set = (sim, id) => sim.ilk.active.has(id) || sim.ilk.pending.some((p) => p.route.id === id);
const defect = (sim) => sim.faults.list.find((f) => f.type === 'track-defect');
const closed = (sim) => !!sim.ilk.sections.get('T1')?.closed;
/** Przebieg myszą: lewy klawisz na początku, prawy na końcu, POC z menu, „Wykonaj”. */
const mouse = (a, b) => `lewym klawiszem kliknij semafor <b>${a}</b>, prawym – <b>${b}</b>; z menu wybierz <b>POC</b> i naciśnij <b>Wykonaj</b>`;

export function steps() {
  return [
    /* ---------------- wprowadzenie ---------------- */
    info('intro', 'Witaj na stanowisku EBILock 950', `Przed Tobą ${A('EBILock', 'stanowisko EBILock 950')} stacji Brzezina. Obraz jest taki jak na innych monitorach (${A('Ie104', 'Ie-104')}), ale polecenia wydaje się inaczej: każde trafia do ${A('linia poleceń', 'linii poleceń')} nad planem, a wysyła je dopiero przycisk <b>Wykonaj</b>.<p><b>Prawy klawisz</b> myszy na obiekcie otwiera menu jego poleceń (na tablecie: przytrzymaj palec). Wybrany obiekt ma zieloną pulsującą ramkę.</p><p>Na krokach z opisem zegar stoi. Kliknij <b>Dalej</b>, gdy przeczytasz.</p>`),
    info('layout', 'Stacja Brzezina', `Brzezina leży na linii dwutorowej: w lewo do Topolna, w prawo do Klonowa. Tor <b>1</b> prowadzi pociągi do Topolna, tor <b>2</b> – do Klonowa; oba są przy peronie I.<p>Tory <b>3</b> i <b>4</b> są dodatkowe: tor 3 przy torze 1, tor 4 przy torze 2. Tu czekają pociągi, które inne wyprzedzają.</p><p>Semafory wjazdowe: <b>A</b> (od Topolna, na tory 2 i 4) i <b>B</b> (od Klonowa, na tory 1 i 3). Wyjazdowe: <b>D1</b>, <b>D3</b> do Topolna, <b>E2</b>, <b>E4</b> do Klonowa.</p>`, { el: '#desk' }),

    /* ---------------- pierwsze pociągi: mysz i klawiatura ---------------- */
    info('block-intro', 'Blokada samoczynna', `Oba szlaki mają ${A('SBL', 'blokadę samoczynną')}: każdy tor szlakowy ma jeden kierunek ruchu. Sąsiedzi wyprawiają pociągi sami – nie ma pozwoleń ani potwierdzania przyjazdu.<p>Twoim zadaniem są przebiegi: wjazd, a potem wyjazd każdego pociągu.</p>`, { block: 'T2' }),
    info('line-intro', 'Linia poleceń', `Tu jest ${A('linia poleceń')}. Polecenie ma postać: nazwa polecenia, potem nazwy obiektów, np. <b>POC A E2</b> – ${A('POC', 'przebieg pociągowy')} od semafora A do semafora E2.<p>Linię wypełnia menu (prawy klawisz) albo klawiatura: <b>F12</b> przechodzi do linii, <b>Enter</b> wysyła. <b>Wyczyść</b> albo Esc odznacza wszystko.</p>`, line),
    act('route-9101', 'Wjazd 9101 myszą', `Osobowy <b>9101</b> z Topolna (07:06) wjedzie na tor 2. Nastaw wjazd: ${mouse('A', 'E2')}.<p>Po wyborze z menu polecenie stoi w linii poleceń – bez „Wykonaj” nic się nie dzieje.</p>`, sig('A'),
      (sim) => set(sim, 'A-E2') || arrived(sim, 9101),
      { wrong: (sim) => (set(sim, 'A-E4') ? 'To wjazd na tor 4. 9101 ma tor 2 – awaryjnie zwolnij przebieg (PZA A E4) i nastaw A → E2.' : null) }),
    act('out-9101', 'Wyjazd 9101 z klawiatury', `Wyjazd wpisz z klawiatury: naciśnij <b>F12</b>, napisz <b>POC E2 kK2</b> i <b>Enter</b>. „kK2” to trójkąt końca toru 2 do Klonowa (prawa krawędź planu). Pociąg odjedzie o 07:07.`, line,
      (sim) => set(sim, 'E2-K2') || atNeighbour(sim, 9101)),
    act('in-9102', 'Wjazd 9102 od Klonowa', `Osobowy <b>9102</b> z Klonowa (07:12) wjedzie na tor 1: ${mouse('B', 'D1')}.`, sig('B'),
      (sim) => set(sim, 'B-D1') || arrived(sim, 9102)),
    act('out-9102', 'Wyjazd 9102', `Po zatrzymaniu przy peronie nastaw wyjazd do Topolna – myszą (<b>D1</b>, potem prawym klawiszem trójkąt <b>kT1</b> na lewej krawędzi) albo z klawiatury <b>POC D1 kT1</b>.`, sig('D1'),
      (sim) => set(sim, 'D1-T1') || atNeighbour(sim, 9102)),

    /* ---------------- wyprzedzanie na torze 4 ---------------- */
    info('over-intro', 'Wyprzedzanie', `Za chwilę z Topolna przyjedzie towarowy <b>49101</b> (07:22). Postoi na torze <b>4</b>, bo o 07:29 bez zatrzymania przejedzie pociąg <b>1901</b> (TLK) torem 2 – to ${A('wyprzedzanie')}. Towarowy odjedzie za nim o 07:34.`, { el: '#desk' }),
    act('in-49101', 'Towarowy na tor 4', `Nastaw wjazd towarowego na tor 4: ${mouse('A', 'E4')}.`, sig('A'),
      (sim) => arrived(sim, 49101) && String(entry(sim, 49101).actualTrack) === '4',
      { wrong: (sim) => (set(sim, 'A-E2') && !arrived(sim, 49101) ? 'Tor 2 jest dla TLK 1901. Towarowy ma tor 4 – awaryjnie zwolnij przebieg (PZA A E2) i nastaw A → E4.' : null) }),
    act('pass-1901', 'Przelot TLK 1901', `Towarowy stoi na torze 4. Nastaw dla <b>1901</b> ${A('przelot', 'przelot')} torem 2: najpierw <b>POC A E2</b>, potem <b>POC E2 kK2</b> – myszą albo z klawiatury.`, sig('A'),
      (sim) => atNeighbour(sim, 1901)),
    act('out-49101', 'Odjazd towarowego', `TLK już przejechał. Nastaw wyjazd towarowego z toru 4: <b>POC E4 kK2</b>. Odjedzie o 07:34.`, sig('E4'),
      (sim) => atNeighbour(sim, 49101)),
    act('in-9103', 'Osobowy 9103 – samodzielnie', `Osobowy <b>9103</b> z Klonowa (07:42) – tor 1: wjazd <b>B → D1</b>, po postoju wyjazd <b>D1 → kT1</b>.`, sig('B'),
      (sim) => atNeighbour(sim, 9103)),

    /* ---------------- usterka: pęknięta szyna na torze 1 ---------------- */
    info('fault-intro', 'Pęknięta szyna', `O 07:50 maszynista zgłosi <b>pękniętą szynę na torze 1</b>. Tory wyglądają normalnie – urządzenia tego nie widzą. Zgłoszenie pojawi się jako alarm w ${A('okno zdarzeń i alarmów', 'oknie zdarzeń i alarmów')}, a przycisk okna zacznie migać.<p>Tor z pękniętą szyną trzeba <b>zamknąć dla ruchu</b> poleceniem ${A('ITS')}, a pociągi prowadzić innym torem – tu torem 3. Wjazd na tor z usterką bez zamknięcia kosztuje punkty.</p>`, { el: '#desk' }),
    act('fault-alarm', 'Potwierdzenie alarmu', `Gdy przycisk <b>Zdarzenia i alarmy</b> zacznie migać, otwórz okno. Alarm ma czerwony migający kwadrat: trwa i nie jest potwierdzony. Naciśnij <b>Potwierdź wszystkie</b>.`, { cmd: 'log' },
      (sim) => sim.input.alarmList?.().length > 0 && sim.input.alarmList().every((x) => x.acked)),
    act('fault-its', 'Zamknięcie toru 1 (ITS)', `Zamknij tor 1: prawym klawiszem kliknij <b>linię toru 1</b>, z menu wybierz <b>ITS</b> i naciśnij <b>Wykonaj</b> (albo wpisz <b>ITS T1</b> – T1 to odcinek toru 1). Tor narysuje się podwójną linią.`, line,
      (sim) => closed(sim)),
    act('fault-in', 'Osobowy 9104 na tor 3', `Osobowy <b>9104</b> (07:58) miał tor 1. Tor jest zamknięty, więc przyjmij go na tor 3: ${mouse('B', 'D3')}. Pasażerowie wysiądą przy peronie II; tor zmieniony z powodu usterki nie kosztuje punktów.`, sig('B'),
      (sim) => arrived(sim, 9104),
      { wrong: (sim) => (!closed(sim) ? 'Najpierw zamknij tor 1 (ITS T1).' : null) }),
    act('fault-out', 'Wyjazd 9104 z toru 3', `Wyjazd z toru 3 do Topolna: <b>POC D3 kT1</b>.`, sig('D3'),
      (sim) => atNeighbour(sim, 9104)),
    act('in-9105', 'Osobowy 9105 do Klonowa', `Tymczasem od Topolna jedzie <b>9105</b> (08:05) – tor 2 jest sprawny: <b>POC A E2</b>, po postoju <b>POC E2 kK2</b>.`, sig('A'),
      (sim) => atNeighbour(sim, 9105)),
    act('fault-ito', 'Otwarcie toru 1 (ITO)', `Około 08:08 w zdarzeniach pojawi się wpis, że nawierzchnię naprawiono, a kwadrat alarmu zmieni się na zielony. Dopiero wtedy odwołaj zamknięcie: prawy klawisz na torze 1 → <b>ITO</b> → <b>Wykonaj</b> (albo <b>ITO T1</b>).`, line,
      (sim) => !!defect(sim)?.done && !closed(sim),
      { wrong: (sim) => (!closed(sim) && defect(sim)?.active ? 'Szyna nie jest jeszcze naprawiona – zamknij tor 1 z powrotem (ITS T1) i poczekaj na wpis o naprawie.' : null) }),
    act('in-9106', 'Osobowy 9106 znów na tor 1', `Tor 1 jest otwarty. Osobowy <b>9106</b> (08:16) jedzie planowo torem 1: <b>POC B D1</b>, po postoju <b>POC D1 kT1</b>.`, sig('B'),
      (sim) => atNeighbour(sim, 9106)),

    info('end', 'Koniec misji', `To wszystko: menu pod prawym klawiszem, linia poleceń i „Wykonaj”, polecenia z klawiatury, wyprzedzanie, okno zdarzeń i alarmów oraz zamknięcie toru ITS / ITO. Po „Dalej” zmiana się zakończy i pokaże się <b>raport zmiany</b>.<p>W instrukcji pod przyciskiem „?” są pozostałe polecenia – m.in. sygnał zastępczy dwoma poleceniami (<b>SZI</b>, potem po 5–30 s <b>SZW</b>), stopowanie semafora (SES) i zwrotnicy (ZWS).</p>`, { el: '#btn-menu' }),
  ];
}

export default { id: 'ebi', name: 'Misja 5 – stanowisko EBILock 950', view: 'ebi', station: 'brzezina', steps };
