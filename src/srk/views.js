/**
 * Warstwa UI strategii srk: rejestr widoków stanowisk. Dla każdego rodzaju stanowiska (`view` w rejestrze srk) –
 * klasa widoku (rozszerza `PanelView`), podpowiedzi i fragment instrukcji. Rejestr srk (registry.js) nie zna DOM,
 * więc widoki są tu, a nie tam. Nowy panel: `registerView('<rodzaj>', { View, hint, armHint, help })`.
 */
import { DeskRenderer } from '../render/DeskRenderer.js';
import { ScreenRenderer } from '../render/ScreenRenderer.js';
import { getSrk } from './registry.js';
import { t } from '../i18n/index.js';

const VIEWS = new Map();
const DEFAULT_VIEW = 'desk';

/**
 * @param id rodzaj stanowiska (`view` strategii srk)
 * @param def { View – klasa widoku, hint() – podpowiedź obsługi, armHint – { kind: (armed) => tekst },
 *              help() – HTML instrukcji stanowiska }
 */
export function registerView(id, def) {
  if (!id || typeof def?.View !== 'function') throw new Error('Widok stanowiska wymaga id i klasy View');
  VIEWS.set(id, { hint: () => '', armHint: {}, help: () => '', ...def });
  return def;
}

export function hasView(id) {
  return VIEWS.has(id);
}

registerView('desk', {
  View: DeskRenderer,
  hint: () => t('hint.desk'),
  armHint: {
    point: (a) => t('arm.point', { id: a.id }),
    derailer: (a) => t('arm.derailer', { id: a.id }),
    signal: (a) => t('arm.signal', { kind: t(a.color === 'white' ? 'arm.signal.shunt' : 'arm.signal.train'), id: a.id }),
    group: (a) => (['group-point', 'point-lock', 'route-release', 'emergency-release', 'substitute'].includes(a.role) ? t(`arm.${a.role}`) : t('arm.other', { id: a.id })),
  },
  help: () => t('help.desk'),
});

registerView('screen', {
  View: ScreenRenderer,
  hint: () => t('hint.screen'),
  armHint: {
    signal: (a) => t('arm.screenSignal', { kind: t(a.color === 'white' ? 'arm.screenSignal.shunt' : 'arm.screenSignal.train'), id: a.id }),
  },
  help: () => t('help.screen'),
});

function viewOf(srk) {
  return VIEWS.get(srk?.view) || VIEWS.get(DEFAULT_VIEW);
}

/** Tworzy widok stanowiska dla strategii (pulpit kostkowy, monitor, …). */
export function createView(srk, container, sim, handlers, opts = {}) {
  const { View } = viewOf(srk);
  return new View(container, sim, handlers, opts);
}

export function viewSize(srk, cols, rows, o = {}) {
  return viewOf(srk).View.size(cols, rows, o);
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
