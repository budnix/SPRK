/**
 * Kategorie pociągów (bez DOM): prędkość maksymalna, dynamika i etykieta jak w rozkładach PKP.
 * Kategoria bierze się z pola `cat` wpisu rozkładu, a gdy go nie ma – z nazwy („IC …”, „TLK …”, „Regio …”, „SKM …”,
 * „Zdawczy” / „… (zdawczy)”, „Lokomotywa luzem …”, „Skład EZT …”) i rodzaju (`kind: 'tow'` → towarowy). Prędkość: `vmax`
 * wpisu, inaczej domyślna kategorii; na szlaku i tak obowiązuje mniejsza z prędkości pociągu i szlaku (`lineSpeed`
 * wyjazdu), a na rozjazdach – rozjazdu.
 *
 * Etykiety pociągów towarowych i lokomotyw luzem to trzyliterowe oznaczenia rodzaju pociągu PKP PLK (Regulamin sieci,
 * zał. 6.3 „Klasyfikacja pociągów stosowana w konstrukcji rozkładów jazdy”): TM – krajowe przewozy masowe, TN –
 * niemasowe, TK – obsługa stacji i bocznic (zdawczy), LT – lokomotywa do i od pociągów towarowych; trzecia litera to
 * trakcja (E – elektryczna, S – spalinowa). Gra nie odwzorowuje trakcji – etykieta ma „E”, a wpis rozkładu może
 * podać własną w polu `catLabel` (np. „TMS”).
 */
export const CATEGORIES = {
  EIP: { label: 'EIP', name: 'Express InterCity Premium', vmax: 200, accel: 0.5, brake: 0.7 },
  EIC: { label: 'EIC', name: 'Express InterCity', vmax: 160, accel: 0.35, brake: 0.6 },
  IC: { label: 'IC', name: 'InterCity', vmax: 160, accel: 0.3, brake: 0.55 },
  TLK: { label: 'TLK', name: 'Twoje Linie Kolejowe', vmax: 140, accel: 0.3, brake: 0.55 },
  R: { label: 'R', name: 'Regio (osobowy)', vmax: 120, accel: 0.45, brake: 0.65 },
  SKM: { label: 'SKM', name: 'Szybka Kolej Miejska', vmax: 120, accel: 0.6, brake: 0.8 },
  TOW: { label: 'TME', name: 'towarowy ładowny', vmax: 80, accel: 0.12, brake: 0.3 },
  TOWP: { label: 'TNE', name: 'towarowy próżny / lekki', vmax: 100, accel: 0.18, brake: 0.35 },
  ZD: { label: 'TKE', name: 'zdawczy (do obsługi stacji i bocznic)', vmax: 60, accel: 0.15, brake: 0.35 },
  LT: { label: 'LTE', name: 'lokomotywa luzem (do i od pociągów towarowych)', vmax: 100, accel: 0.4, brake: 0.6 },
  EZT: { label: 'EZT', name: 'skład EZT (jazda służbowa)', vmax: 100, accel: 0.5, brake: 0.7 },
};

const BY_NAME = [[/^EIP\b/, 'EIP'], [/^EIC\b/, 'EIC'], [/^IC\b/, 'IC'], [/^TLK\b/, 'TLK'], [/^SKM\b/, 'SKM'], [/^(Regio|R)\b/, 'R'],
  [/^Lokomotywa luzem/i, 'LT'], [/zdawcz/i, 'ZD'], [/EZT/, 'EZT'], [/próżny|lekki/i, 'TOWP']];

/** Kategoria wpisu rozkładu (klucz `CATEGORIES`). */
export function categoryOf(entry) {
  if (entry.cat && CATEGORIES[entry.cat]) return entry.cat;
  const name = entry.name || '';
  for (const [re, cat] of BY_NAME) if (re.test(name) && (cat !== 'TOWP' || entry.kind === 'tow')) return cat;
  return entry.kind === 'tow' ? 'TOW' : 'R';
}

/** Prędkość maksymalna pociągu [km/h]: `vmax` wpisu albo domyślna kategorii. */
export function speedFor(entry) {
  return entry.vmax ?? CATEGORIES[categoryOf(entry)].vmax;
}

/** Dynamika (przyspieszenie / hamowanie w m/s²) wg kategorii, z możliwością nadpisania we wpisie. */
export function dynamicsFor(entry) {
  const c = CATEGORIES[categoryOf(entry)];
  return { accel: entry.accel ?? c.accel, brake: entry.brake ?? c.brake };
}

/** Etykieta kategorii: `catLabel` wpisu (np. inna trakcja – „TMS”) albo etykieta kategorii. */
export function categoryLabel(entry) {
  return entry.catLabel ?? CATEGORIES[categoryOf(entry)].label;
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
