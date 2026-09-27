import type { Metadata } from 'next';
import { TemplateChooser } from '@/features/gallery/chooser';

export const metadata: Metadata = {
  title: 'Templates',
  description: 'Art-directed motion templates: pick one, make it yours, export in your browser.',
};

/**
 * Choose a template. A plain list for now — the gallery with live previews and categories
 * arrives with the gallery phase (docs/02-experience.md §5).
 */
export default function TemplatesPage() {
  return <TemplateChooser />;
}
