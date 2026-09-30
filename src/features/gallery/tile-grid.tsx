'use client';

/**
 * The tile grid (docs/02-experience.md §5): columns fill the width from a minimum tile width
 * per format — one column on phones, six of 16:9 or ten of 9:16 on a 2560 px screen. Arrow keys
 * move focus across it (Home/End to the ends); Enter opens the focused tile.
 */

import type { KeyboardEvent } from 'react';
import type { FormatId, RenderClient } from '@/engine/host';
import type { TemplateEntry } from '@/templates/registry';
import type { TileScheduler } from './scheduler';
import { TemplateTile } from './tile';

/** Smallest tile width per format (CSS px): similar areas, so every format fills the screen. */
export const MIN_TILE: Record<FormatId, number> = {
  '16:9': 360,
  '9:16': 220,
  '1:1': 280,
  '4:5': 250,
};

type TileGridProps = {
  /** The page's templates (a category's, or all). */
  entries: readonly TemplateEntry[];
  /** Templates matching the search. */
  matching: ReadonlySet<string>;
  client: RenderClient | null;
  scheduler: TileScheduler;
  format: FormatId;
  headline: string;
};

/** Moves focus between tiles with the arrow keys, row by row as the grid lays them out. */
function moveFocus(event: KeyboardEvent<HTMLUListElement>) {
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
  const current = event.target;
  if (!(current instanceof HTMLAnchorElement) || !current.hasAttribute('data-tile')) return;
  const grid = event.currentTarget;
  const tiles = [...grid.querySelectorAll<HTMLAnchorElement>('a[data-tile]')].filter(
    (tile) => tile.offsetParent !== null,
  );
  const i = tiles.indexOf(current);
  if (i < 0) return;
  const columns = Math.max(
    1,
    getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean).length,
  );
  const last = tiles.length - 1;
  const row = (index: number) => Math.floor(index / columns);
  let next = i;
  switch (event.key) {
    case 'ArrowRight':
      next = Math.min(last, i + 1);
      break;
    case 'ArrowLeft':
      next = Math.max(0, i - 1);
      break;
    case 'ArrowDown':
      // Into a shorter last row: its last tile.
      next = i + columns <= last ? i + columns : row(i) < row(last) ? last : i;
      break;
    case 'ArrowUp':
      next = i - columns >= 0 ? i - columns : i;
      break;
    case 'Home':
      next = 0;
      break;
    case 'End':
      next = last;
      break;
    default:
      return;
  }
  event.preventDefault();
  tiles[next]?.focus();
}

export function TileGrid({
  entries,
  matching,
  client,
  scheduler,
  format,
  headline,
}: TileGridProps) {
  return (
    <ul
      aria-label="Templates"
      onKeyDown={moveFocus}
      className="grid gap-x-5 gap-y-8 md:gap-x-6 md:gap-y-10 [&_a[data-tile]]:scroll-mt-28 [&_a[data-tile]]:scroll-mb-6"
      style={{
        gridTemplateColumns: `repeat(auto-fill, minmax(min(100%, ${MIN_TILE[format]}px), 1fr))`,
      }}
    >
      {entries.map((entry) => (
        <TemplateTile
          key={entry.id}
          entry={entry}
          client={client}
          scheduler={scheduler}
          format={format}
          headline={headline}
          hidden={!matching.has(entry.id)}
        />
      ))}
    </ul>
  );
}
