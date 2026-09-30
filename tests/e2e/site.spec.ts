import { expect, type Page, type Response, test } from '@playwright/test';

/**
 * The site's own pages (docs/02-experience.md §2): the legal pages — German first, then the
 * English version (ADR-017) — and the 404, whose "404" is animated by the engine.
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

/**
 * `page.goto`, working around Playwright's Firefox driver: about 1% of navigations never resolve
 * although the page has loaded, and a second navigation settles it (microsoft/playwright#42183).
 */
async function open(page: Page, path: string): Promise<Response | null> {
  try {
    return await page.goto(path, { timeout: 15_000 });
  } catch (error) {
    const loaded = await page
      .evaluate(
        (target) => location.pathname === target && document.readyState === 'complete',
        path,
      )
      .catch(() => false);
    if (!loaded) throw error;
    return page.goto(path);
  }
}

const LEGAL = [
  // The long German word carries a soft hyphen for phones.
  { path: '/legal/imprint', title: /^Impressum$/, english: 'Legal notice' },
  { path: '/legal/privacy', title: /^Datenschutz­?erklärung$/, english: 'Privacy policy' },
  { path: '/legal/licenses', title: /^Lizenzen$/, english: 'Licenses' },
] as const;

for (const { path, title, english } of LEGAL) {
  test(`${path} shows the German and the English version`, async ({ page }) => {
    const errors = watchErrors(page);
    const response = await open(page, path);
    expect(response?.status()).toBe(200);

    await expect(page.getByRole('heading', { level: 1 })).toHaveText(title);
    const german = page.locator('section#de[lang="de"]');
    const translation = page.locator('section#en[lang="en"]');
    await expect(german).toBeVisible();
    await expect(translation.getByRole('heading', { level: 2, name: english })).toBeVisible();
    // The versions link to each other.
    await expect(german.getByRole('link', { name: 'English version' })).toHaveAttribute(
      'href',
      '#en',
    );
    await expect(translation.getByRole('link', { name: 'Deutsche Fassung' })).toHaveAttribute(
      'href',
      '#de',
    );
    // Every page's footer links the legal pages.
    const footer = page.getByRole('contentinfo');
    for (const name of ['Impressum', 'Datenschutz', 'Licenses']) {
      await expect(footer.getByRole('link', { name, exact: true })).toBeVisible();
    }
    expect(errors).toEqual([]);
  });
}

test('the licenses page links the full license texts', async ({ page, request }) => {
  await open(page, '/legal/licenses');
  const translation = page.locator('section#en');
  await expect(translation.getByText('Ugoki Sans', { exact: true })).toBeVisible();
  await expect(translation.getByRole('link', { name: 'react', exact: true })).toBeVisible();

  const notices = await request.get('/legal/third-party-notices.txt');
  expect(notices.ok()).toBe(true);
  expect(await notices.text()).toContain('Third-party notices');
  const font = await translation
    .getByRole('link', { name: 'SIL Open Font License 1.1' })
    .first()
    .getAttribute('href');
  expect(font).toMatch(/^\/fonts\/licenses\/.+\.txt$/);
  expect((await request.get(font ?? '')).ok()).toBe(true);
});

test('an unknown address answers 404 with the live 404 page', async ({ page }) => {
  const errors = watchErrors(page);
  const response = await open(page, '/some-missing-page');
  expect(response?.status()).toBe(404);

  await expect(page.getByRole('heading', { level: 1, name: '404' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'See the templates' })).toHaveAttribute(
    'href',
    '/templates',
  );
  await expect(page.getByRole('link', { name: 'Home', exact: true })).toHaveAttribute('href', '/');
  // The engine takes over the stage (its control appears once a frame is painted).
  await expect(page.getByRole('button', { name: 'Pause animation' })).toBeVisible({
    timeout: 20_000,
  });
  // The browser reports the document's own 404 status as a console error.
  expect(errors.filter((error) => !/status of 404/.test(error))).toEqual([]);
});
