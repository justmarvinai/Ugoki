import { expect, type Page, test } from '@playwright/test';

/**
 * The gallery (docs/02-experience.md §5) and the flows through it (§3): A — a headline typed in
 * the gallery opens in the editor and exports; C — a draft continues from the gallery as it was
 * left.
 */

/** Fails the test on console errors and uncaught exceptions. */
function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
}

/** Share of opaque pixels on the editor's stage, read back from the worker-owned canvas. */
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

/** Waits until the editor's design is built (the transport knows the duration) and painted. */
async function stageReady(page: Page): Promise<void> {
  await expect(page.getByRole('complementary', { name: 'Inspector' })).toContainText('Looks', {
    timeout: 15_000,
  });
  await expect(page.locator('output[aria-label="Time"]')).not.toContainText('/ 00:00.00');
  await expect.poll(() => stageCoverage(page), { timeout: 10_000 }).toBeGreaterThan(0.99);
}

/** The gallery's tiles in view have painted their posters. */
async function tilesPainted(page: Page, count = 3): Promise<void> {
  await expect
    .poll(() => page.locator('a[data-tile] [data-ready]').count(), { timeout: 20_000 })
    .toBeGreaterThanOrEqual(count);
}

const formatButton = (page: Page, format: string) =>
  page.getByRole('banner').getByRole('group', { name: 'Format' }).getByRole('button', {
    name: format,
    exact: true,
  });

test('flow A: a headline typed in the gallery opens in the editor and exports', async ({
  page,
}) => {
  test.slow();
  const errors = watchErrors(page);
  // Download path (browsers without a save picker).
  await page.addInitScript(() => {
    delete (window as { showSaveFilePicker?: unknown }).showSaveFilePicker;
  });
  await page.goto('/templates');
  await tilesPainted(page);

  // Personalize every tile, in the vertical format.
  await page.getByRole('button', { name: '9:16 Vertical' }).click();
  await page.getByRole('textbox', { name: 'Your headline' }).fill('Hello from the gallery');
  const rise = page.getByRole('link', { name: 'Rise — Masked line reveal' });
  await expect(rise).toHaveAttribute(
    'href',
    '/editor/rise?headline=Hello%20from%20the%20gallery&format=9:16',
  );
  const media = await rise.locator('[data-ready]').boundingBox();
  expect(media && media.height > media.width).toBe(true);

  // Open it: the editor starts with the headline and format, and the address bar is clean.
  await rise.click();
  await expect(page).toHaveURL(/\/editor\/rise$/);
  await stageReady(page);
  await expect(page.getByRole('textbox', { name: 'Headline' })).toHaveValue(
    'Hello from the gallery',
  );
  await expect(page.getByRole('img', { name: /^Rise: Hello from the gallery/ })).toBeVisible();
  await expect(formatButton(page, '9:16')).toHaveAttribute('aria-pressed', 'true');

  // Export a still.
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: 'Export' });
  await sheet
    .getByRole('group', { name: 'Export format' })
    .getByRole('button', { name: 'Still' })
    .click();
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 30_000 }),
    sheet.getByRole('button', { name: 'Export Still' }).click(),
  ]);
  const size = /^ugoki-rise-(\d+)x(\d+)-[\d.]+s\.png$/.exec(download.suggestedFilename());
  expect(size).not.toBeNull();
  expect(Number(size?.[2])).toBeGreaterThan(Number(size?.[1]));
  expect(errors).toEqual([]);
});

test('flow C: a draft continues from the gallery as it was left', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/editor/line');
  await stageReady(page);
  await formatButton(page, '9:16').click();
  await page.getByRole('textbox', { name: 'Name' }).fill('Ada Lovelace');
  const bar = page.getByRole('banner');
  await expect(bar.getByRole('status').filter({ hasText: 'Saved on this device' })).toBeVisible({
    timeout: 5000,
  });

  await page.goto('/templates');
  const row = page.getByRole('region', { name: 'Continue where you left off' });
  const draft = row.getByRole('link', { name: /^Line, edited/ });
  await expect(draft).toBeVisible();
  // A live tile of the draft, in its own format.
  await expect(draft.locator('[data-ready]')).toBeVisible({ timeout: 20_000 });
  const media = await draft.locator('[data-ready]').boundingBox();
  expect(media && media.height > media.width).toBe(true);
  // Also in Recent.
  await page.getByRole('button', { name: /Recent/ }).click();
  await expect(page.getByRole('dialog').getByRole('link', { name: /^Line, edited/ })).toBeVisible();
  await page.keyboard.press('Escape');

  await draft.click();
  await expect(page).toHaveURL(/\/editor\/line\?draft=[\w-]+$/);
  await stageReady(page);
  await expect(page.getByRole('textbox', { name: 'Name' })).toHaveValue('Ada Lovelace');
  await expect(formatButton(page, '9:16')).toHaveAttribute('aria-pressed', 'true');
  expect(errors).toEqual([]);
});

test('the gallery: categories, search, format and keyboard', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/templates');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Motion templates');
  const grid = page.getByRole('list', { name: 'Templates' });
  await expect(grid.getByRole('link')).toHaveCount(25);
  await tilesPainted(page);

  // The personalization carries across category pages.
  await page.getByRole('textbox', { name: 'Your headline' }).fill('Ada Lovelace');
  const nav = page.getByRole('navigation', { name: 'Categories' });
  await nav.getByRole('link', { name: /^Lower Thirds/ }).click();
  await expect(page).toHaveURL(/\/templates\/lower-thirds$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Lower thirds');
  await expect(grid.getByRole('link')).toHaveCount(3);
  await expect(nav.getByRole('link', { name: /^Lower Thirds/ })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await expect(page.getByRole('textbox', { name: 'Your headline' })).toHaveValue('Ada Lovelace');
  await expect(grid.getByRole('link', { name: 'Line — Minimal accent bar' })).toHaveAttribute(
    'href',
    /headline=Ada%20Lovelace/,
  );
  await nav.getByRole('link', { name: /^All/ }).click();
  await expect(page).toHaveURL(/\/templates$/);
  await expect(grid.getByRole('link')).toHaveCount(25);

  // `/` searches names, categories, tags and use cases.
  await page.getByRole('heading', { level: 1 }).click();
  await page.keyboard.press('/');
  const search = page.getByRole('searchbox', { name: 'Search templates' });
  await expect(search).toBeFocused();
  await page.keyboard.type('podcast');
  await expect(grid.getByRole('link')).toHaveCount(4);
  await search.fill('zebra');
  await expect(page.getByRole('status')).toContainText('Nothing matched “zebra”.');
  await page.getByRole('button', { name: '“logo”' }).click();
  await expect(search).toHaveValue('logo');
  await expect(grid.getByRole('link')).toHaveCount(2);
  await search.fill('');
  await expect(grid.getByRole('link')).toHaveCount(25);

  // The format control re-lays out every tile.
  const firstMedia = () => grid.getByRole('link').first().locator('[data-ready]').boundingBox();
  const wide = await firstMedia();
  expect(wide && wide.width > wide.height).toBe(true);
  await page.getByRole('button', { name: '9:16 Vertical' }).click();
  await expect
    .poll(async () => {
      const box = await firstMedia();
      return box ? box.height / box.width : 0;
    })
    .toBeCloseTo(16 / 9, 1);

  // Arrow keys move across the grid; Enter opens.
  await grid.getByRole('link').first().focus();
  await page.keyboard.press('ArrowRight');
  await expect(grid.getByRole('link', { name: 'Focus — Blur-to-sharp headline' })).toBeFocused();
  await page.keyboard.press('End');
  await expect(grid.getByRole('link', { name: 'Dashboard — Analytics build' })).toBeFocused();
  await page.keyboard.press('Home');
  await page.keyboard.press('ArrowDown');
  const columns = await grid.evaluate(
    (element) => getComputedStyle(element).gridTemplateColumns.split(' ').length,
  );
  await expect(grid.getByRole('link').nth(columns)).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/editor\/\w+$/);
  await stageReady(page);
  expect(errors).toEqual([]);
});
