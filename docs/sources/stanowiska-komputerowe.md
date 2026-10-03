# Stanowiska komputerowe

Część opisu źródeł – indeks i zasady zapisu: [`docs/SOURCES.md`](../SOURCES.md).

## Stanowisko komputerowe – zgodność z Ie-104

Standardem dla komputerowych stanowisk obsługi w PKP PLK są wytyczne **Ie-104** („Wytyczne w zakresie zobrazowania,
wprowadzania poleceń oraz rejestracji zdarzeń dla komputerowych stanowisk obsługi urządzeń srk”, z załącznikami
Ie-104.1 – zobrazowanie, symbole, kolory i polecenia (§11–§12); Ie-104.2 dotyczy ETCS poziomu 2, nie poleceń) oraz
instrukcja **Ie-20** (obsługa komputerowych urządzeń srk).
Serwis plk-sa.pl nie był dostępny z tego środowiska; treść wytycznych ustalono z ich streszczeń i cytowań
(wyszukiwarka, dokumentacja SCS-1 TD2 i opisy stanowisk EbiScreen/SimRail wzorowanych na Ie-104). Ten obraz
rysują oba stanowiska komputerowe gry: `komputerowe` (pasek poleceń i menu elementu – obsługa własna gry, skróty poleceń
z tabeli Ie-104.1 §12: ZCZ, ZDP – specjalne, ZDM – zwykłe, Plus / Minus, Zmk / oZmk, SZ, Stój, Stop / oStop, Ko, dPo,
dKo) i `ebilock` (linia poleceń EBIScreen – sekcja niżej); różnią się sposobem wydawania poleceń. Zastosowano:

* odcinki toru (tab. 8 Ie-104): szary – stan podstawowy, czerwony – zajęty, zielony – utwierdzony w przebiegu
  pociągowym, żółty – w przebiegu manewrowym, różowy (255,0,255) – zwalnianie czasowe (Ie-104.1 tab. 1: jedna barwa
  różowa dla zwalniania czasowego i zamknięć, fioletu w palecie nie ma), biały – brak danych; tor zamknięty – podwójna
  linia w barwie stanu (zajęty tor zamknięty – podwójna czerwona, §8 pkt 1);
* sygnalizatory (lista stanów wg malejącego priorytetu, §8 pkt 4 ust. 2–3): biały – brak danych, biały migający – sygnał
  zastępczy, zielony – sygnał zezwalający dla pociągu, żółty – zezwalający na manewry, czerwony – sygnalizator
  początkowy lub końcowy utwierdzonego przebiegu (ma pierwszeństwo przed różowym), różowy – zastopowany (Stop, SES,
  SSS; różowy także opis, gdy symbol jest czerwony), szary – stan podstawowy; symbol (§8 pkt 4 ust. 1): pełny trójkąt –
  semafor bez sygnalizacji manewrowej, pełny trójkąt z otwartym grotem – semafor z sygnalizacją manewrową, otwarty grot
  – tarcza manewrowa (sam numer, turkusowy, §4 ust. 14), mały trójkąt skierowany przeciwnie tylko przy semaforze
  wjazdowym będącym też końcem przebiegu wyjazdowego; żółte nazwy semaforów (EbiScreen); symbol na linii toru w miejscu
  ustawienia – bez masztu i bez odsunięcia od toru (uproszczenie dla czytelności, jak w SimRail); w widoku EBILock
  sygnalizator w trakcie zwalniania czasowego jest fioletowy (bsk.isdr.pl/srk_ebilock.php – źródło miłośnicze);
* zwrotnica: pole „Z” (kształt – położenie iglic, kolor – stan; w czasie przestawiania puste, brak kontroli – białe
  migające, rozprucie – czerwone migające, §8 pkt 9) i ramiona a/b/c w barwie odcinka, „+” przy ramieniu położenia
  zasadniczego, róż zamknięcia indywidualnego tylko w polu Z i numerze, seledynowe numery (EbiScreen);
* wykolejnica – pole Z (§8 pkt 12): nałożona – kreska przez tor, zdjęta – kreska obok toru (kształt przyjęty wg
  opisu, rysunku nie odtworzono dokładnie), „+” przy położeniu zasadniczym, ciemnoszara, różowa przy zamknięciu;
* koniec przebiegu (§8 pkt 7): pociągowego – pusty prostokąt, manewrowego – półkole; kozioł – symbol T z zagiętymi
  końcami (§8 pkt 32 lit. d); przyjęte: bez opisu „<sygnalizator>k”;
* blokada na wyjeździe: strzałki kierunkowe – obraz A / B / C z segmentami a i b w barwach z tabel oraz symbol Ko/dKo
  (§8 pkt 20–22; s. 53–63) – szczegóły w sekcji „Blokada liniowa na monitorze i blokada samoczynna”
  (`sygnaly-i-blokada.md`);
* miganie synchroniczne na całym obrazie, 1 Hz, 50/50 (§4 ust. 17) – wspólna faza (atrybut `data-ph` grupy planu przełączany przez widok, także na polach skrajnych);
* grupa G4 (stany operacyjne): niebieska ramka – element wybrany, migająca podczas nastawiania przebiegu,
  czerwona migająca – alarm elementu; czerwone kasetki numerów pociągów; czarne tło;
* polecenia (Ie-104.1 §11–§12; stanowisko `komputerowe`): pasek poleceń (rodzaj → element początkowy → końcowy);
  polecenie specjalne wg Ie-104.1 (2025) §11 ust. 13, 14, 16: inicjowanie markuje element pomarańczowym tłem, przed Sz
  tło obrazu szarzeje; potwierdzenie najwcześniej po 5 s, po 60 s bez potwierdzenia polecenie odwołuje się samo,
  w tym czasie inne polecenia są zablokowane (`src/srk/special.js`); rejestrowane w licznikach, odwołanie OPS.

Numery torów to sama liczba, ciemnoszara, w linii toru, a numery pociągów – w osi toru (Ie-104.1 §8 pkt 29–30), w całości na odcinku toru, przy czole pociągu, nie na sygnalizatorze za końcem toru (§8 „Wyświetlacz numeru pociągu” pkt 2 i 5a, s. 73–74; `src/render/trainLabel.js`); w kasetce sam numer – wyświetlacz zna tylko „*” (drugi pociąg niewyświetlany przy braku miejsca, pkt 5a) i „!” (dodatkowa informacja, pkt 5b), bez znaku postoju ani czoła; perony jako szare prostokąty z nazwą i podwójną kreską na krawędzi peronowej – jak na pulpitach nastawczych (numeracja rzymska,
jak w nomenklaturze PKP: peron I, II; tory arabskie). Polecenia w menu elementów mają formę rzeczownikową zgodną
z terminologią Ie-1 / Ir-1 (nastawienie przebiegu, zwolnienie przebiegu, danie pozwolenia, zwolnienie bloku końcowego,
podanie sygnału zastępczego, przestawienie zwrotnicy, zamknięcie indywidualne).

Nieodwzorowane lub uproszczone: stany „ciemnoczerwony – w ochronie bocznej”, „turkusowy – nastawianie miejscowe”,
wymiary symbolu blokady (kształt i barwy wg rysunków i tabel Ie-104.1, proporcje przyjęte), dokładne
skróty poleceń na stanowisku `komputerowe` (opisowe; skróty EBILock 950 ma stanowisko `ebilock` – sekcja niżej),
tabele zdarzeń i alarmów u dołu ekranu (na stanowisku `komputerowe` rolę pełni zakładka Dziennik).

## Stanowisko EBILock 950 z pulpitem EBIScreen 3 (`srk: 'ebilock'`)

Źródło: P. Okrzesik, „Obsługa komputerowych urządzeń stacyjnych typu EBILock 950 z pulpitem komputerowym EBIScreen 3”,
wersja 2021.03.04, do użytku LIRK WIL PK (lirk.isdr.pl, instrukcje obsługi). To opis dla symulatora i – jak zaznacza
sam autor – działanie niektórych funkcji jest w nim uproszczone względem systemu rzeczywistego; znaczenie symboli
zobrazowania jest według autora zgodne z Ie-20 (wytycznymi Ie-104). Pomocniczo: Beskidzka Strona Kolejowa
(bsk.isdr.pl, „Urządzenia typu Ebilock 950”) – barwy obrazu i przykłady poleceń (POC A G, MAN 11 C, SZI / SZW,
ZWP / ZWM). Z instrukcji wzięto:

* polecenie dla obiektu: prawy klawisz myszy na obiekcie – zielona pulsująca ramka i menu poleceń; najechanie na
  polecenie – objaśnienie na dole ekranu; lewy klawisz na poleceniu – wpis do tekstowej linii poleceń; wysłanie
  przyciskiem „Wykonaj”; alternatywnie F12 / klik w linię, wpisanie polecenia (nazwa polecenia przed nazwami
  obiektów, rozdzielone spacjami) i Enter; odznaczenie – klik w puste pole albo „Wyczyść”;
* przebieg: lewy klawisz na początku (sygnalizator), prawy na końcu (sygnalizator na końcu toru albo mały trójkąt
  na końcu toru / przy sygnalizatorze przeciwnego kierunku), możliwe elementy pośrednie – błękitna migająca ramka,
  potem menu poleceń przebiegu (POC, MAN, PZA);
* polecenia specjalne: polecenie inicjujące markuje obiekt tłem w barwie polecenia (SZI – czerwonym, ZWB – zielonym,
  ZRI – białym), polecenie wykonania wolno wysłać od 5 s do 30 s po inicjującym;
* wykaz poleceń: tor – ITS, ITO; zwrotnica / wykolejnica – ZWP, ZWM, ZWS, ZWO, ZWB, ZBP, ZBM, ZRI, ZRK, ITS, ITO;
  sygnalizator – SES, SEO, PZW, KZW, SZI, SZW, SZN; przebieg – POC, MAN, PZA; stacja (zaznaczyć nazwę stacji) –
  SSS, SSO, SZO; polecenia blokad liniowych – „w oddzielnej instrukcji na stanowisku”;
* okno zdarzeń i alarmów: górna część – zdarzenia, dolna – alarmy; aktywny alarm – czerwony kwadrat, nieaktywny –
  zielony, miganie – niepotwierdzony; „Potwierdź”, „Potwierdź wszystkie”, „Wyłącz” (alarm dźwiękowy).

Uproszczenia i założenia w grze (przyjęte – instrukcja ich nie podaje albo gra upraszcza obsługę):

* linia poleceń jest nad planem (w EBIScreen – na dole ekranu), a okno zdarzeń i alarmów otwiera się przyciskiem
  (w EBIScreen to osobne okno na innym monitorze);
* nazwy obiektów w poleceniach jak na obrazie (bsk.isdr.pl/srk_ebilock.php; LIRK EBIScreen 3 §1): numer zwrotnicy
  („ZWP 3”), numer toru („ITS 1” – przyjęte: najdłuższy odcinek toru), numer tarczy bez „Tm” („MAN 1 C2”); menu wpisuje
  te nazwy; identyfikatory z definicji stacji (sygnalizator „A”, zwrotnica „Zw3”, odcinek „T2”, trójkąt końca toru
  „kE”) działają dalej, bez względu na wielkość liter; stację wskazuje jej nazwa albo identyfikator; doraźne
  zwolnienie przebiegu zapisuje się w dzienniku jako PZA;
* polecenia blokady liniowej – skróty przycisków blokady: WBL, OWBL, POZ, KO, ZK, DPO, DKO (dPo i dKo jak na innych
  stanowiskach: z licznikiem, bez polecenia inicjującego; OWBL – wyciągnięcie Wbl, przyjęte);
* ZWP / ZWM dla wykolejnicy: „+” – nałożona, „−” – zdjęta;
* bez wybranego elementu pośredniego przebieg idzie drogą zasadniczą (pierwszą w tablicy przebiegów); elementami
  pośrednimi są zwrotnice leżące tylko na części dróg;
* lewy klawisz na obiekcie innym niż sygnalizator działa jak prawy, a na tablecie przytrzymanie palca (0,45 s) zastępuje
  prawy klawisz – tablet nie ma drugiego klawisza;
* alarmami są usterki urządzeń i rozprucie zwrotnicy; żądania blokady i łączność to zdarzenia; zamknięcie ruchowe
  zwrotnicy (ITS / ITO dla zwrotnicy) jest zastąpione stopowaniem (ZWS / ZWO), a ITS / ITO dotyczy torów;
* stacja treningowa Brzezina (misja 5) jest fikcyjna; linia dwutorowa z blokadą samoczynną dwukierunkową, każdy tor
  szlakowy ma kierunek zasadniczy (jazda po torze lewym po zmianie kierunku za zgodą sąsiada);
* usterka „pęknięta szyna” (`track-defect`, misja 5) to zgłoszenie maszynisty, którego urządzenia nie widzą: dyżurny
  zamyka tor poleceniem ITS i prowadzi ruch innym torem, po naprawie odwołuje zamknięcie (ITO); wjazd pociągu na tor
  z usterką bez zamknięcia kosztuje w grze punkty – reguła gry, nie cytat z instrukcji;
* pominięte: ZWB / ZBP / ZBM (przestawienie bez kontroli niezajętości), ZRI / ZRK (kasowanie rozprucia – w grze
  rozprucie znika po przestawieniu zwrotnicy), SZN (sygnał zastępczy na tor lewy), alarm dźwiękowy i „Wyłącz”,
  pola numerów pociągów (PIP) – numery pociągów rysuje się jak na innych monitorach.

## Stanowisko MOR-3 z pulpitem MOR-1 (`srk: 'mor3'`)

**Instrukcji stanowiskowej MOR-3 nie ma publicznie** (Ie-20 §13 ust. 13 odsyła do instrukcji stanowiskowych
załączanych do regulaminu posterunku). Źródła:

* Instrukcja **Ie-20** (PKP PLK, „Instrukcja obsługi komputerowych urządzeń sterowania ruchem kolejowym”, plk-sa.pl)
  – zasady ogólne, wspólne dla stanowisk komputerowych: polecenia nastawcze zwykłe, specjalne i techniczne (§13 ust. 2);
  zwykłe wykonuje się po akceptacji, a w systemach ze wskaźnikiem (mysz) wskazanie polecenia z menu jest akceptacją
  (§13 ust. 6); specjalne są co najmniej dwuetapowe i wymagają potwierdzenia po sprawdzeniu adresu i kodu polecenia
  (§13 ust. 7); po zainicjowaniu polecenia specjalnego nie wydaje się innych poleceń nastawczych (§13 ust. 8); z każdego
  polecenia można się wycofać na dowolnym etapie (§13 ust. 9); polecenia niepoprawne są odrzucane z informacją na
  ekranie (§13 ust. 12);
* **opis symulatora SPE** (Symulator Pulpitów Elektronicznych współpracujący z Train Driver 2, wiki.td2.info.pl,
  „Instrukcja SPE”) – symulacja pulpitu MOR-1 dla MOR-3, MOR-3E i E; to opis programu społeczności, nie producenta
  (Kombud). Z niego wzięto: kliknięcie sygnalizatora lub toru początkowego zapala fioletową obwódkę i menu
  kontekstowe, a kliknięcie celu (zamiast wyboru z menu) daje menu przebiegu „Manewr” / „Pociąg” (tylko dostępne);
  zamiast semafora wjazdowego można kliknąć strzałkę blokady; przeciągnięcie prawym klawiszem od początku do celu;
  menu sygnalizatora: Stój, Stop, oStop, ZCZ, oZCZ, SZ, NSZ, ZD; toru: Zmk, oZmk, ZeroLO; zwrotnicy: Plus, Minus,
  Stop, oStop, Zmk, oZmk, KSR, PlusBZ, MinusBZ, ZeroLO; polecenia fioletowe (oStop, oZmk) wymagają potwierdzenia,
  czerwone (SZ, NSZ, ZeroLO, KSR, PlusBZ, MinusBZ, dPo, dKo) są specjalne i liczone w liczniku poleceń specjalnych
  (żółty na niebieskim tle); dostępność poleceń zależy od stanu obiektu; pod obrazem okno komunikatów albo alarmów
  (przełącznik), alarm potwierdza się dwuklikiem (biały na czerwonym → czerwony na niebieskim), a znika po
  potwierdzeniu i naprawie; blokada Eap: Wbl, Poz, Ko, dPo, dKo.

Uproszczenia i założenia w grze (przyjęte):

* obraz stanu jak na innych stanowiskach komputerowych gry (Ie-104); zielonego toru szlakowego przy ustawionym
  kierunku blokady, który stosuje producent w systemach MOR, gra nie rysuje – PKP PLK uznały go za niezgodny ze swoimi
  wymaganiami (kolejowyportal.pl, „Zobrazowania w systemach MOR do poprawy”);
* tor początkowy przebiegu to tor, przy którym stoi sygnalizator początkowy (jego odcinek zbliżania); gdy przy torze
  stoją sygnalizatory w obu kierunkach, początek wynika z klikniętego celu (przyjęte – opis SPE mówi tylko
  „sygnalizator lub tor początkowy”); wyjątku SPE dla torów bez izolacji gra nie ma, bo wszystkie tory są izolowane;
* potwierdzenie polecenia fioletowego i czerwonego – pasek „Potwierdź” / „Odwołaj” (opis SPE nie podaje wyglądu);
  polecenie czekające na potwierdzenie nie wygasa samo;
* ZD (w opisie SPE bez koloru, „natychmiast zwalnia przebieg”) – zwolnienie przebiegu bez licznika, gdy odcinek
  zbliżania jest wolny; przy zajętym gra odsyła do ZCZ; ZCZ – zwolnienie czasowe (czas jak na innych stanowiskach),
  oZCZ – jego odwołanie;
* Plus / Minus dla wykolejnicy: „+” – nałożona, „−” – zdjęta; zwrotnica Stop / oStop – zamknięcie indywidualne;
* przy blokadzie samoczynnej w menu szlaku jest tylko Zk (jak na innych stanowiskach gry), polecenia Eap są
  niedostępne (EBIScreen je wyszarza);
* okno komunikatów i alarmów leży między planem a listwą narzędzi; komunikaty to wpisy dziennika i wydane polecenia,
  alarmy – usterki urządzeń i rozprucie; licznik poleceń specjalnych liczy potwierdzone polecenia czerwone (SZ, dPo,
  dKo) – liczników Sz / dPz na planie MOR-1 nie ma (jeden licznik poleceń specjalnych);
* ZeroLO (zerowanie licznika osi) – tylko dla toru; wg opisu SPE: po zerowaniu odcinek ciemnieje (Ie-104:
  ciemnoczerwony – zajęty, oczekujący), a zwalnia się po wjeździe i wyjeździe pojazdu, który wjechał na sygnał
  zastępczy lub rozkaz pisemny. W grze: usterka `axle-counter` (tylko w scenariuszu, misja 6 w fikcyjnym węźle
  Kalinowo) – od czasu `at` licznik myli się przy najbliższym przejeździe: po zjeździe pociągu odcinek dalej wskazuje
  zajętość; przejazdem kontrolnym jest nowy wjazd i wyjazd pociągu po zerowaniu (tabor stojący na odcinku przy
  zerowaniu się nie liczy); bez zerowania usterkę usuwa automatyk po czasie usterki; sprawdzenie, że tor jest wolny,
  zostaje po stronie gracza (gra tego nie wymusza); zajętość z usterki nie jest wjazdem pociągu – przebieg
  nastawiony przed usterką nie „przejeżdża” sam (tak samo przy fałszywej zajętości);
* pominięte: NSZ (sygnał zastępczy na tor niewłaściwy, W24), ZeroLO zwrotnicy, KSR (kasowanie
  rozprucia – w grze rozprucie znika po przestawieniu zwrotnicy), PlusBZ / MinusBZ, Zmk / oZmk zwrotnicy, blokady
  Eac (Wbl + Pzk, Zwbl), C i SHL-12, przejazdy kategorii A i SSP, przyciski widoku (Sem, Tm, Zwr, Odc), zgłaszanie
  usterek z menu.
