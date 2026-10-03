# Testy i narzędzia

Część dokumentacji architektury – indeks i zasady: [`docs/ARCHITECTURE.md`](../ARCHITECTURE.md).

## Testy

Stacje testowe (`tests/fixtures/`): Stare Pustkowie (mała stacja jednotorowa, typ E, Eap) i Wola Pustkowska (linia
dwutorowa z blokadą jednokierunkową, odgałęzienie z Eap) – dawne stacje fikcyjne gry, usunięte z rejestru, ale
zachowane jako siatka bezpieczeństwa: `makeSim()` z `tests/helpers.js`, macierze przebiegów, zakłócenia, blokada,
rozkazy, układ kostek blokady. Nie są dostępne w grze.

* `tests/*.test.js` – logika (`node --test`), bez DOM; macierze przebiegów, pełne zmiany, luki modelu (`model-gaps`), misje (`szkolna`),
  polecenia wprost i protokół przycisków (`commands`), granice warstw (`layers`).
* Gra z automatem w teście: `play(sim).until('08:25', { stop: allArrived })` z `tests/helpers.js` (dyżurny domyślnie
  `autoDispatch`; także `AutoOperator`, funkcja albo `null` – same kroki). Rytm gry (krok 0,5 s, dyżurny w pierwszym
  kroku i potem co 2 s) jest w jednym miejscu – `play` w `src/model/check/play.js`, z którego korzysta też `playShift`
  (przegląd, automat sprawdzający). Kilka etapów jednej gry: `const game = play(sim, op); game.until('06:16'); …;
  game.until('06:30');` – dyżurny zachowuje rytm; `each(sim, { opTick, steps })` – sprawdzenia po każdym kroku; koniec,
  który się przesuwa: `until(() => sekundy)`. Własną pętlę `n++ % 4` mają tylko testy, które coś robią zaraz po kroku,
  a przed dyżurnym (z komentarzem przy pętli). Test rytmu: `tests/play.test.js`.
* Własne pociągi testu: `trainRow({ st, nr, from, to, arr, dep, track })` z `tests/helpers.js` – wiersz rozkładu
  z polami nazwanymi (domyślnie osobowy z postojem, 100 km/h; długość składu ze stacji – `TRAIN_LENGTH`; inne pola
  nadpisują domyślne) zamiast pomocników z argumentami po kolei; wpis pociągu po numerze – `sim.traffic.entry(nr)`
  (w testach też `entryOf(sim, nr)`).
* Odpowiedzi sąsiadowi bez automatu: `grant('W')` z `tests/helpers.js` – po każdym kroku daje pozwolenie (Poz) na
  żądanie sąsiada na wskazanych szlakach przez polecenie stanowiska (`sim.execute`), `{ ko: true }` – także Ko
  (`run(sim, 960, grant('W'))`); test nie naciska przycisków blokady sam. Pociąg stojący przed semaforem:
  `heldAt(sim, nr, sygnał, { from, minutes })`, na Starym Pustkowiu `trainAtA(sim)` (5310 przed A). Chwile jazdy
  pociągu dla testów usterek (zgłoszony, przebieg nastawiony, w przebiegu, przy peronie, wyjeżdża) – `at` w
  `tests/fault-harness.js`; nie pisz ich w pliku testu drugi raz.
* `tests/route-state.test.js` – stan przebiegu (`routeState` i pytania pokrewne) na typie E, IZH-111 i nastawni
  mechanicznej: każdy stan osiągany poleceniami i zajętością, bez ustawiania pól zapisu przebiegu.
* `tests/docs.test.js` – dokumentacja dzielona na obszary (architektura: `docs/ARCHITECTURE.md` + `docs/architecture/`,
  źródła: `docs/SOURCES.md` + `docs/sources/`): każdy plik obszaru w tabeli indeksu, pliki krótkie (indeks do 200
  wierszy, obszar do 400), odwołania „plik („Sekcja”)” w kodzie, testach i skillach wskazują plik, w którym ta sekcja
  jest; odwołanie do sekcji źródeł, której nie ma (literówka, stara nazwa, punkt zamiast sekcji), nie przechodzi.
* `tests/glossary.test.js` – słownik pojęć (`GLOSSARY.md`): każde pojęcie ma opis po angielsku i nazwę w kodzie, nazwa
  istnieje w `src/` (zmiana nazwy w kodzie bez słownika nie przechodzi), odesłania `_Więcej_` wskazują istniejące pliki.
* `tests/skills.test.js` – skille projektu (`.claude/skills/*/SKILL.md` – listy kroków dla sesji AI: nowa stacja,
  scenariusz, posterunek na mapie, stanowisko, diagnoza zatoru, zasada ze źródła) i `CLAUDE.md`: każda wymieniona
  ścieżka, polecenie `npm run` i skill istnieją; skrypt diagnozy zatoru działa. Zmiana nazwy pliku albo polecenia
  wymaga więc poprawienia skilla w tym samym commicie.
* `src/model/check/invariants.js` – niezmienniki bezpieczeństwa sprawdzane w każdym takcie (dwa pociągi na odcinku,
  odcinek w dwóch przebiegach – `Interlocking.lockConflicts`, sygnał zezwalający bez przebiegu albo na zajęty odcinek
  – poza nastawnią mechaniczną, zwrotnica przestawiana pod taborem, dwa pociągi na jednym torze szlakowym) oraz
  zdarzenia „spad” i „rozprucie”. Wspólne dla macierzy, testów usterek, automatu sprawdzającego i przeglądu; sprawdza
  je `tests/invariants.test.js`; asercja dla testów – `safety` w `tests/invariants.js`.
* Usterki w ustalonej chwili jazdy pociągu (`tests/fault-harness.js`): usterka zaczyna się przy zdarzeniu (pociąg
  zgłoszony, przebieg nastawiony, pociąg w przebiegu, przy peronie, wyjazd, na szlaku) – `Faults.add` – a cel wskazuje
  się względem pociągu. Ruch prowadzi automat; czynności, których automat nie robi (Sz, rozkaz „S”, ZeroLO, ITS / ITO),
  wykonuje w teście „dyżurny”. Sprawdzane są reguły urządzeń: niezmienniki, brak kar za czynności wymuszone usterką,
  stan po naprawie, żaden pociąg ani zgłoszenie nie przepada. Pliki:
  – `faults-signals-points.test.js` – usterka semafora i napędu zwrotnicy (zgłoszony, przebieg nastawiony, stoi przed
    semaforem, tuż przed pociągiem, przy peronie, wyjazd), pięć stanowisk Szkolnej i MOR-3 (Kalinowo), oba kierunki;
  – `faults-track.test.js` – fałszywa zajętość (przed i pod pociągiem, tor docelowy, przebieg wyjazdowy), blok
    przebiegowy niezwolniony przez pociąg (nastawnia mechaniczna), licznik osi z ZeroLO (MOR-3), pęknięta szyna z ITS / ITO;
  – `faults-block.test.js` – usterka blokady liniowej w każdej chwili wjazdu i wyjazdu, z naprawą w następnej chwili,
    na Eap dwukierunkowej (Szkolna, Kalinowo), jednokierunkowej (Jodłowa) i SBL (Brzezina), przy krzyżowaniu, pociągach
    po sobie i pociągu przelotowym; pilnuje też szlaku (jeden pociąg na torze szlakowym, pozwolenie);
  – `faults-combined.test.js` – dwie różne usterki na drodze jednego pociągu: semafor wyjazdowy i blokada tego wyjazdu
    (Sz / rozkaz „S” dopiero po „droga wolna”, dPo, zawiadomienie o odjeździe), semafor wjazdowy i blokada wjazdu (dKo
    odrzucone, przyjazd telefonogramem), napęd zwrotnicy albo semafor wjazdowy i fałszywa zajętość toru docelowego
    (Sz / rozkaz przez zwrotnice zamknięte, po zabezpieczeniu na miejscu); koniec zmiany z niewykonanym zawiadomieniem;
  – `faults-desks.test.js` – usterki obsługiwane przez protokół stanowiska, nie przez `sim.execute`: dKo i Sz przy długiej
    usterce semafora wjazdowego na każdym z sześciu stanowisk (przyciski typu E, adres i rozkaz IZH-111, SZI → SZW
    w EBILock, menu i potwierdzenie MOR-3, polecenie specjalne na monitorze, klawisz Sz nastawni mechanicznej), semafor
    naprawiony, gdy SZ czeka na potwierdzenie (Sz oceniany w chwili wyboru – `justifiedAtChoice` z protokołu), Sz
    wybrany bez usterki (−5 po potwierdzeniu); nastawnia mechaniczna – drążek w położeniu pośrednim
    przy zajętości toru docelowego z usterki, usterka semafora i bloku przebiegowego tego samego semafora (Sz
    i zwalniacz), usterka napędu zwrotnicy w Olszynach;
  – `faults-shunt.test.js` – zadania manewrowe Szkolnej przy usterce na drodze manewru (sygnalizator bez Ms2, napęd
    zwrotnicy, fałszywa zajętość – przed manewrem i w czasie jazdy): krótka bez kar; długa – przy sygnalizatorze
    zezwolenie dyżurnego, przy zwrotnicy i zajętości bez obejścia termin przesunięty, bez kar; ochrona drogi pociągu na Sz / rozkaz „S” (zwrotnicę trzyma utwierdzenie przebiegu albo Zz);
  – `faults-stations.test.js` – usterki na pozostałych stacjach: przebiegi wieloetapowe (Sopot A → H → O i L → C,
    Chylonia G502 → A502 – semafor pośredni, zajętość drugiego stopnia, semafor wyjazdowy), Rumia / Jodłowa / Brzezina
    (Eap jednokierunkowa i SBL: semafor wjazdowy i wyjazdowy, tor docelowy, napęd zwrotnicy, dKo / dPo przy Sz
    i rozkazie), dwa pociągi po sobie na SBL bez łączności, jazda po torze lewym w Sopocie jako odpowiedź na usterkę.
  Stan po naprawie (`leftovers`) obejmuje też blok początkowy zablokowany bez pociągu i niewykorzystane pozwolenie
  albo kierunek Eap.
  Błąd silnika znaleziony takim testem zostaje testem `todo` (uruchamia się, ale nie psuje wyniku) do poprawki, która
  zmienia go na zwykły test.
* Zezwolenie na jazdę manewrową obok uszkodzonego sygnalizatora (Ir-9 § 10 ust. 15): `Traffic.shuntPermit(nr)` –
  telefonogram radiowy `shunt-permit` (Łączność) albo polecenie `{ type: 'shunt-permit', nr }`; wymaga składu
  manewrowego na postoju, nastawionego przebiegu manewrowego od sygnalizatora przed nim i usterki tego sygnalizatora.
  `Train.shuntPermit` ({ signal, route }) pozwala minąć ten sygnalizator z prędkością 25 km/h w tym jednym przebiegu.
  Automat daje zezwolenie sam, gdy skład czeka przed uszkodzonym sygnalizatorem. Rozkaz „S” dla składu manewrowego –
  odmowa. Testy: `tests/faults-shunt.test.js`, `tests/e2e/trains.spec.js`.
* `scripts/seed-scan.mjs` (`npm run seed-scan`) – szukanie testów przypadkowych: zmiana tworzona w teście bez `seed`
  dostaje przy każdym uruchomieniu inne ziarno (`Simulation`: z `Math.random`), więc test z ciasnym zapasem pada raz na
  sto uruchomień, zwykle w CI. `scripts/random-seed.mjs` (ładowany przez `node --import`) podmienia `Math.random` na
  generator o ziarnie `SPRK_RAND=<n>` – „losowe” ziarna stają się powtarzalne. Skrypt uruchamia każdy plik testów pod
  wieloma zestawami (`--runs`, `--from`, `--only`), jedno zadanie na parę (plik, zestaw) w puli procesów na wszystkich
  rdzeniach; pierwszy zestaw ustala, które pliki w ogóle losują ziarno. Wynik: testy, które nie przeszły, z zestawami
  i poleceniem do odtworzenia. Poprawka testu: ziarno wpisane w teście albo zapas wynikający z modelu (krok symulacji),
  nie luźniejsza asercja. Test narzędzia: `tests/seed-scan.test.js`.
* `scripts/duty-variety.mjs` (`npm run duty-variety`) – różnorodność służb: dla każdego posterunku gracza, godziny startu
  i długości – rozkłady kilku ziaren (`--seeds`, domyślnie 1–4) i ile mają wspólnego parami: miejsca w rozkładzie
  (godzina, tor, wjazd, wyjazd – bez numerów) i spotkania (pary linii na stacji w odstępie do 3 min – kolejność
  pociągów); do tego średnia liczba pociągów i służby z pierwszym pociągiem później niż 20 min po starcie. Przed zmianą
  budowy służby `--json przed.json`, po niej `--compare przed.json`; `--month` / `--day` – stały termin (bez nich losuje
  ziarno). Miary w `scripts/lib/duty-variety.mjs`; test `tests/duty-variety.test.js` pilnuje na próbce (4 godziny, 2 h,
  4 ziarna, listopad, dzień roboczy), żeby dwa ziarna nie dawały prawie tego samego rozkładu.
* `scripts/survey.mjs` (`npm run survey`) – przegląd silnika: każda stacja × scenariusz × poziom zakłóceń × ziarno
  (domyślnie poziomy high i low, ziarna 1–4; scenariusz z własnym poziomem, np. „szczyt”, idzie raz na ziarno), pełna
  zmiana plus `--extra` minut z automatem, równolegle w `worker_threads`. Dla każdej zmiany: pociągi, które nie
  dojechały, naruszenia niezmienników (w każdym takcie), spad i rozprucie, kary za czynności wymuszone usterką
  (`unjustified`), stan urządzeń po zmianie (`leftovers` – liczony tylko bez zatoru), liczniki dPz i Sz, wynik oraz odcisk
  przebiegu ruchu (`fingerprint`). `--json` zapisuje wyniki, `--compare` porównuje je z zapisanymi (gorzej / lepiej /
  nowe zatory / inny przebieg przy tych samych wskaźnikach) – przed zmianą w silniku i po niej. Kod wyjścia 1 przy
  zatorze, naruszeniu, spad, rozpruciu, karze wymuszonej usterką albo pozostałościach po zmianie. Pełny przegląd (ok. 35 s na 10 rdzeniach) nie wchodzi do `npm test`;
  jego czyste funkcje sprawdza `tests/survey.test.js`. Pętlę zmiany (`playShift`: rytm gry z `play` – krok 0,5 s, automat co 2 s,
  niezmienniki po każdym takcie), kolejkę wątków (`runJobs` / `serveJobs` / `runParallel`) i wspólne opcje wiersza
  poleceń (`parseCli`) dzieli z automatem sprawdzającym scenariusze: pętla zmiany, niezmienniki i stan urządzeń po
  zmianie są w logice (`src/model/check/`: `play.js`, `invariants.js`, `outcome.js` – używają ich też testy i skill
  diagnoza-zatoru), wątki i opcje – w bibliotece narzędzi (`scripts/lib/workers.mjs`, `scripts/lib/cli.mjs`).
* `scripts/` – wiersz poleceń narzędzi (opcje, wątki, wydruk); ich logika bez wyjścia – `scripts/lib/`: raport zmiany
  zagranej automatem (`shift-report.mjs`, `checkShift`), werdykt i ocena scenariusza (`verdict.mjs`), wątki
  (`workers.mjs`), wspólne opcje (`cli.mjs`). Testy importują `scripts/lib/`, a skrypty tylko po to, by sprawdzić
  wiersz poleceń; źródła i skrypty nie importują niczego z `tests/` (`tests/layers.test.js`).
* `scripts/check-scenario.mjs` (`npm run check`) – automat sprawdzający scenariusze (sekcja „Automat sprawdzający scenariusze” niżej); jego reguły
  i statyczne kontrole sprawdza `tests/scenario-check.test.js` (każdy kod błędu na celowo zepsutym wariancie Szkolnej,
  przebiegi z błędem, zatorem i sondą usterek, werdykt i ocena scenariusza na raportach wzorcowych, wiersz poleceń),
  a każdy scenariusz każdej stacji (definicja i jeden przebieg: ziarno 1, poziom scenariusza – wymuszony `disruptions`
  albo `none`) – `tests/scenario-check.test.js` i `tests/scenario-check-run-1…4.test.js` (podział w
  `tests/scenario-runs.js`; pliki liczą się równolegle). Koszt (zmierzony): ok. 53 s czasu procesora (4 części po ok. 6 s, testy reguł
  ok. 4 s) – na 10 rdzeniach `npm test` dłuższy o ok. 5 s (17,3 → 22,1 s), na 4 rdzeniach (CI) szacunkowo o ok. 13 s. Scenariusz, który
  świadomie nie przechodzi, trafia do `KNOWN` w `tests/scenario-runs.js` z uzasadnieniem (test `todo`); uwagi
  powtarzalne (definicja i przebieg bez zakłóceń), które właściciel przyjął – do `tests/scenario-accepted.js` (nowa
  uwaga spoza listy zatrzymuje `npm test`).
* `tests/e2e/` – Playwright: `desk.spec.js` (ekran startowy: misje, sortowanie, odprawa; pulpit kostkowy: dwa przyciski, wyciągnięcie, Zw, blokada,
  ustawienia, struktura przycisków), `screen.spec.js` (monitor: pasek poleceń, menu elementu, polecenia specjalne, ekrany,
  skala symboli, perony i numery torów, sygnalizatory na linii, blokada przy wyjeździe, ustawienia domyślne, okręgi), `tutorial.spec.js` (samouczek: dymki, podświetlenie, przeciąganie, słownik, obie misje, ekran startowy nad dymkami), `screens-look.spec.js` (wygląd ekranów pełnych w obu motywach: semafor „Stój” / „wolna droga”, przystanki misji, tablica stacyjna, pieczątka i liczniki raportu, lampki ustawień, nagłówek na telefonie), `start-nav.spec.js` (ekrany wyboru: wyszukiwarka, filtry, adresy i „wstecz”, Esc, mapa i schemat regionu, postęp, ustawienia z tytułu, brak mignięcia pulpitu), `visual.spec.js` (zrzuty ekranu porównywane ze wzorcami w `__screenshots__`,
  próg 300 pikseli, żeby drobne zmiany symboli też były wykrywane). Pomocniki w `helpers.js`: `openShift` (ustawienia w localStorage, zegar zatrzymany),
  `btn`/`tap` (przyciski wg `data-ref`), `simState`, `advance` (krok symulacji bez czekania).
* Wzorce zrzutów odświeża się na komputerze (`npm run test:e2e:update`, dowolny system): przed zrzutem litery stają się
  przezroczyste (`HIDE_GLYPHS` w `visual.spec.js` – miejsce zostaje), bo rasteryzacja tej samej czcionki różni się między
  systemami (CoreText / FreeType / DirectWrite); układ, kształty i barwy są wszędzie te same, więc wzorzec z macOS przechodzi
  w CI (kontener Linux). Napisy sprawdzają asercje `toHaveText` w testach zachowania.

## Automat sprawdzający scenariusze (`scripts/check-scenario.mjs`, `src/model/scenarioCheck.js`)

Do szybkiego dodawania wariantów scenariuszy (inne okno zmiany, podzbiór pociągów, usterki) istniejących i nowych
stacji: `npm run check -- [stacja[:scenariusz] …] [--seeds 1-3] [--level none|low|high|all] [--extra min]
[--tutorial] [--strict] [--verbose] [--json plik]` (służba: `--start <godz.> --minutes <n>`, termin `--month 1–12
--day roboczy|sobota|niedziela` – bez niego losuje ziarno) – bez stacji wszystkie; `--level all` (domyślnie) to `none`, `low`
i `high` (inaczej niż w `survey`, gdzie `all` = `high` i `low`); scenariusz z własnym `disruptions` idzie tylko na
swoim poziomie. Kod wyjścia 1, gdy któryś scenariusz ma ocenę BŁĘDY (z `--strict` także UWAGI); 2 – błędne opcje,
nieznana stacja.

**Poziomy ustaleń.** `error` (BŁĄD) – do poprawy; `warning` (uwaga) – ryzyko kar albo rzecz nietypowa w zamyśle
scenariusza; `info` – wypisywane, bez wpływu na ocenę: odporność na zakłócenia wybierane przez gracza i ograniczenia
silnika / automatu (pociąg nadzwyczajny, który nie zdążył przed końcem zmiany, automat czeka na naprawę usterki, nie zeruje licznika osi,
nie zamyka toru). **Poziom scenariusza** to `none` albo wymuszony `disruptions` – zamysł autora; `low` / `high`
wybierane przez gracza sprawdzają odporność.

**Ocena scenariusza** (`scenarioStatus`): BŁĘDY – błąd definicji albo zmiana z błędem na dowolnym poziomie; UWAGI –
uwaga definicji albo uwaga w zmianie na poziomie scenariusza (bez zakłóceń – każda, bo przebieg jest praktycznie
powtarzalny – bez losowych opóźnień i usterek ziarna różnią się najwyżej o sekundy;
przy wymuszonym poziomie losowym – rodzaj uwagi powtarzający się we wszystkich ziarnach); inaczej OK. Uwagi z
poziomów gracza idą do wiersza „Odporność” (ile zmian z uwagami, jakie kody) i do podsumowania, bez wpływu na ocenę.
Jedna granica czasu w definicji i przebiegu: pociąg odjeżdżający musi mieć planowy odjazd co najmniej `LATE_SLACK`
= 4 min przed końcem zmiany (od odjazdu do zjazdu ze stacji 1–4 min, zmierzone automatem), a zapas na opóźnienia
od sąsiada przy poziomie L to `levelSlackMin(L)` = opóźnienie poziomu + 4 min (low 19 min, high 44 min) – ta sama
liczba w uwadze `sc-slack` definicji i w `late-inbound` przebiegu.

1. **Definicja** – najpierw `validateStation` (w wierszu poleceń raz na stację, z pełną treścią błędów i uwag; przy
   błędach przebiegi stacji są pomijane), potem `checkScenario(station, scenarioId | obiekt, { missions, levels })`
   (moduł logiki, bez DOM): lista `{ level, code, msg, train? }`; konflikt dwóch pociągów (tor, szlak) ma też `pair: true`
   i `with` – drugi pociąg (dane dla programów, np. budowy służby). Kontrole czytają symulację utworzoną bez kroku
   (rozkład z czasami w sekundach, odcinki i przebiegi po normalizacji, blokady), bez losowych zakłóceń; łańcuchy
   przebiegów wjazdu i wyjazdu są te same co w automacie dyżurnego i w ruchu (`src/model/trainPaths.js`). Błędy:
   stacja niepoprawna (`station-invalid`, każdy błąd walidacji osobno), nieznany / powtórzony scenariusz, pole spoza
   formatu (literówka – z podpowiedzią najbliższego pola, bo gra je po cichu pomija), lista scenariusza nie jako
   tablica, poziom, misja, srk, czas nie GG:MM, `endTime` ≤ start, `trains` z numerem spoza rozkładu (także napis
   zamiast liczby) albo razem z `timetable`, własny `timetable` niepoprawny wg `validateTimetable`, pusty rozkład,
   pociąg, który nie powstanie (`from: null` bez `startOn` / `unit`, `startOn` na nieistniejącym odcinku, dwa na
   jednym), nawrót bez zmiany czoła (wjazd i wyjazd po tej samej stronie stacji, `startOn.dir` przeciwny do wyjazdu),
   nigdy nie będzie obsłużony (bez `to`, `terminates`, następcy), skład `unit` spoza zmiany / z dwoma następcami / po
   odjeździe następcy, powtórzony numer, odjazd przed przyjazdem, tor planowy nieistniejący albo bez przebiegu z wjazdu
   / na wyjazd (pociąg z postojem – kara pewna), pociąg przed startem (przyjedzie po planie, wypadnie z punktualności)
   albo za blisko końca zmiany (odjazd mniej niż 4 min przed końcem, przyjazd kończącego bieg po końcu), zadania
   (składu nie ma, termin niepoprawny / niewykonalny / przed startem, `afterTask` nieistniejące, tor docelowy
   nieistniejący, bez drogi manewrowej z toru po poprzednim zadaniu albo zamknięty przez cały czas na zadanie, skład
   jadący dalej, ostatnie zadanie zostawia skład na torze bez wyjazdu następcy), usterki (nieznany rodzaj / element,
   `at` nie jako napis GG:MM – liczbę gra wzięłaby za sekundy od północy, `duration`, po końcu zmiany, blok
   przebiegowy poza nastawnią mechaniczną), zamknięcia toru (nieznany odcinek, czas, `from` ≥ `to`, pociąg bez
   objazdu do końca zmiany). Uwagi: sąsiad musiałby wyprawić pociąg przed startem (≥ 2 min), dwa pociągi na jednym
   torze w planie, wjazdy jednym szlakiem gęściej niż jazda po nim (`line-headway`) i wyjazdy na szlak, zanim
   poprzedni pociąg go zwolni (`line-headway-out`; szlak to jeden odstęp – także SBL), wyjazd i wjazd naprzeciw na
   Eap, zapas `sc-slack` przy wymuszonym poziomie, godziny w nazwie zmiany inne niż okno (`sc-name-window`), uwaga walidacji wpisu własnego rozkładu (pociąg dłuższy niż tor),
   zadanie po terminie / bez `afterTask` / odziedziczone i pominięte / na tor przyjazdu (bez manewrów) / z terminem po
   odjeździe następcy / zostawiające skład na innym torze niż następca, usterka przed startem / po końcu (bez licznika
   osi i samouczków) / na tarczy manewrowej / na odcinku podzielonym przez łącznicę, zamknięcie poza oknem albo toru
   planowego. Informacje: `sc-slack` przy poziomach gracza, zmiana za krótka na pociąg nadzwyczajny (`extra-none`), usterka, której
   automat nie obsługuje (`fault-automat`). Listę misji podaje wywołujący – logika nie importuje samouczka.
2. **Przebieg** – `checkShift(job)`: zmiana grana `playShift` (jak przegląd) z obserwatorem; `station` – obiekt stacji
   (np. nowej, spoza `src/stations/index.js`, także z okręgami) zamiast `stationId`, `scenario` – obiekt zamiast
   `scenarioId`, `forceLevel` – poziom zamiast `disruptions` scenariusza (**sonda usterek**: scenariusz z usterkami bez
   przebiegu na poziomie none – wymuszony inny poziom albo `--level` bez none – dostaje jeden przebieg bez zakłóceń,
   który ocenia tylko wpływ usterek i bezpieczeństwo). Obserwator co takt automatu zapisuje przyczynę postoju każdego
   pociągu (`Traffic.waitReason`, a także pociąg u sąsiada po planowym wyprawieniu – `neighbour-wait` – i pociąg ze
   składu, którego skład nie przyszedł – `unit-wait`; bez postoju do planowego odjazdu), minuty postoju przy czynnej
   usterce na drodze pociągu, które usterki dotknęły których pociągów, chwilę obsłużenia, odjazd pociągu stojącego od
   początku zmiany (silnik nie zgłasza go zdarzeniem); przy postoju ponad 2 min – przeszkody przebiegów od
   sygnalizatora (`Interlocking.routeProblems` z polami `section` / `point` / `route` / `exit`) przypisane pociągowi,
   który zajmuje odcinek albo ma na nim przebieg nastawiony lub nastawiany (`by`), albo usterce; położenie zwrotnic
   własnego przebiegu na nastawni mechanicznej (`point-position`) to nie przeszkoda z zewnątrz. Przy przyjęciu na inny
   tor – kto w tej chwili zajmował tor planowy i czy plan sam kładzie tam inny pociąg. W chwili końca zmiany – migawka
   pociągów nieobsłużonych (gdzie stoją, od kiedy, przyczyna, przeszkody, pociąg na szlaku, ostatnie wpisy dziennika z
   ich numerem – pole `nr` wpisów i zdarzeń oceny). Przebieg trwa do końca zmiany + `--extra` min (domyślnie 120), ale
   kończy się wcześniej, gdy po końcu zmiany wszystko jest obsłużone i urządzenia są w stanie zasadniczym (ten sam ruch
   co bez skrótu). Raport (zwykły obiekt, przechodzi między wątkami i do JSON): pociągi (plan i rzeczywistość, tor,
   opóźnienie wniesione – od sąsiada i ze składu – i kara na stacji z `late-depart` / `late-pass`, w tym czekanie na
   szlak, postoje), pociągi nieobsłużone na koniec zmiany i po zapasie (skład w manewrach – z zadaniem i oceną grafu
   przebiegów manewrowych), zadania (termin po przesunięciu), usterki z dotkniętymi pociągami, pociągi nadzwyczajne,
   naruszenia, zdarzenia, kary wymuszone usterką, stan urządzeń, ocena w chwili końca zmiany.
3. **Werdykt** – `verdict(raport)`: status zmiany z błędów i uwag (informacje się nie liczą).
   - BŁĘDY: naruszenie zależności, spad, rozprucie, jazda po pękniętej szynie bez takiej usterki w scenariuszu na tym
     odcinku, zator po zapasie, kara wymuszona usterką, stan urządzeń po zmianie, zadanie przepadło przed końcem
     zmiany bez usterki, wyjątek, zmiana bez pociągów (`no-traffic`), usterka ze scenariusza bez wpływu na ruch bez
     zakłóceń (także w sondzie usterek); pociąg nieobsłużony na koniec zmiany: bez opóźnienia wniesionego i mniej niż
     4 min przed końcem wg planu (`plan-tight`), bez zakłóceń – każdy poza usterką (`unfinished-plan`, z planem i
     przyczyną), przy zakłóceniach – gdy wg planu i opóźnienia od sąsiada zdążyłby, a ≥ 5 min stał z winy stacji
     (`unfinished`; nie liczy się szlak, usterka, pociąg opóźniony z zewnątrz – nadzwyczajny, od sąsiada, ze składu,
     czekający ≥ 2 min na szlak – ani cudzy przebieg bez ustalonego pociągu); bez zakłóceń kara na stacji ≥ 15 min.
   - UWAGI (na poziomie gracza część z nich to informacje): pociągi opóźnione od sąsiada albo ze składu, które nie
     zdążą przed końcem (`late-inbound` – z tym samym zapasem co `sc-slack`), kaskada (`cascade`), zapas do końca zmiany
     < 5 min (`margin`, m:ss), kara na stacji – bez zakłóceń każda, przy zakłóceniach od 5 min – przetrzymanie albo
     postój ≥ 5 min wg przyczyny: szlak (`line-capacity`), konflikt z pociągiem albo cudzym przebiegiem
     (`track-conflict`), inna przeszkoda z zewnątrz (`station-delay`), bez przeszkody z zewnątrz (`automat-delay` –
     zwłoka automatu albo przyczyna nieznana), odjazd pociągu stojącego od początku zmiany po planie (bez kary w grze),
     inny tor (`wrong-track`, z pociągiem na torze planowym), zadanie po terminie / nierozstrzygnięte / przepadłe przy
     usterce, zadanie po końcu zmiany (`task-after-end` – bez kary w grze), niewykonany obowiązek blokady.
   - INFORMACJE: pociągi nadzwyczajne bez obsługi do końca zmiany (`extra-after-end` – planowane w zmianie, nie zdążyły
     przez opóźnienie w ruchu), automat czeka na naprawę (`fault-wait`, z oznaczeniem usterki losowej poziomu), usterki, których
     automat nie usuwa, i jazda po pękniętej szynie z usterki scenariusza (`automat-limit`), odjazd przed planem
     pociągu stojącego od początku zmiany (`early-depart`). Progi to stałe silnika: kara za przetrzymanie od 2 min /
     przed semaforem od 4 min, za przelot od 3 min, termin zadania + 10 min, opóźnienia od sąsiada poziomów.

**Lista przyjętych uwag** (`tests/scenario-accepted.js`, `deterministicWarnings`): uwagi powtarzalne – definicji
i przebiegu bez zakłóceń – każdego scenariusza. `npm test` nie przechodzi, gdy dojdzie uwaga spoza listy (nowy
scenariusz albo zmiana silnika / automatu pogarszająca znany); komunikat testu podaje gotowy wiersz do przyjęcia.

Automat steruje zależnościami wprost (`sim.execute`), więc sprawdza rozkład i zależności, a nie obsługę pulpitu:
warianty różniące się tylko widokiem stanowiska dają ten sam ruch, a srk z innymi parametrami zależności (nastawnia
mechaniczna – ręczne zwrotnice, blok przebiegowy, czasy) – inny. Wydruk w terminalu: stacje z błędami walidacji
(raz), dla każdego scenariusza ocena z liczbą zmian z uwagami przy zakłóceniach, definicja (błędy, do 6 uwag, do 3
informacji), wiersz każdej zmiany (werdykt, koniec, zapas, wynik; † – sonda usterek), błędy z przeszkodami
i dziennikiem pociągu, uwagi i informacje o pojedynczych pociągach w jednym wierszu na rodzaj (z pierwszym
blokującym pociągiem), przy wymuszonym poziomie losowym – rodzaje uwag powtarzające się we wszystkich ziarnach,
wiersz „Odporność”; `--verbose` – pełne ustalenia, tabela pociągów, zadania, usterki; na końcu podsumowanie
(scenariusze wg oceny, uwagi powtarzalne, zmiany wg werdyktu, błędy, uwagi na poziomie scenariusza, odporność,
informacje, czas).

**Kara „nieobsłużony”** (`Simulation.#finalScore`): −10 za pociąg nieobsłużony na koniec zmiany (`unfinished`), ale nie
za pociąg, którego nie dało się obsłużyć przez opóźnienie wniesione z zewnątrz – `Traffic.lateFromOutside`: opóźnienie
od sąsiada albo składu, z którego pociąg powstaje (`inboundLag`, `unitLag` – ta sama liczba co przy karze za
przetrzymanie), a planowa obsługa przesunięta o nie (`expectedDone`) wypada mniej niż `LATE_SLACK` (4 min) przed końcem.
Taki pociąg dostaje pozycję 0 pkt `unfinished-late` (z polem `lag`), w raporcie zostaje na liście nieobsłużonych
z `excused` („opóźniony od sąsiada, bez kary”), a kafelek pociągów nie jest czerwony, gdy wszystkie nieobsłużone są
takie. Werdykt automatu (`late-inbound`) liczy to samo tymi samymi funkcjami. Testy: `tests/unfinished-late.test.js`,
`tests/e2e/report.spec.js`.

**Pociąg nadzwyczajny** (poziom „duże”, `Simulation.#planExtraTrains`): kopia losowego pociągu przelotowego z rozkładu
stacji przesunięta o 25…70 min (`EXTRA_TRAIN`), mieszcząca się w zmianie (`extraTrainShifts`): zapowiedź 25 min przed
przyjazdem nie przed startem, ostatnie zdarzenie co najmniej 10 min przed końcem. Losowania są dwa jak dotąd (pociąg,
przesunięcie): gdy wylosowany pociąg się mieści, zmiana przebiega jak przedtem; inaczej z tych samych liczb wychodzi
pociąg i przesunięcie spośród mieszczących się, bez dodatkowych losowań (reszta zakłóceń zmiany ta sama); gdy żaden
się nie mieści – zmiana bez nadzwyczajnego (`extra-none` w kontroli definicji). Test: `tests/extra-trains.test.js`.

**Luki silnika i automatu** (zgłaszane przez automat jako informacje albo uwagi, do decyzji właściciela): pociąg
stojący od początku zmiany nie dostaje zdarzenia „odjazd” – silnik nie trzyma go do planowego odjazdu (stan
„zatrzymany”, nie „postój”), więc automat wyprawia go od razu, a odjazdu po planie nie karze;
automat nie zeruje licznika osi, nie zamyka toru z usterką nawierzchni, nie podaje sygnału zastępczego na wjeździe
(tylko na wyjeździe przy usterce blokady) i nie mówi, na co czekał, gdy stoi bez przeszkody z zewnątrz.
