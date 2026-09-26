import { expect, type Page, test } from '@playwright/test';

/** Fails the test on console errors and uncaught exceptions. */
function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
}

/**
 * `page.goto`, working around Playwright's Firefox driver: about 1% of navigations never resolve
 * although the page has loaded, and a second navigation settles it (microsoft/playwright#42183).
 * A page that really didn't load still fails.
 */
async function open(page: Page, path: string): Promise<void> {
  try {
    await page.goto(path, { timeout: 15_000 });
  } catch (error) {
    const loaded = await page
      .evaluate(
        (target) => location.pathname === target && document.readyState === 'complete',
        path,
      )
      .catch(() => false);
    if (!loaded) throw error;
    await page.goto(path);
  }
}

test('home page shows the tagline', async ({ page }) => {
  const errors = watchErrors(page);
  await open(page, '/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Motion,\s*made yours\./);
  await expect(page.getByRole('img', { name: 'Ugoki' })).toBeVisible();
  expect(errors).toEqual([]);
});

/** Share of opaque pixels in a view's canvas, read back from the worker-owned placeholder. */
function stageCoverage(page: Page, name: string): Promise<number | string> {
  return page.evaluate(async (label) => {
    const canvas = document.querySelector(`[aria-label="${label}"] canvas`);
    if (!(canvas instanceof HTMLCanvasElement)) return 'no canvas';
    try {
      const bitmap = await createImageBitmap(canvas);
      const probe = new OffscreenCanvas(bitmap.width, bitmap.height);
      const ctx = probe.getContext('2d');
      if (!ctx) return 'no 2d';
      ctx.drawImage(bitmap, 0, 0);
      const data = ctx.getImageData(0, 0, probe.width, probe.height).data;
      let opaque = 0;
      for (let i = 3; i < data.length; i += 4) if ((data[i] ?? 0) > 0) opaque++;
      return opaque / (data.length / 4);
    } catch (error) {
      return String(error);
    }
  }, name);
}

/**
 * Asserts that a view displays the worker's frames (the Paper background covers the whole view):
 * its render-cost meter reports frames, and its canvas reads back covered. In Firefox a read-back
 * right after the worker started or resized the canvas can stall and come back empty (see
 * `playwright.config.ts`), so the coverage is polled.
 */
async function expectDisplayed(page: Page, name: string): Promise<void> {
  const caption = page
    .locator('figure')
    .filter({ has: page.getByRole('img', { name }) })
    .locator('figcaption');
  await expect(caption).toContainText(/\d\.\d\d ms/, { timeout: 10_000 });
  await expect.poll(() => stageCoverage(page, name), { timeout: 5000 }).toBeGreaterThan(0.99);
}

test('the Lab renders Rise in every format through the render worker', async ({ page }) => {
  const errors = watchErrors(page);
  await open(page, '/lab');
  for (const name of [
    'Landscape preview',
    'Vertical preview',
    'Square preview',
    'Portrait preview',
  ]) {
    await expect(page.getByRole('img', { name })).toBeVisible();
  }
  await expect(page.getByText('Render worker · 4 views')).toBeVisible();

  // Record the worker's messages, to explain a failure below.
  await page.waitForFunction(() => Boolean(window.__ugokiLab));
  await page.evaluate(() => {
    const log: string[] = [];
    (window as unknown as { __ugokiLog: string[] }).__ugokiLog = log;
    window.__ugokiLab?.client.subscribe((m) => {
      if (m.type === 'regions') return;
      const at = Math.round(performance.now());
      log.push(
        m.type === 'frame'
          ? `${at} frame ${m.view} t=${m.t.toFixed(3)} ${m.playing ? 'playing' : 'still'}`
          : `${at} ${m.type} ${'view' in m ? m.view : ''} ${m.type === 'error' ? m.message : ''}`,
      );
      if (log.length > 300) log.shift();
    });
  });
  const explain = async (error: unknown) => {
    const log = await page.evaluate(
      () => (window as unknown as { __ugokiLog?: string[] }).__ugokiLog,
    );
    console.log(`worker messages (latest last):\n${(log ?? []).slice(-60).join('\n')}`);
    throw error;
  };

  // The stage displays the worker's frames.
  await expectDisplayed(page, 'Landscape preview').catch(explain);

  // Playback advances the shared transport.
  await page.getByRole('button', { name: 'Play (Space)' }).click();
  await expect(page.locator('output[aria-label="Time"]'))
    .not.toHaveText(/^00:00\.00/, { timeout: 5000 })
    .catch(explain);
  await page.getByRole('button', { name: 'Pause (Space)' }).click();

  // Layout changes (one row ↔ two) keep every view rendering (views must not be remounted).
  const size = page.viewportSize();
  await page.setViewportSize({ width: 2400, height: 700 });
  await page.waitForTimeout(300);
  if (size) await page.setViewportSize(size);
  for (const name of [
    'Landscape preview',
    'Vertical preview',
    'Square preview',
    'Portrait preview',
  ]) {
    await expectDisplayed(page, name).catch(explain);
  }

  // Every Look and energy rebuilds without errors.
  const looks = page.getByRole('group', { name: 'Looks' });
  for (const look of ['Ink', 'Brand Bold', 'Paper']) {
    await looks.getByRole('button', { name: look }).click();
  }
  const energy = page.getByRole('group', { name: 'Energy' });
  for (const level of ['Calm', 'Punchy', 'Balanced']) {
    await energy.getByRole('button', { name: level }).click();
  }
  await expect(page.getByText('WebGL2')).toBeVisible();
  expect(errors).toEqual([]);
});

test('PNG stills download with the ugoki- prefix', async ({ page }) => {
  await open(page, '/lab');
  await page.getByRole('button', { name: '16:9' }).click();
  await expect(page.getByText('Render worker · 1 view')).toBeVisible();
  await expectDisplayed(page, 'Landscape preview');
  // Arrow/Home/End keys belong to the focused segmented control; transport shortcuts are global.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press('End');
  await page.keyboard.press('Shift+ArrowLeft');
  await page.keyboard.press('Shift+ArrowLeft');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'PNG stills at 1080p' }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^ugoki-rise-16x9-3\.00s\.png$/);
  const path = await download.path();
  const { size } = await import('node:fs/promises').then((fs) => fs.stat(path));
  // A 1920 × 1080 frame with a headline (a blank frame compresses to a few KB).
  expect(size).toBeGreaterThan(15_000);
});
