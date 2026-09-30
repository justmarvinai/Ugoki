/**
 * The legal pages' shell (docs/02-experience.md §2, ADR-017): Daylight, German first and then the
 * English version, each a `section` with its `lang`, linked to each other at the top. Body type is
 * 17 px on a 68ch measure inside the 1440 px column; from 1024 px a quiet index of the legal pages
 * sits beside the text. Server-rendered; no client code of its own.
 */

import Link from 'next/link';
import type { ReactNode } from 'react';
import { SiteFooter } from '@/features/site/footer';
import { SiteNav } from '@/features/site/nav';
import { cn } from '@/lib/cn';

export type LegalPath = '/legal/imprint' | '/legal/privacy' | '/legal/licenses';

const PAGES: ReadonlyArray<{ href: LegalPath; label: string; lang?: 'de' }> = [
  { href: '/legal/imprint', label: 'Impressum', lang: 'de' },
  { href: '/legal/privacy', label: 'Datenschutz', lang: 'de' },
  { href: '/legal/licenses', label: 'Licenses' },
];

/** Text links inside legal copy. */
export const linkClass =
  'rounded-[2px] text-fg underline decoration-line-strong decoration-1 underline-offset-[0.2em] transition-[text-decoration-color] duration-(--duration-micro) ease-swift hover:decoration-fg';

/** The display title of a version (the German h1, the English h2). */
const titleClass = 'text-display-l font-stretch-112% text-balance';

type Version = {
  /** The version's title: the page's h1 (German) or the English section's h2. */
  title: string;
  /** One short paragraph under the title. */
  lead?: ReactNode;
  /** "Stand: …" / "Last updated: …". */
  updated?: string;
  /** A quiet note under the English title (e.g. that the German version is authoritative). */
  note?: ReactNode;
  children: ReactNode;
};

export function LegalPage({ path, de, en }: { path: LegalPath; de: Version; en: Version }) {
  return (
    <>
      <SiteNav />
      <main data-theme="daylight" className="bg-bg text-fg">
        <div className="mx-auto max-w-[1440px] px-4 pt-14 pb-24 md:px-6 md:pt-20 md:pb-32 lg:grid lg:grid-cols-12 lg:gap-x-6 3xl:pt-28">
          <aside className="hidden lg:col-span-3 lg:block">
            <LegalIndex path={path} />
          </aside>
          <article className="lg:col-span-9">
            <section
              id="de"
              lang="de"
              aria-labelledby="legal-title"
              className="scroll-mt-24 text-body text-fg-2"
            >
              <header>
                <h1 id="legal-title" className={cn(titleClass, 'text-fg')}>
                  {de.title}
                </h1>
                {de.lead ? (
                  <div className="mt-6 max-w-[58ch] text-body-l text-fg-2">{de.lead}</div>
                ) : null}
                <Jump href="#en" lang="en" label="English version" arrow="↓" updated={de.updated} />
              </header>
              <div className="max-w-[68ch]">{de.children}</div>
            </section>
            <section
              id="en"
              lang="en"
              aria-labelledby="legal-title-en"
              className="mt-24 scroll-mt-24 border-line border-t pt-16 text-body text-fg-2 md:mt-32 md:pt-24"
            >
              <header>
                <h2 id="legal-title-en" className={cn(titleClass, 'text-fg')}>
                  {en.title}
                </h2>
                {en.lead ? (
                  <div className="mt-6 max-w-[58ch] text-body-l text-fg-2">{en.lead}</div>
                ) : null}
                <Jump
                  href="#de"
                  lang="de"
                  label="Deutsche Fassung"
                  arrow="↑"
                  updated={en.updated}
                />
                {en.note ? <p className="mt-3 text-small text-fg-3">{en.note}</p> : null}
              </header>
              <div className="max-w-[68ch]">{en.children}</div>
            </section>
          </article>
        </div>
      </main>
      <SiteFooter theme="daylight" />
    </>
  );
}

/** The link to the other language version, with the date of the text. */
function Jump({
  href,
  lang,
  label,
  arrow,
  updated,
}: {
  href: '#de' | '#en';
  lang: 'de' | 'en';
  label: string;
  arrow: string;
  updated?: string;
}) {
  return (
    <p className="mt-8 flex flex-wrap items-center gap-x-4 gap-y-2 text-small text-fg-3">
      <a
        href={href}
        lang={lang}
        hrefLang={lang}
        className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line-strong px-4 font-[550] text-fg transition-colors duration-(--duration-micro) ease-swift hover:bg-bg-2 md:min-h-9"
      >
        {label}
        <span aria-hidden="true">{arrow}</span>
      </a>
      {updated ? <span>{updated}</span> : null}
    </p>
  );
}

/** The legal pages, for moving between them (desktop only; the footer links them everywhere). */
function LegalIndex({ path }: { path: LegalPath }) {
  return (
    <nav aria-label="Legal pages" className="sticky top-28 pt-3">
      <ul className="space-y-1 text-small">
        {PAGES.map((page) => {
          const current = page.href === path;
          return (
            <li key={page.href}>
              <Link
                href={page.href}
                lang={page.lang}
                aria-current={current ? 'page' : undefined}
                className={cn(
                  'group inline-flex min-h-8 items-center gap-3 rounded-sm transition-colors duration-(--duration-micro) ease-swift',
                  current ? 'font-[600] text-fg' : 'text-fg-3 hover:text-fg',
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    'h-px w-4 bg-current transition-[width] duration-(--duration-small) ease-glide',
                    current ? 'w-6' : 'opacity-40 group-hover:w-6',
                  )}
                />
                {page.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
