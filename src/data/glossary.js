/**
 * Słownik skrótów i pojęć ruchu kolejowego użytych w grze (Ie-1, Ir-1, instrukcje urządzeń typu E, Ie-104).
 * Bez DOM – używany w dymkach samouczka, w instrukcji i jako podpowiedzi przycisków.
 */
export const GLOSSARY = {
  Poz: { name: 'Poz – pozwolenie', text: 'Danie sąsiedniemu posterunkowi pozwolenia na wyprawienie pociągu w naszą stronę (blokada Eap). Naciska się, gdy sąsiad żąda pozwolenia – miga pole „żąd.”. Po Poz kierunek blokady ustawia się na wjazd.' },
  Wbl: { name: 'Wbl – żądanie pozwolenia', text: 'Żądanie od sąsiada pozwolenia na wyprawienie naszego pociągu. Sąsiad odpowiada po chwili; gdy da pozwolenie, pole „wyjazd” świeci i można nastawić przebieg wyjazdowy.' },
  Ko: { name: 'Ko – blok końcowy', text: 'Potwierdzenie sąsiadowi, że jego pociąg przybył w całości. Naciska się, gdy miga pole „Ko” (pociąg cały na stacji). Zwalnia blokadę – szlak jest znów wolny.' },
  Po: { name: 'Po – blok początkowy', text: 'Po wyjeździe naszego pociągu na szlak blok początkowy blokuje się (czerwone pole „wyjazd”) do chwili, gdy sąsiad potwierdzi przyjazd (Ko u sąsiada).' },
  dPo: { name: 'dPo – doraźne zwolnienie bloku początkowego', text: 'Zwolnienie bloku początkowego bez potwierdzenia od sąsiada przez blokadę – tylko przy usterce, po telefonicznym potwierdzeniu przyjazdu. Rejestrowane w liczniku (plombowanym).' },
  dKo: { name: 'dKo – doraźne zwolnienie bloku końcowego', text: 'Zwolnienie bloku końcowego bez działania blokady – tylko przy usterce, gdy pociąg sąsiada przybył w całości. Rejestrowane w liczniku.' },
  Eap: { name: 'Blokada liniowa Eap', text: 'Półsamoczynna blokada liniowa dla linii jednotorowej: zabezpiecza, że na szlaku jest tylko jeden pociąg i tylko w jednym kierunku. Obsługa: Wbl, Poz, Ko (oraz dPo, dKo w razie usterki).' },
  SBL: { name: 'Blokada samoczynna (SBL)', text: 'Blokada liniowa na liniach dwutorowych (np. Gdańsk – Gdynia): bez pozwoleń i bez Ko – odstęp zwalnia się sam po przejeździe pociągu. Każdy tor ma kierunek zasadniczy; jazda „pod prąd” wymaga zmiany kierunku (Zk).' },
  Zk: { name: 'Zk – zmiana kierunku', text: 'Zmiana kierunku blokady samoczynnej (tylko przy wolnym odstępie). Sąsiad zmienia kierunek sam, gdy chce wyprawić pociąg; przy nastawionym u nas wyjeździe kierunek jest zajęty.' },
  przebieg: { name: 'Przebieg', text: 'Droga jazdy pociągu (lub manewru) od sygnalizatora początkowego do końcowego: zwrotnice ustawione i utwierdzone, odcinki wolne, ochrona boczna. Dopiero po utwierdzeniu semafor podaje sygnał zezwalający.' },
  'przebieg pociągowy': { name: 'Przebieg pociągowy', text: 'Przebieg dla pociągu: od semafora do następnego semafora lub na szlak. Na monitorze odcinki świecą na zielono, na pulpicie kostkowym – na biało.' },
  'przebieg manewrowy': { name: 'Przebieg manewrowy', text: 'Przebieg dla jazdy manewrowej (z prędkością do 25 km/h) od tarczy manewrowej lub semafora z Ms2 do następnego sygnalizatora lub końca toru. Na monitorze odcinki żółte.' },
  utwierdzenie: { name: 'Utwierdzenie', text: 'Zamknięcie zwrotnic w przebiegu przez urządzenia – nie da się ich przestawić, dopóki pociąg nie przejedzie (zwalnianie odcinkowe) lub przebieg nie zostanie zwolniony.' },
  Pz: { name: 'Pz – zwolnienie przebiegu', text: 'Zwolnienie utwierdzonego przebiegu, po którym nie jedzie pociąg. Jeśli odcinek zbliżania jest zajęty (pociąg już jedzie do semafora), zwolnienie następuje po czasie (90 s, na monitorze fiolet).' },
  dPz: { name: 'dPz – doraźne zwolnienie przebiegu', text: 'Natychmiastowe zwolnienie przebiegu z pominięciem zabezpieczeń (np. przy usterce). Rejestrowane w liczniku plombowanym, punktowane ujemnie – używaj tylko, gdy nie ma innej drogi.' },
  Sz: { name: 'Sz – sygnał zastępczy', text: 'Sygnał zastępczy na semaforze (białe migające światło): pozwala minąć semafor wskazujący „Stój” z prędkością do 20 km/h, gdy semafor ma usterkę, a droga jest sprawdzona. Rejestrowany w liczniku.' },
  Zw: { name: 'Zw – przestawienie zwrotnicy', text: 'Ręczne przestawienie zwrotnicy (na pulpicie: przycisk grupowy Zw + przycisk zwrotnicy). Zwrotnica utwierdzona w przebiegu, zajęta lub zamknięta indywidualnie nie da się przestawić.' },
  Zz: { name: 'Zz – zamknięcie indywidualne', text: 'Zamknięcie zwrotnicy w bieżącym położeniu (np. na czas robót lub do rozkazu pisemnego). Zamkniętej zwrotnicy nie przestawi ani obsługa, ani przebieg. Na monitorze różowy numer.' },
  OPS: { name: 'OPS – odwołanie polecenia', text: 'Odwołuje rozpoczęte, niedokończone polecenie na stanowisku komputerowym (np. wybrano PRZEBIEG POCIĄGOWY i semafor początkowy, ale rozmyśliłeś się). Klawisz Esc działa tak samo.' },
  STOP: { name: 'STOP – wygaszenie sygnału', text: 'Zmienia sygnał na semaforze na „Stój”, ale nie zwalnia przebiegu (zwrotnice pozostają utwierdzone). Na pulpicie kostkowym: wyciągnięcie przycisku sygnałowego.' },
  semafor: { name: 'Semafor', text: 'Sygnalizator dla pociągów. Wjazdowe (A, B) stoją przed stacją, wyjazdowe (C, D) przy torach stacyjnych. „Stój” = S1. Symbol na monitorze: podwójny grot.' },
  Tm: { name: 'Tm – tarcza manewrowa', text: 'Sygnalizator dla manewrów. Ms1 = „jazda manewrowa zabroniona”, Ms2 = „jazda manewrowa dozwolona”. Symbol na monitorze: pojedynczy grot.' },
  Ms2: { name: 'Ms2', text: 'Sygnał „jazda manewrowa dozwolona” (białe światło) na tarczy manewrowej lub semaforze wyposażonym w Ms2.' },
  S1: { name: 'S1 – „Stój”', text: 'Sygnał czerwony na semaforze: jazda zabroniona. Stan podstawowy każdego semafora.' },
  'odcinek zbliżania': { name: 'Odcinek zbliżania', text: 'Odcinek toru przed semaforem wjazdowym (na monitorze skrajne odcinki). Jego zajętość oznacza, że pociąg już zbliża się do semafora – wtedy zwolnienie przebiegu (Pz) jest opóźnione o 90 s.' },
  'droga ochronna': { name: 'Droga ochronna', text: 'Odcinek za semaforem końcowym przebiegu, który musi być wolny na wypadek przejechania sygnału „Stój”. Urządzenia same to sprawdzają.' },
  'ochrona boczna': { name: 'Ochrona boczna', text: 'Zwrotnice i wykolejnice sąsiadujące z przebiegiem ustawiane tak, by z bocznych torów nic nie wjechało na drogę pociągu.' },
  wykolejnica: { name: 'Wykolejnica (Wk)', text: 'Urządzenie na torze bocznym chroniące tor główny: nałożona – wykolei zbiegły tabor, zdjęta – przejazd możliwy. Przebieg manewrowy na bocznicę zdejmuje ją sam.' },
  'rozkaz pisemny': { name: 'Rozkaz pisemny „S”', text: 'Pisemne pozwolenie dla maszynisty na minięcie semafora „Stój” (do 20 km/h), gdy nie można podać sygnału ani Sz. Zakładka Rozkazy.' },
  'zapowiadanie telefoniczne': { name: 'Zapowiadanie telefoniczne', text: 'Przy usterce blokady liniowej ruch prowadzi się telefonogramami wg Ir-1: „Czy droga dla pociągu nr … wolna?”, „Droga … wolna”, „Pociąg nr … odjechał o …”, „Pociąg nr … przybył o …”. Zakładka Łączność.' },
  'tor szlakowy': { name: 'Tor szlakowy (szlak)', text: 'Tor między dwiema stacjami. Na linii jednotorowej może na nim być tylko jeden pociąg – pilnuje tego blokada liniowa.' },
  przelot: { name: 'Przelot', text: 'Przejazd pociągu przez stację bez zatrzymania. Nastaw wcześniej przebieg wjazdowy i wyjazdowy – semafor wjazdowy pokaże wtedy sygnał zezwalający bez ograniczenia.' },
  krzyżowanie: { name: 'Krzyżowanie', text: 'Mijanie się dwóch pociągów jadących w przeciwnych kierunkach na stacji linii jednotorowej – każdy na innym torze.' },
  'jazda manewrowa': { name: 'Jazda manewrowa', text: 'Tryb, w którym skład porusza się po stacji za sygnałami Ms2 (z prędkością do 25 km/h), np. odstawienie składu na tor boczny. Przełącza się w zakładce Stan.' },
  Ie104: { name: 'Ie-104', text: 'Wytyczne PKP PLK dotyczące zobrazowania na komputerowych stanowiskach obsługi srk – kolory odcinków, symbole semaforów i zwrotnic użyte na monitorze w grze.' },
  srk: { name: 'srk', text: 'Sterowanie ruchem kolejowym – urządzenia (przekaźnikowe typu E, komputerowe) zapewniające bezpieczne nastawianie przebiegów.' },
  'pociąg zdawczy': { name: 'Pociąg zdawczy', text: 'Pociąg towarowy obsługujący stację: przywozi wagony i kończy bieg; jego skład po manewrach wraca jako nowy pociąg.' },
  'zmiana czoła': { name: 'Zmiana czoła', text: 'Odwrócenie kierunku jazdy stojącego składu (lokomotywa objeżdża lub prowadzi z drugiej strony). W grze: zakładka Stan → „zmiana czoła”.' },
};

/** Krótka podpowiedź (title) dla przycisku / polecenia. */
export function tip(term) {
  const g = GLOSSARY[term];
  return g ? `${g.name}: ${g.text}` : '';
}
