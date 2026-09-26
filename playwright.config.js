import { defineConfig } from '@playwright/test';

/**
 * Testy e2e (przeglądarka): zachowanie pulpitu kostkowego i monitora, struktura DOM/SVG i zrzuty
 * wizualne. Lokalnie: `npm run test:e2e` (Chromium Playwrighta lub SPRK_CHROMIUM=/ścieżka/do/chrome).
 * Aktualizacja wzorców wizualnych: `npm run test:e2e:update`.
 */
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  expect: { timeout: 8_000, toHaveScreenshot: { maxDiffPixelRatio: 0.02, animations: 'disabled', caret: 'hide' }, toMatchSnapshot: { maxDiffPixelRatio: 0.02 } },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  snapshotPathTemplate: '{testDir}/__screenshots__/{testFileName}/{arg}{ext}',
  use: {
    baseURL: 'http://127.0.0.1:5174',
    viewport: { width: 1366, height: 1024 },
    deviceScaleFactor: 1,
    hasTouch: true,
    launchOptions: { executablePath: process.env.SPRK_CHROMIUM || undefined, args: ['--no-sandbox'] },
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npx vite --port 5174 --host 127.0.0.1 --strictPort',
    url: 'http://127.0.0.1:5174/',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
