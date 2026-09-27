import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Editor } from '@/features/editor/editor';
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
  return {
    title: entry ? `${entry.name} — ${entry.tagline}` : 'Editor',
    description: entry
      ? `Make ${entry.name} yours: edit the text, colors and timing, and export video in your browser.`
      : undefined,
  };
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
