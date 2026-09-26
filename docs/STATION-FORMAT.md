# Format definicji stacji (schemat v1)

Stacja to moduł ES eksportujący obiekt (docelowo także JSON z edytora). Przykład: `src/stations/stare-pustkowie.js`.
Walidacja: `validateStation(def)` w `src/model/validate.js`.

```js
export default {
  schemaVersion: 1,
  id: 'stare-pustkowie',          // identyfikator (URL: ?stacja=…)
  name: 'Stare Pustkowie',
  description: '…',
  startTime: '05:52',             // początek zmiany
  desk: { cols: 32, rows: 10 },   // wymiary pulpitu w kostkach (40×40 px)
  exits: { … },                   // szlaki (wyjazdy ze stacji)
  sections: { … },                // odcinki izolowane
  points: { … },                  // parametry zwrotnic (opcjonalne)
  tiles: [ … ],                   // kostki pulpitu
  routes: { disable: [], override: {} },
  timetable: [ … ],
};
```

## Siatka i porty

Każda kostka zajmuje pole `(x, y)`; `x` rośnie w prawo (wschód), `y` w dół.
Kostki torowe łączą się przez **porty** – 8 kierunków: `N NE E SE S SW W NW`.
Kostka `(5,4)` z portem `E` łączy się z kostką `(6,4)`, jeśli ta ma port `W`;
port `SE` łączy się z `(6,5)` posiadającą port `NW`.

## Typy kostek (`src/tiles/registry.js`)

| type | kategoria | pola | opis |
|------|-----------|------|------|
| `track` | torowa | `ports:[a,b]`, `section`, `derailer?`, `endButton?`, `text?` | prosty `['W','E']`, skos `['NW','SE']`, łuk `['NW','E']` |
| `buffer` | torowa | `port`, `section`, `endButton?` | kozioł oporowy |
| `point` | torowa | `id`, `toe`, `straight`, `diverge`, `section`, `label?`, `speedDiverging?` | zwrotnica: ostrze, tor zasadniczy (+), tor zwrotny (−) |
| `crossing` | torowa | `pairs:[[a,b],[c,d]]`, `section` | skrzyżowanie torów |
| `signal` | sygnał | `id`, `kind:'semafor'|'tm'`, `at:{x,y}`, `dir:'E'|'W'`, `shunting?`, `substitute?`, `overlap?`, `entry?` | powtarzacz sygnalizatora z przyciskami; stoi na granicy wyjścia z kostki `at` w kierunku `dir` |
| `button` | sterownicza | `id`, `label`, `role`, `color?`, `counter?` | przycisk grupowy: `group-point` (Zw), `point-lock` (Zz), `route-release` (Pz), `emergency-release` (dPz), `substitute` (Sz) |
| `block` | blokada | `exit` | pole blokady liniowej Eap (4×2 kostki) dla szlaku `exit` |
| `label` | opis | `text`, `size?`, `span?` | napis |
| `blank` | – | – | pusta kostka (uzupełniana automatycznie) |

Dodatki na kostce torowej:

* `derailer: 'Wk1'` – wykolejnica (położenia `on` = nałożona, `off` = zdjęta),
* `endButton: { id, color }` – przycisk końca przebiegu (na kostce wyjazdu na szlak – zielony; na kozłach – biały),
* `text` – opis (np. nazwa sąsiedniego posterunku).

## Odcinki izolowane (`sections`)

```js
T1: { length: 520, kind: 'station', track: '1', platform: 'Peron I' }
```

* `length` – długość w metrach (rozkładana na kostki proporcjonalnie do geometrii),
* `kind` – `approach` (zbliżania), `point` (zwrotnicowy), `station`, `siding`, `plain`,
* `track` – numer toru (do rozkładu jazdy), `platform` – peron (pociągi osobowe zatrzymują się): `true` lub nazwa
  (`'Peron II'`, liczba `2`) – monitor rysuje peron jako szary prostokąt z tą nazwą (wyspowy między dwoma torami
  peronowymi, inaczej boczny).

## Szlaki (`exits`)

```js
W:  { name: 'Lipowa', tile: { x: 0, y: 4 }, dir: 'W', lineLength: 4200, lineSpeed: 100 }
K1: { name: 'Krasne', label: 'Krasne – tor 1', tile: { x: 0, y: 4 }, dir: 'W', direction: 'out', lineLength: 6100 }
```

`tile` + `dir` – kostka torowa i port, przez który tor opuszcza pulpit. `lineLength` – długość toru szlakowego
(wirtualnego, poza pulpitem) w metrach. Każdy szlak ma własną blokadę liniową i posterunek sąsiedni sterowany przez AI.

* bez `direction` – szlak jednotorowy z blokadą Eap dwukierunkową (Wbl, Poz, Ko, dPo, dKo),
* `direction: 'out'` / `'in'` – tor szlakowy linii dwutorowej z ruchem jednokierunkowym (tylko Po/Ko;
  na torze wjazdowym sąsiad wyprawia bez pozwolenia, na torze wyjazdowym nie ma pozwolenia),
* `block: 'sbl'` (wymaga `direction` = kierunek zasadniczy) – blokada samoczynna linii dwutorowej: bez pozwoleń
  i bez Ko, odstęp zwalnia się sam; blokada dwukierunkowa – jazda „pod prąd” po zmianie kierunku (`Zk`,
  na pulpicie kostkowym przycisk Wbl) przy wolnym odstępie; sąsiad zmienia kierunek sam, gdy odstęp jest wolny
  i nie mamy nastawionego wyjazdu. Przy usterce – zapowiadanie telefoniczne i dPo/dKo jak w Eap.
  Kostka `block` (pole Eap) jest rysowana tylko na pulpicie kostkowym; monitor pokazuje stan blokady przy wyjeździe,
* `label` – napis na polu blokady (gdy dwa tory prowadzą do tego samego posterunku).

## Przebiegi (`routes`)

Tablica zależności jest wyznaczana **automatycznie** z topologii (`Topology.pathsFrom`):
od każdego sygnalizatora w jego kierunku do następnego sygnalizatora / szlaku / kozła.
Dla każdego przebiegu wyznaczane są: odcinki drogi przebiegu, wymagane położenia zwrotnic,
zwrotnice ochrony bocznej, wykolejnice (na drodze – zdjęte, sąsiadujące – nałożone),
droga ochronna (odcinek za semaforem końcowym) i prędkość (40/60 przez tor zwrotny).

* `routes.disable: ['A-D2']` – usuwa przebieg,
* `routes.override: { 'A-D2': { speed: 60 } }` – nadpisuje pola przebiegu.

Identyfikatory: `START-KONIEC` (`A-D1`, `C1-W`), manewrowe z semafora z Ms2: sufiks `m` (`D2-kT3m`).

## Scenariusze (`scenarios`)

```js
{ id: 'nauka-1', name: 'Misja 1…', description: '…', trains: [5311, 5310], startTime: '07:10', endTime: '09:10',
  faults: [{ type: 'signal-fail', target: 'A', at: '08:33', duration: 10 }], closedSections: [{ section: 'T1', from: '05:52', to: '06:50' }],
  disruptions: 'none', timetable: [ … ], tasks: [ … ], tutorial: 'monitor', srk: 'komputerowe' }
```

* `trains` – podzbiór rozkładu stacji (numery), `timetable` – własny rozkład scenariusza,
* `faults` – usterki zadane (`signal-fail`, `point-control`, `false-occupancy`, `block-fail`), `closedSections` – zamknięcia torów,
* `disruptions` – wymuszony poziom zakłóceń (`none` / `low` / `high`), inaczej wybiera gracz,
* `tutorial` – identyfikator misji wprowadzającej (`src/tutorial/missions.js`: `monitor`, `pulpit`); gra pokazuje dymki krok po kroku,
* `srk` – wymuszone stanowisko obsługi (`E` / `komputerowe`) niezależnie od stacji i ustawień gracza (misja 2 uczy pulpitu kostkowego).

## Rozkład jazdy (`timetable`)

```js
{ nr: 5310, kind: 'os', name: 'Osobowy', from: 'W', to: 'E', arr: '06:05', dep: '06:07',
  track: '1', stop: true, length: 130, vmax: 100, dwell: 60 }
```

* `from`/`to` – szlaki (`null` = pociąg zaczyna/kończy bieg na stacji),
* `arr`/`dep` – czasy planowe, `stop` – zatrzymanie (przelot: `false`), `terminates` – kończy bieg,
* `startOn: { section, dir }` – pociąg stojący na stacji od początku zmiany,
* `kind`: `os` (osobowy), `tow` (towarowy) – wpływa na przyspieszenie/hamowanie.

Sąsiedni posterunek żąda pozwolenia ok. 4 min przed planowanym wyjazdem i wyprawia pociąg tak,
by przyjazd nastąpił o czasie rozkładowym (przy natychmiastowym pozwoleniu i wolnej drodze).

Pociąg tworzony ze składu innego pociągu (np. zdawczy powrotny):

```js
{ nr: 90212, kind: 'tow', name: 'Zdawczy', unit: 90211, from: null, to: 'W', dep: '08:12', track: '2', stop: false, length: 180, vmax: 60 }
```

`unit` – numer pociągu, który zakończył bieg na stacji; jego skład staje się pociągiem `nr` 15 min przed `dep`
(o ile stoi). Skład trzeba podstawić na właściwy tor manewrami i ustawić czołem do semafora wyjazdowego.

## Zadania manewrowe (`tasks`)

```js
{ id: 'odstaw-90211', unit: 90211, type: 'move', toTrack: '3', deadline: '07:52', after: '07:40', text: '…' }
```

Zadanie jest wykonane, gdy cały skład `unit` stoi na torze `toTrack` (po `after`, jeśli podane).
Przed `deadline` +10 pkt, po terminie 0, niewykonane w ciągu 10 min po terminie −10 pkt.
Skład przełącza się w jazdę manewrową w zakładce *Stan* (porusza się tylko w nastawionym przebiegu manewrowym, za Ms2).

## Scenariusze (`scenarios`)

```js
{ id: 'awaria-zw3', name: 'Awaria zwrotnicy 3', description: '…',
  trains: [5314, 5315, 90211],          // podzbiór rozkładu (domyślnie cały)
  startTime: '07:10', endTime: '08:30',  // koniec zmiany – raport
  faults: [{ type: 'point-control', target: 'Zw3', at: '07:36', duration: 12 }],
  closedSections: [{ section: 'T1', from: '05:52', to: '06:50' }],
  disruptions: 'none' }                  // wymuszony poziom zakłóceń (inaczej wybór gracza)
```

Typy usterek: `signal-fail` (semafor bez sygnału zezwalającego), `point-control` (brak kontroli po przestawieniu),
`false-occupancy` (zajętość bez pociągu), `block-fail` (blokada bez łączności – zapowiadanie telefoniczne).
`duration` w minutach. Poziomy zakłóceń (`none`/`low`/`high`) dodają losowe opóźnienia, usterki i pociągi nadzwyczajne;
ziarno losowe (`seed`) daje powtarzalną zmianę.

## Okręgi nastawcze (`districts`)

```js
districts: {
  GO:  { name: 'GO – nastawnia dysponująca', short: 'GO', role: 'dysponująca', cols: [35, 99] },
  GO2: { name: 'GO2 – nastawnia wykonawcza', short: 'GO2', role: 'wykonawcza', cols: [0, 34] },
}
```

Pulpit dzieli się po kolumnach na osobne pulpity (zakładki). Sygnalizatory, zwrotnice i szlaki należą do okręgu
wg kolumny kostki. Gracz wybiera okręg (`?okreg=GO|GO2|both`); pozostałe prowadzi `AutoOperator`:
nastawnia wykonawcza działa tylko na polecenia dyżurnego (`sim.issueCommand`), dyżurny-automat sam wydaje polecenia
graczowi-nastawniczemu. Przyciski obcego okręgu są zablokowane, jego pulpit jest w podglądzie.

## System srk stacji (`srk`)

Pole opcjonalne na najwyższym poziomie definicji: `srk: 'E'` (urządzenia przekaźnikowe typu E, pulpit kostkowy –
domyślnie) lub `srk: 'komputerowe'` (stanowisko z monitorem: schemat na ciemnym tle, polecenia z menu elementu,
polecenia specjalne z potwierdzeniem). Lista strategii: `src/srk/registry.js`. Układ kostek jest wspólny dla obu
stanowisk – monitor rysuje ten sam plan jako schemat liniowy. Nieznana wartość jest błędem walidacji.

## Ekrany pulpitu (`screens`, opcjonalne)

Szerokie stacje są dzielone automatycznie na „ekrany” (okna kolumn) mieszczące się w oknie przeglądarki – jak
monitory stanowiska LCS (`src/render/screens.js`: cięcia poza rozjazdami, skosami i sygnalizatorami, zakładka
2 kolumn, nazwy wg wyjazdów). Autor stacji może narzucić podział: `screens: [{ x0, x1, name }, …]` – wtedy
podział automatyczny jest pomijany.
