import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CATEGORY_PAGES, categoryPage } from '@/features/gallery/catalog';
import { GalleryIntro } from '@/features/gallery/intro';
import { pageMetadata } from '@/features/site/metadata';

/** One prerendered page per category (docs/05-architecture.md §5); anything else is a 404. */
export const dynamicParams = false;

export function generateStaticParams() {
  return CATEGORY_PAGES.map((page) => ({ category: page.id }));
}

export async function generateMetadata({
  params,
}: PageProps<'/templates/[category]'>): Promise<Metadata> {
  const page = categoryPage((await params).category);
  if (!page) return {};
  return pageMetadata({
    title: page.title,
    description: page.description,
    path: `/templates/${page.id}`,
    og: `templates-${page.id}`,
  });
}

/** A category's heading and intro; the gallery (the layout) shows its templates. */
export default async function CategoryPage({ params }: PageProps<'/templates/[category]'>) {
  const page = categoryPage((await params).category);
  if (!page) notFound();
  return <GalleryIntro heading={page.heading} intro={page.intro} />;
}
