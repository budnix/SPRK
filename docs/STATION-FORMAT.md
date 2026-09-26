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
T1: { length: 520, kind: 'station', track: '1', platform: true }
```

* `length` – długość w metrach (rozkładana na kostki proporcjonalnie do geometrii),
* `kind` – `approach` (zbliżania), `point` (zwrotnicowy), `station`, `siding`, `plain`,
* `track` – numer toru (do rozkładu jazdy), `platform` – peron (pociągi osobowe zatrzymują się).

## Szlaki (`exits`)

```js
W: { name: 'Lipowa', tile: { x: 0, y: 4 }, dir: 'W', lineLength: 4200, lineSpeed: 100 }
```

`tile` + `dir` – kostka torowa i port, przez który tor opuszcza pulpit. `lineLength` – długość toru szlakowego
(wirtualnego, poza pulpitem) w metrach. Każdy szlak ma własną blokadę liniową Eap i posterunek sąsiedni sterowany przez AI.

## Przebiegi (`routes`)

Tablica zależności jest wyznaczana **automatycznie** z topologii (`Topology.pathsFrom`):
od każdego sygnalizatora w jego kierunku do następnego sygnalizatora / szlaku / kozła.
Dla każdego przebiegu wyznaczane są: odcinki drogi przebiegu, wymagane położenia zwrotnic,
zwrotnice ochrony bocznej, wykolejnice (na drodze – zdjęte, sąsiadujące – nałożone),
droga ochronna (odcinek za semaforem końcowym) i prędkość (40/60 przez tor zwrotny).

* `routes.disable: ['A-D2']` – usuwa przebieg,
* `routes.override: { 'A-D2': { speed: 60 } }` – nadpisuje pola przebiegu.

Identyfikatory: `START-KONIEC` (`A-D1`, `C1-W`), manewrowe z semafora z Ms2: sufiks `m` (`D2-kT3m`).

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
