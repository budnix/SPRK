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
  render/      DeskRenderer (SVG pulpitu, obsługa dotyku/myszy), tileArt (grafika kostek), svg (helpery)
  ui/          SidePanel (rozkład, dziennik, stan), Help (instrukcja)
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

## Plan rozwoju

1. Edytor stacji (przeglądarkowy, eksport JSON) – rejestr kostek i walidator są gotowe.
2. Dziennik ruchu R-146 wypełniany przez gracza (opcja trudności).
3. Tryb sieciowy: kilka posterunków na jednej linii (serwer trzyma `Simulation`, klienci wysyłają `press/pull`).
4. Więcej kostek: rozjazd krzyżowy, tarcze ostrzegawcze, przejazdy, wskaźniki W.
