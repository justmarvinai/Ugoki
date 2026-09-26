import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Lab } from '@/features/lab/lab';

export const metadata: Metadata = {
  title: 'Lab',
  robots: { index: false, follow: false },
};

/**
 * The template workbench (docs/06-engine.md §14). Built into local and preview deployments so
 * templates can be reviewed there; production deployments answer 404.
 */
export default function LabPage() {
  if (process.env.VERCEL_ENV === 'production') notFound();
  return <Lab />;
}
