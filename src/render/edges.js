/**
 * Stałe pola skrajne pulpitu (bez DOM). Gdy pulpit po powiększeniu jest szerszy niż okno przewijania, skrajne kolumny
 * z blokadą liniową (strzałki szlaku, Ko/Poz/Wbl, liczniki) zostają przypięte po lewej i prawej stronie okna,
 * a środek pulpitu przewija się między nimi – jak stałe pola z blokadą przy krawędziach monitorów w komputerowych srk.
 *
 * @param viewBox   [x, y, w, h] pulpitu w jednostkach rysunku (aktualny ekran / całość)
 * @param deskPx    { w, h } – rozmiar pulpitu po powiększeniu (px)
 * @param clientPx  { w, h } – okno przewijania (px)
 * @param edgeUnits szerokość jednego pola w jednostkach rysunku (kolumny × kostka + margines)
 * @returns { active, scale, left: { viewBox, w, h }, right: { viewBox, w, h } } – `active` tylko gdy pulpit nie mieści
 *          się na szerokość i po odjęciu obu pól zostaje jeszcze miejsce na środek (≥ 40 % okna)
 */
export function edgeLayout({ viewBox, deskPx, clientPx, edgeUnits }) {
  const [x, y, w, h] = viewBox;
  const scale = w > 0 ? deskPx.w / w : 1;
  const edgePx = edgeUnits * scale;
  const active = deskPx.w > clientPx.w + 1 && w > 3 * edgeUnits && 2 * edgePx <= clientPx.w * 0.6;
  const box = (vx) => ({ viewBox: [vx, y, edgeUnits, h], w: Math.round(edgePx), h: Math.round(deskPx.h) });
  return { active, scale, left: box(x), right: box(x + w - edgeUnits) };
}
