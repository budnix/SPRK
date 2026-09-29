import { infoStep as info, actStep as act, atNeighbour, arrived, active } from '../lessons.js';
import { A } from '../phrases.js';

/**
 * Misja 2 – pulpit kostkowy urządzeń przekaźnikowych typu E na stacji Jodłowa (linia dwutorowa z odgałęzieniem).
 * Własny scenariusz i własne kroki: ruch bez pozwoleń z potwierdzeniem przyjazdu,
 * wyprzedzanie towarowego, pociąg na odgałęzienie z blokadą Eap.
 */
const green = (id) => ({ ref: { kind: 'signal', id, color: 'green' } });
const group = (id, role) => ({ ref: { kind: 'group', id, role } });
const ZZ = group('Zz', 'point-lock');   // zamknięcie zwrotnicy – potrzebne przy usterce napędu
const FAULTY = { ref: { kind: 'point', id: 'Zw3' } };  // zwrotnica z usterką napędu
const faulty = (sim) => sim.ilk.points.get('Zw3');
/** Zwrotnica z usterką została przestawiona: nie ma kontroli położenia aż do naprawy. */
const brokenHint = (sim) => {
  const p = faulty(sim);
  if (!(p.faultUntil > sim.clock.time)) return null;
  if (p.moving || !p.control) return 'Zwrotnica 3 została przestawiona i nie ma kontroli położenia – żaden przebieg przez nią się nie nastawi aż do naprawy (ok. 08:21). Pociąg może przez nią przejechać dopiero, gdy pracownik zabezpieczy ją na miejscu (zakładka Urządzenia → „Zabezpiecz na miejscu”, ok. 3 min), a potem na sygnał zastępczy Sz. Następnym razem zamknij ją od razu.';
  if (p.position === '+') return 'Zwrotnica 3 stoi w położeniu na tor 2 – nie przestawiaj jej i przyjmij pociąg na tor 2 (A → E2).';
  return null;
};
const koDone = (sim, exit, nr) => arrived(sim, nr) && !sim.blocks.get(exit).koPending;
const two = (a, b) => `naciśnij <b>${a}</b>, a w ciągu 6 s <b>${b}</b>`;
const route = (s, e) => two(`zielony przycisk semafora ${s}`, `zielony przycisk ${e}`);

export function steps() {
  return [
    /* ---------------- wprowadzenie ---------------- */
    info('intro', 'Witaj na stacji Jodłowa', `Przed Tobą <b>pulpit kostkowy</b> urządzeń przekaźnikowych typu E. Wszystko robi się przyciskami na kostkach: <b>naciśnięcie</b> = kliknięcie, <b>wyciągnięcie</b> = przytrzymanie pół sekundy lub prawy przycisk myszy. Większość operacji jest <b>dwuprzyciskowa</b>: pierwszy przycisk „uzbraja” (podświetla się), drugi wykonuje – masz na to 6 s.<p>Jodłowa leży na <b>linii dwutorowej</b> Krasne – Zalesie. Każdy tor szlakowy ma jeden kierunek ruchu, więc pociągów nie trzeba uzgadniać z sąsiadem tak jak na linii jednotorowej. Od stacji odchodzi też jednotorowe odgałęzienie do Borków.</p><p>Na krokach z opisem zegar stoi. Kliknij <b>Dalej</b>, gdy przeczytasz. Skróty z kropkowanym podkreśleniem mają wyjaśnienie – kliknij je.</p>`),
    info('layout', 'Plan stacji', `Tor <b>1</b> prowadzi na zachód, do Krasnego, tor <b>2</b> na wschód, do Zalesia – oba przy peronie I. Tor <b>3</b> (peron II) służy do ${A('wyprzedzanie', 'wyprzedzania')} i dla pociągów z i do Borków. Tor <b>4</b> to bocznica.<p>${A('semafor', 'Semafory')} wjazdowe: <b>A</b> (od Krasnego), <b>B</b> (od Zalesia), <b>C</b> (od Borków). Wyjazdowe na zachód: <b>D1, D2, D3</b>, na wschód: <b>E2, E3</b>.</p><p>Lampki na kostkach: <b>białe</b> – odcinek utwierdzony w przebiegu, <b>czerwone</b> – zajęty przez tabor, <b>żółte</b> przy zwrotnicy – jej położenie. Semafor to powtarzacz z zielonym przyciskiem. Przyciski grupowe u góry: Zw, Zz, Pz, dPz, Sz działają razem z drugim przyciskiem.</p>`, { el: '#desk' }),

    /* ---------------- linia dwutorowa: bez pozwoleń ---------------- */
    info('block-intro', 'Blokada na linii dwutorowej', `Kostki przy krańcach torów szlakowych to ${A('blokada jednokierunkowa', 'blokady jednokierunkowe')}. Na torze, którym pociągi <b>przyjeżdżają</b> (od Krasnego tor 2, od Zalesia tor 1), jest tylko przycisk ${A('Ko')} – potwierdzasz nim przyjazd. Na torze, którym <b>odjeżdżają</b>, nie ma żadnego przycisku: wyprawiasz pociąg, gdy tor jest wolny.<p>Sąsiad nie pyta o zgodę – po prostu wyprawia pociąg. Musisz zdążyć z przebiegiem wjazdowym.</p><p>Tylko szlak do Borków jest jednotorowy i ma pełną ${A('Eap', 'blokadę Eap')} z przyciskami Wbl, Poz, Ko.</p>`, { block: 'K2' }),
    act('in-3301', 'Wjazd bez pozwolenia', `Od Krasnego jedzie osobowy <b>3301</b> (tor 2, przyjazd 07:05). Nikt nie pytał o pozwolenie – strzałka „wjazd” przy torze od Krasnego zaświeci na czerwono, gdy pociąg będzie na szlaku. Nastaw wjazd na tor 2: ${route('A', 'semafora E2')}.`, green('A'),
      (sim) => active(sim, 'A-E2') || arrived(sim, 3301),
      { wrong: (sim) => (active(sim, 'A-E3') ? 'To przebieg na tor 3. Pociąg 3301 ma tor 2 – zwolnij przebieg (Pz + A) i nastaw A → E2.' : null) }),
    act('ko-3301', 'Potwierdzenie przyjazdu (Ko)', `Gdy 3301 stanie w całości na torze 2, zamiga lampka <b>Ko</b> na kostce blokady od Krasnego. Naciśnij przycisk <b>Ko</b>. Dopóki tego nie zrobisz, Krasne nie wyprawi następnego pociągu.`, { block: 'K2' },
      (sim) => koDone(sim, 'K2', 3301)),
    act('out-3301', 'Wyjazd bez pozwolenia', `3301 odjeżdża o 07:06 do Zalesia. Tor szlakowy jest wolny, więc od razu nastaw wyjazd: ${route('E2', 'końca przebiegu na kostce wyjazdu do Zalesia (tor 2)')}. Po wyjeździe strzałka „wyjazd” zaświeci na czerwono, aż pociąg dojedzie do Zalesia.`, green('E2'),
      (sim) => active(sim, 'E2-Z2') || atNeighbour(sim, 3301)),
    act('train-3302', 'Pociąg w drugą stronę – samodzielnie', `Od Zalesia jedzie osobowy <b>3302</b> (tor 1, przyjazd 07:12, odjazd 07:13 do Krasnego). Zrób to samo w drugim kierunku: wjazd <b>B → D1</b>, po przyjeździe <b>Ko</b> na blokadzie od Zalesia, wyjazd <b>D1 → szlak do Krasnego</b>.`, green('B'),
      (sim) => atNeighbour(sim, 3302) && !sim.blocks.get('Z1').koPending,
      { tip: 'Przycisk końca przebiegu do Krasnego jest na skrajnej lewej kostce toru 1.' }),

    /* ---------------- wyprzedzanie ---------------- */
    info('overtake-intro', 'Wyprzedzanie', `Towarowy <b>42801</b> jedzie wolno i ma za sobą pospieszny <b>IC 5501</b>. Żeby pospieszny nie czekał, towarowy zjedzie na tor <b>3</b> (przyjazd 07:21), przepuści IC przelatujący torem 2 o 07:29 i odjedzie za nim o 07:33. To jest ${A('wyprzedzanie')}.`, { el: '#desk' }),
    act('in-42801', 'Towarowy na tor 3', `Nastaw wjazd towarowego na tor 3: ${route('A', 'semafora E3')}. Zwrotnica 3 ustawi się na tor zwrotny – pociąg wjedzie z prędkością 40 km/h.`, green('A'),
      (sim) => active(sim, 'A-E3') || arrived(sim, 42801),
      { wrong: (sim) => (active(sim, 'A-E2') && !arrived(sim, 42801) ? 'To tor 2 – będzie potrzebny dla IC. Zwolnij przebieg (Pz + A) i nastaw A → E3.' : null) }),
    act('ko-42801', 'Ko, żeby IC mógł jechać', `Gdy towarowy stanie na torze 3, potwierdź przyjazd: <b>Ko</b> na blokadzie od Krasnego. Dopiero wtedy Krasne wyprawi IC.`, { block: 'K2' },
      (sim) => koDone(sim, 'K2', 42801)),
    act('pass-5501', 'Przelot IC torem 2', `IC <b>5501</b> jedzie bez zatrzymania (${A('przelot')}, 07:29). Przygotuj całą drogę zawczasu: wjazd <b>A → E2</b> i wyjazd <b>E2 → szlak do Zalesia</b>. Gdy oba przebiegi są nastawione, semafor A pokaże sygnał bez ograniczeń i pociąg nie zwolni.`, green('A'),
      (sim, ctx) => (active(sim, 'A-E2') && active(sim, 'E2-Z2')) || atNeighbour(sim, 5501) || ctx.seen.has('step:pass-5501')),
    act('after-5501', 'Towarowy rusza za pospiesznym', `Po przejeździe IC: <b>Ko</b> na blokadzie od Krasnego. Gdy IC dojedzie do Zalesia i tor szlakowy się zwolni, wypraw towarowy: ${route('E3', 'końca przebiegu do Zalesia (tor 2)')}. Odjazd 07:33.`, green('E3'),
      (sim) => atNeighbour(sim, 42801) && !sim.blocks.get('K2').koPending,
      { tip: 'Przebieg wyjazdowy nie nastawi się, dopóki tor szlakowy do Zalesia jest zajęty przez IC – strzałka „wyjazd” świeci wtedy na czerwono.' }),

    /* ---------------- odgałęzienie do Borków: Eap ---------------- */
    info('branch-intro', 'Odgałęzienie do Borków', `Szlak do Borków jest <b>jednotorowy</b>, więc pociągi uzgadnia się z sąsiadem: ${A('Wbl')} – żądasz pozwolenia dla swojego pociągu, ${A('Poz')} – dajesz pozwolenie sąsiadowi, ${A('Ko')} – potwierdzasz przyjazd. Kostki tej blokady są przy torze 3, z prawej strony pulpitu.`, { block: 'B' }),
    act('in-6612', 'Osobowy do Borków: wjazd', `Osobowy <b>6612</b> z Krasnego do Borków (tor 3, przyjazd 07:42). Nastaw wjazd <b>A → E3</b>, a po przyjeździe naciśnij <b>Ko</b> na blokadzie od Krasnego.`, green('A'),
      (sim) => koDone(sim, 'K2', 6612)),
    act('wbl-6612', 'Żądanie pozwolenia (Wbl)', `Przed wyjazdem do Borków potrzebujesz pozwolenia: naciśnij <b>Wbl</b> na kostkach blokady do Borków. Borki odpowiedzą po kilkunastu sekundach – strzałka „wyjazd” zaświeci na biało.`, { block: 'B' },
      (sim) => { const b = sim.blocks.get('B'); return (b.direction === 'out' && b.permission) || atNeighbour(sim, 6612); },
      { wrong: (sim) => (sim.blocks.get('B').request === 'ours' ? 'Żądanie wysłane – czekaj na odpowiedź Borków.' : null) }),
    act('out-6612', 'Wyjazd do Borków', `Masz pozwolenie. Nastaw wyjazd: ${route('E3', 'końca przebiegu na kostce wyjazdu do Borków')}. Odjazd 07:44. Poczekaj, aż pociąg dojedzie do Borków.`, green('E3'),
      (sim) => atNeighbour(sim, 6612) && !sim.blocks.get('B').occupied),
    act('train-6611', 'Pociąg z Borków – samodzielnie', `Borki zgłoszą osobowy <b>6611</b> do Krasnego (tor 3, przyjazd 07:56, odjazd 07:59) – zamiga lampka „żąd.”. Daj <b>Poz</b>, nastaw wjazd <b>C → D3</b>, po przyjeździe <b>Ko</b> na blokadzie do Borków, potem wyjazd <b>D3 → szlak do Krasnego</b> (bez pozwolenia – to linia dwutorowa).`, { block: 'B' },
      (sim) => atNeighbour(sim, 6611) && !sim.blocks.get('B').koPending,
      { tip: 'Żądanie od Borków przyjdzie kilka minut przed przyjazdem. Do tego czasu Poz nie zadziała.' }),

    /* ---------------- usterka: zwrotnica bez kontroli położenia ---------------- */
    info('fault-intro', 'Usterka napędu zwrotnicy', `O 08:01 <b>zwrotnica 3</b> zgłosi usterkę napędu – w dzienniku pojawi się alarm. Zwrotnica stoi teraz w położeniu <b>na tor 3</b> i w tym położeniu jest sprawna. Gdyby ją przestawić, nie odzyska <b>kontroli położenia</b>, a bez kontroli żaden przebieg przez nią się nie nastawi.<p>Zasada jest prosta: <b>zwrotnicy z usterką się nie przestawia</b>. Ruch prowadzi się tak, żeby została tam, gdzie stoi.</p><p>O 08:10 przyjedzie osobowy <b>3304</b>, planowo na tor 2. Do toru 2 zwrotnica 3 musiałaby się przestawić – dlatego przyjmiesz go na tor <b>3</b>. Zmiana toru z powodu usterki nie kosztuje punktów.</p>`, FAULTY),
    act('fault-lock', 'Zabezpieczenie zwrotnicy', `Poczekaj na alarm o usterce, a potem zamknij zwrotnicę 3, żeby nikt jej przypadkiem nie przestawił – także przebieg: ${two('przycisk grupowy Zz', 'przycisk zwrotnicy 3')}.`, ZZ,
      (sim) => faulty(sim).faultUntil > sim.clock.time && faulty(sim).individualLock && faulty(sim).control && !faulty(sim).moving,
      { wrong: (sim) => brokenHint(sim), tip: 'Alarm pojawi się o 08:01. Usterki widać też w zakładce Urządzenia.' }),
    act('fault-in', 'Przyjęcie na inny tor', `Nastaw wjazd 3304 na tor 3: ${route('A', 'semafora E3')}. Przebieg nastawi się normalnie, bo zwrotnica 3 już stoi we właściwym położeniu. Po przyjeździe naciśnij <b>Ko</b> na blokadzie od Krasnego.<p>Spróbuj dla porównania A → E2: urządzenia odmówią, bo zwrotnica jest zamknięta.</p>`, green('A'),
      (sim) => koDone(sim, 'K2', 3304),
      { wrong: (sim) => brokenHint(sim) }),
    act('fault-out', 'Wyjazd z toru 3', `3304 odjeżdża o 08:11 do Zalesia: ${route('E3', 'końca przebiegu do Zalesia (tor 2)')}. Zwrotnicę 3 zostaw zamkniętą do czasu naprawy.`, green('E3'),
      (sim) => atNeighbour(sim, 3304)),

    info('end', 'Koniec misji', `To wszystko: obsługa dwuprzyciskowa, Zw, Zz, „Stój” i Pz, ruch na linii dwutorowej z samym Ko, wyprzedzanie, pociągi na odgałęzienie z blokadą Eap i prowadzenie ruchu przy usterce zwrotnicy. Po „Dalej” zmiana się zakończy i pokaże się <b>raport zmiany</b>.<p>Misja 3 pokazuje stację krańcową na pulpicie typu IZH-111 (menu → Nowa zmiana → Misja 3).</p>`, { el: '#btn-menu' }),
  ];
}

export default { id: 'pulpit', name: 'Misja 2 – pulpit kostkowy typu E', view: 'pulpit', station: 'jodlowa', steps };
