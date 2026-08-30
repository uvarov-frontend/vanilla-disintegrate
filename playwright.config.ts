import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://127.0.0.1:4174',
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
      command: 'pnpm exec vite --host 127.0.0.1 --port 4174 --strictPort',
      reuseExistingServer: !process.env.CI,
      url: 'http://127.0.0.1:4174/tests/browser/fixture.html',
    },
    {
      command: 'pnpm exec astro dev',
      reuseExistingServer: !process.env.CI,
      url: 'http://localhost:4321/',
    },
  ],
});
