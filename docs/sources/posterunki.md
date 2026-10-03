# Posterunki, służba i mapa

Część opisu źródeł – indeks i zasady zapisu: [`docs/SOURCES.md`](../SOURCES.md).

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
  Szkolna (przyjęte): tarcza Tm2 stoi na złączu T2e | T2, tam gdzie semafor D2 w drugą stronę – przebieg Tm1 → Tm2
  kończy się na T2e, a 180-metrowy skład jedzie dalej przebiegiem Tm2 → C2 przez tor 2. Wcześniej Tm2 stała kostkę
  dalej, wewnątrz odcinka T2: przebieg do niej utwierdzał cały tor 2 aż do C2, a przebieg Tm2 → C2 nie miał odcinków.
* Dawne stacje fikcyjne Stare Pustkowie i Wola Pustkowska zostały jako stacje testowe w `tests/fixtures/`.

Uproszczenie wspólne: w rzeczywistości tory linii 250 (PKP SKM) i linii 202 (PKP PLK) na tych stacjach obsługują
różne nastawnie różnych zarządców; w symulatorze jedno stanowisko prowadzi całą stację.

Źródła: trojmiasto.pl (2013) „Poznaj największą nastawnię kolejową w Trójmieście”; bazakolejowa.pl – Gdynia Główna;
wikimapia – Nastawnia „Sp” Sopot; docplayer – projekt wykonawczy TG-7 stacja Gdynia Główna (E65); rynek-kolejowy.pl –
przetarg PKP SKM na przebudowę srk Gdynia Chylonia; gov.pl – załącznik do umowy PKP SKM (posterunki linii 250);
Wikipedia – linia kolejowa nr 202, stacja Gdynia Orłowo; PKP PLK – projekt E65 LCS Gdańsk/LCS Gdynia.

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

## Mapa wyboru posterunku (`src/ui/map/poland.js`, pola `region`, `geo`, `lines`)

* Kształty województw: Natural Earth, „Admin 1 – States, Provinces”, 1:10m (domena publiczna,
  https://www.naturalearthdata.com/about/terms-of-use/), uproszczone skryptem `scripts/poland-map.mjs` (adres pliku,
  suma SHA-256, tolerancja i rzut w nagłówku wyniku). Identyfikatory i nazwy województw jak w TERYT (`src/model/regions.js`).
* Współrzędne stacji (`geo`, sprawdzone 1.10.2026) – z artykułów polskiej Wikipedii o stacjach (szablon współrzędnych,
  zaokrąglenie do 4 miejsc, ok. 10 m): Sopot https://pl.wikipedia.org/wiki/Sopot_(stacja_kolejowa) 54,4408 / 18,5622;
  Gdynia Orłowo https://pl.wikipedia.org/wiki/Gdynia_Or%C5%82owo 54,4767 / 18,5490; Gdynia Chylonia
  https://pl.wikipedia.org/wiki/Gdynia_Chylonia 54,5456 / 18,4639; Gdynia Główna https://pl.wikipedia.org/wiki/Gdynia_G%C5%82%C3%B3wna
  54,5211 / 18,5294; Rumia https://pl.wikipedia.org/wiki/Rumia_(stacja_kolejowa) 54,5689 / 18,3867; Reda
  https://pl.wikipedia.org/wiki/Reda_(stacja_kolejowa) 54,5944 / 18,3533; Tczew https://pl.wikipedia.org/wiki/Tczew_(stacja_kolejowa)
  54,0978 / 18,7883; Pruszcz Gdański https://pl.wikipedia.org/wiki/Pruszcz_Gda%C5%84ski_(stacja_kolejowa) 54,2581 / 18,6469;
  Gdańsk Główny https://pl.wikipedia.org/wiki/Gda%C5%84sk_G%C5%82%C3%B3wny 54,3572 / 18,6444. Województwo (`region`) i linie
  (`lines`) – z opisu położenia stacji (`location`), tych samych źródeł co plan stacji.
* Sieć kolejowa Polski w małym przybliżeniu (`src/ui/map/railOverview.js`): Natural Earth, „Railroads” 1:10m (domena
  publiczna), skrypt `scripts/rail-overview.mjs` (suma SHA-256 pliku źródłowego w nagłówku wyniku).
* Przebieg linii na schemacie województwa (`src/ui/map/railLines.js`): © autorzy OpenStreetMap
  (https://www.openstreetmap.org/copyright), Open Database License 1.0 – relacje `route=railway` z numerem linii PKP PLK
  w `ref`, pobrane przez Overpass API skryptem `scripts/rail-lines.mjs` (stan OSM, obszar i uproszczenie w nagłówku pliku;
  plik jest bazą pochodną na ODbL). Podpis źródła pod schematem w grze (`start.regionMapNote`).
* Przyjęte: linia bez relacji w OSM – odcinek prosty między kolejnymi posterunkami z gry tej linii (kolejność wzdłuż
  kierunku głównego rozkładu stacji); tory upraszczane do ok. 65 m; stacja może leżeć do 1 km od toru (współrzędne to
  budynek, linia kończy się w głowicy). Jak dodać miasto: `docs/MAP-DATA.md`.

## Służba o wybranej porze (`src/model/duty.js`)

Rozkłady stacji w grze obejmują ok. 2 h porannego szczytu. Ruch o innych porach **nie pochodzi z rzeczywistego rozkładu
jazdy** – powstaje z tego wzorca. Przyjęte (bez źródła):

* doba to powtórzenia rozkładu stacji co okres wzorca (rozpiętość rozkładu w pełnych godzinach – na stacjach w grze 2 h;
  pole `duty.period`); pociągi powtórzeń mają numery wzorca powiększone o 100 na okres (zajęty numer – następny wolny
  o tej samej parzystości), relacje jak we wzorcu (pociągi dalekobieżne – z listy pociągów z nazwami, niżej);
* pory doby (`DAY_BANDS`) i to, co z wzorca kursuje: szczyt poranny 6–9 i popołudniowy 14–18 – cały wzorzec; dzień 9–14
  – co drugi pociąg aglomeracyjny (SKM) i regionalny; wieczór 18–22 – co drugi pasażerski; późny wieczór 22–24 – co
  czwarty aglomeracyjny i regionalny, co drugi dalekobieżny; noc 0–4 – bez aglomeracyjnych i regionalnych, co czwarty
  dalekobieżny; świt 4–6 – co drugi pasażerski. Pociągi towarowe wzorca kursują przez całą dobę;
* w miejsce pociągu regionalnego albo dalekobieżnego, który o danej porze nie kursuje, wchodzi pociąg towarowy: w nocy
  w 60 % takich miejsc, późnym wieczorem 40 %, wieczorem 35 %, o świcie 25 %, w dzień 10 %, w szczytach wcale – jedzie
  drogą zastępowanego pociągu, bez postoju, z rodzajem, długością, masą i prędkością jednego z pociągów towarowych
  wzorca stacji (bez zdawczych i lokomotyw luzem), a gdy stacja ich nie ma – TM, 400 m, 1200 t, 80 km/h; numery od 46000.
  Wchodzi w wolną lukę w oknie ±30 min wokół miejsca zastępowanego pociągu (chwila z ziarna, w pełnych minutach): od
  innego pociągu na szlaku wjazdu i wyjazdu (na linii jednotorowej – w obu kierunkach) dzieli go co najmniej czas
  przejazdu szlaku i 3 min, od postoju innego pociągu na tym samym torze stacji – 3 min; najchętniej z zapasem 2 min
  ponad ten odstęp. Pociągi wzorca zostają na miejscu. Tak wstawia się dodatkowy pociąg do gotowego rozkładu w badaniach
  (pociąg towarowy w luce o największym najmniejszym odstępie – Ljunggren i in. 2021,
  https://ideas.repec.org/a/spr/pubtra/v13y2021i3d10.1007_s12469-020-00253-x.html; wolne przedziały na szlakach i torach,
  istniejące pociągi bez zmian – Dekker i in. 2024, https://arxiv.org/abs/2410.20561v1;
  planowy odstęp to odstęp najmniejszy i zapas – Wang i in. 2020, https://www.mdpi.com/1996-1073/13/7/1853); okno,
  zapas i losowanie chwili z ziarna – przyjęte. Na liniach aglomeracyjnych (SKM) pociągi towarowe nie wchodzą;
* urozmaicenie: 12 % pociągów (poza aglomeracyjnymi) w danej służbie nie kursuje, a o tym, który z co drugich / co
  czwartych kursów linii jedzie, decyduje ziarno zmiany – to samo ziarno daje ten sam rozkład;
* przesunięcie linii (`DUTY_SHIFT`): każdy kurs linii (klasa i para szlaków, oba kierunki razem) jedzie w danej służbie
  o tyle samo minut później – 0–3 min z ziarna; takt linii zostaje, a minuty i kolejność pociągów różnych linii
  zmieniają się między służbami. Pociąg, który przez inne przesunięcie innej linii wszedłby z nią w konflikt (wspólny
  szlak, tor), jedzie z przesunięciem tamtej linii albo bez przesunięcia; kurs, który z pełnym przesunięciem nie
  zmieściłby się w oknie służby, jedzie przesunięty o tyle, ile się mieści. Badanie wstawiania pociągów do gotowego
  rozkładu ogranicza w przykładach przesunięcie istniejących pociągów do 1–5 min (Tan i in. 2021,
  https://pp.bme.hu/tr/article/view/12920); losowanie przesunięcia z ziarna i liczba 3 min – przyjęte;
* skład, którego pociągi przechodzą w porę, w której ich klasa nie kursuje (pociąg regionalny z wieczora odjeżdżałby
  po północy), w tej służbie nie jedzie;
* otwarcie służby (`DUTY_OPENING`): pierwszy pociąg najpóźniej 5 min po najwcześniejszej chwili, w której może przyjechać
  pociąg od sąsiada wyprawiony po starcie; gdy pora doby przerzedziła wzorzec, wraca pociąg wzorca z tego okna, który
  wypadł (o ile jego klasa o tej porze kursuje), albo wchodzi pociąg towarowy – w wolne miejsce wzorca albo na
  najwcześniejszą chwilę na szlaku przelotowym (Reda 18:00: pierwszy pociąg bywał po 35–43 min);
* przejazdy służbowe (`SERVICE_RUNS`): w każdej godzinie służby z prawdopodobieństwem 30 % jeden przejazd spoza wzorca
  drogą przelotu pociągu wzorca, bez postoju, w wolnej luce tej godziny (jak pociąg towarowy wyżej) – lokomotywa luzem
  (20 m, 100 km/h), próżne wagony (TS, 400 m, 600 t, 80 km/h) albo próżny skład EZT (długość pociągu wzorca, 90 km/h);
  numery od 48000. Lokomotywa i wagony nie jadą po liniach aglomeracyjnych, skład EZT – tylko po liniach
  aglomeracyjnych i regionalnych o porze, w której ich pociągi kursują. Takie jazdy są we wzorcach stacji (lokomotywa
  luzem 44660 w Gdańsku Gł., próżne wagony 44631 w Tczewie, skład EZT 88301 z Bazy EZ Sopot w Gdyni Orłowie); udział
  30 % na godzinę i parametry – przyjęte;
* służba zaczyna się o pełnej godzinie i trwa 1, 2, 3 albo 5 h – także przez północ (23:00–02:00); pociąg od
  sąsiada wchodzi do służby, gdy sąsiad wyprawia go co najmniej 2 min po starcie (przyjazd nie wcześniej niż start
  + czas przejazdu szlaku + 90 s dojazdu do peronu + 2 min), pociąg bez wjazdu – 3 min po starcie; ostatnie zdarzenie
  co najmniej 10 min przed końcem;
* służba nie zostaje bez pociągów: gdy z doboru nie wyszedł żaden, wracają pociągi pominięte dla urozmaicenia, potem
  pociąg towarowy wchodzi w każde wolne miejsce, na koniec pojedynczy pociąg wzorca klasy, która o tej porze kursuje
  (inny kurs linii niż wynikałby z ziarna) – pociąg klasy niekursującej o tej porze nie wraca;
* powtórzenie pociągu dalekobieżnego to inny pociąg tej samej drogi – z nazwą i relacją z listy „Pociągi z nazwami”
  (niżej); pociąg wzorca o swojej porze zostaje bez zmian;
* ze źródeł pochodzi tylko ogólna obserwacja, że ruch pasażerski koncentruje się w szczytach dojazdów, a nocą linie są
  wolne dla ruchu towarowego – proporcje i liczby są wartościami gry;
* termin służby – typ dnia (przyjęte, bez źródła): w sobotę i w niedzielę albo święto szczyty mają zasady dnia (bez
  dojazdów do pracy i szkoły), w niedzielę świt – zasady późnego wieczoru; losowanie typu dnia jak w tygodniu (5 dni
  roboczych, sobota, niedziela), miesiąca – równo;
* termin służby – sezon nad morzem (`SEASIDE_SEASON`, ze źródła): oferta POLREGIO Gdynia/Reda – Hel w 2026 – do 42
  pociągów na dobę (21 par) w weekendy od 14 czerwca (korekta rozkładu), codziennie od 27 czerwca (początek wakacji) do
  końca sierpnia, w weekendy znów we wrześniu (do 27 września). Odpowiedź Ministerstwa Aktywów Państwowych na
  interpelację nr 17513 (7 lipca 2026), https://api.sejm.gov.pl/sejm/term10/interpellations/attachment/ATTDVUHGY/i17513-o1.pdf;
  zgodnie z nią trojmiasto.pl (5 czerwca 2026),
  https://www.trojmiasto.pl/wiadomosci/Wiecej-pociagow-na-Hel-W-czerwcu-wracaja-sezonowe-polaczenia-n220795.html. Liczba 42 to tylko pociągi POLREGIO i to „aż do” – rozkładu poza sezonem
  źródło nie podaje, więc w grze sezon to nie liczba pociągów, tylko to, że pociąg nad morze jedzie każdym kursem
  wzorca. Linia 213 Reda – Hel jest jednotorowa (mijanki tylko w Mrzezinie, Pucku, Władysławowie, Kuźnicy i Jastarni),
  a latem – wg tego samego źródła – w pełni wykorzystana: gra nie dodaje dróg, zmienia tylko, które kursy wzorca jadą.
  Miesiąc w kalendarzu gry: czerwiec i wrzesień – weekendy, lipiec i sierpień – codziennie (przybliżenie dat).
  Miejscowości nad morzem (`SEASIDE_TOWNS`) i to, że sezon obejmuje też pociągi dalekobieżne nad morze – przyjęte;
* termin służby – roboty torowe (`WORKS`, przyjęte, bez źródła): od kwietnia do października w 35 % służb, w marcu
  i listopadzie w 15 %, zimą wcale jeden tor stacji zamknięty na całą służbę; tylko tor drogi przelotowej, której
  pociągi mają jeszcze inny tor (powód: `docs/architecture/ruch.md`). Że roboty idą w roku wg okresów budowlanych i zmieniają rozkład (objazdy, dłuższe
  czasy jazdy, autobusy zastępcze), mówi komunikat PKP PLK o rozkładzie 2025/2026,
  https://www.plk-sa.pl/o-spolce/biuro-prasowe/informacje-prasowe/szczegoly/nowosci-w-nowym-rocznym-rozkladzie-jazdy-pociagow-2025-2026-11384
  – ale bez liczb dla Trójmiasta; udziały i to, że w grze to zamknięcie toru stacji, są wartościami gry;
* termin służby – zima (`WINTER`, `FROZEN_POINTS`, przyjęte, bez źródła): w grudniu, styczniu i lutym przy losowaniu
  usterek (poziom „małe” i „duże”) brak kontroli zwrotnicy po przestawieniu ma wagę 4, inne rodzaje 1 – marznące
  zwrotnice; liczba usterek bez zmian;
* termin służby – sezon przewozów (`FREIGHT_SEASON`, przyjęte): od września do listopada w 40 %, od grudnia do lutego
  w 30 % godzin służby dodatkowy pociąg towarowy w wolnej luce. Przegląd źródeł nie znalazł stałego rocznego rytmu
  przewozów do portów Gdyni i Gdańska – jedyny ślad to priorytet dla węgla zimą 2022/23 i zapowiedź priorytetu dla zboża
  wiosną 2023 (gazetaprawna.pl, https://www.gazetaprawna.pl/biznes/artykuly/11014802,kowalczyk-zboze-pkp-porty.html),
  czyli sytuacja kryzysowa, nie reguła; jesień (zboże) i zima (węgiel) jako sezon – wartości gry.

## Pociągi z nazwami (`src/model/data/namedTrains.js`, `scripts/named-trains.mjs`, `src/model/namedTrains.js`)

Ze źródła: pociągi PKP Intercity z nazwami w rozkładzie rocznym 2025/2026 z całej Polski – kategoria (EIP, EIC, IC,
TLK), numer, nazwa, stacja początkowa i końcowa z godzinami, ważniejsze stacje po kolei. Źródło: zestawienia pociągów
vagonweb.cz (https://www.vagonweb.cz/razeni/?rok=2026&zeme=PKPIC – lista kategorii i strona pociągu z polem „Trasa”;
trasa ma tam charakter orientacyjny, a pierwotnym źródłem jest rozkład jazdy PKP Intercity – portalpasazera.pl,
intercity.pl). Dla Pomorza porównane z komunikatem PKP Intercity o rozkładzie 2025/2026
(https://www.intercity.pl/pl/site/o-nas/dzial-prasowy/aktualnosci/nowe-mozliwosci-podrozy-z-pkp-intercity.-rozklad-jazdy-na-sezon-2025/2026-dla-wojewodztwa-pomorskiego.html):
EIC „Morskie Oko” Gdynia – Zakopane, IC „Lazur”, IC „Kuter”, IC „Zatoka”, TLK „Małopolska”, IC „Gwarek”, IC „Baltic
Express”. Plik jest generowany (`node scripts/named-trains.mjs`, opis w nagłówku skryptu) – po zmianie rozkładu rocznego
wystarczy uruchomić go z nowym rokiem; pociąg z trasą skróconą (bez stacji pośrednich w źródle) ma `partial`.

W grze: nazwa jest przypisana do trasy, więc pociąg z listy zastępuje powtórzenie pociągu dalekobieżnego wzorca tylko
wtedy, gdy jedzie tą samą drogą – przez miasto początku relacji wzorca, a potem przez miasto jej końca (`namedTrainsVia`;
miasto = nazwa stacji bez dopisku dworca, `cityOf`); pociąg, który na stacji kończy albo zaczyna bieg, zastępuje tylko
pociąg kończący / zaczynający w tym samym mieście. Pociąg EIP z listy zastępuje tylko pociąg EIP wzorca, a pociągi
wagonowe (EIC, IC, TLK) – siebie nawzajem: mają wspólną pulę taboru, wpis zachowuje długość wzorca, a prędkość
idzie za kategorią pociągu z listy (TLK 140, IC / EIC 160 km/h, o ile wpis nie ma własnego `vmax`) – nazwa EIP nie trafia
więc na skład wagonowy. Przyjęte: godzina – pociąg z listy jedzie w grze o porze powtórzenia
wzorca, nie o swojej rzeczywistej; kolejność doboru nazw (z numeru wzorca i numeru powtórzenia – ta sama nazwa na
każdej stacji na trasie); sezonowość i dni kursowania pominięte; numer w grze to numer powtórzenia wzorca, nie numer
z rozkładu. Relacje stacji fikcyjnych nie mają pociągów na liście – zostają z wzorca.
