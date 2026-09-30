import type { MetadataRoute } from 'next';
import { CATEGORY_PAGES } from '@/features/gallery/catalog';
import { absoluteUrl } from '@/features/site/metadata';
import { TEMPLATES } from '@/templates/registry';

/** Prerendered at build time, never a function (docs/05-architecture.md §5). */
export const dynamic = 'force-static';

/**
 * When the listed pages last changed: the date of the release that changed them (not the build's,
 * which would claim every deploy changed every page). Update it with releases.
 */
const LAST_MODIFIED = '2026-09-30';

/** Every public page (docs/05-architecture.md §14); the Lab stays out. */
export default function sitemap(): MetadataRoute.Sitemap {
  const paths: `/${string}`[] = [
    '/',
    '/templates',
    ...CATEGORY_PAGES.map((page) => `/templates/${page.id}` as const),
    ...TEMPLATES.map((entry) => `/editor/${entry.id}` as const),
    '/legal/imprint',
    '/legal/privacy',
    '/legal/licenses',
  ];
  return paths.map((path) => ({ url: absoluteUrl(path), lastModified: LAST_MODIFIED }));
}
