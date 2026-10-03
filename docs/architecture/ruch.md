# Ruch, rozkład i ocena

Część dokumentacji architektury – indeks i zasady: [`docs/ARCHITECTURE.md`](../ARCHITECTURE.md).

## Służba o wybranej porze (`src/model/duty.js`)

Na posterunkach do służby zwykłe zmiany („Pełna zmiana”, „Szczyt”) zastępuje służba: gracz wybiera pełną godzinę startu
(0–23) i długość (1, 2, 3 albo 5 h – `DUTY_MINUTES`; służba może przejść przez północ). `buildDuty(station,
{ start, minutes, seed })` zwraca scenariusz – obiekt dla `Simulation` (`id` `sluzba-<minuty>`, nazwa z godzinami,
`startTime`, `endTime`, własne `timetable` i `tasks`) – oraz `stats` (pora doby, liczba pociągów wg klasy). Moduł nie
zna żadnej stacji: wzorcem jest `station.timetable`, więc **nowy posterunek ma służbę bez dodatkowych danych**
(opcjonalnie `duty.period`).

Budowa: (1) powtórzenia wzorca co `patternPeriod` sięgające okna; pociąg jedzie razem ze swoją grupą – pociągami ze
składu (`unit`) i zadaniami manewrowymi (terminy, numery i godziny w treści przesunięte); (2) pora doby (`DAY_BANDS`,
`bandOf`) i klasa pociągu (`trainClass`: aglomeracyjny / regionalny / dalekobieżny / towarowy) mówią, co który kurs
linii jedzie, a ziarno – który (faza) i co wypada (`DUTY_SKIP`); (3) w miejsce niekursujących pociągów regionalnych
i dalekobieżnych wchodzą pociągi towarowe (udział `freight` pory; odstęp `FREIGHT_GAP` na szlaku); (4) **kontrola
definicji** (`checkScenario`) na zbudowanym scenariuszu: pociąg z błędem albo z uwagą, jakiej nie ma wzorzec stacji
(styk powtórzeń, konflikt toru albo szlaku), wypada. Kto wypada: przy uwadze o konflikcie dwóch pociągów (oznaczonej przez kontrolę
definicji polem `pair`, z drugim pociągiem w `with` – nie po kodzie uwagi) – pociąg towarowy spoza wzorca na tej samej drodze (ten sam wjazd, wyjazd albo tor, do 20 min obok), a gdy
takiego nie ma i przy każdej innej uwadze – pociąg, którego uwaga dotyczy; inne pociągi przez nią nie wypadają. Losowość
tylko z `mixSeed` (bez generatora zmiany – zakłócenia zmiany się nie przesuwają). Liczby i pory – przyjęte
(`docs/sources/posterunki.md`).

Brzegi okna (`DUTY_EDGE`): pociąg od sąsiada wchodzi do służby, gdy sąsiad wyprawia go co najmniej 2 min po starcie –
pierwsze zdarzenie nie wcześniej niż start + czas przejazdu szlaku z prędkością pociągu + 90 s dojazdu do peronu + 2 min
(`leadOf`; wolniejszy pociąg towarowy – odpowiednio później); pociąg bez wjazdu (stoi od początku, powstaje ze składu)
– 3 min po starcie. Ostatnie zdarzenie najpóźniej 10 min przed końcem. Otwarcie służby
(`DUTY_OPENING`): gdy pierwszy pociąg przyjeżdża później niż 5 min po najwcześniejszej możliwej chwili, po kolei – każdy
krok z kontrolą definicji – wraca pociąg wzorca z okna otwarcia, który wypadł (klasa kursująca o tej porze), pociąg
towarowy wchodzi w wolne miejsce wzorca w oknie, a na końcu pociąg towarowy na najwcześniejszą chwilę na szlaku
przelotowym (kolejność szlaków z ziarna); test: `tests/duty.test.js` („otwarcie służby”).

Służba bez pociągów: gdy po kontroli rozkład jest pusty (krótkie okno, środek nocy), po kolei – każdy krok z kontrolą
definicji – wracają pociągi, które wypadły dla urozmaicenia (`DUTY_SKIP`), potem pociąg towarowy wchodzi w każde wolne
miejsce (bez losowania udziału), na koniec pojedynczo pociągi wzorca innego kursu linii, której klasa o tej porze
kursuje. Pociąg klasy, która o tej porze nie kursuje (np. SKM o 02:00), nie wraca. Na posterunkach w grze żadna służba
nie jest pusta (`tests/duty-grid.js`); stacja z bardzo rzadkim wzorcem może dać pusty rozkład (bez wyjątku) – strona
posterunku takiej służby nie startuje.

Pociągi z nazwami: powtórzenie pociągu dalekobieżnego dostaje nazwę i relację pociągu z listy `src/model/data/namedTrains.js`
(plik generowany przez `scripts/named-trains.mjs` z rozkładu rocznego PKP Intercity, cała Polska), który jedzie tą samą
drogą – `src/model/namedTrains.js`: `namedTrainsVia(od, do)` (przez miasto początku, potem końca relacji; `cityOf`),
`namedTrainTitle`. Dobór w `buildDuty`: indeks z numeru wzorca i numeru powtórzenia (ta sama nazwa na każdej stacji na
trasie), nazwa nie wraca w jednej służbie w tym samym kierunku; pociąg kończący / zaczynający bieg na stacji – tylko
pociąg z listy kończący / zaczynający w tym mieście; EIP (zespół trakcyjny) zastępuje tylko EIP, pociągi wagonowe (EIC,
IC, TLK) – siebie nawzajem: mają wspólną pulę taboru, długość wpisu zostaje z wzorca, a prędkość idzie za nową
kategorią (TLK 140, IC / EIC 160 km/h), o ile wpis nie ma własnego `vmax`. Moduły nie znają stacji – nowa stacja gdziekolwiek w Polsce
korzysta z listy od razu, o ile relacje jej pociągów dalekobieżnych mają nazwy miast jak na liście.

Przez północ: w danych zmiany godziny następnej doby to 24, 25… (`Clock.stamp` – zapis bez zawijania; `Clock.parse`
czyta „25:10” jako ciąg dalszy zmiany; `endTime` „26:00” = 02:00). Symulacja liczy chwile bez zawijania, a do pokazania
służy `Clock.format` (zawija dobę) i `shownTime` (`src/model/timetable/entry.js`) – wpisy rozkładu i terminy zadań po północy mają napisy „00:30”
obok chwil `arrTime` / `depTime` / `deadlineTime`. Kto potrzebuje chwili, bierze pole `*Time`, nie napis. Kontrola
definicji czyta godziny z definicji (nie z rozkładu zmiany): godziny 24–47 dopuszcza tylko w scenariuszu z `endTime` po
24:00 (w zwykłej zmianie „26:15” to błąd `tt-time`), a godziny w nazwie zmiany porównuje z oknem modulo doba.

Gra: adres `?stacja=…&scenariusz=sluzba&zaklocenia=…&start=<godzina>&czas=<minuty>&seed=…[&srk=…]`. Wybór zmiany
(`src/model/shift/choice.js`) jest jeden dla gry, strony posterunku i narzędzi: `choiceFromParams` / `choiceToParams`
(adres ⇄ `{ station, scenario, duty, srk, seed, level, district }`), `simulationOptions` (opcje `Simulation`; służba
zbudowana dla ziarna – bez `seed` losowanego raz, więc służba jest inna za każdym razem; stanowisko gracza idzie też
do scenariusza służby), `dutyWindow` (godziny do nazwy). Strona posterunku (`StartScreen.#dutyChoice`): co pokazać,
mówi `shiftChoices` (`src/model/shift/offers.js`) – służba, scenariusze specjalne (z `faults` albo `closedSections`) i stanowiska
do wyboru (zwykłe zmiany stacji na różnych stanowiskach → pole „Stanowisko”, parametr `srk` – dla służby i dla
scenariusza specjalnego bez własnego `srk` w definicji: `srkChoosable`; scenariusz z własnym `srk` idzie na
swoim – `Simulation` bierze stanowisko scenariusza przed parametrem); pod wyborem pora doby
i liczba pociągów rozkładu, który powstanie (to samo ziarno idzie do adresu). Zwykłe zmiany zostają w definicji stacji:
są wzorcem, podstawą testów stacji i działają pod dawnym adresem. Wynik gracza zapisuje się pod `sluzba-<minuty>`.
Pociąg nadzwyczajny (poziom „duże”) jest kopią pociągu z rozkładu służby. Automat: `npm run check -- <stacja> --start
22 --minutes 120` – rozkład służby zależy od ziarna, więc każde ziarno (`--seeds`) i każde stanowisko stacji
(`shiftChoices(station).srks`) to osobny scenariusz `sluzba-<minuty>[-<srk>]#<ziarno>`: definicja i przebieg dotyczą
tego samego rozkładu. Testy: `tests/duty.test.js` (reguły), `tests/duty-grid.js` (każdy posterunek: siatka godzin
i długości przez kontrolę definicji oraz służby grane automatem), `tests/e2e/duty.spec.js`.

## Tabor pociągów (`src/model/rollingStock.js`)

Katalog `ROLLING_STOCK` (zespoły trakcyjne i lokomotywy jeżdżące w rejonie Trójmiasta – źródła w docs/sources/tabor.md,
„Tabor pociągów” i „Tabor pociągów – dynamika”) i czyste funkcje: `stockPlan(timetable, seed)` / `stockFor(entry,
timetable, seed)` (dobór taboru), `trainSpeed(entry, stock)` i `trainDynamics(entry, stock)` (prędkość i dynamika
z taboru). `Traffic` wybiera tabor raz, przy tworzeniu rozkładu zmiany (`stockPlan(rozkład, seed)`), i zapisuje go we
wpisie (`e.rollingStock`); pociąg nadzwyczajny (`addTrain`) dostaje tabor pociągu, z którego składu powstał (`unit`),
albo własne losowanie – tabor pociągów z rozkładu się nie zmienia. `#makeTrain` podaje `e.rollingStock` do `Train`
(`opts.stock`), a panel boczny (`SidePanel`) czyta to samo pole – pokazuje dokładnie tabor, który jedzie, i prędkość
`trainSpeed` (bez liczenia taboru od nowa przy każdym odświeżeniu).

* dynamika (`trainDynamics`, wołana przez `Train.applyDynamics` – przy utworzeniu pociągu, przy przekazaniu składu
  jako inny pociąg i po powrocie z manewrów): { vmax, accel, brake, power }. Zespół trakcyjny – przyspieszenie rozruchu
  i hamowanie służbowe typu (null – wartość kategorii), moc / masa zespołu, kilka zespołów jak jeden; lokomotywa –
  siła rozruchowa / (masa lokomotywy + masa ciągnięta), najwyżej `LOCO_ACCEL_MAX`, moc / ta sama masa; masa
  ciągnięta: pociąg towarowy – `mass` wpisu, pasażerski – wagony `(length − bufferLength) / COACH_LENGTH` po
  `COACH_MASS`; hamowanie lokomotywy z wagonami – kategorii; prędkość – `trainSpeed`. `Train.accelAt(v)` =
  min(accel, power / v): przy ruszaniu przyspieszenie z siły, wyżej ograniczone mocą. `accel` / `brake` wpisu mają
  pierwszeństwo (z `accel` wpisu – stałe przyspieszenie). Pociąg bez taboru (testy tworzące `Train` wprost) albo typ
  bez danych – dynamika kategorii (`categories.dynamicsFor`), stałe przyspieszenie;
* hamowanie (`brakingOf`, docs/sources/jazda-pociagu.md „Hamowanie jak maszynista”): `trainDynamics` zwraca też `brake` (największe
  opóźnienie hamowania służbowego – zespół: typu albo `UNIT_BRAKE`; pasażerski z lokomotywą: z drogi hamowania Ie-4 dla
  prędkości pociągu, wzór EN 14531-1; towarowy: z masy hamującej zależnej od masy na metr składu, P / G wg długości
  i masy), `brakeDelay` (czas do pełnego hamowania – wyprzedzenie) i `ease` (luzowanie przed zatrzymaniem – nie
  w towarowym dłuższym niż 300 m). `Traffic.#makeTrain` daje pociągowi maszynistę: `driverFactor(seed, nr)` (`mixSeed`,
  bez `sim.rng`) – część 0,6–0,8 opóźnienia służbowego, z którą planuje hamowanie (`Train.brakePlan`). `Train.brakeCurve(c,
  d)` to największa prędkość, z której pociąg zwolni do `c` na drodze `d` (z wyprzedzeniem `brakeDelay` i łagodnym
  dojazdem do zatrzymania); `brakingDistance(v)` wydłuża horyzont skanowania. Nagła zmiana sygnału: hamowanie od
  `brake` do `EMERGENCY_BRAKE` – jak dotąd. `Train` bez `opts.driver` (testy) hamuje pełnym `brake`, bez wyprzedzenia;
* sąsiedni posterunek wyprawia pociąg wg `trainSpeed` (wolniejszy pojazd – wcześniej, jak w rozkładzie ułożonym dla
  niego; `Traffic.#prepare`); przyspieszenia przy tym nie liczy, więc pociąg ruszający wolno przyjeżdża trochę później;
* pula kategorii (`skm`, `regio`, `ic`, `eip`; pociągi towarowe – lokomotywy o trakcji `tractionOf(entry)`, zdawcze także
  manewrowe), tylko typy nie wolniejsze niż pociąg (`vmax` typu ≥ `speedFor`, gdy taki typ jest), zespoły w liczbie
  dobranej do długości `length` (tolerancja `STOCK_LENGTH_TOLERANCE`); albo typy przypięte polem `stock` wpisu (typ lub
  lista typów) – każdy typ z listy, z liczbą zespołów najbliższą długości, wolniejszy ogranicza prędkość pociągu;
* ziarno: własny ciąg `Random` z ziarna zmiany i numeru pociągu (`mixSeed` z `src/core/Random.js` – to samo mieszanie
  co rozrzut zatrzymania `stopScatter`) – dobór nie zużywa `sim.rng`, więc opóźnienia i usterki losują się tak samo;
  przebieg zmiany zależy od taboru przez dynamikę i prędkość pociągów;
* pociąg ze składu innego (`unit`) – tabor początku łańcucha (`rootOf`, `chainOf`; zapętlony łańcuch – jeden początek
  dla całej pętli, `unitLoop`); kolejne pociągi jednej linii (`lineKey`: kategoria + `from` + `to`; pociąg bez `from`
  albo `to` – linia z jednego pociągu) w kolejności `byTime` (godzina liczbowo, potem numer) losują po kolei, następny
  bez typu poprzedniego, gdy pasuje inny;
* walidacja (`validate.js`): znany typ, trakcja lokomotywy jak pociągu towarowego, ten sam `stock` (jako zbiór typów)
  w łańcuchu `unit`, łańcuch `unit` bez pętli.

## Koniec zmiany i raport (`src/model/Score.js`, `src/ui/Report.js`)

Zmiana kończy się sama (`Simulation.#checkEnd`), gdy ostatni pociąg rozkładu jest wyprawiony na szlak (status
„odjechał” – nie czeka na dojazd do sąsiada; status na szlaku nie wraca do „jedzie”) i zadania manewrowe są wykonane
albo przepadły (`Traffic.isDone`; kolejność i gotowość zadania – `taskWaits`, `taskReady`, `taskAlive`, `taskState`
w `src/model/tasks/order.js`, wspólne dla ruchu, automatu dyżurnego i panelu), a blokady nie czekają na dyżurnego (dPo, telefonogram o odjeździe, Ko –
`Simulation.#blockDuties`; niewykonane dPo i telefonogram przy końcu z czasu liczą się w ocenie końcowej); inaczej
o `endTime` scenariusza. Gdy rozkład jest wyczerpany (3 min po ostatnim
czasie rozkładu / terminie zadania), a zmiana trwa, dziennik dostaje jedną podpowiedź „Rozkład wyczerpany – do
zakończenia zmiany: …” z pociągami stojącymi na stacji i zadaniami. `sim.report()` (także w trakcie) daje pełny
raport: ocena i punkty, wiersze pociągów (plan / rzeczywistość / tor / opóźnienie / stan), punktualność, zadania,
bilans zdarzeń wg kodu, liczniki dPz/Sz/dPo/dKo/rozprucia i dane zmiany (`endReason`: all-done | time | manual).
Zdarzenia oceny i wpisy dziennika o pociągu mają jego numer w polu `nr` (zadania – także `task`, przetrzymanie
i rozkaz – `signal`, obowiązki blokady – `exit`, jazda po pękniętej szynie – `section`): raport i automat sprawdzający
scenariusze przypisują je pociągowi bez czytania komunikatu.
`Report` rysuje go jako pełny ekran w motywie ekranu startowego (ocena jako pieczątka odbita raz przy otwarciu, kafelki jak
liczniki pulpitu – cyfry w okienku, stan lampką w rogu – i tabele jak arkusz rozkładu) z przyciskami
„Nowa zmiana…” (ekran startowy), „Zagraj ponownie” i powrotem do pulpitu; otwiera się na `shift-end` i z menu.
