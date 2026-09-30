'use client';

/**
 * Gallery tiles (docs/02-experience.md §5, docs/03-design-system.md §8): live engine renders,
 * not videos — media (radius 20) with the name beneath; hover or focus reveals the one-liner and
 * the three Look dots, and pointing at a dot previews that Look. Each tile is one worker view
 * (`role: 'tile'`) on a canvas handed to the gallery's render worker; `TileScheduler` decides
 * whether it renders and plays. The media carries a view-transition name, so opening a tile
 * morphs it into the editor's stage.
 */

import Link from 'next/link';
import {
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  type RefObject,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  ViewTransition,
} from 'react';
import {
  type Backdrop,
  type DesignState,
  FORMATS,
  type FormatId,
  primaryTextKey,
  type RenderClient,
  resolvePalette,
  type TemplateDescriptor,
  toCss,
  type ViewId,
  type WorkerMessage,
} from '@/engine/host';
import { cn } from '@/lib/cn';
import type { TemplateEntry } from '@/templates/registry';
import { withLook } from '../inspector/looks';
import { editorHref, formatFor } from './catalog';
import { handOff } from './handoff';
import type { TileScheduler } from './scheduler';

/** Tiles render at most 1.5 × their CSS size (docs/06-engine.md §10). */
const TILE_DPR = 1.5;
/** Resizes after the first are sent at most this often (ms). */
const RESIZE_EVERY = 120;
/** The view-transition class of the tile → stage morph (styled in `morph.css`). */
export const MORPH_CLASS = 'ugoki-morph';
/** Short side of the still a tile hands to the editor as it opens (px). */
const HANDOFF_SIDE = 720;

/** Transitions preview A → B; overlays (transparent by default) preview over footage. */
function tileBackdrop(template: TemplateDescriptor): Backdrop {
  if (template.structure === 'transition') return { kind: 'scenes' };
  return template.alpha === 'default' ? { kind: 'footage' } : { kind: 'none' };
}

type Loaded = { descriptor: TemplateDescriptor; state: DesignState };

type TileView = {
  /** The media box (observed, measured, faded in once painted). */
  media: RefObject<HTMLDivElement | null>;
  /** Holds the worker-owned canvas; React never renders children into it. */
  host: RefObject<HTMLDivElement | null>;
  /** The template's description and its sanitized first state. */
  loaded: Loaded | null;
  /** Sends the tile's design; `relayout` hides the canvas until the new design is painted. */
  send: (state: DesignState, relayout: boolean) => void;
  /**
   * Handlers for the tile's link: opening it hands the editor a still of the design at its
   * poster frame (see `handoff.tsx`), shown until the editor paints its own.
   */
  opening: (name: string) => {
    onPointerDown: (event: PointerEvent) => void;
    onKeyDown: (event: KeyboardEvent) => void;
  };
};

/**
 * A worker view for a tile: a canvas attached as a tile, hidden until the page sends its
 * design (so the worker never paints one about to be replaced), loaded with a template — and a
 * stored design, for drafts.
 */
export function useTileView({
  client,
  scheduler,
  view,
  templateId,
  design,
}: {
  client: RenderClient | null;
  scheduler: TileScheduler;
  view: ViewId;
  templateId: string;
  /** A design to open (a draft's); none for the template's first Look. */
  design?: unknown;
}): TileView {
  const media = useRef<HTMLDivElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  /** What the canvas waits for before it shows: the next build, then its first frame. */
  const awaiting = useRef<'built' | 'frame' | null>(null);
  const initial = useRef(design);

  const onMessage = useEffectEvent((message: WorkerMessage) => {
    switch (message.type) {
      case 'loaded':
        client?.setBackdrop(view, tileBackdrop(message.template));
        setLoaded({ descriptor: message.template, state: message.state });
        break;
      case 'built':
        if (awaiting.current === 'built') awaiting.current = 'frame';
        break;
      case 'frame':
        if (awaiting.current === 'frame') {
          awaiting.current = null;
          media.current?.setAttribute('data-ready', '');
        }
        break;
      case 'error':
        media.current?.setAttribute('data-error', '');
        break;
    }
  });

  // The canvas is created imperatively: control transfers once, and React may mount twice.
  useEffect(() => {
    const element = host.current;
    const box = media.current;
    if (!client || !element || !box) return;
    const size = () => {
      const rect = element.getBoundingClientRect();
      return {
        width: rect.width,
        height: rect.height,
        dpr: Math.min(TILE_DPR, window.devicePixelRatio || 1),
      };
    };
    let last = size();
    const canvas = document.createElement('canvas');
    // The backing store keeps its design's shape while a new format is on its way.
    canvas.className =
      'block size-full object-contain opacity-0 transition-opacity duration-(--duration-small) ease-swift group-data-ready/media:opacity-100';
    canvas.width = Math.max(1, Math.round(last.width * last.dpr));
    canvas.height = Math.max(1, Math.round(last.height * last.dpr));
    element.append(canvas);
    client.attach(view, canvas.transferControlToOffscreen(), last, { role: 'tile' });
    client.setVisible(view, false);
    // Tiles are small: a lower render scale shows at once. The scheduler plays fewer instead.
    client.setQuality(view, 'full');
    const design = initial.current;
    client.load(view, templateId, design === undefined ? {} : { state: design });
    const unregister = scheduler.register({
      view,
      element: box,
      onMessage: (message) => onMessage(message),
    });

    // A format switch resizes every tile at once: send the first resize right away (the new
    // design is on its way too), then at most every RESIZE_EVERY ms (window resizing).
    let timer: ReturnType<typeof setTimeout> | undefined;
    let sentAt = 0;
    const observer = new ResizeObserver(() => {
      clearTimeout(timer);
      const flush = () => {
        const next = size();
        // Hidden tiles (filtered out) keep their canvas.
        if (next.width === 0 || next.height === 0) return;
        if (next.width === last.width && next.height === last.height && next.dpr === last.dpr) {
          return;
        }
        last = next;
        sentAt = performance.now();
        client.resize(view, next);
      };
      const wait = RESIZE_EVERY - (performance.now() - sentAt);
      if (wait <= 0) flush();
      else timer = setTimeout(flush, wait);
    });
    observer.observe(element);
    return () => {
      clearTimeout(timer);
      observer.disconnect();
      unregister();
      client.detach(view);
      canvas.remove();
      box.removeAttribute('data-ready');
      awaiting.current = null;
      setLoaded(null);
    };
  }, [client, scheduler, view, templateId]);

  /** The format of the design last sent. */
  const shown = useRef<FormatId | null>(null);
  const send = (state: DesignState, relayout: boolean) => {
    if (!client) return;
    if (relayout) {
      awaiting.current = 'built';
      media.current?.removeAttribute('data-ready');
    }
    client.setState(view, state);
    scheduler.stateSent(view);
    shown.current = state.format;
  };

  const handOver = (name: string) => {
    if (!client || !loaded || !shown.current) return;
    handOff(name, shown.current, client.snapshot(view, loaded.descriptor.poster, HANDOFF_SIDE));
  };
  const plain = (event: {
    metaKey: boolean;
    ctrlKey: boolean;
    shiftKey: boolean;
    altKey: boolean;
  }) => !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
  const opening = (name: string) => ({
    onPointerDown: (event: PointerEvent) => {
      if (event.button === 0 && plain(event)) handOver(name);
    },
    onKeyDown: (event: KeyboardEvent) => {
      if (event.key === 'Enter' && plain(event)) handOver(name);
    },
  });

  return { media, host, loaded, send, opening };
}

/**
 * A template's design in the gallery: its first Look (or the one pointed at), in the gallery's
 * format, with the personalization text in its primary text control (sanitized by the worker).
 */
export function galleryDesign(
  descriptor: TemplateDescriptor,
  base: DesignState,
  choices: { format: FormatId; headline: string; look: number | null },
): DesignState {
  const look = choices.look === null ? undefined : descriptor.looks[choices.look];
  const styled = look ? withLook(descriptor, base, look) : base;
  const key = primaryTextKey(descriptor.controls);
  const headline = choices.headline.trim();
  return {
    ...styled,
    format: formatFor(descriptor.formats, choices.format),
    props: headline && key ? { ...styled.props, [key]: headline } : styled.props,
  };
}

/** The tile's media: a rounded box holding the worker's canvas, named for the morph. */
export function TileMedia({
  name,
  media,
  host,
  aspect,
  className,
  children,
}: {
  /** View-transition name, shared with the editor's stage. */
  name: string;
  media: RefObject<HTMLDivElement | null>;
  host: RefObject<HTMLDivElement | null>;
  aspect: number;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <ViewTransition name={name} share={MORPH_CLASS} default="none">
      <div
        ref={media}
        className={cn(
          'group/media relative overflow-hidden rounded-[20px] bg-bg-2 ring-1 ring-line ring-inset',
          'outline-offset-2 group-focus-visible/tile:outline-2 group-focus-visible/tile:outline-focus',
          className,
        )}
        style={{ aspectRatio: aspect }}
      >
        <div ref={host} aria-hidden="true" className="absolute inset-0" />
        <span className="absolute inset-0 hidden items-center justify-center text-[13px] text-fg-3 group-data-error/media:flex">
          Preview unavailable
        </span>
        {children}
      </div>
    </ViewTransition>
  );
}

type TemplateTileProps = {
  entry: TemplateEntry;
  client: RenderClient | null;
  scheduler: TileScheduler;
  format: FormatId;
  /** Personalization text (debounced). */
  headline: string;
  /** Filtered out by the search (kept alive, so clearing the search is instant). */
  hidden: boolean;
};

export function TemplateTile({
  entry,
  client,
  scheduler,
  format,
  headline,
  hidden,
}: TemplateTileProps) {
  const view = `tile:${entry.id}`;
  const name = `template-${entry.id}`;
  const { media, host, loaded, send, opening } = useTileView({
    client,
    scheduler,
    view,
    templateId: entry.id,
  });
  /** The Look being pointed at (previewed on the tile), if any. */
  const [look, setLook] = useState<number | null>(null);
  const shown = formatFor(loaded?.descriptor.formats ?? entry.formats, format);
  /** The format of the design last sent: a new one re-lays the tile out. */
  const sentFormat = useRef<FormatId | null>(null);

  const update = useEffectEvent((next: DesignState) => {
    send(next, sentFormat.current !== next.format);
    sentFormat.current = next.format;
  });
  useEffect(() => {
    if (!loaded) {
      sentFormat.current = null;
      return;
    }
    update(galleryDesign(loaded.descriptor, loaded.state, { format: shown, headline, look }));
  }, [loaded, shown, headline, look]);

  const looks = loaded?.descriptor.looks ?? [];
  return (
    <li hidden={hidden} className="min-w-0">
      <Link
        href={editorHref(entry, { format, headline, look: look ?? undefined })}
        aria-label={`${entry.name} — ${entry.tagline}`}
        data-tile={entry.id}
        className="group/tile block rounded-[20px] outline-none"
        onPointerEnter={(event) => {
          if (event.pointerType === 'mouse') scheduler.hover(view, true);
        }}
        onPointerLeave={() => {
          scheduler.hover(view, false);
          setLook(null);
        }}
        onFocus={() => scheduler.focus(view, true)}
        onBlur={() => scheduler.focus(view, false)}
        {...opening(name)}
      >
        <TileMedia name={name} media={media} host={host} aspect={FORMATS[shown].aspect} />
        <span className="mt-3 flex h-6 min-w-0 items-center gap-2.5 px-0.5">
          <span className="shrink-0 text-[15px] font-[650] tracking-[-0.005em] text-fg">
            {entry.name}
          </span>
          <span className="min-w-0 truncate text-[13px] text-fg-3 transition-opacity duration-(--duration-small) ease-swift group-hover/tile:opacity-100 group-focus-visible/tile:opacity-100 [@media(hover:hover)]:opacity-0">
            {entry.tagline}
          </span>
          {looks.length > 1 && (
            <span
              aria-hidden="true"
              className="-mr-1 ml-auto flex shrink-0 items-center opacity-0 transition-opacity duration-(--duration-small) ease-swift group-hover/tile:opacity-100 group-focus-visible/tile:opacity-100 [@media(hover:none)]:hidden"
            >
              {looks.map((option, i) => (
                <LookDot
                  key={option.id}
                  palette={option.palette}
                  active={(look ?? 0) === i}
                  onPoint={(on) => setLook((current) => (on ? i : current === i ? null : current))}
                />
              ))}
            </span>
          )}
        </span>
      </Link>
    </li>
  );
}

type Look = TemplateDescriptor['looks'][number];

/** A Look as a dot: its background with its accent inside; pointing at it previews the Look. */
function LookDot({
  palette,
  active,
  onPoint,
}: {
  palette: Look['palette'];
  active: boolean;
  onPoint: (on: boolean) => void;
}) {
  const { roles } = resolvePalette(palette);
  return (
    <span
      className="flex size-6 items-center justify-center"
      onPointerEnter={(event) => {
        if (event.pointerType === 'mouse') onPoint(true);
      }}
      onPointerLeave={() => onPoint(false)}
    >
      <span
        className={cn(
          'flex size-3.5 items-center justify-center rounded-full ring-1 transition-[box-shadow,scale] duration-(--duration-micro) ease-swift',
          active ? 'scale-110 ring-fg' : 'ring-line-strong',
        )}
        style={{ background: toCss(roles.bg) }}
      >
        <span className="size-1.5 rounded-full" style={{ background: toCss(roles.accent) }} />
      </span>
    </span>
  );
}
