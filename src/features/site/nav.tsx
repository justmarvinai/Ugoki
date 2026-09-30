'use client';

/**
 * The marketing nav (docs/02-experience.md §4.1): wordmark left; *Templates* and a quiet
 * *Start creating* right. Transparent over the hero; once the page scrolls, a solid background
 * with a hairline (no glass). 64 px tall — sticky elements below it use `top-16`.
 */

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Wordmark } from '@/components/wordmark';
import { cn } from '@/lib/cn';

export function SiteNav({ className }: { className?: string }) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 4);
    update();
    window.addEventListener('scroll', update, { passive: true });
    return () => window.removeEventListener('scroll', update);
  }, []);

  return (
    <header
      data-theme="daylight"
      className={cn(
        'sticky top-0 z-40 h-16 bg-transparent transition-[background-color,box-shadow] duration-(--duration-small) ease-swift',
        scrolled && 'bg-bg shadow-[inset_0_-1px_0_var(--line)]',
        className,
      )}
    >
      <nav
        aria-label="Main"
        className="mx-auto flex h-full max-w-[1440px] items-center justify-between gap-4 px-4 md:px-6"
      >
        <Link
          href="/"
          aria-label="Ugoki home"
          className="rounded-sm py-1 text-fg transition-opacity duration-(--duration-micro) hover:opacity-80"
        >
          <Wordmark className="text-[24px] md:text-[26px]" />
        </Link>
        <div className="flex items-center gap-1 md:gap-2">
          <Link
            href="/templates"
            className="inline-flex h-10 items-center rounded-full px-4 text-[15px] font-[550] text-fg-2 transition-colors duration-(--duration-micro) ease-swift hover:bg-bg-2 hover:text-fg"
          >
            Templates
          </Link>
          <Link
            href="/templates"
            className="inline-flex h-10 items-center rounded-full border border-line-strong px-4 text-[15px] font-[550] text-fg transition-colors duration-(--duration-micro) ease-swift hover:bg-bg-2"
          >
            Start creating
          </Link>
        </div>
      </nav>
    </header>
  );
}
