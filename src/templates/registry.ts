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
