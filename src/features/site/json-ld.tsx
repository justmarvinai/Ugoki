import { DEFAULT_DESCRIPTION, SITE_NAME, SITE_URL } from './metadata';

/** Ugoki as a free web app (schema.org `SoftwareApplication`). */
const APPLICATION = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: SITE_NAME,
  applicationCategory: 'MultimediaApplication',
  operatingSystem: 'Any (web browser)',
  url: SITE_URL.href,
  description: DEFAULT_DESCRIPTION,
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
  isAccessibleForFree: true,
};

/** JSON for a `<script>` element: `<` escaped, so no string in it can close the element. */
const scriptJson = (value: unknown) => JSON.stringify(value).replace(/</g, '\\u003c');

/** Structured data for the landing page (docs/05-architecture.md §14). */
export function LandingJsonLd() {
  return (
    <script
      type="application/ld+json"
      // biome-ignore lint/security/noDangerouslySetInnerHtml: constant data, `<` escaped.
      dangerouslySetInnerHTML={{ __html: scriptJson(APPLICATION) }}
    />
  );
}
