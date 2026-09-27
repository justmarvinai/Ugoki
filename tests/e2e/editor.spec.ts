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

/** Share of opaque pixels on the stage, read back from the worker-owned canvas. */
function stageCoverage(page: Page): Promise<number | string> {
  return page.evaluate(async () => {
    const canvas = document.querySelector('main [role="img"] canvas');
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
  });
}

test('Choose → Customize → Export: a template, edited, undone and exported', async ({ page }) => {
  // The flow, not throughput: 3 s at 720p, 24 fps, Standard motion blur (CI's Chromium
  // composites on a software GPU).
  test.slow();
  const errors = watchErrors(page);
  // Download path (browsers without a save picker).
  await page.addInitScript(() => {
    delete (window as { showSaveFilePicker?: unknown }).showSaveFilePicker;
  });

  // Choose.
  await page.goto('/templates');
  await page.getByRole('link', { name: /Rise/ }).click();
  await expect(page).toHaveURL(/\/editor\/rise$/);
  const stage = page.getByRole('img', { name: /^Rise: / });
  await expect(stage).toBeVisible({ timeout: 15_000 });
  // The stage shows the worker's frames (Paper covers it), opening on the poster frame.
  await expect.poll(() => stageCoverage(page), { timeout: 10_000 }).toBeGreaterThan(0.99);
  await expect(page.locator('output[aria-label="Time"]')).toHaveText(/^00:02\.20/);

  // Customize: new words on the stage, then undo (one step for the whole edit).
  const headline = page.getByRole('textbox', { name: 'Headline' });
  await headline.fill('Motion, made yours');
  await expect(stage).toHaveAttribute('aria-label', /Motion, made yours/);
  await page.keyboard.press('ControlOrMeta+z');
  await expect(headline).toHaveValue('Where it\nall began');
  await page.getByRole('group', { name: 'Energy' }).getByRole('button', { name: 'Punchy' }).click();
  const inspector = page.getByRole('complementary', { name: 'Inspector' });
  await inspector.getByRole('slider', { name: 'Duration' }).press('Home');
  await expect(page.locator('output[aria-label="Time"]')).toContainText('/ 00:03.00');

  // Export a PNG sequence from the sheet.
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: 'Export' });
  await sheet
    .getByRole('group', { name: 'Export format' })
    .getByRole('button', { name: 'PNG seq.' })
    .click();
  await sheet.getByLabel('Resolution').selectOption('720');
  await sheet.getByLabel('Frame rate').selectOption('24');
  await sheet
    .getByRole('group', { name: 'Quality' })
    .getByRole('button', { name: 'Standard' })
    .click();
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 60_000 }),
    sheet.getByRole('button', { name: 'Export PNG seq.' }).click(),
  ]);
  expect(download.suggestedFilename()).toBe('ugoki-rise-1280x720-24fps.zip');
  await expect(sheet.getByText('ugoki-rise-1280x720-24fps.zip')).toBeVisible();
  expect(errors).toEqual([]);
});

test('every template opens in the editor', async ({ page }) => {
  const errors = watchErrors(page);
  for (const [id, name] of [
    ['rise', 'Rise'],
    ['line', 'Line'],
    ['sheen', 'Sheen'],
    ['layers', 'Layers'],
  ] as const) {
    await page.goto(`/editor/${id}`);
    await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
    await expect(page.getByRole('complementary', { name: 'Inspector' })).toContainText('Looks', {
      timeout: 15_000,
    });
    await expect(page.locator('main [role="img"] canvas')).toBeAttached();
  }
  expect(errors).toEqual([]);
});
