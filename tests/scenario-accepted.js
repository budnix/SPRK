/**
 * Przyjęte uwagi powtarzalne scenariuszy (klucz „stacja:scenariusz” → klucze „kod” albo „kod:pociąg”): uwagi definicji
 * (`checkScenario` na poziomie scenariusza) i uwagi przebiegu bez zakłóceń (poziom none, ziarno 1 – bez losowych
 * opóźnień i usterek przebieg jest praktycznie powtarzalny: między ziarnami różnią się najwyżej sekundy). Przebieg
 * w `npm test` (tests/scenario-runs.js) nie przechodzi, gdy dojdzie uwaga spoza listy – nowy scenariusz albo zmiana
 * silnika / automatu, która pogarsza znany scenariusz. Uwagę poprawia się w scenariuszu albo
 * świadomie dopisuje tutaj (komunikat testu podaje gotowy wiersz) – to decyzja właściciela, z uzasadnieniem w commicie.
 *
 * Stan przyjęty przy wprowadzeniu listy (scenariusze bez zmian; opis przyczyn – raport automatu, `npm run check`):
 *  - rumia (RD2, RD1), reda (RM2, WJ1), tczew (PS2): rozkład gęstszy niż szlak (line-headway, line-headway-out) – kilka
 *    minut opóźnienia z samego planu,
 *  - gdynia-chylonia:tor-1-zamkniety: tory planowe zamknięte (zamierzone) i zapas na poziomie low,
 *  - automat-delay / track-conflict / line-capacity na poziomie none: kary 2–5 min z planu albo zwłoki automatu.
 */
export const ACCEPTED = {
  'szkolna:nauka-1': ['line-capacity:6105', 'wrong-track:6106'],
  'gdynia-chylonia:tor-1-zamkniety': ['closed-planned-track:5301', 'closed-planned-track:55152', 'closed-planned-track:55201', 'closed-planned-track:55203', 'closed-planned-track:55205', 'closed-planned-track:55207', 'sc-slack:55207'],
  'gdynia-glowna:awaria-glowicy': ['track-conflict:55201'],
  'rumia:zmiana': ['line-capacity:44570', 'line-capacity:93205', 'line-headway-out:93205', 'line-headway:44570', 'line-headway:55201', 'line-headway:55203', 'line-headway:55205', 'line-headway:55207', 'track-conflict:93204'],
  'rumia:zmiana-lcs': ['line-capacity:44570', 'line-capacity:93205', 'line-headway-out:93205', 'line-headway:44570', 'line-headway:55201', 'line-headway:55203', 'line-headway:55205', 'line-headway:55207', 'track-conflict:93204'],
  'rumia:usterka-rd2': ['line-capacity:44570', 'line-capacity:93205', 'line-headway-out:93205', 'line-headway:44570', 'line-headway:55201', 'line-headway:55203', 'line-headway:55205', 'line-headway:55207', 'track-conflict:93204'],
  'rumia:szczyt': ['line-headway-out:93205', 'line-headway:44570', 'line-headway:55201', 'line-headway:55203', 'line-headway:55205', 'line-headway:55207'],
  'reda:zmiana': ['line-headway-out:55102', 'line-headway-out:55711'],
  'reda:zmiana-lcs': ['line-headway-out:55102', 'line-headway-out:55711'],
  'reda:usterka-hl': ['line-headway-out:55102', 'line-headway-out:55711'],
  'reda:szczyt': ['line-headway-out:55102', 'line-headway-out:55711'],
  'tczew:zmiana': ['automat-delay:44620', 'line-headway:5305', 'line-headway:55600', 'track-conflict:5303'],
  'tczew:usterka-zb': ['automat-delay:44620', 'line-headway:5305', 'line-headway:55600', 'track-conflict:5303'],
  'tczew:szczyt': ['line-headway:5305', 'line-headway:55600'],
  'pruszcz-gdanski:zmiana': ['automat-delay:44711', 'automat-delay:44721', 'line-capacity:55309'],
  'pruszcz-gdanski:usterka-gp': ['automat-delay:44711', 'automat-delay:44721', 'line-capacity:55309'],
  'gdansk-glowny:zmiana': ['track-conflict:93107'],
  'gdansk-glowny:usterka-zt': ['track-conflict:93107'],
};
