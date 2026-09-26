import { hasTileDef, getTileDef } from '../tiles/registry.js';
import { isDir } from '../tiles/directions.js';
import { hasSrk } from '../srk/registry.js';

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
  // Sygnalizatory muszą wskazywać kostkę torową
  for (const t of st.tiles) {
    if (t.type === 'signal') {
      const at = occupied.get(`${t.at?.x},${t.at?.y}`);
      if (!at || getTileDef(at.type).category !== 'track') errors.push(`Sygnalizator ${t.id}: 'at' nie wskazuje kostki torowej`);
    }
    if (t.type === 'block' && !(st.exits || {})[t.exit]) errors.push(`Pole blokady (${t.x},${t.y}): nieznany wyjazd '${t.exit}'`);
  }
  for (const [id, e] of Object.entries(st.exits || {})) {
    if (e.block && !['eap', 'sbl'].includes(e.block)) errors.push(`Wyjazd ${id}: nieznany rodzaj blokady '${e.block}' (eap | sbl)`);
    if (e.block === 'sbl' && !e.direction) errors.push(`Wyjazd ${id}: blokada samoczynna (sbl) wymaga stałego kierunku (direction: 'in' | 'out')`);
    const t = occupied.get(`${e.tile?.x},${e.tile?.y}`);
    if (!t || getTileDef(t.type).category !== 'track') errors.push(`Wyjazd ${id}: kostka nie jest torowa`);
    if (!isDir(e.dir)) errors.push(`Wyjazd ${id}: zły kierunek`);
    if (!e.name) warnings.push(`Wyjazd ${id}: brak nazwy posterunku sąsiedniego`);
  }
  if (!Array.isArray(st.timetable)) warnings.push('Brak rozkładu jazdy');
  else st.timetable.forEach((tr, i) => {
    if (tr.nr == null) errors.push(`Rozkład #${i}: brak numeru pociągu`);
    if (tr.from && !(st.exits || {})[tr.from]) errors.push(`Rozkład ${tr.nr}: nieznany wyjazd from='${tr.from}'`);
    if (tr.to && !(st.exits || {})[tr.to]) errors.push(`Rozkład ${tr.nr}: nieznany wyjazd to='${tr.to}'`);
    if (!tr.arr && !tr.dep) errors.push(`Rozkład ${tr.nr}: brak czasu przyjazdu/odjazdu`);
  });
  return { errors, warnings };
}
