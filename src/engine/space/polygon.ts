/**
 * Small polygon helpers for drawing planes: flat point lists (x0, y0, x1, y1, …), a triangle
 * whose chosen edges are pushed outward (so neighbouring triangles overlap instead of leaving
 * anti-aliasing seams), convex clipping (Sutherland–Hodgman), convex hulls and paths.
 */

import type { Rect } from '../core/math';
import type { PathCommand, PathData } from '../draw/types';

/** Twice the signed area of a flat polygon (positive = clockwise on screen, y down). */
export function signedArea2(points: ArrayLike<number>, count = points.length >> 1): number {
  let area = 0;
  for (let i = 0; i < count; i++) {
    const j = (i + 1) % count;
    const xi = points[2 * i] as number;
    const yi = points[2 * i + 1] as number;
    const xj = points[2 * j] as number;
    const yj = points[2 * j + 1] as number;
    area += xi * yj - xj * yi;
  }
  return area;
}

/**
 * The triangle (x0, y0) (x1, y1) (x2, y2) with each edge i (from vertex i to i + 1) moved
 * outward by `offsets[i]`; vertices move to where the moved edges meet (at most `limit` away).
 * Returns the 3 new vertices as a flat list, or null for a degenerate triangle.
 */
export function offsetTriangle(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  o0: number,
  o1: number,
  o2: number,
  limit: number,
  out: number[],
): number[] | null {
  const area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
  if (!(Math.abs(area) > 1e-9)) return null;
  // Outward normals: for a clockwise triangle (area > 0, y down) the outward normal of an edge
  // (dx, dy) is (dy, −dx) normalized; flip for the other winding.
  const sign = area > 0 ? 1 : -1;
  const n = NORMALS;
  const xs = [x0, x1, x2];
  const ys = [y0, y1, y2];
  for (let i = 0; i < 3; i++) {
    const j = (i + 1) % 3;
    const dx = (xs[j] as number) - (xs[i] as number);
    const dy = (ys[j] as number) - (ys[i] as number);
    const length = Math.hypot(dx, dy) || 1;
    n[2 * i] = (sign * dy) / length;
    n[2 * i + 1] = (-sign * dx) / length;
  }
  const offsets = [o0, o1, o2];
  out.length = 6;
  for (let i = 0; i < 3; i++) {
    // Vertex i joins edge i − 1 (arriving) and edge i (leaving).
    const p = (i + 2) % 3;
    const op = offsets[p] as number;
    const oi = offsets[i] as number;
    let dx = 0;
    let dy = 0;
    if (op !== 0 || oi !== 0) {
      const ax = n[2 * p] as number;
      const ay = n[2 * p + 1] as number;
      const bx = n[2 * i] as number;
      const by = n[2 * i + 1] as number;
      const det = ax * by - ay * bx;
      if (Math.abs(det) > 1e-6) {
        dx = (op * by - oi * ay) / det;
        dy = (oi * ax - op * bx) / det;
      } else {
        dx = ax * Math.max(op, oi);
        dy = ay * Math.max(op, oi);
      }
      const reach = Math.hypot(dx, dy);
      if (reach > limit) {
        dx *= limit / reach;
        dy *= limit / reach;
      }
    }
    out[2 * i] = (xs[i] as number) + dx;
    out[2 * i + 1] = (ys[i] as number) + dy;
  }
  return out;
}

const NORMALS = [0, 0, 0, 0, 0, 0];

/**
 * Clips a polygon (flat list) to a convex polygon (flat list, either winding) — the part of
 * `subject` inside `clip`. Returns a new flat list (possibly empty).
 */
export function clipConvex(subject: readonly number[], clip: ArrayLike<number>): number[] {
  const clipCount = clip.length >> 1;
  const orientation = signedArea2(clip, clipCount) >= 0 ? 1 : -1;
  let input = subject.slice();
  for (let e = 0; e < clipCount && input.length >= 6; e++) {
    const ax = clip[2 * e] as number;
    const ay = clip[2 * e + 1] as number;
    const bx = clip[2 * ((e + 1) % clipCount)] as number;
    const by = clip[2 * ((e + 1) % clipCount) + 1] as number;
    const ex = bx - ax;
    const ey = by - ay;
    if (ex === 0 && ey === 0) continue;
    const side = (x: number, y: number) => orientation * (ex * (y - ay) - ey * (x - ax));
    const output: number[] = [];
    const count = input.length >> 1;
    for (let i = 0; i < count; i++) {
      const cx = input[2 * i] as number;
      const cy = input[2 * i + 1] as number;
      const j = (i + count - 1) % count;
      const px = input[2 * j] as number;
      const py = input[2 * j + 1] as number;
      const sc = side(cx, cy);
      const sp = side(px, py);
      if (sc >= 0) {
        if (sp < 0) {
          const k = sp / (sp - sc);
          output.push(px + (cx - px) * k, py + (cy - py) * k);
        }
        output.push(cx, cy);
      } else if (sp >= 0) {
        const k = sp / (sp - sc);
        output.push(px + (cx - px) * k, py + (cy - py) * k);
      }
    }
    input = output;
  }
  return input.length >= 6 ? input : [];
}

/** A closed path through a flat list of points. */
export function polygonPath(points: ArrayLike<number>, count = points.length >> 1): PathData {
  const path: PathCommand[] = [];
  for (let i = 0; i < count; i++) {
    const x = points[2 * i] as number;
    const y = points[2 * i + 1] as number;
    path.push(i === 0 ? ['M', x, y] : ['L', x, y]);
  }
  if (count > 0) path.push(['Z']);
  return path;
}

/** Axis-aligned bounds of a flat point list. */
export function pointBounds(points: ArrayLike<number>, count = points.length >> 1): Rect {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < count; i++) {
    const x = points[2 * i] as number;
    const y = points[2 * i + 1] as number;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  if (!(maxX >= minX)) return { x: 0, y: 0, w: 0, h: 0 };
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/** Convex hull of a flat point list (monotone chain), as a flat list. */
export function convexHull(points: ArrayLike<number>): number[] {
  const count = points.length >> 1;
  const order = Array.from({ length: count }, (_, i) => i).sort(
    (i, j) =>
      (points[2 * i] as number) - (points[2 * j] as number) ||
      (points[2 * i + 1] as number) - (points[2 * j + 1] as number),
  );
  if (count < 3)
    return order.flatMap((i) => [points[2 * i] as number, points[2 * i + 1] as number]);
  const cross = (o: number, a: number, b: number) =>
    ((points[2 * a] as number) - (points[2 * o] as number)) *
      ((points[2 * b + 1] as number) - (points[2 * o + 1] as number)) -
    ((points[2 * a + 1] as number) - (points[2 * o + 1] as number)) *
      ((points[2 * b] as number) - (points[2 * o] as number));
  const lower: number[] = [];
  for (const i of order) {
    while (
      lower.length >= 2 &&
      cross(lower[lower.length - 2] as number, lower[lower.length - 1] as number, i) <= 0
    ) {
      lower.pop();
    }
    lower.push(i);
  }
  const upper: number[] = [];
  for (let k = order.length - 1; k >= 0; k--) {
    const i = order[k] as number;
    while (
      upper.length >= 2 &&
      cross(upper[upper.length - 2] as number, upper[upper.length - 1] as number, i) <= 0
    ) {
      upper.pop();
    }
    upper.push(i);
  }
  lower.pop();
  upper.pop();
  return [...lower, ...upper].flatMap((i) => [
    points[2 * i] as number,
    points[2 * i + 1] as number,
  ]);
}
