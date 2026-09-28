# SPRK – wskazówki dla agentów AI

Zasady pracy w tym repozytorium (testy, commity, granice warstw, definicja ukończenia, nowe stanowiska obsługi)
są w jednym miejscu: [CLAUDE.md](CLAUDE.md). Obowiązują każdego agenta i każde narzędzie – przeczytaj ten plik
przed zmianą kodu.

Skrót:

- każda zmiana zachowania ma test w tym samym commicie; poprawka błędu zaczyna się od testu, który go odtwarza,
- `npm test` przed pushem, przy zmianach w UI także `npm run test:e2e`,
- nie osłabiaj istniejących asercji i nie odświeżaj wzorców zrzutów ekranu poza kontenerem Playwright,
- logika (`src/model`, `src/core`, `src/tiles`, `src/srk` poza `views.js`) nie zna DOM – pilnuje tego `tests/layers.test.js`,
- dokumentacja (`docs/`, `README.md`) zmienia się razem z kodem,
- commity po polsku, bez stopek i wzmianek o narzędziach AI.
