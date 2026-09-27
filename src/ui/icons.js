/**
 * Ikony SVG zakładki „Pociągi” (tekst SVG, bez DOM – testowane w Node). Piktogramy liniowe wzorowane na EU07:
 * pudło o lekko ściętych czołach, pantograf, dwa wózki; z przodu szeroka szyba, zderzaki i lampy.
 * - `modeIcon(mode)`: czoło od przodu z lampami. Jazda pociągowa: sygnał Pc1 (Ie-1) – trzy białe światła w trójkąt
 *   (dwa dolne przy zderzakach i górne pod dachem). Jazda manewrowa: sygnał Tb1 – jedno białe światło u dołu od strony
 *   zajętego stanowiska maszynisty, czyli patrząc na czoło – z lewej.
 * - `frontIcon(direction)`: lokomotywa z boku ze strzałką w stronę jazdy (czoło składu) – `data-dir` E lub W.
 */
export function modeIcon(mode) {
  const shunt = mode === 'shunt';
  const lit = shunt ? [true, false, false] : [true, true, true]; // [dolne lewe, dolne prawe, górne]
  const lamp = (cx, cy, on) => `<circle cx="${cx}" cy="${cy}" r="1.4" class="lamp ${on ? 'on' : 'off'}"/>`;
  return `<svg class="ic ic-mode" viewBox="0 0 22 22" width="24" height="24" aria-hidden="true" data-mode="${shunt ? 'shunt' : 'train'}">
    <path d="M8.5 2.5h5" class="body"/>
    <path d="M4 18V6.6c0-1.2.8-2.1 2-2.3C7.6 4.1 9.3 4 11 4s3.4.1 5 .3c1.2.2 2 1.1 2 2.3V18z" class="body"/>
    <path d="M6.2 8.3h9.6v4.2H6.2z" class="glass"/>
    <path d="M2.5 18h17M3 20.5h3M16 20.5h3" class="body"/>
    ${lamp(6.4, 15.6, lit[0])}${lamp(15.6, 15.6, lit[1])}${lamp(11, 6.2, lit[2])}
  </svg>`;
}

export function frontIcon(direction) {
  const east = ['E', 'NE', 'SE'].includes(direction);
  const flip = east ? '' : ' transform="translate(36 0) scale(-1 1)"';
  return `<svg class="ic ic-front" viewBox="0 0 36 18" width="36" height="18" aria-hidden="true" data-dir="${east ? 'E' : 'W'}">
    <g${flip}>
      <path d="M12 5.2l2.5-2.2h4l2.5 2.2" class="body"/>
      <path d="M3 13.5V7.8c0-.6.3-1.1.8-1.4L5.5 5.2h17l1.7 1.2c.5.3.8.8.8 1.4v5.7z" class="body"/>
      <path d="M5.5 7.2h2.8M19.7 7.2h2.8M9.5 9.5h9" class="glass"/>
      <path d="M1.3 10.5H3M25 10.5h1.7" class="body"/>
      <circle cx="6.5" cy="15" r="1.3" class="wheel"/><circle cx="10.5" cy="15" r="1.3" class="wheel"/><circle cx="17.5" cy="15" r="1.3" class="wheel"/><circle cx="21.5" cy="15" r="1.3" class="wheel"/>
      <path d="M29 9h5.5M31.8 6.5l2.7 2.5-2.7 2.5" class="arrow"/>
    </g>
  </svg>`;
}
