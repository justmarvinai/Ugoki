'use client';

/**
 * The editor's stage (docs/02-experience.md §6): the design's canvas, handed to the render
 * worker as an interactive view, fitted to the space with 32 px of breathing room (or at 100%:
 * one device pixel per pixel of the 1080p frame). A checkerboard shows through transparent
 * designs without a preview backdrop; safe-area guides on request. The frame box springs to a
 * new format's shape while the worker re-lays the design out.
 */

import { motion } from 'motion/react';
import {
  type ReactNode,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { uiSpring } from '@/design/motion';
import { createFrame, FORMATS, type FormatId, type RenderClient } from '@/engine/host';
import { cn } from '@/lib/cn';
import { SafeAreas } from './safe-areas';

/** Breathing room around the fitted frame (CSS px). */
const ROOM = 32;
/** Resizing a transferred canvas reallocates it: coalesce the resizes of a morph. */
const RESIZE_DELAY = 120;

export type StageBox = { width: number; height: number };

type StageProps = {
  client: RenderClient;
  view: string;
  format: FormatId;
  zoom: 'fit' | 'actual';
  checkerboard: boolean;
  guides: boolean;
  label: string;
  /** Drawn over the frame, in its CSS box (the editing overlay). */
  overlay?: (box: StageBox) => ReactNode;
  /** Stage controls (guides, backdrop, zoom), bottom right. */
  controls?: ReactNode;
  /** The worker has a (new) canvas for the view: send it the design and transport. */
  onAttach: () => void;
};

/** The frame's CSS size for the space available. */
function frameBox(format: FormatId, zoom: 'fit' | 'actual', space: StageBox): StageBox {
  const { aspect } = FORMATS[format];
  if (zoom === 'actual') {
    const frame = createFrame(format);
    const dpr = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1;
    return { width: frame.width / dpr, height: frame.height / dpr };
  }
  const width = Math.max(0, space.width - 2 * ROOM);
  const height = Math.max(0, space.height - 2 * ROOM);
  return width / height > aspect
    ? { width: height * aspect, height }
    : { width, height: width / aspect };
}

export function Stage({
  client,
  view,
  format,
  zoom,
  checkerboard,
  guides,
  label,
  overlay,
  controls,
  onAttach,
}: StageProps) {
  const area = useRef<HTMLDivElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const [space, setSpace] = useState<StageBox>({ width: 0, height: 0 });

  // The space available, measured before paint so the canvas never mounts at 0 × 0.
  useLayoutEffect(() => {
    const element = area.current;
    if (!element) return;
    const measure = () => setSpace({ width: element.clientWidth, height: element.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const box = frameBox(format, zoom, space);
  const ready = box.width > 0 && box.height > 0;
  // Read fresh when the view attaches, without re-attaching when the callback changes.
  const attached = useEffectEvent(() => onAttach());

  // The canvas is created imperatively: control transfers once, and React may mount twice.
  useEffect(() => {
    const element = host.current;
    if (!element || !ready) return;
    const size = () => {
      const rect = element.getBoundingClientRect();
      return { width: rect.width, height: rect.height, dpr: window.devicePixelRatio || 1 };
    };
    const initial = size();
    const canvas = document.createElement('canvas');
    // The backing store keeps the design's shape; mid-morph the box may not.
    canvas.className = 'block size-full object-contain';
    canvas.width = Math.max(1, Math.round(initial.width * initial.dpr));
    canvas.height = Math.max(1, Math.round(initial.height * initial.dpr));
    element.append(canvas);
    client.attach(view, canvas.transferControlToOffscreen(), initial, true);
    attached();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const observer = new ResizeObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(() => client.resize(view, size()), RESIZE_DELAY);
    });
    observer.observe(element);
    return () => {
      clearTimeout(timer);
      observer.disconnect();
      client.detach(view);
      canvas.remove();
    };
  }, [client, view, ready]);

  return (
    <div
      ref={area}
      className={cn(
        'relative min-h-0 flex-1',
        zoom === 'actual' ? 'overflow-auto' : 'overflow-hidden',
      )}
    >
      <div
        className={cn(
          'flex min-h-full min-w-full items-center justify-center',
          zoom === 'actual' && 'w-max p-8',
        )}
      >
        {ready && (
          <motion.div
            role="img"
            aria-label={label}
            initial={false}
            animate={{ width: box.width, height: box.height }}
            transition={uiSpring.snappy}
            className={cn(
              'relative shrink-0 overflow-hidden rounded-[20px] bg-bg-2 ring-1 ring-line',
              checkerboard &&
                '[background:repeating-conic-gradient(#1b1b1e_0%_25%,#141416_0%_50%)_0_0/16px_16px]',
            )}
          >
            {/* Holds the worker-owned canvas; React never renders children into it. */}
            <div ref={host} className="absolute inset-0" />
            {guides && <SafeAreas format={format} />}
            {overlay?.(box)}
          </motion.div>
        )}
      </div>
      {controls && (
        <div className="pointer-events-none absolute right-3 bottom-3 flex">
          <div className="pointer-events-auto flex items-center gap-0.5 rounded-full bg-bg-2/90 p-1 ring-1 ring-line backdrop-blur-sm">
            {controls}
          </div>
        </div>
      )}
    </div>
  );
}
