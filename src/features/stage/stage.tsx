'use client';

/**
 * The editor's stage (docs/02-experience.md §6): the design's canvas, handed to the render
 * worker as an interactive view, fitted to the space with 32 px of breathing room (or at 100%:
 * one device pixel per pixel of the 1080p frame). A checkerboard shows through transparent
 * designs without a preview backdrop; safe-area guides on request. The frame box springs to a
 * new format's shape while the worker re-lays the design out. Image files dragged over the stage
 * show what they'd fill (`drop`).
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
import {
  createFrame,
  type EditableRegion,
  FORMATS,
  type FormatId,
  type RenderClient,
} from '@/engine/host';
import { cn } from '@/lib/cn';
import { useFileDrag } from '../assets/file-drag';
import { SafeAreas } from './safe-areas';

/** Breathing room around the fitted frame (CSS px). */
const ROOM = 32;
/** Resizing a transferred canvas reallocates it: coalesce the resizes of a morph. */
const RESIZE_DELAY = 120;

export type StageBox = { width: number; height: number };

type Point = { x: number; y: number };
type Rect = EditableRegion['bounds'];

/** What a file dropped on the stage would fill: a control's label and its element's bounds. */
export type StageDropTarget = { label: string; bounds: Rect | null };

export type StageDrop = {
  /**
   * What a file dropped at `at` (design units; null outside the frame) would fill — null when
   * nothing on the stage takes files.
   */
  target: (at: Point | null) => StageDropTarget | null;
  onDrop: (file: File, at: Point | null) => void;
};

const sameTarget = (a: StageDropTarget | null, b: StageDropTarget | null) =>
  a === b || (a !== null && b !== null && JSON.stringify(a) === JSON.stringify(b));

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
  /** Image files dropped on the stage. */
  drop?: StageDrop;
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
  drop,
  onAttach,
}: StageProps) {
  const area = useRef<HTMLDivElement>(null);
  const framed = useRef<HTMLDivElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const [space, setSpace] = useState<StageBox>({ width: 0, height: 0 });
  const [dropping, setDropping] = useState<StageDropTarget | null>(null);

  /** The point of the frame under a drag, in design units (null outside the frame). */
  const pointAt = (event: { clientX: number; clientY: number }): Point | null => {
    const rect = framed.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return null;
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    if (x < 0 || y < 0 || x > rect.width || y > rect.height) return null;
    const k = rect.width / createFrame(format).width;
    return { x: x / k, y: y / k };
  };
  const fileDrag = useFileDrag({
    accepts: () => drop?.target(null) != null,
    onOver: (event) => {
      const next = drop?.target(pointAt(event)) ?? null;
      if (!sameTarget(dropping, next)) setDropping(next);
    },
    onDrop: (file, event) => drop?.onDrop(file, pointAt(event)),
  });

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
      {...(drop ? fileDrag.handlers : {})}
    >
      <div
        className={cn(
          'flex min-h-full min-w-full items-center justify-center',
          zoom === 'actual' && 'w-max p-8',
        )}
      >
        {ready && (
          <motion.div
            ref={framed}
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
            {fileDrag.over && dropping && (
              <DropHint target={dropping} k={box.width / createFrame(format).width} />
            )}
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

/**
 * Over the frame while an image is dragged onto the stage: the element it would replace lit
 * (the rest dimmed), and what dropping does.
 */
function DropHint({ target, k }: { target: StageDropTarget; k: number }) {
  const { bounds } = target;
  return (
    <div
      aria-hidden="true"
      className={cn(
        'pointer-events-none absolute inset-0 z-20 rounded-[20px] outline-2 -outline-offset-4 outline-[rgb(255_255_255/0.8)] outline-dashed',
        !bounds && 'bg-[rgb(0_0_0/0.45)]',
      )}
    >
      {bounds && (
        <div
          className="absolute rounded-[3px] outline-2 outline-[#fff] [box-shadow:0_0_0_9999px_rgb(0_0_0/0.45)]"
          style={{
            left: bounds.x * k,
            top: bounds.y * k,
            width: bounds.w * k,
            height: bounds.h * k,
          }}
        />
      )}
      <span className="absolute bottom-4 left-1/2 max-w-[calc(100%-2rem)] -translate-x-1/2 truncate rounded-full bg-bg/90 px-3 py-1.5 text-[13px] font-[550] text-fg ring-1 ring-line">
        Drop to use as {target.label}
      </span>
    </div>
  );
}
