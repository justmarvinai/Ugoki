import { Privacy } from '@/features/legal/privacy';
import { pageMetadata } from '@/features/site/metadata';

/** Datenschutzerklärung — German with an English version (docs/02-experience.md §2, ADR-017). */
export const metadata = pageMetadata({
  title: 'Datenschutzerklärung',
  description:
    'Privacy policy of Ugoki: no cookies, no tracking, no accounts — your designs and files stay in your browser. In German and English.',
  path: '/legal/privacy',
});

export default function Page() {
  return <Privacy />;
}
