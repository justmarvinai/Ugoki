/**
 * Built-in placeholder artwork (docs/templates/00-foundations.md §7): templates look finished
 * before the user adds anything — without stock imagery. Logos are vector (from SVG), so vector
 * effects work on the defaults too.
 */

import { PLACEHOLDER_LOGOS, type PlaceholderLogoId } from './placeholder-logos';
import { importSvg } from './svg';
import type { Graphic } from './types';

export type PlaceholderKind = 'logo' | 'image';

/** Placeholder ids a control of each kind accepts (first = the usual default). */
export const PLACEHOLDERS: Readonly<Record<PlaceholderKind, readonly string[]>> = {
  logo: ['nova', 'halden', 'aero'] satisfies PlaceholderLogoId[],
  image: [],
};

export const PLACEHOLDER_NAMES: Readonly<Record<string, string>> = {
  nova: 'Nova',
  halden: 'Halden',
  aero: 'Aero',
};

const cache = new Map<string, Graphic>();

/** The artwork of a placeholder id, or null if the id is unknown. */
export function placeholderGraphic(id: string): Graphic | null {
  const cached = cache.get(id);
  if (cached) return cached;
  if (!Object.hasOwn(PLACEHOLDER_LOGOS, id)) return null;
  const result = importSvg(PLACEHOLDER_LOGOS[id as PlaceholderLogoId]);
  if (!result.ok) throw new Error(`Placeholder "${id}" failed to import: ${result.detail}`);
  cache.set(id, result.graphic);
  return result.graphic;
}

export function isPlaceholder(kind: PlaceholderKind, id: string): boolean {
  return PLACEHOLDERS[kind].includes(id);
}
