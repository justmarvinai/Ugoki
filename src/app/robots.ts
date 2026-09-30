import type { MetadataRoute } from 'next';
import { absoluteUrl, IS_PRODUCTION } from '@/features/site/metadata';

/** Prerendered at build time, never a function (docs/05-architecture.md §5). */
export const dynamic = 'force-static';

/**
 * Production is open to crawlers except the Lab (a 404 there anyway); preview deployments and
 * local builds keep out of search altogether.
 */
export default function robots(): MetadataRoute.Robots {
  if (!IS_PRODUCTION) return { rules: { userAgent: '*', disallow: '/' } };
  return {
    rules: { userAgent: '*', allow: '/', disallow: '/lab' },
    sitemap: absoluteUrl('/sitemap.xml'),
  };
}
