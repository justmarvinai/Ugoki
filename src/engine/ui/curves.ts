/**
 * The UI Kit's pure math: monotone cubic interpolation for chart lines (no fake overshoot in
 * data), "nice" axis ticks, arc-length sampling of paths (draw heads for trim paths) and the
 * minimum-jerk profile of human hand motion (docs/04-motion-language.md §3).
 */

import { clamp01, type Vec2 } from '../core/math';
import type { PathCommand, PathData } from '../draw/types';

// --- monotone cubic interpolation -----------------------------------------------------------

/**
 * Tangents of the monotone cubic Hermite interpolant through (xs, ys) (Steffen 1990, as in
 * d3's curveMonotoneX): the curve never overshoots the data — between two points it stays
 * within their values, and flat or extreme points get horizontal tangents. `xs` must increase.
 */
export function monotoneTangents(xs: ArrayLike<number>, ys: ArrayLike<number>): Float64Array {
  const n = Math.min(xs.length, ys.length);
  const m = new Float64Array(n);
  if (n < 2) return m;
  const h = (i: number) => (xs[i + 1] as number) - (xs[i] as number);
  const s = (i: number) => {
    const hi = h(i);
    return hi !== 0 ? ((ys[i + 1] as number) - (ys[i] as number)) / hi : 0;
  };
  if (n === 2) {
    m[0] = s(0);
    m[1] = s(0);
    return m;
  }
  for (let i = 1; i < n - 1; i++) {
    const h0 = h(i - 1);
    const h1 = h(i);
    const s0 = s(i - 1);
    const s1 = s(i);
    const p = h0 + h1 !== 0 ? (s0 * h1 + s1 * h0) / (h0 + h1) : 0;
    m[i] =
      (Math.sign(s0) + Math.sign(s1)) * Math.min(Math.abs(s0), Math.abs(s1), 0.5 * Math.abs(p)) ||
      0;
  }
  // One-sided ends (a quadratic through the end point with the neighbour's tangent): they stay
  // within [s, 1.5 s] of the end slope, so the ends are monotone too.
  m[0] = h(0) !== 0 ? (3 * s(0) - (m[1] as number)) / 2 : (m[1] as number);
  m[n - 1] = h(n - 2) !== 0 ? (3 * s(n - 2) - (m[n - 2] as number)) / 2 : (m[n - 2] as number);
  return m;
}

/** Cubic bézier segments of the monotone interpolant through `points` (x increasing). */
export function monotonePath(points: readonly Vec2[]): PathCommand[] {
  const first = points[0];
  if (!first) return [];
  const path: PathCommand[] = [['M', first.x, first.y]];
  if (points.length === 1) return path;
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const m = monotoneTangents(xs, ys);
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i] as Vec2;
    const b = points[i + 1] as Vec2;
    const d = (b.x - a.x) / 3;
    path.push([
      'C',
      a.x + d,
      a.y + (m[i] as number) * d,
      b.x - d,
      b.y - (m[i + 1] as number) * d,
      b.x,
      b.y,
    ]);
  }
  return path;
}

/** The monotone interpolant's value at `x` (clamped to the data's x range). */
export function monotoneAt(
  xs: ArrayLike<number>,
  ys: ArrayLike<number>,
  tangents: ArrayLike<number>,
  x: number,
): number {
  const n = Math.min(xs.length, ys.length);
  if (n === 0) return 0;
  if (n === 1 || x <= (xs[0] as number)) return ys[0] as number;
  if (x >= (xs[n - 1] as number)) return ys[n - 1] as number;
  let i = 0;
  while (i < n - 2 && x > (xs[i + 1] as number)) i++;
  const x0 = xs[i] as number;
  const h = (xs[i + 1] as number) - x0;
  const t = (x - x0) / h;
  const t2 = t * t;
  const t3 = t2 * t;
  return (
    (2 * t3 - 3 * t2 + 1) * (ys[i] as number) +
    (t3 - 2 * t2 + t) * h * (tangents[i] as number) +
    (-2 * t3 + 3 * t2) * (ys[i + 1] as number) +
    (t3 - t2) * h * (tangents[i + 1] as number)
  );
}

// --- axis ticks -----------------------------------------------------------------------------

export type Ticks = {
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly values: readonly number[];
};

/**
 * Round tick values covering [min, max] with about `count` intervals (steps of 1, 2, 2.5 or 5
 * × 10ⁿ); the returned range is widened to whole steps.
 */
export function niceTicks(min: number, max: number, count = 4): Ticks {
  let lo = Math.min(min, max);
  let hi = Math.max(min, max);
  if (!Number.isFinite(lo) || !Number.isFinite(hi))
    return { min: 0, max: 1, step: 1, values: [0, 1] };
  if (hi - lo < 1e-9) {
    const pad = Math.abs(hi) > 0 ? Math.abs(hi) * 0.5 : 1;
    lo -= lo === 0 ? 0 : pad;
    hi += pad;
  }
  const rough = (hi - lo) / Math.max(1, count);
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const residual = rough / magnitude;
  const nice =
    residual <= 1 ? 1 : residual <= 2 ? 2 : residual <= 2.5 ? 2.5 : residual <= 5 ? 5 : 10;
  const step = nice * magnitude;
  const start = Math.floor(lo / step + 1e-9) * step;
  const end = Math.ceil(hi / step - 1e-9) * step;
  const values: number[] = [];
  for (let v = start, i = 0; v <= end + step * 1e-6 && i < 50; v += step, i++) {
    values.push(Number(v.toPrecision(12)));
  }
  return { min: start, max: end, step, values };
}

// --- arc-length sampling ------------------------------------------------------------------

const SEGMENT_STEPS = 24;

/**
 * A path flattened for arc-length queries: `at(fraction)` is the point a trim path's end
 * reaches at that fraction of the length (the head of a line being drawn on).
 */
export class PathSampler {
  readonly length: number;
  private readonly xs: Float64Array;
  private readonly ys: Float64Array;
  private readonly cumulative: Float64Array;
  private readonly point: Vec2 = { x: 0, y: 0 };

  constructor(path: PathData) {
    const xs: number[] = [];
    const ys: number[] = [];
    let x = 0;
    let y = 0;
    let startX = 0;
    let startY = 0;
    const push = (px: number, py: number) => {
      xs.push(px);
      ys.push(py);
      x = px;
      y = py;
    };
    for (const command of path) {
      switch (command[0]) {
        case 'M':
          if (xs.length === 0) push(command[1], command[2]);
          else {
            x = command[1];
            y = command[2];
          }
          startX = x;
          startY = y;
          break;
        case 'L':
          push(command[1], command[2]);
          break;
        case 'Q': {
          const [, cx, cy, ex, ey] = command;
          const x0 = x;
          const y0 = y;
          for (let i = 1; i <= SEGMENT_STEPS; i++) {
            const t = i / SEGMENT_STEPS;
            const mt = 1 - t;
            push(
              mt * mt * x0 + 2 * mt * t * cx + t * t * ex,
              mt * mt * y0 + 2 * mt * t * cy + t * t * ey,
            );
          }
          break;
        }
        case 'C': {
          const [, c1x, c1y, c2x, c2y, ex, ey] = command;
          const x0 = x;
          const y0 = y;
          for (let i = 1; i <= SEGMENT_STEPS; i++) {
            const t = i / SEGMENT_STEPS;
            const mt = 1 - t;
            const a = mt * mt * mt;
            const b = 3 * mt * mt * t;
            const c = 3 * mt * t * t;
            const d = t * t * t;
            push(a * x0 + b * c1x + c * c2x + d * ex, a * y0 + b * c1y + c * c2y + d * ey);
          }
          break;
        }
        case 'Z':
          push(startX, startY);
          break;
      }
    }
    this.xs = Float64Array.from(xs);
    this.ys = Float64Array.from(ys);
    this.cumulative = new Float64Array(xs.length);
    let total = 0;
    for (let i = 1; i < xs.length; i++) {
      total += Math.hypot(
        (xs[i] as number) - (xs[i - 1] as number),
        (ys[i] as number) - (ys[i - 1] as number),
      );
      this.cumulative[i] = total;
    }
    this.length = total;
  }

  /** The point at `fraction` (0..1) of the length. The returned object is reused. */
  at(fraction: number): Vec2 {
    const n = this.xs.length;
    const out = this.point;
    if (n === 0) {
      out.x = 0;
      out.y = 0;
      return out;
    }
    const target = clamp01(fraction) * this.length;
    let lo = 0;
    let hi = n - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if ((this.cumulative[mid] as number) < target) lo = mid + 1;
      else hi = mid;
    }
    const i = Math.max(1, lo);
    const c0 = this.cumulative[i - 1] as number;
    const c1 = this.cumulative[i] as number;
    const t = c1 > c0 ? (target - c0) / (c1 - c0) : 0;
    out.x = (this.xs[i - 1] as number) + ((this.xs[i] as number) - (this.xs[i - 1] as number)) * t;
    out.y = (this.ys[i - 1] as number) + ((this.ys[i] as number) - (this.ys[i - 1] as number)) * t;
    if (n === 1) {
      out.x = this.xs[0] as number;
      out.y = this.ys[0] as number;
    }
    return out;
  }

  /** The fraction of the length at which the path first reaches `x` (for x-monotone paths). */
  fractionAtX(x: number): number {
    const n = this.xs.length;
    if (n < 2 || this.length <= 0) return 0;
    if (x <= (this.xs[0] as number)) return 0;
    for (let i = 1; i < n; i++) {
      const x1 = this.xs[i] as number;
      if (x1 >= x) {
        const x0 = this.xs[i - 1] as number;
        const t = x1 > x0 ? (x - x0) / (x1 - x0) : 1;
        const c0 = this.cumulative[i - 1] as number;
        const c1 = this.cumulative[i] as number;
        return (c0 + (c1 - c0) * t) / this.length;
      }
    }
    return 1;
  }
}

// --- minimum jerk ---------------------------------------------------------------------------

/**
 * Minimum-jerk position profile `10s³ − 15s⁴ + 6s⁵` (Flash & Hogan 1985): how a hand moves
 * between two points — zero velocity and acceleration at both ends, peak speed 1.875× the
 * average at the midpoint.
 */
export function minimumJerk(s: number): number {
  const x = clamp01(s);
  return x * x * x * (10 + x * (-15 + 6 * x));
}

/** Velocity of the minimum-jerk profile (d/ds): `30 s² (1 − s)²`. */
export function minimumJerkVelocity(s: number): number {
  const x = clamp01(s);
  const y = 1 - x;
  return 30 * x * x * y * y;
}
