/**
 * Rejestr systemów sterowania ruchem kolejowym (srk) – „strategii” obsługi stacji.
 *
 * Każda stacja deklaruje `srk: '<id>'` (domyślnie 'E'). Strategia opisuje:
 *  - `model`   – parametry zależności przekazywane do Interlocking (czasy, liczniki),
 *  - `view`    – rodzaj stanowiska obsługi ('desk' = pulpit kostkowy typu E, 'izh' = pulpit ciemny IZH-111,
 *                'screen' = monitor komputerowy); same widoki rejestruje warstwa UI (src/srk/views.js),
 *                model nie zna DOM,
 *  - `input`   – opcjonalnie: protokół obsługi `(ilk, bus, model) => { press, pull, pressCompound, cancel, tick,
 *                armed }`; bez niego obowiązują przyciski typu E (src/srk/buttons.js).
 *
 * Logika zależności (przebiegi, utwierdzenie, zwalnianie, blokady) jest wspólna – różni się sposób
 * wydawania poleceń, obraz stanu i opcje zależności (np. nastawnia mechaniczna: zwrotnice dźwigniami, drążek
 * przebiegowy, blok przebiegowy, dźwignia sygnałowa). Nowe systemy to nowy wpis tutaj + widok w views.js.
 */
import { AddressOrderProtocol } from './address.js';

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
  model: { armTimeout: 60 },
});

registerSrk({
  id: 'izh111',
  name: 'Urządzenia przekaźnikowe typu IZH-111',
  short: 'przekaźnikowe IZH-111',
  description: 'Pulpit ciemny: przyciski adresowe przy elementach i przyciski rozkazów (P, M, +, −, STOP, Zw, Zcz, Sz); przebieg = adres początku, adres końca i rozkaz; zwolnienie czasowe Zcz po 120 s.',
  view: 'izh',
  model: { armTimeout: 10, timedRelease: 120, shuntTimedRelease: 0, timedReleaseAlways: true },
  input: (ilk, bus, model) => new AddressOrderProtocol(ilk, bus, { armTimeout: model.armTimeout }),
});

registerSrk({
  id: 'mech',
  name: 'Urządzenia mechaniczne scentralizowane (nastawnia mechaniczna)',
  short: 'mechaniczne',
  description: 'Ława dźwigniowa: zwrotnice i wykolejnice przestawia się dźwigniami, przebieg zamyka drążek przebiegowy, blok przebiegowy utwierdzający (zwalnia go pociąg), sygnał – dźwignią sygnałową; po przejeździe dźwignia na „Stój” i drążek z powrotem.',
  view: 'lever',
  model: { armTimeout: 60, pointSwitchTime: 2, timedRelease: 0, shuntTimedRelease: 0, manualPoints: true, manualSignal: true, routeBlock: true, holdRoute: true },
});
