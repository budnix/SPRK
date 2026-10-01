# Mapa wyboru posterunku – dane, źródła, jak rozwijać

Ekrany wyboru (`src/ui/StartScreen.js`) pokazują posterunki do służby na mapie Polski (`#/sluzba`), w schemacie
województwa (`#/sluzba/<województwo>`) i na liście z wyszukiwarką. Ten plik opisuje, skąd są dane mapy, jak je odtworzyć
i co zrobić, gdy dochodzi nowe miasto. Skrót kroków dla Claude: skill `.claude/skills/posterunek-na-mapie/SKILL.md`.

## Co składa się na mapę

| Warstwa | Plik | Źródło | Licencja | Jak odtworzyć |
|---|---|---|---|---|
| Kształty 16 województw | `src/ui/map/poland.js` (generowany) | Natural Earth, *Admin 1 – States, Provinces*, 1:10m | domena publiczna | `scripts/poland-map.mjs` (niżej) |
| Sieć kolejowa Polski w małym przybliżeniu | `src/ui/map/railOverview.js` (generowany) | Natural Earth, *Railroads*, 1:10m | domena publiczna | `scripts/rail-overview.mjs` (niżej) |
| Identyfikatory i nazwy województw | `src/model/regions.js` | TERYT (nazwy urzędowe) | – | ręcznie; test porównuje z `poland.js` |
| Rzut (stopnie → rysunek) | `PROJ`, `VIEWBOX` w `poland.js`; `project` / `unproject` w `src/ui/map/mapSvg.js` | – | – | generuje `poland-map.mjs` |
| Współrzędne stacji | pole `geo` w `src/stations/<id>.js` | polska Wikipedia, artykuł stacji (szablon współrzędnych) | fakty; adres w `docs/SOURCES.md` | API Wikipedii (niżej) |
| Numery linii przy stacji | pole `lines` | opis położenia stacji (`location`) – te same źródła co plan stacji | – | ręcznie |
| Przebieg linii (tory na schemacie) | `src/ui/map/railLines.js` (generowany) | OpenStreetMap, relacje `route=railway` z numerem linii PKP PLK w `ref`, przez Overpass API | **ODbL 1.0** – plik to baza pochodna na ODbL; podpis „© autorzy OpenStreetMap (ODbL)” pod schematem (`start.regionMapNote`) i w `docs/SOURCES.md` | `scripts/rail-lines.mjs` (niżej) |

Rysowanie (bez DOM, testy w Node): `src/ui/map/mapSvg.js` – `boardSvg` (jedna tablica w jednostkach rysunku Polski:
województwa, sieć z Natural Earth, dokładne tory linii posterunków z `RAIL_LINES` – linia przez co najmniej dwa posterunki
jaśniejsza; linia bez danych OSM – odcinek prosty między kolejnymi posterunkami z `catalog.regionLayout`; nazwy województw
z liczbą posterunków, numery linii, posterunki jako lampki w obudowie i tablice stacyjne; obrysy w osobnej warstwie nad
wypełnieniami – równa grubość na całej granicy), `regionBox` (wycinek województwa: posterunki + 30 %, co najmniej
0,5° × 0,8°). Przybliżanie: `src/ui/map/zoom.js` (bez DOM – `zoomAt`, `clampView`, `homeView`, `levelOf`) i
`src/ui/map/MapView.js` (kółko myszy, szczypanie na gładziku – także zdarzenia `gesture` Safari, przeciąganie, dwa palce,
dwuklik, przyciski + / − / cała Polska, klawiatura; strona się nie przybliża: `preventDefault`, `touch-action: none`;
wskaźnik przechwytywany dopiero przy przeciąganiu – inaczej klik nie trafiłby w posterunek). Znaczniki i napisy mają stały
rozmiar na ekranie (grupa z `data-x` / `data-y` dostaje przesunięcie i skalę). Poziomy szczegółów zależą od gęstości –
pikseli ekranu na jednostkę rysunku (`LEVELS`): kraj (województwa, liczby, sieć), region (tory linii posterunków,
lampki), szczegół (tablice z nazwami, numery linii; od gęstości, przy której Reda i Rumia są dalej od siebie niż wysokość
tablicy). Bliżej kształty województw (1:10m, ok. 1 km dokładności) znikają – nie rozmijają się z dokładnymi torami (Hel),
zostaje tablica z torami na siatce. Wygląd: zmienne `--sc-board-*` (tablica dyspozytorska, ciemna w obu motywach).

## Dodanie nowego posterunku (miasta) na mapę

1. **Plik stacji** wg `docs/STATION-FORMAT.md` z polami:
   * `region` – identyfikator województwa z `src/model/regions.js` (np. `slaskie`, `warminsko-mazurskie`);
   * `lines` – numery linii PKP PLK przechodzących przez stację, **te same co w `location`** (test to sprawdza);
   * `geo` – `[szerokość, długość]` stacji pasażerskiej, 4 miejsca po przecinku.
   Jeden rodzaj stanowiska na posterunek (`srk` stacji, bez `srk` w scenariuszach) – `tests/catalog.test.js`.
2. **Współrzędne z Wikipedii** (kilka stacji naraz; tytuły jak w adresie artykułu):
   ```sh
   curl -s -G https://pl.wikipedia.org/w/api.php --data-urlencode action=query --data-urlencode prop=coordinates \
     --data-urlencode redirects=1 --data-urlencode format=json \
     --data-urlencode "titles=Katowice_(stacja_kolejowa)|Gliwice_(stacja_kolejowa)"
   ```
   Artykuł stacji ma zwykle dopisek „(stacja kolejowa)”, gdy nazwa miasta jest zajęta (np. `Sopot_(stacja_kolejowa)`),
   a stacje z nazwą własną – bez niego (`Gdańsk_Główny`). Źródło każdej pary współrzędnych dopisz do
   `docs/SOURCES.md`, sekcja „Mapa wyboru posterunku”.
3. **Przebieg linii** – po dodaniu posterunku zawsze od nowa (zmienia się wycinek województwa i zestaw linii):
   ```sh
   node scripts/rail-lines.mjs
   ```
   Skrypt bierze linie i województwa z `STATIONS`, pyta Overpass o relacje `route=railway` w wycinku każdego województwa
   z posterunkami (+10 %), łączy tory w ciągi, przycina, upraszcza (0,0006°) i zapisuje `railLines.js` z datą stanu OSM
   i listą linii bez danych w nagłówku.
4. **Testy**: `node --test tests/map.test.js tests/catalog.test.js` – stacja w swoim województwie (zamienione
   współrzędne albo zły region dają błąd), każda linia stacji ma przebieg w OSM i stacja leży < 1 km od toru, dane
   w wycinku; potem `npx playwright test tests/e2e/start-nav.spec.js tests/e2e/visual.spec.js`. Zmieniony wygląd mapy
   lub schematu (nowe przystanki) → `npx playwright test tests/e2e/visual.spec.js --update-snapshots` na komputerze
   (litery na zrzutach są ukryte – wzorzec z macOS przechodzi w CI) i uzasadnienie w commicie.
5. **Opis** w `docs/SOURCES.md` (współrzędne, linie) – licencji OSM nie trzeba dopisywać drugi raz.

Nowe województwo nie wymaga zmian w kodzie: mapa podświetla każde z posterunkami, schemat liczy wycinek sam.

## Edycja (era) istniejącego miejsca

Osobny plik stacji z `place: '<id miejsca>'`, `era: <rok>` i tym samym `geo`, `region`, `lines` (o ile linie się nie
zmieniły). Mapa i lista pokazują miejsce raz, strona stacji ma zakładki ery (`eraTabs`). Rok i urządzenia edycji – ze
źródeł (`docs/SOURCES.md`); przepisy zawsze dzisiejsze.

## Sieć kolejowa w małym przybliżeniu (rzadko – nowa wersja Natural Earth)

```sh
curl -L -o /tmp/ne_10m_railroads.geojson \
  https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_railroads.geojson
node scripts/rail-overview.mjs /tmp/ne_10m_railroads.geojson
```
Odcinki w granicach Polski (wielokąty województw), połączone i uproszczone (ok. 900 m) – ok. 56 KB. Ta warstwa nie zależy
od posterunków; nowe miasto jej nie zmienia.

## Kształty województw (rzadko – nowa wersja Natural Earth)

```sh
curl -L -o /tmp/ne_10m_admin_1_states_provinces.geojson \
  https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_1_states_provinces.geojson
node scripts/poland-map.mjs /tmp/ne_10m_admin_1_states_provinces.geojson
```
Plik ma ok. 40 MB – nie wrzucaj go do repozytorium. Skrypt dobiera województwa po kodzie ISO 3166-2, upraszcza wspólne
granice raz (bez szczelin między sąsiadami), liczy etykiety. Zmiana `PROJ` przesuwa wszystko – po niej `npm test`
i odświeżenie wzorców zrzutów.

## Pułapki

* **Overpass bywa zajęty** (504 / 429) – skrypt próbuje kolejno `overpass-api.de`, `overpass.kumi.systems`,
  `overpass.private.coffee`, dwie rundy z przerwą. Bez nagłówka `User-Agent` serwer zwraca pustą odpowiedź. Serwer
  zapasowy może mieć starszy stan OSM – data jest w nagłówku `railLines.js`.
* **`ref` w OSM** to numer linii; filtr `network`/`operator` z „PKP” odrzuca tramwaje i koleje przemysłowe z tym samym
  numerem. Relacja z kilkoma numerami (`ref=202;250`) nie przejdzie filtra – wtedy linia trafi do „bez danych” w nagłówku
  i schemat narysuje odcinek prosty; dopisz obsługę w skrypcie, jeśli się zdarzy.
* **Odległość stacji od toru**: współrzędne to budynek stacji, a obszar stacji ma ponad kilometr – linia może kończyć się
  w głowicy (linia 9 w Gdańsku Gł. ok. 520 m), odgałęzienie zaczyna się w głowicy (964 w Gdyni Chyloni). Test dopuszcza
  1 km; więcej to zwykle zamienione współrzędne albo zły numer linii.
* **Tory poza wycinkiem**: `railLines.js` jest przycięty do wycinków schematów – po dodaniu posterunku daleko od innych
  w tym samym województwie wycinek rośnie, więc trzeba uruchomić `rail-lines.mjs` ponownie (inaczej tory urwą się na
  starej krawędzi; test „dane w wycinku” tego nie wykryje, sprawdź wzrokowo).
* **Linie bez relacji w OSM** (np. krótkie łącznice) – rysowane jako odcinek prosty między kolejnymi posterunkami tej linii.
* **Kolejność posterunków na linii** dla odcinków prostych i numerów linii: rzut na kierunek główny (`catalog.lineOrder`)
  – dobra dla linii „prostych” w obrębie województwa; dla linii w kształcie łuku rozważ pole z kilometrem linii.
