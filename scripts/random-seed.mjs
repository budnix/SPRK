/**
 * Powtarzalne „losowe” ziarna do szukania testów przypadkowych (`scripts/seed-scan.mjs`). Moduł ładowany przed testem
 * (`node --import ./scripts/random-seed.mjs …`): gdy jest zmienna `SPRK_RAND=<n>`, `Math.random` zwraca liczby
 * z generatora o tym ziarnie – zmiana tworzona bez `seed` (`Simulation`: ziarno z `Math.random`) dostaje wtedy ziarno
 * powtarzalne, inne dla każdego `n`. Bez zmiennej moduł niczego nie zmienia.
 *
 * `SPRK_RAND_LOG=<plik>` – przy pierwszym losowaniu dopisuje ścieżkę uruchomionego pliku (które testy losują ziarno).
 */
import { appendFileSync } from 'node:fs';

/** Generator mulberry32 o ziarnie `seed`: funkcja zwracająca kolejne liczby z przedziału [0, 1). */
export function seededRandom(seed) {
  let a = Math.imul(Number(seed) | 0, 0x9e3779b1) >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const n = Number(process.env.SPRK_RAND || 0);
if (n) {
  const next = seededRandom(n);
  let logged = false;
  Math.random = () => {
    if (!logged && process.env.SPRK_RAND_LOG) { logged = true; appendFileSync(process.env.SPRK_RAND_LOG, `${process.argv[1]}\n`); }
    return next();
  };
}
