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
- Zmiana w UI: `npm run test:e2e`. Wzorce zrzutów (`tests/e2e/visual.spec.js`) powstają w kontenerze Playwright (czcionki
  DejaVu, jak w CI). Na macOS / Windows test wizualny pulpitu różni się czcionką – to nie regresja; **nie odświeżaj wzorców
  lokalnie**, tylko w kontenerze `mcr.microsoft.com/playwright` w wersji z `.github/workflows/ci.yml`.
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

1. Wpis w `src/srk/registry.js` (`id`, `name`, `view`, parametry `model`) + test w `tests/srk.test.js`.
2. Sposób wydawania poleceń: `Simulation.execute` albo własny protokół obsługi w `src/srk/` (bez DOM, test w Node,
   wzór: `buttons.js` i `tests/commands.test.js`). Nowe reguły zależności to opcje `Interlocking`, nie kopia logiki.
3. Widok: klasa w `src/render/` + wpis w `VIEWS` w `src/srk/views.js` (fabryka, rozmiar, podpowiedzi, instrukcja).
   Widok implementuje: `svg`, `inner`, `setView(x0, x1)`, `resetView()`, `elementFor(ref)`, `refreshAll()`;
   opcjonalnie `cmdBar`, `cmdButton(id)`, `setSymbolScale(s)`.
4. Teksty: klucze `hint.*`, `arm.*`, `help.*` w `pl.js`, `en.js`, `de.js`; misje – teksty dla nowego widoku w `missions.js`.
5. Testy e2e: scenariusz „kliknięcia → stan symulacji” w `tests/e2e/` i zrzut w `visual.spec.js`.
6. Dokumentacja: sekcja „Strategie systemów srk” w `docs/ARCHITECTURE.md`, pole `srk` w `docs/STATION-FORMAT.md`, README.

## Interfejs (wygląd)

- Kolory, promienie i cienie interfejsu przez zmienne CSS z `:root` w `src/styles.css`; nie wpisuj nowych kolorów na sztywno.
  Wyjątek: barwy pulpitu i monitora wynikające z przepisów (Ie-104) i wyglądu urządzeń.
- Każdy nowy element interfejsu sprawdź w motywie jasnym i ciemnym.
- Przyciski interfejsu używają klasy `.tb` (akcja główna: `.tb.primary`); przyciski-ikony mają `aria-label`.

## Projekt

- Czysty JavaScript (moduły ES), bez frameworków. Vite tylko jako serwer dev/build. Testy: `node --test`.
- Logika symulacji (`src/model/`) nie może zależeć od DOM – testy działają w Node.
- Nowe kostki pulpitu: wpis w `src/tiles/registry.js` + funkcja rysująca w `src/render/tileArt.js`.
- Definicje stacji wg `docs/STATION-FORMAT.md`; walidacja w `src/model/validate.js`.
- Teksty interfejsu (menu, ekrany, panel, pomoc) przez `t()` z `src/i18n/`: nowy tekst = klucz w `pl.js`, `en.js` i `de.js`
  (test pilnuje zgodności). Komunikaty modelu (`src/model/`), polecenia Ie-104 i treść stacji/misji zostają po polsku.
- Terminologia kolejowa po polsku, zgodnie z Ie-1 / Ir-1 (semafor, tarcza manewrowa, przebieg, utwierdzenie,
  odcinek zbliżania, droga ochronna, blokada liniowa Eap).
