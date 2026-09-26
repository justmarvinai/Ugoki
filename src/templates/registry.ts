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
];

const LOADERS: Readonly<Record<string, () => Promise<{ default: AnyTemplate }>>> = {
  rise: () => import('./text-titles/rise'),
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
