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
* Instrukcja o technice wykonywania manewrów Ir-9, PKP PLK (tekst ujednolicony, zarządzenie 6/2012 ze zmianami do
  uchwały 376/2025 z 13.05.2025; plk-sa.pl, Akty prawne i przepisy → Instrukcje → Ir) – zezwolenia na jazdę manewrową
* automatyka.ndl.pl – opis blokady Eap; trainbrains.eu – elementy i obsługa blokady Eap
* Chyba A., „Symulator komputerowy przekaźnikowego systemu (typu E) sterowania ruchem kolejowym…”, Zeszyty SITK RP nr 158 (2011)

Kolory lampek na kostkach (za opisami pulpitów typu E): żółte – położenie zwrotnicy,
białe – utwierdzenie przebiegu, czerwone – zajętość odcinka. Przyjęte (uproszczenie gry, na wszystkich stanowiskach):
w odcinku zwrotnicowym zajętość i utwierdzenie świecą tylko na drodze, w którą leżą zwrotnice – łącznica (albo tor
za ramieniem), w którą zwrotnica nie jest ustawiona, zostaje ciemna, żeby nie wyglądała na drogę jazdy.

Pulpit typu E – powtarzacze, przyciski grupowe, wykolejnice (`src/tiles/repeater.js`, `src/tiles/controls.js`,
`src/render/DeskRenderer.js`):

* powtarzacz semafora ma albo światła takie jak semafor, albo jedną zieloną lampkę dla wszystkich sygnałów
  zezwalających – to drugie jest typowe dla pulpitów typu E (Ie-10 (E18) rozdz. II §7 ust. 7; ISDR 2.3.2.2.1.5;
  bsk.isdr.pl/usrk_pulpity.php). Gra stosuje wariant typowy: zielona – każdy sygnał zezwalający dla pociągu (S2–S13),
  czerwona – „Stój”, biała – Ms2 (ciągła) i sygnał zastępczy Sz (migająca, razem z czerwoną); tarcza manewrowa –
  niebieska (Ms1) i biała (Ms2). Obraz sygnału (S5, S12, S13…) widać na semaforze, nie na powtarzaczu. Wcześniej gra
  miała lampkę pomarańczową i przez to pokazywała S12 jako pomarańczową z zieloną, a S13 tak samo jak S5;
* przyciski grupowe (Zw, Zz, Pz) i doraźne (dPz, Sz) są czarne – ISDR 2.3.2.1.1 i 2.3.2.3 pisze „typowo”, więc to
  wzór, nie przepis; biel i czerwień zostają przy przyciskach sygnałowych i blokady. Kostki przycisków zapisane
  w starych plikach stacji (`type: 'button'`) zachowują swoją barwę;
* zwolnienie przebiegu pociągowego przyciskiem Pz bez plomby i licznika (od razu, a przy zajętym odcinku zbliżania –
  czasowo) to wzór ISDR. Ie-10 §25 ust. 2 pkt 5 wymaga do zwolnienia przebiegu pociągowego przycisku plombowanego,
  a zwolnienie czasowe przewiduje dla urządzeń zblokowanych – gra tego nie odwzorowuje (rozbieżność znana, do decyzji);
  plombowany i liczony jest tylko dPz;
* numery pociągów przy czole pociągu na pulpitach przekaźnikowych (typ E, IZH-111) i na planie świetlnym nastawni
  mechanicznej to pomoc gry, jak w ISDR – rzeczywisty pulpit ich nie pokazuje (dyżurny zna je z zapowiadania);
* lampka wykolejnicy świeci na żółto tylko przy wykolejnicy zdjętej; nałożona albo w ruchu – zgaszona (ISDR
  2.3.2.2.1.2; źródło podaje też wariant z żółtymi szczelinami – w osi toru zdjęta, ukośna nałożona). Biel na pulpicie
  oznacza utwierdzenie, więc nie pokazuje położenia wykolejnicy.

Szybkość pociągu w okręgu zwrotnicowym (Ie-1 §3, wszystkie stanowiska): S10–S13 i Sr3 zezwalają na jazdę do 40 km/h
„począwszy od semafora do końca okręgu zwrotnicowego osłanianego tym semaforem”. W grze ograniczenie obowiązuje od
semafora, aż cały pociąg zjedzie z odcinków zwrotnicowych przebiegu (przyjęte: okręg zwrotnicowy = odcinki zwrotnic
przebiegu). Wyjątki – ograniczenie na całej drodze przebiegu: przebieg na tor główny dodatkowy (Dz.U. 2015 poz. 360
§66 ust. 3; pole `mainKind` odcinka, oznaczone na fikcyjnych stacjach szkoleniowych – na stacjach rzeczywistych gra
nie zgaduje, które tory są dodatkowe) i Sr3 na kształtowym semaforze wjazdowym (§65 pkt 3; Ie-1 §4 ust. 5 pkt 3).
Zwrotnicę w kierunku zwrotnym pokonuje cały pociąg, nie tylko czoło, z szybkością dla kierunku zwrotnego
(`speedDiverging`). Pociąg przyspiesza i hamuje zgodnie z dynamiką swojego taboru (`rollingStock.js`, „Tabor pociągów –
dynamika”), a gdy źródło nie podaje danych typu – zgodnie z dynamiką kategorii (`categories.js`).

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

Zmiana czoła (wszystkie stanowiska). Ze źródeł: pociąg prowadzi się z czynnej kabiny na czele (Dz.U. 2015 poz. 360
§12 ust. 4; Ir-1 §66) – skład z lokomotywą na jednym końcu, żeby pojechać w drugą stronę, musi ją przestawić na drugi
koniec (lokomotywa objeżdża skład sąsiednim torem); zespół trakcyjny ma kabinę na obu końcach. Gra nie odwzorowuje
rozłączania ani oblotu: „zmiana czoła” odwraca skład na miejscu. Dlatego w scenariuszach pociągiem towarowym, który
wraca z toru jako nowy pociąg, jest tylko lokomotywa luzem (Gdańsk Gł. 44660 / 44661), a skład kończący bieg na
Szkolnej (90201 / 90202) to zespół trakcyjny – pilnuje tego `tests/categories.test.js`. Przyjęte: składy pasażerskie
z lokomotywą, które wracają jako nowy pociąg (IC w Gdańsku Gł. i Gdyni Gł.), zmieniają czoło na miejscu – zastępuje to
podstawienie lokomotywy na drugi koniec; zmiana czoła w trybie manewrowym oznacza pchanie składu, co przy manewrach
jest dozwolone. Czas zmiany czoła i rozmowa z maszynistą – „Zmiana czoła i rozmowy z maszynistą” niżej.

Zezwolenie na jazdę (wszystkie stanowiska). Ze źródeł: pociąg mija semafor tylko na sygnał zezwalający dla pociągu
(S2–S13, Sr2/Sr3), sygnał zastępczy Sz albo rozkaz pisemny; sygnał Ms2 na semaforze dotyczy wyłącznie jazdy
manewrowej, dla pociągu znaczy „Stój” (Ie-1 §4 ust. 14 i 17; Ir-1 §11 ust. 1). Pociąg wyprawia się na szlak
na sygnał semafora wyjazdowego albo na rozkaz pisemny (Ir-1 §63 ust. 1 pkt 1). Jazda manewrowa obok sygnalizatora –
na Ms2 (M2) (Ie-1 §3 ust. 17–18). Przebieg manewrowy przez drogę ochronną przebiegu pociągowego jest z nim sprzeczny
(Ie-4 §43 ust. 2 pkt 4). Przebiegi manewrowe z przeciwnych stron na ten sam tor stacyjny nie są sprzeczne – sprzeczne
są dopiero na odcinku między rozjazdami tej samej głowicy (Ie-4 §43 ust. 5); w grze tor stacyjny może być ostatnim
odcinkiem dwóch przebiegów manewrowych naraz, a składy dojeżdżają do siebie jak do taboru na torze zajętym (ostatnie
metry do 3 km/h). Sygnał manewrowy gaśnie dopiero po minięciu sygnalizatora przez cały skład (Ie-4 §40,
§42 ust. 2 – wytyczne dla nowych urządzeń; przyjęte na wszystkich stanowiskach poza nastawnią mechaniczną). Przyjęte
(uproszczenia gry):

* pociąg, który nie minął jeszcze żadnego semafora (utworzony na stacji, po zmianie czoła, po przełączeniu
  z manewrów), rusza tylko wtedy, gdy najbliższy semafor przed nim – przed najbliższą zwrotnicą – wskazuje sygnał
  zezwalający dla pociągu albo pociąg ma rozkaz na jego minięcie; potem jedzie do granicy stacji tylko wtedy, gdy
  ostatni miniony semafor miał przebieg na szlak (albo Sz / rozkaz). Tak samo pociąg utworzony ze składu innego
  pociągu (`unit`): zezwolenie, na którym skład przyjechał, nie przechodzi na nowy pociąg – ten rusza na sygnał
  semafora przed sobą albo na rozkaz (Ir-1 §63 ust. 1 pkt 1);
* skład manewrowy rusza, gdy sygnalizator przed nim (przed najbliższą zwrotnicą) albo pod nim, zwrócony w kierunku
  jazdy, wskazuje Ms2 / M2; po minięciu sygnalizatora jedzie dalej w obrębie tego przebiegu – przebieg manewrowy innej
  jazdy nie jest zezwoleniem;
* sygnalizator manewrowy uszkodzony – ze źródła: po nastawieniu drogi przebiegu dla manewru pracownik posterunku
  nastawczego daje zezwolenie na jazdę sygnałem na sygnalizatorze, a jeżeli sygnalizatora nie ma albo jest uszkodzony –
  sygnałami ręcznymi albo za pomocą urządzeń łączności (Ir-9 § 10 ust. 15); zezwolenie daje się dla każdego przebiegu
  manewrowego oddzielnie (§ 10 ust. 16), a dla maszynisty jest ono poleceniem jazdy (§ 6 ust. 2 pkt 2); zasadnicza
  prędkość jazdy manewrowej to 25 km/h (§ 10). W grze: telefonogram radiowy do maszynisty „zezwalam na jazdę manewrową
  – sygnalizator uszkodzony” (Łączność), przyjmowany tylko przy uszkodzonym sygnalizatorze (usterka semafora albo tarczy)
  i nastawionym przebiegu manewrowym od niego; skład jedzie obok niego z prędkością 25 km/h w tym jednym przebiegu.
  Przy sprawnym sygnalizatorze zezwolenie daje się sygnałem – telefonogram jest odrzucany (−5 jak każdy niewłaściwy);
  zwrotnicy bez kontroli ani zajętości z usterki ten przepis nie obejmuje (przebieg się nie nastawia);
* rozkaz pisemny „S” dotyczy pociągu – dla składu manewrowego jest odrzucany ze wskazaniem zezwolenia na manewr
  (przyjęte; wcześniej był przyjmowany, maszynista potwierdzał jazdę, a skład stał);
* przebieg manewrowy z semafora końcowego przebiegu pociągowego nie jest jego kontynuacją: nie zastępuje drogi
  ochronnej (wjazd i manewr przez drogę ochronną wykluczają się), a semafor przed semaforem z Ms2 zapowiada „Stój”;
* Ms2 gaśnie, gdy zwolni się odcinek przed sygnalizatorem (cały skład za nim); na nastawni mechanicznej tarczę
  przestawia dźwignia jak dotąd.

Stała kontrola sygnału i droga ochronna (wszystkie stanowiska poza nastawnią mechaniczną). Ze źródeł: niezajętość
i kontrola zwrotnic są warunkami sygnału zezwalającego (Ie-4 §30 ust. 1, §39 ust. 2); Ie-4 nie mówi wprost, że sygnał
gaśnie po utracie warunku – to wniosek z zasady bezpieczności; droga ochronna jest częścią drogi przebiegu
pociągowego (Ie-4 §35 ust. 1, §37 ust. 2); zwolnienie przebiegu przy pociągu w zbliżaniu ma zwłokę (Ie-4 §41 ust. 3).
Przyjęte (uproszczenia gry):

* przed wjazdem pociągu zajętość odcinka przebiegu albo drogi ochronnej (także z usterki) lub utrata kontroli
  zwrotnicy przebiegu daje „Stój”; przebieg zostaje utwierdzony, sygnał nie wraca sam (Pz i ponowne nastawienie, Sz);
* po zwolnieniu przebiegu, który zastępował drogę ochronną (kontynuacja), droga ochronna przebiegu poprzedniego wraca;
  gdy nie może (odcinek zajęty lub w innym przebiegu, zwrotnica utwierdzona inaczej), semafor poprzedzający daje „Stój”;
* Pz przebiegu, do którego prowadzi przebieg poprzedni z sygnałem zezwalającym albo z pociągiem – zwalnianie czasowe,
  jak przy zajętym odcinku zbliżania.

Zatrzymanie, odjazd i hamowanie (wszystkie stanowiska). Ze źródeł: wskaźnik W 4 „Wskaźnik zatrzymania” oznacza
miejsce, do którego może dojechać czoło zatrzymującego się pociągu – pociąg zatrzymuje się w takiej odległości przed
nim, aby ruch podróżnych był najdogodniejszy; wskaźnik stoi przy końcu peronu lub przed ukresem (Ie-1, wersja od
17.01.2026, §17 ust. 15 pkt 4); pociąg rusza z peronu na sygnał zezwalający (Ie-1 §4 ust. 13 pkt 1); droga hamowania
pociągu to setki metrów, hamowanie nagłe daje ok. 1–1,5 m/s² (Dz.U. 2015 poz. 360 §12 ust. 4 i zał. 1). Przyjęte
(uproszczenia gry):

* pociąg z postojem staje czołem przy końcu peronu w kierunku jazdy – gra nie rysuje W 4, więc przyjmuje go przy końcu
  peronu; peron i jego zasięg wzdłuż toru są te same, które rysuje widok (`src/tiles/platforms.js` – z układu torów
  stacji, bez danych per stacja); czoło staje 0–10 m przed końcem peronu (rozrzut – maszynista nie staje co do metra;
  stały dla zmiany o tym samym ziarnie, różny dla pociągów i zmian); gdy tak zatrzymany pociąg nie zmieściłby się na
  odcinku toru (tył na rozjazdach), staje jak dawniej 12 m przed semaforem końcowym toru peronowego (15 m przed końcem
  odcinka bez semafora);
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

Prędkości szlaku, Sz i rozkazu (wszystkie stanowiska). Ze źródeł: pociąg jedzie z największą prędkością dozwoloną na
odcinku, na którym jest (Ie-1 od 17.01.2026 §4 ust. 13 pkt 2); sygnał zastępczy i rozkaz „S” zezwalają na jazdę do
40 km/h do następnego semafora (Ie-1 od 17.01.2026 §4 ust. 13 pkt 18 – starsze wydania podawały 20 km/h; Ir-1 §63
ust. 5); przy wyjeździe na szlak ograniczenie obowiązuje do końca rozjazdów, na szlaku z SBL – do pierwszego semafora
odstępowego (Dz.U. 2015 poz. 360 §65). Przyjęte (uproszczenia gry): szlak ma jedną prędkość `lineSpeed`; na szlaku
wjazdowym obowiązuje ona do wjazdu całego pociągu na stację; gra nie rysuje semaforów odstępowych, więc na SBL
ograniczenie z Sz / rozkazu trwa przez umowny pierwszy odstęp 1000 m (`SBL_FIRST_BLOCK`).

Jazda na tor zajęty (wszystkie stanowiska). Ze źródeł: przy dojeżdżaniu do taboru prędkość nie większa niż 3 km/h,
skład zatrzymuje się przy taborze (Dz.U. 2015 poz. 360 §9 ust. 4 i 7). Przyjęte (uproszczenia gry): 3 km/h obowiązuje
na ostatnich 50 m przed taborem (`STOCK_CREEP`), skład staje 2 m przed nim (gra nie łączy składów).

Zwrotnica bez kontroli położenia (wszystkie stanowiska). Ze źródeł: zwrotnicę bez kontroli (także rozprutą)
zabezpiecza się na miejscu zamkiem trzpieniowym albo sponą, potem pociąg jedzie przez nią na Sz albo rozkaz „S”
(Ie-10 §32 ust. 2, 4, 8, 9; §35 ust. 1 pkt 1–3 i 6; Ir-1 §41 ust. 6). Przyjęte (uproszczenia gry): zabezpieczenie
zleca się w zakładce Urządzenia panelu (polecenie dla pracownika, nie przycisk pulpitu) i jest gotowe po 3 min
(`POINT_SECURE_TIME`); zabezpieczona zwrotnica się nie przestawia i liczy się jak zamknięta (Zz) dla Sz i rozkazu;
zdjęcie zabezpieczenia – od razu.

Blokada liniowa Eap – przyciski doraźne, Pwl, usterka (wszystkie stanowiska). Źródła: LIRK, P. Okrzesik, „Obsługa
i sygnalizacja stanu półsamoczynnej blokady liniowej typu Eap” (lirk.isdr.pl); ISDR 2.3.2.3.2.3; Ie-20 zał. 4 pkt 16;
trainbrains.eu; DTR Eap-94 (M. Grot); Ir-1 §28 ust. 8–9, 16, 18. Ze źródeł:

* dPo służy do doraźnego **zablokowania** bloku początkowego po wyjeździe pociągu na Sz lub rozkaz (pociąg nie minął
  semafora wyjazdowego na sygnale zezwalającym, więc blok nie zablokował się sam); dKo użyte **przed** wjazdem pociągu
  na Sz lub rozkaz przygotowuje blok końcowy – bez niego Ko nie zadziała, bo urządzenie nie stwierdziło przejazdu przy
  semaforze wjazdowym; żaden z tych przycisków nie kasuje blokady;
* wyciągnięcie Wbl odwołuje żądanie; przed podaniem sygnału pozwolenie wraca, gdy oba posterunki wyciągną Wbl;
* przeciwwtórność liniowa (Pwl): po podaniu sygnału wyjazdowego drugi sygnał na ten szlak nie wyjdzie; po odwołaniu
  sygnału bez wyjazdu pociąg wyprawia się na Sz lub rozkaz;
* bez łączności: sygnał zezwalający wymaga pozwolenia przeniesionego przez blokadę; wyjazd na Sz lub rozkaz po
  zapowiedzi telefonicznej, blokadę obsługuje się pomocniczo (dPo); na torze ze stałym kierunkiem sygnał zezwalający
  jest dopuszczalny (Ir-1 §28 ust. 16 pkt 2, ust. 18; Ie-10 §33 ust. 5, §35 ust. 1 pkt 5–6).

Przyjęte (uproszczenia gry): stwierdzenie przejazdu – gdy pociąg sąsiada minie pierwszy semafor stacji na sygnale
zezwalającym (nie Sz, nie rozkaz); Ko jest do obsłużenia, gdy pociąg minął ten semafor i zjechał w całości ze szlaku;
dKo przed wjazdem – 0 pkt, po wjeździe – −10 (bez kary, gdy pociąg przejechał semafor wjazdowy „Stój” zgaszony przez
usterkę tuż przed nim – dKo nie było kiedy nacisnąć), bez pociągu przyjmowanego – odmowa; dPo – tylko po wyjeździe naszego
pociągu bez sygnału (0 pkt), brak dPo do przyjazdu – −10; oWbl – od razu przy żądaniu, zwrot pozwolenia po
odpowiedzi sąsiada; przy zapowiadaniu telefonicznym telefonogram o przyjeździe zastępuje Ko (dKo się nie używa),
blok początkowy zostaje zablokowany do naprawy, a po naprawie automatyk przywraca blokadę do stanu zasadniczego –
chyba że droga była nasza (zapowiedź „droga wolna” dla naszego pociągu albo niewykorzystane pozwolenie sprzed usterki),
a pociąg jeszcze nie wjechał na szlak: wtedy pozwolenie zostaje u nas, bo pociąg może właśnie mijać semafor wyjazdowy
(przyjęte); pozwolenie „u nas” przy usterce – niewykorzystane pozwolenie w chwili utraty łączności (pociąg, który na
nim wyjechał, zużywa je – następny wyjeżdża na Sz / rozkaz); sygnał wyjazdowy podany przed usterką na takim pozwoleniu
nie gaśnie z utratą łączności (pozwolenie trzymają urządzenia naszej stacji – przyjęte; zgaszony tuż przed pociągiem
kończył się minięciem „Stój”); na szlaku jednotorowym „droga wolna” dla naszego pociągu
wyklucza „droga wolna” dla pociągu sąsiada, także gdy blokada nie ma ustawionego kierunku (telefonogram go nie
przestawia); sąsiad odpowiada „droga wolna” dla naszego pociągu dopiero, gdy jego poprzedni pociąg minął nasz semafor
wjazdowy i jego przyjazd jest zawiadomiony; na blokadzie samoczynnej przy usterce przyjazd pociągu sąsiada zawiadamia
się telefonicznie także wtedy, gdy krótki pociąg zjechał ze szlaku przed minięciem semafora; odpowiedź na zapytanie,
która przyjdzie już po naprawie, niczego nie zapowiada; na torze o kierunku zasadniczym „wjazd” (SBL, linia
dwutorowa) sąsiad przy zapowiadaniu nie wyprawia swojego pociągu, gdy tor jest nasz – po zmianie kierunku (Zk) albo po
„droga wolna” dla naszego pociągu po torze lewym (przyjęte). Stanowisko MOR-1 ma w menu
trójkąta polecenie oWbl – przyjęte (odpowiednik wyciągnięcia Wbl).

Lampki blokady Eap na pulpitach kostkowych (typ E, IZH-111, plan świetlny nastawni mechanicznej) – ISDR 2.3.2.3.2,
tabl. 2.3.12; trainbrains.eu „Elementy blokady liniowej typu Eap”: strzałki opisane „odjazd” i „przyjazd”; żądanie
sąsiada – biała migająca strzałka „przyjazd” (dzwonka gra nie odtwarza), nasze żądanie – biała migająca „odjazd”; po
podaniu sygnału wyjazdowego – czerwona lampka Pwl (w grze na kostce Wbl; na torze jednokierunkowym wyjazdowym bez
kostki Wbl lampki Pwl nie ma – przyjęte); Ko – białe światło ciągłe. Czerwonej migającej strzałki „przyjazd” u sąsiada
(sygnał wyjazdowy podany u niego) gra nie pokazuje, bo nie modeluje sygnałów sąsiada – przyjęte.

Telefonogramy i zapowiadanie telefoniczne (wszystkie stanowiska). Ze źródeł: wzory Ir-1 (Dodatek 2) – 1a „Czy droga
dla pociągu nr … jest wolna?”, 4a „Dla pociągu nr … droga jest wolna”, 5a „Stój pociąg nr …” z przyczyną, 14 „Pociąg
nr … przyjechał o …”; odbiorca powtarza treść (Ir-1 §23 ust. 7 i 9, §24); na szlaku jednotorowym rozmowa 1a / 4a przy
każdym pociągu także przy sprawnej blokadzie (Ir-1 §28 ust. 3, §24 ust. 5, 9, 16); przy zapowiadaniu na torze
właściwym linii dwutorowej – oznajmienie odjazdu i potwierdzenie przyjazdu, bez zapytania (Ir-1 §23 ust. 2–4, §24
ust. 1–2); na linii dwutorowej numer pociągu przekazuje się przy odjeździe (Ir-1 §28 ust. 2, §29 ust. 4). Odmowę –
wzór 5a „Stój pociąg nr …” – może nadać także gracz: sąsiad wycofuje żądanie pozwolenia (przy usterce blokady –
zapytanie o drogę) i zgłasza pociąg ponownie po 3 min (`HOLD_TIME`, czas przyjęty); w tym czasie gracz może zażądać
pozwolenia dla swojego pociągu. Bez tego żądania sąsiada nie dało się odrzucić. Przyjęte
(uproszczenia gry): rozmowy przy sprawnej blokadzie nadają się same (ustawienie „Rozmowy przy sprawnej blokadzie”:
automatycznie – domyślnie, ręcznie – pominięty telefonogram −2 pkt; w samouczkach zawsze automatycznie, a automat
dyżurnego drugiego okręgu nadaje swoje telefonogramy sam); zapowiadanie włącza się i wyłącza z usterką
blokady – bez telefonogramów wprowadzenia (wzór 16) i odwołania (wzór 17) i bez oczekiwania na przejazd pociągu przy
sprawnej blokadzie (Ir-1 §28 ust. 16, 21, 24, 25; Ie-10 §33 ust. 5); rozkaz pisemny „S” zachowuje nazwę i treść
dawnego druku – od 14.12.2025 (zmiana 18 Ir-1, §58 ust. 5 i 9, Dodatek 4) PKP PLK stosuje Księgę Formularzy
(instrukcje 21.10 – wyjazd, 21.15 – wjazd).

Sygnał zastępczy i rozkaz „S” (wszystkie stanowiska). Ze źródeł: blokada liniowa dotyczy toru szlakowego, na który
pociąg wyjeżdża (Ie-1 §4 ust. 13 pkt 18); przed Sz zwrotnice drogi ustawia się, sprawdza i utwierdza, a rozkaz „S”
daje się, gdy Sz podać nie można (Ie-10 §35 ust. 1 pkt 1–2 i 6; Ir-1 §58 ust. 4); przy fałszywym wskazaniu zajętości
dyżurny sprawdza tor na miejscu (Ie-10 §32 ust. 5); pociągi zatrzymuje się przed przeszkodą (Ir-1 §75 ust. 1–2).
Przyjęte (uproszczenia gry):

* droga Sz i rozkazu to tor za semaforem po bieżących położeniach zwrotnic do następnego semafora, wyjazdu albo końca
  toru (`Interlocking.pathBeyond`); blokadę sprawdza się tylko dla wyjazdu na tej drodze;
* Sz i rozkaz są bez kary, gdy usterka jest na tej drodze (semafor bez sygnału, zajętość z usterki, zwrotnica bez
  kontroli); usterka gdzie indziej na stacji ich nie uzasadnia (Sz −5, rozkaz −10);
* Sz polecenia dwuetapowego (EBILock SZI → SZW, MOR-3 – menu i potwierdzenie, polecenie specjalne monitora) ocenia się
  w chwili wyboru: dyżurny decyduje w czasie usterki, potwierdzenie to krok bezpieczeństwa urządzenia. Bez kary, gdy
  usterka na drodze była przy wyborze albo jest przy potwierdzeniu (przyjęte; dawniej liczyła się tylko chwila
  wykonania – usterka naprawiona w czasie odliczania dawała −5);
* tak samo przyjęcie pociągu na tor inny niż planowy: bez kary tylko przy usterce na drodze toru planowego – jego
  odcinki, przebieg na niego od strony wjazdu, przebieg z niego w stronę wyjazdu (zajętość z usterki, licznik osi,
  pęknięta szyna, zwrotnica bez kontroli, semafor tych przebiegów bez sygnału) – czynnej między zgłoszeniem pociągu
  a jego przyjazdem; usterka gdzie indziej na stacji – −5 (przyjęte; wcześniej uzasadniała każda usterka na stacji);
* bez kary za czekanie, którego dyżurny nie mógł uniknąć (przyjęte): termin zadania manewrowego przesuwa się
  o opóźnienie składu od sąsiada (gdy sąsiad je zgłasza, najpóźniej przy przyjeździe; tylko w przód) i o czas, przez
  który każda droga manewrowa do toru docelowego była zamknięta usterką bez obejścia (zwrotnica bez kontroli albo
  nie w położeniu, zajętość z usterki, licznik osi, pęknięta szyna); zadanie czekające na to zadanie przesuwa się
  o tyle samo. Skład stojący z tego powodu nie jest „przetrzymany”, a pociąg utworzony z tego składu nie traci punktów
  za późny odjazd o te minuty. Sygnalizator manewrowy bez sygnału terminu nie przesuwa – dyżurny daje zezwolenie
  (Ir-9 § 10 ust. 15); pociągi też mają obejście usterki (Sz, rozkaz, inny tor), więc ich postój niczego nie przesuwa;
* Sz przy zwrotnicy na drodze ani utwierdzonej w przebiegu, ani zamkniętej Zz – dodatkowo −10 (urządzenie Sz nie
  blokuje – odpowiada dyżurny); rozkaz w takiej sytuacji jest odrzucany jak dotąd;
* po Sz i po rozkazie „S” zwrotnic i wykolejnic na drodze pociągu nie da się otworzyć (Zz), przestawić, odbezpieczyć ani
  użyć w przebiegu w innym położeniu, dopóki pociąg ich nie minie (albo Sz nie zgaśnie, zanim pociąg wjedzie na jego
  drogę) – w rzeczywistości pilnuje tego dyżurny, gra to wymusza (przyjęte; wcześniej zwrotnica przestawiała się przed
  pociągiem, a zdjęcie Zz tuż po Sz omijało karę za zwrotnice nieutwierdzone);
* rozkaz nie jest odrzucany z powodu zajętości z usterki (fałszywa zajętość, licznik osi) – tylko taboru;
* każdy nowy wjazd pociągu na tor z pękniętą szyną kosztuje −50, na tor zamknięty dla ruchu (ITS, np. na Sz) −80.

## Urządzenia przekaźnikowe typu IZH-111 (JZH-111)

Źródło: Beskidzka Strona Kolejowa – „Urządzenia typu JZH-111” (bsk.isdr.pl/srk_izh111.php); plany ciemne i półciemne:
transportszynowy.pl – „Urządzenia elektryczne przekaźnikowe”. Z opisu wzięto:

* podział przycisków na **adresowe** (przy zwrotnicach, sygnalizatorach, blokadach – wybór elementu, także początku
  i końca przebiegu) i **rozkazu** (grupa poza obrazem układu torowego); przyciski na środku kostki;
* przebieg: adres sygnalizatora początkowego, adres końcowego i rozkaz „P” albo „M”; przebieg złożony z kilku
  elementarnych wymaga tylko początku i końca; inny wariant wybiera zwrotnica zamknięta przyciskiem „STOP”;
* zwrotnica: adres i „+” albo „−”; „STOP” – zamknięcie (czerwona lampka, szczeliny świecą na stałe), „Zw” –
  odwołanie zamknięcia; zwrotnice w przejściach nie są sprzężone;
* zwalnianie: „Zcz” z adresem semafora końcowego – po 120 s, lampka przy przycisku miga na biało (źródło opisuje ją
  tylko przy sygnalizatorze końcowym – przy końcu toru i przy szlaku lampki w grze nie ma); przebieg manewrowy
  – „Zw”, bezzwłocznie; sygnał zastępczy rozkazem „Sz”, rejestrowany licznikiem;
* sygnalizator: „STOP” z adresem zamyka go – sygnał „Stój” do odwołania rozkazem „Zw”, lampka przy przycisku miga na
  czerwono (bsk.isdr.pl/srk_izh111.php); stan sygnalizatora pokazują tylko lampki powtarzacza – przycisk adresowy
  nie świeci przy sygnale zezwalającym;
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
  (Zacisze – misja 3, zmiany na Szkolnej i Jodłowej); misja uczy wjazdów na tory czołowe i wyjazdów rozkazem P,
  a rozkazów „−”, STOP i Zw – przy usterce obwodu torowego.

## Urządzenia mechaniczne scentralizowane (nastawnia mechaniczna)

Źródła: Instrukcja E16 – obsługa urządzeń srk mechanicznych scentralizowanych i kluczowych (rozdz. 2 „Opis urządzeń”,
rozdz. 3 „Obsługa urządzeń”); Instrukcja Ie-8 (rozdz. 2 „Urządzenia nastawcze mechaniczne scentralizowane”) – tekst
za kolej.krb.com.pl; transportszynowy.pl – „Urządzenia mechaniczne scentralizowane”. Z opisu wzięto:

* nastawnica = ława z dźwigniami nastawczymi, podstawa blokowa z **drążkami przebiegowymi** i **aparat blokowy**
  (Ie-8 §5 ust. 7, §9 ust. 2);
* barwy trzonów dźwigni: zwrotnicowe i wykolejnicowe – niebieskie, semaforowe – czerwone, tarcz manewrowych –
  niebieskie z czerwoną obwódką; dźwignia ma położenie zasadnicze (górne) i przełożone (dolne) (Ie-8 §6 ust. 4;
  transportszynowy.pl); w położeniu zasadniczym dźwignia jest nachylona o 38° od pionu, przełożona obraca się
  o 180° i zwisa w dół (transportszynowy.pl „Urządzenia mechaniczne scentralizowane”);
* semafor rozprzężony (podaje Sr2 albo Sr3) ma dwie sprzężone dźwignie – jedną dla Sr2, drugą dla Sr3; semafor
  sprzężony (tylko Sr1 / Sr3) – jedną (transportszynowy.pl);
* drążek przebiegowy ma położenie pośrednie: zamyka zwrotnice drogi przebiegu, ale nie pozwala podać sygnału
  zezwalającego – służy do jazdy na sygnał zastępczy; gdy i tego zrobić się nie da, zwrotnice zabezpiecza się na
  miejscu (Ie-8 §21 ust. 14–15; transportszynowy.pl „Blokada stacyjna”);
* aparat blokowy: klawisze bloków są na górnej płaszczyźnie skrzyni, okienka i zwalniacze (plombowane) na ścianie
  czołowej, pod okienkami tabliczki z opisem (Ie-8 §9 ust. 3; transportszynowy.pl „Blokada stacyjna”);
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

Semafory i tarcze kształtowe – Instrukcja Ie-1 (E1) §3, §5, §7, tekst za kolej.krb.com.pl/e1 (sem.htm, ostrzeg.htm,
man.htm). Z opisu wzięto:

* semafor kształtowy: słup z ruchomymi ramionami białymi z czerwoną obwódką; **Sr1 „Stój”** – ramię poziomo na prawo
  od słupa, **Sr2 „Wolna droga”** – ramię wzniesione pod kątem 45° (największa dozwolona szybkość), **Sr3 „Wolna
  droga ze zmniejszoną szybkością”** – dwa ramiona wzniesione pod kątem 45°, do 40 km/h od semafora do końca okręgu
  zwrotnicowego; semafory jedno- i dwuramienne; nocą światła (czerwone, zielone, zielone nad pomarańczowym);
* sygnał zastępczy Sz – białe światło migające na słupie semafora wskazującego Sr1;
* tarcza ostrzegawcza kształtowa stoi przed semaforem kształtowym: **dwustawna** – okrągła tarcza pomarańczowa
  z czarnym pierścieniem i białą obwódką (pierścień przylega do obwódki – rysunek od1dz.gif), **Od1** ustawiona pionowo (semafor wskazuje Sr1), **Od2** w położeniu
  poziomym (semafor wskazuje Sr2 albo Sr3); **trzystawna** – ta sama tarcza i biała strzała z czerwoną obwódką pod nią:
  **Ot1** tarcza pionowo, strzała w dół (Sr1), **Ot2** tarcza poziomo, strzała w dół (Sr2), **Ot3** tarcza pionowo,
  strzała ukośnie 45° w dół na prawo od słupa (Sr3);
* tarcza manewrowa kształtowa ruchoma: **M1 „Jazda manewrowa zabroniona”** – kwadratowa tarcza niebieska z białą
  obwódką, jedną przekątną pionowo; **M2 „Jazda manewrowa dozwolona”** – tarcza w położeniu poziomym.

Uproszczenia i założenia w grze (przyjęte – źródła ich nie podają albo gra upraszcza obsługę):

* jedna nastawnia dysponująca prowadzi całą stację – bez bloków nakazu i zgody między nastawniami;
* semafory kształtowe na całej stacji (także wyjazdowe i tarcze manewrowe); semafor ma dwa ramiona, gdy wychodzi
  z niego przebieg pociągowy o szybkości do 60 km/h (przez zwrotnicę w kierunku zwrotnym) – na ten przebieg podaje
  Sr3, na pozostałe Sr2; w rzeczywistości liczba ramion wynika z projektu stacji;
* semafor, z którego wychodzą przebiegi na Sr2 i na Sr3, ma dwie dźwignie sygnałowe; drążek przebiegowy zamyka tę,
  której przebieg nie wymaga. Oznaczenia dźwigni indeksem liczby ramion – A¹ (Sr2), A² (Sr3) – są przyjęte. Semafor,
  którego wszystkie przebiegi pociągowe są na Sr3, i semafor jednoramienny mają jedną dźwignię. Przebieg manewrowy
  z semafora z dwiema dźwigniami podaje dźwignia pierwsza (uproszczenie gry – takiego semafora stacje gry nie mają);
* dolne ramię semafora dwuramiennego w położeniu spoczynkowym (Sr1, Sr2) stoi pionowo w górę od swojej osi, tarczką
  tuż pod górnym ramieniem, a przy Sr3 obraca się o 45° – jak na rysunkach sr1dz.gif, sr2dz.gif, sr3dz.gif
  (kolej.krb.com.pl/e1); tego Ie-1 w cytowanym tekście nie opisuje słowami;
* dźwignie rysowane są z boku, każda osobno (w rzeczywistości nastawniczy widzi rząd dźwigni od czoła); kąt 38°
  i obrót o 180° jak w źródle, koziołek uproszczony do tarczy z dwoma wycięciami zapadki;
* położenie pośrednie drążka: w grze osobne pole po lewej stronie szczeliny (kreska „½”) – drążek zamyka zwrotnice
  i wykolejnice drogi przebiegu (także ochronne), nie sprawdza zajętości odcinków ani blokady liniowej i wyklucza
  przebiegi po tych samych odcinkach; sygnału zezwalającego ani bloku przebiegowego podać się wtedy nie da. Drążek
  wraca w położenie zasadnicze dopiero po zgaśnięciu Sz (przyjęte). Sz przy niezamkniętych zwrotnicach nie jest
  blokowany, ale kosztuje punkty (kod `Sz-points`). Kliny zastawcze z Ie-8 zastępuje w grze zabezpieczenie zwrotnicy
  na miejscu (`point-secure`). Położenie pośrednie mają tylko drążki przebiegów pociągowych (przyjęte);
* tabliczka pod okienkiem bloku przebiegowego nosi nazwę semafora początkowego (przyjęte – źródło mówi tylko
  o tabliczkach z opisem);
* semafor z sygnałem manewrowym (np. C2 w Olszynach) ma na słupie tarczę manewrową kształtową (M1 / M2) – przyjęte,
  bo semafor kształtowy nie ma obrazu Ms2; jazda manewrowa obok niego – na M2 jak na tarczy manewrowej;
* tarcza ostrzegawcza kształtowa jest tylko przy semaforach wjazdowych (pole `entry`): trzystawna przed semaforem
  dwuramiennym, dwustawna – przed jednoramiennym; gra rysuje ją na kostce semafora wjazdowego (w rzeczywistości stoi
  w odległości drogi hamowania przed nim) i nie zmienia jazdy pociągu – maszynista i tak hamuje przed semaforem
  na „Stój”;
* semafor kształtowy ma sprzęgło elektryczne: ramię opada samo na Sr1, gdy semafor minie ostatnia oś pociągu
  (Ie-4 §40), a dźwignia sygnałowa zostaje przełożona, aż nastawniczy ją cofnie (Ie-8 §21 ust. 11). Sprzęgło jest
  przyjęte – są też semafory bez niego, na których ramię opada dopiero po cofnięciu dźwigni (sprawa do decyzji);
* po Sr3 pociąg jedzie do 40 km/h do końca okręgu zwrotnicowego – tak jak po S10–S13 na innych stanowiskach;
* plan świetlny pokazuje powtarzacze semaforów i tarcz w postaci rysunku ramion i tarcz (przyjęte – w rzeczywistości
  nastawniczy widzi je przez okno albo na powtarzaczach); ruch ramienia i tarczy trwa na rysunku niecałą sekundę,
  przy ustawieniu systemu „ogranicz ruch” – bez animacji;
* drążek przebiegowy należy do jednego sygnalizatora początkowego i obsługuje najwyżej dwa przebiegi (położenia
  „w górę” i „w dół”, jak drążek z dwoma przebiegami sprzecznymi); sygnalizator z większą liczbą przebiegów ma
  kolejne drążki;
* dźwignia zwrotnicowa przestawia zwrotnicę w 2 s (czas przyjęty – pędnia drutowa działa od razu);
* przebieg manewrowy nie ma bloku przebiegowego utwierdzającego: drążek i dźwignia tarczy;
* ręczne zwolnienie bloku (zwalniacz, plomba) liczy licznik jak dPz i kosztuje punkty jak dPz – bez kary, gdy blok
  nie zwolnił się przez usterkę urządzenia oddziaływania pociągu (usterka `route-block`, misja 4; E16 §8 ust. 19)
  albo przez usterkę obwodu torowego, przez który pociąg już przejechał (przebieg nie jest „przejechany”, jak na
  innych stanowiskach);
* sygnał zastępczy – klawisz przy aparacie blokowym z licznikiem, jak na innych stanowiskach;
* plan świetlny pokazuje zajętość odcinków, powtarzacze sygnałów i blokadę liniową (Ie-8 §11 ust. 4); położenie
  zwrotnic Ie-8 na planie nie wymienia – w rzeczywistości widać je na dźwigni i na latarniach zwrotnicowych przez
  okno nastawni. Gra nie ma widoku z okna, więc plan pokazuje położenie przygaszonym żółtym na ramieniu zwrotnicy,
  a w szczelinie drugiego ramienia – przerwę (uproszczenie gry); przy dźwigniach są oznaczenia położeń („+” / „−”,
  „nał.” / „zdj.”, małe ramię semafora poziomo / wzniesione, tarcza manewrowa M1 / M2).
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

## Tabor pociągów (`src/model/rollingStock.js`)

Podpowiedź numeru pociągu w rozkładzie i karta na zakładce „Pociągi” pokazują tabor: zespół trakcyjny („skład:
2 × EN57”) albo lokomotywę („lokomotywa ET22”). Pociąg jedzie z tym taborem: przyspieszenie, hamowanie i prędkość
pojazdu biorą się z danych typu („Tabor pociągów – dynamika” niżej); długość pociągu – z wpisu rozkładu. Katalog to stan na 1.10.2026;
wszystkie źródła sprawdzone 1.10.2026. Typ, którego jazdy w rejonie Trójmiasta źródło nie potwierdza, nie wchodzi do
katalogu.

Ze źródeł – elektryczne zespoły trakcyjne SKM Trójmiasto (linia 250) i Polregio (oddział pomorski):

* EN57 – 3 człony, 64,97 m, prędkość konstrukcyjna 120 km/h (w eksploatacji 110 km/h); jazda w trakcji ukrotnionej
  z EN57, EN71 i ED72 (https://pl.wikipedia.org/wiki/EN57). SKM – tabor własny „EN57, EN57AKM, EN71 oraz 31WE”
  (https://www.skm.pkp.pl/o-nas/informacje-o-firmie); Polregio – 3 EN57 województwa pomorskiego
  (https://kolejowyportal.pl/pomorskie-chce-sprawdzic-stan-taboru-przed-zmiana-operatora/, 7.08.2026). Odmiany
  EN57AL, EN57ALd, EN57AP (Polregio) i EN57AKM (SKM) jeżdżą w regionie, ale źródła nie podają ich długości – katalog ich
  nie rozróżnia;
* EN71 – 4 człony, 86,84 m, 110 km/h; SKM (https://pl.wikipedia.org/wiki/EN71; skm.pkp.pl jak wyżej);
* 31WE Impuls – 4 człony, 74,4 m, 2 zespoły SKM (https://www.rynek-kolejowy.pl/wiadomosci/impulsy-dla-skm-trojmiasto-gotowe-duzo-zdjec-75565.html,
  26.02.2016); „Maksymalna prędkość eksploatacyjna 160 km/h” (Newag – adres w „Tabor pociągów – dynamika”);
* 31WEbb Impuls 2 – 4 człony, ok. 75 m, 160 km/h (https://pomorskie.eu/press/taborowa-rewolucja-na-pomorzu-nowe-pojazdy-na-torach-skm/,
  7.12.2023); własność województwa: w SKM i 13 zespołów w Polregio (kolejowyportal.pl jak wyżej), w Polregio m.in.
  Elbląg – Gdynia Chylonia (https://pulsgdanska.pl/transport/kolej/nowe-impulsy-trafily/M9g33Qq7N32HzTdq41Oa, 6.04.2024);
* 58WE Impuls 2 – 3 człony, „ok. 77 metrów”, 20 zespołów województwa dla SKM
  (https://www.rynek-kolejowy.pl/wiadomosci/pomorskie-kupi-20-impulsow-dla-skm-trojmiasto--112619.html, 27.03.2023;
  ostatnie odebrane w lipcu 2026: https://www.rynek-kolejowy.pl/wiadomosci/newag-wkrotce-odbior-ostatnich-impulsow-dla-pkp-skm-trojmiasto-153499.html).
  Prędkości konstrukcyjnej źródła nie podają – przetarg wymagał 120 km/h
  (https://www.trojmiasto.pl/wiadomosci/Nowy-pociag-dla-SKM-na-testach-w-Trojmiescie-n200558.html); `vmax: null`;
* 45WE Impuls (w Polregio EN90) – 5 członów, 160 km/h, 10 zespołów województwa dostarczonych w latach 2018–2020
  (https://www.rynek-kolejowy.pl/wiadomosci/pomorskie-impulsy-do-naprawy-rewizyjnej-124504.html;
  https://www.rynek-kolejowy.pl/wiadomosci/nowoczesny-impuls-45we032-zawital-na-linie-pomorskiej-kolei-metropolitalnej-115738.html);
  długość 90,40 m – z opisu tego samego typu u innego przewoźnika (https://kolejedolnoslaskie.pl/o-spolce/tabor/pojazdy-elektryczne/45we/).

Ze źródeł – spalinowe zespoły trakcyjne Polregio na liniach bez sieci (tylko przypięte polem `stock`):

* SA133 (Pesa 218Mc) – 2 człony, 41,70 m, 120 km/h; zespoły 029–031 „dedykowane obsłudze linii PKM”
  (https://pl.wikipedia.org/wiki/SA133);
* SA136 Atribo – 3 człony, 55,57 m, 140 km/h konstrukcyjna (120 km/h w eksploatacji); 7 zespołów województwa,
  w Polregio od 11.12.2022 na PKM (https://pl.wikipedia.org/wiki/SA136);
* SA137 (Newag 220M) – 2 człony, 41,8 m; SA138 (Newag 221M) – 3 człony, 58,36 m; oba 120 km/h
  (https://pl.wikipedia.org/wiki/Newag_220M); artykuł o linii 213 wymienia je w ruchu do Helu
  (https://pl.wikipedia.org/wiki/Linia_kolejowa_nr_213 – opis sprzed lat, obecny przydział przyjęty).

Linie bez sieci trakcyjnej: 213 Reda – Hel „niezelektryfikowana i jednotorowa” (strona linii 213 jak wyżej);
201 Gdynia – Kościerzyna – zelektryfikowane tylko Gdynia Gł. – Gdynia Port i Nowa Wieś Wielka – Maksymilianowo,
sieć Kościerzyna – Gdańsk Osowa „w budowie” (https://pl.wikipedia.org/wiki/Linia_kolejowa_nr_201); 203 Tczew – Czersk –
Chojnice – elektryfikacja „planowana” (https://pl.wikipedia.org/wiki/Linia_kolejowa_nr_203). Linia 248 (PKM) ma sieć
od czerwca 2023 (https://pl.wikipedia.org/wiki/Linia_kolejowa_nr_248), ale pociągi do Kartuz jadą dalej liniami bez
sieci (201 / 229).

Ze źródeł – PKP Intercity (pociągi do Gdyni i Gdańska, lato 2026). Zestawienie pociągów PKP Intercity dla Gdyni Głównej
14.06–29.08.2026 (https://www.intercity.pl/dokumenty/zestawienia%20poci%C4%85g%C3%B3w/od-14-06-2026/Gdynia_Glowna_20260614_20260829_20260630.pdf)
oznacza pociągi „zestawione z elektrycznych zespołów trakcyjnych”, ale nie podaje typu; przydziały dzienne z 15.08.2026
– 55p.cz (serwis miłośniczy, nieoficjalny):

* ED250 Pendolino – 7 członów, 187,4 m, „Maksymalna prędkość eksploatacyjna: 250 km/h”
  (https://www.intercity.pl/pl/site/dla-pasazera/informacje/nasze-pociagi/express-intercity-premium/specyfikacja-i-uslugi.html);
  EIP Warszawa – Gdynia, Gdynia – Kraków; jazdy w dwóch zespołach Kraków – Gdynia
  (https://www.rynek-kolejowy.pl/wiadomosci/pkp-intercity-podwojne-pendolino-do-kolobrzegu-gdyni-i-krakowa-124229.html,
  1.08.2025);
* ED160 Flirt – 8 członów, „Długość jednego pociągu wynosi 152,9 metra”, 160 km/h
  (https://psmkms.krakow.pl/index.php/kolej/elektryczne-zespoly-trakcyjne/1465-ed160); IC z Gdyni do Zakopanego (IC 5360/1
  „Witkacy” – zestawienie Gdyni Głównej), Katowic, Bielska-Białej, Łodzi i Poznania (55p.cz). Jazdy dwóch zespołów źródła
  nie potwierdzają;
* EU160 Griffin – „Eksploatuje je już zakład w Warszawie i w Gdyni”
  (https://www.intercity.pl/pl/site/o-nas/dzial-prasowy/aktualnosci/juz-66-polskich-lokomotyw-griffin-we-flocie-pkp-intercity.html,
  14.03.2025), 160 km/h (https://transinfo.pl/inforail/po-gdyni-i-warszawie-takze-krakow-z-griffinami-pkp-intercity-zastepuja-ep09/);
  EU200 Griffin – „oznaczenie serii EU200”, „prędkość 200 km/h”
  (https://www.intercity.pl/pl/site/o-nas/dzial-prasowy/aktualnosci/griffin-200-%E2%80%93-polski,-ale-nie-tylko-na-polskie-tory.html),
  IC Gdynia – Łódź z zakładu w Gdyni (55p.cz); EP07 – 125 km/h (https://en.wikipedia.org/wiki/PKP_class_EP07), IC/TLK
  z zakładu w Gdyni (55p.cz);
* 754 „Nurek” (České dráhy, dzierżawa PKP Intercity) – „Maximální povolená rychlost: 100 km/h”
  (https://cs.wikipedia.org/wiki/Lokomotiva_754); „Lokomotywy serii 754 … zostaną skierowane do obsługi pociągów na trasie
  Gdynia – Hel” (https://kolejowyportal.pl/30-lokomotyw-spalinowych-to-za-malo-pkp-intercity-siega-po-czeski-tabor/,
  21.04.2026); zmiana lokomotywy „z elektrycznej na spalinową na stacji Gdynia Główna, ponieważ na linii kolejowej nr 213
  (Reda – Hel) nie ma sieci trakcyjnej” (https://magazyn.koleo.pl/eic-jantar-2025/, 7.07.2025).

Ze źródeł – lokomotywy towarowe przewoźników obecnych w portach: obsługę manewrową w porcie Gdynia mają „PKP CARGO S.A
the Company's Northern Plant”, „CTL Północ”, „DB Cargo Polska”, „Freightliner PL”, „LOTOS Kolej”
(https://www.bct.gdynia.pl/en/rail); Lotos Kolej i Orlen KolTrans to od 14.10.2024 Orlen Kolej z siedzibą w Gdańsku
(https://pl.wikipedia.org/wiki/Orlen_Kolej); PKP Cargo ma lokomotywownię w Zajączkowie Tczewskim
(https://pl.wikipedia.org/wiki/Zaj%C4%85czkowo_Tczewskie); typy w zapleczu PKP Cargo – „Wykaz taboru utrzymywanego
w zapleczu PKP CARGO S.A.” (https://www.pkpcargo.com/wp-content/uploads/2023/10/zalnr4doregulaminudostepudooiupkpcargosawykaztaboruutrzymywanegowzapleczupkpcargosa.pdf).

* elektryczne: ET22 – PKP Cargo, 125 km/h (https://pl.wikipedia.org/wiki/Pafawag_201E); ET41 – PKP Cargo, 125 km/h
  (https://pl.wikipedia.org/wiki/HCP_203E); EU07 – PKP Cargo (24 zmodernizowane), 125 km/h
  (https://pl.wikipedia.org/wiki/Pafawag_4E/HCP_303E); EU46 Vectron – PKP Cargo, 160 km/h
  (https://www.pkpcargo.com/pkp-cargo-z-trzema-nowymi-lokomotywami-vectron/); E6ACT Dragon – „Lotos Kolej 5 Dragonów typu
  E6ACT”, 120 km/h (https://pl.wikipedia.org/wiki/Newag_Dragon); E6ACTa Dragon 2 – Orlen Kolej, CTL Logistics (trasy
  „do Szczecina, Polic, Gdańska”: https://kurier-kolejowy.pl/aktualnosci/33024/ctl-logistics-pozyskal-dwa-dragony-2.html),
  120 km/h (https://en.wikipedia.org/wiki/Newag_Dragon); 111Eo Gama – PCC Intermodal, kontenery z Gliwic do DCT Gdańsk
  (https://kurier-kolejowy.pl/aktualnosci/40948/przedwczoraj-przekazana--wczoraj-nowa-lokomotywa-pcc-intermodal-wyruszyla-z-gliwic-do-gdanska.html),
  160 km/h (https://www.rynek-kolejowy.pl/wiadomosci/pierwsza-gama-111eo-juz-w-eksploatacji-w-orion-kolej-113595.html);
* spalinowe: Class 66 (JT42CWRM) – Freightliner PL, DB Cargo Polska, 120 km/h (https://pl.wikipedia.org/wiki/EMD_JT42CWRM;
  https://najsilniejsi.pl/mocniejsi-o-nowe-lokomotywy/); 311D – DB Cargo Polska, CTL Logistics, 100 km/h
  (https://pl.wikipedia.org/wiki/Newag_311D); ST44 (M62) – PKP Cargo, 100 km/h (https://pl.wikipedia.org/wiki/%C5%81TZ_M62);
  ST45 (Pesa 301Dd) – PKP Cargo, 120 km/h (https://pl.wikipedia.org/wiki/Pesa_301Dd); ST48 (Newag 15D) – PKP Cargo,
  100 km/h (https://en.wikipedia.org/wiki/Newag_15D/16D);
* manewrowe: SM42 – PKP Cargo, Orlen Kolej (6Dg), 90 km/h (https://pl.wikipedia.org/wiki/Fablok_6D;
  https://pl.wikipedia.org/wiki/Newag_6Dg); SM48 (TEM2) – PKP Cargo, 100 km/h (https://pl.wikipedia.org/wiki/TEM2).

Pominięte, bo źródło nie potwierdza jazdy w rejonie albo nie podaje danych: ED161 Dart, ED74, EU44 Husarz, EP09, EP07P,
EU07A i SU160 (PKP Intercity – brak pociągów w Trójmieście w 2026 albo tylko plan), Vectrony dzierżawione do pociągów
IC Gedania (przewoźnik i oznaczenie nieustalone), ED72, EN76 / 22WE Elf, 14WE, SA134 (brak w taborze pomorskim),
36WEhb (hybrydowy Impuls 2 na linii 201 – źródła podają długość tylko innej odmiany), odmiany EN57 bez podanej
długości, ET42, ST43, Traxx, Griffin E4DCU, Vectron Freightlinera (bez prędkości).

Przyjęte (decyzje gry, nie dane ze źródła):

* przydział taboru do pociągów i linii – źródła podają, którzy przewoźnicy i jakie typy jeżdżą w regionie, a nie który
  pojazd jedzie danym pociągiem (rozkład gry jest fikcyjny). SKM: EN57, EN71, 31WE, 31WEbb, 58WE; Regio (Polregio):
  EN57, 31WEbb, 45WE; IC / EIC / TLK: ED160, EU160, EU200, EP07; EIP: ED250; skład EZT bez pasażerów: pule SKM i Regio;
  pociągi towarowe: lokomotywy liniowe o trakcji pociągu (`traction`), zdawcze (TK) także manewrowe SM42 / SM48;
* pociągi pasażerskie z linii bez sieci mają tabor przypięty w pliku stacji: Hel (Reda, Gdańsk Gł.) – SA136, SA137,
  SA138; Chojnice (Tczew) i Kościerzyna (Gdynia Gł.) – SA133, SA136, SA137, SA138 (typy z pomorskiego taboru Polregio;
  przydział do tych linii przyjęty); Kartuzy (Gdańsk Gł.) – SA133, SA136 (PKM); TLK Hel – Warszawa na odcinku przed
  Gdynią Główną (Reda, Rumia, Chylonia) – 754. W Gdyni Głównej, gdzie zmienia się lokomotywę, gra pokazuje lokomotywę
  elektryczną, z którą pociąg odjeżdża (postój w rozkładzie gry nie obejmuje zmiany lokomotywy);
* długość: zespoły z puli pasują, gdy ich łączna długość różni się od długości pociągu z rozkładu najwyżej o 20 %
  (`STOCK_LENGTH_TOLERANCE`); gdy żaden typ nie pasuje – zestaw o najmniejszej różnicy; najwyżej 2 zespoły w pociągu
  (ED160 – 1). Przykład: SKM 130 m → 2 × EN57 (129,9 m), 2 × 31WE, 2 × 31WEbb albo 2 × 58WE; EN71 do 130 m nie pasuje.
  Przypięta lista typów (`stock`) to wybór autora stacji – może przyjechać każdy typ z listy, z liczbą zespołów
  najbliższą długości pociągu (np. Kartuzy 130 m: 2 × SA133, 83,4 m; Kościerzyna 80 m: 1 × SA136, 55,6 m);
* typy z pul, których nie dostaje żaden pociąg rozkładów gry: ED250 – w rozkładach gry nie ma pociągów EIP;
  ED160 – pociągi IC / EIC w rozkładach gry mają 250–350 m, a jeden zespół (152,9 m, jazdy dwóch zespołów źródła nie
  potwierdzają) odbiega od nich o więcej niż 20 %; EN71 – pociągi SKM w rozkładach gry mają 130 m, a jeden zespół
  (86,84 m) i dwa (173,7 m) odbiegają o więcej niż 20 %. Długości pociągów w rozkładach to dane stacji, więc tabor do
  nich się dopasowuje, nie odwrotnie; typy zostają w katalogu – dostaje je pociąg o pasującej długości;
* losowanie na zmianę: ciąg losowy z ziarna zmiany i numeru pociągu (osobny od losowań opóźnień i usterek); tabor
  wybiera się raz, przy tworzeniu rozkładu zmiany, a pociąg nadzwyczajny dodany w trakcie zmiany losuje osobno;
  kolejny pociąg tej samej linii (ta sama kategoria, te same szlaki `from` i `to`, w kolejności godzin) dostaje inny
  typ niż poprzedni, gdy pasuje więcej typów; pociąg, który zaczyna albo kończy bieg na stacji, losuje sam (szlak
  z jednej strony nie odróżnia relacji – do Gdańska Gł. jednym szlakiem wjeżdżają pociągi z Helu i z Kartuz); pociąg
  ze składu innego (`unit`) ma tabor tamtego pociągu.


### Tabor pociągów – dynamika

Pociąg jedzie z dynamiką swojego taboru (`trainDynamics` w `src/model/rollingStock.js`). Wszystkie źródła sprawdzone
1.10.2026. Wzory (przyjęte – uproszczona fizyka jazdy):

* zespół trakcyjny: przy ruszaniu przyspieszenie rozruchu typu (`accel`); przy prędkości v najwyżej P / (m · v), gdzie
  P – moc zespołu (`power`), m – masa własna zespołu (`mass`, bez podróżnych). Kilka zespołów w pociągu przyspiesza jak
  jeden: każdy ma własny napęd i własną masę (EN57 – „Jednostki EN57 są przystosowane do jazdy w trakcji wielokrotnej”,
  każdy zespół z własnym członem silnikowym – DSU EN57/EN71 niżej; Impuls – „Sterowanie wielokrotne wymagane do
  2 pojazdów”, napęd na każdy wózek napędny – OPZ SKM i Newag niżej; ED160 – „Multiple unit train control with two
  vehicles”; ED250 – jazdy dwóch zespołów w trakcji podwójnej; SA13x – sterowanie ukrotnione do 3 pojazdów, każdy
  z dwoma zespołami napędowymi);
* lokomotywa: przy ruszaniu F / (m_lok + m_skł), najwyżej `LOCO_ACCEL_MAX` = 1,0 m/s² (przyjęte: lokomotywa luzem ma
  F / m 2–3,5 m/s², czego pojazd nie osiąga – poślizg kół); przy prędkości v najwyżej P / ((m_lok + m_skł) · v);
  m_skł – pociąg towarowy: `mass` wpisu (masa brutto składu); pasażerski: wagony = zaokrąglone (długość pociągu −
  długość lokomotywy) / 26,4 m, po 50 t każdy (masa wagonu bez podróżnych – przyjęte);
* hamowanie: wg typu, masy i długości pociągu, z maszynistą – osobny rozdział „Hamowanie jak maszynista” niżej;
* prędkość: typ wolniejszy niż pociąg ogranicza pociąg; podpowiedź rozkładu pokazuje tę prędkość, a sąsiedni posterunek
  wyprawia pociąg tak, by przy tej prędkości przyjechał o czasie. Pula losuje tylko typy nie wolniejsze niż pociąg
  z rozkładu (przyjęte: przewoźnik daje pojazd, który pojedzie wg rozkładu – EP07, 125 km/h, nie do IC 160 km/h);
  typ przypięty polem `stock` zostaje i ogranicza pociąg (754: TLK Hel – Warszawa 100 km/h);
* siła rozruchowa: gdy źródło podaje tylko maksymalną siłę pociągową (bez „przy rozruchu”), gra bierze ją (przyjęte:
  największą siłę lokomotywa ma przy ruszaniu); moc spalinowych – trakcyjna lub na obręczy kół, gdy źródło ją podaje,
  inaczej moc silnika (przyjęte – trochę zawyżona);
* bez oporów ruchu (toczenia, powietrza, łuków, pochyleń) – przyjęte; dlatego pociąg rozpędza się trochę szybciej niż
  w rzeczywistości. Sprawdzian: EN57 do 100 km/h – w grze 88 s, wg Medcom 120 s; bez ograniczenia mocą byłoby 56 s;
* brak danej w źródle → wartość kategorii: przyspieszenie EN71, 31WEbb, SA133, SA136 i lokomotywy 111Eo; ograniczenie
  mocą tylko przy znanej mocy i masie (bez niego: EN71, 31WEbb, 58WE, 111Eo); `accel` wpisu – stałe przyspieszenie.

Ze źródeł – zespoły elektryczne:

* EN57 – „Przyspieszenie 0÷40 km/h [m/s2] 0,5” (EN57; EN57AKM – 1,0), „Moc ciągła [kW] 608”, „Czas rozpędzania do
  100 km/h [s] 120” (Medcom, folder „EN57AKM”, 2009:
  https://web.archive.org/web/20130612180325id_/http://www.medcom.com.pl/dl/MEDCOM_EN57AKM.pdf); masa własna (próżna)
  123 t (PKP PLK, Regulamin sieci 2026/2027, zał. 13 v.21 „Wykaz zarejestrowanych pojazdów trakcyjnych w aplikacji
  ISZTP i SKRJ”, kolumna „Masa własna EZT i A. – próżna”:
  https://www.plk-sa.pl/files/public/user_upload/pdf/Reg_przydzielania_tras/Regulamin_sieci_2026-2027/v.21/zal_13_Reg26_27_v21_POL-ANG.xlsx
  – dalej „zał. 13”); trakcja wielokrotna (Przewozy Regionalne, DSU EN57/EN71, 2010:
  http://web.archive.org/web/20140912081146/http://www.pomorskie.eu/res/BIP/UMWP/zamowienia_publiczne/zamowienia/2012/015/dsu_en57_en71_spot___wersja_ostateczna_zatwierdzona.pdf).
  Katalog nie rozróżnia EN57AKM (SKM) – wartości EN57 (przyjęte); świadomie mieszane: przyspieszenie rozruchu 0,5 m/s²
  pierwotnego EN57 (Medcom), a hamowanie 0,8 m/s² z wymagania SKM 2010 dla modernizacji EN57 („Hamowanie jak
  maszynista”). Prędkość w katalogu: 120 km/h (konstrukcyjna, jak
  wyżej; EN57AKM – 120 km/h w zał. 13), choć DSU i zał. 13 podają dla EN57 110 km/h – przyjęte, bo katalog obejmuje
  też EN57AKM; przez to pula SKM / Regio (120 km/h) może dostać EN57;
* EN71 – masa własna 178 t (zał. 13); przyspieszenia i mocy źródła nie podają (pl.wikipedia – bez przypisu);
* 31WE – „Przyspieszenie rozruchu ≥ 1,0 m/s²”, „Moc znamionowa 2 000 kW”, „Maksymalna prędkość eksploatacyjna
  160 km/h” (Newag, „Elektryczne zespoły trakcyjne”: https://www.newag.pl/wp-content/uploads/2025/01/Elektryczne-Zespoly-Trakcyjne-PL.pdf);
  wymaganie SKM: „Przyśpieszenie rozruchu (przy nominalnym obciążeniu) średnie, min. 1,0 m/s2” (OPZ, 11.2014, w
  dokumentacji przetargowej: https://web.archive.org/web/20160304214952/http://www.skm.pkp.pl/uploads/tx_przetargi/dokumentacja_przetargowa_94ecf3.zip);
  masa własna 145 t (zał. 13);
* 31WEbb – masa własna 145 t, 160 km/h (zał. 13); przyspieszenia i mocy tego typu źródła nie podają;
* 58WE – „Przyśpieszenie określono na co najmniej 1,1 m/s2” – wymaganie zamówienia (rynek-kolejowy.pl, 27.03.2023 –
  adres przy 58WE wyżej); przyjęte jako przyspieszenie typu (pojazdy odebrane spełniają wymagania); masa własna
  165,5 t (zał. 13); mocy źródła nie podają; prędkość: zał. 13 – 160 km/h, wymaganie przetargu – 120 km/h, więc
  `vmax` zostaje null;
* 45WE (w Polregio EN90) – „Przyspieszenie rozruchu ≥ 1,0 m/s²”, „Moc znamionowa 2 000 kW” (Newag jak wyżej);
  EN90: „cztery silniki trakcyjne o mocy 500kW każdy” (rynek-kolejowy.pl, 45WE032 – adres wyżej); masa własna EN90
  168 t (zał. 13);
* ED250 – „Przyspieszenie rozruchu: 0,49 m/s2”, moc ciągła 5664 kW, masa służbowa 410 t
  (https://pl.wikipedia.org/wiki/Alstom_EMU250, za „Technika Transportu Szynowego” 9/2013); pierwsze jazdy dwóch
  zespołów z pasażerami w 2016 r. (tamże; https://kurier-kolejowy.pl/aktualnosci/18724/nocne-testy-pendolino-zestawionego-z-dwoch-ed250.html);
* ED160 – „Starting acceleration, gross 0.6 m/s2”, „Continuous output at wheel 2000 kW” (Stadler, „FLIRT PKP
  Intercity”: https://www.stadlerrail.com/api/docs/x/c7781cb689/flirt_pkp-intercity_en.pdf); „Masa służbowa: 257 t”
  (https://psmkms.krakow.pl/index.php/kolej/elektryczne-zespoly-trakcyjne/1465-ed160).

Ze źródeł – zespoły spalinowe:

* SA133 (Pesa 218Mc) – masa służbowa 82 t (https://pl.wikipedia.org/wiki/Pesa_218M, SA133-001÷024 – zespołów pomorskich
  tabela nie obejmuje, przyjęto tę samą masę); „Moc znamionowa silników spalinowych – 2x382 kW” (PESA, DSU 218Mc,
  2011: https://bip.lubuskie.pl/system/obj/17751_218Mc_DSU__282011-01-31_29.pdf); przyspieszenia źródła nie podają.
  „Opóźnienie hamowania – średnia wartość 1,6 m/s²” z DSU nie mówi, czy to hamowanie służbowe, i jest większe niż
  hamowanie nagłe w grze – nie użyte;
* SA136 (Pesa 219M Atribo) – „Masa służbowa: 108 t” (https://www.htp.org.pl/pesa-219m-atribo-z-ziemi-polskiej-do-wloch-i-z-powrotem/),
  „Moc znamionowa: 2 x 382 kW” (https://psmkms.krakow.pl/index.php/kolej/autobusy-szynowe/1190-sa136); przyspieszenia
  źródła nie podają;
* SA137 / SA138 (Newag 220M / 221M) – „przyspieszenie rozruchu = 0,45 m/s²”, „masa służbowa = 220M: 82 t, 221M:
  105 t”, dwa zespoły napędowe z silnikiem „o mocy 390 kW” (https://pl.wikipedia.org/wiki/Newag_220M/221M, za „Świat
  Kolei” 5/2011).

Ze źródeł – lokomotywy pasażerskie i wagony:

* EU160 (Newag E4DCU – https://www.railvolution.net/news/griffins-for-pkp-ic) i EU200 – „Siła pociągowa przy rozruchu
  310 kN”, „Moc ciągła 5,6 MW”, „Masa służbowa 79 t” (wersja DC), „Długość lokomotywy ze zderzakami 19 900 mm”
  (https://www.newag.pl/oferta/griffin/); EU200 – „Masa służbowa lokomotywy 88 000 kg”
  (https://www.polrails.net/lokomotywa-elektryczna-newag-griffin-e200-e4msua-006-2024r/4970);
* EP07 – „siła pociągowa = 21,5 T” (maksymalna; https://pl.wikipedia.org/wiki/EP07) = 211 kN (przeliczenie
  21,5 t × 9,81); moc ciągła 2000 kW, masa służbowa 80 t (4E), długość 15 915 mm (tamże). 280 kN podawane w innych
  źródłach to wartość EU07 (inne przełożenie) – nie użyta;
* 754 – „Anfahrzugkraft 180 kN”, długość ze zderzakami 16 540 mm (https://de.wikipedia.org/wiki/ČSD-Baureihe_T_478.4;
  cs.wikipedia podaje „Maximální tažná síla 215 kN” i 16 500 mm – przyjęto siłę opisaną jako siła przy ruszaniu);
  moc do trakcji 1325 kW („výkon pro trakci 1325 kW”), „hmotnost ve službě” 74,4 t
  (https://cs.wikipedia.org/wiki/Lokomotiva_754);
* wagon UIC-Z – „długość ze zderzakami 26,4 m” (https://pl.wikipedia.org/wiki/UIC-Z); masa 50 t – wagony Z1 156A,
  158A, 159A (https://pl.wikipedia.org/wiki/HCP_Z1, tabela, za „Świat Kolei” 7/2014); PKP Intercity w przetargu
  22/01/TUT/2017: „Długość wagonu: nie więcej niż 26,4 m ze zderzakami”, „Całkowita masa w stanie służbowym … ≤ 50 t”
  (https://www.intercity.pl/dokumenty/przetargi/rok%202017/Dostawa%2055%20wagon%C3%B3w%20osobowych%20z%20przegl%C4%85dem%20P3%20(03.06.2017)/Za%C5%82%C4%85cznik%20nr%2010.3%20do%20SIWZ%20-%20Opis%20oferowanego%20wagonu%202%20klasy%20przedzia%C5%82owego.pdf).
  Wagony Z2 (144A, 145A) mają ok. 45 t (https://en.wikipedia.org/wiki/HCP_Z2) – gra bierze 50 t dla każdego wagonu.

Ze źródeł – lokomotywy towarowe:

* ET22 – siła pociągowa (maksymalna) 411 kN, moc ciągła 3000 kW, masa służbowa 120 t, długość 19 240 mm
  (https://pl.wikipedia.org/wiki/Pafawag_201E);
* ET41 – „Siła pociągowa lokomotywy w trakcie rozruchu może osiągać przy tzw. ‚rozruchu wysokim’ wartość 550 kN”
  („Trakcja i Wagony” 4/1978, przedruk: https://pl.misc.kolej.narkive.com/DMfzpWm5/archiwum-trakcji-i-wagonow-et41);
  moc ciągła 4000 kW, masa służbowa 167 t, długość 31 860 mm (https://pl.wikipedia.org/wiki/HCP_203E);
* EU07 – „Siła pociągowa przy rozruchu 280 kN” (https://www.ecco-rail.eu/wp-content/uploads/EU07.pdf); moc ciągła
  2000 kW, masa służbowa 80 t (4E), długość 15 915 mm (https://pl.wikipedia.org/wiki/Pafawag_4E/HCP_303E);
* EU46 (Vectron MS – PKP Cargo ma wersję wielosystemową, https://pl.wikipedia.org/wiki/Siemens_Vectron) – „Starting
  tractive effort [kN] 300”, moc „6,000 (DC 3 kV)” kW, „Length over buffers [mm] 18,980” (Siemens:
  https://assets.new.siemens.com/siemens/assets/api/uuid:36c74d44-da30-410b-8f30-5c00fb8950ff/mo-vectron-technical-data-en.pdf);
  masa służbowa 87 t (wersja wielosystemowa, pl.wikipedia jak wyżej);
* E6ACT – „siła pociągowa maks. 375 kN”, „moc 5000 kW” (Lotos, 2011:
  https://www.lotos.pl/322/p,174,n,3417/grupa_kapitalowa/centrum_prasowe/aktualnosci/dragon_w_lotos_kolej); „Masa
  służbowa 119 t”, długość ze zderzakami 20 330 mm (Newag, katalog lokomotyw elektrycznych, s. 30:
  https://www.newag.pl/wp-content/uploads/2024/11/tinywow_Lokomotywy-Elektryczne_74017630.pdf);
* E6ACTa – „Siła pociągowa przy rozruchu 410 kN” (katalog Newag jak wyżej), „Masa służbowa: 119 t”, „Długość
  lokomotywy ze zderzakami: 20 330 mm” (https://www.newag.pl/oferta/dragon-2/), „Moc ciągła: 5000 kW”
  (https://www.transportszynowy.pl/Kolej/e6acta-d);
* 111Eo – moc 5600 kW (rynek-kolejowy.pl – adres przy 111Eo wyżej); siły, masy i długości tej odmiany źródła nie podają;
* Class 66 – „Starting tractive effort 409 kN”, „Power output at wheel rim 1,850 kW”, „Weight in working order
  129.6 t”, „Length 21.400 m” (Akiem: https://www.akiem.com/wp-content/uploads/2018/07/Fiche_Class-66-EN-new.pdf);
  lokomotywy 66/6 Freightlinera mają 467 kN (https://en.wikipedia.org/wiki/EMD_Class_66) – katalog ich nie rozróżnia;
* 311D – „Starting tractive effort: 392 kN” (https://www.mainlinediesels.net/index.php?lang=en&nav=1001087); „Masa
  służbowa [kg] 120 000”, „Całkowita długość ze zderzakami [mm] 17 550”, moc silnika 2133 kW (Kowalski, Szewczyk,
  „Technika Transportu Szynowego” 3/2008, tab. 1: https://www.kilkaminut.pl/wp-content/uploads/2025/11/modernizacja_311d.pdf);
* ST44 – siła przy ruszaniu „38,3 тс (375 кН)” (https://ru.wikipedia.org/wiki/М62_(тепловоз)); masa służbowa 116,5 t,
  długość ze zderzakami 17 550 mm (TTS 3/2008 jak wyżej); „Traktionsleistung: 1271 kW”
  (https://de.wikipedia.org/wiki/PKP-Baureihe_ST44);
* ST45 (Pesa 301Dd) – „Maksymalna siła pociągowa: 330 kN”, „Masa w stanie służbowym: 97 t”, „Długość ze zderzakami:
  18990 mm” (https://www.rynek-kolejowy.pl/wiadomosci/bedzie-wiecej-st45-51358.html); moc silnika 1300 kW (ograniczona
  z 1500 kW: https://www.bh-ruda.pl/publikacje/silniki/item/2094-powerpack-mtu-w-lokomotywie-pesy);
* ST48 (Newag 15D) i SM48 (TEM2) – „Siła pociągowa rozruchu teoretyczna 372,8 kN”, „Masa służbowa (z pełnymi zapasami)
  116 t”, „Długość ze zderzakami 16 970 mm”, moc silnika 1550 kW (15D) i 882 kW (TEM2) (Newag, katalog lokomotyw
  spalinowych, s. 32: https://www.newag.pl/wp-content/uploads/2025/01/Lokomotywy-Spalinowe-PL-2_74079862.pdf);
* SM42 – „Siła pociągowa rozruchu teoretyczna 219 kN”, moc silnika 590 kW, masa służbowa 74 t, długość ze zderzakami
  14 240 mm (katalog Newag jak wyżej, s. 16, kolumna „przed modernizacją”).


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

## Blokada liniowa na monitorze i blokada samoczynna

Na komputerowych stanowiskach obsługi stan blokady liniowej nie jest osobnym polem z lampkami (to element
pulpitu kostkowego z blokadą Eap), lecz symbolem przy wyjeździe na szlak; polecenia (żądanie, pozwolenie,
potwierdzenie przyjazdu, zmiana kierunku, zwolnienia doraźne) wydaje się z menu elementu, a zwolnienia doraźne
są rejestrowane w dzienniku zdarzeń i licznikach systemu, nie przy blokadzie. W grze symbol blokady idzie za
Ie-104.1 (2025) §8 pkt 20 (przekaźnikowa blokada samoczynna), pkt 21 (elektroniczna samoczynna) i pkt 22 (Eap),
rysunki s. 53, 56, 61, tabele barw s. 54–55, 57, 62 (`src/render/blockSymbol.js`):

* strzałki kierunkowe ponad torem (dopuszczone w pkt 20 ust. 1 lit. a, pkt 22 ust. 1 lit. b); w głowicy prawej
  lustrzane odbicie głowicy lewej (pkt 22 ust. 1 lit. a); obraz „A” – stan neutralny: grot w stronę szlaku,
  prostokąt, grot w stronę stacji, ciemnoszare; usterka – biały migający na przemian z czerwonym (w grze: blokada bez
  łączności, zapowiadanie telefoniczne); obraz „B” – kierunek PRZYJAZD (jedna strzałka do stacji), obraz „C” –
  WYJAZD (jedna strzałka w stronę szlaku); grot to segment „a”, trzon – „b”;
* barwy segmentów Eap: sąsiad żąda pozwolenia – a żółty migający, b żółty; ustawiony PRZYJAZD – oba żółte; nasze
  żądanie (Wbl) – a żółty migający, b żółty; ustawiony WYJAZD – oba żółte; ustawiony sygnał zezwalający na wyjazd
  (w grze: przeciwwtórność Pwl) – a żółty, b czerwony; kierunek wykorzystany – oba czerwone;
* blokada samoczynna: żądanie zmiany kierunku (sąsiada / nasze Zk) – a żółty migający, b żółty; ustawiony kierunek –
  oba żółte; tabele pkt 20–21 nie mają stanu „wykorzystany” – zajętość pokazuje odcinek szlaku (w grze strzałka szlaku);
* symbol Ko/dKo (pkt 22 ust. 2 lit. e): w stanie podstawowym niewidoczny, żółty migający – wjazd na sygnał zastępczy /
  rozkaz przygotowany poleceniem dKo, zielony ciągły – spełnione zależności zwolnienia blokady w kierunku PRZYJAZD
  (przejazd stwierdzony przy semaforze wjazdowym); tylko Eap przyjmująca pociągi;
* miganie – wspólną fazą obrazu (§4 ust. 17); „żółty migający” gaśnie w fazie ciemnej do barwy neutralnej.

Przyjęte: kierunek jest „wykorzystany” od wjazdu pociągu na szlak do zwolnienia blokady – u nas do Ko (także gdy
pociąg sąsiada zjechał ze szlaku, a nie minął jeszcze semafora wjazdowego), u sąsiada do potwierdzenia przyjazdu
naszego pociągu; położenie Ko/dKo nad strzałkami od strony stacji i proporcje symbolu – wg rysunku, bez wymiarów
z wytycznych; strzałka szlaku (czerwona – odstęp zajęty) zastępuje odcinki odstępów szlakowych, których gra nie rysuje.
Nieodwzorowane: stan „brak aktualnych danych” (biały), zwalnianie kierunku, sygnał zezwalający na wyjazd u sąsiada,
awaryjna zmiana kierunku, żądanie oWbl dla niewykorzystanego kierunku, zamknięcie szlaku (różowy), NO / NP, SKP /
dSKP, lampki Tor / Poz / STOP, ramki potwierdzeń WSz i opisy numerem toru szlakowego. Gra nie ma też własnych napisów
stanu blokady (dawniej „żąd.”, „Wbl”, „Ko”, „tel.”, „Pwl”) – stan widać tylko tak, jak w wytycznych.

Linie 202 (Gdańsk – Gdynia) i 250 (SKM) są dwutorowe z samoczynną blokadą liniową (SBL) – bez pozwoleń Eap, bez
bloków Po / Ko i przycisków doraźnych dPo / dKo (Ir-1 §29 ust. 1 i 3); po modernizacji blokada jest dwukierunkowa
(jazda po torze lewym po zmianie kierunku). Kierunek zmienia się przy wolnym odstępie po otrzymaniu pozwolenia sąsiada,
a czas pozwolenia wpisuje się do dziennika ruchu (Ir-1 §30 ust. 2 pkt 1, wersja od 20.05.2025): w grze nasze Zk to
prośba (sąsiad-automat zgadza się przy wolnym odstępie), a prośbę sąsiada gracz przyjmuje przyciskiem Zk; godzina
trafia do dziennika zdarzeń. Przyjęte: szlak SBL to jeden odstęp (gra nie rysuje semaforów odstępowych; na szlakach
SKM w rzeczywistości jest ich kilka); odstęp zwalnia się, gdy pociąg go opuści – ostatni odstęp kończy się na semaforze
wjazdowym, więc pociąg stojący przed nim (już poza rysunkiem szlaku, na odcinku przed semaforem) wciąż go zajmuje
i sąsiad nie wyprawia następnego pociągu (przyjęte: odstęp blokowy to część szlaku między semaforami, a ostatni kończy
się semaforem wjazdowym – tak samo jak przy blokadzie półsamoczynnej wyżej). Dlatego szlaki
Sopotu, Orłowa, Chyloni i Gdyni Głównej mają `block: 'sbl'` z kierunkiem zasadniczym wg numeracji torów
(tor 1 / 501 – w stronę Gdyni, tor 2 / 502 – w stronę Gdańska). Linie jednotorowe do Gdyni Port (723) i Wielkiego
Kacka (201) zostały z blokadą półsamoczynną. Stacja fikcyjna Szkolna ma Eap – celowo, bo uczy
pozwoleń.

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
  (§8 pkt 20–22; s. 53–63) – szczegóły w sekcji „Blokada liniowa na monitorze i blokada samoczynna”;
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
