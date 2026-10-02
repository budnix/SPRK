---
name: nowe-stanowisko
description: Dodanie do SPRK nowego rodzaju stanowiska obsługi – systemu srk z własnym widokiem i sposobem wydawania poleceń (pulpit, monitor, nastawnia, np. kolejny typ urządzeń przekaźnikowych albo komputerowych) – albo nowej misji samouczka dla stanowiska. Użyj zawsze, gdy właściciel prosi o „nowy pulpit”, „nowy panel”, „nowe stanowisko”, „nowy system srk”, „urządzenia typu …” albo o misję wprowadzającą do stanowiska.
---

# Nowe stanowisko obsługi (system srk, panel)

Stanowisko to trzy osobne rzeczy: wpis w rejestrze (parametry zależności), sposób wydawania poleceń (logika, bez DOM)
i widok (DOM). Trzymanie ich osobno pozwala testować zależności w Node i sprawia, że ten sam układ stacji działa na
każdym stanowisku. Granice warstw: CLAUDE.md („Granice warstw”) – pilnuje ich `tests/layers.test.js`.

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

## Kolejność pracy

Źródła (krok 0) → rejestr i protokół z testami w Node (1–2) → widok i teksty (3–4) → e2e i zrzuty (5) → dostępność
w grze (5a) → dokumentacja (6). Zasady z przepisów i opisów urządzeń – skill `zasada-ze-zrodla`. Stacja, na której
stanowisko się pojawi – skill `nowa-stacja` (nowy posterunek do służby ma jedno stanowisko).

Na koniec: `npm test`, `npm run test:e2e` na komputerze (bez Dockera); nowy wzorzec zrzutu – `npm run test:e2e:update`
z uzasadnieniem w commicie.
