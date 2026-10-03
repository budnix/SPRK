# Źródła i wzorce

Symulator wzoruje się na urządzeniach przekaźnikowych typu E z pulpitem kostkowym (pulpit nastawczy
przyciskowy zintegrowany z planem świetlnym) oraz na symulatorze ISDR (symulator.isdr.pl).

Grafika kostek (jasnoszare lico, siatka, ciemna rama z numeracją, szare szczeliny, żółte wskaźniki położenia,
zielone kostki zwrotnicowe, ciemne powtarzacze z lampkami, czarne liczniki) odwzorowuje zrzuty ekranu pulpitów ISDR
dostarczone przez autora projektu. Style: `src/styles.css`, grafika: `src/render/tileArt.js`.

Materiały:

* ISDR – Symulator prowadzenia ruchu kolejowego, dokumentacja użytkownika (symulator.isdr.pl/download/dokumentacja.pdf)
* Beskidzka Strona Kolejowa – Pulpity nastawcze i plany świetlne (bsk.isdr.pl/usrk_pulpity.php)
* transportszynowy.pl – Urządzenia elektryczne przekaźnikowe; Blokada liniowa i zapowiadanie pociągów
* Instrukcja sygnalizacji Ie-1 (E-1), PKP PLK – obrazy sygnałowe S1–S5, S10–S13, Ms1/Ms2, Sz
* Instrukcja o prowadzeniu ruchu pociągów Ir-1 (R-1), PKP PLK – § o blokadzie półsamoczynnej, pozwolenia, potwierdzenia
* Instrukcja Ie-10 (E18) – obsługa urządzeń przekaźnikowych
* Instrukcja o technice wykonywania manewrów Ir-9, PKP PLK (tekst ujednolicony, zarządzenie 6/2012 ze zmianami do
  uchwały 376/2025 z 13.05.2025; plk-sa.pl, Akty prawne i przepisy → Instrukcje → Ir) – zezwolenia na jazdę manewrową
* automatyka.ndl.pl – opis blokady Eap; trainbrains.eu – elementy i obsługa blokady Eap
* Chyba A., „Symulator komputerowy przekaźnikowego systemu (typu E) sterowania ruchem kolejowym…”, Zeszyty SITK RP nr 158 (2011)

## Jak zapisywać

Każda zasada ruchu, urządzeń i taboru ma dwie wyraźnie rozdzielone części: co jest **ze źródła** (przepis, instrukcja,
plan – z paragrafem albo adresem) i co jest **przyjęte** (wartość albo uproszczenie gry, którego źródło nie podaje),
z nazwą stałej w kodzie. Temat zapisuje się w pliku obszaru (tabela niżej) jako sekcja `## Temat (plik – funkcja)`
albo dopisek w istniejącej; nowy obszar – nowy plik w `docs/sources/` i wiersz tabeli (pilnuje `tests/docs.test.js`).
Odwołanie w kodzie wskazuje plik obszaru i sekcję: `docs/sources/<plik>.md „Sekcja”`. Kroki: skill `zasada-ze-zrodla`.

## Źródła według obszarów (`docs/sources/`)

Ten plik to lista materiałów i zasady zapisu; opis każdego tematu – w pliku obszaru. Sesja czyta indeks i jeden plik
obszaru, nie całość.

| Plik | Obszar | Co jest w środku |
|---|---|---|
| [`jazda-pociagu.md`](sources/jazda-pociagu.md) | Jazda pociągu (wszystkie stanowiska) | Szybkość w okręgu zwrotnicowym i na szlaku, jazda na tor zajęty, zatrzymanie przy peronie, odjazd i hamowanie maszynisty, masa i długość, rodzaje pociągów towarowych, zmiana czoła i rozmowy z maszynistą. |
| [`sygnaly-i-blokada.md`](sources/sygnaly-i-blokada.md) | Sygnały, polecenia zastępcze i blokada liniowa | Zezwolenie na jazdę, stała kontrola sygnału i droga ochronna, zwrotnica bez kontroli, sygnał zastępczy i rozkaz „S” (tam też kary bez winy dyżurnego: nieobsłużony, czekanie na skład, tor inny niż planowy), blokada Eap (przyciski doraźne, lampki), blokada na monitorze i samoczynna, telefonogramy i zapowiadanie. |
| [`pulpity.md`](sources/pulpity.md) | Pulpity kostkowe i nastawnia mechaniczna | Kolory lampek, pulpit typu E (powtarzacze, przyciski grupowe, wykolejnice), IZH-111, nastawnia mechaniczna. |
| [`stanowiska-komputerowe.md`](sources/stanowiska-komputerowe.md) | Stanowiska komputerowe | Monitor wg Ie-104, EBILock 950 z EBIScreen 3, MOR-3 z MOR-1. |
| [`tabor.md`](sources/tabor.md) | Tabor pociągów | Zespoły i lokomotywy w rejonie Trójmiasta, przewoźnicy, dobór taboru, dynamika (przyspieszenie, masa, długość). |
| [`posterunki.md`](sources/posterunki.md) | Posterunki, służba i mapa | Systemy srk stacji, plany schematyczne stacji (co odwzorowano, co przyjęto), mapa wyboru posterunku, służba o wybranej porze, pociągi z nazwami. |
