'use client';

/**
 * The editing overlay (docs/02-experience.md §6): over the stage, the design's editable
 * elements and movable groups as the render worker reports them. Pointing at an element shows
 * a faint outline; a click focuses its field in the inspector and selects the group around it;
 * dragging moves the group, snapping to the center lines and the title-safe edges (the guide
 * flashes); the corner handle scales it. Every element is also a button, so Tab reaches them.
 */

import { type PointerEvent as ReactPointerEvent, useRef, useState } from 'react';
import { createFrame, type EditableRegion, type FormatId, type LayoutOffset } from '@/engine/host';
import { cn } from '@/lib/cn';

type Rect = EditableRegion['bounds'];

/** Snap distance (CSS px). */
const SNAP = 6;
/** Movement before a press becomes a drag (CSS px). */
const SLOP = 3;
/** Scale limits for movable groups. */
export const SCALE_LIMITS = { min: 0.5, max: 2 };

export type OverlayProps = {
  format: FormatId;
  /** The frame box's CSS size. */
  box: { width: number; height: number };
  regions: readonly EditableRegion[];
  /** Names of the controls and groups the regions stand for (accessible labels). */
  names: Readonly<Record<string, string>>;
  layout: Readonly<Record<string, LayoutOffset>>;
  selected: string | null;
  hovered: string | null;
  onHover: (control: string | null) => void;
  onSelect: (group: string | null) => void;
  onFocusControl: (control: string) => void;
  /** A group's new offset; `gesture` is the same for every move of one drag. */
  onMove: (group: string, offset: LayoutOffset, gesture: string) => void;
  /** A drag begins (playback pauses). */
  onGrab: () => void;
};

type Drag = {
  kind: 'move' | 'scale';
  group: string;
  gesture: string;
  pointer: { x: number; y: number };
  start: LayoutOffset;
  bounds: Rect;
  /** Editable element under the press (focused if the press doesn't become a drag). */
  control: string | null;
  moved: boolean;
};

const area = (r: Rect) => r.w * r.h;
const contains = (r: Rect, x: number, y: number) =>
  x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
/** The smallest region of `kind` under a point (the most specific). */
const hit = (
  regions: readonly EditableRegion[],
  kind: EditableRegion['kind'],
  x: number,
  y: number,
) =>
  regions
    .filter((r) => r.kind === kind && contains(r.bounds, x, y))
    .sort((a, b) => area(a.bounds) - area(b.bounds))[0] ?? null;

const clampScale = (s: number) => Math.min(SCALE_LIMITS.max, Math.max(SCALE_LIMITS.min, s));

let gestures = 0;

export function Overlay(props: OverlayProps) {
  const { format, box, regions, layout, selected, hovered } = props;
  const frame = createFrame(format);
  const k = box.width / frame.width;
  const layer = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const [snaps, setSnaps] = useState<{ x: number | null; y: number | null }>({ x: null, y: null });

  /** Pointer position in design units. */
  const at = (event: ReactPointerEvent) => {
    const rect = layer.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return { x: (event.clientX - rect.left) / k, y: (event.clientY - rect.top) / k };
  };

  const offsetOf = (group: string): LayoutOffset => layout[group] ?? { x: 0, y: 0, scale: 1 };
  const boundsOf = (group: string) =>
    regions.find((r) => r.kind === 'movable' && r.target === group)?.bounds ?? null;

  /** Snaps a moved rectangle's center or edges to the center lines and title-safe edges. */
  const snap = (moved: Rect) => {
    const { title } = frame.safe;
    const reach = SNAP / k;
    const pick = (pairs: [number, number][]) => {
      let best: { shift: number; line: number } | null = null;
      for (const [value, line] of pairs) {
        const shift = line - value;
        if (Math.abs(shift) <= reach && (!best || Math.abs(shift) < Math.abs(best.shift))) {
          best = { shift, line };
        }
      }
      return best;
    };
    const x = pick([
      [moved.x + moved.w / 2, frame.cx],
      [moved.x, title.x],
      [moved.x + moved.w, title.x + title.w],
    ]);
    const y = pick([
      [moved.y + moved.h / 2, frame.cy],
      [moved.y, title.y],
      [moved.y + moved.h, title.y + title.h],
    ]);
    return { x, y };
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>, kind: Drag['kind'] = 'move') => {
    if (event.button !== 0) return;
    const p = at(event);
    const control = hit(regions, 'editable', p.x, p.y)?.target ?? null;
    const group = kind === 'scale' ? selected : (hit(regions, 'movable', p.x, p.y)?.target ?? null);
    props.onSelect(group);
    const bounds = group ? boundsOf(group) : null;
    if (!group || !bounds) {
      if (control) props.onFocusControl(control);
      return;
    }
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {
      kind,
      group,
      gesture: `${group}.${++gestures}`,
      pointer: p,
      start: offsetOf(group),
      bounds,
      control,
      moved: false,
    };
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const p = at(event);
    const d = drag.current;
    if (!d) {
      props.onHover(hit(regions, 'editable', p.x, p.y)?.target ?? null);
      return;
    }
    const dx = p.x - d.pointer.x;
    const dy = p.y - d.pointer.y;
    if (!d.moved) {
      if (Math.hypot(dx, dy) * k < SLOP) return;
      d.moved = true;
      props.onGrab();
    }
    const { u } = frame;
    if (d.kind === 'scale') {
      const cx = d.bounds.x + d.bounds.w / 2;
      const cy = d.bounds.y + d.bounds.h / 2;
      const from = Math.hypot(d.pointer.x - cx, d.pointer.y - cy);
      const to = Math.hypot(p.x - cx, p.y - cy);
      const scale = clampScale(from > 0 ? (d.start.scale * to) / from : d.start.scale);
      props.onMove(d.group, { ...d.start, scale: Math.round(scale * 100) / 100 }, d.gesture);
      return;
    }
    // Free movement unless Alt is held… snapping to lines within reach.
    const moved = { ...d.bounds, x: d.bounds.x + dx, y: d.bounds.y + dy };
    const lines = event.altKey ? { x: null, y: null } : snap(moved);
    setSnaps({ x: lines.x?.line ?? null, y: lines.y?.line ?? null });
    const sx = dx + (lines.x?.shift ?? 0);
    const sy = dy + (lines.y?.shift ?? 0);
    props.onMove(
      d.group,
      {
        ...d.start,
        x: Math.round((d.start.x + sx / u) * 100) / 100,
        y: Math.round((d.start.y + sy / u) * 100) / 100,
      },
      d.gesture,
    );
  };

  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    setSnaps({ x: null, y: null });
    if (d && !d.moved && d.control) props.onFocusControl(d.control);
  };

  const selectedBounds = selected ? boundsOf(selected) : null;
  const hoveredBounds =
    hovered && !drag.current
      ? (regions.find((r) => r.kind === 'editable' && r.target === hovered)?.bounds ?? null)
      : null;
  const css = (r: Rect) => ({
    left: r.x * k,
    top: r.y * k,
    width: r.w * k,
    height: r.h * k,
  });
  const movable = regions.filter((r) => r.kind === 'movable');
  const hovering = hoveredBounds !== null || movable.some((r) => r.target === selected);

  return (
    <div
      ref={layer}
      className={cn('absolute inset-0 touch-none', hovering ? 'cursor-move' : 'cursor-default')}
      onPointerDown={(event) => onPointerDown(event)}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onPointerLeave={() => {
        if (!drag.current) props.onHover(null);
      }}
    >
      {hoveredBounds && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute rounded-[2px] outline outline-1 outline-white/45"
          style={css(hoveredBounds)}
        />
      )}
      {selectedBounds && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute outline outline-1 outline-select [box-shadow:0_0_0_2px_rgb(255_255_255/0.9)]"
          style={css(selectedBounds)}
        >
          <span
            className="pointer-events-auto absolute -right-2 -bottom-2 size-4 cursor-nwse-resize rounded-full border-2 border-white bg-select"
            onPointerDown={(event) => {
              event.stopPropagation();
              onPointerDown(event as unknown as ReactPointerEvent<HTMLDivElement>, 'scale');
            }}
          />
        </div>
      )}
      {snaps.x !== null && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 w-px bg-select"
          style={{ left: snaps.x * k }}
        />
      )}
      {snaps.y !== null && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 h-px bg-select"
          style={{ top: snaps.y * k }}
        />
      )}
      {/* Keyboard access: every element is a button (Tab), movable groups move with arrows. */}
      {regions.map((region) => (
        <button
          key={region.id}
          type="button"
          aria-label={
            region.kind === 'movable'
              ? `Move ${props.names[region.target] ?? region.target} (arrow keys)`
              : `Edit ${props.names[region.target] ?? region.target}`
          }
          className="pointer-events-none absolute opacity-0 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-focus"
          style={css(region.bounds)}
          onFocus={() => {
            if (region.kind === 'movable') props.onSelect(region.target);
          }}
          onClick={() => {
            if (region.kind === 'editable') props.onFocusControl(region.target);
            else props.onSelect(region.target);
          }}
        />
      ))}
    </div>
  );
}
