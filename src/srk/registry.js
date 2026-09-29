/**
 * Rejestr systemów sterowania ruchem kolejowym (srk) – „strategii” obsługi stacji.
 *
 * Każda stacja deklaruje `srk: '<id>'` (domyślnie 'E'). Strategia opisuje:
 *  - `model`   – parametry zależności przekazywane do Interlocking (czasy, liczniki),
 *  - `view`    – rodzaj stanowiska obsługi ('desk' = pulpit kostkowy typu E, 'izh' = pulpit ciemny IZH-111,
 *                'screen' = monitor komputerowy); same widoki rejestruje warstwa UI (src/srk/views.js),
 *                model nie zna DOM,
 *  - `input`   – opcjonalnie: protokół obsługi `(ilk, bus, model, { blocks }) => { press, pull, pressCompound, cancel,
 *                tick, armed }`; bez niego obowiązują przyciski typu E (src/srk/buttons.js).
 *
 * Logika zależności (przebiegi, utwierdzenie, zwalnianie, blokady) jest wspólna – różni się sposób
 * wydawania poleceń, obraz stanu i opcje zależności (np. nastawnia mechaniczna: zwrotnice dźwigniami, drążek
 * przebiegowy, blok przebiegowy, dźwignia sygnałowa). Nowe systemy to nowy wpis tutaj + widok w views.js.
 */
import { AddressOrderProtocol } from './address.js';
import { EbiLockProtocol } from './ebilock.js';
import { MorProtocol } from './mor.js';

const SRK = new Map();

export function registerSrk(def) {
  if (!def.id) throw new Error('Strategia srk bez id');
  SRK.set(def.id, { model: {}, ...def });
  return def;
}

/** Strategia po id; nieznane / brak → urządzenia przekaźnikowe typu E. */
export function getSrk(id) {
  return SRK.get(id) || SRK.get('E');
}

export function hasSrk(id) {
  return SRK.has(id);
}

export function listSrk() {
  return [...SRK.values()];
}

registerSrk({
  id: 'E',
  name: 'Urządzenia przekaźnikowe typu E',
  short: 'przekaźnikowe E',
  description: 'Pulpit kostkowy: przyciski dwuprzyciskowe (uzbrojenie 6 s), liczniki plombowane dPz/Sz/dPo/dKo, lampki na kostkach.',
  view: 'desk',
  model: { armTimeout: 6 },
});

registerSrk({
  id: 'komputerowe',
  name: 'Komputerowe urządzenia srk (stanowisko z monitorem)',
  short: 'komputerowe',
  description: 'Obraz stanu na monitorze (ciemne tło, tor szary/zielony/czerwony), polecenia z menu elementu: przebieg = wskazanie początku i końca, polecenia specjalne (dPz, Sz, Zz, dPo, dKo) z potwierdzeniem i rejestracją.',
  view: 'screen',
  model: { armTimeout: 60, shuntEmergencyPlain: true, emergencyReleaseName: 'ZDP' }, // ZDM – zwykłe polecenie (Ie-104.1 §12)
});

registerSrk({
  id: 'izh111',
  name: 'Urządzenia przekaźnikowe typu IZH-111',
  short: 'przekaźnikowe IZH-111',
  description: 'Pulpit ciemny: przyciski adresowe przy elementach i przyciski rozkazów (P, M, +, −, STOP, Zw, Zcz, Sz); przebieg = adres początku, adres końca i rozkaz; zwolnienie czasowe Zcz po 120 s.',
  view: 'izh',
  model: { armTimeout: 10, timedRelease: 120, shuntTimedRelease: 0, timedReleaseAlways: true, emergencyReleaseName: null }, // JZH-111 bez dPz
  input: (ilk, bus, model) => new AddressOrderProtocol(ilk, bus, { armTimeout: model.armTimeout }),
});

registerSrk({
  id: 'mech',
  name: 'Urządzenia mechaniczne scentralizowane (nastawnia mechaniczna)',
  short: 'mechaniczne',
  description: 'Ława dźwigniowa: zwrotnice i wykolejnice przestawia się dźwigniami, przebieg zamyka drążek przebiegowy, blok przebiegowy utwierdzający (zwalnia go pociąg), sygnał – dźwignią sygnałową; po przejeździe dźwignia na „Stój” i drążek z powrotem.',
  view: 'lever',
  model: { armTimeout: 60, pointSwitchTime: 2, timedRelease: 0, shuntTimedRelease: 0, manualPoints: true, manualSignal: true, routeBlock: true, holdRoute: true, shapedSignals: true, emergencyReleaseName: 'zwalniacz' },
});

registerSrk({
  id: 'ebilock',
  name: 'Komputerowe urządzenia stacyjne typu EBILock 950 (pulpit EBIScreen)',
  short: 'komputerowe EBILock 950',
  description: 'Monitor wg Ie-104 z tekstową linią poleceń: prawy klawisz na obiekcie – menu poleceń, lewy na sygnalizatorze i prawy na końcu – przebieg; każde polecenie (POC, MAN, ZWP, SES…) zatwierdza „Wykonaj”; polecenia specjalne dwuczęściowe (SZI → SZW po 5–30 s); okno zdarzeń i alarmów z potwierdzaniem.',
  view: 'ebi',
  model: { armTimeout: 60, emergencyReleaseName: 'PZA' },
  input: (ilk, bus) => new EbiLockProtocol(ilk, bus),
});

registerSrk({
  id: 'mor3',
  name: 'Komputerowe urządzenia stacyjne typu MOR-3 (pulpit MOR-1)',
  short: 'komputerowe MOR-3',
  description: 'Monitor wg Ie-104, obsługa menu obiektów: kliknięcie obiektu – fioletowa obwódka i menu (Stój, Stop, ZCZ, ZD, SZ, Plus, Minus, Zmk…), kliknięcie celu przebiegu – menu „Pociąg” / „Manewr”; polecenia fioletowe wymagają potwierdzenia, czerwone są specjalne (licznik); okno komunikatów i alarmów pod obrazem.',
  view: 'mor',
  model: { armTimeout: 60, emergencyReleaseName: null }, // MOR-1 bez doraźnego zwolnienia przebiegu
  input: (ilk, bus, model, ctx) => new MorProtocol(ilk, bus, ctx),
});
