import { infoStep as info, actStep as act, entry, atNeighbour, arrived, blockFree } from '../lessons.js';
import { A } from '../phrases.js';

/**
 * Misja 6 – stanowisko komputerowe MOR-3 (pulpit MOR-1) w węźle Kalinowo: trzy linie jednotorowe z blokadą Eap.
 * Własny scenariusz i własne kroki: menu obiektów, przebieg kliknięciem celu (semafora, toru, trójkąta) i przeciąganiem,
 * blokada z menu trójkąta przy wyjeździe, krzyżowanie w węźle, okno alarmów (dwuklik), usterka licznika osi – zerowanie
 * ZeroLO, droga ułożona zwrotnicami z menu i przejazd kontrolny na sygnał zastępczy.
 */
const sig = (id) => ({ ref: { kind: 'signal', id, color: 'green' } });
const tri = (id) => ({ ref: { kind: 'end', id } });
const B = (sim, exit) => sim.blocks.get(exit);
const set = (sim, id) => sim.ilk.active.has(id) || sim.ilk.pending.some((p) => p.route.id === id);
const T2 = (sim) => sim.ilk.sections.get('T2');
const pt = (sim, id) => sim.ilk.points.get(id);
const blk = (exit) => `kliknij trójkąt <b>${exit}</b> przy końcu toru`;

export function steps() {
  return [
    /* ---------------- wprowadzenie ---------------- */
    info('intro', 'Witaj na stanowisku MOR-3', `Przed Tobą ${A('MOR', 'stanowisko MOR-3')} z pulpitem MOR-1. Poleceń nie wpisuje się ani nie wybiera z paska: <b>klikasz obiekt</b> – semafor, zwrotnicę, tor, trójkąt przy wyjeździe – a on dostaje <b>fioletową obwódkę</b> i menu swoich poleceń.<p>Polecenie zwykłe wykonuje się od razu. <b class="mor-violet">Fioletowe</b> trzeba potwierdzić, a <b class="mor-red">czerwone</b> to polecenia specjalne: potwierdzenie i licznik poleceń specjalnych (żółty na niebieskim, pod obrazem).</p><p>Na krokach z opisem zegar stoi. Kliknij <b>Dalej</b>, gdy przeczytasz.</p>`),
    info('layout', 'Węzeł Kalinowo', `Kalinowo to <b>węzeł</b> trzech linii jednotorowych: w lewo do Jesionki, w prawo do Bukowa, a tuż za stacją, w prawo w dół – do Lipnik. Tory <b>1</b> i <b>2</b> są przy peronie wyspowym.<p>Semafory wjazdowe: <b>A</b> (od Jesionki), <b>B</b> (od Bukowa), <b>C</b> (od Lipnik). Wyjazdowe: <b>D1</b>, <b>D2</b> do Jesionki, <b>E1</b>, <b>E2</b> do Bukowa albo Lipnik – kierunek wybiera zwrotnica 3.</p><p>Pod obrazem jest okno <b>Komunikaty</b> / <b>Alarmy</b>.</p>`, { el: '#desk' }),

    /* ---------------- pierwszy pociąg: menu obiektów ---------------- */
    info('block-intro', 'Blokada z menu trójkąta', `Każdy szlak ma ${A('Eap', 'blokadę Eap')}: ${A('Poz')} – pozwolenie dla sąsiada, ${A('Ko')} – potwierdzenie przyjazdu, ${A('Wbl')} – żądanie pozwolenia na wyjazd. Na MOR-3 są w <b>menu trójkąta</b> przy końcu toru szlakowego: kliknij trójkąt, wybierz polecenie.`, { block: 'W' }),
    act('poz-7201', 'Danie pozwolenia (Poz)', `Jesionka <b>żąda pozwolenia</b> dla osobowego <b>7201</b> (tor 1, 07:06). ${blk('Jesionka')} i wybierz <b>Poz</b>.`, tri('kW'),
      (sim) => B(sim, 'W').direction === 'in' || arrived(sim, 7201),
      { tip: 'Jeśli żądania jeszcze nie ma, odczekaj chwilę.' }),
    act('route-7201', 'Przebieg: początek, potem cel', `Kliknij semafor <b>A</b> – obwódka i menu. Nie wybieraj nic z menu: kliknij <b>cel</b>, semafor <b>E1</b> na końcu toru 1. Pojawi się menu przebiegu – wybierz <b>Pociąg</b>. Wykona się od razu.`, sig('A'),
      (sim) => set(sim, 'A-E1') || arrived(sim, 7201),
      { wrong: (sim) => (set(sim, 'A-E2') ? '7201 ma tor 1. Kliknij A i wybierz ZD – przebieg się zwolni – potem nastaw A → E1.' : null) }),
    act('ko-7201', 'Potwierdzenie przyjazdu (Ko)', `Gdy 7201 stanie przy peronie: trójkąt <b>Jesionka</b> → <b>Ko</b>.`, tri('kW'),
      (sim) => arrived(sim, 7201) && blockFree(B(sim, 'W'))),
    act('wbl-7201', 'Żądanie pozwolenia (Wbl)', `7201 jedzie dalej do Bukowa. ${blk('Buków')} i wybierz <b>Wbl</b>. Buków odpowie po kilkunastu sekundach.`, tri('kE'),
      (sim) => (B(sim, 'E').direction === 'out' && B(sim, 'E').permission) || atNeighbour(sim, 7201),
      { wrong: (sim) => (B(sim, 'E').request === 'ours' ? 'Żądanie wysłane – czekaj na odpowiedź Bukowa.' : null) }),
    act('out-7201', 'Wyjazd: cel to trójkąt', `Nastaw wyjazd: kliknij <b>E1</b>, potem trójkąt <b>Buków</b> jako cel i <b>Pociąg</b>. Pociąg odjedzie o 07:07.`, sig('E1'),
      (sim) => set(sim, 'E1-E') || atNeighbour(sim, 7201),
      { wrong: (sim) => (set(sim, 'E1-L') ? 'To wyjazd do Lipnik. 7201 jedzie do Bukowa – zwolnij przebieg (E1 → ZD) i wskaż trójkąt Buków.' : null) }),
    act('in-7202', 'Cel przebiegu: tor', `Z Bukowa jedzie <b>7202</b> (07:14, tor 1). Daj <b>Poz</b> z menu trójkąta Buków. Potem kliknij semafor <b>B</b> i jako cel – <b>linię toru 1</b> (tor też może być celem), menu <b>Pociąg</b>.`, sig('B'),
      (sim) => set(sim, 'B-D1') || arrived(sim, 7202)),
    act('out-7202', 'Przeciągnij i upuść', `Po przyjeździe: <b>Ko</b> (Buków), <b>Wbl</b> (Jesionka). Wyjazd nastaw inaczej: <b>przeciągnij prawym klawiszem</b> myszy od semafora <b>D1</b> do trójkąta <b>Jesionka</b> i wybierz <b>Pociąg</b> (na tablecie: dotknij D1, potem trójkąta).`, sig('D1'),
      (sim) => atNeighbour(sim, 7202) && blockFree(B(sim, 'E'))),

    /* ---------------- krzyżowanie w węźle ---------------- */
    info('cross-intro', 'Krzyżowanie w węźle', `O 07:24 z Jesionki przyjedzie <b>7203</b> do Lipnik, a o 07:25 z Bukowa – <b>7204</b> do Jesionki. Spotkają się tutaj: 7203 na torze <b>2</b>, 7204 na torze <b>1</b>.<p>Jesionka i Buków będą żądać pozwolenia prawie naraz – obsłuż oba szlaki.</p>`, { el: '#desk' }),
    act('cross-in', 'Oba wjazdy', `<b>Poz</b> dla Jesionki i Bukowa, potem wjazdy: <b>A → E2</b> (tor 2) i <b>B → D1</b> (tor 1) – obiekt, cel, <b>Pociąg</b>.`, sig('A'),
      (sim) => arrived(sim, 7203) && arrived(sim, 7204),
      { wrong: (sim) => (set(sim, 'A-E1') && !arrived(sim, 7203) ? '7203 ma tor 2 – na torze 1 stanie 7204. Zwolnij przebieg (A → ZD) i nastaw A → E2.' : null) }),
    act('cross-out', 'Oba wyjazdy', `<b>Ko</b> dla obu szlaków. Potem wyjazdy: 7203 do Lipnik – <b>Wbl</b> z trójkąta Lipniki i <b>E2 → trójkąt Lipniki</b>; 7204 do Jesionki – <b>Wbl</b> i <b>D1 → trójkąt Jesionka</b>.`, sig('E2'),
      (sim) => atNeighbour(sim, 7203) && atNeighbour(sim, 7204)),
    act('freight-47201', 'Towarowy z Lipnik bez zatrzymania', `Z Lipnik jedzie towarowy <b>47201</b> (07:41) – ${A('przelot', 'przelot')} torem 2 do Jesionki. <b>Poz</b> dla Lipnik, <b>Wbl</b> do Jesionki, przebiegi <b>C → D2</b> i <b>D2 → Jesionka</b>. Po przejeździe <b>Ko</b> dla Lipnik.`, sig('C'),
      (sim) => atNeighbour(sim, 47201) && blockFree(B(sim, 'L'))),

    /* ---------------- usterka licznika osi ---------------- */
    info('fault-intro', 'Licznik osi', `Tor 2 nie ma obwodu torowego, tylko ${A('licznik osi')}: urządzenie liczy osie wjeżdżające i zjeżdżające. Przy towarowym licznik się pomylił – gdy towarowy zjechał z toru 2, tor został <b>czerwony</b>, choć jest pusty.<p>Na zajęty tor przebiegu nie ma. Procedura: sprawdzić, że tor jest wolny, <b>wyzerować licznik</b> poleceniem specjalnym <b class="mor-red">ZeroLO</b>, a pierwszy pociąg wpuścić na ${A('Sz', 'sygnał zastępczy')} – jego przejazd zwolni tor.</p>`, { el: '#desk' }),
    act('fault-ack', 'Alarm – dwuklik', `Przełącznik <b>Alarmy</b> miga – otwórz okno alarmów. Alarm jest biały na czerwonym tle – <b>kliknij go dwa razy</b>. Zmieni się na czerwony na niebieskim: potwierdzony.`, { cmd: 'alarms' },
      (sim) => sim.input.alarmList().some((x) => x.kind === 'axle-counter') && sim.input.alarmList().every((x) => x.acked)),
    act('fault-zero', 'Zerowanie (ZeroLO)', `Towarowy dojechał do Jesionki, więc tor 2 jest pusty. Kliknij <b>linię toru 2</b> i wybierz <b class="mor-red">ZeroLO</b>, potem <b>Potwierdź</b>. Tor pociemnieje – czeka na przejazd kontrolny. Licznik poleceń specjalnych pokaże 00001.`, { ref: { kind: 'section', id: 'T2' } },
      (sim) => !!T2(sim).resetPending || !T2(sim).axleFault && !!sim.faults.list.find((f) => f.type === 'axle-counter')?.done),
    act('fault-points', 'Droga ręcznie: Minus i Stop', `Przebiegu na tor 2 nie nastawisz, bo tor wciąż „jest zajęty”. Ułóż drogę z Lipnik ręcznie: <b>zwrotnica 3</b> → <b>Minus</b>, <b>zwrotnica 2</b> → <b>Minus</b> (jeśli już stoją w minusie – pomiń), a potem każda → <b>Stop</b> (zablokowanie – nikt jej nie przestawi pod pociągiem).`, { ref: { kind: 'point', id: 'Zw3' } },
      (sim) => ['Zw3', 'Zw2'].every((id) => { const p = pt(sim, id); return p.position === '-' && !p.moving && p.individualLock; }) || arrived(sim, 7205)),
    act('fault-sz', 'Przejazd kontrolny na SZ', `Lipniki zgłoszą osobowy <b>7205</b> (07:58) – daj <b>Poz</b>. Pociąg stanie przed semaforem C. Wtedy: semafor <b>C</b> → <b class="mor-red">SZ</b> → <b>Potwierdź</b>. Pociąg wjedzie na tor 2 z prędkością do 40 km/h. Sygnał zastępczy przy usterce nie kosztuje punktów.`, sig('C'),
      (sim, ctx) => ctx.seen.has('sz:C') || arrived(sim, 7205)),
    act('fault-out', 'Wyjazd – tor 2 wolny', `Po postoju: <b>Ko</b> (Lipniki), <b>Wbl</b> (Jesionka), wyjazd <b>D2 → Jesionka</b>. Gdy 7205 zjedzie z toru 2, licznik się wyzeruje i tor zgaśnie – koniec usterki.`, sig('D2'),
      (sim) => atNeighbour(sim, 7205) && !T2(sim).axleFault),
    act('fault-unlock', 'Odblokowanie zwrotnic (oStop)', `Zdejmij blokady: zwrotnica <b>3</b> → <b class="mor-violet">oStop</b> → <b>Potwierdź</b>, to samo dla zwrotnicy <b>2</b>. oStop jest fioletowe – wymaga potwierdzenia.`, { ref: { kind: 'point', id: 'Zw2' } },
      (sim) => !pt(sim, 'Zw3').individualLock && !pt(sim, 'Zw2').individualLock),
    act('in-7206', 'Osobowy 7206 – samodzielnie', `Osobowy <b>7206</b> z Jesionki do Bukowa (08:10), tor 1: <b>Poz</b>, <b>A → E1</b>, <b>Ko</b>, <b>Wbl</b> (Buków), <b>E1 → Buków</b>.`, sig('A'),
      (sim) => atNeighbour(sim, 7206)),
    act('in-7207', 'Tor 2 znów sprawny', `Ostatni: <b>7207</b> z Jesionki do Lipnik (08:22) – torem 2, który już działa normalnie: <b>Poz</b>, <b>A → E2</b>, <b>Ko</b>, <b>Wbl</b> (Lipniki), <b>E2 → Lipniki</b>.`, sig('A'),
      (sim) => atNeighbour(sim, 7207) && entry(sim, 7207)?.actualTrack != null),

    info('end', 'Koniec misji', `To wszystko: menu obiektów, przebieg kliknięciem celu i przeciąganiem, blokada z menu trójkąta, krzyżowanie w węźle, dwuklik na alarmie, zerowanie licznika osi, zwrotnice Minus / Stop / oStop i przejazd kontrolny na SZ. Po „Dalej” zmiana się zakończy i pokaże się <b>raport zmiany</b>.<p>W instrukcji pod „?” są pozostałe polecenia semafora: <b>Stój</b>, <b>Stop</b>, <b>ZCZ</b> / <b>oZCZ</b> (zwolnienie czasowe) i <b>ZD</b>.</p>`, { el: '#btn-menu' }),
  ];
}

export default { id: 'mor', name: 'Misja 6 – stanowisko MOR-3', view: 'mor', station: 'kalinowo', steps };
