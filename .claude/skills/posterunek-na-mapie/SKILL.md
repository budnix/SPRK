---
name: posterunek-na-mapie
description: Dodanie nowego posterunku / miasta (albo nowej ery istniejącej stacji) do SPRK tak, żeby pojawił się na mapie Polski, w schemacie województwa z rzeczywistym przebiegiem linii, w wyszukiwarce i filtrach. Użyj, gdy dochodzi nowa stacja do służby, nowe województwo, nowa linia albo edycja z innego roku.
---

# Posterunek na mapie wyboru

Pełny opis danych, źródeł i licencji: `docs/MAP-DATA.md` – przeczytaj go najpierw. Ten skill to lista kroków.

Zakres: tylko umieszczenie posterunku na mapie i w katalogu. Sama stacja (układ torów, sygnalizacja, przebiegi, rozkład)
powstaje wg `docs/STATION-FORMAT.md`, a jej scenariusze – skill `nowy-scenariusz`.

## Kroki

1. **Pola stacji** (`src/stations/<id>.js`, `docs/STATION-FORMAT.md` „Miejsce i era”):
   - `region` – identyfikator z `src/model/regions.js`;
   - `lines` – numery linii PKP PLK, te same co w `location`;
   - `geo` – `[szer., dł.]` stacji, 4 miejsca;
   - jeden rodzaj stanowiska (`srk` stacji). Edycja innego roku: osobny plik z `place` i `era`.
2. **Współrzędne** z polskiej Wikipedii (polecenie `curl` z API w `docs/MAP-DATA.md`, krok 2). Każde źródło do
   `docs/sources/posterunki.md`, sekcja „Mapa wyboru posterunku”. Nie zgaduj współrzędnych ani numerów linii.
3. **Przebieg linii**: `node scripts/rail-lines.mjs` – zawsze po dodaniu posterunku (zmienia się wycinek i linie).
   Sprawdź w nagłówku `src/ui/map/railLines.js` listę „bez relacji w OSM”. Dane OSM są na ODbL – podpis jest już pod
   schematem; nie usuwaj go.
4. **Testy na komputerze (bez Dockera)**:
   - `node --test tests/map.test.js tests/catalog.test.js`;
   - `npx playwright test tests/e2e/start-nav.spec.js tests/e2e/visual.spec.js`;
   - zmieniony wygląd mapy / schematu → `npx playwright test tests/e2e/visual.spec.js --update-snapshots` (litery na
     zrzutach są ukryte, wzorzec z macOS przechodzi w CI) i uzasadnienie w commicie.
   Testy wyliczają posterunki – liczby (np. „9 posterunków”) w testach e2e trzeba wtedy zaktualizować z uzasadnieniem.
5. **Podgląd**: `#/sluzba` (mapa – przybliż kółkiem / przyciskami do posterunku), `#/sluzba/<województwo>` (mapa
   przybliżona do posterunków) – obejrzyj, czy tablice z nazwami nie nachodzą na siebie (próg `LEVELS.detail` w
   `src/ui/map/zoom.js` liczy się z najbliższej pary posterunków – test w `tests/map.test.js`) i czy tory nie urywają się
   na krawędzi wycinka.
5a. **Służba o wybranej porze**: nowy posterunek ma ją od razu – rozkład stacji jest wzorcem, z którego gra buduje
   każdą porę doby (`src/model/duty.js`, `docs/STATION-FORMAT.md` „Służba o wybranej porze”). Sprawdź kilka pór:
   `npm run check -- <stacja> --start 6 --minutes 120`, `--start 1 --minutes 180`, `--start 19 --minutes 120`;
   `npm test` (`tests/duty-grid.js`) przechodzi po całej siatce sam. Żeby służby wyglądały wiarygodnie, wzorzec
   powinien mieć co najmniej jeden towarowy przelot (`kind: 'tow'`, `from` i `to` – z niego biorą parametry nocne
   pociągi towarowe), a pociągi dalekobieżne – relacje z nazwami stacji jak w rozkładzie PKP Intercity („Kraków Gł. –
   Gdynia Gł.”): wtedy ich powtórzenia dostają nazwy rzeczywistych pociągów tej trasy z `src/model/data/namedTrains.js`
   (lista z całej Polski; odświeżenie na nowy rozkład roczny: `node scripts/named-trains.mjs --year <rok>`).
6. **Dokumentacja** w tym samym commicie: `docs/sources/posterunki.md` (źródła), README (lista stacji), w razie zmian w skryptach –
   `docs/MAP-DATA.md`.

## Gdy coś nie działa

- Overpass 504 / pusta odpowiedź – skrypt ma serwery zapasowe i drugą rundę; spróbuj później.
- Test „stacja w swoim województwie” pada – zamienione `geo` (najpierw szerokość ~49–55, potem długość ~14–24) albo zły `region`.
- Test „stacja przy torze” pada – zły numer w `lines` albo linia w OSM z kilkoma numerami w `ref` (`docs/MAP-DATA.md`, „Pułapki”).
