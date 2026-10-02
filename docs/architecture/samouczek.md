# Misje wprowadzające

Część dokumentacji architektury – indeks i zasady: [`docs/ARCHITECTURE.md`](../ARCHITECTURE.md).

## Misje wprowadzające (`src/tutorial/`)

* Każdy samouczek ma własny plik w `src/tutorial/missions/` z własną listą kroków (`steps()`) i **własnym
  scenariuszem** – inną stacją, innym układem torów i innym rozkładem, żeby każda misja była czymś nowym:

  | misja | stanowisko | stacja | czego uczy |
  |---|---|---|---|
  | 1 `monitor` | stanowisko komputerowe | Szkolna – linia jednotorowa | pozwolenia, krzyżowanie, manewry; usterki: semafor bez sygnału (Sz), blokada bez łączności (zapowiadanie telefoniczne) |
  | 2 `pulpit` | pulpit kostkowy typu E | Jodłowa – linia dwutorowa z odgałęzieniem | ruch bez pozwoleń z Ko, wyprzedzanie, odgałęzienie z Eap; usterka: zwrotnica bez kontroli położenia (zamknąć, przyjąć na inny tor) |
  | 3 `izh` | pulpit IZH-111 | Zacisze – stacja krańcowa | tory czołowe, zmiana czoła, dwa składy na stacji; usterka: odcinek z fałszywą zajętością (droga ułożona ręcznie i zamknięta, wjazd na Sz) |
  | 4 `mech` | nastawnia mechaniczna | Olszyny – linia jednotorowa z bocznicą | dźwignie, drążek, blok przebiegowy, dźwignia sygnałowa, powrót po przejeździe, krzyżowanie z wykolejnicą ochronną; usterka: pociąg nie zwolnił bloku przebiegowego (zwalniacz) |
  | 5 `ebi` | EBILock 950 (EBIScreen) | Brzezina – linia dwutorowa z blokadą samoczynną | menu pod prawym klawiszem, linia poleceń i „Wykonaj”, polecenie z klawiatury, wyprzedzanie, okno zdarzeń i alarmów; usterka: pęknięta szyna – zamknięcie toru ITS, przyjęcie na tor 3, otwarcie ITO |
  | 6 `mor` | MOR-3 (MOR-1) | Kalinowo – węzeł trzech linii jednotorowych z Eap | menu obiektów, przebieg kliknięciem celu (semafor, tor, trójkąt) i przeciąganiem, blokada z menu trójkąta, krzyżowanie w węźle, alarm dwuklikiem, zwrotnice Minus / Stop / oStop; usterka: licznik osi (ZeroLO, przejazd kontrolny na SZ) |

  Każda misja uczy innej usterki – razem wszystkie siedem rodzajów (`src/model/Faults.js`; `route-block` tylko na
  nastawni mechanicznej, także w losowaniu; `track-defect` i `axle-counter` tylko w scenariuszu). Wjazd na tor z pękniętą szyną bez
  zamknięcia kosztuje punkty; przyjęcie na inny tor, gdy planowy jest zamknięty, jest bez kary. Zwalniacz przy bloku niezwolnionym przez usterkę nie kosztuje punktów. Przyjęcie pociągu na tor
  inny niż planowy nie jest karane, gdy usterka była na drodze toru planowego (`Traffic.#plannedTrackFault`: jego
  odcinki, przebieg na niego od strony wjazdu, przebieg z niego w stronę wyjazdu – zajętość, zwrotnica, semafor) między
  zgłoszeniem pociągu a przyjazdem – tak jak uzasadnione Sz; usterka gdzie indziej na stacji – kara.

  Misje nie mają rozgrzewki: zaczynają się o 07:00 (pierwszy sąsiad już pyta o pozwolenie albo wyprawia pociąg)
  i uczą polecenia wtedy, gdy są potrzebne – zwykłym ruchem albo przy usterce; wyjaśnienie elementu jest w kroku,
  w którym gracz pierwszy raz go używa. Testy „ucznia” pilnują, że pociągi jadą o czasie. Lekcje rozkładu Szkolnej są w `lessons.js`
  (`lessonSteps(phrases)`); `withSteps(base, { after, before, replace, omit })` składa samouczek z listy kroków
  i zmian. `phrases.js` – cegiełki tekstów, `missions.js` – rejestr (`MISSIONS`, `getMission`, `missionSteps`).
* Kroki misji bez DOM: `{ id, title, text, anchor, info?, done(sim, ctx), wrong?(sim, ctx), tip? }`.
  W misji (`scenario.tutorial`) zmiana nie kończy się sama po ostatnim pociągu (`sim.autoEnd = false`) – kończy ją
  „Dalej” na ostatnim kroku (`sim.endShift()` → raport); zamknięcie samouczka przywraca automatyczny koniec.
  Kotwice kroków (`anchor`) – różnią się teksty
  i wskazywane miejsca (`anchor`: `{ ref }`, `{ block }`, `{ cmd }`, `{ el }`, `{ tab }`). Wszystko, co zależy od
  stanowiska, jest w słowniku `PHRASES[view]` (te same klucze dla każdego widoku – pilnuje tego test); kroki misji nie
  rozgałęziają się po widoku, więc nowy panel to nowy wpis w słowniku.
* `progress.js` – `MissionProgress`: kolejność kroków, warunki na stanie symulacji i zdarzeniach szyny
  (`ctx.seen`: `route:A-D1:set`, `lock:Zw3`, `sz:A`, `cancel:B` …), wstrzymanie zegara na krokach informacyjnych,
  komunikaty `wrong` (np. przebieg na zły tor). Testowany w Node skryptem „ucznia” (`tests/szkolna.test.js`).
* `placement.js` – wybór miejsca dymka (`placeBox`), bez DOM: dymek nie zasłania wskazywanego elementu ani pasków
  sterowania (nagłówek, pasek poleceń, listwa narzędzi z zakładkami panelu); wysoki dymek staje w wolnym pasie okna.
* `Tutorial.js` – UI: dymek przypięty do elementu (`renderer.elementFor(ref)`, `cmdButton(id)`), podświetlenie `.tut-hl`,
  słownik skrótów (`src/data/glossary.js`) po kliknięciu `<abbr data-term>`, „Dalej” / „Pomiń krok” / „Pokaż gdzie”.
  Położenie dymku wybierane spośród kandydatów (pod, nad, obok elementu, pas nad planem i pod planem) wg pola
  zasłoniętego rysunku planu, elementu i pasków sterowania; dymek, słownik i pasek potwierdzenia dają się przeciągać
  (`src/ui/drag.js`) – przesunięty dymek zostaje do następnego kroku.
* Zadania manewrowe mogą zależeć od siebie (`afterTask`), więc krok „podstaw z powrotem” nie zalicza się przed
  odstawieniem, niezależnie od godziny; automat bierze zadanie gotowe do wykonania, nie pierwsze z listy. Każde
  kolejne zadanie tego samego składu ma `afterTask` (test treści w `tests/unit-handover.test.js`). Termin zadania czekającego biegnie: gdy poprzednie nie zostało wykonane,
  zadanie przepada 10 min po swoim terminie (inaczej zostawałoby w toku do końca zmiany, a automat czekałby na nie
  bez końca). Termin przesuwa `Traffic.#shiftTask` (w dzienniku z powodem): o opóźnienie składu od sąsiada – gdy
  sąsiad je zgłasza – i o czas, gdy `Traffic.#taskBlocked` widzi, że każda droga manewrowa do toru docelowego jest
  zamknięta usterką bez obejścia (`task.faultShift`; zadanie z `afterTask` przesuwa się razem z nim). Droga to łańcuch
  do 3 przebiegów manewrowych od miejsca składu (`trainRouteChains` z `src/model/trainPaths.js`), po którym cały skład
  mieści się na torze docelowym – długi skład za krótkim odcinkiem przed sygnalizatorem potrzebuje dalszego przebiegu
  (Szkolna: Tm1 → Tm2 kończy się na T2e, 180 m – dalej Tm2 → C2); bez takiej drogi – każdy przebieg na tor docelowy. Skład stojący
  wtedy ma `faultBlocked` (bez kary za przetrzymanie), a późny odjazd pociągu z tego składu liczy się bez tych minut.
  Skład przekazany jako nowy pociąg (`unit`) traci zezwolenie pociągu, którym przyjechał
  (`Train.clearAuthority`) – rusza dopiero na sygnał semafora wyjazdowego. Skład z zadaniem manewrowym w toku
  (niewykonane, nie przepadło, poprzednie nie przepadło – `Traffic.#openTask`) nie jest przekazywany: dyżurny najpierw
  je wykonuje albo zadanie przepada (inaczej opóźniony skład przechodził w pociąg przy przyjeździe, zanim automat zdążył
  przełączyć go w manewry – zależnie od kroku przyjazdu); zadanie wstrzymane usterką bez obejścia (`faultBlocked`, termin
  się przesuwa) nie blokuje przekazania. Test: `tests/unit-handover.test.js`.
* Stacja treningowa `src/stations/szkolna.js`; scenariusz z polem `tutorial` uruchamia misję (main.js).
