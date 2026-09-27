/**
 * Template registry (docs/05-architecture.md §9): metadata only — tiny and server-safe, used by
 * static pages, search, sitemap and OG images — plus lazy loaders, which only the render worker
 * calls, so template code never ships to the main thread.
 */

import type { AlphaSupport, AnyTemplate, CategoryId, FormatId, Structure } from '@/engine';

export type TemplateEntry = {
  id: string;
  name: string;
  tagline: string;
  category: CategoryId;
  /** The first format is the default. */
  formats: readonly FormatId[];
  duration: { default: number | 'auto'; min: number; max: number };
  structure: Structure;
  alpha: AlphaSupport;
  tags: readonly string[];
  useCases: readonly string[];
};

export const TEMPLATES: readonly TemplateEntry[] = [
  {
    id: 'rise',
    name: 'Rise',
    tagline: 'Masked line reveal',
    category: 'text-titles',
    formats: ['16:9', '9:16', '1:1', '4:5'],
    duration: { default: 5, min: 3, max: 12 },
    structure: 'in-hold-out',
    alpha: 'optional',
    tags: ['title', 'chapter', 'editorial', 'headline'],
    useCases: ['Chapter titles', 'Keynote headlines', 'Documentary title cards', 'YouTube'],
  },
  {
    id: 'focus',
    name: 'Focus',
    tagline: 'Blur-to-sharp headline',
    category: 'text-titles',
    formats: ['16:9', '9:16', '1:1', '4:5'],
    duration: { default: 5, min: 3, max: 12 },
    structure: 'in-hold-out',
    alpha: 'optional',
    tags: ['title', 'headline', 'announcement', 'blur', 'premium'],
    useCases: ['Announcements', 'Product teasers', 'Keynote statements', 'Premium intros'],
  },
  {
    id: 'decode',
    name: 'Decode',
    tagline: 'Character scramble',
    category: 'text-titles',
    formats: ['16:9', '9:16', '1:1', '4:5'],
    duration: { default: 4, min: 3, max: 10 },
    structure: 'in-hold-out',
    alpha: 'optional',
    tags: ['title', 'tech', 'scramble', 'terminal', 'teaser'],
    useCases: ['Tech launches', 'Teasers', 'Gaming', 'Podcast intros'],
  },
  {
    id: 'line',
    name: 'Line',
    tagline: 'Minimal accent bar',
    category: 'lower-thirds',
    formats: ['16:9', '9:16', '1:1', '4:5'],
    duration: { default: 6, min: 3, max: 20 },
    structure: 'in-hold-out',
    alpha: 'default',
    tags: ['lower third', 'name', 'interview', 'minimal'],
    useCases: ['Interviews', 'Webinars', 'Corporate video', 'Talking heads'],
  },
  {
    id: 'broadcast',
    name: 'Broadcast',
    tagline: 'News block',
    category: 'lower-thirds',
    formats: ['16:9', '9:16', '1:1', '4:5'],
    duration: { default: 6, min: 3, max: 20 },
    structure: 'in-hold-out',
    alpha: 'default',
    tags: ['lower third', 'name', 'news', 'live', 'sports'],
    useCases: ['News-style content', 'Event coverage', 'Live streams', 'Sports'],
  },
  {
    id: 'capsule',
    name: 'Capsule',
    tagline: 'Creator pill',
    category: 'lower-thirds',
    formats: ['9:16', '16:9', '1:1', '4:5'],
    duration: { default: 6, min: 3, max: 20 },
    structure: 'in-hold-out',
    alpha: 'default',
    tags: ['lower third', 'name', 'creator', 'social', 'follow'],
    useCases: ['YouTubers', 'Podcasters', 'Streamers', 'Guest intros'],
  },
  {
    id: 'sheen',
    name: 'Sheen',
    tagline: 'Light sweep',
    category: 'logo-branding',
    formats: ['16:9', '9:16', '1:1', '4:5'],
    duration: { default: 4, min: 3, max: 8 },
    structure: 'in-hold-out',
    alpha: 'optional',
    tags: ['logo', 'reveal', 'light', 'premium'],
    useCases: ['Corporate intros', 'Premium brands', 'End cards', 'Event sponsors'],
  },
  {
    id: 'quote',
    name: 'Quote',
    tagline: 'Big quote',
    category: 'brand-quotes',
    formats: ['1:1', '4:5', '9:16', '16:9'],
    duration: { default: 'auto', min: 5, max: 12 },
    structure: 'in-hold-out',
    alpha: 'optional',
    tags: ['quote', 'testimonial', 'editorial', 'speaker'],
    useCases: ['Quotes', 'Speaker highlights', 'Podcast clips', 'Thought leadership'],
  },
  {
    id: 'review',
    name: 'Review',
    tagline: 'Testimonial with rating',
    category: 'brand-quotes',
    formats: ['1:1', '4:5', '9:16', '16:9'],
    duration: { default: 6, min: 4, max: 12 },
    structure: 'in-hold-out',
    alpha: 'optional',
    tags: ['review', 'testimonial', 'rating', 'stars', 'social proof'],
    useCases: ['Reviews', 'App ratings', 'Customer love', 'Case-study teasers'],
  },
  {
    id: 'numbers',
    name: 'Numbers',
    tagline: 'By the numbers',
    category: 'brand-quotes',
    formats: ['16:9', '1:1', '4:5', '9:16'],
    duration: { default: 6, min: 4, max: 12 },
    structure: 'in-hold-out',
    alpha: 'optional',
    tags: ['stats', 'numbers', 'results', 'data', 'counter'],
    useCases: ['Year in review', 'Investor updates', 'Impact reports', 'Milestones'],
  },
  {
    id: 'layers',
    name: 'Layers',
    tagline: 'Stacked panel wipe',
    category: 'transitions',
    formats: ['16:9', '9:16', '1:1', '4:5'],
    duration: { default: 1.2, min: 0.6, max: 2.4 },
    structure: 'transition',
    alpha: 'default',
    tags: ['transition', 'wipe', 'panels', 'overlay'],
    useCases: ['Vlogs', 'Promos', 'Social edits', 'Scene changes'],
  },
];

const LOADERS: Readonly<Record<string, () => Promise<{ default: AnyTemplate }>>> = {
  rise: () => import('./text-titles/rise'),
  line: () => import('./lower-thirds/line'),
  sheen: () => import('./logo-branding/sheen'),
  layers: () => import('./transitions/layers'),
  focus: () => import('./text-titles/focus'),
  decode: () => import('./text-titles/decode'),
  broadcast: () => import('./lower-thirds/broadcast'),
  capsule: () => import('./lower-thirds/capsule'),
  quote: () => import('./brand-quotes/quote'),
  review: () => import('./brand-quotes/review'),
  numbers: () => import('./brand-quotes/numbers'),
};

export function templateEntry(id: string): TemplateEntry | undefined {
  return TEMPLATES.find((entry) => entry.id === id);
}

/** Loads a template's code (render worker only). */
export async function loadTemplate(id: string): Promise<AnyTemplate> {
  const loader = Object.hasOwn(LOADERS, id) ? LOADERS[id] : undefined;
  if (!loader) throw new Error(`Unknown template "${id}"`);
  return (await loader()).default;
}
