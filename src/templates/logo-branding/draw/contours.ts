/**
 * Contours of vector artwork for Draw: a path split into its subpaths (each drawn by its own
 * pen stroke), flattened for geometry, and grouped into *islands* — an outline together with
 * the holes inside it (the counter of an "a", the hole of a ring) — so each island can take
 * its ink as soon as its own outline is drawn, with the artwork's fill rule intact.
 */

import type { PathCommand, PathData, Rect } from '@/engine';

/** Splits a path into its contours, each starting with its own move-to. */
export function splitContours(path: PathData): PathData[] {
  const contours: PathCommand[][] = [];
  let current: PathCommand[] | null = null;
  let x = 0;
  let y = 0;
  let startX = 0;
  let startY = 0;
  for (const command of path) {
    if (command[0] === 'M') {
      current = [command];
      contours.push(current);
      x = startX = command[1];
      y = startY = command[2];
      continue;
    }
    if (!current) {
      // A segment right after a close starts from the closed contour's first point.
      current = [['M', startX, startY]];
      contours.push(current);
      x = startX;
      y = startY;
    }
    current.push(command);
    switch (command[0]) {
      case 'L':
        x = command[1];
        y = command[2];
        break;
      case 'Q':
        x = command[3];
        y = command[4];
        break;
      case 'C':
        x = command[5];
        y = command[6];
        break;
      case 'Z':
        x = startX;
        y = startY;
        current = null;
        break;
    }
  }
  void x;
  void y;
  return contours.filter((contour) => contour.length > 1);
}

/** A contour as a polyline (x, y pairs), curves split into `steps` segments. */
export function flatten(path: PathData, steps = 8): Float64Array {
  const points: number[] = [];
  let x = 0;
  let y = 0;
  let startX = 0;
  let startY = 0;
  const push = (px: number, py: number) => {
    points.push(px, py);
    x = px;
    y = py;
  };
  for (const command of path) {
    switch (command[0]) {
      case 'M':
        startX = command[1];
        startY = command[2];
        push(startX, startY);
        break;
      case 'L':
        push(command[1], command[2]);
        break;
      case 'Q': {
        const [, cx, cy, ex, ey] = command;
        const x0 = x;
        const y0 = y;
        for (let i = 1; i <= steps; i++) {
          const t = i / steps;
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
        for (let i = 1; i <= steps; i++) {
          const t = i / steps;
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
  return Float64Array.from(points);
}

export function bounds(points: Float64Array): Rect {
  let x0 = Number.POSITIVE_INFINITY;
  let y0 = Number.POSITIVE_INFINITY;
  let x1 = Number.NEGATIVE_INFINITY;
  let y1 = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < points.length; i += 2) {
    const x = points[i] as number;
    const y = points[i + 1] as number;
    if (x < x0) x0 = x;
    if (y < y0) y0 = y;
    if (x > x1) x1 = x;
    if (y > y1) y1 = y;
  }
  return x1 < x0 ? { x: 0, y: 0, w: 0, h: 0 } : { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** Even-odd point-in-polygon test against a closed polyline. */
function inside(points: Float64Array, px: number, py: number): boolean {
  let hit = false;
  const n = points.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = points[2 * i] as number;
    const yi = points[2 * i + 1] as number;
    const xj = points[2 * j] as number;
    const yj = points[2 * j + 1] as number;
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

/**
 * The island each contour belongs to (the index of its outermost enclosing contour): holes
 * join the outline around them. Contours of one shape only — separate shapes stay separate.
 */
export function islands(polylines: readonly Float64Array[]): number[] {
  const n = polylines.length;
  const boxes = polylines.map(bounds);
  const parent = new Array<number>(n).fill(-1);
  // Very busy artwork (hundreds of contours) skips the search: every contour stands alone.
  if (n > 400) return parent.map((_, i) => i);
  const eps = 1e-6;
  for (let i = 0; i < n; i++) {
    const b = boxes[i] as Rect;
    const poly = polylines[i] as Float64Array;
    const px = poly[0] as number;
    const py = poly[1] as number;
    let best = -1;
    let bestArea = Number.POSITIVE_INFINITY;
    for (let j = 0; j < n; j++) {
      if (j === i) continue;
      const a = boxes[j] as Rect;
      const area = a.w * a.h;
      if (area >= bestArea || area < b.w * b.h) continue;
      if (a.x > b.x + eps || a.y > b.y + eps) continue;
      if (a.x + a.w < b.x + b.w - eps || a.y + a.h < b.y + b.h - eps) continue;
      if (inside(polylines[j] as Float64Array, px, py)) {
        best = j;
        bestArea = area;
      }
    }
    parent[i] = best;
  }
  return parent.map((_, i) => {
    let k = i;
    for (let guard = 0; guard < n && (parent[k] ?? -1) >= 0; guard++) k = parent[k] as number;
    return k;
  });
}
