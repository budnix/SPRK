# Format definicji stacji (schemat v1)

Stacja to moduł ES eksportujący obiekt (docelowo także JSON z edytora). Przykład: `tests/fixtures/stare-pustkowie.js` (mała stacja testowa); stacje gry: `src/stations/`.
Walidacja: `validateStation(def)` w `src/model/validate.js`.

```js
export default {
  schemaVersion: 1,
  id: 'stare-pustkowie',          // identyfikator (URL: ?stacja=…)
  name: 'Przykładowo',
  description: '…',
  location: '…',                  // gdzie leży posterunek (linia, region) – karta na ekranie startowym
  region: 'pomorskie',            // województwo (src/model/regions.js) – mapa wyboru posterunku
  geo: [54.5204, 18.5300],        // [szerokość, długość] stacji – punkt na mapie (opcjonalne)
  lines: [202, 250, 201],         // numery linii kolejowych – schemat regionu i wyszukiwanie
  place: 'gdynia-glowna',         // miejsce (opcjonalne, domyślnie id) – edycje jednego miejsca to zakładki ery
  era: 2014,                      // rok stanu planu i urządzeń edycji (opcjonalne; brak – stan dzisiejszy)
  traffic: '…',                   // krótki opis ruchu – karta na ekranie startowym
  difficulty: 2,                  // trudność 1–5 (gwiazdki; sortowanie „wg trudności”)
  startTime: '05:52',             // początek zmiany
  desk: { cols: 32, rows: 10 },   // wymiary pulpitu w kostkach (40×40 px); opcjonalnie controls: { x, y }
  exits: { … },                   // szlaki (wyjazdy ze stacji)
  sections: { … },                // odcinki izolowane
  points: { … },                  // parametry zwrotnic (opcjonalne)
  tiles: [ … ],                   // kostki pulpitu
  routes: { disable: [], override: {} },
  timetable: [ … ],
};
```

## Budowa planu (`src/tiles/layout.js`)

Kostki i odcinki pisze się pomocnikami z `src/tiles/layout.js`, nie własnymi kopiami (pilnuje tego
`tests/layout.test.js`): `createLayout()` daje `tiles`, `sections` i części złożone, które dopisują kostkę i jej odcinek
naraz – `point(x, y, n, ostrze, zasadniczy, zwrotny, długość?)` (kostka `Zw<n>` w odcinku `Iz<n>`, 60 m), `diag` (ukos
w odcinku zwrotnicy), `plain(id, x1, x2, y, długość?)` (20 m na kostkę), `stub(x, y, port, id)` (żeberko `S<id>` 30 m
z kozłem i białym przyciskiem `k<id>`), `crossover(…)` (dwie zwrotnice i ukos), `lineExit({ side: 'W' | 'E', y, id,
text, from, to, section?, length? })` (odcinek zbliżania `Zb<id>` 400 m, zielony przycisk `k<id>` i nazwa sąsiada na
kostce skrajnej). Pojedyncze kostki: `track`, `run`, `signal`, `buffer`, `pointTile`. Plan wpisany jako dane (tablica
kostek, obiekt odcinków – stacje szkoleniowe) też jest dozwolony.

## Siatka i porty

Każda kostka zajmuje pole `(x, y)`; `x` rośnie w prawo (wschód), `y` w dół.
Kostki torowe łączą się przez **porty** – 8 kierunków: `N NE E SE S SW W NW`.
Kostka `(5,4)` z portem `E` łączy się z kostką `(6,4)`, jeśli ta ma port `W`;
port `SE` łączy się z `(6,5)` posiadającą port `NW`.

## Typy kostek (`src/tiles/registry.js`)

| type | kategoria | pola | opis |
|------|-----------|------|------|
| `track` | torowa | `ports:[a,b]`, `section`, `derailer?`, `endButton?`, `text?` | prosty `['W','E']`, skos `['NW','SE']`, łuk `['NW','E']` |
| `buffer` | torowa | `port`, `section`, `endButton?` | kozioł oporowy |
| `point` | torowa | `id`, `toe`, `straight`, `diverge`, `section`, `label?`, `speedDiverging?` | zwrotnica: ostrze, tor zasadniczy (+), tor zwrotny (−) |
| `crossing` | torowa | `pairs:[[a,b],[c,d]]`, `section` | skrzyżowanie torów |
| `signal` | sygnał | `id`, `kind:'semafor'|'tm'`, `at:{x,y}`, `dir:'E'|'W'`, `shunting?`, `substitute?`, `overlap?`, `entry?` | powtarzacz sygnalizatora z przyciskami; stoi na granicy wyjścia z kostki `at` w kierunku `dir`; `entry` – semafor wjazdowy (w nastawni mechanicznej z tarczą ostrzegawczą kształtową); na monitorze (Ie-104.1 §8 pkt 4): semafor – pełny trójkąt, z `shunting` – z otwartym grotem, tarcza (`tm`) – otwarty grot z numerem bez „Tm”, `entry` będący końcem przebiegu wyjazdowego – z małym trójkątem przeciwnym |
| `button` | sterownicza | `id`, `label`, `role`, `color?`, `counter?` | **przestarzała w definicji stacji** – przyciski grupowe rysuje stanowisko (niżej „Przyciski stanowiska”); stary plik z tymi kostkami działa i dostaje ostrzeżenie walidacji |
| `label` | opis | `text`, `size?`, `span?` | napis; na monitorze z opisu „tor N · …” zostaje tylko reszta (numery torów są rysowane w ramkach na linii toru, perony na prostokącie) |
| `blank` | – | – | pusta kostka (uzupełniana automatycznie) |

Dodatki na kostce torowej:

* `derailer: 'Wk1'` – wykolejnica (położenia `on` = nałożona, `off` = zdjęta),
* `endButton: { id, color }` – przycisk końca przebiegu (na kostce wyjazdu na szlak – zielony; na kozłach – biały),
* `text` – opis (np. nazwa sąsiedniego posterunku).

## Przyciski stanowiska (`desk.controls`, opcjonalne)

Przyciski grupowe (Zw, Zz, Pz, dPz, Sz) są wyposażeniem pulpitu typu E, a nie cechą stacji – definicja stacji ich nie
zawiera. Stanowisko rysuje je samo (`src/tiles/controls.js`): pulpit typu E – przyciski i liczniki, monitor – same
liczniki dPz i Sz, pulpit IZH-111 zostawia pola puste, bo ma własną grupę rozkazów.

Grupa zajmuje siedem kolumn jednego rzędu (pola 0, 1, 3, 4, 6 – między parami odstęp). Domyślnie leży w drugim
rzędzie pulpitu, na środku (`x = cols / 2 − 6`); gdy tam jest zajęte – w najbliższym wolnym miejscu. Stacja może
wskazać inne wolne miejsce: `desk: { cols, rows, controls: { x, y } }`. Wskazówka na zajętym polu albo poza pulpitem
jest błędem walidacji.

## Odcinki izolowane (`sections`)

```js
T1: { length: 520, kind: 'station', track: '1', platform: 'Peron I' }
```

* `length` – długość w metrach (rozkładana na kostki proporcjonalnie do geometrii),
* `kind` – `approach` (zbliżania), `point` (zwrotnicowy), `station`, `siding`, `plain`,
* Łącznica między torami równoległymi może być w definicji jednym odcinkiem z dwiema zwrotnicami (np. `Iz1`: Zw1, kostka
  skośna, Zw2). Symulacja dzieli go sama (`src/model/normalize.js`) na odcinek na zwrotnicę: zwrotnica o numerze odcinka
  zostaje w `Iz1` razem ze skosem, druga dostaje `Iz2` (prefiks odcinka + numer zwrotnicy) – dzięki temu przebiegi
  równoległe przez łącznicę (np. wjazd na 501 i wyjazd z 502) utwierdzają się jednocześnie. Większa grupa (trzy i więcej
  zwrotnic albo skrzyżowanie w odcinku, np. Chylonia `Iz21`: 21, 24 na torach 502/501 i 22/26, 25/23 do torów 21/22)
  dzieli się na odcinek na każdą zwrotnicę (`Iz24`, `Iz22`…) i na skrzyżowanie (`Iz21x`); kostki proste idą do
  najbliższej zwrotnicy, długość po równo.
* `mainKind: 'dodatkowy'` – tor główny dodatkowy (tor stacyjny do przyjmowania i wyprawiania pociągów poza torem
  głównym zasadniczym): ograniczenie prędkości z obrazu semafora (S10–S13, Sr3) obowiązuje na całej drodze przebiegu na
  ten tor, nie tylko w okręgu zwrotnicowym (Dz.U. 2015 poz. 360 §66 ust. 3). Oznaczone na stacjach szkoleniowych.
* `track` – numer toru (do rozkładu jazdy), `platform` – peron (pociągi osobowe zatrzymują się): `true` lub nazwa
  (`'Peron II'`, liczba `2`) – monitor rysuje peron jako szary prostokąt z tą nazwą, pulpit kostkowy jako obrys; krawędź peronowa od strony
  toru to podwójna kreska (wyspowy między dwoma torami peronowymi – dwie krawędzie, inaczej boczny – jedna).

## Szlaki (`exits`)

```js
W:  { name: 'Lipowa', tile: { x: 0, y: 4 }, dir: 'W', lineLength: 4200, lineSpeed: 100 }
K1: { name: 'Krasne', label: 'Krasne – tor 1', tile: { x: 0, y: 4 }, dir: 'W', direction: 'out', lineLength: 6100 }
```

`tile` + `dir` – kostka torowa i port, przez który tor opuszcza pulpit. `lineLength` – długość toru szlakowego
(wirtualnego, poza pulpitem) w metrach. Każdy szlak ma własną blokadę liniową i posterunek sąsiedni sterowany przez AI.

* bez `direction` – szlak jednotorowy z blokadą Eap dwukierunkową (Wbl, Poz, Ko, dPo, dKo),
* `direction: 'out'` / `'in'` – tor szlakowy linii dwutorowej z ruchem jednokierunkowym (tylko Po/Ko;
  na torze wjazdowym sąsiad wyprawia bez pozwolenia, na torze wyjazdowym nie ma pozwolenia),
* `block: 'sbl'` (wymaga `direction` = kierunek zasadniczy) – blokada samoczynna linii dwutorowej: bez pozwoleń
  i bez Ko, odstęp zwalnia się sam; blokada dwukierunkowa – jazda „pod prąd” po zmianie kierunku (`Zk` – prośba
  do sąsiada, który odpowiada po chwili) przy wolnym odstępie; sąsiad z pociągiem do nas prosi o kierunek przyjazdu
  i czeka na naszą zgodę (`Zk`); godzina zgody idzie do dziennika (Ir-1 §30 ust. 2 pkt 1). Przy nastawionym naszym
  wyjeździe sąsiad nie prosi o kierunek; po zwolnieniu odstępu prosi o niego bez powtórnego zgłoszenia pociągu.
  Przy usterce – zapowiadanie telefoniczne (przyjazd potwierdza telefonogram); gdy usterka mija, blok
  początkowy po telefonicznie potwierdzonym przyjeździe zwalnia się sam, a odstęp SBL po zjeździe pociągu sąsiada też.
  Rozkład musi trzymać się kierunków: `from` nie może wskazywać toru `direction: 'out'`, a `to` toru
  `direction: 'in'` (walidacja) – jazda po torze lewym po `Zk` jest dozwolona w grze, ale rozkład jej nie wymaga.
  Blokady nie definiuje się kostkami: pulpit kostkowy rysuje ją sam z definicji wyjazdu (`src/render/blockLayout.js`) jako
  kostki przy końcu toru szlakowego – strzałki „wyjazd” (kostka skrajna) i „wjazd” (następna) w kanale toru
  (zamiast paska świetlnego; przy zajętości odcinka pod kostką strzałka świeci na czerwono), w rzędzie nad torem
  (lub pod, gdy zajęty) przyciski Ko | Poz | Wbl (Eap dwukierunkowa; lampka Ko i czerwona Pwl), Ko (jednokierunkowa
  wjazdowa) albo Zk (SBL); strzałki „odjazd” / „przyjazd” na kostkach toru,
  wyżej liczniki dKo | dPo; nazwa sąsiedniego posterunku (`text` kostki wyjazdu) zostaje na kostce skrajnej, nad torem, obok przycisku końca przebiegu.
  Monitor pokazuje stan blokady przy wyjeździe.
* `label` – krótki opis szlaku (gdy dwa tory prowadzą do tego samego posterunku).

## Przebiegi (`routes`)

Tablica zależności jest wyznaczana **automatycznie** z topologii (`Topology.pathsFrom`):
od każdego sygnalizatora w jego kierunku do następnego sygnalizatora / szlaku / kozła. Przebieg pociągowy może
kończyć się na kozle tylko toru stacyjnego (`kind: 'station'`, np. peron czołowy – Reda tor 11); kozły bocznic
kończą wyłącznie przebiegi manewrowe.
Dla każdego przebiegu wyznaczane są: odcinki drogi przebiegu, wymagane położenia zwrotnic,
zwrotnice ochrony bocznej (najbliższa zwrotnica za nieużywanym portem kostki drogi przebiegu; tył kostki startowej
osłania sam semafor początkowy, więc zwrotnice za nim nie wchodzą w ochronę – ważne dla wyjazdów dwustopniowych,
np. Rumia C → G311 → szlak), wykolejnice (na drodze – zdjęte, sąsiadujące – nałożone),
droga ochronna (odcinek za semaforem końcowym) i prędkość (40/60 przez tor zwrotny).

* `routes.disable: ['A-D2']` – usuwa przebieg,
* `routes.override: { 'A-D2': { speed: 60 } }` – nadpisuje pola przebiegu.

Identyfikatory: `START-KONIEC` (`A-D1`, `C1-W`), manewrowe z semafora z Ms2: sufiks `m` (`D2-kT3m`).

## Scenariusze (`scenarios`)

```js
{ id: 'awaria-zw3', name: 'Awaria zwrotnicy 3', description: '…',
  trains: [5314, 5315, 90211],          // podzbiór rozkładu stacji (domyślnie cały)
  timetable: [ … ],                     // albo własny rozkład scenariusza
  startTime: '07:10', endTime: '08:30',  // koniec zmiany – raport
  faults: [{ type: 'point-control', target: 'Zw3', at: '07:36', duration: 12 }],
  faultWeights: { 'point-control': 4 },   // wagi losowania usterek (domyślnie każdy rodzaj 1)
  closedSections: [{ section: 'T1', from: '05:52', to: '06:50' }],
  disruptions: 'none',                  // wymuszony poziom zakłóceń (inaczej wybór gracza)
  tasks: [ … ], tutorial: 'monitor', srk: 'komputerowe' }
```

* `trains` – podzbiór rozkładu stacji (numery), `timetable` – własny rozkład scenariusza,
* `faults` – usterki zadane, `duration` w minutach: `signal-fail` (semafor bez sygnału zezwalającego), `point-control`
  (brak kontroli po przestawieniu), `false-occupancy` (zajętość bez pociągu), `block-fail` (blokada bez łączności –
  zapowiadanie telefoniczne), `route-block` (nastawnia mechaniczna: blok przebiegowy niezwolniony przez pociąg),
  `track-defect` (pęknięta szyna na odcinku `target` – dyżurny zamyka tor, tylko w scenariuszu, nie losuje się),
  `axle-counter` (od `at` licznik osi odcinka `target` myli się przy najbliższym przejeździe – po zjeździe pociągu
  wskazuje zajętość; zerowanie i przejazd kontrolny; czas trwania liczony od wystąpienia; tylko w scenariuszu);
  `closedSections` – zamknięcia torów,
* `faultWeights` – wagi rodzajów przy losowaniu usterek na poziomie zakłóceń „małe” i „duże” (`{ rodzaj: liczba ≥ 0 }`,
  rodzaj spoza listy – 1); bez pola każdy losowany rodzaj tak samo. Służba zimą: `{ 'point-control': 4 }` (marzną
  zwrotnice),
* `disruptions` – wymuszony poziom zakłóceń (`none` / `low` / `high`), inaczej wybiera gracz; poziomy dodają losowe
  opóźnienia, usterki i pociągi nadzwyczajne, a ziarno losowe (`seed`) daje powtarzalną zmianę,
* `tasks` – zadania manewrowe (niżej),
* `tutorial` – identyfikator misji wprowadzającej (`src/tutorial/missions.js`: `monitor`, `pulpit`, `izh`, `mech`); gra pokazuje dymki krok po kroku,
* `srk` – stanowisko obsługi tej zmiany (`E` / `izh111` / `komputerowe` / `ebilock` / `mor3` / `mech`) niezależnie od stacji (misja 2 uczy pulpitu kostkowego;
  Rumia i Reda mają zmianę na pulpicie i na monitorze). Nieznana wartość jest błędem walidacji.

## Rozkład jazdy (`timetable`)

```js
{ nr: 5310, kind: 'os', name: 'Osobowy', from: 'W', to: 'E', arr: '06:05', dep: '06:07',
  track: '1', stop: true, length: 130, vmax: 100, dwell: 60 }
{ nr: 44711, kind: 'tow', cat: 'TD', traction: 'S', name: 'Towarowy Gdańsk Port Płn. – Pszczółki', from: 'GP', to: 'PS2',
  arr: '07:54', track: '7', stop: false, length: 500, mass: 1100, vmax: 60 }
```

* `from`/`to` – szlaki (`null` = pociąg zaczyna/kończy bieg na stacji),
* `arr`/`dep` – czasy planowe, `stop` – zatrzymanie (przelot: `false`), `terminates` – kończy bieg,
* `startOn: { section, dir }` – pociąg stojący na stacji od początku zmiany,
* `kind`: `os` (osobowy), `tow` (towarowy),
* `cat` – kategoria: pasażerskie `EIP`, `EIC`, `IC`, `TLK`, `R`, `SKM`, `EZT` (próżny skład EZT); towarowe i pojazdy
  luzem – rodzaj pociągu PKP PLK (Regulamin sieci, zał. 6.3): w ruchu międzynarodowym `TC` (intermodalny), `TG`
  (masowy), `TR` (niemasowy), w krajowym `TD` (intermodalny), `TM` (masowy), `TN` (niemasowy), `TK` (obsługa stacji
  i bocznic – zdawczy), `TS` (próżne wagony z/do naprawy, pociąg próbny, pozostałe), `TH` (skład lokomotyw), `LT`
  (lokomotywa luzem do i od pociągów towarowych). Dawne klucze `TOW`, `TOWP`, `ZD` działają jak `TM`, `TN`, `TK`.
  Nieznana kategoria jest błędem walidacji. Bez `cat` kategoria bierze się z nazwy („IC …”, „TLK …”, „Regio …”,
  „SKM …”, „Zdawczy” albo „(zdawczy)” w relacji → `TK`, „Lokomotywa luzem …” → `LT`, „Skład EZT …”, „próżny” /
  „lekki” → `TN`) i z `kind` (towarowy → `TM`).
  Kategoria daje domyślną prędkość maksymalną (EIP 200, IC/EIC 160, TLK 140, R/SKM 120, TM/TG/TS 80, TN/TR/TD/TC 100,
  TK 60 km/h) oraz przyspieszenie i hamowanie (`src/model/categories.js`) – dla pociągu bez taboru; `vmax`, `accel`,
  `brake` wpisu nadpisują (`brake` – największe opóźnienie hamowania służbowego, maszynista hamuje z jego częścią).
* `traction` – trzecia litera rodzaju pociągu towarowego lub lokomotywy luzem (zał. 6.3): `E` – elektryczna, lokomotywy
  (domyślnie), `S` – spalinowa, lokomotywy, `P` – parowa, `J` / `M` – zespoły trakcyjne elektryczne / spalinowe; tylko
  połączenia z tablic załącznika (np. `TKP`, `TSJ`, ale nie `TMJ`) – inne są błędem walidacji. Etykieta: `cat` + `traction`
  („TDS 44711”). Trakcja wybiera rodzaj lokomotywy (`stock`), a przez nią dynamikę pociągu.
* `length` – długość pociągu w metrach (cały skład z lokomotywą, tyle zajmuje torów; domyślnie 100). Liczba dodatnia.
  Pociąg dłuższy niż tor stacyjny `track` (suma odcinków z tym numerem toru) daje ostrzeżenie walidacji (Ir-1 §19 ust. 4).
* `mass` – masa brutto składu w tonach, bez czynnej lokomotywy (zał. 6.3, pole E02; Ir-1 §19 ust. 1 pkt 1); tylko dla
  pociągu towarowego ze składem wagonów (nie `LT`, `TH`, nie osobowe). Nie większa niż 7,2 t/m (nacisk liniowy 71 kN/m)
  razy `length`. Pociąg z lokomotywą z katalogu taboru przyspiesza z siłą rozruchową lokomotywy podzieloną przez masę
  lokomotywy i `mass` (`stock` niżej). Bez danych lokomotywy – przyspieszenie kategorii przy jej masie odniesienia
  (TM/TG 2000 t, TD/TC 1400 t, TN/TR 1200 t, TS 800 t, TK 600 t) razy `masa odniesienia / mass`, najwyżej 1,5 i najmniej
  0,5 przyspieszenia kategorii; bez `mass` – przyspieszenie kategorii. Hamowanie pociągu z taborem zależy od masy na
  metr składu (mniejszy procent masy hamującej ładownych wagonów) i od długości (nastawienie P / G, czas narastania
  hamowania); bez taboru – hamowanie kategorii.
  Obowiązuje mniejsza z prędkości pociągu i szlaku: na szlaku wjazdowym – `lineSpeed` wyjazdu `from`, dopóki cały
  pociąg nie wjedzie na stację; dalej – `lineSpeed` wyjazdu `to` (pociąg kończący bieg – `from`). Na rozjazdach –
  prędkość rozjazdu, przy Sz i rozkazie „S” – 40 km/h do następnego semafora (przy wyjeździe na szlak do końca
  rozjazdów, na SBL – przez umowny pierwszy odstęp 1000 m).
* `catLabel` – opcjonalnie własna etykieta kategorii, nadpisuje całą etykietę (także `cat` + `traction`).
* `name` – relacja pełna, jak w rozkładzie („Regio Gdańsk Gł. – Słupsk”, „IC „Kaszub” Kraków Gł. – Gdynia Gł.”);
  przedrostek kategorii i nazwa handlowa w cudzysłowie są z niej wycinane do wyświetlenia (`relationOf`, `brandOf`).
  Rozkład pokazuje etykietę „IC 5100” i relację; sąsiednie posterunki (`from` → `to`) w drugiej linii.
* `stock` – opcjonalnie tabor pociągu: typ z katalogu `ROLLING_STOCK` (`src/model/rollingStock.js`, np. `'EN57'`) albo
  lista typów (gra losuje z listy – każdy typ z listy może przyjechać, w liczbie zespołów najbliższej długości `length`;
  typ wolniejszy niż pociąg ogranicza jego prędkość). Bez `stock` gra losuje tabor na zmianę z puli kategorii (SKM,
  Regio, PKP Intercity, lokomotywy towarowe o trakcji `traction`) spośród typów nie wolniejszych niż pociąg, dla
  zespołów trakcyjnych – tyle zespołów, ile mieści długość `length`.
  Pociągi jednego składu (łańcuch `unit`) mają ten sam tabor, więc `stock` wpisuje się raz albo tak samo w każdym
  z nich – różne wartości są błędem walidacji. Nieznany typ i lokomotywa o innej trakcji niż pociąg towarowy (`traction`,
  domyślnie E) to też błędy. Potrzebne tam, gdzie pula kategorii nie pasuje: pociągi pasażerskie z linii
  niezelektryfikowanych (spalinowe zespoły trakcyjne), misje wymagające stałego składu. Tabor widać w podpowiedzi
  numeru pociągu i na zakładce „Pociągi”, a pociąg jedzie z jego dynamiką: przyspieszenie rozruchu typu zespołu albo
  przyspieszenie z siły rozruchowej lokomotywy i masy (wagony z `length`, pociąg towarowy – `mass`), przy prędkości
  ograniczone mocą pojazdu; hamowanie z typu zespołu, z prędkości pociągu z lokomotywą albo z masy na metr i długości
  składu towarowego (docs/sources/jazda-pociagu.md „Hamowanie jak maszynista”); prędkość typu ogranicza pociąg, gdy jest mniejsza niż
  `vmax` wpisu / kategorii. Długości pociągu tabor nie zmienia. Pola `accel` i `brake` wpisu mają pierwszeństwo przed
  taborem; `brake` to wtedy największe opóźnienie hamowania służbowego – maszynista planuje hamowanie z jego częścią;
  `brake` wpisu zastępuje opóźnienie, nie czas narastania hamowania ani luzowanie przed zatrzymaniem (te zależą od
  nastawienia hamulca i długości składu).

Sąsiedni posterunek żąda pozwolenia ok. 4 min przed planowanym wyjazdem i wyprawia pociąg tak,
by przyjazd nastąpił o czasie rozkładowym (przy natychmiastowym pozwoleniu i wolnej drodze).

Pociąg tworzony ze składu innego pociągu (np. zdawczy powrotny):

```js
{ nr: 90212, kind: 'tow', name: 'Zdawczy', unit: 90211, from: null, to: 'W', dep: '08:12', track: '2', stop: false, length: 180, vmax: 60 }
```

`unit` – numer pociągu, który zakończył bieg na stacji; jego skład staje się pociągiem `nr`, gdy stoi w trybie jazdy
pociągowej (nie w trakcie manewrów), nie wcześniej niż 15 min przed `dep`; do `dep` stoi mimo sygnału zezwalającego.
Zezwolenie, na którym skład przyjechał, nie przechodzi na nowy pociąg – rusza on na sygnał semafora przed sobą.
Skład w trybie manewrowym jedzie obok semafora tylko na Ms2 i nie wyjeżdża na szlak
(o ile stoi). Skład trzeba podstawić na właściwy tor manewrami i ustawić czołem do semafora wyjazdowego.

## Zadania manewrowe (`tasks`)

```js
{ id: 'odstaw-90211', unit: 90211, type: 'move', toTrack: '3', deadline: '07:52', after: '07:40', text: '…' }
```

Zadanie jest wykonane, gdy cały skład `unit` stoi na torze `toTrack` (po godzinie `after` lub po wykonaniu zadania
`afterTask: 'odstaw-90211'`, jeśli podane – tak zadanie „podstawić z powrotem” nie zalicza się przed odstawieniem).
Każde kolejne zadanie tego samego składu ma `afterTask` wskazujące poprzednie – samo `after` nie wystarcza: skład
opóźniony przyjeżdża po tej godzinie i „podstawienie” zaliczałoby się już przy przyjeździe.
Przed `deadline` +10 pkt, po terminie 0, niewykonane w ciągu 10 min po terminie −10 pkt – także zadanie, które
czeka na niewykonane zadanie `afterTask` (jego termin biegnie).
Skład przełącza się w jazdę manewrową w zakładce *Stan* (porusza się tylko w nastawionym przebiegu manewrowym, za Ms2).

## Służba o wybranej porze (`duty`, opcjonalne)

Posterunek do służby (stacja bez misji samouczka, z pociągami od sąsiada w `timetable`) dostaje wybór godziny startu
i długości służby **bez dodatkowych danych**: rozkład stacji jest wzorcem ruchu, z którego gra buduje rozkład każdej
pory doby (`src/model/duty.js`; zasady i liczby – `docs/sources/posterunki.md` „Służba o wybranej porze”). Co z tego wynika dla
definicji stacji:

* `timetable` to wzorzec szczytu: pociągi, ich drogi (`from`, `to`, `track`), składy (`unit`) i zadania (`tasks`) –
  o innych porach kursuje jego część, a w nocy w miejsce pociągów regionalnych i dalekobieżnych jadą towarowe
  z parametrami pociągów towarowych wzorca. Warto, żeby wzorzec miał choć jeden towarowy przelot (`kind: 'tow'`,
  `from` i `to`) – bez niego nocne pociągi towarowe dostają parametry przyjęte (TM, 400 m, 1200 t, 80 km/h);
* wzorzec powtarza się co pełne godziny równe rozpiętości rozkładu (rozkład 06:02–07:58 → co 2 h), więc takt 15 / 30 /
  60 min zachowuje się na styku powtórzeń. Inny okres: `duty: { period: 90 }` (minuty, pełne kwadranse);
* zwykłe zmiany w `scenarios` (bez `faults` i `closedSections`) nie są pokazywane na stronie posterunku – zastępuje je
  służba; zostają jako wzorzec, do testów i pod dawnym adresem. Różne `srk` zwykłych zmian dają pole „Stanowisko”.
  Scenariusze z `faults` albo `closedSections` są na liście jako specjalne (ich usterki są ustawione pod konkretne
  pociągi, więc mają stałe okno). Na stacji z kilkoma stanowiskami gracz wybiera stanowisko także dla scenariusza
  specjalnego – chyba że scenariusz ma własne `srk` (wtedy idzie na swoim); testy grają go na każdym stanowisku
  (`tests/scenario-runs.js`);
* pociągi dalekobieżne wzorca (IC, TLK, EIC, EIP) powinny mieć relację z nazwami stacji jak w rozkładzie PKP Intercity
  („Kraków Gł. – Gdynia Gł.”): powtórzenia takiego pociągu dostają nazwę i relację rzeczywistego pociągu tej drogi
  z listy `src/model/data/namedTrains.js` (cała Polska; `docs/sources/posterunki.md` „Pociągi z nazwami”);
* służba może przejść przez północ: godziny następnej doby gra zapisuje w danych zmiany jako 24, 25… („25:10” = 01:10),
  a pokazuje jak na zegarze – tak samo można pisać `endTime` i rozkład własnego scenariusza przez północ;
* sprawdzenie: `npm run check -- <stacja> --start 22 --minutes 120` (dowolna godzina 0–23 i długość 30 / 60 / 120 / 180;
  każde ziarno z `--seeds` i każde stanowisko stacji to osobny rozkład – scenariusz `sluzba-<minuty>[-<srk>]#<ziarno>`),
  a `npm test` przechodzi po siatce godzin i długości każdego posterunku (`tests/duty-grid.js`) – nowy posterunek
  dochodzi tam sam.

## Wariant scenariusza i automat sprawdzający

Nowy wariant istniejącej stacji to zwykle kopia scenariusza z innym oknem zmiany i podzbiorem pociągów:

```js
{ id: 'krotka', name: 'Krótka zmiana (07:30–08:35)', startTime: '07:30', endTime: '08:35',
  trains: [6103, 6104, 90201, 90202] }   // zadania stacji (tasks) dziedziczą się, jeśli ich skład jest w trains
```

Zasady (z tego, jak gra liczy zmianę):

* Godziny podane w nazwie (`name`, np. „Krótka zmiana (07:30–08:35)”) mają się zgadzać ze `startTime` i `endTime` –
  gracz wybiera zmianę po nazwie (uwaga `sc-name-window`).
* `startTime` i `endTime` niczego nie wycinają z rozkładu – gra jedzie całym rozkładem stacji (albo `trains` /
  `timetable`). Inny start albo inna długość zmiany działa tylko razem z `trains`.
* Do `trains` wchodzą pociągi, które sąsiad wyprawia po starcie zmiany: przyjazd co najmniej kilka minut po
  `startTime` (sąsiad wyprawia pociąg ok. jazdy po szlaku + 1,5 min przed przyjazdem; wcześniejszy pociąg pojawi się
  dopiero na starcie i całe opóźnienie pójdzie na konto dyżurnego). Pociąg stojący od początku zmiany (`startOn`) – z
  odjazdem po starcie.
* Odjazd co najmniej 4 min przed `endTime` (od odjazdu do zjazdu ze stacji mijają 1–4 min – bliżej końca kara
  „nieobsłużony” jest pewna), przyjazd pociągu kończącego bieg – przed `endTime`. Zapas na opóźnienia od sąsiada:
  przy poziomie `low` 19 min, przy `high` 44 min (opóźnienie poziomu 15 / 40 min + 4 min); pociągi, które przez
  opóźnienie od sąsiada nie zdążą, zostają nieobsłużone bez kary – zmiana kończy się bez nich. Przy poziomie wybieranym
  przez gracza to informacja o odporności, przy wymuszonym `disruptions` – uwaga.
* Łańcuch składu (`unit`) – wszystkie pociągi albo żaden: pociąg ze składu bez pociągu, którym skład przyjeżdża,
  nie powstanie.
* Zadania stacji (`tasks` stacji) przechodzą do scenariusza, jeśli ich skład jedzie w zmianie; własne zadania wpisuje
  się w `tasks` scenariusza, a `tasks: []` wyłącza odziedziczone.
* Zmiana przez północ: godziny następnej doby pisze się po 24:00 – `endTime: '25:00'` to 01:00, pociąg o 00:20 ma
  `arr: '24:20'`; gra pokazuje je jak na zegarze. Godziny po 24:00 są dozwolone tylko w scenariuszu z `endTime` po 24:00
  (w zwykłej zmianie „26:15” to błąd zapisu); `endTime` wcześniejsze niż start to błąd `sc-window`.
* Pociągu, który w chwili późniejszego startu już stoi na stacji, nie da się wyrazić przez `trains` – trzeba własnego
  `timetable` scenariusza z wpisem `startOn` (`from: null`), czołem w stronę wyjazdu (`startOn.dir` = `dir` wyjazdu
  `to`). Pociąg nie zmienia czoła: wjazd i wyjazd po tej samej stronie stacji to dwa pociągi (kończący bieg + `unit`).
* Usterka (`faults`): `at` zawsze jako napis „GG:MM” (liczbę gra bierze za sekundy od północy), w czasie ruchu
  pociągów, których dotyczy – usterka bez wpływu na ruch bez zakłóceń to błąd.

Sprawdzenie wariantu: `npm run check -- <stacja>:<scenariusz>` (`scripts/check-scenario.mjs`, docs/architecture/testy-i-narzedzia.md
„Automat sprawdzający scenariusze”). Najpierw sprawdza definicję stacji i scenariusza (`src/model/scenarioCheck.js` –
błędy widoczne bez grania: okno zmiany, pociągi spoza rozkładu, pociągi, które nie powstaną, nie skończą biegu albo
musiałyby zmienić czoło, tory i przebiegi, zadania, usterki i zamknięcia wskazujące nieistniejące elementy, literówki
w polach, rozkład gęstszy niż szlak), potem gra zmianę dyżurnym automatycznym na poziomach `none`, `low`, `high`
i kilku ziarnach (domyślnie 1–3) do końca zmiany plus zapas i podaje werdykt każdej zmiany: OK / UWAGI / BŁĘDY
z pociągiem, miejscem i przyczyną. Ocena scenariusza bierze definicję i przebiegi na poziomie scenariusza (bez
zakłóceń albo wymuszonym `disruptions`); uwagi przy zakłóceniach wybieranych przez gracza to wiersz „Odporność”.
Kod wyjścia 1 przy błędach, z `--strict` także przy uwagach.
Każdy scenariusz każdej stacji przechodzi to samo w `npm test` (definicja i jeden przebieg na poziomie scenariusza –
`none` albo wymuszonym, ziarno 1): bez błędów i bez nowych uwag powtarzalnych – uwagi, które zostają świadomie,
wpisuje się do `tests/scenario-accepted.js` (komunikat testu podaje gotowy wiersz). Osobny test nie jest potrzebny.

## Okręgi nastawcze (`districts`) – opcjonalne

Obecnie żadna stacja w grze nie ma okręgów (Gdynia Główna jest prowadzona z jednego stanowiska); mechanizm zostaje
dla przyszłych stacji i jest testowany na `tests/fixtures/gdynia-glowna-okregi.js`.

```js
districts: {
  GO:  { name: 'GO – nastawnia dysponująca', short: 'GO', role: 'dysponująca', cols: [35, 99] },
  GO2: { name: 'GO2 – nastawnia wykonawcza', short: 'GO2', role: 'wykonawcza', cols: [0, 34] },
}
```

Pulpit dzieli się po kolumnach na osobne pulpity (zakładki). Sygnalizatory, zwrotnice i szlaki należą do okręgu
wg kolumny kostki. Gracz wybiera okręg (`?okreg=GO|GO2|both`); pozostałe prowadzi `AutoOperator`:
nastawnia wykonawcza działa tylko na polecenia dyżurnego (`sim.issueCommand`), dyżurny-automat sam wydaje polecenia
graczowi-nastawniczemu. Przyciski obcego okręgu są zablokowane, jego pulpit jest w podglądzie.

## Miejsce i era (`region`, `geo`, `lines`, `place`, `era`)

Ekrany wyboru (`src/ui/catalog.js`, `src/ui/StartScreen.js`) pokazują posterunki do służby na mapie Polski, w regionie
i na liście z wyszukiwarką. Posterunek do służby ma `region` (identyfikator województwa z `src/model/regions.js`, np.
`pomorskie`, `slaskie`, `warminsko-mazurskie`) i `lines` (numery linii kolejowych – te same co w `location`; z nich
powstaje schemat regionu: kolejne posterunki tej samej linii łączy odcinek). `geo` to współrzędne stacji (stopnie,
[szerokość, długość], w granicach Polski) – źródło w `docs/sources/posterunki.md`. Stacje szkoleniowe (z misją) tych pól nie mają.
Po dodaniu posterunku trzeba odświeżyć przebieg linii (`node scripts/rail-lines.mjs`); źródła, licencje i kroki –
`docs/MAP-DATA.md` (skill `posterunek-na-mapie`).

Era: jedno miejsce może mieć kilka edycji – osobnych plików stacji z własnym planem, rozkładem, taborem i **jednym**
rodzajem stanowiska (`srk`), np. `gdynia-glowna` (stan dzisiejszy) i `gdynia-glowna-2010` z `place: 'gdynia-glowna'`
i `era: 2010`. Edycje jednego miejsca są zakładkami na stronie stacji; mapa i lista pokazują miejsce raz. Przepisy są
zawsze dzisiejsze (Ir-1, Ie-1) – era zmienia urządzenia, plan, rozkład i tabor. Rok edycji i granice er wynikają ze
źródeł (`docs/sources/posterunki.md`).

Jedno stanowisko na posterunek: zmiany posterunku do służby działają na jednym rodzaju stanowiska (pole `srk`
scenariusza tylko w stacjach szkoleniowych). Wyjątki z czasów przed erami: Rumia i Reda (pulpit typu E i stanowisko
komputerowe po modernizacji linii 202) – pilnuje tego `tests/catalog.test.js`.

## System srk stacji (`srk`)

Pole opcjonalne na najwyższym poziomie definicji: `srk: 'E'` (urządzenia przekaźnikowe typu E, pulpit kostkowy –
domyślnie), `srk: 'izh111'` (urządzenia przekaźnikowe typu IZH-111, pulpit ciemny z przyciskami adresowymi
i rozkazów), `srk: 'mech'` (urządzenia mechaniczne scentralizowane: plan świetlny i ława z dźwigniami, drążkami
przebiegowymi i blokami przebiegowymi), `srk: 'komputerowe'` (stanowisko z monitorem: schemat na ciemnym tle, polecenia z menu elementu,
polecenia specjalne z potwierdzeniem) lub `srk: 'ebilock'` (komputerowe urządzenia EBILock 950 z pulpitem EBIScreen: ten sam
obraz, polecenia w linii poleceń zatwierdzane „Wykonaj”; nazwy obiektów w poleceniach to identyfikatory z definicji stacji –
sygnalizatory, zwrotnice, wykolejnice, odcinki, przyciski końca przebiegu) lub `srk: 'mor3'` (komputerowe urządzenia
MOR-3 z pulpitem MOR-1: ten sam obraz, polecenia z menu obiektów, przebieg kliknięciem celu, polecenia fioletowe
i specjalne z potwierdzeniem). Lista strategii: `src/srk/registry.js`. Układ kostek jest wspólny dla wszystkich
stanowisk – monitor rysuje ten sam plan jako schemat liniowy. Przyciski grupowe (Zw, Zz, Pz, dPz, Sz) nie są częścią definicji stacji – patrz „Przyciski stanowiska”. Nieznana wartość jest błędem walidacji.

## Ekrany pulpitu (`screens`, opcjonalne)

Szerokie stacje są dzielone automatycznie na „ekrany” (okna kolumn) mieszczące się w oknie przeglądarki – jak
monitory stanowiska LCS (`src/render/screens.js`: cięcia poza rozjazdami, skosami i sygnalizatorami, zakładka
2 kolumn, nazwy wg wyjazdów). Autor stacji może narzucić podział: `screens: [{ x0, x1, name }, …]` – wtedy
podział automatyczny jest pomijany.
