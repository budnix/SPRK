# Architektura

```
src/
  core/        EventBus (zdarzenia), Clock (czas symulacji), Random (ziarno, poziomy zakłóceń)
  data/        glossary (słownik skrótów Ie-1 / Ir-1 – dymki samouczka, instrukcja, podpowiedzi przycisków)
  tiles/       directions (porty), registry (rejestr typów kostek + schemat pól), controls (pola przycisków
               grupowych stanowiska – miejsce na pulpicie, bez DOM)
  model/       categories (kategorie pociągów: prędkość, dynamika, etykieta), normalize (podział łącznic na odcinek na zwrotnicę, bez DOM), Topology (graf toru z kostek), Interlocking (zależności), Block (blokada Eap / jednokierunkowa /
               samoczynna SBL + AI sąsiada + zapowiadanie telefoniczne), Train (ruch pociągu, manewry, rozkazy),
               Traffic (rozkład, ruch, zadania manewrowe), Faults (usterki), Comms (łączność), Score (ocena),
               Operator (automat dyżurnego / nastawni), Simulation (spięcie, scenariusze), validate (walidacja stacji)
  srk/         registry (strategie systemów srk: parametry zależności, rodzaj stanowiska – bez DOM),
               buttons (protokół przycisków typu E: uzbrojenie, obsługa dwuprzyciskowa → polecenia zależnościowe – bez DOM),
               address (protokół IZH-111: przyciski adresowe + rozkazy → polecenia zależnościowe – bez DOM),
               views (fabryki widoków stanowisk, podpowiedzi, instrukcja – warstwa UI)
  render/      PanelView (wspólna baza i kontrakt widoków stanowisk),
               DeskRenderer (SVG pulpitu kostkowego typu E), IzhRenderer (pulpit ciemny IZH-111), ScreenRenderer
               (monitor stanowiska komputerowego wg Ie-104), deskParts (części wspólne pulpitów kostkowych: rama,
               kostki z planu, perony, blokada, przyciski pod palcem), tileArt / izhArt (grafika kostek),
               refKey (klucz elementu obsługi, wspólny dla widoków), screens (podział szerokiego pulpitu na ekrany),
               platforms (geometria peronów, bez DOM), blockLayout (kostki blokady liniowej, bez DOM),
               edges (geometria stałych pól skrajnych, bez DOM), zoom (rachunki powiększenia, bez DOM), thumbnail (miniatury planów – SVG jako tekst, bez DOM),
               tileArt (grafika kostek), svg (helpery)
  tutorial/    missions (kroki misji, bez DOM), progress (silnik misji, bez DOM), Tutorial (dymki, podświetlenie, słownik)
  ui/          SidePanel (rozkład, dziennik, stan, rozkazy, łączność, polecenia), Help (instrukcja + słownik),
               dialog (wspólne zachowanie okien pełnoekranowych), DeskViewport (powiększenie i dopasowanie pulpitu),
               Settings (ustawienia, motyw wg systemu), settingsSchema (opis ustawień, bez DOM), SettingsScreen,
               StartScreen (misje i posterunki, odprawa), Report, EdgePanels (stałe pola skrajne), brand (logo, skala
               trudności), icons, dom (helpery), drag (przeciąganie okienek), noBounce (blokada przesuwania strony)
  i18n/        index (t, setLang, applyDom), pl / en / de (słowniki interfejsu)
  stations/    definicje stacji + rejestr (Szkolna, Sopot, Gdynia Orłowo, Chylonia, Główna, Rumia, Reda, Tczew, Pruszcz Gdański, Gdańsk Główny)
tests/         node --test (logika bez przeglądarki) + tests/e2e (Playwright, wzorce zrzutów)
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

Stacja deklaruje `srk: 'E' | 'komputerowe' | 'izh111'` (domyślnie `E`). Strategia to wpis w rejestrze
(`registerSrk({ id, name, description, view, model, input? })`):

* `model` – parametry przekazywane do `Interlocking` (np. `armTimeout`: 6 s na drugi przycisk pulpitu,
  60 s na wskazanie końca przebiegu na monitorze). Logika zależności (utwierdzenie, zwalnianie odcinkowe,
  ochrona boczna, liczniki, blokady) jest **wspólna** – to cechy ruchu kolejowego, nie stanowiska.
* `input` – protokół obsługi stanowiska (bez DOM): `(ilk, bus, model) => { press, pull, pressCompound, cancel,
  tick, armed }`. Bez niego obowiązują przyciski typu E (`src/srk/buttons.js`); `izh111` ma protokół „adres +
  rozkaz” (`src/srk/address.js`). Opcje zależności tej strategii: `timedRelease`, `shuntTimedRelease`,
  `timedReleaseAlways` (IZH-111: Zcz zwalnia po 120 s, przebieg manewrowy bezzwłocznie).
* `view` – rodzaj stanowiska: `desk` (DeskRenderer, przyciski dwuprzyciskowe), `izh` (IzhRenderer: pulpit ciemny,
  przyciski adresowe i grupa rozkazów) lub `screen`
  (ScreenRenderer: schemat na ciemnym tle, menu poleceń elementu, polecenia specjalne z potwierdzeniem).
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
    `release` (`emergency?`), `substitute`, `point`, `derailer`, `lock`, `block` – bez przycisków i bez uzbrojenia.
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
protokół obsługi w `src/srk/`, bez DOM); lista kroków jest w `CLAUDE.md`. Różnice w samych zależnościach (np. brak
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
peron, koniec toru, postój do odjazdu, zakończył bieg; tor, czoło, tryb – ikony z `src/ui/icons.js`: czoło pojazdu z lampami
(Pc1: trzy światła = jazda pociągowa, jedno = manewrowa) i sylwetka lokomotywy zwrócona w stronę jazdy; po zatrzymaniu przyciski jazda manewrowa /
pociągowa i zmiana czoła – dawniej sekcja „Manewry” w Stanie), Stan, Rozkazy, Łączność, Polecenia (tylko stacje z okręgami – obecnie żadna w grze, mechanizm testowany na
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
* Przejazd: semafor na Stój po zajęciu pierwszego odcinka za nim; zwalnianie odcinkowe; droga ochronna
  zwalnia się po wjeździe na tor docelowy.
* Zwalnianie: Pz (natychmiast lub czasowo 90 s przy zajętym odcinku zbliżania), dPz (doraźne, licznik).
* Zwrotnice: Zw + przycisk, blokada przy zajętości / utwierdzeniu / zamknięciu (Zz); rozprucie przy najeździe z ostrza.
* Blokada Eap: Wbl (żądanie pozwolenia), Poz (danie pozwolenia), Ko (zwolnienie bloku końcowego po przyjeździe
  w całości), dPo/dKo (doraźne, liczniki); blokada samoczynna SBL: bez pozwoleń i Ko, Zk (zmiana kierunku).

## Monitor stanowiska komputerowego (`src/render/ScreenRenderer.js`)

Zobrazowanie wg Ie-104 (kolory odcinków, stany sygnalizatorów, pole „Z” zwrotnicy, ramki selekcji i alarmu).
Uproszczenia dla czytelności: semafory i tarcze rysowane na linii toru w miejscu ustawienia (grot w kierunku jazdy,
bez masztu, nazwa po prawej stronie toru w kierunku jazdy), numery torów w ramkach „tor N” na linii (opisy kostek
`label` w formie „tor N · …” są skracane – `ScreenRenderer.labelText`), perony jako szare prostokąty z nazwą
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
i `edges.update()` po każdej zmianie powiększenia. Opcja menu `edgePanels`, domyślnie wyłączona.

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
`route:set`). Blokada zna numer pociągu na torze szlakowym (`lineTrain`: nasz od wyjazdu do potwierdzenia przyjazdu,
sąsiada od wyprawienia do zjazdu w całości); monitor pokazuje go w menu strzałki szlaku pod separatorem, po
poleceniach, jako czerwone kasetki z samymi numerami (`lineTrains`: pociąg na szlaku pełną kasetką, potem w kolejce
pociągi zgłoszone przez sąsiada i czekające – konturem) – jak system śledzenia numerów w komputerowych srk, tylko na
żądanie, bo przy szlakach dwutorowych nie ma miejsca na kasetkę przy strzałce; pulpit kostkowy – nie.
Na monitorze stan blokady rysuje `ScreenRenderer.#exitMark` przy wyjeździe (`blockRefs`), a polecenia
daje menu elementu końca toru (`#blockMenu`); pulpit kostkowy rysuje blokadę jako kostki przy końcu toru szlakowego
(`src/render/blockLayout.js`, bez DOM: strzałki na kostkach toru, przyciski Ko | Poz | Wbl albo Zk w rzędzie obok,
liczniki dKo | dPo wyżej – jak na pulpitach typu E), bez osobnej kostki `block`.
Perony na pulpicie kostkowym: `DeskRenderer.#buildPlatforms` rysuje obrys z nazwą z tej samej geometrii
(`platformSpans`); krawędź peronowa od strony toru peronowego to podwójna kreska (`edges`, `platformEdgeLines`) na obu stanowiskach. Opis „tor N” na pulpicie mieści się na jednej kostce (`trackLabelText` pomija dopisek „· Peron …”),
jest rysowany delikatnie, zawsze nad opisywanym torem, na prostej kostce toru tuż nad paskiem (`trackLabelPlace`);
własna kostka opisu zostaje pusta, więc opis nigdy nie leży na obrysie peronu.

## Ekran startowy (`src/ui/StartScreen.js`)

Misje wprowadzające (scenariusze z `tutorial`, `missionList`) u góry; niżej karty posterunków z `location`, `traffic`,
`difficulty` (gwiazdki) i etykietą stanowiska, sortowane alfabetycznie lub wg trudności (`sortStations`, wybór
zapamiętany w localStorage). Układ dwuetapowy: przewijana lista (misje, potem posterunki) po lewej, „tor” ze strzałką i odprawa (briefing) po prawej –
miniatura, opis i parametry zmiany (scenariusz, zakłócenia, ziarno; okręg tylko dla stacji z `districts`) albo, dla misji, opis i liczba kroków.
Na wąskim ekranie odprawa staje pod wybraną kartą. Ekran startowy leży nad dymkami samouczka i menu (z-index).
Karty i odprawa (briefing) mają miniatury planów z `src/render/thumbnail.js` (SVG jako tekst z definicji kostek, bez DOM).
Funkcje sortowania, listy misji i miniatur są bez DOM – testowane w Node.

## Koniec zmiany i raport (`src/model/Score.js`, `src/ui/Report.js`)

Zmiana kończy się sama (`Simulation.#checkEnd`), gdy ostatni pociąg rozkładu jest wyprawiony na szlak (status
„odjechał” – nie czeka na dojazd do sąsiada; status na szlaku nie wraca do „jedzie”) i zadania manewrowe są wykonane
albo przepadły (`Traffic.isDone`); inaczej o `endTime` scenariusza. Gdy rozkład jest wyczerpany (3 min po ostatnim
czasie rozkładu / terminie zadania), a zmiana trwa, dziennik dostaje jedną podpowiedź „Rozkład wyczerpany – do
zakończenia zmiany: …” z pociągami stojącymi na stacji i zadaniami. `sim.report()` (także w trakcie) daje pełny
raport: ocena i punkty, wiersze pociągów (plan / rzeczywistość / tor / opóźnienie / stan), punktualność, zadania,
bilans zdarzeń wg kodu, liczniki dPz/Sz/dPo/dKo/rozprucia i dane zmiany (`endReason`: all-done | time | manual).
`Report` rysuje go jako pełny ekran w motywie ekranu startowego (ocena z gwiazdkami, kafelki, tabele) z przyciskami
„Nowa zmiana…” (ekran startowy), „Zagraj ponownie” i powrotem do pulpitu; otwiera się na `shift-end` i z menu.

## Misje wprowadzające (`src/tutorial/`)

* Każdy samouczek ma własny plik w `src/tutorial/missions/` (`monitor.js`, `pulpit.js`, `izh.js`) z własnym
  słownikiem tekstów (`phrases`) i własną listą kroków (`steps()`), więc każda misja może pokazywać obsługę po
  swojemu. Wspólne lekcje rozkładu Szkolnej są w `lessons.js` (`lessonSteps(phrases)`); misja składa z nich swój
  samouczek funkcją `withSteps(base, { after, before, replace, omit })` – dokłada własne kroki, podmienia albo
  pomija lekcję. Misja 3 ma przed lekcjami rozgrzewkę z rozkazami pulpitu IZH-111 (zwrotnica „−” / „+”, STOP, Zw,
  Zcz) i zaczyna się o 06:54, żeby zmieścić ją przed pierwszym pociągiem. `phrases.js` – cegiełki wspólne dla
  kilku misji, `missions.js` – rejestr (`MISSIONS`, `getMission`, `missionSteps`).
* Kroki misji bez DOM: `{ id, title, text, anchor, info?, done(sim, ctx), wrong?(sim, ctx), tip? }`.
  W misji (`scenario.tutorial`) zmiana nie kończy się sama po ostatnim pociągu (`sim.autoEnd = false`) – kończy ją
  „Dalej” na ostatnim kroku (`sim.endShift()` → raport); zamknięcie samouczka przywraca automatyczny koniec.
  Jedna lista `missionSteps(view)` obsługuje monitor (`'monitor'`), pulpit kostkowy typu E (`'pulpit'`) i pulpit
  typu IZH-111 (`'izh'`, misja 3) – różnią się teksty
  i wskazywane miejsca (`anchor`: `{ ref }`, `{ block }`, `{ cmd }`, `{ el }`, `{ tab }`). Wszystko, co zależy od
  stanowiska, jest w słowniku `PHRASES[view]` (te same klucze dla każdego widoku – pilnuje tego test); kroki misji nie
  rozgałęziają się po widoku, więc nowy panel to nowy wpis w słowniku.
* `progress.js` – `MissionProgress`: kolejność kroków, warunki na stanie symulacji i zdarzeniach szyny
  (`ctx.seen`: `route:A-D1:set`, `lock:Zw3`, `sz:A`, `cancel:B` …), wstrzymanie zegara na krokach informacyjnych,
  komunikaty `wrong` (np. przebieg na zły tor). Testowany w Node skryptem „ucznia” (`tests/szkolna.test.js`).
* `Tutorial.js` – UI: dymek przypięty do elementu (`renderer.elementFor(ref)`, `cmdButton(id)`), podświetlenie `.tut-hl`,
  słownik skrótów (`src/data/glossary.js`) po kliknięciu `<abbr data-term>`, „Dalej” / „Pomiń krok” / „Pokaż gdzie”.
  Położenie dymku wybierane spośród kandydatów (pod, nad, obok elementu, pas nad planem i pod planem) wg pola
  zasłoniętego rysunku planu, elementu i pasków sterowania; dymek, słownik i pasek potwierdzenia dają się przeciągać
  (`src/ui/drag.js`) – przesunięty dymek zostaje do następnego kroku.
* Zadania manewrowe mogą zależeć od siebie (`afterTask`), więc krok „podstaw z powrotem” nie zalicza się przed
  odstawieniem, niezależnie od godziny.
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
  i przyciskiem powrotu, treść na kartach – i idą za motywem interfejsu. `dialog.js` nadaje im rolę okna dialogowego,
  przenosi fokus do okna po otwarciu i oddaje go po zamknięciu. Kolejność warstw: menu < instrukcja < raport <
  ustawienia < ekran startowy.
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
liczby na monitorze i licznikach mają stałą szerokość cyfr (`tabular-nums`). Znaki spoza czcionki (np. ✔ ☐ ■) bierze
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
* `tests/e2e/` – Playwright: `desk.spec.js` (ekran startowy: misje, sortowanie, odprawa; pulpit kostkowy: dwa przyciski, wyciągnięcie, Zw, blokada,
  ustawienia, struktura przycisków), `screen.spec.js` (monitor: pasek poleceń, menu elementu, polecenia specjalne, ekrany,
  skala symboli, perony i numery torów, sygnalizatory na linii, blokada przy wyjeździe, ustawienia domyślne, okręgi), `tutorial.spec.js` (samouczek: dymki, podświetlenie, przeciąganie, słownik, obie misje, ekran startowy nad dymkami), `visual.spec.js` (zrzuty ekranu porównywane ze wzorcami w `__screenshots__`,
  próg 300 pikseli, żeby drobne zmiany symboli też były wykrywane). Pomocniki w `helpers.js`: `openShift` (ustawienia w localStorage, zegar zatrzymany),
  `btn`/`tap` (przyciski wg `data-ref`), `simState`, `advance` (krok symulacji bez czekania).
* Wzorce zrzutów powstają w kontenerze Playwright (czcionki DejaVu) – lokalnie odświeżaj je
  `npm run test:e2e:update` tylko z tymi samymi czcionkami, inaczej porównanie w CI padnie.

## Plan rozwoju

1. Edytor stacji (przeglądarkowy, eksport JSON) – rejestr kostek i walidator są gotowe.
2. Dziennik ruchu R-146 wypełniany przez gracza (opcja trudności).
3. Tryb sieciowy: kilka posterunków na jednej linii (serwer trzyma `Simulation`, klienci wysyłają `press/pull`).
4. Więcej kostek: rozjazd krzyżowy, tarcze ostrzegawcze, przejazdy, wskaźniki W.
