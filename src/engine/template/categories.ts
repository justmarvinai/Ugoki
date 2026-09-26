/** The ten launch categories (docs/templates/README.md). Order is the gallery order. */

export const CATEGORIES = [
  { id: 'text-titles', name: 'Text & Titles' },
  { id: 'lower-thirds', name: 'Lower Thirds' },
  { id: 'social', name: 'Social' },
  { id: 'product-ads', name: 'Product & Ads' },
  { id: 'showcase', name: 'Showcase' },
  { id: 'brand-quotes', name: 'Brand & Quotes' },
  { id: 'openers', name: 'Openers' },
  { id: 'transitions', name: 'Transitions' },
  { id: 'logo-branding', name: 'Logo & Branding' },
  { id: 'ui-motion', name: 'UI / Product Motion' },
] as const;

export type CategoryId = (typeof CATEGORIES)[number]['id'];

export function categoryName(id: CategoryId): string {
  return CATEGORIES.find((category) => category.id === id)?.name ?? id;
}
