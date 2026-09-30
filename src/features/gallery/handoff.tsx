'use client';

/**
 * The tile → stage handoff (docs/03-design-system.md §9, signature interaction 1: "no blank page
 * in between"). A tile about to open asks its worker for a still of the design the editor will
 * open with — its poster frame, with the same text, format and Look — and hands it over here.
 * The editor's loading frame shows it (it is what the tile morphs into), and it stays over the
 * stage until the editor's own worker paints its first frame.
 */

import { useEffect, useState, useSyncExternalStore } from 'react';
import { FORMATS, type FormatId, type RenderClient, type ViewId } from '@/engine/host';

type Handoff = { name: string; format: FormatId; url: string | null };

/** A handoff nobody took is dropped after this long (ms). */
const KEEP = 10_000;
/** The cover leaves after this long even if the stage never paints (ms). */
const SAFETY = 4000;

let current: Handoff | null = null;
let expiry: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();
const notify = () => {
  for (const listener of listeners) listener();
};

function drop(handoff: Handoff | null) {
  if (!handoff) return;
  const { url } = handoff;
  // Late enough that an image still fading out keeps its pixels.
  if (url) setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** A tile is opening the view-transition `name`: `still` is what the stage will show first. */
export function handOff(name: string, format: FormatId, still: Promise<Blob>): void {
  drop(current);
  const handoff: Handoff = { name, format, url: null };
  current = handoff;
  notify();
  void still.then(
    (blob) => {
      if (current !== handoff) return;
      current = { ...handoff, url: URL.createObjectURL(blob) };
      notify();
    },
    () => undefined,
  );
  if (expiry) clearTimeout(expiry);
  expiry = setTimeout(() => {
    if (current?.name !== name) return;
    drop(current);
    current = null;
    notify();
  }, KEEP);
}

/** The editor has painted its own frame: the handoff is spent. */
function spend(name: string): void {
  if (current?.name !== name) return;
  drop(current);
  current = null;
  notify();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The handoff for a stage named `name` (null without one, and on the server). */
export function useHandoff(name: string): Handoff | null {
  return useSyncExternalStore(
    subscribe,
    () => (current?.name === name ? current : null),
    () => null,
  );
}

/** The handed-over still, filling its box (in the editor's loading frame). */
export function HandoffStill({ name }: { name: string }) {
  const url = useHandoff(name)?.url;
  if (!url) return null;
  // biome-ignore lint/performance/noImgElement: a local Blob still; nothing to optimize
  return <img src={url} alt="" className="absolute inset-0 size-full object-cover" />;
}

/**
 * Over the editor's stage: the handed-over still until the stage's view paints its first frame,
 * then a quick fade. Positioned like the stage's frame (fitted with 32 px of room).
 */
export function HandoffCover({
  name,
  format,
  client,
  view,
}: {
  name: string;
  format: FormatId;
  client: RenderClient | null;
  view: ViewId;
}) {
  const handoff = useHandoff(name);
  const [painted, setPainted] = useState(false);
  useEffect(() => {
    if (!client) return;
    const unsubscribe = client.subscribe((message) => {
      if (message.type === 'frame' && message.view === view) {
        setPainted(true);
        unsubscribe();
      }
    });
    // Never in the way for long, whatever happens to the stage.
    const timer = setTimeout(() => setPainted(true), SAFETY);
    return () => {
      unsubscribe();
      clearTimeout(timer);
    };
  }, [client, view]);
  if (!handoff?.url) return null;
  const { aspect } = FORMATS[format];
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 flex items-center justify-center [container-type:size]"
    >
      <div
        className="relative shrink-0 overflow-hidden rounded-[20px] transition-opacity duration-(--duration-small) ease-swift"
        style={{
          aspectRatio: aspect,
          width: `max(0px, min(100cqw - 64px, (100cqh - 64px) * ${aspect}))`,
          opacity: painted ? 0 : 1,
        }}
        onTransitionEnd={() => {
          if (painted) spend(name);
        }}
      >
        {/* biome-ignore lint/performance/noImgElement: a local Blob still; nothing to optimize */}
        <img src={handoff.url} alt="" className="size-full object-cover" />
      </div>
    </div>
  );
}
