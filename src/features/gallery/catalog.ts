/**
 * The gallery's content (docs/02-experience.md §5): the ten category pages with their copy
 * (a heading and an intro for people, metadata for search engines), template search, and links
 * into the editor that carry the gallery's choices. Server-safe plain data and functions: the
 * static pages use it as much as the client gallery does.
 */

import { CATEGORIES, type CategoryId, categoryName, type FormatId } from '@/engine/host';
import { TEMPLATES, type TemplateEntry } from '@/templates/registry';

export type CategoryPage = {
  id: CategoryId;
  /** The tab's label. */
  name: string;
  /** The page's H1. */
  heading: string;
  /** One or two sentences under the heading. */
  intro: string;
  /** Metadata: the document title (the root layout appends "· Ugoki") and description. */
  title: string;
  description: string;
};

/** `/templates`: every template. */
export const ALL_PAGE = {
  name: 'All',
  heading: 'Motion templates',
  intro:
    'Art-directed titles, lower thirds, social posts, ads, openers and transitions. Type your headline above to see it in every one, then open one to make it yours.',
  title: 'Motion templates',
  description:
    'Art-directed motion templates for titles, lower thirds, social video, ads, openers, transitions and logos. Customize them and export video in your browser — free, no sign-up.',
} as const;

const COPY: Record<CategoryId, Omit<CategoryPage, 'id' | 'name'>> = {
  'text-titles': {
    heading: 'Text and title animations',
    intro:
      'Headlines that arrive with intent: masked line reveals, blur-to-sharp focus pulls and character scrambles for chapter titles, announcements and YouTube intros.',
    title: 'Text and title animation templates',
    description:
      'Animated titles and headlines — line reveals, focus pulls and scrambles. Type your words, pick a look and export MP4 or transparent video in your browser.',
  },
  'lower-thirds': {
    heading: 'Lower thirds',
    intro:
      'Name and title overlays for interviews, webinars, streams and news-style videos. They export with a transparent background, ready to drop over your footage in Premiere, Resolve or CapCut.',
    title: 'Lower third templates',
    description:
      'Animated lower thirds for interviews, podcasts and live streams. Export transparent WebM or a PNG sequence, made in your browser — free, no sign-up.',
  },
  social: {
    heading: 'Social video templates',
    intro:
      'Hooks, numbered tips and countdowns made for Reels, TikTok and Shorts. Vertical first, and just as sharp in square or landscape.',
    title: 'Social video templates for Reels, TikTok and Shorts',
    description:
      'Kinetic hooks, listicles and launch countdowns for Reels, TikTok and Shorts. Edit the text and export vertical, square or landscape video in your browser.',
  },
  'product-ads': {
    heading: 'Product and ad templates',
    intro:
      'Price drops, promo codes and sale tape that make an offer hard to miss. Put in your product and prices, then export for any feed.',
    title: 'Product and ad video templates',
    description:
      'Animated price drops and sale promos for e-commerce and social ads. Add your product, prices and code, and export square, vertical or landscape video.',
  },
  showcase: {
    heading: 'Showcase templates',
    intro:
      'Portfolio reels and photo stacks for your best work — studio reels, travel recaps and collection launches, with your own images.',
    title: 'Portfolio and photo showcase templates',
    description:
      'Parallax portfolio reels and photo stacks. Add your images on your device — nothing is uploaded — and export a reel in minutes.',
  },
  'brand-quotes': {
    heading: 'Quote and testimonial templates',
    intro:
      'Big quotes, five-star reviews and by-the-numbers stats that let your words and results do the talking.',
    title: 'Quote, review and stats templates',
    description:
      'Animated quotes, customer reviews with ratings and counting stats for social posts, reports and case studies. Edit and export in your browser.',
  },
  openers: {
    heading: 'Video openers',
    intro:
      'Title sequences for films, series and podcasts: a letterboxed film title or a quick episode opener that starts your video with intent.',
    title: 'Video opener and intro templates',
    description:
      'Cinematic film titles and series openers for YouTube, podcasts and short films. Customize the titles and export an intro in your browser.',
  },
  transitions: {
    heading: 'Transitions',
    intro:
      'Panel wipes, circle bursts and strip slices that cover the cut between two clips. Transparent overlays with the cut frame marked, ready for your editor.',
    title: 'Video transition templates',
    description:
      'Graphic transitions — panel wipes, iris bursts and blinds — as transparent overlays with the cut point marked. Export WebM or PNG sequences for your editor.',
  },
  'logo-branding': {
    heading: 'Logo animations',
    intro:
      'Logo reveals, from a premium light sweep to a playful drop. Add your logo as SVG or PNG and export an intro or an end card.',
    title: 'Logo animation templates',
    description:
      'Animate your logo with a light sweep or a playful bounce. Use SVG or PNG, keep it on your device and export an intro or end card in your browser.',
  },
  'ui-motion': {
    heading: 'UI and product motion',
    intro:
      'Cursor demos and dashboard builds that show how your product works — for SaaS launches, onboarding clips and investor updates.',
    title: 'UI and product demo templates',
    description:
      'Animated product demos: a cursor clicking through an interface and a dashboard building itself. Edit the copy and figures and export video in your browser.',
  },
};

export const CATEGORY_PAGES: readonly CategoryPage[] = CATEGORIES.map(({ id, name }) => ({
  id,
  name,
  ...COPY[id],
}));

export function categoryPage(id: string): CategoryPage | undefined {
  return CATEGORY_PAGES.find((page) => page.id === id);
}

export function isCategoryId(value: unknown): value is CategoryId {
  return CATEGORIES.some((category) => category.id === value);
}

/** Templates per category (the tabs' counts). */
export function categoryCount(id: CategoryId | null): number {
  return id === null ? TEMPLATES.length : TEMPLATES.filter((t) => t.category === id).length;
}

// --- search ---------------------------------------------------------------------------------

/** Lowercase, without diacritics ("Café" matches "cafe"). */
const fold = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

/** A query word, loosely singular ("reels" finds "reel", "weddings" finds "Wedding films"). */
const stem = (word: string) =>
  word.length > 3 && word.endsWith('s') && !word.endsWith('ss') ? word.slice(0, -1) : word;

const haystacks = new Map<string, string>();

function haystack(entry: TemplateEntry): string {
  let text = haystacks.get(entry.id);
  if (text === undefined) {
    text = fold(
      [
        entry.name,
        entry.tagline,
        categoryName(entry.category),
        ...entry.tags,
        ...entry.useCases,
      ].join(' · '),
    );
    haystacks.set(entry.id, text);
  }
  return text;
}

/**
 * Whether a template matches a search: every word of the query appears in its name, one-liner,
 * category, tags or use cases ("podcast", "wedding", "YouTube", "sale").
 */
export function matchesQuery(entry: TemplateEntry, query: string): boolean {
  const words = fold(query)
    .split(/[\s,]+/)
    .filter(Boolean)
    .map(stem);
  if (words.length === 0) return true;
  const text = haystack(entry);
  return words.every((word) => text.includes(word));
}

// --- links into the editor ------------------------------------------------------------------

export type EditorChoices = {
  /** The gallery's format; left out when it is the template's own first format. */
  format?: FormatId;
  /** Personalization text for the template's primary text. */
  headline?: string;
  /** A Look other than the first. */
  look?: number;
};

/** The format a template shows in: the gallery's, or its first when it lacks that one. */
export function formatFor(formats: readonly FormatId[], format: FormatId): FormatId {
  return formats.includes(format) ? format : (formats[0] ?? format);
}

/**
 * The editor link for a template with the gallery's choices (docs/02-experience.md §3, flow A):
 * `?headline=`, `?format=` and `?look=`, each only when it changes something.
 */
export function editorHref(entry: TemplateEntry, choices: EditorChoices = {}): `/editor/${string}` {
  const params: string[] = [];
  const headline = choices.headline?.trim();
  if (headline) params.push(`headline=${encodeURIComponent(headline)}`);
  if (choices.format) {
    const format = formatFor(entry.formats, choices.format);
    if (format !== entry.formats[0]) params.push(`format=${format}`);
  }
  if (choices.look !== undefined && choices.look > 0) params.push(`look=${choices.look}`);
  return `/editor/${entry.id}${params.length > 0 ? `?${params.join('&')}` : ''}`;
}
