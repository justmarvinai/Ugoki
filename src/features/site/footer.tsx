/**
 * The site footer (docs/02-experience.md §4.7): © Ugoki · Impressum · Datenschutz · Licenses ·
 * 動き — movement. Themed by where it sits (Cinema under the landing's finale, Daylight on the
 * legal pages and the 404). 動き is set in M PLUS 1 (two glyphs, ~1 KB, loaded on use) — the
 * quiet secondary signature of docs/03-design-system.md §2.
 */

import Link from 'next/link';
import { ugokiJp } from '@/app/fonts';
import { cn } from '@/lib/cn';

const LINKS = [
  { href: '/legal/imprint', label: 'Impressum', lang: 'de' },
  { href: '/legal/privacy', label: 'Datenschutz', lang: 'de' },
  { href: '/legal/licenses', label: 'Licenses', lang: undefined },
] as const;

export function SiteFooter({
  theme,
  className,
}: {
  theme?: 'daylight' | 'cinema';
  className?: string;
}) {
  return (
    <footer data-theme={theme} className={cn('bg-bg text-fg-3 text-small', className)}>
      <div className="mx-auto max-w-[1440px] px-4 md:px-6">
        {/* Phones: the links on one row, © and 動き beneath. From md: one row, 動き on the right. */}
        <div className="grid grid-cols-[1fr_auto] items-center gap-y-3 border-line border-t py-8 md:flex md:gap-8 md:py-10">
          <span>© Ugoki</span>
          <nav
            aria-label="Legal"
            className="col-span-2 row-start-1 -ml-1 flex flex-wrap items-center gap-x-4 md:ml-0 md:gap-x-6"
          >
            {LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                lang={link.lang}
                className="inline-flex min-h-11 items-center rounded-sm px-1 text-fg-2 underline-offset-4 transition-colors duration-(--duration-micro) ease-swift hover:text-fg hover:underline md:min-h-8 md:px-0"
              >
                {link.label}
              </Link>
            ))}
          </nav>
          <p className="flex items-baseline gap-2.5 justify-self-end md:ml-auto">
            <span lang="ja" className={cn(ugokiJp.className, 'text-[17px] text-fg-2 leading-none')}>
              動き
            </span>
            <span aria-hidden="true">—</span>
            <span>movement</span>
          </p>
        </div>
      </div>
    </footer>
  );
}
