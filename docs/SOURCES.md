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
* automatyka.ndl.pl – opis blokady Eap; trainbrains.eu – elementy i obsługa blokady Eap
* Chyba A., „Symulator komputerowy przekaźnikowego systemu (typu E) sterowania ruchem kolejowym…”, Zeszyty SITK RP nr 158 (2011)

Kolory lampek na kostkach (za opisami pulpitów typu E): żółte – położenie zwrotnicy,
białe – utwierdzenie przebiegu, czerwone – zajętość odcinka.

## Gdynia Główna

Układ torowy, numery rozjazdów i nazwy sygnalizatorów stacji Gdynia Główna (`src/stations/gdynia-glowna.js`)
pochodzą z planu schematycznego stacji (stan: październik 2024, rys. Adrian Karwat) dostarczonego przez autora projektu.
Pulpit jest schematem 45°, nie mapą: odwzorowano okręg pasażerski (tory 1–10 i 501/502, głowice, linie 202/250/201),
pominięto grupy odstawcze (GO1/GO2, tory 26–29, 35–38, 503), Gdynię Postojową (960) i tory 21/22/24 rejonu wschodniego.
Blokady liniowe modelowane jako dwukierunkowe (Eap), rozkład jazdy jest fikcyjny, wzorowany na realnym ruchu.

## Gdynia Orłowo

Układ torowy stacji Gdynia Orłowo (`src/stations/gdynia-orlowo.js`) pochodzi z planu schematycznego stacji
(stan: kwiecień 2024) dostarczonego przez autora projektu: tory 1/2 (peron 2), 3, 4, 6 (Baza EZ Sopot), SKM 501/502
(peron 1), bocznica 18 z wykolejnicą Wk11, rozjazdy 1–7, 25, 26, 31–37 i S1/S2, S51–S54, semafory A/B, C–F, G–K, L/M,
A501/A502, C501/D502, T501/T502, P/R oraz tarcze Tm1, Tm2, Tm4, Tm11–Tm14. Tarcze Tm3 (koniec toru 4 od Gdyni)
i Tm5/Tm6 (tor 2 za rozjazdem 37) dodano na potrzeby manewru tor 4 → tor 6 przez rozjazdy 25/26 – na planie nie
są oznaczone. Blokady liniowe modelowane jako dwukierunkowe (Eap), rozkład jazdy fikcyjny.

## Gdynia Chylonia

Układ torowy stacji Gdynia Chylonia (`src/stations/gdynia-chylonia.js`) pochodzi z planu schematycznego stacji
(stan: październik 2024, rys. Adrian Karwat) dostarczonego przez autora projektu: tory 502/501 (peron 1 SKM), 2/1 (peron 2),
3 (peron 3), tory odstawcze 21/22 za skrzyżowaniem rozjazdów 21–26, tor 503, bocznica 51, linie 964 (Gdynia Postojowa,
tylko manewry, tarcza T57m) i 723 (Gdynia Port, semafor P). Rozjazdy 1–16 i 21–42, semafory A–D, E…/G502/F501/M…,
A502/A501/A503, U/T/S/R/P oraz tarcze Tm1–Tm4, Tm6, Tm21, Tm22, Tm25–Tm27, Tm31, Tm32 wg planu.
Uproszczenia: tor 1 wpięty w tor 2 rozjazdem 30 (bez przejścia 30–31 na tor 501), rozjazd krzyżowy 38 (ciąg 37 → 38 → 39)
jako dwie zwrotnice 38a/38b, pominięto semafor L502 i tarcze T21/T22 przy kozłach torów 21/22 oraz sygnalizatory
samoczynnej blokady liniowej (239–253, 280). Blokady liniowe modelowane jako dwukierunkowe (Eap), rozkład jazdy fikcyjny.

## Sopot

Układ torowy stacji Sopot (`src/stations/sopot.js`) pochodzi z planu schematycznego stacji (stan: czerwiec 2023,
rys. Adrian Karwat) dostarczonego przez autora projektu: grupa zachodnia (tory 6, 2a, 4, 1a z kozłami 6b/6a, 4b/4a),
peron 2 (tory 2/1, długości 468/764 i 468/578 m), peron 1 SKM (502a/501a), tor 13 z wykolejnicą Wk7 i tarczą Tm13,
rozjazdy 1–8, 32–38, 40, 41, 41–45, 51–54, semafory A/B, C–F, G–K, M/L, O/P, R/S, A502/A501, L502/L501, R502/R501,
S502/S501 oraz tarcze Tm1–Tm3, Tm11, Tm13. Przejazd pociągu linią 202 to trzy kolejne przebiegi (np. A → H → O → szlak),
tak jak na planie. Uproszczenia: numer 41 występuje na planie dwukrotnie (głowica 202 i grupa SKM) – zwrotnica przy
torze 13 ma id `Zw41s`; pominięto sygnalizatory blokady samoczynnej (82–83, 101–108, 121–132), tarczę T13 i tarcze
ostrzegawcze; p.o. Sopot Wyścigi jest tylko opisem na odcinku zbliżania linii 250. Blokady dwukierunkowe (Eap),
rozkład jazdy fikcyjny.
