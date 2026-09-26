import { viewHelp } from '../srk/views.js';

/** Okno pomocy – instrukcja obsługi stanowiska (część zależna od systemu srk) i zasad ruchu. */
export class Help {
  constructor(root, sim) {
    this.root = root;
    this.sim = sim;
    root.innerHTML = `<div class="modal-box">
      <button class="close" aria-label="Zamknij">×</button>
      ${viewHelp(sim.srk)}
      <p class="muted">Stacja: ${sim.station.name} – ${sim.srk.name}. ${sim.station.srkInfo || ''} Poniższe zasady (przebiegi, zwrotnice, blokada, rozkazy) są wspólne; na pulpicie kostkowym wykonuje się je przyciskami, na stanowisku komputerowym – poleceniami z menu elementu.</p>
      <h3>Przebiegi</h3>
      <ul>
        <li><b>Przebieg pociągowy</b>: zielony przycisk semafora początkowego → zielony przycisk semafora końcowego (lub przycisk końca przebiegu na szlaku <i>kW</i>/<i>kE</i>). Zwrotnice przestawiają się same, odcinki świecą na biało (utwierdzenie), semafor podaje sygnał zezwalający wg Ie-1.</li>
        <li><b>Przebieg manewrowy</b>: biały przycisk tarczy manewrowej (lub semafora z Ms2) → biały przycisk sygnalizatora końcowego / przycisk końca toru (<i>kT3</i>).</li>
        <li><b>Wygaszenie sygnału</b>: wyciągnij przycisk sygnałowy. Przebieg pozostaje utwierdzony.</li>
        <li><b>Zwolnienie przebiegu</b>: <b>Pz</b> + przycisk sygnałowy. Gdy odcinek zbliżania jest zajęty – zwalnianie czasowe (90 s).</li>
        <li><b>Doraźne zwolnienie</b>: <b>dPz</b> + przycisk sygnałowy (licznik, plombowany). Używaj tylko w razie usterki.</li>
        <li><b>Sygnał zastępczy</b>: <b>Sz</b> + zielony przycisk semafora (licznik). Pociąg jedzie 20 km/h po aktualnie ustawionych zwrotnicach.</li>
        <li>Po przejeździe pociągu przebieg rozwiązuje się odcinkowo.</li>
      </ul>
      <h3>Zwrotnice i wykolejnice</h3>
      <ul>
        <li><b>Przestawienie</b>: <b>Zw</b> + przycisk zwrotnicy (czarny na kostce). Nie da się przestawić zwrotnicy zajętej, utwierdzonej lub zamkniętej.</li>
        <li><b>Zamknięcie indywidualne</b>: <b>Zz</b> + przycisk zwrotnicy (biała lampka przy przycisku).</li>
        <li>Lampki: <span class="sw y"></span> żółta – położenie, <span class="sw w"></span> biała – utwierdzona w przebiegu, <span class="sw r"></span> czerwona – zajęta. Brak światła – zwrotnica w ruchu / brak kontroli.</li>
        <li>Wykolejnica Wk: żółta – nałożona (chroni tor główny), biała – zdjęta.</li>
      </ul>
      <h3>Blokada liniowa Eap</h3>
      <ul>
        <li><b>Wyprawienie pociągu</b>: <b>Wbl</b> – żądanie pozwolenia. Sąsiad odpowiada (lampka „wyjazd”). Potem nastaw przebieg wyjazdowy. Po wyjeździe blok początkowy Po i zajętość szlaku świecą na czerwono aż sąsiad potwierdzi przyjazd.</li>
        <li><b>Przyjęcie pociągu</b>: sąsiad żąda pozwolenia (migająca lampka „żąd.”, komunikat). Naciśnij <b>Poz</b>. Nastaw przebieg wjazdowy. Po przyjeździe pociągu w całości (miga „Ko”) naciśnij <b>Ko</b>.</li>
        <li><b>dPo</b>, <b>dKo</b> – doraźne zwolnienie bloków (liczniki).</li>
      </ul>
      <h3>Rozkazy pisemne</h3>
      <ul>
        <li>Zakładka <i>Rozkazy</i>: rozkaz „S” pozwala pociągowi stojącemu przed semaforem „Stój” przejechać obok niego do następnego semafora z prędkością do 20 km/h (np. przy usterce semafora).</li>
        <li>Warunki wydania (Ir-1): pociąg stoi przed tym semaforem, zwrotnice w drodze jazdy zamknięte <b>Zz</b> lub utwierdzone w przebiegu, wykolejnice zdjęte, odcinki wolne, przy wyjeździe pozwolenie blokady.</li>
      </ul>
      <h3>Zakłócenia, łączność i ocena</h3>
      <ul>
        <li>Na ekranie startowym wybierasz scenariusz i poziom zakłóceń: opóźnienia pociągów od sąsiadów, usterki (semafor bez sygnału, zwrotnica bez kontroli, fałszywa zajętość, blokada bez łączności), pociągi nadzwyczajne.</li>
        <li><b>Usterka semafora</b>: Sz lub rozkaz „S”. <b>Fałszywa zajętość</b>: po sprawdzeniu toru Sz. <b>Zwrotnica bez kontroli</b>: czekaj na naprawę lub zamknij ją Zz i wydaj rozkaz.</li>
        <li><b>Blokada bez łączności</b>: zapowiadanie telefoniczne (zakładka <i>Łączność</i>, formuły wg Ir-1): „Czy droga dla pociągu nr … wolna?”, „Droga … wolna”, „Pociąg nr … odjechał o …”, „Pociąg nr … przybył o …”. Bloki zwalnia się dPo / dKo po telefonicznym potwierdzeniu.</li>
        <li><b>Ocena</b> (menu ☰ → Raport): punktualne wyprawienia +5; przetrzymanie pociągu −1/min; zły tor −5; dPz −20; dPo/dKo bez uzasadnienia −15; Sz i rozkaz bez usterki −5/−10; błędny telefonogram −5; rozprucie −100. Raport pojawia się na koniec zmiany.</li>
      </ul>
      <h3>Okręgi nastawcze (Gdynia Główna)</h3>
      <ul>
        <li>Stacja ma dwie nastawnie: <b>GO</b> (dysponująca, głowica wschodnia) i <b>GO2</b> (wykonawcza, głowica zachodnia). Na ekranie startowym wybierasz stanowisko; drugi pulpit prowadzi automat i jest widoczny w podglądzie (zakładki nad pulpitem).</li>
        <li><b>Jako dyżurny GO</b>: zakładka <i>Polecenia</i> – wydajesz nastawni GO2 polecenia „przyjąć pociąg nr … na tor …” i „wyprawić pociąg nr … do …”. GO2 daje pozwolenie sąsiadowi, nastawia przebieg i melduje wykonanie przez łączność. Bez polecenia pociąg od Gdańska czeka u sąsiada.</li>
        <li><b>Jako nastawniczy GO2</b>: otrzymujesz polecenia dyżurnego (łączność i zakładka <i>Polecenia</i>) i wykonujesz je na swoim pulpicie. Wykonanie w ciągu 4 min: +2 pkt, później −5, brak wykonania przez 12 min: −10.</li>
      </ul>
      <h3>Pociągi</h3>
      <ul>
        <li>Pociągi osobowe zatrzymują się przy peronie i odjeżdżają nie wcześniej niż o czasie rozkładowym – gdy semafor wyjazdowy pokaże sygnał zezwalający.</li>
        <li>Pociąg, który zakończył bieg, można przełączyć w jazdę manewrową (zakładka <i>Stan</i>) – porusza się wtedy za sygnałem Ms2.</li>
      </ul>
      <p class="muted">Symulator jest uproszczeniem rzeczywistości; zasady wzorowano na Ie-1, Ir-1 i instrukcjach obsługi urządzeń przekaźnikowych typu E.</p>
    </div>`;
    root.querySelector('.close').addEventListener('click', () => this.hide());
    root.addEventListener('click', (e) => { if (e.target === root) this.hide(); });
  }

  toggle() { this.root.classList.toggle('hidden'); }
  hide() { this.root.classList.add('hidden'); }
}
