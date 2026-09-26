import { fileURLToPath } from 'node:url';
import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

/**
 * Test projects (docs/05-architecture.md §17):
 *  - unit:    Node — engine math, templates, layout, text shaping (HarfBuzz runs in Node).
 *  - browser: real browsers via Playwright — Draw API, workers, capabilities, determinism.
 *  - golden:  real browsers — golden-frame comparisons of template renders.
 *
 * Locally, point PW_CHROMIUM_PATH at a Chromium binary if Playwright's own isn't installed.
 * VITEST_BROWSERS=chromium,firefox,webkit runs the browser projects in several engines (CI).
 */
const browsers = (process.env.VITEST_BROWSERS ?? 'chromium')
  .split(',')
  .map((name) => name.trim())
  .filter(Boolean) as Array<'chromium' | 'firefox' | 'webkit'>;

const provider = playwright({
  launchOptions: process.env.PW_CHROMIUM_PATH
    ? { executablePath: process.env.PW_CHROMIUM_PATH }
    : {},
});

const browser = {
  enabled: true,
  headless: true,
  provider,
  instances: browsers.map((name) => ({ browser: name })),
};

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  publicDir: 'public',
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          environment: 'node',
          include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
          exclude: ['src/**/*.browser.test.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'browser',
          include: ['src/**/*.browser.test.ts'],
          browser,
        },
      },
      {
        extends: true,
        test: {
          name: 'golden',
          include: ['tests/golden/**/*.test.ts'],
          browser,
        },
      },
    ],
  },
});
