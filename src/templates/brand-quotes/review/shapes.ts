/**
 * Vector shapes for Review: a five-pointed star with rounded tips and inner corners (its exact
 * ink box, for the fractional fill), and the verified check.
 */

import type { PathCommand, PathData, Rect } from '@/engine';

type Point = { x: number; y: number };

/** Inner radius as a share of the outer one: a little fuller than a regular pentagram (0.382). */
const INNER = 0.47;
/** How far along each edge a corner is rounded: tips, and the inner corners. */
const TIP_CUT = 0.22;
const NOTCH_CUT = 0.12;

/** A point on a quadratic Bézier. */
const quad = (a: Point, c: Point, b: Point, t: number): Point => ({
  x: (1 - t) ** 2 * a.x + 2 * (1 - t) * t * c.x + t ** 2 * b.x,
  y: (1 - t) ** 2 * a.y + 2 * (1 - t) * t * c.y + t ** 2 * b.y,
});

export type Star = {
  /** The star centered on its circumscribed circle's center (0, 0). */
  readonly path: PathData;
  /** Exact bounds of the rounded star (relative to the center). */
  readonly ink: Rect;
};

/** A rounded star whose (sharp) tips lie on a circle of `radius`. */
export function roundedStar(radius: number): Star {
  const vertices: Point[] = [];
  for (let k = 0; k < 10; k++) {
    const angle = -Math.PI / 2 + (k * Math.PI) / 5;
    const r = k % 2 === 0 ? radius : radius * INNER;
    vertices.push({ x: r * Math.cos(angle), y: r * Math.sin(angle) });
  }
  const path: PathCommand[] = [];
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  const extend = (p: Point) => {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  };
  vertices.forEach((v, k) => {
    const prev = vertices[(k + 9) % 10] as Point;
    const next = vertices[(k + 1) % 10] as Point;
    const cut = k % 2 === 0 ? TIP_CUT : NOTCH_CUT;
    const a = { x: v.x + (prev.x - v.x) * cut, y: v.y + (prev.y - v.y) * cut };
    const b = { x: v.x + (next.x - v.x) * cut, y: v.y + (next.y - v.y) * cut };
    path.push(k === 0 ? ['M', a.x, a.y] : ['L', a.x, a.y], ['Q', v.x, v.y, b.x, b.y]);
    for (let i = 0; i <= 16; i++) extend(quad(a, v, b, i / 16));
  });
  path.push(['Z']);
  return { path, ink: { x: minX, y: minY, w: maxX - minX, h: maxY - minY } };
}

/** The check of the verified badge, in a badge of diameter `d` centered on (0, 0). */
export function checkPath(d: number): PathData {
  return [
    ['M', -0.21 * d, 0.02 * d],
    ['L', -0.06 * d, 0.16 * d],
    ['L', 0.22 * d, -0.14 * d],
  ];
}
