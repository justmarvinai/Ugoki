import type { Metadata } from 'next';
import { ALL_PAGE } from '@/features/gallery/catalog';
import { GalleryIntro } from '@/features/gallery/intro';
import { pageMetadata } from '@/features/site/metadata';

export const metadata: Metadata = pageMetadata({
  title: ALL_PAGE.title,
  description: ALL_PAGE.description,
  path: '/templates',
  og: 'templates',
});

/** Every template (docs/02-experience.md §5); the gallery itself is the layout. */
export default function TemplatesPage() {
  return <GalleryIntro heading={ALL_PAGE.heading} intro={ALL_PAGE.intro} />;
}
