import { defineConfig } from '@playwright/test';

/**
 * Testy e2e (przeglądarka): zachowanie pulpitu kostkowego i monitora, struktura DOM/SVG i zrzuty
 * wizualne. Lokalnie: `npm run test:e2e` (Chromium Playwrighta lub SPRK_CHROMIUM=/ścieżka/do/chrome).
 * Aktualizacja wzorców wizualnych: `npm run test:e2e:update`. W CI: SPRK_E2E_PREVIEW=1 (zbudowana paczka), dwa procesy,
 * dwa shardy (workflow).
 */
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  expect: { timeout: 8_000, toHaveScreenshot: { maxDiffPixels: 300, animations: 'disabled', caret: 'hide' }, toMatchSnapshot: { maxDiffPixels: 300 } },
  // CI: dwa procesy i testy w pliku równolegle (każdy test ma własną stronę i localStorage); lokalnie jeden proces
  fullyParallel: !!process.env.CI,
  workers: process.env.CI ? 2 : 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  snapshotPathTemplate: '{testDir}/__screenshots__/{testFileName}/{arg}{ext}',
  use: {
    baseURL: 'http://127.0.0.1:5174',
    locale: 'pl-PL', // język interfejsu „auto” = wg przeglądarki; testy zakładają polski (i18n.spec sprawdza inne)
    viewport: { width: 1366, height: 1024 },
    deviceScaleFactor: 1,
    hasTouch: true,
    launchOptions: { executablePath: process.env.SPRK_CHROMIUM || undefined, args: ['--no-sandbox'] },
    trace: 'retain-on-failure',
  },
  webServer: {
    // W CI: zbudowana paczka (vite preview) – strony ładują się wielokrotnie szybciej niż z serwera deweloperskiego
    command: process.env.SPRK_E2E_PREVIEW ? 'npx vite build --logLevel warn && npx vite preview --port 5174 --host 127.0.0.1 --strictPort' : 'npx vite --port 5174 --host 127.0.0.1 --strictPort',
    url: 'http://127.0.0.1:5174/',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
