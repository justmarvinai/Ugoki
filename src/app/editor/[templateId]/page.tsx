import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Editor } from '@/features/editor/editor';
import { pageMetadata, templateDescription } from '@/features/site/metadata';
import { TEMPLATES } from '@/templates/registry';

/** One prerendered editor per template (docs/05-architecture.md §5); anything else is a 404. */
export const dynamicParams = false;

export function generateStaticParams() {
  return TEMPLATES.map((entry) => ({ templateId: entry.id }));
}

const entryOf = (id: string) => TEMPLATES.find((entry) => entry.id === id);

export async function generateMetadata({
  params,
}: PageProps<'/editor/[templateId]'>): Promise<Metadata> {
  const entry = entryOf((await params).templateId);
  if (!entry) return { title: 'Editor' };
  return pageMetadata({
    title: `${entry.name} — ${entry.tagline}`,
    description: templateDescription(entry),
    path: `/editor/${entry.id}`,
    og: `template-${entry.id}`,
  });
}

/**
 * The editor (docs/02-experience.md §6): a static shell per template; the design comes from a
 * share link (`#d=`) or a local draft (`?draft=`), read on the device.
 */
export default async function EditorPage({ params }: PageProps<'/editor/[templateId]'>) {
  const entry = entryOf((await params).templateId);
  if (!entry) notFound();
  return <Editor entry={entry} />;
}
