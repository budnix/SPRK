/**
 * Gdynia Główna z okręgami nastawczymi – **stacja testowa** (fixture) dla mechanizmu okręgów (`districts`,
 * `AutoOperator`, polecenia dyżurny ↔ nastawniczy). W grze Gdynia Główna jest prowadzona z jednego stanowiska;
 * ten plik zachowuje test mechanizmu na wypadek przyszłych stacji z podziałem na okręgi.
 */
import gdynia from '../../src/stations/gdynia-glowna.js';

export default {
  ...gdynia,
  id: 'gdynia-glowna-okregi',
  /** GO – nastawnia dysponująca (dyżurny ruchu, głowica wschodnia), GO2 – wykonawcza (nastawniczy, głowica zachodnia). */
  districts: {
    GO: { name: 'GO – nastawnia dysponująca (głowica wschodnia)', short: 'GO', role: 'dysponująca', cols: [35, 99] },
    GO2: { name: 'GO2 – nastawnia wykonawcza (głowica zachodnia)', short: 'GO2', role: 'wykonawcza', cols: [0, 34] },
  },
};
