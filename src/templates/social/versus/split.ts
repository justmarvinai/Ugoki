/**
 * Versus's split: the frame cut in two by a straight seam — top/bottom, left/right, or tilted —
 * described as a half-plane. The seam is the line (p − c)·n = s: `n` is its unit normal (from
 * field A into field B), `c` the frame's center, `s` how far the seam sits from the center along
 * `n` (the winner's push and the exit move it). Fields are convex polygons (the frame clipped by
 * the half-plane).
 *
 * Engine candidate: `polygon` / half-plane clipping in the Draw API (planned there as `polygon`).
 */

import type { PathCommand, Rect, Vec2 } from '@/engine';

export type Seam = {
  /** Frame center. */
  readonly cx: number;
  readonly cy: number;
  /** Unit normal, from A into B. */
  readonly nx: number;
  readonly ny: number;
  /** Unit direction along the seam (n rotated −90°). */
  readonly dx: number;
  readonly dy: number;
  /** Largest |(corner − c)·n| over the frame's corners: a field this far out is off-screen. */
  readonly reach: number;
};

/**
 * A seam through (cx, cy). `rows`: A on top, B below (the seam runs across); `columns`: A left,
 * B right. `tilt` (degrees) leans it like a slash — a rising line across rows, a top leaning right
 * between columns — so A keeps the upper left, B the lower right.
 */
export function createSeam(
  frame: { width: number; height: number },
  layout: 'rows' | 'columns',
  tilt: number,
  cx: number,
  cy: number,
): Seam {
  const a = (tilt * Math.PI) / 180;
  const nx = layout === 'rows' ? Math.sin(a) : Math.cos(a);
  const ny = layout === 'rows' ? Math.cos(a) : Math.sin(a);
  // The farthest frame corner from the seam, on either side.
  let reach = 0;
  for (const x of [0, frame.width]) {
    for (const y of [0, frame.height]) {
      reach = Math.max(reach, Math.abs((x - cx) * nx + (y - cy) * ny));
    }
  }
  return { cx, cy, nx, ny, dx: ny, dy: -nx, reach };
}

/** Signed distance of a point from the seam's center line along n (A < 0 < B). */
export const along = (seam: Seam, x: number, y: number) =>
  (x - seam.cx) * seam.nx + (y - seam.cy) * seam.ny;

/** The point where the seam (at offset s) crosses the line through the frame center along n. */
export const seamPoint = (seam: Seam, s: number): Vec2 => ({
  x: seam.cx + seam.nx * s,
  y: seam.cy + seam.ny * s,
});

/**
 * The part of `rect` on one side of the seam at offset `s`: `side` −1 keeps (p − c)·n ≤ s (A),
 * +1 keeps (p − c)·n ≥ s (B), or null when nothing of the rect is on that side. A new path every
 * call (the drawer caches paths by identity, so a path is never changed after drawing it).
 */
export function fieldPath(seam: Seam, rect: Rect, s: number, side: -1 | 1): PathCommand[] | null {
  const xs = [rect.x, rect.x + rect.w, rect.x + rect.w, rect.x];
  const ys = [rect.y, rect.y, rect.y + rect.h, rect.y + rect.h];
  const out: PathCommand[] = [];
  const value = (i: number) => side * (along(seam, xs[i] as number, ys[i] as number) - s);
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    const vi = value(i);
    const vj = value(j);
    const xi = xs[i] as number;
    const yi = ys[i] as number;
    if (vi >= 0) out.push(out.length === 0 ? ['M', xi, yi] : ['L', xi, yi]);
    if (vi >= 0 !== vj >= 0) {
      const k = vi / (vi - vj);
      const x = xi + ((xs[j] as number) - xi) * k;
      const y = yi + ((ys[j] as number) - yi) * k;
      out.push(out.length === 0 ? ['M', x, y] : ['L', x, y]);
    }
  }
  if (out.length < 3) return null;
  out.push(['Z']);
  return out;
}

/**
 * Where a box must move along n so that all of it keeps `clearance` from the seam at offset `s`
 * on the given side: the extra distance (≥ 0) to push it away from the seam.
 */
export function clearanceShift(
  seam: Seam,
  box: Rect,
  s: number,
  side: -1 | 1,
  clearance: number,
): number {
  let worst = Number.POSITIVE_INFINITY;
  const corners = [
    [box.x, box.y],
    [box.x + box.w, box.y],
    [box.x, box.y + box.h],
    [box.x + box.w, box.y + box.h],
  ] as const;
  for (const [x, y] of corners) worst = Math.min(worst, side * (along(seam, x, y) - s));
  return Math.max(0, clearance - worst);
}
