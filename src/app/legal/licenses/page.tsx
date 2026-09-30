import { Licenses } from '@/features/legal/licenses';
import { pageMetadata } from '@/features/site/metadata';

/** Licenses — fonts and open-source software (docs/02-experience.md §2). */
export const metadata = pageMetadata({
  title: 'Licenses',
  description:
    'The typefaces and open-source software Ugoki is built on, with their licenses. In German and English.',
  path: '/legal/licenses',
});

export default function Page() {
  return <Licenses />;
}
