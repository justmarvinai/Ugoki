import { expect, type Page, test } from '@playwright/test';

/**
 * Image slots (docs/02-experience.md §6): built-in logos, and files dropped on the field or the
 * stage, or pasted. Sheen's logo is the slot; files are tiny PNGs made here.
 */

/** 4 × 4 px opaque PNGs. */
const RED =
  'iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAEElEQVR42mN46uELRwzEcQBwEhehaFjYvgAAAABJRU5ErkJggg==';
const BLUE =
  'iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAEElEQVR42mPQzvkERwzEcQByghiRKR2nrQAAAABJRU5ErkJggg==';

/** Fails the test on console errors and uncaught exceptions. */
function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
}

async function openSheen(page: Page): Promise<void> {
  await page.goto('/editor/sheen');
  await expect(page.getByRole('complementary', { name: 'Inspector' })).toContainText('Looks', {
    timeout: 15_000,
  });
  // Built: leaving while the worker still fetches the text engine makes WebKit log an error.
  await expect(page.locator('output[aria-label="Time"]')).not.toContainText('/ 00:00.00');
}

/** A DataTransfer in the page holding one file (base64 bytes). */
const holding = (page: Page, name: string, type: string, base64: string) =>
  page.evaluateHandle(
    ([name, type, base64]) => {
      const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      const data = new DataTransfer();
      data.items.add(new File([bytes], name, { type }));
      return data;
    },
    [name, type, base64] as const,
  );

type Ref = { kind: string; id?: string; hash?: string; name?: string } | null;

const logo = (page: Page) =>
  page.evaluate(() => (window.__ugokiEditor?.project.getState().design?.props.logo ?? null) as Ref);

test('a logo from the built-ins, dropped on its field or dropped on the stage', async ({
  page,
}) => {
  const errors = watchErrors(page);
  await openSheen(page);
  const field = page.locator('[data-image-field="logo"]');
  await expect(field.getByRole('button', { name: 'Nova' })).toHaveAttribute('aria-pressed', 'true');
  await field.getByRole('button', { name: 'Halden' }).click();
  await expect.poll(() => logo(page)).toEqual({ kind: 'placeholder', id: 'halden' });

  // Dropped on the field.
  let data = await holding(page, 'brand.png', 'image/png', RED);
  for (const type of ['dragenter', 'dragover', 'drop']) {
    await field.dispatchEvent(type, { dataTransfer: data });
  }
  await expect(field).toContainText('brand.png');
  expect(await logo(page)).toMatchObject({ kind: 'user', name: 'brand.png' });

  // Dropped on the stage, away from any element: the first image slot takes it.
  const stage = page.getByRole('img', { name: /^Sheen/ });
  data = await holding(page, 'other.png', 'image/png', BLUE);
  for (const type of ['dragenter', 'dragover', 'drop']) {
    await stage.dispatchEvent(type, { dataTransfer: data });
  }
  await expect(field).toContainText('other.png');

  // Not an image: the field says so, and the logo stays.
  data = await holding(page, 'notes.txt', 'text/plain', btoa('Not an image'));
  for (const type of ['dragenter', 'dragover', 'drop']) {
    await field.dispatchEvent(type, { dataTransfer: data });
  }
  await expect(field.getByRole('status')).toHaveText('Use an SVG, PNG, JPG or WebP file.');
  expect(await logo(page)).toMatchObject({ kind: 'user', name: 'other.png' });

  // Each file is one undo step.
  await page.keyboard.press('ControlOrMeta+z');
  await expect.poll(async () => (await logo(page))?.name).toBe('brand.png');
  await page.keyboard.press('ControlOrMeta+z');
  await expect.poll(() => logo(page)).toEqual({ kind: 'placeholder', id: 'halden' });
  expect(errors).toEqual([]);
});

test('an image pasted outside text fields goes to the image slot', async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== 'chromium', 'Paste events carrying files are built in Chromium only');
  const errors = watchErrors(page);
  await openSheen(page);
  const field = page.locator('[data-image-field="logo"]');
  const paste = (target: 'body' | 'focused') =>
    page.evaluate(
      ([base64, target]) => {
        const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
        const data = new DataTransfer();
        data.items.add(new File([bytes], 'image.png', { type: 'image/png' }));
        const element =
          target === 'body' ? document.body : (document.activeElement ?? document.body);
        element.dispatchEvent(
          new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }),
        );
      },
      [RED, target] as const,
    );

  // While typing, a paste belongs to the text.
  await page.getByRole('textbox', { name: 'Tagline' }).focus();
  await paste('focused');
  await page.waitForTimeout(300);
  expect(await logo(page)).toEqual({ kind: 'placeholder', id: 'nova' });

  await page.getByRole('textbox', { name: 'Tagline' }).blur();
  await paste('body');
  await expect(field).toContainText('Pasted image.png');
  expect(await logo(page)).toMatchObject({ kind: 'user', name: 'Pasted image.png' });
  expect(errors).toEqual([]);
});
