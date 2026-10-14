import { defineConfig } from '@playwright/test';

/**
 * The stocktake slice is E2E-tested against a faithful in-test mock of the
 * frozen REST contract (StocktakeController paths + DTO names) — the real
 * backend behaviour is covered by the Spring ITs (StocktakesIT), this suite
 * covers the UI: identity gate, snapshot start, card flow, pause/resume,
 * notes, auto-advance, offline queue + flush, close → frozen report.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run preview -- --port 4173 --strictPort',
    port: 4173,
    reuseExistingServer: !process.env.CI,
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
