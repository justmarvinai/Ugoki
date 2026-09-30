/**
 * Site-wide metadata (docs/05-architecture.md §14): the site's URL, canonical links, and Open
 * Graph / Twitter cards pointing at the pre-rendered images in `public/og/` (`pnpm og`).
 *
 * The URL is the production domain on every deployment — previews included — so canonical links
 * and the sitemap always name the real site: `NEXT_PUBLIC_SITE_URL` if set, else Vercel's
 * production domain (`VERCEL_PROJECT_PRODUCTION_URL`, set at build time), else localhost.
 *
 * Server-only data: pages and metadata routes import it; nothing here ships to the browser.
 */

import type { Metadata } from 'next';
import type { TemplateEntry } from '@/templates/registry';

export const SITE_NAME = 'Ugoki';
export const TAGLINE = 'Motion, made yours.';
export const DEFAULT_TITLE = `${SITE_NAME} — ${TAGLINE}`;
export const DEFAULT_DESCRIPTION =
  'Art-directed motion templates. Customize in seconds, export in your browser. Free, no sign-up, nothing leaves your device.';

function siteUrl(): URL {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return new URL(explicit);
  const production = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (production) return new URL(`https://${production}`);
  return new URL('http://localhost:3000');
}

export const SITE_URL = siteUrl();

/** Whether this build is the production deployment (previews and local builds are not indexed). */
export const IS_PRODUCTION = process.env.VERCEL_ENV === 'production';

/** An absolute URL on the site, e.g. for the sitemap. */
export const absoluteUrl = (path: `/${string}`) => new URL(path, SITE_URL).href;

/** Keys of the pre-rendered Open Graph images (`public/og/<key>.jpg`, 1200 × 630). */
export type OgKey = 'home' | 'templates' | `templates-${string}` | `template-${string}`;

export const OG_SIZE = { width: 1200, height: 630 } as const;

export const ogImagePath = (key: OgKey) => `/og/${key}.jpg`;

/** A share image entry for Open Graph and Twitter cards. */
export const shareImage = (key: OgKey, alt: string) => ({
  url: ogImagePath(key),
  ...OG_SIZE,
  type: 'image/jpeg',
  alt,
});

type PageMetadataOptions = {
  /** The page title (the root layout appends "· Ugoki"); omit for the default title. */
  title?: string;
  description: string;
  /** The page's path, e.g. `/templates/social` — its canonical URL. */
  path: `/${string}`;
  /** Which Open Graph image to show when the page is shared. */
  og?: OgKey;
  /** Keep the page out of search results. */
  noindex?: boolean;
};

/** Metadata for a page: title, description, canonical URL and share cards. */
export function pageMetadata({
  title,
  description,
  path,
  og = 'home',
  noindex = false,
}: PageMetadataOptions): Metadata {
  const shareTitle = title ? `${title} · ${SITE_NAME}` : DEFAULT_TITLE;
  const image = shareImage(og, shareTitle);
  return {
    ...(title ? { title } : { title: { absolute: DEFAULT_TITLE } }),
    description,
    alternates: { canonical: path },
    openGraph: {
      type: 'website',
      siteName: SITE_NAME,
      locale: 'en_US',
      url: path,
      title: shareTitle,
      description,
      images: [image],
    },
    twitter: {
      card: 'summary_large_image',
      title: shareTitle,
      description,
      images: [image],
    },
    ...(noindex ? { robots: { index: false, follow: false } } : {}),
  };
}

export const landingMetadata: Metadata = pageMetadata({
  description: DEFAULT_DESCRIPTION,
  path: '/',
  og: 'home',
});

/**
 * "Chapter titles" → "chapter titles", for use mid-sentence; names keep their case ("YouTube",
 * "AI features", "Black Friday", "App Store previews").
 */
function midSentence(phrase: string): string {
  const [first = '', second = ''] = phrase.split(' ');
  const plain = /^[A-Z][a-z'-]*$/.test(first) && !/^[A-Z]/.test(second);
  return plain ? phrase.charAt(0).toLowerCase() + phrase.slice(1) : phrase;
}

const list = (items: readonly string[]) =>
  items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;

/** Search description of a template's editor page, from its registry entry. */
export function templateDescription(entry: Pick<TemplateEntry, 'useCases' | 'alpha'>): string {
  const uses = list(entry.useCases.slice(0, 3).map(midSentence));
  const video = entry.alpha === 'default' ? 'transparent video' : 'video';
  return `A free motion template for ${uses}. Make it yours and export ${video} in your browser — no sign-up.`;
}
