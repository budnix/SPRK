/**
 * Warstwa UI strategii srk: dla każdego rodzaju stanowiska (`view` w rejestrze) – fabryka widoku,
 * rozmiar obrazu, podpowiedzi i fragment instrukcji. Rejestr (registry.js) nie zna DOM, więc
 * widoki są tu, a nie tam.
 */
import { DeskRenderer } from '../render/DeskRenderer.js';
import { ScreenRenderer } from '../render/ScreenRenderer.js';
import { getSrk } from './registry.js';
import { t } from '../i18n/index.js';

const VIEWS = {
  desk: {
    create: (container, sim, handlers, opts) => new DeskRenderer(container, sim, handlers, opts),
    size: (cols, rows) => ({ w: cols * 40 + 44, h: rows * 40 + 44 }),
    hint: () => t('hint.desk'),
    armHint: {
      point: (a) => t('arm.point', { id: a.id }),
      derailer: (a) => t('arm.derailer', { id: a.id }),
      signal: (a) => t('arm.signal', { kind: t(a.color === 'white' ? 'arm.signal.shunt' : 'arm.signal.train'), id: a.id }),
      group: (a) => (['group-point', 'point-lock', 'route-release', 'emergency-release', 'substitute'].includes(a.role) ? t(`arm.${a.role}`) : t('arm.other', { id: a.id })),
    },
    help: () => t('help.desk'),
  },
  screen: {
    create: (container, sim, handlers, opts) => new ScreenRenderer(container, sim, handlers, opts),
    size: (cols, rows, o = {}) => ({ w: cols * 40 + 24, h: rows * 40 * (Number(o.rowScale) || 1) + 24 }),
    hint: () => t('hint.screen'),
    armHint: {
      point: () => '',
      derailer: () => '',
      signal: (a) => t('arm.screenSignal', { kind: t(a.color === 'white' ? 'arm.screenSignal.shunt' : 'arm.screenSignal.train'), id: a.id }),
      group: () => '',
    },
    help: () => t('help.screen'),
  },
};

function viewOf(srk) {
  return VIEWS[srk?.view] || VIEWS.desk;
}

/** Tworzy widok stanowiska dla strategii (pulpit kostkowy lub monitor). */
export function createView(srk, container, sim, handlers, opts = {}) {
  return viewOf(srk).create(container, sim, handlers, opts);
}

export function viewSize(srk, cols, rows, o = {}) {
  return viewOf(srk).size(cols, rows, o);
}

export function viewHint(srk) {
  return viewOf(srk).hint();
}

export function armHint(srk, a) {
  return viewOf(srk).armHint[a.kind]?.(a) ?? '';
}

export function viewHelp(srk) {
  return viewOf(srk).help();
}

/** Lista strategii do menu ustawień. */
export { getSrk };
