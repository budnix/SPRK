# SPRK – ruch kolejowy na posterunku

Słownik pojęć symulatora pracy dyżurnego ruchu: słowa, których używa się w rozmowie o grze i w nazwach modułów.
Terminologia kolejowa wg Ie-1 / Ir-1; słownik mówi, co pojęcie znaczy, nie jak jest zaprogramowane.

Przy każdym pojęciu:

* `_English_` – krótki opis po angielsku dla osób i sesji, które czytają kod (identyfikatory są po angielsku). To opis,
  nie oficjalny przekład przepisu: w rozmowie, dokumentacji, komunikatach i grze zostaje termin polski, a angielskie
  słowo kolejowe z innego systemu (UK, US) może znaczyć co innego.
* `_W kodzie_` – nazwa w kodzie (identyfikator, pole albo wartość); jak działa – `docs/architecture/`, skąd reguła –
  `docs/sources/` (odesłanie `_Więcej_`). Nazwy w kodzie i odesłania sprawdzają `tests/glossary.test.js`
  i `tests/docs.test.js`.

## Język

### Przebieg i jego stany

**Przebieg**:
Droga jazdy od sygnalizatora do następnego sygnalizatora, toru albo szlaku, na której zwrotnice są ustawione i utwierdzone, a sygnalizator może podać sygnał zezwalający. Pociągowy albo manewrowy.
_English_: route – a set path for a train or shunting movement, from a signal to the next signal, track or line, with points set and locked.
_W kodzie_: `route`, `routes`, `routeState`
_Unikaj_: trasa, droga (bez „przebiegu”), ścieżka

**Przebieg nastawiany**:
Przebieg, którego nastawianie przyjęto, ale zwrotnice jeszcze się przestawiają – nie jest utwierdzony.
_English_: route being set – accepted, points still moving, not locked yet.
_W kodzie_: `'setting'`
_Unikaj_: przebieg w toku, oczekujący

**Przebieg czeka na pociąg**:
Przebieg utwierdzony, do którego pociąg jeszcze nie wjechał, z sygnałem, który może zezwalać na jazdę.
_English_: route waiting for the train – locked, train not in it yet, the signal may show proceed.
_W kodzie_: `'waiting'`
_Unikaj_: przebieg aktywny, przebieg gotowy

**Sygnał na „Stój” przed pociągiem**:
Przebieg utwierdzony, do którego pociąg jeszcze nie wjechał, ale sygnalizator wskazuje „Stój”: zgasł z usterki, odwołał go dyżurny albo (nastawnia mechaniczna) dźwignia sygnałowa nie jest jeszcze przełożona.
_English_: locked route whose signal shows stop before the train – dropped by a fault, cancelled, or (lever frame) signal lever not pulled.
_W kodzie_: `'signal-off'`, `signalOff`
_Unikaj_: przebieg zgaszony, przebieg anulowany

**Przebieg zwalniany czasowo**:
Przebieg, którego zwolnienie zażądano przed wjazdem pociągu i który rozwiąże się po odliczeniu czasu.
_English_: route under timed release – release requested before the train entered; it frees after a countdown.
_W kodzie_: `'releasing'`, `timedRelease`, `TIMED_RELEASE`
_Unikaj_: przebieg kasowany, przebieg wygasający

**Przebieg zajęty przez pociąg**:
Przebieg, którego sygnalizator pociąg już minął – pociąg jedzie nim albo przejechał, a przebieg nie jest jeszcze rozwiązany.
_English_: route entered by the train – the train passed the signal; the route is not released yet.
_W kodzie_: `'entered'`
_Unikaj_: przebieg wykorzystany, przebieg w użyciu

**Przebieg nierozwiązany**:
Przebieg, przez który pociąg przejechał, a który sam się już nie rozwiąże, bo odcinek nie zwolnił się za pociągiem (usterka kontroli zajętości) – zostaje doraźne zwolnienie.
_English_: stuck route – the train passed, but a section did not clear behind it (track-detection fault); only an emergency release frees it.
_W kodzie_: `'stuck'`, `routeStuck`
_Unikaj_: przebieg zawieszony, przebieg zablokowany

**Przebieg przed pociągiem**:
Każdy przebieg utwierdzony, do którego pociąg jeszcze nie wjechał: czeka na pociąg, ma sygnał na „Stój” przed pociągiem albo jest zwalniany czasowo.
_English_: route ahead of the train – any locked route the train has not entered yet (waiting, signal at stop, or timed release).
_W kodzie_: `routeAhead`

**Zgaszenie sygnału z usterki**:
Samoczynne przejście sygnalizatora na „Stój” przed pociągiem z przyczyny po stronie urządzeń (zajętość bez taboru, zwrotnica bez kontroli), a nie z powodu taboru na drodze przebiegu. Uzasadnia sygnał zastępczy i rozkaz pisemny.
_English_: signal dropped by a fault – the signal goes to stop because of the equipment (false occupancy, point without detection), not because of a vehicle; it justifies the substitute signal and the written order.
_W kodzie_: `faultDrop`
_Więcej_: `docs/sources/sygnaly-i-blokada.md` „Stała kontrola sygnału i droga ochronna”

### Pociąg w rozkładzie

**Wpis rozkładu**:
Jeden pociąg w rozkładzie zmiany: jego definicja z rozkładu stacji albo scenariusza, plan (godziny w sekundach, chwila wyprawienia przez sąsiada) i to, co się z nim dzieje w trakcie zmiany.
_English_: timetable entry – one train of the shift's timetable: its definition, its plan and what happens to it during the shift.
_W kodzie_: `createEntry`, `source`
_Unikaj_: wiersz, rekord, pozycja rozkładu

**Etap pociągu**:
Gdzie jest pociąg wpisu rozkładu i co się z nim dzieje: oczekiwany u sąsiada, żądanie pozwolenia, na szlaku, wjeżdża, jedzie, stoi przed sygnalizatorem, postój, na stacji, manewruje, odjeżdża, odjechał, na następnym posterunku, zakończył bieg, przekazany jako inny pociąg.
_English_: train phase – where the train of an entry is and what it is doing (expected, on the line, entering, held at a signal, at the platform, shunting, departed, at the next station, terminated, handed over).
_W kodzie_: `phase`, `PHASES`, `setPhase`
_Unikaj_: status (to tylko napis etapu), stan pociągu (stan jazdy składu to co innego)

**Pociąg obsłużony**:
Pociąg, za który stacja już odpowiedziała: wyprawiony na szlak (także jeszcze w drodze do sąsiada), zakończył bieg albo jego skład przejął inny pociąg.
_English_: handled train – the station is done with it: dispatched onto the line (even if still travelling), terminated, or its unit became another train.
_W kodzie_: `isHandled`

**Pociąg skończony**:
Pociąg, z którym nic już się nie stanie: dojechał do następnego posterunku, zakończył bieg albo jego skład przejął inny pociąg. Pociąg obsłużony, ale jeszcze w drodze do sąsiada, nie jest skończony.
_English_: finished train – nothing more will happen to it: reached the next station, terminated, or handed over.
_W kodzie_: `isFinished`

### Posterunek i urządzenia

**Posterunek**:
Stacja albo inny posterunek ruchu, na którym gracz jest dyżurnym ruchu; w grze – stacja z planem torów, sygnalizacją, szlakami i rozkładem.
_English_: station (signal box) – the place the player runs; in the game a station with track layout, signals, lines and timetable.
_W kodzie_: `station`, `STATIONS`

**Dyżurny ruchu**:
Prowadzi ruch na posterunku: nastawia przebiegi, daje pozwolenia na szlak, wydaje rozkazy. W grze – gracz; za gracza w testach i narzędziach (przegląd silnika, automat sprawdzający scenariusze) działa automat dyżurnego.
_English_: signaller on duty (in code and reports: dispatcher) – the player; the automatic dispatcher plays this role in tests and tools.
_W kodzie_: `AutoOperator`, `Operator`

**Stanowisko**:
Rodzaj urządzeń srk, którymi dyżurny obsługuje posterunek: pulpit kostkowy typu E, pulpit IZH-111, nastawnia mechaniczna, monitor stanowiska komputerowego, EBILock 950, MOR-3.
_English_: workstation – the type of signalling equipment the player operates (relay desk type E, IZH-111, lever frame, computer workstations).
_W kodzie_: `srk`, `getSrk`
_Więcej_: `docs/sources/pulpity.md`, `docs/sources/stanowiska-komputerowe.md`

**Semafor**:
Sygnalizator dla pociągów (wjazdowy, wyjazdowy, drogowskazowy): podaje „Stój” albo sygnał zezwalający na jazdę pociągu; przy części semaforów także sygnał manewrowy.
_English_: main signal for trains (entry, exit, route) – shows stop or a proceed aspect for trains.
_W kodzie_: `signal`, `'semafor'`, `entry`

**Tarcza manewrowa**:
Sygnalizator dla jazd manewrowych: Ms1 – jazda manewrowa zabroniona, Ms2 – jazda manewrowa dozwolona.
_English_: shunting signal (Ms1 shunting forbidden, Ms2 shunting allowed).
_W kodzie_: `'tm'`

**Zwrotnica**:
Rozjazd z iglicami, które kierują tabor na jeden z dwóch torów; ma położenie zasadnicze i przełożone, a urządzenia kontrolują, w którym jest.
_English_: points (a switch) – directs vehicles onto one of two tracks; the equipment detects its position.
_W kodzie_: `point`, `points`

**Odcinek izolowany**:
Odcinek toru z kontrolą niezajętości (obwód torowy albo licznik osi); zajęty świeci na pulpicie na czerwono.
_English_: track section with train detection (track circuit or axle counter).
_W kodzie_: `section`, `sections`

**Utwierdzenie**:
Zamknięcie zwrotnic i odcinków nastawionego przebiegu: dopóki przebieg nie zostanie zwolniony albo pociąg go nie przejedzie, nie da się ich przestawić ani użyć w innym przebiegu. Na pulpicie świeci na biało.
_English_: route locking – points and sections of a set route cannot be moved or used by another route until it is released or passed.
_W kodzie_: `lockedSections`, `pointLockedByRoute`, `routeLocked`

**Odcinek zbliżania**:
Odcinek toru przed semaforem; pociąg na nim jest „w zbliżaniu”. W grze – odcinek szlaku przy stacji. Przebieg zwalniany, gdy pociąg jest w zbliżaniu, rozwiązuje się dopiero po odliczeniu czasu.
_English_: approach section – the track before a signal; a route released while a train is on it frees only after a delay.
_W kodzie_: `'approach'`, `exitApproach`
_Więcej_: `docs/sources/sygnaly-i-blokada.md` „Stała kontrola sygnału i droga ochronna”

**Droga ochronna**:
Odcinek za końcem przebiegu pociągowego (za semaforem, przed którym pociąg ma stanąć), który musi być wolny, na wypadek gdyby pociąg nie zatrzymał się w porę.
_English_: overlap – the stretch beyond the end of a train route that must be clear in case the train overruns.
_W kodzie_: `overlap`, `overlapSections`
_Więcej_: `docs/sources/sygnaly-i-blokada.md` „Stała kontrola sygnału i droga ochronna”

**Ochrona boczna**:
Zwrotnice poza przebiegiem ustawione tak, żeby tabor z sąsiednich torów nie mógł wjechać na drogę przebiegu.
_English_: flank protection – points outside the route set so that no vehicle can run into it from the side.
_W kodzie_: `flank`, `flankProtection`

### Szlak i polecenia

**Szlak**:
Tor albo tory między dwoma sąsiednimi posterunkami; stacja ma wyjazdy na szlaki.
_English_: line between two stations; the station has exits to its lines.
_W kodzie_: `exit`, `exits`

**Blokada liniowa**:
Urządzenia szlaku, które wpuszczają na szlak (albo na odstęp) tylko jeden pociąg naraz: półsamoczynna Eap (pozwolenie, blok początkowy i końcowy, przyciski doraźne) albo samoczynna SBL (odstępy między semaforami odstępowymi).
_English_: line block – lets only one train at a time onto the line (or block section): semi-automatic Eap or automatic SBL.
_W kodzie_: `LineBlock`, `blocks`, `'sbl'`
_Więcej_: `docs/sources/sygnaly-i-blokada.md` „Blokada liniowa Eap”

**Sygnał zastępczy (Sz)**:
Sygnał na semaforze, który pozwala pociągowi minąć semafor, gdy urządzenia nie pozwalają podać sygnału zezwalającego (usterka).
_English_: substitute signal (Sz) – lets a train pass a signal that cannot show proceed because of a fault.
_W kodzie_: `substitute`
_Więcej_: `docs/sources/sygnaly-i-blokada.md` „Sygnał zastępczy i rozkaz „S””

**Rozkaz pisemny „S”**:
Pisemne zezwolenie dyżurnego na minięcie semafora wskazującego „Stój” albo bez sygnału, gdy sygnału zastępczego podać nie można.
_English_: written order “S” – the signaller's written permission to pass a signal at stop or dark when the substitute signal cannot be given.
_W kodzie_: `issueOrder`
_Więcej_: `docs/sources/sygnaly-i-blokada.md` „Sygnał zastępczy i rozkaz „S””

**Jazda manewrowa**:
Ruch taboru po stacji, który nie jest jazdą pociągu: na sygnał Ms2 tarczy manewrowej albo na zezwolenie dyżurnego.
_English_: shunting movement – a movement within the station that is not a train run, on Ms2 or with the signaller's permission.
_W kodzie_: `'shunt'`, `toShunting`

**Zmiana czoła**:
Przejście maszynisty do kabiny na drugim końcu składu, żeby pojechać w przeciwną stronę.
_English_: cab change (reversal) – the driver moves to the cab at the other end to run in the opposite direction.
_W kodzie_: `cabChangeTime`
_Więcej_: `docs/sources/jazda-pociagu.md` „Zmiana czoła i rozmowy z maszynistą”

### Zmiana

**Zmiana**:
Jedna gra na posterunku: od godziny początku do końca, z rozkładem, zadaniami manewrowymi i usterkami scenariusza.
_English_: shift – one game session at a station, from start to end time, with its timetable, shunting tasks and faults.
_W kodzie_: `shift`, `endTime`

**Służba**:
Zmiana o wybranej porze doby i długości, z rozkładem wyliczonym ze wzorca stacji.
_English_: duty – a shift at a chosen time of day and length, with a timetable built from the station's pattern.
_W kodzie_: `DUTY_ID`, `DUTY_MINUTES`
_Więcej_: `docs/sources/posterunki.md` „Służba o wybranej porze”

**Usterka**:
Uszkodzenie urządzenia (sygnalizatora, zwrotnicy, odcinka, blokady, stanowiska) w czasie zmiany – losowe albo zapisane w scenariuszu.
_English_: fault – a failure of a device during the shift, random or scripted by the scenario.
_W kodzie_: `FAULTS`, `faults`
