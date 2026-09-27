/**
 * Ikony SVG zakładki „Pociągi” (tekst SVG, bez DOM – testowane w Node).
 * - `modeIcon(mode)`: czoło pojazdu od przodu z lampami. Jazda pociągowa: sygnał Pc1 – trzy białe światła
 *   (dwa dolne i jedno górne); jazda manewrowa: jedno białe światło (jak na lokomotywie manewrowej wg Ie-1).
 * - `frontIcon(direction)`: sylwetka lokomotywy z boku, zwrócona w stronę jazdy (czoło składu) – `data-dir` E lub W.
 */
export function modeIcon(mode) {
  const lit = mode === 'shunt' ? [false, false, true] : [true, true, true]; // [dolne lewe, dolne prawe, górne]
  const lamp = (cx, cy, on) => `<circle cx="${cx}" cy="${cy}" r="2" class="lamp ${on ? 'on' : 'off'}"/>`;
  return `<svg class="ic ic-mode" viewBox="0 0 20 18" width="24" height="22" aria-hidden="true" data-mode="${mode === 'shunt' ? 'shunt' : 'train'}">
    <path d="M4 3.5h12a2 2 0 0 1 2 2v9.5H2V5.5a2 2 0 0 1 2-2z" class="body"/>
    <rect x="5" y="5.5" width="10" height="3.5" rx="0.8" class="glass"/>
    ${lamp(5.5, 12.5, lit[0])}${lamp(14.5, 12.5, lit[1])}${lamp(10, 1.9, lit[2])}
    <path d="M1 16.5h18" class="body"/>
  </svg>`;
}

export function frontIcon(direction) {
  const east = ['E', 'NE', 'SE'].includes(direction);
  const flip = east ? '' : ' transform="translate(26 0) scale(-1 1)"';
  return `<svg class="ic ic-front" viewBox="0 0 26 14" width="30" height="16" aria-hidden="true" data-dir="${east ? 'E' : 'W'}">
    <g${flip}>
      <path d="M1 11.5V5.5h9l3-3h4v9z" class="body"/>
      <rect x="11" y="4" width="4.5" height="3" rx="0.6" class="glass"/>
      <circle cx="4" cy="12" r="1.3" class="wheel"/><circle cx="9" cy="12" r="1.3" class="wheel"/><circle cx="14" cy="12" r="1.3" class="wheel"/>
      <path d="M19 8.5h6M22.5 5.5l3 3-3 3" class="arrow"/>
    </g>
  </svg>`;
}
