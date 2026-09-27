import { expect, type Page, test } from '@playwright/test';
import { TEMPLATES } from '../../src/templates/registry';

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

test('every template opens in the editor and exports', async ({ page }) => {
  test.setTimeout(TEMPLATES.length * 20_000);
  const errors = watchErrors(page);
  // Download path (browsers without a save picker).
  await page.addInitScript(() => {
    delete (window as { showSaveFilePicker?: unknown }).showSaveFilePicker;
  });
  for (const { id, name } of TEMPLATES) {
    await page.goto(`/editor/${id}`);
    await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
    await expect(page.getByRole('complementary', { name: 'Inspector' })).toContainText('Looks', {
      timeout: 15_000,
    });
    // Built (the transport knows the duration) and painted — also, leaving a page while its
    // worker still fetches the text engine makes WebKit log the cancelled fetch as an error.
    await expect(page.locator('output[aria-label="Time"]')).not.toContainText('/ 00:00.00');
    await expect.poll(() => stageCoverage(page), { timeout: 10_000 }).toBeGreaterThan(0.99);

    // A still of the poster frame, through the export worker.
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
    expect(download.suggestedFilename()).toMatch(
      new RegExp(`^ugoki-${id}-\\d+x\\d+-[\\d.]+s\\.png$`),
    );
  }
  expect(errors).toEqual([]);
});

/** Opens an editor and waits until its design is built and on the stage. */
/**
 * Waits until the editor's design is built (the transport knows the duration) and painted.
 * Leaving a page while its worker still fetches the text engine makes WebKit log the cancelled
 * fetch as an error, so tests wait for this before navigating away.
 */
async function stageReady(page: Page): Promise<void> {
  await expect(page.getByRole('complementary', { name: 'Inspector' })).toContainText('Looks', {
    timeout: 15_000,
  });
  await expect(page.locator('output[aria-label="Time"]')).not.toContainText('/ 00:00.00');
  await expect.poll(() => stageCoverage(page), { timeout: 10_000 }).toBeGreaterThan(0.99);
}

async function openEditor(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await stageReady(page);
}

test('a share link opens the same design elsewhere', async ({ page, context }) => {
  const errors = watchErrors(page);
  await openEditor(page, '/editor/rise');
  await page.getByRole('textbox', { name: 'Eyebrow' }).fill('Shared, not uploaded');
  await page.getByRole('button', { name: 'Share' }).click();
  const link = await page.getByRole('textbox', { name: 'Share link' }).inputValue();
  expect(link).toMatch(/\/editor\/rise#d=[A-Za-z0-9_-]+$/);

  const other = await context.newPage();
  const otherErrors = watchErrors(other);
  await openEditor(other, link.replace(/^https?:\/\/[^/]+/, ''));
  await expect(other.getByRole('textbox', { name: 'Eyebrow' })).toHaveValue('Shared, not uploaded');
  await expect(other.getByText('Opened from a link.')).toBeVisible();
  // The design is now this device's: the link doesn't stay in the address bar.
  expect(new URL(other.url()).hash).toBe('');
  expect([...errors, ...otherErrors]).toEqual([]);
});

test('drafts save as you edit and reopen', async ({ page }) => {
  const errors = watchErrors(page);
  await openEditor(page, '/editor/line');
  await page.getByRole('textbox', { name: 'Name' }).fill('Mika Draft');
  // Saved — or, if the browser refused, the top bar says why (and the test shows it).
  const bar = page.getByRole('banner');
  const saved = bar.getByRole('status').filter({ hasText: 'Saved on this device' });
  await expect(saved.or(bar.getByRole('alert'))).toBeVisible({ timeout: 5000 });
  await expect(bar.getByRole('alert')).not.toBeVisible();
  // Autosave names the draft in the address bar, so a reload reopens it.
  await expect(page).toHaveURL(/\?draft=[\w-]+$/);
  await page.reload();
  await stageReady(page);
  await expect(page.getByRole('textbox', { name: 'Name' })).toHaveValue('Mika Draft');

  await page.goto('/templates');
  const drafts = page.getByRole('region', { name: 'Continue where you left off' });
  await expect(drafts.getByRole('link', { name: /Line/ })).toBeVisible();
  await drafts.getByRole('link', { name: /Line/ }).first().click();
  await stageReady(page);
  await expect(page.getByRole('textbox', { name: 'Name' })).toHaveValue('Mika Draft');
  expect(errors).toEqual([]);
});
