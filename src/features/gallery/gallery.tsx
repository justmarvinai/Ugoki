'use client';

/**
 * The gallery (docs/02-experience.md §5): header, category nav, *Continue where you left off*
 * and a grid of live tiles, around the page's own heading and intro (`children`). It lives in
 * the `/templates` layout, so it stays mounted — one render worker, every tile, the
 * personalization and the search — while moving between the category pages.
 */

import { MotionConfig } from 'motion/react';
import Link from 'next/link';
import { useSelectedLayoutSegment } from 'next/navigation';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import type { RenderClient } from '@/engine/host';
import { TEMPLATES } from '@/templates/registry';
import { ContinueRow, RecentDrafts, useRecentDrafts } from '../drafts/draft-list';
import { categoryPage, isCategoryId, matchesQuery } from './catalog';
import { CategoryNav } from './category-nav';
import { useGalleryChoices } from './choices';
import { useGalleryClient } from './gallery-client';
import { GalleryHeader } from './header';
import { TileScheduler } from './scheduler';
import { TileGrid } from './tile-grid';

declare global {
  interface Window {
    /** Debugging and end-to-end tests: the gallery's render client and tile scheduler. */
    __ugokiGallery?: { client: RenderClient; scheduler: TileScheduler };
  }
}

const TYPING = 'input, textarea, select, [contenteditable="true"], [role="slider"]';
const SUGGESTIONS = ['title', 'logo', 'reel'] as const;

export function Gallery({ children }: { children: ReactNode }) {
  const segment = useSelectedLayoutSegment();
  const category = isCategoryId(segment) ? segment : null;
  const client = useGalleryClient();
  const [scheduler] = useState(() => new TileScheduler());
  const { text, headline, format } = useGalleryChoices();
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const search = useRef<HTMLInputElement>(null);
  const drafts = useRecentDrafts(8);

  useEffect(() => {
    if (!client) return;
    const disconnect = scheduler.connect(client);
    window.__ugokiGallery = { client, scheduler };
    return () => {
      disconnect();
      delete window.__ugokiGallery;
    };
  }, [client, scheduler]);

  // The gallery is a Cinema screen; the root layout defaults to Daylight.
  useEffect(() => {
    const root = document.documentElement;
    const previous = root.dataset.theme;
    root.dataset.theme = 'cinema';
    return () => {
      root.dataset.theme = previous;
    };
  }, []);

  // `/` focuses the search.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (target?.closest(TYPING)) return;
      event.preventDefault();
      flushSync(() => setSearching(true));
      search.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // What plays depends on where tiles are.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the layout's inputs
  useEffect(() => scheduler.invalidate(), [scheduler, format, category, query]);

  const entries = TEMPLATES.filter((entry) => category === null || entry.category === category);
  const matching = new Set(
    entries.filter((entry) => matchesQuery(entry, query)).map((entry) => entry.id),
  );
  const elsewhere =
    category !== null && query.trim() !== ''
      ? TEMPLATES.filter((entry) => matchesQuery(entry, query)).length
      : 0;

  return (
    <MotionConfig reducedMotion="user">
      <div data-theme="cinema" className="min-h-dvh bg-bg text-fg">
        <GalleryHeader
          text={text}
          format={format}
          recent={
            <RecentDrafts
              drafts={drafts.drafts}
              now={drafts.now}
              onOpenChange={(open) => {
                if (open) drafts.refresh();
              }}
            />
          }
        />
        <CategoryNav
          active={category}
          query={query}
          onQuery={setQuery}
          search={search}
          searching={searching}
          onSearching={setSearching}
        />
        <main className="px-4 pt-8 pb-24 md:px-6 md:pt-10 md:pb-32 3xl:px-8">
          {category === null && query.trim() === '' && drafts.drafts && (
            <ContinueRow
              drafts={drafts.drafts}
              now={drafts.now}
              client={client}
              scheduler={scheduler}
              onChange={drafts.refresh}
            />
          )}
          {children}
          <TileGrid
            entries={entries}
            matching={matching}
            client={client}
            scheduler={scheduler}
            format={format}
            headline={headline}
          />
          {matching.size === 0 && (
            <NothingMatched
              query={query}
              onQuery={setQuery}
              elsewhere={elsewhere}
              category={category ? (categoryPage(category)?.name ?? null) : null}
            />
          )}
        </main>
      </div>
    </MotionConfig>
  );
}

/** The empty search: what to try instead (docs/02-experience.md §5 — no dead ends). */
function NothingMatched({
  query,
  onQuery,
  elsewhere,
  category,
}: {
  query: string;
  onQuery: (query: string) => void;
  /** Matches in other categories. */
  elsewhere: number;
  category: string | null;
}) {
  const suggestion = (word: string) => (
    <button
      type="button"
      onClick={() => onQuery(word)}
      className="rounded-sm text-fg underline decoration-line-strong underline-offset-4 transition-colors duration-(--duration-micro) hover:decoration-fg"
    >
      “{word}”
    </button>
  );
  return (
    <div role="status" className="mx-auto max-w-[36rem] py-20 text-center md:py-28">
      <p className="text-[22px] font-[650] tracking-[-0.015em] text-balance">
        Nothing matched “{query.trim()}”{category ? ` in ${category}` : ''}.
      </p>
      <p className="mt-3 text-[15px] text-fg-2">
        {elsewhere > 0 ? (
          <>
            <Link
              href="/templates"
              className="rounded-sm text-fg underline decoration-line-strong underline-offset-4 hover:decoration-fg"
            >
              {elsewhere === 1 ? 'See the match' : `See ${elsewhere} matches`} in all templates
            </Link>
            , or try {suggestion(SUGGESTIONS[0])}, {suggestion(SUGGESTIONS[1])} or{' '}
            {suggestion(SUGGESTIONS[2])}.
          </>
        ) : (
          <>
            Try {suggestion(SUGGESTIONS[0])}, {suggestion(SUGGESTIONS[1])} or{' '}
            {suggestion(SUGGESTIONS[2])}.
          </>
        )}
      </p>
    </div>
  );
}
