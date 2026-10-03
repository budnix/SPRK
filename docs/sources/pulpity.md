# Pulpity: typ E, IZH-111, nastawnia mechaniczna

Część opisu źródeł – indeks i zasady zapisu: [`docs/SOURCES.md`](../SOURCES.md).

## Kolory lampek na kostkach

Kolory lampek na kostkach (za opisami pulpitów typu E): żółte – położenie zwrotnicy,
białe – utwierdzenie przebiegu, czerwone – zajętość odcinka. Przyjęte (uproszczenie gry, na wszystkich stanowiskach):
w odcinku zwrotnicowym zajętość i utwierdzenie świecą tylko na drodze, w którą leżą zwrotnice – łącznica (albo tor
za ramieniem), w którą zwrotnica nie jest ustawiona, zostaje ciemna, żeby nie wyglądała na drogę jazdy.

## Pulpit typu E – powtarzacze, przyciski grupowe, wykolejnice

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
