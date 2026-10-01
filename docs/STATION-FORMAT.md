# Format definicji stacji (schemat v1)

Stacja to moduł ES eksportujący obiekt (docelowo także JSON z edytora). Przykład: `src/stations/stare-pustkowie.js`.
Walidacja: `validateStation(def)` w `src/model/validate.js`.

```js
export default {
  schemaVersion: 1,
  id: 'stare-pustkowie',          // identyfikator (URL: ?stacja=…)
  name: 'Przykładowo',
  description: '…',
  location: '…',                  // gdzie leży posterunek (linia, region) – karta na ekranie startowym
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
  TK 60 km/h) oraz przyspieszenie i hamowanie (`src/model/categories.js`); `vmax`, `accel`, `brake` wpisu nadpisują.
* `traction` – trzecia litera rodzaju pociągu towarowego lub lokomotywy luzem (zał. 6.3): `E` – elektryczna, lokomotywy
  (domyślnie), `S` – spalinowa, lokomotywy, `P` – parowa, `J` / `M` – zespoły trakcyjne elektryczne / spalinowe; tylko
  połączenia z tablic załącznika (np. `TKP`, `TSJ`, ale nie `TMJ`) – inne są błędem walidacji. Etykieta: `cat` + `traction`
  („TDS 44711”). Trakcja nie zmienia dynamiki.
* `length` – długość pociągu w metrach (cały skład z lokomotywą, tyle zajmuje torów; domyślnie 100). Liczba dodatnia.
  Pociąg dłuższy niż tor stacyjny `track` (suma odcinków z tym numerem toru) daje ostrzeżenie walidacji (Ir-1 §19 ust. 4).
* `mass` – masa brutto składu w tonach, bez czynnej lokomotywy (zał. 6.3, pole E02; Ir-1 §19 ust. 1 pkt 1); tylko dla
  pociągu towarowego ze składem wagonów (nie `LT`, `TH`, nie osobowe). Nie większa niż 7,2 t/m (nacisk liniowy 71 kN/m)
  razy `length`. Przyspieszenie kategorii obowiązuje przy jej masie odniesienia (TM/TG 2000 t, TD/TC 1400 t, TN/TR 1200 t,
  TS 800 t, TK 600 t); pociąg o masie `mass` przyspiesza razy `masa odniesienia / mass`, najwyżej 1,5 i najmniej 0,5
  przyspieszenia kategorii. Bez `mass` – przyspieszenie kategorii. Hamowanie nie zależy od masy.
  Obowiązuje mniejsza z prędkości pociągu i szlaku: na szlaku wjazdowym – `lineSpeed` wyjazdu `from`, dopóki cały
  pociąg nie wjedzie na stację; dalej – `lineSpeed` wyjazdu `to` (pociąg kończący bieg – `from`). Na rozjazdach –
  prędkość rozjazdu, przy Sz i rozkazie „S” – 40 km/h do następnego semafora (przy wyjeździe na szlak do końca
  rozjazdów, na SBL – przez umowny pierwszy odstęp 1000 m).
* `catLabel` – opcjonalnie własna etykieta kategorii, nadpisuje całą etykietę (także `cat` + `traction`).
* `name` – relacja pełna, jak w rozkładzie („Regio Gdańsk Gł. – Słupsk”, „IC „Kaszub” Kraków Gł. – Gdynia Gł.”);
  przedrostek kategorii i nazwa handlowa w cudzysłowie są z niej wycinane do wyświetlenia (`relationOf`, `brandOf`).
  Rozkład pokazuje etykietę „IC 5100” i relację; sąsiednie posterunki (`from` → `to`) w drugiej linii.

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
