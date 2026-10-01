/**
 * Kategorie pociągów (bez DOM): prędkość maksymalna, dynamika i etykieta jak w rozkładach PKP.
 * Kategoria bierze się z pola `cat` wpisu rozkładu, a gdy go nie ma – z nazwy („IC …”, „TLK …”, „Regio …”, „SKM …”,
 * „Zdawczy” / „… (zdawczy)”, „Lokomotywa luzem …”, „Skład EZT …”) i rodzaju (`kind: 'tow'` → towarowy masowy TM).
 * Prędkość: `vmax` wpisu, inaczej domyślna kategorii; na szlaku i tak obowiązuje mniejsza z prędkości pociągu i szlaku
 * (`lineSpeed` wyjazdu), a na rozjazdach – rozjazdu.
 *
 * Pociągi towarowe i pojazdy luzem mają klucze i etykiety z PKP PLK, Regulamin sieci 2025/2026, zał. 6.3
 * „Klasyfikacja pociągów stosowana w konstrukcji rozkładów jazdy” (aktualizacja z 15.09.2026, s. 9–13): dwie pierwsze
 * litery to rodzaj pociągu (`code`), trzecia – trakcja (`traction` wpisu, domyślnie E – elektryczna, lokomotywy).
 * `tractions` – trakcje, które tablica załącznika dopuszcza dla rodzaju (P parowa, E elektryczna – lokomotywy,
 * J elektryczne zespoły trakcyjne, S spalinowa – lokomotywy, M spalinowa – zespoły i wagony trakcyjne).
 * Pole `catLabel` wpisu nadpisuje całą etykietę (np. „TMS”).
 *
 * Prędkość, przyspieszenie, hamowanie i masa odniesienia (`refMass`) kategorii to wartości przyjęte w grze
 * (docs/SOURCES.md), nie dane ze źródła.
 */
export const CATEGORIES = {
  EIP: { label: 'EIP', name: 'Express InterCity Premium', vmax: 200, accel: 0.5, brake: 0.7 },
  EIC: { label: 'EIC', name: 'Express InterCity', vmax: 160, accel: 0.35, brake: 0.6 },
  IC: { label: 'IC', name: 'InterCity', vmax: 160, accel: 0.3, brake: 0.55 },
  TLK: { label: 'TLK', name: 'Twoje Linie Kolejowe', vmax: 140, accel: 0.3, brake: 0.55 },
  R: { label: 'R', name: 'Regio (osobowy)', vmax: 120, accel: 0.45, brake: 0.65 },
  SKM: { label: 'SKM', name: 'Szybka Kolej Miejska', vmax: 120, accel: 0.6, brake: 0.8 },
  // B1. Pociągi towarowe w ruchu międzynarodowym
  TC: { code: 'TC', label: 'TCE', name: 'towarowy do międzynarodowych przewozów intermodalnych', tractions: ['E', 'S'], vmax: 100, accel: 0.17, brake: 0.3, refMass: 1400 },
  TG: { code: 'TG', label: 'TGE', name: 'towarowy do międzynarodowych przewozów masowych', tractions: ['E', 'S'], vmax: 80, accel: 0.12, brake: 0.3, refMass: 2000 },
  TR: { code: 'TR', label: 'TRE', name: 'towarowy do międzynarodowych przewozów niemasowych', tractions: ['E', 'S'], vmax: 100, accel: 0.18, brake: 0.35, refMass: 1200 },
  // B2. Pociągi towarowe w ruchu krajowym
  TD: { code: 'TD', label: 'TDE', name: 'towarowy do krajowych przewozów intermodalnych', tractions: ['E', 'S'], vmax: 100, accel: 0.17, brake: 0.3, refMass: 1400 },
  TM: { code: 'TM', label: 'TME', name: 'towarowy do krajowych przewozów masowych', tractions: ['E', 'S'], vmax: 80, accel: 0.12, brake: 0.3, refMass: 2000 },
  TN: { code: 'TN', label: 'TNE', name: 'towarowy do krajowych przewozów niemasowych', tractions: ['E', 'S'], vmax: 100, accel: 0.18, brake: 0.35, refMass: 1200 },
  TK: { code: 'TK', label: 'TKE', name: 'towarowy do obsługi stacji i bocznic (zdawczy)', tractions: ['P', 'E', 'S'], vmax: 60, accel: 0.15, brake: 0.35, refMass: 600 },
  TS: { code: 'TS', label: 'TSE', name: 'towarowy: próżne wagony z/do naprawy, pociąg próbny, pozostałe', tractions: ['E', 'J', 'S', 'M'], vmax: 80, accel: 0.18, brake: 0.35, refMass: 800 },
  TH: { code: 'TH', label: 'THE', name: 'skład lokomotyw', tractions: ['E', 'S'], vmax: 100, accel: 0.4, brake: 0.6 },
  // C. Pojazdy kolejowe luzem
  LT: { code: 'LT', label: 'LTE', name: 'lokomotywa luzem (do i od pociągów towarowych)', tractions: ['P', 'E', 'S'], vmax: 100, accel: 0.4, brake: 0.6 },
  EZT: { label: 'EZT', name: 'skład EZT (jazda służbowa)', vmax: 100, accel: 0.5, brake: 0.7 },
};

/**
 * Dawne klucze kategorii towarowych (sprzed oznaczeń z zał. 6.3) – wpis z `cat: 'TOW'` dalej działa.
 */
export const CATEGORY_ALIASES = { TOW: 'TM', TOWP: 'TN', ZD: 'TK' };

/**
 * Przyspieszenie a masa (przyjęte): przyspieszenie kategorii obowiązuje przy masie `refMass`; pociąg o masie `mass`
 * ma przyspieszenie kategorii razy `refMass / mass`, ograniczone do przedziału [MIN, MAX] (ta sama siła pociągowa
 * lokomotywy rozpędza większą masę wolniej). Bez `mass` – przyspieszenie kategorii.
 */
export const MASS_ACCEL_MIN = 0.5;
export const MASS_ACCEL_MAX = 1.5;

/**
 * Największy nacisk liniowy na liniach w grze: 71 kN/m (klasa D3; Regulamin sieci 2025/2026, zał. 2.5 – linie 9, 131,
 * 201) ≈ 7,2 t na metr. Masa pociągu nie może być większa niż ten nacisk razy długość pociągu.
 */
export const MAX_TONNES_PER_METRE = 7.2;
/** Najdłuższy pociąg towarowy w grze [m] (przyjęte wg PKP PLK: pociągi 750 m na liniach portowych Gdańska). */
export const MAX_FREIGHT_LENGTH = 750;

const BY_NAME = [[/^EIP\b/, 'EIP'], [/^EIC\b/, 'EIC'], [/^IC\b/, 'IC'], [/^TLK\b/, 'TLK'], [/^SKM\b/, 'SKM'], [/^(Regio|R)\b/, 'R'],
  [/^Lokomotywa luzem/i, 'LT'], [/zdawcz/i, 'TK'], [/EZT/, 'EZT']];

/** Klucz `CATEGORIES` dla wartości pola `cat` (także dawny klucz z `CATEGORY_ALIASES`) albo null. */
export function categoryKey(cat) {
  if (cat == null) return null;
  const key = CATEGORY_ALIASES[cat] ?? cat;
  return Object.hasOwn(CATEGORIES, key) ? key : null;
}

/** Kategoria wpisu rozkładu (klucz `CATEGORIES`). */
export function categoryOf(entry) {
  const key = categoryKey(entry.cat);
  if (key) return key;
  const name = entry.name || '';
  for (const [re, cat] of BY_NAME) if (re.test(name)) return cat;
  return entry.kind === 'tow' ? 'TM' : 'R';
}

/** Prędkość maksymalna pociągu [km/h]: `vmax` wpisu albo domyślna kategorii. */
export function speedFor(entry) {
  return entry.vmax ?? CATEGORIES[categoryOf(entry)].vmax;
}

/**
 * Dynamika (przyspieszenie / hamowanie w m/s²). Przyspieszenie: `accel` wpisu, inaczej kategorii przeliczone na masę
 * wpisu (`mass`, gdy kategoria ma `refMass`). Hamowanie: `brake` wpisu albo kategorii – masa go nie zmienia, bo
 * wymagany procent masy hamującej dobiera się do drogi hamowania, prędkości i pochylenia, a nie do masy pociągu
 * (Ir-1 §21: Mhw = Mo × Pw / 100).
 */
export function dynamicsFor(entry) {
  const c = CATEGORIES[categoryOf(entry)];
  let accel = c.accel;
  if (c.refMass && entry.mass > 0) accel = c.accel * Math.min(MASS_ACCEL_MAX, Math.max(MASS_ACCEL_MIN, c.refMass / entry.mass));
  return { accel: entry.accel ?? accel, brake: entry.brake ?? c.brake };
}

/** Etykieta kategorii: `catLabel` wpisu, rodzaj PKP PLK z trakcją wpisu (`traction`, np. „TMS”) albo etykieta kategorii. */
export function categoryLabel(entry) {
  if (entry.catLabel != null) return entry.catLabel;
  const c = CATEGORIES[categoryOf(entry)];
  return c.code && entry.traction ? `${c.code}${entry.traction}` : c.label;
}

/** Etykieta jak w rozkładzie: „IC 5100”, „SKM 92101”, „TME 44561”. */
export function trainLabel(entry) {
  return `${categoryLabel(entry)} ${entry.nr}`;
}

/** Nazwa handlowa pociągu z cudzysłowu w nazwie („Kaszub”) albo z pola `brand`. */
export function brandOf(entry) {
  if (entry.brand) return entry.brand;
  const m = /„([^”]+)”/.exec(entry.name || '');
  return m ? m[1] : null;
}

/** Relacja bez przedrostka kategorii i nazwy handlowej („IC „Kaszub” Kraków – Gdynia” → „Kraków – Gdynia”). */
export function relationOf(entry) {
  const rel = (entry.name || '').replace(/„[^”]*”\s*/, '').replace(/^(EIP|EIC|IC|TLK|SKM|Regio|R|Towarowy|Zdawczy|Lokomotywa luzem)\s+/i, '').trim();
  return rel || entry.name || '';
}
