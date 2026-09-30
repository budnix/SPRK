# Architektura

```
src/
  core/        EventBus (zdarzenia), Clock (czas symulacji), Random (ziarno, poziomy zakłóceń)
  data/        glossary (słownik skrótów Ie-1 / Ir-1 – dymki samouczka, instrukcja, podpowiedzi przycisków)
  tiles/       directions (porty), registry (rejestr typów kostek + schemat pól), controls (pola przycisków
               grupowych stanowiska – miejsce na pulpicie, bez DOM), repeater (lampki powtarzacza sygnalizatora
               na pulpicie typu E dla obrazu sygnału)
  model/       categories (kategorie pociągów: prędkość, dynamika, etykieta), normalize (podział łącznic na odcinek na zwrotnicę, bez DOM), Topology (graf toru z kostek; `branchGates` – kostki odcinka zwrotnicowego za ramieniem zwrotnicy), Interlocking (zależności; `onSetBranch` – czy kostka jest na drodze ustawionej zwrotnicami, widoki świecą tylko ją), Block (blokada Eap / jednokierunkowa /
               samoczynna SBL + AI sąsiada + zapowiadanie telefoniczne), Train (ruch pociągu, manewry, rozkazy; szybkość z obrazu do końca okręgu zwrotnicowego, rozjazd pod całym pociągiem),
               Traffic (rozkład, ruch, zadania manewrowe), Faults (usterki), Comms (łączność), Score (ocena),
               Operator (automat dyżurnego / nastawni), Simulation (spięcie, scenariusze), validate (walidacja stacji)
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
               granicy planu i panelu: krawędź panelu i uchwyt w listwie; rachunki `sideSize.js`, bez DOM),
               Settings (ustawienia, motyw wg systemu), settingsSchema (opis ustawień, bez DOM), SettingsScreen,
               StartScreen (misje i posterunki, odprawa), Report, EdgePanels (stałe pola skrajne), brand (logo, skala
               trudności), icons, dom (helpery), drag (przeciąganie okienek), noBounce (blokada przesuwania strony)
  i18n/        index (t, setLang, applyDom), pl / en / de (słowniki interfejsu)
  stations/    definicje stacji + rejestr (stacje treningowe misji: Szkolna, Jodłowa, Zacisze, Olszyny; Sopot, Gdynia Orłowo, Chylonia, Główna, Rumia, Reda, Tczew, Pruszcz Gdański, Gdańsk Główny)
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
    `release` (`emergency?`), `substitute`, `point`, `derailer`, `lock`, `block` – bez przycisków i bez uzbrojenia;
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
* Automat dyżurnego (`Operator.js`) nie prowadzi własnych notatek o przebiegach – pyta urządzenia: wjazd należy się
  pociągowi, który nie minął semafora wjazdowego (`train.entryPending`) i jedzie pierwszy (na SBL pociągi bywają
  w innej kolejności niż w rozkładzie); wyjazd jest „za pociągiem”, gdy minął semafor wyjazdowy (`exitAuth`). Po
  usterkach: zwalnia przebieg, którego semafor zgasł przed pociągiem, i nastawia go od nowa (poza nastawnią
  mechaniczną – tam sygnał trzyma dźwignia); zwalnia doraźnie przebieg z `routeStuck` (na nastawni mechanicznej
  najpierw dźwignia sygnałowa na „Stój”, potem zwalniacz – `tests/mech.test.js`); wydaje rozkaz „S” pociągowi za semaforem miniętym na „Stój”; przy krzyżowaniu na szlaku jednotorowym
  przyjmuje pociąg na inny tor, gdy planowy zajmuje pociąg czekający na ten sam szlak (na którymkolwiek odcinku
  przebiegu – tor bywa podzielony, np. Reda: peron I na T23, dalej T3). Testy: `tests/rumia.test.js`,
  `tests/operator.test.js`.
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
przeciwwtórność `pwl`); `fault: true` w wyniku uzasadnia Sz / rozkaz (`faultOnPath`). Pwl włącza `onExitSignal`
z `Interlocking` przy pierwszym sygnale zezwalającym przebiegu na szlak. Stwierdzenie przejazdu (`zpg`): `Train`
zgłasza minięcie pierwszego semafora stacji (`entry-signal`) → `Traffic` → `entryPassed(onSignal)`; wyjazd na Sz /
rozkaz (`exitAuth === '*'`) nie blokuje bloku początkowego (`needPo` → dPo). Czasy odpowiedzi sąsiada (Poz, potwierdzenie
przyjazdu, telefonogramy) losuje `opts.random` – `Simulation` daje każdemu szlakowi własny ciąg z ziarna zmiany, więc
to samo ziarno daje tę samą zmianę (test w `tests/disruptions.test.js`). Przy usterce (`fault`, zapowiadanie
telefoniczne) szlak jest „nasz” (`#oursUnderFault`), gdy mamy „droga wolna” dla naszego pociągu albo niewykorzystane
pozwolenie sprzed usterki (`faultDir`; zużywa je wyjazd pociągu) – sąsiad nie dostaje wtedy drogi, a naprawa zostawia
pozwolenie u nas, dopóki pociąg nie wjedzie na szlak (`setFault(false)`); testy: `tests/faults-block.test.js`. Blokada zna numer pociągu na torze szlakowym (`lineTrain`: nasz od wyjazdu do potwierdzenia przyjazdu,
sąsiada od wyprawienia do zjazdu w całości); monitor pokazuje go w menu strzałki szlaku pod separatorem, po
poleceniach, jako czerwone kasetki z samymi numerami (`lineTrains`: pociąg na szlaku pełną kasetką, potem w kolejce
pociągi zgłoszone przez sąsiada i czekające – konturem) – jak system śledzenia numerów w komputerowych srk, tylko na
żądanie, bo przy szlakach dwutorowych nie ma miejsca na kasetkę przy strzałce; pulpit kostkowy – nie.
Na monitorze stan blokady rysuje `ScreenBase.#exitMark` przy wyjeździe (`blockRefs`), a polecenia
daje menu elementu końca toru (`#blockMenu`); pulpit kostkowy rysuje blokadę jako kostki przy końcu toru szlakowego
(`src/render/blockLayout.js`, bez DOM: strzałki „odjazd” / „przyjazd” na kostkach toru – żądania migają na nich,
przyciski Ko | Poz | Wbl albo Zk w rzędzie obok – lampka Ko i Pwl, liczniki dKo | dPo wyżej – jak na pulpitach typu
E; `deskParts.updateBlockLamps`), bez osobnej kostki `block`.
Perony na pulpicie kostkowym: `DeskRenderer.#buildPlatforms` rysuje obrys z nazwą z tej samej geometrii
(`platformSpans`); krawędź peronowa od strony toru peronowego to podwójna kreska (`edges`, `platformEdgeLines`) na obu stanowiskach. Opis „tor N” na pulpicie mieści się na jednej kostce (`trackLabelText` pomija dopisek „· Peron …”),
jest rysowany delikatnie, zawsze nad opisywanym torem, na prostej kostce toru tuż nad paskiem (`trackLabelPlace`);
własna kostka opisu zostaje pusta, więc opis nigdy nie leży na obrysie peronu.

## Ekran startowy (`src/ui/StartScreen.js`)

Misje wprowadzające (scenariusze z `tutorial`, `missionList`) u góry; niżej karty posterunków do służby (`dutyStations` – bez
stacji szkoleniowych, czyli tych, które mają misję; ich zmiany są tylko do testów i przez adres URL) z `location`, `traffic`,
`difficulty` (gwiazdki) i etykietą stanowiska, sortowane alfabetycznie lub wg trudności (`sortStations`, wybór
zapamiętany w localStorage). Układ dwuetapowy: przewijana lista (misje, potem posterunki) po lewej, „tor” ze strzałką i odprawa (briefing) po prawej –
miniatura, opis i parametry zmiany (scenariusz, zakłócenia, ziarno; okręg tylko dla stacji z `districts`) albo, dla misji, opis i liczba kroków.
Na wąskim ekranie odprawa staje pod wybraną kartą. Ekran startowy leży nad dymkami samouczka i menu (z-index).
Karty i odprawa (briefing) mają miniatury planów z `src/render/thumbnail.js` (SVG jako tekst z definicji kostek, bez DOM).
Funkcje sortowania, listy misji i miniatur są bez DOM – testowane w Node.

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
`Report` rysuje go jako pełny ekran w motywie ekranu startowego (ocena z gwiazdkami, kafelki, tabele) z przyciskami
„Nowa zmiana…” (ekran startowy), „Zagraj ponownie” i powrotem do pulpitu; otwiera się na `shift-end` i z menu.

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
  inny niż planowy nie jest karane, gdy trwa usterka zwrotnicy albo odcinka albo semafor wyjazdowy toru planowego
  ma usterkę (tak jak uzasadnione Sz).

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
  bez końca). Skład przekazany jako nowy pociąg (`unit`) traci zezwolenie pociągu, którym przyjechał
  (`Train.clearAuthority`) – rusza dopiero na sygnał semafora wyjazdowego. Test: `tests/unit-handover.test.js`.
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
* `tests/invariants.js` – niezmienniki bezpieczeństwa sprawdzane w każdym takcie (dwa pociągi na odcinku, odcinek
  w dwóch przebiegach, sygnał zezwalający bez przebiegu albo na zajęty odcinek – poza nastawnią mechaniczną,
  zwrotnica przestawiana pod taborem, dwa pociągi na jednym torze szlakowym) oraz zdarzenia „spad” i „rozprucie”.
  Wspólne dla macierzy, testów usterek i przeglądu; sprawdza je `tests/invariants.test.js`.
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
    naprawiony, gdy SZ czeka na potwierdzenie (wynik utrwalony); nastawnia mechaniczna – drążek w położeniu pośrednim
    przy zajętości toru docelowego z usterki, usterka semafora i bloku przebiegowego tego samego semafora (Sz
    i zwalniacz), usterka napędu zwrotnicy w Olszynach;
  – `faults-shunt.test.js` – zadania manewrowe Szkolnej przy usterce na drodze manewru (sygnalizator bez Ms2, napęd
    zwrotnicy, fałszywa zajętość – przed manewrem i w czasie jazdy): krótka bez kar, długa – obecne zachowanie (automat
    czeka na naprawę); ochrona drogi pociągu na Sz / rozkaz „S” (zwrotnicę trzyma utwierdzenie przebiegu albo Zz);
  – `faults-stations.test.js` – usterki na pozostałych stacjach: przebiegi wieloetapowe (Sopot A → H → O i L → C,
    Chylonia G502 → A502 – semafor pośredni, zajętość drugiego stopnia, semafor wyjazdowy), Rumia / Jodłowa / Brzezina
    (Eap jednokierunkowa i SBL: semafor wjazdowy i wyjazdowy, tor docelowy, napęd zwrotnicy, dKo / dPo przy Sz
    i rozkazie), dwa pociągi po sobie na SBL bez łączności, jazda po torze lewym w Sopocie jako odpowiedź na usterkę.
  Stan po naprawie (`leftovers`) obejmuje też blok początkowy zablokowany bez pociągu i niewykorzystane pozwolenie
  albo kierunek Eap.
  Błąd silnika znaleziony takim testem zostaje testem `todo` (uruchamia się, ale nie psuje wyniku) do poprawki, która
  zmienia go na zwykły test. Otwarte `todo` (w `faults-shunt.test.js`): brak zezwolenia dyżurnego na minięcie
  sygnalizatora manewrowego z usterką (reguła do potwierdzenia). W `faults-stations.test.js`: odstęp SBL zostaje zajęty po naprawie,
  gdy przy zapowiadaniu pojechał nasz pociąg torem lewym, a potem pociąg sąsiada (`poBlocked`); zapytanie o drogę
  telefonogramem dla jazdy po torze lewym odrzucane (Comms szuka pociągu po szlaku z rozkładu).
* `scripts/survey.mjs` (`npm run survey`) – przegląd silnika: każda stacja × scenariusz × poziom zakłóceń × ziarno
  (domyślnie poziomy high i low, ziarna 1–4; scenariusz z własnym poziomem, np. „szczyt”, idzie raz na ziarno), pełna
  zmiana plus `--extra` minut z automatem, równolegle w `worker_threads`. Dla każdej zmiany: pociągi, które nie
  dojechały, naruszenia niezmienników (w każdym takcie), spad i rozprucie, kary za czynności wymuszone usterką
  (`unjustified`), stan urządzeń po zmianie (`leftovers` – liczony tylko bez zatoru), liczniki dPz i Sz, wynik oraz odcisk
  przebiegu ruchu (`fingerprint`). `--json` zapisuje wyniki, `--compare` porównuje je z zapisanymi (gorzej / lepiej /
  nowe zatory / inny przebieg przy tych samych wskaźnikach) – przed zmianą w silniku i po niej. Kod wyjścia 1 przy
  zatorze, naruszeniu, spad, rozpruciu, karze wymuszonej usterką albo pozostałościach po zmianie. Pełny przegląd (ok. 35 s na 10 rdzeniach) nie wchodzi do `npm test`;
  jego czyste funkcje sprawdza `tests/survey.test.js`.
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
