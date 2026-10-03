# Stanowiska obsługi (systemy srk i ich widoki)

Część dokumentacji architektury – indeks i zasady: [`docs/ARCHITECTURE.md`](../ARCHITECTURE.md).

## Strategie systemów srk (`src/srk/`)

Stacja deklaruje `srk: 'E' | 'komputerowe' | 'ebilock' | 'mor3' | 'izh111' | 'mech'` (domyślnie `E`). Strategia to wpis w rejestrze
(`registerSrk({ id, name, description, view, model, input? })`):

* `model` – parametry przekazywane do `Interlocking` (np. `armTimeout`: 6 s na drugi przycisk pulpitu,
  60 s na wskazanie końca przebiegu na monitorze). Logika zależności (utwierdzenie, zwalnianie odcinkowe,
  ochrona boczna, liczniki, blokady) jest **wspólna** – to cechy ruchu kolejowego, nie stanowiska.
* `input` – protokół obsługi stanowiska (bez DOM): `(ilk, bus, model) => { press, pull, pressCompound, cancel,
  tick, armed }`. Bez niego obowiązują przyciski typu E (`src/srk/buttons.js`); `izh111` ma protokół „adres +
  rozkaz” (`src/srk/address.js`). Opcje zależności tej strategii: `timedRelease`, `shuntTimedRelease`,
  `timedReleaseAlways` (IZH-111: Zcz zwalnia po 120 s, przebieg manewrowy bezzwłocznie). Nastawnia mechaniczna (`mech`)
  nie ma protokołu – ława wydaje polecenia wprost – i włącza opcje `manualPoints`, `manualSignal`, `routeBlock`,
  `holdRoute`, `shapedSignals`, `pointSwitchTime` (opis w nagłówku `Interlocking.js`). EBILock 950 (`ebilock`) ma
  protokół linii poleceń `src/srk/ebilock.js`: `press` (lewy klawisz – początek przebiegu), `pull` (prawy – koniec,
  element pośredni albo obiekt), `menu()` (treści poleceń dla wyboru), `submit(text)` → polecenie dla
  `Simulation.execute` (wykonuje `Simulation.submitCommand`), znaczniki poleceń specjalnych z oknem 5–30 s,
  zdarzenia i alarmy z potwierdzaniem (`Simulation.ackAlarms`); widok czyta stan przez `sim.input`. MOR-3 (`mor3`) ma
  protokół menu obiektów `src/srk/mor.js`: `press` (wybór obiektu albo cel przebiegu), `menu()`, `choose(code)` →
  polecenie od razu albo czekające na potwierdzenie (`confirm()`, `cancel()`; Ie-20 §13), licznik poleceń specjalnych;
  wykonują je `Simulation.chooseCommand` / `confirmCommand`. Okno zdarzeń i alarmów obu stanowisk to wspólny
  `src/srk/eventLog.js` (zdarzenie szyny `console`); fabryka `input` dostaje czwarty argument `{ blocks }`.
* `view` – rodzaj stanowiska: `desk` (DeskRenderer, przyciski dwuprzyciskowe), `izh` (IzhRenderer: pulpit ciemny,
  przyciski adresowe i grupa rozkazów), `lever` (LeverRenderer: plan świetlny i ława dźwigniowa), `screen`
  (ScreenRenderer: schemat na ciemnym tle, menu poleceń elementu, polecenia specjalne z potwierdzeniem) lub `ebi`
  (EbiRenderer: ten sam obraz – `ScreenBase` – z linią poleceń, menu pod prawym klawiszem, ramkami wyboru EBIScreen
  i oknem zdarzeń i alarmów) lub `mor` (MorRenderer: ten sam obraz, menu obiektów z fioletową obwódką, pasek
  potwierdzenia – wspólny `confirmBar.js` – i okno komunikatów i alarmów pod obrazem).
  Widoki są w rejestrze `src/srk/views.js` (`registerView`, `createView`, `viewSize`, `armHint`, `viewHelp`);
  model ich nie importuje.
* Każdy widok rozszerza `PanelView` (`src/render/PanelView.js`). Baza trzyma to, co wspólne: okno kolumn i tryb
  podglądu, rysunek `svg` z grupą planu `inner` i marginesem `pad`, wycinek (`setView` / `resetView`), subskrypcje
  zdarzeń symulacji (`bindModel`), `refreshAll`, liczniki, prowadzenie etykiet pociągów, `elementFor(ref)` oraz puste
  odpowiedzi dla opcji (`cmdBar`, `cmdButton`, `setSymbolScale`). Widok dostarcza margines (`static PAD`), skalę rzędów
  i metody obrazu stanu (`updateSection`, `updatePoint`, `updateDerailer`, `updateSignal`, `updateBlock`,
  `updateArmed`, `createTrainLabel`, `placeTrainLabel`). Rozmiar rysunku liczy klasa widoku (`View.size`), więc
  `main.js` i `EdgePanels` nie znają marginesów poszczególnych stanowisk. Kontraktu pilnuje `tests/views.test.js`.
* Dwa wejścia do symulacji, te same polecenia zależnościowe pod spodem:
  * **przyciski** – `sim.press(ref)` / `sim.pull(ref)` / `sim.pressCompound(ref)` → `ButtonProtocol`
    (`src/srk/buttons.js`): obsługa dwuprzyciskowa pulpitu typu E, uzbrojenie na `armTimeout` s, rodzaj przebiegu
    z koloru przycisku (zielony / biały), funkcja przycisku grupowego z roli (Zw, Zz, Pz, dPz, Sz);
  * **polecenia wprost** – `sim.execute({ type, … })`: `route` (`start`, `end`, `kind`, `compound?`), `stop`,
    `release` (`emergency?`), `substitute` (`justifiedAtChoice?` – ustawia tylko protokół polecenia dwuetapowego:
    uzasadnienie usterką z chwili wyboru SZI / menu MOR-3 / inicjowania polecenia specjalnego), `point`, `derailer`,
    `lock`, `block` – bez przycisków i bez uzbrojenia;
    polecenia stanowisk komputerowych: `close-section` (zamknięcie ruchowe toru ITS / ITO), `signal-stop`
    (stopowanie sygnalizatora SES / SEO), `all-stop` (SSS / SSO), `substitute-off` (SZO), `cancel-timed` (KZW),
    `axle-reset` (zerowanie licznika osi ZeroLO), `release` z `timed` (zwolnienie czasowe na żądanie – ZCZ);
    czynności dyżurnego poza urządzeniami i czas gry (polecenie specjalne ich nie blokuje): `comms` (telefonogram,
    rozmowa – `form`, `exit`, `nr`), `order` (rozkaz „S”), `to-shunting` / `to-train` / `reverse` (tryb jazdy pociągu –
    polecenie dla maszynisty), `pause` (`on`), `speed` (`value`). Panel boczny, pasek tempa i samouczek wydają je tylko
    tak – z ruchu i łączności widok tylko czyta (`tests/layers.test.js`); automat dyżurnego (model) woła ruch wprost.
    Zajętość odcinka (`occupied`) obejmuje usterki (`forced`, `axleFault` – `Interlocking.faultOccupied`), ale wjazd
    pociągu do przebiegu (`wasOccupied`) liczy się tylko z taboru (`physical`).
    Oba wejścia pilnują okręgu nastawczego gracza.
* Pulpit kostkowy używa tylko przycisków. Monitor wydaje polecenia wprost (Pz, dPz, Sz, Zw, Zz, STOP, blokada);
  przez protokół przycisków przechodzi u niego tylko wskazanie początku i końca przebiegu, bo wskazany początek
  (`armed`, 60 s) jest stanem, z którego korzystają ramka selekcji, pasek stanu i samouczek. Odwołanie wskazania:
  `sim.cancelSelection()`. `AutoOperator` woła `ilk.setRoute` i przyciski blokady – działa identycznie niezależnie
  od strategii.
* `Interlocking.press` / `pull` / `pressCompound` i `Interlocking.armed` to przekazanie do podłączonego protokołu
  (`attachInput`) – zostają dla zgodności testów i narzędzi.
* Stanowisko nie jest ustawieniem użytkownika – wynika z definicji stacji (`station.srk`) albo scenariusza
  (`scenario.srk`, misje). Parametr URL `?srk=E|komputerowe` służy tylko testom i porównaniom deweloperskim.

Dodanie nowego systemu (np. mechanicznego z pulpitem kluczowym, EbiScreen, ILTOR): wpis w `registry.js`
(parametry) + ewentualny nowy widok w `views.js` / `render/` + sposób wydawania poleceń (`sim.execute` albo własny
protokół obsługi w `src/srk/`, bez DOM); lista kroków jest w skillu `nowe-stanowisko` (`.claude/skills/`). Różnice w samych zależnościach (np. brak
liczników, inne zwalnianie) należy dodawać jako opcje `Interlocking` sterowane przez `model`, nie jako
osobne kopie logiki.

## Pulpit typu IZH-111 (`src/srk/address.js`, `src/render/IzhRenderer.js`)

Trzecie stanowisko – sprawdzian struktury: nowy protokół obsługi i nowy widok bez zmian w zależnościach poza
opcjami. Protokół trzyma wybór adresów (`selection`, najwyżej dwa) i wystawia pierwszy jako `armed`, więc pasek
stanu, samouczek i testy czytają to samo pole co przy typie E. Rozkaz działa na wyborze: „P” / „M” wołają
`requestCompoundRoute(start, koniec, rodzaj)`, „+” / „−” – `switchPoint(id, położenie)`, „STOP” i „Zw” ustawiają
zamknięcie w podany stan, „Zcz” i „Zw” znajdują przebieg po adresie jego końca (`Interlocking.routeEndingAt`).

Widok korzysta z części wspólnych pulpitów (`deskParts.js`) i własnej grafiki kostek sygnalizatorów (`izhArt.js`).
Pola przycisków grupowych typu E (Zw, Zz, Pz, dPz, Sz) zostawia puste – rozkazy są w grupie
nad planem (`.izh-orders`, element DOM jak pasek poleceń monitora, więc nie przycina go podział na ekrany).
Lampki są wygaszone w stanie zasadniczym; co świeci i kiedy – opis klasy `IzhRenderer`, źródła i założenia –
`docs/sources/pulpity.md`.

## Nastawnia mechaniczna (`src/render/LeverRenderer.js`, `src/render/leverFrame.js`)

Czwarte stanowisko – pierwsze, w którym zmienia się **kolejność obsługi**, a nie tylko sposób wydawania poleceń.
Różnice są opcjami `Interlocking` (domyślnie wyłączonymi): przebieg nie przestawia zwrotnic (`manualPoints`,
przeszkoda `point-position`; zwrotnica bez kontroli położenia – przeszkoda `point`, drążek nie zamyka przebiegu), sygnał podaje dźwignia (`manualSignal`: `clearSignal`, tylko raz na jazdę), przebieg
pociągowy wymaga bloku przebiegowego utwierdzającego (`routeBlock`: `blockRoute`, zwalnia go pociąg albo zwalniacz
z licznikiem jak dPz), a po przejeździe przebieg zostaje zamknięty do cofnięcia drążka (`holdRoute`). Semafory są
kształtowe (`shapedSignals`): obrazy Sr1 / Sr2 / Sr3 i M1 / M2 zamiast świetlnych, semafor ma `arms` (1 albo 2 – dwa,
gdy wychodzi z niego przebieg pociągowy ≤ 60 km/h), wjazdowy – `warning` (tarcza ostrzegawcza Od / Ot). Prędkość
i znaczenie obrazu dają statyczne `Interlocking.aspectSpeed`, `isProceed`, `isStop`, `isShuntProceed`,
`warningAspect` – model i widoki nie porównują nazw obrazów wprost; obraz dla przebiegu podaje `shapedAspect(route)`.
Polecenia idą przez `Simulation.execute`: `point` / `derailer` z położeniem, `route` z `id` (drążek wskazuje konkretny
przebieg), `route-half` (drążek w położeniu pośrednim – `Interlocking.halfRoute`: zamyka zwrotnice i wykolejnice drogi
przebiegu bez sprawdzania zajętości i blokady, bez sygnału i bez bloku; stan w `ilk.half`, zwrotnice widzą go przez
`pointLockedByRoute`), `route-block`, `clear` (z `aspect` – dźwignia Sr2 albo Sr3 semafora rozprzężonego; zła
dźwignia dostaje odmowę), `stop`, `release` (cofa też drążek z położenia pośredniego). Automat dyżurnego
(`Operator.js`) umie tę kolejność.

`leverFrame(ilk)` (bez DOM, test w Node) numeruje dźwignie (zwrotnicowe, wykolejnicowe, semaforowe, tarcz) i dzieli
przebiegi na drążki: drążek należy do sygnalizatora i rodzaju przebiegu, najwyżej dwa przebiegi (w górę i w dół).
Semafor, z którego wychodzą przebiegi na Sr2 i na Sr3, dostaje dwie dźwignie (`id` A¹ / A², pola `signal`, `aspect`);
`signalLevers` podaje dźwignie sygnalizatora – pierwszą tę, której wymaga przebieg (dla samouczka). `leverStates`
mówi, jak narysować stan (drążek: `pos` i `half`). Widok rysuje plan świetlny częściami pulpitów (`deskParts.js`, grafika
`leverArt.js` – kostki bez przycisków, zostają przyciski blokady; zamiast lampek sygnałów rysunek semafora
kształtowego z ramionami, tarczą manewrową i ostrzegawczą) i ławę pod planem (`static size` dodaje jej wysokość).
Położenia ramion, tarcz, dźwigni i drążków to transformacje CSS (`style.transform`), więc zmianę stanu animuje
`transition` w `styles.css` (wyłączana przy `prefers-reduced-motion`). Zwrotnica na planie: przygaszone żółte ramię,
w które jest ustawiona, i przerwa w szczelinie drugiego. `elementFor` dla semafora, zwrotnicy i wykolejnicy zwraca dźwignię. Źródła i założenia – `docs/sources/pulpity.md`.

## Monitor stanowiska komputerowego (`src/render/ScreenBase.js`, `src/render/ScreenRenderer.js`)

Co można zrobić ze wskazanym elementem, mówi `src/srk/monitor.js` (bez DOM, testy w Node – `tests/monitor-menu.test.js`):
`monitorMenu(sim, ref)` zwraca menu jako dane – pozycja z poleceniem wprost (`cmd` → `Simulation.execute`), z poleceniem
specjalnym (`special`, `target` – potwierdzenie WYKONAJ), z początkiem przebiegu (`route`, `signal` – koniec wskazuje
gracz) albo separator i pociągi toru szlakowego (`lineTrains`); `MODE_KINDS` – których elementów dotyczy polecenie
z paska. `ScreenRenderer` rysuje menu i wykonuje wybraną pozycję (`#act`) – tak jak MOR-3 (`mor.js`) i EBILock
(`ebilock.js`) mają reguły obsługi w `src/srk/`, a widok tylko obraz.

Nazwy poleceń zależą od stanowiska: opcja zależności `emergencyReleaseName` (dPz, ZDP, PZA, zwalniacz; null – brak
doraźnego zwolnienia) w odmowach i dzienniku; `static PLAN_COUNTERS = false` widoku – bez liczników na planie (MOR-1).

Polecenie specjalne (Ie-104.1 §11): `src/srk/special.js` (bez DOM, czas symulacji) – `Simulation.initiateSpecial`,
`confirmSpecial` (po `SPECIAL_DELAY` s), `cancelSpecial`; po `SPECIAL_TIMEOUT` s odwołanie samoczynne; w trakcie
`execute` / `press` / `pull` odmawiają. Zdarzenie `special` (stan co krok) – `ScreenRenderer` pokazuje pasek z odliczaniem,
tło `special-bg` elementu i `special-sz` obrazu. Test: `tests/special.test.js`.

Obraz monitora rysuje `ScreenBase` (rozszerza `PanelView`); stanowiska komputerowe różnią się tylko obsługą
i dziedziczą po nim (`ScreenRenderer` – pasek poleceń i menu elementu, `EbiRenderer` – linia poleceń EBILock 950, `MorRenderer` – menu
obiektów MOR-3). Pola dotyku torów (tor jako obiekt poleceń) daje `ScreenBase.addSectionHits()`. Kontrakt widoków (`tests/views.test.js`)
czyta widok razem z jego bazą. Zobrazowanie wg Ie-104 (kolory odcinków, stany sygnalizatorów, pole „Z” zwrotnicy, ramki selekcji i alarmu).
Uproszczenia dla czytelności: semafory i tarcze rysowane na linii toru w miejscu ustawienia (grot w kierunku jazdy,
bez masztu, nazwa po prawej stronie toru w kierunku jazdy), numery torów w ramkach „tor N” na linii (opisy kostek
`label` w formie „tor N · …” są skracane – `ScreenBase.labelText`), perony jako szare prostokąty z nazwą
(`platform: 'Peron II'`, numeracja rzymska), stan blokady przy wyjeździe na szlak. Polecenia w formie rzeczownikowej
(„Nastawienie przebiegu pociągowego od A”, „Zwolnienie przebiegu (Pz)”, „Danie pozwolenia na wyprawienie pociągu
(Poz)”) – jedno słownictwo z samouczkiem, słownikiem i dziennikiem. Symbole skalowane ustawieniem `symScale`
(domyślnie 1,25), rzędy ściskane `rowScale`.

## Ekrany pulpitu

Szeroka stacja (100+ kolumn) na tablecie jest nieczytelna w całości. `planScreens(station, okno, maxKolumn)` dzieli
pulpit na ekrany programowaniem dynamicznym: koszt cięcia = elementy głowicy w sąsiednich kolumnach, kara za ekran
szerszy niż limit lub węższy niż połowa limitu, koszt każdego dodatkowego ekranu; liczba ekranów wybierana spośród
n₀−1, n₀, n₀+1. Renderer ma jedną instancję – ekran to tylko zmiana `viewBox` (`setView`), więc polecenie zaczęte na
jednym ekranie kończy się na drugim. Przełączanie: zakładki ekranów w grupie „widok” listwy narzędzi (obok
powiększenia), strzałki ← →, przesunięcie palcem.

Panel boczny ma zakładki: Rozkład, Dziennik, Zadania (tylko gdy scenariusz ma zadania manewrowe – karty z terminem,
składem, torem docelowym i stanem: do wykonania / czeka na porę lub poprzednie zadanie / wykonane / niewykonane;
powiadomienie na karcie po zdarzeniu `tasks`), Pociągi (każdy pociąg na posterunku: jedzie / stoi i dlaczego – semafor,
peron, koniec toru, postój do odjazdu, zakończył bieg; po godzinie odjazdu albo przed sygnalizatorem przyczyna postoju
z `Traffic.waitReason` – kod bez tekstu, tekst `sp.wait.*`: sygnalizator uszkodzony / zastopowany, brak przebiegu albo
w nastawianiu, odmowa blokady szlaku (`gate(…).code`: zapytanie telefoniczne, Sz po „droga wolna”, Pwl, brak pozwolenia,
blok początkowy, szlak zajęty, tor wjazdowy, kierunek SBL), inna przyczyna „Stój” – `tests/waitReason.test.js`; tor, czoło, tryb – ikony z `src/ui/icons.js`: czoło pojazdu z lampami
(Pc1: trzy światła = jazda pociągowa, jedno = manewrowa) i sylwetka lokomotywy zwrócona w stronę jazdy; po zatrzymaniu przyciski jazda manewrowa /
pociągowa i zmiana czoła – dawniej sekcja „Manewry” w Stanie; w czasie zmiany czoła bez przycisków, przyczyna `cab-change`
z sekundami do końca), Stan, Rozkazy, Łączność, Polecenia (tylko stacje z okręgami – obecnie żadna w grze, mechanizm testowany na
`tests/fixtures/gdynia-glowna-okregi.js`).

Strona nie przewija się i nie odświeża gestem (tablet): `html, body { overflow: hidden; overscroll-behavior: none }`
oraz `src/ui/noBounce.js` – `touchmove` jednym palcem dostaje `preventDefault`, chyba że któryś przodek celu może się
jeszcze przewinąć w tym kierunku (`scrollAllowed`, testowane w Node); pola formularzy i szczypnięcie zostają natywne.

Listwa narzędzi (`#desk-tools`): na początku zakładki panelu bocznego (`SidePanel` renderuje je w `tabsHost`,
w samym panelu zakładek nie ma – liczniki powiadomień i miganie są w listwie; aktywna karta schodzi do panelu pod
listwą), potem szara grupa „widok” (ekrany + zoom), po prawej podpowiedź i przycisk schowaj/pokaż panel.

## Stałe pola skrajne (`src/render/edges.js`, `src/ui/EdgePanels.js`)

Szerokość pola: `EDGE_COLS` (4 kolumny, `src/tiles/platforms.js` – ta sama liczba odsuwa peron na odcinku zbliżania od
wyjazdu, żeby nie leżał pod strzałkami blokady i opisem szlaku ani nie został w połowie przypięty przy krawędzi).

Gdy powiększony pulpit nie mieści się na szerokość okna, skrajne kolumny z blokadą liniową (strzałki szlaku, na pulpicie
kostkowym także Ko/Poz/Wbl i liczniki) są przypięte do lewej i prawej krawędzi okna, a środek przewija się między nimi
za linią przerywaną – jak stałe pola z blokadą przy krawędziach monitorów w komputerowych srk. Pola to dwa małe SVG
w nakładce (`.edge-overlay`, position: absolute dokładnie nad widocznym obszarem przewijania – nie `sticky`, które
w Safari zostawia szparę na padding) z `<use>` wskazującym grupę `inner` aktywnego pulpitu (żywa kopia, bez drugiego
renderowania) i viewBoxem skrajnych kolumn, `preserveAspectRatio: none` i szerokością liczoną bez zaokrągleń, więc skala
pola = skala pulpitu, a wysokość i położenie w pionie biorą się z prostokąta pulpitu (sync przy przewijaniu) – rzędy
pokrywają się co do piksela; przy aktywnych polach obszar przewijania nie ma poziomego paddingu, więc przy skrajnych
przewinięciach pole zlewa się z pulpitem pod nim. Geometrię liczy `edgeLayout` bez DOM (aktywne tylko przy przepełnieniu
i gdy oba pola zajmują ≤ 60 % okna). Dotknięcia na polu trafiają do właściwego elementu pulpitu: punkt pola przelicza się na jednostki
rysunku, szuka się przycisku (`.btn`) lub punktu dotyku (`.hit`) pod nim i wysyła mu ten sam `pointerdown` /
`pointerup`, więc blokadę obsługuje się z pola. `main.js` woła `edges.attach(renderer)` przy zmianie pulpitu/ekranu
i `edges.update()` po każdej zmianie powiększenia. Opcja menu `edgePanels`, domyślnie włączona.

Przyciski dopasowania (↔ szerokość, ↕ wysokość) są stanowe: wciśnięta oś dopasowuje plan na żywo przy każdej zmianie
obszaru (okno, przeciągnięta granica panelu, zwinięcie panelu – `ResizeObserver` na obszarze przewijania), obie = całość
(stan na starcie), żadna = powiększenie ręczne; „+”, „−”, szczypnięcie i Ctrl + kółko zwalniają obie. Granicę planu
i panelu przeciąga się krawędzią panelu (kursor ↕ / ↔) albo uchwytem w listwie obok przycisku panelu (palec); rozmiar
jest w ustawieniach `sideSize` (panel na dole, ułamek wysokości) i `sideWidth` (z boku, px). Zakładki panelu stoją przy panelu na
dole w listwie narzędzi, a przy panelu z boku – w pionowym pasku `#side-rail` na granicy planu i panelu (`placeTabs`
w `main.js`, woła go `SideResizer` po ustaleniu, gdzie faktycznie jest panel); listwa narzędzi zostaje na dole.
