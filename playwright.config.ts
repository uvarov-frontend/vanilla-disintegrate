import { defineConfig, devices } from '@playwright/test';
import { docsPort, docsURL } from './tests/browser/urls';

const fixturePort = Number(process.env.PLAYWRIGHT_FIXTURE_PORT ?? 4174);
const fixtureURL = `http://127.0.0.1:${fixturePort}`;

export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: fixtureURL,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    { name: 'mobile-chromium', use: { ...devices['Pixel 7'] } },
    { name: 'mobile-webkit', use: { ...devices['iPhone 15'] } },
  ],
  webServer: [
    {
      command: `pnpm exec vite --config vite.browser.config.ts --host 127.0.0.1 --port ${fixturePort} --strictPort`,
      reuseExistingServer: !process.env.CI,
      url: `${fixtureURL}/tests/browser/fixture.html`,
    },
    {
      command: `pnpm exec astro dev --ignore-lock --host 127.0.0.1 --port ${docsPort}`,
      env: { ASTRO_DEV_BACKGROUND: '1', PUBLIC_POSTHOG_KEY: 'phc_test_00000000000000000000000000000000' },
      reuseExistingServer: !process.env.CI,
      url: `${docsURL}/`,
    },
  ],
});
