/**
 * Building blocks for legal copy (server components): topics with a heading, address blocks,
 * lists and links in the legal pages' type (docs/03-design-system.md §5: body 17 px / 1.5).
 */

import type { ReactNode } from 'react';
import { linkClass } from './legal-page';
import { OPERATOR, OPERATOR_COMPLETE } from './operator';

/**
 * One topic: a heading and its paragraphs. German topics are h2 (under the page's h1); English
 * ones h3 (under the English version's h2).
 */
export function Topic({
  id,
  title,
  level = 2,
  children,
}: {
  /** An anchor for links to this topic. */
  id?: string;
  title: ReactNode;
  level?: 2 | 3;
  children: ReactNode;
}) {
  const Heading = level === 2 ? 'h2' : 'h3';
  return (
    <section id={id} className="mt-12 scroll-mt-24 md:mt-14">
      <Heading className="text-balance font-[650] text-[20px] text-fg leading-[1.3] tracking-[-0.01em]">
        {title}
      </Heading>
      <div className="mt-3 space-y-4">{children}</div>
    </section>
  );
}

/** A bulleted list. */
export function List({ children }: { children: ReactNode }) {
  return <ul className="list-disc space-y-1.5 pl-5 marker:text-fg-3">{children}</ul>;
}

/** An external link (no referrer is sent). */
export function External({ href, children }: { href: `https://${string}`; children: ReactNode }) {
  return (
    <a href={href} rel="noreferrer" className={linkClass}>
      {children}
    </a>
  );
}

/** The operator's name and postal address, one line each. */
export function OperatorAddress({ lang }: { lang: 'de' | 'en' }) {
  return (
    <address className="text-fg not-italic">
      {OPERATOR.name}
      <br />
      {OPERATOR.street}
      <br />
      {OPERATOR.city}
      <br />
      {OPERATOR.country[lang]}
    </address>
  );
}

/** The operator's email address — a mailto link once the real address is filled in. */
export function OperatorEmail() {
  if (!OPERATOR_COMPLETE) return <span className="text-fg">{OPERATOR.email}</span>;
  return (
    <a href={`mailto:${OPERATOR.email}`} className={linkClass}>
      {OPERATOR.email}
    </a>
  );
}
