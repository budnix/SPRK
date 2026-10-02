---
name: zasada-ze-zrodla
description: Wprowadzenie albo zmiana zasady kolejowej w SPRK – reguły ruchu, sygnalizacji, blokady liniowej, łączności, manewrów, oceniania dyżurnego, zachowania urządzeń srk albo taboru – tak, żeby wynikała z przepisu lub opisu urządzenia, a nie z domysłu. Użyj zawsze, gdy zadanie zaczyna się od „jak jest w rzeczywistości”, „zgodnie z przepisami”, „wg Ir-1 / Ie-1 / Ie-104”, gdy trzeba ustalić liczbę (czas, prędkość, odstęp, karę), kolejność czynności dyżurnego albo treść rozmowy, oraz gdy zmienia się istniejącą regułę ruchu.
---

# Zasada ze źródła

Gra uczy pracy dyżurnego ruchu, więc reguła wymyślona „na oko” uczy błędnie – a po miesiącu nikt nie odróżni jej od
przepisu. Dlatego każda zasada ma w `docs/SOURCES.md` dwie wyraźnie rozdzielone części: co jest **ze źródła** i co jest
**przyjęte** (wartość gry, której źródło nie podaje).

## Kroki

1. **Znajdź przepis, zanim napiszesz kod.** Najpierw `docs/SOURCES.md` – temat bywa już opisany (lista materiałów na
   górze, potem sekcje tematyczne). Instrukcje PKP PLK: plk-sa.pl → „Akty prawne i przepisy” → „Instrukcje” (Ir –
   ruch: Ir-1 prowadzenie ruchu, Ir-5 radiołączność, Ir-9 manewry; Ie – sygnalizacja i srk: Ie-1 sygnały, Ie-104
   stanowiska komputerowe). Opisy urządzeń (typ E, IZH-111, EBILock, MOR-3, blokada Eap) – materiały wymienione
   w SOURCES. Gdy źródła nie da się otworzyć, napisz to wprost i nie odtwarzaj treści z pamięci jako cytatu.
2. **Zapisz w `docs/SOURCES.md`** – nowa sekcja `## Temat (plik – funkcja)` albo dopisek w istniejącej. Wzór: sekcja
   „Zmiana czoła i rozmowy z maszynistą”:
   - „Ze źródła – <instrukcja, wydanie / uchwała, adres>:” i punkty z **numerem paragrafu** (§, ust., pkt);
   - „Przyjęte (źródła tego nie podają):” i punkty z wartością gry oraz nazwą stałej w kodzie.
3. **Kod**: liczby jako nazwane stałe (te same nazwy co w SOURCES), reguła w warstwie logiki (`src/model/`). Nowa reguła
   zależności to opcja `Interlocking` z wartością domyślną, która nie zmienia dotychczasowych stanowisk. Terminologia
   po polsku wg Ie-1 / Ir-1 (semafor, tarcza manewrowa, przebieg, utwierdzenie, odcinek zbliżania, droga ochronna);
   komunikaty modelu i polecenia Ie-104 zostają po polsku, teksty interfejsu przez `t()` w trzech językach.
4. **Test** odtwarzający regułę w tym samym commicie; zmiana istniejącego testu – z uzasadnieniem w commicie, co się
   zmieniło w regule. Testów „wszystkich kombinacji” (`tests/matrix-*.test.js`) nie osłabia się – jeśli reguła je
   narusza, to albo reguła jest zła, albo test wymaga decyzji właściciela.
5. **Dokumentacja** w tym samym commicie: `docs/ARCHITECTURE.md` (gdzie reguła mieszka), `README.md` po angielsku, gdy
   gracz ją widzi.

## Gdy źródło milczy albo są dwa odczytania

Nie wybieraj po cichu. Opisz właścicielowi oba warianty z konsekwencją dla gry i swoją rekomendacją; po decyzji
wpisz wariant jako „Przyjęte”. To samo, gdy przepis jest dla gry za szczegółowy – uproszczenie też jest „przyjęte”.
