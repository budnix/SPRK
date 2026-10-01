/**
 * Regiony na mapie wyboru posterunku: 16 województw (identyfikator – nazwa polska, jak w TERYT) i granice Polski
 * do sprawdzenia współrzędnych stacji (`geo`). Kształty województw są w `src/ui/map/poland.js` (dane generowane).
 */
export const REGIONS = {
  dolnoslaskie: 'dolnośląskie',
  'kujawsko-pomorskie': 'kujawsko-pomorskie',
  lubelskie: 'lubelskie',
  lubuskie: 'lubuskie',
  lodzkie: 'łódzkie',
  malopolskie: 'małopolskie',
  mazowieckie: 'mazowieckie',
  opolskie: 'opolskie',
  podkarpackie: 'podkarpackie',
  podlaskie: 'podlaskie',
  pomorskie: 'pomorskie',
  slaskie: 'śląskie',
  swietokrzyskie: 'świętokrzyskie',
  'warminsko-mazurskie': 'warmińsko-mazurskie',
  wielkopolskie: 'wielkopolskie',
  zachodniopomorskie: 'zachodniopomorskie',
};

/** Prostokąt obejmujący Polskę (stopnie, z zapasem): szerokość 49,0–54,9° N, długość 14,1–24,2° E. */
export const POLAND_BOUNDS = { latMin: 49.0, latMax: 54.9, lonMin: 14.1, lonMax: 24.2 };

export function isRegion(id) {
  return Object.hasOwn(REGIONS, id);
}

/** Czy `geo` to [szerokość, długość] w granicach Polski. */
export function inPoland(geo) {
  if (!Array.isArray(geo) || geo.length !== 2 || !geo.every(Number.isFinite)) return false;
  const [lat, lon] = geo, b = POLAND_BOUNDS;
  return lat >= b.latMin && lat <= b.latMax && lon >= b.lonMin && lon <= b.lonMax;
}
