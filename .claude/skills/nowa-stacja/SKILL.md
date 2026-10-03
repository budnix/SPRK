---
name: nowa-stacja
description: Zbudowanie nowej stacji / posterunku SPRK od zera – układ torów i sygnalizacja z planu schematycznego, szlaki i blokady, rozkład-wzorzec, zmiana podstawowa, testy stacji, źródła i dokumentacja – w kolejności, w jakiej powstawały Tczew, Pruszcz Gdański i Gdańsk Główny. Użyj zawsze, gdy właściciel prosi o dodanie stacji, miasta albo posterunku („dodaj Wejherowo”, „zrób stację z tego planu”, „nowy posterunek na linii 9”), przysyła plan schematyczny albo chce nowej stacji szkoleniowej – także wtedy, gdy mowa tylko o „torach” albo „układzie” nowego miejsca. Mapa i scenariusze mają osobne skille, do których ten prowadzi.
---

# Nowa stacja

Format definicji: `docs/STATION-FORMAT.md` – przeczytaj sekcje, których dotyczy krok, zanim zaczniesz pisać (plik jest
długi; tu jest kolejność pracy i rzeczy, których format nie mówi). Wzory: mała stacja przelotowa z odgałęzieniami –
`src/stations/pruszcz-gdanski.js`; węzeł z wieloma torami – `src/stations/tczew.js`; tory SKM i odstawcze –
`src/stations/sopot.js`.

Stacja to trzy rzeczy naraz: odwzorowanie rzeczywistego miejsca (ze źródeł), plansza do gry (musi dać się obsłużyć)
i wzorzec ruchu, z którego gra buduje służby o każdej porze doby. Kroki idą w tej kolejności, bo każdy następny
sprawdza poprzedni.

## 1. Źródła – zanim powstanie pierwsza kostka

- **Plan schematyczny stacji** (stan na konkretną datę, autor rysunku) dostarcza właściciel. Bez planu poproś o niego –
  układu torów, numerów torów i rozjazdów ani nazw semaforów się nie wymyśla (CLAUDE.md: „Nie wymyślaj zasad kolejowych”).
- **Urządzenia srk w rzeczywistości** (jaka nastawnia, LCS, od kiedy) – do `docs/sources/posterunki.md`, sekcja „Systemy srk
  stacji – stan rzeczywisty”. Z tego wynika pole `srk` i `srkInfo`.
- **Linie i sąsiednie posterunki** (numery linii PKP PLK, rodzaj blokady na każdym szlaku, liczba torów szlakowych).
- Spisz od razu, co z planu **pomijasz** i co **upraszczasz** (bocznice, tory grup towarowych, tarcze w głowicach,
  semafory do jazd po torze lewym) – trafi to do nagłówka pliku stacji, do `docs/sources/posterunki.md` i do commita.
  Czego źródło nie podaje, oznacz jako przyjęte.

## 2. Definicja: `src/stations/<id>.js`

1. **Nagłówek pliku** (komentarz): skąd układ, siatka (`desk.cols` × `desk.rows`), który tor na którym `y`, strony świata
   (zachód po lewej), semafory wg planu, uproszczenia. Następna sesja czyta stację z tego komentarza.
2. **Tory, rozjazdy, semafory** pomocnikami z `src/tiles/layout.js` (`createLayout()`: `point`, `diag`, `plain`, `stub`,
   `crossover`, `lineExit`; kostki `track`, `run`, `signal` – opis: `docs/STATION-FORMAT.md` „Budowa planu”), nie
   własnymi kopiami – pilnuje tego `tests/layout.test.js`. Wzory użycia: Pruszcz, Tczew, Gdańsk Gł. Sekcje formatu:
   „Siatka i porty”, „Typy kostek”, „Odcinki izolowane”. Długości torów stacyjnych z planu
   (`length` odcinka; od nich zależy, czy pociąg się mieści), perony przez `platform`.
3. **Szlaki** (`exits`, sekcja „Szlaki”): jeden wpis na tor szlakowy; rodzaj blokady wg źródła – bez `direction` Eap
   jednotorowa, `direction: 'out' | 'in'` linia dwutorowa, `block: 'sbl'` blokada samoczynna; `lineLength`, `lineSpeed`.
4. **Przebiegi** powstają same z układu; `routes.disable` / `override` tylko gdy plan czegoś zabrania.
5. **Stanowisko**: nowy posterunek do służby ma **jeden** rodzaj stanowiska (`srk` stacji; pilnuje `tests/catalog.test.js`
   – Rumia i Reda to wyjątki sprzed tej zasady). Przycisków stanowiska (grupowych, rozkazów, blokady) nie wpisuje się
   do definicji – rysuje je stanowisko.
6. **Karta stacji**: `name`, `description`, `location`, `traffic`, `difficulty` (1–5), `srkInfo`.
7. Wpis w `src/stations/index.js` (import i lista `STATIONS`).

Sprawdzaj na bieżąco, nie na końcu: `validateStation(def)` z `src/model/validate.js` (błędy i ostrzeżenia), a wygląd
i klikalność – `npm run dev`, potem `http://localhost:5173/?stacja=<id>`. Urwany tor albo semafor przy złej kostce
widać od razu na pulpicie; w teście – `sim.ilk.topo.tracks.filter((t) => t._openPorts)`.

## 3. Rozkład-wzorzec (`timetable`, `tasks`)

Rozkład stacji to ok. 2 h porannego szczytu (np. 05:55–08:15). Jest fikcyjny, ale ma wyglądać jak ruch tej linii –
i jest **wzorcem**, z którego `src/model/duty.js` buduje służbę o każdej porze (sekcja „Służba o wybranej porze”). Stąd:

- pociągi od sąsiadów (`from`), przeloty i postoje wg peronów z planu; `length` nie większa niż tor, na który jadą;
- co najmniej jeden **towarowy przelot** (`kind: 'tow'`, `from` i `to`) – z niego nocne pociągi towarowe biorą parametry;
- pociągi dalekobieżne z relacją pisaną nazwami stacji jak w rozkładzie PKP Intercity („Kraków Gł. – Gdynia Gł.”) –
  wtedy powtórzenia dostają nazwy rzeczywistych pociągów tej trasy (`src/model/data/namedTrains.js`);
- takt (15 / 30 / 60 min) domknięty w pełnych godzinach, bo wzorzec powtarza się co okres (`duty.period`, gdy inny);
- na szlakach jednotorowych odstępy takie, żeby sąsiad nie prosił o pozwolenie przed zwolnieniem szlaku;
- składy przechodzące w inny pociąg przez `unit`, zadania manewrowe w `tasks`.

Sprawdzenie bez grania i z graniem automatem: `npm run check -- <id>` oraz kilka pór służby:
`npm run check -- <id> --start 6 --minutes 120`, `--start 1 --minutes 180`, `--start 19 --minutes 120`.
Komunikaty i poprawki – skill `nowy-scenariusz` (krok 3); pociąg, który stoi – skill `diagnoza-zatoru`.

## 4. Scenariusze

Co najmniej zmiana podstawowa (`id: 'zmiana'`, pełny rozkład) – gracz jej nie widzi na liście (zastępuje ją służba), ale
jest wzorcem i podstawą testów. Scenariusze widoczne dla gracza to specjalne: z usterką (`faults`) albo zamknięciem
toru (`closedSections`). Każdy wariant – skill `nowy-scenariusz`.

## 5. Testy

- `tests/<id>.test.js` – wzór `tests/pruszcz-gdanski.test.js`: definicja bez błędów i urwanych torów; z każdego semafora
  wjazdowego i wyjazdowego przebiegi dokładnie na te tory i szlaki, które pozwala plan; żaden przebieg nie zawraca;
  rodzaje blokad; pełna zmiana grana automatem (`play(sim).until(end, { stop: allArrived, each })` z `tests/helpers.js`) – bez kolizji, każdy pociąg na swoim torze, bez opóźnień i przetrzymań.
- `tests/e2e/desk.spec.js` – blok jak dla Pruszcza: karta posterunku z rodzajem stanowiska, blokady szlaków, semafory
  wjazdowe obecne na stanowisku.
- Same obejmą nową stację (przechodzą po `STATIONS`): definicja i przebieg każdego scenariusza (`tests/scenario-check*.test.js`),
  siatka służb (`tests/duty-grid.js`), tabor (`tests/rollingStock.test.js`), katalog i mapa. Testy, które liczą
  posterunki albo wyliczają scenariusze, trzeba rozszerzyć – z uzasadnieniem w commicie.
- `npm test`, `npm run test:e2e` (na komputerze, bez Dockera), a po zmianie wyglądu ekranów wyboru –
  `npm run test:e2e:update`.

## 6. Mapa wyboru

Pola `region`, `geo`, `lines`, przebieg linii z OpenStreetMap, zrzuty mapy – skill `posterunek-na-mapie`.
Stacja szkoleniowa (fikcyjna, do misji) tych pól nie ma; jej misja – skill `nowe-stanowisko`, krok 4.

## 7. Dokumentacja i commit (ten sam commit)

- `docs/sources/posterunki.md`: sekcja `## <Nazwa stacji>` – plan (stan, autor, jakość skanu), co odwzorowano, „Odwzorowanie
  schematyczne: …”, „Pominięto: …”, „Rozkład jazdy fikcyjny.”; oraz wpis w „Systemy srk stacji – stan rzeczywisty”.
- `README.md` (po angielsku): wiersz w tabeli stacji – nazwa, stanowisko, trudność, jedno zdanie o tym, co tu trudne.
- `docs/ARCHITECTURE.md`: lista stacji przy katalogu `stations/`.
- Commit: „Dodaj stację <Nazwa> (plan <miesiąc rok>) – …”, a w treści trzy akapity jak w commitach Tczewa i Pruszcza:
  co jest z planu (tory, semafory, blokady), jaki jest rozkład, co pominięto; na końcu testy.

## Gdy coś nie działa

- Przebiegu brakuje albo jest ich za dużo – tor urwany między kostkami (porty się nie stykają) albo semafor stoi
  przy złej kostce (`at`); wypisz `sim.ilk.routeList()` dla jednego semafora i porównaj z planem.
- Pociąg „zawraca” na wjeździe – `dir` szlaku nie zgadza się z kierunkiem semafora wjazdowego.
- `tests/catalog.test.js` pada na stanowisku – scenariusz ma własne `srk`; nowy posterunek ma jedno stanowisko.
- Służba nocna pusta albo z zatorem – wzorzec nie ma towarowego przelotu albo szlak jednotorowy jest za gęsto obłożony.
