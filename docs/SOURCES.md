# Źródła i wzorce

Symulator wzoruje się na urządzeniach przekaźnikowych typu E z pulpitem kostkowym (pulpit nastawczy
przyciskowy zintegrowany z planem świetlnym) oraz na symulatorze ISDR (symulator.isdr.pl).

Grafika kostek (jasnoszare lico, siatka, ciemna rama z numeracją, szare szczeliny, żółte wskaźniki położenia,
zielone kostki zwrotnicowe, ciemne powtarzacze z lampkami, czarne liczniki) odwzorowuje zrzuty ekranu pulpitów ISDR
dostarczone przez autora projektu. Style: `src/styles.css`, grafika: `src/render/tileArt.js`.

Materiały:

* ISDR – Symulator prowadzenia ruchu kolejowego, dokumentacja użytkownika (symulator.isdr.pl/download/dokumentacja.pdf)
* Beskidzka Strona Kolejowa – Pulpity nastawcze i plany świetlne (bsk.isdr.pl/usrk_pulpity.php)
* transportszynowy.pl – Urządzenia elektryczne przekaźnikowe; Blokada liniowa i zapowiadanie pociągów
* Instrukcja sygnalizacji Ie-1 (E-1), PKP PLK – obrazy sygnałowe S1–S5, S10–S13, Ms1/Ms2, Sz
* Instrukcja o prowadzeniu ruchu pociągów Ir-1 (R-1), PKP PLK – § o blokadzie półsamoczynnej, pozwolenia, potwierdzenia
* Instrukcja Ie-10 (E18) – obsługa urządzeń przekaźnikowych
* automatyka.ndl.pl – opis blokady Eap; trainbrains.eu – elementy i obsługa blokady Eap
* Chyba A., „Symulator komputerowy przekaźnikowego systemu (typu E) sterowania ruchem kolejowym…”, Zeszyty SITK RP nr 158 (2011)

Kolory lampek na kostkach (za opisami pulpitów typu E): żółte – położenie zwrotnicy,
białe – utwierdzenie przebiegu, czerwone – zajętość odcinka.

## Gdynia Główna

Układ torowy, numery rozjazdów i nazwy sygnalizatorów stacji Gdynia Główna (`src/stations/gdynia-glowna.js`)
pochodzą z planu schematycznego stacji (stan: październik 2024, rys. Adrian Karwat) dostarczonego przez autora projektu.
Pulpit jest schematem 45°, nie mapą: odwzorowano okręg pasażerski (tory 1–10 i 501/502, głowice, linie 202/250/201),
pominięto grupy odstawcze (GO1/GO2, tory 26–29, 35–38, 503), Gdynię Postojową (960) i tory 21/22/24 rejonu wschodniego.
Blokady liniowe modelowane jako dwukierunkowe (Eap), rozkład jazdy jest fikcyjny, wzorowany na realnym ruchu.

## Gdynia Orłowo

Układ torowy stacji Gdynia Orłowo (`src/stations/gdynia-orlowo.js`) pochodzi z planu schematycznego stacji
(stan: kwiecień 2024) dostarczonego przez autora projektu: tory 1/2 (peron II), 3, 4, 6 (Baza EZ Sopot), SKM 501/502
(peron I), bocznica 18 z wykolejnicą Wk11, rozjazdy 1–7, 25, 26, 31–37 i S1/S2, S51–S54, semafory A/B, C–F, G–K, L/M,
A501/A502, C501/D502, T501/T502, P/R oraz tarcze Tm1, Tm2, Tm4, Tm11–Tm14. Tarcze Tm3 (koniec toru 4 od Gdyni)
i Tm5/Tm6 (tor 2 za rozjazdem 37) dodano na potrzeby manewru tor 4 → tor 6 przez rozjazdy 25/26 – na planie nie
są oznaczone. Blokady liniowe modelowane jako dwukierunkowe (Eap), rozkład jazdy fikcyjny.

## Gdynia Chylonia

Układ torowy stacji Gdynia Chylonia (`src/stations/gdynia-chylonia.js`) pochodzi z planu schematycznego stacji
(stan: październik 2024, rys. Adrian Karwat) dostarczonego przez autora projektu: tory 502/501 (peron I SKM), 2/1 (peron II),
3 (peron III), tory odstawcze 21/22 za skrzyżowaniem rozjazdów 21–26, tor 503, bocznica 51, linie 964 (Gdynia Postojowa,
tylko manewry, tarcza T57m) i 723 (Gdynia Port, semafor P). Rozjazdy 1–16 i 21–42, semafory A–D, E…/G502/F501/M…,
A502/A501/A503, U/T/S/R/P oraz tarcze Tm1–Tm4, Tm6, Tm21, Tm22, Tm25–Tm27, Tm31, Tm32 wg planu.
Uproszczenia: tor 1 wpięty w tor 2 rozjazdem 30 (bez przejścia 30–31 na tor 501), rozjazd krzyżowy 38 (ciąg 37 → 38 → 39)
jako dwie zwrotnice 38a/38b, pominięto semafor L502 i tarcze T21/T22 przy kozłach torów 21/22 oraz sygnalizatory
samoczynnej blokady liniowej (239–253, 280). Blokady liniowe modelowane jako dwukierunkowe (Eap), rozkład jazdy fikcyjny.

## Rumia

Układ torowy stacji Rumia (`src/stations/rumia.js`) pochodzi z planu schematycznego stacji (stan: styczeń 2020,
rys. Adrian Karwat) dostarczonego przez autora projektu: od Gdyni linia 202 (tory 2/1, peron II) i linia 250 SKM
(tory 5/3, peron I na torze 5), w kierunku Redy tylko linia 202; tory 4 i 6 (zdawcze/towarowe), tor 8 (plac ładunkowy
za wykolejnicą Wk1), żeberko 13; rozjazdy 1–10, 31–38 (skrzyżowanie torów 2–5 i 4–3 w głowicy zachodniej), semafory
A/A2 od Gdyni, R od Redy, C/D/E/F (wyjazdowe torów 5/3/2/6 na zachód), G311/D312 (na szlaku, drugi stopień wyjazdu),
K/M/N/O (wyjazdy na wschód) oraz tarcze Tm5/Tm6. Uproszczenia: skrzyżowania rozjazdów jako pary zwrotnic
(2/4/3/5, 7/7a, 8a/8b), pominięto sygnalizatory blokady samoczynnej na szlakach od Gdyni, wyjazdy na wschód tylko
na tor 1 szlaku do Redy (tor 2 jest wjazdowy), rozkład jazdy fikcyjny (SKM co 15 min, regionalne, IC/TLK, towarowe).

## Reda

Układ torowy stacji Reda (`src/stations/reda.js`) pochodzi z planu schematycznego stacji (stan: styczeń 2020,
rys. Adrian Karwat) dostarczonego przez autora projektu: linia 202 (tory 2/1, peron II), tor 4, tor 3 z peronem I
(na planie wschodnia część toru 3 nosi numer 23), tor 11 (peron Ia, tor czołowy dla wahadeł do Helu), tory ładunkowe
7/9 (droga ładunkowa), bocznice 106/108 (i 109 do Prefabetu), bocznica Transbud za rozjazdem 51 z wykolejnicą Wk1;
rozjazdy 1–9, 16, 18–25, 27–29, 31, semafory A (od Rumi), S (od Wejherowa), R (od Helu, linia 213), wyjazdowe C1, C2, D,
E na zachód, K2, K4, L, M, P na wschód, sygnalizatory Szn1/Szn2 na torach wyjazdowych szlaków 202, tarcze ostrzegawcze
ToA/ToS/ToR, wykolejnice Wk1, Wk2, Wk4, Wk5. Uproszczenia: rozjazd krzyżowy 25 jako para 25a/25b; tory 106/108 jako
jeden tor 106 bez rozjazdu 19 i toru 109; rozjazd 51 i tor 27 z Wk5 pominięte; semafor R2/m przy peronie 1
(niejednoznaczny na planie) pominięty; dodane tarcze Tm7 (bocznica Transbud) i Tm20 (łuk 20–24), których plan nie
pokazuje – bez nich tory 7/9 i 106 byłyby nieosiągalne; tory szlakowe 202 jednokierunkowe; rozkład jazdy fikcyjny.

## Sopot

Układ torowy stacji Sopot (`src/stations/sopot.js`) pochodzi z planu schematycznego stacji (stan: czerwiec 2023,
rys. Adrian Karwat) dostarczonego przez autora projektu: grupa zachodnia (tory 6, 2a, 4, 1a z kozłami 6b/6a, 4b/4a),
peron II (tory 2/1, długości 468/764 i 468/578 m), peron I SKM (502a/501a), tor 13 z wykolejnicą Wk7 i tarczą Tm13,
rozjazdy 1–8, 32–38, 40, 41, 41–45, 51–54, semafory A/B, C–F, G–K, M/L, O/P, R/S, A502/A501, L502/L501, R502/R501,
S502/S501 oraz tarcze Tm1–Tm3, Tm11, Tm13. Przejazd pociągu linią 202 to trzy kolejne przebiegi (np. A → H → O → szlak),
tak jak na planie. Uproszczenia: numer 41 występuje na planie dwukrotnie (głowica 202 i grupa SKM) – zwrotnica przy
torze 13 ma id `Zw41s`; pominięto sygnalizatory blokady samoczynnej (82–83, 101–108, 121–132), tarczę T13 i tarcze
ostrzegawcze; p.o. Sopot Wyścigi jest tylko opisem na odcinku zbliżania linii 250. Blokady dwukierunkowe (Eap),
rozkład jazdy fikcyjny.

## Blokada liniowa na monitorze i blokada samoczynna

Na komputerowych stanowiskach obsługi stan blokady liniowej nie jest osobnym polem z lampkami (to element
pulpitu kostkowego z blokadą Eap), lecz zobrazowaniem przy wyjeździe na szlak: strzałka kierunku blokady,
zajętość odstępu (tor szlakowy na czerwono) i znaczniki żądania / potwierdzenia; polecenia (żądanie, pozwolenie,
potwierdzenie przyjazdu, zmiana kierunku, zwolnienia doraźne) wydaje się z menu elementu, a zwolnienia doraźne
są rejestrowane w dzienniku zdarzeń i licznikach systemu, nie przy blokadzie. Tak jest w grze;
geometria symbolu (strzałka szlaku, strzałka kierunku nad torem, napis stanu) jest własna, w duchu Ie-104.

Linie 202 (Gdańsk – Gdynia) i 250 (SKM) są dwutorowe z samoczynną blokadą liniową (SBL) – bez pozwoleń
i bez Ko; po modernizacji blokada jest dwukierunkowa (jazda po torze lewym po zmianie kierunku). Dlatego szlaki
Sopotu, Orłowa, Chyloni i Gdyni Głównej mają `block: 'sbl'` z kierunkiem zasadniczym wg numeracji torów
(tor 1 / 501 – w stronę Gdyni, tor 2 / 502 – w stronę Gdańska). Linie jednotorowe do Gdyni Port (723) i Wielkiego
Kacka (201) zostały z blokadą półsamoczynną. Stacja fikcyjna Szkolna ma Eap – celowo, bo uczy
pozwoleń.

## Stanowisko komputerowe – zgodność z Ie-104

Standardem dla komputerowych stanowisk obsługi w PKP PLK są wytyczne **Ie-104** („Wytyczne w zakresie zobrazowania,
wprowadzania poleceń oraz rejestracji zdarzeń dla komputerowych stanowisk obsługi urządzeń srk”, z załącznikami
Ie-104.1 – symbole i kolory, Ie-104.2 – polecenia) oraz instrukcja **Ie-20** (obsługa komputerowych urządzeń srk).
Serwis plk-sa.pl nie był dostępny z tego środowiska; treść wytycznych ustalono z ich streszczeń i cytowań
(wyszukiwarka, dokumentacja SCS-1 TD2 i opisy stanowisk EbiScreen/SimRail wzorowanych na Ie-104). Zastosowano:

* odcinki toru (tab. 8 Ie-104): szary – stan podstawowy, czerwony – zajęty, zielony – utwierdzony w przebiegu
  pociągowym, żółty – w przebiegu manewrowym, fioletowy – zwalnianie czasowe, podwójna szara linia – tor zamknięty,
  biały – brak danych;
* sygnalizatory (lista stanów wg malejącego priorytetu): biały – brak danych, biały migający – sygnał zastępczy,
  zielony – sygnał zezwalający dla pociągu, żółty – zezwalający na manewry, czerwony – sygnalizator początkowy lub
  końcowy utwierdzonego przebiegu, różowy – zamknięty indywidualnie, szary – stan podstawowy; mały trójkąt końca
  przebiegu (Ie-104.1); symbol semafora jako podwójny grot z żółtą nazwą (EbiScreen), rysowany na linii toru w miejscu ustawienia – bez masztu i bez odsunięcia od toru (uproszczenie dla czytelności, jak w SimRail);
* zwrotnica: pole „Z” (kształt – położenie iglic / brak kontroli, kolor – stan) i ramiona a/b/c, „+” przy ramieniu
  położenia zasadniczego, różowy – zamknięcie indywidualne, seledynowe numery (EbiScreen);
* grupa G4 (stany operacyjne): niebieska ramka – element wybrany, migająca podczas nastawiania przebiegu,
  czerwona migająca – alarm elementu; czerwone kasetki numerów pociągów; czarne tło;
* polecenia (Ie-104.2 / EbiScreen): pasek poleceń (rodzaj → element początkowy → końcowy), polecenia specjalne
  inicjowane i potwierdzane, rejestrowane w licznikach, odwołanie OPS.

Numery torów są rysowane w ramkach „tor N” na linii toru, perony jako szare prostokąty z nazwą i podwójną kreską na krawędzi peronowej – jak na pulpitach nastawczych (numeracja rzymska,
jak w nomenklaturze PKP: peron I, II; tory arabskie). Polecenia w menu elementów mają formę rzeczownikową zgodną
z terminologią Ie-1 / Ir-1 (nastawienie przebiegu, zwolnienie przebiegu, danie pozwolenia, zwolnienie bloku końcowego,
podanie sygnału zastępczego, przestawienie zwrotnicy, zamknięcie indywidualne).

Nieodwzorowane lub uproszczone: stany „ciemnoczerwony – w ochronie bocznej”, „turkusowy – nastawianie miejscowe”,
dokładna geometria symbolu blokady wg Ie-104.1 (własna: strzałka szlaku, strzałka kierunku, napis stanu), dokładne
skróty poleceń EbiScreen (ZD, ZDM, ZW, ZWP, SZP, NSZ, WTAB, KTAB – nazwy własne producenta, w symulatorze opisowe),
tabele zdarzeń i alarmów u dołu ekranu (rolę pełni zakładka Dziennik).

## Systemy srk stacji – stan rzeczywisty

Ustalenia (wyszukiwarka; serwisy źródłowe częściowo niedostępne z tego środowiska):

* **Gdynia Główna** – nastawnia dysponująca GO to od 2013 r. Lokalne Centrum Sterowania z komputerowym systemem
  Bombardier (Ebilock 950, stanowiska z monitorami, cztery komputery zależnościowe, dwa czynne i dwa rezerwowe);
  istnieje nastawnia wykonawcza GO2. Tory SKM – nastawnia zdalnego sterowania GG-SKM (PKP SKM). W grze: `komputerowe`,
  okręgi GO/GO2 zachowane jako podział stanowisk.
* **Sopot** – po modernizacji E65 (LCS Gdańsk / LCS Gdynia, 2011–2015) zwrotnice stacji są sterowane zdalnie z LCS Gdynia,
  dawna nastawnia „Sp” zlikwidowana, „Sp1” pełni rolę rezerwową; tory SKM – obiekt zdalnego sterowania „Sp-SKM”
  nastawni G-SKM w Gdańsku Głównym. W grze: `komputerowe`, obsługa na miejscu (uproszczenie).
* **Gdynia Orłowo** – część dalekobieżna zmodernizowana w 2014 r. (nowe urządzenia srk; w projekcie E65 dla obszaru
  LCS Gdynia: Ebilock 950 ze sterownikami STC i licznikami osi w miejsce urządzeń przekaźnikowych); tory SKM – obiekt
  zdalnego sterowania „GOr-SKM”. W grze: `komputerowe`.
* **Gdynia Chylonia** – odcinek Gdańsk Główny – Gdynia Chylonia zmodernizowany w latach 2012–2014 (wymiana srk, obszar
  LCS Gdynia); PKP SKM przebudowała urządzenia toru 250 na komputerowe włączone do systemu zdalnego sterowania
  i kierowania dyspozytorskiego Gdynia Główna SKM. Modernizacja Chylonia–Słupsk (2023–2025) przewiduje komputerowe srk.
  W grze: `komputerowe`.
* **Rumia** – plan z I 2020 pokazuje jeszcze urządzenia przekaźnikowe typu E z nastawniami „Rm” (dysponująca)
  i „Rm1” (wykonawcza, głowica od Redy); modernizacja linii 202 Gdynia Chylonia – Słupsk (od 2020, w tym Rumia)
  zastępuje je urządzeniami komputerowymi. Nie udało się potwierdzić w źródłach, czy przebudowa w Rumi jest
  zakończona, dlatego w grze stacja ma `srk: 'E'` (pulpit kostkowy, zgodny z planem) i drugą zmianę na stanowisku
  komputerowym (stan po modernizacji); jedno stanowisko na całą stację.
* **Reda** – plan z I 2020 pokazuje urządzenia przekaźnikowe typu E z nastawniami „Rd” (dysponująca, głowica
  wschodnia) i „Rd1” (zachodnia); stacja leży na modernizowanym odcinku Gdynia Chylonia – Słupsk linii 202. Jak
  w Rumi: w grze `srk: 'E'` z drugą zmianą na stanowisku komputerowym; jedno stanowisko na całą stację.
* **Szkolna** – stacja fikcyjna, treningowa: stanowisko komputerowe albo pulpit kostkowy typu E (misje i dwie pełne zmiany).
* Dawne stacje fikcyjne Stare Pustkowie i Wola Pustkowska zostały jako stacje testowe w `tests/fixtures/`.

Uproszczenie wspólne: w rzeczywistości tory linii 250 (PKP SKM) i linii 202 (PKP PLK) na tych stacjach obsługują
różne nastawnie różnych zarządców; w symulatorze jedno stanowisko prowadzi całą stację.

Źródła: trojmiasto.pl (2013) „Poznaj największą nastawnię kolejową w Trójmieście”; bazakolejowa.pl – Gdynia Główna;
wikimapia – Nastawnia „Sp” Sopot; docplayer – projekt wykonawczy TG-7 stacja Gdynia Główna (E65); rynek-kolejowy.pl –
przetarg PKP SKM na przebudowę srk Gdynia Chylonia; gov.pl – załącznik do umowy PKP SKM (posterunki linii 250);
Wikipedia – linia kolejowa nr 202, stacja Gdynia Orłowo; PKP PLK – projekt E65 LCS Gdańsk/LCS Gdynia.
