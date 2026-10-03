# Jazda pociągu

Część opisu źródeł – indeks i zasady zapisu: [`docs/SOURCES.md`](../SOURCES.md).

## Szybkość w okręgu zwrotnicowym

Szybkość pociągu w okręgu zwrotnicowym (Ie-1 §3, wszystkie stanowiska): S10–S13 i Sr3 zezwalają na jazdę do 40 km/h
„począwszy od semafora do końca okręgu zwrotnicowego osłanianego tym semaforem”. W grze ograniczenie obowiązuje od
semafora, aż cały pociąg zjedzie z odcinków zwrotnicowych przebiegu (przyjęte: okręg zwrotnicowy = odcinki zwrotnic
przebiegu). Wyjątki – ograniczenie na całej drodze przebiegu: przebieg na tor główny dodatkowy (Dz.U. 2015 poz. 360
§66 ust. 3; pole `mainKind` odcinka, oznaczone na fikcyjnych stacjach szkoleniowych – na stacjach rzeczywistych gra
nie zgaduje, które tory są dodatkowe) i Sr3 na kształtowym semaforze wjazdowym (§65 pkt 3; Ie-1 §4 ust. 5 pkt 3).
Zwrotnicę w kierunku zwrotnym pokonuje cały pociąg, nie tylko czoło, z szybkością dla kierunku zwrotnego
(`speedDiverging`). Pociąg przyspiesza i hamuje zgodnie z dynamiką swojego taboru (`rollingStock.js`, „Tabor pociągów –
dynamika”), a gdy źródło nie podaje danych typu – zgodnie z dynamiką kategorii (`categories.js`).

## Prędkości szlaku, Sz i rozkazu

Prędkości szlaku, Sz i rozkazu (wszystkie stanowiska). Ze źródeł: pociąg jedzie z największą prędkością dozwoloną na
odcinku, na którym jest (Ie-1 od 17.01.2026 §4 ust. 13 pkt 2); sygnał zastępczy i rozkaz „S” zezwalają na jazdę do
40 km/h do następnego semafora (Ie-1 od 17.01.2026 §4 ust. 13 pkt 18 – starsze wydania podawały 20 km/h; Ir-1 §63
ust. 5); przy wyjeździe na szlak ograniczenie obowiązuje do końca rozjazdów, na szlaku z SBL – do pierwszego semafora
odstępowego (Dz.U. 2015 poz. 360 §65). Przyjęte (uproszczenia gry): szlak ma jedną prędkość `lineSpeed`; na szlaku
wjazdowym obowiązuje ona do wjazdu całego pociągu na stację; gra nie rysuje semaforów odstępowych, więc na SBL
ograniczenie z Sz / rozkazu trwa przez umowny pierwszy odstęp 1000 m (`SBL_FIRST_BLOCK`).

## Jazda na tor zajęty

Jazda na tor zajęty (wszystkie stanowiska). Ze źródeł: przy dojeżdżaniu do taboru prędkość nie większa niż 3 km/h,
skład zatrzymuje się przy taborze (Dz.U. 2015 poz. 360 §9 ust. 4 i 7). Przyjęte (uproszczenia gry): 3 km/h obowiązuje
na ostatnich 50 m przed taborem (`STOCK_CREEP`), skład staje 2 m przed nim (gra nie łączy składów).

## Zatrzymanie, odjazd i hamowanie

Zatrzymanie, odjazd i hamowanie (wszystkie stanowiska). Ze źródeł: wskaźnik W 4 „Wskaźnik zatrzymania” oznacza
miejsce, do którego może dojechać czoło zatrzymującego się pociągu – pociąg zatrzymuje się w takiej odległości przed
nim, aby ruch podróżnych był najdogodniejszy; wskaźnik stoi przy końcu peronu lub przed ukresem (Ie-1, wersja od
17.01.2026, §17 ust. 15 pkt 4); pociąg rusza z peronu na sygnał zezwalający (Ie-1 §4 ust. 13 pkt 1); droga hamowania
pociągu to setki metrów, hamowanie nagłe daje ok. 1–1,5 m/s² (Dz.U. 2015 poz. 360 §12 ust. 4 i zał. 1). Przyjęte
(uproszczenia gry):

* Miejsce zatrzymania przy peronie (`Train.#platformPlan`, `PLATFORM_STOP`): gra nie rysuje W 4 i przyjmuje go przy
  końcu peronu jako granicę; „ruch podróżnych najdogodniejszy” gra rozumie tak, że pociąg stoi wzdłuż peronu, a nie przy
  samym jego końcu (podróżni nie idą na koniec peronu) – czoło na 3/4 długości peronu od wejścia na peron, a pociąg
  dłuższy niż połowa peronu na środku peronu (czoło na (Lp + L) / 2). Liczby 3/4 i „środek” są przyjęte – Ie-1 ich nie
  podaje. Peron i jego zasięg wzdłuż toru są te same, które rysuje widok (`src/tiles/platforms.js` – z układu torów
  stacji, bez danych per stacja); czoło staje 0–10 m wcześniej (rozrzut – maszynista nie staje co do metra; stały dla
  zmiany o tym samym ziarnie, różny dla pociągów i zmian), najdalej jak dotąd przy końcu peronu. Tor czołowy (kozioł za
  peronem na tym samym odcinku, np. Zacisze, Gdańsk Gł. 7–15) – pociąg dojeżdża jak dotąd do końca peronu. Tył pociągu
  nie wystaje na rozjazdy: czoło co najmniej długość pociągu + 5 m od początku odcinka toru; gdy pociąg nie mieści się
  przy peronie na odcinku, staje jak dawniej 12 m przed semaforem końcowym toru peronowego (15 m przed końcem odcinka
  bez semafora). Dawniej czoło stawało zawsze 0–10 m przed końcem peronu;
* pociąg po postoju zostaje przy peronie, dopóki pierwszy semafor przed czołem wskazuje „Stój” – także gdy stoi przy
  końcu peronu daleko przed semaforem (dawniej trzymał go tylko semafor do 60 m); dalszy semafor na „Stój” (przebieg
  dwustopniowy) nie trzyma – pociąg rusza na sygnał pierwszego; odjazd w dzienniku i punktualność liczy się od
  faktycznego ruszenia, więc przetrzymanie to późny odjazd;
* opóźnienie pociągu nie przekracza hamowania nagłego (`EMERGENCY_BRAKE` = 1,3 m/s²); sygnał „Stój” podany bliżej
  niż droga hamowania nagłego pociąg przejeżdża: zdarzenie `spad`, alarm, kara −20 dla dyżurnego (bez kary, gdy
  przyczyna jest po stronie urządzeń: usterka semafora albo – przy nastawionym przebiegu – zajętość odcinka bez taboru
  lub utrata kontroli zwrotnicy), hamowanie nagłe do zatrzymania; dalej pociąg jedzie dopiero na nowe zezwolenie;
* pociąg, który stanął za semaforem miniętym na „Stój”, jedzie dalej na rozkaz pisemny „S” wydany dla tego semafora:
  do następnego semafora, z prędkością do 40 km/h; warunki jak dla rozkazu „S” (zwrotnice przed czołem utwierdzone
  w przebiegu albo zamknięte, odcinki wolne od innego taboru). Przyjęte – gra używa tu tego samego rozkazu „S”;
  w rzeczywistości dyżurny ruchu najpierw wyjaśnia okoliczności minięcia semafora. Wcześniej takiego pociągu nie dało
  się ruszyć, gdy między nim a następnym semaforem była zwrotnica;
* przebieg, który nie rozwiązał się za pociągiem, bo odcinek wykazywał zajętość z usterki w chwili przejazdu, zwalnia
  się doraźnie (dPz / ZDP / PZA) – takie zwolnienie jest uzasadnione usterką i nie kosztuje punktów (przyjęte);
* po usunięciu usterki semafora (żarówka / obwód) przy wciąż nastawionym przebiegu sygnał zezwalający wraca sam –
  inaczej niż po spadku sygnału ze stałej kontroli (zajętość odcinka, utrata kontroli zwrotnicy), po którym sygnał
  sam nie wraca (przyjęte; sprawdzają to testy `tests/faults-signals-points.test.js`);
* czynność wymuszona usterką jest bez kary także wtedy, gdy wykonuje się ją po naprawie: rozkaz „S” dla pociągu, który
  przejechał „Stój” z usterki semafora (dyżurny wypisuje go minuty później), i Sz, gdy sygnału wyjazdowego nie da się
  podać przez Pwl po sygnale zgaszonym z usterki (przyjęte);
* tor szlakowy z blokadą półsamoczynną nie jest wolny, dopóki pociąg sąsiada stoi przed semaforem wjazdowym – także
  gdy zjechał już w całości na odcinek przed semaforem: sąsiad nie wyprawia następnego pociągu (blokada
  jednokierunkowa), a przy zapowiadaniu telefonicznym „droga wolna” się nie należy (przyjęte: pociąg „przybył
  w całości”, gdy cały minął semafor wjazdowy – dopiero wtedy potwierdza się przyjazd);
* pociąg kończący bieg „przyjeżdża” dopiero na torze stacyjnym – postój za innym taborem przed semaforem wjazdowym
  nie kończy biegu;
* przebieg wjazdowy jest zakończony, gdy pociąg w całości wjechał na tor docelowy (wszystkie odcinki przed tym torem
  zwolnione) – także gdy tor ma za peronem jeszcze krótki odcinek przy semaforze, do którego pociąg nie dojeżdża
  (przyjęte; wcześniej taki przebieg nie kończył się do odjazdu pociągu, a w nastawni mechanicznej drążka nie dało
  się cofnąć bez zwalniacza).

## Hamowanie jak maszynista (`src/model/rollingStock.js` – `brakingOf`, `src/model/Train.js` – `brakeCurve`)

Pociąg hamuje tak, jak prowadziłby go maszynista: planuje hamowanie łagodniejsze niż największe służbowe, zaczyna je
z wyprzedzeniem na czas działania hamulca, a przed miejscem zatrzymania luzuje. Hamowanie zależy od rodzaju pociągu,
taboru, masy i długości składu. Hamowanie nagłe (`EMERGENCY_BRAKE`) i przejechanie sygnału „Stój” (`spad`) – bez zmian:
gdy sygnał zmieni się na „Stój” bliżej niż droga hamowania planowanego, pociąg hamuje służbowo, a gdy i to nie wystarczy –
nagle. Wszystkie źródła sprawdzone 1.10.2026.

Ze źródeł:

* drogi hamowania – PKP PLK Ie-4 (WTB-E10, od 5.11.2025), §8 ust. 4: „przyjmuje się następujące drogi hamowania
  wynikające z maksymalnej możliwej do uzyskania prędkości na danym odcinku linii”: 1300 m – do 160 km/h, 1000 m – do
  140 km/h, 700 m – do 100 km/h, 400 m – do 60 km/h (zakres zasadniczy;
  https://www.plk-sa.pl/files/public/user_upload/pdf/Akty_prawne_i_przepisy/Instrukcje/Wydruk/Ie/Ie-4_obowiazuje_od_2025-11-05__uz_903_25_.pdf);
  tarcza ostrzegawcza stoi w odległości drogi hamowania przed semaforem (§8 ust. 1);
* masa hamująca – Ir-1 (od 1.07.2026) §21: „Mhw = Mo × Pw / 100”; wymagany procent masy hamującej zależy od drogi
  hamowania, sposobu hamowania („I – hamulcami zespolonymi szybko działającymi (P, R, R+Mg)”, „II – … wolno
  działającymi (G)”), prędkości i pochyleń; Dodatek 1, np. droga 1000 m, poziom: szybko działające – 80 km/h 33 %,
  120 km/h 92 %, 160 km/h 187 %; wolno działające – 80 km/h 42 %
  (https://www.plk-sa.pl/files/public/user_upload/pdf/Akty_prawne_i_przepisy/Instrukcje/Wydruk/Ir/Instrukcja_Ir-1_po_zm_19__od_01_07_26.pdf);
* masa hamująca a droga i opóźnienie – OTIF UTP WAG 2021, tabl. C.3 (wagony w położeniu P): przy 100 km/h „λmin = 65 %
  amin = 0,60m/s2” (ładowne), „λmin = 100% amin=0,91m/s2” (próżne), „λmax=125% … amax= 1,15m/s2”; wzór z przypisu:
  a = v² / (2 (S − Te·v)), „Te=2sec. Distance calculation EN 14531-1:2015 section 4”
  (https://otif.org/fileadmin/new/3-Reference-Text/3D-Technical-Interoperability/3D1-Prescriptions-and-other-rules/UTP-WAG-2021_e-In-force.pdf);
  G: „Das Bremsverhältnis der G-Bremse beträgt maximal rund 80 %” (https://de.wikipedia.org/wiki/Bremsgewicht);
* nastawienie hamulca pociągów towarowych – ALZA Cargo, instrukcja ALZA-W2 (zm. 12.05.2025), §16: „Pociągi towarowe
  kursują … zasadniczo z hamulcami nastawionymi na przebieg działania P … we wszystkich pojazdach pociągu hamulce muszą
  być nastawione na G”, gdy warunek nie jest spełniony; „Długość składu pociągu, w którym stosuje się nastawienie
  hamulców na P, nie może być większa niż 700 m”; tabela mas do 4000 t
  (https://www.alzacargo.pl/wp-content/uploads/2025/10/ALZA-W2-Instr.-obslugi-hamulcow-taboru-kolejowego-wyd.2.pdf);
  pociągi P dłuższe niż 500 m – masa hamująca razy współczynnik „Długość 500 520 … 700 – Współczynnik 1,00 0,99 … 0,90”
  (Majkoltrans MKT-4 §52 ust. 8: https://majkoltrans.pl/dokumenty/dok-wewn/MKT-4_po_zmianie_2.pdf);
* czas działania hamulca – UIC 540 (kopia: https://pdfcoffee.com/uic-540-pdf-free.html): napełnianie cylindra
  hamulcowego „between 18 and 30 seconds” w G, „between 3 and 5 seconds” w P; R – „gleiche Füll- und Lösezeiten wie bei
  der P-Bremse” (https://de.wikipedia.org/wiki/Druckluftbremse_(Eisenbahn)); równoważny czas narastania hamowania
  w przykładach ERA (ERA_ERTMS_040026 v1.5: https://www.era.europa.eu/system/files/2022-11/Introduction%20to%20ETCS%20braking%20curves.pdf):
  pociąg pasażerski 83 m – 5,02 s, towarowy P 400 m – 5,0 s, towarowy G 600 m – 12,8 s;
* hamowanie służbowe zespołów – wymagania zamówień: SKM Trójmiasto 2010, modernizacja EN57: „opóźnienie hamowania
  w przedziale 0,8 – 1,1 [m/s²]” (https://img.trojmiasto.pl/download/SIWZ%20TABOR.pdf); Koleje Śląskie 2012 (SZT):
  „opóźnienie hamowania (na torze prostym): od 0,9 do 1,1 m/s2”
  (http://old.kolejeslaskie.com/uploads/pliki/SIWZ%20dostawa%20w%20formie%20leasingu%20spalinowych%20zespo%C5%82%C3%B3w%20trakcyjnych.pdf);
  ŁKA 2020: „hamowanie eksploatacyjne − od 0,9 m/s2 do 1,2 m/s2”
  (https://bip.lka.lodzkie.pl/_data/Zamowienia/Postepowania/2020/485_dostawa%203%20dwunap%C4%99dowych%20Pojazd%C3%B3w/9.%20OPZ_485_20.pdf);
  31WE – SKM 2014: „Droga hamowania służbowego nie więcej niż 1200 m od Vmax” (OPZ – adres w „Tabor pociągów – dynamika”);
  45WE – KM 2014: „Droga hamowania służbowego: Nie więcej niż 1000 m od 160 km/h”, „Maksymalne opóźnienie hamowania:
  1,2 m/s²” (https://web.archive.org/web/20160311224726id_/http://www.mazowieckie.com.pl/g2/oryginal/2014_07/72c523b897a305c99e9f22ccf487d3c5.pdf);
  zwykłe hamowanie: „In normal passenger high-speed operations the deceleration is usually limited to about 0.6 m/s2”
  (Sjöholm, KTH 2011: https://www.diva-portal.org/smash/get/diva2:405993/FULLTEXT01.pdf); „Viele Bremsvorgänge im
  Bahnverkehr werden beispielsweise mit 0,8 m/s² gut getroffen” (https://www.bahntechnik-bahnbetrieb.de/verzoegerungsrechner/);
* jak hamuje maszynista – ALZA-W2 §40: „Aby zatrzymać pociąg, należy, po wyłączeniu napędu, stosować hamowanie
  służbowe”; na stacji końcowej „rozpocząć hamowanie z takim wyprzedzeniem, aby pociąg zatrzymał się w określonym
  miejscu bez konieczności wykorzystania pełnej siły hamowania”; pociągi towarowe dłuższe niż 300 m: „wyłączyć siłę
  pociągową, w miarę możliwości na okres około 10 sekund”, a w pociągu z hamulcami nieluzującymi stopniowo maszynista
  „nie może stosować w trakcie zatrzymywania pociągu zmniejszenia stopnia hamowania” (§40 ust. 5); „Nie wolno również
  stosować odhamowania stopniowego pociągów towarowych o długości powyżej 300 m” (§41); zmiana opóźnienia przy
  hamowaniu służbowym pojazdów miejskich do 1,5 m/s³ (DIN/EN 13452-1 – za opisem https://patents.google.com/patent/US9580052B2/en:
  „the deceleration is terminated slowly by reducing the brake force slowly on completion of the deceleration”).

Przyjęte (wyliczone ze źródeł, decyzje gry):

* opóźnienie hamowania służbowego (największe, `brake`):
  * zespół trakcyjny – wartość typu: 31WE 0,89 m/s² (1200 m od 160 km/h wg wzoru EN 14531-1, Te = 2 s), 45WE 1,08 m/s²
    (1000 m od 160 km/h), EN57 0,8 m/s² (dolna granica wymagania SKM 2010 – katalog nie rozróżnia EN57AKM); inne zespoły –
    0,8 m/s² (`UNIT_BRAKE`, dolna granica wymagań zamówień wyżej);
  * pociąg pasażerski z lokomotywą – skład ma masę hamującą wymaganą dla swojej prędkości (Ir-1 §21), więc staje
    z prędkości pociągu na drodze hamowania z Ie-4: a = v² / (2 (S − 2 s · v)) – np. IC 160 km/h 0,82 m/s², IC / TLK
    120 km/h i TLK z 754 (100 km/h) 0,60 m/s²;
  * pociąg towarowy – masa hamująca z ładunku: λ = 100 % przy pustym składzie do 65 % przy 7,2 t/m (najcięższy skład
    w grze – nacisk liniowy 71 kN/m), masa na metr = `mass` / (długość pociągu − długość lokomotywy); P i skład ponad 500 m –
    λ razy 1,00…0,90 (700 m); G (skład ponad 700 m albo ponad 4000 t) – λ najwyżej 80 %; opóźnienie 0,0091 m/s² na 1 %
    (tabl. C.3: 0,60 / 65 %, 0,91 / 100 %, 1,15 / 125 %) – np. 600 t na 480 m: 0,85 m/s², 3000 t na 560 m: 0,64 m/s²;
  * wszystko najwyżej 1,2 m/s² (`SERVICE_BRAKE_MAX`, wymaganie KM), poniżej hamowania nagłego 1,3 m/s²; pociąg bez
    taboru – hamowanie kategorii jak dotąd; `brake` wpisu zastępuje wyliczone opóźnienie;
* czas od decyzji maszynisty do pełnego hamowania (`brakeDelay`, wyprzedzenie w krzywej hamowania): zespół 2 s
  (EN 14531-1), pociąg z lokomotywą P / R 5 s, G 12,8 s (ERA), pociąg towarowy dłuższy niż 300 m – dodatkowo 10 s
  wyłączenia siły pociągowej (ALZA-W2 §40); pociąg bez taboru – jak P. We wzorze na opóźnienie Te zostaje 2 s (jak w
  tabl. C.3) – dłuższe narastanie hamowania wydłuża drogę zatrzymania, nie zwiększa opóźnienia;
* maszynista: planuje hamowanie z opóźnieniem 0,6–0,8 największego służbowego (`DRIVER_MIN`, `DRIVER_MAX`) – np. Impuls
  0,53–0,71, EN57 0,48–0,64, IC 160 km/h 0,49–0,66 m/s² (zgodnie z „about 0.6” i „0,8 … gut getroffen”); każdy pociąg
  ma inny współczynnik – z ziarna zmiany i numeru pociągu (`driverFactor`, wspólne `mixSeed`, bez losowań zmiany),
  ten sam przy tym samym ziarnie;
* krzywa hamowania: największa prędkość, z której pociąg zwolni do prędkości `c` na drodze d: v = −a·t + √((a·t + c)²
  + 2·a·d), gdzie a – opóźnienie planowane, t – `brakeDelay` (droga (v − c)·t na narastanie hamowania);
* łagodny dojazd do miejsca zatrzymania (luzowanie przed zatrzymaniem): od 2 m/s (ok. 7 km/h, `EASE_SPEED`) z połową
  planowanego opóźnienia (`EASE_SHARE`) – nie w pociągu towarowym dłuższym niż 300 m (ALZA-W2 §40–41), ten staje
  z planowanym opóźnieniem do końca;
* horyzont skanowania toru – nie krótszy niż droga zatrzymania przy planowanym hamowaniu + 300 m;
* gra nie odwzorowuje pochyleń, oporów ruchu ani hamowania elektrodynamicznego osobno – opóźnienie jest jedno dla całej
  prędkości.

## Masa i długość pociągu

Masa i długość pociągu (wszystkie stanowiska). Ze źródeł:
* Ir-1 (tekst ujednolicony, uchwała Zarządu PKP PLK nr 460/2026 z 26.05.2026) §19: masa ogólna pociągu do 120 km/h
  to suma mas pojazdów bez czynnego pojazdu z napędem (ust. 1 pkt 1); długość pociągu to suma długości wszystkich
  pojazdów (ust. 3) i nie powinna być większa od długości użytecznej torów głównych na stacjach (ust. 4); dopuszczalne
  długości podaje się w dodatkach do rozkładu jazdy (ust. 6).
* Ir-1 §21: wymagana masa hamująca Mhw = Mo × Pw / 100, a procent Pw zależy od drogi hamowania, sposobu hamowania,
  prędkości i pochyleń – nie od masy pociągu.
* Regulamin sieci 2025/2026, pkt 2.3.8: dopuszczalne długości pociągów towarowych są w tablicy 2 Dodatku 1 do WRJ
  (dostępnej w ISZTP – niepublicznej); zał. 6.3, pola E02 i E03: we wniosku podaje się masę brutto (t) i długość (m)
  składu bez lokomotywy, a długość składu z lokomotywą nie może przekraczać wartości z tej tablicy.
* Regulamin sieci 2025/2026, zał. 2.5 (stan na 25.10.2026): na liniach 9, 131 i 201 nacisk osi wagonów do 221 kN,
  nacisk liniowy 71 kN/m (klasa D3) albo 78 kN/m (D4).
* Regulamin sieci 2025/2026, zał. 9.1: współczynniki opłaty zależne od masy brutto pociągu w przedziałach do 4800 t.
* PKP PLK, informacja prasowa „Nowe możliwości transportu ładunków koleją do portu w Gdańsku” (22.01.2025): do nabrzeży
  portu w Gdańsku dojeżdżają pociągi o długości 750 m i nacisku 22,5 t na oś.

Przyjęte w grze:
* Pole `mass` to masa brutto składu bez czynnej lokomotywy (jak E02 i Ir-1 §19 ust. 1 pkt 1), a `length` – długość
  całego pociągu z lokomotywą (tyle zajmuje torów). Górna granica masy: 7,2 t/m (71 kN/m – najmniejszy nacisk liniowy
  w zał. 2.5 dla linii 9, 131 i 201; pozostałych linii gry, np. 202, 226, 227, 249, zał. 2.5 nie obejmuje – przyjęto
  tę samą granicę) razy `length` – łagodna, bo `length` obejmuje lokomotywę.
* Długość użyteczna toru w grze to suma odcinków z tym numerem toru (pole `track` odcinka), bez względu na kierunek
  jazdy i położenie semaforów. Na przykład tor 1 Gdyni Gł. to 292 + 160 m, więc pociąg 400 m się mieści, choć
  przy wyjeździe na wschód stoi także na odcinkach za torem. Pociąg dłuższy niż tor daje ostrzeżenie walidacji.
* Najdłuższy pociąg towarowy w rozkładach gry: 750 m (`MAX_FREIGHT_LENGTH`, wg informacji prasowej PKP PLK o liniach
  portowych Gdańska – to nie jest ogólny przepis). Tablicy 2 Dodatku 1 do WRJ gra nie zna.
* Rodzaj, trakcja, masa i długość każdego pociągu towarowego w rozkładach są fikcyjne (dobrane w powyższych granicach
  i do długości torów): masowe (TM) cięższe (2000–3000 t), intermodalne (TD) i niemasowe (TN) lżejsze (700–1800 t),
  zdawcze (TK) krótkie (220–400 m, 400–650 t), próżne wagony do naprawy (TS) – 600 t na 480 m. Gra nie zna ładunku
  ani wagonów – nazwy relacji go nie podają.
  Trakcję spalinową (S) mają niektóre pociągi zdawcze i towarowe; trakcja wybiera lokomotywę, a ta – dynamikę.
* Dynamika: prędkość, przyspieszenie, hamowanie i masa odniesienia (`refMass`) kategorii są wartościami gry. Pociąg
  z lokomotywą z katalogu taboru, dla której źródła podają siłę pociągową i masę, przyspiesza z tych danych i z `mass`
  („Tabor pociągów – dynamika”); wartości kategorii zostają dla lokomotyw bez danych. Hamowanie pociągu z taborem
  zależy od masy na metr składu i długości („Hamowanie jak maszynista”).
  Przyspieszenie kategorii obowiązuje przy masie odniesienia (TM/TG 2000 t, TD/TC 1400 t, TN/TR 1200 t, TS 800 t,
  TK 600 t); pociąg o masie `mass` ma przyspieszenie razy `refMass / mass` (ta sama siła pociągowa, większa masa),
  w granicach 0,5–1,5 przyspieszenia kategorii. Hamowanie nie zależy od masy – zgodnie z Ir-1 §21 hamulce dobiera się
  do masy tak, by uzyskać wymaganą drogę hamowania. Wpis bez `mass` jedzie jak dotąd.
* Wpis bez `cat`: towarowy to TM, nazwa z „zdawczy” – TK, „Lokomotywa luzem” – LT (przyjęte). Dawna reguła „próżny”
  albo „lekki” w nazwie → TN usunięta – nie miała źródła (TN to przewozy niemasowe, a próżne wagony z/do naprawy
  to w zał. 6.3 TS); rodzaj pociągu podaje wpis rozkładu wprost (`cat`).
* Pociągi pasażerskie mają w grze oznaczenia handlowe (IC, TLK, R, SKM), a próżny skład EZT – „EZT”, nie oznaczenia
  z załącznika (EIE, MPE, ROJ, PWJ…).

## Rodzaje pociągów towarowych

Rodzaje pociągów towarowych (wszystkie stanowiska). Ze źródła – PKP PLK, Regulamin sieci 2025/2026, zał. 6.3 „Wzór
wniosku o przydzielenie trasy pociągu z instrukcją wypełniania wniosku”, część „Klasyfikacja pociągów stosowana
w konstrukcji rozkładów jazdy” (aktualizacja z 15.09.2026, publikacja v41, s. 9–13): rodzaj pociągu oznaczają trzy
litery. Dwie pierwsze – pociągi towarowe w ruchu międzynarodowym (B1): TC – przewozy jednostek transportu
intermodalnego i próżnych platform, TG – przewozy masowe, TR – niemasowe; w ruchu krajowym (B2): TD – przewozy
intermodalne (jak TC), TM – masowe, TN – niemasowe, TK – obsługa stacji i bocznic, TS – próżne wagony z/do naprawy,
pociągi próbne oraz pozostałe pociągi, TH – skład lokomotyw; pojazdy luzem (C): LT – lokomotywa do i od pociągów
towarowych (oraz LP, LZ, LS – gra ich nie używa). Trzecia litera to trakcja: P – parowa, E – elektryczna (lokomotywy),
J – elektryczne zespoły trakcyjne, S – spalinowa (lokomotywy), M – spalinowa (zespoły i wagony trakcyjne). Tablice
załącznika (s. 12–13) dopuszczają dla TC, TG, TR, TD, TM, TN, TH tylko E i S, dla TK – P, E, S, dla TS – E, J, S, M,
dla LT – P, E, S; gra przyjmuje tylko te połączenia (`tractions` w `categories.js`, walidacja `traction`).

## Zmiana czoła

Zmiana czoła (wszystkie stanowiska). Ze źródeł: pociąg prowadzi się z czynnej kabiny na czele (Dz.U. 2015 poz. 360
§12 ust. 4; Ir-1 §66) – skład z lokomotywą na jednym końcu, żeby pojechać w drugą stronę, musi ją przestawić na drugi
koniec (lokomotywa objeżdża skład sąsiednim torem); zespół trakcyjny ma kabinę na obu końcach. Gra nie odwzorowuje
rozłączania ani oblotu: „zmiana czoła” odwraca skład na miejscu. Dlatego w scenariuszach pociągiem towarowym, który
wraca z toru jako nowy pociąg, jest tylko lokomotywa luzem (Gdańsk Gł. 44660 / 44661), a skład kończący bieg na
Szkolnej (90201 / 90202) to zespół trakcyjny – pilnuje tego `tests/categories.test.js`. Przyjęte: składy pasażerskie
z lokomotywą, które wracają jako nowy pociąg (IC w Gdańsku Gł. i Gdyni Gł.), zmieniają czoło na miejscu – zastępuje to
podstawienie lokomotywy na drugi koniec; zmiana czoła w trybie manewrowym oznacza pchanie składu, co przy manewrach
jest dozwolone. Czas zmiany czoła i rozmowa z maszynistą – „Zmiana czoła i rozmowy z maszynistą” niżej.

## Zmiana czoła i rozmowy z maszynistą (`src/model/Train.js` – `cabChangeTime`, `src/model/Comms.js` – rozmowa)

Ze źródła – Instrukcja o użytkowaniu urządzeń radiołączności pociągowej Ir-5 (R-12), tekst ujednolicony z uchwałą
nr 822/2016 (https://www.plk-sa.pl/files/public/user_upload/pdf/Akty_prawne_i_przepisy/Instrukcje/Wydruk/Ir/Ir-5__R-12__WCAG_format_A4__Z_.pdf):
* §7 ust. 4 pkt 3 i 5: wywołujący podaje znak wywoławczy wywoływanego i swój; znak posterunku to nazwa posterunku
  ruchu, pociągu – „Pociąg 1215”;
* §7 ust. 7: po przekazaniu informacji – „odbiór”; gdy odpowiedzi się nie oczekuje, rozmowę kończy się słowami
  „bez odbioru” albo „koniec”;
* §7 ust. 9 pkt 1: odebrany meldunek się potwierdza, np. „Tu dyżurny ruchu stacji Kozuby, meldunek zrozumiałem”;
* §8 ust. 1 i 5: dyżurny wywołuje maszynistę, np. „Pociąg 5404, tu Kozuby, zgłoś się – odbiór”; w sieci GSM-R
  wystarcza potwierdzenie stron nazwą posterunku albo numerem pociągu, np. „Pociąg 3503, tu LCS Ciechanów – odbiór”;
* §14 ust. 2: odpowiedź maszynisty, np. „Tu pociąg 54780, zrozumiałem, bez odbioru”.

Przyjęte (źródła tego nie podają):
* rozmowa skrócona jak w GSM-R (§8 ust. 5): wywołanie i treść w jednym komunikacie, bez osobnego „zgłoś się” /
  „zgłaszam się”; maszynista odpowiada po 4 s (`DRIVER_REPLY`);
* treść poleceń z zakładki Pociągi – przejście na jazdę manewrową („koniec jazdy pociągowej, dalej jazda manewrowa”),
  na jazdę pociągową („koniec manewrów, dalej jazda pociągowa”), zmiana czoła („przejdź do drugiej kabiny i zgłoś
  gotowość”) – i meldunku gotowości („zmiana czoła zakończona, stoję przed <sygnalizator przed nowym czołem>, gotów
  do jazdy”); potwierdzenie meldunku („Tu <posterunek>, meldunek zrozumiałem”) nadaje się samo;
* zmiana czoła trwa 45–75 s (`CAB_CHANGE_MIN`, `CAB_CHANGE_MAX`; w każdym pociągu inaczej, stałe dla tej samej zmiany):
  maszynista przechodzi do kabiny na drugim końcu składu i ją uruchamia. W tym czasie skład stoi także przy sygnale
  zezwalającym, a trybu jazdy nie da się zmienić (maszynisty nie ma w kabinie); zezwolenie przepada od razu, jak dotąd;
* automat okręgu obok gracza zmienia tryb i czoło bez rozmowy w dzienniku łączności gracza; automat dyżurnego
  (testy, automat sprawdzający) zleca zmianę czoła pociągowi ze składu innego pociągu już od przekazania składu, a
  przebieg wyjazdowy – jak dotąd ok. 2 min przed odjazdem.
