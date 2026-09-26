const NS = 'http://www.w3.org/2000/svg';

/** Tworzy element SVG z atrybutami i dziećmi. */
export function el(tag, attrs = {}, children = []) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null) continue;
    if (k === 'text') e.textContent = v;
    else e.setAttribute(k, String(v));
  }
  for (const c of children) if (c) e.appendChild(c);
  return e;
}

export function text(x, y, str, attrs = {}) {
  return el('text', { x, y, 'text-anchor': 'middle', 'dominant-baseline': 'middle', ...attrs, text: str });
}

export const CELL = 40;
