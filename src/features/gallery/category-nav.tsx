'use client';

/**
 * The category nav (docs/02-experience.md §5, docs/03-design-system.md §8): sticky, large text
 * tabs with subtle counts and a 2 px underline that slides to the current page on the `snappy`
 * spring; it scrolls sideways on narrow screens. Search sits at its end (`/` focuses it); on
 * phones it opens over the tabs.
 */

import { motion } from 'motion/react';
import Link from 'next/link';
import { type RefObject, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { uiSpring } from '@/design/motion';
import type { CategoryId } from '@/engine/host';
import { cn } from '@/lib/cn';
import { ALL_PAGE, CATEGORY_PAGES, categoryCount } from './catalog';
import { ClearIcon, SearchIcon } from './icons';

type CategoryNavProps = {
  active: CategoryId | null;
  query: string;
  onQuery: (query: string) => void;
  search: RefObject<HTMLInputElement | null>;
  /** The search opens over the tabs (phones). */
  searching: boolean;
  onSearching: (open: boolean) => void;
};

const TABS: readonly { id: CategoryId | null; name: string }[] = [
  { id: null, name: ALL_PAGE.name },
  ...CATEGORY_PAGES.map(({ id, name }) => ({ id, name })),
];

export function CategoryNav({
  active,
  query,
  onQuery,
  search,
  searching,
  onSearching,
}: CategoryNavProps) {
  const list = useRef<HTMLUListElement>(null);
  const current = useRef<HTMLAnchorElement>(null);

  // Fade the edges the tabs can scroll towards.
  useEffect(() => {
    const scroller = list.current;
    if (!scroller) return;
    const edges = () => {
      const start = scroller.scrollLeft > 1;
      const end = scroller.scrollLeft + scroller.clientWidth < scroller.scrollWidth - 1;
      const fade = 40;
      scroller.style.maskImage =
        start || end
          ? `linear-gradient(to right, ${start ? 'transparent' : 'black'}, black ${start ? fade : 0}px, black calc(100% - ${end ? fade : 0}px), ${end ? 'transparent' : 'black'})`
          : '';
    };
    edges();
    scroller.addEventListener('scroll', edges, { passive: true });
    const observer = new ResizeObserver(edges);
    observer.observe(scroller);
    return () => {
      scroller.removeEventListener('scroll', edges);
      observer.disconnect();
    };
  }, []);

  // Keep the current tab in view when the tabs scroll sideways.
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-run when the page changes
  useEffect(() => {
    const scroller = list.current;
    const tab = current.current;
    if (!scroller || !tab || scroller.scrollWidth <= scroller.clientWidth) return;
    const start = tab.offsetLeft - 24;
    const end = tab.offsetLeft + tab.offsetWidth + 24;
    if (start < scroller.scrollLeft) scroller.scrollTo({ left: start });
    else if (end > scroller.scrollLeft + scroller.clientWidth) {
      scroller.scrollTo({ left: end - scroller.clientWidth });
    }
  }, [active]);

  return (
    <nav aria-label="Categories" className="sticky top-0 z-30 border-line border-b bg-bg">
      <div className="relative flex h-14 items-stretch gap-3 px-4 md:h-16 md:gap-8 md:px-6 3xl:px-8">
        <ul
          ref={list}
          className="-mb-px flex min-w-0 flex-1 items-stretch gap-6 overflow-x-auto [scrollbar-width:none] md:gap-8 [&::-webkit-scrollbar]:hidden"
        >
          {TABS.map((tab) => {
            const selected = tab.id === active;
            return (
              <li key={tab.id ?? 'all'} className="flex shrink-0 last:pr-6">
                <Link
                  ref={selected ? current : undefined}
                  href={tab.id ? `/templates/${tab.id}` : '/templates'}
                  aria-current={selected ? 'page' : undefined}
                  className={cn(
                    'relative flex items-center gap-1.5 whitespace-nowrap rounded-sm text-[17px] font-[600] tracking-[-0.015em] transition-colors duration-(--duration-micro) ease-swift md:text-[20px] 3xl:text-[22px]',
                    selected ? 'text-fg' : 'text-fg-3 hover:text-fg-2',
                  )}
                >
                  {tab.name}
                  <span className="translate-y-[-0.45em] font-[550] text-[11px] text-fg-3 tabular-nums">
                    {categoryCount(tab.id)}
                  </span>
                  {selected && (
                    <motion.span
                      layoutId="category-underline"
                      transition={uiSpring.snappy}
                      className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-fg"
                    />
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
        <SearchField
          query={query}
          onQuery={onQuery}
          input={search}
          open={searching}
          onOpen={onSearching}
        />
      </div>
    </nav>
  );
}

function SearchField({
  query,
  onQuery,
  input,
  open,
  onOpen,
}: {
  query: string;
  onQuery: (query: string) => void;
  input: RefObject<HTMLInputElement | null>;
  open: boolean;
  onOpen: (open: boolean) => void;
}) {
  const [focused, setFocused] = useState(false);
  const shown = open || query !== '';
  return (
    <>
      <button
        type="button"
        aria-label="Search templates"
        onClick={() => {
          // Shown and focused within the tap, so phones open their keyboard.
          flushSync(() => onOpen(true));
          input.current?.focus();
        }}
        className={cn(
          'my-auto -mr-1.5 inline-flex size-11 shrink-0 items-center justify-center rounded-full text-fg-2 transition-colors duration-(--duration-micro) hover:bg-bg-3 hover:text-fg md:hidden',
          shown && 'invisible',
        )}
      >
        <SearchIcon size={20} />
      </button>
      <search
        className={cn(
          'items-center gap-3',
          shown ? 'absolute inset-0 z-10 flex bg-bg px-4' : 'hidden',
          'md:static md:z-auto md:flex md:w-[clamp(220px,18vw,340px)] md:shrink-0 md:bg-transparent md:px-0',
        )}
      >
        <div className="relative flex h-10 min-w-0 flex-1 items-center rounded-full bg-bg-3 ring-1 ring-line transition-shadow duration-(--duration-micro) ease-swift outline-offset-2 hover:ring-line-strong has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-focus">
          <SearchIcon size={18} className="pointer-events-none ml-3.5 shrink-0 text-fg-3" />
          <input
            ref={input}
            type="search"
            aria-label="Search templates"
            placeholder="Search templates"
            value={query}
            autoComplete="off"
            spellCheck={false}
            enterKeyHint="search"
            onChange={(event) => onQuery(event.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => {
              setFocused(false);
              if (query === '') onOpen(false);
            }}
            onKeyDown={(event) => {
              if (event.key !== 'Escape') return;
              if (query) onQuery('');
              else {
                onOpen(false);
                event.currentTarget.blur();
              }
            }}
            className="h-full min-w-0 flex-1 bg-transparent pr-3 pl-2.5 text-[14px] text-fg outline-none placeholder:text-fg-3 focus-visible:outline-none [&::-webkit-search-cancel-button]:appearance-none"
          />
          {query ? (
            <button
              type="button"
              aria-label="Clear the search"
              onClick={() => {
                onQuery('');
                input.current?.focus();
              }}
              className="mr-1.5 inline-flex size-7 shrink-0 items-center justify-center rounded-full text-fg-3 transition-colors duration-(--duration-micro) hover:bg-bg-4 hover:text-fg"
            >
              <ClearIcon size={16} />
            </button>
          ) : (
            !focused && (
              <span
                aria-hidden="true"
                className="mr-3 hidden h-5 min-w-5 items-center justify-center rounded-sm border border-line-strong px-1 font-mono text-[11px] text-fg-3 md:inline-flex"
              >
                /
              </span>
            )
          )}
        </div>
        <button
          type="button"
          onClick={() => {
            onQuery('');
            onOpen(false);
          }}
          className="shrink-0 text-[14px] font-[550] text-fg-2 hover:text-fg md:hidden"
        >
          Cancel
        </button>
      </search>
    </>
  );
}
