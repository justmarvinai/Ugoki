/**
 * Inspector layout (docs/02-experience.md §6): sections with a title, and labelled fields with
 * an optional value readout. `control` marks the field of a template control, so clicking its
 * element on the stage can bring it into view and focus it.
 */

import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export function Group({
  title,
  sticky = false,
  children,
}: {
  title: string;
  /** Keeps the title in view while the section scrolls (the editor's single column). */
  sticky?: boolean;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3 border-line border-b px-5 pb-5">
      <h2
        className={cn(
          'pt-5 text-[13px] font-[650] text-fg',
          sticky && 'sticky top-0 z-10 -mx-5 bg-bg-2 px-5 pb-2',
        )}
      >
        {title}
      </h2>
      {children}
    </section>
  );
}

export function Field({
  label,
  value,
  htmlFor,
  control,
  children,
}: {
  label: string;
  value?: string | undefined;
  htmlFor?: string;
  /** The template control this field edits. */
  control?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5" data-control={control}>
      <div className="flex items-baseline justify-between text-[12px]">
        <label htmlFor={htmlFor} className="text-fg-2">
          {label}
        </label>
        {value && <span className="font-mono text-fg-3 tabular-nums">{value}</span>}
      </div>
      {children}
    </div>
  );
}
