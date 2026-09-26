import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests against the production build (`pnpm build` first). CI runs Chromium,
 * Firefox and WebKit; locally, PW_CHROMIUM_PATH can point at a preinstalled Chromium.
 */
const chromiumLaunch = process.env.PW_CHROMIUM_PATH
  ? { executablePath: process.env.PW_CHROMIUM_PATH }
  : {};

/**
 * Firefox reads a worker-owned canvas back (the tests' pixel checks) by blocking the main thread
 * until the worker answers, for up to this long (default 10 s). Right after the worker starts or
 * resizes a canvas, the worker can itself be waiting on the main thread, so such a read stalls
 * for the whole timeout. With a short one it comes back empty instead and the check polls again.
 */
const firefoxLaunch = { firefoxUserPrefs: { 'gfx.offscreencanvas.snapshot-timeout-ms': 250 } };

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: 'http://localhost:3100',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'pnpm start -p 3100',
    url: 'http://localhost:3100',
    reuseExistingServer: !process.env.CI,
    env: { NEXT_TELEMETRY_DISABLED: '1' },
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], launchOptions: chromiumLaunch } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'], launchOptions: firefoxLaunch } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
});
