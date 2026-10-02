# Architektura

```
src/
  core/        EventBus (zdarzenia), Clock (czas symulacji), Random (ziarno, poziomy zakłóceń)
  data/        glossary (słownik skrótów Ie-1 / Ir-1 – dymki samouczka, instrukcja, podpowiedzi przycisków)
  tiles/       directions (porty), registry (rejestr typów kostek + schemat pól), controls (pola przycisków
               grupowych stanowiska – miejsce na pulpicie, bez DOM), repeater (lampki powtarzacza sygnalizatora
               na pulpicie typu E dla obrazu sygnału)
  model/       categories (kategorie pociągów: prędkość, dynamika kategorii – przyspieszenie przeliczone na masę składu, gdy pociąg nie ma taboru, etykieta; rodzaje pociągów towarowych z zał. 6.3 Regulaminu sieci), rollingStock (katalog taboru, dobór zespołu / lokomotywy dla pociągu i dynamika z taboru – przyspieszenie, hamowanie, prędkość pojazdu), normalize (podział łącznic na odcinek na zwrotnicę, bez DOM), Topology (graf toru z kostek; `branchGates` – kostki odcinka zwrotnicowego za ramieniem zwrotnicy), Interlocking (zależności; `onSetBranch` – czy kostka jest na drodze ustawionej zwrotnicami, widoki świecą tylko ją), Block (blokada Eap / jednokierunkowa /
               samoczynna SBL + AI sąsiada + zapowiadanie telefoniczne), Train (ruch pociągu, manewry, rozkazy; szybkość z obrazu do końca okręgu zwrotnicowego, rozjazd pod całym pociągiem),
               Traffic (rozkład, ruch, zadania manewrowe), Faults (usterki), Comms (łączność), Score (ocena),
               Operator (automat dyżurnego / nastawni), Simulation (spięcie, scenariusze), validate (walidacja stacji),
               scenarioCheck (statyczne sprawdzenie scenariusza – automat sprawdzający scenariusze),
               trainPaths (drogi pociągu po przebiegach, odcinek zbliżania szlaku, tor składu);
               check/ – zmiana grana automatem bez widoku (play: `playShift`, `settled`), niezmienniki bezpieczeństwa
               (invariants), wynik po stronie urządzeń i oceny (outcome: `leftovers`, `unjustified`) – dla automatu
               sprawdzającego, przeglądu silnika, skilla diagnoza-zatoru i testów;
               timetable/ – wpis rozkładu zmiany jako jedna funkcja (vertical slice): entry (budowa wpisu – definicja
               tylko do odczytu, plan, przebieg zmiany; godziny do pokazania `shownTime`), phase (etap pociągu – kod,
               szczegół, napis dla człowieka; „obsłużony” i „skończony”)
  srk/         registry (strategie systemów srk: parametry zależności, rodzaj stanowiska – bez DOM),
               buttons (protokół przycisków typu E: uzbrojenie, obsługa dwuprzyciskowa → polecenia zależnościowe – bez DOM),
               address (protokół IZH-111: przyciski adresowe + rozkazy → polecenia zależnościowe – bez DOM),
               views (fabryki widoków stanowisk, podpowiedzi, instrukcja – warstwa UI)
  render/      PanelView (wspólna baza i kontrakt widoków stanowisk),
               DeskRenderer (SVG pulpitu kostkowego typu E), IzhRenderer (pulpit ciemny IZH-111), LeverRenderer
               (nastawnia mechaniczna: plan świetlny i ława dźwigniowa), leverFrame (dźwignie i drążki ławy, bez DOM), ScreenBase
               (wspólny obraz monitorów wg Ie-104), ScreenRenderer (monitor: pasek poleceń i menu elementu), EbiRenderer
               (EBILock 950 / EBIScreen: linia poleceń, okno zdarzeń i alarmów), MorRenderer (MOR-3 / MOR-1: menu obiektów,
               okno komunikatów i alarmów), confirmBar (pasek potwierdzenia polecenia), deskParts (części wspólne pulpitów kostkowych: rama,
               kostki z planu, perony, blokada, przyciski pod palcem), tileArt / izhArt (grafika kostek),
               refKey (klucz elementu obsługi, wspólny dla widoków), screens (podział szerokiego pulpitu na ekrany),
               platforms (geometria peronów, bez DOM), blockLayout (kostki blokady liniowej, bez DOM),
               edges (geometria stałych pól skrajnych, bez DOM), zoom (rachunki powiększenia, bez DOM), thumbnail (miniatury planów – SVG jako tekst, bez DOM),
               tileArt (grafika kostek), svg (helpery)
  tutorial/    missions (kroki misji, bez DOM), progress (silnik misji, bez DOM), placement (miejsce dymka, bez DOM),
               Tutorial (dymki, podświetlenie, słownik)
  ui/          SidePanel (rozkład, dziennik, stan, rozkazy, łączność, polecenia), Help (instrukcja + słownik),
               dialog (wspólne zachowanie okien pełnoekranowych), DeskViewport (powiększenie i dopasowanie pulpitu;
               przyciski dopasowania stanowe – osie w `zoom.js`: `fitAxes`, `nextFitMode`), SideResizer (przeciąganie
               granicy planu i panelu tylko za uchwyt w listwie – krawędź panelu nie jest uchwytem; rachunki `sideSize.js`, bez DOM),
               Settings (ustawienia, motyw wg systemu), settingsSchema (opis ustawień, bez DOM), SettingsScreen,
               StartScreen (misje i posterunki, odprawa), Report, EdgePanels (stałe pola skrajne), brand (logo, skala
               trudności), icons, dom (helpery), drag (przeciąganie okienek), noBounce (blokada przesuwania strony)
  i18n/        index (t, setLang, applyDom), pl / en / de (słowniki interfejsu)
  stations/    definicje stacji + rejestr (stacje treningowe misji: Szkolna, Jodłowa, Zacisze, Olszyny; Sopot, Gdynia Orłowo, Chylonia, Główna, Rumia, Reda, Tczew, Pruszcz Gdański, Gdańsk Główny)
tests/         node --test (logika bez przeglądarki) + tests/e2e (Playwright, wzorce zrzutów)
scripts/       narzędzia (npm run check / survey / seed-scan, dane mapy i pociągów z nazwami); lib/ – ich logika bez wyjścia
docs/          format stacji, architektura, źródła, zrzuty ekranu do README
```

## Zasady

* **Model nie zna DOM.** `Simulation` działa w Node (testy) i w przeglądarce. Renderer i panel boczny
  subskrybują zdarzenia (`section`, `point`, `signal`, `route`, `block`, `log`, `tick`, `armed`, `alarm`).
  Granic warstw pilnuje `tests/layers.test.js`: logika (`model`, `core`, `tiles`, `srk` poza `views.js`) importuje
  tylko logikę i nie używa obiektów przeglądarki; widoki stanowisk nie importują się nawzajem.
* **Zależności nie znają stanowiska.** `Interlocking` przyjmuje polecenia zależnościowe (przebieg z jawnym rodzajem,
  zwolnienie, „Stój”, zwrotnica, zamknięcie, Sz). Przyciski, kolory i uzbrojenie to sprawa protokołu obsługi
  (`src/srk/buttons.js`); widok nie zmienia stanu modelu wprost.
* **Wpis rozkładu ma trzy części o różnych właścicielach** (`src/model/timetable/entry.js`, `createEntry`): definicja
  pociągu z rozkładu stacji albo scenariusza – tylko do odczytu (przypisanie to TypeError; zapis z danych, także godziny
  po północy, w `e.source`; jedyny wyjątek: `e.stop` jest fałszem po przejściu składu w manewry – `stopCancelled`), plan
  (`arrTime`, `depTime`, `neighbourDep`, `requestAt`, `rollingStock`, `extra`) i przebieg zmiany (etap, skład, rzeczywiste
  godziny i tor, opóźnienia, flagi rozmów). Plan i przebieg zmienia tylko `Traffic` – zapis gdzie indziej w źródłach
  i skryptach wykrywa `tests/layers.test.js`. Czytelnicy czytają wpis jak zwykły obiekt. Inny pociąg w teście albo
  scenariuszu – w jego rozkładzie (`scenario.timetable`), nie przez nadpisanie wpisu.
* **Etap pociągu to dane, napis tylko do pokazania.** Wpis rozkładu ma kod etapu (`e.phase`: `expected`, `on-line`,
  `running`, `held` + `heldAt`, `dwell`, `departed`, `at-neighbour`, `ended`, `handed-over` + `handedTo`…) i napis
  po polsku (`e.status`), który powstaje z kodu w `src/model/timetable/phase.js` (`setPhase`, jedyna droga zmiany
  etapu – używa jej tylko `Traffic`). Decyzje gry, automatu i narzędzi – na kodzie: `isHandled(e)` (pociąg obsłużony,
  także wyprawiony w drodze do sąsiada – koniec zmiany, ocena), `isFinished(e)` (skończony do końca – zator
  w automacie sprawdzającym, przegląd, testy pełnych zmian). Porównywanie napisu w źródłach i skryptach wykrywa
  `tests/layers.test.js`. Testy mogą sprawdzać napis – jest taki sam jak dotąd.
* **Nowa funkcja w logice – podkatalog katalogu logiki** (np. `src/model/timetable/`), żeby granice warstw dalej ją
  sprawdzały; każdy katalog w `src/` ma rolę (logika, widok, dane) w `tests/layers.test.js` – nowy katalog bez roli
  to błąd testu.
* **O stan przebiegu pyta się zależności.** Zapis nastawionego przebiegu (`Interlocking.active`, `pending` i ich pola)
  to implementacja zależności. Inne moduły pytają: `routeState(id)` – jedno słowo na całe życie przebiegu
  (`none`, `setting`, `waiting`, `signal-off`, `releasing`, `entered`, `stuck` – gdy pasuje kilka, wygrywa dalszy na liście),
  `Interlocking.routeAhead(stan)` – przebieg przed pociągiem (utwierdzony, pociąg jeszcze nie wjechał), `routesSet()`
  – lista nastawionych i nastawianych `{ id, route, state, faultDrop }`, `routeFrom(sygnalizator)` i `routeInfo(id)` –
  ten sam opis dla jednego przebiegu, `Interlocking.routeLocked(stan)` – utwierdzony, `routeFaultDrop(id)` – sygnał
  zgasł z usterki urządzeń (ocena Sz / rozkazu), `routeFrame(id)` – części nastawni mechanicznej (dźwignia, blok
  przebiegowy). Znaczenie stanów: `GLOSSARY.md` („Przebieg i jego stany”), testy: `tests/route-state.test.js`.
  Pilnuje tego `tests/layers.test.js`: poza `Interlocking.js` żaden plik źródeł, skryptów ani skryptów skilli nie czyta
  `ilk.active`, `ilk.pending` ani pól zapisu przebiegu. Spójność samego zapisu (odcinek najwyżej w jednym przebiegu)
  sprawdzają zależności: `lockConflicts()` – korzysta z tego niezmiennik bezpieczeństwa. Wyjątek świadomy: testy samych
  zależności i pomocnik testów usterek (`tests/fault-harness.js` – postęp pociągu w przebiegu).
* **Stacja opisuje tor, stanowisko – swoje przyciski.** Definicja stacji nie zawiera przycisków grupowych pulpitu.
  Ich pola podaje `src/tiles/controls.js` (`deskControls(station)`: miejsce domyślne albo wskazówka
  `desk.controls`), a rysuje je widok stanowiska – tak samo jak kostki blokady liniowej (`blockLayout.js`).
* **Kostki są danymi.** Typ kostki = wpis w rejestrze (`registerTile`): porty, wyjścia, schemat pól.
  Renderer dobiera grafikę po `type`. Edytor będzie iterował `listTileDefs()`.
* **Tablica zależności z topologii.** Autor stacji nie wpisuje przebiegów ręcznie – wystarczą kostki,
  sygnalizatory i odcinki. Nadpisania przez `routes.override`.
* **Ruch po rzeczywistym torze.** Pociąg jedzie po kostkach zgodnie z bieżącym położeniem zwrotnic
  (nie po „ścieżce przebiegu”), więc jazda na Sz, rozprucie, manewry działają naturalnie.
* **Stan serializowalny.** `Simulation.snapshot()` – podstawa pod zapis gry i tryb sieciowy
  (serwer autorytatywny + klienci-renderery).

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
    `axle-reset` (zerowanie licznika osi ZeroLO), `release` z `timed` (zwolnienie czasowe na żądanie – ZCZ).
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
`docs/SOURCES.md`.

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
w które jest ustawiona, i przerwa w szczelinie drugiego. `elementFor` dla semafora, zwrotnicy i wykolejnicy zwraca dźwignię. Źródła i założenia – `docs/SOURCES.md`.

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

## Monitor stanowiska komputerowego (`src/render/ScreenBase.js`, `src/render/ScreenRenderer.js`)

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

## Ekran ustawień (`src/ui/settingsSchema.js`, `src/ui/SettingsScreen.js`)

Menu ≡ ma tylko akcje (Nowa zmiana…, Ustawienia…, Raport zmiany, Instrukcja obsługi). Ustawienia to osobny pełny ekran
w motywie ekranu startowego: kategorie po lewej w kolejności grup (Ogólne: Język; Widok: Pulpit, Monitor, Panel boczny; Wygląd: Motyw), po prawej
każda kategoria jako osobna karta: nagłówek (etykieta grupy › tytuł), opis, opcje oddzielone linią z tytułem, opisem
działania i wyborami (radia przy ≤ 4 stałych wyborach, lista rozwijana gdy zbiór może rosnąć – języki, suwak dla skali);
opcje przeładowujące widok mają znacznik. Treść opisuje
`settingsCategories()` (bez DOM, funkcja – teksty z `t()` zależą od języka; test pilnuje, że każdy klucz `DEFAULTS` jest
opisany raz i wartość domyślna jest wśród wyborów), a `SettingsScreen` buduje z niego DOM i podpina kontrolki przez `Settings.bindMenu` – zmiana działa od razu
i zapisuje się jak dotąd. Pasek „widok”: „dopasuj” dopasowuje do szerokości okna, „wysokość” (tylko przy włączonych
stałych polach skrajnych) wypełnia okno w pionie i ustawia środek pulpitu.

## Stałe pola skrajne (`src/render/edges.js`, `src/ui/EdgePanels.js`)

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

## Ekran startowy (`src/ui/StartScreen.js`)

Wybór jak w grze – kilka ekranów z własnym adresem w części „#” (`catalog.parseRoute` / `routeHash`; stan ekranu wynika
tylko z adresu, więc przycisk „wstecz” przeglądarki i odświeżenie działają, a link prowadzi do konkretnej stacji):
* `#/` tytuł – kafelki: ostatnia zmiana (uruchamia ją ponownie), Służba, Szkolenie (licznik ukończonych misji),
  Ustawienia (ten sam ekran ustawień co w menu – leży nad ekranem startowym);
* `#/szkolenie[/n]` – misje wprowadzające (scenariusze z `tutorial`, `missionList`) jako przystanki na torze, semafor
  i odprawa misji: opis, stacja, liczba kroków i start (szkolenie to tylko misje – bez wyboru zmiany i zakłóceń; pełne
  zmiany stacji szkoleniowych są dostępne tylko z adresu `?stacja=…&scenariusz=…`);
* `#/sluzba` – mapa Polski przybliżana jak mapa w przeglądarce (`src/ui/map/MapView.js`, rysunek `mapSvg.boardSvg`,
  dane i źródła – `docs/MAP-DATA.md`): kółko myszy, szczypanie, przeciąganie, dwa palce, przyciski + / − / cała Polska;
  z daleka województwa z liczbą pasujących posterunków (klik – przybliżenie) i sieć kolejowa, bliżej tory linii
  posterunków i lampki, najbliżej tablice z nazwami; obok – województwa albo, przy wyszukiwaniu i filtrach,
  pasujące posterunki; `#/sluzba/lista` – posterunki do służby (`dutyStations` – bez stacji szkoleniowych; jedno miejsce
  raz, edycje są zakładkami). Oba widoki mają wyszukiwarkę („/” przenosi do pola, Enter otwiera pierwszy wynik) i filtry:
  stanowisko (lista wszystkich rodzajów z rejestru z liczbą posterunków), trudność (zawsze 1–5), era i województwo (gdy
  są co najmniej dwie wartości), „tylko niegrane”; lista – kolejność A–Z / wg trudności (zapamiętana w localStorage);
* `#/sluzba/<województwo>` – ta sama mapa przybliżona do posterunków województwa (tablica dyspozytorska: rzeczywisty
  przebieg linii z OpenStreetMap, posterunki jako lampki – żółta niegrany, zielona grany – z tablicami stacyjnymi, numery
  linii przy torze, karta posterunku po najechaniu / fokusie); pod spodem karty posterunków województwa;
* `#/stacja/<id>` – strona stacji: tablica z nazwą, trudność (pięć lampek, `difficultyMark` w `src/ui/brand.js`),
  zakładki ery (`eraTabs`, gdy miejsce ma kilka edycji), miniatura planu, opis i urządzenia, najlepszy wynik, wybór
  zmiany (okręg tylko dla stacji z `districts`, scenariusz, zakłócenia; ziarno w „Zaawansowane”) i start.
Nagłówek ma okruszki (Start › Służba › województwo › stacja) i „‹ Wstecz” (`catalog.parentRoute`); Esc bez trwającej
zmiany – piętro wyżej. Przy wejściu do gry (bez `scenariusz` w adresie) otwiera się tytuł; „Nowa zmiana…” w trakcie
zmiany (menu, raport) – ostatnio oglądany ekran wyboru (mapa w tym samym przybliżeniu, lista, województwo, szkolenie;
`localStorage`), a bez zapisu – lista posterunków. Ekran wczytywania (`#boot` w `index.html`, semafor ze światłami
zapalanymi po kolei, napis wg języka z ustawień) jest od pierwszej klatki; `main.js` zdejmuje go po zbudowaniu pulpitu
i wczytaniu czcionki, nie wcześniej niż 1 s od początku wczytywania (`BOOT_MIN_MS` – bez mignięcia; przy błędzie skryptu
znika sam) – bez pustego układu przed pulpitem. Wejście bez zmiany w adresie: skrypt w `index.html` dodaje klasę
`boot-start` (pulpit ukryty od pierwszej klatki, tło ekranu startowego), `main.js` zdejmuje ją po otwarciu ekranu – bez
mignięcia pulpitu przed tytułem. Ustawienia otwarte z tytułu mają „Wróć do menu”, z menu zmiany – „Wróć do zmiany”. Otwarcie ekranu zdejmuje parametry zmiany z adresu (odświeżenie
zostaje na wyborze), „Wróć do zmiany” je przywraca; start zmiany ładuje adres `?stacja=…` bez części „#”.
Ekran startowy leży nad dymkami samouczka i menu (z-index). Karty i odprawa mają miniatury planów z
`src/render/thumbnail.js` (SVG jako tekst z definicji kostek, bez DOM).
Wygląd ze świata nastawni: misje stoją na torze jak przystanki linii szkoleniowej (numer to znacznik przystanku, wybrana
misja go zapala, ukończona ma zieloną obwódkę i znacznik); semafor między misjami a odprawą (`signalSvg` z `brand.js`)
pokazuje „Stój”, a po wyborze misji „wolna droga” (samo CSS, `:has(.st-briefing.open)`); pusta odprawa ma ten sam
semafor; nazwa w odprawie to tablica stacyjna (granatowa emalia, `--sc-plate`), a przycisk startu świeci zielenią
sygnału zezwalającego (`--sc-go`); najlepsza ocena to mała pieczątka na karcie i stronie stacji.
Postęp gracza (`src/ui/progress.js`, localStorage): `main.js` przy `shift-end` zapisuje najlepszy wynik zmiany
(`catalog.recordResult`, misja – ukończona), a przy starcie zmiany – adres ostatniej zmiany. Funkcje sortowania, listy
misji, zakładek ery i miniatur są bez DOM – testowane w Node.
Katalog posterunków (`src/ui/catalog.js`, bez DOM, `tests/catalog.test.js`): posterunki do służby i szkoleniowe,
miejsca i edycje (`place`, `era` – zakładki ery), wyszukiwanie bez polskich znaków (nazwa, położenie, linie, województwo,
rok, urządzenia; nazwa pasująca w całości pierwsza), filtry (stanowisko, trudność, era, województwo, niegrane), adresy
ekranów wyboru (`parseRoute` / `routeHash`), schemat regionu (kolejne posterunki linii – `regionLayout`) i postęp gracza
(najlepsza ocena zmiany, ukończone misje). Województwa i granice Polski do walidacji `region` / `geo`:
`src/model/regions.js`.

## Służba o wybranej porze (`src/model/duty.js`)

Na posterunkach do służby zwykłe zmiany („Pełna zmiana”, „Szczyt”) zastępuje służba: gracz wybiera pełną godzinę startu
(0–23) i długość (30 min, 1, 2, 3 h – `DUTY_MINUTES`; służba może przejść przez północ). `buildDuty(station,
{ start, minutes, seed })` zwraca scenariusz – obiekt dla `Simulation` (`id` `sluzba-<minuty>`, nazwa z godzinami,
`startTime`, `endTime`, własne `timetable` i `tasks`) – oraz `stats` (pora doby, liczba pociągów wg klasy). Moduł nie
zna żadnej stacji: wzorcem jest `station.timetable`, więc **nowy posterunek ma służbę bez dodatkowych danych**
(opcjonalnie `duty.period`).

Budowa: (1) powtórzenia wzorca co `patternPeriod` sięgające okna; pociąg jedzie razem ze swoją grupą – pociągami ze
składu (`unit`) i zadaniami manewrowymi (terminy, numery i godziny w treści przesunięte); (2) pora doby (`DAY_BANDS`,
`bandOf`) i klasa pociągu (`trainClass`: aglomeracyjny / regionalny / dalekobieżny / towarowy) mówią, co który kurs
linii jedzie, a ziarno – który (faza) i co wypada (`DUTY_SKIP`); (3) w miejsce niekursujących pociągów regionalnych
i dalekobieżnych wchodzą pociągi towarowe (udział `freight` pory; odstęp `FREIGHT_GAP` na szlaku); (4) **kontrola
definicji** (`checkScenario`) na zbudowanym scenariuszu: pociąg z błędem albo z uwagą, jakiej nie ma wzorzec stacji
(styk powtórzeń, konflikt toru albo szlaku), wypada. Kto wypada: przy uwadze o konflikcie dwóch pociągów (`tt-track-overlap`,
`line-*`) – pociąg towarowy spoza wzorca na tej samej drodze (ten sam wjazd, wyjazd albo tor, do 20 min obok), a gdy
takiego nie ma i przy każdej innej uwadze – pociąg, którego uwaga dotyczy; inne pociągi przez nią nie wypadają. Losowość
tylko z `mixSeed` (bez generatora zmiany – zakłócenia zmiany się nie przesuwają). Liczby i pory – przyjęte
(`docs/SOURCES.md`).

Brzegi okna (`DUTY_EDGE`): pociąg od sąsiada wchodzi do służby, gdy sąsiad wyprawia go co najmniej 2 min po starcie –
pierwsze zdarzenie nie wcześniej niż start + czas przejazdu szlaku z prędkością pociągu + 90 s dojazdu do peronu + 2 min
(`leadOf`; wolniejszy pociąg towarowy – odpowiednio później); pociąg bez wjazdu (stoi od początku, powstaje ze składu)
– 3 min po starcie. Ostatnie zdarzenie najpóźniej 10 min (służba 30-minutowa: 6 min) przed końcem.

Służba bez pociągów: gdy po kontroli rozkład jest pusty (krótkie okno, środek nocy), po kolei – każdy krok z kontrolą
definicji – wracają pociągi, które wypadły dla urozmaicenia (`DUTY_SKIP`), potem pociąg towarowy wchodzi w każde wolne
miejsce (bez losowania udziału), na koniec pojedynczo pociągi wzorca innego kursu linii, której klasa o tej porze
kursuje. Pociąg klasy, która o tej porze nie kursuje (np. SKM o 02:00), nie wraca. Na posterunkach w grze żadna służba
nie jest pusta (`tests/duty-grid.js`); stacja z bardzo rzadkim wzorcem może dać pusty rozkład (bez wyjątku) – strona
posterunku takiej służby nie startuje.

Pociągi z nazwami: powtórzenie pociągu dalekobieżnego dostaje nazwę i relację pociągu z listy `src/model/data/namedTrains.js`
(plik generowany przez `scripts/named-trains.mjs` z rozkładu rocznego PKP Intercity, cała Polska), który jedzie tą samą
drogą – `src/model/namedTrains.js`: `namedTrainsVia(od, do)` (przez miasto początku, potem końca relacji; `cityOf`),
`namedTrainTitle`. Dobór w `buildDuty`: indeks z numeru wzorca i numeru powtórzenia (ta sama nazwa na każdej stacji na
trasie), nazwa nie wraca w jednej służbie w tym samym kierunku; pociąg kończący / zaczynający bieg na stacji – tylko
pociąg z listy kończący / zaczynający w tym mieście; EIP (zespół trakcyjny) zastępuje tylko EIP, pociągi wagonowe (EIC,
IC, TLK) – siebie nawzajem: mają wspólną pulę taboru, długość wpisu zostaje z wzorca, a prędkość idzie za nową
kategorią (TLK 140, IC / EIC 160 km/h), o ile wpis nie ma własnego `vmax`. Moduły nie znają stacji – nowa stacja gdziekolwiek w Polsce
korzysta z listy od razu, o ile relacje jej pociągów dalekobieżnych mają nazwy miast jak na liście.

Przez północ: w danych zmiany godziny następnej doby to 24, 25… (`Clock.stamp` – zapis bez zawijania; `Clock.parse`
czyta „25:10” jako ciąg dalszy zmiany; `endTime` „26:00” = 02:00). Symulacja liczy chwile bez zawijania, a do pokazania
służy `Clock.format` (zawija dobę) i `shownTime` (`src/model/timetable/entry.js`) – wpisy rozkładu i terminy zadań po północy mają napisy „00:30”
obok chwil `arrTime` / `depTime` / `deadlineTime`. Kto potrzebuje chwili, bierze pole `*Time`, nie napis. Kontrola
definicji czyta godziny z definicji (nie z rozkładu zmiany): godziny 24–47 dopuszcza tylko w scenariuszu z `endTime` po
24:00 (w zwykłej zmianie „26:15” to błąd `tt-time`), a godziny w nazwie zmiany porównuje z oknem modulo doba.

Gra: adres `?stacja=…&scenariusz=sluzba&start=<godzina>&czas=<minuty>&seed=…[&srk=…]` (`main.js`: `normalizeDuty`,
`buildDuty`; bez `seed` losuje je i służba jest inna za każdym razem). Strona posterunku (`StartScreen.#dutyChoice`):
co pokazać, mówi `catalog.shiftChoices` – służba, scenariusze specjalne (z `faults` albo `closedSections`) i stanowiska
do wyboru (zwykłe zmiany stacji na różnych stanowiskach → pole „Stanowisko”, parametr `srk` – dla służby i dla
scenariusza specjalnego bez własnego `srk` w definicji: `catalog.srkChoosable`; scenariusz z własnym `srk` idzie na
swoim – `Simulation` bierze stanowisko scenariusza przed parametrem); pod wyborem pora doby
i liczba pociągów rozkładu, który powstanie (to samo ziarno idzie do adresu). Zwykłe zmiany zostają w definicji stacji:
są wzorcem, podstawą testów stacji i działają pod dawnym adresem. Wynik gracza zapisuje się pod `sluzba-<minuty>`.
Pociąg nadzwyczajny (poziom „duże”) jest kopią pociągu z rozkładu służby. Automat: `npm run check -- <stacja> --start
22 --minutes 120` – rozkład służby zależy od ziarna, więc każde ziarno (`--seeds`) i każde stanowisko stacji
(`shiftChoices(station).srks`) to osobny scenariusz `sluzba-<minuty>[-<srk>]#<ziarno>`: definicja i przebieg dotyczą
tego samego rozkładu. Testy: `tests/duty.test.js` (reguły), `tests/duty-grid.js` (każdy posterunek: siatka godzin
i długości przez kontrolę definicji oraz służby grane automatem), `tests/e2e/duty.spec.js`.

## Koniec zmiany i raport (`src/model/Score.js`, `src/ui/Report.js`)

Zmiana kończy się sama (`Simulation.#checkEnd`), gdy ostatni pociąg rozkładu jest wyprawiony na szlak (status
„odjechał” – nie czeka na dojazd do sąsiada; status na szlaku nie wraca do „jedzie”) i zadania manewrowe są wykonane
albo przepadły (`Traffic.isDone`), a blokady nie czekają na dyżurnego (dPo, telefonogram o odjeździe, Ko –
`Simulation.#blockDuties`; niewykonane dPo i telefonogram przy końcu z czasu liczą się w ocenie końcowej); inaczej
o `endTime` scenariusza. Gdy rozkład jest wyczerpany (3 min po ostatnim
czasie rozkładu / terminie zadania), a zmiana trwa, dziennik dostaje jedną podpowiedź „Rozkład wyczerpany – do
zakończenia zmiany: …” z pociągami stojącymi na stacji i zadaniami. `sim.report()` (także w trakcie) daje pełny
raport: ocena i punkty, wiersze pociągów (plan / rzeczywistość / tor / opóźnienie / stan), punktualność, zadania,
bilans zdarzeń wg kodu, liczniki dPz/Sz/dPo/dKo/rozprucia i dane zmiany (`endReason`: all-done | time | manual).
Zdarzenia oceny i wpisy dziennika o pociągu mają jego numer w polu `nr` (zadania – także `task`, przetrzymanie
i rozkaz – `signal`, obowiązki blokady – `exit`, jazda po pękniętej szynie – `section`): raport i automat sprawdzający
scenariusze przypisują je pociągowi bez czytania komunikatu.
`Report` rysuje go jako pełny ekran w motywie ekranu startowego (ocena jako pieczątka odbita raz przy otwarciu, kafelki jak
liczniki pulpitu – cyfry w okienku, stan lampką w rogu – i tabele jak arkusz rozkładu) z przyciskami
„Nowa zmiana…” (ekran startowy), „Zagraj ponownie” i powrotem do pulpitu; otwiera się na `shift-end` i z menu.

## Tabor pociągów (`src/model/rollingStock.js`)

Katalog `ROLLING_STOCK` (zespoły trakcyjne i lokomotywy jeżdżące w rejonie Trójmiasta – źródła w docs/SOURCES.md,
„Tabor pociągów” i „Tabor pociągów – dynamika”) i czyste funkcje: `stockPlan(timetable, seed)` / `stockFor(entry,
timetable, seed)` (dobór taboru), `trainSpeed(entry, stock)` i `trainDynamics(entry, stock)` (prędkość i dynamika
z taboru). `Traffic` wybiera tabor raz, przy tworzeniu rozkładu zmiany (`stockPlan(rozkład, seed)`), i zapisuje go we
wpisie (`e.rollingStock`); pociąg nadzwyczajny (`addTrain`) dostaje tabor pociągu, z którego składu powstał (`unit`),
albo własne losowanie – tabor pociągów z rozkładu się nie zmienia. `#makeTrain` podaje `e.rollingStock` do `Train`
(`opts.stock`), a panel boczny (`SidePanel`) czyta to samo pole – pokazuje dokładnie tabor, który jedzie, i prędkość
`trainSpeed` (bez liczenia taboru od nowa przy każdym odświeżeniu).

* dynamika (`trainDynamics`, wołana przez `Train.applyDynamics` – przy utworzeniu pociągu, przy przekazaniu składu
  jako inny pociąg i po powrocie z manewrów): { vmax, accel, brake, power }. Zespół trakcyjny – przyspieszenie rozruchu
  i hamowanie służbowe typu (null – wartość kategorii), moc / masa zespołu, kilka zespołów jak jeden; lokomotywa –
  siła rozruchowa / (masa lokomotywy + masa ciągnięta), najwyżej `LOCO_ACCEL_MAX`, moc / ta sama masa; masa
  ciągnięta: pociąg towarowy – `mass` wpisu, pasażerski – wagony `(length − bufferLength) / COACH_LENGTH` po
  `COACH_MASS`; hamowanie lokomotywy z wagonami – kategorii; prędkość – `trainSpeed`. `Train.accelAt(v)` =
  min(accel, power / v): przy ruszaniu przyspieszenie z siły, wyżej ograniczone mocą. `accel` / `brake` wpisu mają
  pierwszeństwo (z `accel` wpisu – stałe przyspieszenie). Pociąg bez taboru (testy tworzące `Train` wprost) albo typ
  bez danych – dynamika kategorii (`categories.dynamicsFor`), stałe przyspieszenie;
* hamowanie (`brakingOf`, docs/SOURCES.md „Hamowanie jak maszynista”): `trainDynamics` zwraca też `brake` (największe
  opóźnienie hamowania służbowego – zespół: typu albo `UNIT_BRAKE`; pasażerski z lokomotywą: z drogi hamowania Ie-4 dla
  prędkości pociągu, wzór EN 14531-1; towarowy: z masy hamującej zależnej od masy na metr składu, P / G wg długości
  i masy), `brakeDelay` (czas do pełnego hamowania – wyprzedzenie) i `ease` (luzowanie przed zatrzymaniem – nie
  w towarowym dłuższym niż 300 m). `Traffic.#makeTrain` daje pociągowi maszynistę: `driverFactor(seed, nr)` (`mixSeed`,
  bez `sim.rng`) – część 0,6–0,8 opóźnienia służbowego, z którą planuje hamowanie (`Train.brakePlan`). `Train.brakeCurve(c,
  d)` to największa prędkość, z której pociąg zwolni do `c` na drodze `d` (z wyprzedzeniem `brakeDelay` i łagodnym
  dojazdem do zatrzymania); `brakingDistance(v)` wydłuża horyzont skanowania. Nagła zmiana sygnału: hamowanie od
  `brake` do `EMERGENCY_BRAKE` – jak dotąd. `Train` bez `opts.driver` (testy) hamuje pełnym `brake`, bez wyprzedzenia;
* sąsiedni posterunek wyprawia pociąg wg `trainSpeed` (wolniejszy pojazd – wcześniej, jak w rozkładzie ułożonym dla
  niego; `Traffic.#prepare`); przyspieszenia przy tym nie liczy, więc pociąg ruszający wolno przyjeżdża trochę później;
* pula kategorii (`skm`, `regio`, `ic`, `eip`; pociągi towarowe – lokomotywy o trakcji `tractionOf(entry)`, zdawcze także
  manewrowe), tylko typy nie wolniejsze niż pociąg (`vmax` typu ≥ `speedFor`, gdy taki typ jest), zespoły w liczbie
  dobranej do długości `length` (tolerancja `STOCK_LENGTH_TOLERANCE`); albo typy przypięte polem `stock` wpisu (typ lub
  lista typów) – każdy typ z listy, z liczbą zespołów najbliższą długości, wolniejszy ogranicza prędkość pociągu;
* ziarno: własny ciąg `Random` z ziarna zmiany i numeru pociągu (`mixSeed` z `src/core/Random.js` – to samo mieszanie
  co rozrzut zatrzymania `stopScatter`) – dobór nie zużywa `sim.rng`, więc opóźnienia i usterki losują się tak samo;
  przebieg zmiany zależy od taboru przez dynamikę i prędkość pociągów;
* pociąg ze składu innego (`unit`) – tabor początku łańcucha (`rootOf`, `chainOf`; zapętlony łańcuch – jeden początek
  dla całej pętli, `unitLoop`); kolejne pociągi jednej linii (`lineKey`: kategoria + `from` + `to`; pociąg bez `from`
  albo `to` – linia z jednego pociągu) w kolejności `byTime` (godzina liczbowo, potem numer) losują po kolei, następny
  bez typu poprzedniego, gdy pasuje inny;
* walidacja (`validate.js`): znany typ, trakcja lokomotywy jak pociągu towarowego, ten sam `stock` (jako zbiór typów)
  w łańcuchu `unit`, łańcuch `unit` bez pętli.

## Misje wprowadzające (`src/tutorial/`)

* Każdy samouczek ma własny plik w `src/tutorial/missions/` z własną listą kroków (`steps()`) i **własnym
  scenariuszem** – inną stacją, innym układem torów i innym rozkładem, żeby każda misja była czymś nowym:

  | misja | stanowisko | stacja | czego uczy |
  |---|---|---|---|
  | 1 `monitor` | stanowisko komputerowe | Szkolna – linia jednotorowa | pozwolenia, krzyżowanie, manewry; usterki: semafor bez sygnału (Sz), blokada bez łączności (zapowiadanie telefoniczne) |
  | 2 `pulpit` | pulpit kostkowy typu E | Jodłowa – linia dwutorowa z odgałęzieniem | ruch bez pozwoleń z Ko, wyprzedzanie, odgałęzienie z Eap; usterka: zwrotnica bez kontroli położenia (zamknąć, przyjąć na inny tor) |
  | 3 `izh` | pulpit IZH-111 | Zacisze – stacja krańcowa | tory czołowe, zmiana czoła, dwa składy na stacji; usterka: odcinek z fałszywą zajętością (droga ułożona ręcznie i zamknięta, wjazd na Sz) |
  | 4 `mech` | nastawnia mechaniczna | Olszyny – linia jednotorowa z bocznicą | dźwignie, drążek, blok przebiegowy, dźwignia sygnałowa, powrót po przejeździe, krzyżowanie z wykolejnicą ochronną; usterka: pociąg nie zwolnił bloku przebiegowego (zwalniacz) |
  | 5 `ebi` | EBILock 950 (EBIScreen) | Brzezina – linia dwutorowa z blokadą samoczynną | menu pod prawym klawiszem, linia poleceń i „Wykonaj”, polecenie z klawiatury, wyprzedzanie, okno zdarzeń i alarmów; usterka: pęknięta szyna – zamknięcie toru ITS, przyjęcie na tor 3, otwarcie ITO |
  | 6 `mor` | MOR-3 (MOR-1) | Kalinowo – węzeł trzech linii jednotorowych z Eap | menu obiektów, przebieg kliknięciem celu (semafor, tor, trójkąt) i przeciąganiem, blokada z menu trójkąta, krzyżowanie w węźle, alarm dwuklikiem, zwrotnice Minus / Stop / oStop; usterka: licznik osi (ZeroLO, przejazd kontrolny na SZ) |

  Każda misja uczy innej usterki – razem wszystkie siedem rodzajów (`src/model/Faults.js`; `route-block` tylko na
  nastawni mechanicznej, także w losowaniu; `track-defect` i `axle-counter` tylko w scenariuszu). Wjazd na tor z pękniętą szyną bez
  zamknięcia kosztuje punkty; przyjęcie na inny tor, gdy planowy jest zamknięty, jest bez kary. Zwalniacz przy bloku niezwolnionym przez usterkę nie kosztuje punktów. Przyjęcie pociągu na tor
  inny niż planowy nie jest karane, gdy usterka była na drodze toru planowego (`Traffic.#plannedTrackFault`: jego
  odcinki, przebieg na niego od strony wjazdu, przebieg z niego w stronę wyjazdu – zajętość, zwrotnica, semafor) między
  zgłoszeniem pociągu a przyjazdem – tak jak uzasadnione Sz; usterka gdzie indziej na stacji – kara.

  Misje nie mają rozgrzewki: zaczynają się o 07:00 (pierwszy sąsiad już pyta o pozwolenie albo wyprawia pociąg)
  i uczą polecenia wtedy, gdy są potrzebne – zwykłym ruchem albo przy usterce; wyjaśnienie elementu jest w kroku,
  w którym gracz pierwszy raz go używa. Testy „ucznia” pilnują, że pociągi jadą o czasie. Lekcje rozkładu Szkolnej są w `lessons.js`
  (`lessonSteps(phrases)`); `withSteps(base, { after, before, replace, omit })` składa samouczek z listy kroków
  i zmian. `phrases.js` – cegiełki tekstów, `missions.js` – rejestr (`MISSIONS`, `getMission`, `missionSteps`).
* Kroki misji bez DOM: `{ id, title, text, anchor, info?, done(sim, ctx), wrong?(sim, ctx), tip? }`.
  W misji (`scenario.tutorial`) zmiana nie kończy się sama po ostatnim pociągu (`sim.autoEnd = false`) – kończy ją
  „Dalej” na ostatnim kroku (`sim.endShift()` → raport); zamknięcie samouczka przywraca automatyczny koniec.
  Kotwice kroków (`anchor`) – różnią się teksty
  i wskazywane miejsca (`anchor`: `{ ref }`, `{ block }`, `{ cmd }`, `{ el }`, `{ tab }`). Wszystko, co zależy od
  stanowiska, jest w słowniku `PHRASES[view]` (te same klucze dla każdego widoku – pilnuje tego test); kroki misji nie
  rozgałęziają się po widoku, więc nowy panel to nowy wpis w słowniku.
* `progress.js` – `MissionProgress`: kolejność kroków, warunki na stanie symulacji i zdarzeniach szyny
  (`ctx.seen`: `route:A-D1:set`, `lock:Zw3`, `sz:A`, `cancel:B` …), wstrzymanie zegara na krokach informacyjnych,
  komunikaty `wrong` (np. przebieg na zły tor). Testowany w Node skryptem „ucznia” (`tests/szkolna.test.js`).
* `placement.js` – wybór miejsca dymka (`placeBox`), bez DOM: dymek nie zasłania wskazywanego elementu ani pasków
  sterowania (nagłówek, pasek poleceń, listwa narzędzi z zakładkami panelu); wysoki dymek staje w wolnym pasie okna.
* `Tutorial.js` – UI: dymek przypięty do elementu (`renderer.elementFor(ref)`, `cmdButton(id)`), podświetlenie `.tut-hl`,
  słownik skrótów (`src/data/glossary.js`) po kliknięciu `<abbr data-term>`, „Dalej” / „Pomiń krok” / „Pokaż gdzie”.
  Położenie dymku wybierane spośród kandydatów (pod, nad, obok elementu, pas nad planem i pod planem) wg pola
  zasłoniętego rysunku planu, elementu i pasków sterowania; dymek, słownik i pasek potwierdzenia dają się przeciągać
  (`src/ui/drag.js`) – przesunięty dymek zostaje do następnego kroku.
* Zadania manewrowe mogą zależeć od siebie (`afterTask`), więc krok „podstaw z powrotem” nie zalicza się przed
  odstawieniem, niezależnie od godziny; automat bierze zadanie gotowe do wykonania, nie pierwsze z listy. Każde
  kolejne zadanie tego samego składu ma `afterTask` (test treści w `tests/unit-handover.test.js`). Termin zadania czekającego biegnie: gdy poprzednie nie zostało wykonane,
  zadanie przepada 10 min po swoim terminie (inaczej zostawałoby w toku do końca zmiany, a automat czekałby na nie
  bez końca). Termin przesuwa `Traffic.#shiftTask` (w dzienniku z powodem): o opóźnienie składu od sąsiada – gdy
  sąsiad je zgłasza – i o czas, gdy `Traffic.#taskBlocked` widzi, że każda droga manewrowa do toru docelowego jest
  zamknięta usterką bez obejścia (`task.faultShift`; zadanie z `afterTask` przesuwa się razem z nim). Droga to łańcuch
  do 3 przebiegów manewrowych od miejsca składu (`trainRouteChains` z `src/model/trainPaths.js`), po którym cały skład
  mieści się na torze docelowym – długi skład za krótkim odcinkiem przed sygnalizatorem potrzebuje dalszego przebiegu
  (Szkolna: Tm1 → Tm2 kończy się na T2e, 180 m – dalej Tm2 → C2); bez takiej drogi – każdy przebieg na tor docelowy. Skład stojący
  wtedy ma `faultBlocked` (bez kary za przetrzymanie), a późny odjazd pociągu z tego składu liczy się bez tych minut.
  Skład przekazany jako nowy pociąg (`unit`) traci zezwolenie pociągu, którym przyjechał
  (`Train.clearAuthority`) – rusza dopiero na sygnał semafora wyjazdowego. Skład z zadaniem manewrowym w toku
  (niewykonane, nie przepadło, poprzednie nie przepadło – `Traffic.#openTask`) nie jest przekazywany: dyżurny najpierw
  je wykonuje albo zadanie przepada (inaczej opóźniony skład przechodził w pociąg przy przyjeździe, zanim automat zdążył
  przełączyć go w manewry – zależnie od kroku przyjazdu); zadanie wstrzymane usterką bez obejścia (`faultBlocked`, termin
  się przesuwa) nie blokuje przekazania. Test: `tests/unit-handover.test.js`.
* Stacja treningowa `src/stations/szkolna.js`; scenariusz z polem `tutorial` uruchamia misję (main.js).

## Ustawienia (`src/ui/Settings.js`)

`DEFAULTS` dla nowego użytkownika: pulpit na środku, panel boczny na dole, motyw wg systemu operacyjnego
(`prefers-color-scheme`, zmiana na żywo; skrypt w `index.html` ustawia motyw przed załadowaniem aplikacji), podział na
ekrany, symbole monitora 125 %, odstęp torów normalny. Stanowisko (srk) nie jest ustawieniem – wynika ze stacji lub
scenariusza. Zapisane ustawienia (localStorage) mają pierwszeństwo; zmiana `rowScale` / `lang` przeładowuje stronę,
`symScale` działa na żywo.

## Wygląd interfejsu (`src/styles.css`, `src/ui/dialog.js`, `src/ui/icons.js`)

* **Zmienne.** Barwy, promienie (`--radius`, `--radius-sm`, `--radius-pill`), wysokość kontrolek (`--ctl-h`) i warstwy
  (`--z-*`, każda z własną wartością) są w `:root`; motyw jasny (`:root[data-theme="light"]`) nadpisuje komplet barw
  interfejsu. Grupy: interfejs gry (`--bg`, `--panel`, `--accent`…), ekrany pełne (`--sc-*`), kategorie pociągów
  (`--cat-*`), barwy urządzeń niezależne od motywu – pulpit (`--desk-*`) i paski / menu monitora (`--mon-*`).
  `tests/styles.test.js` pilnuje, że reguły interfejsu nie mają barw, promieni ani warstw wpisanych na sztywno.
* **Ekrany pełne** (start, ustawienia, raport, instrukcja) mają jeden układ – nagłówek `.st-hero` z logo, tytułem
  i przyciskiem powrotu, pod nim tor (szyny na podkładach), treść na kartach; na telefonie logo stoi nad tytułem – i idą
  za motywem interfejsu. Wygląd ze świata nastawni (tor, semafor, lampki kontrolne, liczniki, tablica stacyjna,
  pieczątka) daje kilka zmiennych `--sc-*` w obu motywach: `--sc-plate*`, `--sc-lamp-*` / `--sc-glow-*`, `--sc-lens-off`,
  `--sc-counter*`, `--sc-rail`, `--sc-sleeper`, `--sc-go*`, `--sc-warn-plate`. Ustawienia: kategorie to przystanki na
  torze (bieżąca – zapalona lampka), wybór opcji pokazuje lampka kontrolna (pole wyboru z `appearance: none` – nadal
  działa z klawiatury). Ruch tylko przy zmianie stanu (lampka, pieczątka), wyłączony przy `prefers-reduced-motion`. `dialog.js` nadaje im rolę okna dialogowego,
  przenosi fokus do okna po otwarciu i oddaje go po zamknięciu. Kolejność warstw: menu < instrukcja < raport <
  ekran startowy < ustawienia (ustawienia otwiera też ekran tytułowy).
* **Ikony.** `uiIcon(name)` zwraca SVG na siatce 16×16 w kolorze tekstu (pauza, wznowienie, menu, zamknij, stan
  zadania). Znaki tekstowe zostały tylko w treści (słowniki, opisy), nie na przyciskach.
* **Dostępność.** Widoczny fokus z klawiatury (`:focus-visible`), opisy przycisków-ikon (`aria-label`), przy
  ustawieniu systemu „ogranicz ruch” wyłączone animacje ozdobne; miganie lampek i sygnałów zostaje, bo niesie
  informację o stanie urządzeń.

## Czcionka (`src/fonts/`, `src/styles.css`)

Cała aplikacja – interfejs, pulpit kostkowy i monitor – używa jednej czcionki: Inter (czcionka zmienna 100–900,
licencja SIL OFL 1.1 w `src/fonts/OFL.txt`), dołączonej do strony w dwóch plikach woff2 (`latin`, `latin-ext` z polskimi
znakami) i podanej przez zmienną `--font`. Dzięki temu napisy wyglądają tak samo w każdym systemie, a nie zależą od
czcionek zainstalowanych u gracza. Kontrolki formularzy dziedziczą czcionkę (`button, input, select, textarea`),
liczby na monitorze i licznikach mają stałą szerokość cyfr (`tabular-nums`). Znaki spoza czcionki (np. ✔ ☐) bierze
czcionka systemu. `tests/e2e/font.spec.js` sprawdza, że plik pochodzi ze strony i że czcionka jest w użyciu.

## Język interfejsu (`src/i18n/`)

Słowniki płaskie `pl.js` (źródłowy), `en.js`, `de.js` – ten sam zbiór kluczy, parametry `{x}` (test `i18n.test.js`
pilnuje zgodności kluczy i parametrów oraz że tłumaczenia nie są kopią polskiego). `t(key, params)` czyta bieżący
język (brak klucza → polski → sam klucz), `setLang` ustawia go w `main.js` przed zbudowaniem jakiegokolwiek ekranu:
ustawienie `lang` (`auto` = `detectLang` po `navigator.languages`, inaczej polski) – dlatego zmiana języka przeładowuje
stronę. Statyczny `index.html` tłumaczy `applyDom` po atrybutach `data-i18n` / `data-i18n-title` / `data-i18n-aria`.
Przez `t()` przechodzi warstwa interfejsu: menu i pasek narzędzi, ekran startowy, ustawienia, raport, panel boczny,
dymek samouczka, podpowiedzi stanowiska i instrukcja (`help.*`). **Nie** przechodzą: komunikaty modelu (`src/model/`
– dziennik, statusy rozkładu, telefonogramy wg Ir-1, komunikaty oceny), polecenia paska Ie-104 na monitorze, opisy
posterunków i scenariuszy, kroki misji i słownik – to treść domenowa po polsku, testowana w Node na polskich tekstach.
Testy e2e działają z `locale: 'pl-PL'` (konfiguracja Playwright), bo „auto” w angielskiej przeglądarce dałoby angielski.

## Testy

Stacje testowe (`tests/fixtures/`): Stare Pustkowie (mała stacja jednotorowa, typ E, Eap) i Wola Pustkowska (linia
dwutorowa z blokadą jednokierunkową, odgałęzienie z Eap) – dawne stacje fikcyjne gry, usunięte z rejestru, ale
zachowane jako siatka bezpieczeństwa: `makeSim()` z `tests/helpers.js`, macierze przebiegów, zakłócenia, blokada,
rozkazy, układ kostek blokady. Nie są dostępne w grze.

* `tests/*.test.js` – logika (`node --test`), bez DOM; macierze przebiegów, pełne zmiany, luki modelu (`model-gaps`), misje (`szkolna`),
  polecenia wprost i protokół przycisków (`commands`), granice warstw (`layers`).
* `tests/route-state.test.js` – stan przebiegu (`routeState` i pytania pokrewne) na typie E, IZH-111 i nastawni
  mechanicznej: każdy stan osiągany poleceniami i zajętością, bez ustawiania pól zapisu przebiegu.
* `tests/skills.test.js` – skille projektu (`.claude/skills/*/SKILL.md` – listy kroków dla sesji AI: nowa stacja,
  scenariusz, posterunek na mapie, stanowisko, diagnoza zatoru, zasada ze źródła) i `CLAUDE.md`: każda wymieniona
  ścieżka, polecenie `npm run` i skill istnieją; skrypt diagnozy zatoru działa. Zmiana nazwy pliku albo polecenia
  wymaga więc poprawienia skilla w tym samym commicie.
* `src/model/check/invariants.js` – niezmienniki bezpieczeństwa sprawdzane w każdym takcie (dwa pociągi na odcinku,
  odcinek w dwóch przebiegach – `Interlocking.lockConflicts`, sygnał zezwalający bez przebiegu albo na zajęty odcinek
  – poza nastawnią mechaniczną, zwrotnica przestawiana pod taborem, dwa pociągi na jednym torze szlakowym) oraz
  zdarzenia „spad” i „rozprucie”. Wspólne dla macierzy, testów usterek, automatu sprawdzającego i przeglądu; sprawdza
  je `tests/invariants.test.js`; asercja dla testów – `safety` w `tests/invariants.js`.
* Usterki w ustalonej chwili jazdy pociągu (`tests/fault-harness.js`): usterka zaczyna się przy zdarzeniu (pociąg
  zgłoszony, przebieg nastawiony, pociąg w przebiegu, przy peronie, wyjazd, na szlaku) – `Faults.add` – a cel wskazuje
  się względem pociągu. Ruch prowadzi automat; czynności, których automat nie robi (Sz, rozkaz „S”, ZeroLO, ITS / ITO),
  wykonuje w teście „dyżurny”. Sprawdzane są reguły urządzeń: niezmienniki, brak kar za czynności wymuszone usterką,
  stan po naprawie, żaden pociąg ani zgłoszenie nie przepada. Pliki:
  – `faults-signals-points.test.js` – usterka semafora i napędu zwrotnicy (zgłoszony, przebieg nastawiony, stoi przed
    semaforem, tuż przed pociągiem, przy peronie, wyjazd), pięć stanowisk Szkolnej i MOR-3 (Kalinowo), oba kierunki;
  – `faults-track.test.js` – fałszywa zajętość (przed i pod pociągiem, tor docelowy, przebieg wyjazdowy), blok
    przebiegowy niezwolniony przez pociąg (nastawnia mechaniczna), licznik osi z ZeroLO (MOR-3), pęknięta szyna z ITS / ITO;
  – `faults-block.test.js` – usterka blokady liniowej w każdej chwili wjazdu i wyjazdu, z naprawą w następnej chwili,
    na Eap dwukierunkowej (Szkolna, Kalinowo), jednokierunkowej (Jodłowa) i SBL (Brzezina), przy krzyżowaniu, pociągach
    po sobie i pociągu przelotowym; pilnuje też szlaku (jeden pociąg na torze szlakowym, pozwolenie);
  – `faults-combined.test.js` – dwie różne usterki na drodze jednego pociągu: semafor wyjazdowy i blokada tego wyjazdu
    (Sz / rozkaz „S” dopiero po „droga wolna”, dPo, zawiadomienie o odjeździe), semafor wjazdowy i blokada wjazdu (dKo
    odrzucone, przyjazd telefonogramem), napęd zwrotnicy albo semafor wjazdowy i fałszywa zajętość toru docelowego
    (Sz / rozkaz przez zwrotnice zamknięte, po zabezpieczeniu na miejscu); koniec zmiany z niewykonanym zawiadomieniem;
  – `faults-desks.test.js` – usterki obsługiwane przez protokół stanowiska, nie przez `sim.execute`: dKo i Sz przy długiej
    usterce semafora wjazdowego na każdym z sześciu stanowisk (przyciski typu E, adres i rozkaz IZH-111, SZI → SZW
    w EBILock, menu i potwierdzenie MOR-3, polecenie specjalne na monitorze, klawisz Sz nastawni mechanicznej), semafor
    naprawiony, gdy SZ czeka na potwierdzenie (Sz oceniany w chwili wyboru – `justifiedAtChoice` z protokołu), Sz
    wybrany bez usterki (−5 po potwierdzeniu); nastawnia mechaniczna – drążek w położeniu pośrednim
    przy zajętości toru docelowego z usterki, usterka semafora i bloku przebiegowego tego samego semafora (Sz
    i zwalniacz), usterka napędu zwrotnicy w Olszynach;
  – `faults-shunt.test.js` – zadania manewrowe Szkolnej przy usterce na drodze manewru (sygnalizator bez Ms2, napęd
    zwrotnicy, fałszywa zajętość – przed manewrem i w czasie jazdy): krótka bez kar; długa – przy sygnalizatorze
    zezwolenie dyżurnego, przy zwrotnicy i zajętości bez obejścia termin przesunięty, bez kar; ochrona drogi pociągu na Sz / rozkaz „S” (zwrotnicę trzyma utwierdzenie przebiegu albo Zz);
  – `faults-stations.test.js` – usterki na pozostałych stacjach: przebiegi wieloetapowe (Sopot A → H → O i L → C,
    Chylonia G502 → A502 – semafor pośredni, zajętość drugiego stopnia, semafor wyjazdowy), Rumia / Jodłowa / Brzezina
    (Eap jednokierunkowa i SBL: semafor wjazdowy i wyjazdowy, tor docelowy, napęd zwrotnicy, dKo / dPo przy Sz
    i rozkazie), dwa pociągi po sobie na SBL bez łączności, jazda po torze lewym w Sopocie jako odpowiedź na usterkę.
  Stan po naprawie (`leftovers`) obejmuje też blok początkowy zablokowany bez pociągu i niewykorzystane pozwolenie
  albo kierunek Eap.
  Błąd silnika znaleziony takim testem zostaje testem `todo` (uruchamia się, ale nie psuje wyniku) do poprawki, która
  zmienia go na zwykły test.
* Zezwolenie na jazdę manewrową obok uszkodzonego sygnalizatora (Ir-9 § 10 ust. 15): `Traffic.shuntPermit(nr)` –
  telefonogram radiowy `shunt-permit` (Łączność) albo polecenie `{ type: 'shunt-permit', nr }`; wymaga składu
  manewrowego na postoju, nastawionego przebiegu manewrowego od sygnalizatora przed nim i usterki tego sygnalizatora.
  `Train.shuntPermit` ({ signal, route }) pozwala minąć ten sygnalizator z prędkością 25 km/h w tym jednym przebiegu.
  Automat daje zezwolenie sam, gdy skład czeka przed uszkodzonym sygnalizatorem. Rozkaz „S” dla składu manewrowego –
  odmowa. Testy: `tests/faults-shunt.test.js`, `tests/e2e/trains.spec.js`.
* `scripts/seed-scan.mjs` (`npm run seed-scan`) – szukanie testów przypadkowych: zmiana tworzona w teście bez `seed`
  dostaje przy każdym uruchomieniu inne ziarno (`Simulation`: z `Math.random`), więc test z ciasnym zapasem pada raz na
  sto uruchomień, zwykle w CI. `scripts/random-seed.mjs` (ładowany przez `node --import`) podmienia `Math.random` na
  generator o ziarnie `SPRK_RAND=<n>` – „losowe” ziarna stają się powtarzalne. Skrypt uruchamia każdy plik testów pod
  wieloma zestawami (`--runs`, `--from`, `--only`), jedno zadanie na parę (plik, zestaw) w puli procesów na wszystkich
  rdzeniach; pierwszy zestaw ustala, które pliki w ogóle losują ziarno. Wynik: testy, które nie przeszły, z zestawami
  i poleceniem do odtworzenia. Poprawka testu: ziarno wpisane w teście albo zapas wynikający z modelu (krok symulacji),
  nie luźniejsza asercja. Test narzędzia: `tests/seed-scan.test.js`.
* `scripts/survey.mjs` (`npm run survey`) – przegląd silnika: każda stacja × scenariusz × poziom zakłóceń × ziarno
  (domyślnie poziomy high i low, ziarna 1–4; scenariusz z własnym poziomem, np. „szczyt”, idzie raz na ziarno), pełna
  zmiana plus `--extra` minut z automatem, równolegle w `worker_threads`. Dla każdej zmiany: pociągi, które nie
  dojechały, naruszenia niezmienników (w każdym takcie), spad i rozprucie, kary za czynności wymuszone usterką
  (`unjustified`), stan urządzeń po zmianie (`leftovers` – liczony tylko bez zatoru), liczniki dPz i Sz, wynik oraz odcisk
  przebiegu ruchu (`fingerprint`). `--json` zapisuje wyniki, `--compare` porównuje je z zapisanymi (gorzej / lepiej /
  nowe zatory / inny przebieg przy tych samych wskaźnikach) – przed zmianą w silniku i po niej. Kod wyjścia 1 przy
  zatorze, naruszeniu, spad, rozpruciu, karze wymuszonej usterką albo pozostałościach po zmianie. Pełny przegląd (ok. 35 s na 10 rdzeniach) nie wchodzi do `npm test`;
  jego czyste funkcje sprawdza `tests/survey.test.js`. Pętlę zmiany (`playShift`: krok 0,5 s, automat co 2 s,
  niezmienniki po każdym takcie), kolejkę wątków (`runJobs` / `serveJobs` / `runParallel`) i wspólne opcje wiersza
  poleceń (`parseCli`) dzieli z automatem sprawdzającym scenariusze: pętla zmiany, niezmienniki i stan urządzeń po
  zmianie są w logice (`src/model/check/`: `play.js`, `invariants.js`, `outcome.js` – używają ich też testy i skill
  diagnoza-zatoru), wątki i opcje – w bibliotece narzędzi (`scripts/lib/workers.mjs`, `scripts/lib/cli.mjs`).
* `scripts/` – wiersz poleceń narzędzi (opcje, wątki, wydruk); ich logika bez wyjścia – `scripts/lib/`: raport zmiany
  zagranej automatem (`shift-report.mjs`, `checkShift`), werdykt i ocena scenariusza (`verdict.mjs`), wątki
  (`workers.mjs`), wspólne opcje (`cli.mjs`). Testy importują `scripts/lib/`, a skrypty tylko po to, by sprawdzić
  wiersz poleceń; źródła i skrypty nie importują niczego z `tests/` (`tests/layers.test.js`).
* `scripts/check-scenario.mjs` (`npm run check`) – automat sprawdzający scenariusze (sekcja niżej); jego reguły
  i statyczne kontrole sprawdza `tests/scenario-check.test.js` (każdy kod błędu na celowo zepsutym wariancie Szkolnej,
  przebiegi z błędem, zatorem i sondą usterek, werdykt i ocena scenariusza na raportach wzorcowych, wiersz poleceń),
  a każdy scenariusz każdej stacji (definicja i jeden przebieg: ziarno 1, poziom scenariusza – wymuszony `disruptions`
  albo `none`) – `tests/scenario-check.test.js` i `tests/scenario-check-run-1…4.test.js` (podział w
  `tests/scenario-runs.js`; pliki liczą się równolegle). Koszt (zmierzony): ok. 53 s czasu procesora (4 części po ok. 6 s, testy reguł
  ok. 4 s) – na 10 rdzeniach `npm test` dłuższy o ok. 5 s (17,3 → 22,1 s), na 4 rdzeniach (CI) szacunkowo o ok. 13 s. Scenariusz, który
  świadomie nie przechodzi, trafia do `KNOWN` w `tests/scenario-runs.js` z uzasadnieniem (test `todo`); uwagi
  powtarzalne (definicja i przebieg bez zakłóceń), które właściciel przyjął – do `tests/scenario-accepted.js` (nowa
  uwaga spoza listy zatrzymuje `npm test`).
* `tests/e2e/` – Playwright: `desk.spec.js` (ekran startowy: misje, sortowanie, odprawa; pulpit kostkowy: dwa przyciski, wyciągnięcie, Zw, blokada,
  ustawienia, struktura przycisków), `screen.spec.js` (monitor: pasek poleceń, menu elementu, polecenia specjalne, ekrany,
  skala symboli, perony i numery torów, sygnalizatory na linii, blokada przy wyjeździe, ustawienia domyślne, okręgi), `tutorial.spec.js` (samouczek: dymki, podświetlenie, przeciąganie, słownik, obie misje, ekran startowy nad dymkami), `screens-look.spec.js` (wygląd ekranów pełnych w obu motywach: semafor „Stój” / „wolna droga”, przystanki misji, tablica stacyjna, pieczątka i liczniki raportu, lampki ustawień, nagłówek na telefonie), `start-nav.spec.js` (ekrany wyboru: wyszukiwarka, filtry, adresy i „wstecz”, Esc, mapa i schemat regionu, postęp, ustawienia z tytułu, brak mignięcia pulpitu), `visual.spec.js` (zrzuty ekranu porównywane ze wzorcami w `__screenshots__`,
  próg 300 pikseli, żeby drobne zmiany symboli też były wykrywane). Pomocniki w `helpers.js`: `openShift` (ustawienia w localStorage, zegar zatrzymany),
  `btn`/`tap` (przyciski wg `data-ref`), `simState`, `advance` (krok symulacji bez czekania).
* Wzorce zrzutów odświeża się na komputerze (`npm run test:e2e:update`, dowolny system): przed zrzutem litery stają się
  przezroczyste (`HIDE_GLYPHS` w `visual.spec.js` – miejsce zostaje), bo rasteryzacja tej samej czcionki różni się między
  systemami (CoreText / FreeType / DirectWrite); układ, kształty i barwy są wszędzie te same, więc wzorzec z macOS przechodzi
  w CI (kontener Linux). Napisy sprawdzają asercje `toHaveText` w testach zachowania.

## Automat sprawdzający scenariusze (`scripts/check-scenario.mjs`, `src/model/scenarioCheck.js`)

Do szybkiego dodawania wariantów scenariuszy (inne okno zmiany, podzbiór pociągów, usterki) istniejących i nowych
stacji: `npm run check -- [stacja[:scenariusz] …] [--seeds 1-3] [--level none|low|high|all] [--extra min]
[--tutorial] [--strict] [--verbose] [--json plik]` – bez stacji wszystkie; `--level all` (domyślnie) to `none`, `low`
i `high` (inaczej niż w `survey`, gdzie `all` = `high` i `low`); scenariusz z własnym `disruptions` idzie tylko na
swoim poziomie. Kod wyjścia 1, gdy któryś scenariusz ma ocenę BŁĘDY (z `--strict` także UWAGI); 2 – błędne opcje,
nieznana stacja.

**Poziomy ustaleń.** `error` (BŁĄD) – do poprawy; `warning` (uwaga) – ryzyko kar albo rzecz nietypowa w zamyśle
scenariusza; `info` – wypisywane, bez wpływu na ocenę: odporność na zakłócenia wybierane przez gracza i ograniczenia
silnika / automatu (pociąg nadzwyczajny, który nie zdążył przed końcem zmiany, automat czeka na naprawę usterki, nie zeruje licznika osi,
nie zamyka toru). **Poziom scenariusza** to `none` albo wymuszony `disruptions` – zamysł autora; `low` / `high`
wybierane przez gracza sprawdzają odporność.

**Ocena scenariusza** (`scenarioStatus`): BŁĘDY – błąd definicji albo zmiana z błędem na dowolnym poziomie; UWAGI –
uwaga definicji albo uwaga w zmianie na poziomie scenariusza (bez zakłóceń – każda, bo przebieg jest praktycznie
powtarzalny – bez losowych opóźnień i usterek ziarna różnią się najwyżej o sekundy;
przy wymuszonym poziomie losowym – rodzaj uwagi powtarzający się we wszystkich ziarnach); inaczej OK. Uwagi z
poziomów gracza idą do wiersza „Odporność” (ile zmian z uwagami, jakie kody) i do podsumowania, bez wpływu na ocenę.
Jedna granica czasu w definicji i przebiegu: pociąg odjeżdżający musi mieć planowy odjazd co najmniej `LATE_SLACK`
= 4 min przed końcem zmiany (od odjazdu do zjazdu ze stacji 1–4 min, zmierzone automatem), a zapas na opóźnienia
od sąsiada przy poziomie L to `levelSlackMin(L)` = opóźnienie poziomu + 4 min (low 19 min, high 44 min) – ta sama
liczba w uwadze `sc-slack` definicji i w `late-inbound` przebiegu.

1. **Definicja** – najpierw `validateStation` (w wierszu poleceń raz na stację, z pełną treścią błędów i uwag; przy
   błędach przebiegi stacji są pomijane), potem `checkScenario(station, scenarioId | obiekt, { missions, levels })`
   (moduł logiki, bez DOM): lista `{ level, code, msg, train? }`. Kontrole czytają symulację utworzoną bez kroku
   (rozkład z czasami w sekundach, odcinki i przebiegi po normalizacji, blokady), bez losowych zakłóceń; łańcuchy
   przebiegów wjazdu i wyjazdu są te same co w automacie dyżurnego i w ruchu (`src/model/trainPaths.js`). Błędy:
   stacja niepoprawna (`station-invalid`, każdy błąd walidacji osobno), nieznany / powtórzony scenariusz, pole spoza
   formatu (literówka – z podpowiedzią najbliższego pola, bo gra je po cichu pomija), lista scenariusza nie jako
   tablica, poziom, misja, srk, czas nie GG:MM, `endTime` ≤ start, `trains` z numerem spoza rozkładu (także napis
   zamiast liczby) albo razem z `timetable`, własny `timetable` niepoprawny wg `validateTimetable`, pusty rozkład,
   pociąg, który nie powstanie (`from: null` bez `startOn` / `unit`, `startOn` na nieistniejącym odcinku, dwa na
   jednym), nawrót bez zmiany czoła (wjazd i wyjazd po tej samej stronie stacji, `startOn.dir` przeciwny do wyjazdu),
   nigdy nie będzie obsłużony (bez `to`, `terminates`, następcy), skład `unit` spoza zmiany / z dwoma następcami / po
   odjeździe następcy, powtórzony numer, odjazd przed przyjazdem, tor planowy nieistniejący albo bez przebiegu z wjazdu
   / na wyjazd (pociąg z postojem – kara pewna), pociąg przed startem (przyjedzie po planie, wypadnie z punktualności)
   albo za blisko końca zmiany (odjazd mniej niż 4 min przed końcem, przyjazd kończącego bieg po końcu), zadania
   (składu nie ma, termin niepoprawny / niewykonalny / przed startem, `afterTask` nieistniejące, tor docelowy
   nieistniejący, bez drogi manewrowej z toru po poprzednim zadaniu albo zamknięty przez cały czas na zadanie, skład
   jadący dalej, ostatnie zadanie zostawia skład na torze bez wyjazdu następcy), usterki (nieznany rodzaj / element,
   `at` nie jako napis GG:MM – liczbę gra wzięłaby za sekundy od północy, `duration`, po końcu zmiany, blok
   przebiegowy poza nastawnią mechaniczną), zamknięcia toru (nieznany odcinek, czas, `from` ≥ `to`, pociąg bez
   objazdu do końca zmiany). Uwagi: sąsiad musiałby wyprawić pociąg przed startem (≥ 2 min), dwa pociągi na jednym
   torze w planie, wjazdy jednym szlakiem gęściej niż jazda po nim (`line-headway`) i wyjazdy na szlak, zanim
   poprzedni pociąg go zwolni (`line-headway-out`; szlak to jeden odstęp – także SBL), wyjazd i wjazd naprzeciw na
   Eap, zapas `sc-slack` przy wymuszonym poziomie, godziny w nazwie zmiany inne niż okno (`sc-name-window`), uwaga walidacji wpisu własnego rozkładu (pociąg dłuższy niż tor),
   zadanie po terminie / bez `afterTask` / odziedziczone i pominięte / na tor przyjazdu (bez manewrów) / z terminem po
   odjeździe następcy / zostawiające skład na innym torze niż następca, usterka przed startem / po końcu (bez licznika
   osi i samouczków) / na tarczy manewrowej / na odcinku podzielonym przez łącznicę, zamknięcie poza oknem albo toru
   planowego. Informacje: `sc-slack` przy poziomach gracza, zmiana za krótka na pociąg nadzwyczajny (`extra-none`), usterka, której
   automat nie obsługuje (`fault-automat`). Listę misji podaje wywołujący – logika nie importuje samouczka.
2. **Przebieg** – `checkShift(job)`: zmiana grana `playShift` (jak przegląd) z obserwatorem; `station` – obiekt stacji
   (np. nowej, spoza `src/stations/index.js`, także z okręgami) zamiast `stationId`, `scenario` – obiekt zamiast
   `scenarioId`, `forceLevel` – poziom zamiast `disruptions` scenariusza (**sonda usterek**: scenariusz z usterkami bez
   przebiegu na poziomie none – wymuszony inny poziom albo `--level` bez none – dostaje jeden przebieg bez zakłóceń,
   który ocenia tylko wpływ usterek i bezpieczeństwo). Obserwator co takt automatu zapisuje przyczynę postoju każdego
   pociągu (`Traffic.waitReason`, a także pociąg u sąsiada po planowym wyprawieniu – `neighbour-wait` – i pociąg ze
   składu, którego skład nie przyszedł – `unit-wait`; bez postoju do planowego odjazdu), minuty postoju przy czynnej
   usterce na drodze pociągu, które usterki dotknęły których pociągów, chwilę obsłużenia, odjazd pociągu stojącego od
   początku zmiany (silnik nie zgłasza go zdarzeniem); przy postoju ponad 2 min – przeszkody przebiegów od
   sygnalizatora (`Interlocking.routeProblems` z polami `section` / `point` / `route` / `exit`) przypisane pociągowi,
   który zajmuje odcinek albo ma na nim przebieg nastawiony lub nastawiany (`by`), albo usterce; położenie zwrotnic
   własnego przebiegu na nastawni mechanicznej (`point-position`) to nie przeszkoda z zewnątrz. Przy przyjęciu na inny
   tor – kto w tej chwili zajmował tor planowy i czy plan sam kładzie tam inny pociąg. W chwili końca zmiany – migawka
   pociągów nieobsłużonych (gdzie stoją, od kiedy, przyczyna, przeszkody, pociąg na szlaku, ostatnie wpisy dziennika z
   ich numerem – pole `nr` wpisów i zdarzeń oceny). Przebieg trwa do końca zmiany + `--extra` min (domyślnie 120), ale
   kończy się wcześniej, gdy po końcu zmiany wszystko jest obsłużone i urządzenia są w stanie zasadniczym (ten sam ruch
   co bez skrótu). Raport (zwykły obiekt, przechodzi między wątkami i do JSON): pociągi (plan i rzeczywistość, tor,
   opóźnienie wniesione – od sąsiada i ze składu – i kara na stacji z `late-depart` / `late-pass`, w tym czekanie na
   szlak, postoje), pociągi nieobsłużone na koniec zmiany i po zapasie (skład w manewrach – z zadaniem i oceną grafu
   przebiegów manewrowych), zadania (termin po przesunięciu), usterki z dotkniętymi pociągami, pociągi nadzwyczajne,
   naruszenia, zdarzenia, kary wymuszone usterką, stan urządzeń, ocena w chwili końca zmiany.
3. **Werdykt** – `verdict(raport)`: status zmiany z błędów i uwag (informacje się nie liczą).
   - BŁĘDY: naruszenie zależności, spad, rozprucie, jazda po pękniętej szynie bez takiej usterki w scenariuszu na tym
     odcinku, zator po zapasie, kara wymuszona usterką, stan urządzeń po zmianie, zadanie przepadło przed końcem
     zmiany bez usterki, wyjątek, zmiana bez pociągów (`no-traffic`), usterka ze scenariusza bez wpływu na ruch bez
     zakłóceń (także w sondzie usterek); pociąg nieobsłużony na koniec zmiany: bez opóźnienia wniesionego i mniej niż
     4 min przed końcem wg planu (`plan-tight`), bez zakłóceń – każdy poza usterką (`unfinished-plan`, z planem i
     przyczyną), przy zakłóceniach – gdy wg planu i opóźnienia od sąsiada zdążyłby, a ≥ 5 min stał z winy stacji
     (`unfinished`; nie liczy się szlak, usterka, pociąg opóźniony z zewnątrz – nadzwyczajny, od sąsiada, ze składu,
     czekający ≥ 2 min na szlak – ani cudzy przebieg bez ustalonego pociągu); bez zakłóceń kara na stacji ≥ 15 min.
   - UWAGI (na poziomie gracza część z nich to informacje): pociągi opóźnione od sąsiada albo ze składu, które nie
     zdążą przed końcem (`late-inbound` – z tym samym zapasem co `sc-slack`), kaskada (`cascade`), zapas do końca zmiany
     < 5 min (`margin`, m:ss), kara na stacji – bez zakłóceń każda, przy zakłóceniach od 5 min – przetrzymanie albo
     postój ≥ 5 min wg przyczyny: szlak (`line-capacity`), konflikt z pociągiem albo cudzym przebiegiem
     (`track-conflict`), inna przeszkoda z zewnątrz (`station-delay`), bez przeszkody z zewnątrz (`automat-delay` –
     zwłoka automatu albo przyczyna nieznana), odjazd pociągu stojącego od początku zmiany po planie (bez kary w grze),
     inny tor (`wrong-track`, z pociągiem na torze planowym), zadanie po terminie / nierozstrzygnięte / przepadłe przy
     usterce, zadanie po końcu zmiany (`task-after-end` – bez kary w grze), niewykonany obowiązek blokady.
   - INFORMACJE: pociągi nadzwyczajne bez obsługi do końca zmiany (`extra-after-end` – planowane w zmianie, nie zdążyły
     przez opóźnienie w ruchu), automat czeka na naprawę (`fault-wait`, z oznaczeniem usterki losowej poziomu), usterki, których
     automat nie usuwa, i jazda po pękniętej szynie z usterki scenariusza (`automat-limit`), odjazd przed planem
     pociągu stojącego od początku zmiany (`early-depart`). Progi to stałe silnika: kara za przetrzymanie od 2 min /
     przed semaforem od 4 min, za przelot od 3 min, termin zadania + 10 min, opóźnienia od sąsiada poziomów.

**Lista przyjętych uwag** (`tests/scenario-accepted.js`, `deterministicWarnings`): uwagi powtarzalne – definicji
i przebiegu bez zakłóceń – każdego scenariusza. `npm test` nie przechodzi, gdy dojdzie uwaga spoza listy (nowy
scenariusz albo zmiana silnika / automatu pogarszająca znany); komunikat testu podaje gotowy wiersz do przyjęcia.

Automat steruje zależnościami wprost (`sim.execute`), więc sprawdza rozkład i zależności, a nie obsługę pulpitu:
warianty różniące się tylko widokiem stanowiska dają ten sam ruch, a srk z innymi parametrami zależności (nastawnia
mechaniczna – ręczne zwrotnice, blok przebiegowy, czasy) – inny. Wydruk w terminalu: stacje z błędami walidacji
(raz), dla każdego scenariusza ocena z liczbą zmian z uwagami przy zakłóceniach, definicja (błędy, do 6 uwag, do 3
informacji), wiersz każdej zmiany (werdykt, koniec, zapas, wynik; † – sonda usterek), błędy z przeszkodami
i dziennikiem pociągu, uwagi i informacje o pojedynczych pociągach w jednym wierszu na rodzaj (z pierwszym
blokującym pociągiem), przy wymuszonym poziomie losowym – rodzaje uwag powtarzające się we wszystkich ziarnach,
wiersz „Odporność”; `--verbose` – pełne ustalenia, tabela pociągów, zadania, usterki; na końcu podsumowanie
(scenariusze wg oceny, uwagi powtarzalne, zmiany wg werdyktu, błędy, uwagi na poziomie scenariusza, odporność,
informacje, czas).

**Kara „nieobsłużony”** (`Simulation.#finalScore`): −10 za pociąg nieobsłużony na koniec zmiany (`unfinished`), ale nie
za pociąg, którego nie dało się obsłużyć przez opóźnienie wniesione z zewnątrz – `Traffic.lateFromOutside`: opóźnienie
od sąsiada albo składu, z którego pociąg powstaje (`inboundLag`, `unitLag` – ta sama liczba co przy karze za
przetrzymanie), a planowa obsługa przesunięta o nie (`expectedDone`) wypada mniej niż `LATE_SLACK` (4 min) przed końcem.
Taki pociąg dostaje pozycję 0 pkt `unfinished-late` (z polem `lag`), w raporcie zostaje na liście nieobsłużonych
z `excused` („opóźniony od sąsiada, bez kary”), a kafelek pociągów nie jest czerwony, gdy wszystkie nieobsłużone są
takie. Werdykt automatu (`late-inbound`) liczy to samo tymi samymi funkcjami. Testy: `tests/unfinished-late.test.js`,
`tests/e2e/report.spec.js`.

**Pociąg nadzwyczajny** (poziom „duże”, `Simulation.#planExtraTrains`): kopia losowego pociągu przelotowego z rozkładu
stacji przesunięta o 25…70 min (`EXTRA_TRAIN`), mieszcząca się w zmianie (`extraTrainShifts`): zapowiedź 25 min przed
przyjazdem nie przed startem, ostatnie zdarzenie co najmniej 10 min przed końcem. Losowania są dwa jak dotąd (pociąg,
przesunięcie): gdy wylosowany pociąg się mieści, zmiana przebiega jak przedtem; inaczej z tych samych liczb wychodzi
pociąg i przesunięcie spośród mieszczących się, bez dodatkowych losowań (reszta zakłóceń zmiany ta sama); gdy żaden
się nie mieści – zmiana bez nadzwyczajnego (`extra-none` w kontroli definicji). Test: `tests/extra-trains.test.js`.

**Luki silnika i automatu** (zgłaszane przez automat jako informacje albo uwagi, do decyzji właściciela): pociąg
stojący od początku zmiany nie dostaje zdarzenia „odjazd” – silnik nie trzyma go do planowego odjazdu (stan
„zatrzymany”, nie „postój”), więc automat wyprawia go od razu, a odjazdu po planie nie karze;
automat nie zeruje licznika osi, nie zamyka toru z usterką nawierzchni, nie podaje sygnału zastępczego na wjeździe
(tylko na wyjeździe przy usterce blokady) i nie mówi, na co czekał, gdy stoi bez przeszkody z zewnątrz.

## Plan rozwoju

1. Edytor stacji (przeglądarkowy, eksport JSON) – rejestr kostek i walidator są gotowe.
2. Dziennik ruchu R-146 wypełniany przez gracza (opcja trudności).
3. Tryb sieciowy: kilka posterunków na jednej linii (serwer trzyma `Simulation`, klienci wysyłają `press/pull`).
4. Więcej kostek: rozjazd krzyżowy, tarcze ostrzegawcze, przejazdy, wskaźniki W.
