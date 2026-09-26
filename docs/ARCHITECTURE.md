# Architektura

```
src/
  core/        EventBus (zdarzenia), Clock (czas symulacji)
  tiles/       directions (porty), registry (rejestr typów kostek + schemat pól)
  model/       Topology (graf toru z kostek), Interlocking (zależności typu E),
               Block (blokada Eap / jednokierunkowa + AI sąsiada + zapowiadanie telefoniczne),
               Train (ruch pociągu, manewry, rozkazy), Traffic (rozkład, ruch, zadania manewrowe),
               Faults (usterki), Comms (łączność), Score (ocena), Simulation (spięcie, scenariusze),
               validate (walidacja definicji stacji)
  srk/         registry (strategie systemów srk: parametry zależności, rodzaj stanowiska – bez DOM),
               views (fabryki widoków stanowisk, podpowiedzi, instrukcja – warstwa UI)
  render/      DeskRenderer (SVG pulpitu kostkowego), ScreenRenderer (monitor stanowiska komputerowego),
               screens (podział szerokiego pulpitu na ekrany wg szerokości okna), tileArt (grafika kostek), svg (helpery)
  ui/          SidePanel (rozkład, dziennik, stan), Help (instrukcja), Settings, StartScreen, Report
  stations/    definicje stacji + rejestr
tests/         node --test (logika bez przeglądarki)
docs/          format stacji, architektura, źródła
```

## Zasady

* **Model nie zna DOM.** `Simulation` działa w Node (testy) i w przeglądarce. Renderer i panel boczny
  subskrybują zdarzenia (`section`, `point`, `signal`, `route`, `block`, `log`, `tick`, `armed`, `alarm`).
* **Kostki są danymi.** Typ kostki = wpis w rejestrze (`registerTile`): porty, wyjścia, schemat pól.
  Renderer dobiera grafikę po `type`. Edytor będzie iterował `listTileDefs()`.
* **Tablica zależności z topologii.** Autor stacji nie wpisuje przebiegów ręcznie – wystarczą kostki,
  sygnalizatory i odcinki. Nadpisania przez `routes.override`.
* **Ruch po rzeczywistym torze.** Pociąg jedzie po kostkach zgodnie z bieżącym położeniem zwrotnic
  (nie po „ścieżce przebiegu”), więc jazda na Sz, rozprucie, manewry działają naturalnie.
* **Stan serializowalny.** `Simulation.snapshot()` – podstawa pod zapis gry i tryb sieciowy
  (serwer autorytatywny + klienci-renderery).

## Strategie systemów srk (`src/srk/`)

Stacja deklaruje `srk: 'E' | 'komputerowe'` (domyślnie `E`). Strategia to wpis w rejestrze
(`registerSrk({ id, name, description, view, model })`):

* `model` – parametry przekazywane do `Interlocking` (np. `armTimeout`: 6 s na drugi przycisk pulpitu,
  60 s na wskazanie końca przebiegu na monitorze). Logika zależności (utwierdzenie, zwalnianie odcinkowe,
  ochrona boczna, liczniki, blokady) jest **wspólna** – to cechy ruchu kolejowego, nie stanowiska.
* `view` – rodzaj stanowiska: `desk` (DeskRenderer, przyciski dwuprzyciskowe) lub `screen`
  (ScreenRenderer: schemat na ciemnym tle, menu poleceń elementu, polecenia specjalne z potwierdzeniem).
  Widoki dobiera `src/srk/views.js` (`createView`, `viewSize`, `armHint`, `viewHelp`); model ich nie importuje.
* Obydwa widoki wysyłają do symulacji te same `press(ref)` / `pull(ref)`; stanowisko komputerowe składa
  polecenia dwuprzyciskowe (Zw+zwrotnica, Pz+semafor) samo, a `AutoOperator` i testy działają identycznie
  niezależnie od strategii.
* Gracz może wymusić stanowisko w ustawieniach (`srk: auto | E | komputerowe`) – przydatne do porównania
  obsługi tej samej stacji na pulpicie i na monitorze.

Dodanie nowego systemu (np. mechanicznego z pulpitem kluczowym, EbiScreen, ILTOR): wpis w `registry.js`
(parametry) + ewentualny nowy widok w `views.js` / `render/`. Różnice w samych zależnościach (np. brak
liczników, inne zwalnianie) należy dodawać jako opcje `Interlocking` sterowane przez `model`, nie jako
osobne kopie logiki.

## Ekrany pulpitu

Szeroka stacja (100+ kolumn) na tablecie jest nieczytelna w całości. `planScreens(station, okno, maxKolumn)` dzieli
pulpit na ekrany programowaniem dynamicznym: koszt cięcia = elementy głowicy w sąsiednich kolumnach, kara za ekran
szerszy niż limit lub węższy niż połowa limitu, koszt każdego dodatkowego ekranu; liczba ekranów wybierana spośród
n₀−1, n₀, n₀+1. Renderer ma jedną instancję – ekran to tylko zmiana `viewBox` (`setView`), więc polecenie zaczęte na
jednym ekranie kończy się na drugim. Przełączanie: zakładki w listwie, strzałki ← →, przesunięcie palcem.

## Pętla

`main.js` → `requestAnimationFrame` → `sim.step(realDt)` → `Clock.advance` → kroki po 0,5 s symulacji:
`Block.tick` → `Traffic.tick` (pociągi, zajętość) → `Interlocking.tick` (zwrotnice, przebiegi, zwalnianie).

## Zależności typu E – skrót

* Przebieg: dwa przyciski (początek, koniec) → sprawdzenie warunków → automatyczne przestawienie zwrotnic
  (nastawianie przebiegowe) → utwierdzenie (odcinki białe) → obraz sygnałowy (Ie-1: S1–S5, S10–S13, Ms2, Sz).
* Przejazd: semafor na Stój po zajęciu pierwszego odcinka za nim; zwalnianie odcinkowe; droga ochronna
  zwalnia się po wjeździe na tor docelowy.
* Zwalnianie: Pz (natychmiast lub czasowo 90 s przy zajętym odcinku zbliżania), dPz (doraźne, licznik).
* Zwrotnice: Zw + przycisk, blokada przy zajętości / utwierdzeniu / zamknięciu (Zz); rozprucie przy najeździe z ostrza.
* Blokada Eap: Wbl (żądanie), Poz (pozwolenie), Ko (potwierdzenie przyjazdu), dPo/dKo (doraźne, liczniki).

## Blokada liniowa (`src/model/Block.js`)

`LineBlock` obsługuje trzy warianty jednym modelem: Eap dwukierunkowa (szlak jednotorowy: Wbl/Poz/Ko), Eap
jednokierunkowa (`direction`, tylko Po/Ko) i samoczynna SBL (`block: 'sbl'`: bez pozwoleń, bez Ko, zmiana kierunku
`Zk`; nastawiony przebieg wyjazdowy „zajmuje” kierunek przez `commitOut()` wołane z `Simulation` na zdarzeniu
`route:set`). Na monitorze stan blokady rysuje `ScreenRenderer.#exitMark` przy wyjeździe (`blockRefs`), a polecenia
daje menu elementu końca toru (`#blockMenu`); pulpit kostkowy rysuje kostkę `block` z przyciskami.

## Ekran startowy (`src/ui/StartScreen.js`)

Misje wprowadzające (scenariusze z `tutorial`, `missionList`) u góry; niżej karty posterunków z `location`, `traffic`,
`difficulty` (gwiazdki) i etykietą stanowiska, sortowane alfabetycznie lub wg trudności (`sortStations`, wybór
zapamiętany w localStorage). Kliknięcie karty rozwija pod nią parametry zmiany (okręg, scenariusz, zakłócenia, ziarno).
Funkcje sortowania i listy misji są bez DOM – testowane w Node.

## Misje wprowadzające (`src/tutorial/`)

* `missions.js` – kroki misji bez DOM: `{ id, title, text, anchor, info?, done(sim, ctx), wrong?(sim, ctx), tip? }`.
  Jedna lista `missionSteps(view)` obsługuje monitor (`'monitor'`) i pulpit kostkowy (`'pulpit'`) – różnią się teksty
  i wskazywane miejsca (`anchor`: `{ ref }`, `{ block }`, `{ cmd }`, `{ el }`, `{ tab }`).
* `progress.js` – `MissionProgress`: kolejność kroków, warunki na stanie symulacji i zdarzeniach szyny
  (`ctx.seen`: `route:A-D1:set`, `lock:Zw3`, `sz:A`, `cancel:B` …), wstrzymanie zegara na krokach informacyjnych,
  komunikaty `wrong` (np. przebieg na zły tor). Testowany w Node skryptem „ucznia” (`tests/szkolna.test.js`).
* `Tutorial.js` – UI: dymek przypięty do elementu (`renderer.elementFor(ref)`, `cmdButton(id)`), podświetlenie `.tut-hl`,
  słownik skrótów (`src/data/glossary.js`) po kliknięciu `<abbr data-term>`, „Dalej” / „Pomiń krok” / „Pokaż gdzie”.
* Stacja treningowa `src/stations/szkolna.js`; scenariusz z polem `tutorial` uruchamia misję (main.js).

## Testy

* `tests/*.test.js` – logika (`node --test`), bez DOM; macierze przebiegów, pełne zmiany, luki modelu (`model-gaps`), misje (`szkolna`).
* `tests/e2e/` – Playwright: `desk.spec.js` (pulpit kostkowy: dwa przyciski, wyciągnięcie, Zw, blokada, ustawienia,
  struktura przycisków), `screen.spec.js` (monitor: pasek poleceń, menu elementu, polecenia specjalne, ekrany,
  skala symboli, perony, okręgi), `tutorial.spec.js` (samouczek: dymki, podświetlenie, słownik, obie misje), `visual.spec.js` (zrzuty ekranu porównywane ze wzorcami w `__screenshots__`,
  próg 300 pikseli, żeby drobne zmiany symboli też były wykrywane). Pomocniki w `helpers.js`: `openShift` (ustawienia w localStorage, zegar zatrzymany),
  `btn`/`tap` (przyciski wg `data-ref`), `simState`, `advance` (krok symulacji bez czekania).
* Wzorce zrzutów powstają w kontenerze Playwright (czcionki DejaVu) – lokalnie odświeżaj je
  `npm run test:e2e:update` tylko z tymi samymi czcionkami, inaczej porównanie w CI padnie.

## Plan rozwoju

1. Edytor stacji (przeglądarkowy, eksport JSON) – rejestr kostek i walidator są gotowe.
2. Dziennik ruchu R-146 wypełniany przez gracza (opcja trudności).
3. Tryb sieciowy: kilka posterunków na jednej linii (serwer trzyma `Simulation`, klienci wysyłają `press/pull`).
4. Więcej kostek: rozjazd krzyżowy, tarcze ostrzegawcze, przejazdy, wskaźniki W.
