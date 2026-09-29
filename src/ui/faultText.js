import { t } from '../i18n/index.js';

/**
 * Opisy usterek dla panelu (bez DOM): alarm w dzienniku i wpis na liście w zakładce Urządzenia. Każdy rodzaj usterki
 * z `FAULT_TYPES` (src/model/Faults.js) ma tu swój opis – pilnuje tego test (brak wpisu dawał „undefined”).
 */
const ALARM = {
  'signal-fail': (f) => t('sp.alarm.fault.signal', { id: f.target }),
  'point-control': (f) => t('sp.alarm.fault.point', { id: f.target }),
  'false-occupancy': (f) => t('sp.alarm.fault.section', { id: f.target }),
  'block-fail': (f, sim) => t('sp.alarm.fault.block', { name: sim.blocks.get(f.target)?.neighbour ?? f.target }),
  'route-block': (f) => t('sp.alarm.fault.routeBlock', { id: f.target }),
  'track-defect': (f) => t('sp.alarm.fault.track', { id: f.target }),
  'axle-counter': (f) => t('sp.alarm.fault.axle', { id: f.target }),
};

/** Tekst alarmu: „USTERKA: …”. */
export function faultAlarm(fault, sim) {
  const what = ALARM[fault.type]?.(fault, sim) ?? `${fault.type} ${fault.target}`;
  return t('sp.alarm.fault', { what });
}

/** Wpis na liście usterek: rodzaj i element. */
export function faultListText(fault, sim) {
  const where = fault.type === 'block-fail' ? sim.blocks.get(fault.target)?.neighbour ?? fault.target : fault.target;
  return `${t(`sp.fault.${fault.type}`)} ${where}`;
}
