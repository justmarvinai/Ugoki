'use client';

/**
 * Drafts in the gallery (docs/02-experience.md §3 flow C, §5): *Continue where you left off* —
 * up to four drafts as live tiles, each opening the editor exactly as it was left — and the
 * header's *Recent* popover. Drafts live on this device only.
 */

import { Menu } from '@base-ui/react/menu';
import { Popover } from '@base-ui/react/popover';
import Link from 'next/link';
import { useEffect, useEffectEvent, useState } from 'react';
import { Button } from '@/components/button';
import { FORMATS, type RenderClient } from '@/engine/host';
import { cn } from '@/lib/cn';
import { type DraftRecord, type StoredBytes, toBlob } from '@/lib/db';
import { TEMPLATES } from '@/templates/registry';
import { importFile } from '../assets/import-file';
import { ClockIcon, MoreIcon } from '../gallery/icons';
import type { TileScheduler } from '../gallery/scheduler';
import { TileMedia, useTileView } from '../gallery/tile';
import { deleteDraft, draftFiles, duplicateDraft, recentDrafts } from './drafts';

const relative = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

function edited(at: number, now: number): string {
  const seconds = Math.round((at - now) / 1000);
  if (seconds > -45) return 'just now';
  const steps: [number, Intl.RelativeTimeFormatUnit][] = [
    [60, 'second'],
    [60, 'minute'],
    [24, 'hour'],
    [7, 'day'],
    [4.35, 'week'],
    [12, 'month'],
  ];
  let value = seconds;
  for (const [size, unit] of steps) {
    if (Math.abs(value) < size) return relative.format(Math.round(value), unit);
    value /= size;
  }
  return relative.format(Math.round(value), 'year');
}

const templateName = (id: string) => TEMPLATES.find((entry) => entry.id === id)?.name ?? id;

/** "Line, edited 2 minutes ago" — with the template's name when the draft has its own. */
function draftLabel(draft: DraftRecord, now: number): string {
  const template = templateName(draft.templateId);
  const name = draft.name === template ? template : `${draft.name} (${template})`;
  return `${name}, edited ${edited(draft.updatedAt, now)}`;
}

/** The drafts on this device, newest first (null while reading), and a way to read them again. */
export function useRecentDrafts(limit = 8) {
  const [drafts, setDrafts] = useState<DraftRecord[] | null>(null);
  const [now, setNow] = useState(0);
  const refresh = useEffectEvent(() => {
    void recentDrafts(limit).then(
      (list) => {
        setNow(Date.now());
        setDrafts(list);
      },
      () => setDrafts([]),
    );
  });
  useEffect(() => refresh(), []);
  return { drafts, now, refresh: () => refresh() };
}

type ContinueRowProps = {
  drafts: readonly DraftRecord[];
  now: number;
  client: RenderClient | null;
  scheduler: TileScheduler;
  /** A draft was duplicated or deleted. */
  onChange: () => void;
};

/** *Continue where you left off*: up to four drafts as live tiles (nothing without drafts). */
export function ContinueRow({ drafts, now, client, scheduler, onChange }: ContinueRowProps) {
  const shown = drafts.slice(0, 4);

  // Drafts' own images, so their tiles show them instead of placeholders.
  const shownKey = shown.map((draft) => `${draft.id}:${draft.updatedAt}`).join(',');
  const deliver = useEffectEvent((active: { cancelled: boolean }) => {
    if (!client) return;
    for (const draft of shown) {
      void draftFiles(draft).then(async (files) => {
        for (const [hash, file] of files) {
          const imported = await importFile(file).catch(() => null);
          if (imported && !active.cancelled) client.setAsset(hash, imported.asset);
        }
      });
    }
  });
  // biome-ignore lint/correctness/useExhaustiveDependencies: again for a new worker or new drafts
  useEffect(() => {
    const active = { cancelled: false };
    if (shownKey) deliver(active);
    return () => {
      active.cancelled = true;
    };
  }, [client, shownKey]);

  if (shown.length === 0) return null;
  return (
    <section aria-labelledby="continue-title" className="mb-12 md:mb-16">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <h2 id="continue-title" className="text-[20px] font-[650] tracking-[-0.01em]">
          Continue where you left off
        </h2>
        <p className="text-[13px] text-fg-3">Saved on this device only.</p>
      </div>
      <ul className="-mx-4 mt-5 flex snap-x gap-5 overflow-x-auto px-4 pt-1 pb-3 [--draft-h:150px] [scrollbar-width:none] md:-mx-6 md:gap-6 md:px-6 md:[--draft-h:180px] 3xl:-mx-8 3xl:px-8 3xl:[--draft-h:220px]">
        {shown.map((draft) => (
          <DraftTile
            key={draft.id}
            draft={draft}
            now={now}
            client={client}
            scheduler={scheduler}
            onChange={onChange}
          />
        ))}
      </ul>
    </section>
  );
}

function DraftTile({
  draft,
  now,
  client,
  scheduler,
  onChange,
}: {
  draft: DraftRecord;
  now: number;
  client: RenderClient | null;
  scheduler: TileScheduler;
  onChange: () => void;
}) {
  const view = `draft:${draft.id}`;
  const name = `draft-${draft.id}`;
  const { media, host, loaded, send, opening } = useTileView({
    client,
    scheduler,
    view,
    templateId: draft.templateId,
    design: draft.state,
  });
  const [confirming, setConfirming] = useState(false);
  const sendLoaded = useEffectEvent(() => {
    if (loaded) send(loaded.state, true);
  });
  // biome-ignore lint/correctness/useExhaustiveDependencies: once per loaded design
  useEffect(() => sendLoaded(), [loaded]);

  const format = loaded?.state.format ?? draft.state.format;
  const aspect = FORMATS[format]?.aspect ?? 16 / 9;
  const template = templateName(draft.templateId);
  return (
    <li
      className="relative shrink-0 snap-start"
      style={{ width: `max(calc(var(--draft-h) * ${aspect}), 11rem)` }}
    >
      <Link
        href={`/editor/${draft.templateId}?draft=${draft.id}`}
        aria-label={draftLabel(draft, now)}
        className="group/tile block rounded-[20px] outline-none"
        onPointerEnter={(event) => {
          if (event.pointerType === 'mouse') scheduler.hover(view, true);
        }}
        onPointerLeave={() => scheduler.hover(view, false)}
        onFocus={() => scheduler.focus(view, true)}
        onBlur={() => scheduler.focus(view, false)}
        {...opening(name)}
      >
        <TileMedia
          name={name}
          media={media}
          host={host}
          aspect={aspect}
          className="h-(--draft-h) w-auto max-w-full"
        />
        <span className="mt-3 block pr-9 pl-0.5">
          <span className="block truncate text-[15px] font-[650] text-fg">{draft.name}</span>
          <span className="block truncate text-[12px] text-fg-3">
            {draft.name === template ? '' : `${template} · `}
            edited {edited(draft.updatedAt, now)}
          </span>
        </span>
      </Link>
      {confirming ? (
        <div className="absolute inset-x-0 bottom-0 flex items-center gap-1 rounded-[14px] bg-bg-2 p-1.5 ring-1 ring-line">
          <span className="mr-auto pl-1.5 text-[12px] text-fg-2">Delete this draft?</span>
          <Button
            size="sm"
            onClick={() => {
              setConfirming(false);
              void deleteDraft(draft.id).then(onChange);
            }}
          >
            Delete
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
            Keep
          </Button>
        </div>
      ) : (
        <DraftMenu
          name={draft.name}
          onDuplicate={() => void duplicateDraft(draft).then(onChange)}
          onDelete={() => setConfirming(true)}
          className="absolute right-0 bottom-1.5"
        />
      )}
    </li>
  );
}

const menuItem =
  'flex h-9 cursor-default items-center rounded-md px-3 text-[13px] text-fg-2 outline-none select-none data-highlighted:bg-bg-3 data-highlighted:text-fg';

function DraftMenu({
  name,
  onDuplicate,
  onDelete,
  className,
}: {
  name: string;
  onDuplicate: () => void;
  onDelete: () => void;
  className?: string;
}) {
  return (
    <Menu.Root>
      <Menu.Trigger
        aria-label={`More for ${name}`}
        title="More"
        className={cn(
          'inline-flex size-8 items-center justify-center rounded-md text-fg-3 transition-colors duration-(--duration-micro) hover:bg-bg-3 hover:text-fg data-popup-open:bg-bg-3 data-popup-open:text-fg',
          className,
        )}
      >
        <MoreIcon size={18} />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner sideOffset={6} align="end" className="z-50">
          <Menu.Popup
            data-theme="cinema"
            className="min-w-40 rounded-[14px] bg-bg-2 p-1 text-fg shadow-[0_12px_32px_rgb(0_0_0/0.4)] ring-1 ring-line outline-none transition-[opacity,scale] duration-(--duration-small) ease-glide data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0"
          >
            <Menu.Item className={menuItem} onClick={onDuplicate}>
              Duplicate
            </Menu.Item>
            <Menu.Item className={menuItem} onClick={onDelete}>
              Delete…
            </Menu.Item>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}

/** The header's *Recent*: the latest drafts, each opening where it was left. */
export function RecentDrafts({
  drafts,
  now,
  onOpenChange,
}: {
  drafts: readonly DraftRecord[] | null;
  now: number;
  /** Opening reads the drafts again. */
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Popover.Root onOpenChange={(open) => onOpenChange(open)}>
      <Popover.Trigger
        render={
          <Button
            variant="ghost"
            size="md"
            className="-mr-2 h-11 px-3 text-fg-2 data-popup-open:bg-bg-3 md:mr-0 md:h-9"
          />
        }
      >
        <ClockIcon size={17} />
        <span>Recent</span>
        {drafts && drafts.length > 0 && (
          <span className="font-mono text-[11px] text-fg-3 tabular-nums">{drafts.length}</span>
        )}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner sideOffset={8} align="end" className="z-50">
          <Popover.Popup
            data-theme="cinema"
            className="w-[min(380px,calc(100vw-24px))] rounded-[14px] bg-bg-2 p-2 text-fg shadow-[0_12px_32px_rgb(0_0_0/0.4)] ring-1 ring-line outline-none transition-[opacity,scale] duration-(--duration-small) ease-glide data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0"
          >
            <Popover.Title className="px-3 pt-2 text-[14px] font-[650]">
              Recent drafts
            </Popover.Title>
            <Popover.Description className="px-3 pt-0.5 pb-2 text-[12px] text-fg-3">
              Saved on this device only.
            </Popover.Description>
            {drafts === null || drafts.length === 0 ? (
              <p className="px-3 pt-1 pb-3 text-[13px] leading-snug text-fg-2">
                Nothing yet. Open a template and start editing — your drafts save here as you work.
              </p>
            ) : (
              <ul className="flex max-h-[60vh] flex-col overflow-y-auto">
                {drafts.map((draft) => (
                  <li key={draft.id}>
                    <Link
                      href={`/editor/${draft.templateId}?draft=${draft.id}`}
                      aria-label={draftLabel(draft, now)}
                      className="flex items-center gap-3 rounded-md p-2 transition-colors duration-(--duration-micro) hover:bg-bg-3 focus-visible:outline-2 focus-visible:outline-focus"
                    >
                      <Thumbnail image={draft.thumbnail} />
                      <span className="min-w-0">
                        <span className="block truncate text-[14px] font-[550] text-fg">
                          {draft.name}
                        </span>
                        <span className="block truncate text-[12px] text-fg-3">
                          {draft.name === templateName(draft.templateId)
                            ? ''
                            : `${templateName(draft.templateId)} · `}
                          {draft.state.format} · edited {edited(draft.updatedAt, now)}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

/** A draft's stored still (small, for lists). */
function Thumbnail({ image }: { image: StoredBytes | undefined }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!image) return;
    const next = URL.createObjectURL(toBlob(image));
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [image]);
  return (
    <span className="flex h-11 w-16 shrink-0 items-center justify-center overflow-hidden rounded-md bg-bg-3 ring-1 ring-line">
      {url ? (
        // biome-ignore lint/performance/noImgElement: a local Blob preview; nothing to optimize
        <img src={url} alt="" className="size-full object-contain" />
      ) : (
        <span aria-hidden="true" className="size-1.5 rounded-full bg-dot" />
      )}
    </span>
  );
}
