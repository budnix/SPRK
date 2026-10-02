# Interfejs gracza

Część dokumentacji architektury – indeks i zasady: [`docs/ARCHITECTURE.md`](../ARCHITECTURE.md).

## Ekran startowy (`src/ui/StartScreen.js`)

Wybór jak w grze – kilka ekranów z własnym adresem w części „#” (`catalog.parseRoute` / `routeHash`; stan ekranu wynika
tylko z adresu, więc przycisk „wstecz” przeglądarki i odświeżenie działają, a link prowadzi do konkretnej stacji):
* `#/` tytuł – kafelki: ostatnia zmiana (uruchamia ją ponownie), Służba, Szkolenie (licznik ukończonych misji),
  Ustawienia (ten sam ekran ustawień co w menu – leży nad ekranem startowym);
* `#/szkolenie[/n]` – misje wprowadzające (scenariusze z `tutorial`, `missionList`) jako przystanki na torze, semafor
  i odprawa misji: opis, stacja, liczba kroków i start (szkolenie to tylko misje – bez wyboru zmiany i zakłóceń; pełne
  zmiany stacji szkoleniowych są dostępne tylko z adresu `?stacja=…&scenariusz=…`);
* `#/sluzba` – mapa Polski przybliżana jak mapa w przeglądarce (`src/ui/map/MapView.js`, rysunek `mapSvg.boardSvg`,
  dane i źródła – `docs/MAP-DATA.md`): kółko myszy, szczypanie, przeciąganie, dwa palce, przyciski + / − / cała Polska;
  z daleka województwa z liczbą pasujących posterunków (klik – przybliżenie) i sieć kolejowa, bliżej tory linii
  posterunków i lampki, najbliżej tablice z nazwami; obok – województwa albo, przy wyszukiwaniu i filtrach,
  pasujące posterunki; `#/sluzba/lista` – posterunki do służby (`dutyStations` – bez stacji szkoleniowych; jedno miejsce
  raz, edycje są zakładkami). Oba widoki mają wyszukiwarkę („/” przenosi do pola, Enter otwiera pierwszy wynik) i filtry:
  stanowisko (lista wszystkich rodzajów z rejestru z liczbą posterunków), trudność (zawsze 1–5), era i województwo (gdy
  są co najmniej dwie wartości), „tylko niegrane”; lista – kolejność A–Z / wg trudności (zapamiętana w localStorage);
* `#/sluzba/<województwo>` – ta sama mapa przybliżona do posterunków województwa (tablica dyspozytorska: rzeczywisty
  przebieg linii z OpenStreetMap, posterunki jako lampki – żółta niegrany, zielona grany – z tablicami stacyjnymi, numery
  linii przy torze, karta posterunku po najechaniu / fokusie); pod spodem karty posterunków województwa;
* `#/stacja/<id>` – strona stacji: tablica z nazwą, trudność (pięć lampek, `difficultyMark` w `src/ui/brand.js`),
  zakładki ery (`eraTabs`, gdy miejsce ma kilka edycji), miniatura planu, opis i urządzenia, najlepszy wynik, wybór
  zmiany (okręg tylko dla stacji z `districts`, scenariusz, zakłócenia; ziarno w „Zaawansowane”) i start.
Nagłówek ma okruszki (Start › Służba › województwo › stacja) i „‹ Wstecz” (`catalog.parentRoute`); Esc bez trwającej
zmiany – piętro wyżej. Przy wejściu do gry (bez `scenariusz` w adresie) otwiera się tytuł; „Nowa zmiana…” w trakcie
zmiany (menu, raport) – ostatnio oglądany ekran wyboru (mapa w tym samym przybliżeniu, lista, województwo, szkolenie;
`localStorage`), a bez zapisu – lista posterunków. Ekran wczytywania (`#boot` w `index.html`, semafor ze światłami
zapalanymi po kolei, napis wg języka z ustawień) jest od pierwszej klatki; `main.js` zdejmuje go po zbudowaniu pulpitu
i wczytaniu czcionki, nie wcześniej niż 1 s od początku wczytywania (`BOOT_MIN_MS` – bez mignięcia; przy błędzie skryptu
znika sam) – bez pustego układu przed pulpitem. Wejście bez zmiany w adresie: skrypt w `index.html` dodaje klasę
`boot-start` (pulpit ukryty od pierwszej klatki, tło ekranu startowego), `main.js` zdejmuje ją po otwarciu ekranu – bez
mignięcia pulpitu przed tytułem. Ustawienia otwarte z tytułu mają „Wróć do menu”, z menu zmiany – „Wróć do zmiany”. Otwarcie ekranu zdejmuje parametry zmiany z adresu (odświeżenie
zostaje na wyborze), „Wróć do zmiany” je przywraca; start zmiany ładuje adres `?stacja=…` bez części „#”.
Ekran startowy leży nad dymkami samouczka i menu (z-index). Karty i odprawa mają miniatury planów z
`src/render/thumbnail.js` (SVG jako tekst z definicji kostek, bez DOM).
Wygląd ze świata nastawni: misje stoją na torze jak przystanki linii szkoleniowej (numer to znacznik przystanku, wybrana
misja go zapala, ukończona ma zieloną obwódkę i znacznik); semafor między misjami a odprawą (`signalSvg` z `brand.js`)
pokazuje „Stój”, a po wyborze misji „wolna droga” (samo CSS, `:has(.st-briefing.open)`); pusta odprawa ma ten sam
semafor; nazwa w odprawie to tablica stacyjna (granatowa emalia, `--sc-plate`), a przycisk startu świeci zielenią
sygnału zezwalającego (`--sc-go`); najlepsza ocena to mała pieczątka na karcie i stronie stacji.
Postęp gracza (`src/ui/progress.js`, localStorage): `main.js` przy `shift-end` zapisuje najlepszy wynik zmiany
(`catalog.recordResult`, misja – ukończona), a przy starcie zmiany – adres ostatniej zmiany. Funkcje sortowania, listy
misji, zakładek ery i miniatur są bez DOM – testowane w Node.
Katalog posterunków (`src/ui/catalog.js`, bez DOM, `tests/catalog.test.js`): posterunki do służby i szkoleniowe,
miejsca i edycje (`place`, `era` – zakładki ery), wyszukiwanie bez polskich znaków (nazwa, położenie, linie, województwo,
rok, urządzenia; nazwa pasująca w całości pierwsza), filtry (stanowisko, trudność, era, województwo, niegrane), adresy
ekranów wyboru (`parseRoute` / `routeHash`), schemat regionu (kolejne posterunki linii – `regionLayout`) i postęp gracza
(najlepsza ocena zmiany, ukończone misje). Województwa i granice Polski do walidacji `region` / `geo`:
`src/model/regions.js`.

## Ekran ustawień (`src/ui/settingsSchema.js`, `src/ui/SettingsScreen.js`)

Menu ≡ ma tylko akcje (Nowa zmiana…, Ustawienia…, Raport zmiany, Instrukcja obsługi). Ustawienia to osobny pełny ekran
w motywie ekranu startowego: kategorie po lewej w kolejności grup (Ogólne: Język; Widok: Pulpit, Monitor, Panel boczny; Wygląd: Motyw), po prawej
każda kategoria jako osobna karta: nagłówek (etykieta grupy › tytuł), opis, opcje oddzielone linią z tytułem, opisem
działania i wyborami (radia przy ≤ 4 stałych wyborach, lista rozwijana gdy zbiór może rosnąć – języki, suwak dla skali);
opcje przeładowujące widok mają znacznik. Treść opisuje
`settingsCategories()` (bez DOM, funkcja – teksty z `t()` zależą od języka; test pilnuje, że każdy klucz `DEFAULTS` jest
opisany raz i wartość domyślna jest wśród wyborów), a `SettingsScreen` buduje z niego DOM i podpina kontrolki przez `Settings.bindMenu` – zmiana działa od razu
i zapisuje się jak dotąd. Pasek „widok”: „dopasuj” dopasowuje do szerokości okna, „wysokość” (tylko przy włączonych
stałych polach skrajnych) wypełnia okno w pionie i ustawia środek pulpitu.

## Ustawienia (`src/ui/Settings.js`)

`DEFAULTS` dla nowego użytkownika: pulpit na środku, panel boczny na dole, motyw wg systemu operacyjnego
(`prefers-color-scheme`, zmiana na żywo; skrypt w `index.html` ustawia motyw przed załadowaniem aplikacji), podział na
ekrany, symbole monitora 125 %, odstęp torów normalny. Stanowisko (srk) nie jest ustawieniem – wynika ze stacji lub
scenariusza. Zapisane ustawienia (localStorage) mają pierwszeństwo; zmiana `rowScale` / `lang` przeładowuje stronę,
`symScale` działa na żywo.

## Wygląd interfejsu (`src/styles.css`, `src/ui/dialog.js`, `src/ui/icons.js`)

* **Zmienne.** Barwy, promienie (`--radius`, `--radius-sm`, `--radius-pill`), wysokość kontrolek (`--ctl-h`) i warstwy
  (`--z-*`, każda z własną wartością) są w `:root`; motyw jasny (`:root[data-theme="light"]`) nadpisuje komplet barw
  interfejsu. Grupy: interfejs gry (`--bg`, `--panel`, `--accent`…), ekrany pełne (`--sc-*`), kategorie pociągów
  (`--cat-*`), barwy urządzeń niezależne od motywu – pulpit (`--desk-*`) i paski / menu monitora (`--mon-*`).
  `tests/styles.test.js` pilnuje, że reguły interfejsu nie mają barw, promieni ani warstw wpisanych na sztywno.
* **Ekrany pełne** (start, ustawienia, raport, instrukcja) mają jeden układ – nagłówek `.st-hero` z logo, tytułem
  i przyciskiem powrotu, pod nim tor (szyny na podkładach), treść na kartach; na telefonie logo stoi nad tytułem – i idą
  za motywem interfejsu. Wygląd ze świata nastawni (tor, semafor, lampki kontrolne, liczniki, tablica stacyjna,
  pieczątka) daje kilka zmiennych `--sc-*` w obu motywach: `--sc-plate*`, `--sc-lamp-*` / `--sc-glow-*`, `--sc-lens-off`,
  `--sc-counter*`, `--sc-rail`, `--sc-sleeper`, `--sc-go*`, `--sc-warn-plate`. Ustawienia: kategorie to przystanki na
  torze (bieżąca – zapalona lampka), wybór opcji pokazuje lampka kontrolna (pole wyboru z `appearance: none` – nadal
  działa z klawiatury). Ruch tylko przy zmianie stanu (lampka, pieczątka), wyłączony przy `prefers-reduced-motion`. `dialog.js` nadaje im rolę okna dialogowego,
  przenosi fokus do okna po otwarciu i oddaje go po zamknięciu. Kolejność warstw: menu < instrukcja < raport <
  ekran startowy < ustawienia (ustawienia otwiera też ekran tytułowy).
* **Ikony.** `uiIcon(name)` zwraca SVG na siatce 16×16 w kolorze tekstu (pauza, wznowienie, menu, zamknij, stan
  zadania). Znaki tekstowe zostały tylko w treści (słowniki, opisy), nie na przyciskach.
* **Dostępność.** Widoczny fokus z klawiatury (`:focus-visible`), opisy przycisków-ikon (`aria-label`), przy
  ustawieniu systemu „ogranicz ruch” wyłączone animacje ozdobne; miganie lampek i sygnałów zostaje, bo niesie
  informację o stanie urządzeń.

## Czcionka (`src/fonts/`, `src/styles.css`)

Cała aplikacja – interfejs, pulpit kostkowy i monitor – używa jednej czcionki: Inter (czcionka zmienna 100–900,
licencja SIL OFL 1.1 w `src/fonts/OFL.txt`), dołączonej do strony w dwóch plikach woff2 (`latin`, `latin-ext` z polskimi
znakami) i podanej przez zmienną `--font`. Dzięki temu napisy wyglądają tak samo w każdym systemie, a nie zależą od
czcionek zainstalowanych u gracza. Kontrolki formularzy dziedziczą czcionkę (`button, input, select, textarea`),
liczby na monitorze i licznikach mają stałą szerokość cyfr (`tabular-nums`). Znaki spoza czcionki (np. ✔ ☐) bierze
czcionka systemu. `tests/e2e/font.spec.js` sprawdza, że plik pochodzi ze strony i że czcionka jest w użyciu.

## Język interfejsu (`src/i18n/`)

Słowniki płaskie `pl.js` (źródłowy), `en.js`, `de.js` – ten sam zbiór kluczy, parametry `{x}` (test `i18n.test.js`
pilnuje zgodności kluczy i parametrów oraz że tłumaczenia nie są kopią polskiego). `t(key, params)` czyta bieżący
język (brak klucza → polski → sam klucz), `setLang` ustawia go w `main.js` przed zbudowaniem jakiegokolwiek ekranu:
ustawienie `lang` (`auto` = `detectLang` po `navigator.languages`, inaczej polski) – dlatego zmiana języka przeładowuje
stronę. Statyczny `index.html` tłumaczy `applyDom` po atrybutach `data-i18n` / `data-i18n-title` / `data-i18n-aria`.
Przez `t()` przechodzi warstwa interfejsu: menu i pasek narzędzi, ekran startowy, ustawienia, raport, panel boczny,
dymek samouczka, podpowiedzi stanowiska i instrukcja (`help.*`). **Nie** przechodzą: komunikaty modelu (`src/model/`
– dziennik, statusy rozkładu, telefonogramy wg Ir-1, komunikaty oceny), polecenia paska Ie-104 na monitorze, opisy
posterunków i scenariuszy, kroki misji i słownik – to treść domenowa po polsku, testowana w Node na polskich tekstach.
Testy e2e działają z `locale: 'pl-PL'` (konfiguracja Playwright), bo „auto” w angielskiej przeglądarce dałoby angielski.
