'use client';

/**
 * "Continue where you left off" (docs/02-experience.md §3, flow C): the drafts on this device,
 * newest first — open, duplicate or delete. Nothing shows until there is a draft.
 */

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Button } from '@/components/button';
import { type DraftRecord, type StoredBytes, toBlob } from '@/lib/db';
import { TEMPLATES } from '@/templates/registry';
import { deleteDraft, duplicateDraft, recentDrafts } from './drafts';

const relative = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

function edited(at: number, now: number): string {
  const seconds = Math.round((at - now) / 1000);
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

export function DraftList() {
  const [drafts, setDrafts] = useState<DraftRecord[] | null>(null);
  const [now, setNow] = useState(0);
  const [confirming, setConfirming] = useState<string | null>(null);

  const refresh = () =>
    void recentDrafts().then(
      (list) => {
        setNow(Date.now());
        setDrafts(list);
      },
      () => setDrafts([]),
    );
  useEffect(refresh, []);

  if (!drafts || drafts.length === 0) return null;
  return (
    <section aria-labelledby="drafts-title" className="mb-14">
      <h2 id="drafts-title" className="text-[20px] font-[650] tracking-[-0.01em]">
        Continue where you left off
      </h2>
      <p className="mt-1 text-[13px] text-fg-3">Saved on this device only.</p>
      <ul className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 3xl:grid-cols-4">
        {drafts.map((draft) => {
          const template = TEMPLATES.find((entry) => entry.id === draft.templateId);
          return (
            <li
              key={draft.id}
              className="flex flex-col rounded-[20px] bg-bg-2 p-3 ring-1 ring-line"
            >
              <Link
                href={`/editor/${draft.templateId}?draft=${draft.id}`}
                className="group flex flex-col gap-3 rounded-[14px] focus-visible:outline-2 focus-visible:outline-focus"
              >
                <Thumbnail image={draft.thumbnail} label={draft.name} />
                <span className="px-1">
                  <span className="block truncate text-[15px] font-[650] group-hover:underline">
                    {draft.name}
                  </span>
                  <span className="block truncate text-[12px] text-fg-3">
                    {template?.name ?? draft.templateId} · {draft.state.format} · edited{' '}
                    {edited(draft.updatedAt, now)}
                  </span>
                </span>
              </Link>
              <div className="mt-2 flex items-center gap-1 px-1">
                {confirming === draft.id ? (
                  <>
                    <span className="mr-auto text-[12px] text-fg-2">Delete this draft?</span>
                    <Button
                      size="sm"
                      onClick={() => {
                        setConfirming(null);
                        void deleteDraft(draft.id).then(refresh);
                      }}
                    >
                      Delete
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setConfirming(null)}>
                      Keep
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => void duplicateDraft(draft).then(refresh)}
                    >
                      Duplicate
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setConfirming(draft.id)}>
                      Delete…
                    </Button>
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Thumbnail({ image, label }: { image: StoredBytes | undefined; label: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!image) return;
    const next = URL.createObjectURL(toBlob(image));
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [image]);
  return (
    <span className="flex aspect-video items-center justify-center overflow-hidden rounded-[14px] bg-bg-3">
      {url ? (
        // biome-ignore lint/performance/noImgElement: a local Blob preview; nothing to optimize
        <img src={url} alt={label} className="size-full object-contain" />
      ) : (
        <span aria-hidden="true" className="size-2 rounded-full bg-dot" />
      )}
    </span>
  );
}
