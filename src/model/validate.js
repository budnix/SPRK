import { hasTileDef, getTileDef } from '../tiles/registry.js';
import { isDir } from '../tiles/directions.js';
import { hasSrk } from '../srk/registry.js';
import { controlsFit, legacyButtons, controlAnchor } from '../tiles/controls.js';
import { CATEGORIES, categoryKey, categoryOf, MAX_TONNES_PER_METRE } from './categories.js';
import { ROLLING_STOCK, STOCK_KINDS, chainOf, pinnedTypes } from './rollingStock.js';

/**
 * Walidacja definicji stacji (schemat v1). Zwraca { errors: [], warnings: [] }.
 * Używana przez symulację i przyszły edytor.
 */
export function validateStation(st) {
  const errors = [];
  const warnings = [];
  if (!st || typeof st !== 'object') return { errors: ['Brak definicji stacji'], warnings };
  if (st.schemaVersion !== 1) errors.push(`Nieobsługiwana wersja schematu: ${st.schemaVersion}`);
  if (!st.id) errors.push('Brak pola id');
  if (!st.name) errors.push('Brak pola name');
  if (!st.desk || !(st.desk.cols > 0) || !(st.desk.rows > 0)) errors.push('Brak wymiarów pulpitu desk.cols/desk.rows');
  if (st.srk != null && !hasSrk(st.srk)) errors.push(`Nieznany system srk: ${st.srk}`);
  for (const sc of st.scenarios || []) if (sc.srk != null && !hasSrk(sc.srk)) errors.push(`Scenariusz ${sc.id}: nieznany system srk: ${sc.srk}`);
  if (!Array.isArray(st.tiles)) { errors.push('Brak listy kostek tiles'); return { errors, warnings }; }
  const occupied = new Map();
  const ids = new Set();
  st.tiles.forEach((t, i) => {
    const where = `kostka #${i} (${t.x},${t.y})`;
    if (!Number.isInteger(t.x) || !Number.isInteger(t.y)) errors.push(`${where}: brak współrzędnych`);
    if (!hasTileDef(t.type)) { errors.push(`${where}: nieznany typ '${t.type}'`); return; }
    const def = getTileDef(t.type);
    const span = t.span && typeof t.span === 'object' ? t.span : def.span;
    for (let dx = 0; dx < span.w; dx++) for (let dy = 0; dy < span.h; dy++) {
      const k = `${t.x + dx},${t.y + dy}`;
      if (occupied.has(k)) errors.push(`${where}: nakłada się na kostkę (${k})`);
      occupied.set(k, t);
    }
    if (st.desk && (t.x < 0 || t.y < 0 || t.x + span.w > st.desk.cols || t.y + span.h > st.desk.rows)) errors.push(`${where}: poza pulpitem`);
    for (const [field, spec] of Object.entries(def.schema || {})) {
      const v = t[field];
      if (spec.required && (v === undefined || v === null)) errors.push(`${where}: brak pola '${field}'`);
      if (v === undefined) continue;
      if (spec.type === 'port' && !isDir(v)) errors.push(`${where}: pole '${field}' – zły port '${v}'`);
      if (spec.type === 'ports' && (!Array.isArray(v) || v.some((p) => !isDir(p)) || (spec.count && v.length !== spec.count))) errors.push(`${where}: pole '${field}' – zła lista portów`);
      if (spec.type === 'enum' && !spec.values.includes(v)) errors.push(`${where}: pole '${field}' – dopuszczalne ${spec.values.join('/')}`);
    }
    if (t.id) { if (ids.has(t.id)) errors.push(`${where}: powtórzony id '${t.id}'`); ids.add(t.id); }
    if (t.type === 'point' && new Set([t.toe, t.straight, t.diverge]).size !== 3) errors.push(`${where}: porty zwrotnicy muszą być różne`);
  });
  // Przyciski grupowe należą do stanowiska, nie do stacji: stacja może tylko wskazać wolne miejsce
  if (legacyButtons(st).length) warnings.push('Kostki `button` w definicji stacji są przestarzałe – przyciski grupowe rysuje stanowisko (opcjonalnie desk.controls: { x, y })');
  else if (st.desk?.controls && !controlsFit(st, st.desk.controls.x, st.desk.controls.y)) errors.push(`desk.controls (${st.desk.controls.x},${st.desk.controls.y}): brak wolnego miejsca na grupę przycisków`);
  else if (st.desk && !controlAnchor(st)) warnings.push('Pulpit nie ma wolnego miejsca na grupę przycisków');
  // Sygnalizatory muszą wskazywać kostkę torową
  for (const t of st.tiles) {
    if (t.type === 'signal') {
      const at = occupied.get(`${t.at?.x},${t.at?.y}`);
      if (!at || getTileDef(at.type).category !== 'track') errors.push(`Sygnalizator ${t.id}: 'at' nie wskazuje kostki torowej`);
    }
  }
  for (const [id, s] of Object.entries(st.sections || {})) {
    if (s.mainKind != null && s.mainKind !== 'dodatkowy') errors.push(`Odcinek ${id}: nieznany rodzaj toru głównego '${s.mainKind}' (dodatkowy)`);
  }
  for (const [id, e] of Object.entries(st.exits || {})) {
    if (e.block && !['eap', 'sbl'].includes(e.block)) errors.push(`Wyjazd ${id}: nieznany rodzaj blokady '${e.block}' (eap | sbl)`);
    if (e.block === 'sbl' && !e.direction) errors.push(`Wyjazd ${id}: blokada samoczynna (sbl) wymaga stałego kierunku (direction: 'in' | 'out')`);
    const t = occupied.get(`${e.tile?.x},${e.tile?.y}`);
    if (!t || getTileDef(t.type).category !== 'track') errors.push(`Wyjazd ${id}: kostka nie jest torowa`);
    if (!isDir(e.dir)) errors.push(`Wyjazd ${id}: zły kierunek`);
    if (!e.name) warnings.push(`Wyjazd ${id}: brak nazwy posterunku sąsiedniego`);
  }
  const tracks = trackLengths(st);
  if (!Array.isArray(st.timetable)) warnings.push('Brak rozkładu jazdy');
  else st.timetable.forEach((tr, i) => {
    if (tr.nr == null) errors.push(`Rozkład #${i}: brak numeru pociągu`);
    if (tr.from && !(st.exits || {})[tr.from]) errors.push(`Rozkład ${tr.nr}: nieznany wyjazd from='${tr.from}'`);
    if (tr.to && !(st.exits || {})[tr.to]) errors.push(`Rozkład ${tr.nr}: nieznany wyjazd to='${tr.to}'`);
    const exF = (st.exits || {})[tr.from], exT = (st.exits || {})[tr.to];
    // Eap jednokierunkowa nie pozwala jechać pod prąd; na SBL jazda po torze lewym po Zk jest możliwa, ale rozkład
    // nie powinien jej wymagać (ruch prawostronny)
    if (exF && exF.direction === 'out') errors.push(`Rozkład ${tr.nr}: wjazd od ${exF.name} torem wyjazdowym '${tr.from}' (direction: 'out')`);
    if (exT && exT.direction === 'in') errors.push(`Rozkład ${tr.nr}: wyjazd do ${exT.name} torem wjazdowym '${tr.to}' (direction: 'in')`);
    if (!tr.arr && !tr.dep) errors.push(`Rozkład ${tr.nr}: brak czasu przyjazdu/odjazdu`);
    validateConsist(tr, tracks, errors, warnings);
    validateStock(tr, st.timetable, errors);
  });
  return { errors, warnings };
}

/**
 * Przypięty tabor (`stock`): typ albo niepusta lista typów z katalogu `ROLLING_STOCK`; pociąg towarowy i luzem – tylko
 * pojazdy o trakcji pociągu (`traction`, domyślnie E); pociągi jednego składu (łańcuch `unit`) – ten sam tabor.
 */
function validateStock(tr, timetable, errors) {
  if (tr.stock == null) return;
  const where = `Rozkład ${tr.nr}`;
  const ids = pinnedTypes(tr.stock);
  if (!ids.length || ids.some((id) => typeof id !== 'string')) { errors.push(`${where}: tabor (stock) to typ albo niepusta lista typów`); return; }
  const unknown = ids.filter((id) => !Object.hasOwn(ROLLING_STOCK, id));
  if (unknown.length) { errors.push(`${where}: nieznany typ taboru ${unknown.join(', ')} (stock)`); return; }
  const key = categoryKey(tr.cat) ?? categoryOf(tr);
  if (CATEGORIES[key]?.tractions) {
    const traction = tr.traction ?? 'E';
    for (const id of ids) {
      const k = STOCK_KINDS[ROLLING_STOCK[id].kind].traction;
      if (k !== traction) errors.push(`${where}: tabor ${id} (trakcja ${k}) niezgodny z trakcją pociągu ${traction}`);
    }
  }
  const same = JSON.stringify(ids);
  const other = chainOf(tr, timetable).find((x) => x !== tr && x.stock != null && JSON.stringify(pinnedTypes(x.stock)) !== same);
  if (other) errors.push(`${where}: tabor (stock) inny niż w pociągu ${other.nr} tego samego składu (unit)`);
}

/** Długości torów stacyjnych: numer toru → suma długości odcinków z tym numerem (`track`). */
function trackLengths(st) {
  const out = new Map();
  for (const s of Object.values(st.sections || {})) {
    if (s.track == null || !(s.length > 0)) continue;
    const k = String(s.track);
    out.set(k, (out.get(k) ?? 0) + s.length);
  }
  return out;
}

/**
 * Kategoria, trakcja, długość i masa wpisu rozkładu. Rodzaje i trakcje – PKP PLK, Regulamin sieci, zał. 6.3; masa
 * brutto bez czynnej lokomotywy (zał. 6.3 pole E02; Ir-1 §19 ust. 1 pkt 1) nie większa niż nacisk liniowy 71 kN/m
 * razy długość; pociąg nie dłuższy niż tor stacyjny, którym jedzie (Ir-1 §19 ust. 4 – ostrzeżenie).
 */
function validateConsist(tr, tracks, errors, warnings) {
  const where = `Rozkład ${tr.nr}`;
  if (tr.cat != null && !categoryKey(tr.cat)) { errors.push(`${where}: nieznana kategoria cat='${tr.cat}'`); return; }
  const key = categoryOf(tr);
  const cat = CATEGORIES[key];
  if (tr.traction != null && !(cat.tractions || []).includes(tr.traction)) {
    errors.push(`${where}: trakcja '${tr.traction}' niedozwolona dla ${cat.code ?? key}${cat.tractions ? ` (dozwolone: ${cat.tractions.join('/')})` : ' (trakcję podaje się tylko dla pociągów towarowych i lokomotyw luzem)'}`);
  }
  if (tr.length != null && !(typeof tr.length === 'number' && tr.length > 0)) errors.push(`${where}: długość pociągu musi być liczbą dodatnią (m)`);
  if (tr.mass != null) {
    if (!(typeof tr.mass === 'number' && tr.mass > 0)) errors.push(`${where}: masa pociągu musi być liczbą dodatnią (t)`);
    else if (tr.kind !== 'tow' || !cat.refMass) errors.push(`${where}: masa (mass) tylko dla pociągu towarowego ze składem wagonów, nie dla ${cat.code ?? key}`);
    else if (tr.mass > MAX_TONNES_PER_METRE * (tr.length ?? 100)) errors.push(`${where}: masa ${tr.mass} t większa niż ${MAX_TONNES_PER_METRE} t/m (nacisk liniowy 71 kN/m) razy długość ${tr.length ?? 100} m`);
  }
  const len = tr.track != null ? tracks.get(String(tr.track)) : null;
  if (len != null && (tr.length ?? 100) > len) warnings.push(`${where}: pociąg ${tr.length ?? 100} m dłuższy niż tor ${tr.track} (${len} m)`);
}
