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
  return `<svg class="ic ic-mode" viewBox="0 1.5 22 19.5" width="20" height="18" aria-hidden="true" data-mode="${shunt ? 'shunt' : 'train'}">
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
  return `<svg class="ic ic-front" viewBox="0 2 36 16" width="40" height="18" aria-hidden="true" data-dir="${east ? 'E' : 'W'}">
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

/**
 * Ikony interfejsu (tekst SVG, bez DOM): jedna siatka 16×16 i jedna grubość kreski, kolor z tekstu przycisku
 * (`currentColor`). Zastępują znaki tekstowe, które każdy system rysuje inaczej.
 * `pause`, `play`, `menu`, `close` – przyciski; `check`, `cross`, `wait`, `todo` – stan zadania / polecenia.
 */
const UI_ICONS = {
  pause: '<rect x="3.5" y="2.5" width="3" height="11" rx="0.8" class="solid"/><rect x="9.5" y="2.5" width="3" height="11" rx="0.8" class="solid"/>',
  play: '<path d="M4.5 2.6v10.8c0 .5.5.8.9.5l8-5.4c.4-.2.4-.8 0-1l-8-5.4c-.4-.3-.9 0-.9.5z" class="solid"/>',
  menu: '<path d="M2.5 4h11M2.5 8h11M2.5 12h11"/>',
  close: '<path d="M3.5 3.5l9 9M12.5 3.5l-9 9"/>',
  check: '<path d="M2.8 8.6l3.4 3.4 7-7.6"/>',
  cross: '<path d="M4 4l8 8M12 4l-8 8"/>',
  wait: '<circle cx="8" cy="8" r="5.2" stroke-dasharray="2.2 2.2"/>',
  todo: '<rect x="3" y="3" width="10" height="10" rx="1.5"/>',
};

export function uiIcon(name, size = 16) {
  const body = UI_ICONS[name];
  if (!body) throw new Error(`Nieznana ikona: ${name}`);
  return `<svg class="ui-ic" data-icon="${name}" viewBox="0 0 16 16" width="${size}" height="${size}" aria-hidden="true">${body}</svg>`;
}

export function uiIconNames() {
  return Object.keys(UI_ICONS);
}
