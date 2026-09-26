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
