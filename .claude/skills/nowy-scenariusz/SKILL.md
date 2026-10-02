---
name: nowy-scenariusz
description: Dodanie nowego scenariusza albo wariantu scenariusza SPRK (inna długość zmiany, inny start, podzbiór pociągów, usterka, zamknięcie toru, zadanie manewrowe) do istniejącej lub nowej stacji i sprawdzenie go automatem, który gra zmianę dyżurnym automatycznym i mówi, czy wszystko było OK. Użyj, gdy dochodzi scenariusz, wariant zmiany albo zmienia się rozkład / okno istniejącego scenariusza.
---

# Nowy scenariusz albo wariant

Format scenariusza: `docs/STATION-FORMAT.md` („Scenariusze”, „Rozkład jazdy”, „Zadania manewrowe”, „Wariant scenariusza
i automat sprawdzający”) – przeczytaj najpierw. Reguły automatu: `docs/ARCHITECTURE.md` („Automat sprawdzający
scenariusze”). Ten skill to lista kroków.

## Kroki

1. **Dodaj wariant** w `scenarios` stacji (`src/stations/<id>.js`): nowe `id` (unikalne w stacji), `name`, opcjonalnie
   `description`. Typowe wariacje:
   - inna długość / inny start: `startTime`, `endTime` **i** `trains` – samo okno niczego nie wycina z rozkładu;
     do `trains` tylko pociągi, które sąsiad wyprawia po starcie; ostatni odjazd co najmniej 4 min przed `endTime`,
     a dla odporności na opóźnienia od sąsiada zapas 19 min (low) / 44 min (high); łańcuch `unit` w całości;
   - zadania: odziedziczone ze stacji, gdy ich skład jest w `trains`; własne w `tasks` scenariusza, `tasks: []` – bez zadań;
   - usterka (`faults`, `at: 'GG:MM'` jako napis) w czasie ruchu pociągów, których dotyczy (inaczej scenariusz jej
     nie sprawdza – błąd `fault-no-effect`);
   - wymuszony poziom zakłóceń `disruptions` tylko, gdy wariant ma sens na jednym poziomie (np. szczyt = high).
   Nie wymyślaj zasad kolejowych – rozkład i układ torów stacji zostają takie, jak są w definicji.
2. **Sprawdź automatem**: `npm run check -- <stacja>:<id>` (poziomy none / low / high, ziarna 1–3; szczegóły:
   `--verbose`, więcej ziaren: `--seeds 1-8`). Najpierw „Definicja” (błędy widoczne bez grania), potem wiersz każdej
   zmiany z werdyktem OK / UWAGI / BŁĘDY, pociągiem, miejscem i przyczyną. Ocena scenariusza (w nagłówku) liczy
   definicję i przebiegi na poziomie scenariusza (none albo wymuszony `disruptions`); uwagi przy zakłóceniach gracza
   są w wierszu „Odporność”, a informacje (`info`) – ograniczenia silnika i automatu – nie zmieniają oceny.
   Kod wyjścia 1 = są błędy (`--strict`: także uwagi).
3. **Popraw** wg komunikatów i sprawdzaj ponownie, aż nie będzie BŁĘDÓW:
   - `station-invalid` – błąd definicji stacji (treść w komunikacie); `sc-unknown-key` – literówka w polu (podpowiedź);
   - `sc-name-window` – godziny w nazwie („… (05:55–08:15)”) inne niż `startTime` / `endTime`: popraw nazwę albo okno;
   - `tt-before-start` / `tt-tight-start` – pociąg sprzed startu: usuń go z `trains` albo przesuń start;
   - `tt-after-end`, `plan-tight` – odjazd mniej niż 4 min przed końcem: wydłuż `endTime` albo usuń pociąg;
     `sc-slack`, `late-inbound`, `margin` – zapas na opóźnienia od sąsiada;
   - `tt-turnback`, `tt-startOn-dir-exit` – pociąg nie zmienia czoła: kończący bieg + `unit`, `startOn.dir` jak wyjazd;
   - `tt-unit-missing` – dopisz do `trains` pociąg, którym przyjeżdża skład;
   - `task-*`, `closed-task-track` – termin zadania względem przyjazdu składu i odjazdu następcy, `afterTask`, tor
     docelowy (droga manewrowa, zamknięcie, wyjazd następcy z toru, na którym zadanie zostawia skład);
   - `fault-no-effect` – przesuń usterkę na czas ruchu; `fault-wait` / `automat-limit` (informacje) – automat czeka na
     naprawę albo usterki nie usuwa (gracz użyłby Sz, rozkazu „S”, zerowania licznika, innego toru) – to nie błąd
     scenariusza;
   - `unfinished`, `unfinished-plan` / `jam` – pociąg stoi z winy stacji albo planu: przeszkody i dziennik pod
     komunikatem wskazują konflikt (tor zajęty w planie, zamknięcie bez objazdu, brak przebiegu); zator składu
     w manewrach z dopiskiem „automat-limit?” – graf przebiegów manewrowych uznaje tor za osiągalny, możliwe
     ograniczenie automatu.
   Uwagi o przepustowości (`line-headway`, `line-headway-out`, `line-capacity`, `track-conflict`) to ryzyko opóźnień –
   zostaw, jeśli wariant ma być trudny, i opisz to w `description`.
4. **`npm test`** – każdy scenariusz każdej stacji przechodzi tam definicję i jeden przebieg (ziarno 1, poziom
   scenariusza: none albo wymuszony): `tests/scenario-check.test.js`, `tests/scenario-check-run-*.test.js`. Osobny test
   nie jest potrzebny. Test nie przechodzi także przy uwadze powtarzalnej (definicja albo przebieg bez zakłóceń) spoza
   `tests/scenario-accepted.js` – popraw scenariusz albo, gdy uwaga zostaje świadomie, wklej wiersz z komunikatu testu
   (decyzja właściciela, uzasadnienie w commicie). Testy, które wyliczają scenariusze stacji (np. `tests/szkolna.test.js`,
   lista zmian Orłowa w `tests/survey.test.js`), trzeba rozszerzyć z uzasadnieniem w commicie (CLAUDE.md). Scenariusz,
   który świadomie nie przechodzi: wpis w `KNOWN` (`tests/scenario-runs.js`) z uzasadnieniem – do decyzji właściciela.
5. **Na koniec** w tym samym commicie: README (lista scenariuszy stacji, po angielsku), gdy wariant jest widoczny dla
   gracza; zmiana w UI (karta scenariusza) – `npm run test:e2e` na komputerze (bez Dockera).

## Służba o wybranej porze

Na posterunkach do służby gracz nie wybiera już zwykłej zmiany z listy, tylko godzinę startu i długość – rozkład buduje
`src/model/duty.js` z rozkładu stacji (`docs/STATION-FORMAT.md` „Służba o wybranej porze”). Nowy wariant ma sens jako
scenariusz **specjalny** (z `faults` albo `closedSections`) – tylko takie są na liście. Zmiana rozkładu stacji zmienia
wzorzec wszystkich służb: sprawdź `npm run check -- <stacja> --start <godzina> --minutes <30|60|120|180>` dla kilku pór.

## Gdy coś nie działa

- `Nieznany scenariusz` w `npm run check` – literówka w `id` albo scenariusz nie jest w `scenarios` stacji.
- `late-inbound` przy `high` wybranym przez gracza to informacja (opóźnienia od sąsiada do 40 min); przy wymuszonym
  `disruptions: 'high'` – uwaga, gdy powtarza się we wszystkich ziarnach: wydłuż `endTime` (zapas 44 min) albo przyjmij.
  Pociąg, który przez opóźnienie od sąsiada nie zdąży, nie daje kary „nieobsłużony” – ale gracz go nie obsłuży.
- Nowa stacja spoza `src/stations/index.js`: `checkScenario(station, scenario)` i `checkShift({ station, scenario })`
  przyjmują obiekty.
- Różne werdykty między ziarnami – zakłócenia są losowe; patrz zmiany z BŁĘDAMI (`--seeds` z ich ziarnem i `--verbose`).
