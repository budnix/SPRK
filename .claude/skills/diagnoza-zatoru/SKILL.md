---
name: diagnoza-zatoru
description: Diagnoza zmiany SPRK, w której pociąg stoi, nie dojechał, jest opóźniony bez powodu albo zmiana kończy się zatorem – ustalenie, czy winny jest scenariusz / rozkład, generator służby, silnik (zależności, blokada, pociąg) czy automat dyżurnego, i naprawa zaczynająca się od testu odtwarzającego. Użyj zawsze, gdy właściciel zgłasza „pociąg stoi”, „zator”, „nie odjechał”, „nie da się nastawić przebiegu”, gdy `npm run check` albo `npm run survey` pokazuje BŁĘDY / zator / pociąg nieobsłużony, gdy test pełnej zmiany pada, a także gdy test pada tylko czasem (losowe ziarno).
---

# Diagnoza zatoru (pociąg stoi, zmiana się nie kończy)

Zator ma zwykle jedną pierwszą przyczynę i długi ogon skutków: kolejne pociągi stają za pierwszym. Naprawianie skutku
(wydłużenie zmiany, wpis na listę wyjątków, luźniejsza asercja) zostawia błąd w grze. Dlatego kolejność jest stała:
odtworzyć → znaleźć pierwszy pociąg, który stanął → ustalić warstwę → zmniejszyć przypadek → test, który pada → poprawka.

## 1. Odtwórz dokładnie ten przebieg

Potrzebne: stacja, scenariusz (albo służba: godzina startu i długość), poziom zakłóceń i **ziarno**. Zgłoszenie z gry ma
je w adresie (`?stacja=…&scenariusz=…&zaklocenia=…&seed=…`, służba: `scenariusz=sluzba&start=…&czas=…`, stanowisko
`srk=…`) i w raporcie końca zmiany. Bez ziarna zapytaj o adres – inne ziarno to inna zmiana.

```
npm run check -- <stacja>:<scenariusz> --seeds <ziarno> --level <none|low|high> --verbose
npm run check -- <stacja> --start <godzina> --minutes <30|60|120|180> --seeds <ziarno> --level <poziom> --verbose
```

Automat gra zmianę dyżurnym automatycznym i wypisuje dla każdego nieobsłużonego pociągu: gdzie stoi, od kiedy, przyczynę
postoju, przeszkody przebiegu, pociąg, który mu przeszkadza, i ostatnie wpisy dziennika. Opis raportu:
`docs/architecture/testy-i-narzedzia.md` („Automat sprawdzający scenariusze”). Jeśli automat przechodzi, a gracz ma zator, różnicą są
czynności gracza albo widok stanowiska – wtedy odtwarzaj w przeglądarce (Playwright, `tests/e2e/`).

## 2. Znajdź pierwszy pociąg, który stanął

Posortuj nieobsłużone pociągi po czasie „od kiedy” i weź najwcześniejszy; reszta zwykle stoi za nim. Stan urządzeń
w tej chwili (czego raport nie pokazuje) daje skrypt:

```
node .claude/skills/diagnoza-zatoru/scripts/stan-zmiany.mjs <stacja>[:<scenariusz>] --at GG:MM --train <nr> --seed <n> --level <poziom>
```

(służba: `--start <godzina> --minutes <n>` zamiast scenariusza). Wypisuje pociąg (tryb, stan, odcinki), sygnał przed nim,
przyczynę postoju (`Traffic.waitReason`), każdy przebieg od tego sygnału z przeszkodami (`Interlocking.routeProblems`),
blokadę szlaku, przebiegi nastawione, odcinki zajęte, usterki czynne, plan automatu przy pociągu (dalsze stopnie wjazdu, semafor pośredni wyjazdu, polecenie) i ostatni
takt automatu przy tym pociągu – krok i powód, np. `entry/on-its-way` (przebieg już w drodze), `exit/line-block`
(blokada nie daje szlaku), `entry/refused` (zależności odmówiły – z przebiegiem), `exit/too-early`.
Uruchom go dla dwóch chwil – tuż po zatrzymaniu i kilka minut później: to, co się nie zmienia, jest przyczyną.

Zrzut pokazuje skutek; chwilę, w której coś poszło nie tak, pokazuje **ślad**: dodaj `--from GG:MM` (kwadrans przed
zatrzymaniem) – skrypt wypisze wiersz przy każdej zmianie stanu pociągu, sygnału przed nim, przyczyny postoju, notatek
automatu, nastawionych przebiegów i usterek. Szukaj wiersza, po którym stan przestaje pasować do urządzeń (np. notatka
automatu o przebiegu „do nastawienia”, który już jest nastawiony) – to zwykle pierwsza przyczyna, a nie ostatni postój.

## 3. Ustal warstwę – od tego zależy, co wolno poprawić

| Co widać | Warstwa | Gdzie poprawka |
|---|---|---|
| Zator na poziomie `none` przy każdym ziarnie; „Definicja” ma `tt-track-overlap`, `line-*`, `closed-*`, `unfinished-plan`; dwa pociągi planowo na jednym torze, zamknięcie bez objazdu | scenariusz / rozkład stacji | `src/stations/<id>.js` – skill `nowy-scenariusz` |
| Tylko w służbie (`--start`), wzorzec stacji gra się czysto; pociąg spoza wzorca (numer od 46000, powtórzenie) wchodzi komuś w drogę | generator służby | reguła w `src/model/duty.js` (ogólna, nie wyjątek dla stacji) |
| Przebieg od sygnału ma przeszkodę, której być nie powinno (odcinek wolny, a „zajęty”; blokada nie zwalnia szlaku; przebieg nie rozwiązuje się po przejeździe); naruszenia zależności; „stan urządzeń po zmianie” niepusty | silnik: `src/model/Interlocking.js`, `Block.js`, `Train.js`, `Traffic.js` | tam, z testem w `tests/` – gracz też by utknął |
| Przebieg jest „do nastawienia” (albo wystarczy czynność, którą gracz by wykonał), a automat jej nie wydaje; ostatni takt automatu pokazuje krok, na którym stoi (albo „–”: nie widzi nic do zrobienia), plan przy pociągu się nie zmienia | automat dyżurnego | `src/model/Operator.js`, test w `tests/operator.test.js` |
| Tylko niektóre ziarna, tylko `low` / `high`; pociąg przyjechał od sąsiada spóźniony ponad koniec zmiany (`late-inbound`) albo stoi przy usterce losowej | zakłócenia – zwykle nie błąd | nic; ewentualnie zapas okna zmiany |

Dlaczego rozróżnienie automat / silnik jest ważne: automat to narzędzie testowe i przeciwnik w okręgach, a silnik to gra.
Ograniczenie automatu (nie zeruje licznika osi, nie podaje Sz, nie wydaje rozkazu pisemnego – w raporcie
`automat-limit` / `fault-wait`, poziom `info`) nie jest błędem scenariusza i nie wolno go „naprawiać” zmianą rozkładu.
Odwrotnie: błąd silnika zamaskowany sprytem automatu wróci u gracza.

Nie zakładaj z góry winy scenariusza. Sprawdź, czy gracz mógłby w tej chwili pojechać: jeśli tak – automat; jeśli nie,
a powinien móc – silnik; jeśli nie i słusznie – rozkład.

## 4. Zmniejsz przypadek

Cel: jeden pociąg, jedna usterka, stałe ziarno, kilka minut zmiany. Pomocnicze funkcje są w `tests/fault-harness.js`
(`faultSim` – stacja z własnym krótkim rozkładem, `runWithFault`, `stuck`), w `src/model/check/` (`playShift`,
niezmienniki `violations`, kary wymuszone `unjustified`, stan urządzeń po zmianie `leftovers`) i w
`tests/helpers.js` (`makeSim`, `run`, `autoDispatch`, gra z automatem `play(sim).until('07:30')`). Usterkę losową z poziomu `high` zamień na usterkę ze scenariusza
(`faults: [{ type, target, at, duration }]`) – typ, cel i godzinę pokazuje skrypt („Usterki czynne”) i `--verbose`.
Jeśli po zmniejszeniu błąd znika, brakuje drugiego pociągu albo kolejności zdarzeń – dokładaj po jednym.

## 5. Test, potem poprawka

1. Test odtwarzający w `tests/` – bez poprawki musi padać (uruchom go przed poprawką i zobacz komunikat).
   Zmianę twórz z `seed`; test bez ziarna losuje je i pada raz na sto razy, zwykle w CI.
2. Poprawka w warstwie z kroku 3. Nowa reguła zależności to opcja `Interlocking` z wartością domyślną, nie kopia
   logiki; działanie nie może zależeć od treści komunikatu (CLAUDE.md, „Granice warstw”).
3. `npm test`. Szerszy skutek zmiany silnika albo automatu: przed poprawką `npm run survey -- --json przed.json`,
   po poprawce `npm run survey -- --compare przed.json` (gorzej / lepiej / nowe zatory) – plik poza repozytorium.
4. Commit: co było pierwszą przyczyną, w której warstwie, jaki test ją odtwarza.

Czego nie robić, żeby „przeszło”: wpis w `KNOWN` (`tests/scenario-runs.js`) albo `tests/scenario-accepted.js` bez decyzji
właściciela, osłabienie asercji w `tests/matrix-*.test.js` i testach stacji, wydłużenie zmiany tylko po to, by zator
się zmieścił.

## Test pada tylko czasem

Zmiana utworzona bez `seed` bierze ziarno z `Math.random`. Szukanie: `npm run seed-scan -- --only <fragment nazwy pliku>`
(wypisuje zestaw ziaren i polecenie odtwarzające: `SPRK_RAND=<n> node --import ./scripts/random-seed.mjs --test
tests/<plik>.test.js`). Potem jak wyżej: czy to prawdziwy błąd (kroki 2–5), czy test zależny od losu – wtedy ziarno
wpisane w teście albo zapas wyprowadzony z modelu (np. droga hamowania jednego kroku), nie próg „na oko”.
