'use client';

/**
 * The focal-point picker (docs/03-design-system.md §8, Image drop): the image a control shows,
 * with the point that stays in view when a template crops it. Drag the dot or click anywhere on
 * the image; arrow keys nudge it (Shift: ×10); a double-click centers it. On touch screens the
 * image scrolls the page like anything else: a tap sets the point, and dragging starts on the
 * dot. Screen readers get two sliders, left to right and top to bottom; Tab reaches the first.
 */

import {
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import type { FocalPoint } from '@/engine/host';
import { cn } from '@/lib/cn';
import type { Preview } from '../assets/previews';
import { CHECKERBOARD, PreviewCanvas } from './image-preview';

export const CENTER: FocalPoint = { x: 0.5, y: 0.5 };

/** Tallest the image is shown (CSS px). */
const MAX_HEIGHT = 200;
/** Height while the image is being prepared (CSS px). */
const LOADING_HEIGHT = 150;
/** One arrow-key step (Shift: ×10). */
const STEP = 0.01;
/** Two presses this close (ms, CSS px) are a double-click or double-tap. */
const DOUBLE = { time: 450, distance: 8 };
/** A touch that moves less than this (CSS px) is a tap. */
const TAP = 10;

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
/** Clamped to 0..1 and rounded as the engine keeps it (docs/06-engine.md §8). */
const tidy = (p: FocalPoint): FocalPoint => ({
  x: Math.round(clamp01(p.x) * 1000) / 1000,
  y: Math.round(clamp01(p.y) * 1000) / 1000,
});
const percent = (n: number) => Math.round(n * 100);

export const isCenter = (p: FocalPoint) =>
  Math.abs(p.x - CENTER.x) < 0.0005 && Math.abs(p.y - CENTER.y) < 0.0005;

type FocalPickerProps = {
  /** The control's label (for accessible names). */
  label: string;
  /** Undefined while the image is being prepared. */
  preview: Preview | undefined;
  focal: FocalPoint;
  /**
   * A new focal point. `continuous` marks drags, nudges and double-clicks: edits that come in
   * streams and undo as one step (docs/05-architecture.md §6).
   */
  onChange: (focal: FocalPoint, continuous: boolean) => void;
};

export function FocalPicker({ label, preview, focal, onChange }: FocalPickerProps) {
  const frame = useRef<HTMLDivElement>(null);
  const picture = useRef<HTMLDivElement>(null);
  const horizontal = useRef<HTMLInputElement>(null);
  const [width, setWidth] = useState(0);
  const [dragging, setDragging] = useState(false);
  /** The drag in progress: its pointer, and where on the dot it took hold (image fractions). */
  const drag = useRef<{ id: number; dx: number; dy: number } | null>(null);
  /** A touch on the image that sets the point if it ends as a tap (it may be a scroll). */
  const tap = useRef<{ id: number; x: number; y: number } | null>(null);
  const press = useRef<{ at: number; x: number; y: number } | null>(null);

  useLayoutEffect(() => {
    const element = frame.current;
    if (!element) return;
    const measure = () => setWidth(element.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // The image fills the width, up to MAX_HEIGHT tall; narrower images center on the frame.
  const aspect = preview ? preview.width / preview.height : 1;
  const box = preview && width > 0 ? Math.min(width, MAX_HEIGHT * aspect) : 0;
  const height = box > 0 ? box / aspect : LOADING_HEIGHT;

  const set = (next: FocalPoint, continuous = true) => onChange(tidy(next), continuous);

  /** The point of the image under the pointer (clamped to its edges). */
  const at = (event: ReactPointerEvent) => {
    const rect = picture.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return null;
    return {
      x: clamp01((event.clientX - rect.left) / rect.width),
      y: clamp01((event.clientY - rect.top) / rect.height),
    };
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || !preview) return;
    // A double-click (or double-tap) centers the point — undone together with its first press.
    const last = press.current;
    const double =
      last !== null &&
      event.timeStamp - last.at < DOUBLE.time &&
      Math.hypot(event.clientX - last.x, event.clientY - last.y) < DOUBLE.distance;
    press.current = double ? null : { at: event.timeStamp, x: event.clientX, y: event.clientY };
    if (double) {
      set(CENTER);
      return;
    }
    const onDot = event.target instanceof Element && event.target.closest('[data-focal-dot]');
    if (event.pointerType === 'touch' && !onDot) {
      tap.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
      return;
    }
    const point = at(event);
    if (!point) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
    // Taking hold of the dot keeps it under the pointer; a press elsewhere moves it there.
    drag.current = onDot
      ? { id: event.pointerId, dx: focal.x - point.x, dy: focal.y - point.y }
      : { id: event.pointerId, dx: 0, dy: 0 };
    if (!onDot) set(point);
  };
  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const held = drag.current;
    if (held?.id !== event.pointerId) return;
    const point = at(event);
    if (point) set({ x: point.x + held.dx, y: point.y + held.dy });
  };
  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const touch = tap.current;
    if (touch?.id === event.pointerId) {
      tap.current = null;
      const point = at(event);
      if (point && Math.hypot(event.clientX - touch.x, event.clientY - touch.y) < TAP) set(point);
      return;
    }
    if (drag.current?.id !== event.pointerId) return;
    drag.current = null;
    setDragging(false);
    // Arrow keys fine-tune from here (after the press, which would take focus back).
    if (event.pointerType !== 'touch') horizontal.current?.focus({ preventScroll: true });
  };
  const onPointerCancel = () => {
    // The browser took the touch for scrolling: the point stays where it was.
    tap.current = null;
    drag.current = null;
    setDragging(false);
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    const by = event.shiftKey ? STEP * 10 : STEP;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-by, 0],
      ArrowRight: [by, 0],
      ArrowUp: [0, -by],
      ArrowDown: [0, by],
    };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    set({ x: focal.x + move[0], y: focal.y + move[1] });
  };

  const x = percent(focal.x);
  const y = percent(focal.y);
  const input = 'sr-only';
  return (
    <div className="flex flex-col gap-1.5">
      <div
        ref={frame}
        title="Drag to choose what stays in view. Double-click to center."
        className={cn(
          'group/focal relative flex w-full touch-pan-y justify-center overflow-hidden rounded-md bg-bg-3 ring-1 ring-line select-none',
          preview ? 'cursor-crosshair' : 'animate-pulse',
        )}
        style={{ height }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
      >
        {preview && (
          <div
            ref={picture}
            className={cn('relative h-full shrink-0', preview.cutout && CHECKERBOARD)}
            style={{ width: box }}
          >
            <PreviewCanvas preview={preview} fit="cover" />
            {dragging && (
              <>
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-y-0 w-px bg-[rgb(255_255_255/0.6)]"
                  style={{ left: `${focal.x * 100}%` }}
                />
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-x-0 h-px bg-[rgb(255_255_255/0.6)]"
                  style={{ top: `${focal.y * 100}%` }}
                />
              </>
            )}
            {/* The dot, in a 44 px touch target that drags instead of scrolling. */}
            <span
              aria-hidden="true"
              data-focal-dot=""
              className="absolute flex size-11 -translate-x-1/2 -translate-y-1/2 cursor-grab touch-none items-center justify-center"
              style={{ left: `${focal.x * 100}%`, top: `${focal.y * 100}%` }}
            >
              <span
                className={cn(
                  'relative size-5 rounded-full border-2 border-[#fff] shadow-[0_0_0_1px_rgb(0_0_0/0.45),0_2px_6px_rgb(0_0_0/0.4)] outline-offset-2',
                  'transition-[scale] duration-(--duration-micro) ease-swift',
                  'group-has-[input:focus-visible]/focal:outline-2 group-has-[input:focus-visible]/focal:outline-focus',
                  dragging && 'scale-110',
                )}
              >
                <span className="absolute top-1/2 left-1/2 size-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#fff] shadow-[0_0_0_1px_rgb(0_0_0/0.35)]" />
              </span>
            </span>
            <input
              ref={horizontal}
              type="range"
              min={0}
              max={100}
              step={1}
              value={x}
              aria-label={`${label} focal point, left to right`}
              aria-valuetext={`${x}% from the left`}
              onChange={(event) => set({ x: Number(event.target.value) / 100, y: focal.y })}
              onKeyDown={onKeyDown}
              className={input}
            />
            <input
              type="range"
              tabIndex={-1}
              min={0}
              max={100}
              step={1}
              value={y}
              aria-label={`${label} focal point, top to bottom`}
              aria-valuetext={`${y}% from the top`}
              onChange={(event) => set({ x: focal.x, y: Number(event.target.value) / 100 })}
              onKeyDown={onKeyDown}
              className={input}
            />
          </div>
        )}
      </div>
      <div className="flex min-h-5 items-center justify-between gap-3 text-[12px] leading-snug">
        <span className="text-fg-3">Drag the dot to choose what stays in view.</span>
        {!isCenter(focal) && (
          <button
            type="button"
            className="shrink-0 font-[550] text-fg-2 underline decoration-line-strong underline-offset-2 hover:text-fg hover:decoration-fg"
            onClick={() => set(CENTER, false)}
          >
            Center
          </button>
        )}
      </div>
    </div>
  );
}
