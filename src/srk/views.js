/**
 * Warstwa UI strategii srk: rejestr widoków stanowisk. Dla każdego rodzaju stanowiska (`view` w rejestrze srk) –
 * klasa widoku (rozszerza `PanelView`), podpowiedzi i fragment instrukcji. Rejestr srk (registry.js) nie zna DOM,
 * więc widoki są tu, a nie tam. Nowy panel: `registerView('<rodzaj>', { View, hint, armHint, help })`.
 */
import { DeskRenderer } from '../render/DeskRenderer.js';
import { ScreenRenderer } from '../render/ScreenRenderer.js';
import { IzhRenderer } from '../render/IzhRenderer.js';
import { LeverRenderer } from '../render/LeverRenderer.js';
import { EbiRenderer } from '../render/EbiRenderer.js';
import { MorRenderer } from '../render/MorRenderer.js';
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

/** Pulpit IZH-111: podpowiedź zależy od tego, ile adresów wybrano (jeden element albo początek i koniec przebiegu). */
const izhHint = (a) => (a.selection?.length === 2
  ? t('arm.izh.route', { from: a.selection[0].id, to: a.selection[1].id })
  : t(`arm.izh.${a.kind}`, { id: a.id }));

registerView('izh', {
  View: IzhRenderer,
  hint: () => t('hint.izh'),
  armHint: { signal: izhHint, end: izhHint, point: izhHint, derailer: izhHint },
  help: () => t('help.izh'),
});

/** Nastawnia mechaniczna: dźwignie i drążki wydają polecenia wprost – bez uzbrajania przycisków. */
registerView('lever', {
  View: LeverRenderer,
  hint: () => t('hint.lever'),
  help: () => t('help.lever'),
});

/** EBILock 950: podpowiedź zależy od wyboru – początek przebiegu, cały przebieg, elementy pośrednie albo obiekt. */
function ebiHint(a) {
  const path = (a.selection || []).map((r) => r.id).join(' → ');
  if (a.role !== 'route') return t('arm.ebi.object', { id: a.id });
  if (a.candidates?.length) return t('arm.ebi.via', { path });
  return a.selection.length > 1 ? t('arm.ebi.route', { path }) : t('arm.ebi.start', { id: a.id });
}

registerView('ebi', {
  View: EbiRenderer,
  hint: () => t('hint.ebi'),
  armHint: { signal: ebiHint, end: ebiHint, point: ebiHint, derailer: ebiHint, section: ebiHint, station: ebiHint },
  help: () => t('help.ebi'),
});

/** MOR-3: podpowiedź – wybrany obiekt (menu), cel przebiegu (Pociąg / Manewr) albo polecenie czekające na potwierdzenie. */
function morHint(a) {
  if (a.pending) return t('arm.mor.pending', { cmd: a.pending.text });
  if (a.role === 'route') return t('arm.mor.route', { path: a.selection.map((r) => r.id).join(' → ') });
  return t('arm.mor.object', { id: a.id });
}

registerView('mor', {
  View: MorRenderer,
  hint: () => t('hint.mor'),
  armHint: { signal: morHint, end: morHint, point: morHint, derailer: morHint, section: morHint },
  help: () => t('help.mor'),
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
