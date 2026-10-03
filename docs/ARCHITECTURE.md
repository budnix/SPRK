# Architektura

```
src/
  core/        EventBus (zdarzenia), Clock (czas symulacji), Random (ziarno, poziomy zakłóceń)
  data/        glossary (słownik skrótów Ie-1 / Ir-1 – dymki samouczka, instrukcja, podpowiedzi przycisków)
  tiles/       directions (porty), registry (rejestr typów kostek + schemat pól), controls (pola przycisków
               grupowych stanowiska – miejsce na pulpicie, bez DOM), repeater (lampki powtarzacza sygnalizatora
               na pulpicie typu E dla obrazu sygnału), layout (budowa planu stacji: kostki i odcinki z konwencjami
               nazw, długości i przycisków – zwrotnica, ukos, odcinek prosty, żeberko, przejście, wyjazd na szlak)
  model/       categories (kategorie pociągów: prędkość, dynamika kategorii – przyspieszenie przeliczone na masę składu, gdy pociąg nie ma taboru, etykieta; rodzaje pociągów towarowych z zał. 6.3 Regulaminu sieci), rollingStock (katalog taboru, dobór zespołu / lokomotywy dla pociągu i dynamika z taboru – przyspieszenie, hamowanie, prędkość pojazdu), normalize (podział łącznic na odcinek na zwrotnicę, bez DOM), Topology (graf toru z kostek; `branchGates` – kostki odcinka zwrotnicowego za ramieniem zwrotnicy), Interlocking (zależności; `onSetBranch` – czy kostka jest na drodze ustawionej zwrotnicami, widoki świecą tylko ją), Block (blokada Eap / jednokierunkowa /
               samoczynna SBL + AI sąsiada + zapowiadanie telefoniczne), Train (ruch pociągu, manewry, rozkazy; szybkość z obrazu do końca okręgu zwrotnicowego, rozjazd pod całym pociągiem),
               Traffic (rozkład, ruch, zadania manewrowe), Faults (harmonogram usterek), Comms (łączność), Score (ocena),
               Operator (automat dyżurnego / nastawni), Simulation (spięcie, scenariusze), validate (walidacja stacji),
               scenarioCheck (statyczne sprawdzenie scenariusza – automat sprawdzający scenariusze),
               trainPaths (drogi pociągu po przebiegach, odcinek zbliżania szlaku, tor składu);
               check/ – zmiana grana automatem bez widoku (play: `playShift`, `settled`), niezmienniki bezpieczeństwa
               (invariants), wynik po stronie urządzeń i oceny (outcome: `leftovers`, `unjustified`) – dla automatu
               sprawdzającego, przeglądu silnika, skilla diagnoza-zatoru i testów;
               faults/ – rodzaje usterek, każdy w jednym wpisie (types: cel, losowanie, automat, droga pociągu,
               początek i koniec usterki, wymagania wobec stanowiska);
               shift/ – wybór zmiany: choice (adres ⇄ wybór, opcje symulacji, służba dla ziarna), offers (co posterunek
               oferuje: służba, scenariusze specjalne, stanowiska do wyboru, stacja szkoleniowa);
               timetable/ – wpis rozkładu zmiany jako jedna funkcja (vertical slice): entry (budowa wpisu – definicja
               tylko do odczytu, plan, przebieg zmiany; godziny do pokazania `shownTime`), phase (etap pociągu – kod,
               szczegół, napis dla człowieka; „obsłużony” i „skończony”)
  srk/         registry (strategie systemów srk: parametry zależności, rodzaj stanowiska – bez DOM),
               buttons (protokół przycisków typu E: uzbrojenie, obsługa dwuprzyciskowa → polecenia zależnościowe – bez DOM),
               address (protokół IZH-111: przyciski adresowe + rozkazy → polecenia zależnościowe – bez DOM),
               monitor (polecenia stanowiska komputerowego: menu elementu i blokady szlaku jako dane – bez DOM),
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

## Dokumentacja według obszarów (`docs/architecture/`)

Ten plik to mapa modułów i zasady; szczegóły każdej części – w pliku obszaru. Zmiana w kodzie obszaru = zmiana
w jego pliku w tym samym commicie (CLAUDE.md, „Definicja ukończenia”). Nowy obszar: nowy plik tutaj i wiersz
w tabeli (pilnuje `tests/docs.test.js`).

| Plik | Obszar | Co jest w środku |
|---|---|---|
| [`stanowiska.md`](architecture/stanowiska.md) | Stanowiska obsługi (systemy srk i ich widoki) | Strategie systemów srk (rejestr, protokoły poleceń, widoki), pulpit IZH-111, nastawnia mechaniczna, monitor stanowiska komputerowego, ekrany pulpitu, stałe pola skrajne. |
| [`zaleznosci.md`](architecture/zaleznosci.md) | Zależności i blokada liniowa | Pętla symulacji, zależności typu E (przebiegi, utwierdzenie, droga ochronna, stała kontrola sygnału), zwalnianie odcinkowe, przebieg złożony, blokada liniowa. |
| [`ruch.md`](architecture/ruch.md) | Ruch, rozkład i ocena | Służba o wybranej porze (rozkład z wzorca, pora doby, pociągi z nazwami, przez północ), tabor pociągów, koniec zmiany i raport. |
| [`interfejs.md`](architecture/interfejs.md) | Interfejs gracza | Ekran startowy (mapa, lista, strona posterunku), ekran ustawień i ustawienia, wygląd interfejsu, czcionka, język interfejsu. |
| [`samouczek.md`](architecture/samouczek.md) | Misje wprowadzające | Silnik misji, kroki, dymki, stacje szkoleniowe. |
| [`testy-i-narzedzia.md`](architecture/testy-i-narzedzia.md) | Testy i narzędzia | Rodzaje testów i strażnicy zasad, przegląd silnika, szukanie testów przypadkowych, automat sprawdzający scenariusze (definicja, przebieg, werdykt, ocena). |

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
  ten sam opis dla jednego przebiegu, `Interlocking.routeLocked(stan)` – utwierdzony, `routeIsSet(id)` – to samo jednym
  pytaniem, `Interlocking.routeEntered(stan)` – pociąg w przebiegu, `routeFaultDrop(id)` – sygnał zgasł z usterki urządzeń
  (ocena Sz / rozkazu), `routeFrame(id)` – części nastawni mechanicznej (dźwignia, blok przebiegowy), `routeProgress(id)` –
  postęp pociągu w przebiegu (odcinki, zwolnione, czoło, droga ochronna, utwierdzone zwrotnice – kopie). Znaczenie stanów:
  `GLOSSARY.md` („Przebieg i jego stany”), testy: `tests/route-state.test.js`. Pilnuje tego `tests/layers.test.js`: poza
  `Interlocking.js` żaden plik źródeł, skryptów, skryptów skilli ani testów (także w przeglądarce) nie czyta
  `ilk.active`, `ilk.pending` ani pól zapisu przebiegu; testy mają pomocniki `setRoutes`, `routesBeingSet` i `routeView`
  (`tests/helpers.js`). Spójność samego zapisu (odcinek najwyżej w jednym przebiegu) sprawdzają zależności:
  `lockConflicts()` – korzysta z tego niezmiennik bezpieczeństwa.
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

## Plan rozwoju

1. Edytor stacji (przeglądarkowy, eksport JSON) – rejestr kostek i walidator są gotowe.
2. Dziennik ruchu R-146 wypełniany przez gracza (opcja trudności).
3. Tryb sieciowy: kilka posterunków na jednej linii (serwer trzyma `Simulation`, klienci wysyłają `press/pull`).
4. Więcej kostek: rozjazd krzyżowy, tarcze ostrzegawcze, przejazdy, wskaźniki W.
