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
(`speedDiverging`). Pociąg przyspiesza i hamuje zgodnie z dynamiką swojej kategorii (`categories.js`).

Oznaczenia pociągów towarowych (wszystkie stanowiska). Ze źródła – PKP PLK, Regulamin sieci, zał. 6.3 „Klasyfikacja
pociągów stosowana w konstrukcji rozkładów jazdy”: rodzaj pociągu oznaczają trzy litery; w ruchu krajowym TM – przewozy
masowe, TN – niemasowe, TK – obsługa stacji i bocznic, LT – lokomotywa do i od pociągów towarowych; trzecia litera to
trakcja (E – elektryczna lokomotywa, S – spalinowa lokomotywa, J – elektryczny zespół trakcyjny). Gra pokazuje TME,
TNE, TKE, LTE. Przyjęte: towarowy ładowny to TM, próżny / lekki – TN (gra nie zna ładunku); trakcja zawsze „E”, bo gra
jej nie odwzorowuje – wpis rozkładu może podać inną etykietę w polu `catLabel`; dynamika lokomotywy luzem. Pociągi
pasażerskie mają w grze oznaczenia handlowe (IC, TLK, R, SKM), a próżny skład EZT – „EZT”, nie oznaczenia z załącznika
(EIE, MPE, ROJ, PWJ…).

Zmiana czoła (wszystkie stanowiska). Ze źródeł: pociąg prowadzi się z czynnej kabiny na czele (Dz.U. 2015 poz. 360
§12 ust. 4; Ir-1 §66) – skład z lokomotywą na jednym końcu, żeby pojechać w drugą stronę, musi ją przestawić na drugi
koniec (lokomotywa objeżdża skład sąsiednim torem); zespół trakcyjny ma kabinę na obu końcach. Gra nie odwzorowuje
rozłączania ani oblotu: „zmiana czoła” odwraca skład na miejscu. Dlatego w scenariuszach pociągiem towarowym, który
wraca z toru jako nowy pociąg, jest tylko lokomotywa luzem (Gdańsk Gł. 44660 / 44661), a skład kończący bieg na
Szkolnej (90201 / 90202) to zespół trakcyjny – pilnuje tego `tests/categories.test.js`. Przyjęte: składy pasażerskie
z lokomotywą, które wracają jako nowy pociąg (IC w Gdańsku Gł. i Gdyni Gł.), zmieniają czoło na miejscu – zastępuje to
podstawienie lokomotywy na drugi koniec; zmiana czoła w trybie manewrowym oznacza pchanie składu, co przy manewrach
jest dozwolone.

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

Odjazd i hamowanie (wszystkie stanowiska). Ze źródeł: pociąg rusza z peronu na sygnał zezwalający (Ie-1 §4 ust. 13
pkt 1); droga hamowania pociągu to setki metrów, hamowanie nagłe daje ok. 1–1,5 m/s² (Dz.U. 2015 poz. 360 §12 ust. 4
i zał. 1). Przyjęte (uproszczenia gry):

* pociąg po postoju zostaje przy peronie, dopóki semafor tuż przed nim (do 60 m) wskazuje „Stój”; odjazd w dzienniku
  i punktualność liczy się od faktycznego ruszenia, więc przetrzymanie to późny odjazd;
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
dKo przed wjazdem – 0 pkt, po wjeździe – −10, bez pociągu przyjmowanego – odmowa; dPo – tylko po wyjeździe naszego
pociągu bez sygnału (0 pkt), brak dPo do przyjazdu – −10; oWbl – od razu przy żądaniu, zwrot pozwolenia po
odpowiedzi sąsiada; przy zapowiadaniu telefonicznym telefonogram o przyjeździe zastępuje Ko (dKo się nie używa),
blok początkowy zostaje zablokowany do naprawy, a po naprawie automatyk przywraca blokadę do stanu zasadniczego;
pozwolenie „u nas” przy usterce – kierunek wyjazdu z pozwoleniem w chwili utraty łączności. Stanowisko MOR-1 ma w menu
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
* Sz przy zwrotnicy na drodze ani utwierdzonej w przebiegu, ani zamkniętej Zz – dodatkowo −10 (urządzenie Sz nie
  blokuje – odpowiada dyżurny); rozkaz w takiej sytuacji jest odrzucany jak dotąd;
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
  nie zwolnił się przez usterkę urządzenia oddziaływania pociągu (usterka `route-block`, misja 4; E16 §8 ust. 19);
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

## Blokada liniowa na monitorze i blokada samoczynna

Na komputerowych stanowiskach obsługi stan blokady liniowej nie jest osobnym polem z lampkami (to element
pulpitu kostkowego z blokadą Eap), lecz zobrazowaniem przy wyjeździe na szlak: strzałka kierunku blokady,
zajętość odstępu (tor szlakowy na czerwono) i znaczniki żądania / potwierdzenia; polecenia (żądanie, pozwolenie,
potwierdzenie przyjazdu, zmiana kierunku, zwolnienia doraźne) wydaje się z menu elementu, a zwolnienia doraźne
są rejestrowane w dzienniku zdarzeń i licznikach systemu, nie przy blokadzie. Tak jest w grze;
geometria symbolu (strzałka szlaku, strzałka kierunku nad torem, napis stanu) jest własna, w duchu Ie-104.

Linie 202 (Gdańsk – Gdynia) i 250 (SKM) są dwutorowe z samoczynną blokadą liniową (SBL) – bez pozwoleń Eap, bez
bloków Po / Ko i przycisków doraźnych dPo / dKo (Ir-1 §29 ust. 1 i 3); po modernizacji blokada jest dwukierunkowa
(jazda po torze lewym po zmianie kierunku). Kierunek zmienia się przy wolnym odstępie po otrzymaniu pozwolenia sąsiada,
a czas pozwolenia wpisuje się do dziennika ruchu (Ir-1 §30 ust. 2 pkt 1, wersja od 20.05.2025): w grze nasze Zk to
prośba (sąsiad-automat zgadza się przy wolnym odstępie), a prośbę sąsiada gracz przyjmuje przyciskiem Zk; godzina
trafia do dziennika zdarzeń. Przyjęte: szlak SBL to jeden odstęp (gra nie rysuje semaforów odstępowych; na szlakach
SKM w rzeczywistości jest ich kilka); odstęp zwalnia się, gdy pociąg go opuści. Dlatego szlaki
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
* blokada Eap na wyjeździe: strzałki kierunku ciemnoszare (stan neutralny), żółte (kierunek), czerwone (kierunek
  wykorzystany – pociąg na szlaku), Ko – zielony napis (§4 ust. 11 pkt 5, ust. 13 pkt 2; s. 60–63);
* miganie synchroniczne na całym obrazie, 1 Hz, 50/50 (§4 ust. 17) – wspólna faza (klasa `ph` przełączana przez widok);
* grupa G4 (stany operacyjne): niebieska ramka – element wybrany, migająca podczas nastawiania przebiegu,
  czerwona migająca – alarm elementu; czerwone kasetki numerów pociągów; czarne tło;
* polecenia (Ie-104.1 §11–§12; stanowisko `komputerowe`): pasek poleceń (rodzaj → element początkowy → końcowy);
  polecenie specjalne wg Ie-104.1 (2025) §11 ust. 13, 14, 16: inicjowanie markuje element pomarańczowym tłem, przed Sz
  tło obrazu szarzeje; potwierdzenie najwcześniej po 5 s, po 60 s bez potwierdzenia polecenie odwołuje się samo,
  w tym czasie inne polecenia są zablokowane (`src/srk/special.js`); rejestrowane w licznikach, odwołanie OPS.

Numery torów to sama liczba, ciemnoszara, w linii toru, a numery pociągów – w osi toru (Ie-104.1 §8 pkt 29–30); perony jako szare prostokąty z nazwą i podwójną kreską na krawędzi peronowej – jak na pulpitach nastawczych (numeracja rzymska,
jak w nomenklaturze PKP: peron I, II; tory arabskie). Polecenia w menu elementów mają formę rzeczownikową zgodną
z terminologią Ie-1 / Ir-1 (nastawienie przebiegu, zwolnienie przebiegu, danie pozwolenia, zwolnienie bloku końcowego,
podanie sygnału zastępczego, przestawienie zwrotnicy, zamknięcie indywidualne).

Nieodwzorowane lub uproszczone: stany „ciemnoczerwony – w ochronie bocznej”, „turkusowy – nastawianie miejscowe”,
dokładna geometria symbolu blokady wg Ie-104.1 (własna: strzałka szlaku, strzałka kierunku, napis stanu), dokładne
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
* Dawne stacje fikcyjne Stare Pustkowie i Wola Pustkowska zostały jako stacje testowe w `tests/fixtures/`.

Uproszczenie wspólne: w rzeczywistości tory linii 250 (PKP SKM) i linii 202 (PKP PLK) na tych stacjach obsługują
różne nastawnie różnych zarządców; w symulatorze jedno stanowisko prowadzi całą stację.

Źródła: trojmiasto.pl (2013) „Poznaj największą nastawnię kolejową w Trójmieście”; bazakolejowa.pl – Gdynia Główna;
wikimapia – Nastawnia „Sp” Sopot; docplayer – projekt wykonawczy TG-7 stacja Gdynia Główna (E65); rynek-kolejowy.pl –
przetarg PKP SKM na przebudowę srk Gdynia Chylonia; gov.pl – załącznik do umowy PKP SKM (posterunki linii 250);
Wikipedia – linia kolejowa nr 202, stacja Gdynia Orłowo; PKP PLK – projekt E65 LCS Gdańsk/LCS Gdynia.
