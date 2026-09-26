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

test('home page shows the tagline', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Motion,\s*made yours\./);
  await expect(page.getByRole('img', { name: 'Ugoki' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('the Lab renders Rise in every format through the render worker', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/lab');
  for (const name of [
    'Landscape preview',
    'Vertical preview',
    'Square preview',
    'Portrait preview',
  ]) {
    await expect(page.getByRole('img', { name })).toBeVisible();
  }
  await expect(page.getByText('Render worker · 4 views')).toBeVisible();

  // Playback advances the shared transport.
  await page.getByRole('button', { name: 'Play (Space)' }).click();
  await expect(page.locator('output[aria-label="Time"]')).not.toHaveText(/^00:00\.00/, {
    timeout: 5000,
  });
  await page.getByRole('button', { name: 'Pause (Space)' }).click();

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
  await page.goto('/lab');
  await page.getByRole('button', { name: '16:9' }).click();
  await expect(page.getByText('Render worker · 1 view')).toBeVisible();
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
