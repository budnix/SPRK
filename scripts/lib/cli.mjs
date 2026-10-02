import { isMainThread } from 'node:worker_threads';
import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Wspólne opcje wiersza poleceń narzędzi, które grają zmiany: `parseCli` (`--level`, `--seeds`, `--extra`,
 * `--workers`, `--json`, `--tutorial`, `--help`), `parseSeeds`, `executedDirectly` (czy moduł uruchomiono wprost).
 */

/** Ziarna losowania z wiersza poleceń: „1-4”, „1,2,3”, „2-3,7” (od 1, bez powtórzeń); przy błędzie wyjątek. */
export function parseSeeds(text) {
  const out = [];
  for (const part of String(text).split(',')) {
    const p = part.trim();
    const m = /^(\d+)(?:-(\d+))?$/.exec(p);
    if (!m) throw new Error(`Niepoprawne ziarna: „${text}” (przykłady: 1-4, 1,2,3)`);
    const a = Number(m[1]);
    const b = m[2] != null ? Number(m[2]) : a;
    if (b < a) throw new Error(`Niepoprawny zakres ziaren: „${p}”`);
    // `Random` zamienia ziarno 0 na 1 – ziarno 0 powtórzyłoby zmianę z ziarnem 1
    if (a < 1) throw new Error(`Niepoprawne ziarna: „${p}” (ziarna od 1)`);
    for (let s = a; s <= b; s++) if (!out.includes(s)) out.push(s);
  }
  return out;
}

/** Czy moduł `metaUrl` (`import.meta.url`) uruchomiono wprost (`node plik.mjs`), a nie zaimportowano / w wątku. */
export function executedDirectly(metaUrl) {
  if (!isMainThread || !process.argv[1]) return false;
  try { return realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(metaUrl)); } catch { return false; }
}

/**
 * Wiersz poleceń narzędzi zmian (`argv` bez `node` i nazwy skryptu); `--opcja wartość` i `--opcja=wartość`. Wspólne:
 * `--level` (`levels.allowed`, `all` = `levels.all`), `--seeds`, `--extra`, `--workers`, `--json`, `--tutorial`,
 * `--help` / `-h`. `custom(name, { value, flag })` – opcje własne narzędzia (zwraca true, gdy obsłużyła);
 * `positional(raw)` – argument bez „-” (bez niej to nieznana opcja). Wynik w `opts` (wartości domyślne); przy błędzie
 * wyjątek z komunikatem.
 */
export function parseCli(argv, opts, { levels, custom = null, positional = null }) {
  const args = [...argv];
  while (args.length) {
    const raw = args.shift();
    if (positional && !raw.startsWith('-')) { positional(raw); continue; }
    const eq = raw.startsWith('--') ? raw.indexOf('=') : -1;
    const name = eq > 0 ? raw.slice(0, eq) : raw;
    const value = () => {
      if (eq > 0) return raw.slice(eq + 1);
      if (!args.length || args[0].startsWith('--')) throw new Error(`Opcja ${name} wymaga wartości`);
      return args.shift();
    };
    const flag = () => { if (eq > 0) throw new Error(`Opcja ${name} nie przyjmuje wartości`); return true; };
    switch (name) {
      case '--level': {
        const v = value();
        if (v === 'all') opts.levels = [...levels.all];
        else if (levels.allowed.includes(v)) opts.levels = [v];
        else throw new Error(`Nieznany poziom zakłóceń: „${v}” (${[...levels.allowed, 'all'].join(', ')})`);
        break;
      }
      case '--seeds': opts.seeds = parseSeeds(value()); break;
      case '--extra': {
        const v = value();
        const n = Number(v);
        if (v.trim() === '' || !Number.isFinite(n) || n < 0) throw new Error(`Niepoprawna wartość --extra: „${v}” (minuty, ≥ 0)`);
        opts.extra = n;
        break;
      }
      case '--workers': {
        const v = value();
        const n = Number(v);
        if (!Number.isInteger(n) || n < 1) throw new Error(`Niepoprawna liczba wątków: „${v}” (liczba całkowita ≥ 1)`);
        opts.workers = n;
        break;
      }
      case '--json': opts.json = value(); break;
      case '--tutorial': opts.tutorial = flag(); break;
      case '--help': case '-h': opts.help = true; break;
      default:
        if (!custom?.(name, { value, flag })) throw new Error(`Nieznana opcja: ${raw}`);
    }
  }
  return opts;
}
