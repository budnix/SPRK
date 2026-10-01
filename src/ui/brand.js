/**
 * Elementy marki ekranów pełnych (start, raport, ustawienia): logo SPRK jako SVG i płaska skala trudności.
 * Logo: cztery kostki pulpitu z literami S P R K, przez które biegnie tor, zakończony semaforem wskazującym
 * „wolna droga”. Kolory z motywu (`--sc-*`), żeby logo dziedziczyło paletę ekranu.
 */
import { t } from '../i18n/index.js';

export function logoSvg(height = 46) {
  const tiles = ['S', 'P', 'R', 'K'].map((ch, i) => {
    const x = i * 42;
    return `<rect x="${x + 0.5}" y="0.5" width="40" height="40" rx="1.5" class="lg-tile"/>
      <text x="${x + 20.5}" y="26" class="lg-ch">${ch}</text>`;
  }).join('');
  return `<svg class="st-logo-svg" viewBox="0 0 208 42" height="${height}" role="img" aria-label="SPRK">
    ${tiles}
    <path d="M2 34H190" class="lg-track"/>
    <path d="M186 34V25" class="lg-mast"/>
    <path d="M181 36H191" class="lg-mast"/>
    <rect x="178.5" y="1.5" width="15" height="23" rx="2" class="lg-head"/>
    <circle cx="186" cy="8" r="3.6" class="lg-lens on"/>
    <circle cx="186" cy="18" r="3.6" class="lg-lens"/>
  </svg>`;
}

/**
 * Semafor świetlny (komora z trzema światłami na maszcie, jak w logo) – znak „stój / wolna droga” na ekranie startowym.
 * Świeci światło z klasą `on`; `aspect` 'stop' – czerwone, 'go' – zielone. Ekran może przełączać światła samym CSS
 * (klasy `.sg-g`, `.sg-r`), bez przerysowania.
 */
export function signalSvg(aspect = 'stop', height = 64) {
  const lens = (cy, cls) => `<circle cx="12" cy="${cy}" r="4.6" class="sg-lens ${cls}${(aspect === 'go' && cls === 'sg-g') || (aspect === 'stop' && cls === 'sg-r') ? ' on' : ''}"/>`;
  return `<svg class="sg-svg" viewBox="0 0 24 64" height="${height}" aria-hidden="true">
    <path d="M12 38V60M5 61H19" class="sg-mast"/>
    <rect x="3" y="1.5" width="18" height="37" rx="3" class="sg-head"/>
    ${lens(9.5, 'sg-g')}${lens(20, 'sg-y')}${lens(30.5, 'sg-r')}
  </svg>`;
}

/** Skala trudności 1–5: pięć lampek (zapalone – stopień trudności) i liczba, bez gwiazdek. `label` – słowo przed liczbą (np. „trudność”). */
export function difficultyMark(d, label = '') {
  const n = Math.max(0, Math.min(5, Number(d) || 0));
  const segs = Array.from({ length: 5 }, (_, i) => `<i${i < n ? ' class="on"' : ''}></i>`).join('');
  const text = `${label ? `${label} ` : ''}${n}/5`;
  return `<span class="st-diff" title="${t('start.difficulty')} ${n}/5" aria-label="${t('start.difficulty')} ${n}/5">${segs}<b>${text}</b></span>`;
}
