/**
 * Słownik skrótów i pojęć ruchu kolejowego użytych w grze (Ie-1, Ir-1, instrukcje urządzeń typu E, Ie-104).
 * Bez DOM – używany w dymkach samouczka, w instrukcji i jako podpowiedzi przycisków.
 */
export const GLOSSARY = {
  Poz: { name: 'Poz – danie pozwolenia', text: 'Danie sąsiedniemu posterunkowi pozwolenia na wyprawienie pociągu w naszą stronę (blokada Eap). Naciska się, gdy sąsiad żąda pozwolenia – miga lampka „żąd.”. Po Poz kierunek blokady ustawia się na wjazd.' },
  Wbl: { name: 'Wbl – żądanie pozwolenia', text: 'Żądanie od sąsiada pozwolenia na wyprawienie naszego pociągu. Sąsiad odpowiada po chwili; gdy da pozwolenie, strzałka „wyjazd” świeci i można nastawić przebieg wyjazdowy.' },
  Ko: { name: 'Ko – zwolnienie bloku końcowego', text: 'Zwolnienie bloku końcowego po przyjeździe pociągu sąsiada w całości – potwierdzenie przyjazdu. Naciska się, gdy miga lampka „Ko” (pociąg cały na stacji). Zwalnia blokadę – szlak jest znów wolny.' },
  Po: { name: 'Po – blok początkowy', text: 'Po wyjeździe naszego pociągu na szlak blok początkowy blokuje się (czerwona strzałka „wyjazd”) do chwili, gdy sąsiad potwierdzi przyjazd (Ko u sąsiada).' },
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
  Sz: { name: 'Sz – sygnał zastępczy', text: 'Białe migające światło na semaforze, podawane przez dyżurnego, gdy semafor z powodu usterki nie może wyświetlić sygnału zezwalającego. Zezwala maszyniście minąć semafor i jechać z prędkością do 20 km/h do następnego semafora. Warunek: droga przebiegu utwierdzona i sprawdzona. Każde użycie jest rejestrowane w liczniku.' },
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
  'jazda manewrowa': { name: 'Jazda manewrowa', text: 'Tryb, w którym skład porusza się po stacji za sygnałami Ms2 (z prędkością do 25 km/h), np. odstawienie składu na tor boczny. Przełącza się w zakładce Pociągi.' },
  Ie104: { name: 'Ie-104', text: 'Wytyczne PKP PLK dotyczące zobrazowania na komputerowych stanowiskach obsługi srk – kolory odcinków, symbole semaforów i zwrotnic użyte na monitorze w grze.' },
  srk: { name: 'srk', text: 'Sterowanie ruchem kolejowym – urządzenia (przekaźnikowe typu E, komputerowe) zapewniające bezpieczne nastawianie przebiegów.' },
  'pociąg zdawczy': { name: 'Pociąg zdawczy', text: 'Pociąg towarowy obsługujący stację: przywozi wagony i kończy bieg; jego skład po manewrach wraca jako nowy pociąg.' },
  'przycisk adresowy': { name: 'Przycisk adresowy (IZH-111)', text: 'Przycisk przy elemencie – semaforze, tarczy, zwrotnicy, końcu toru – który wybiera ten element do sterowania, także jako początek albo koniec przebiegu. Sam niczego nie nastawia: działa razem z przyciskiem rozkazu.' },
  'przycisk rozkazu': { name: 'Przycisk rozkazu (IZH-111)', text: 'Przycisk w grupie poza planem stacji, który mówi, co zrobić z elementem wskazanym przyciskiem adresowym: P i M – przebieg pociągowy i manewrowy, + i − – położenie zwrotnicy, STOP – zamknięcie zwrotnicy albo sygnał „Stój”, Zw – odwołanie zamknięcia i zwolnienie przebiegu manewrowego, Zcz – zwolnienie czasowe, Sz – sygnał zastępczy.' },
  Zcz: { name: 'Zcz – zwolnienie czasowe (IZH-111)', text: 'Zwolnienie utwierdzonego przebiegu pociągowego: przycisk adresowy semafora końcowego i rozkaz Zcz. Sygnał gaśnie od razu, a droga przebiegu rozwiązuje się po 120 s – do tego czasu lampka przy przycisku semafora końcowego miga na biało.' },
  'dźwignia nastawcza': { name: 'Dźwignia nastawcza (nastawnia mechaniczna)', text: 'Dźwignia na ławie nastawnicy mechanicznej: przestawia zwrotnicę albo wykolejnicę (trzon niebieski) lub podaje sygnał na semaforze (trzon czerwony) i tarczy manewrowej (niebieski z czerwoną obwódką). Odchylona w lewo – położenie zasadnicze, w prawo – przełożona; przy zwrotnicy oznaczone „+” i „−”.' },
  'drążek przebiegowy': { name: 'Drążek przebiegowy', text: 'Drążek w podstawie aparatu blokowego nastawni mechanicznej. Przekłada się go, gdy zwrotnice przebiegu już stoją dobrze – wtedy zamyka je w tym położeniu i wyklucza przebiegi sprzeczne. Cofa się go dopiero po przejeździe pociągu, gdy semafor stoi na „Stój”.' },
  'blok przebiegowy': { name: 'Blok przebiegowy utwierdzający', text: 'Blok w aparacie blokowym nastawni mechanicznej, blokowany klawiszem przed podaniem sygnału (okienko zmienia się z czerwonego na białe). Nie pozwala cofnąć drążka przebiegowego, dopóki pociąg nie przejedzie – zwalnia go sam pociąg, a wyjątkowo plombowany zwalniacz (licznik).' },
  'semafor kształtowy': { name: 'Semafor kształtowy', text: 'Semafor z ruchomymi ramionami (białymi z czerwoną obwódką): ramię poziomo – Sr1 „Stój”, wzniesione pod kątem 45° – Sr2 „Wolna droga”, dwa ramiona wzniesione – Sr3 „Wolna droga ze zmniejszoną szybkością” (do 40 km/h). Przed semaforem wjazdowym stoi tarcza ostrzegawcza kształtowa, która pokazuje, co wskazuje semafor.' },
  Sr2: { name: 'Sr2 – Wolna droga', text: 'Ramię semafora kształtowego wzniesione pod kątem 45° (nocą zielone światło): jazda z największą dozwoloną szybkością.' },
  'plan świetlny': { name: 'Plan świetlny', text: 'Schemat torów stacji nad nastawnicą mechaniczną z powtarzaczami sygnałów i lampkami zajętości torów i rozjazdów. Nie ma na nim przycisków przebiegów – zwrotnice i sygnały obsługuje się dźwigniami.' },
  'pulpit ciemny': { name: 'Pulpit ciemny', text: 'Pulpit, na którym lampki kontrolne w stanie zasadniczym są zgaszone (urządzenia typu IZH-111). Świeci tylko to, co odbiega od stanu zasadniczego: utwierdzony lub zajęty odcinek, sygnał zezwalający, wybrany element. Pulpit typu E jest półciemny – żółte szczeliny zawsze pokazują położenie zwrotnic.' },
  wyprzedzanie: { name: 'Wyprzedzanie', text: 'Wolniejszy pociąg zjeżdża na tor boczny i przepuszcza szybszy, który jedzie za nim w tym samym kierunku. Potem rusza za nim. Na linii dwutorowej to zwykły sposób, by pospieszny nie czekał za towarowym.' },
  'blokada jednokierunkowa': { name: 'Blokada jednokierunkowa', text: 'Blokada liniowa toru szlakowego linii dwutorowej: tor ma jeden kierunek ruchu, więc nie ma pozwoleń (Wbl, Poz). Sąsiad wyprawia pociąg sam, a po przyjeździe pociągu w całości potwierdza się przyjazd przyciskiem Ko.' },
  'stacja krańcowa': { name: 'Stacja krańcowa', text: 'Stacja, na której linia się kończy. Pociągi kończą tu bieg, zmieniają czoło i wracają tam, skąd przyjechały. Semafory wyjazdowe stoją po tej samej stronie torów co semafor wjazdowy.' },
  'tor czołowy': { name: 'Tor czołowy', text: 'Tor zakończony kozłem oporowym. Przebieg wjazdowy kończy się na koźle, a nie na następnym semaforze; skład odjeżdża z niego po zmianie czoła.' },
  'zmiana czoła': { name: 'Zmiana czoła', text: 'Odwrócenie kierunku jazdy stojącego składu (lokomotywa objeżdża lub prowadzi z drugiej strony). W grze: zakładka Pociągi → „zmiana czoła”.' },
};

/** Krótka podpowiedź (title) dla przycisku / polecenia. */
export function tip(term) {
  const g = GLOSSARY[term];
  return g ? `${g.name}: ${g.text}` : '';
}
