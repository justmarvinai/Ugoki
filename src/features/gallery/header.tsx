'use client';

/**
 * The gallery header (docs/02-experience.md §5): wordmark · the personalization field — the
 * gallery's real onboarding: one keystroke and every preview says your words — · the format
 * control · *Recent*. One 64 px row from tablets up; stacked on phones.
 */

import Link from 'next/link';
import type { ReactNode } from 'react';
import { SegmentedControl } from '@/components/segmented-control';
import { Wordmark } from '@/components/wordmark';
import { FORMAT_IDS, FORMATS, type FormatId } from '@/engine/host';
import { chooseFormat, clearHeadline, HEADLINE_MAX, typeHeadline } from './choices';
import { ClearIcon, TypeIcon } from './icons';

type GalleryHeaderProps = {
  text: string;
  format: FormatId;
  /** The *Recent* drafts popover. */
  recent: ReactNode;
};

export function GalleryHeader({ text, format, recent }: GalleryHeaderProps) {
  return (
    <header className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-3 px-4 pt-3 pb-4 md:flex md:h-16 md:gap-6 md:px-6 md:py-0 3xl:px-8">
      <Link
        href="/"
        aria-label="Ugoki home"
        className="justify-self-start rounded-sm py-1 text-fg transition-opacity duration-(--duration-micro) hover:opacity-80"
      >
        <Wordmark className="text-[22px] md:text-[24px]" />
      </Link>
      <div className="col-span-2 row-start-2 md:mx-auto md:w-full md:max-w-[600px] md:min-w-0 md:flex-1 3xl:max-w-[720px]">
        <HeadlineField text={text} />
      </div>
      <SegmentedControl
        label="Format"
        value={format}
        options={FORMAT_IDS.map((id) => ({
          value: id,
          label: id,
          ariaLabel: `${id} ${FORMATS[id].label}`,
        }))}
        onValueChange={chooseFormat}
        className="col-span-2 row-start-3 w-full md:w-auto md:shrink-0"
      />
      <div className="col-start-2 row-start-1 justify-self-end md:shrink-0">{recent}</div>
    </header>
  );
}

/** "Type a headline to preview it everywhere": every tile's primary text follows it. */
function HeadlineField({ text }: { text: string }) {
  return (
    <div className="flex h-11 items-center rounded-full bg-bg-3 ring-1 ring-line transition-shadow duration-(--duration-micro) ease-swift outline-offset-2 hover:ring-line-strong has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-focus">
      <TypeIcon size={18} className="pointer-events-none ml-4 shrink-0 text-fg-3" />
      <input
        type="text"
        aria-label="Your headline"
        placeholder="Type a headline to preview it everywhere"
        value={text}
        maxLength={HEADLINE_MAX}
        autoComplete="off"
        spellCheck={false}
        enterKeyHint="done"
        onChange={(event) => typeHeadline(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && text) clearHeadline();
          if (event.key === 'Enter') event.currentTarget.blur();
        }}
        className="h-full min-w-0 flex-1 truncate bg-transparent pr-3 pl-3 text-[15px] font-[500] text-fg outline-none placeholder:font-[450] placeholder:text-fg-3 focus-visible:outline-none"
      />
      {text && (
        <button
          type="button"
          aria-label="Clear the headline"
          onClick={clearHeadline}
          className="mr-1.5 inline-flex size-8 shrink-0 items-center justify-center rounded-full text-fg-3 transition-colors duration-(--duration-micro) hover:bg-bg-4 hover:text-fg"
        >
          <ClearIcon size={16} />
        </button>
      )}
    </div>
  );
}
