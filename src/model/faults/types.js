/**
 * Rodzaje usterek – każdy rodzaj opisany w jednym miejscu (dotąd w kilku: harmonogram usterek, kontrola definicji
 * scenariusza, ruch, automat sprawdzający): czego dotyczy, czy losuje się przy zakłóceniach, czy automat dyżurnego go
 * obsługuje, jak się zaczyna i kończy. Harmonogram (`src/model/Faults.js`) jest wspólny dla wszystkich rodzajów.
 *
 * Wpis rodzaju:
 *  - `target` – rodzaj elementu: 'signal' | 'point' | 'section' | 'block'; `exists(sim, id)` – czy cel jest na stacji,
 *  - `pool(sim)` – cele do losowania przy zakłóceniach (null – rodzaj tylko ze scenariusza albo nie na tej stacji),
 *  - `name` – nazwa w dopełniaczu do komunikatów („usterka semafora”), `automat` – automat dyżurnego ją obsługuje,
 *  - `blocksPath` – usterka na drodze pociągu uzasadnia przyjęcie na inny tor (`Traffic`),
 *  - opcjonalnie dla kontroli definicji scenariusza: `automatGap` – czego automat nie robi (gdy `automat: false`),
 *    `requires(sim)` – czego wymaga od stanowiska (`{ level, msg }` albo null), `outlastsShift` – może trwać po końcu
 *    zmiany bez uwagi (gracz usuwa ją sam),
 *  - `apply` / `clear` – początek (zwraca, czy cel był) i koniec usterki; `log(poziom, napis)` – dziennik,
 *  - opcjonalnie: `arm` (od `at`, zanim usterka się pojawi), `ready` (czy już się pojawia), `overlap` (druga usterka
 *    tego samego elementu w trakcie pierwszej), `during` (co takt czynnej usterki; `finish()` kończy ją wcześniej).
 *
 * Nowy rodzaj usterki: wpis tutaj, opis w panelu (`src/ui/faultText.js`) i test. Moduł logiki: bez DOM.
 */

const semafory = (sim) => [...sim.ilk.signals.values()].filter((s) => s.kind === 'semafor').map((s) => s.id);

export const FAULTS = Object.freeze({
  /** semafor nie podaje sygnału zezwalającego (pozostaje Sz i rozkaz „S”); tarcza – zezwolenie radiem na manewry */
  'signal-fail': {
    target: 'signal', name: 'semafora', automat: true, blocksPath: true,
    exists: (sim, id) => sim.ilk.signals.has(id),
    pool: (sim) => semafory(sim),
    apply(sim, f, { log }) {
      const s = sim.ilk.signals.get(f.target);
      if (!s) return false;
      s.failed = true; sim.ilk.refreshSignals();
      // semafor: dla pociągu Sz albo rozkaz „S”; dla manewrów (także tarcza) – zezwolenie dyżurnego (Ir-9 § 10 ust. 15)
      const shunt = 'Manewry: po nastawieniu przebiegu – zezwolenie radiem (Łączność).';
      log('alarm', s.kind === 'semafor'
        ? `USTERKA: semafor ${f.target} nie podaje sygnału zezwalającego (żarówka / obwód). Pociąg: Sz; gdy nie można – rozkaz „S”. ${shunt}`
        : `USTERKA: tarcza manewrowa ${f.target} nie podaje sygnału Ms2 (żarówka / obwód). ${shunt}`);
      return true;
    },
    clear(sim, f, { log }) {
      const s = sim.ilk.signals.get(f.target);
      if (s) { s.failed = false; sim.ilk.refreshSignals(); }
      log('info', `Usterka semafora ${f.target} usunięta.`);
    },
  },
  /** po przestawieniu zwrotnica nie odzyskuje kontroli przez pewien czas */
  'point-control': {
    target: 'point', name: 'napędu zwrotnicy', automat: true, blocksPath: true,
    exists: (sim, id) => sim.ilk.points.has(id),
    pool: (sim) => [...sim.ilk.points.keys()],
    apply(sim, f, { log }) {
      const p = sim.ilk.points.get(f.target);
      if (!p) return false;
      p.faultUntil = (f.since ?? f.at) + f.duration; // od chwili wystąpienia (usterka ze scenariusza może zacząć się później niż `at`)
      log('alarm', `USTERKA: zwrotnica ${f.target} – po przestawieniu nie uzyska kontroli położenia (napęd). Wezwano automatyka.`);
      return true;
    },
    clear(sim, f, { log }) {
      const p = sim.ilk.points.get(f.target);
      if (p) { p.faultUntil = 0; if (!p.moving && !p.control && !p.trailed) { p.control = true; sim.bus.emit('point', p); } }
      log('info', `Zwrotnica ${f.target} – napęd naprawiony, kontrola położenia.`);
    },
    /** Druga usterka napędu, gdy pierwsza trwa: kontrola wraca dopiero po późniejszej z nich. */
    overlap(sim, f, time) {
      const p = sim.ilk.points.get(f.target);
      if (p) p.faultUntil = Math.max(p.faultUntil || 0, time + f.duration);
    },
  },
  /** odcinek wskazuje zajętość bez pociągu (pozostaje Sz po potwierdzeniu) */
  'false-occupancy': {
    target: 'section', name: 'kontroli zajętości', automat: true, blocksPath: true,
    exists: (sim, id) => sim.ilk.sections.has(id),
    pool: (sim) => [...sim.ilk.sections.values()].filter((s) => s.kind !== 'approach').map((s) => s.id),
    apply(sim, f, { log }) {
      const s = sim.ilk.sections.get(f.target);
      if (!s) return false;
      s.forced = true; sim.ilk.updateOccupancy(sim.traffic.currentOccupancy());
      log('alarm', `USTERKA: odcinek ${f.target} wskazuje zajętość bez pociągu (obwód torowy). Po sprawdzeniu toru – Sz.`);
      return true;
    },
    clear(sim, f, { log }) {
      const s = sim.ilk.sections.get(f.target);
      if (s) { s.forced = false; sim.ilk.updateOccupancy(sim.traffic.currentOccupancy()); }
      log('info', `Odcinek ${f.target} – obwód torowy sprawny.`);
    },
  },
  /** blokada liniowa bez łączności elektrycznej: zapowiadanie telefoniczne */
  'block-fail': {
    target: 'block', name: 'blokady liniowej', automat: true, blocksPath: false,
    exists: (sim, id) => sim.blocks.has(id),
    pool: (sim) => [...sim.blocks.keys()],
    apply(sim, f, { log }) {
      const b = sim.blocks.get(f.target);
      if (!b) return false;
      b.setFault(true);
      log('alarm', `USTERKA: blokada liniowa do ${b.neighbour} bez łączności – zapowiadanie telefoniczne (zakładka Łączność).`);
      return true;
    },
    clear(sim, f, { log }) {
      const b = sim.blocks.get(f.target);
      if (b) b.setFault(false);
      log('info', `Blokada liniowa do ${b?.neighbour} – łączność przywrócona.`);
    },
  },
  /** nastawnia mechaniczna: pociąg nie zwalnia bloku przebiegowego utwierdzającego (urządzenie oddziaływania) – drążek przebiegu od semafora `target` cofa się tylko zwalniaczem; losuje się tylko tam, gdzie jest blok */
  'route-block': {
    target: 'signal', name: 'bloku przebiegowego', automat: true, blocksPath: false,
    requires: (sim) => (sim.ilk.routeBlock ? null : { level: 'error', msg: `blok przebiegowy ma tylko nastawnia mechaniczna (srk ${sim.srk.id}) – usterka bez skutku` }),
    exists: (sim, id) => sim.ilk.signals.get(id)?.kind === 'semafor',
    pool: (sim) => (sim.ilk.routeBlock ? semafory(sim) : null),
    apply(sim, f, { log }) {
      const s = sim.ilk.signals.get(f.target);
      if (!s) return false;
      s.blockStuck = true;
      log('alarm', `USTERKA: urządzenie oddziaływania pociągu za semaforem ${f.target} – blok przebiegowy nie zwolni się sam. Po przejeździe sprawdź, że pociąg minął miejsce końca pociągu, i użyj zwalniacza.`);
      return true;
    },
    clear(sim, f, { log }) {
      const s = sim.ilk.signals.get(f.target);
      if (s) s.blockStuck = false;
      log('info', `Urządzenie oddziaływania pociągu za semaforem ${f.target} naprawione.`);
    },
  },
  /** usterka nawierzchni zgłoszona przez maszynistę (np. pęknięta szyna) na odcinku `target`: dyżurny zamyka tor (ITS); wjazd pociągu na tor z usterką bez zamknięcia kosztuje punkty (`during`). Tylko ze scenariusza – nie losuje się (tor zamyka się poleceniem stanowiska komputerowego) */
  'track-defect': {
    target: 'section', name: 'nawierzchni (pęknięta szyna)', automat: false, blocksPath: true, automatGap: 'nie zamyka toru',
    exists: (sim, id) => sim.ilk.sections.has(id),
    pool: () => null, // tylko ze scenariusza
    apply(sim, f, { log }) {
      const s = sim.ilk.sections.get(f.target);
      if (!s) return false;
      s.defect = true;
      f.wasOccupied = !!s.physical; // pociąg, który już tam jest, zgłosił usterkę – może zjechać
      log('alarm', `USTERKA: maszynista zgłasza pękniętą szynę na odcinku ${f.target}${s.track ? ` (tor ${s.track})` : ''}. Zamknij tor dla ruchu (ITS) i prowadź pociągi innym torem.`);
      return true;
    },
    clear(sim, f, { log }) {
      const s = sim.ilk.sections.get(f.target);
      if (s) s.defect = false;
      log('info', `Odcinek ${f.target}${s?.track ? ` (tor ${s.track})` : ''} – nawierzchnia naprawiona, tor można otworzyć (ITO).`);
    },
    /**
     * Pociąg wjechał na tor z usterką nawierzchni (tabor stojący tam przy zgłoszeniu się nie liczy). Pociągi zatrzymuje
     * się przed przeszkodą (Ir-1 §75), więc każdy nowy wjazd jest karany; na tor zamknięty (ITS, np. na Sz) – mocniej.
     * Urządzenie wjazdu nie blokuje – odpowiada za to dyżurny.
     */
    during(sim, f, { time, log }) {
      const s = sim.ilk.sections.get(f.target);
      if (!s) return;
      const occ = !!s.physical;
      if (occ && !f.wasOccupied) {
        const closed = !!s.closed;
        log('warn', `Pociąg wjechał na tor z usterką nawierzchni (odcinek ${f.target})${closed ? ' mimo zamknięcia toru' : ' – tor nie został zamknięty'}`);
        sim.bus.emit('score', { time, code: 'track-defect', points: closed ? -80 : -50, section: f.target,
          msg: `Jazda po torze z usterką nawierzchni (${f.target})${closed ? ' zamkniętym dla ruchu' : ' bez zamknięcia toru'}` });
      }
      f.wasOccupied = occ;
    },
  },
  /** od `at` licznik osi odcinka `target` myli się przy najbliższym przejeździe: gdy pociąg zjedzie z odcinka, ten dalej wskazuje zajętość (`axleFault`). Dyżurny zeruje licznik (`axle-reset`, MOR-3: ZeroLO), odcinek zostaje zajęty do przejazdu kontrolnego (`during`) – wjazd i wyjazd pociągu po zerowaniu go zwalnia. Bez zerowania usterkę usuwa automatyk po `duration` od jej wystąpienia. Tylko ze scenariusza (zerowanie ma stanowisko MOR-3) */
  'axle-counter': {
    target: 'section', name: 'licznika osi', automat: false, blocksPath: true, automatGap: 'nie zeruje licznika osi', outlastsShift: true,
    requires: (sim) => (sim.srk.id === 'mor3' ? null : { level: 'warning', msg: `zerowanie licznika osi (ZeroLO) ma tylko stanowisko MOR-3 (srk ${sim.srk.id}) – gracz czeka na naprawę` }),
    exists: (sim, id) => sim.ilk.sections.has(id),
    pool: () => null, // tylko ze scenariusza
    apply(sim, f, { log }) {
      const s = sim.ilk.sections.get(f.target);
      if (!s) return false;
      s.axleFault = true; s.resetPending = false;
      sim.ilk.refreshOccupancy();
      log('alarm', `USTERKA: licznik osi odcinka ${f.target}${s.track ? ` (tor ${s.track})` : ''} wskazuje zajętość po przejeździe pociągu. Sprawdź, że tor jest wolny, i wyzeruj licznik (ZeroLO); pierwszy pociąg wjedzie na sygnał zastępczy.`);
      return true;
    },
    clear(sim, f, { log }) {
      const s = sim.ilk.sections.get(f.target);
      const pilot = f.pilot === 'done'; // po przejeździe kontrolnym; inaczej – upłynął czas usterki (automatyk)
      if (s) { s.axleFault = false; s.axleArmed = false; s.resetPending = false; sim.ilk.refreshOccupancy(); sim.bus.emit('section', s); }
      log('info', pilot ? `Odcinek ${f.target} – przejazd kontrolny po zerowaniu licznika osi, odcinek wolny.` : `Licznik osi odcinka ${f.target} naprawiony (automatyk).`);
    },
    /** Od `at` odcinek jest „uzbrojony” – zależność ustawia usterkę w chwili zjazdu taboru, bez taktu przerwy. */
    arm(sim, f) {
      const s = sim.ilk.sections.get(f.target);
      if (s) s.axleArmed = true;
    },
    /** Usterka pojawia się, gdy pociąg zjedzie z odcinka (po `at`). */
    ready(sim, f) {
      const s = sim.ilk.sections.get(f.target);
      if (!s) return false;
      if (s.axleFault) return true; // zależność już wykazała zajętość przy zjeździe pociągu (odcinek uzbrojony)
      if (s.physical) { f.trainSeen = true; return false; }
      return !!f.trainSeen;
    },
    /**
     * Po zerowaniu licznika osi – przejazd kontrolny: nowy wjazd pociągu na odcinek i wyjazd z niego zwalnia odcinek.
     * Tabor stojący na odcinku w chwili zerowania musi najpierw zjechać (jego wyjazd nie jest przejazdem kontrolnym).
     */
    during(sim, f, { finish }) {
      const s = sim.ilk.sections.get(f.target);
      if (!s?.resetPending) return;
      f.pilot ??= s.physical ? 'leave' : 'enter';
      if (f.pilot === 'leave' && !s.physical) f.pilot = 'enter';
      else if (f.pilot === 'enter' && s.physical) f.pilot = 'inside';
      else if (f.pilot === 'inside' && !s.physical) { f.pilot = 'done'; finish(); }
    },
  },
});

/** Nazwy rodzajów usterek (kolejność losowania). */
export const FAULT_TYPES = Object.freeze(Object.keys(FAULTS));
