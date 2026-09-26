# SPRK – Symulator Prowadzenia Ruchu Kolejowego

Przeglądarkowy symulator pracy dyżurnego ruchu na **pulpicie kostkowym** (urządzenia przekaźnikowe typu E),
wzorowany na symulatorze ISDR. Działa w przeglądarce na komputerze i na iPadzie (obsługa dotyku).
Bez frameworków: czysty JavaScript (moduły ES) + SVG.

![Pulpit stacji Stare Pustkowie](docs/screenshot.png)

## Uruchomienie

```bash
npm install
npm run dev        # http://localhost:5173  (Vite, dostępne też w sieci lokalnej: --host)
npm test           # testy logiki (node --test)
npm run build      # statyczna wersja do katalogu dist/
```

Wybór stacji: `?stacja=<id>` (domyślnie `stare-pustkowie`).

## Co jest w wersji 0.1

* **Kostki modułowe** (`src/tiles/registry.js`): tor prosty/skos/łuk, zwrotnica, skrzyżowanie, kozioł,
  powtarzacz semafora i tarczy manewrowej z przyciskami, przyciski grupowe z licznikami, pole blokady liniowej Eap,
  opisy. Nowy typ kostki = wpis w rejestrze + funkcja rysująca.
* **Zależności typu E** (`src/model/Interlocking.js`): nastawianie dwuprzyciskowe, automatyczne przestawianie
  zwrotnic w przebiegu, utwierdzenie (białe), zajętość (czerwone), położenie zwrotnic (żółte), ochrona boczna,
  drogi ochronne, wykolejnice, zwalnianie odcinkowe, Pz / zwalnianie czasowe, dPz i Sz z licznikami,
  zamknięcie indywidualne Zz, rozprucie zwrotnicy, obrazy sygnałowe wg Ie-1 (S1–S5, S10–S13, Ms1/Ms2, Sz).
* **Blokada liniowa Eap** (`src/model/Block.js`): Wbl, Poz, Ko, dPo, dKo; sąsiednie posterunki sterowane przez AI
  (żądają pozwolenia, wyprawiają pociągi wg rozkładu, potwierdzają przyjazd).
* **Ruch pociągów** (`src/model/Train.js`): jazda po rzeczywistym torze i położeniach zwrotnic, hamowanie przed
  Stój, 40 km/h przez tor zwrotny, 20 km/h na Sz, postoje przy peronie wg rozkładu, przeloty, pociągi kończące bieg,
  manewry za Ms2.
* **Panel boczny**: zegar i tempo (1–30×), rozkład jazdy ze stanami i opóźnieniami, dziennik zdarzeń
  z komunikatami od sąsiadów, stan blokad/przebiegów/liczników, przełączanie pociągu w manewry, instrukcja (?).
* **Stacja testowa Stare Pustkowie**: linia jednotorowa, 2 tory główne z peronami, tor ładunkowy z wykolejnicą,
  3 zwrotnice, 6 semaforów, 2 tarcze manewrowe, rozkład 10 pociągów (z krzyżowaniami).

## Obsługa (skrót)

| Czynność | Jak |
|---|---|
| Naciśnięcie przycisku | kliknięcie / dotknięcie |
| Wyciągnięcie przycisku | przytrzymanie 0,5 s lub prawy przycisk myszy |
| Przebieg pociągowy | zielony przycisk semafora początkowego → zielony przycisk końca (semafor / `kW` `kE`) |
| Przebieg manewrowy | biały przycisk początku → biały przycisk końca (`kT3`, Tm, C2) |
| Wygaszenie sygnału | wyciągnij przycisk sygnałowy |
| Zwolnienie przebiegu | `Pz` + przycisk sygnałowy (czasowe 90 s przy zajętym zbliżaniu) |
| Doraźne zwolnienie | `dPz` + przycisk sygnałowy (licznik) |
| Sygnał zastępczy | `Sz` + zielony przycisk semafora (licznik) |
| Zwrotnica | `Zw` + przycisk zwrotnicy; zamknięcie `Zz` + przycisk zwrotnicy |
| Blokada | `Wbl` żądanie pozwolenia, `Poz` danie pozwolenia, `Ko` potwierdzenie przyjazdu |

Pełna instrukcja: przycisk **?** w aplikacji.

## Struktura i rozwój

* `docs/STATION-FORMAT.md` – format definicji stacji (pod przyszły edytor),
* `docs/ARCHITECTURE.md` – architektura, zasady, plan rozwoju,
* `docs/SOURCES.md` – źródła (Ie-1, Ir-1, dokumentacja ISDR, opisy urządzeń typu E).

Symulator jest uproszczeniem: szczegóły zależności (czasy, drogi ochronne, ochrona boczna) wzorowano na opisach
urządzeń typu E, ale bez dostępu do dokumentacji zależnościowej konkretnych nastawni. Zgłoś różnice – model jest w jednym miejscu.
