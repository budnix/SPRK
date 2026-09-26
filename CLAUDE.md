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
  Chromium z `/opt/pw-browsers/chromium`) – co najmniej scenariusz „kliknięcia → stan symulacji” i zrzut ekranu;
  jeśli da się wydzielić logikę bez DOM (jak `screens.js`), wydziel ją i przetestuj w Node.
- Testy „wszystkich kombinacji” (`tests/matrix-*.test.js`) i pełne zmiany stacji (`tests/<stacja>.test.js`)
  są siatką bezpieczeństwa – nie osłabiaj ich asercji, żeby przeszły; napraw przyczynę.
- Zmiana wymagająca aktualizacji istniejącego testu musi być uzasadniona w commicie (co się zmieniło w regule).

## Projekt

- Czysty JavaScript (moduły ES), bez frameworków. Vite tylko jako serwer dev/build. Testy: `node --test`.
- Logika symulacji (`src/model/`) nie może zależeć od DOM – testy działają w Node.
- Nowe kostki pulpitu: wpis w `src/tiles/registry.js` + funkcja rysująca w `src/render/tileArt.js`.
- Definicje stacji wg `docs/STATION-FORMAT.md`; walidacja w `src/model/validate.js`.
- Terminologia kolejowa po polsku, zgodnie z Ie-1 / Ir-1 (semafor, tarcza manewrowa, przebieg, utwierdzenie,
  odcinek zbliżania, droga ochronna, blokada liniowa Eap).
