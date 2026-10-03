# Tabor pociągów

Część opisu źródeł – indeks i zasady zapisu: [`docs/SOURCES.md`](../SOURCES.md).

## Tabor pociągów (`src/model/rollingStock.js`)

Podpowiedź numeru pociągu w rozkładzie i karta na zakładce „Pociągi” pokazują tabor: zespół trakcyjny („skład:
2 × EN57”) albo lokomotywę („lokomotywa ET22”). Pociąg jedzie z tym taborem: przyspieszenie, hamowanie i prędkość
pojazdu biorą się z danych typu („Tabor pociągów – dynamika” niżej); długość pociągu – z wpisu rozkładu. Katalog to stan na 1.10.2026;
wszystkie źródła sprawdzone 1.10.2026. Typ, którego jazdy w rejonie Trójmiasta źródło nie potwierdza, nie wchodzi do
katalogu.

Ze źródeł – elektryczne zespoły trakcyjne SKM Trójmiasto (linia 250) i Polregio (oddział pomorski):

* EN57 – 3 człony, 64,97 m, prędkość konstrukcyjna 120 km/h (w eksploatacji 110 km/h); jazda w trakcji ukrotnionej
  z EN57, EN71 i ED72 (https://pl.wikipedia.org/wiki/EN57). SKM – tabor własny „EN57, EN57AKM, EN71 oraz 31WE”
  (https://www.skm.pkp.pl/o-nas/informacje-o-firmie); Polregio – 3 EN57 województwa pomorskiego
  (https://kolejowyportal.pl/pomorskie-chce-sprawdzic-stan-taboru-przed-zmiana-operatora/, 7.08.2026). Odmiany
  EN57AL, EN57ALd, EN57AP (Polregio) i EN57AKM (SKM) jeżdżą w regionie, ale źródła nie podają ich długości – katalog ich
  nie rozróżnia;
* EN71 – 4 człony, 86,84 m, 110 km/h; SKM (https://pl.wikipedia.org/wiki/EN71; skm.pkp.pl jak wyżej);
* 31WE Impuls – 4 człony, 74,4 m, 2 zespoły SKM (https://www.rynek-kolejowy.pl/wiadomosci/impulsy-dla-skm-trojmiasto-gotowe-duzo-zdjec-75565.html,
  26.02.2016); „Maksymalna prędkość eksploatacyjna 160 km/h” (Newag – adres w „Tabor pociągów – dynamika”);
* 31WEbb Impuls 2 – 4 człony, ok. 75 m, 160 km/h (https://pomorskie.eu/press/taborowa-rewolucja-na-pomorzu-nowe-pojazdy-na-torach-skm/,
  7.12.2023); własność województwa: w SKM i 13 zespołów w Polregio (kolejowyportal.pl jak wyżej), w Polregio m.in.
  Elbląg – Gdynia Chylonia (https://pulsgdanska.pl/transport/kolej/nowe-impulsy-trafily/M9g33Qq7N32HzTdq41Oa, 6.04.2024);
* 58WE Impuls 2 – 3 człony, „ok. 77 metrów”, 20 zespołów województwa dla SKM
  (https://www.rynek-kolejowy.pl/wiadomosci/pomorskie-kupi-20-impulsow-dla-skm-trojmiasto--112619.html, 27.03.2023;
  ostatnie odebrane w lipcu 2026: https://www.rynek-kolejowy.pl/wiadomosci/newag-wkrotce-odbior-ostatnich-impulsow-dla-pkp-skm-trojmiasto-153499.html).
  Prędkości konstrukcyjnej źródła nie podają – przetarg wymagał 120 km/h
  (https://www.trojmiasto.pl/wiadomosci/Nowy-pociag-dla-SKM-na-testach-w-Trojmiescie-n200558.html); `vmax: null`;
* 45WE Impuls (w Polregio EN90) – 5 członów, 160 km/h, 10 zespołów województwa dostarczonych w latach 2018–2020
  (https://www.rynek-kolejowy.pl/wiadomosci/pomorskie-impulsy-do-naprawy-rewizyjnej-124504.html;
  https://www.rynek-kolejowy.pl/wiadomosci/nowoczesny-impuls-45we032-zawital-na-linie-pomorskiej-kolei-metropolitalnej-115738.html);
  długość 90,40 m – z opisu tego samego typu u innego przewoźnika (https://kolejedolnoslaskie.pl/o-spolce/tabor/pojazdy-elektryczne/45we/).

Ze źródeł – spalinowe zespoły trakcyjne Polregio na liniach bez sieci (tylko przypięte polem `stock`):

* SA133 (Pesa 218Mc) – 2 człony, 41,70 m, 120 km/h; zespoły 029–031 „dedykowane obsłudze linii PKM”
  (https://pl.wikipedia.org/wiki/SA133);
* SA136 Atribo – 3 człony, 55,57 m, 140 km/h konstrukcyjna (120 km/h w eksploatacji); 7 zespołów województwa,
  w Polregio od 11.12.2022 na PKM (https://pl.wikipedia.org/wiki/SA136);
* SA137 (Newag 220M) – 2 człony, 41,8 m; SA138 (Newag 221M) – 3 człony, 58,36 m; oba 120 km/h
  (https://pl.wikipedia.org/wiki/Newag_220M); artykuł o linii 213 wymienia je w ruchu do Helu
  (https://pl.wikipedia.org/wiki/Linia_kolejowa_nr_213 – opis sprzed lat, obecny przydział przyjęty).

Linie bez sieci trakcyjnej: 213 Reda – Hel „niezelektryfikowana i jednotorowa” (strona linii 213 jak wyżej);
201 Gdynia – Kościerzyna – zelektryfikowane tylko Gdynia Gł. – Gdynia Port i Nowa Wieś Wielka – Maksymilianowo,
sieć Kościerzyna – Gdańsk Osowa „w budowie” (https://pl.wikipedia.org/wiki/Linia_kolejowa_nr_201); 203 Tczew – Czersk –
Chojnice – elektryfikacja „planowana” (https://pl.wikipedia.org/wiki/Linia_kolejowa_nr_203). Linia 248 (PKM) ma sieć
od czerwca 2023 (https://pl.wikipedia.org/wiki/Linia_kolejowa_nr_248), ale pociągi do Kartuz jadą dalej liniami bez
sieci (201 / 229).

Ze źródeł – PKP Intercity (pociągi do Gdyni i Gdańska, lato 2026). Zestawienie pociągów PKP Intercity dla Gdyni Głównej
14.06–29.08.2026 (https://www.intercity.pl/dokumenty/zestawienia%20poci%C4%85g%C3%B3w/od-14-06-2026/Gdynia_Glowna_20260614_20260829_20260630.pdf)
oznacza pociągi „zestawione z elektrycznych zespołów trakcyjnych”, ale nie podaje typu; przydziały dzienne z 15.08.2026
– 55p.cz (serwis miłośniczy, nieoficjalny):

* ED250 Pendolino – 7 członów, 187,4 m, „Maksymalna prędkość eksploatacyjna: 250 km/h”
  (https://www.intercity.pl/pl/site/dla-pasazera/informacje/nasze-pociagi/express-intercity-premium/specyfikacja-i-uslugi.html);
  EIP Warszawa – Gdynia, Gdynia – Kraków; jazdy w dwóch zespołach Kraków – Gdynia
  (https://www.rynek-kolejowy.pl/wiadomosci/pkp-intercity-podwojne-pendolino-do-kolobrzegu-gdyni-i-krakowa-124229.html,
  1.08.2025);
* ED160 Flirt – 8 członów, „Długość jednego pociągu wynosi 152,9 metra”, 160 km/h
  (https://psmkms.krakow.pl/index.php/kolej/elektryczne-zespoly-trakcyjne/1465-ed160); IC z Gdyni do Zakopanego (IC 5360/1
  „Witkacy” – zestawienie Gdyni Głównej), Katowic, Bielska-Białej, Łodzi i Poznania (55p.cz). Jazdy dwóch zespołów źródła
  nie potwierdzają;
* EU160 Griffin – „Eksploatuje je już zakład w Warszawie i w Gdyni”
  (https://www.intercity.pl/pl/site/o-nas/dzial-prasowy/aktualnosci/juz-66-polskich-lokomotyw-griffin-we-flocie-pkp-intercity.html,
  14.03.2025), 160 km/h (https://transinfo.pl/inforail/po-gdyni-i-warszawie-takze-krakow-z-griffinami-pkp-intercity-zastepuja-ep09/);
  EU200 Griffin – „oznaczenie serii EU200”, „prędkość 200 km/h”
  (https://www.intercity.pl/pl/site/o-nas/dzial-prasowy/aktualnosci/griffin-200-%E2%80%93-polski,-ale-nie-tylko-na-polskie-tory.html),
  IC Gdynia – Łódź z zakładu w Gdyni (55p.cz); EP07 – 125 km/h (https://en.wikipedia.org/wiki/PKP_class_EP07), IC/TLK
  z zakładu w Gdyni (55p.cz);
* 754 „Nurek” (České dráhy, dzierżawa PKP Intercity) – „Maximální povolená rychlost: 100 km/h”
  (https://cs.wikipedia.org/wiki/Lokomotiva_754); „Lokomotywy serii 754 … zostaną skierowane do obsługi pociągów na trasie
  Gdynia – Hel” (https://kolejowyportal.pl/30-lokomotyw-spalinowych-to-za-malo-pkp-intercity-siega-po-czeski-tabor/,
  21.04.2026); zmiana lokomotywy „z elektrycznej na spalinową na stacji Gdynia Główna, ponieważ na linii kolejowej nr 213
  (Reda – Hel) nie ma sieci trakcyjnej” (https://magazyn.koleo.pl/eic-jantar-2025/, 7.07.2025).

Ze źródeł – lokomotywy towarowe przewoźników obecnych w portach: obsługę manewrową w porcie Gdynia mają „PKP CARGO S.A
the Company's Northern Plant”, „CTL Północ”, „DB Cargo Polska”, „Freightliner PL”, „LOTOS Kolej”
(https://www.bct.gdynia.pl/en/rail); Lotos Kolej i Orlen KolTrans to od 14.10.2024 Orlen Kolej z siedzibą w Gdańsku
(https://pl.wikipedia.org/wiki/Orlen_Kolej); PKP Cargo ma lokomotywownię w Zajączkowie Tczewskim
(https://pl.wikipedia.org/wiki/Zaj%C4%85czkowo_Tczewskie); typy w zapleczu PKP Cargo – „Wykaz taboru utrzymywanego
w zapleczu PKP CARGO S.A.” (https://www.pkpcargo.com/wp-content/uploads/2023/10/zalnr4doregulaminudostepudooiupkpcargosawykaztaboruutrzymywanegowzapleczupkpcargosa.pdf).

* elektryczne: ET22 – PKP Cargo, 125 km/h (https://pl.wikipedia.org/wiki/Pafawag_201E); ET41 – PKP Cargo, 125 km/h
  (https://pl.wikipedia.org/wiki/HCP_203E); EU07 – PKP Cargo (24 zmodernizowane), 125 km/h
  (https://pl.wikipedia.org/wiki/Pafawag_4E/HCP_303E); EU46 Vectron – PKP Cargo, 160 km/h
  (https://www.pkpcargo.com/pkp-cargo-z-trzema-nowymi-lokomotywami-vectron/); E6ACT Dragon – „Lotos Kolej 5 Dragonów typu
  E6ACT”, 120 km/h (https://pl.wikipedia.org/wiki/Newag_Dragon); E6ACTa Dragon 2 – Orlen Kolej, CTL Logistics (trasy
  „do Szczecina, Polic, Gdańska”: https://kurier-kolejowy.pl/aktualnosci/33024/ctl-logistics-pozyskal-dwa-dragony-2.html),
  120 km/h (https://en.wikipedia.org/wiki/Newag_Dragon); 111Eo Gama – PCC Intermodal, kontenery z Gliwic do DCT Gdańsk
  (https://kurier-kolejowy.pl/aktualnosci/40948/przedwczoraj-przekazana--wczoraj-nowa-lokomotywa-pcc-intermodal-wyruszyla-z-gliwic-do-gdanska.html),
  160 km/h (https://www.rynek-kolejowy.pl/wiadomosci/pierwsza-gama-111eo-juz-w-eksploatacji-w-orion-kolej-113595.html);
* spalinowe: Class 66 (JT42CWRM) – Freightliner PL, DB Cargo Polska, 120 km/h (https://pl.wikipedia.org/wiki/EMD_JT42CWRM;
  https://najsilniejsi.pl/mocniejsi-o-nowe-lokomotywy/); 311D – DB Cargo Polska, CTL Logistics, 100 km/h
  (https://pl.wikipedia.org/wiki/Newag_311D); ST44 (M62) – PKP Cargo, 100 km/h (https://pl.wikipedia.org/wiki/%C5%81TZ_M62);
  ST45 (Pesa 301Dd) – PKP Cargo, 120 km/h (https://pl.wikipedia.org/wiki/Pesa_301Dd); ST48 (Newag 15D) – PKP Cargo,
  100 km/h (https://en.wikipedia.org/wiki/Newag_15D/16D);
* manewrowe: SM42 – PKP Cargo, Orlen Kolej (6Dg), 90 km/h (https://pl.wikipedia.org/wiki/Fablok_6D;
  https://pl.wikipedia.org/wiki/Newag_6Dg); SM48 (TEM2) – PKP Cargo, 100 km/h (https://pl.wikipedia.org/wiki/TEM2).

Pominięte, bo źródło nie potwierdza jazdy w rejonie albo nie podaje danych: ED161 Dart, ED74, EU44 Husarz, EP09, EP07P,
EU07A i SU160 (PKP Intercity – brak pociągów w Trójmieście w 2026 albo tylko plan), Vectrony dzierżawione do pociągów
IC Gedania (przewoźnik i oznaczenie nieustalone), ED72, EN76 / 22WE Elf, 14WE, SA134 (brak w taborze pomorskim),
36WEhb (hybrydowy Impuls 2 na linii 201 – źródła podają długość tylko innej odmiany), odmiany EN57 bez podanej
długości, ET42, ST43, Traxx, Griffin E4DCU, Vectron Freightlinera (bez prędkości).

Przyjęte (decyzje gry, nie dane ze źródła):

* przydział taboru do pociągów i linii – źródła podają, którzy przewoźnicy i jakie typy jeżdżą w regionie, a nie który
  pojazd jedzie danym pociągiem (rozkład gry jest fikcyjny). SKM: EN57, EN71, 31WE, 31WEbb, 58WE; Regio (Polregio):
  EN57, 31WEbb, 45WE; IC / EIC / TLK: ED160, EU160, EU200, EP07; EIP: ED250; skład EZT bez pasażerów: pule SKM i Regio;
  pociągi towarowe: lokomotywy liniowe o trakcji pociągu (`traction`), zdawcze (TK) także manewrowe SM42 / SM48;
* pociągi pasażerskie z linii bez sieci mają tabor przypięty w pliku stacji: Hel (Reda, Gdańsk Gł.) – SA136, SA137,
  SA138; Chojnice (Tczew) i Kościerzyna (Gdynia Gł.) – SA133, SA136, SA137, SA138 (typy z pomorskiego taboru Polregio;
  przydział do tych linii przyjęty); Kartuzy (Gdańsk Gł.) – SA133, SA136 (PKM); TLK Hel – Warszawa na odcinku przed
  Gdynią Główną (Reda, Rumia, Chylonia) – 754. W Gdyni Głównej, gdzie zmienia się lokomotywę, gra pokazuje lokomotywę
  elektryczną, z którą pociąg odjeżdża (postój w rozkładzie gry nie obejmuje zmiany lokomotywy);
* długość: zespoły z puli pasują, gdy ich łączna długość różni się od długości pociągu z rozkładu najwyżej o 20 %
  (`STOCK_LENGTH_TOLERANCE`); gdy żaden typ nie pasuje – zestaw o najmniejszej różnicy; najwyżej 2 zespoły w pociągu
  (ED160 – 1). Przykład: SKM 130 m → 2 × EN57 (129,9 m), 2 × 31WE, 2 × 31WEbb albo 2 × 58WE; EN71 do 130 m nie pasuje.
  Przypięta lista typów (`stock`) to wybór autora stacji – może przyjechać każdy typ z listy, z liczbą zespołów
  najbliższą długości pociągu (np. Kartuzy 130 m: 2 × SA133, 83,4 m; Kościerzyna 80 m: 1 × SA136, 55,6 m);
* typy z pul, których nie dostaje żaden pociąg rozkładów gry: ED250 – w rozkładach gry nie ma pociągów EIP;
  ED160 – pociągi IC / EIC w rozkładach gry mają 250–350 m, a jeden zespół (152,9 m, jazdy dwóch zespołów źródła nie
  potwierdzają) odbiega od nich o więcej niż 20 %; EN71 – pociągi SKM w rozkładach gry mają 130 m, a jeden zespół
  (86,84 m) i dwa (173,7 m) odbiegają o więcej niż 20 %. Długości pociągów w rozkładach to dane stacji, więc tabor do
  nich się dopasowuje, nie odwrotnie; typy zostają w katalogu – dostaje je pociąg o pasującej długości;
* losowanie na zmianę: ciąg losowy z ziarna zmiany i numeru pociągu (osobny od losowań opóźnień i usterek); tabor
  wybiera się raz, przy tworzeniu rozkładu zmiany, a pociąg nadzwyczajny dodany w trakcie zmiany losuje osobno;
  kolejny pociąg tej samej linii (ta sama kategoria, te same szlaki `from` i `to`, w kolejności godzin) dostaje inny
  typ niż poprzedni, gdy pasuje więcej typów; pociąg, który zaczyna albo kończy bieg na stacji, losuje sam (szlak
  z jednej strony nie odróżnia relacji – do Gdańska Gł. jednym szlakiem wjeżdżają pociągi z Helu i z Kartuz); pociąg
  ze składu innego (`unit`) ma tabor tamtego pociągu.


### Tabor pociągów – dynamika

Pociąg jedzie z dynamiką swojego taboru (`trainDynamics` w `src/model/rollingStock.js`). Wszystkie źródła sprawdzone
1.10.2026. Wzory (przyjęte – uproszczona fizyka jazdy):

* zespół trakcyjny: przy ruszaniu przyspieszenie rozruchu typu (`accel`); przy prędkości v najwyżej P / (m · v), gdzie
  P – moc zespołu (`power`), m – masa własna zespołu (`mass`, bez podróżnych). Kilka zespołów w pociągu przyspiesza jak
  jeden: każdy ma własny napęd i własną masę (EN57 – „Jednostki EN57 są przystosowane do jazdy w trakcji wielokrotnej”,
  każdy zespół z własnym członem silnikowym – DSU EN57/EN71 niżej; Impuls – „Sterowanie wielokrotne wymagane do
  2 pojazdów”, napęd na każdy wózek napędny – OPZ SKM i Newag niżej; ED160 – „Multiple unit train control with two
  vehicles”; ED250 – jazdy dwóch zespołów w trakcji podwójnej; SA13x – sterowanie ukrotnione do 3 pojazdów, każdy
  z dwoma zespołami napędowymi);
* lokomotywa: przy ruszaniu F / (m_lok + m_skł), najwyżej `LOCO_ACCEL_MAX` = 1,0 m/s² (przyjęte: lokomotywa luzem ma
  F / m 2–3,5 m/s², czego pojazd nie osiąga – poślizg kół); przy prędkości v najwyżej P / ((m_lok + m_skł) · v);
  m_skł – pociąg towarowy: `mass` wpisu (masa brutto składu); pasażerski: wagony = zaokrąglone (długość pociągu −
  długość lokomotywy) / 26,4 m, po 50 t każdy (masa wagonu bez podróżnych – przyjęte);
* hamowanie: wg typu, masy i długości pociągu, z maszynistą – osobny rozdział „Hamowanie jak maszynista” w `jazda-pociagu.md`;
* prędkość: typ wolniejszy niż pociąg ogranicza pociąg; podpowiedź rozkładu pokazuje tę prędkość, a sąsiedni posterunek
  wyprawia pociąg tak, by przy tej prędkości przyjechał o czasie. Pula losuje tylko typy nie wolniejsze niż pociąg
  z rozkładu (przyjęte: przewoźnik daje pojazd, który pojedzie wg rozkładu – EP07, 125 km/h, nie do IC 160 km/h);
  typ przypięty polem `stock` zostaje i ogranicza pociąg (754: TLK Hel – Warszawa 100 km/h);
* siła rozruchowa: gdy źródło podaje tylko maksymalną siłę pociągową (bez „przy rozruchu”), gra bierze ją (przyjęte:
  największą siłę lokomotywa ma przy ruszaniu); moc spalinowych – trakcyjna lub na obręczy kół, gdy źródło ją podaje,
  inaczej moc silnika (przyjęte – trochę zawyżona);
* bez oporów ruchu (toczenia, powietrza, łuków, pochyleń) – przyjęte; dlatego pociąg rozpędza się trochę szybciej niż
  w rzeczywistości. Sprawdzian: EN57 do 100 km/h – w grze 88 s, wg Medcom 120 s; bez ograniczenia mocą byłoby 56 s;
* brak danej w źródle → wartość kategorii: przyspieszenie EN71, 31WEbb, SA133, SA136 i lokomotywy 111Eo; ograniczenie
  mocą tylko przy znanej mocy i masie (bez niego: EN71, 31WEbb, 58WE, 111Eo); `accel` wpisu – stałe przyspieszenie.

Ze źródeł – zespoły elektryczne:

* EN57 – „Przyspieszenie 0÷40 km/h [m/s2] 0,5” (EN57; EN57AKM – 1,0), „Moc ciągła [kW] 608”, „Czas rozpędzania do
  100 km/h [s] 120” (Medcom, folder „EN57AKM”, 2009:
  https://web.archive.org/web/20130612180325id_/http://www.medcom.com.pl/dl/MEDCOM_EN57AKM.pdf); masa własna (próżna)
  123 t (PKP PLK, Regulamin sieci 2026/2027, zał. 13 v.21 „Wykaz zarejestrowanych pojazdów trakcyjnych w aplikacji
  ISZTP i SKRJ”, kolumna „Masa własna EZT i A. – próżna”:
  https://www.plk-sa.pl/files/public/user_upload/pdf/Reg_przydzielania_tras/Regulamin_sieci_2026-2027/v.21/zal_13_Reg26_27_v21_POL-ANG.xlsx
  – dalej „zał. 13”); trakcja wielokrotna (Przewozy Regionalne, DSU EN57/EN71, 2010:
  http://web.archive.org/web/20140912081146/http://www.pomorskie.eu/res/BIP/UMWP/zamowienia_publiczne/zamowienia/2012/015/dsu_en57_en71_spot___wersja_ostateczna_zatwierdzona.pdf).
  Katalog nie rozróżnia EN57AKM (SKM) – wartości EN57 (przyjęte); świadomie mieszane: przyspieszenie rozruchu 0,5 m/s²
  pierwotnego EN57 (Medcom), a hamowanie 0,8 m/s² z wymagania SKM 2010 dla modernizacji EN57 („Hamowanie jak
  maszynista” w `jazda-pociagu.md`). Prędkość w katalogu: 120 km/h (konstrukcyjna, jak
  wyżej; EN57AKM – 120 km/h w zał. 13), choć DSU i zał. 13 podają dla EN57 110 km/h – przyjęte, bo katalog obejmuje
  też EN57AKM; przez to pula SKM / Regio (120 km/h) może dostać EN57;
* EN71 – masa własna 178 t (zał. 13); przyspieszenia i mocy źródła nie podają (pl.wikipedia – bez przypisu);
* 31WE – „Przyspieszenie rozruchu ≥ 1,0 m/s²”, „Moc znamionowa 2 000 kW”, „Maksymalna prędkość eksploatacyjna
  160 km/h” (Newag, „Elektryczne zespoły trakcyjne”: https://www.newag.pl/wp-content/uploads/2025/01/Elektryczne-Zespoly-Trakcyjne-PL.pdf);
  wymaganie SKM: „Przyśpieszenie rozruchu (przy nominalnym obciążeniu) średnie, min. 1,0 m/s2” (OPZ, 11.2014, w
  dokumentacji przetargowej: https://web.archive.org/web/20160304214952/http://www.skm.pkp.pl/uploads/tx_przetargi/dokumentacja_przetargowa_94ecf3.zip);
  masa własna 145 t (zał. 13);
* 31WEbb – masa własna 145 t, 160 km/h (zał. 13); przyspieszenia i mocy tego typu źródła nie podają;
* 58WE – „Przyśpieszenie określono na co najmniej 1,1 m/s2” – wymaganie zamówienia (rynek-kolejowy.pl, 27.03.2023 –
  adres przy 58WE wyżej); przyjęte jako przyspieszenie typu (pojazdy odebrane spełniają wymagania); masa własna
  165,5 t (zał. 13); mocy źródła nie podają; prędkość: zał. 13 – 160 km/h, wymaganie przetargu – 120 km/h, więc
  `vmax` zostaje null;
* 45WE (w Polregio EN90) – „Przyspieszenie rozruchu ≥ 1,0 m/s²”, „Moc znamionowa 2 000 kW” (Newag jak wyżej);
  EN90: „cztery silniki trakcyjne o mocy 500kW każdy” (rynek-kolejowy.pl, 45WE032 – adres wyżej); masa własna EN90
  168 t (zał. 13);
* ED250 – „Przyspieszenie rozruchu: 0,49 m/s2”, moc ciągła 5664 kW, masa służbowa 410 t
  (https://pl.wikipedia.org/wiki/Alstom_EMU250, za „Technika Transportu Szynowego” 9/2013); pierwsze jazdy dwóch
  zespołów z pasażerami w 2016 r. (tamże; https://kurier-kolejowy.pl/aktualnosci/18724/nocne-testy-pendolino-zestawionego-z-dwoch-ed250.html);
* ED160 – „Starting acceleration, gross 0.6 m/s2”, „Continuous output at wheel 2000 kW” (Stadler, „FLIRT PKP
  Intercity”: https://www.stadlerrail.com/api/docs/x/c7781cb689/flirt_pkp-intercity_en.pdf); „Masa służbowa: 257 t”
  (https://psmkms.krakow.pl/index.php/kolej/elektryczne-zespoly-trakcyjne/1465-ed160).

Ze źródeł – zespoły spalinowe:

* SA133 (Pesa 218Mc) – masa służbowa 82 t (https://pl.wikipedia.org/wiki/Pesa_218M, SA133-001÷024 – zespołów pomorskich
  tabela nie obejmuje, przyjęto tę samą masę); „Moc znamionowa silników spalinowych – 2x382 kW” (PESA, DSU 218Mc,
  2011: https://bip.lubuskie.pl/system/obj/17751_218Mc_DSU__282011-01-31_29.pdf); przyspieszenia źródła nie podają.
  „Opóźnienie hamowania – średnia wartość 1,6 m/s²” z DSU nie mówi, czy to hamowanie służbowe, i jest większe niż
  hamowanie nagłe w grze – nie użyte;
* SA136 (Pesa 219M Atribo) – „Masa służbowa: 108 t” (https://www.htp.org.pl/pesa-219m-atribo-z-ziemi-polskiej-do-wloch-i-z-powrotem/),
  „Moc znamionowa: 2 x 382 kW” (https://psmkms.krakow.pl/index.php/kolej/autobusy-szynowe/1190-sa136); przyspieszenia
  źródła nie podają;
* SA137 / SA138 (Newag 220M / 221M) – „przyspieszenie rozruchu = 0,45 m/s²”, „masa służbowa = 220M: 82 t, 221M:
  105 t”, dwa zespoły napędowe z silnikiem „o mocy 390 kW” (https://pl.wikipedia.org/wiki/Newag_220M/221M, za „Świat
  Kolei” 5/2011).

Ze źródeł – lokomotywy pasażerskie i wagony:

* EU160 (Newag E4DCU – https://www.railvolution.net/news/griffins-for-pkp-ic) i EU200 – „Siła pociągowa przy rozruchu
  310 kN”, „Moc ciągła 5,6 MW”, „Masa służbowa 79 t” (wersja DC), „Długość lokomotywy ze zderzakami 19 900 mm”
  (https://www.newag.pl/oferta/griffin/); EU200 – „Masa służbowa lokomotywy 88 000 kg”
  (https://www.polrails.net/lokomotywa-elektryczna-newag-griffin-e200-e4msua-006-2024r/4970);
* EP07 – „siła pociągowa = 21,5 T” (maksymalna; https://pl.wikipedia.org/wiki/EP07) = 211 kN (przeliczenie
  21,5 t × 9,81); moc ciągła 2000 kW, masa służbowa 80 t (4E), długość 15 915 mm (tamże). 280 kN podawane w innych
  źródłach to wartość EU07 (inne przełożenie) – nie użyta;
* 754 – „Anfahrzugkraft 180 kN”, długość ze zderzakami 16 540 mm (https://de.wikipedia.org/wiki/ČSD-Baureihe_T_478.4;
  cs.wikipedia podaje „Maximální tažná síla 215 kN” i 16 500 mm – przyjęto siłę opisaną jako siła przy ruszaniu);
  moc do trakcji 1325 kW („výkon pro trakci 1325 kW”), „hmotnost ve službě” 74,4 t
  (https://cs.wikipedia.org/wiki/Lokomotiva_754);
* wagon UIC-Z – „długość ze zderzakami 26,4 m” (https://pl.wikipedia.org/wiki/UIC-Z); masa 50 t – wagony Z1 156A,
  158A, 159A (https://pl.wikipedia.org/wiki/HCP_Z1, tabela, za „Świat Kolei” 7/2014); PKP Intercity w przetargu
  22/01/TUT/2017: „Długość wagonu: nie więcej niż 26,4 m ze zderzakami”, „Całkowita masa w stanie służbowym … ≤ 50 t”
  (https://www.intercity.pl/dokumenty/przetargi/rok%202017/Dostawa%2055%20wagon%C3%B3w%20osobowych%20z%20przegl%C4%85dem%20P3%20(03.06.2017)/Za%C5%82%C4%85cznik%20nr%2010.3%20do%20SIWZ%20-%20Opis%20oferowanego%20wagonu%202%20klasy%20przedzia%C5%82owego.pdf).
  Wagony Z2 (144A, 145A) mają ok. 45 t (https://en.wikipedia.org/wiki/HCP_Z2) – gra bierze 50 t dla każdego wagonu.

Ze źródeł – lokomotywy towarowe:

* ET22 – siła pociągowa (maksymalna) 411 kN, moc ciągła 3000 kW, masa służbowa 120 t, długość 19 240 mm
  (https://pl.wikipedia.org/wiki/Pafawag_201E);
* ET41 – „Siła pociągowa lokomotywy w trakcie rozruchu może osiągać przy tzw. ‚rozruchu wysokim’ wartość 550 kN”
  („Trakcja i Wagony” 4/1978, przedruk: https://pl.misc.kolej.narkive.com/DMfzpWm5/archiwum-trakcji-i-wagonow-et41);
  moc ciągła 4000 kW, masa służbowa 167 t, długość 31 860 mm (https://pl.wikipedia.org/wiki/HCP_203E);
* EU07 – „Siła pociągowa przy rozruchu 280 kN” (https://www.ecco-rail.eu/wp-content/uploads/EU07.pdf); moc ciągła
  2000 kW, masa służbowa 80 t (4E), długość 15 915 mm (https://pl.wikipedia.org/wiki/Pafawag_4E/HCP_303E);
* EU46 (Vectron MS – PKP Cargo ma wersję wielosystemową, https://pl.wikipedia.org/wiki/Siemens_Vectron) – „Starting
  tractive effort [kN] 300”, moc „6,000 (DC 3 kV)” kW, „Length over buffers [mm] 18,980” (Siemens:
  https://assets.new.siemens.com/siemens/assets/api/uuid:36c74d44-da30-410b-8f30-5c00fb8950ff/mo-vectron-technical-data-en.pdf);
  masa służbowa 87 t (wersja wielosystemowa, pl.wikipedia jak wyżej);
* E6ACT – „siła pociągowa maks. 375 kN”, „moc 5000 kW” (Lotos, 2011:
  https://www.lotos.pl/322/p,174,n,3417/grupa_kapitalowa/centrum_prasowe/aktualnosci/dragon_w_lotos_kolej); „Masa
  służbowa 119 t”, długość ze zderzakami 20 330 mm (Newag, katalog lokomotyw elektrycznych, s. 30:
  https://www.newag.pl/wp-content/uploads/2024/11/tinywow_Lokomotywy-Elektryczne_74017630.pdf);
* E6ACTa – „Siła pociągowa przy rozruchu 410 kN” (katalog Newag jak wyżej), „Masa służbowa: 119 t”, „Długość
  lokomotywy ze zderzakami: 20 330 mm” (https://www.newag.pl/oferta/dragon-2/), „Moc ciągła: 5000 kW”
  (https://www.transportszynowy.pl/Kolej/e6acta-d);
* 111Eo – moc 5600 kW (rynek-kolejowy.pl – adres przy 111Eo wyżej); siły, masy i długości tej odmiany źródła nie podają;
* Class 66 – „Starting tractive effort 409 kN”, „Power output at wheel rim 1,850 kW”, „Weight in working order
  129.6 t”, „Length 21.400 m” (Akiem: https://www.akiem.com/wp-content/uploads/2018/07/Fiche_Class-66-EN-new.pdf);
  lokomotywy 66/6 Freightlinera mają 467 kN (https://en.wikipedia.org/wiki/EMD_Class_66) – katalog ich nie rozróżnia;
* 311D – „Starting tractive effort: 392 kN” (https://www.mainlinediesels.net/index.php?lang=en&nav=1001087); „Masa
  służbowa [kg] 120 000”, „Całkowita długość ze zderzakami [mm] 17 550”, moc silnika 2133 kW (Kowalski, Szewczyk,
  „Technika Transportu Szynowego” 3/2008, tab. 1: https://www.kilkaminut.pl/wp-content/uploads/2025/11/modernizacja_311d.pdf);
* ST44 – siła przy ruszaniu „38,3 тс (375 кН)” (https://ru.wikipedia.org/wiki/М62_(тепловоз)); masa służbowa 116,5 t,
  długość ze zderzakami 17 550 mm (TTS 3/2008 jak wyżej); „Traktionsleistung: 1271 kW”
  (https://de.wikipedia.org/wiki/PKP-Baureihe_ST44);
* ST45 (Pesa 301Dd) – „Maksymalna siła pociągowa: 330 kN”, „Masa w stanie służbowym: 97 t”, „Długość ze zderzakami:
  18990 mm” (https://www.rynek-kolejowy.pl/wiadomosci/bedzie-wiecej-st45-51358.html); moc silnika 1300 kW (ograniczona
  z 1500 kW: https://www.bh-ruda.pl/publikacje/silniki/item/2094-powerpack-mtu-w-lokomotywie-pesy);
* ST48 (Newag 15D) i SM48 (TEM2) – „Siła pociągowa rozruchu teoretyczna 372,8 kN”, „Masa służbowa (z pełnymi zapasami)
  116 t”, „Długość ze zderzakami 16 970 mm”, moc silnika 1550 kW (15D) i 882 kW (TEM2) (Newag, katalog lokomotyw
  spalinowych, s. 32: https://www.newag.pl/wp-content/uploads/2025/01/Lokomotywy-Spalinowe-PL-2_74079862.pdf);
* SM42 – „Siła pociągowa rozruchu teoretyczna 219 kN”, moc silnika 590 kW, masa służbowa 74 t, długość ze zderzakami
  14 240 mm (katalog Newag jak wyżej, s. 16, kolumna „przed modernizacją”).
