/**
 * Episode's one diagonal: every block edge, wipe and motion path shares it. A *sweep
 * coordinate* f(x, y) grows from the side the blocks enter on; a block whose front is at `s`
 * covers the part of the frame where f ≤ s, so its edge is always the same slanted line.
 *
 * Landscape frames sweep left → right with near-vertical edges leaning "/"; the others sweep
 * bottom → top with shallow edges rising to the right. Motion paths lean by the same angle.
 */

import type { FrameSpec, PathData, Rect } from '@/engine';

type Point = readonly [number, number];

export type Sweep = {
  /** Landscape: blocks enter from the left; otherwise from the bottom. */
  readonly side: boolean;
  /** f(x, y) = a·x + b·y + c. */
  readonly a: number;
  readonly b: number;
  readonly c: number;
  /** f of the frame's nearest and farthest corners (with bleed): uncovered … fully covered. */
  readonly min: number;
  readonly max: number;
  /** Change of f per design unit of perpendicular distance between two edges. */
  readonly scale: number;
  /** The shared motion path: up and to the right, the slant's angle off vertical. */
  readonly along: Point;
  f(x: number, y: number): number;
  /** The frame (with bleed) where f ≤ s, as a closed path; null when empty. */
  cover(s: number): PathData | null;
  /** The frame (with bleed) where from < f ≤ to. */
  band(from: number, to: number): PathData | null;
  /** Bounding box of the frame where f ≥ s. */
  beyond(s: number): Rect;
};

/** The part of a convex polygon where a·x + b·y ≤ c. */
function clip(polygon: readonly Point[], a: number, b: number, c: number): Point[] {
  const out: Point[] = [];
  for (let i = 0; i < polygon.length; i++) {
    const p = polygon[i]!;
    const q = polygon[(i + 1) % polygon.length]!;
    const dp = c - (a * p[0] + b * p[1]);
    const dq = c - (a * q[0] + b * q[1]);
    if (dp >= 0) out.push(p);
    if (dp >= 0 !== dq >= 0) {
      const k = dp / (dp - dq);
      out.push([p[0] + (q[0] - p[0]) * k, p[1] + (q[1] - p[1]) * k]);
    }
  }
  return out;
}

const toPath = (points: readonly Point[]): PathData | null =>
  points.length < 3
    ? null
    : [
        ['M', points[0]![0], points[0]![1]],
        ...points.slice(1).map(([x, y]) => ['L', x, y] as const),
        ['Z'],
      ];

export function createSweep(frame: FrameSpec, slantDegrees: number): Sweep {
  const { width, height, u } = frame;
  const side = frame.format === '16:9';
  const k = Math.tan((slantDegrees * Math.PI) / 180);
  // Landscape: f = x + k·y (edges "/", entering from the left). Otherwise f = (H − y) − k·x
  // (shallow edges rising to the right, entering from the bottom).
  const [a, b, c] = side ? [1, k, 0] : [-k, -1, height];
  const scale = Math.hypot(a, b);
  const bleed = 2 * u;
  const rect: Point[] = [
    [-bleed, -bleed],
    [width + bleed, -bleed],
    [width + bleed, height + bleed],
    [-bleed, height + bleed],
  ];
  const f = (x: number, y: number) => a * x + b * y + c;
  const values = rect.map(([x, y]) => f(x, y));
  const angle = (slantDegrees * Math.PI) / 180;
  const along: Point = [Math.sin(angle), -Math.cos(angle)];
  return {
    side,
    a,
    b,
    c,
    min: Math.min(...values),
    max: Math.max(...values),
    scale,
    along,
    f,
    cover: (s) => toPath(clip(rect, a, b, s - c)),
    band: (from, to) => toPath(clip(clip(rect, a, b, to - c), -a, -b, -(from - c))),
    beyond(s) {
      const points = clip(rect, -a, -b, -(s - c));
      const xs = points.map(([x]) => x);
      const ys = points.map(([, y]) => y);
      const x = Math.min(...xs);
      const y = Math.min(...ys);
      return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
    },
  };
}
