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

/** Skala trudności 1–5: pięć płaskich segmentów i liczba, bez gwiazdek. `label` – słowo przed liczbą (np. „trudność”). */
export function difficultyMark(d, label = '') {
  const n = Math.max(0, Math.min(5, Number(d) || 0));
  const segs = Array.from({ length: 5 }, (_, i) => `<i${i < n ? ' class="on"' : ''}></i>`).join('');
  const text = `${label ? `${label} ` : ''}${n}/5`;
  return `<span class="st-diff" title="${t('start.difficulty')} ${n}/5" aria-label="${t('start.difficulty')} ${n}/5">${segs}<b>${text}</b></span>`;
}
