import { Imprint } from '@/features/legal/imprint';
import { pageMetadata } from '@/features/site/metadata';

/** Impressum — German with an English version (docs/02-experience.md §2, ADR-017). */
export const metadata = pageMetadata({
  title: 'Impressum',
  description: 'Impressum (legal notice) of Ugoki: who runs this site and how to reach them.',
  path: '/legal/imprint',
});

export default function Page() {
  return <Imprint />;
}
