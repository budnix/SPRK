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

## Urządzenia przekaźnikowe typu IZH-111 (JZH-111)

Źródło: Beskidzka Strona Kolejowa – „Urządzenia typu JZH-111” (bsk.isdr.pl/srk_izh111.php); plany ciemne i półciemne:
transportszynowy.pl – „Urządzenia elektryczne przekaźnikowe”. Z opisu wzięto:

* podział przycisków na **adresowe** (przy zwrotnicach, sygnalizatorach, blokadach – wybór elementu, także początku
  i końca przebiegu) i **rozkazu** (grupa poza obrazem układu torowego); przyciski na środku kostki;
* przebieg: adres sygnalizatora początkowego, adres końcowego i rozkaz „P” albo „M”; przebieg złożony z kilku
  elementarnych wymaga tylko początku i końca; inny wariant wybiera zwrotnica zamknięta przyciskiem „STOP”;
* zwrotnica: adres i „+” albo „−”; „STOP” – zamknięcie (czerwona lampka, szczeliny świecą na stałe), „Zw” –
  odwołanie zamknięcia; zwrotnice w przejściach nie są sprzężone;
* zwalnianie: „Zcz” z adresem semafora końcowego – po 120 s, lampka przy przycisku miga na biało; przebieg manewrowy
  – „Zw”, bezzwłocznie; sygnał zastępczy rozkazem „Sz”, rejestrowany licznikiem;
* **pulpit ciemny**: lampki w stanie zasadniczym wygaszone; powtarzacze bez lampki sygnału zabraniającego (zielona
  i biała, tarcze – tylko biała); szczeliny zwrotnic ciemne, położenie widać po obsłużeniu przycisku adresowego oraz
  przy utwierdzeniu lub zajętości odcinka; rozprucie – szczeliny migają na czerwono, niespodziewany brak kontroli –
  obie szczeliny migają na biało.

Uproszczenia i założenia w grze (`src/srk/address.js`, `src/render/IzhRenderer.js`):

* adres i rozkaz na pulpicie wciska się jednocześnie; w grze adres zostaje wybrany na 10 s, a rozkaz go zużywa
  (czas przyjęty – źródło go nie podaje);
* pominięte rozkazy: „RZ” (kasowanie rozprucia – w grze rozprucie kasuje się po przestawieniu zwrotnicy), „IZ”
  (przestawienie przy odcinku wykazującym zajętość), „NSz”, „S”, „Ln”, „Rm” oraz grupowy przycisk podświetlenia zwrotnic;
* sygnał zastępczy świeci przez czas z zależności (90 s), a nie „w czasie trzymania przycisków”; na pulpicie pokazuje
  go migająca biała lampka (przyjęte);
* barwa szczelin zwrotnicy pokazującej położenie po wybraniu adresu – biała (przyjęte; źródło mówi tylko, że świecą);
* sygnalizacja wybranego przebiegu (krótkie szczeliny przy przyciskach migające na biało) jest zastąpiona
  podświetleniem wybranych przycisków adresowych;
* blokada liniowa: kostki i przyciski jak na pulpicie typu E (źródło: „stosowane są dodatkowe przyciski rozkazu
  odpowiednie do danego typu blokady” – bez szczegółów); kostki toru, rama i perony wspólne z pulpitem typu E;
* doraźnego zwolnienia przebiegu z licznikiem (dPz) na tym pulpicie nie ma – przebieg, w który pociąg wjechał,
  rozwiązuje się odcinkowo;
* żadna rzeczywista stacja w grze nie ma tych urządzeń – pulpit jest dostępny na fikcyjnych stacjach treningowych
  (Zacisze – misja 3, zmiany na Szkolnej i Jodłowej); misja zaczyna się rozgrzewką z rozkazami „−”, „+”, STOP, Zw
  i Zcz, potem uczy wjazdów na tory czołowe i wyjazdów rozkazem P.

## Urządzenia mechaniczne scentralizowane (nastawnia mechaniczna)

Źródła: Instrukcja E16 – obsługa urządzeń srk mechanicznych scentralizowanych i kluczowych (rozdz. 2 „Opis urządzeń”,
rozdz. 3 „Obsługa urządzeń”); Instrukcja Ie-8 (rozdz. 2 „Urządzenia nastawcze mechaniczne scentralizowane”) – tekst
za kolej.krb.com.pl; transportszynowy.pl – „Urządzenia mechaniczne scentralizowane”. Z opisu wzięto:

* nastawnica = ława z dźwigniami nastawczymi, podstawa blokowa z **drążkami przebiegowymi** i **aparat blokowy**
  (Ie-8 §5 ust. 7, §9 ust. 2);
* barwy trzonów dźwigni: zwrotnicowe i wykolejnicowe – niebieskie, semaforowe – czerwone, tarcz manewrowych –
  niebieskie z czerwoną obwódką; dźwignia ma położenie zasadnicze (górne) i przełożone (dolne) (Ie-8 §6 ust. 4;
  transportszynowy.pl);
* kolejność przy przygotowaniu drogi przebiegu: zwrotnice i wykolejnice dźwigniami (także ochronne), potem drążek
  przebiegowy – „wolno przekładać do położenia przełożonego dopiero po wykonaniu wszystkich czynności” i nie da się
  go przełożyć przy niewłaściwym położeniu dźwigni; przełożony drążek zamyka zwrotnice przebiegu i wyklucza przebiegi
  sprzeczne (E16 §8 ust. 8–9, §9 ust. 5; Ie-8 §8 ust. 3);
* **blok przebiegowy utwierdzający** (na prąd stały) „należy zablokować przed przełożeniem dźwigni sygnałowej”;
  zwalnia go pociąg przez urządzenie oddziaływania, wyjątkowo pracownik – plombowanym zwalniaczem (E16 §8 ust. 19,
  §9 ust. 12); okienko bloku stacyjnego w położeniu zasadniczym jest czerwone, białe – gdy wolno prowadzić ruch na
  sygnał zezwalający (Ie-8 §9 ust. 9–10);
* sygnał zezwalający – przełożeniem dźwigni sygnałowej; przy sygnalizacji świetlnej dźwignia jest dwupołożeniowa,
  a obraz sygnału ustala się elektrycznie (Ie-8 §14 ust. 10); dźwignię przekłada się na „Stój” po przejściu pociągu;
  sygnał zezwalający wyświetla się dla jazdy tylko raz (zawórka przeciwwtórna) (E16 §8 ust. 10, §9 ust. 3 pkt 5);
* drążek wolno cofnąć dopiero, gdy pociąg minął miejsce końca pociągu, semafor jest na „Stój” i nastąpiło zwolnienie
  przebiegu (E16 §8 ust. 11);
* zwrotnic nie wolno przestawiać pod taborem; dźwignie zwrotnic izolowanych przekłada się, gdy odcinek jest wolny
  (E16 §8 ust. 14, §9 ust. 3 pkt 4); tarcze manewrowe nastawia się dźwigniami typu zwrotnicowego, zamykanymi
  drążkami przebiegowymi (Ie-8 §6 ust. 13);
* urządzenia mechaniczne współpracują z półsamoczynną blokadą liniową przekaźnikową, obsługiwaną przyciskami
  (E16 §7 ust. 7, §9 ust. 7).

Uproszczenia i założenia w grze (przyjęte – źródła ich nie podają albo gra upraszcza obsługę):

* jedna nastawnia dysponująca prowadzi całą stację – bez bloków nakazu i zgody między nastawniami;
* sygnalizacja świetlna (obrazy jak na innych stanowiskach), nie semafory kształtowe;
* drążek przebiegowy należy do jednego sygnalizatora początkowego i obsługuje najwyżej dwa przebiegi (położenia
  „w górę” i „w dół”, jak drążek z dwoma przebiegami sprzecznymi); sygnalizator z większą liczbą przebiegów ma
  kolejne drążki;
* dźwignia zwrotnicowa przestawia zwrotnicę w 2 s (czas przyjęty – pędnia drutowa działa od razu);
* przebieg manewrowy nie ma bloku przebiegowego utwierdzającego: drążek i dźwignia tarczy;
* ręczne zwolnienie bloku (zwalniacz, plomba) liczy licznik jak dPz i kosztuje punkty jak dPz – bez kary, gdy blok
  nie zwolnił się przez usterkę urządzenia oddziaływania pociągu (usterka `route-block`, misja 4; E16 §8 ust. 19);
* sygnał zastępczy – klawisz przy aparacie blokowym z licznikiem, jak na innych stanowiskach;
* plan świetlny pokazuje zajętość odcinków, powtarzacze sygnałów i blokadę liniową; położenie zwrotnic widać
  na dźwigniach (na planie świetlnym go nie ma).
* ława leży pod całym planem i nie dzieli się na ekrany – przy podziale szerokiego pulpitu na ekrany (ustawienie
  „ekrany”) byłaby przycięta; stacje z nastawnią mechaniczną są wąskie, więc podziału nie potrzebują.

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

## Tczew

Układ torowy stacji Tczew (`src/stations/tczew.js`) pochodzi z planu schematycznego stacji (stan: sierpień 2012,
rys. Adrian Karwat) dostarczonego przez autora projektu: część pasażerska – tory 10/8 (peron 1), 6 (peron 2), 4, 2/1
(peron 3), 3, 5/7 (peron 4), 9, 11, 13, 15, semafory wyjazdowe K1–K15 (na zachód) i M1–M15 (na wschód), wjazdowe A1/A2
(131 od Górek, blokada samoczynna 4955/4956), E1/E2 (9 od Szymankowa, SBL 2928/2929), S/T (9 od Pszczółek, SBL
2990/2991), U/W (203 od Malinowa), P/R (726 od Zajączkowa ZTA), Z (728 od Zajączkowa ZTB), O (727 od Malinowa podg),
nastawnia dysponująca „Tw”. Odwzorowanie schematyczne jak dla Gdyni Głównej: głowice jako drabiny z numerami rozjazdów
przybliżonymi do planu (20–24, 26/27, 30–46 na zachodzie; 60–89 na wschodzie), rozjazdy krzyżowe i skrzyżowania
głowic pominięte. Pominięto: tory 101–103 z semaforami C1/G1–G3 (połączenie z Tczewem Postojowym), linię 727,
tor 17, grupy torów towarowych 15x/20x/30x/40x/50x, bocznice i tarcze manewrowe głowic, semafory jazd po torze lewym
(A2, E2, D1, D2, T, R, W). Tory 7–15 wyjeżdżają na wschód tylko do Zajączkowa, tory 3–15 na zachód tylko do
Szymankowa. Rozkład jazdy fikcyjny.

## Pruszcz Gdański

Układ torowy stacji Pruszcz Gdański (`src/stations/pruszcz-gdanski.js`) pochodzi z planu schematycznego stacji
(stan: grudzień 2014, rys. Adrian Karwat) dostarczonego przez autora projektu (skan w małej rozdzielczości – część
opisów odczytana w przybliżeniu): tory 6, 4/2 (peron 1), 1/3 (peron 2), 5, 7, tor 18 (plac ładunkowy), semafory
wyjazdowe E1–E7 (na zachód) i G1–G7 (na wschód), wjazdowe B/C (9 od Pszczółek, SBL 3140/3141), D (260 od Zajączkowa
Tczewskiego), S/T (9 od Gdańska Południowego, SBL 3209/3210), R (226 od Gdańska Portu Północnego przez Motławę Most /
Gdańsk Olszynkę), odgałęzienie linii 229 (Stara Piła) w głowicy zachodniej, nastawnia „PrG”. Odwzorowanie
schematyczne: głowice jako przejścia między sąsiednimi torami (rozjazdy 1–14 i 41–54 przybliżone do planu).
Pominięto: tory 2a/1a/3a/4a i 2b/1b/3b z semaforami H i pośrednimi za głowicą wschodnią, skrzyżowanie 71–76, tor 18,
tor 6a, bocznice, tarcze manewrowe i wykolejnice głowic, semafory jazd po torze lewym; linia 226 jako jeden tor
dwukierunkowy, semafor wjazdowy od Starej Piły nazwany P (na planie tylko tarcza ToP). Rozkład jazdy fikcyjny.

## Gdańsk Główny

Układ torowy stacji Gdańsk Główny (`src/stations/gdansk-glowny.js`) pochodzi z planu schematycznego stacji (stan:
styczeń 2022, rys. Adrian Karwat) dostarczonego przez autora projektu: tory 4/2 (peron 1), 1/3 (peron 2), SKM 502/501
(peron 3), czołowe 7/9 (peron 4), 11, 13/15 (peron 5), 17–21 (peron 6); semafory wjazdowe A/B (9 od Gdańska
Południowego), A502/A501 (od p.o. Gdańsk Śródmieście), G/F (202 od Wrzeszcza), N/O (250 SKM od Wrzeszcza), H (227 od
Zaspy Towarowej), M (249 od Brzeźna); wyjazdowe K/L, C1–C4, D501/D502, E1–E4, E501/E502, F501/F502, F7/F9/F13/F15,
B/C 501/502 przy p.o. Śródmieście; nastawnie „G” (LCS Gdańsk) i „G-SKM”. Odwzorowanie schematyczne części pasażerskiej
(głowice jako przejścia między sąsiednimi torami, numery rozjazdów przybliżone do planu). Pominięto: peron 6 (tory
17–21), tory 4a/20/22/3b/1b, zespół bocznic (308/310/120/314), p.o. Gdańsk Stocznia, tarcze manewrowe i wykolejnice
głowic, semafory A/K/L (jazdy po torze lewym linii 9) oraz B502/B501 i C502/C501 (odcinek do Śródmieścia jako szlak);
tor 11 dostał semafor F11 (na planie bez semafora). Rozkład jazdy fikcyjny.

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
* **Tczew** – plan z VIII 2012 pokazuje urządzenia przekaźnikowe (nastawnia dysponująca „Tw” i nastawnie wykonawcze);
  w ramach modernizacji linii 9 (E65, LCS Tczew) stacja otrzymała urządzenia komputerowe. W grze: `komputerowe`
  (tylko stanowisko komputerowe, bez pulpitu kostkowego); jedno stanowisko na całą część pasażerską.
* **Pruszcz Gdański** – plan z XII 2014 (nastawnia „PrG”); po modernizacji linii 9 (E65) stacja jest sterowana
  z LCS Gdańsk urządzeniami komputerowymi. W grze: `komputerowe` (tylko stanowisko komputerowe).
* **Gdańsk Główny** – od modernizacji E65 (LCS Gdańsk, nastawnia „G”) urządzenia komputerowe; tory SKM prowadzi
  nastawnia „G-SKM” (PKP SKM). W grze: `komputerowe`, jedno stanowisko na całą część pasażerską.
* **Szkolna**, **Jodłowa**, **Zacisze**, **Olszyny** – stacje fikcyjne, treningowe (misje 1–4); każda ma zmiany na
  wszystkich czterech stanowiskach. Układ torów Jodłowej jest taki jak stacji testowej Wola Pustkowska.
* Dawne stacje fikcyjne Stare Pustkowie i Wola Pustkowska zostały jako stacje testowe w `tests/fixtures/`.

Uproszczenie wspólne: w rzeczywistości tory linii 250 (PKP SKM) i linii 202 (PKP PLK) na tych stacjach obsługują
różne nastawnie różnych zarządców; w symulatorze jedno stanowisko prowadzi całą stację.

Źródła: trojmiasto.pl (2013) „Poznaj największą nastawnię kolejową w Trójmieście”; bazakolejowa.pl – Gdynia Główna;
wikimapia – Nastawnia „Sp” Sopot; docplayer – projekt wykonawczy TG-7 stacja Gdynia Główna (E65); rynek-kolejowy.pl –
przetarg PKP SKM na przebudowę srk Gdynia Chylonia; gov.pl – załącznik do umowy PKP SKM (posterunki linii 250);
Wikipedia – linia kolejowa nr 202, stacja Gdynia Orłowo; PKP PLK – projekt E65 LCS Gdańsk/LCS Gdynia.
