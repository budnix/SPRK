# Sygnały, polecenia zastępcze i blokada liniowa

Część opisu źródeł – indeks i zasady zapisu: [`docs/SOURCES.md`](../SOURCES.md).

## Zezwolenie na jazdę

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

## Stała kontrola sygnału i droga ochronna

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

## Zwrotnica bez kontroli położenia

Zwrotnica bez kontroli położenia (wszystkie stanowiska). Ze źródeł: zwrotnicę bez kontroli (także rozprutą)
zabezpiecza się na miejscu zamkiem trzpieniowym albo sponą, potem pociąg jedzie przez nią na Sz albo rozkaz „S”
(Ie-10 §32 ust. 2, 4, 8, 9; §35 ust. 1 pkt 1–3 i 6; Ir-1 §41 ust. 6). Przyjęte (uproszczenia gry): zabezpieczenie
zleca się w zakładce Urządzenia panelu (polecenie dla pracownika, nie przycisk pulpitu) i jest gotowe po 3 min
(`POINT_SECURE_TIME`); zabezpieczona zwrotnica się nie przestawia i liczy się jak zamknięta (Zz) dla Sz i rozkazu;
zdjęcie zabezpieczenia – od razu.

## Sygnał zastępczy i rozkaz „S”

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
* kara „nieobsłużony” (−10 na koniec zmiany) tylko za pociąg, który dało się obsłużyć (przyjęte): pociąg, który przez
  opóźnienie od sąsiada – albo składu, z którego powstaje – nie zdążyłby odjechać co najmniej 4 min przed końcem
  zmiany, zostaje w raporcie jako nieobsłużony bez kary. Wcześniej przy poziomie „duże” (opóźnienia do 40 min) zwykła
  zmiana, która kończy się 10–34 min po ostatnim pociągu, dawała −10 bez winy dyżurnego;
* pociąg nadzwyczajny (poziom „duże”) mieści się w zmianie (przyjęte): sąsiad zapowiada go 25 min przed przyjazdem,
  nie przed startem zmiany, a jego odjazd (przy przelocie – przejazd) wypada co najmniej 10 min przed końcem zmiany –
  kara „nieobsłużony” ma dotyczyć pociągu, który dało się obsłużyć. Wcześniej pociąg nadzwyczajny mógł być zaplanowany
  po końcu zmiany (−10 bez winy dyżurnego);
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

## Blokada liniowa Eap

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

## Telefonogramy i zapowiadanie telefoniczne

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
