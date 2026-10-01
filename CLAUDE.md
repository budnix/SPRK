# SPRK – wskazówki dla Claude Code

## Commity i pull requesty

- **Nie dodawaj żadnych stopek ani wzmianek** do commitów i PR-ów: bez `Co-Authored-By`, bez `Claude-Session`,
  bez „Generated with Claude Code”, bez linków do sesji, bez nazw modeli. Treść commita to tylko opis zmiany.
- Komunikaty commitów po polsku, w trybie oznajmującym, pierwsza linia do ~70 znaków.
- Pracuj bezpośrednio na `main`, chyba że użytkownik poprosi o gałąź.
- Przed pushem: `npm test` musi przechodzić; przy zmianach w UI także `npm run test:e2e`
  (Playwright; lokalnie: `SPRK_CHROMIUM=/ścieżka/do/chromium` gdy przeglądarka nie jest pobrana).
  Wzorce zrzutów ekranu leżą w `tests/e2e/__screenshots__`; po zamierzonej zmianie wyglądu odśwież je
  `npm run test:e2e:update` i uzasadnij w commicie.

## Testy – ochrona przed regresją

- **Każda zmiana zachowania ma test.** Nowa funkcja, poprawka błędu, zmiana reguły ruchu, nowa stacja, zmiana
  algorytmu (np. podział na ekrany, automat dyżurnego) – w tym samym commicie dochodzi test w `tests/`, który
  bez tej zmiany by nie przeszedł. Poprawka błędu zaczyna się od testu odtwarzającego błąd.
- Logika (`src/model/`, `src/srk/registry.js`, `src/render/screens.js`) jest testowana w Node (`node --test`).
  Kod UI/DOM (`src/render/*Renderer.js`, `src/ui/`, `src/main.js`) sprawdza się w przeglądarce (Playwright,
  Chromium Playwrighta: `npx playwright install chromium` albo `SPRK_CHROMIUM=…`) – co najmniej scenariusz „kliknięcia → stan symulacji” i zrzut ekranu;
  jeśli da się wydzielić logikę bez DOM (jak `screens.js`), wydziel ją i przetestuj w Node.
- Testy „wszystkich kombinacji” (`tests/matrix-*.test.js`) i pełne zmiany stacji (`tests/<stacja>.test.js`)
  są siatką bezpieczeństwa – nie osłabiaj ich asercji, żeby przeszły; napraw przyczynę.
- Zmiana wymagająca aktualizacji istniejącego testu musi być uzasadniona w commicie (co się zmieniło w regule).

## Definicja ukończenia

- Test odtwarzający zmianę jest w tym samym commicie; `npm test` przechodzi. Jeden plik: `node --test tests/<nazwa>.test.js`,
  jeden plik e2e: `npx playwright test tests/e2e/<nazwa>.spec.js`.
- Zmiana w UI: `npm run test:e2e`. Wzorce zrzutów (`tests/e2e/visual.spec.js`) odświeża się na komputerze (macOS, Linux,
  Windows) – `npm run test:e2e:update`, bez kontenera. Litery są na zrzutach przezroczyste (`HIDE_GLYPHS`): ta sama
  czcionka rasteryzuje się inaczej na każdym systemie, a układ, kształty i barwy – tak samo, więc ten sam wzorzec
  przechodzi lokalnie i w CI. Treść napisów sprawdzają asercje w testach zachowania.
- Dokumentacja zgodna z kodem w tym samym commicie: `docs/ARCHITECTURE.md` (moduły, zasady), `docs/STATION-FORMAT.md`
  (pola definicji stacji), `README.md` (funkcje widoczne dla gracza, po angielsku).
- Bez nowych zależności npm (także deweloperskich) bez zgody właściciela.
- Bez sekretów, kluczy i danych osobowych w repozytorium.

## Granice warstw (pierwsze trzy i zakaz importów między widokami pilnuje `tests/layers.test.js`)

- Logika – `src/model/`, `src/core/`, `src/tiles/`, `src/srk/` poza `views.js` – importuje tylko logikę i nie używa
  `document`, `window`, `localStorage` ani innych obiektów przeglądarki.
- Zależności (`Interlocking`) nie znają przycisków ani kolorów. Przyciski pulpitu typu E tłumaczy na polecenia
  `src/srk/buttons.js`; stanowiska bez przycisków wydają polecenia wprost: `Simulation.execute({ type, … })`.
- Widok nie zmienia stanu modelu wprost (żadnych przypisań do `sim.ilk.*`, `sim.blocks.*`) – tylko przez
  `sim.press` / `sim.pull` / `sim.execute` / `sim.cancelSelection`.
- Widoki stanowisk (`src/render/*Renderer.js`) nie importują się nawzajem; wspólny kod idzie do osobnego modułu.
- Działanie nie może zależeć od treści komunikatu dla człowieka (etykiety menu, tekstu dziennika) – używaj pól danych.

## Nowe stanowisko obsługi (system srk, panel)

Wzór: pulpit typu IZH-111 (`src/srk/address.js`, `src/render/IzhRenderer.js`, `tests/izh111.test.js`,
`tests/e2e/izh.spec.js`).

0. Źródła: opis obsługi urządzeń z podaniem, co jest faktem ze źródła, a co założeniem – `docs/SOURCES.md`.
   Nie wymyślaj zasad kolejowych; czego źródło nie podaje, oznacz jako przyjęte.
1. Wpis w `src/srk/registry.js` (`id`, `name`, `view`, parametry `model`, opcjonalnie `input`) + test.
2. Sposób wydawania poleceń: `Simulation.execute` albo własny protokół obsługi w `src/srk/` (bez DOM, test w Node)
   podany w polu `input` strategii. Protokół wystawia `armed` (pierwszy wybrany element). Nowe reguły zależności to
   opcje `Interlocking` z wartościami domyślnymi zachowującymi dotychczasowe stanowiska, nie kopia logiki.
3. Widok: klasa w `src/render/` rozszerzająca `PanelView` (`src/render/PanelView.js` – tam jest opis kontraktu)
   + `registerView('<rodzaj>', { View, armHint, help })` w `src/srk/views.js`. Baza daje rysunek z marginesem,
   wycinek kolumn, subskrypcje zdarzeń, odświeżanie, liczniki i etykiety pociągów; widok dostarcza `static PAD`
   i metody `update*`, `createTrainLabel`, `placeTrainLabel`. Kontraktu pilnuje `tests/views.test.js`.
4. Teksty: klucze `arm.*`, `help.*` w `pl.js`, `en.js`, `de.js` (stałej podpowiedzi w listwie narzędzi nie ma). Samouczek: własny plik misji
   w `src/tutorial/missions/` (słownik `phrases` z kluczami `LESSON_PHRASES` + własne kroki przez `withSteps`),
   wpis w `src/tutorial/missions.js` i scenariusz stacji z polem `tutorial`. Nowa misja ma własny scenariusz
   (stacja, układ torów, rozkład) – nie powtarza istniejącej. Test „ucznia” w `tests/missions.test.js` musi
   przejść wszystkie kroki z pociągami o czasie.
5. Testy e2e: scenariusz „kliknięcia → stan symulacji” w `tests/e2e/`, zrzut w `visual.spec.js` i wpis widoku
   w teście kontraktu w `tests/e2e/ui.spec.js`. Wybieraj elementy przez `#desk …` – stałe pola skrajne kopiują
   klasy rysunku.
5a. Dostępność w grze: scenariusz z polem `srk` na stacji, etykieta karty w `VIEW_BADGE` (`src/ui/StartScreen.js`)
   i klucz `start.srk*`. Testy treści stacji (lista scenariuszy) trzeba wtedy rozszerzyć – uzasadnij w commicie.
5b. Barwy urządzenia jako zmienne `--desk-*` / `--mon-*` (są poza wymogiem motywu jasnego).
6. Dokumentacja: sekcja „Strategie systemów srk” w `docs/ARCHITECTURE.md`, pole `srk` w `docs/STATION-FORMAT.md`, README.

## Interfejs (wygląd)

- Jedna czcionka w całej aplikacji: Inter z plików w `src/fonts/` (zmienna `--font`). Nie dodawaj innych krojów ani
  czcionek z zewnętrznych serwerów; pilnuje tego `tests/e2e/font.spec.js`.
- Kolory, promienie (`--radius*`) i warstwy (`--z-*`) interfejsu tylko przez zmienne CSS z `:root` w `src/styles.css`;
  nowa barwa = zmienna w `:root` **i** w `:root[data-theme="light"]`. Pilnuje tego `tests/styles.test.js`.
  Wyjątek: barwy pulpitu i monitora wynikające z przepisów (Ie-104) i wyglądu urządzeń (`--desk-*`, `--mon-*`).
- Każdy ekran działa w motywie jasnym i ciemnym (`tests/e2e/ui.spec.js`).
- Okna pełnoekranowe mają wspólny układ: nagłówek `.st-hero` (logo, tytuł, podtytuł, przycisk powrotu `.st-close`),
  treść na kartach, zmienne `--sc-*`; otwieranie i zamykanie przez `src/ui/dialog.js` (rola okna, fokus).
- Przyciski interfejsu używają klasy `.tb` (akcja główna: `.tb.primary`, wysokość `--ctl-h`); przyciski-ikony mają `aria-label`.
- Ikony to SVG z `src/ui/icons.js` (`uiIcon`), nie znaki tekstowe (✔ ☰ ×) – te każdy system rysuje inaczej.
- HTML z danych zawsze przez `escapeHtml` z `src/ui/dom.js`.

## Projekt

- Czysty JavaScript (moduły ES), bez frameworków. Vite tylko jako serwer dev/build. Testy: `node --test`.
- Logika symulacji (`src/model/`) nie może zależeć od DOM – testy działają w Node.
- Nowe kostki pulpitu: wpis w `src/tiles/registry.js` + funkcja rysująca w `src/render/tileArt.js`.
- Definicje stacji wg `docs/STATION-FORMAT.md`; walidacja w `src/model/validate.js`. Stacja opisuje tor
  i sygnalizację – przycisków stanowiska (grupowych, rozkazów, blokady) do definicji stacji się nie wpisuje.
- Teksty interfejsu (menu, ekrany, panel, pomoc) przez `t()` z `src/i18n/`: nowy tekst = klucz w `pl.js`, `en.js` i `de.js`
  (test pilnuje zgodności). Komunikaty modelu (`src/model/`), polecenia Ie-104 i treść stacji/misji zostają po polsku.
- Terminologia kolejowa po polsku, zgodnie z Ie-1 / Ir-1 (semafor, tarcza manewrowa, przebieg, utwierdzenie,
  odcinek zbliżania, droga ochronna, blokada liniowa Eap).
