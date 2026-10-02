# Zależności i blokada liniowa

Część dokumentacji architektury – indeks i zasady: [`docs/ARCHITECTURE.md`](../ARCHITECTURE.md).

## Pętla

`main.js` → `requestAnimationFrame` → `sim.step(realDt)` → `Clock.advance` → kroki po 0,5 s symulacji:
`Block.tick` → `Traffic.tick` (pociągi, zajętość) → `Interlocking.tick` (zwrotnice, przebiegi, zwalnianie).

## Zależności typu E – skrót

* Przebieg: dwa przyciski (początek, koniec) → sprawdzenie warunków → automatyczne przestawienie zwrotnic
  (nastawianie przebiegowe) → utwierdzenie (odcinki białe) → obraz sygnałowy (Ie-1: S1–S5, S10–S13, Ms2, Sz).
* Jednoczesne wjazdy z obu kierunków są możliwe tylko, gdy drogi ochronne nie są wspólne: w Szkolnej za każdym
  semaforem wyjazdowym jest osobny odcinek (T1w/T2w/T1e/T2e) przed rozjazdem, więc krzyżowanie A→D2 + B→C1 nastawia
  się od razu; na stacji testowej `tests/fixtures/stare-pustkowie.js` droga ochronna za C1 leży na rozjazdzie 1
  i drugi wjazd czeka na zwolnienie Iz1 (test `interlocking.test.js`).
* Przejazd: semafor na Stój po zajęciu pierwszego odcinka za nim (sygnał manewrowy – po zwolnieniu odcinka przed
  sygnalizatorem, `act.shuntHold`; tak samo semafor kształtowy przy przebiegu pociągowym – `act.armHold`); zwalnianie odcinkowe; droga ochronna zwalnia się po wjeździe na tor docelowy.
  Kontynuacją przebiegu pociągowego (droga ochronna zbędna) jest tylko przebieg pociągowy z semafora końcowego.
* Zezwolenie na jazdę (`Train`): pociąg jedzie tylko na `Interlocking.isTrainProceed` (bez Ms2 / M2), Sz albo rozkaz;
  `authority` daje miniony semafor albo wjazd ze szlaku, `exitAuth` – przebieg na szlak (albo Sz / rozkaz); bez
  zezwolenia (`reverse`, `toTrainMode` / `toShunting` wołają `clearAuthority`) rusza tylko na sygnał semafora przed sobą.
  Skład manewrowy – na Ms2 sygnalizatora przed sobą albo pod sobą i dalej w przebiegu, którego sygnał minął
  (`shuntRoute`). Test: `tests/train-authority.test.js`.
* Jazda na tor zajęty: `Train.#lookahead` pyta `Traffic.stockAt(kostka, port)` o odległość do innego taboru na kostce
  odcinka zajętego – zatrzymanie 2 m przed taborem, ostatnie `STOCK_CREEP` m do 3 km/h (bez `stockAt` – przed złączem).
* Przyspieszenie (`categories.dynamicsFor`): z kategorii, a gdy wpis rozkładu ma masę (`mass`) – razy `refMass / mass`
  kategorii w granicach `MASS_ACCEL_MIN`–`MASS_ACCEL_MAX`; `accel` wpisu ma pierwszeństwo. Hamowanie nie zależy od masy.
  Walidacja (`validate.js`, wpisy rozkładu – `validateTimetable`, także dla własnego rozkładu scenariusza) sprawdza
  `cat`, `traction`, `length`, `mass` wpisu i ostrzega, gdy pociąg jest dłuższy niż tor stacyjny. Testy:
  `tests/categories.test.js`.
* Hamowanie (`Train.tick`): służbowe z kategorii; gdy ograniczenie jest bliżej niż droga hamowania – mocniej, najwyżej
  `EMERGENCY_BRAKE`. Minięcie semafora bez sygnału dla pociągu (i bez rozkazu) to `spad` (Traffic: alarm, kara – bez
  kary przy `sig.failed` albo `act.faultDrop`, czyli gdy sygnał zgasł z przyczyny po stronie urządzeń), potem
  hamowanie nagłe i utrata zezwolenia. Dalsza jazda: `Traffic.issueOrder` dla miniętego semafora (droga liczona od
  czoła pociągu – `Train.headTile`, `Interlocking.pathFrom`) woła `Train.resumeAfterStop`. Test: `tests/spad.test.js`. Postój przy peronie trwa, dopóki semafor tuż przed pociągiem ma „Stój”
  (`depart` przy ruszeniu). Testy: `tests/braking.test.js`, `tests/departure.test.js`.
* Zwalnianie: Pz (natychmiast lub czasowo 90 s przy zajętym odcinku zbliżania albo przebiegu poprzednim z sygnałem
  zezwalającym lub pociągiem), dPz (doraźne, licznik). Po zwolnieniu kontynuacji `#restoreOverlap` przywraca drogę
  ochronną przebiegu poprzedniego (`overlapByCont`) albo daje „Stój”.
* Wspólny tor docelowy: odcinek ma jednego właściciela (`section.route`), z jednym wyjątkiem – tor stacyjny będący
  ostatnim odcinkiem dwóch przebiegów manewrowych (`#sharedEndTrack`, Ie-4 §43 ust. 5). Oba przebiegi mają go
  w `lockedSections` i flagę `sharedEnd`; `section.route` wskazuje jeden z nich, a przy zwolnieniu przechodzi na drugi
  (`#unlockSection`). Wjazd składu w taki przebieg poznaje się po odcinkach głowicy, nie po zajętości toru docelowego
  (zajmuje go też drugi skład). Pociąg widzi inny tabor także na kostce, na której stoi jego czoło
  (`Traffic.stockAt(…, from)`). Test: `tests/shared-track.test.js`.
* Droga pociągu na Sz / rozkaz „S”: `Interlocking.holdPath` (z `substituteSignal` i `Traffic.issueOrder`) trzyma
  zwrotnice i wykolejnice drogi (`pathHolds`) – Zz, przestawienie, zdjęcie zabezpieczenia i przebieg w innym położeniu
  odmawiane, dopóki pociąg ich nie minie (odcinek zajęty, potem wolny) albo Sz nie zgaśnie bez pociągu na drodze.
  Testy: `tests/faults-shunt.test.js`.
* Przebieg po usterce: `Interlocking.routeStuck(act)` – pociąg przejechał odcinek wykazujący zajętość z usterki, więc
  przebieg sam się nie rozwiąże; doraźne zwolnienie jest wtedy bez kary.
* Małe pytania o układ mają jedno miejsce (`trainPaths.js`): `exitApproach(ilk, szlak)` – odcinek zbliżania szlaku,
  `entryRoutes(ilk, szlak, przebiegi)` – przebiegi pociągowe wjazdowe od jego strony, `trainTrack(ilk, skład)` – tor,
  na którym stoi skład. Korzystają z nich automat dyżurnego, ruch, polecenia między okręgami, kontrola scenariusza
  i pomocnik testów usterek (`tests/train-paths.test.js`).
* Drogi pociągu po przebiegach pociągowych (`trainPaths.js`: `entryPath` – wjazd na tor, do 3 przebiegów przez semafory
  pośrednie; `trainRouteChains` – wszystkie łańcuchy, np. wyjazd z toru na szlak) są wspólne dla automatu dyżurnego,
  ruchu (`Traffic` – usterka na drodze toru planowego) i kontroli scenariusza (`scenarioCheck.js`).
* Automat dyżurnego (`Operator.js`) nie prowadzi własnych notatek o przebiegach – pyta urządzenia: wjazd należy się
  pociągowi, który nie minął semafora wjazdowego (`train.entryPending`) i jedzie pierwszy (na SBL pociągi bywają
  w innej kolejności niż w rozkładzie); wyjazd jest „za pociągiem”, gdy minął semafor wyjazdowy (`exitAuth`). Wjazd
  wieloetapowy (Sopot: A → H → O): automat ma przy pociągu tylko plan dalszych stopni (`plan.entry` – notatki automatu są jego własne, nie leżą na wpisie rozkładu; `AutoOperator.plan(nr)` do diagnozy), a o tym, czy stopień
  trzeba nastawić, mówią urządzenia – stopień, w którym pociąg już jest (także po minięciu semafora na Sz / rozkaz),
  schodzi z planu; stopień, który czeka na pociąg, zostaje w planie i po zgaszeniu z usterki jest nastawiany od nowa
  (także dla pociągu przed semaforem wjazdowym); gdy wszystkie stopnie czekają, automat zajmuje się wyjazdem (pociąg
  bez postoju). Takt automatu (`tick`) to zwolnienia przebiegów, blokady liniowe (`#lineBlocks`) i dla każdego pociągu
  kroki w stałej kolejności (`#serve`): polecenia dla gracza, rozkaz pisemny, Sz przy wyjeździe, kolejne stopnie wjazdu,
  wjazd, manewry, prośba o szlak, wyjazd. Krok zwraca wynik `{ step, stop, acted, reason, … }` albo null; `stop` kończy
  czynności przy pociągu na ten takt, `acted` mówi, czy wydał polecenie – to osobne rzeczy (Sz i prośba o szlak
  działają i nie kończą). Ostatni wynik przy pociągu podaje `AutoOperator.report(nr)` – dane dla narzędzi i testów
  (`tests/operator-report.test.js`: decyzję automatu sprawdza się po takcie w przygotowanym stanie, nie tylko po
  wyniku całej zmiany); gra od nich nie zależy. Automat zadaje o przebieg trzy różne pytania i każde ma nazwę (`Operator.js`): przebieg jest przed
  pociągiem (`Interlocking.routeAhead` – zajmuje tor i szlak), przebieg dla pociągu jest w drodze (`#onItsWay` – także
  z sygnałem na „Stój” i zwalniany czasowo: drugiego nie nastawiać) i stopień poprowadzi pociąg taki, jaki jest
  (`#carries`). Nie zastępuje się jednego drugim: próba ujednolicenia dała polecenia nastawiania co takt podczas
  zwalniania czasowego. Po
  usterkach: zwalnia przebieg, którego semafor zgasł przed pociągiem, i nastawia go od nowa (poza nastawnią
  mechaniczną – tam sygnał trzyma dźwignia); zwalnia doraźnie przebieg z `routeStuck` (na nastawni mechanicznej
  najpierw dźwignia sygnałowa na „Stój”, potem zwalniacz – `tests/mech.test.js`); wydaje rozkaz „S” pociągowi za semaforem miniętym na „Stój”; przy krzyżowaniu na szlaku jednotorowym
  przyjmuje pociąg na inny tor, gdy planowy zajmuje pociąg czekający na ten sam szlak (na którymkolwiek odcinku
  przebiegu – tor bywa podzielony, np. Reda: peron I na T23, dalej T3), a także gdy planowy zajmuje skład, który
  z niego już nie odjedzie (zakończył bieg, bez zadań manewrowych i bez pociągu ze składu – Tczew: 44631 na torze 15
  opóźnionego 44611). Pociąg jadący dalej dostaje inny tor tylko taki, z którego jest przebieg wyjazdowy na jego szlak.
  Testy: `tests/rumia.test.js`, `tests/operator.test.js`, `tests/tczew.test.js`.
* Manewry automatu (`Operator.#shuntPath`): drogę do toru docelowego zadania szuka BFS po przebiegach manewrowych,
  także z kilkoma zmianami kierunku (Chylonia: z toru 2 przez tor 503 na tor 1 i do Postojowej). Pierwszy przebieg
  zaczyna się od sygnalizatora, przed którym skład stoi; kolejny nie może potrzebować w innym położeniu zwrotnic, które
  trzyma poprzedni (ochronne i pod składem) – inaczej skład utknąłby w połowie drogi. Bez drogi skład czeka (wcześniej
  automat zmieniał mu kierunek co takt). Pociąg kończący bieg z zadaniem, gdy tor planowy jest zamknięty, dostaje tor,
  z którego zadanie da się wykonać (albo czeka na taki tor). Skład, z którego powstanie pociąg (`unit`), a który
  po przepadnięciu zadań stoi na torze bez przebiegu pociągowego, automat podstawia na tor odjazdu tego pociągu.
  Testy: `tests/chylonia.test.js`, `tests/unit-handover.test.js`.
* Tor szlakowy zajęty do minięcia semafora wjazdowego: `Block.awaitingEntry` (`tests/line-busy.test.js`) – na każdej
  blokadzie, także samoczynnej (ostatni odstęp kończy się na semaforze wjazdowym; wcześniej SBL zwalniał odstęp przy
  zjeździe ze szlaku i następny pociąg wjeżdżał na odcinek przed semaforem, na którym stał poprzedni).
* Zgłoszenie pociągu przez sąsiada przeżywa zmianę trybu blokady: `Traffic.tick` pyta `Block.neighbourRequestAlive(nr)`
  i – gdy usterka łączności albo naprawa skasowała żądanie lub telefonogram – zgłasza pociąg od nowa (przy usterce
  telefonicznie, po naprawie przez blokadę). Zmiana stanu blokady (zdarzenie `block`) odświeża obrazy semaforów:
  przebieg wyjazdowy nastawiony bez pozwolenia dostaje sygnał, gdy pozwolenie przyjdzie. Automat wyprawia pociąg na
  Sz także wtedy, gdy blokada daje drogę, ale nie sygnał (Pwl). Test: `tests/request-fault.test.js`. Tak samo nie
  przepada przyjazd naszego pociągu do sąsiada: gdy usterka łączności zaczyna się, zanim przyszło jego Ko, sąsiad
  potwierdza przyjazd telefonicznie (`tests/block.test.js`).
* Wstrzymanie pociągu sąsiada: telefonogram `hold` („Stój pociąg nr …”, `Block.phoneHold`) kasuje żądanie pozwolenia
  albo zapytanie o drogę na `HOLD_TIME`. Automat używa go na szlaku jednotorowym, gdy każdy tor wjazdu z tego szlaku
  zajmuje pociąg czekający na ten sam szlak; a gdy sąsiad ma już pozwolenie, nie wpuszcza własnego pociągu na tor,
  po którego zajęciu pociąg sąsiada nie miałby gdzie wjechać (mijanka z jednym torem albo z kilkoma – liczą się tory
  zajęte przez pociągi czekające na ten sam szlak). Testy: `tests/hold.test.js`, `tests/operator.test.js`.
* Tor docelowy z kilku odcinków (np. krótki odcinek za peronem, przy semaforze końcowym): przebieg pociągowy jest
  zakończony, gdy zwolniły się wszystkie odcinki przed torem docelowym i pociąg stoi na tym torze – także wtedy, gdy
  do ostatniego odcinka nie dojechał (`tests/mech.test.js`).
* Losowe usterki (`Faults.#generate`) losują czas z okna zmiany liczonego z `sim.endTime` (sekundy). Dwie usterki
  tego samego rodzaju na jednym elemencie mogą się nałożyć (losowanie, scenariusz): druga nie ustawia elementu od nowa,
  naprawa przychodzi po ostatniej (`Faults.#twin`; napęd zwrotnicy – do późniejszego końca).
* Stała kontrola (`Interlocking.tick`, `#signalCondition`): przed wjazdem pociągu zajętość odcinka przebiegu lub drogi
  ochronnej albo zwrotnica bez kontroli – `signalOff`, przebieg utwierdzony (bez nastawni mechanicznej).
  Test: `tests/signal-safety.test.js`.
* Zwrotnica bez kontroli: `Interlocking.securePoint` (polecenie `{ type: 'point-secure', id, on }`, zakładka Urządzenia
  panelu) – po `POINT_SECURE_TIME` `secured`; pociąg przejeżdża zabezpieczoną zwrotnicę bez kontroli (na Sz / rozkaz),
  `issueOrder` jej nie odrzuca. Testy: `tests/point-secured.test.js`, `tests/e2e/points.spec.js`.
* Sz i rozkaz „S”: droga za semaforem po bieżących położeniach zwrotnic (`Interlocking.pathBeyond`) – blokada tylko
  wyjazdu na tej drodze, uzasadnienie usterką tylko na niej (`faultOnPath`); `Traffic.issueOrder` używa tej samej drogi.
* Zwrotnice: Zw + przycisk, blokada przy zajętości / utwierdzeniu / zamknięciu (Zz); rozprucie przy najeździe z ostrza.
* Zmiana czoła i radio z maszynistą: `Traffic.reverseTrain` → `Train.startCabChange` (`cabChange` na pociągu, nie na
  wpisie rozkładu – przekazanie składu jako inny pociąg go nie gubi); skład stoi `cabChangeTime` s (45–75), koniec
  w `Train.tick` przed warunkiem pociągu, który zakończył bieg (taki zmienia czoło), potem `reverse()` (sama zmiana
  kierunku, od razu) i zdarzenie pociągu `cab-ready`. W toku zmiany `reverseTrain`, `toShunting`, `toTrainMode` zwracają
  false bez skutków (automat pyta w każdym kroku). Polecenia z zakładki Pociągi idą przez szynę jako `driver`
  (`shunt` / `train` / `reverse`, po zmianie `ready` z sygnalizatorem przed nowym czołem); `Comms` zapisuje rozmowę
  wg Ir-5 (wywołanie, odpowiedź po `DRIVER_REPLY` s, meldunek gotowości – rodzaj `radio`, potwierdzenie). Opcja
  `{ quiet: true }` – bez rozmowy (automat okręgu obok gracza). Automat dyżurnego zleca zmianę czoła pociągowi ze
  składu innego pociągu od przekazania, przebieg – ok. 2 min przed odjazdem. Test: `tests/cab-change.test.js`.
* Telefonogramy: `FORMULAS` w `Comms` (wzory Ir-1); rozmowy przy sprawnej blokadzie (`LineBlock.talk`, 1a / 4a na
  jednotorze, zawiadomienie o odjeździe na dwutorze) – `phoneRoutine` 'auto' (nadaje blokada: `phone-out`) albo 'manual'
  (ustawienie gracza, kara `phone-routine`); przy usterce na torze właściwym dwutoru bez zapytania.
* Blokada Eap: Wbl (żądanie pozwolenia), oWbl (wyciągnięcie Wbl – `Simulation.pull`), Poz (danie pozwolenia), Ko
  (zwolnienie bloku końcowego po przyjeździe w całości i stwierdzeniu przejazdu), dPo (doraźne zablokowanie bloku
  początkowego po wyjeździe na Sz), dKo (doraźne przygotowanie bloku końcowego przed wjazdem na Sz) – liczniki;
  blokada samoczynna SBL: bez pozwoleń, bez Po / Ko i liczników doraźnych, Zk (prośba o zmianę kierunku albo zgoda
  na prośbę sąsiada – `request` 'ours' / 'theirs'); odstęp zwalnia się, gdy nasz pociąg go opuści.

## Zwalnianie odcinkowe (`Interlocking.tick`)

Czoło pociągu w przebiegu to najdalszy odcinek zajęty od chwili utwierdzenia (`wasOccupied` zeruje się przy
utwierdzeniu, więc tabor stojący wcześniej na torze docelowym – jazda manewrowa na Ms2 – nie liczy się). Odcinki za
czołem zwalniają się, gdy są wolne, także gdy bardzo krótki odcinek (sama zwrotnica po podziale grupy, ~10 m toru)
został przeskoczony między krokami symulacji bez zajęcia; ostatni odcinek zwalnia się po opuszczeniu (wyjazd na szlak)
albo po wjeździe na tor docelowy. Wjazd pociągu w przebieg (semafor samoczynnie na „Stój”) rozpoznaje się po zajęciu
któregokolwiek odcinka od utwierdzenia, nie tylko pierwszego.

## Przebieg złożony (`Interlocking.routeChains`, `pressCompound`)

Na stanowisku komputerowym koniec przebiegu może leżeć za semaforem pośrednim (Sopot: A → H → O → szlak, Chylonia:
G502 → A502 → szlak). `ScreenRenderer` przekazuje koniec przez `handlers.onCompound` → `Simulation.pressCompound` →
`ButtonProtocol.pressCompound` → `Interlocking.requestCompoundRoute` (to samo daje polecenie wprost
`{ type: 'route', compound: true }`): gdy jest przebieg bezpośredni, działa jak `press`; inaczej `routeChains` szuka łańcuchów
przebiegów tego rodzaju przez semafory pośrednie (od najkrótszego), `requestCompoundRoute` sprawdza wszystkie ogniwa
(`checkRoute`; ogniwo już nastawione liczy się jako gotowe) i dopiero wtedy nastawia je po kolei – przy blokadzie
któregokolwiek ogniwa nic nie jest nastawiane, a odmowa nazywa ogniwo. Pulpit kostkowy zostaje przy `onPress`
(każdy przebieg osobno, jak na pulpicie typu E).

## Blokada liniowa (`src/model/Block.js`)

`LineBlock` obsługuje trzy warianty jednym modelem: Eap dwukierunkowa (szlak jednotorowy: Wbl/Poz/Ko), Eap
jednokierunkowa (`direction`, tylko Po/Ko) i samoczynna SBL (`block: 'sbl'`: bez pozwoleń, bez Ko, zmiana kierunku
`Zk`; nastawiony przebieg wyjazdowy „zajmuje” kierunek przez `commitOut()` wołane z `Simulation` na zdarzeniu
`route:set`, a przebieg rozwiązany bez pociągu go oddaje – `releaseCommit()`; zgody Zk dla sąsiada przy nastawionym
przebiegu wyjazdowym nie ma). Odjazd zajmuje blokadę szlaku, na który pociąg naprawdę wjechał (zdarzenie `leave`
z numerem szlaku, `e.actualExit`) – przy jeździe po torze lewym to nie szlak z rozkładu (`tests/left-track.test.js`). Warunek wyjazdu `gate(mode, routeId)`: 'route' (przebieg), 'substitute' (Sz, rozkaz), 'signal' (sygnał
zezwalający – `Interlocking.#computeAspect` woła go dla przebiegów na szlak: pozwolenie przeniesione przez blokadę,
przeciwwtórność `pwl`); `fault: true` w wyniku uzasadnia Sz / rozkaz (`faultOnPath`); `code` – stały kod odmowy (zakładka
Pociągi). Pwl włącza `onExitSignal`
z `Interlocking` przy pierwszym sygnale zezwalającym przebiegu na szlak. Stwierdzenie przejazdu (`zpg`): `Train`
zgłasza minięcie pierwszego semafora stacji (`entry-signal`) → `Traffic` → `entryPassed(onSignal)`; wyjazd na Sz /
rozkaz (`exitAuth === '*'`) nie blokuje bloku początkowego (`needPo` → dPo). Czasy odpowiedzi sąsiada (Poz, potwierdzenie
przyjazdu, telefonogramy) losuje `opts.random` – `Simulation` daje każdemu szlakowi własny ciąg z ziarna zmiany, więc
to samo ziarno daje tę samą zmianę (test w `tests/disruptions.test.js`). Przy usterce (`fault`, zapowiadanie
telefoniczne) szlak jest „nasz” (`#oursUnderFault`), gdy mamy „droga wolna” dla naszego pociągu albo niewykorzystane
pozwolenie sprzed usterki (`faultDir`; zużywa je wyjazd pociągu) – sąsiad nie dostaje wtedy drogi, a naprawa zostawia
pozwolenie u nas, dopóki pociąg nie wjedzie na szlak (`setFault(false)`); testy: `tests/faults-block.test.js`. SBL po
naprawie zwalnia odstęp, gdy nie ma na nim pociągu; zapytanie o drogę (`ask-free`) przyjmuje pociąg do tej samej stacji
sąsiedniej także innym torem niż z rozkładu (jazda po torze lewym, `tests/faults-stations.test.js`). Blokada zna numer pociągu na torze szlakowym (`lineTrain`: nasz od wyjazdu do potwierdzenia przyjazdu,
sąsiada od wyprawienia do zjazdu w całości); monitor pokazuje go w menu strzałki szlaku pod separatorem, po
poleceniach, jako czerwone kasetki z samymi numerami (`lineTrains`: pociąg na szlaku pełną kasetką, potem w kolejce
pociągi zgłoszone przez sąsiada i czekające – konturem) – jak system śledzenia numerów w komputerowych srk, tylko na
żądanie, bo przy szlakach dwutorowych nie ma miejsca na kasetkę przy strzałce; pulpit kostkowy – nie.
Na monitorze stan blokady rysuje `ScreenBase.#exitMark` przy wyjeździe (`blockRefs`): strzałki kierunkowe (obraz
A / B / C z segmentami a i b) i symbol Ko/dKo wg Ie-104.1 §8 pkt 20–22 – stan → obraz, barwy i kształt liczy
`src/render/blockSymbol.js` (bez DOM, test w Node), miganie niesie wspólna faza obrazu (`data-ph` grupy planu – reguły CSS zaczynają się od niej, bo pola skrajne kopiują grupę przez `<use>` i rysunek nie jest tam przodkiem; pola przejmują też klasę i zmienne CSS rysunku na bieżąco); polecenia
daje menu elementu końca toru (`#blockMenu`); pulpit kostkowy rysuje blokadę jako kostki przy końcu toru szlakowego
(`src/render/blockLayout.js`, bez DOM: strzałki „odjazd” / „przyjazd” na kostkach toru – żądania migają na nich,
przyciski Ko | Poz | Wbl albo Zk w rzędzie obok – lampka Ko i Pwl, liczniki dKo | dPo wyżej – jak na pulpitach typu
E; `deskParts.updateBlockLamps`), bez osobnej kostki `block`.
Perony na pulpicie kostkowym: `DeskRenderer.#buildPlatforms` rysuje obrys z nazwą z tej samej geometrii
(`platformSpans`); krawędź peronowa od strony toru peronowego to podwójna kreska (`edges`, `platformEdgeLines`) na obu stanowiskach. Geometria peronów (`platformSpans`, `platformRanges` – zasięg peronu wzdłuż toru) jest w warstwie logiki, `src/tiles/platforms.js` (`src/render/platforms.js` ją re-eksportuje): model bierze z niej miejsce zatrzymania czoła pociągu – `Train.#platformPlan` (raz na odcinek, rząd i kierunek: czoło na `PLATFORM_STOP` = 3/4 peronu, pociąg dłuższy niż połowa peronu na środku peronu, `stopShort` metrów wcześniej z `Traffic.stopScatter`, najdalej przy końcu peronu; tor czołowy z kozłem za peronem – przy końcu peronu; tył nie na rozjazdach – inaczej jak dawniej przed semaforem; `#platformStop` daje przesunięcie na kostce, na którą miejsce wypada); z peronu pociąg rusza, gdy pierwszy semafor przed czołem nie wskazuje „Stój” (`#clearToLeave`). Opis „tor N” na pulpicie mieści się na jednej kostce (`trackLabelText` pomija dopisek „· Peron …”),
jest rysowany delikatnie, zawsze nad opisywanym torem, na prostej kostce toru tuż nad paskiem (`trackLabelPlace`);
własna kostka opisu zostaje pusta, więc opis nigdy nie leży na obrysie peronu.
